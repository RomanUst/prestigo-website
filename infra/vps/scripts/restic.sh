#!/usr/bin/env bash
# infra/vps/scripts/restic.sh
#
# Single definition of the pinned restic container invocation. Every restic
# call on this host — backup.sh, restore.sh (plan 08), and a human running an
# ad-hoc command — goes through this wrapper, so the image/tag and mount
# contract stay identical everywhere (same image on prod and any future drill
# host).
#
# /var/backups/prestigo is mounted READ-WRITE (not :ro like the other three)
# because it is BOTH a `backup` source (dumps, read-only in effect) AND the
# `restore`/`restore.sh --verify-only` TARGET (restic writes the restored
# rehearsal/staging tree there). /etc/prestigo and /opt/prestigo stay
# read-only — nothing ever restores INTO them via this wrapper; restore.sh
# copies individual restored files into place itself, outside restic.
#
# Usage: sudo bash restic.sh <restic-subcommand-and-args...>
#   e.g. sudo bash restic.sh snapshots --host prestigo-vps --compact
#        sudo bash restic.sh check
#
# Env:
#   RESTIC_IMAGE - override the pinned image:tag (default below).
#
set -Eeuo pipefail

RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic:0.19.1}"

mkdir -p /var/cache/restic

exec docker run --rm \
  --env-file /etc/prestigo/backup.env \
  --hostname prestigo-vps \
  -v /var/lib/docker/volumes:/var/lib/docker/volumes:ro \
  -v /var/backups/prestigo:/var/backups/prestigo \
  -v /etc/prestigo:/etc/prestigo:ro \
  -v /opt/prestigo:/opt/prestigo:ro \
  -v /var/cache/restic:/root/.cache/restic \
  "${RESTIC_IMAGE}" \
  "$@"
