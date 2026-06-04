// Generate a self-hosted Supabase key set (JWT_SECRET + ANON_KEY + SERVICE_ROLE_KEY).
//
// These are the keys you paste into supabase-stack/.env on Unraid. ANON_KEY and
// SERVICE_ROLE_KEY are HS256 JWTs signed with JWT_SECRET — exactly what GoTrue /
// PostgREST / Realtime validate against. No external service, no website: the
// secret never leaves your machine.
//
// Usage:
//   node scripts/gen-supabase-keys.mjs              # fresh random secret
//   JWT_SECRET="my-existing-secret" node scripts/gen-supabase-keys.mjs
//
// The matching app keys for docker/unraid/env.unraid.example are:
//   ANON_KEY        -> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (build arg) + ANON_KEY
//   SERVICE_ROLE_KEY-> SERVICE_ROLE_KEY

import crypto from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const sign = (payload, secret) => {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
};

const secret = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // ~10 years

const anon = sign({ role: "anon", iss: "supabase", iat, exp }, secret);
const service = sign({ role: "service_role", iss: "supabase", iat, exp }, secret);

console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${anon}`);
console.log(`SERVICE_ROLE_KEY=${service}`);
