/**
 * Content Script running in the context of https://web.whatsapp.com (ISOLATED world)
 * Interfaces with the WhatsApp Web DOM and coordinates with the MAIN world bridge.
 */

import { ExtensionMessage, WhatsAppSessionStatus } from '../types/messaging';
import { discoverAllChats, stopDiscovery, DiscoveredChat } from './chatDiscovery';

console.log('[WA Exporter] Content script loaded on WhatsApp Web');

// Ensure the MAIN world bridge is injected if not already running
function ensureBridgeInjected() {
  const existing = document.getElementById('wa-exporter-bridge-script');
  if (!existing && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    try {
      const script = document.createElement('script');
      script.id = 'wa-exporter-bridge-script';
      script.src = chrome.runtime.getURL('bridge.js');
      script.onload = () => {
        console.log('[WA Exporter] Dynamic bridge script injected successfully');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[WA Exporter] Could not inject dynamic bridge script:', e);
    }
  }
}

ensureBridgeInjected();

/**
 * Send request to the MAIN world bridge and await response
 */
function sendBridgeRequest(action: string, payload?: any, timeoutMs = 12000): Promise<any> {
  return new Promise((resolve) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    let timer: any;

    const listener = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.data &&
        event.data.source === 'WA_EXT_BRIDGE' &&
        event.data.requestId === requestId
      ) {
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        resolve(event.data.payload);
      }
    };

    window.addEventListener('message', listener);

    timer = setTimeout(() => {
      window.removeEventListener('message', listener);
      resolve({ success: false, error: 'Bridge request timed out' });
    }, timeoutMs);

    window.postMessage({
      source: 'WA_EXT_CONTENT',
      action,
      payload,
      requestId,
    }, '*');
  });
}

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

      // Run combined discovery: bridge React fibers + DOM virtual scroll
      (async () => {
        // 1. First probe bridge for any pre-loaded chats in React tree
        try {
          const bridgeRes = await sendBridgeRequest('SCAN_CHATS', {}, 2000);
          if (bridgeRes?.chats && bridgeRes.chats.length > 0) {
            reportDiscoveredChats(bridgeRes.chats, bridgeRes.chats.length, false);
          }
        } catch {
          // Continue with DOM scanner
        }

        // 2. Perform smooth scroll discovery to catch virtualized chats
        discoverAllChats(async (domChats, totalSoFar, done) => {
          // If any chats in this batch are missing phone numbers, query bridge
          if (domChats.length > 0) {
            try {
              const fiberBatch = await sendBridgeRequest('SCAN_CHATS', {}, 1000);
              if (fiberBatch?.chats) {
                const phoneMap = new Map<string, string>();
                for (const c of fiberBatch.chats) {
                  if (c.phoneNumber) {
                    phoneMap.set(c.chatId, c.phoneNumber);
                    phoneMap.set(c.name, c.phoneNumber);
                  }
                }
                for (const d of domChats) {
                  if (!d.phoneNumber) {
                    d.phoneNumber = phoneMap.get(d.chatId) || phoneMap.get(d.name);
                  }
                }
              }
            } catch {
              // Proceed with available DOM data
            }
          }

          reportDiscoveredChats(domChats, totalSoFar, done);
        });
      })();
      break;
    }

    case 'STOP_CHAT_DISCOVERY': {
      stopDiscovery();
      sendResponse({ success: true, message: 'Chat discovery stopped' });
      break;
    }

    case 'EXTRACT_CHAT_REQUEST': {
      // Forward extraction request to the bridge running in the page context
      (async () => {
        try {
          const result = await sendBridgeRequest('EXTRACT_CHAT', payload, 15000);
          sendResponse(result);
        } catch (err: any) {
          sendResponse({ success: false, error: err?.message || 'Chat extraction failed' });
        }
      })();
      return true; // async sendResponse
    }

    default:
      sendResponse({ success: true, handled: false });
      break;
  }

  return true;
});
