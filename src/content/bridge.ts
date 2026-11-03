/**
 * Main World WhatsApp Web Bridge
 * Injected into the page execution context to reliably interface with WhatsApp Web's
 * DOM, search bar, contact details drawer, and React trees.
 */

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function simulateClick(element: HTMLElement) {
  const opts = { bubbles: true, cancelable: true, view: window };
  element.dispatchEvent(new PointerEvent('pointerdown', opts));
  element.dispatchEvent(new MouseEvent('mousedown', opts));
  element.dispatchEvent(new PointerEvent('pointerup', opts));
  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));
}

// Find React Fiber on DOM node
function getReactFiber(domNode: Element | null): any {
  if (!domNode) return null;
  const key = Object.keys(domNode).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  return key ? (domNode as any)[key] : null;
}

function extractPhoneFromJid(jid?: string): string | undefined {
  if (!jid || typeof jid !== 'string') return undefined;
  const match = jid.match(/^(\d{7,15})(:.+)?@(c\.us|s\.whatsapp\.net)$/);
  if (match) {
    return `+${match[1]}`;
  }
  return undefined;
}

function findChatInFiber(fiber: any, depth = 0): any {
  if (!fiber || depth > 10) return null;
  const props = fiber.memoizedProps;
  if (props) {
    if (props.chat && (props.chat.id || props.chat.contact)) return props.chat;
    if (props.contact && props.contact.id) return props.contact;
    if (props.data && props.data.id && String(props.data.id).includes('@')) return props.data;
  }
  if (fiber.stateNode?.props?.chat) return fiber.stateNode.props.chat;
  return findChatInFiber(fiber.child, depth + 1) || findChatInFiber(fiber.sibling, depth + 1);
}

/**
 * Searches WhatsApp Web chat list using the top search bar.
 * This guarantees opening ANY conversation from 2,000+ chats,
 * even if it is not currently rendered in the virtualized DOM viewport!
 */
async function searchAndOpenChat(searchTerm: string): Promise<boolean> {
  // Find search box
  const searchInput = document.querySelector<HTMLElement>(
    '#side div[contenteditable="true"][data-tab="3"], ' +
    '[data-testid="chat-list-search"], ' +
    '#side [role="textbox"], ' +
    'div[data-tab="3"]'
  );

  if (!searchInput) return false;

  try {
    // Focus and clear previous search
    searchInput.focus();
    searchInput.textContent = '';
    searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(200);

    // Enter search term (contact name or phone)
    document.execCommand('insertText', false, searchTerm);
    searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(600); // Allow WhatsApp Web to filter results

    // The first result under search
    const firstResult = document.querySelector<HTMLElement>(
      '#pane-side [data-testid="cell-frame-container"], ' +
      '#pane-side div[role="listitem"], ' +
      '#pane-side div[tabindex="-1"]'
    );

    if (firstResult) {
      simulateClick(firstResult);
      await sleep(700);

      // Clear search box so the full list restores
      const clearBtn = document.querySelector<HTMLElement>(
        '[data-testid="x-alt"], [aria-label="Cancel search"], button[aria-label="Clear"]'
      );
      if (clearBtn) {
        simulateClick(clearBtn);
      } else {
        searchInput.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        searchInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      await sleep(400);
      return true;
    }
  } catch (err) {
    console.warn('[WA Exporter] Search bar navigation failed:', err);
  }

  return false;
}

/**
 * Opens a conversation in WhatsApp Web by checking visible items,
 * or searching via the search bar.
 */
async function openConversation(chatId: string, contactName: string, phoneNumber?: string): Promise<boolean> {
  // 1. Is it already open in #main?
  const currentHeaderTitle = document.querySelector(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header span[dir="auto"]'
  );
  if (currentHeaderTitle) {
    const text = currentHeaderTitle.textContent?.trim().toLowerCase() || '';
    if (contactName && text.includes(contactName.trim().toLowerCase())) {
      return true;
    }
  }

  // 2. Check visible chat rows in #pane-side
  const visibleRows = document.querySelectorAll(
    '#pane-side [data-testid="cell-frame-container"], #pane-side div[role="listitem"]'
  );

  for (const row of Array.from(visibleRows)) {
    const rowText = row.textContent || '';
    const fiber = getReactFiber(row);
    const chat = findChatInFiber(fiber);
    const rowId = chat?.id?._serialized || row.getAttribute('data-id') || '';

    if ((chatId && rowId === chatId) || (contactName && rowText.includes(contactName))) {
      simulateClick(row.querySelector('[role="button"]') as HTMLElement || row as HTMLElement);
      await sleep(800);
      return true;
    }
  }

  // 3. Search via search bar (handles all 2000+ chats!)
  const searchTarget = contactName || phoneNumber || chatId.replace(/@.+$/, '');
  if (searchTarget) {
    const success = await searchAndOpenChat(searchTarget);
    if (success) return true;
  }

  return false;
}

/**
 * Resolves phone number for saved contacts by inspecting React fibers on #main header
 * or clicking the header to inspect the contact info drawer.
 */
async function resolvePhoneNumberForOpenChat(contactName?: string): Promise<string | undefined> {
  // 1. Try React fiber on #main header
  const header = document.querySelector('#main header');
  if (header) {
    const fiber = getReactFiber(header);
    const chat = findChatInFiber(fiber);
    if (chat) {
      const rawJid = chat.id?._serialized || (typeof chat.id === 'string' ? chat.id : '');
      const phoneFromJid = extractPhoneFromJid(rawJid);
      if (phoneFromJid) return phoneFromJid;
      if (chat.phoneNumber) return `+${chat.phoneNumber.replace(/\D/g, '')}`;
      if (chat.contact?.phoneNumber) return `+${chat.contact.phoneNumber.replace(/\D/g, '')}`;
    }
  }

  // 2. Click header to open Contact Info Drawer and read phone directly
  const headerClickTarget = document.querySelector<HTMLElement>(
    '#main header [data-testid="conversation-info-header-chat-title"], #main header div[role="button"]'
  ) || header as HTMLElement;

  if (headerClickTarget) {
    try {
      simulateClick(headerClickTarget);
      await sleep(600); // Wait for contact drawer to animate in

      const drawer = document.querySelector(
        '[data-testid="contact-info-drawer"], section[tabindex="-1"], div[aria-label="Contact details"]'
      );

      if (drawer) {
        const textNodes = drawer.querySelectorAll('span, div');
        let foundPhone: string | undefined;

        for (const node of Array.from(textNodes)) {
          const text = node.textContent?.trim() || '';
          // International phone pattern: e.g. "+212 660-123456" or "~+212..."
          if (/^~?\+[\d\s\-()]{8,22}$/.test(text)) {
            const cleanDigits = text.replace(/\D/g, '');
            if (cleanDigits.length >= 7 && cleanDigits.length <= 15) {
              foundPhone = `+${cleanDigits}`;
              break;
            }
          }
        }

        // Close drawer
        const closeBtn = drawer.querySelector<HTMLElement>(
          '[data-testid="x"], [data-testid="btn-closer"], [aria-label="Close"]'
        );
        if (closeBtn) {
          simulateClick(closeBtn);
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        await sleep(300);

        if (foundPhone) return foundPhone;
      }
    } catch (e) {
      console.warn('[WA Exporter] Drawer inspection fallback failed:', e);
    }
  }

  // 3. If contactName is a phone number itself
  if (contactName && /^\+?[\d\s\-()]{7,20}$/.test(contactName)) {
    const cleanDigits = contactName.replace(/\D/g, '');
    if (cleanDigits.length >= 7) return `+${cleanDigits}`;
  }

  return undefined;
}

/**
 * Scroll up in #main to fetch conversation history
 */
async function scrollUpToLoadMessages(scrollRounds = 6): Promise<void> {
  const panel = document.querySelector<HTMLElement>(
    '#main [data-testid="conversation-panel-messages"], #main div[tabindex="0"]'
  );
  if (!panel) return;

  for (let r = 0; r < scrollRounds; r++) {
    const prevHeight = panel.scrollHeight;
    panel.scrollTop = 0;
    await sleep(500);
    if (panel.scrollHeight === prevHeight) {
      break;
    }
  }
}

/**
 * Extracts messages from #main
 */
function extractMessagesFromMain(): any[] {
  const messages: any[] = [];
  const msgContainers = document.querySelectorAll(
    '#main div[data-testid="msg-container"], #main div.message-in, #main div.message-out'
  );

  for (const container of Array.from(msgContainers)) {
    try {
      // 1. WhatsApp Web copy format attribute: data-pre-plain-text="[14:30, 11/1/2026] Ahmed: "
      const copyableEl = container.querySelector('[data-pre-plain-text]');
      const preText = copyableEl?.getAttribute('data-pre-plain-text') || '';

      let timestamp = new Date().toISOString();
      if (preText) {
        const match = preText.match(/\[(.*?)\]/);
        if (match && match[1]) {
          try {
            const parsed = new Date(match[1]);
            if (!isNaN(parsed.getTime())) {
              timestamp = parsed.toISOString();
            }
          } catch {}
        }
      }

      // 2. Sender direction
      const isOut = Boolean(
        container.classList.contains('message-out') ||
        container.querySelector('[data-testid="msg-check"]') ||
        container.querySelector('[data-testid="msg-dblcheck"]') ||
        container.querySelector('[data-icon="msg-check"]') ||
        container.querySelector('[data-icon="msg-dblcheck"]')
      );
      const sender = isOut ? 'business' : 'customer';

      // 3. Message ID
      let id = container.getAttribute('data-id') || copyableEl?.closest('[data-id]')?.getAttribute('data-id') || '';
      if (!id) {
        id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      // 4. Text content
      const textSpan = container.querySelector(
        '.selectable-text span, span.selectable-text, [data-testid="selectable-text"], div.copyable-text span'
      );
      const text = textSpan?.textContent?.trim() || '';

      // 5. Media attachments
      let type = 'text';
      let mediaBlobUrl: string | undefined;
      let mediaFileName: string | undefined;
      let mediaMimeType: string | undefined;

      const img = container.querySelector('img[src]') as HTMLImageElement;
      const video = container.querySelector('video') as HTMLVideoElement;
      const audio = container.querySelector('audio, [data-testid="audio-play"]') as HTMLElement;
      const doc = container.querySelector('[data-testid="document-thumb"], [data-icon="document-pdf"]') as HTMLElement;

      if (img && img.src && !img.src.includes('avatar') && !img.src.includes('profile')) {
        type = 'image';
        mediaBlobUrl = img.src;
        mediaFileName = `image_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
        mediaMimeType = 'image/jpeg';
      } else if (video) {
        type = 'video';
        mediaBlobUrl = video.src || undefined;
        mediaFileName = `video_${Date.now()}.mp4`;
        mediaMimeType = 'video/mp4';
      } else if (audio) {
        type = 'audio';
        const audioTag = container.querySelector('audio') as HTMLAudioElement;
        mediaBlobUrl = audioTag?.src || undefined;
        mediaFileName = `audio_${Date.now()}.ogg`;
        mediaMimeType = 'audio/ogg';
      } else if (doc) {
        type = 'document';
        const docTitle = container.querySelector('[data-testid="document-title"], span[title]')?.textContent?.trim();
        mediaFileName = docTitle || `doc_${Date.now()}.pdf`;
        mediaMimeType = 'application/pdf';
      }

      if (text || mediaBlobUrl || mediaFileName) {
        messages.push({
          id,
          timestamp,
          sender,
          type,
          text,
          mediaBlobUrl,
          mediaFileName,
          mediaMimeType,
          deliveryStatus: isOut ? 'read' : undefined,
        });
      }
    } catch {
      // Continue next message
    }
  }

  return messages;
}

// Global window message listener for communication with content script
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'WA_EXT_CONTENT') {
    return;
  }

  const { action, payload, requestId } = event.data;

  try {
    switch (action) {
      case 'EXTRACT_CHAT': {
        const { chatId, contactName, phoneNumber } = payload || {};

        // 1. Open the conversation (checks visible rows or uses WhatsApp search bar)
        const opened = await openConversation(chatId, contactName, phoneNumber);

        if (!opened) {
          window.postMessage({
            source: 'WA_EXT_BRIDGE',
            action: 'EXTRACT_CHAT_RESPONSE',
            requestId,
            payload: { success: false, error: `Could not open conversation for "${contactName || chatId}"` },
          }, '*');
          return;
        }

        // 2. Resolve phone number for saved contacts
        const resolvedPhone = await resolvePhoneNumberForOpenChat(contactName);

        // 3. Scroll up in conversation history
        await scrollUpToLoadMessages(5);

        // 4. Extract messages and media references
        const messages = extractMessagesFromMain();

        window.postMessage({
          source: 'WA_EXT_BRIDGE',
          action: 'EXTRACT_CHAT_RESPONSE',
          requestId,
          payload: {
            success: true,
            messages,
            resolvedPhone,
          },
        }, '*');
        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    window.postMessage({
      source: 'WA_EXT_BRIDGE',
      action: 'ERROR_RESPONSE',
      requestId,
      payload: { error: err?.message || String(err) },
    }, '*');
  }
});

console.log('[WA Exporter] Main world bridge fully initialized');
