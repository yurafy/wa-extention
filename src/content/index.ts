/**
 * Content Script running on https://web.whatsapp.com (ISOLATED world)
 * Robust DOM automation for status checking, chat discovery, and message extraction.
 */

import { ExtensionMessage, WhatsAppSessionStatus } from '../types/messaging';
import { discoverAllChats, stopDiscovery, DiscoveredChat } from './chatDiscovery';
import { 
  openConversationInDOM, 
  resolveOpenChatPhoneNumber, 
  extractMessagesFromOpenChat,
  abortActiveExtraction,
  resetActiveExtraction
} from './chatExtractor';

console.log('[WA Exporter] Content script loaded on WhatsApp Web');

/**
 * Inspects WhatsApp Web DOM to determine authentication and readiness state.
 */
function checkWhatsAppStatus(): WhatsAppSessionStatus {
  const paneSide = document.getElementById('pane-side')
    || document.querySelector('[aria-label="Chat list"]')
    || document.querySelector('[data-testid="chat-list"]');

  const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]')
    || document.querySelector('[data-testid="qrcode-canvas"]');

  const appElement = document.getElementById('app') || document.querySelector('#main');

  const isAuthenticated = Boolean(paneSide) && !qrCanvas;
  const pageReady = Boolean(paneSide || qrCanvas || appElement);

  return {
    isWhatsAppOpen: true,
    isAuthenticated,
    pageReady,
  };
}

/**
 * Sends a batch of discovered chats to the dashboard via background worker
 */
function reportDiscoveredChats(chats: DiscoveredChat[], totalSoFar: number, done: boolean): void {
  try {
    chrome.runtime.sendMessage({
      action: 'CHAT_DISCOVERED',
      payload: { chats, totalSoFar, done },
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('[WA Exporter] Failed to report discovered chats:', err);
  }
}

// Listen for messages from Background Service Worker or Dashboard
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const { action, payload } = message;

  switch (action) {
    case 'PING': {
      sendResponse({ action: 'PONG', timestamp: Date.now() });
      break;
    }

    case 'CHECK_WHATSAPP_STATUS': {
      const status = checkWhatsAppStatus();
      sendResponse({ success: true, status });
      break;
    }

    case 'START_CHAT_DISCOVERY': {
      const status = checkWhatsAppStatus();
      if (!status.isAuthenticated) {
        sendResponse({
          success: false,
          error: 'WhatsApp Web is not authenticated. Please scan the QR code first.',
        });
        break;
      }

      sendResponse({ success: true, message: 'Chat discovery started' });

      // Run chat list virtualized scroll discovery
      discoverAllChats((chats, totalSoFar, done) => {
        reportDiscoveredChats(chats, totalSoFar, done);
      });
      break;
    }

    case 'STOP_CHAT_DISCOVERY': {
      stopDiscovery();
      sendResponse({ success: true, message: 'Chat discovery stopped' });
      break;
    }

    case 'STOP_EXTRACTION': {
      abortActiveExtraction();
      sendResponse({ success: true, message: 'Extraction aborted' });
      break;
    }

    case 'EXTRACT_CHAT_REQUEST': {
      resetActiveExtraction();
      // Direct DOM extraction
      (async () => {
        try {
          const { contactName, phoneNumber } = (payload as any) || {};

          // 1. Open the conversation in WhatsApp Web DOM
          const opened = await openConversationInDOM(contactName, phoneNumber);
          if (!opened) {
            sendResponse({
              success: false,
              error: `Could not locate conversation for "${contactName}" in chat list`,
            });
            return;
          }

          // 2. Resolve phone number (from avatar or drawer if saved contact)
          const resolvedPhone = await resolveOpenChatPhoneNumber(contactName);

          // 3. Extract messages and media attachments
          const { messages, mediaFiles } = await extractMessagesFromOpenChat();

          sendResponse({
            success: true,
            messages,
            mediaFiles,
            resolvedPhone,
          });
        } catch (err: any) {
          sendResponse({
            success: false,
            error: err?.message || 'Chat extraction encountered an unexpected error',
          });
        }
      })();
      return true; // Keep message channel open for async response
    }

    default:
      sendResponse({ success: true, handled: false });
      break;
  }

  return true;
});
