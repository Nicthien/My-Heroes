"use client";

import { AuthProvider as SupabaseAuthProvider } from "@/lib/auth/client";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
}
