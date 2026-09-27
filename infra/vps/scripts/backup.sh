#!/usr/bin/env bash
# infra/vps/scripts/backup.sh
#
# Nightly (or manual) backup job for Chatwoot + EspoCRM (D-06):
#   1. pg_dump Chatwoot's Postgres
#   2. mariadb-dump EspoCRM's MariaDB
#   3. ONE restic snapshot of the dumps + the four data volumes + the app env
#      files + /opt/prestigo (backup.env itself is deliberately never
#      included) — captured immediately after the dumps so DB and files
#      match (Pitfall 14)
#   4. restic forget --prune with the D-07 retention shape
#   5. On Sundays, a partial `restic check --read-data-subset=5%`
#   6. Healthchecks.io ping: start / success / fail (D-03) — a no-op with a
#      log line when HC_PING_BACKUP is unset (plan 06 wires it)
#
# Usage:
#   sudo bash backup.sh              # normal run
#   sudo bash backup.sh --init-repo  # one-time: initialize the restic repo first
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTIC="${SCRIPT_DIR}/restic.sh"

DUMP_DIR=/var/backups/prestigo/dumps
LOCK_FILE=/run/prestigo-backup.lock

INIT_REPO=false
for arg in "$@"; do
  case "${arg}" in
    --init-repo) INIT_REPO=true ;;
  esac
done

log() {
  echo "[backup] $*"
}

# Non-blocking lock: if a previous run is still in progress, skip this one
# rather than racing two restic invocations against the same repo.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "another backup run is already in progress (lock held) — exiting"
  exit 0
fi

# backup.env / monitor.env are shell-safe (plain KEY=VALUE, no quotes/spaces).
# shellcheck disable=SC1091
set -a
source /etc/prestigo/backup.env
if [ -f /etc/prestigo/monitor.env ]; then
  source /etc/prestigo/monitor.env
fi
set +a

CURRENT_STEP="startup"

hc() {
  local kind="$1" msg="${2:-}"
  if [ -z "${HC_PING_BACKUP:-}" ]; then
    log "HC_PING_BACKUP not set — skipping ${kind} ping (wired by plan 06)"
    return 0
  fi
  case "${kind}" in
    start)
      curl -fsS -m 10 --retry 5 "${HC_PING_BACKUP}/start" --data-raw "${msg}" >/dev/null 2>&1 || true
      ;;
    success)
      curl -fsS -m 10 --retry 5 "${HC_PING_BACKUP}" --data-raw "${msg}" >/dev/null 2>&1 || true
      ;;
    fail)
      curl -fsS -m 10 --retry 5 "${HC_PING_BACKUP}/fail" --data-raw "${msg}" >/dev/null 2>&1 || true
      ;;
  esac
}

on_err() {
  local exit_code=$?
  log "FAILED at step: ${CURRENT_STEP} (exit ${exit_code})"
  hc fail "backup failed at step: ${CURRENT_STEP}"
  exit "${exit_code}"
}
trap on_err ERR

hc start "backup starting"

CURRENT_STEP="init-repo-check"
if [ "${INIT_REPO}" = "true" ]; then
  if ! "${RESTIC}" cat config >/dev/null 2>&1; then
    log "restic repository not found — initializing"
    "${RESTIC}" init
  else
    log "restic repository already initialized — skipping init"
  fi
fi

CURRENT_STEP="dump-chatwoot"
mkdir -p "${DUMP_DIR}"
chmod 0700 "${DUMP_DIR}"
log "dumping Chatwoot Postgres (chatwoot_production)"
docker exec chatwoot-postgres-1 pg_dump -Fc -U postgres chatwoot_production > "${DUMP_DIR}/chatwoot.dump.tmp"
mv "${DUMP_DIR}/chatwoot.dump.tmp" "${DUMP_DIR}/chatwoot.dump"

CURRENT_STEP="dump-espocrm"
log "dumping EspoCRM MariaDB (espocrm)"
ESPOCRM_ROOT_PW=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
docker exec -e MYSQL_PWD="${ESPOCRM_ROOT_PW}" espocrm-db-1 \
  mariadb-dump --single-transaction --quick --routines --triggers --events \
  -u root espocrm > "${DUMP_DIR}/espocrm.sql.tmp"
unset ESPOCRM_ROOT_PW
mv "${DUMP_DIR}/espocrm.sql.tmp" "${DUMP_DIR}/espocrm.sql"

CURRENT_STEP="resolve-volumes"
log "resolving volume mountpoints"
CHATWOOT_STORAGE=$(docker volume inspect chatwoot_storage_data --format '{{.Mountpoint}}')
ESPOCRM_APP_DATA=$(docker volume inspect espocrm_app_data --format '{{.Mountpoint}}')
ESPOCRM_APP_CUSTOM=$(docker volume inspect espocrm_app_custom --format '{{.Mountpoint}}')
ESPOCRM_APP_CUSTOM_CLIENT=$(docker volume inspect espocrm_app_custom_client --format '{{.Mountpoint}}')

CURRENT_STEP="snapshot"
log "creating restic snapshot (dumps + volumes + app env files + /opt/prestigo)"
BACKUP_PATHS=(
  "${DUMP_DIR}"
  "${CHATWOOT_STORAGE}"
  "${ESPOCRM_APP_DATA}"
  "${ESPOCRM_APP_CUSTOM}"
  "${ESPOCRM_APP_CUSTOM_CLIENT}"
  /etc/prestigo/chatwoot.env
  /etc/prestigo/espocrm.env
  /etc/prestigo/smtp.env
)
if [ -f /etc/prestigo/monitor.env ]; then
  BACKUP_PATHS+=(/etc/prestigo/monitor.env)
fi
BACKUP_PATHS+=(/opt/prestigo)

BACKUP_JSON=$("${RESTIC}" backup --host prestigo-vps --tag nightly --json "${BACKUP_PATHS[@]}" | tail -1)
SNAPSHOT_ID=$(echo "${BACKUP_JSON}" | jq -r '.snapshot_id // "unknown"')
DATA_ADDED=$(echo "${BACKUP_JSON}" | jq -r '.data_added // 0')
BACKUP_DURATION=$(echo "${BACKUP_JSON}" | jq -r '.total_duration // 0')
log "snapshot ${SNAPSHOT_ID}: data_added=${DATA_ADDED} bytes, duration=${BACKUP_DURATION}s"

CURRENT_STEP="prune"
log "pruning old snapshots (7 daily / 4 weekly / 6 monthly)"
"${RESTIC}" forget --host prestigo-vps --tag nightly \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

CURRENT_STEP="integrity-check"
if [ "$(date +%u)" = "7" ]; then
  log "Sunday — running partial integrity check (--read-data-subset=5%)"
  "${RESTIC}" check --read-data-subset=5%
else
  log "not Sunday — skipping the weekly partial integrity check"
fi

CURRENT_STEP="done"
hc success "backup OK: snapshot ${SNAPSHOT_ID}, data_added=${DATA_ADDED} bytes, duration=${BACKUP_DURATION}s"
log "backup complete: snapshot ${SNAPSHOT_ID}"
