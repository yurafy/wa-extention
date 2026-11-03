import { describe, it, expect } from 'vitest';
import { 
  sanitizeName, 
  sanitizePhoneForFolder, 
  normalizePhoneNumber, 
  generateContactFolderName, 
  sanitizeFileName 
} from '../src/utils/sanitizer';

describe('Sanitizer & Safety Guardrails', () => {
  describe('sanitizeName', () => {
    it('should strip path traversal attempts', () => {
      expect(sanitizeName('../../etc/passwd')).not.toContain('..');
      expect(sanitizeName('../../etc/passwd')).not.toContain('/');
      expect(sanitizeName('../../../Windows/System32')).toBe('Windows_System32');
    });

    it('should replace illegal filesystem characters with underscores', () => {
      const dangerous = 'Client: "Best" <Deal> *2026* | Test? / Sl\\ash';
      const clean = sanitizeName(dangerous);
      expect(clean).not.toMatch(/[<>:"/\\|?*]/);
      expect(clean).toBe('Client_ _Best_ _Deal_ _2026_ _ Test_ _ Sl_ash');
    });

    it('should protect against Windows reserved device names', () => {
      expect(sanitizeName('CON')).toBe('_CON');
      expect(sanitizeName('prn')).toBe('_prn');
      expect(sanitizeName('aux.txt')).toBe('_aux.txt');
      expect(sanitizeName('NUL')).toBe('_NUL');
      expect(sanitizeName('COM1')).toBe('_COM1');
      expect(sanitizeName('LPT9')).toBe('_LPT9');
    });

    it('should strip trailing dots and spaces', () => {
      expect(sanitizeName('Test Contact...   ')).toBe('Test Contact');
    });

    it('should return fallback if input is empty or invalid', () => {
      expect(sanitizeName('')).toBe('unnamed');
      expect(sanitizeName('   ')).toBe('unnamed');
      expect(sanitizeName('???***:::')).toBe('unnamed');
    });
  });

  describe('sanitizePhoneForFolder', () => {
    it('should extract digits only for safe folder naming', () => {
      expect(sanitizePhoneForFolder('+212 660-123456')).toBe('212660123456');
      expect(sanitizePhoneForFolder('(0212) 660 123 456')).toBe('0212660123456');
      expect(sanitizePhoneForFolder(undefined)).toBe('');
    });
  });

  describe('normalizePhoneNumber', () => {
    it('should format valid international phone numbers with leading plus', () => {
      expect(normalizePhoneNumber('212660123456')).toBe('+212660123456');
      expect(normalizePhoneNumber('+212 660-123456')).toBe('+212660123456');
    });
  });

  describe('generateContactFolderName', () => {
    it('should generate folder name in {phone}_{name} format when phone is available', () => {
      const folder = generateContactFolderName({
        chatId: '212660123456@c.us',
        name: 'Ahmed',
        phoneNumber: '+212660123456',
      });
      expect(folder).toBe('212660123456_Ahmed');
    });

    it('should fallback to {chat_id}_{name} when phone number is unavailable', () => {
      const folder = generateContactFolderName({
        chatId: 'client9988@c.us',
        name: 'Unknown Prospect',
        phoneNumber: undefined,
      });
      expect(folder).toBe('client9988_Unknown Prospect');
    });

    it('should protect against traversal and illegal characters in contact name', () => {
      const folder = generateContactFolderName({
        chatId: '12345@c.us',
        name: '../../Hacker/Dangerous:Name*',
        phoneNumber: '+1234567890',
      });
      expect(folder).not.toContain('..');
      expect(folder).not.toContain('/');
      expect(folder).not.toContain(':');
      expect(folder).not.toContain('*');
    });
  });

  describe('sanitizeFileName', () => {
    it('should preserve valid extensions while cleaning filename', () => {
      const clean = sanitizeFileName('invoice:2026/march.PDF');
      expect(clean).toBe('invoice_2026_march.pdf');
    });

    it('should generate safe fallback when filename is empty', () => {
      const fallback = sanitizeFileName('', 'jpg');
      expect(fallback.endsWith('.jpg')).toBe(true);
    });
  });
});
