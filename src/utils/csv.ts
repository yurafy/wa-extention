/**
 * RFC 4180 Compliant CSV Formatter
 * Correctly handles quotes, commas, newlines, and unicode strings.
 */

import { ChatContact, MessageRecord } from '../types';

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If field contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatContactsCsv(contacts: ChatContact[]): string {
  const headers = [
    'chat_id',
    'name',
    'phone',
    'chat_type',
    'is_business',
    'total_messages',
    'total_media',
    'last_message_date',
    'export_status'
  ];

  const rows = contacts.map(c => [
    escapeCsvField(c.chatId),
    escapeCsvField(c.name),
    escapeCsvField(c.phoneNumber || ''),
    escapeCsvField(c.chatType),
    escapeCsvField(c.isBusiness ? 'true' : 'false'),
    escapeCsvField(c.extractedMessagesCount || 0),
    escapeCsvField(c.extractedMediaCount || 0),
    escapeCsvField(c.lastMessageTimestamp || ''),
    escapeCsvField(c.status)
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}

export function formatMessagesCsv(messages: MessageRecord[]): string {
  const headers = [
    'id',
    'chat_id',
    'timestamp',
    'sender',
    'type',
    'text',
    'media_path',
    'delivery_status',
    'is_edited'
  ];

  const rows = messages.map(m => [
    escapeCsvField(m.id),
    escapeCsvField(m.chatId),
    escapeCsvField(m.timestamp),
    escapeCsvField(m.sender),
    escapeCsvField(m.type),
    escapeCsvField(m.text || ''),
    escapeCsvField(m.mediaPath || ''),
    escapeCsvField(m.deliveryStatus || ''),
    escapeCsvField(m.isEdited ? 'true' : 'false')
  ].join(','));

  return [headers.join(','), ...rows].join('\r\n');
}
