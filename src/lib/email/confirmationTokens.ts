import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Token lifecycle for app-managed email confirmation. The raw token is returned
// to the caller (to embed in the email) and only its SHA-256 hash is persisted,
// so a leaked DB row cannot be used to confirm an account.

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create (or replace) the pending confirmation token for a user.
 * Returns the raw token to embed in the confirmation link.
 */
export async function createConfirmationToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await supabase.from("email_confirmations").upsert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[email] failed to store confirmation token:", error.message);
    return null;
  }
  return token;
}

export type ConfirmationResult =
  | { status: "ok"; userId: string }
  | { status: "invalid" }
  | { status: "expired" };

/**
 * Validate a raw token. On success the pending row is consumed (deleted) and the
 * user id is returned so the caller can flip profiles.email_confirmed.
 */
export async function consumeConfirmationToken(
  supabase: SupabaseClient,
  token: string,
): Promise<ConfirmationResult> {
  if (!token) return { status: "invalid" };

  const { data, error } = await supabase
    .from("email_confirmations")
    .select("user_id, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return { status: "invalid" };

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("email_confirmations").delete().eq("user_id", data.user_id);
    return { status: "expired" };
  }

  await supabase.from("email_confirmations").delete().eq("user_id", data.user_id);
  return { status: "ok", userId: data.user_id };
}
