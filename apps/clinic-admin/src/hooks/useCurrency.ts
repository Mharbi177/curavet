import { useCallback } from 'react';
import { useAuth } from './useAuth';

// TND is the clinic-market default; other zones remain supported for future
// expansion but Tunisia is the product's home market.
function getCurrencyFromTimezone(timezone: string): string {
  const map: Record<string, string> = {
    'Africa/Tunis': 'TND',
    'Asia/Dubai': 'AED',
    'Asia/Riyadh': 'SAR',
    'Asia/Qatar': 'QAR',
    'Asia/Kuwait': 'KWD',
    'Asia/Bahrain': 'BHD',
    'Asia/Muscat': 'OMR',
    'Europe/London': 'GBP',
    'Europe/Paris': 'EUR',
    'Europe/Berlin': 'EUR',
    'America/New_York': 'USD',
    'America/Los_Angeles': 'USD',
  };
  return map[timezone] || 'TND';
}

function getLocaleFromCurrency(currency: string): string {
  const map: Record<string, string> = {
    'TND': 'fr-TN',
    'AED': 'en-AE',
    'SAR': 'en-SA',
    'QAR': 'en-QA',
    'KWD': 'en-KW',
    'BHD': 'en-BH',
    'OMR': 'en-OM',
    'GBP': 'en-GB',
    'EUR': 'en-EU',
    'USD': 'en-US',
  };
  return map[currency] || 'fr-TN';
}

/**
 * Fraction digits by currency: the Tunisian dinar trades in millimes
 * (1 DT = 1000 millimes), so it renders with 3 decimals — "35,500 DT".
 */
const FRACTION_DIGITS: Record<string, number> = {
  TND: 3,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function useCurrency() {
  const { tenant } = useAuth();

  const currency = tenant?.timezone ? getCurrencyFromTimezone(tenant.timezone) : 'TND';
  const locale = getLocaleFromCurrency(currency);

  const formatCurrency = useCallback((amount: number) => {
    const digits = FRACTION_DIGITS[currency] ?? 0;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    }).format(amount);
  }, [currency, locale]);

  return { formatCurrency, currency };
}
