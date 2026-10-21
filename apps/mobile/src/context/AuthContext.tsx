import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, clearAuthToken, getAuthToken } from '../lib/api';
import type { User } from '../lib/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await clearAuthToken();
    setUser(null);
  }, []);

  // Wire up the 401 handler so expired tokens auto-logout
  useEffect(() => {
    api.setUnauthorizedHandler(logout);
  }, [logout]);

  // On mount: try to restore session from persisted token
  useEffect(() => {
    const restore = async () => {
      try {
        const token = await getAuthToken();
        if (token) {
          const me = await api.getMe();
          setUser(me);
        }
      } catch {
        await clearAuthToken();
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: me } = await api.login(email, password);
    setUser(me);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
