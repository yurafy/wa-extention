import { describe, it, expect } from 'vitest';
import { 
  getContactFolderPath, 
  getContactMetadataPath, 
  getContactMessagesJsonPath, 
  getContactMessagesCsvPath, 
  getRelativeMediaPath, 
  getFullMediaZipPath 
} from '../src/utils/pathBuilder';

describe('Path Builder - Section 7 Export Folder Hierarchy', () => {
  const contact = {
    chatId: '212660123456@c.us',
    name: 'Ahmed',
    phoneNumber: '+212660123456',
  };

  it('should construct the correct contact folder path', () => {
    const folder = getContactFolderPath(contact);
    expect(folder).toBe('WhatsApp-Business-Export/contacts/212660123456_Ahmed');
  });

  it('should construct contact.json path', () => {
    const metaPath = getContactMetadataPath(contact);
    expect(metaPath).toBe('WhatsApp-Business-Export/contacts/212660123456_Ahmed/contact.json');
  });

  it('should construct messages.json path', () => {
    const jsonPath = getContactMessagesJsonPath(contact);
    expect(jsonPath).toBe('WhatsApp-Business-Export/contacts/212660123456_Ahmed/messages.json');
  });

  it('should construct messages.csv path', () => {
    const csvPath = getContactMessagesCsvPath(contact);
    expect(csvPath).toBe('WhatsApp-Business-Export/contacts/212660123456_Ahmed/messages.csv');
  });

  it('should generate relative media paths matching category subfolders', () => {
    expect(getRelativeMediaPath('images', 'photo.jpg')).toBe('media/images/photo.jpg');
    expect(getRelativeMediaPath('videos', 'clip.mp4')).toBe('media/videos/clip.mp4');
    expect(getRelativeMediaPath('audio', 'voice.ogg')).toBe('media/audio/voice.ogg');
    expect(getRelativeMediaPath('documents', 'catalog.pdf')).toBe('media/documents/catalog.pdf');
    expect(getRelativeMediaPath('stickers', 'smile.webp')).toBe('media/stickers/smile.webp');
  });

  it('should construct full zip paths for media inside contact folder', () => {
    const fullPath = getFullMediaZipPath(contact, 'images', 'image_001.jpg');
    expect(fullPath).toBe('WhatsApp-Business-Export/contacts/212660123456_Ahmed/media/images/image_001.jpg');
  });
});
