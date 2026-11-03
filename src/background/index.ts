/**
 * Chrome Extension Manifest V3 Background Service Worker
 * Handles tab management, communication bridges, and download requests.
 */

import { ExtensionMessage, WhatsAppSessionStatus } from '../types/messaging';

console.log('[WA Exporter] Background Service Worker initialized');

// When user installs or updates extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[WA Exporter] Extension installed: reason=${details.reason}`);
});

// Helper to find the active or any WhatsApp Web tab
async function findWhatsAppTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
  if (!tabs || tabs.length === 0) return undefined;
  
  // Prefer active/audible/focused tab if multiple are open
  const activeTab = tabs.find(t => t.active);
  return activeTab || tabs[0];
}

// Listen to messages from Dashboard or Content Script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const { action } = message;

  (async () => {
    try {
      switch (action) {
        case 'PING': {
          sendResponse({ action: 'PONG', timestamp: Date.now() });
          break;
        }

        case 'CHECK_WHATSAPP_STATUS': {
          const waTab = await findWhatsAppTab();
          if (!waTab || !waTab.id) {
            const status: WhatsAppSessionStatus = {
              isWhatsAppOpen: false,
              isAuthenticated: false,
              pageReady: false,
            };
            sendResponse({ success: true, status });
            return;
          }

          // Query content script on the WhatsApp tab
          try {
            const response = await chrome.tabs.sendMessage(waTab.id, {
              action: 'CHECK_WHATSAPP_STATUS',
              timestamp: Date.now(),
            });
            sendResponse({ success: true, status: response?.status || {
              isWhatsAppOpen: true,
              tabId: waTab.id,
              isAuthenticated: true,
              pageReady: true,
            }});
          } catch {
            // Tab is open but content script might still be loading or needs reload
            sendResponse({
              success: true,
              status: {
                isWhatsAppOpen: true,
                tabId: waTab.id,
                isAuthenticated: false,
                pageReady: false,
              }
            });
          }
          break;
        }

        case 'OPEN_WHATSAPP_TAB': {
          const waTab = await findWhatsAppTab();
          if (waTab && waTab.id) {
            await chrome.tabs.update(waTab.id, { active: true });
            if (waTab.windowId) {
              await chrome.windows.update(waTab.windowId, { focused: true });
            }
            sendResponse({ success: true, tabId: waTab.id });
          } else {
            const newTab = await chrome.tabs.create({ url: 'https://web.whatsapp.com' });
            sendResponse({ success: true, tabId: newTab.id });
          }
          break;
        }

        case 'OPEN_DASHBOARD_TAB': {
          const dashboardUrl = chrome.runtime.getURL('dashboard.html');
          const existingTabs = await chrome.tabs.query({ url: dashboardUrl });
          if (existingTabs.length > 0 && existingTabs[0].id) {
            await chrome.tabs.update(existingTabs[0].id, { active: true });
            sendResponse({ success: true, tabId: existingTabs[0].id });
          } else {
            const newTab = await chrome.tabs.create({ url: dashboardUrl });
            sendResponse({ success: true, tabId: newTab.id });
          }
          break;
        }

        // Forward chat discovery or extraction commands to WhatsApp tab
        case 'START_CHAT_DISCOVERY':
        case 'STOP_CHAT_DISCOVERY':
        case 'EXTRACT_CHAT_REQUEST': {
          const waTab = await findWhatsAppTab();
          if (!waTab || !waTab.id) {
            sendResponse({ success: false, error: 'WhatsApp Web tab not found. Please open WhatsApp Web first.' });
            return;
          }
          const forwardResponse = await chrome.tabs.sendMessage(waTab.id, message);
          sendResponse(forwardResponse);
          break;
        }

        default:
          sendResponse({ success: true, handled: false });
          break;
      }
    } catch (err: unknown) {
      console.error('[WA Exporter SW Error]', err);
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();

  // Return true to indicate asynchronous sendResponse
  return true;
});
