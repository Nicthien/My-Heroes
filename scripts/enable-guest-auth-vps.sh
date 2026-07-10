#!/usr/bin/env bash
set -Eeuo pipefail

# Enable Supabase anonymous users and manual identity linking on the self-hosted
# VPS stack. Override the default path when needed:
#   sudo SUPABASE_DIR=/path/to/supabase bash enable-guest-auth-vps.sh

SUPABASE_DIR="${SUPABASE_DIR:-/opt/my-heroes/supabase}"
ENV_FILE="${SUPABASE_DIR}/.env"
GUEST_OVERRIDE_NAME="docker-compose.guest-auth.yml"
GUEST_OVERRIDE_FILE="${SUPABASE_DIR}/${GUEST_OVERRIDE_NAME}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${SUPABASE_DIR}/backups/guest-auth-${TIMESTAMP}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not in PATH."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
[[ -d "${SUPABASE_DIR}" ]] || fail "Supabase directory not found: ${SUPABASE_DIR}"

cd "${SUPABASE_DIR}"

BASE_COMPOSE=""
for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [[ -f "${candidate}" ]]; then
    BASE_COMPOSE="${candidate}"
    break
  fi
done
[[ -n "${BASE_COMPOSE}" ]] || fail "No Docker Compose file found in ${SUPABASE_DIR}."

mkdir -p "${BACKUP_DIR}"
[[ -f "${ENV_FILE}" ]] && cp -a "${ENV_FILE}" "${BACKUP_DIR}/.env"
[[ -f "${GUEST_OVERRIDE_FILE}" ]] && cp -a "${GUEST_OVERRIDE_FILE}" "${BACKUP_DIR}/${GUEST_OVERRIDE_NAME}"
touch "${ENV_FILE}"

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "${ENV_FILE}" > "${tmp}"
  cat "${tmp}" > "${ENV_FILE}"
  rm -f "${tmp}"
}

read_env() {
  local key="$1"
  local value
  value="$(awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}")"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s\n' "${value}"
}

set_env ENABLE_ANONYMOUS_USERS true

cat > "${GUEST_OVERRIDE_FILE}" <<'YAML'
services:
  auth:
    environment:
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "true"
      GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: "true"
YAML

# Make the guest-auth override part of every future `docker compose` command,
# while preserving an existing COMPOSE_FILE chain when one is already defined.
CURRENT_COMPOSE_FILE="$(read_env COMPOSE_FILE || true)"
if [[ -z "${CURRENT_COMPOSE_FILE}" ]]; then
  CURRENT_COMPOSE_FILE="${BASE_COMPOSE}"
  for default_override in docker-compose.override.yml docker-compose.override.yaml compose.override.yml compose.override.yaml; do
    if [[ -f "${default_override}" ]]; then
      CURRENT_COMPOSE_FILE="${CURRENT_COMPOSE_FILE}:${default_override}"
      break
    fi
  done
fi

case ":${CURRENT_COMPOSE_FILE}:" in
  *":${GUEST_OVERRIDE_NAME}:"*) ;;
  *) CURRENT_COMPOSE_FILE="${CURRENT_COMPOSE_FILE}:${GUEST_OVERRIDE_NAME}" ;;
esac
set_env COMPOSE_FILE "${CURRENT_COMPOSE_FILE}"

docker compose config --services | grep -qx auth || fail "The Compose stack has no service named 'auth'."
docker compose config --quiet

printf 'Recreating Supabase Auth with anonymous sign-ins enabled...\n'
docker compose up -d --force-recreate auth

AUTH_CONTAINER="$(docker compose ps -q auth)"
[[ -n "${AUTH_CONTAINER}" ]] || fail "The Auth container was not created."

for _ in $(seq 1 30); do
  STATUS="$(docker inspect --format '{{.State.Status}}' "${AUTH_CONTAINER}")"
  [[ "${STATUS}" == "running" ]] && break
  sleep 1
done
[[ "${STATUS:-}" == "running" ]] || fail "Auth container did not reach the running state."

AUTH_ENV="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${AUTH_CONTAINER}")"
ANONYMOUS_VALUE="$(printf '%s\n' "${AUTH_ENV}" | awk -F= '$1 == "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED" { print $2; exit }')"
LINKING_VALUE="$(printf '%s\n' "${AUTH_ENV}" | awk -F= '$1 == "GOTRUE_SECURITY_MANUAL_LINKING_ENABLED" { print $2; exit }')"

[[ "${ANONYMOUS_VALUE}" == "true" ]] || fail "Anonymous sign-ins are still disabled in the Auth container."
[[ "${LINKING_VALUE}" == "true" ]] || fail "Manual linking is still disabled in the Auth container."

printf '\nSupabase guest authentication is enabled.\n'
printf '  GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=%s\n' "${ANONYMOUS_VALUE}"
printf '  GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=%s\n' "${LINKING_VALUE}"
printf '  Backup: %s\n' "${BACKUP_DIR}"
printf '\nYou can now retry the "Essayer" button.\n'
