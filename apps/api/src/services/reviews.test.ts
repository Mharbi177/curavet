import { describe, expect, it } from 'vitest';
import { parseRatingToken } from './reviews';

describe('parseRatingToken — Phase 4.6 review capture', () => {
  it('parses a bare digit', () => {
    expect(parseRatingToken('5')).toBe(5);
    expect(parseRatingToken('  1  ')).toBe(1);
  });

  it('parses a digit inside a sentence', () => {
    expect(parseRatingToken('it was a 4 out of 5')).toBe(4);
    expect(parseRatingToken('rating: 3')).toBe(3);
  });

  it('handles Arabic-Indic digits', () => {
    expect(parseRatingToken('٥')).toBe(5);
    expect(parseRatingToken('٣')).toBe(3);
  });

  it('rejects out-of-range values', () => {
    expect(parseRatingToken('0')).toBeNull();
    expect(parseRatingToken('6')).toBeNull();
    expect(parseRatingToken('10')).toBeNull();
  });

  it('returns null when no rating is present', () => {
    expect(parseRatingToken('thank you so much')).toBeNull();
    expect(parseRatingToken('')).toBeNull();
  });
});
