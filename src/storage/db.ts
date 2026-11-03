import Dexie, { Table } from 'dexie';
import { 
  ChatContact, 
  MessageRecord, 
  MediaBlobRecord, 
  ExportSession, 
  AppLog, 
  ExportSettings 
} from '../types';

export const DEFAULT_SETTINGS: ExportSettings = {
  maxContactsPerZip: 50,
  includeMedia: true,
  includeImages: true,
  includeVideos: true,
  includeAudio: true,
  includeDocuments: true,
  includeStickers: false,
  exportFormat: 'both',
  includeGroupChats: false,
  batchSize: 5,
  delayBetweenChatsMs: 1500,
  autoDownloadZips: true,
};

export interface StoredSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class WhatsAppExporterDB extends Dexie {
  chats!: Table<ChatContact, string>;
  messages!: Table<MessageRecord, string>;
  media!: Table<MediaBlobRecord, string>;
  exportSessions!: Table<ExportSession, string>;
  logs!: Table<AppLog, number>;
  settings!: Table<StoredSetting, string>;

  constructor() {
    super('WhatsAppBusinessExporterDB');

    // Define schema and indexes
    this.version(1).stores({
      chats: 'chatId, name, phoneNumber, chatType, status, isSelected, lastMessageTimestamp, discoveredAt',
      messages: 'id, chatId, timestamp, type, sender, [chatId+timestamp]',
      media: 'id, messageId, chatId, category, downloadedAt',
      exportSessions: 'id, startedAt, status',
      logs: '++id, timestamp, level, chatId',
      settings: 'key, updatedAt',
    });
  }
}

export const db = new WhatsAppExporterDB();
