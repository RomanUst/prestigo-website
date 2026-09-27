#!/usr/bin/env bash
# infra/vps/scripts/smoke.sh
#
# Post-deploy / post-upgrade / post-restore smoke check for the Chatwoot +
# EspoCRM + Caddy stacks. Prints "OK <name>" or "FAIL <name>: <reason>" per
# check, one line each, and exits 1 if any check FAILed (0 if all OK).
#
# Usage (on the VPS, from /opt/prestigo after rsync):
#   bash scripts/smoke.sh                 # public mode (default)
#   bash scripts/smoke.sh --local-only     # drill host (plan 08/09): skip
#                                          # Caddy/public URLs, hit the app
#                                          # containers over 127.0.0.1 instead
#
set -Eeuo pipefail

LOCAL_ONLY=false
for arg in "$@"; do
  case "${arg}" in
    --local-only) LOCAL_ONLY=true ;;
  esac
done

FAILED=0

ok() {
  echo "OK $1"
}

fail() {
  echo "FAIL $1: $2"
  FAILED=1
}

# --- container state ---------------------------------------------------
check_container() {
  local name="$1"
  local state oom restarting
  if ! state=$(docker inspect --format '{{.State.Status}}' "${name}" 2>/dev/null); then
    fail "${name}" "container not found"
    return
  fi
  if [ "${state}" != "running" ]; then
    fail "${name}" "state is ${state}, expected running"
    return
  fi
  oom=$(docker inspect --format '{{.State.OOMKilled}}' "${name}" 2>/dev/null || echo "unknown")
  if [ "${oom}" = "true" ]; then
    fail "${name}" "OOMKilled"
    return
  fi
  restarting=$(docker inspect --format '{{.State.Restarting}}' "${name}" 2>/dev/null || echo "unknown")
  if [ "${restarting}" = "true" ]; then
    fail "${name}" "currently restarting"
    return
  fi
  ok "${name}"
}

for c in chatwoot-postgres-1 chatwoot-redis-1 chatwoot-rails-1 chatwoot-sidekiq-1 \
         espocrm-db-1 espocrm-app-1 espocrm-daemon-1; do
  check_container "${c}"
done

if [ "${LOCAL_ONLY}" != "true" ]; then
  check_container "caddy-caddy-1"
fi

# --- app health ----------------------------------------------------------
if [ "${LOCAL_ONLY}" = "true" ]; then
  chat_url="http://127.0.0.1:3000/api"
  crm_url="http://127.0.0.1:8080/"
  crm_user_url="http://127.0.0.1:8080/api/v1/App/user"
else
  chat_url="https://chat.rideprestigo.com/api"
  crm_url="https://crm.rideprestigo.com/"
  crm_user_url="https://crm.rideprestigo.com/api/v1/App/user"
fi

body=""
if body=$(curl -fsS -m 10 "${chat_url}" 2>/dev/null); then
  if echo "${body}" | grep -q '"queue_services":"ok"' && echo "${body}" | grep -q '"data_services":"ok"'; then
    ok "chatwoot-health"
  else
    fail "chatwoot-health" "unexpected body: ${body}"
  fi
else
  fail "chatwoot-health" "curl to ${chat_url} failed"
fi

if body=$(curl -fsS -m 10 "${crm_url}" 2>/dev/null); then
  if echo "${body}" | grep -qi "espo"; then
    ok "espocrm-health"
  else
    fail "espocrm-health" "no EspoCRM marker in body from ${crm_url}"
  fi
else
  fail "espocrm-health" "curl to ${crm_url} failed"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${crm_user_url}" 2>/dev/null || echo "000")
if [ "${code}" = "401" ]; then
  ok "espocrm-auth-enforced"
else
  fail "espocrm-auth-enforced" "${crm_user_url} returned ${code}, expected 401"
fi

# --- certificate expiry (public mode only) --------------------------------
if [ "${LOCAL_ONLY}" != "true" ]; then
  for domain in chat.rideprestigo.com crm.rideprestigo.com; do
    if echo | openssl s_client -connect "${domain}:443" -servername "${domain}" 2>/dev/null \
        | openssl x509 -noout -checkend $((14 * 24 * 3600)) >/dev/null 2>&1; then
      ok "cert-expiry-${domain}"
    else
      fail "cert-expiry-${domain}" "certificate expires within 14 days (or could not be read)"
    fi
  done
fi

exit "${FAILED}"
