/**
 * Supported salon languages for the Gulf market.
 * Arabic + English are the originals; French, Urdu and Tagalog cover the
 * largest expatriate communities (Phase 5.2 — Multi-language AI).
 */
export type SupportedLanguage = 'ar' | 'en' | 'fr' | 'ur' | 'tl';

export interface LanguageDefinition {
  code: SupportedLanguage;
  iso6393: string;
  englishName: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: Record<SupportedLanguage, LanguageDefinition> = {
  ar: { code: 'ar', iso6393: 'arb', englishName: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  en: { code: 'en', iso6393: 'eng', englishName: 'English', nativeName: 'English', dir: 'ltr' },
  fr: { code: 'fr', iso6393: 'fra', englishName: 'French', nativeName: 'Français', dir: 'ltr' },
  ur: { code: 'ur', iso6393: 'urd', englishName: 'Urdu', nativeName: 'اردو', dir: 'rtl' },
  tl: { code: 'tl', iso6393: 'tgl', englishName: 'Tagalog', nativeName: 'Tagalog', dir: 'ltr' },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as SupportedLanguage[];

/** Maps franc ISO-639-3 output back onto our supported set. */
const FRANC_TO_OURS: Record<string, SupportedLanguage> = {
  arb: 'ar',
  ara: 'ar',
  eng: 'en',
  fra: 'fr',
  fre: 'fr',
  urd: 'ur',
  tgl: 'tl',
  fil: 'tl',
};

/**
 * Arabic script detection.
 * franc frequently misclassifies short Arabic/Urdu strings, so we detect the
 * script directly and let the caller disambiguate Arabic vs Urdu by tenant config.
 */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const URDU_MARKERS = /[\u0679\u067E\u0686\u0688\u0691\u06BA\u06BE\u06C1\u06D2\u06CC]/;

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
 * French-speaking client of an Arabic/English salon gracefully falls back to the
 * tenant default instead of an unsupported locale.
 */
export async function detectLanguage(
  text: string,
  allowed: SupportedLanguage[] = ['ar', 'en', 'fr', 'ur', 'tl'],
  fallback: SupportedLanguage = 'en'
): Promise<DetectionResult> {
  const allowedSet = allowed.length > 0 ? allowed : (['en'] as SupportedLanguage[]);
  const clean = (text || '').trim();

  if (clean.length < 3) {
    return { language: allowedSet.includes(fallback) ? fallback : allowedSet[0], confidence: 'low', detectedIso: 'und' };
  }

  // Script-based detection first — far more reliable than statistical models on short text.
  if (ARABIC_SCRIPT.test(clean)) {
    const looksUrdu = URDU_MARKERS.test(clean);
    const candidate: SupportedLanguage = looksUrdu ? 'ur' : 'ar';
    if (allowedSet.includes(candidate)) {
      return { language: candidate, confidence: 'high', detectedIso: candidate === 'ur' ? 'urd' : 'arb' };
    }
    const arabicFallback = allowedSet.includes('ar') ? 'ar' : allowedSet[0];
    return { language: arabicFallback, confidence: 'high', detectedIso: 'arb' };
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
    `Supported languages for this salon: ${names.join(', ')}.`,
    `The client's latest message is in ${activeDef.englishName}. Reply in ${activeDef.englishName}.`,
    allowed.includes('ar') ? 'For Arabic replies use Modern Standard Arabic, warm and courteous.' : '',
    activeDef.dir === 'rtl' ? 'This language is right-to-left; keep formatting simple for WhatsApp.' : '',
    'If the client switches language mid-conversation, switch with them.',
  ]
    .filter(Boolean)
    .join('\n');
}

export const DEFAULT_SUPPORTED_LANGUAGES: SupportedLanguage[] = ['ar', 'en'];
