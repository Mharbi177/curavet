import { fromZonedTime } from 'date-fns-tz';
import type { AIProvider, ConversationMessage } from './AIProvider';
import { createBooking } from '../services/booking';
import {
  DEFAULT_SUPPORTED_LANGUAGES,
  detectLanguage,
  languageInstruction,
  type SupportedLanguage,
} from '../services/language';
import { aiInteractionDuration, aiInteractionsTotal } from '../services/metrics';
import { getUpsellSuggestion } from '../services/upsell';
import { createBookingPaymentLink, isStripeEnabled } from '../services/payments';
import { prisma } from '../lib/prisma';
import { publish } from '../services/realtime';
import { trackAiInteraction } from '../services/messaging';
import { SchedulingEngine } from '../services/scheduler';
import { joinWaitlist } from '../services/waitlist';
import { parseRatingToken, recordReview } from '../services/reviews';
import { scheduleBookingReminders } from '../services/queue';
import { createProviderForTenant } from './agentFactory';

const HISTORY_LIMIT = 20;
const MAX_TOOL_ITERATIONS = 5;

/** Minimum booking value (in the booking currency) that triggers a payment link. */
const PAYMENT_THRESHOLD = 200;

export interface ProcessContext {
  clientPhone?: string;
  clientName?: string;
  /** Source channel, used for booking attribution and metrics. */
  platform?: 'whatsapp' | 'instagram' | 'web';
  conversationId?: string;
}

function safeParseArgs(raw: unknown): Record<string, any> {
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw ?? '{}'));
  } catch {
    return {};
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check available time slots for a service on a given date. Always call before offering times.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD in the clinic timezone' },
          service_id: { type: 'string', description: 'Service ID from the menu' },
        },
        required: ['date', 'service_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        'Confirm a booking. Only call this after the client has explicitly agreed to a specific date and time.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:mm in the clinic local timezone' },
          service_id: { type: 'string' },
          staff_id: { type: 'string' },
          pet_name: { type: 'string', description: 'Name of the pet/animal' },
          species: { type: 'string', description: 'Species of the pet (e.g., Dog, Cat, Bird)' },
        },
        required: ['date', 'time', 'service_id', 'staff_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'join_waitlist',
      description: 'Add the client to the waitlist when nothing is available. Use only after the client asks to be notified.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string' },
          date: { type: 'string', description: 'Preferred date YYYY-MM-DD, or "any"' },
          preferred_time_of_day: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'any'] },
        },
        required: ['service_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_review',
      description: 'Record a 1-5 star rating the client gave for a completed appointment.',
      parameters: {
        type: 'object',
        properties: {
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string' },
        },
        required: ['rating'],
      },
    },
  },
];

/**
 * The tenant-facing conversational agent.
 *
 * Responsibilities:
 *  - Enforce tool-driven, race-free bookings (never guesses availability)
 *  - Reply in the client's detected language within the tenant's supported set
 *  - Offer the waitlist when nothing is free
 *  - Attach an upsell suggestion and a payment link after a successful booking
 *  - Stay silent while a human agent has taken over the conversation
 */
export class CuraVetAgent {
  private ai: AIProvider;
  private tenantId: string;

  private constructor(ai: AIProvider, tenantId: string) {
    this.ai = ai;
    this.tenantId = tenantId;
  }

  /**
   * Build an agent bound to a tenant, using that tenant's AI model tier.
   * Returns null when no LLM credentials are configured.
   */
  static async forTenant(tenantId: string): Promise<CuraVetAgent | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { aiProvider: true, aiModel: true, aiTemperature: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) return null;

    const provider = createProviderForTenant({
      aiProvider: tenant.aiProvider,
      aiModel: tenant.aiModel,
      aiTemperature: tenant.aiTemperature,
    });

    if (!provider) return null;
    return new CuraVetAgent(provider, tenantId);
  }

  async processMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    ctx: ProcessContext = {}
  ): Promise<string> {
    const stopTimer = aiInteractionDuration.startTimer({
      tenant_id: this.tenantId,
      platform: ctx.platform ?? 'web',
    });

    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: this.tenantId },
        include: { services: { where: { isActive: true } } },
      });

      if (!tenant) throw new Error(`Tenant ${this.tenantId} not found`);

      // A human agent owns the conversation — the bot must not reply.
      if (ctx.conversationId) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: ctx.conversationId },
          select: { humanTakeover: true },
        });
        if (conversation?.humanTakeover) {
          aiInteractionsTotal.inc({ tenant_id: this.tenantId, outcome: 'skipped_takeover' });
          return '';
        }
      }

      const supported = (tenant.supportedLanguages?.length
        ? tenant.supportedLanguages
        : DEFAULT_SUPPORTED_LANGUAGES) as SupportedLanguage[];
      const fallback = (tenant.languageDefault as SupportedLanguage) || 'en';

      const history = conversationHistory.slice(-HISTORY_LIMIT);
      const detection = await detectLanguage(userMessage, supported, fallback);
      const language = detection.language;

      const servicesList = tenant.services
        .map(
          (s) => `- ${s.nameEn} / ${s.nameAr} (ID: ${s.id}, ${s.durationMinutes}min, ${s.price} ${s.currency})`
        )
        .join('\n');

      const systemPrompt = [
        `You are CuraVet, the compassionate, intelligent veterinary clinical assistant for "${tenant.name}".`,
        `Veterinary Clinic timezone: ${tenant.timezone}. Today is ${new Date().toISOString().slice(0, 10)}.`,
        tenant.welcomeMessage ? `Clinic Welcome Message: "${tenant.welcomeMessage}"` : '',
        '',
        'Service menu:',
        servicesList || '- (no services configured yet)',
        '',
        languageInstruction(supported, language),
        '',
        'Rules & Persona:',
        `1. CLINICAL EMERGENCY TRIAGE FIRST: If the pet owner reports urgent distress (e.g., difficulty breathing, ingesting poison/chocolate, seizures, collapse, bloat, or severe trauma), DO NOT BOOK A REGULAR APPOINTMENT. Instruct them to come in immediately or call the emergency veterinary hospital at ${tenant.emergencyPhone || "our emergency hotline"} without delay.`,
        `2. COMPASSIONATE VETERINARY CARE: Greet pet owners warmly and empathetically. Use pet-friendly emojis (🐾, 🩺, 🐶, 🐱, 📅). Ask for their pet's name and species/breed.`,
        '2. NEVER GUESS AVAILABILITY: Always call the `check_availability` tool before offering ANY time slots to the client.',
          '3. CLINIC APPOINTMENTS & SCHEDULE INQUIRIES: When staff, doctors, or clients ask who is scheduled, what appointments exist today or on any date, or who is the next patient, ALWAYS call the `get_schedule_and_appointments` tool immediately to look up the clinic calendar.',
        '3. GUIDE THE CLIENT: If the client asks to book but doesn\'t specify a service, date, or time, proactively ask them for the missing details.',
        '4. CONFIRM BEFORE BOOKING: Only call `book_appointment` after the client explicitly confirms the exact date and time you offered.',
        '5. WAITLIST NUDGE: If the requested date is fully booked (check_availability returns no slots), politely inform them and immediately offer to add them to the waitlist using `join_waitlist`.',
        '6. KEEP IT CONCISE: This is a chat application (WhatsApp/Instagram). Keep your messages short, scannable, and easy to read. Avoid large blocks of text.',
        '7. REVIEW HANDLING: If the client is expressing feedback or rating a past visit (e.g. "It was great, 5 stars"), immediately call `submit_review`.',
        '8. UPSELL NATURALLY: When answering questions about services, you can briefly mention what they include to sound knowledgeable.',
      ].filter(Boolean).join('\n');

      const messages: ConversationMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const bookedServiceIds: string[] = [];
      let paymentUrl: string | null = null;

      let response = await this.ai.generateResponse({ messages, tools: TOOLS as never });
      let reply = response.message;
      let iterations = 0;

      while (reply.tool_calls?.length && iterations < MAX_TOOL_ITERATIONS) {
        iterations += 1;
        messages.push(reply);

        for (const call of reply.tool_calls) {
          if (call.type !== 'function') continue;

          const name = call.function.name;
          const args = safeParseArgs(call.function.arguments);

          let result: string;
          switch (name) {
            case 'get_schedule_and_appointments':
              result = await this.getScheduleAndAppointments(args, tenant.timezone);
              break;
            case 'check_availability':
              result = await this.checkAvailability(args, tenant.timezone);
              break;
            case 'book_appointment': {
              const outcome = await this.bookAppointment(args, tenant.timezone, ctx);
              result = outcome.text;
              if (outcome.serviceId) bookedServiceIds.push(outcome.serviceId);
              if (outcome.paymentUrl) paymentUrl = outcome.paymentUrl;
              break;
            }
            case 'join_waitlist':
              result = await this.handleWaitlist(args, ctx);
              break;
            case 'submit_review':
              result = await this.handleReview(args);
              break;
            default:
              result = `Unknown tool: ${name}`;
          }

          messages.push({ role: 'tool', tool_call_id: call.id, name, content: result });
        }

        response = await this.ai.generateResponse({ messages, tools: TOOLS as never });
        reply = response.message;
      }

      let text = reply.content || 'Sorry, I had trouble with that. Could you rephrase?';

      const lastService = bookedServiceIds[bookedServiceIds.length - 1];
      if (lastService) {
        const suggestion = await getUpsellSuggestion({
          tenantId: this.tenantId,
          triggerServiceId: lastService,
          language,
          excludeServiceIds: bookedServiceIds,
        }).catch(() => null);

        if (suggestion) text += `\n\n${suggestion.message}`;
      }

      if (paymentUrl) text += `\n\n⚠️ *Deposit Required*\nYour slot is currently held. To fully confirm your booking, please pay the deposit here: ${paymentUrl}`;

      await trackAiInteraction(this.tenantId);
      aiInteractionsTotal.inc({ tenant_id: this.tenantId, outcome: 'success' });

      if (ctx.conversationId) {
        publish({
          type: 'message',
          tenantId: this.tenantId,
          conversationId: ctx.conversationId,
          payload: { role: 'assistant', content: text, createdAt: new Date().toISOString() },
        });
      }

      return text;
    } catch (error) {
      aiInteractionsTotal.inc({ tenant_id: this.tenantId, outcome: 'error' });
      throw error;
    } finally {
      stopTimer();
    }
  }

  /** Resolve (or create) the client record for an inbound conversation. */
  private async resolveClient(ctx: ProcessContext): Promise<string> {
    const tenant = await prisma.tenant.findUnique({ where: { id: this.tenantId } });

    if (ctx.clientPhone) {
      const existing = await prisma.client.findFirst({
        where: { tenantId: this.tenantId, phone: ctx.clientPhone },
      });
      if (existing) return existing.id;

      const created = await prisma.client.create({
        data: {
          tenantId: this.tenantId,
          phone: ctx.clientPhone,
          name: ctx.clientName ?? null,
        },
      });
      return created.id;
    }

    if (ctx.conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: ctx.conversationId },
        select: { clientId: true },
      });
      if (conversation) return conversation.clientId;
    }

    throw new Error('Cannot resolve client: no phone number or conversation provided.');
    void tenant;
  }

  /**
   * `check_availability` — returns real free slots, filtered by staff skill.
   * Returns a "no availability" hint that nudges the model toward the waitlist.
   */

  /**
   * `get_schedule_and_appointments` - returns real scheduled appointments for staff and clinic inquiries.
   */
  private async getScheduleAndAppointments(
    args: { date?: string },
    timezone: string
  ): Promise<string> {
    const targetDate = args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? new Date(args.date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: this.tenantId,
        scheduledAt: { gte: start, lte: end },
        status: { in: ['confirmed', 'pending'] },
      },
      include: {
        client: true,
        service: true,
        staff: true,
        Pet: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (bookings.length === 0) {
      return `No appointments scheduled for ${start.toISOString().slice(0, 10)}.`;
    }

    return bookings
      .map(
        (b) =>
          `- Time: ${b.scheduledAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}, Patient: ${b.Pet?.name || 'Pet'} (${b.Pet?.species || 'Species'}), Owner: ${b.client?.name || 'Client'}, Doctor: ${b.staff?.name || 'Veterinarian'}, Service: ${b.service?.nameEn || 'Consultation'}, Status: ${b.status}, Notes: ${b.notes || 'Routine'}`
      )
      .join('\n');
  }

  private async checkAvailability(
    args: { date?: string; service_id?: string },
    timezone: string
  ): Promise<string> {
    if (!args.date || !args.service_id) return 'Error: date and service_id are required.';

    const service = await prisma.service.findFirst({
      where: { id: args.service_id, tenantId: this.tenantId, isActive: true },
    });
    if (!service) return 'Error: service not found.';

    const allStaff = await prisma.staff.findMany({
      where: { tenantId: this.tenantId, isActive: true },
    });

    const qualified = allStaff.filter((staff) => {
      try {
        const skills: string[] = JSON.parse(staff.skillsJson || '[]');
        return !Array.isArray(skills) || skills.length === 0 || skills.includes(service.id);
      } catch {
        return true;
      }
    });

    if (qualified.length === 0) {
      return 'No staff member is currently trained for this service. Offer the client a different service.';
    }

    const dayStart = fromZonedTime(`${args.date} 00:00:00`, timezone);
    const dayEnd = fromZonedTime(`${args.date} 23:59:59`, timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: this.tenantId,
        status: { in: ['pending', 'confirmed'] },
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: { staffId: true, scheduledAt: true, endsAt: true },
    });

    const slots = SchedulingEngine.getAvailableSlots(
      args.date,
      timezone,
      service,
      qualified,
      bookings.map((b) => ({ staffId: b.staffId, scheduledAt: b.scheduledAt, endsAt: b.endsAt }))
    );

    if (slots.length === 0) {
      return `No slots on ${args.date}. Tell the client it is fully booked and offer join_waitlist so they are notified when someone cancels.`;
    }

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const options = slots.slice(0, 6).map((s) => `${formatter.format(s.slot)} (staff_id: ${s.staffId})`);
    return `Available on ${args.date}: ${options.join(' | ')}. Use the exact staff_id when booking.`;
  }


  /**
   * `book_appointment` — delegates to the shared race-free booking service so
   * the agent and the salon dashboard can never disagree about conflicts.
   */
  private async bookAppointment(
    args: { date?: string; time?: string; service_id?: string; staff_id?: string },
    timezone: string,
    ctx: ProcessContext
  ): Promise<{ text: string; serviceId?: string; paymentUrl?: string }> {
    if (!args.date || !args.time || !args.service_id || !args.staff_id) {
      return { text: 'Error: date, time, service_id and staff_id are all required.' };
    }

    let clientId: string;
    try {
      clientId = await this.resolveClient(ctx);
    } catch (error) {
      return { text: `Cannot book without identifying the client: ${(error as Error).message}` };
    }

    const result = await createBooking({
      tenantId: this.tenantId,
      clientId,
      staffId: args.staff_id,
      serviceId: args.service_id,
      date: args.date,
      time: args.time,
      source: ctx.platform ?? 'whatsapp',
      status: 'confirmed',
    });

    if (!result.ok) {
      const guidance =
        result.code === 'conflict'
          ? 'Tell the client that slot was just taken and offer to check other times.'
          : `Tell the client: ${result.message}`;
      return { text: guidance };
    }

    // Side effects: reminders + realtime broadcast.
    await scheduleBookingReminders(result.bookingId).catch(() => undefined);

    const service = await prisma.service.findUnique({ where: { id: args.service_id } });
    const staff = await prisma.staff.findUnique({ where: { id: args.staff_id } });

    // Phase 5.3 + 6.5 — high-value bookings require a deposit to be confirmed.
    let paymentUrl: string | undefined;
    const isHighValue = isStripeEnabled() && service && service.price >= PAYMENT_THRESHOLD;

    if (isHighValue && service) {
      const link = await createBookingPaymentLink({
        tenantId: this.tenantId,
        bookingId: result.bookingId,
        amount: service.price,
        currency: service.currency,
        serviceName: service.nameEn,
        clientEmail: null,
      }).catch(() => null);

      if (link) {
        paymentUrl = link.url;
        // Downgrade the newly created booking to pending.
        await prisma.booking.update({
          where: { id: result.bookingId },
          data: { status: 'pending' },
        });
      }
    }

    if (ctx.conversationId) {
      publish({
        type: 'booking',
        tenantId: this.tenantId,
        payload: {
          id: result.bookingId,
          reference: result.reference,
          scheduledAt: result.scheduledAt.toISOString(),
          status: paymentUrl ? 'pending' : 'confirmed',
        },
      });
    }

    let text =
      `Booking ${paymentUrl ? 'held' : 'confirmed'}. Reference ${result.reference}, ${args.date} at ${args.time}` +
      (service ? ` for ${service.nameEn}` : '') +
      (staff ? ` with ${staff.name}` : '') +
      '.';

    if (paymentUrl) {
      text += ' (Tell the client this is a high-value service and their slot is only HELD until they pay the deposit via the link provided.)';
    }

    return { text, serviceId: args.service_id, ...(paymentUrl ? { paymentUrl } : {}) };
  }


  /** `join_waitlist` — Phase 5.6. */
  private async handleWaitlist(
    args: { service_id?: string; date?: string; preferred_time_of_day?: string },
    ctx: ProcessContext
  ): Promise<string> {
    if (!args.service_id) return 'Error: service_id is required.';

    let clientId: string;
    try {
      clientId = await this.resolveClient(ctx);
    } catch (error) {
      return `Cannot add to the waitlist: ${(error as Error).message}`;
    }

    const preference = ['morning', 'afternoon', 'evening', 'any'].includes(
      String(args.preferred_time_of_day)
    )
      ? (args.preferred_time_of_day as 'morning' | 'afternoon' | 'evening' | 'any')
      : 'any';

    const isDate = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date);

    try {
      await joinWaitlist({
        tenantId: this.tenantId,
        clientId,
        serviceId: args.service_id,
        preferredDate: isDate ? (args.date as string) : null,
        preferredTimeOfDay: preference,
      });
      return 'The client is on the waitlist. Confirm to them that they will be notified when a slot opens.';
    } catch (error) {
      return `Could not add the client to the waitlist: ${(error as Error).message}`;
    }
  }

  /** `submit_review` — Phase 4.6. */
  private async handleReview(args: { rating?: number | string; comment?: string }): Promise<string> {
    const rating = typeof args.rating === 'string' ? parseRatingToken(args.rating) : args.rating;

    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return 'Error: rating must be a whole number from 1 to 5.';
    }

    // Attribute the review to the client's most recent completed booking.
    const latest = await prisma.booking.findFirst({
      where: { tenantId: this.tenantId, status: 'completed', review: null },
      orderBy: { scheduledAt: 'desc' },
      select: { id: true, clientId: true },
    });

    try {
      await recordReview({
        tenantId: this.tenantId,
        bookingId: latest?.id ?? null,
        clientId: latest?.clientId ?? null,
        rating,
        comment: args.comment ?? null,
        source: 'whatsapp',
      });
      return 'Review saved. Thank the client warmly.';
    } catch (error) {
      return `Could not save the review: ${(error as Error).message}`;
    }
  }
}


