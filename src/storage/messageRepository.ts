import { db } from './db';
import { MessageRecord, MediaBlobRecord } from '../types';

export const messageRepository = {
  /**
   * Bulk insert or update messages for a conversation
   * Automatically deduplicates by message id and ensures correct ordering
   */
  async saveMessages(messages: MessageRecord[]): Promise<number> {
    if (!messages.length) return 0;
    
    // Sort chronologically before storing
    const sorted = [...messages].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    await db.messages.bulkPut(sorted);
    return sorted.length;
  },

  /**
   * Get all messages for a specific conversation in chronological order
   */
  async getMessagesByChatId(chatId: string): Promise<MessageRecord[]> {
    const list = await db.messages.where('chatId').equals(chatId).toArray();
    return list.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },

  /**
   * Count messages for a chat
   */
  async getMessageCount(chatId: string): Promise<number> {
    return await db.messages.where('chatId').equals(chatId).count();
  },

  /**
   * Save media blob
   */
  async saveMedia(mediaRecord: MediaBlobRecord): Promise<string> {
    await db.media.put(mediaRecord);
    return mediaRecord.id;
  },

  /**
   * Get all media for a specific conversation
   */
  async getMediaByChatId(chatId: string): Promise<MediaBlobRecord[]> {
    return await db.media.where('chatId').equals(chatId).toArray();
  },

  /**
   * Delete messages and media for a chat
   */
  async clearChatData(chatId: string): Promise<void> {
    await db.transaction('rw', [db.messages, db.media], async () => {
      await db.messages.where('chatId').equals(chatId).delete();
      await db.media.where('chatId').equals(chatId).delete();
    });
  },

  /**
   * Clear all messages and media
   */
  async clearAll(): Promise<void> {
    await db.messages.clear();
    await db.media.clear();
  }
};
