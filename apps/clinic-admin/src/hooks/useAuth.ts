import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { setTenant, setAuthToken, setRefreshToken, clearAuthToken, isAuthenticated } from '../lib/auth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
  isActive: boolean;
  emergencyPhone?: string | null;
}

interface User {
  id: string;
  email: string;
  role: string;
  tenantId?: string;
  name?: string | null;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Auth state lives in a module-level store rather than in `useState` inside the
 * hook.
 *
 * `App` calls `initializeAuth()` while `ProtectedRoute` consumes the result, so
 * both must observe the *same* snapshot. With per-hook state, ProtectedRoute
 * instantiated its own copy that stayed at `isLoading: true` forever — the
 * dashboard rendered a permanent spinner and a signed-out visitor was never
 * redirected to /login.
 */
let authState: AuthState = {
  user: null,
  tenant: null,
  isAuthenticated: false,
  isLoading: true,
};

const listeners = new Set<() => void>();

function publish(next: AuthState): void {
  authState = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthState {
  return authState;
}

/** Test/HMR helper: forget everything cached about the signed-in salon. */
export function resetAuthState(): void {
  publish({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
}

/**
 * Publish a session that was established outside this hook.
 *
 * The login page persists the token itself (it also supports "log in as a
 * platform super-admin"), so it calls this afterwards to make the shared store —
 * and therefore the dashboard's route guard — agree that someone is signed in.
 */
export async function hydrateAuthState(): Promise<void> {
  if (!isAuthenticated()) return;

  try {
    const tenant = await api.getTenant();
    setTenant(tenant);
    publish({ user: null, tenant, isAuthenticated: true, isLoading: false });
  } catch {
    clearAuthToken();
    publish({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Tenant profile for the signed-in salon. `api.getTenant()` resolves the
  // tenant from the bearer token, so it also doubles as a token validity check.
  const { data: tenantData } = useQuery({
    queryKey: ['auth', 'tenant'],
    queryFn: () => api.getTenant(),
    enabled: isAuthenticated(),
    retry: false,
  });

  useEffect(() => {
    if (!tenantData) return;
    if (getSnapshot().tenant?.id === tenantData.id && !getSnapshot().isLoading) return;

    publish({
      user: getSnapshot().user,
      tenant: tenantData as unknown as Tenant,
      isAuthenticated: true,
      isLoading: false,
    });
  }, [tenantData]);

  const initializeAuth = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      if (tokenParam) {
        setAuthToken(tokenParam);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
    if (!isAuthenticated()) {
      publish({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const tenant = await api.getTenant();
      setTenant(tenant);
      publish({ user: getSnapshot().user, tenant, isAuthenticated: true, isLoading: false });
    } catch {
      // Expired or rejected token: drop it so the UI can ask for a fresh login.
      clearAuthToken();
      publish({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
    }
  }, []);

  const login = useMutation({
    mutationFn: async (credentials: { email: string; password: string; tenantSlug?: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/auth/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        }
      );

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((body as { error?: string } | null)?.error || 'Invalid email or password');
      }
      return body as { token: string; refreshToken?: string; user: User; tenant: Tenant | null };
    },
    onSuccess: async (data) => {
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);

      // Salon admins get their tenant in the login response. Platform
      // super-admins have none, and resolving it must not fail the login.
      let tenant: Tenant | null = data.tenant ?? null;
      if (tenant) {
        setTenant(tenant);
      } else {
        try {
          tenant = await api.getTenant();
          setTenant(tenant);
        } catch {
          tenant = null;
        }
      }

      publish({ user: data.user, tenant, isAuthenticated: true, isLoading: false });

      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  const logout = useCallback(() => {
    clearAuthToken();
    queryClient.clear();
    publish({ user: null, tenant: null, isAuthenticated: false, isLoading: false });
  }, [queryClient]);

  const switchTenant = useCallback(
    async (_tenantId: string) => {
      // Tenant switching is a super-admin concern; salons only ever see their own.
      queryClient.invalidateQueries({ queryKey: ['auth', 'tenant'] });
    },
    [queryClient]
  );

  return {
    ...state,
    initializeAuth,
    login: login.mutateAsync,
    logout,
    switchTenant,
    isLoginPending: login.isPending,
  };
}
