/**
 * Direct DOM Chat & Message Extractor (Runs in Content Script ISOLATED world)
 * Directly controls WhatsApp Web DOM without relying on external bridges or postMessage.
 */

import {
  getChatListContainer,
  getScrollableElement,
  parseChatRow,
  getAllVisibleRowElements,
} from './chatDiscovery';

let isExtractionAborted = false;

export function abortActiveExtraction(): void {
  isExtractionAborted = true;
}

export function resetActiveExtraction(): void {
  isExtractionAborted = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clickChatRow(el: HTMLElement): void {
  const target = (el.querySelector<HTMLElement>('div[role="gridcell"], div[role="button"], div[tabindex="-1"]') || el);
  try {
    target.scrollIntoView({ block: 'nearest' });
  } catch {}
  const rect = target.getBoundingClientRect();
  const clientX = (rect.width > 0) ? rect.left + rect.width / 2 : 100;
  const clientY = (rect.height > 0) ? rect.top + rect.height / 2 : 100;
  const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
  target.dispatchEvent(new PointerEvent('pointerdown', opts));
  target.dispatchEvent(new MouseEvent('mousedown', opts));
  target.dispatchEvent(new PointerEvent('pointerup', opts));
  target.dispatchEvent(new MouseEvent('mouseup', opts));
  target.dispatchEvent(new MouseEvent('click', opts));
  target.click();
}

/**
 * Resets and clears the search bar if any stuck text exists, restoring the full chat list.
 * Language-agnostic (English, French, Arabic, etc.)
 */
export async function clearSearchBarIfActive(): Promise<void> {
  try {
    // 1. Click search exit/back button
    const backBtn = document.querySelector<HTMLElement>(
      '[data-icon="back"], [data-icon="arrow-left"], [data-testid="search-back-btn"], button[aria-label="Back"], button[aria-label="Retour"], button[aria-label="رجوع"]'
    );
    if (backBtn) {
      const clickable = backBtn.closest('button') || backBtn;
      clickable.click();
      await sleep(100);
    }

    // 2. Click clear text / x button
    const clearBtn = document.querySelector<HTMLElement>(
      '[data-icon="x-alt"], [data-icon="x"], [data-testid="x-alt"], button[aria-label="Cancel search"], button[aria-label="Clear text"], button[aria-label="Effacer le texte"]'
    );
    if (clearBtn) {
      const clickable = clearBtn.closest('button') || clearBtn;
      clickable.click();
      await sleep(100);
    }

    // 3. Clear any contenteditable or input text inside #side
    const searchInputs = document.querySelectorAll<HTMLElement>(
      '#side div[contenteditable="true"], [data-testid="chat-list-search"], #side [role="textbox"], #side input[type="text"]'
    );
    for (const input of Array.from(searchInputs)) {
      const hasText = input.textContent?.trim() || (input as HTMLInputElement).value?.trim();
      if (hasText) {
        input.focus();
        try {
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(input);
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.execCommand('delete', false);
        } catch {}
        input.textContent = '';
        if ((input as HTMLInputElement).value !== undefined) {
          (input as HTMLInputElement).value = '';
        }
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
    }

    // 4. Send Escape key to dismiss any active search filter
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(150);
  } catch {}
}

/**
 * Scrolls the chat list container (#pane-side) to find and click a specific conversation.
 * Guarantees finding any chat even if it is far down the virtualized list.
 */
export async function openConversationInDOM(
  contactName: string,
  phoneNumber?: string,
  chatId?: string
): Promise<boolean> {
  if (isExtractionAborted) return false;

  // 1. Ensure search bar is cleared so the full chat list is rendered
  await clearSearchBarIfActive();

  const targetClean = contactName.trim().toLowerCase();
  const phoneClean = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

  // 2. Is this conversation already open in #main?
  const currentTitle = document.querySelector(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header span[dir="auto"], #main header span[title]'
  );
  if (currentTitle && contactName) {
    const text = currentTitle.textContent?.trim().toLowerCase() || currentTitle.getAttribute('title')?.toLowerCase() || '';
    if (text === targetClean || text.includes(targetClean) || targetClean.includes(text)) {
      return true;
    }
    if (phoneClean && phoneClean.length >= 7 && text.replace(/\D/g, '').includes(phoneClean)) {
      return true;
    }
  }

  // 3. Locate chat list container and scrollable element
  const container = getChatListContainer();
  if (!container) return false;
  const scrollEl = getScrollableElement(container);

  // Helper function to test if a row matches the target chat
  function doesRowMatch(row: HTMLElement): boolean {
    const parsed = parseChatRow(row);
    if (parsed) {
      if (chatId && parsed.chatId === chatId) return true;
      const parsedName = parsed.name.trim().toLowerCase();
      if (parsedName && (parsedName === targetClean || parsedName.includes(targetClean) || targetClean.includes(parsedName))) {
        return true;
      }
      if (phoneClean && phoneClean.length >= 7 && parsed.phoneNumber) {
        const parsedDigits = parsed.phoneNumber.replace(/\D/g, '');
        if (parsedDigits.includes(phoneClean) || phoneClean.includes(parsedDigits)) {
          return true;
        }
      }
    }

    const fullText = (row.textContent || '').toLowerCase();
    if (targetClean.length >= 3 && fullText.includes(targetClean)) {
      return true;
    }
    if (phoneClean && phoneClean.length >= 7 && fullText.replace(/\D/g, '').includes(phoneClean)) {
      return true;
    }
    return false;
  }

  // 4. Check visible rows first
  const initialRows = getAllVisibleRowElements();
  for (const row of initialRows) {
    if (doesRowMatch(row)) {
      clickChatRow(row);
      const opened = await waitForMainChatOpen(contactName, phoneNumber);
      if (opened) return true;
    }
  }

  // 5. Scroll through #pane-side from the top
  scrollEl.scrollTop = 0;
  await sleep(150);

  let prevScroll = -1;
  const maxRounds = 45;

  for (let r = 0; r < maxRounds; r++) {
    if (isExtractionAborted) return false;

    const rows = getAllVisibleRowElements();
    for (const row of rows) {
      if (doesRowMatch(row)) {
        clickChatRow(row);
        const opened = await waitForMainChatOpen(contactName, phoneNumber);
        if (opened) return true;
      }
    }

    if (scrollEl.scrollTop === prevScroll || (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 20)) {
      break; // Reached bottom of list
    }

    prevScroll = scrollEl.scrollTop;
    scrollEl.scrollTop += 500;
    await sleep(200);
  }

  return false;
}

async function waitForMainChatOpen(contactName?: string, phoneNumber?: string): Promise<boolean> {
  const targetClean = contactName?.trim().toLowerCase();
  const phoneClean = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

  for (let i = 0; i < 15; i++) {
    if (isExtractionAborted) return false;

    const titleEl = document.querySelector(
      '#main header [data-testid="conversation-info-header-chat-title"], #main header span[dir="auto"], #main header span[title]'
    );
    if (titleEl) {
      const text = titleEl.textContent?.trim().toLowerCase() || titleEl.getAttribute('title')?.toLowerCase() || '';
      if (targetClean && (text === targetClean || text.includes(targetClean) || targetClean.includes(text))) {
        await sleep(300);
        return true;
      }
      if (phoneClean && phoneClean.length >= 7 && text.replace(/\D/g, '').includes(phoneClean)) {
        await sleep(300);
        return true;
      }
      // If header is loaded and no title to compare with, accept it
      if (!targetClean) {
        await sleep(300);
        return true;
      }
    }
    await sleep(150);
  }

  return Boolean(document.querySelector('#main header'));
}

/**
 * Extracts phone number for the open conversation from the header avatar or contact drawer.
 */
export async function resolveOpenChatPhoneNumber(contactName?: string): Promise<string | undefined> {
  // 1. If contactName already has a clean phone number format
  if (contactName && /^\+?[\d\s\-()]{8,22}$/.test(contactName.trim())) {
    const digits = contactName.replace(/\D/g, '');
    if (digits.length >= 7) return `+${digits}`;
  }

  // 2. Check header avatar URL (often contains u=PHONE%40c.us)
  const headerImg = document.querySelector<HTMLImageElement>('#main header img');
  if (headerImg) {
    const src = headerImg.src || headerImg.getAttribute('src') || '';
    const match = src.match(/u=(\d{7,15})%40/i) || src.match(/(\d{7,15})@c\.us/i);
    if (match) return `+${match[1]}`;
  }

  // 3. Check header subtitle text
  const headerSubtitle = document.querySelector(
    '#main header [data-testid="conversation-info-header-chat-subtitle"], #main header span[dir="auto"]'
  );
  if (headerSubtitle) {
    const subText = headerSubtitle.textContent?.trim() || '';
    const match = subText.match(/\+?\d[\d\s\-()]{7,18}\d/);
    if (match) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    }
  }

  // 4. Click header to open the Contact Info Drawer and read the phone number directly
  const headerClickTarget = document.querySelector<HTMLElement>(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header div[role="button"]'
  ) || document.querySelector<HTMLElement>('#main header');

  if (headerClickTarget) {
    try {
      clickChatRow(headerClickTarget);
      await sleep(550); // Wait for drawer to slide open

      const drawer = document.querySelector(
        '[data-testid="contact-info-drawer"], [data-testid="drawer-right"], section[tabindex="-1"], div[aria-label*="Contact"], div[aria-label*="Infos"]'
      ) || document.querySelector('#app div[tabindex="-1"]');

      let foundPhone: string | undefined;
      if (drawer) {
        const textNodes = drawer.querySelectorAll('span, div, p');
        for (const node of Array.from(textNodes)) {
          const text = node.textContent?.trim() || '';
          const match = text.match(/\+?\d[\d\s\-()]{7,18}\d/);
          if (match) {
            const digits = match[0].replace(/\D/g, '');
            if (digits.length >= 8 && digits.length <= 15) {
              if (digits.startsWith('0') && digits.length === 10) {
                foundPhone = `+212${digits.substring(1)}`;
              } else {
                foundPhone = match[0].startsWith('+') ? `+${digits}` : `+${digits}`;
              }
              break;
            }
          }
        }

        // Close drawer
        const closeBtn = drawer.querySelector<HTMLElement>(
          '[data-icon="x"], [data-testid="x"], [data-testid="btn-closer"], button[aria-label="Close"], button[aria-label="Fermer"]'
        );
        if (closeBtn) {
          closeBtn.click();
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        await sleep(250);

        if (foundPhone) return foundPhone;
      }
    } catch {}
  }

  return undefined;
}

/**
 * Robust date/time parser for WhatsApp Web localized formats
 * Supports: "14:30, 03/11/2026", "03/11/2026, 14:30", "2:30 PM, 11/3/2026", "yesterday", "hier", etc.
 */
function parseWaDate(str: string): string | null {
  try {
    const parts = str.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      let timeStr = '', dateStr = '';
      if (parts[0].includes(':')) {
        timeStr = parts[0];
        dateStr = parts[1];
      } else {
        dateStr = parts[0];
        timeStr = parts[1];
      }
      const dParts = dateStr.split(/[\/\-\.]/).map(n => parseInt(n, 10));
      const isPM = /pm/i.test(timeStr);
      const isAM = /am/i.test(timeStr);
      const tClean = timeStr.replace(/[^\d:]/g, '');
      const [h, m] = tClean.split(':').map(n => parseInt(n, 10));
      let hours = h || 0;
      const mins = m || 0;
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      if (dParts.length === 3) {
        let year = dParts[2];
        if (year < 100) year += 2000;
        let month = dParts[1] - 1;
        let day = dParts[0];
        if (month > 11 && day <= 12) {
          month = dParts[0] - 1;
          day = dParts[1];
        }
        const d = new Date(Date.UTC(year, month, day, hours, mins));
        if (!isNaN(d.getTime())) return d.toISOString();
      }
    }
  } catch {}
  return null;
}

/**
 * Finds all message elements currently inside the conversation area #main.
 * Highly versatile across WhatsApp Web versions.
 */
function getAllMessageElements(): HTMLElement[] {
  // Strategy 1: Elements with data-id starting with true_ or false_
  const dataIdElements = document.querySelectorAll<HTMLElement>(
    '#main div[data-id^="false_"], #main div[data-id^="true_"], #main div[data-id*="@c.us_"], #main div[data-id*="@g.us_"], #main div[data-id*="@lid_"], #main div[data-id*="@s.whatsapp.net_"]'
  );
  if (dataIdElements.length > 0) {
    return Array.from(dataIdElements);
  }

  // Strategy 2: Common container selectors inside conversation panel
  const copyArea = document.querySelector<HTMLElement>('#main div.copyable-area') || document.querySelector<HTMLElement>('#main');
  if (copyArea) {
    const rowSelectors = [
      '[role="row"]',
      'div.focusable-list-item',
      'div[data-testid="msg-container"]',
      'div.message-in, div.message-out',
      'div[class*="message-in"], div[class*="message-out"]',
    ];
    for (const sel of rowSelectors) {
      const found = copyArea.querySelectorAll<HTMLElement>(sel);
      if (found.length > 0) {
        return Array.from(found);
      }
    }
  }

  // Strategy 3: Elements with data-pre-plain-text (find their top message container)
  const preTextNodes = document.querySelectorAll<HTMLElement>('#main [data-pre-plain-text]');
  if (preTextNodes.length > 0) {
    const containers = new Set<HTMLElement>();
    for (const node of Array.from(preTextNodes)) {
      const parentMsg = node.closest<HTMLElement>('div[data-id]') 
        || node.closest<HTMLElement>('div[role="row"]')
        || node.closest<HTMLElement>('div.focusable-list-item')
        || (node.parentElement as HTMLElement);
      if (parentMsg) containers.add(parentMsg);
    }
    if (containers.size > 0) {
      return Array.from(containers);
    }
  }

  // Strategy 4: Any div[data-id] inside #main (excluding header and footer)
  const allDataIds = document.querySelectorAll<HTMLElement>(
    '#main div.copyable-area div[data-id], #main div[tabindex="0"] div[data-id]'
  );
  if (allDataIds.length > 0) {
    return Array.from(allDataIds);
  }

  return [];
}

/**
 * Finds the scrollable message list panel inside #main.
 */
function getMessageScrollPanel(): HTMLElement | null {
  const selectors = [
    '#main [data-testid="conversation-panel-messages"]',
    '#main div.copyable-area > div[tabindex="0"]',
    '#main div[tabindex="0"]',
    '#main [role="application"]',
    '#main [role="region"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }

  // Fallback: search for any scrollable container in #main
  const copyArea = document.querySelector<HTMLElement>('#main div.copyable-area') || document.querySelector<HTMLElement>('#main');
  if (copyArea) {
    for (const child of Array.from(copyArea.querySelectorAll<HTMLElement>('div'))) {
      if (child.scrollHeight > child.clientHeight + 50 && !child.closest('header') && !child.closest('footer')) {
        return child;
      }
    }
  }
  return null;
}

/**
 * Reads an image directly from an HTMLImageElement using an in-memory canvas.
 * Does not require network fetch or CSP permissions.
 */
function imageElementToBase64(img: HTMLImageElement): string | null {
  try {
    if (!img.complete || (img.naturalWidth === 0 && img.width === 0)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 400;
    canvas.height = img.naturalHeight || img.height || 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  }
}

/**
 * Waits up to 4 seconds for messages to finish rendering in #main after opening a chat.
 */
async function waitForMessagesToLoad(): Promise<HTMLElement[]> {
  for (let i = 0; i < 20; i++) {
    if (isExtractionAborted) return [];
    const elements = getAllMessageElements();
    if (elements.length > 0) {
      // Give WhatsApp 400ms to finish rendering the message batch
      await sleep(400);
      return getAllMessageElements();
    }
    await sleep(200);
  }
  return getAllMessageElements();
}

/**
 * Extracts all messages and media elements currently in the active conversation view.
 * Handles WhatsApp Web's virtualized message feed by incrementally collecting messages while scrolling.
 */
export async function extractMessagesFromOpenChat(): Promise<{
  messages: any[];
  mediaFiles: Array<{
    fileName: string;
    category: 'images' | 'videos' | 'audio' | 'documents' | 'stickers';
    mimeType: string;
    dataBase64: string;
  }>;
}> {
  const messagesMap = new Map<string, any>();
  const mediaMap = new Map<string, any>();
  const seenIds = new Set<string>();

  // Helper to scan currently visible message elements into the collection maps
  async function scanVisibleMessages(): Promise<void> {
    const msgElements = getAllMessageElements();

    for (const el of msgElements) {
      try {
        // Message ID
        let id = el.getAttribute('data-id') 
          || el.querySelector('[data-id]')?.getAttribute('data-id') 
          || el.closest('[data-id]')?.getAttribute('data-id') 
          || '';

        if (!id) {
          // If no data-id, derive from text content or order
          const preEl = el.querySelector('[data-pre-plain-text]');
          const preText = preEl?.getAttribute('data-pre-plain-text') || '';
          if (preText) {
            id = `msg_${hashCode(preText + (el.textContent || '').substring(0, 50))}`;
          } else {
            id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          }
        }

        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // WhatsApp's official copyable attribute: data-pre-plain-text="[14:30, 11/1/2026] Ahmed: "
        const copyEl = el.querySelector('[data-pre-plain-text]');
        const preText = copyEl?.getAttribute('data-pre-plain-text') || '';

        let timestamp = new Date().toISOString();
        if (preText) {
          const match = preText.match(/\[(.*?)\]/);
          if (match && match[1]) {
            const parsed = parseWaDate(match[1]);
            if (parsed) timestamp = parsed;
          }
        } else {
          const timeSpan = el.querySelector('[data-testid="msg-meta"] span, div[class*="timestamp"], span[dir="auto"]');
          const timeText = timeSpan?.textContent?.trim();
          if (timeText && /^\d{1,2}:\d{2}/.test(timeText)) {
            const today = new Date();
            const [h, m] = timeText.replace(/[^\d:]/g, '').split(':').map(Number);
            today.setHours(h, m, 0, 0);
            timestamp = today.toISOString();
          }
        }

        // Sender direction: outgoing (business) vs incoming (customer)
        let sender: 'business' | 'customer' = 'customer';
        if (id.startsWith('true_')) {
          sender = 'business';
        } else if (id.startsWith('false_')) {
          sender = 'customer';
        } else {
          const isOut = Boolean(
            el.classList.contains('message-out') ||
            el.className.includes('message-out') ||
            el.querySelector('[data-testid="msg-check"]') ||
            el.querySelector('[data-testid="msg-dblcheck"]') ||
            el.querySelector('[data-icon="msg-check"]') ||
            el.querySelector('[data-icon="msg-dblcheck"]') ||
            el.querySelector('[data-icon="msg-dblcheck-ack"]')
          );
          sender = isOut ? 'business' : 'customer';
        }

        // Text content
        let text = '';
        if (copyEl) {
          text = (copyEl as HTMLElement).innerText?.trim() || copyEl.textContent?.trim() || '';
        }
        if (!text) {
          const textSpan = el.querySelector(
            '.selectable-text, [data-testid="selectable-text"], div.copyable-text span, span[dir="ltr"], span[dir="rtl"]'
          );
          text = (textSpan as HTMLElement)?.innerText?.trim() || textSpan?.textContent?.trim() || '';
        }

        // Media attachments
        let type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'text';
        let mediaBlobUrl: string | undefined;
        let mediaFileName: string | undefined;
        let mediaMimeType: string | undefined;
        let category: 'images' | 'videos' | 'audio' | 'documents' | 'stickers' = 'images';
        let base64Data: string | null = null;

        const img = el.querySelector('img[src]') as HTMLImageElement;
        const video = el.querySelector('video') as HTMLVideoElement;
        const audio = el.querySelector('audio') as HTMLAudioElement;
        const audioBtn = el.querySelector('[data-testid="audio-play"], [data-icon="audio-play"], [data-icon="ptt-play"]') as HTMLElement;
        const doc = el.querySelector('[data-testid="document-thumb"], [data-icon="document-pdf"], [data-icon="document-generic"], [data-icon*="document"]') as HTMLElement;

        if (img && img.src && !img.src.includes('avatar') && !img.src.includes('profile')) {
          const isSticker = el.querySelector('[data-testid="sticker-pack-preview"], [data-testid="sticker"]') || img.classList.contains('sticker');
          if (isSticker) {
            type = 'sticker';
            category = 'stickers';
            mediaFileName = `sticker_${id.replace(/\W/g, '_')}.webp`;
            mediaMimeType = 'image/webp';
          } else {
            type = 'image';
            category = 'images';
            mediaFileName = `image_${id.replace(/\W/g, '_')}.jpg`;
            mediaMimeType = 'image/jpeg';
          }
          mediaBlobUrl = img.src;
          base64Data = imageElementToBase64(img);
        } else if (video) {
          type = 'video';
          category = 'videos';
          mediaBlobUrl = video.src || undefined;
          mediaFileName = `video_${id.replace(/\W/g, '_')}.mp4`;
          mediaMimeType = 'video/mp4';
        } else if (audio || audioBtn) {
          type = 'audio';
          category = 'audio';
          mediaBlobUrl = audio?.src || undefined;
          mediaFileName = `audio_${id.replace(/\W/g, '_')}.ogg`;
          mediaMimeType = 'audio/ogg';
        } else if (doc) {
          type = 'document';
          category = 'documents';
          const docTitle = el.querySelector('[data-testid="document-title"], span[title], a[title]')?.textContent?.trim()
            || el.querySelector('[data-testid="document-title"], span[title], a[title]')?.getAttribute('title')?.trim();
          mediaFileName = docTitle || `doc_${id.replace(/\W/g, '_')}.pdf`;
          mediaMimeType = 'application/pdf';
        }

        // If media exists, download it (via canvas or fetch)
        if (mediaBlobUrl && !base64Data) {
          try {
            base64Data = await blobUrlToBase64(mediaBlobUrl);
          } catch {}
        }

        if (mediaFileName && base64Data && !mediaMap.has(mediaFileName)) {
          mediaMap.set(mediaFileName, {
            fileName: mediaFileName,
            category,
            mimeType: mediaMimeType || 'application/octet-stream',
            dataBase64: base64Data,
          });
        }

        // Only add if there is text, media, or it's a recognized message
        if (text || mediaFileName) {
          messagesMap.set(id, {
            id,
            timestamp,
            sender,
            type,
            text,
            mediaPath: mediaFileName ? `media/${category}/${mediaFileName}` : null,
            deliveryStatus: sender === 'business' ? 'read' : undefined,
          });
        }
      } catch {}
    }
  }

  // 1. Wait for conversation messages to initially render
  await waitForMessagesToLoad();

  // 2. Scan visible messages at the bottom (most recent messages)
  await scanVisibleMessages();

  // 3. Incrementally scroll up to load history from virtual list
  const msgPanel = getMessageScrollPanel();
  if (msgPanel) {
    let prevScroll = msgPanel.scrollTop;
    for (let r = 0; r < 8; r++) {
      if (isExtractionAborted) break;

      // Scroll up by 650px
      msgPanel.scrollTop = Math.max(0, msgPanel.scrollTop - 650);
      await sleep(350);

      // Collect newly rendered messages
      await scanVisibleMessages();

      if (msgPanel.scrollTop === 0 || msgPanel.scrollTop === prevScroll) {
        break;
      }
      prevScroll = msgPanel.scrollTop;
    }
  }

  return {
    messages: Array.from(messagesMap.values()),
    mediaFiles: Array.from(mediaMap.values()),
  };
}

/**
 * Downloads a blob URL or media URL to base64 within the page context.
 */
async function blobUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}
