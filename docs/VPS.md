# Deploying My Heroes on a VPS (self-hosted Supabase + Docker)

This guide self-hosts the **entire** stack on a single Linux VPS, behind an
HTTPS reverse proxy. It was written from a real deployment on an **OVH VPS
running Debian 13 "Trixie"** (6 vCPU / 12 GB RAM), but applies to any
Debian/Ubuntu VPS with Docker.

| Piece | What it is | How it's managed | Exposure |
| --- | --- | --- | --- |
| **Supabase** | Official self-hosted stack (~11 containers) | `docker compose` | **localhost only** (`127.0.0.1`) |
| **My Heroes** | The Next.js game (one container) | `docker compose`, image pulled from Docker Hub | **localhost only** |
| **Caddy** | Reverse proxy + automatic TLS | `docker compose` | **public** (`80`/`443`) |

Two design choices drive everything:

1. **Only Caddy is public.** Supabase and the app bind their ports to
   `127.0.0.1`. This matters because **Docker bypasses `ufw`** — a published
   port is opened directly in `iptables` regardless of the firewall, so binding
   to localhost is what actually keeps those services private. All three pieces
   talk to each other over a shared Docker network.
2. **The app image is GENERIC** — no URL or key is baked in. Every value is read
   at **runtime** from the container env, so the same public image
   (`nicthien/my-heroes` on Docker Hub) works for any deployment. See
   [Why the image is generic](UNRAID.md#why-the-image-is-generic).

> **Conventions.** Commands marked **(local)** run on your own PC; commands
> marked **(VPS)** run on the server over SSH. Replace every `<…>` placeholder
> with your own value. The guide assumes the working directory `/opt/my-heroes`.

---

## Prerequisites

- A **VPS**. The full Supabase stack + app idles around ~2 GB RAM, so **8 GB+**
  is comfortable; 4 GB is the realistic floor. Tested on 6 vCPU / 12 GB.
- A **domain or subdomain** you control (e.g. `myheroes.example.com`) for HTTPS.
- A clone of this repository on your **local machine** (needed once, to generate
  Supabase keys in Step 4).
- Note: **outbound port 25 is blocked** on most VPS providers, so email needs an
  authenticated SMTP relay (Step 7).

> OVH (and many providers) give you a **non-root sudo user** (`debian`) rather
> than direct root login — that's already the more secure default. Substitute
> your own user wherever this guide says `debian`.

---

## Step 1 — Harden the host

### 1a. Generate an SSH key — **(local)**

```bash
ssh-keygen -t ed25519 -C "my-heroes-vps"
```

Accept the default path and set a passphrase. This creates `id_ed25519` (private,
never leaves your PC) and `id_ed25519.pub` (public).

### 1b. Update the system & copy your key — **(VPS, then local)**

```bash
# (VPS) update everything. If asked about a modified sshd_config during the
# openssh upgrade, choose "keep the local version currently installed".
sudo apt update && sudo apt full-upgrade -y
```

```bash
# (local) push your public key onto the server (last time you use the password)
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh debian@<VPS_IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

> The one-liner above is PowerShell (Windows). On macOS/Linux use
> `ssh-copy-id debian@<VPS_IP>`.

**Test key login from a second terminal before locking anything** — keep your
current session open as a safety net:

```bash
ssh debian@<VPS_IP>     # should connect via the key (asks the key passphrase)
```

### 1c. Firewall + fail2ban + auto-updates — **(VPS)**

```bash
sudo apt install -y ufw fail2ban

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable            # answer "y"; port 22 is open, you won't be cut off

sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
findtime = 10m
EOF
sudo systemctl restart fail2ban

sudo apt install -y unattended-upgrades
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades
```

### 1d. Disable SSH password login — **(VPS)**

```bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf > /dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
EOF

# Verify the values actually win, then reload
sudo sshd -t && sudo sshd -T | grep -Ei "passwordauthentication|permitrootlogin|pubkeyauthentication"
sudo systemctl reload ssh
```

> **Why `00-`:** cloud images ship `/etc/ssh/sshd_config.d/50-cloud-init.conf`
> with `PasswordAuthentication yes`. SSH uses the **first** value it reads and
> files are read alphabetically, so naming ours `00-hardening.conf` makes it win
> — even after a reboot regenerates the cloud-init file. If `sshd -T` still shows
> `passwordauthentication yes`, that ordering is the culprit.

> **Don't get locked out:** keep a fallback. Most providers offer an out-of-band
> **KVM/web console** (independent of SSH) where the user password still works —
> save that password before disabling SSH passwords, so you can always get back
> in to add a new key.

Confirm from a fresh terminal that key login still works and passwords are
refused (`ssh -o PubkeyAuthentication=no debian@<VPS_IP>` → `Permission denied
(publickey)`).

---

## Step 2 — Install Docker — **(VPS)**

Use Docker's **official** repository (the Debian `docker.io` package is too old):

```bash
# Remove any conflicting old packages (harmless if absent)
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do sudo apt remove -y $pkg; done

# Docker's GPG key
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# The repository (auto-detects your distro codename)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (takes effect on next login)
sudo usermod -aG docker $USER
```

Log out and back in, then verify:

```bash
docker --version
docker compose version          # NOTE: "docker compose" (v2, a space) — never "docker-compose"
docker run hello-world
```

---

## Step 3 — Point DNS at the VPS

At your DNS provider, create an **A record** for your (sub)domain pointing to the
VPS IPv4 (and optionally an `AAAA` for IPv6):

| Type | Name | Value |
| --- | --- | --- |
| `A` | `myheroes` (or `@`) | `<VPS_IP>` |

If you use Cloudflare, set the record to **DNS only** (grey cloud) for the
initial setup so Caddy can complete the TLS challenge; you can re-enable the
proxy afterwards. Verify with `nslookup <your-domain>` before Step 6.

---

## Step 4 — Deploy Supabase (self-hosted) — **(VPS)**

### 4a. Fetch the official Supabase Docker stack

```bash
sudo mkdir -p /opt/my-heroes
sudo chown $USER:$USER /opt/my-heroes
cd /opt/my-heroes

git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase tmp
cd tmp && git sparse-checkout set docker && cd ..
cp -r tmp/docker ./supabase
cp tmp/docker/.env.example ./supabase/.env
rm -rf tmp
```

### 4b. Generate real keys — **(local)**

Never ship the Supabase demo keys. From a clone of **this** repo:

```bash
node scripts/gen-supabase-keys.mjs    # prints JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
```

Save the three values (password manager). `ANON_KEY` and `SERVICE_ROLE_KEY` are
JWTs signed with `JWT_SECRET`, so the three must stay together.

### 4c. Fill the Supabase `.env` — **(VPS)**

Replace the three placeholders with your keys from 4b, then run:

```bash
cd /opt/my-heroes/supabase
set +o history     # don't record the secrets below in shell history

export POSTGRES_PASSWORD=$(openssl rand -hex 24)
export DASHBOARD_PASSWORD=$(openssl rand -hex 16)
export SECRET_KEY_BASE=$(openssl rand -hex 32)
export VAULT_ENC_KEY=$(openssl rand -hex 16)
export DASHBOARD_USERNAME=admin

export JWT_SECRET='<JWT_SECRET from 4b>'
export ANON_KEY='<ANON_KEY from 4b>'
export SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY from 4b>'

set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
set_env POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
set_env JWT_SECRET "$JWT_SECRET"
set_env ANON_KEY "$ANON_KEY"
set_env SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
set_env DASHBOARD_USERNAME "$DASHBOARD_USERNAME"
set_env DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
set_env SECRET_KEY_BASE "$SECRET_KEY_BASE"
set_env VAULT_ENC_KEY "$VAULT_ENC_KEY"
set_env SITE_URL "https://<your-domain>"
set_env API_EXTERNAL_URL "http://localhost:8000"
set_env SUPABASE_PUBLIC_URL "http://localhost:8000"

echo "SAVE THESE:"; echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"; echo "DASHBOARD_USERNAME=$DASHBOARD_USERNAME"; echo "DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD"
set -o history
```

> `POSTGRES_PASSWORD` is needed again in Step 5. `API_EXTERNAL_URL` /
> `SUPABASE_PUBLIC_URL` stay on `localhost` on purpose — Supabase is never
> exposed publicly; reach Studio through an SSH tunnel (see Troubleshooting).

### 4d. Bind Supabase's published ports to localhost

Supabase publishes Kong (`8000/8443`) and the pooler (`5432/6543`). Because
Docker bypasses the firewall, bind them to `127.0.0.1` so they are reachable
only from the VPS itself:

```bash
cd /opt/my-heroes/supabase
sed -i 's|- ${KONG_HTTP_PORT}:8000/tcp|- 127.0.0.1:${KONG_HTTP_PORT}:8000/tcp|' docker-compose.yml
sed -i 's|- ${KONG_HTTPS_PORT}:8443/tcp|- 127.0.0.1:${KONG_HTTPS_PORT}:8443/tcp|' docker-compose.yml
sed -i 's|- ${POSTGRES_PORT}:5432|- 127.0.0.1:${POSTGRES_PORT}:5432|' docker-compose.yml
sed -i 's|- ${POOLER_PROXY_PORT_TRANSACTION}:6543|- 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543|' docker-compose.yml
grep -n -A2 "ports:" docker-compose.yml   # confirm the 127.0.0.1: prefix
```

> Only the **host-side** mapping is prefixed; the port *variables* stay `5432`,
> `8000`, … because containers still use them to talk to each other internally.

### 4e. Start Supabase

```bash
docker compose pull
docker compose up -d
docker compose ps                 # wait until all containers are healthy
docker network ls | grep supabase # note the network name (usually "supabase_default")
```

If the `pooler` (supavisor) crash-loops, see Troubleshooting.

---

## Step 5 — Deploy the app — **(VPS)**

### 5a. App environment

Replace the placeholders (your keys from 4b, and the `POSTGRES_PASSWORD` from 4c):

```bash
set +o history
export ANON_KEY='<ANON_KEY>'
export SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY>'
export POSTGRES_PASSWORD='<POSTGRES_PASSWORD>'

mkdir -p /opt/my-heroes/app
cat > /opt/my-heroes/app/.env <<EOF
REGISTRY_IMAGE=docker.io/nicthien/my-heroes:latest
APP_PORT=3000
SUPABASE_NETWORK=supabase_default

SUPABASE_URL=http://127.0.0.1:8000
SUPABASE_INTERNAL_URL=http://kong:8000
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SUPABASE_DB_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/postgres
MIGRATE_ON_BOOT=true

APP_PUBLIC_URL=https://<your-domain>
USE_SMTP=false
EOF
set -o history
```

> Key points:
> - `SUPABASE_URL=http://127.0.0.1:8000` is a **flag**: a loopback/private value
>   makes the browser route Supabase calls through the app's built-in
>   `/api/supabase` proxy (it never talks to Supabase directly). The real
>   server-side traffic goes to `SUPABASE_INTERNAL_URL=http://kong:8000` over the
>   shared Docker network.
> - `SUPABASE_DB_URL` points at `db:5432` (direct Postgres) so the app can
>   **auto-apply schema migrations at boot** — on a fresh database it builds the
>   whole schema itself; no manual SQL needed.
> - `SUPABASE_NETWORK` must match the network name from Step 4e.

### 5b. App compose file

```bash
cat > /opt/my-heroes/app/docker-compose.yml <<'EOF'
services:
  app:
    image: ${REGISTRY_IMAGE:-docker.io/nicthien/my-heroes:latest}
    container_name: my-heroes-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:${APP_PORT:-3000}:3000"
    env_file: .env
    networks:
      - supabase

networks:
  supabase:
    external: true
    name: ${SUPABASE_NETWORK:-supabase_default}
EOF
```

### 5c. Start the app

```bash
cd /opt/my-heroes/app
docker compose pull
docker compose up -d
docker compose logs -f app    # watch migrations apply, then "Ready"; Ctrl+C to stop following
```

On first boot the app applies all migrations and seeds a default admin:

- **Email:** `admin@myheroes.local`
- **Password:** `ChangeMe` (you'll be forced to change it on first login)

Override the seed with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars if you like.

---

## Step 6 — Caddy (reverse proxy + HTTPS) — **(VPS)**

```bash
mkdir -p /opt/my-heroes/caddy
cat > /opt/my-heroes/caddy/Caddyfile <<'EOF'
<your-domain> {
	reverse_proxy my-heroes-app:3000
}
EOF

cat > /opt/my-heroes/caddy/docker-compose.yml <<'EOF'
services:
  caddy:
    image: caddy:2
    container_name: my-heroes-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - supabase

networks:
  supabase:
    external: true
    name: supabase_default

volumes:
  caddy_data:
  caddy_config:
EOF

cd /opt/my-heroes/caddy
docker compose up -d
docker compose logs -f caddy   # wait for "certificate obtained successfully"; Ctrl+C
```

Open `https://<your-domain>`, sign in as the admin, and you're live. The game is
served over HTTPS; Supabase and the app remain private on localhost.

---

## Step 7 — Email (SMTP) — optional

With `USE_SMTP=false` (default) signup is instant and no mail is sent — fine for
a test server. To require email confirmation on signup and send welcome / bug-
report mail, set `USE_SMTP=true` and the `SMTP_*` vars. **Outbound port 25 is
blocked on most VPS**, so use an authenticated relay on port 587 or 465 (your
own mail host, Brevo, Mailgun, Sendgrid, etc.).

Example for a generic provider, edited into `/opt/my-heroes/app/.env`:

```env
USE_SMTP=true
SMTP_HOST=<smtp.your-provider>
SMTP_PORT=587
SMTP_SECURE=false            # 587 = STARTTLS; use 465 + true for implicit TLS
SMTP_USER=<full-email-address>
SMTP_PASS=<mailbox-or-api-password>
SMTP_FROM=My Heroes <no-reply@your-domain>
```

Then reload the app so it picks up the new env:

```bash
cd /opt/my-heroes/app && docker compose up -d --force-recreate
```

> A plain `docker compose up -d` does **not** always detect a changed `.env`
> file — use `--force-recreate` after editing env vars. For deliverability,
> enable **SPF** and **DKIM** for your sending domain.

---

## Step 8 — Backups — **(VPS)**

A daily logical dump with rotation protects against the most common incident
(bad migration, accidental data loss):

```bash
mkdir -p /opt/my-heroes/backups
cat > /opt/my-heroes/backups/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/opt/my-heroes/backups"
RETENTION_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/myheroes-$STAMP.dump"
/usr/bin/docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$FILE"
find "$BACKUP_DIR" -name 'myheroes-*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))" >> "$BACKUP_DIR/backup.log"
EOF
chmod +x /opt/my-heroes/backups/backup.sh

# Test it once
/opt/my-heroes/backups/backup.sh && ls -lh /opt/my-heroes/backups/

# Schedule daily at 03:00 (cron is NOT installed by default on minimal images)
sudo apt install -y cron
sudo systemctl enable --now cron
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/my-heroes/backups/backup.sh" ) | crontab -
crontab -l
```

> **Off-site is separate.** These dumps live on the VPS, so they don't survive a
> total VPS loss. Many providers (OVH included) offer an **automatic full-disk
> snapshot** stored off-site — keep that enabled for disaster recovery. The two
> are complementary: the snapshot restores the whole machine, the local dump lets
> you roll back just the database, in seconds, with deeper history.

---

## Updating the app — **(VPS)**

The published image is generic; just pull the new `:latest` and restart:

```bash
cd /opt/my-heroes/app
docker compose pull
docker compose up -d
docker image prune -f      # optional cleanup of old layers
```

New schema migrations apply automatically at boot. Watch with
`docker compose logs -f app`.

---

## Restoring from a backup — **(VPS)**

```bash
docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists < /opt/my-heroes/backups/myheroes-<STAMP>.dump
```

`--clean --if-exists` drops and recreates objects so the dump replaces current
data. Restart the app afterwards if needed.

---

## Troubleshooting

- **Browser login hangs / network error, page loads fine** → the browser isn't
  using the proxy. Confirm `SUPABASE_URL` is a loopback/private value
  (`http://127.0.0.1:8000`) so the client routes through `/api/supabase`, and
  that `SUPABASE_INTERNAL_URL=http://kong:8000`.
- **`401 / invalid JWT`** → the app's `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` don't match the Supabase `JWT_SECRET`. Regenerate
  the set (Step 4b) and update **both** `.env` files.
- **Admin login says "confirm your email"** (older images, < 1.1.3) → the seeded
  admin row missed the confirmed flag. Fix once:
  `docker exec supabase-db psql -U postgres -d postgres -c "update public.profiles set email_confirmed = true where email = 'admin@myheroes.local';"`
- **Pooler (`supavisor`) crash-loops** on `ulimit ... Operation not permitted`
  → add to its service in `supabase/docker-compose.yml`:
  `ulimits: { nofile: { soft: 100000, hard: 100000 } }`, then `docker compose up -d`.
- **"RAM is at 100%"** → almost certainly Linux page cache, not real pressure.
  Check `free -h` and read the **`available`** column, not `used`. The full stack
  truly uses ~2 GB.
- **Reach Supabase Studio** (kept private) → SSH-tunnel it:
  `ssh -L 8000:127.0.0.1:8000 debian@<VPS_IP>`, then open `http://localhost:8000`
  (login = `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` from Step 4c).

---

## Security summary

- SSH is **key-only**, root login disabled, `fail2ban` bans brute-forcers.
- `ufw` allows only `22/80/443`.
- Supabase + the app bind to **`127.0.0.1`**; only Caddy's `80/443` are public —
  the deliberate consequence of *Docker bypasses the firewall*.
- No secret is baked into the image; all config is runtime env. Keep both `.env`
  files (`supabase/.env`, `app/.env`) off version control and backed up
  separately from the database dumps.
