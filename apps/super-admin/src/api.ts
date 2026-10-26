export const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ||
  'http://localhost:4000';

export function getAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('token');
      if (tokenParam) {
        setAuthToken(tokenParam);
        window.history.replaceState({}, document.title, window.location.pathname);
        return tokenParam;
      }
    }
    return localStorage.getItem('curavet_super_token') || localStorage.getItem('glambot_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  localStorage.setItem('curavet_super_token', token); localStorage.setItem('glambot_token', token);
}

/** Refresh token kept alongside the access token for silent renewal. */
export function getRefreshToken(): string | null {
  return localStorage.getItem('curavet_super_refresh') || localStorage.getItem('glambot_refresh');
}

export function setRefreshToken(token: string): void {
  localStorage.setItem('curavet_super_refresh', token);
  localStorage.setItem('glambot_refresh', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('glambot_token');
  localStorage.removeItem('curavet_super_token');
  localStorage.removeItem('glambot_auth');
  localStorage.removeItem('curavet_super_refresh');
  localStorage.removeItem('glambot_refresh');
}

export interface ApiError extends Error {
  status: number;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string> | undefined) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // Silent session renewal: exchange the refresh token once, then retry.
    if (response.status === 401 && !path.includes('/auth/')) {
      const newToken = await renewSuperSession();
      if (newToken) return apiFetch<T>(path, options);
    }
    const message = (data as { error?: string } | null)?.error || `Request failed (${response.status})`;
    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }

  return data as T;
}

async function renewSuperSession(): Promise<string | null> {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { token: string; refreshToken?: string };
    setAuthToken(body.token);
    if (body.refreshToken) setRefreshToken(body.refreshToken);
    return body.token;
  } catch {
    return null;
  }
}
