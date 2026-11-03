/**
 * Content Script running in the context of https://web.whatsapp.com
 * Interfaces with the WhatsApp Web DOM for status checks and chat discovery.
 */

import { ExtensionMessage, WhatsAppSessionStatus } from '../types/messaging';
import { discoverAllChats, stopDiscovery, DiscoveredChat } from './chatDiscovery';

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
 * Sends a batch of discovered chats to the dashboard via the background service worker.
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
  const { action } = message;

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

      // Start discovery asynchronously — results are sent via CHAT_DISCOVERED messages
      sendResponse({ success: true, message: 'Chat discovery started' });

      discoverAllChats((chats, totalSoFar, done) => {
        reportDiscoveredChats(chats, totalSoFar, done);
      });
      break;
    }

    case 'STOP_CHAT_DISCOVERY': {
      stopDiscovery();
      sendResponse({ success: true, message: 'Chat discovery stop requested' });
      break;
    }

    default:
      sendResponse({ success: true, handled: false, note: 'Action not implemented in this phase' });
      break;
  }

  return true;
});
