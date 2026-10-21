import { prisma } from '../lib/prisma';

export interface RatingAggregate {
  averageRating: number;
  totalReviews: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/**
 * Phase 4.6 — Review / feedback collection.
 */
/**
 * Normalise Arabic-Indic (٠-٩) and Eastern Arabic-Persian (۰-۹) numerals to ASCII.
 * A Gulf salon will absolutely receive "٥" rather than "5", so the review
 * parser has to understand both before it looks for a rating.
 */
function normaliseDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Parse a 1-5 rating out of a free-text chat reply.
 * Returns null when no valid rating is present.
 */
export function parseRatingToken(text: string): number | null {
  const cleaned = normaliseDigits(text || '').trim();
  const match = cleaned.match(/(?:^|\D)([1-5])(?:\D|$)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 5 ? value : null;
}

export async function recordReview(params: {
  tenantId: string;
  bookingId?: string | null;
  clientId?: string | null;
  rating: number;
  comment?: string | null;
  source?: string;
}): Promise<{ id: string }> {
  if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
    throw new Error('Rating must be an integer between 1 and 5.');
  }

  const existing = params.bookingId
    ? await prisma.review.findUnique({ where: { bookingId: params.bookingId } })
    : null;

  if (existing) {
    const updated = await prisma.review.update({
      where: { id: existing.id },
      data: { rating: params.rating, comment: params.comment ?? existing.comment },
    });
    return { id: updated.id };
  }

  const review = await prisma.review.create({
    data: {
      tenantId: params.tenantId,
      bookingId: params.bookingId ?? null,
      clientId: params.clientId ?? null,
      rating: params.rating,
      comment: params.comment ?? null,
      source: params.source || 'whatsapp',
    },
  });

  return { id: review.id };
}

export async function ratingAggregate(tenantId: string): Promise<RatingAggregate> {
  const grouped = await prisma.review.groupBy({
    by: ['rating'],
    where: { tenantId },
    _count: { rating: true },
  });

  const distribution: RatingAggregate['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let total = 0;
  let weighted = 0;

  for (const row of grouped) {
    const key = String(row.rating) as keyof RatingAggregate['distribution'];
    if (key in distribution) {
      const count = row._count.rating;
      distribution[key] = count;
      total += count;
      weighted += row.rating * count;
    }
  }

  return {
    totalReviews: total,
    averageRating: total === 0 ? 0 : Number((weighted / total).toFixed(2)),
    distribution,
  };
}

/**
 * Ask the client for a rating once a booking is completed.
 * Returns the outbound prompt message, or null when reviews are disabled or
 * the request was already sent.
 */
export async function buildReviewRequest(params: {
  tenantId: string;
  bookingId: string;
  languageCode: string;
}): Promise<{ message: string } | null> {
  const booking = await prisma.booking.findFirst({
    where: { id: params.bookingId, tenantId: params.tenantId },
    include: { tenant: true, service: true, staff: true },
  });

  if (!booking) return null;
  if (!booking.tenant.reviewsEnabled) return null;

  const already = await prisma.review.findUnique({ where: { bookingId: booking.id } });
  if (already || booking.reviewRequested) return null;

  const isArabic = params.languageCode === 'ar';
  const message = isArabic
    ? `شكراً لزيارتك ${booking.tenant.name}! كيف كانت تجربتك اليوم مع ${booking.staff.name}؟\n\nأرسلي رقماً من ١ إلى ٥ (٥ = ممتاز جداً).`
    : `Thank you for visiting ${booking.tenant.name}! How was your ${booking.service.nameEn} with ${booking.staff.name} today?\n\nReply with a number from 1 to 5 (5 = excellent).`;

  await prisma.booking.update({ where: { id: booking.id }, data: { reviewRequested: true } });

  return { message };
}
