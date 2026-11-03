/**
 * Bulk Processing & Extraction Engine
 * Sequentially coordinates chat message extraction, media retrieval,
 * and status updates across 2,000+ conversations with pause/resume support.
 */

import { chatRepository } from '../storage/chatRepository';
import { messageRepository } from '../storage/messageRepository';
import { logRepository } from '../storage/logRepository';
import { exportService } from './exportService';
import { ChatContact, MessageRecord, MediaBlobRecord } from '../types';

export type ProcessState = 'idle' | 'running' | 'paused' | 'stopped';

function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const parts = base64Data.split(',');
  const rawBase64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(rawBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

class BulkExportEngine {
  private state: ProcessState = 'idle';
  private shouldStop = false;
  private currentChatIndex = 0;
  private targetChats: ChatContact[] = [];
  private onProgressCallback?: (processed: number, total: number, state: ProcessState) => void;

  getState(): ProcessState {
    return this.state;
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }

  isStopped(): boolean {
    return this.shouldStop;
  }

  /**
   * Start or resume bulk export for given chats
   */
  async startExport(
    chats: ChatContact[],
    onProgress?: (processed: number, total: number, state: ProcessState) => void
  ): Promise<void> {
    if (this.state === 'running') return;

    this.state = 'running';
    this.shouldStop = false;
    this.targetChats = chats;
    this.onProgressCallback = onProgress;

    await logRepository.addLog('info', `Starting extraction for ${chats.length} conversations...`);

    for (let i = this.currentChatIndex; i < this.targetChats.length; i++) {
      if (this.isStopped()) {
        this.state = 'stopped';
        this.currentChatIndex = 0;
        await logRepository.addLog('warn', 'Extraction process stopped by user.');
        this.notifyProgress();
        return;
      }

      while (this.isPaused()) {
        await new Promise(r => setTimeout(r, 100));
        if (this.isStopped()) {
          this.state = 'stopped';
          this.currentChatIndex = 0;
          this.notifyProgress();
          return;
        }
      }

      this.currentChatIndex = i;
      const chat = this.targetChats[i];
      await this.extractSingleChat(chat);

      if (this.isStopped()) {
        this.state = 'stopped';
        this.currentChatIndex = 0;
        this.notifyProgress();
        return;
      }

      this.notifyProgress();

      // Gentle throttle between chats (250ms)
      await new Promise(r => setTimeout(r, 250));
    }

    this.state = 'idle';
    this.currentChatIndex = 0;
    await logRepository.addLog('success', `Completed extraction of all ${this.targetChats.length} conversations! Creating ZIP download...`);
    this.notifyProgress();

    // Auto-trigger ZIP download upon completion
    try {
      await exportService.buildAndDownloadZip(false);
    } catch (err: any) {
      await logRepository.addLog('error', `Failed to build ZIP export: ${err?.message || err}`);
    }
  }

  /**
   * Extract messages and media for one conversation
   */
  async extractSingleChat(chat: ChatContact): Promise<void> {
    try {
      await chatRepository.updateChatStatus(chat.chatId, 'extracting_messages');
      await logRepository.addLog('info', `Extracting messages for "${chat.name}"...`, chat.chatId);

      // Send extraction request to WhatsApp Web content script
      const response = await this.sendExtractionRequestToWhatsApp(chat);

      if (!response || !response.success) {
        throw new Error(response?.error || 'No response from WhatsApp Web tab');
      }

      const rawMessages = response.messages || [];
      const mediaFiles = response.mediaFiles || [];
      const resolvedPhone = response.resolvedPhone;

      // Update phone number if resolved
      if (resolvedPhone) {
        chat.phoneNumber = resolvedPhone;
        await chatRepository.upsertChat(chat);
      }

      // Format messages
      const formattedMessages: MessageRecord[] = rawMessages.map((m: any) => ({
        id: m.id,
        chatId: chat.chatId,
        timestamp: m.timestamp || new Date().toISOString(),
        sender: m.sender || 'customer',
        type: m.type || 'text',
        text: m.text || '',
        mediaPath: m.mediaPath || null,
        deliveryStatus: m.deliveryStatus,
        createdAt: new Date().toISOString(),
      }));

      // Store messages in IndexedDB
      if (formattedMessages.length > 0) {
        await messageRepository.saveMessages(formattedMessages);
      }

      // Store media files in IndexedDB
      let savedMediaCount = 0;
      for (const mf of mediaFiles) {
        try {
          const blob = base64ToBlob(mf.dataBase64, mf.mimeType);
          const mediaRecord: MediaBlobRecord = {
            id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            messageId: chat.chatId,
            chatId: chat.chatId,
            category: mf.category || 'images',
            fileName: mf.fileName,
            mimeType: mf.mimeType,
            sizeBytes: blob.size,
            data: blob,
            downloadedAt: new Date().toISOString(),
          };
          await messageRepository.saveMedia(mediaRecord);
          savedMediaCount++;
        } catch {
          // Ignore individual media save failure
        }
      }

      await chatRepository.updateChatStatus(chat.chatId, 'completed', {
        extractedMessagesCount: formattedMessages.length,
        extractedMediaCount: savedMediaCount,
      });

      await logRepository.addLog(
        'success',
        `Extracted ${formattedMessages.length} messages & ${savedMediaCount} media files for "${chat.name}"`,
        chat.chatId
      );
    } catch (err: any) {
      await chatRepository.updateChatStatus(chat.chatId, 'failed', {
        lastError: err?.message || String(err),
      });
      await logRepository.addLog('error', `Failed extracting "${chat.name}": ${err?.message}`, chat.chatId);
    }
  }

  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      this.notifyProgress();
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
      this.notifyProgress();
    }
  }

  stop(): void {
    this.shouldStop = true;
    this.state = 'stopped';
    this.notifyProgress();
  }

  private notifyProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback(this.currentChatIndex + 1, this.targetChats.length, this.state);
    }
  }

  private sendExtractionRequestToWhatsApp(chat: ChatContact): Promise<any> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            action: 'EXTRACT_CHAT_REQUEST',
            payload: {
              chatId: chat.chatId,
              contactName: chat.name,
              phoneNumber: chat.phoneNumber,
            },
            timestamp: Date.now(),
          },
          (response) => {
            resolve(response);
          }
        );
      } else {
        // Fallback for mock test
        setTimeout(() => {
          resolve({
            success: true,
            messages: [
              {
                id: `mock_${Date.now()}`,
                timestamp: new Date().toISOString(),
                sender: 'customer',
                type: 'text',
                text: 'Sample extracted conversation message',
              }
            ],
            mediaFiles: [],
          });
        }, 500);
      }
    });
  }
}

export const bulkExporter = new BulkExportEngine();
