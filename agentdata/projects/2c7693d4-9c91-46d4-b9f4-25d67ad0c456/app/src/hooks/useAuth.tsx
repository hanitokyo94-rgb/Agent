import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type BoboUser = {
  id?: string;
  email?: string;
  name?: string;
  [k: string]: unknown;
};

type AuthContextValue = {
  user: BoboUser | null;
  loading: boolean;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const BOBO_API_URL = import.meta.env.VITE_BOBO_API_URL as string | undefined;
const BOBO_PROJECT_KEY = import.meta.env.VITE_BOBO_PROJECT_KEY as string | undefined;

function getStoredToken() {
  return localStorage.getItem('bobo_token');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<BoboUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    if (!BOBO_API_URL) {
      setUser(null);
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${BOBO_API_URL}/api/bobo/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data?.valid) setUser(data?.user ?? null);
        else {
          localStorage.removeItem('bobo_token');
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void verify();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut: () => {
        localStorage.removeItem('bobo_token');
        setUser(null);
        window.location.href = '/';
      }
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function getBoboEnv() {
  return { BOBO_API_URL, BOBO_PROJECT_KEY };
}
