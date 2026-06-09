-- Email confirmation flow (app-managed, sent via nodemailer; gated by USE_SMTP).
--
-- profiles.email_confirmed gates login when USE_SMTP=true. Existing accounts are
-- grandfathered as confirmed so enabling SMTP later never locks anyone out.
-- New signups insert email_confirmed=false and confirm via the token below.

alter table public.profiles
  add column if not exists email_confirmed boolean not null default false;

-- One-time backfill: every account that already exists is treated as confirmed.
update public.profiles set email_confirmed = true where email_confirmed = false;

-- Pending confirmation tokens. Only the SHA-256 hash is stored; the raw token
-- lives only in the email. One pending row per user (resend overwrites).
create table if not exists public.email_confirmations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Service-role only: this table is read/written exclusively by the server-side
-- API routes (which bypass RLS). RLS is enabled with NO policies so it is never
-- exposed to the browser / realtime subscribers.
alter table public.email_confirmations enable row level security;
