/**
 * Chat Discovery Engine for WhatsApp Web
 * 
 * Scans the WhatsApp Web DOM to discover accessible conversations.
 * Handles the virtualized/lazy-loaded chat list by scrolling through it.
 * 
 * WhatsApp Web DOM structure (as of 2024-2026, subject to change):
 * - Chat list container: #pane-side or [data-testid="chat-list"] 
 * - Each chat row: div[data-testid="cell-frame-container"] or div with role="listitem"  
 * - Chat name: span[dir="auto"] inside the title area
 * - Last message time: inside a sibling element
 * - Unread badge: span[data-testid="icon-unread-count"]
 */

export interface DiscoveredChat {
  chatId: string;
  name: string;
  phoneNumber?: string;
  chatType: 'individual' | 'group' | 'unknown';
  lastMessagePreview?: string;
  lastMessageTimestamp?: string;
  unreadCount?: number;
  isBusiness?: boolean;
}

// Internal set of already-seen chat identifiers to prevent duplicates
const discoveredChatIds = new Set<string>();
let isDiscoveryRunning = false;
let shouldStopDiscovery = false;

/**
 * Attempts to find the scrollable chat list container in WhatsApp Web.
 */
export function getChatListContainer(): HTMLElement | null {
  // Try multiple known selectors (WhatsApp Web updates its DOM periodically)
  const selectors = [
    '#pane-side',
    '[data-testid="chat-list"]',
    '[aria-label="Chat list"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Finds the scrollable element inside the chat list pane.
 * WhatsApp Web typically has a nested scrollable div inside #pane-side.
 */
export function getScrollableElement(container: HTMLElement): HTMLElement {
  // The actual scrollable element is usually a child div with overflow
  const scrollable = container.querySelector<HTMLElement>('[role="list"]') 
    || container.querySelector<HTMLElement>('[tabindex="0"]')
    || container;
  
  // If the container itself is scrollable
  if (container.scrollHeight > container.clientHeight) {
    return container;
  }
  
  // Check children for scrollable
  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement;
    if (el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  
  return scrollable;
}

/**
 * Extracts chat data from a single chat row DOM element.
 */
export function parseChatRow(row: HTMLElement): DiscoveredChat | null {
  try {
    // --- Extract the chat name ---
    // WhatsApp Web uses spans with dir="auto" for chat titles
    const titleContainer = row.querySelector<HTMLElement>(
      '[data-testid="cell-frame-title"] span[dir="auto"], ' +
      'span[data-testid="conversation-info-header-chat-title"] span[dir="auto"], ' +
      'span[title]'
    );

    let name = '';
    if (titleContainer) {
      name = titleContainer.getAttribute('title') || titleContainer.textContent?.trim() || '';
    }

    if (!name) {
      // Try broader approach: first prominent span
      const spans = row.querySelectorAll<HTMLElement>('span[dir="auto"]');
      for (const span of Array.from(spans)) {
        const text = span.textContent?.trim();
        if (text && text.length > 0 && text.length < 100) {
          name = text;
          break;
        }
      }
    }

    if (!name) return null; // Can't identify this chat

    // --- Determine a stable chat identifier ---
    // Try to extract from the element's data attributes or the row's click target
    let chatId = '';
    
    // Check for data-id attribute (WhatsApp sometimes uses this)
    chatId = row.getAttribute('data-id') || '';
    
    if (!chatId) {
      // Try to find it from nested elements
      const cellFrame = row.querySelector<HTMLElement>('[data-testid="cell-frame-container"]');
      chatId = cellFrame?.getAttribute('data-id') || '';
    }

    if (!chatId) {
      // Try the list item container
      const listItem = row.closest('[data-id]');
      chatId = listItem?.getAttribute('data-id') || '';
    }

    // Fallback: derive ID from the name (not ideal, but better than nothing)
    if (!chatId) {
      chatId = `name_${name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 60)}_${hashCode(name)}`;
    }

    // --- Determine chat type ---
    let chatType: 'individual' | 'group' | 'unknown' = 'unknown';
    
    // Group chats typically have a group icon or multiple participant indicators
    const groupIcon = row.querySelector('[data-testid="default-group"]') 
      || row.querySelector('[data-icon="default-group"]');
    
    if (groupIcon) {
      chatType = 'group';
    } else if (chatId.includes('@g.us')) {
      chatType = 'group';
    } else if (chatId.includes('@c.us') || chatId.includes('@s.whatsapp.net')) {
      chatType = 'individual';
    } else {
      // Heuristic: if name looks like a phone number, it's individual
      const nameDigits = name.replace(/[\s\-\+\(\)]/g, '');
      if (/^\d{7,15}$/.test(nameDigits)) {
        chatType = 'individual';
      } else {
        chatType = 'individual'; // default assumption for business use
      }
    }

    // --- Extract phone number if visible ---
    let phoneNumber: string | undefined;
    
    // If the chat ID contains a phone number pattern
    const idMatch = chatId.match(/(\d{7,15})@/);
    if (idMatch) {
      phoneNumber = `+${idMatch[1]}`;
    }
    
    // If the name itself is a phone number (unsaved contact)
    const cleanName = name.replace(/[\s\-\(\)]/g, '');
    if (/^\+?\d{7,15}$/.test(cleanName)) {
      phoneNumber = cleanName.startsWith('+') ? cleanName : `+${cleanName}`;
    }

    // --- Extract last message preview ---
    let lastMessagePreview = '';
    const msgPreview = row.querySelector<HTMLElement>(
      '[data-testid="last-msg-status"] span[dir="auto"], ' +
      'span[data-testid="last-msg-status"], ' +
      '.matched-text'
    );
    if (msgPreview) {
      lastMessagePreview = msgPreview.textContent?.trim()?.substring(0, 200) || '';
    } else {
      // Try second span[dir="auto"] as fallback (first is usually the name)
      const allSpans = row.querySelectorAll<HTMLElement>('span[dir="auto"]');
      if (allSpans.length >= 2) {
        lastMessagePreview = allSpans[1].textContent?.trim()?.substring(0, 200) || '';
      }
    }

    // --- Extract last message timestamp ---
    let lastMessageTimestamp: string | undefined;
    const timeEl = row.querySelector<HTMLElement>(
      '[data-testid="cell-frame-primary-detail"] span, ' +
      'div._amk4, ' +
      'div[class*="timestamp"]'
    );
    if (timeEl) {
      const timeText = timeEl.textContent?.trim();
      if (timeText) {
        lastMessageTimestamp = parseRelativeTime(timeText);
      }
    }

    // --- Check for unread count ---
    let unreadCount: number | undefined;
    const unreadBadge = row.querySelector<HTMLElement>(
      '[data-testid="icon-unread-count"] span, ' +
      'span[data-testid="icon-unread-count"]'
    );
    if (unreadBadge) {
      const badgeText = unreadBadge.textContent?.trim();
      if (badgeText) {
        const parsed = parseInt(badgeText, 10);
        if (!isNaN(parsed)) unreadCount = parsed;
      }
    }

    // --- Check for business account indicators ---
    const isBusiness = Boolean(
      row.querySelector('[data-testid="business"]') ||
      row.querySelector('[data-icon="psa-verified"]') ||
      row.querySelector('[data-testid="psa-verified"]')
    );

    return {
      chatId,
      name,
      phoneNumber,
      chatType,
      lastMessagePreview,
      lastMessageTimestamp,
      unreadCount,
      isBusiness,
    };
  } catch (err) {
    console.warn('[WA Exporter] Failed to parse chat row:', err);
    return null;
  }
}

/**
 * Simple string hash for generating deterministic fallback IDs.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Attempts to parse WhatsApp's relative time display into an ISO timestamp.
 * WhatsApp shows times like "10:30 AM", "Yesterday", "11/2/2026", "Monday", etc.
 */
function parseRelativeTime(timeText: string): string {
  const now = new Date();
  const text = timeText.trim().toLowerCase();

  // Pattern: "HH:MM AM/PM" or "HH:MM" — treat as today
  if (/^\d{1,2}:\d{2}(\s?(am|pm))?$/i.test(text)) {
    // Return today's date with approximation
    return now.toISOString();
  }

  // "yesterday"
  if (text === 'yesterday' || text === 'hier') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString();
  }

  // Day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIdx = days.indexOf(text);
  if (dayIdx !== -1) {
    const today = now.getDay();
    let diff = today - dayIdx;
    if (diff <= 0) diff += 7;
    const d = new Date(now);
    d.setDate(d.getDate() - diff);
    return d.toISOString();
  }

  // Date pattern: M/D/YYYY or DD/MM/YYYY
  const dateMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dateMatch) {
    try {
      const d = new Date(text);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch { /* ignore */ }
  }

  return now.toISOString();
}

/**
 * Returns all currently rendered chat row elements in WhatsApp Web DOM.
 */
export function getAllVisibleRowElements(): HTMLElement[] {
  const rowSelectors = [
    '[data-testid="cell-frame-container"]',
    '[data-testid="list-item-chat"]',
    'div[role="listitem"]',
    '#pane-side div[role="row"]',
    '#pane-side > div > div > div > div > div',
  ];

  for (const sel of rowSelectors) {
    const found = document.querySelectorAll<HTMLElement>(sel);
    if (found.length > 0) {
      return Array.from(found);
    }
  }

  const pane = getChatListContainer();
  if (pane) {
    const candidates = pane.querySelectorAll<HTMLElement>('div[tabindex="-1"]');
    if (candidates.length > 0) {
      return Array.from(candidates);
    }
  }

  return [];
}

/**
 * Scans all currently visible chat rows in the DOM.
 */
function scanVisibleChats(): DiscoveredChat[] {
  const results: DiscoveredChat[] = [];
  const rows = getAllVisibleRowElements();

  for (const row of rows) {
    const chat = parseChatRow(row);
    if (chat && !discoveredChatIds.has(chat.chatId)) {
      discoveredChatIds.add(chat.chatId);
      results.push(chat);
    }
  }

  return results;
}

/**
 * Scrolls the chat list and collects chats incrementally.
 * Returns the total batch of newly discovered chats after full scroll.
 */
export async function discoverAllChats(
  onProgress: (chats: DiscoveredChat[], totalSoFar: number, done: boolean) => void
): Promise<void> {
  if (isDiscoveryRunning) {
    console.warn('[WA Exporter] Discovery already running');
    return;
  }

  isDiscoveryRunning = true;
  shouldStopDiscovery = false;
  discoveredChatIds.clear();

  const container = getChatListContainer();
  if (!container) {
    console.error('[WA Exporter] Chat list container not found');
    onProgress([], 0, true);
    isDiscoveryRunning = false;
    return;
  }

  const scrollEl = getScrollableElement(container);
  console.log('[WA Exporter] Starting chat discovery. Scroll element:', scrollEl.tagName, scrollEl.className);

  // Phase A: Scan initially visible chats
  const initialBatch = scanVisibleChats();
  if (initialBatch.length > 0) {
    onProgress(initialBatch, discoveredChatIds.size, false);
  }

  // Phase B: Scroll down to load more chats from the virtualized list
  let noNewChatsStreak = 0;
  const maxStreakBeforeStop = 8; // Stop after 8 consecutive scrolls with no new chats
  const scrollStep = 600; // Pixels to scroll each step
  const scrollDelay = 400; // ms between scrolls (respect rate limits & allow DOM to render)

  while (!shouldStopDiscovery) {
    // Scroll down
    scrollEl.scrollTop += scrollStep;
    
    // Wait for the DOM to update (virtualized list re-renders)
    await sleep(scrollDelay);

    // Scan newly rendered chat rows
    const newBatch = scanVisibleChats();
    
    if (newBatch.length > 0) {
      onProgress(newBatch, discoveredChatIds.size, false);
      noNewChatsStreak = 0;
    } else {
      noNewChatsStreak++;
    }

    // Check if we've reached the bottom
    const atBottom = (scrollEl.scrollTop + scrollEl.clientHeight) >= (scrollEl.scrollHeight - 50);
    
    if (atBottom || noNewChatsStreak >= maxStreakBeforeStop) {
      // Do one last upward re-scan to catch any stragglers
      break;
    }
  }

  // Final scan after scrolling completes
  const finalBatch = scanVisibleChats();
  if (finalBatch.length > 0) {
    onProgress(finalBatch, discoveredChatIds.size, false);
  }

  // Scroll back to top for good UX
  scrollEl.scrollTop = 0;

  console.log(`[WA Exporter] Discovery complete. Found ${discoveredChatIds.size} unique chats.`);
  onProgress([], discoveredChatIds.size, true);
  isDiscoveryRunning = false;
}

export function stopDiscovery(): void {
  shouldStopDiscovery = true;
}

export function isDiscoveryActive(): boolean {
  return isDiscoveryRunning;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
