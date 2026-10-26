import axios, { AxiosError, AxiosInstance, type AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getAuthToken, setAuthToken, getRefreshToken, setRefreshToken, clearAuthToken } from './auth';
import type {
  AnalyticsSummary,
  Booking,
  Broadcast,
  Client,
  Conversation,
  DashboardStats,
  LanguageCode,
  LanguageConfig,
  MedicalRecord,
  Payment,
  PaymentLink,
  PaginatedClients,
  Pet,
  RatingAggregate,
  Review,
  Service,
  Staff,
  Tenant,
  UpsellRule,
  Vaccination,
  WaitlistEntry,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** Fields a salon is allowed to edit on a client record. */
export type ClientUpdate = Partial<{
  phone: string;
  name: string | null;
  languagePreference: string | null;
  isVip: boolean;
  tags: string[];
  notes: string | null;
}>;

class ApiClient {
  private client: AxiosInstance;
  /** Serialize concurrent 401s through a single refresh exchange. */
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = getAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Access tokens are short-lived (15 min). On a 401, silently renew via
        // the refresh token and retry the original request exactly once.
        const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
        const isAuthCall = (original?.url ?? '').includes('/auth/refresh');

        if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
          const newToken = await this.renewSession();
          if (newToken) {
            original._retried = true;
            if (original.headers) {
              original.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.client.request(original);
          }
          clearAuthToken();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  /** Exchange the refresh token for a new access/refresh pair (single-flight). */
  private renewSession(): Promise<string | null> {
    this.refreshPromise ??= (async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return null;
        const { data } = await this.client.post<{ token: string; refreshToken?: string }>(
          '/auth/refresh',
          { refreshToken }
        );
        setAuthToken(data.token);
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        return data.token;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  // Tenant-scoped endpoints
  async getTenant(): Promise<Tenant> {
    const { data } = await this.client.get<Tenant>('/tenants/me');
    return data;
  }

  async updateTenant(
    data: Partial<{ name: string; timezone: string; plan: string }>
  ): Promise<Tenant> {
    const { data: tenant } = await this.client.patch<Tenant>('/tenants/me', data);
    return tenant;
  }

  // Dashboard
  async getDashboardStats(): Promise<DashboardStats> {
    const { data } = await this.client.get<DashboardStats>('/tenants/me/dashboard');
    return data;
  }

  // Bookings
  async getBookings(params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<Booking[]> {
    const { data } = await this.client.get<Booking[]>('/tenants/me/bookings', { params });
    return data;
  }

  async getBooking(id: string): Promise<Booking> {
    const { data } = await this.client.get<Booking>(`/tenants/me/bookings/${id}`);
    return data;
  }

  async createBooking(data: {
    clientId: string;
    staffId: string;
    serviceId: string;
    date: string;
    time: string;
    source?: string;
  }): Promise<Booking> {
    const { data: booking } = await this.client.post<Booking>('/tenants/me/bookings', data);
    return booking;
  }

  async updateBookingStatus(id: string, status: string): Promise<Booking> {
    const { data: booking } = await this.client.patch<Booking>(`/tenants/me/bookings/${id}`, { status });
    return booking;
  }

  async updateBooking(
    id: string,
    data: Partial<{ scheduledAt: string; date: string; time: string; staffId: string; status: string; notes: string | null }>
  ): Promise<Booking> {
    const { data: booking } = await this.client.patch<Booking>(
      `/tenants/me/bookings/${id}`,
      data
    );
    return booking;
  }

  async cancelBooking(id: string): Promise<Booking> {
    const { data } = await this.client.patch<Booking>(`/tenants/me/bookings/${id}`, {
      status: 'cancelled',
    });
    return data;
  }

  // Clients
  async getClients(params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedClients> {
    const { data } = await this.client.get<PaginatedClients>('/tenants/me/clients', { params });
    return data;
  }

  async getClient(id: string): Promise<Client> {
    const { data } = await this.client.get<Client>(`/tenants/me/clients/${id}`);
    return data;
  }

  async createClient(data: {
    phone: string;
    name?: string;
    languagePreference?: string;
  }): Promise<Client> {
    const { data: client } = await this.client.post<Client>('/tenants/me/clients', data);
    return client;
  }

  async updateClient(id: string, data: ClientUpdate): Promise<Client> {
    const { data: client } = await this.client.patch<Client>(`/tenants/me/clients/${id}`, data);
    return client;
  }

  async deleteClient(id: string): Promise<void> {
    await this.client.delete(`/tenants/me/clients/${id}`);
  }

  // Services
  async getServices(): Promise<Service[]> {
    const { data } = await this.client.get<Service[]>('/tenants/me/services');
    return data;
  }

  async createService(data: {
    nameEn: string;
    nameAr: string;
    durationMinutes: number;
    bufferMinutes?: number;
    price: number;
  }) {
    const { data: service } = await this.client.post('/tenants/me/services', data);
    return service;
  }

  async updateService(id: string, data: Partial<{
    nameEn: string;
    nameAr: string;
    durationMinutes: number;
    bufferMinutes: number;
    price: number;
    isActive: boolean;
  }>) {
    const { data: service } = await this.client.patch(`/tenants/me/services/${id}`, data);
    return service;
  }

  async deleteService(id: string): Promise<void> {
    await this.client.delete(`/tenants/me/services/${id}`);
  }

  // Staff
  async getStaff(): Promise<Staff[]> {
    const { data } = await this.client.get<Staff[]>('/tenants/me/staff');
    return data;
  }

  async createStaff(data: {
    name: string;
    workingHoursJson: string;
    skillsJson: string;
  }) {
    const { data: staff } = await this.client.post('/tenants/me/staff', data);
    return staff;
  }

  async updateStaff(id: string, data: Partial<{
    name: string;
    workingHoursJson: string;
    skillsJson: string;
  }>) {
    const { data: staff } = await this.client.patch(`/tenants/me/staff/${id}`, data);
    return staff;
  }

  async deleteStaff(id: string): Promise<void> {
    await this.client.delete(`/tenants/me/staff/${id}`);
  }

  // Conversations
  async getConversations(params?: { status?: string; limit?: number }): Promise<Conversation[]> {
    const { data } = await this.client.get<Conversation[]>('/tenants/me/conversations', { params });
    return data;
  }

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.get(`/tenants/me/conversations/${id}`);
    return data;
  }

  async takeoverConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.post(`/tenants/me/conversations/${id}/takeover`);
    return data;
  }

  async releaseConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.post(`/tenants/me/conversations/${id}/release`);
    return data;
  }

  async sendMessage(conversationId: string, content: string) {
    const { data } = await this.client.post(`/tenants/me/conversations/${conversationId}/messages`, { content });
    return data;
  }

  // Broadcast
  async createBroadcast(data: {
    name: string;
    message: string;
    audience: 'all' | 'inactive' | 'vip' | 'custom';
    customClientIds?: string[];
    scheduledAt?: string;
  }) {
    const { data: broadcast } = await this.client.post('/tenants/me/broadcasts', data);
    return broadcast;
  }

  async getBroadcasts(): Promise<Broadcast[]> {
    const { data } = await this.client.get<Broadcast[]>('/tenants/me/broadcasts');
    return data;
  }

  async sendBroadcastNow(id: string) {
    const { data } = await this.client.post(`/tenants/me/broadcasts/${id}/send`);
    return data;
  }

  async deleteBroadcast(id: string) {
    await this.client.delete(`/tenants/me/broadcasts/${id}`);
  }

  /** Preview how many clients an audience segment resolves to. */
  async getAudienceSize(data: {
    audience: 'all' | 'inactive' | 'vip' | 'custom';
    customClientIds?: string[];
  }) {
    const { data: result } = await this.client.post('/tenants/me/broadcasts/audience-size', data);
    return result.count as number;
  }

  // Waitlist (Phase 5.6)
  async getWaitlist(): Promise<WaitlistEntry[]> {
    const { data } = await this.client.get<WaitlistEntry[]>('/tenants/me/waitlist');
    return data;
  }

  async joinWaitlist(data: {
    clientId: string;
    serviceId: string;
    staffId?: string | null;
    preferredDate?: string | null;
    preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'any';
  }) {
    const { data: entry } = await this.client.post('/tenants/me/waitlist', data);
    return entry;
  }

  async updateWaitlistEntry(id: string, status: string) {
    const { data } = await this.client.patch(`/tenants/me/waitlist/${id}`, { status });
    return data;
  }

  async notifyWaitlistEntry(id: string) {
    const { data } = await this.client.post(`/tenants/me/waitlist/${id}/notify`);
    return data;
  }

  async deleteWaitlistEntry(id: string) {
    await this.client.delete(`/tenants/me/waitlist/${id}`);
  }

  // Reviews (Phase 4.6)
  async getReviews(): Promise<Review[]> {
    const { data } = await this.client.get<Review[]>('/tenants/me/reviews');
    return data;
  }

  async getReviewAggregate(): Promise<RatingAggregate> {
    const { data } = await this.client.get<RatingAggregate>('/tenants/me/reviews/aggregate');
    return data;
  }

  async requestReview(bookingId: string) {
    const { data } = await this.client.post(`/tenants/me/bookings/${bookingId}/request-review`);
    return data;
  }

  // Upsell rules (Phase 5.4)
  async getUpsellRules(): Promise<UpsellRule[]> {
    const { data } = await this.client.get<UpsellRule[]>('/tenants/me/upsell-rules');
    return data;
  }

  async createUpsellRule(data: {
    triggerServiceId: string;
    suggestedServiceId: string;
    messageEn: string;
    messageAr: string;
    discountPercent?: number;
    priority?: number;
  }) {
    const { data: rule } = await this.client.post('/tenants/me/upsell-rules', data);
    return rule;
  }

  async deleteUpsellRule(id: string) {
    await this.client.delete(`/tenants/me/upsell-rules/${id}`);
  }

  // Payments (Phase 5.3)
  async getPayments(): Promise<Payment[]> {
    const { data } = await this.client.get<Payment[]>('/tenants/me/payments');
    return data;
  }

  async createPaymentLink(bookingId: string): Promise<PaymentLink> {
    const { data } = await this.client.post(`/tenants/me/bookings/${bookingId}/payment-link`);
    return data;
  }

  async markBookingPaid(bookingId: string) {
    const { data } = await this.client.post(`/tenants/me/bookings/${bookingId}/mark-paid`);
    return data;
  }

  // Analytics
  async getAnalytics(params?: { startDate?: string; endDate?: string }) {
    const { data } = await this.client.get('/tenants/me/analytics', { params });
    return data;
  }

  // Settings
  async getSettings() {
    const { data } = await this.client.get('/tenants/me/settings');
    return data;
  }

  async updateSettings(data: {
    timezone?: string;
    languageDefault?: string;
    supportedLanguages?: Array<'ar' | 'en' | 'fr'>;
    aiProvider?: 'auto' | 'openai' | 'groq';
    aiModel?: string | null;
    remindersEnabled?: boolean;
    reviewsEnabled?: boolean;
    upsellEnabled?: boolean;
    waitlistEnabled?: boolean;
    notificationPreferences?: Record<string, boolean>;
  }) {
    const { data: settings } = await this.client.patch('/tenants/me/settings', data);
    return settings;
  }

  /** White-label branding (Phase 5.1). */
  async updateBranding(data: {
    brandName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    welcomeMessage?: string | null;
    customDomain?: string | null;
  }) {
    const { data: tenant } = await this.client.patch('/tenants/me', data);
    return tenant;
  }

  /** Language capabilities of this salon (Phase 5.2). */
  async getLanguages(): Promise<LanguageConfig> {
    const { data } = await this.client.get<LanguageConfig>('/tenants/me/languages');
    return data;
  }

  // ─── Pet / Patient Health Record endpoints ────────────────────────────────

  async getPets(params?: { q?: string; ownerId?: string }): Promise<Pet[]> {
    const { data } = await this.client.get<Pet[]>('/tenants/me/pets', { params });
    return data;
  }

  async getPet(id: string): Promise<Pet> {
    const { data } = await this.client.get<Pet>(`/tenants/me/pets/${id}`);
    return data;
  }

  async createPet(data: {
    ownerId: string;
    name: string;
    species: string;
    breed?: string | null;
    gender?: 'M' | 'F' | 'MN' | 'FS' | null;
    dateOfBirth?: string | null;
    weightKg?: number | null;
    microchipNo?: string | null;
    tattooNo?: string | null;
    allergies?: string | null;
    medicalNotes?: string | null;
  }): Promise<Pet> {
    const { data: pet } = await this.client.post<Pet>('/tenants/me/pets', data);
    return pet;
  }

  async updatePet(id: string, data: Partial<{
    name: string;
    species: string;
    breed: string | null;
    gender: 'M' | 'F' | 'MN' | 'FS' | null;
    dateOfBirth: string | null;
    weightKg: number | null;
    microchipNo: string | null;
    tattooNo: string | null;
    allergies: string | null;
    medicalNotes: string | null;
  }>): Promise<Pet> {
    const { data: pet } = await this.client.patch<Pet>(`/tenants/me/pets/${id}`, data);
    return pet;
  }

  async createMedicalRecord(petId: string, data: {
    bookingId?: string | null;
    symptoms: string;
    diagnosis: string;
    treatmentPlan: string;
    weightAtVisit?: number | null;
    temperatureC?: number | null;
  }): Promise<MedicalRecord> {
    const { data: record } = await this.client.post<MedicalRecord>(
      `/tenants/me/pets/${petId}/medical-records`,
      data
    );
    return record;
  }

  async createVaccination(petId: string, data: {
    vaccineName: string;
    diseaseTarget: string;
    batchNumber: string;
    administeredDate?: string | null;
    nextDueDate: string;
  }): Promise<Vaccination> {
    const { data: vax } = await this.client.post<Vaccination>(
      `/tenants/me/pets/${petId}/vaccinations`,
      data
    );
    return vax;
  }
}

export const api = new ApiClient();