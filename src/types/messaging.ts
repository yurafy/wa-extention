/**
 * Communication protocol between Dashboard, Background Service Worker, and Content Script
 */

export type MessageAction =
  // WhatsApp Session & Connection
  | 'PING'
  | 'PONG'
  | 'CHECK_WHATSAPP_STATUS'
  | 'WHATSAPP_STATUS_RESPONSE'
  // Chat Discovery
  | 'START_CHAT_DISCOVERY'
  | 'STOP_CHAT_DISCOVERY'
  | 'CHAT_DISCOVERED'
  | 'DISCOVERY_PROGRESS'
  | 'DISCOVERY_COMPLETED'
  // Message & Media Extraction
  | 'EXTRACT_CHAT_REQUEST'
  | 'EXTRACT_CHAT_PROGRESS'
  | 'EXTRACT_CHAT_RESULT'
  | 'STOP_EXTRACTION'
  // Export Control
  | 'START_BULK_EXPORT'
  | 'PAUSE_EXPORT'
  | 'RESUME_EXPORT'
  | 'STOP_EXPORT'
  | 'EXPORT_PROGRESS_UPDATE'
  // Tab Management
  | 'OPEN_WHATSAPP_TAB'
  | 'OPEN_DASHBOARD_TAB'
  // Storage
  | 'CLEAR_ALL_DATA';

export interface WhatsAppSessionStatus {
  isWhatsAppOpen: boolean;
  tabId?: number;
  isAuthenticated: boolean;
  userPhone?: string;
  userName?: string;
  isBusinessAccount?: boolean;
  activeChatId?: string;
  pageReady: boolean;
}

export interface ExtensionMessage<T = unknown> {
  action: MessageAction;
  payload?: T;
  timestamp: number;
}
