import { useCallback } from 'react';
import { useAuth } from './useAuth';

function getCurrencyFromTimezone(timezone: string): string {
  const map: Record<string, string> = {
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
  return map[timezone] || 'USD';
}

function getLocaleFromCurrency(currency: string): string {
  const map: Record<string, string> = {
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
  return map[currency] || 'en-US';
}

export function useCurrency() {
  const { tenant } = useAuth();
  
  const currency = tenant?.timezone ? getCurrencyFromTimezone(tenant.timezone) : 'USD';
  const locale = getLocaleFromCurrency(currency);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, [currency, locale]);

  return { formatCurrency, currency };
}
