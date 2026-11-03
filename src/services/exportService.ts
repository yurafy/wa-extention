/**
 * Export Packaging Service
 * Strictly adheres to the Section 7 Export Folder Structure and creates downloadable ZIP archives.
 */

import JSZip from 'jszip';
import { chatRepository } from '../storage/chatRepository';
import { messageRepository } from '../storage/messageRepository';
import { settingsRepository } from '../storage/settingsRepository';
import { formatContactsCsv, formatMessagesCsv } from '../utils/csv';
import { 
  generateContactFolderName, 
  sanitizeFileName 
} from '../utils/sanitizer';
import { ChatContact, MessageRecord } from '../types';

export interface ExportResult {
  success: boolean;
  totalZips: number;
  totalContacts: number;
  totalMessages: number;
  totalMedia: number;
  error?: string;
}

export const exportService = {
  /**
   * Generates and triggers download of ZIP file(s) for the exported conversations
   */
  async buildAndDownloadZip(selectedOnly = false): Promise<ExportResult> {
    const settings = await settingsRepository.getSettings();
    const allChatsResult = await chatRepository.listChats({
      onlySelected: selectedOnly,
    });

    const chatsToExport = allChatsResult.chats;
    if (chatsToExport.length === 0) {
      return {
        success: false,
        totalZips: 0,
        totalContacts: 0,
        totalMessages: 0,
        totalMedia: 0,
        error: 'No chats available to export. Please scan and select conversations first.',
      };
    }

    const maxPerZip = Math.max(1, settings.maxContactsPerZip || 50);
    const chatBatches: ChatContact[][] = [];

    for (let i = 0; i < chatsToExport.length; i += maxPerZip) {
      chatBatches.push(chatsToExport.slice(i, i + maxPerZip));
    }

    let globalTotalMessages = 0;
    let globalTotalMedia = 0;
    const failedExports: any[] = [];

    // Process each batch into its own ZIP archive
    for (let batchIndex = 0; batchIndex < chatBatches.length; batchIndex++) {
      const batch = chatBatches[batchIndex];
      const zip = new JSZip();
      const rootFolder = zip.folder('WhatsApp-Business-Export') || zip;
      const contactsFolder = rootFolder.folder('contacts') || rootFolder;

      // 1. Root contacts.csv
      const contactsCsvContent = formatContactsCsv(batch);
      rootFolder.file('contacts.csv', contactsCsvContent);

      // Track batch summary
      let batchMessagesCount = 0;
      let batchMediaCount = 0;

      for (const chat of batch) {
        try {
          const folderName = generateContactFolderName(chat);
          const contactFolder = contactsFolder.folder(folderName);
          if (!contactFolder) continue;

          // Fetch messages from IndexedDB
          const messages: MessageRecord[] = await messageRepository.getMessagesByChatId(chat.chatId);
          batchMessagesCount += messages.length;
          globalTotalMessages += messages.length;

          // Fetch media from IndexedDB
          const mediaRecords = await messageRepository.getMediaByChatId(chat.chatId);
          batchMediaCount += mediaRecords.length;
          globalTotalMedia += mediaRecords.length;

          // 2. contact.json (Section 7 specification)
          const firstMsg = messages[0]?.timestamp;
          const lastMsg = messages[messages.length - 1]?.timestamp || chat.lastMessageTimestamp;
          const contactJson = {
            name: chat.name,
            phone: chat.phoneNumber || null,
            chat_id: chat.chatId,
            chat_type: chat.chatType,
            total_messages: messages.length,
            total_media: mediaRecords.length,
            first_message_date: firstMsg || null,
            last_message_date: lastMsg || null,
            export_status: chat.status === 'completed' ? 'complete' : 'partial',
          };
          contactFolder.file('contact.json', JSON.stringify(contactJson, null, 2));

          // 3. messages.json
          if (settings.exportFormat === 'json' || settings.exportFormat === 'both') {
            const formattedMessages = messages.map(m => ({
              id: m.id,
              chat_id: m.chatId,
              timestamp: m.timestamp,
              sender: m.sender,
              type: m.type,
              text: m.text,
              media_path: m.mediaPath || null,
            }));
            contactFolder.file('messages.json', JSON.stringify(formattedMessages, null, 2));
          }

          // 4. messages.csv
          if (settings.exportFormat === 'csv' || settings.exportFormat === 'both') {
            const messagesCsv = formatMessagesCsv(messages);
            contactFolder.file('messages.csv', messagesCsv);
          }

          // 5. media folder (Section 7 structure: images, videos, audio, documents, stickers)
          if (settings.includeMedia && mediaRecords.length > 0) {
            const mediaFolder = contactFolder.folder('media');
            if (mediaFolder) {
              const subFolders = {
                images: mediaFolder.folder('images'),
                videos: mediaFolder.folder('videos'),
                audio: mediaFolder.folder('audio'),
                documents: mediaFolder.folder('documents'),
                stickers: mediaFolder.folder('stickers'),
              };

              for (const media of mediaRecords) {
                const targetSub = subFolders[media.category] || mediaFolder;
                const safeName = sanitizeFileName(media.fileName);
                targetSub?.file(safeName, media.data);
              }
            }
          }
        } catch (err: any) {
          failedExports.push({
            chat_id: chat.chatId,
            name: chat.name,
            error: err?.message || String(err),
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Root export-summary.json
      const summary = {
        export_date: new Date().toISOString(),
        batch_number: batchIndex + 1,
        total_batches: chatBatches.length,
        contacts_in_batch: batch.length,
        total_messages_in_batch: batchMessagesCount,
        total_media_in_batch: batchMediaCount,
        settings_used: settings,
      };
      rootFolder.file('export-summary.json', JSON.stringify(summary, null, 2));

      // Collect failed chats from this batch
      const failedChats = batch.filter(c => c.status === 'failed');
      for (const fc of failedChats) {
        failedExports.push({
          chat_id: fc.chatId,
          name: fc.name,
          error: fc.lastError || 'Extraction incomplete or inaccessible',
          timestamp: fc.updatedAt || new Date().toISOString(),
        });
      }

      // Root failed-exports.json
      rootFolder.file('failed-exports.json', JSON.stringify(failedExports, null, 2));

      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // Filename: WhatsApp-Business-Export.zip or WhatsApp-Business-Export-Part-1.zip
      const partSuffix = chatBatches.length > 1 ? `-Part-${batchIndex + 1}` : '';
      const zipFilename = `WhatsApp-Business-Export${partSuffix}.zip`;

      // Trigger download
      await this.triggerFileDownload(zipBlob, zipFilename);
    }

    return {
      success: true,
      totalZips: chatBatches.length,
      totalContacts: chatsToExport.length,
      totalMessages: globalTotalMessages,
      totalMedia: globalTotalMedia,
    };
  },

  /**
   * Triggers download using Chrome Downloads API or direct anchor click
   */
  async triggerFileDownload(blob: Blob, filename: string): Promise<void> {
    const url = URL.createObjectURL(blob);

    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      try {
        await chrome.downloads.download({
          url,
          filename,
          saveAs: false,
        });
        return;
      } catch (err) {
        console.warn('Chrome downloads API failed, using fallback:', err);
      }
    }

    // Browser fallback
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
};
