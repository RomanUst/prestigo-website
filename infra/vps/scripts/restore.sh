#!/usr/bin/env bash
# infra/vps/scripts/restore.sh
#
# Restore tooling for Chatwoot + EspoCRM restic/B2 snapshots (D-08/D-09).
# Prints one "=== step ===" / "--- step done in Ns ---" pair per step (so a
# drill log can record per-step timings) and a final PASS/FAIL summary line.
#
# Modes:
#   --verify-only
#     Production-safe, READ-ONLY rehearsal: restores the latest (or --snapshot
#     ID) snapshot into a ROOT-ONLY /var/backups/prestigo/restore-rehearsal
#     directory, proves the Chatwoot dump lists its tables, the EspoCRM dump
#     contains its schema, drill-baseline.json is present, and both canary
#     files match their checksum from that baseline — then ALWAYS deletes the
#     rehearsal directory (trap on EXIT). Never starts, stops, or touches any
#     running container.
#
#   --drill --phase fetch | --phase start
#     DISPOSABLE HOST ONLY (plan 76-09's temporary Hetzner box). Restores a
#     snapshot, installs the restored env files with the D-09 drill URL
#     overrides (FRONTEND_URL=http://localhost:13000,
#     ESPOCRM_SITE_URL=http://localhost:18080), then (in --phase start,
#     refusing unless outbound egress is proven blocked) restores the DB
#     dumps and starts ONLY chatwoot rails + espocrm app — never Sidekiq or
#     the EspoCRM daemon (D-09: no mailbox polling/sending from a restored
#     instance).
#
#   --full
#     Disaster-recovery restore onto a REPLACEMENT production host: same as
#     --drill but without the URL overrides or the egress requirement,
#     starting every service (including Sidekiq/daemon), then reinstalling
#     the backup/monitor timers and the Caddy stack. Remember to switch DNS
#     per infra/vps/runbooks/dns.md afterwards.
#
# Production-host interlock (mirrors drill-verify.sh's own hostname guard,
# infra/vps/runbooks/backup-restore.md, infra/vps/runbooks/restore-drill.md):
#   --drill is ALWAYS refused when `hostname` is `prestigo-vps` — that mode
#     is disposable-host only and must never touch the live host.
#   --full is refused on hostname `prestigo-vps` UNLESS the caller also
#     passes --i-understand-this-overwrites-production. This flag exists
#     solely for the rare case where the live host itself is the disaster
#     (e.g. restoring in place after data corruption) — a fresh replacement
#     host is never named prestigo-vps yet, so the normal disaster-recovery
#     path never needs this flag.
#   --verify-only is never blocked — it is read-only by design (see above).
#
# Usage:
#   sudo bash restore.sh --verify-only [--snapshot ID]
#   sudo bash restore.sh --drill --phase fetch [--snapshot ID]
#   sudo bash restore.sh --drill --phase start
#   sudo bash restore.sh --full [--snapshot ID]
#   sudo bash restore.sh --full --i-understand-this-overwrites-production [--snapshot ID]  # only on the live host itself
#
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTIC="${SCRIPT_DIR}/restic.sh"

PGVECTOR_IMAGE="${PGVECTOR_IMAGE:-pgvector/pgvector:0.8.6-pg16}"

MODE=""
PHASE=""
SNAPSHOT="latest"
FORCE_PROD_OVERRIDE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --verify-only) MODE="verify-only"; shift ;;
    --drill) MODE="drill"; shift ;;
    --full) MODE="full"; shift ;;
    --phase) PHASE="${2:-}"; shift 2 ;;
    --snapshot) SNAPSHOT="${2:-}"; shift 2 ;;
    --i-understand-this-overwrites-production) FORCE_PROD_OVERRIDE=true; shift ;;
    *)
      echo "[restore] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ -z "${MODE}" ]; then
  echo "[restore] must pass --verify-only, --drill, or --full" >&2
  exit 1
fi
if [ "${MODE}" = "drill" ] && [ "${PHASE}" != "fetch" ] && [ "${PHASE}" != "start" ]; then
  echo "[restore] --drill requires --phase fetch or --phase start" >&2
  exit 1
fi

# Production-host interlock (CR-01): --verify-only is read-only and always
# safe. --drill is disposable-host only, full stop — no override exists,
# same as drill-verify.sh's own hostname guard. --full is a real
# disaster-recovery path that MUST be able to run onto a REPLACEMENT host
# (which will never be named prestigo-vps), so it is refused on the live
# host unless the operator explicitly opts in.
if [ "$(hostname)" = "prestigo-vps" ]; then
  case "${MODE}" in
    drill)
      echo "[restore] refusing --drill on hostname prestigo-vps (production) — this mode is disposable-host only, see infra/vps/runbooks/restore-drill.md" >&2
      exit 1
      ;;
    full)
      if [ "${FORCE_PROD_OVERRIDE}" != "true" ]; then
        echo "[restore] refusing --full on hostname prestigo-vps (production) without --i-understand-this-overwrites-production — a disaster-recovery restore is meant for a REPLACEMENT host; see infra/vps/runbooks/backup-restore.md" >&2
        exit 1
      fi
      echo "[restore] WARNING: --full invoked on production host prestigo-vps with --i-understand-this-overwrites-production — proceeding to overwrite this host's env files and databases" >&2
      ;;
  esac
fi

log() {
  echo "[restore] $*"
}

STEP_START=0
step_start() {
  log "=== $1 ==="
  STEP_START=$(date +%s)
}
step_end() {
  local now
  now=$(date +%s)
  log "--- $1 done in $((now - STEP_START))s ---"
}

resolve_snapshot_id() {
  local json
  if [ "${SNAPSHOT}" = "latest" ]; then
    json=$("${RESTIC}" snapshots --host prestigo-vps --latest 1 --json 2>/dev/null || echo '[]')
  else
    json=$("${RESTIC}" snapshots "${SNAPSHOT}" --json 2>/dev/null || echo '[]')
  fi
  echo "${json}" | jq -r '.[0].short_id // "unknown"'
}

# ============================================================================
# --verify-only : production-safe, read-only rehearsal
# ============================================================================
REHEARSAL_DIR=""
cleanup_rehearsal() {
  if [ -n "${REHEARSAL_DIR}" ] && [ -d "${REHEARSAL_DIR}" ]; then
    rm -rf "${REHEARSAL_DIR}"
    log "rehearsal directory removed: ${REHEARSAL_DIR}"
  fi
}

run_verify_only() {
  local rehearsal=/var/backups/prestigo/restore-rehearsal
  REHEARSAL_DIR="${rehearsal}"
  trap cleanup_rehearsal EXIT

  step_start "resolve-snapshot"
  RESOLVED_SNAPSHOT_ID=$(resolve_snapshot_id)
  log "resolved snapshot: ${RESOLVED_SNAPSHOT_ID}"
  step_end "resolve-snapshot"

  step_start "free-space-check"
  local avail_kb
  avail_kb=$(df --output=avail -k /var/backups/prestigo | tail -1 | tr -d ' ')
  # 2 GiB floor - a sane minimum for a rehearsal restore of dumps + all four volumes.
  if [ "${avail_kb}" -lt 2097152 ]; then
    echo "[restore] FAIL free-space-check: only ${avail_kb}KB available under /var/backups/prestigo" >&2
    exit 1
  fi
  log "OK free-space-check: ${avail_kb}KB available"
  step_end "free-space-check"

  step_start "restic-restore"
  mkdir -p "${rehearsal}"
  chmod 0700 "${rehearsal}"
  "${RESTIC}" restore "${SNAPSHOT}" --host prestigo-vps --target "${rehearsal}"
  step_end "restic-restore"

  step_start "verify-dumps"
  local dump_dir
  dump_dir=$(find "${rehearsal}" -type d -path '*/var/backups/prestigo/dumps' | head -1)
  if [ -z "${dump_dir}" ]; then
    echo "[restore] FAIL verify-dumps: dump directory not found in the rehearsal restore" >&2
    exit 1
  fi

  if [ ! -f "${dump_dir}/chatwoot.dump" ]; then
    echo "[restore] FAIL verify-dumps: chatwoot.dump not found" >&2
    exit 1
  fi
  # Captured into a variable, then fed to grep via a HERE-STRING (<<<), not a
  # `... | grep -q` pipe. `grep -q` returns as soon as it finds a match,
  # closing its stdin early; on a live pipe the still-writing producer gets
  # SIGPIPE, and under `set -o pipefail` bash reports the PRODUCER's non-zero
  # (SIGPIPE-killed) exit status for the whole pipeline even though grep
  # itself matched — an intermittent false FAIL that depends on process
  # scheduling. A here-string has bash write the content to a temp fd BEFORE
  # grep ever starts, so there is no concurrent writer left to SIGPIPE.
  PG_RESTORE_LIST=$(docker run --rm -v "${dump_dir}:/dumps:ro" "${PGVECTOR_IMAGE}" pg_restore --list /dumps/chatwoot.dump)
  if ! grep -qw conversations <<< "${PG_RESTORE_LIST}"; then
    echo "[restore] FAIL verify-dumps: pg_restore --list on chatwoot.dump does not list the conversations table" >&2
    exit 1
  fi
  log "OK chatwoot.dump lists the conversations table (pg_restore --list, ${PGVECTOR_IMAGE})"

  if [ ! -f "${dump_dir}/espocrm.sql" ]; then
    echo "[restore] FAIL verify-dumps: espocrm.sql not found" >&2
    exit 1
  fi
  if ! grep -qi 'CREATE TABLE.*`account`' "${dump_dir}/espocrm.sql"; then
    echo "[restore] FAIL verify-dumps: espocrm.sql does not contain the account table definition" >&2
    exit 1
  fi
  log "OK espocrm.sql contains the account table definition"

  if [ ! -f "${dump_dir}/drill-baseline.json" ]; then
    echo "[restore] FAIL verify-dumps: drill-baseline.json not present in this snapshot" >&2
    exit 1
  fi
  log "OK drill-baseline.json present"
  step_end "verify-dumps"

  step_start "verify-canary-checksums"
  local canary_sha blob_key storage_dir shard1 shard2 blob_path actual_sha
  canary_sha=$(jq -r '.canarySha256' "${dump_dir}/drill-baseline.json")
  blob_key=$(jq -r '.chatwoot.canary.blob_key' "${dump_dir}/drill-baseline.json")
  storage_dir=$(find "${rehearsal}" -type d -path '*chatwoot_storage_data/_data' | head -1)
  if [ -z "${blob_key}" ] || [ "${blob_key}" = "null" ] || [ -z "${storage_dir}" ]; then
    echo "[restore] FAIL verify-canary-checksums: could not resolve Chatwoot canary blob key / storage dir from baseline" >&2
    exit 1
  fi
  shard1=${blob_key:0:2}
  shard2=${blob_key:2:2}
  blob_path="${storage_dir}/${shard1}/${shard2}/${blob_key}"
  if [ ! -f "${blob_path}" ]; then
    echo "[restore] FAIL verify-canary-checksums: Chatwoot canary blob not found at ${blob_path}" >&2
    exit 1
  fi
  actual_sha=$(sha256sum "${blob_path}" | cut -d' ' -f1)
  if [ "${actual_sha}" != "${canary_sha}" ]; then
    echo "[restore] FAIL verify-canary-checksums: Chatwoot canary blob sha256 ${actual_sha} != ${canary_sha}" >&2
    exit 1
  fi
  log "OK Chatwoot canary blob checksum matches (${canary_sha})"

  local espo_attachment_id espo_data_dir upload_path
  espo_attachment_id=$(jq -r '.espocrm.canary.attachment_id' "${dump_dir}/drill-baseline.json")
  espo_data_dir=$(find "${rehearsal}" -type d -path '*espocrm_app_data/_data' | head -1)
  if [ -z "${espo_attachment_id}" ] || [ "${espo_attachment_id}" = "null" ] || [ -z "${espo_data_dir}" ]; then
    echo "[restore] FAIL verify-canary-checksums: could not resolve EspoCRM canary attachment id / app data dir from baseline" >&2
    exit 1
  fi
  upload_path="${espo_data_dir}/upload/${espo_attachment_id}"
  if [ ! -f "${upload_path}" ]; then
    echo "[restore] FAIL verify-canary-checksums: EspoCRM canary upload not found at ${upload_path}" >&2
    exit 1
  fi
  actual_sha=$(sha256sum "${upload_path}" | cut -d' ' -f1)
  if [ "${actual_sha}" != "${canary_sha}" ]; then
    echo "[restore] FAIL verify-canary-checksums: EspoCRM canary upload sha256 ${actual_sha} != ${canary_sha}" >&2
    exit 1
  fi
  log "OK EspoCRM canary upload checksum matches (${canary_sha})"
  step_end "verify-canary-checksums"

  log "PASS verify-only: snapshot=${RESOLVED_SNAPSHOT_ID} — no running container was touched; rehearsal directory will be removed on exit"
}

# ============================================================================
# --drill / --full : fetch phase (disposable host, or replacement host for --full)
# ============================================================================
run_fetch() {
  local apply_overrides="${1:-true}"
  local staging=/var/backups/prestigo/restore-staging

  if [ ! -s /etc/prestigo/backup.env ]; then
    echo "[restore] FAIL: --phase fetch requires /etc/prestigo/backup.env (the password-manager copy, D-08) — not found or empty" >&2
    exit 1
  fi

  step_start "resolve-snapshot"
  RESOLVED_SNAPSHOT_ID=$(resolve_snapshot_id)
  log "resolved snapshot: ${RESOLVED_SNAPSHOT_ID}"
  step_end "resolve-snapshot"

  step_start "restic-restore-staging"
  mkdir -p "${staging}"
  chmod 0700 "${staging}"
  "${RESTIC}" restore "${SNAPSHOT}" --host prestigo-vps --target "${staging}"
  step_end "restic-restore-staging"

  step_start "install-env-files"
  install -d -m 0700 -o root -g root /etc/prestigo
  local etc_src="${staging}/etc/prestigo" f
  for f in chatwoot.env espocrm.env smtp.env monitor.env; do
    if [ -f "${etc_src}/${f}" ]; then
      install -m 0600 -o root -g root "${etc_src}/${f}" "/etc/prestigo/${f}"
      log "installed /etc/prestigo/${f}"
    else
      log "note: ${f} not present in this snapshot — skipping (monitor.env is optional pre-plan-06)"
    fi
  done
  step_end "install-env-files"

  step_start "apply-drill-url-overrides"
  if [ "${apply_overrides}" = "true" ]; then
    if [ -f /etc/prestigo/chatwoot.env ]; then
      sed -i 's#^FRONTEND_URL=.*#FRONTEND_URL=http://localhost:13000#' /etc/prestigo/chatwoot.env
    fi
    if [ -f /etc/prestigo/espocrm.env ]; then
      sed -i 's#^ESPOCRM_SITE_URL=.*#ESPOCRM_SITE_URL=http://localhost:18080#' /etc/prestigo/espocrm.env
    fi
    log "applied D-09 drill URL overrides (FRONTEND_URL=http://localhost:13000, ESPOCRM_SITE_URL=http://localhost:18080) — drill host env copies only, never production"
  else
    log "--full: keeping the restored production URLs (FRONTEND_URL/ESPOCRM_SITE_URL) as-is"
  fi
  step_end "apply-drill-url-overrides"

  step_start "place-dumps"
  mkdir -p /var/backups/prestigo/dumps
  chmod 0700 /var/backups/prestigo/dumps
  local dump_src
  dump_src=$(find "${staging}" -type d -path '*/var/backups/prestigo/dumps' | head -1)
  if [ -z "${dump_src}" ]; then
    echo "[restore] FAIL place-dumps: dumps not found in the staging restore" >&2
    exit 1
  fi
  cp -a "${dump_src}/." /var/backups/prestigo/dumps/
  log "placed dumps in /var/backups/prestigo/dumps"
  step_end "place-dumps"

  step_start "pull-images"
  ( cd /opt/prestigo/chatwoot && docker compose pull )
  ( cd /opt/prestigo/espocrm && docker compose pull )
  step_end "pull-images"

  log "fetch phase complete — staging dir: ${staging} (consumed by --phase start)"
}

# ============================================================================
# --drill / --full : start phase
# ============================================================================
run_start() {
  local full_mode="${1:-false}"
  local staging=/var/backups/prestigo/restore-staging

  if [ "${full_mode}" != "true" ]; then
    step_start "egress-gate"
    # D-09: refuse to start any app container until outbound network is
    # proven blocked. A SUCCESSFUL fetch of https://example.com means egress
    # is still open — refuse.
    if curl -fsS -m 5 -o /dev/null https://example.com 2>/dev/null; then
      echo "[restore] FAIL egress-gate: outbound egress to https://example.com succeeded — drill host must have outbound blocked before --phase start (D-09)" >&2
      exit 1
    fi
    log "OK egress-gate: https://example.com is unreachable, as required for a drill host"
    step_end "egress-gate"
  fi

  if [ ! -d "${staging}" ]; then
    echo "[restore] FAIL: --phase start requires a prior --phase fetch (staging dir ${staging} not found)" >&2
    exit 1
  fi

  step_start "create-volumes-copy-data"
  local vol mp src
  for vol in chatwoot_storage_data espocrm_app_data espocrm_app_custom espocrm_app_custom_client; do
    docker volume create "${vol}" >/dev/null
  done
  mp=$(docker volume inspect chatwoot_storage_data --format '{{.Mountpoint}}')
  src=$(find "${staging}" -type d -path '*chatwoot_storage_data/_data' | head -1)
  [ -n "${src}" ] && cp -a "${src}/." "${mp}/"
  mp=$(docker volume inspect espocrm_app_data --format '{{.Mountpoint}}')
  src=$(find "${staging}" -type d -path '*espocrm_app_data/_data' | head -1)
  [ -n "${src}" ] && cp -a "${src}/." "${mp}/"
  mp=$(docker volume inspect espocrm_app_custom --format '{{.Mountpoint}}')
  src=$(find "${staging}" -type d -path '*espocrm_app_custom/_data' | head -1)
  [ -n "${src}" ] && cp -a "${src}/." "${mp}/"
  mp=$(docker volume inspect espocrm_app_custom_client --format '{{.Mountpoint}}')
  src=$(find "${staging}" -type d -path '*espocrm_app_custom_client/_data' | head -1)
  [ -n "${src}" ] && cp -a "${src}/." "${mp}/"
  log "restored volume contents into chatwoot_storage_data + the three espocrm app volumes (ownership preserved by cp -a)"
  step_end "create-volumes-copy-data"

  step_start "start-chatwoot-db-restore-dump"
  ( cd /opt/prestigo/chatwoot && docker compose up -d postgres redis )
  local i health
  for i in $(seq 1 30); do
    health=$(docker inspect --format '{{.State.Health.Status}}' chatwoot-postgres-1 2>/dev/null || true)
    [ "${health}" = "healthy" ] && break
    sleep 2
  done
  # CR-02: pg_restore's exit code MUST NOT be swallowed here — this is the
  # single most consequential place for this script to lie about success.
  # `--clean --if-exists` restoring into a fresh, empty database is not
  # expected to emit any errors (--if-exists suppresses the "does not
  # exist" noise from the DROP statements); if pg_restore still reports a
  # non-zero exit, treat that as a real failure and abort loudly rather
  # than continuing into run_start()'s remaining steps / run_full()'s final
  # "PASS full" line.
  if ! docker exec -i chatwoot-postgres-1 pg_restore -U postgres -d chatwoot_production --clean --if-exists < /var/backups/prestigo/dumps/chatwoot.dump; then
    echo "[restore] FAIL start-chatwoot-db-restore-dump: pg_restore reported errors — inspect output above before trusting this restore" >&2
    exit 1
  fi
  log "restored chatwoot.dump into chatwoot_production"
  step_end "start-chatwoot-db-restore-dump"

  step_start "start-espocrm-db-import"
  ( cd /opt/prestigo/espocrm && docker compose up -d db )
  for i in $(seq 1 30); do
    health=$(docker inspect --format '{{.State.Health.Status}}' espocrm-db-1 2>/dev/null || true)
    [ "${health}" = "healthy" ] && break
    sleep 2
  done
  local espo_root_pw
  espo_root_pw=$(grep '^MARIADB_ROOT_PASSWORD=' /etc/prestigo/espocrm.env | cut -d= -f2-)
  # WR-01: `-e MYSQL_PWD` (no inline value) forwards the value from the
  # `docker` client's own process environment instead of embedding it as a
  # literal argv element (visible via `ps auxww` for the call's duration).
  MYSQL_PWD="${espo_root_pw}" docker exec -i -e MYSQL_PWD espocrm-db-1 mariadb -u root espocrm < /var/backups/prestigo/dumps/espocrm.sql
  unset espo_root_pw
  log "imported espocrm.sql into the espocrm database"
  step_end "start-espocrm-db-import"

  step_start "start-app-services"
  ( cd /opt/prestigo/chatwoot && docker compose up -d rails )
  ( cd /opt/prestigo/espocrm && docker compose up -d app )
  if [ "${full_mode}" = "true" ]; then
    ( cd /opt/prestigo/chatwoot && docker compose up -d sidekiq )
    ( cd /opt/prestigo/espocrm && docker compose up -d daemon )
    log "started chatwoot rails+sidekiq and espocrm app+daemon (--full disaster recovery — every service)"
  else
    log "started chatwoot rails and espocrm app ONLY — Sidekiq and the EspoCRM daemon are NOT started in drill mode (D-09: no mailbox polling/sending from a restored instance)"
  fi
  step_end "start-app-services"

  log "start phase complete (full_mode=${full_mode})"
}

# ============================================================================
# --full : fetch + start + reinstall timers/Caddy
# ============================================================================
run_full() {
  run_fetch false
  run_start true

  step_start "reinstall-caddy-and-timers"
  ( cd /opt/prestigo/caddy && docker compose up -d )
  systemctl enable --now prestigo-backup.timer 2>/dev/null || log "note: prestigo-backup.timer unit not present yet on this host — install it from infra/vps/systemd/ first"
  systemctl enable --now prestigo-monitor.timer 2>/dev/null || log "note: prestigo-monitor.timer unit not present yet on this host — install it from infra/vps/systemd/ first"
  step_end "reinstall-caddy-and-timers"

  log "PASS full: disaster-recovery restore complete on this host — if this is a REPLACEMENT host, switch DNS per infra/vps/runbooks/dns.md before considering the recovery finished"
}

case "${MODE}" in
  verify-only)
    run_verify_only
    ;;
  drill)
    case "${PHASE}" in
      fetch) run_fetch true ;;
      start) run_start false ;;
    esac
    ;;
  full)
    run_full
    ;;
esac
