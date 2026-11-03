/**
 * Direct DOM Chat & Message Extractor (Runs in Content Script ISOLATED world)
 * Directly controls WhatsApp Web DOM without relying on external bridges or postMessage.
 */

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clickElement(el: Element): void {
  const target = el.querySelector('[role="button"]') || el;
  const opts = { bubbles: true, cancelable: true, view: window };
  target.dispatchEvent(new PointerEvent('pointerdown', opts));
  target.dispatchEvent(new MouseEvent('mousedown', opts));
  target.dispatchEvent(new PointerEvent('pointerup', opts));
  target.dispatchEvent(new MouseEvent('mouseup', opts));
  (target as HTMLElement).click();
}

/**
 * Scrolls the chat list container (#pane-side) to find and click a specific conversation.
 * Guarantees finding any chat even if it is far down the virtualized list.
 */
export async function openConversationInDOM(
  contactName: string,
  phoneNumber?: string
): Promise<boolean> {
  // 1. Is it already open in #main?
  const currentTitle = document.querySelector(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header span[dir="auto"]'
  );
  if (currentTitle && contactName) {
    const text = currentTitle.textContent?.trim().toLowerCase() || '';
    if (text.includes(contactName.trim().toLowerCase())) {
      return true;
    }
  }

  const container = document.getElementById('pane-side') 
    || document.querySelector('[data-testid="chat-list"]')
    || document.querySelector('[aria-label="Chat list"]');

  if (!container) return false;

  // Find the scrollable container
  let scrollEl: HTMLElement = container;
  if (container.scrollHeight <= container.clientHeight) {
    const child = container.querySelector('[role="list"]') as HTMLElement;
    if (child && child.scrollHeight > child.clientHeight) {
      scrollEl = child;
    }
  }

  // 2. Check currently visible rows first (no scrolling needed if already visible)
  const targetClean = contactName.trim().toLowerCase();
  const phoneClean = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

  const initialRows = document.querySelectorAll(
    '#pane-side [data-testid="cell-frame-container"], #pane-side div[role="listitem"]'
  );

  for (const row of Array.from(initialRows)) {
    const text = row.textContent?.toLowerCase() || '';
    if (text.includes(targetClean) || (phoneClean && text.includes(phoneClean))) {
      clickElement(row);
      await sleep(1000);
      return true;
    }
  }

  // 3. Scroll down through #pane-side to locate the chat
  scrollEl.scrollTop = 0;
  await sleep(200);

  let prevScroll = -1;
  const maxRounds = 40; // Max 40 scroll steps to avoid infinite loops

  for (let r = 0; r < maxRounds; r++) {
    const rows = document.querySelectorAll(
      '#pane-side [data-testid="cell-frame-container"], #pane-side div[role="listitem"]'
    );

    for (const row of Array.from(rows)) {
      const text = row.textContent?.toLowerCase() || '';
      if (text.includes(targetClean) || (phoneClean && text.includes(phoneClean))) {
        clickElement(row);
        await sleep(1000);
        return true;
      }
    }

    if (scrollEl.scrollTop === prevScroll) {
      // Reached bottom
      break;
    }

    prevScroll = scrollEl.scrollTop;
    scrollEl.scrollTop += 600;
    await sleep(250);
  }

  return false;
}

/**
 * Extracts phone number for the open conversation from the header avatar or contact drawer.
 */
export async function resolveOpenChatPhoneNumber(contactName?: string): Promise<string | undefined> {
  // 1. Check header avatar URL (often contains u=PHONE%40c.us)
  const headerImg = document.querySelector('#main header img');
  if (headerImg) {
    const src = headerImg.getAttribute('src') || '';
    const match = src.match(/u=(\d{7,15})%40/i) || src.match(/(\d{7,15})@c\.us/i);
    if (match) return `+${match[1]}`;
  }

  // 2. If contact name itself looks like a phone number
  if (contactName && /^\+?[\d\s\-()]{7,20}$/.test(contactName)) {
    const cleanDigits = contactName.replace(/\D/g, '');
    if (cleanDigits.length >= 7) return `+${cleanDigits}`;
  }

  // 3. Click header to open the Contact Info Drawer and read the phone number directly
  const header = document.querySelector('#main header');
  const headerClickTarget = document.querySelector<HTMLElement>(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header div[role="button"]'
  ) || header as HTMLElement;

  if (headerClickTarget) {
    try {
      clickElement(headerClickTarget);
      await sleep(600); // Wait for drawer to slide open

      const drawer = document.querySelector(
        '[data-testid="contact-info-drawer"], section[tabindex="-1"], div[aria-label="Contact details"]'
      );

      let foundPhone: string | undefined;
      if (drawer) {
        const textNodes = drawer.querySelectorAll('span, div');
        for (const node of Array.from(textNodes)) {
          const text = node.textContent?.trim() || '';
          if (/^~?\+[\d\s\-()]{8,22}$/.test(text)) {
            const digits = text.replace(/\D/g, '');
            if (digits.length >= 7 && digits.length <= 15) {
              foundPhone = `+${digits}`;
              break;
            }
          }
        }

        // Close drawer
        const closeBtn = drawer.querySelector<HTMLElement>(
          '[data-testid="x"], [data-testid="btn-closer"], [aria-label="Close"], button[aria-label="Back"]'
        );
        if (closeBtn) {
          clickElement(closeBtn);
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        await sleep(300);

        if (foundPhone) return foundPhone;
      }
    } catch {
      // Fallback
    }
  }

  return undefined;
}

/**
 * Extracts all accessible messages and media from the currently open chat in #main.
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
    for (let r = 0; r < 8; r++) {
      const prevHeight = msgPanel.scrollHeight;
      msgPanel.scrollTop = 0;
      await sleep(400);
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
          const base64 = await fetchBlobAsBase64(mediaBlobUrl);
          if (base64) {
            mediaFiles.push({
              fileName: mediaFileName || `media_${Date.now()}.bin`,
              category,
              mimeType: mediaMimeType || 'application/octet-stream',
              dataBase64: base64,
            });
          }
        } catch {
          // Media download non-critical
        }
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
 * Fetches a blob: or https: URL directly in the page context and converts to Base64
 */
async function fetchBlobAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
