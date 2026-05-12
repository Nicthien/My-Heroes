"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/browser";

export async function getSupabaseAccessToken() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthSession {
  user: {
    id: string;
    email?: string;
    name?: string | null;
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
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setStatus(data.user ? "authenticated" : "unauthenticated");
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setStatus(session?.user ? "authenticated" : "unauthenticated");
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
            name: (user.user_metadata?.name as string | undefined) ?? user.email ?? null,
          },
        }
      : null,
  }), [user, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const { data, status } = useContext(AuthContext);
  return { data, status };
}

export function useSupabaseUser() {
  return useContext(AuthContext).user;
}
