"use client";

import { AuthProvider as SupabaseAuthProvider } from "@/lib/auth/client";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseAuthProvider>
      <I18nProvider>{children}</I18nProvider>
    </SupabaseAuthProvider>
  );
}
