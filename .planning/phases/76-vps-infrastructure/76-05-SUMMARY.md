---
phase: 76-vps-infrastructure
plan: 05
subsystem: infra
tags: [vps, restic, backblaze, b2, systemd, backup, restore, upgrade-runbook]

requires:
  - phase: 76-01
    provides: "Hostinger KVM 2 VPS reachable as deploy, D-15 secret gate covering infra/vps"
  - phase: 76-02
    provides: "Hardened Ubuntu 24.04 host, /opt/prestigo, /etc/prestigo host-layout contract"
  - phase: 76-03
    provides: "/etc/prestigo/backup.env (root 0600) with owner-approved us-east-005 B2 bucket credentials"
  - phase: 76-04
    provides: "Chatwoot + EspoCRM live behind Caddy, container names (chatwoot-postgres-1, espocrm-db-1, ...), smoke.sh"
provides:
  - "infra/vps/scripts/restic.sh — single pinned restic/restic:0.19.1 container wrapper (env-file, read-only mounts, cache mount), reused by backup.sh and future restore.sh (plan 08)"
  - "infra/vps/scripts/backup.sh — pg_dump + mariadb-dump + ONE restic snapshot (dumps + 4 data volumes + app env files + /opt/prestigo, backup.env excluded) + forget --prune (7d/4w/6m) + Sunday partial check + Healthchecks ping hook (no-op until plan 06)"
  - "infra/vps/systemd/prestigo-backup.{service,timer} — nightly 02:30 Europe/Prague, Persistent=true, enabled and running on the VPS"
  - "infra/vps/runbooks/backup-restore.md, infra/vps/runbooks/upgrade.md"
  - "RESTIC_PASSWORD generated on the VPS, appended to /etc/prestigo/backup.env (root 0600); restic repo initialized in the owner-approved us-east-005 B2 bucket; two live nightly-tagged snapshots"
affects: [76-06, 76-08, 76-09]

actuals:
  tokens: 6300
  tasks: 2
  commits: 2
  plan_head_before: d2dc5bd8456b2bf1233c6f7a4445469b5f9240bd
  plan_head_after: b466dfa2924fd48c56b710165ba997abd3b9ba43

tech-stack:
  added: ["restic/restic:0.19.1 (Docker Hub, official org, re-verified live this session)"]
  patterns:
    - "restic.sh: single wrapper around the pinned restic container (env-file + read-only volume/config mounts + writable cache) — every restic invocation on this host goes through it, never a bare `docker run restic/restic`"
    - "backup.sh: ERR trap + hc() ping helper that logs a no-op instead of failing when HC_PING_BACKUP is unset — lets the backup job run correctly before its monitoring hook exists (plan 06)"
    - "dumps-then-files-in-one-restic-call: pg_dump/mariadb-dump write to a staging dir immediately before the single restic backup invocation that also captures the data volumes, so DB and files in a snapshot are always mutually consistent (D-06, Pitfall 14)"

key-files:
  created:
    - infra/vps/scripts/restic.sh
    - infra/vps/scripts/backup.sh
    - infra/vps/systemd/prestigo-backup.service
    - infra/vps/systemd/prestigo-backup.timer
    - infra/vps/runbooks/backup-restore.md
    - infra/vps/runbooks/upgrade.md
  modified:
    - infra/vps/README.md

key-decisions:
  - "restic pinned to 0.19.1 (highest non-'latest' stable tag on Docker Hub as of this session; 0.19.0 also exists but 0.19.1 is newer)"
  - "backup.sh reads MARIADB_ROOT_PASSWORD from /etc/prestigo/espocrm.env by grep/cut (never sourced, since that file may contain values with special characters per the interfaces contract) and passes it into the mariadb-dump exec via -e MYSQL_PWD=... on the docker exec invocation, never as a bare command-line argument"
  - "Owner-approved us-east-005 B2 bucket region (carried forward from 76-03) — restic repository initialized at s3:https://s3.us-east-005.backblazeb2.com/prestigo-vps-backup-7k3m/prestigo-vps, not an eu- endpoint; documented again here, not re-litigated"

patterns-established:
  - "Pattern: shell backup/restore scripts source *.env files with `set -a; source ...; set +a` for shell-safe env files, but read a single secret out of an app env file that may contain unsafe characters via `grep '^KEY=' file | cut -d= -f2-` — never `source` an app env file"

requirements-completed: []

coverage:
  - id: D1
    description: "INFRA-02/D-06: every backup run writes a fresh Chatwoot pg_dump and EspoCRM mariadb-dump, then immediately captures those dumps plus all four data volumes and the app env files in ONE restic snapshot"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "ssh prestigo-vps 'sudo /opt/prestigo/scripts/backup.sh && sudo .../restic.sh snapshots --host prestigo-vps --compact' -> exit 0, 2 snapshots listed"
        status: pass
      - kind: other
        ref: "ssh prestigo-vps 'sudo .../restic.sh ls latest' | grep dumps/chatwoot.dump, dumps/espocrm.sql, chatwoot_storage_data/_data, espocrm_app_data/_data, /etc/prestigo/chatwoot.env -> all 5 present"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-05: restic repository lives in the Backblaze B2 bucket via the S3 API, client-side encrypted by restic (owner-approved us-east-005 region, not EU — see 76-03 deviation)"
    verification:
      - kind: other
        ref: "created restic repository 1576f544aa at s3:https://s3.us-east-005.backblazeb2.com/prestigo-vps-backup-7k3m/prestigo-vps (backup.sh --init-repo output)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-07: each run ends with restic forget --prune keeping 7 daily / 4 weekly / 6 monthly snapshots"
    verification:
      - kind: other
        ref: "grep -q keep-daily/weekly/monthly in backup.sh; live forget --dry-run output shows the policy resolving to 2 kept snapshots (see Verification section)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-03: backup.sh pings Healthchecks start/success/fail (ERR trap fires fail with the failing step name); logs a no-op when /etc/prestigo/monitor.env is absent (plan 06 wires HC_PING_BACKUP)"
    verification:
      - kind: other
        ref: "live run log: 'HC_PING_BACKUP not set — skipping start/success ping (wired by plan 06)'; ERR trap code path present in backup.sh, not exercised live (no induced failure)"
        status: pass
    human_judgment: false
  - id: D5
    description: "prestigo-backup.timer runs nightly at 02:30 Europe/Prague with Persistent=true; a manual service start produces a second snapshot"
    requirement: "INFRA-04"
    verification:
      - kind: other
        ref: "systemctl is-enabled -> enabled; list-timers shows NEXT=2026-09-28 00:31 UTC (=02:30/02:31 Prague); systemctl start produced snapshot e39ec682 (Result=success)"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-08: RESTIC_PASSWORD generated on the VPS (openssl rand -base64 48), never printed; backup.env root 0600; backup.env itself never inside a snapshot"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "stat -> 600 root; grep -c '^RESTIC_PASSWORD=.' -> 1; restic ls latest | grep -c /etc/prestigo/backup.env -> 0"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-16/D-10/INFRA-04: infra/vps/runbooks/upgrade.md governs app upgrades as fresh backup -> manual Hostinger snapshot -> one-tag-bump commit -> pull/migrate/up -> smoke.sh -> rollback path"
    requirement: "INFRA-04"
    verification:
      - kind: other
        ref: "grep -qi hostinger && grep -q smoke.sh && grep -qi rollback infra/vps/runbooks/upgrade.md -> all pass"
        status: pass
    human_judgment: false
  - id: D8
    description: "D-17/D-18 (Task 3, DEFERRED): the owner sets their own Chatwoot password via the Resend reset email and changes the EspoCRM admin password, enrolling TOTP 2FA wherever the pinned versions offer it; D-08 password-manager custody of backup.env"
    requirement: "INFRA-02, INFRA-04"
    verification: []
    human_judgment: true
    rationale: "owner custody deferred to end of phase per this run's dispatch — Task 3 (checkpoint:human-action, gate=blocking-human) was not executed; see 'Deferred owner actions (Task 3)' below"

duration: ~50min
completed: 2026-09-27
status: complete-pending-owner
---

# Phase 76 Plan 05: Backups + Upgrade Runbook Summary

**restic-to-B2 nightly backups (dumps + all app data + secrets, one consistent snapshot per run, 7d/4w/6m retention) run on a systemd timer at 02:30 Europe/Prague, proven by two live snapshots and a clean `restic check`; the pinned-version upgrade runbook is written — only the owner's custody/password/2FA step (Task 3) remains, deliberately deferred to the end of the phase.**

## Performance

- **Duration:** ~50 min
- **Started:** ~2026-09-27T21:57Z
- **Completed:** 2026-09-27T22:47Z
- **Tasks:** 2/3 completed (Task 3 deferred, see below)
- **Files created:** 6, modified: 1

## Accomplishments

- `infra/vps/scripts/restic.sh` wraps the pinned `restic/restic:0.19.1` image (re-verified live against Docker Hub) with `--env-file /etc/prestigo/backup.env`, `--hostname prestigo-vps`, read-only mounts of the Docker volumes / `/var/backups/prestigo` / `/etc/prestigo` / `/opt/prestigo`, and a writable `/var/cache/restic` cache — the one place the restic invocation is defined.
- `infra/vps/scripts/backup.sh` dumps Chatwoot's Postgres (`pg_dump -Fc chatwoot_production`) and EspoCRM's MariaDB (`mariadb-dump --single-transaction --quick --routines --triggers --events`, root password read via `grep`/`cut` and passed as `MYSQL_PWD` to the exec — never on a command line), then in **one** `restic backup` call captures both dumps, all four data volumes (`chatwoot_storage_data`, `espocrm_app_data`, `espocrm_app_custom`, `espocrm_app_custom_client`), the three app env files, and `/opt/prestigo` — `backup.env` is deliberately never listed. Ends with `forget --host prestigo-vps --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`, a Sunday-only `restic check --read-data-subset=5%`, and a Healthchecks ping (currently a logged no-op — `/etc/prestigo/monitor.env` doesn't exist until plan 06).
- On the VPS: generated `RESTIC_PASSWORD` with `openssl rand -base64 48` (never printed), appended to `/etc/prestigo/backup.env` (kept `600 root:root`), initialized the restic repository in the owner-approved `us-east-005` B2 bucket, and ran `backup.sh --init-repo` then `backup.sh` twice more (once for Task 1's own verify, once via `systemctl start prestigo-backup.service` for Task 2) — two nightly-tagged snapshots are live (`10e271e3`, `e39ec682`), `restic check` reports "no errors were found", and `restic ls latest | grep -c /etc/prestigo/backup.env` prints `0`.
- `infra/vps/systemd/prestigo-backup.{service,timer}` installed, enabled, and confirmed live: `systemctl is-enabled` -> `enabled`, `list-timers` shows a real next elapse (`2026-09-28 00:31 UTC` = 02:31 local Prague time, inside the `RandomizedDelaySec=10min` window of the 02:30 schedule), and a manual `systemctl start` produced the second snapshot with `Result=success`.
- `infra/vps/runbooks/backup-restore.md` documents what's captured and where inside a snapshot, schedule/retention, the D-06 consistency rule, D-08 secrets custody (password-manager copy, never the VPS copy, for the restore drill), D-03 ping semantics, manual operator commands (run now / list / restore one file / dry-run retention), the B2 30-day lifecycle note, D-10's Hostinger snapshot as a coarse net, a pointer to the plan 08/09 restore drill, and the Pitfall 15 backup-first rule before any destructive admin action.
- `infra/vps/runbooks/upgrade.md` documents the full D-16 procedure: preflight (release notes, exact tag from Docker Hub) -> fresh backup -> manual Hostinger snapshot -> one-app tag-bump commit -> clean-commit deploy -> migrate/up (Chatwoot `db:chatwoot_prepare` before `up -d`; EspoCRM's auto-upgrade-on-boot, confirmed against upstream `docker-entrypoint.sh`) -> `smoke.sh` must print only `OK` -> rollback (pre-migration: revert+redeploy; post-migration: restore from the snapshot recorded in step 1 or, last resort, the Hostinger snapshot) -> an upgrade-log table. Also covers Docker Engine upgrades as manual-only, quiet-hour, smoke-checked (never unattended, per D-14's blacklist).

## Task Commits

1. **Task 1 (tracer): restic wrapper + backup.sh — dumps, one snapshot to B2, prune, ping hook** - `0afe0267` (feat)
2. **Task 2: nightly systemd timer + backup-restore and upgrade runbooks** - `b466dfa2` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `infra/vps/scripts/restic.sh` - pinned restic container wrapper, `RESTIC_IMAGE` env override
- `infra/vps/scripts/backup.sh` - the nightly job; `--init-repo` flag; `hc()` ping helper
- `infra/vps/systemd/prestigo-backup.service` - oneshot, `Nice=10`, idle IO scheduling, 3h timeout
- `infra/vps/systemd/prestigo-backup.timer` - `OnCalendar=*-*-* 02:30:00 Europe/Prague`, `Persistent=true`, 10min randomized delay
- `infra/vps/runbooks/backup-restore.md` - capture/schedule/retention/custody/ping/manual-ops/B2-lifecycle/Hostinger-net/restore-drill-pointer/Pitfall-15 rule
- `infra/vps/runbooks/upgrade.md` - preflight/backup/snapshot/tag-bump/deploy/migrate/smoke/rollback/log, Docker Engine upgrade note
- `infra/vps/README.md` - corrected the runbook index (`upgrade.md` is delivered by this plan, 76-05, not 76-06)
- Host (not in git): `/etc/prestigo/backup.env` gained `RESTIC_PASSWORD`; restic repo `prestigo-vps` initialized in the `prestigo-vps-backup-7k3m` B2 bucket; `/var/cache/restic`; systemd units in `/etc/systemd/system/`; two live restic snapshots

## Verification

- `bash -n infra/vps/scripts/backup.sh && bash -n infra/vps/scripts/restic.sh` -> exit 0
- `grep -q "keep-daily 7" ... && grep -q "keep-weekly 4" ... && grep -q "keep-monthly 6" backup.sh` -> exit 0
- `ssh prestigo-vps 'sudo .../restic.sh snapshots --host prestigo-vps --compact'` -> 2 snapshots (`10e271e3`, `e39ec682`)
- `ssh prestigo-vps 'sudo .../restic.sh check'` -> `no errors were found` (twice, including the Sunday partial-check path exercised live both runs since today is Sunday UTC)
- `ssh prestigo-vps 'sudo .../restic.sh ls latest'` -> contains `dumps/chatwoot.dump`, `dumps/espocrm.sql`, `chatwoot_storage_data/_data`, `espocrm_app_data/_data`, `/etc/prestigo/chatwoot.env`
- `restic ls latest | grep -c /etc/prestigo/backup.env` -> `0`
- `stat -c "%a %U" /etc/prestigo/backup.env` -> `600 root`; `grep -c "^RESTIC_PASSWORD=." backup.env` -> `1`
- `systemctl is-enabled prestigo-backup.timer` -> `enabled`; `list-timers` shows `NEXT = Mon 2026-09-28 00:31:xx UTC`
- `systemd-analyze calendar "*-*-* 02:30:00 Europe/Prague"` -> `Next elapse: Mon 2026-09-28 00:30:00 UTC` (host tz is `Etc/UTC`; the calendar spec itself carries the `Europe/Prague` zone)
- `systemctl show prestigo-backup.service -p Result` -> `Result=success`
- Live `restic forget --dry-run` with the D-07 flags: kept exactly the 2 live snapshots (see below)
- `grep -qi hostinger && grep -q smoke.sh && grep -qi rollback` on `upgrade.md` -> pass; `grep -q "password manager" && grep -q "02:30"` on `backup-restore.md` -> pass

### Snapshot facts (restic 0.19.1)

| Snapshot | When | Trigger | data_added | duration |
|---|---|---|---|---|
| `10e271e3dfa6…` | 2026-09-27T22:41:38Z | Task 1, `backup.sh --init-repo` | 4,321,532 B | 2.70s |
| `2b3306f853…` (pruned, superseded same-day) | 2026-09-27T22:41:54Z | Task 1's own `<verify>` re-run | 786,953 B | 3.11s |
| `e39ec682b4…` | 2026-09-27T22:43:18Z | Task 2, `systemctl start prestigo-backup.service` | 802,480 B | 3.12s |

`10e271e3` and `e39ec682` are the two currently retained snapshots (`2b3306f8` was forgotten by the same-day daily-bucket rule during the second `forget --prune`, which is restic's normal same-day dedup behavior, not a defect).

### Retention dry-run output (D-07)

```
Applying Policy: keep 7 daily, 4 weekly, 6 monthly snapshots
keep 2 snapshots:
ID        Time                 Host          Tags     Reasons
10e271e3  2026-09-27 22:41:38  prestigo-vps  nightly  oldest daily/weekly/monthly snapshot
e39ec682  2026-09-27 22:43:18  prestigo-vps  nightly  daily/weekly/monthly snapshot
2 snapshots
```

## Decisions Made

See `key-decisions` in frontmatter. In short: restic pinned to `0.19.1` (Docker Hub's newest non-`latest` stable tag this session); the EspoCRM root DB password is read out of `espocrm.env` with `grep`/`cut` (never `source`d, matching the interfaces contract that app env files may contain unsafe characters) and passed to `mariadb-dump` only via `docker exec -e MYSQL_PWD=...`, never a bare CLI arg; the `us-east-005` B2 region deviation from 76-03 is carried forward unchanged.

## Deviations from Plan

None (Rule 1-3) — plan executed as written for Tasks 1-2. One small documentation correction: `infra/vps/README.md`'s runbook index attributed `upgrade.md` to "Plan 76-06"; corrected to 76-05 since this plan's own frontmatter (`files_modified`) and Task 2 both deliver it here. Not a Rule 1-3 code fix, just a stale cross-reference from an earlier plan's README edit.

**Total deviations:** 0 auto-fixed (1 minor doc cross-reference correction, no behavior change).
**Impact on plan:** None — no scope creep.

## Issues Encountered

None for Tasks 1-2. `restic forget`'s same-day dedup pruned the middle of three same-day snapshots (`2b3306f8`) — expected restic behavior given three runs landing on the same calendar day during this session, not a script defect; documented in the snapshot-facts table above so it isn't mistaken for one later.

## Known Stubs

- `HC_PING_BACKUP` ping calls in `backup.sh` are a logged no-op (`HC_PING_BACKUP not set — skipping ... ping (wired by plan 06)`) because `/etc/prestigo/monitor.env` does not exist yet. This is the plan's own designed interface point (see this plan's `<interfaces>` block: "Future hook (plan 06)") — not an unplanned gap. Plan 06 creates the Healthchecks.io check and writes `monitor.env`; no change to `backup.sh` will be needed when it does, since the script already reads the file opportunistically.

## Threat Flags

None — every new surface (restic container invocation, B2 network egress, systemd timer) was already enumerated in this plan's `<threat_model>` (T-76-19 through T-76-24, T-76-SC) and mitigated as designed; no unplanned surface was introduced.

## User Setup Required

None for Tasks 1-2 (fully automated, no owner credentials needed beyond what 76-03 already supplied). **Task 3's owner actions are deferred — see the section below, which is the authoritative list of everything still outstanding for the owner in this plan.**

## Deferred owner actions (Task 3)

**Not executed.** Per this run's explicit dispatch instruction, Task 3 (`type="checkpoint:human-action"`, `gate="blocking-human"`) — owner custody of the backup secrets, and the owner taking over both admin accounts with 2FA — is deliberately deferred so the owner can complete every phase-76 owner action in one batch at the end of the phase, rather than being interrupted mid-execution. **Nothing was faked or simulated for Task 3.** The `<prohibitions>` clause this plan's frontmatter carries — "Recovery must never depend on anything that exists only on the VPS: the restic password and B2 keys must also live in the owner's password manager before this plan closes (D-08)" — is **not yet satisfied**; that is exactly why `status: complete-pending-owner` (not `complete`) and why `requirements-completed` is empty in this SUMMARY's frontmatter (INFRA-02/INFRA-04 stay open in REQUIREMENTS.md until Task 3 closes).

### Owner checklist (copied from Task 3's `<instructions>`)

Claude already: generated the restic password on the VPS (never shown to Claude), created both admin accounts with random passwords, configured Resend system mail and 2FA availability.

Owner, in order:

1. In your own Terminal app run: `ssh prestigo-vps sudo cat /etc/prestigo/backup.env` — copy ALL lines into a password-manager secure note named **"Prestigo VPS backup.env"**. Without this note the backups cannot be decrypted if the VPS is lost; plan 09's restore drill will use exactly this note.
2. **Chatwoot:** open https://chat.rideprestigo.com, click "Forgot password", enter your admin email. The reset email comes from `notifications@rideprestigo.com`. Set a strong password and save it in the password manager. In Profile Settings, if "Two-factor authentication" is offered, enable it and save the recovery codes.
3. **EspoCRM:** in Terminal run `ssh prestigo-vps sudo grep ESPOCRM_ADMIN_PASSWORD /etc/prestigo/espocrm.env` to see the first-time password. Log in at https://crm.rideprestigo.com as `prestigo-admin`, change the password (save it in the password manager), then Preferences -> Two-Factor Authentication -> set up with your authenticator app.
4. Tell Claude whether these arrived in your inbox: **"Prestigo VPS relay test (Phase 76)"**, the EspoCRM test email, and the Chatwoot reset email.

### Verification Claude must run once the owner replies "custody done"

- **Chatwoot:** `rails runner` check that the admin user has `sign_in_count >= 1` and, if the pinned schema has `otp_required_for_login`, that it is `true` (otherwise record "2FA not offered in pinned Chatwoot CE").
- **EspoCRM:** MariaDB shows a successful `prestigo-admin` login in the auth log after this checkpoint started, and the admin's `UserData` 2FA flag is set (column names read from the pinned schema).
- Record the owner's confirmation of the password-manager note and of the three emails (relay test, EspoCRM test, Chatwoot reset).
- Once verified, update this plan's coverage entry D8 (`human_judgment: true` -> re-classify with a passing `verification` if a future automated check is added, or leave as human-confirmed) and run `requirements.mark-complete INFRA-02 INFRA-04` (currently withheld).

**Resume signal for Task 3 (unchanged from the plan):** Owner replies "custody done" plus which emails arrived and whether Chatwoot offered 2FA — or describes any problem.

## Next Phase Readiness

- Backups run nightly, unattended, with proven consistency, retention, and integrity checking; `infra/vps/scripts/restic.sh` is ready for plan 08's `restore.sh` to reuse.
- `infra/vps/runbooks/upgrade.md` is ready for plan 06 to reference (and for any earlier ad-hoc upgrade need).
- **Blocker for closing this plan's requirements:** Task 3 (owner custody + admin password/2FA takeover) is outstanding. Plan 76-06 and later plans are not blocked by this — the backup/upgrade infrastructure itself is fully functional — but `INFRA-02`/`INFRA-04` should not be marked complete in REQUIREMENTS.md until Task 3 closes. Collect this alongside any other Phase 76 owner actions at end-of-phase per this run's instruction.

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: infra/vps/scripts/restic.sh
- FOUND: infra/vps/scripts/backup.sh
- FOUND: infra/vps/systemd/prestigo-backup.service
- FOUND: infra/vps/systemd/prestigo-backup.timer
- FOUND: infra/vps/runbooks/backup-restore.md
- FOUND: infra/vps/runbooks/upgrade.md
- FOUND commit: 0afe0267 (Task 1)
- FOUND commit: b466dfa2 (Task 2)
- Re-ran all Task 1/2 `<verify>` and acceptance-criteria commands live (see "Verification" section above) — all PASS
- Task 3 intentionally not executed (see "Deferred owner actions" section) — not claimed as done anywhere in this SUMMARY or in REQUIREMENTS.md
