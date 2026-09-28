#!/usr/bin/env bash
# infra/vps/scripts/provision-monitors.sh
#
# Idempotent provisioning of the D-01/D-02/D-03 external monitors from
# infra/vps/monitoring/monitors.json. Runs on the Mac (or any machine with
# network access) — NEVER on the VPS, and never as part of any systemd unit.
#
# Reads API keys ONLY from environment variables for the lifetime of this
# one invocation — never written to disk, never echoed, never logged:
#   UPTIMEROBOT_API_KEY   Main API key (uptimerobot.com -> Integrations & API)
#   HEALTHCHECKS_API_KEY  Read-write project API key (healthchecks.io ->
#                          Settings -> API Access)
# Both come from Task 1 of this plan's owner handoff (76-06-PLAN.md) — they
# do not exist until the owner creates both SaaS accounts.
#
# Each section (uptimerobot / healthchecks) runs ONLY when its own key is
# set, so this script degrades gracefully with just one key available, and
# `--status` reports per-service instead of failing outright.
#
# Idempotent by design:
#   - UptimeRobot: matched by friendly_name against a fresh /v3/monitors
#     list; a name that already exists is never re-created.
#   - Healthchecks: created with "unique": ["name"] — the API itself treats a
#     second POST with the same name as an update, not a duplicate create
#     (distinguished here by the create/updated HTTP status: 201 vs 200).
#
# UptimeRobot API version note (discovered live 2026-09-28, per this plan's
# interfaces block's own documented fallback: "if v2 answers with a
# deprecation error, use the documented v3 equivalents"): this account's
# free plan now returns `access_denied: "You are not allowed to use some
# settings with your current plan."` for EVERY v2 POST /newMonitor call,
# including a bare HTTP monitor with no keyword/interval/contacts — i.e.
# monitor CREATION via the v2 API itself is plan-gated, not any individual
# field. v2 reads (getMonitors, getAlertContacts) and v2 editMonitor both
# still work fine on the free plan; only v2 monitor creation is blocked.
# The v3 API (Authorization: Bearer <Main API key>, same key — no separate
# token needed) creates monitors on the same free plan without restriction,
# so this script uses v3 exclusively for the UptimeRobot section.
#
# Usage:
#   UPTIMEROBOT_API_KEY=... HEALTHCHECKS_API_KEY=... bash provision-monitors.sh
#   UPTIMEROBOT_API_KEY=... HEALTHCHECKS_API_KEY=... bash provision-monitors.sh --status
#
# Output: on a create/update run, prints one "ENV_KEY=ping_url" line per
# Healthchecks check between two delimiter lines (pipe straight into
# `ssh prestigo-vps 'sudo install -m 600 -o root -g root /dev/stdin /etc/prestigo/monitor.env'`
# — never let ping URLs sit in a shell history or a file on this Mac).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORS_JSON="${SCRIPT_DIR}/../monitoring/monitors.json"

STATUS_MODE=false
for arg in "$@"; do
  case "${arg}" in
    --status) STATUS_MODE=true ;;
  esac
done

log() {
  echo "[provision-monitors] $*" >&2
}

die() {
  echo "[provision-monitors] ERROR: $*" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq)"
command -v curl >/dev/null 2>&1 || die "curl is required"
[ -f "${MONITORS_JSON}" ] || die "monitors.json not found at ${MONITORS_JSON}"

HAVE_UR=false
HAVE_HC=false
[ -n "${UPTIMEROBOT_API_KEY:-}" ] && HAVE_UR=true
[ -n "${HEALTHCHECKS_API_KEY:-}" ] && HAVE_HC=true

if [ "${HAVE_UR}" != "true" ] && [ "${HAVE_HC}" != "true" ]; then
  die "neither UPTIMEROBOT_API_KEY nor HEALTHCHECKS_API_KEY is set — keys missing. \
See this plan's Task 1 (owner creates both SaaS accounts and hands over the two API keys; \
76-06-PLAN.md). Nothing to do until at least one key is exported."
fi

# ---------------------------------------------------------------------------
# UptimeRobot section
# ---------------------------------------------------------------------------
ur_state_line() {
  # v3 API returns human-readable status strings (UP, DOWN, SEEMS_DOWN,
  # PAUSED, STARTED, ...) — normalize to lowercase for the --status output.
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

run_uptimerobot() {
  local resp emails telegrams contacts_json monitors_resp existing_names created=0 name

  resp=$(curl -fsS -m 20 -H "Authorization: Bearer ${UPTIMEROBOT_API_KEY}" \
    https://api.uptimerobot.com/v3/alert-contacts) \
    || die "uptimerobot: GET /v3/alert-contacts failed"

  echo "${resp}" | jq -e '.data' >/dev/null 2>&1 \
    || die "uptimerobot: GET /v3/alert-contacts returned unexpected shape: $(echo "${resp}" | jq -r '.message // .' 2>/dev/null || echo "${resp}")"

  emails=$(echo "${resp}" | jq -r '[.data[] | select(.type == "Email")] | length')
  telegrams=$(echo "${resp}" | jq -r '[.data[] | select(.type == "Telegram")] | length')
  # D-02 deviation (owner-approved 2026-09-28): UptimeRobot's Telegram
  # integration is now a paid feature the owner declined to buy. UptimeRobot
  # alerts by EMAIL ONLY going forward — a Telegram contact is optional (kept
  # and attached if the owner already has one) but no longer required. The
  # Healthchecks section below still requires both telegram + email: Telegram
  # coverage for app-level outages now comes from Healthchecks' apps_http
  # check instead (see monitor.sh's check_apps_http and monitoring.md).
  if [ "${emails}" -lt 1 ]; then
    die "uptimerobot: need at least one email alert contact — found email=${emails}. \
Add an email alert contact and retry."
  fi
  if [ "${telegrams}" -ge 1 ]; then
    log "uptimerobot: telegram contact present (optional) — will attach to created monitors"
  else
    log "uptimerobot: no telegram contact (expected per D-02 — UptimeRobot Telegram is now a paid \
feature the owner declined); monitors will alert via email only"
  fi

  # v3 assignedAlertContacts shape: [{alertContactId, threshold, recurrence}, ...]
  # — attach every existing contact (email, and telegram if present).
  contacts_json=$(echo "${resp}" | jq -c '[.data[] | {alertContactId: .id, threshold: 0, recurrence: 0}]')

  if [ "${STATUS_MODE}" = "true" ]; then
    monitors_resp=$(curl -fsS -m 20 -H "Authorization: Bearer ${UPTIMEROBOT_API_KEY}" \
      https://api.uptimerobot.com/v3/monitors) \
      || die "uptimerobot: GET /v3/monitors (status) failed"
    echo "${monitors_resp}" | jq -e '.data' >/dev/null 2>&1 \
      || die "uptimerobot: GET /v3/monitors (status) returned unexpected shape"
    jq -r --slurpfile mj "${MONITORS_JSON}" '
      ($mj[0].uptimerobot | map(.friendly_name)) as $wanted
      | .data[]
      | select(.friendlyName as $n | $wanted | index($n))
      | "\(.friendlyName)\t\(.status)"
    ' <<<"${monitors_resp}" | while IFS=$'\t' read -r fname status; do
      echo "uptimerobot ${fname} $(ur_state_line "${status}")"
    done
    return 0
  fi

  monitors_resp=$(curl -fsS -m 20 -H "Authorization: Bearer ${UPTIMEROBOT_API_KEY}" \
    https://api.uptimerobot.com/v3/monitors) \
    || die "uptimerobot: GET /v3/monitors failed"
  echo "${monitors_resp}" | jq -e '.data' >/dev/null 2>&1 \
    || die "uptimerobot: GET /v3/monitors returned unexpected shape"
  existing_names=$(echo "${monitors_resp}" | jq -r '.data[].friendlyName')

  while IFS= read -r name; do
    [ -z "${name}" ] && continue
    if grep -qxF "${name}" <<<"${existing_names}"; then
      log "uptimerobot: '${name}' already exists — skipping"
      continue
    fi
    local url keyword_value interval create_resp create_status body payload
    url=$(jq -r --arg n "${name}" '.uptimerobot[] | select(.friendly_name == $n) | .url' "${MONITORS_JSON}")
    keyword_value=$(jq -r --arg n "${name}" '.uptimerobot[] | select(.friendly_name == $n) | .keyword_value' "${MONITORS_JSON}")
    interval=$(jq -r --arg n "${name}" '.uptimerobot[] | select(.friendly_name == $n) | .interval' "${MONITORS_JSON}")

    # v2's keyword_type 2 ("alert when keyword is MISSING") maps to v3's
    # ALERT_NOT_EXISTS — monitors.json's schema stays v2-shaped (the stable,
    # versioned contract); this is the only place that translates it.
    payload=$(jq -n --arg name "${name}" --arg url "${url}" --arg kw "${keyword_value}" \
      --argjson interval "${interval}" --argjson contacts "${contacts_json}" '
        {type: "KEYWORD", url: $url, friendlyName: $name, interval: $interval, timeout: 30,
         keywordValue: $kw, keywordType: "ALERT_NOT_EXISTS", keywordCaseType: "CaseSensitive",
         assignedAlertContacts: $contacts}
      ')

    create_resp=$(curl -fsS -m 20 -w '\n%{http_code}' -X POST https://api.uptimerobot.com/v3/monitors \
      -H "Authorization: Bearer ${UPTIMEROBOT_API_KEY}" -H "Content-Type: application/json" \
      -d "${payload}") \
      || die "uptimerobot: POST /v3/monitors failed for '${name}'"
    create_status=$(echo "${create_resp}" | tail -1)
    body=$(echo "${create_resp}" | sed '$d')

    case "${create_status}" in
      200|201)
        log "uptimerobot: created '${name}'"
        created=$((created + 1))
        ;;
      *)
        die "uptimerobot: create failed for '${name}' (HTTP ${create_status}): $(echo "${body}" | jq -r '.message // .error // .' 2>/dev/null || echo "${body}")"
        ;;
    esac
  done < <(jq -r '.uptimerobot[].friendly_name' "${MONITORS_JSON}")

  log "uptimerobot: created=${created}"
}

# ---------------------------------------------------------------------------
# Healthchecks section
# ---------------------------------------------------------------------------
run_healthchecks() {
  local channels_resp has_email has_telegram created=0 name env_line
  local -a env_lines=()

  channels_resp=$(curl -fsS -m 20 https://healthchecks.io/api/v3/channels/ \
    -H "X-Api-Key: ${HEALTHCHECKS_API_KEY}") \
    || die "healthchecks: GET /channels/ failed"

  has_email=$(echo "${channels_resp}" | jq -r '[.channels[]? | select(.kind == "email")] | length')
  has_telegram=$(echo "${channels_resp}" | jq -r '[.channels[]? | select(.kind == "telegram")] | length')
  if [ "${has_email:-0}" -lt 1 ] || [ "${has_telegram:-0}" -lt 1 ]; then
    die "healthchecks: need at least one 'email' AND one 'telegram' channel — \
found email=${has_email:-0} telegram=${has_telegram:-0}. Finish the Telegram bot handshake \
(Task 1) and retry."
  fi

  if [ "${STATUS_MODE}" = "true" ]; then
    local checks_resp
    checks_resp=$(curl -fsS -m 20 https://healthchecks.io/api/v3/checks/ \
      -H "X-Api-Key: ${HEALTHCHECKS_API_KEY}") \
      || die "healthchecks: GET /checks/ (status) failed"
    jq -r --slurpfile mj "${MONITORS_JSON}" '
      ($mj[0].healthchecks | map(.name)) as $wanted
      | .checks[]
      | select(.name as $n | $wanted | index($n))
      | "\(.name)\t\(.status)"
    ' <<<"${checks_resp}" | while IFS=$'\t' read -r cname status; do
      echo "healthchecks ${cname} ${status}"
    done
    return 0
  fi

  while IFS= read -r name; do
    [ -z "${name}" ] && continue
    local timeout grace tags desc create_resp http_status body
    timeout=$(jq -r --arg n "${name}" '.healthchecks[] | select(.name == $n) | .timeout' "${MONITORS_JSON}")
    grace=$(jq -r --arg n "${name}" '.healthchecks[] | select(.name == $n) | .grace' "${MONITORS_JSON}")
    tags=$(jq -r --arg n "${name}" '.healthchecks[] | select(.name == $n) | .tags' "${MONITORS_JSON}")
    desc=$(jq -r --arg n "${name}" '.healthchecks[] | select(.name == $n) | .desc' "${MONITORS_JSON}")

    create_resp=$(curl -fsS -m 20 -w '\n%{http_code}' -X POST https://healthchecks.io/api/v3/checks/ \
      -H "X-Api-Key: ${HEALTHCHECKS_API_KEY}" -H "Content-Type: application/json" \
      -d "$(jq -n --arg name "${name}" --arg tags "${tags}" --arg desc "${desc}" \
             --argjson timeout "${timeout}" --argjson grace "${grace}" \
             '{name: $name, tags: $tags, desc: $desc, timeout: $timeout, grace: $grace, channels: "*", unique: ["name"]}')") \
      || die "healthchecks: POST /checks/ failed for '${name}'"
    http_status=$(echo "${create_resp}" | tail -1)
    body=$(echo "${create_resp}" | sed '$d')

    case "${http_status}" in
      201)
        log "healthchecks: created '${name}'"
        created=$((created + 1))
        ;;
      200)
        log "healthchecks: '${name}' already exists — skipping"
        ;;
      *)
        die "healthchecks: unexpected status ${http_status} for '${name}': $(echo "${body}" | jq -r '.error // .')"
        ;;
    esac

    local env_key ping_url
    env_key=$(jq -r --arg n "${name}" '.healthchecks[] | select(.name == $n) | .env_key' "${MONITORS_JSON}")
    ping_url=$(echo "${body}" | jq -r '.ping_url')
    env_lines+=("${env_key}=${ping_url}")
  done < <(jq -r '.healthchecks[].name' "${MONITORS_JSON}")

  log "healthchecks: created=${created}"

  echo "--- MONITOR ENV (pipe to: ssh prestigo-vps 'sudo install -m 600 -o root -g root /dev/stdin /etc/prestigo/monitor.env') ---"
  for env_line in "${env_lines[@]}"; do
    echo "${env_line}"
  done
  echo "--- END MONITOR ENV ---"
}

# ---------------------------------------------------------------------------
if [ "${HAVE_UR}" = "true" ]; then
  run_uptimerobot
else
  log "UPTIMEROBOT_API_KEY not set — skipping uptimerobot section"
fi

if [ "${HAVE_HC}" = "true" ]; then
  run_healthchecks
else
  log "HEALTHCHECKS_API_KEY not set — skipping healthchecks section"
fi
