import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatDate, formatTime, formatDateTime, getInitials } from './utils';

describe('salon-admin utils', () => {
  describe('cn', () => {
    it('merges tailwind class names properly', () => {
      expect(cn('px-2 py-1', 'bg-blue-500')).toBe('px-2 py-1 bg-blue-500');
      expect(cn('p-4', 'p-2')).toBe('p-2');
    });
  });

  describe('formatCurrency', () => {
    it('formats AED correctly by default', () => {
      const formatted = formatCurrency(150);
      expect(formatted).toContain('150');
      expect(formatted).toContain('AED');
    });
  });

  describe('formatDate', () => {
    it('returns placeholder on null or undefined or invalid', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('not-a-date')).toBe('—');
    });

    it('formats valid dates', () => {
      const res = formatDate('2026-09-26T12:00:00Z');
      expect(res).toContain('2026');
      expect(res).toContain('Sep');
    });
  });

  describe('formatTime', () => {
    it('returns placeholder on null or invalid', () => {
      expect(formatTime(null)).toBe('—');
      expect(formatTime('invalid')).toBe('—');
    });

    it('formats valid time', () => {
      const res = formatTime('2026-09-26T14:30:00Z');
      expect(res).not.toBe('—');
    });
  });

  describe('formatDateTime', () => {
    it('returns placeholder on null', () => {
      expect(formatDateTime(null)).toBe('—');
    });
  });

  describe('getInitials', () => {
    it('handles empty or missing names', () => {
      expect(getInitials(null)).toBe('?');
      expect(getInitials('')).toBe('?');
      expect(getInitials('   ')).toBe('?');
    });

    it('returns initials for full name', () => {
      expect(getInitials('Sarah Connor')).toBe('SC');
      expect(getInitials('Madonna')).toBe('M');
    });
  });
});
