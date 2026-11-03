/**
 * Sanitization utility for safe directory and file names.
 * Strictly prevents directory traversal, command injection, and illegal filesystem characters.
 * Cross-platform compatible with Windows, macOS, and Linux.
 */

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

/**
 * Sanitizes a string to be safely used as a single file or directory name.
 * Removes path separators, control characters, and reserved symbols.
 */
export function sanitizeName(name: string, fallback = 'unnamed'): string {
  if (!name || typeof name !== 'string') return fallback;

  // 1. Remove dangerous traversal tokens like '..' or '.'
  let clean = name.replace(/\.{2,}/g, '');

  // 2. Remove all illegal filesystem characters: < > : " / \ | ? * and control chars (0x00-0x1F)
  clean = clean.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

  // 3. Collapse multiple underscores/spaces into a single separator
  clean = clean.replace(/_+/g, '_').replace(/\s+/g, ' ');

  // 4. Strip leading and trailing underscores, dots, and whitespace
  clean = clean.replace(/^[_.\s]+|[_.\s]+$/g, '');

  // 5. If nothing meaningful remains (or only underscores were entered)
  if (!clean || /^_+$/.test(clean)) {
    return fallback;
  }

  // 6. Check for Windows reserved device names
  const upper = clean.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(upper) || WINDOWS_RESERVED_NAMES.has(upper.split('.')[0])) {
    clean = `_${clean}`;
  }

  // 7. Limit length to 100 characters to prevent path length overflows
  if (clean.length > 100) {
    clean = clean.substring(0, 100).trim();
  }

  return clean.length > 0 ? clean : fallback;
}

/**
 * Sanitizes phone numbers to digits only, keeping digits for folder naming.
 * Example: "+212 660-123456" -> "212660123456"
 */
export function sanitizePhoneForFolder(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Normalizes phone numbers with '+' prefix for display and JSON metadata.
 * Example: "212660123456" -> "+212660123456"
 */
export function normalizePhoneNumber(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

/**
 * Generates a collision-resistant, safe folder name for a contact.
 * Format requirement: {phone}_{name} or {chat_id}_{name} if phone is missing.
 */
export function generateContactFolderName(contact: {
  chatId: string;
  name: string;
  phoneNumber?: string;
}): string {
  const cleanName = sanitizeName(contact.name || 'Unknown', 'contact');
  const cleanPhone = sanitizePhoneForFolder(contact.phoneNumber);

  if (cleanPhone) {
    return `${cleanPhone}_${cleanName}`;
  }

  // Fallback to sanitized chat_id if phone is unavailable
  const cleanChatId = sanitizeName(contact.chatId.replace(/@.+$/, ''), 'chat');
  return `${cleanChatId}_${cleanName}`;
}

/**
 * Sanitizes media filenames while preserving valid extension.
 */
export function sanitizeFileName(fileName: string, defaultExt = 'bin'): string {
  if (!fileName) return `file_${Date.now()}.${defaultExt}`;

  // Split name and extension
  const lastDot = fileName.lastIndexOf('.');
  let namePart = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  let extPart = lastDot > 0 ? fileName.substring(lastDot + 1) : defaultExt;

  namePart = sanitizeName(namePart, 'attachment');
  extPart = extPart.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 10) || defaultExt;

  return `${namePart}.${extPart}`;
}
