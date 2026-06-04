"use client";

import { createBrowserClient } from "@supabase/ssr";
import { RUNTIME_CONFIG_GLOBAL, type PublicRuntimeConfig } from "@/lib/config/supabaseEnv";

/**
 * Reads the public config injected at runtime by the server (see
 * RuntimeConfigScript). Falls back to build-time NEXT_PUBLIC_* values, which are
 * only present during local `next dev` — in the production image nothing is
 * baked, so the injected runtime config is authoritative.
 */
function getPublicConfig(): PublicRuntimeConfig {
  if (typeof window !== "undefined" && window[RUNTIME_CONFIG_GLOBAL]?.supabaseUrl) {
    return window[RUNTIME_CONFIG_GLOBAL]!;
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
  };
}

function isLoopbackUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isPrivateNetworkUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    const parts = hostname.split(".").map((part) => Number(part));

    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [first, second] = parts;
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  } catch {
    return false;
  }
}

function shouldUseSupabaseProxy(value: string) {
  return isLoopbackUrl(value) || isPrivateNetworkUrl(value);
}

export function isUsingSupabaseProxy() {
  const directUrl = getPublicConfig().supabaseUrl || "https://placeholder.supabase.co";
  return typeof window !== "undefined" && shouldUseSupabaseProxy(directUrl);
}

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  const directUrl = supabaseUrl || "https://placeholder.supabase.co";
  const url = isUsingSupabaseProxy() ? new URL("/api/supabase", window.location.origin).toString() : directUrl;
  const key = supabaseAnonKey || "placeholder";

  return createBrowserClient(url, key);
}
