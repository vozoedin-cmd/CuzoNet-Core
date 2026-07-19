import { describe, expect, it } from 'vitest';

import {
  maskWhatsAppRecipient,
  normalizeWhatsAppRecipient,
} from '../../../../backend/infrastructure/notifications/whatsapp-utils.js';

describe('whatsapp-utils', () => {
  describe('normalizeWhatsAppRecipient', () => {
    it('normalizes numbers successfully', () => {
      expect(normalizeWhatsAppRecipient('+502 5555-5555')).toBe('50255555555');
      expect(normalizeWhatsAppRecipient('50255555555')).toBe('50255555555');
      expect(normalizeWhatsAppRecipient('50255555555@s.whatsapp.net')).toBe('50255555555');
      expect(normalizeWhatsAppRecipient('(502) 5555-5555')).toBe('50255555555');
    });

    it('prepends default country code if missing and number is short', () => {
      expect(normalizeWhatsAppRecipient('55555555', '502')).toBe('50255555555');
    });

    it('rejects empty strings', () => {
      expect(() => normalizeWhatsAppRecipient('  ')).toThrow('El número de WhatsApp no puede estar vacío.');
    });

    it('rejects group JIDs', () => {
      expect(() => normalizeWhatsAppRecipient('50255555555-123456@g.us')).toThrow('No se admiten envíos a grupos.');
    });

    it('rejects unknown JID domains', () => {
      expect(() => normalizeWhatsAppRecipient('50255555555@unknown.net')).toThrow('El dominio JID no es válido.');
    });

    it('rejects numbers that are too short', () => {
      expect(() => normalizeWhatsAppRecipient('1234')).toThrow('El número es demasiado corto.');
    });

    it('rejects numbers that are too long', () => {
      expect(() => normalizeWhatsAppRecipient('12345678901234567')).toThrow('El número es demasiado largo.');
    });
  });

  describe('maskWhatsAppRecipient', () => {
    it('masks valid numbers', () => {
      expect(maskWhatsAppRecipient('50255555555')).toBe('502*****555');
    });

    it('masks short or invalid numbers with asterisks', () => {
      expect(maskWhatsAppRecipient('1234')).toBe('***');
      expect(maskWhatsAppRecipient('invalid')).toBe('***');
    });
  });
});
