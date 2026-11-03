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
        await sleep(250);
        return true;
      }
      if (phoneClean && phoneClean.length >= 7 && text.replace(/\D/g, '').includes(phoneClean)) {
        await sleep(250);
        return true;
      }
      // If header is loaded and no title to compare with, accept it
      if (!targetClean) {
        await sleep(250);
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
      headerClickTarget.click();
      await sleep(500); // Wait for drawer to slide open

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
 * Extracts all messages and media elements currently in the active conversation view.
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
  // 1. Scroll up in conversation history
  const msgPanel = document.querySelector<HTMLElement>(
    '#main div.copyable-area > div[tabindex="0"], #main [data-testid="conversation-panel-messages"], #main div[tabindex="0"]'
  );

  if (msgPanel) {
    for (let r = 0; r < 5; r++) {
      if (isExtractionAborted) break;
      const prevHeight = msgPanel.scrollHeight;
      msgPanel.scrollTop = 0;
      await sleep(300);
      if (msgPanel.scrollHeight === prevHeight) {
        break; // No earlier messages loaded
      }
    }
  }

  // 2. Query all message elements in #main
  const msgElements = document.querySelectorAll(
    '#main div[data-testid="msg-container"], #main div.message-in, #main div.message-out'
  );

  const messages: any[] = [];
  const mediaFiles: any[] = [];
  const seenIds = new Set<string>();

  for (const el of Array.from(msgElements)) {
    try {
      // Message ID
      let id = el.getAttribute('data-id') || el.closest('[data-id]')?.getAttribute('data-id') || '';
      if (!id) {
        id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
          try {
            const d = new Date(match[1]);
            if (!isNaN(d.getTime())) timestamp = d.toISOString();
          } catch {}
        }
      }

      // Sender direction: outgoing (business) vs incoming (customer)
      const isOut = Boolean(
        el.classList.contains('message-out') ||
        el.querySelector('[data-testid="msg-check"]') ||
        el.querySelector('[data-testid="msg-dblcheck"]') ||
        el.querySelector('[data-icon="msg-check"]') ||
        el.querySelector('[data-icon="msg-dblcheck"]')
      );
      const sender = isOut ? 'business' : 'customer';

      // Text content
      const textSpan = el.querySelector(
        '.selectable-text, [data-testid="selectable-text"], div.copyable-text span'
      );
      const text = textSpan?.textContent?.trim() || '';

      // Media attachments
      let type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' = 'text';
      let mediaBlobUrl: string | undefined;
      let mediaFileName: string | undefined;
      let mediaMimeType: string | undefined;
      let category: 'images' | 'videos' | 'audio' | 'documents' | 'stickers' = 'images';

      const img = el.querySelector('img[src]') as HTMLImageElement;
      const video = el.querySelector('video') as HTMLVideoElement;
      const audio = el.querySelector('audio, [data-testid="audio-play"]') as HTMLElement;
      const doc = el.querySelector('[data-testid="document-thumb"], [data-icon="document-pdf"]') as HTMLElement;

      if (img && img.src && !img.src.includes('avatar') && !img.src.includes('profile')) {
        type = 'image';
        category = 'images';
        mediaBlobUrl = img.src;
        mediaFileName = `image_${id.replace(/\W/g, '_')}.jpg`;
        mediaMimeType = 'image/jpeg';
      } else if (video) {
        type = 'video';
        category = 'videos';
        mediaBlobUrl = video.src || undefined;
        mediaFileName = `video_${id.replace(/\W/g, '_')}.mp4`;
        mediaMimeType = 'video/mp4';
      } else if (audio) {
        type = 'audio';
        category = 'audio';
        const audioTag = el.querySelector('audio') as HTMLAudioElement;
        mediaBlobUrl = audioTag?.src || undefined;
        mediaFileName = `audio_${id.replace(/\W/g, '_')}.ogg`;
        mediaMimeType = 'audio/ogg';
      } else if (doc) {
        type = 'document';
        category = 'documents';
        const docTitle = el.querySelector('[data-testid="document-title"], span[title]')?.textContent?.trim();
        mediaFileName = docTitle || `doc_${id.replace(/\W/g, '_')}.pdf`;
        mediaMimeType = 'application/pdf';
      }

      // If media exists, download it directly to base64
      if (mediaBlobUrl) {
        try {
          const base64 = await blobUrlToBase64(mediaBlobUrl);
          if (base64) {
            mediaFiles.push({
              fileName: mediaFileName || `media_${Date.now()}.bin`,
              category,
              mimeType: mediaMimeType || 'application/octet-stream',
              dataBase64: base64,
            });
          }
        } catch {}
      }

      if (text || mediaFileName) {
        messages.push({
          id,
          timestamp,
          sender,
          type,
          text,
          mediaPath: mediaFileName ? `media/${category}/${mediaFileName}` : null,
          deliveryStatus: isOut ? 'read' : undefined,
        });
      }
    } catch {}
  }

  return { messages, mediaFiles };
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
