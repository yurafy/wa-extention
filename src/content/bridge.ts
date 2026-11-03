/**
 * Main World WhatsApp Web Bridge
 * Injected directly into the page context (MAIN world) to access DOM React Fibers
 * and WhatsApp Web component states with complete fidelity.
 */

// Helper to find React internal fiber or props on a DOM node
function getReactFiber(domNode: Element | null): any {
  if (!domNode) return null;
  const key = Object.keys(domNode).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  return key ? (domNode as any)[key] : null;
}

function getReactProps(domNode: Element | null): any {
  if (!domNode) return null;
  const key = Object.keys(domNode).find(
    k => k.startsWith('__reactProps$')
  );
  return key ? (domNode as any)[key] : null;
}

/**
 * Searches up or down the fiber tree to find a chat or contact object
 */
function findChatInFiber(fiber: any, depth = 0): any {
  if (!fiber || depth > 12) return null;
  
  // Check memoizedProps
  const props = fiber.memoizedProps;
  if (props) {
    if (props.chat && (props.chat.id || props.chat.contact)) {
      return props.chat;
    }
    if (props.contact && props.contact.id) {
      return props.contact;
    }
    if (props.data && props.data.id && String(props.data.id).includes('@')) {
      return props.data;
    }
  }

  // Check stateNode
  if (fiber.stateNode?.props?.chat) {
    return fiber.stateNode.props.chat;
  }

  // Traverse child and sibling
  return findChatInFiber(fiber.child, depth + 1) || findChatInFiber(fiber.sibling, depth + 1);
}

/**
 * Extracts raw phone number from WhatsApp JID string.
 * e.g., "212660123456@c.us" -> "+212660123456"
 * or "212660123456:12@c.us" -> "+212660123456"
 */
function extractPhoneFromJid(jid?: string): string | undefined {
  if (!jid || typeof jid !== 'string') return undefined;
  // Individual chats end with @c.us or @s.whatsapp.net
  const match = jid.match(/^(\d{7,15})(:.+)?@(c\.us|s\.whatsapp\.net)$/);
  if (match) {
    return `+${match[1]}`;
  }
  return undefined;
}

/**
 * Scans all chat elements on WhatsApp Web using React fibers and DOM attributes
 */
function scanChatsFromPage(): any[] {
  const discovered: any[] = [];
  const seenIds = new Set<string>();

  // Find all possible chat row elements in the chat list
  const selectors = [
    '#pane-side [data-testid="cell-frame-container"]',
    '#pane-side div[role="listitem"]',
    '#pane-side div[tabindex="-1"]',
    '[data-testid="chat-list"] [data-testid="cell-frame-container"]',
  ];

  const elements: Element[] = [];
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel);
    if (nodes.length > 0) {
      elements.push(...Array.from(nodes));
    }
  }

  for (const el of elements) {
    try {
      let chatId = '';
      let name = '';
      let phone: string | undefined;
      let isGroup = false;
      let isBusiness = false;
      let lastMsgText = '';
      let timestamp = '';
      let unread = 0;

      // 1. Try React fiber on this element or its parent
      const fiber = getReactFiber(el) || getReactFiber(el.parentElement);
      const props = getReactProps(el) || getReactProps(el.parentElement);
      const chatObj = findChatInFiber(fiber) || props?.chat;

      if (chatObj) {
        const rawId = chatObj.id?._serialized || chatObj.id || '';
        chatId = typeof rawId === 'string' ? rawId : '';
        name = chatObj.formattedTitle || chatObj.name || chatObj.contact?.name || chatObj.contact?.formattedName || '';
        isGroup = Boolean(chatObj.isGroup || (chatId && chatId.includes('@g.us')));
        isBusiness = Boolean(chatObj.isBusiness || chatObj.contact?.isBusiness || chatObj.verifiedName);
        unread = chatObj.unreadCount || 0;

        if (chatObj.t) {
          timestamp = new Date(chatObj.t * 1000).toISOString();
        }

        // Phone number directly from JID or contact props
        if (!isGroup) {
          phone = extractPhoneFromJid(chatId) 
            || (chatObj.phoneNumber ? `+${chatObj.phoneNumber.replace(/\D/g, '')}` : undefined)
            || (chatObj.contact?.phoneNumber ? `+${chatObj.contact.phoneNumber.replace(/\D/g, '')}` : undefined);
        }
      }

      // 2. DOM fallback if fiber didn't catch everything
      if (!name) {
        const titleEl = el.querySelector('[data-testid="cell-frame-title"] span[dir="auto"], span[title]');
        name = titleEl?.getAttribute('title') || titleEl?.textContent?.trim() || '';
      }

      if (!chatId) {
        // Check data-id on element or ancestors
        const dataIdEl = el.closest('[data-id]') || el.querySelector('[data-id]');
        chatId = dataIdEl?.getAttribute('data-id') || '';
      }

      // If phone is still unknown, check avatar image URL or DOM text
      if (!phone && !isGroup) {
        // WhatsApp often puts the JID in profile photo src or avatar container
        const avatarImg = el.querySelector('img[src*="u="], img[src*="%40"]');
        if (avatarImg) {
          const src = avatarImg.getAttribute('src') || '';
          const uMatch = src.match(/[?&]u=(\d{7,15})%40/i) || src.match(/(\d{7,15})@c\.us/i);
          if (uMatch) {
            phone = `+${uMatch[1]}`;
            if (!chatId) chatId = `${uMatch[1]}@c.us`;
          }
        }

        // If contact name itself is a phone number (e.g. "+1 234 567 890")
        if (!phone && /^\+?[\d\s\-()]{7,20}$/.test(name)) {
          const cleanDigits = name.replace(/\D/g, '');
          if (cleanDigits.length >= 7) {
            phone = `+${cleanDigits}`;
            if (!chatId) chatId = `${cleanDigits}@c.us`;
          }
        }

        // Fallback from chatId if JID is present in data-id
        if (!phone && chatId) {
          phone = extractPhoneFromJid(chatId);
        }
      }

      if (!chatId && name) {
        chatId = `name_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }

      if (chatId && !seenIds.has(chatId)) {
        seenIds.add(chatId);

        // Fallback for preview text and time from DOM
        if (!lastMsgText) {
          const previewEl = el.querySelector('[data-testid="last-msg-status"] span[dir="auto"]');
          lastMsgText = previewEl?.textContent?.trim() || '';
        }

        if (!timestamp) {
          const timeEl = el.querySelector('[data-testid="cell-frame-primary-detail"] span');
          if (timeEl?.textContent) {
            timestamp = new Date().toISOString();
          }
        }

        discovered.push({
          chatId,
          name: name || 'Unnamed Contact',
          phoneNumber: phone,
          chatType: isGroup ? 'group' : 'individual',
          isBusiness,
          lastMessagePreview: lastMsgText,
          lastMessageTimestamp: timestamp || new Date().toISOString(),
          unreadCount: unread,
        });
      }
    } catch (err) {
      // Ignore individual row parse failure
    }
  }

  return discovered;
}

/**
 * Click a chat row in the chat list to open it in WhatsApp Web's main view (#main)
 */
async function selectChatInUI(chatId: string, contactName?: string): Promise<boolean> {
  // First, check if already active
  const activeHeader = document.querySelector('#main header [data-testid="conversation-info-header-chat-title"]');
  if (activeHeader && contactName && activeHeader.textContent?.includes(contactName)) {
    return true;
  }

  // Search in chat list rows
  const rows = document.querySelectorAll('#pane-side [data-testid="cell-frame-container"], #pane-side div[role="listitem"]');
  for (const row of Array.from(rows)) {
    const text = row.textContent || '';
    const fiber = getReactFiber(row);
    const chat = findChatInFiber(fiber);
    const rowId = chat?.id?._serialized || row.getAttribute('data-id') || '';

    if ((chatId && rowId === chatId) || (contactName && text.includes(contactName))) {
      const clickTarget = row.querySelector('[role="button"]') || row;
      (clickTarget as HTMLElement).click();
      await new Promise(r => setTimeout(r, 800)); // wait for #main to load
      return true;
    }
  }

  return false;
}

/**
 * Extracts messages currently visible or loaded in the active chat view (#main)
 */
function extractMessagesFromMain(): any[] {
  const messages: any[] = [];
  const msgElements = document.querySelectorAll('#main div[data-testid="msg-container"], #main div.message-in, #main div.message-out');

  for (const el of Array.from(msgElements)) {
    try {
      const fiber = getReactFiber(el);
      let msgData: any = null;

      // Check fiber props
      if (fiber) {
        let curr = fiber;
        let d = 0;
        while (curr && d < 8) {
          if (curr.memoizedProps?.msg) {
            msgData = curr.memoizedProps.msg;
            break;
          }
          if (curr.memoizedProps?.message) {
            msgData = curr.memoizedProps.message;
            break;
          }
          curr = curr.child || curr.sibling;
          d++;
        }
      }

      // Message identifier
      let id = msgData?.id?._serialized || el.getAttribute('data-id') || '';
      if (!id) {
        id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      // Sender direction: incoming (customer) or outgoing (business)
      const isOut = Boolean(
        msgData?.id?.fromMe ||
        el.classList.contains('message-out') ||
        el.querySelector('[data-testid="msg-check"]') ||
        el.querySelector('[data-testid="msg-dblcheck"]')
      );
      const sender = isOut ? 'business' : 'customer';

      // Timestamp
      let timestamp = new Date().toISOString();
      if (msgData?.t) {
        timestamp = new Date(msgData.t * 1000).toISOString();
      } else {
        const timeEl = el.querySelector('[data-testid="msg-meta"] span, span[data-testid="msg-meta"]');
        if (timeEl?.textContent) {
          timestamp = new Date().toISOString();
        }
      }

      // Text content or caption
      let text = msgData?.body || msgData?.caption || '';
      if (!text) {
        const textSpan = el.querySelector('.selectable-text span, span.selectable-text, [data-testid="selectable-text"]');
        text = textSpan?.textContent?.trim() || '';
      }

      // Message type
      let type: string = msgData?.type || 'text';
      let mediaBlobUrl: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaFileName: string | undefined;

      // Check for media elements
      const imgEl = el.querySelector('img[src^="blob:"], img[src^="data:"]') as HTMLImageElement;
      const videoEl = el.querySelector('video[src], video') as HTMLVideoElement;
      const audioEl = el.querySelector('audio, [data-testid="audio-play"]') as HTMLElement;
      const docEl = el.querySelector('[data-testid="document-thumb"], [data-icon="document-pdf"]') as HTMLElement;

      if (imgEl && imgEl.src) {
        type = 'image';
        mediaBlobUrl = imgEl.src;
        mediaFileName = `image_${Date.now()}.jpg`;
        mediaMimeType = 'image/jpeg';
      } else if (videoEl) {
        type = 'video';
        mediaBlobUrl = videoEl.src || undefined;
        mediaFileName = `video_${Date.now()}.mp4`;
        mediaMimeType = 'video/mp4';
      } else if (audioEl) {
        type = 'audio';
        mediaFileName = `audio_${Date.now()}.ogg`;
        mediaMimeType = 'audio/ogg';
      } else if (docEl) {
        type = 'document';
        const docNameEl = el.querySelector('[data-testid="document-title"], span[title]');
        mediaFileName = docNameEl?.textContent?.trim() || `document_${Date.now()}.pdf`;
        mediaMimeType = 'application/pdf';
      }

      messages.push({
        id,
        timestamp,
        sender,
        type: ['image', 'video', 'audio', 'document', 'sticker'].includes(type) ? type : 'text',
        text,
        mediaBlobUrl,
        mediaFileName,
        mediaMimeType,
        deliveryStatus: isOut ? 'read' : undefined,
      });
    } catch {
      // Continue parsing next message
    }
  }

  return messages;
}

/**
 * Scroll up in #main to load older messages
 */
async function scrollUpToLoadOlderMessages(maxScrolls = 5): Promise<void> {
  const msgPanel = document.querySelector('#main div[tabindex="0"], #main [data-testid="conversation-panel-messages"]');
  if (!msgPanel) return;

  for (let i = 0; i < maxScrolls; i++) {
    const prevHeight = msgPanel.scrollHeight;
    msgPanel.scrollTop = 0; // scroll to top
    await new Promise(r => setTimeout(r, 600)); // wait for WhatsApp to load previous batch
    if (msgPanel.scrollHeight === prevHeight) {
      // No more messages loaded
      break;
    }
  }
}

// Global message listener for communication with content script
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.source !== 'WA_EXT_CONTENT') {
    return;
  }

  const { action, payload, requestId } = event.data;

  try {
    switch (action) {
      case 'SCAN_CHATS': {
        const chats = scanChatsFromPage();
        window.postMessage({
          source: 'WA_EXT_BRIDGE',
          action: 'SCAN_CHATS_RESPONSE',
          requestId,
          payload: { chats },
        }, '*');
        break;
      }

      case 'EXTRACT_CHAT': {
        const { chatId, contactName } = payload || {};
        // Open the chat
        const opened = await selectChatInUI(chatId, contactName);
        if (opened) {
          // Scroll up slightly to load history
          await scrollUpToLoadOlderMessages(4);
          const messages = extractMessagesFromMain();

          // Also check if we can inspect contact details drawer to grab phone if missing
          let resolvedPhone: string | undefined;
          const headerTitle = document.querySelector('#main header [data-testid="conversation-info-header-chat-title"]');
          if (headerTitle) {
            const headerFiber = getReactFiber(headerTitle);
            const chat = findChatInFiber(headerFiber);
            if (chat) {
              resolvedPhone = extractPhoneFromJid(chat.id?._serialized) || chat.contact?.phoneNumber;
            }
          }

          window.postMessage({
            source: 'WA_EXT_BRIDGE',
            action: 'EXTRACT_CHAT_RESPONSE',
            requestId,
            payload: { success: true, messages, resolvedPhone },
          }, '*');
        } else {
          window.postMessage({
            source: 'WA_EXT_BRIDGE',
            action: 'EXTRACT_CHAT_RESPONSE',
            requestId,
            payload: { success: false, error: 'Could not open conversation in WhatsApp Web' },
          }, '*');
        }
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

console.log('[WA Exporter] Main world bridge active');
