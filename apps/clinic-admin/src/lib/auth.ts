
const TOKEN_KEY = 'curavet_token';
const REFRESH_KEY = 'curavet_refresh_token';
const TENANT_KEY = 'curavet_tenant';
const USER_KEY   = 'curavet_user';

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(TENANT_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Refresh token persistence for silent session renewal (15-min access TTL). */
export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function setTenant(tenant: object): void {
  localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

export function getTenant(): object | null {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: object): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): { id: string; email: string; role: string; name?: string } | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
