import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import type {
  Booking, Client, Conversation, DashboardStats,
  Message, Service, Staff, Tenant, User, WaitlistEntry,
} from './types';

// ─── Normalizers ──────────────────────────────────────────────────────────────
// The backend uses different field names from what we type on the client.
// These functions bridge the gap so every screen gets clean, typed data.

function normalizeMessage(raw: any): Message {
  const role = raw.role ?? 'user';
  return {
    id: raw.id,
    content: raw.content,
    role,
    direction: role === 'user' ? 'inbound' : 'outbound',
    sender: role === 'user' ? 'client' : role === 'assistant' ? 'ai' : 'staff',
    createdAt: raw.createdAt,
  };
}

function normalizeConversation(raw: any): Conversation {
  return {
    ...raw,
    humanTakeover: raw.humanTakeover ?? false,
    aiMode: !(raw.humanTakeover ?? false),
    messages: (raw.messages ?? []).map(normalizeMessage),
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Dynamically use localhost for Web/iOS Simulator, 10.0.2.2 for Android Emulator, 
// and fallback to a LAN IP for physical testing.
export const API_BASE_URL = Platform.OS === 'web' 
  ? 'http://localhost:3000' 
  : Platform.OS === 'android' 
    ? 'http://10.0.2.2:3000' 
    : 'http://localhost:3000';
const TOKEN_KEY = '@glambot/auth_token';
const REFRESH_KEY = '@glambot/refresh_token';

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_KEY, token);
}

// ─── API Client ───────────────────────────────────────────────────────────────
class ApiClient {
  private client: AxiosInstance;
  private onUnauthorized?: () => void;
  /** Serialize concurrent 401s through a single refresh exchange. */
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/api`,
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    // Attach token to every request
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await getAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

      // Handle 401 globally: renew the session once, then retry the request.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
        const isAuthCall = (original?.url ?? '').includes('/auth/');

        if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
          const newToken = await this.renewSession();
          if (newToken) {
            original._retried = true;
            original.headers.Authorization = `Bearer ${newToken}`;
            try {
              return await this.client.request(original);
            } catch (retryError) {
              error = retryError as AxiosError;
            }
          }
        }

        if (error.response?.status === 401 && !original?._retried) {
          clearAuthToken();
          this.onUnauthorized?.();
        }
        const message = (error.response?.data as any)?.message || error.message || 'Request failed';
        return Promise.reject(new Error(message));
      }
    );
  }

  /** Exchange the refresh token for a new access/refresh pair (single-flight). */
  private renewSession(): Promise<string | null> {
    this.refreshPromise ??= (async () => {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) return null;
        const { data } = await this.client.post<{ token: string; refreshToken?: string }>(
          '/auth/refresh',
          { refreshToken }
        );
        await setAuthToken(data.token);
        if (data.refreshToken) await setRefreshToken(data.refreshToken);
        return data.token;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const { data } = await this.client.post<{ token: string; refreshToken?: string; user: User }>('/auth/login', { email, password });
    await setAuthToken(data.token);
    if (data.refreshToken) {
      await setRefreshToken(data.refreshToken);
    }
    return data;
  }

  async getMe(): Promise<User> {
    const { data } = await this.client.get<User>('/auth/me');
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout', {});
    } catch {
      // Best-effort server-side revocation; local cleanup always proceeds.
    }
    await clearAuthToken();
    await AsyncStorage.removeItem(REFRESH_KEY);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────
  async getDashboardStats(): Promise<DashboardStats> {
    const { data } = await this.client.get<DashboardStats>('/tenants/me/dashboard');
    return data;
  }

  // ─── Bookings ─────────────────────────────────────────────────────────────
  async getBookings(params?: { startDate?: string; endDate?: string; status?: string }): Promise<Booking[]> {
    const { data } = await this.client.get<Booking[]>('/tenants/me/bookings', { params });
    return data;
  }

  async createBooking(bookingData: {
    clientId: string;
    serviceId: string;
    staffId: string;
    date: string;
    time: string;
  }): Promise<Booking> {
    const { data } = await this.client.post<Booking>('/tenants/me/bookings', bookingData);
    return data;
  }

  async updateBooking(id: string, data: Partial<{ status: string; date: string; time: string }>): Promise<Booking> {
    const { data: booking } = await this.client.patch<Booking>(`/tenants/me/bookings/${id}`, data);
    return booking;
  }

  // ─── Conversations ────────────────────────────────────────────────────────
  async getConversations(params?: { status?: string; limit?: number }): Promise<Conversation[]> {
    const { data } = await this.client.get<any[]>('/tenants/me/conversations', { params });
    return data.map(normalizeConversation);
  }

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.get<any>(`/tenants/me/conversations/${id}`);
    return normalizeConversation(data);
  }

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const { data } = await this.client.post<any>(
      `/tenants/me/conversations/${conversationId}/messages`,
      { content }
    );
    return normalizeMessage(data);
  }

  async takeoverConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.post<any>(`/tenants/me/conversations/${id}/takeover`);
    return normalizeConversation(data);
  }

  async releaseConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.post<any>(`/tenants/me/conversations/${id}/release`);
    return normalizeConversation(data);
  }

  // ─── Waitlist ─────────────────────────────────────────────────────────────
  async getWaitlist(): Promise<WaitlistEntry[]> {
    const { data } = await this.client.get<WaitlistEntry[]>('/tenants/me/waitlist');
    return data;
  }

  async updateWaitlistEntry(id: string, status: string): Promise<WaitlistEntry> {
    const { data } = await this.client.patch<WaitlistEntry>(`/tenants/me/waitlist/${id}`, { status });
    return data;
  }

  async notifyWaitlistEntry(id: string): Promise<WaitlistEntry> {
    const { data } = await this.client.post<WaitlistEntry>(`/tenants/me/waitlist/${id}/notify`);
    return data;
  }

  // ─── Services ─────────────────────────────────────────────────────────────
  async getServices(): Promise<Service[]> {
    const { data } = await this.client.get<Service[]>('/tenants/me/services');
    return data;
  }

  // ─── Staff ────────────────────────────────────────────────────────────────
  async getStaff(): Promise<Staff[]> {
    const { data } = await this.client.get<Staff[]>('/tenants/me/staff');
    return data;
  }

  // ─── Clients ──────────────────────────────────────────────────────────────
  async getClients(params?: { search?: string; limit?: number }): Promise<{ clients: Client[] }> {
    const { data } = await this.client.get<{ clients: Client[] }>('/tenants/me/clients', { params });
    return data;
  }

  async createClient(clientData: { phone: string; name?: string }): Promise<Client> {
    const { data } = await this.client.post<Client>('/tenants/me/clients', clientData);
    return data;
  }

  async updateClient(id: string, clientData: { name?: string; phone?: string; notes?: string }): Promise<Client> {
    const { data } = await this.client.patch<Client>(`/tenants/me/clients/${id}`, clientData);
    return data;
  }
}

export const api = new ApiClient();
