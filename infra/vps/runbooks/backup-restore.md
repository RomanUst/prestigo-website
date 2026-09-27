# Backup / restore runbook (restic -> Backblaze B2)

Covers the nightly `prestigo-backup.timer` job, what it captures, retention,
secrets custody, and manual operator commands. See `infra/vps/README.md` for
the host contract this runbook builds on.

## What is captured, and where it lives inside a snapshot

Every nightly snapshot is the union of these paths, added in a **single**
`restic backup` call so the two DB dumps and the four data volumes are always
mutually consistent (D-06, Pitfall 14 — a DB dump and a files snapshot taken
minutes apart can produce a restore where Chatwoot references an attachment,
or an EspoCRM record references an upload, that doesn't exist):

| What | Path inside the snapshot | Source |
|---|---|---|
| Chatwoot Postgres dump (`pg_dump -Fc`) | `/var/backups/prestigo/dumps/chatwoot.dump` | `chatwoot_production` DB, via `docker exec chatwoot-postgres-1` |
| EspoCRM MariaDB dump (`mariadb-dump --single-transaction`) | `/var/backups/prestigo/dumps/espocrm.sql` | `espocrm` DB, via `docker exec espocrm-db-1` |
| Chatwoot attachments (ActiveStorage, local disk) | `/var/lib/docker/volumes/chatwoot_storage_data/_data` | Docker volume `chatwoot_storage_data` |
| EspoCRM app data (uploads, cache, install state) | `/var/lib/docker/volumes/espocrm_app_data/_data` | Docker volume `espocrm_app_data` |
| EspoCRM custom code | `/var/lib/docker/volumes/espocrm_app_custom/_data` | Docker volume `espocrm_app_custom` |
| EspoCRM custom client code | `/var/lib/docker/volumes/espocrm_app_custom_client/_data` | Docker volume `espocrm_app_custom_client` |
| Chatwoot app secrets/config | `/etc/prestigo/chatwoot.env` | root-only env file |
| EspoCRM app secrets/config | `/etc/prestigo/espocrm.env` | root-only env file |
| SMTP relay credentials | `/etc/prestigo/smtp.env` | root-only env file |
| Monitoring ping URLs (once plan 06 ships) | `/etc/prestigo/monitor.env` | root-only env file, backed up only when present |
| Versioned infra config (Compose/Caddyfile/scripts/runbooks) | `/opt/prestigo` | rsync target of `infra/vps/` in this repo |

**`/etc/prestigo/backup.env` is never included in any snapshot.** It holds the
restic password itself — including it would make the backup depend on the
thing it's encrypted with. This is enforced by `backup.sh` never listing it in
`BACKUP_PATHS`, and is proven in CI/verify by
`restic ls latest | grep -c /etc/prestigo/backup.env` printing `0`.

## Schedule and retention (D-07)

- `prestigo-backup.timer` fires nightly at **02:30 Europe/Prague**
  (`OnCalendar=*-*-* 02:30:00 Europe/Prague`), with `Persistent=true` so a
  missed run (host was off at 02:30) fires as soon as the host is back up.
  `RandomizedDelaySec=10min` spreads load if this schedule ever runs
  alongside other jobs.
- Every run tags its snapshot `nightly` and ends with:
  ```
  restic forget --host prestigo-vps --tag nightly \
    --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
  ```
  i.e. 7 most recent daily snapshots, 4 most recent weekly, 6 most recent
  monthly — older snapshots are forgotten and their now-unreferenced data is
  pruned from the B2 bucket.
- On **Sundays only**, the job also runs
  `restic check --read-data-subset=5%` — a partial integrity check that reads
  ~5% of the actual pack data (not just the index) without downloading and
  re-verifying every byte in the repository every night.

## Consistency rule (D-06, Pitfall 14)

The dumps are always taken **first**, then the volumes and env files are
captured in the *same* `restic backup` invocation immediately afterward —
never as two separate `restic backup` calls, and never with a delay in
between. This is what guarantees a restored Chatwoot doesn't show a
conversation referencing an attachment that isn't in the restored volume, and
that a restored EspoCRM doesn't reference an upload that never made it into
the same snapshot. Do not "optimize" this into parallel dump + volume-copy
steps.

## Secrets custody (D-08)

`/etc/prestigo/backup.env` (root:root, mode `600`) holds `RESTIC_REPOSITORY`,
the B2 application key ID/secret, and `RESTIC_PASSWORD` — the restic
repository encryption password, generated **on the VPS** with
`openssl rand -base64 48` and never printed to any terminal, transcript, or
git history.

**The owner keeps a full copy of this file in their password manager**, taken
by running `ssh prestigo-vps sudo cat /etc/prestigo/backup.env` from their own
terminal (never through Claude) and pasting the output into a secure note.

**The restore drill (plan 08/09) must use the password-manager copy, never
the live VPS copy.** The whole point of the drill is proving that recovery
does not depend on the VPS still existing — if the drill script quietly reads
`/etc/prestigo/backup.env` off the VPS it's being restored onto, it never
actually proves independent recoverability.

## Ping semantics (D-03)

`backup.sh` sources `/etc/prestigo/monitor.env` if it exists and reads
`HC_PING_BACKUP` (a Healthchecks.io check URL) from it:

- `${HC_PING_BACKUP}/start` — pinged before any work starts.
- `${HC_PING_BACKUP}` (bare URL, POST body = summary) — pinged only after
  dumps + snapshot + prune (+ the Sunday check, when it runs) all succeeded.
- `${HC_PING_BACKUP}/fail` (POST body = the failing step name) — pinged by an
  `ERR` trap the instant any step fails.

**`/etc/prestigo/monitor.env` does not exist yet** — plan 06 creates the
Healthchecks.io check and writes this file. Until then, every ping call is a
no-op that logs `HC_PING_BACKUP not set — skipping ... ping` and the backup
still runs and prunes normally; it just isn't monitored yet. Once plan 06
lands, no change to `backup.sh` is needed — it already reads the file
opportunistically.

## Manual operations

All commands go through `infra/vps/scripts/restic.sh`, the single wrapper
around the pinned `restic/restic` image (env-file, mounts, cache) — never
invoke `docker run restic/restic ...` directly, so a future image-tag bump
only has one place to change.

**Run a backup right now** (also usable to force an off-schedule snapshot
before a risky admin action, see Pitfall 15 below):
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/backup.sh'
```

**List snapshots:**
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/restic.sh snapshots --host prestigo-vps --compact'
```

**Restore a single file to `/tmp`** (does not touch the running app —
useful to recover one accidentally-deleted attachment without a full
restore):
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/restic.sh restore latest \
  --target /tmp/restic-restore \
  --include /var/lib/docker/volumes/chatwoot_storage_data/_data/<path>'
```

**Check repository integrity on demand:**
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/restic.sh check'
```

**Dry-run the retention policy** (see what the next `forget --prune` would
remove, without removing anything):
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/restic.sh forget --host prestigo-vps --tag nightly \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --dry-run'
```

## B2 lifecycle note

Backblaze B2 keeps a hidden version of a deleted object for **30 days** by
default before it is actually purged (bucket lifecycle rules). `restic forget
--prune` issues real deletes against the bucket, so its own retention (D-07)
is the effective backup-retention policy — B2's 30-day hide window is a
secondary safety net against an accidental `restic forget` with the wrong
flags, not a substitute for restic's own retention.

## Hostinger weekly snapshot — coarse net only (D-10)

Hostinger's free weekly VPS snapshot (hPanel -> Backups & Snapshots) is kept
as a coarse, whole-host safety net, and a manual snapshot is always taken
before any upgrade (see `upgrade.md`). It is **not** the primary recovery
path — restic + B2 is. The Hostinger snapshot only restores the whole VPS as
of a point in time; it cannot restore a single file or a single day's data
the way restic can, and it lives with the same provider as the VPS itself
(doesn't protect against losing the Hostinger account).

## Restore drill — pointer (plan 08/09)

The actual restore drill (spin up a temporary hourly-billed VPS, restore
using only the password-manager copy of `backup.env` + this repo's
`infra/vps/` + B2, verify both apps, tear the temp host down) is built in
plan 08 (`restore.sh`) and documented/run in plan 09
(`runbooks/restore-drill.md`). This runbook only covers the backup side and
ad-hoc single-file recovery; it is not itself a substitute for the drill.

## Backup-first rule before any destructive admin action (Pitfall 15)

Deleting a Chatwoot inbox (e.g. to reconfigure a channel) silently cascades
and destroys all of that inbox's conversation and contact history — there is
no "are you sure" that undoes it. **Before any inbox deletion, or any other
destructive admin action in either app, run a fresh backup first:**
```bash
ssh prestigo-vps 'sudo /opt/prestigo/scripts/backup.sh'
```
Confirm the run's log line ends `backup complete: snapshot <id>` before
proceeding with the destructive action. During initial setup (before real
customer data exists) this is low-risk and fine to skip; once channels carry
real conversations, treat it as mandatory.
