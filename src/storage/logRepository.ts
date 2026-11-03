import { db } from './db';
import { AppLog } from '../types';

export const logRepository = {
  async addLog(level: 'info' | 'warn' | 'error' | 'success', message: string, chatId?: string, details?: unknown): Promise<void> {
    try {
      await db.logs.add({
        timestamp: new Date().toISOString(),
        level,
        message,
        chatId,
        details: details ? JSON.parse(JSON.stringify(details)) : undefined,
      });
    } catch {
      // Fallback silently if logging fails
      console.warn(`[Log] ${level}: ${message}`);
    }
  },

  async getRecentLogs(limit = 100): Promise<AppLog[]> {
    return await db.logs.orderBy('id').reverse().limit(limit).toArray();
  },

  async clearLogs(): Promise<void> {
    await db.logs.clear();
  }
};
