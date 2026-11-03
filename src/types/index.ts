/**
 * Core domain types for WhatsApp Business Bulk Chat & Media Exporter
 */

export type ChatType = 'individual' | 'group' | 'broadcast' | 'unknown';

export type ChatExportStatus = 
  | 'discovered' 
  | 'queued' 
  | 'extracting_messages' 
  | 'extracting_media' 
  | 'completed' 
  | 'partial' 
  | 'failed' 
  | 'skipped';

export interface ChatContact {
  /** Unique stable internal identifier (e.g. jid or sanitized phone@c.us) */
  chatId: string;
  /** Visible contact or business name */
  name: string;
  /** International phone number if accessible (e.g. +212660123456) */
  phoneNumber?: string;
  /** Type of conversation */
  chatType: ChatType;
  /** Is this an official WhatsApp Business account / contact */
  isBusiness?: boolean;
  /** Is contact saved in user's address book */
  isSavedContact?: boolean;
  /** ISO timestamp of the last message observed */
  lastMessageTimestamp?: string;
  /** Snippet or preview text of last message */
  lastMessagePreview?: string;
  /** Number of unread messages */
  unreadCount?: number;
  /** Current export processing status */
  status: ChatExportStatus;
  /** Total messages successfully extracted */
  extractedMessagesCount: number;
  /** Total media items successfully extracted */
  extractedMediaCount: number;
  /** Error message if extraction failed */
  lastError?: string;
  /** Whether user selected this chat for export */
  isSelected?: boolean;
  /** When this chat was first discovered */
  discoveredAt: string;
  /** When this chat was last updated/processed */
  updatedAt: string;
}

export type SenderDirection = 'incoming' | 'outgoing' | 'system';

export type MessageType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'audio' 
  | 'voice' 
  | 'document' 
  | 'sticker' 
  | 'location' 
  | 'contact_card' 
  | 'revoked' 
  | 'unknown';

export interface MessageRecord {
  /** Unique message ID provided by WhatsApp Web or deterministic fallback */
  id: string;
  /** Stable conversation identifier */
  chatId: string;
  /** ISO 8601 Timestamp of message */
  timestamp: string;
  /** Sender category: incoming (customer) or outgoing (business) or system */
  sender: 'customer' | 'business' | 'system';
  /** Original sender JID/identifier if available */
  senderId?: string;
  /** Message content type */
  type: MessageType;
  /** Text content or caption */
  text: string;
  /** Relative path to media file within contact's folder (e.g. media/images/image_001.jpg) */
  mediaPath?: string | null;
  /** Optional media reference metadata */
  media?: MediaRecordReference;
  /** Reply-to message reference ID */
  replyToId?: string;
  /** Delivery status (sent, delivered, read) */
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'pending';
  /** Indicates if message was edited */
  isEdited?: boolean;
  /** Indicates if message was deleted/revoked */
  isDeleted?: boolean;
  /** When this record was stored locally */
  createdAt: string;
}

export interface MediaRecordReference {
  mediaId: string;
  category: 'images' | 'videos' | 'audio' | 'documents' | 'stickers';
  originalFileName?: string;
  savedFileName: string;
  mimeType: string;
  fileSizeBytes?: number;
  downloadStatus: 'pending' | 'downloaded' | 'failed' | 'expired';
  errorDetails?: string;
}

export interface MediaBlobRecord {
  id: string;
  messageId: string;
  chatId: string;
  category: 'images' | 'videos' | 'audio' | 'documents' | 'stickers';
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Blob;
  downloadedAt: string;
}

export interface ExportSettings {
  maxContactsPerZip: number;
  includeMedia: boolean;
  includeImages: boolean;
  includeVideos: boolean;
  includeAudio: boolean;
  includeDocuments: boolean;
  includeStickers: boolean;
  exportFormat: 'json' | 'csv' | 'both';
  includeGroupChats: boolean;
  batchSize: number;
  delayBetweenChatsMs: number;
  autoDownloadZips: boolean;
}

export interface ExportSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  totalChats: number;
  processedChats: number;
  successfulChats: number;
  failedChats: number;
  totalMessagesExtracted: number;
  totalMediaDownloaded: number;
  totalBytes: number;
  currentChatId?: string;
  currentChatName?: string;
  errorMessage?: string;
  settingsSnapshot: ExportSettings;
}

export interface AppLog {
  id?: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  chatId?: string;
  details?: unknown;
}
