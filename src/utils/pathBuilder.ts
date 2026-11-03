/**
 * Path builder strictly enforcing the Section 7 Export Folder Structure:
 *
 * WhatsApp-Business-Export/
 * ├── contacts.csv
 * ├── export-summary.json
 * ├── failed-exports.json
 * └── contacts/
 *     ├── {phone}_{name}/
 *     │   ├── contact.json
 *     │   ├── messages.json
 *     │   ├── messages.csv
 *     │   └── media/
 *     │       ├── images/
 *     │       ├── videos/
 *     │       ├── audio/
 *     │       ├── documents/
 *     │       └── stickers/
 */

import { generateContactFolderName, sanitizeFileName } from './sanitizer';
import { ChatContact } from '../types';

export const ROOT_EXPORT_DIR = 'WhatsApp-Business-Export';
export const CONTACTS_DIR = `${ROOT_EXPORT_DIR}/contacts`;

export function getContactFolderPath(contact: Pick<ChatContact, 'chatId' | 'name' | 'phoneNumber'>): string {
  const folderName = generateContactFolderName(contact);
  return `${CONTACTS_DIR}/${folderName}`;
}

export function getContactMetadataPath(contact: Pick<ChatContact, 'chatId' | 'name' | 'phoneNumber'>): string {
  return `${getContactFolderPath(contact)}/contact.json`;
}

export function getContactMessagesJsonPath(contact: Pick<ChatContact, 'chatId' | 'name' | 'phoneNumber'>): string {
  return `${getContactFolderPath(contact)}/messages.json`;
}

export function getContactMessagesCsvPath(contact: Pick<ChatContact, 'chatId' | 'name' | 'phoneNumber'>): string {
  return `${getContactFolderPath(contact)}/messages.csv`;
}

export type MediaCategory = 'images' | 'videos' | 'audio' | 'documents' | 'stickers';

/**
 * Returns the relative path of a media file inside the contact's folder.
 * Example: "media/images/image_001.jpg"
 */
export function getRelativeMediaPath(category: MediaCategory, fileName: string): string {
  const cleanFile = sanitizeFileName(fileName);
  return `media/${category}/${cleanFile}`;
}

/**
 * Returns the full ZIP path for a media file inside the contact's folder.
 * Example: "WhatsApp-Business-Export/contacts/212660123456_Ahmed/media/images/image_001.jpg"
 */
export function getFullMediaZipPath(
  contact: Pick<ChatContact, 'chatId' | 'name' | 'phoneNumber'>,
  category: MediaCategory,
  fileName: string
): string {
  const contactFolder = getContactFolderPath(contact);
  const relPath = getRelativeMediaPath(category, fileName);
  return `${contactFolder}/${relPath}`;
}
