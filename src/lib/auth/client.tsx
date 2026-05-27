"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

type SupabaseAuthInternals = {
  storageKey?: string;
  storage?: {
    removeItem?: (key: string) => Promise<void> | void;
  };
};

export async function getSupabaseAccessToken() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOutWithLocalFallback() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (!error) return null;

  await clearLocalSupabaseSession(supabase.auth as unknown as SupabaseAuthInternals);
  return error;
}

async function clearLocalSupabaseSession(auth: SupabaseAuthInternals) {
  if (!auth.storageKey || !auth.storage?.removeItem) return;

  await auth.storage.removeItem(auth.storageKey);
  await auth.storage.removeItem(`${auth.storageKey}-code-verifier`);
}

export async function fetchWithSupabaseAuth(input: RequestInfo | URL, init?: RequestInit) {
  const token = await getSupabaseAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers, credentials: init?.credentials ?? "include" });
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthSession {
  user: {
    id: string;
    email?: string;
    name?: string | null;
    role?: string;
    mustChangePassword?: boolean;
  };
}

interface AuthContextValue {
  data: AuthSession | null;
  status: AuthStatus;
  user: User | null;
}

export const AuthContext = createContext<AuthContextValue>({
  data: null,
  status: "loading",
  user: null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ name?: string | null; role?: string; mustChangePassword?: boolean } | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (nextUser: User | null) => {
      if (!nextUser) {
        setProfile(null);
        return;
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (mounted) setProfile(null);
          return;
        }

        const response = await fetch("/api/auth/profile", {
          cache: "no-store",
          credentials: "include",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (mounted) {
          setProfile({
            name: data.name ?? null,
            role: data.role ?? "user",
            mustChangePassword: Boolean(data.mustChangePassword),
          });
        }
      } catch {
        if (mounted) setProfile(null);
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setStatus(data.user ? "authenticated" : "unauthenticated");
      void loadProfile(data.user ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session?.user ? "authenticated" : "unauthenticated");
      void loadProfile(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    data: user
      ? {
          user: {
            id: user.id,
            email: user.email,
            name: profile?.name ?? (user.user_metadata?.name as string | undefined) ?? user.email ?? null,
            role: profile?.role ?? "user",
            mustChangePassword: profile?.mustChangePassword ?? false,
          },
        }
      : null,
  }), [user, profile, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const { data, status } = useContext(AuthContext);
  return { data, status };
}

export function useSupabaseUser() {
  return useContext(AuthContext).user;
}
