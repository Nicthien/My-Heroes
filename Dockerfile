# syntax=docker/dockerfile:1

# ----- Stage 1: dependencies -----
FROM node:24-alpine AS deps
# libc6-compat helps native deps (e.g. sharp) resolve correctly on Alpine.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ----- Stage 2: build -----
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No NEXT_PUBLIC_* build args on purpose: this image is GENERIC. The Supabase
# URL and keys are read at RUNTIME from the container env (see
# src/lib/config/supabaseEnv.ts) and injected into the page for the browser (see
# RuntimeConfigScript). Nothing deployment-specific is baked in, so the same
# image works for anyone with their own SUPABASE_URL / SUPABASE_ANON_KEY.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ----- Stage 3: runtime -----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output: a minimal server with only the deps it actually traced.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Boot-time migration runner. The standalone trace does NOT include these (they
# live outside the Next build), so copy them explicitly: the entrypoint, the
# runner, the migration SQL, and the dependency-free `postgres` driver.
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.mjs ./docker-entrypoint.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-db.mjs ./scripts/migrate-db.mjs
COPY --from=builder --chown=nextjs:nodejs /app/supabase/migrations ./supabase/migrations
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs
EXPOSE 3000

# The entrypoint runs pending DB migrations (gated on SUPABASE_DB_URL /
# MIGRATE_ON_BOOT), then execs the CMD. SUPABASE_SERVICE_ROLE_KEY and
# SUPABASE_DB_URL are read at runtime (server-only) — pass them via env.
ENTRYPOINT ["node", "docker-entrypoint.mjs"]
CMD ["node", "server.js"]
