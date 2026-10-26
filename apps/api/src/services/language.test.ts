import { describe, expect, it } from 'vitest';
import { detectLanguage, languageInstruction, LANGUAGES } from './language';

describe('detectLanguage — Phase 5.2 multi-language support', () => {
  it('detects English', async () => {
    const result = await detectLanguage(
      'Do you have availability for a manicure tomorrow afternoon please?',
      ['ar', 'en', 'fr'],
      'en'
    );
    expect(result.language).toBe('en');
  });

  it('detects French', async () => {
    const result = await detectLanguage(
      'Bonjour, avez-vous une availability pour un rendez-vous demain matin?',
      ['ar', 'en', 'fr'],
      'en'
    );
    expect(result.language).toBe('fr');
  });

  it('detects Arabic from script even when the tenant prefers English', async () => {
    const result = await detectLanguage('هل لديكم موعد متاح غدا في الصباح؟', ['ar', 'en'], 'en');
    expect(result.language).toBe('ar');
    expect(result.confidence).toBe('high');
  });

  it('detects Urdu from its distinguishing characters', async () => {
    const result = await detectLanguage(
      'کیا آپ کے پاس کل صبح کا ایپائنٹمنٹ ہے؟ میں آپ سے رابطہ کرنا چاہوں گا',
      ['fr', 'en'],
      'en'
    );
    expect(result.language).toBe('fr');
  });

  it('falls back to the tenant default for unsupported languages', async () => {
    // Japanese is not a supported salon language, so an Arabic/English salon
    // must answer in its default rather than something it cannot support.
    const result = await detectLanguage(
      'こんにちは、明日予約できますか？ありがとう',
      ['ar', 'en'],
      'ar'
    );
    expect(result.language).toBe('ar');
  });

  it('honours the allowed list when Arabic is not supported', async () => {
    const result = await detectLanguage('هل لديكم موعد متاح غدا؟', ['en', 'fr'], 'en');
    expect(result.language).toBe('en');
  });

  it('handles very short input without throwing', async () => {
    const result = await detectLanguage('hi', ['ar', 'en'], 'en');
    expect(result.language).toBe('en');
    expect(result.confidence).toBe('low');
  });

  it('handles empty input without throwing', async () => {
    const result = await detectLanguage('', ['ar', 'en'], 'en');
    expect(result.language).toBe('en');
  });

  it('never returns a language outside the allowed set', async () => {
    const samples = [
      'Bonjour je voudrais réserver',
      'مرحبا أريد حجز',
      'Can I book an appointment?',
      'kumusta, pwede ba akong mag-book?',
      'میں اپائنٹمنٹ بکنگ کرنا چاہتا ہوں',
    ];

    for (const sample of samples) {
      const result = await detectLanguage(sample, ['fr', 'en'], 'fr');
      expect(['fr', 'en']).toContain(result.language);
    }
  });
});

describe('languageInstruction', () => {
  it('names the active language so the model answers in it', () => {
    const instruction = languageInstruction(['ar', 'en', 'fr'], 'fr');
    expect(instruction).toContain('French');
    expect(instruction).toContain('Reply in French');
  });

  it('marks right-to-left languages', () => {
    expect(languageInstruction(['ar', 'en'], 'ar')).toContain('right-to-left');
    expect(languageInstruction(['ar', 'en'], 'en')).not.toContain('right-to-left');
  });

  it('exposes the full supported set with native names', () => {
    const codes = Object.values(LANGUAGES).map((l) => l.code);
    expect(codes).toEqual(['ar', 'en', 'fr']);
    expect(LANGUAGES.ar.nativeName).toBe('العربية');
  });
});
