#!/usr/bin/env bash
# infra/vps/scripts/monitor.sh
#
# On-VPS depth checks (D-04b/c/d, D-12) that ping their own Healthchecks.io
# check on success, or /fail on failure. Primary alerting for "is the app
# reachable at all" lives OFF the VPS (UptimeRobot, D-01) — this script is
# the local depth layer that catches what an external prober can't see:
# disk/memory pressure, a dead Sidekiq, EspoCRM/MariaDB internals, and TLS
# expiry (D-04). Healthchecks' own dead-man's switch means a VPS that goes
# fully dark also alerts, once the grace period elapses (D-01, Pitfall 13).
#
# D-02 deviation (owner-approved 2026-09-28): UptimeRobot's Telegram
# integration became a paid feature the owner declined, so UptimeRobot now
# alerts by email only. The apps_http check below restores Telegram coverage
# for app-level outages (Chatwoot/EspoCRM down) through Healthchecks.io's own
# Telegram integration instead — see runbooks/monitoring.md.
#
# Every check is independent: one check's failure or a missing ping URL
# never stops the others from running.
#
# With /etc/prestigo/monitor.env absent, or any individual HC_PING_* var
# unset, that check's ping is skipped with a "skipped (no ping URL)" log
# line and the script still exits 0 for that check's ping step — this lets
# the timer run cleanly before Task 1/2's owner-account provisioning exists.
#
# Usage:
#   sudo bash monitor.sh                   # run all six checks
#   sudo bash monitor.sh --only sidekiq    # run a single named check
#   MONITOR_DRY_RUN=1 sudo bash monitor.sh # print "WOULD PING" instead of curling
#
# Threshold overrides (env):
#   DISK_MAX_PCT=85 MEM_MAX_PCT=90 SWAP_MAX_PCT=50 TLS_MIN_DAYS=14 KVM4_AVG_PCT=80
#   CHAT_HEALTH_URL / CRM_HEALTH_URL override apps_http's fetch targets — used
#   only to prove its fail branch in a dry run (see MONITOR_DRY_RUN above).
set -Eeuo pipefail

DISK_MAX_PCT="${DISK_MAX_PCT:-85}"
MEM_MAX_PCT="${MEM_MAX_PCT:-90}"
SWAP_MAX_PCT="${SWAP_MAX_PCT:-50}"
TLS_MIN_DAYS="${TLS_MIN_DAYS:-14}"
KVM4_AVG_PCT="${KVM4_AVG_PCT:-80}"
MONITOR_DRY_RUN="${MONITOR_DRY_RUN:-0}"

MEM_LOG=/var/log/prestigo/mem-usage.log
MEM_LOG_MAX_AGE_SEC=$((8 * 24 * 3600))
KVM4_MIN_SPAN_SEC=$((7 * 24 * 3600))

ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only)
      shift
      ONLY="${1:-}"
      ;;
    --only=*)
      ONLY="${1#--only=}"
      ;;
  esac
  shift || true
done

log() {
  echo "[monitor] $*"
}

# monitor.env is shell-safe (plain KEY=VALUE, no quotes/spaces) — same
# convention as backup.env (infra/vps/scripts/backup.sh).
# shellcheck disable=SC1091
if [ -f /etc/prestigo/monitor.env ]; then
  set -a
  source /etc/prestigo/monitor.env
  set +a
else
  log "/etc/prestigo/monitor.env not found — all checks will skip pings (owner-account provisioning pending, plan 06 Task 1/2)"
fi

# hc <HC_PING_var_name> <success|fail> <message>
# Mirrors backup.sh's hc() helper: a no-op with a log line instead of an
# error when the named var is unset, and never a real curl under
# MONITOR_DRY_RUN=1 (used to prove the fail branches without paging anyone).
hc() {
  local var_name="$1" kind="$2" msg="${3:-}"
  local url="${!var_name:-}"
  if [ -z "${url}" ]; then
    log "${var_name} not set — skipped (no ping URL)"
    return 0
  fi
  if [ "${MONITOR_DRY_RUN}" = "1" ]; then
    log "WOULD PING ${var_name} ${kind}: ${msg}"
    return 0
  fi
  case "${kind}" in
    success)
      curl -fsS -m 10 --retry 3 "${url}" --data-raw "${msg}" >/dev/null 2>&1 || true
      ;;
    fail)
      curl -fsS -m 10 --retry 3 "${url}/fail" --data-raw "${msg}" >/dev/null 2>&1 || true
      ;;
  esac
}

# --- disk_mem (D-04c) --------------------------------------------------
check_disk_mem() {
  local disk_pct mem_total mem_avail mem_pct swap_total swap_free swap_used swap_pct now msg

  disk_pct=$(df -P / | awk 'NR==2 { gsub("%","",$5); print $5 }')

  mem_total=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
  mem_avail=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
  mem_pct=$(awk -v t="${mem_total}" -v a="${mem_avail}" 'BEGIN { printf "%d", ((t - a) / t) * 100 }')

  swap_total=$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)
  swap_free=$(awk '/^SwapFree:/ { print $2 }' /proc/meminfo)
  if [ "${swap_total}" -gt 0 ]; then
    swap_used=$((swap_total - swap_free))
    swap_pct=$(awk -v u="${swap_used}" -v t="${swap_total}" 'BEGIN { printf "%d", (u / t) * 100 }')
  else
    swap_pct=0
  fi

  now=$(date +%s)
  mkdir -p "$(dirname "${MEM_LOG}")"
  echo "${now} ${mem_pct}" >> "${MEM_LOG}"
  # Drop lines older than 8 days (feeds kvm4_trigger's 7-day rolling window
  # with one extra day of slack).
  awk -v cutoff="$((now - MEM_LOG_MAX_AGE_SEC))" '$1 >= cutoff' "${MEM_LOG}" > "${MEM_LOG}.tmp" 2>/dev/null \
    && mv "${MEM_LOG}.tmp" "${MEM_LOG}"

  msg="disk=${disk_pct}% mem=${mem_pct}% swap=${swap_pct}%"
  if [ "${disk_pct}" -gt "${DISK_MAX_PCT}" ] || [ "${mem_pct}" -gt "${MEM_MAX_PCT}" ] || [ "${swap_pct}" -gt "${SWAP_MAX_PCT}" ]; then
    log "disk_mem FAIL: ${msg} (thresholds disk>${DISK_MAX_PCT}% mem>${MEM_MAX_PCT}% swap>${SWAP_MAX_PCT}%)"
    hc HC_PING_DISK_MEM fail "${msg}"
    return 1
  fi
  log "disk_mem OK: ${msg}"
  hc HC_PING_DISK_MEM success "${msg}"
  return 0
}

# --- kvm4_trigger (D-12) -------------------------------------------------
check_kvm4_trigger() {
  local now oldest span avg span_hours

  now=$(date +%s)
  if [ ! -s "${MEM_LOG}" ]; then
    log "kvm4_trigger OK: no mem-usage history yet"
    hc HC_PING_KVM4 success "no history yet"
    return 0
  fi

  oldest=$(awk 'NR==1 { print $1 }' "${MEM_LOG}")
  span=$((now - oldest))
  span_hours=$((span / 3600))
  if [ "${span}" -lt "${KVM4_MIN_SPAN_SEC}" ]; then
    log "kvm4_trigger OK: history spans ${span_hours}h, need 168h (7d)"
    hc HC_PING_KVM4 success "history spans ${span_hours}h, need 168h"
    return 0
  fi

  avg=$(awk '{ sum += $2; n++ } END { if (n > 0) printf "%d", sum / n; else print 0 }' "${MEM_LOG}")
  if [ "${avg}" -gt "${KVM4_AVG_PCT}" ]; then
    log "kvm4_trigger FAIL: 7-day avg used RAM ${avg}% > ${KVM4_AVG_PCT}%"
    hc HC_PING_KVM4 fail "KVM 4 upgrade trigger (D-12): 7-day avg used RAM ${avg}%"
    return 1
  fi
  log "kvm4_trigger OK: 7-day avg used RAM ${avg}%"
  hc HC_PING_KVM4 success "7-day avg used RAM ${avg}%"
  return 0
}

# --- sidekiq (D-04d) ------------------------------------------------------
check_sidekiq() {
  local redis_pw members member beat now age newest_age=999999

  redis_pw=$(grep '^REDIS_PASSWORD=' /etc/prestigo/chatwoot.env 2>/dev/null | cut -d= -f2-) || true
  if [ -z "${redis_pw}" ]; then
    log "sidekiq FAIL: could not read REDIS_PASSWORD from /etc/prestigo/chatwoot.env"
    hc HC_PING_SIDEKIQ fail "could not read REDIS_PASSWORD"
    return 1
  fi

  members=$(REDISCLI_AUTH="${redis_pw}" docker exec -e REDISCLI_AUTH chatwoot-redis-1 redis-cli SMEMBERS processes 2>/dev/null) || members=""
  now=$(date +%s)

  if [ -n "${members}" ]; then
    while IFS= read -r member; do
      [ -z "${member}" ] && continue
      beat=$(REDISCLI_AUTH="${redis_pw}" docker exec -e REDISCLI_AUTH chatwoot-redis-1 redis-cli HGET "${member}" beat 2>/dev/null) || beat=""
      [ -z "${beat}" ] && continue
      age=$(awk -v now="${now}" -v beat="${beat}" 'BEGIN { printf "%d", now - beat }' 2>/dev/null) || age=999999
      if [ "${age}" -lt "${newest_age}" ]; then
        newest_age="${age}"
      fi
    done <<< "${members}"
  fi
  unset redis_pw

  if [ -z "${members}" ] || [ "${newest_age}" -ge 60 ]; then
    log "sidekiq FAIL: newest heartbeat age=${newest_age}s (need <60s)"
    hc HC_PING_SIDEKIQ fail "newest Sidekiq heartbeat age=${newest_age}s"
    return 1
  fi
  log "sidekiq OK: newest heartbeat age=${newest_age}s"
  hc HC_PING_SIDEKIQ success "newest heartbeat age=${newest_age}s"
  return 0
}

# --- espocrm_internals (D-04d parallel check) ----------------------------
check_espocrm_internals() {
  local daemon_state db_ok=false

  daemon_state=$(docker inspect --format '{{.State.Status}}' espocrm-daemon-1 2>/dev/null) || daemon_state="missing"
  if [ "${daemon_state}" != "running" ]; then
    log "espocrm_internals FAIL: espocrm-daemon-1 state=${daemon_state}"
    hc HC_PING_ESPOCRM fail "espocrm-daemon-1 state=${daemon_state}"
    return 1
  fi

  if docker exec espocrm-db-1 healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
    db_ok=true
  fi

  if [ "${db_ok}" != "true" ]; then
    log "espocrm_internals FAIL: mariadb healthcheck.sh --connect --innodb_initialized failed"
    hc HC_PING_ESPOCRM fail "mariadb healthcheck.sh --connect --innodb_initialized failed"
    return 1
  fi

  log "espocrm_internals OK: daemon running, mariadb healthy"
  hc HC_PING_ESPOCRM success "daemon running, mariadb healthy"
  return 0
}

# --- tls_expiry (D-04b) ---------------------------------------------------
check_tls_expiry() {
  local domain seconds ok=true msgs=""

  seconds=$((TLS_MIN_DAYS * 24 * 3600))
  for domain in chat.rideprestigo.com crm.rideprestigo.com; do
    if echo | openssl s_client -connect "${domain}:443" -servername "${domain}" 2>/dev/null \
        | openssl x509 -noout -checkend "${seconds}" >/dev/null 2>&1; then
      msgs="${msgs}${domain}=ok "
    else
      msgs="${msgs}${domain}=expiring_or_unreachable "
      ok=false
    fi
  done

  if [ "${ok}" != "true" ]; then
    log "tls_expiry FAIL: ${msgs}(threshold ${TLS_MIN_DAYS}d)"
    hc HC_PING_TLS fail "${msgs}(threshold ${TLS_MIN_DAYS}d)"
    return 1
  fi
  log "tls_expiry OK: ${msgs}(threshold ${TLS_MIN_DAYS}d)"
  hc HC_PING_TLS success "${msgs}(threshold ${TLS_MIN_DAYS}d)"
  return 0
}

# --- apps_http (D-02 deviation) ------------------------------------------
# UptimeRobot's Telegram integration is now a paid feature the owner
# declined (UptimeRobot alerts by email only, per monitors.json comments).
# This check restores Telegram coverage for app-level outages through
# Healthchecks.io's own Telegram integration: it fetches both apps' public
# URLs from the VPS itself and checks for the same health markers UptimeRobot
# watches for externally.
check_apps_http() {
  local chat_body crm_body ok=true msgs=""
  # Overridable only for proving the fail branch in a dry run without ever
  # pointing this check at anything other than the real apps in production
  # (e.g. CHAT_HEALTH_URL=https://example.com MONITOR_DRY_RUN=1 — a URL that
  # cannot contain the marker, so the fail path is exercised honestly).
  local chat_url="${CHAT_HEALTH_URL:-https://chat.rideprestigo.com/api}"
  local crm_url="${CRM_HEALTH_URL:-https://crm.rideprestigo.com/}"

  if chat_body=$(curl -fsS -m 10 "${chat_url}" 2>/dev/null) \
      && printf '%s' "${chat_body}" | grep -q '"queue_services":"ok"'; then
    msgs="${msgs}chat=ok "
  else
    msgs="${msgs}chat=fail "
    ok=false
  fi

  if crm_body=$(curl -fsS -m 10 "${crm_url}" 2>/dev/null) \
      && printf '%s' "${crm_body}" | grep -q '<title>EspoCRM</title>'; then
    msgs="${msgs}crm=ok "
  else
    msgs="${msgs}crm=fail "
    ok=false
  fi

  if [ "${ok}" != "true" ]; then
    log "apps_http FAIL: ${msgs}"
    hc HC_PING_APPS_HTTP fail "${msgs}"
    return 1
  fi
  log "apps_http OK: ${msgs}"
  hc HC_PING_APPS_HTTP success "${msgs}"
  return 0
}

# ---------------------------------------------------------------------------
FAILED=0

run_check() {
  local name="$1" fn="$2" rc=0
  if [ -n "${ONLY}" ] && [ "${ONLY}" != "${name}" ]; then
    return 0
  fi
  # Run in a subshell so one check's internal `set -e` exit never aborts the
  # rest of this script — "never aborts the other checks" per this plan.
  ( set -e; "${fn}" ) || rc=$?
  if [ "${rc}" -ne 0 ]; then
    FAILED=1
  fi
}

run_check disk_mem check_disk_mem
run_check kvm4_trigger check_kvm4_trigger
run_check sidekiq check_sidekiq
run_check espocrm_internals check_espocrm_internals
run_check tls_expiry check_tls_expiry
run_check apps_http check_apps_http

exit "${FAILED}"
