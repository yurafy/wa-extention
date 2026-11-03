import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/storage/db';
import { chatRepository } from '../src/storage/chatRepository';
import { messageRepository } from '../src/storage/messageRepository';
import { settingsRepository } from '../src/storage/settingsRepository';
import { ChatContact, MessageRecord } from '../src/types';

describe('Storage Layer - Dexie IndexedDB Integration', () => {
  beforeEach(async () => {
    await db.chats.clear();
    await db.messages.clear();
    await db.media.clear();
    await db.settings.clear();
  });

  it('should successfully store and retrieve a chat contact', async () => {
    const mockChat: ChatContact = {
      chatId: '212660123456@c.us',
      name: 'Ahmed Tech Solutions',
      phoneNumber: '+212660123456',
      chatType: 'individual',
      isBusiness: true,
      isSavedContact: true,
      lastMessageTimestamp: '2026-10-20T14:30:00Z',
      status: 'discovered',
      extractedMessagesCount: 0,
      extractedMediaCount: 0,
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await chatRepository.upsertChat(mockChat);
    const retrieved = await chatRepository.getChat('212660123456@c.us');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Ahmed Tech Solutions');
    expect(retrieved?.phoneNumber).toBe('+212660123456');
    expect(retrieved?.isBusiness).toBe(true);
  });

  it('should bulk upsert chats and perform search queries', async () => {
    const mockChats: ChatContact[] = [
      {
        chatId: '212660111111@c.us',
        name: 'Sara Marketing',
        phoneNumber: '+212660111111',
        chatType: 'individual',
        status: 'discovered',
        extractedMessagesCount: 0,
        extractedMediaCount: 0,
        discoveredAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
      {
        chatId: '212660222222@c.us',
        name: 'Karim Logistics',
        phoneNumber: '+212660222222',
        chatType: 'individual',
        status: 'completed',
        extractedMessagesCount: 50,
        extractedMediaCount: 4,
        discoveredAt: '2026-10-20T11:00:00Z',
        updatedAt: '2026-10-20T11:00:00Z',
      },
      {
        chatId: 'group-1234@g.us',
        name: 'VIP Business Clients Group',
        chatType: 'group',
        status: 'discovered',
        extractedMessagesCount: 0,
        extractedMediaCount: 0,
        discoveredAt: '2026-10-20T12:00:00Z',
        updatedAt: '2026-10-20T12:00:00Z',
      },
    ];

    await chatRepository.upsertChats(mockChats);

    // Search by name
    const searchByName = await chatRepository.listChats({ search: 'Sara' });
    expect(searchByName.total).toBe(1);
    expect(searchByName.chats[0].chatId).toBe('212660111111@c.us');

    // Filter by group type
    const filterGroups = await chatRepository.listChats({ chatType: 'group' });
    expect(filterGroups.total).toBe(1);
    expect(filterGroups.chats[0].name).toBe('VIP Business Clients Group');

    // Filter by status
    const filterCompleted = await chatRepository.listChats({ status: 'completed' });
    expect(filterCompleted.total).toBe(1);
    expect(filterCompleted.chats[0].name).toBe('Karim Logistics');
  });

  it('should update chat status and maintain statistics accurately', async () => {
    const mockChat: ChatContact = {
      chatId: 'test-chat-1@c.us',
      name: 'Client Alpha',
      chatType: 'individual',
      status: 'queued',
      extractedMessagesCount: 0,
      extractedMediaCount: 0,
      isSelected: true,
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await chatRepository.upsertChat(mockChat);

    await chatRepository.updateChatStatus('test-chat-1@c.us', 'completed', {
      extractedMessagesCount: 120,
      extractedMediaCount: 15,
    });

    const updated = await chatRepository.getChat('test-chat-1@c.us');
    expect(updated?.status).toBe('completed');
    expect(updated?.extractedMessagesCount).toBe(120);
    expect(updated?.extractedMediaCount).toBe(15);

    const stats = await chatRepository.getStats();
    expect(stats.totalDiscovered).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.totalMessages).toBe(120);
    expect(stats.totalMedia).toBe(15);
  });

  it('should save and retrieve chronological messages with deduplication', async () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-2',
        chatId: 'chat-abc',
        timestamp: '2026-10-20T14:32:00Z',
        sender: 'business',
        type: 'text',
        text: 'Second message',
        createdAt: '2026-10-20T14:32:00Z',
      },
      {
        id: 'msg-1',
        chatId: 'chat-abc',
        timestamp: '2026-10-20T14:30:00Z',
        sender: 'customer',
        type: 'text',
        text: 'First message',
        createdAt: '2026-10-20T14:30:00Z',
      },
      {
        id: 'msg-1', // Duplicate ID encountered
        chatId: 'chat-abc',
        timestamp: '2026-10-20T14:30:00Z',
        sender: 'customer',
        type: 'text',
        text: 'First message duplicate updated',
        createdAt: '2026-10-20T14:30:00Z',
      },
    ];

    await messageRepository.saveMessages(messages);

    const retrieved = await messageRepository.getMessagesByChatId('chat-abc');
    expect(retrieved.length).toBe(2); // msg-1 and msg-2 (deduplicated)
    expect(retrieved[0].id).toBe('msg-1');
    expect(retrieved[1].id).toBe('msg-2');
    expect(retrieved[0].text).toBe('First message duplicate updated');
  });

  it('should persist user consent and custom settings', async () => {
    expect(await settingsRepository.hasUserGivenConsent()).toBe(false);

    await settingsRepository.setUserConsent(true);
    expect(await settingsRepository.hasUserGivenConsent()).toBe(true);

    const initialSettings = await settingsRepository.getSettings();
    expect(initialSettings.maxContactsPerZip).toBe(50);

    await settingsRepository.saveSettings({ maxContactsPerZip: 100, includeVideos: false });
    const updatedSettings = await settingsRepository.getSettings();
    expect(updatedSettings.maxContactsPerZip).toBe(100);
    expect(updatedSettings.includeVideos).toBe(false);
  });
});
