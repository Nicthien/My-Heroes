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

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function getSupabaseAccessToken() {
  const supabase = createClient();
  return readSupabaseAccessToken(supabase);
}

export async function signOutWithLocalFallback() {
  const supabase = createClient();
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return null;

    await clearLocalSupabaseSession(supabase.auth as unknown as SupabaseAuthInternals);
    return error;
  } catch (error) {
    await clearLocalSupabaseSession(supabase.auth as unknown as SupabaseAuthInternals);
    return error;
  }
}

async function readSupabaseAccessToken(supabase: BrowserSupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      await clearInvalidRefreshTokenSession(error, supabase.auth as unknown as SupabaseAuthInternals);
      return null;
    }

    return data.session?.access_token ?? null;
  } catch (error) {
    if (await clearInvalidRefreshTokenSession(error, supabase.auth as unknown as SupabaseAuthInternals)) {
      return null;
    }
    return null;
  }
}

async function clearInvalidRefreshTokenSession(error: unknown, auth: SupabaseAuthInternals) {
  if (!isInvalidRefreshTokenError(error)) return false;

  await clearLocalSupabaseSession(auth);
  return true;
}

function isInvalidRefreshTokenError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  return message.includes("Invalid Refresh Token") || message.includes("Refresh Token Not Found");
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
    language?: string | null;
    godModeEnabled?: boolean;
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
  const [profile, setProfile] = useState<{
    name?: string | null;
    role?: string;
    mustChangePassword?: boolean;
    language?: string | null;
    godModeEnabled?: boolean;
  } | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let mounted = true;

    const loadProfile = async (nextUser: User | null) => {
      if (!nextUser) {
        setProfile(null);
        return;
      }
      try {
        const token = await readSupabaseAccessToken(supabase);
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
            language: data.language ?? null,
            godModeEnabled: Boolean(data.godModeEnabled),
          });
        }
      } catch {
        if (mounted) setProfile(null);
      }
    };

    const setUnauthenticated = () => {
      if (!mounted) return;
      setUser(null);
      setProfile(null);
      setStatus("unauthenticated");
    };

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;
        if (error && await clearInvalidRefreshTokenSession(error, supabase.auth as unknown as SupabaseAuthInternals)) {
          setUnauthenticated();
          return;
        }

        setUser(data.user ?? null);
        setStatus(data.user ? "authenticated" : "unauthenticated");
        void loadProfile(data.user ?? null);
      } catch (error) {
        if (await clearInvalidRefreshTokenSession(error, supabase.auth as unknown as SupabaseAuthInternals)) {
          setUnauthenticated();
          return;
        }
        setUnauthenticated();
      }
    })();

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
            language: profile?.language ?? null,
            godModeEnabled: profile?.godModeEnabled ?? false,
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
