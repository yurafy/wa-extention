import { describe, it, expect } from 'vitest';
import { escapeCsvField, formatContactsCsv, formatMessagesCsv } from '../src/utils/csv';
import { ChatContact, MessageRecord } from '../src/types';

describe('CSV Formatter RFC 4180 Compliance', () => {
  it('should properly escape fields containing commas, quotes, and newlines', () => {
    expect(escapeCsvField('normal text')).toBe('normal text');
    expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    expect(escapeCsvField('say "hello" now')).toBe('"say ""hello"" now"');
    expect(escapeCsvField("line 1\nline 2")).toBe("\"line 1\nline 2\"");
  });

  it('should format contacts CSV correctly', () => {
    const mockContacts: ChatContact[] = [
      {
        chatId: 'chat_01',
        name: 'Ahmed, Pro Supplier',
        phoneNumber: '+212660123456',
        chatType: 'individual',
        isBusiness: true,
        extractedMessagesCount: 50,
        extractedMediaCount: 4,
        lastMessageTimestamp: '2026-10-20T14:30:00Z',
        status: 'completed',
        discoveredAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T14:30:00Z',
      },
    ];

    const csv = formatContactsCsv(mockContacts);
    expect(csv).toContain('chat_id,name,phone,chat_type,is_business,total_messages,total_media,last_message_date,export_status');
    expect(csv).toContain('"Ahmed, Pro Supplier"');
    expect(csv).toContain('+212660123456');
    expect(csv).toContain('completed');
  });

  it('should format messages CSV correctly', () => {
    const mockMessages: MessageRecord[] = [
      {
        id: 'msg_001',
        chatId: 'chat_01',
        timestamp: '2026-10-20T14:30:00Z',
        sender: 'customer',
        type: 'text',
        text: 'Salam, bghit ncommandi\nproduit A',
        mediaPath: null,
        deliveryStatus: 'read',
        isEdited: false,
        createdAt: '2026-10-20T14:30:00Z',
      },
      {
        id: 'msg_002',
        chatId: 'chat_01',
        timestamp: '2026-10-20T14:32:00Z',
        sender: 'business',
        type: 'image',
        text: 'Voici le produit "Special"',
        mediaPath: 'media/images/image_001.jpg',
        deliveryStatus: 'read',
        isEdited: false,
        createdAt: '2026-10-20T14:32:00Z',
      },
    ];

    const csv = formatMessagesCsv(mockMessages);
    expect(csv).toContain('id,chat_id,timestamp,sender,type,text,media_path,delivery_status,is_edited');
    expect(csv).toContain('"Salam, bghit ncommandi\nproduit A"');
    expect(csv).toContain('"Voici le produit ""Special"""');
    expect(csv).toContain('media/images/image_001.jpg');
  });
});
