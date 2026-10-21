// ─── Shared types for the mobile app ─────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  timezone: string;
  languageDefault: string;
  currency: string;
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  tenantId: string;
  tenant: Tenant;
}

export interface Client {
  id: string;
  phone: string;
  name?: string | null;
  isVip: boolean;
  tags: string[];
  notes?: string | null;
  languagePreference?: string | null;
  totalBookings?: number;
  lastContactAt?: string | null;
}

export interface Service {
  id: string;
  nameEn: string;
  nameAr: string;
  price: number;
  durationMinutes: number;
  bufferMinutes?: number;
  isActive: boolean;
}

export interface Staff {
  id: string;
  name: string;
  color?: string;
  workingHoursJson: string;
}

export interface Booking {
  id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  scheduledAt: string;
  endsAt: string;
  client: Client;
  staff: Staff;
  service: Service;
  source?: string;
}

export interface Message {
  id: string;
  content: string;
  // Backend returns 'role' — map direction from role for display
  role: 'user' | 'assistant' | 'human_agent' | 'system';
  direction: 'inbound' | 'outbound'; // derived: user = inbound, rest = outbound
  sender: 'client' | 'ai' | 'staff'; // derived from role
  createdAt: string;
}

export interface Conversation {
  id: string;
  status: 'active' | 'resolved' | 'waiting';
  humanTakeover: boolean; // actual API field name
  aiMode: boolean;        // derived: !humanTakeover
  platform: 'whatsapp' | 'instagram' | 'web';
  client: Client;
  messages: Message[];
  lastMessageAt?: string;
  unreadCount?: number;
}

export interface WaitlistEntry {
  id: string;
  client: Client;
  service: Service;
  staff?: Staff | null;
  preferredDate?: string | null;
  preferredTimeOfDay?: string | null;
  status: 'waiting' | 'notified' | 'booked' | 'expired' | 'cancelled';
  createdAt: string;
}

export interface DashboardStats {
  todayBookings: number;
  todayRevenue: number;
  pendingBookings: number;
  activeConversations: number;
  recentBookings: Booking[];
}
