#!/usr/bin/env bash
# infra/vps/scripts/backup.sh
#
# Nightly (or manual) backup job for Chatwoot + EspoCRM (D-06):
#   1. Pre-dump D-09 integrity baseline (drill-verify.sh --baseline), written
#      into the dump dir so it travels inside this run's snapshot. A failure
#      here does NOT abort the backup (the data is still worth capturing) —
#      it is logged, remembered, and turned into a Healthchecks /fail ping
#      at the very end instead of /success (plan 08).
#   2. pg_dump Chatwoot's Postgres
#   3. mariadb-dump EspoCRM's MariaDB
#   4. ONE restic snapshot of the dumps (baseline + DB dumps) + the four
#      data volumes + the app env files + /opt/prestigo (backup.env itself
#      is deliberately never included) — captured immediately after the
#      dumps so DB and files match (Pitfall 14)
#   5. restic forget --prune with the D-07 retention shape
#   6. On Sundays, a partial `restic check --read-data-subset=5%`
#   7. Healthchecks.io ping: start / success / fail (D-03) — a no-op with a
#      log line when HC_PING_BACKUP is unset (plan 06 wires it)
#
# Usage:
#   sudo bash backup.sh              # normal run
#   sudo bash backup.sh --init-repo  # one-time: initialize the restic repo first
#
# Production-host guard (WR-05): refuses to run unless `hostname` is
# prestigo-vps (see infra/vps/runbooks/host-bootstrap.md's one-time
# hostname-setup step this depends on), so a copy of this script
# accidentally run on the D-09 drill host (which temporarily holds valid
# production restic credentials) cannot push a snapshot into the
# production B2 repository. Override only for a deliberate non-standard
# manual run:
#   sudo bash backup.sh --i-understand-this-is-not-the-production-host
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTIC="${SCRIPT_DIR}/restic.sh"
DRILL_VERIFY="${SCRIPT_DIR}/drill-verify.sh"

DUMP_DIR=/var/backups/prestigo/dumps
LOCK_FILE=/run/prestigo-backup.lock
INTEGRITY_BASELINE_FAILED=false

INIT_REPO=false
FORCE_NON_PROD_OVERRIDE=false
for arg in "$@"; do
  case "${arg}" in
    --init-repo) INIT_REPO=true ;;
    --i-understand-this-is-not-the-production-host) FORCE_NON_PROD_OVERRIDE=true ;;
  esac
done

log() {
  echo "[backup] $*"
}

# WR-05: restic.sh hardcodes --hostname prestigo-vps and backup.sh tags
# every snapshot --host prestigo-vps --tag nightly regardless of which
# machine actually runs it. The D-09 drill runbook requires copying the
# real /etc/prestigo/backup.env (live B2 credentials) onto a disposable
# drill host so restore.sh --phase fetch can pull a snapshot - if backup.sh
# is ever run by mistake on that same drill host, it pushes a new snapshot
# into the SAME production B2 repository, indistinguishable from a real
# nightly backup, and the next `restic forget --prune` folds it into
# production's own retention rotation. Refuse to run unless this machine's
# own hostname is prestigo-vps (mirrors drill-verify.sh's guard; see
# infra/vps/runbooks/host-bootstrap.md for the one-time hostname setup this
# depends on), with an explicit override for the rare case of a deliberate
# manual/ad-hoc backup from a non-standard host.
if [ "$(hostname)" != "prestigo-vps" ] && [ "${FORCE_NON_PROD_OVERRIDE}" != "true" ]; then
  echo "[backup] refusing to run: hostname is $(hostname), not prestigo-vps. backup.sh must only run on the real production host (see infra/vps/runbooks/host-bootstrap.md) — pass --i-understand-this-is-not-the-production-host to override" >&2
  exit 1
fi

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

CURRENT_STEP="integrity-baseline"
mkdir -p "${DUMP_DIR}"
chmod 0700 "${DUMP_DIR}"
if [ -x "${DRILL_VERIFY}" ]; then
  log "running pre-dump integrity baseline (drill-verify.sh --baseline)"
  if "${DRILL_VERIFY}" --baseline --out "${DUMP_DIR}/drill-baseline.json"; then
    log "integrity baseline OK"
  else
    log "integrity baseline FAILED (see lines above) — continuing backup, will ping fail at the end (D-03/plan 08)"
    INTEGRITY_BASELINE_FAILED=true
  fi
else
  log "drill-verify.sh not present or not executable — skipping pre-dump integrity baseline (plan 08 not yet deployed)"
fi

CURRENT_STEP="dump-chatwoot"
log "dumping Chatwoot Postgres (chatwoot_production)"
docker exec chatwoot-postgres-1 pg_dump -Fc -U postgres chatwoot_production > "${DUMP_DIR}/chatwoot.dump.tmp"
mv "${DUMP_DIR}/chatwoot.dump.tmp" "${DUMP_DIR}/chatwoot.dump"

CURRENT_STEP="dump-espocrm"
log "dumping EspoCRM MariaDB (espocrm)"
ESPOCRM_ROOT_PW=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
# WR-01: `-e MYSQL_PWD` (no inline value) forwards MYSQL_PWD from the
# `docker` client's OWN process environment (set here via the leading
# assignment) rather than embedding the password as a literal `docker`
# argv element visible to `ps auxww` / `/proc/<pid>/cmdline` for the
# duration of the call — same pattern monitor.sh already uses for
# REDISCLI_AUTH.
MYSQL_PWD="${ESPOCRM_ROOT_PW}" docker exec -e MYSQL_PWD espocrm-db-1 \
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
if [ "${INTEGRITY_BASELINE_FAILED}" = "true" ]; then
  hc fail "backup ok but integrity baseline failed: snapshot ${SNAPSHOT_ID}, data_added=${DATA_ADDED} bytes, duration=${BACKUP_DURATION}s"
  log "backup complete (snapshot ${SNAPSHOT_ID}) but pinged FAIL: integrity baseline failed — data was still captured, see log above"
else
  hc success "backup OK: snapshot ${SNAPSHOT_ID}, data_added=${DATA_ADDED} bytes, duration=${BACKUP_DURATION}s"
  log "backup complete: snapshot ${SNAPSHOT_ID}"
fi
