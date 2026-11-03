import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../src/storage/db';
import { chatRepository } from '../src/storage/chatRepository';
import { messageRepository } from '../src/storage/messageRepository';
import { exportService } from '../src/services/exportService';
import { bulkExporter } from '../src/services/bulkExporter';
import JSZip from 'jszip';

describe('End-to-End Extraction & ZIP Verification with WhatsApp Mock DOM', () => {
  beforeEach(async () => {
    await db.chats.clear();
    await db.messages.clear();
    await db.media.clear();
  });

  it('should extract messages, resolve phone numbers, save media, and generate Section 7 ZIP', async () => {
    // 1. Setup mock discovered chat
    const mockChat = {
      chatId: 'name_Safwan_1826010068',
      name: 'Safwan',
      phoneNumber: undefined, // Saved contact without phone number initially
      chatType: 'individual' as const,
      status: 'discovered' as const,
      extractedMessagesCount: 0,
      extractedMediaCount: 0,
      isSelected: true,
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await chatRepository.upsertChat(mockChat);

    // 2. Simulate what chatExtractor extracts when it visits the chat in WhatsApp Web
    const sampleImageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const mockExtractedData = {
      success: true,
      resolvedPhone: '+212660123456', // Resolved via contact info drawer
      messages: [
        {
          id: 'msg_001',
          timestamp: '2026-11-01T10:00:00.000Z',
          sender: 'customer',
          type: 'text',
          text: 'Salam, bghit ncommandi l-produit',
          deliveryStatus: undefined,
        },
        {
          id: 'msg_002',
          timestamp: '2026-11-01T10:02:00.000Z',
          sender: 'business',
          type: 'image',
          text: 'Marhba, voici la photo du produit',
          mediaPath: 'media/images/image_001.jpg',
          deliveryStatus: 'read',
        },
      ],
      mediaFiles: [
        {
          fileName: 'image_001.jpg',
          category: 'images' as const,
          mimeType: 'image/jpeg',
          dataBase64: sampleImageBase64,
        },
      ],
    };

    // 3. Process the extraction through bulkExporter
    // Mock the sendExtractionRequestToWhatsApp response
    (bulkExporter as any).sendExtractionRequestToWhatsApp = async () => mockExtractedData;

    await bulkExporter.extractSingleChat(mockChat);

    // 4. Verify Database Records
    const updatedChat = await chatRepository.getChat(mockChat.chatId);
    expect(updatedChat).toBeDefined();
    expect(updatedChat?.status).toBe('completed');
    expect(updatedChat?.phoneNumber).toBe('+212660123456'); // Phone number was updated!
    expect(updatedChat?.extractedMessagesCount).toBe(2);
    expect(updatedChat?.extractedMediaCount).toBe(1);

    const savedMessages = await messageRepository.getMessagesByChatId(mockChat.chatId);
    expect(savedMessages.length).toBe(2);
    expect(savedMessages[0].text).toBe('Salam, bghit ncommandi l-produit');
    expect(savedMessages[1].mediaPath).toBe('media/images/image_001.jpg');

    const savedMedia = await messageRepository.getMediaByChatId(mockChat.chatId);
    expect(savedMedia.length).toBe(1);
    expect(savedMedia[0].fileName).toBe('image_001.jpg');
    expect(savedMedia[0].category).toBe('images');

    // 5. Build and verify the ZIP output
    let generatedZipBlob: Blob | null = null;
    let generatedZipName: string = '';

    // Mock triggerFileDownload to capture the blob
    exportService.triggerFileDownload = async (blob: Blob, filename: string) => {
      generatedZipBlob = blob;
      generatedZipName = filename;
    };

    const exportResult = await exportService.buildAndDownloadZip(false);
    expect(exportResult.success).toBe(true);
    expect(exportResult.totalContacts).toBe(1);
    expect(exportResult.totalMessages).toBe(2);
    expect(exportResult.totalMedia).toBe(1);
    expect(generatedZipBlob).not.toBeNull();
    expect(generatedZipName).toBe('WhatsApp-Business-Export.zip');

    // 6. Inspect the generated ZIP file structure
    const zipArrayBuffer = await (generatedZipBlob as unknown as Blob).arrayBuffer();
    const zip = await JSZip.loadAsync(zipArrayBuffer);

    // Verify root files
    expect(zip.file('WhatsApp-Business-Export/contacts.csv')).not.toBeNull();
    expect(zip.file('WhatsApp-Business-Export/export-summary.json')).not.toBeNull();
    expect(zip.file('WhatsApp-Business-Export/failed-exports.json')).not.toBeNull();

    // Verify contact folder name uses the resolved phone number: 212660123456_Safwan
    const contactFolderPath = 'WhatsApp-Business-Export/contacts/212660123456_Safwan';
    expect(zip.file(`${contactFolderPath}/contact.json`)).not.toBeNull();
    expect(zip.file(`${contactFolderPath}/messages.json`)).not.toBeNull();
    expect(zip.file(`${contactFolderPath}/messages.csv`)).not.toBeNull();
    expect(zip.file(`${contactFolderPath}/media/images/image_001.jpg`)).not.toBeNull();

    // Inspect contact.json content
    const contactJsonRaw = await zip.file(`${contactFolderPath}/contact.json`)?.async('string');
    const contactJson = JSON.parse(contactJsonRaw || '{}');
    expect(contactJson.name).toBe('Safwan');
    expect(contactJson.phone).toBe('+212660123456');
    expect(contactJson.total_messages).toBe(2);
    expect(contactJson.total_media).toBe(1);
    expect(contactJson.export_status).toBe('complete');

    // Inspect messages.json content
    const messagesJsonRaw = await zip.file(`${contactFolderPath}/messages.json`)?.async('string');
    const messagesJson = JSON.parse(messagesJsonRaw || '[]');
    expect(messagesJson.length).toBe(2);
    expect(messagesJson[0].sender).toBe('customer');
    expect(messagesJson[0].text).toBe('Salam, bghit ncommandi l-produit');
    expect(messagesJson[1].sender).toBe('business');
    expect(messagesJson[1].media_path).toBe('media/images/image_001.jpg');

    // Inspect messages.csv content
    const messagesCsv = await zip.file(`${contactFolderPath}/messages.csv`)?.async('string');
    expect(messagesCsv).toContain('Salam, bghit ncommandi l-produit');
    expect(messagesCsv).toContain('media/images/image_001.jpg');
  });
});
