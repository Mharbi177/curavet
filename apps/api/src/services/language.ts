/**
 * Supported veterinary languages for the Tunisian market.
 * French + Arabic (MSA/Derja) cover the client base; `en` is the ops default.
 */
export type SupportedLanguage = 'ar' | 'en' | 'fr';

export interface LanguageDefinition {
  code: SupportedLanguage;
  iso6393: string;
  englishName: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: Record<SupportedLanguage, LanguageDefinition> = {
  ar: { code: 'ar', iso6393: 'arb', englishName: 'Arabic (incl. Derja)', nativeName: 'العربية', dir: 'rtl' },
  en: { code: 'en', iso6393: 'eng', englishName: 'English', nativeName: 'English', dir: 'ltr' },
  fr: { code: 'fr', iso6393: 'fra', englishName: 'French', nativeName: 'Français', dir: 'ltr' },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as SupportedLanguage[];

/** Maps franc ISO-639-3 output back onto our supported set. */
const FRANC_TO_OURS: Record<string, SupportedLanguage> = {
  arb: 'ar',
  ara: 'ar',
  eng: 'en',
  fra: 'fr',
  fre: 'fr',
};

/**
 * Arabic script detection.
 * franc frequently misclassifies short Arabic strings, so we detect the
 * script directly and return Arabic without relying on statistical models.
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Tunisian Derja / Arabizi (Franco-Arabe) marker: Latin text using common
 * Arabic chat-alphabet numerals (3=a, 7=h/a, 9=q, 5=kh) or recurring Derja
 * vocables as standalone Latin words (yes/aslema, 5ouya, chwaya, randevou...).
 */
const ARABIZI_NUMERALS = /\b\S*[375]\S*\b/;
const DERJA_LATIN_MARKERS = /\b(asslema|aslema|sahit|sahha|5ouya|khoya|chwaya|chwayya|barcha|randevou|mche|min_esm|el)\b/i;
const ARABIZI_HINT = /\b(bonjour|saha|yekhi|tunis|mutah|3andi|t7eb|n7eb|bekri|yhors?)\b/i;

function looksLikeArabizi(text: string): boolean {
  const hasArabicScript = ARABIC_SCRIPT.test(text);
  if (hasArabicScript) return false; // script already handled elsewhere
  // Latin text where digits appear inside "words" (chat-alphabet numerals).
  if (ARABIZI_NUMERALS.test(text) && DERJA_LATIN_MARKERS.test(text)) return true;
  // Pure Latin Derja words ("chwaya barcha", "aslema", ...).
  return DERJA_LATIN_MARKERS.test(text) || ARABIZI_HINT.test(text);
}

/**
 * franc v6 ships as an ES module only, so this CommonJS API must load it
 * lazily via dynamic import. Cached so the first message pays the cost once.
 */
type FrancFn = (value: string, options?: { minLength?: number }) => string;

let francLoader: Promise<FrancFn> | null = null;

async function loadFranc(): Promise<FrancFn> {
  if (!francLoader) {
    francLoader = import('franc').then((mod) => {
      const fn = (mod as unknown as { franc?: unknown }).franc ?? mod;
      return fn as unknown as FrancFn;
    });
  }
  try {
    return await francLoader;
  } catch (error) {
    console.warn('[language] franc failed to load; falling back to tenant default.', error);
    return () => 'und';
  }
}

export interface DetectionResult {
  language: SupportedLanguage;
  confidence: 'high' | 'low';
  detectedIso: string;
}

/**
 * Detect the language of an inbound client message.
 *
 * `allowed` restricts the result to languages the tenant actually supports, so a
 * French-speaking client of an Arabic/French clinic gracefully falls back to the
 * tenant default instead of an unsupported locale. Arabizi (Franco-Arabe) is
 * normalized to Arabic so the LLM answers in real Arabic script it can read —
 * or French when the tenant only supports fr.
 */
export async function detectLanguage(
  text: string,
  allowed: SupportedLanguage[] = ['ar', 'fr'],
  fallback: SupportedLanguage = 'fr'
): Promise<DetectionResult> {
  const allowedSet = allowed.length > 0 ? allowed : (['fr'] as SupportedLanguage[]);
  const clean = (text || '').trim();

  if (clean.length < 3) {
    return { language: allowedSet.includes(fallback) ? fallback : allowedSet[0], confidence: 'low', detectedIso: 'und' };
  }

  // Script-based detection first — far more reliable than statistical models on short text.
  if (ARABIC_SCRIPT.test(clean)) {
    if (allowedSet.includes('ar')) {
      return { language: 'ar', confidence: 'high', detectedIso: 'arb' };
    }
    return { language: allowedSet.includes(fallback) ? fallback : allowedSet[0], confidence: 'high', detectedIso: 'arb' };
  }

  // Derja written in Latin script / Arabizi → treat as the leaning language.
  const arabiziAsArabic = allowedSet.includes('ar') && looksLikeArabizi(clean);
  if (arabiziAsArabic) {
    return { language: 'ar', confidence: 'high', detectedIso: 'arabizi' };
  }

  const franc = await loadFranc();
  const iso = franc(clean, { minLength: 3 });
  const mapped = FRANC_TO_OURS[iso];

  if (mapped && allowedSet.includes(mapped)) {
    return { language: mapped, confidence: clean.length > 20 ? 'high' : 'low', detectedIso: iso };
  }

  if (mapped) {
    // Detected a real language the tenant does not support.
    return { language: allowedSet.includes(fallback) ? fallback : allowedSet[0], confidence: 'low', detectedIso: iso };
  }

  return { language: allowedSet.includes(fallback) ? fallback : allowedSet[0], confidence: 'low', detectedIso: 'und' };
}

/**
 * Build the human-readable instruction block telling the LLM which languages to
 * handle and which one to answer in right now.
 */
export function languageInstruction(allowed: SupportedLanguage[], active: SupportedLanguage): string {
  const names = allowed.map((code) => `${LANGUAGES[code].englishName} (${LANGUAGES[code].nativeName})`);
  const activeDef = LANGUAGES[active];

  return [
    `Supported languages for this veterinary clinic: ${names.join(', ')}.`,
    `The client's latest message is in ${activeDef.englishName}. Reply in ${activeDef.englishName}.`,
    allowed.includes('ar')
      ? 'For Arabic replies: Modern Standard Arabic, warm and courteous. If the client writes in Tunisian Derja (تونسي) or Arabizi (Latin chat-alphabet like 3, 7, 9, 5), you may answer in Tunisian Derja and politely switch script when it helps comprehension.'
      : '',
    allowed.includes('fr') && active !== 'fr' ? 'For French replies use polite, professional register (vous).' : '',
    activeDef.dir === 'rtl' ? 'This language is right-to-left; keep formatting simple for WhatsApp.' : '',
    'If the client switches language mid-conversation, switch with them — Derja ↔ French mixing (Franco-Arabe) is natural in Tunisia.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const DEFAULT_SUPPORTED_LANGUAGES: SupportedLanguage[] = ['fr', 'ar'];
