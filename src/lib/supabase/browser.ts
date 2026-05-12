"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const directUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder";

  return createBrowserClient(directUrl, key);
}
