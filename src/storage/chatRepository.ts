import { db } from './db';
import { ChatContact, ChatExportStatus } from '../types';

export const chatRepository = {
  /**
   * Save or update a single chat
   */
  async upsertChat(chat: ChatContact): Promise<string> {
    await db.chats.put({
      ...chat,
      updatedAt: new Date().toISOString(),
    });
    return chat.chatId;
  },

  /**
   * Bulk save or update discovered chats
   */
  async upsertChats(chats: ChatContact[]): Promise<void> {
    const now = new Date().toISOString();
    const chatsToSave = chats.map(c => ({
      ...c,
      updatedAt: now,
    }));
    await db.chats.bulkPut(chatsToSave);
  },

  /**
   * Get chat by chatId
   */
  async getChat(chatId: string): Promise<ChatContact | undefined> {
    return await db.chats.get(chatId);
  },

  /**
   * List all chats with optional filters
   */
  async listChats(options?: {
    search?: string;
    chatType?: 'individual' | 'group' | 'all';
    status?: ChatExportStatus | 'all';
    onlySelected?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ chats: ChatContact[]; total: number }> {
    let collection = db.chats.toCollection();

    let allChats = await collection.toArray();

    // In-memory filtering for flexible search across name, phone, chatId
    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      allChats = allChats.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          (c.phoneNumber && c.phoneNumber.includes(q)) ||
          c.chatId.toLowerCase().includes(q)
      );
    }

    if (options?.chatType && options.chatType !== 'all') {
      allChats = allChats.filter(c => c.chatType === options.chatType);
    }

    if (options?.status && options.status !== 'all') {
      allChats = allChats.filter(c => c.status === options.status);
    }

    if (options?.onlySelected) {
      allChats = allChats.filter(c => c.isSelected);
    }

    const total = allChats.length;

    // Sorting: prioritize recently active chats
    allChats.sort((a, b) => {
      const dateA = a.lastMessageTimestamp ? new Date(a.lastMessageTimestamp).getTime() : 0;
      const dateB = b.lastMessageTimestamp ? new Date(b.lastMessageTimestamp).getTime() : 0;
      return dateB - dateA;
    });

    if (options?.offset !== undefined && options?.limit !== undefined) {
      allChats = allChats.slice(options.offset, options.offset + options.limit);
    } else if (options?.limit !== undefined) {
      allChats = allChats.slice(0, options.limit);
    }

    return { chats: allChats, total };
  },

  /**
   * Update chat export status and counts
   */
  async updateChatStatus(
    chatId: string, 
    status: ChatExportStatus, 
    extra?: { 
      extractedMessagesCount?: number; 
      extractedMediaCount?: number; 
      lastError?: string 
    }
  ): Promise<void> {
    const updateData: Partial<ChatContact> = {
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    };
    await db.chats.update(chatId, updateData);
  },

  /**
   * Set selection for a single chat or all chats
   */
  async setChatSelection(chatId: string, isSelected: boolean): Promise<void> {
    await db.chats.update(chatId, { isSelected });
  },

  async setAllChatsSelection(isSelected: boolean, chatType?: 'individual' | 'group'): Promise<void> {
    await db.transaction('rw', db.chats, async () => {
      let chats = await db.chats.toArray();
      if (chatType) {
        chats = chats.filter(c => c.chatType === chatType);
      }
      for (const chat of chats) {
        await db.chats.update(chat.chatId, { isSelected });
      }
    });
  },

  /**
   * Get counts and stats for overview cards
   */
  async getStats() {
    const all = await db.chats.toArray();
    const totalDiscovered = all.length;
    const selected = all.filter(c => c.isSelected).length;
    const completed = all.filter(c => c.status === 'completed').length;
    const partial = all.filter(c => c.status === 'partial').length;
    const failed = all.filter(c => c.status === 'failed').length;
    const queued = all.filter(c => c.status === 'queued').length;
    const inProgress = all.filter(
      c => c.status === 'extracting_messages' || c.status === 'extracting_media'
    ).length;

    let totalMessages = 0;
    let totalMedia = 0;
    for (const c of all) {
      totalMessages += c.extractedMessagesCount || 0;
      totalMedia += c.extractedMediaCount || 0;
    }

    return {
      totalDiscovered,
      selected,
      completed,
      partial,
      failed,
      queued,
      inProgress,
      processed: completed + partial + failed,
      totalMessages,
      totalMedia,
    };
  },

  /**
   * Delete a chat and its messages
   */
  async deleteChat(chatId: string): Promise<void> {
    await db.transaction('rw', [db.chats, db.messages, db.media], async () => {
      await db.chats.delete(chatId);
      await db.messages.where('chatId').equals(chatId).delete();
      await db.media.where('chatId').equals(chatId).delete();
    });
  },

  /**
   * Reset all chat statuses to 'discovered' (for retry)
   */
  async resetFailedChats(): Promise<number> {
    const failed = await db.chats.where('status').equals('failed').toArray();
    for (const c of failed) {
      await db.chats.update(c.chatId, { status: 'queued', lastError: undefined });
    }
    return failed.length;
  },

  /**
   * Clear all chats and related data
   */
  async clearAll(): Promise<void> {
    await db.chats.clear();
  }
};
