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
        await new Promise(r => setTimeout(r, 500));
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
      this.notifyProgress();

      // Gentle throttle between chats (800ms)
      await new Promise(r => setTimeout(r, 800));
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
      await logRepository.addLog('info', `Opening chat "${chat.name}"...`, chat.chatId);

      // Send extraction request to WhatsApp Web tab
      const response = await this.sendExtractionRequestToWhatsApp(chat);

      if (!response || !response.success) {
        throw new Error(response?.error || 'No response from WhatsApp Web tab');
      }

      const rawMessages = response.messages || [];
      const resolvedPhone = response.resolvedPhone;

      // Update phone number if it was just resolved from the chat view
      if (resolvedPhone && !chat.phoneNumber) {
        chat.phoneNumber = resolvedPhone;
        await chatRepository.upsertChat(chat);
      }

      // Format messages
      const formattedMessages: MessageRecord[] = rawMessages.map((m: any) => ({
        id: m.id,
        chatId: chat.chatId,
        timestamp: m.timestamp,
        sender: m.sender,
        type: m.type,
        text: m.text,
        mediaPath: m.mediaFileName ? `media/${m.type}s/${m.mediaFileName}` : null,
        deliveryStatus: m.deliveryStatus,
        createdAt: new Date().toISOString(),
      }));

      // Store messages
      await messageRepository.saveMessages(formattedMessages);

      // Extract and save media blobs
      let savedMediaCount = 0;
      for (const m of rawMessages) {
        if (m.mediaBlobUrl) {
          try {
            const blob = await this.fetchBlob(m.mediaBlobUrl);
            if (blob) {
              const mediaRecord: MediaBlobRecord = {
                id: `media_${m.id}`,
                messageId: m.id,
                chatId: chat.chatId,
                category: m.type === 'image' ? 'images' : m.type === 'video' ? 'videos' : m.type === 'audio' ? 'audio' : 'documents',
                fileName: m.mediaFileName || `media_${Date.now()}.bin`,
                mimeType: m.mediaMimeType || blob.type || 'application/octet-stream',
                sizeBytes: blob.size,
                data: blob,
                downloadedAt: new Date().toISOString(),
              };
              await messageRepository.saveMedia(mediaRecord);
              savedMediaCount++;
            }
          } catch {
            // Ignore single media download failure
          }
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

  private async fetchBlob(url: string): Promise<Blob | null> {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      // Fallback
    }
    return null;
  }

  private sendExtractionRequestToWhatsApp(chat: ChatContact): Promise<any> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            action: 'EXTRACT_CHAT_REQUEST',
            payload: { chatId: chat.chatId, contactName: chat.name },
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
          });
        }, 500);
      }
    });
  }
}

export const bulkExporter = new BulkExportEngine();
