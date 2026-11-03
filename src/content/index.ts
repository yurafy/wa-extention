/**
 * Content Script running in the context of https://web.whatsapp.com
 * Interfaces with the WhatsApp Web DOM and reports authentication & readiness status.
 */

import { ExtensionMessage, WhatsAppSessionStatus } from '../types/messaging';

console.log('[WA Exporter] Content script loaded on WhatsApp Web');

/**
 * Inspects WhatsApp Web DOM to determine authentication and readiness state.
 */
function checkWhatsAppStatus(): WhatsAppSessionStatus {
  // Check for presence of chat side panel (indicates authenticated session)
  const paneSide = document.getElementById('pane-side') || document.querySelector('[aria-label="Chat list"]') || document.querySelector('[data-testid="chat-list"]');
  
  // Check for QR code (indicates user is logged out / needs to scan)
  const qrCanvas = document.querySelector('canvas[aria-label*="Scan"]') || document.querySelector('[data-testid="qrcode-canvas"]');

  // Check for main app wrapper
  const appElement = document.getElementById('app') || document.querySelector('#main');

  const isAuthenticated = Boolean(paneSide) && !qrCanvas;
  const pageReady = Boolean(paneSide || qrCanvas || appElement);

  return {
    isWhatsAppOpen: true,
    isAuthenticated,
    pageReady,
  };
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

    default:
      sendResponse({ success: true, handled: false, note: 'Action queued for subsequent phase' });
      break;
  }

  return true;
});
