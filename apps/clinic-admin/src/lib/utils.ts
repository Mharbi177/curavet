import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * TND trades in millimes (1 DT = 1000 millimes) — 3 fractional digits.
 */
const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  TND: 3,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function formatCurrency(amount: number, currency = 'TND'): string {
  const digits = CURRENCY_FRACTION_DIGITS[currency] ?? 0;
  return new Intl.NumberFormat(currency === 'TND' ? 'fr-TN' : 'en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(amount);
}

/**
 * Millimes conversion for payment gateways that need smallest subunits.
 * `amount * 1000` rounded to absorb float error (35.5 → 35500 millimes).
 */
export function toMillimes(amount: number, currency = 'TND'): number {
  const scale = (CURRENCY_FRACTION_DIGITS[currency] ?? 2) === 3 ? 1000 : 100;
  return Math.round(amount * scale);
}

/**
 * Date formatters.
 *
 * These accept `null | undefined` because several Prisma columns (lastContactAt,
 * sentAt, notifiedAt, …) are genuinely optional. Formatting an absent date must
 * render a placeholder, never throw — a single null used to crash the dashboard.
 */
export function formatDate(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(parsed);
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return `${formatDate(date)} at ${formatTime(date)}`;
}

/** Initials for an avatar; tolerates missing names and phone-only clients. */
export function getInitials(name: string | null | undefined): string {
  const source = (name ?? '').trim();
  if (!source) return '?';

  return source
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}