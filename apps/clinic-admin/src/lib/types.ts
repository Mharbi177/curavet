/**
 * Shared API response shapes.
 *
 * Typing these explicitly (rather than letting axios hand back `any`) is what
 * gives the page components real contextual types inside `.map()` callbacks.
 */

export type LanguageCode = 'ar' | 'en' | 'fr' | 'ur' | 'tl';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  isActive: boolean;
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  welcomeMessage: string | null;
  customDomain: string | null;
  webWidgetKey?: string;
  webWidgetEnabled?: boolean;
  languageDefault: string;
  supportedLanguages?: LanguageCode[];
  aiProvider?: string | null;
  aiModel?: string | null;
  remindersEnabled?: boolean;
  reviewsEnabled?: boolean;
  upsellEnabled?: boolean;
  waitlistEnabled?: boolean;
}

export interface Service {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  workingHoursJson: string;
  skillsJson: string;
  isActive: boolean;
}

export interface Client {
  id: string;
  name: string | null;
  phone: string | null;
  instagramId: string | null;
  webSessionId: string | null;
  languagePreference: string | null;
  isVip: boolean;
  tags: string[] | null;
  lastContactAt: string | null;
  createdAt: string;
  /** Aggregates returned by the paginated clients list. */
  bookingCount?: number;
  totalSpent?: number;
}

export interface Booking {
  id: string;
  reference: string | null;
  clientId: string;
  staffId: string;
  serviceId: string;
  scheduledAt: string;
  endsAt: string;
  status: string;
  price: number;
  currency: string;
  notes: string | null;
  // The list and detail endpoints always hydrate these relations.
  client: Client;
  staff: Staff;
  service: Service;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  platform: string;
  status: string;
  humanTakeover: boolean;
  lastMessageAt: string | null;
  client: Client;
  /** Only populated by the single-conversation endpoint. */
  messages?: ConversationMessage[];
}

export interface Broadcast {
  id: string;
  name: string;
  message: string;
  audience: string;
  customClientIds: string[];
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  readCount: number;
  errorMessage: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** Standard paginated envelope returned by list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedClients {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface WaitlistEntry {
  id: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  status: string;
  preferredDate: string | null;
  preferredTimeOfDay: string | null;
  notifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  client?: Client;
  service?: Pick<Service, 'id' | 'nameEn' | 'nameAr'>;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  source: string;
  createdAt: string;
  client?: Pick<Client, 'id' | 'name' | 'phone'>;
}

export interface RatingAggregate {
  averageRating: number;
  totalReviews: number;
  distribution: Record<string, number>;
}

export interface UpsellRule {
  id: string;
  triggerServiceId: string;
  suggestedServiceId: string;
  messageEn: string;
  messageAr: string;
  discountPercent: number;
  priority: number;
  isActive: boolean;
  triggerService?: Service | null;
  suggestedService?: Service | null;
}

export interface Payment {
  id: string;
  bookingId: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  booking?: Pick<Booking, 'id' | 'scheduledAt'>;
}

export interface PaymentLink {
  url: string;
  amount: number;
  currency: string;
  paymentId: string;
}

/** Mirrors the shape returned by `GET /api/tenants/me/dashboard`. */
export interface DashboardStats {
  todayBookings: number;
  todayRevenue: number;
  newClientsThisMonth: number;
  pendingBookings: number;
  activeConversations: number;
  recentBookings: Booking[];
  recentClients?: Array<Client & { bookingCount: number }>;
}

export interface AnalyticsSummary {
  totalBookings: number;
  totalClients: number;
  totalConversations: number;
  revenue: number;
  averageRating: number;
  bookingsByDay: Array<{ date: string; count: number; revenue: number }>;
  topServices: Array<{ id: string; nameEn: string; count: number; revenue: number }>;
}

export interface LanguageConfig {
  supported: LanguageCode[];
  default: string;
}
