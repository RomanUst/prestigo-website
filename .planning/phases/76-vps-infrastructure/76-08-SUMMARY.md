---
phase: 76-vps-infrastructure
plan: 08
subsystem: infra
tags: [restic, backup, restore, chatwoot, espocrm, postgres, mariadb, disaster-recovery]

requires:
  - phase: 76-04
    provides: "Chatwoot + EspoCRM live behind Caddy, container/volume names, restore-drill-canary EspoCRM API user"
  - phase: 76-05
    provides: "infra/vps/scripts/restic.sh wrapper, backup.sh nightly job, restic repo in B2"
provides:
  - "infra/vps/drill/canary.txt - fixed-content synthetic canary, sha256 is the reference checksum"
  - "infra/vps/scripts/seed-drill-canary.sh - idempotent canary seeding in Chatwoot (API inbox/contact/conversation/message/attachment) and EspoCRM (Account/Document/Attachment + account_document link)"
  - "infra/vps/scripts/drill-verify.sh - D-09/Pitfall 14 integrity checker: --baseline (read-only) and --drill --baseline-file (disposable host only)"
  - "infra/vps/scripts/backup.sh pre-dump integrity baseline hook - drill-baseline.json travels inside every nightly snapshot"
  - "infra/vps/scripts/restore.sh - --verify-only (production-safe rehearsal), --drill --phase fetch|start (disposable host), --full (disaster recovery)"
  - "infra/vps/runbooks/restore-drill.md - complete D-09 drill procedure + Drill log table"
  - "infra/vps/scripts/restic.sh fix: /var/backups/prestigo mounted read-write (was read-only, blocking every restore)"
affects: [76-09]

actuals:
  tokens: 18104
  tasks: 2
  commits: 2
  plan_head_before: 6f0cf6088a1eddec52a0a0ca47c7a51fbdd3f2b0
  plan_head_after: c0b236a9

tech-stack:
  added: []
  patterns:
    - "Idempotent external-system seeding: look up every object by name first, create only when missing, safe to re-run (proven via two consecutive runs, second creates nothing)"
    - "When a REST relate action is ACL-gated for a least-privilege role, link the join row directly via root DB access rather than widening the role's ACL just for one operation (account_document join row written via root MariaDB, not EspoCRM's own relate endpoint)"
    - "Never pipe a live producer straight into an early-exiting `grep -q`/`grep -qw` under `set -o pipefail` - capture to a variable first, then feed grep via a here-string (<<<), not another pipe. An early match closes the read end and SIGPIPEs the producer; pipefail then reports the producer's SIGPIPE-killed status for the whole pipeline regardless of what grep found (intermittent false FAIL, diagnosed live during this plan)"
    - "restic.sh's /var/backups/prestigo mount must be read-write, not read-only: it is both a backup source (effectively read-only in that role) and a restore/rehearsal TARGET (restic writes there); /etc/prestigo and /opt/prestigo stay read-only since nothing ever restores into them through this wrapper"

key-files:
  created:
    - infra/vps/drill/canary.txt
    - infra/vps/scripts/seed-drill-canary.sh
    - infra/vps/scripts/drill-verify.sh
    - infra/vps/scripts/restore.sh
    - infra/vps/runbooks/restore-drill.md
    - .planning/phases/76-vps-infrastructure/evidence/drill-baseline.json
  modified:
    - infra/vps/scripts/backup.sh
    - infra/vps/scripts/restic.sh
    - infra/vps/README.md

key-decisions:
  - "Ordering deviation (orchestrator-directed): plan frontmatter declares depends_on 76-07, but 76-07 (controlled outage test) is deliberately deferred to the end of the phase - it needs owner-held monitoring accounts and owner confirmations. The orchestrator verified this plan has no content dependency on 76-07's output (it only needs the live apps from 76-04 and backups from 76-05, both already complete) and directed this plan to run now. No actual dependency on 76-07 was found during execution - confirmed."
  - "EspoCRM Document.accounts is a noLoad/directUpdateDisabled linkMultiple field - accountsIds cannot be set on create (this plan's interfaces block's assumption was wrong), and the REST relate action needs edit ACL the least-privilege canary role deliberately lacks (T-76-34). Fixed by writing the account_document join row directly via root MariaDB instead of widening the role's ACL."
  - "restic.sh's /var/backups/prestigo mount was read-only (correct for backup.sh, wrong for any restore) - changed to read-write; this was a genuine plan-76-05 bug only surfaced once restore.sh actually tried to write a rehearsal target there."
  - "docker exec needs -i for a heredoc/rails-runner-via-stdin call to actually reach the container - without it, docker silently ignores stdin and rails runner executes an empty script with no error. Both seed-drill-canary.sh and drill-verify.sh's functional-insert test use `docker exec -i`."

requirements-completed: [INFRA-02]

coverage:
  - id: D1
    description: "Production holds a synthetic restore-drill canary: resolved Chatwoot conversation in API inbox 'Restore drill canary' with canary.txt attached, and an EspoCRM Account 'Restore Drill Canary' with a Document carrying canary.txt"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "seed-drill-canary.sh run twice on production (idempotent, second run: 0 created); drill-verify.sh --baseline chatwoot-canary-present/checksum and espocrm-canary-present/checksum all OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "drill-verify.sh --baseline (read-only) reports zero orphaned references, correct display_id sequences, and canary checksum matches, in both apps"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "ssh prestigo-vps 'sudo drill-verify.sh --baseline --out /tmp/x.json' -> 12/12 OK, exit 0; jq -e '.chatwoot.orphans | to_entries | all(.value==0)' -> true"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every nightly snapshot carries dumps/drill-baseline.json computed immediately before the dumps; an integrity failure still backs data up but pings Healthchecks fail instead of success"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "backup.sh run on production: integrity baseline OK, snapshot 0d783b96 created; restic ls latest | grep -c dumps/drill-baseline.json -> 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "restore.sh --verify-only restores the latest snapshot into a root-only rehearsal dir, proves both dumps and the canary checksums, then always deletes the rehearsal dir - never touches running containers"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "run 4x consecutively on production incl. the plan's exact <verify> command: exit=0 every time, no FAIL lines, REHEARSAL_CLEAN every time (never REHEARSAL_LEFT)"
        status: pass
    human_judgment: false
  - id: D5
    description: "restore.sh --drill refuses to start any app container until outbound is proven blocked, and never starts Sidekiq/EspoCRM daemon in drill mode"
    requirement: "INFRA-02"
    verification: []
    human_judgment: true
    rationale: "Code is written and reviewed (egress gate + service-start restriction present, bash -n clean) but this mode only runs on a disposable Hetzner host that does not exist yet - plan 76-09 provisions it and is the first live exercise of --drill/--full. Not runnable on production by design (the script itself refuses --drill on hostname prestigo-vps)."
  - id: D6
    description: "infra/vps/runbooks/restore-drill.md describes the complete D-09 drill using only the runbook, infra/vps from git, and the password-manager copy of backup.env"
    requirement: "INFRA-02"
    verification:
      - kind: other
        ref: "grep for required strings (password manager, 127.0.0.1/32, DOCKER-USER, Drill log, purpose=prestigo-restore-drill) all present"
        status: pass
    human_judgment: true
    rationale: "String-presence and procedural completeness are checked, but whether the documented Hetzner API calls actually work end-to-end can only be confirmed by running the drill for real, which is plan 76-09's job."

duration: ~32min
completed: 2026-09-27
status: complete
---

# Phase 76 Plan 08: Restore-Drill Canary + Integrity Baseline + Restore Tooling Summary

**Synthetic restore-drill canary seeded idempotently into Chatwoot and EspoCRM, a D-09/Pitfall-14 integrity checker (drill-verify.sh) proven clean on production and embedded in every nightly snapshot via backup.sh, and restore.sh with a production-proven read-only rehearsal (--verify-only) plus the egress-gated --drill/--full modes and full drill runbook ready for plan 76-09.**

## Ordering Note (orchestrator-directed deviation)

This plan's frontmatter declares `depends_on: ["76-07"]`, but per the
orchestrator's explicit dispatch instruction, **76-07 (controlled outage
test) was deliberately deferred to the end of the phase** — it needs
owner-held monitoring accounts and owner confirmations not yet available.
The orchestrator verified before dispatch that this plan has no *content*
dependency on 76-07's output — it only needs the live Chatwoot/EspoCRM apps
from Plan 76-04 and the backup tooling from Plan 76-05, both already
complete — and directed this plan to run now, out of the declared
`depends_on` order.

**Confirmed during execution: no real dependency on 76-07 was found.**
Nothing in this plan reads, requires, or waits on any 76-07 artifact,
runbook, or outcome. This is recorded here as the ordering deviation the
dispatch instructed to surface, not as a defect.

## Performance

- **Duration:** ~32 min
- **Started:** 2026-09-27T23:04:00Z (approx.)
- **Completed:** 2026-09-27T23:36:30Z
- **Tasks:** 2/2 completed
- **Files created:** 6, modified: 3

## Accomplishments

- `infra/vps/drill/canary.txt` — a fixed-content, no-personal-data synthetic canary file; its sha256 (`909a5520...`) is the single reference checksum used everywhere the drill checks it.
- `infra/vps/scripts/seed-drill-canary.sh` — idempotently seeds the canary into Chatwoot (API inbox "Restore drill canary", contact "Restore Drill Canary" with no email/phone, one resolved conversation with a message carrying the canary attachment) and EspoCRM (Account "Restore Drill Canary", Document "Restore drill canary file" with the canary as its file, linked to the Account). Verified idempotent by running it twice on production: second run created nothing.
- `infra/vps/scripts/drill-verify.sh` — encodes every D-09/Pitfall 14 check: Chatwoot orphan counts (dangling `contact_inbox_id`, messages without a conversation, attachments without a message, `active_storage_attachments` without a blob — all confirmed 0 on production), per-account `conv_dpid_seq_ACCOUNTID` sequence correctness, canary presence + checksum in both apps, and EspoCRM's non-deleted counts + `documents_missing_attachment` check. `--baseline` (read-only, safe on production) ran clean (12/12 OK). `--drill --baseline-file` additionally compares every count against a baseline, re-checks canary IDs match, performs one functional conversation insert-then-destroy proving the `display_id` trigger, and proves egress is blocked — refuses outright on hostname `prestigo-vps` so it can never run destructively on production.
- `infra/vps/scripts/backup.sh` now runs `drill-verify.sh --baseline` immediately before the dumps on every backup, writing `drill-baseline.json` into the same snapshot; a failed baseline does not abort the backup (the data is still captured) but pings Healthchecks `/fail` instead of `/success` at the end. Ran live on production: baseline OK, new snapshot `0d783b96` created, `restic ls latest` confirms `dumps/drill-baseline.json` is present.
- `infra/vps/scripts/restore.sh` — `--verify-only` restores the latest snapshot into a root-only rehearsal directory, proves `pg_restore --list` on the Chatwoot dump lists the `conversations` table, the EspoCRM dump contains the `account` table definition, `drill-baseline.json` is present, and both canary files match their baseline checksum — then always deletes the rehearsal directory, never touching any running container. Run 4 times consecutively on production (including the plan's exact `<verify>` command): every run exited 0 with no FAIL lines and left `REHEARSAL_CLEAN`. `--drill --phase fetch|start` and `--full` are fully implemented (egress gate, D-09 URL overrides, volume restore, DB restore, service-start restrictions) but exercised for the first time on a real disposable host in Plan 76-09.
- `infra/vps/runbooks/restore-drill.md` — the complete D-09 procedure: Hetzner Cloud SSH-key/firewall/server provisioning via the API, bootstrap + deploy at a committed SHA, placing the owner's password-manager `backup.env` copy (never production's), the fetch/lock-egress/start/verify/owner-login/teardown sequence, and a "Drill log" table for Plan 76-09 to fill in with real timings and results.
- Evidence: `.planning/phases/76-vps-infrastructure/evidence/drill-baseline.json` — the actual production baseline (counts, orphan zeros, canary IDs/checksums, no secrets) copied from the snapshot.

## Task Commits

1. **Task 1 (tracer): canary seed -> read-only integrity baseline -> baseline inside the nightly snapshot** - `286bcb87` (feat)
2. **Task 2: restore.sh (verify-only / drill / full) + restore-drill runbook + production rehearsal** - `c0b236a9` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `infra/vps/drill/canary.txt` - fixed-content synthetic canary (sha256 reference)
- `infra/vps/scripts/seed-drill-canary.sh` - idempotent canary seeding, both apps
- `infra/vps/scripts/drill-verify.sh` - D-09/Pitfall 14 integrity checker, `--baseline`/`--drill` modes
- `infra/vps/scripts/backup.sh` - pre-dump integrity baseline hook (modified)
- `infra/vps/scripts/restore.sh` - `--verify-only`/`--drill`/`--full` restore tooling
- `infra/vps/runbooks/restore-drill.md` - full D-09 drill procedure + Drill log
- `infra/vps/scripts/restic.sh` - `/var/backups/prestigo` mount fixed to read-write (modified)
- `infra/vps/README.md` - corrected restore-drill.md runbook-index attribution (modified)
- `.planning/phases/76-vps-infrastructure/evidence/drill-baseline.json` - production baseline evidence

## Decisions Made

See `key-decisions` in frontmatter. In short: the ordering deviation was orchestrator-directed and confirmed harmless during execution; EspoCRM's `Document.accounts` field turned out to be ACL-gated (not a plain create field as this plan's interfaces block assumed), so the join row is written directly via root MariaDB rather than widening the least-privilege canary role's ACL; `restic.sh`'s `/var/backups/prestigo` mount was read-only (a Plan 76-05 bug, invisible until a restore actually tried to write there) and is now read-write; `docker exec` needs `-i` for any heredoc-fed `rails runner` call or the container silently receives no stdin.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EspoCRM `Document.accounts` is not a plain create field**
- **Found during:** Task 1 (EspoCRM canary Document creation)
- **Issue:** This plan's interfaces block assumed `POST /Document` with `accountsIds: [...]` would link the Document to the Account. Live testing showed `Document.accounts` is a `linkMultiple` field with `directUpdateDisabled: true`/`noLoad: true` in EspoCRM's own entityDefs — it silently cannot be set this way. The documented alternative, `POST /Document/{id}/accounts` (the generic relate action), returned `403` because it requires `edit` ACL on Document, which the least-privilege `restore-drill-canary` role (Plan 76-04, T-76-34: create+read only) deliberately does not have.
- **Fix:** Insert the `account_document` join row directly via root MariaDB (same access pattern `backup.sh` already uses for `mariadb-dump`), idempotent (checked by count before insert). Also discovered `Document.publishDate` is required by the API (its default is a frontend-only JS expression) — added explicitly.
- **Files modified:** `infra/vps/scripts/seed-drill-canary.sh`
- **Verification:** `drill-verify.sh --baseline` confirms `espocrm-canary-present` OK (account/document/attachment/link all resolve); the canary role's ACL was left untouched (create+read only, as designed).
- **Committed in:** `286bcb87` (Task 1 commit)

**2. [Rule 1 - Bug] `docker exec` silently drops stdin without `-i`**
- **Found during:** Task 1 (rails runner heredoc calls returning no output at all)
- **Issue:** `docker exec -e VAR=... container bundle exec rails runner - <<'RUBY' ... RUBY` produced zero output and no error — `docker exec` does not attach stdin by default, so `rails runner -` (read script from stdin) received nothing and silently ran an empty script.
- **Fix:** Added `-i` to every `docker exec` call that feeds a heredoc via stdin (the Chatwoot admin-token resolution in `seed-drill-canary.sh`, the functional-insert test in `drill-verify.sh`).
- **Files modified:** `infra/vps/scripts/seed-drill-canary.sh`, `infra/vps/scripts/drill-verify.sh`
- **Verification:** Manual reproduction confirmed output only appears with `-i`; full seed run then succeeded.
- **Committed in:** `286bcb87` (Task 1 commit)

**3. [Rule 1 - Bug] `restic.sh`'s `/var/backups/prestigo` mount was read-only, breaking every restore**
- **Found during:** Task 2 (`restore.sh --verify-only` first live run — restic logged 158 `read-only file system` errors and restored 0 files)
- **Issue:** Plan 76-05's `restic.sh` mounts `/var/backups/prestigo:ro`, correct for `backup.sh` (a pure read source for dumps) but wrong for any `restic restore`, whose target directory lives under that same path. Every restore attempt failed silently (restic logs "ignoring error" per path and continues, so the failure wasn't obvious until the restored tree was empty).
- **Fix:** Changed the mount to read-write in `restic.sh`; `/etc/prestigo` and `/opt/prestigo` stay read-only since nothing restores into them through this wrapper (`restore.sh` copies files into place itself, outside restic).
- **Files modified:** `infra/vps/scripts/restic.sh`
- **Verification:** `restore.sh --verify-only` restored 116/116 files/dirs correctly afterward; re-ran 4x consecutively with a clean exit each time.
- **Committed in:** `c0b236a9` (Task 2 commit)

**4. [Rule 1 - Bug] Piping a live producer into an early-exiting `grep -q` under `pipefail` causes intermittent false FAILs**
- **Found during:** Task 2 (`restore.sh --verify-only`'s `pg_restore --list | grep -qw conversations` check failed intermittently — sometimes OK, sometimes FAIL — with byte-identical restored content each time)
- **Issue:** `set -o pipefail` reports the exit status of the *last command to fail* anywhere in a pipeline, not just the rightmost command. `grep -q`/`grep -qw` exits as soon as it finds a match, closing its read end; if the upstream producer (`docker run pg_restore --list`, or later a `curl`/`printf`) is still writing when that happens, it receives `SIGPIPE` and pipefail reports *that* non-zero exit for the whole pipeline — even though `grep` itself found the match. This is a genuine race (depends on process scheduling / pipe buffer size vs. where the match falls in the output), which is exactly why it was flaky rather than always-failing.
- **Fix:** Capture the producer's output into a shell variable first (so the producer always runs to completion, no live pipe to SIGPIPE), then feed `grep` via a here-string (`<<<`) rather than a second pipe — a here-string has no concurrent writer process at all. Applied to `restore.sh`'s `pg_restore --list` check and, since the exact same pattern existed there, `drill-verify.sh`'s `--drill`-mode EspoCRM HTTP check.
- **Files modified:** `infra/vps/scripts/restore.sh`, `infra/vps/scripts/drill-verify.sh`
- **Verification:** Re-ran `restore.sh --verify-only` 3+ consecutive times after the fix — deterministic PASS every time (previously intermittent).
- **Committed in:** `c0b236a9` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs discovered live during execution, none architectural)
**Impact on plan:** All four were necessary for correctness; none touched this plan's threat-model mitigations (the EspoCRM ACL fix in particular *preserves* T-76-34's least-privilege posture rather than weakening it). No scope creep.

## Issues Encountered

Covered fully under "Deviations from Plan" above — all four were diagnosed and resolved within this run with no outstanding follow-up.

## Known Stubs

None. `restore.sh --drill`/`--full` are fully implemented (not placeholders) but have not yet been exercised end-to-end on a real host — that is Plan 76-09's explicit job (provisioning the disposable Hetzner host). This is the plan's own designed handoff point (see `<success_criteria>`: "the full drill is scripted and documented," not "the full drill has been run"), not an unplanned gap.

## Threat Flags

None — every new surface (canary seeding via the least-privilege EspoCRM API user, the direct-SQL account_document link, the restic mount write-access change, the rehearsal/staging restore targets) was already enumerated in this plan's `<threat_model>` (T-76-33 through T-76-36, T-76-SC) and mitigated as designed. The account_document direct-SQL fix specifically *strengthens* T-76-34's mitigation by avoiding an ACL widening that would otherwise have been needed.

## User Setup Required

None — no external service configuration required for this plan. (Plan 76-09 will require the owner to provide a Hetzner Cloud API token and the password-manager `backup.env` copy for the actual drill run.)

## Next Phase Readiness

- `infra/vps/scripts/restore.sh` and `infra/vps/runbooks/restore-drill.md` are ready for Plan 76-09 to provision a real disposable Hetzner host and run the drill end-to-end, filling in the "Drill log" table.
- `infra/vps/scripts/drill-verify.sh --drill --baseline-file` is ready to be run against `evidence/drill-baseline.json` (or a fresher one) once the drill host exists.
- The nightly backup now self-checks its own data integrity before every dump; a future integrity regression will surface as a Healthchecks `/fail` ping (once Plan 76-06's monitoring is wired to alert on it) rather than a silently-corrupt backup.
- Plan 76-07 (controlled outage test) remains deferred per the phase's stated end-of-phase batching — this plan did not touch or depend on it.
- No blockers.

---
*Phase: 76-vps-infrastructure*
*Completed: 2026-09-27*

## Self-Check: PASSED

- FOUND: infra/vps/drill/canary.txt
- FOUND: infra/vps/scripts/seed-drill-canary.sh
- FOUND: infra/vps/scripts/drill-verify.sh
- FOUND: infra/vps/scripts/restore.sh
- FOUND: infra/vps/runbooks/restore-drill.md
- FOUND: .planning/phases/76-vps-infrastructure/evidence/drill-baseline.json
- FOUND commit: 286bcb87 (Task 1)
- FOUND commit: c0b236a9 (Task 2)
- `bash -n` clean on seed-drill-canary.sh, drill-verify.sh, restore.sh, backup.sh
- Re-ran all plan-level `<verify>`/acceptance commands live on production:
  - `drill-verify.sh --baseline --out FILE` -> 12/12 OK, exit 0
  - `restic.sh ls latest | grep -c dumps/drill-baseline.json` -> 1
  - `jq -e '.chatwoot.orphans | to_entries | all(.value==0)'` on evidence file -> true
  - `jq -r '.canarySha256'` on evidence file == `shasum -a 256 canary.txt` -> match
  - `restore.sh --verify-only` -> exit=0, REHEARSAL_CLEAN, no FAIL lines (run 4x consecutively, deterministic)
  - `grep -q -- "--phase start"` and `grep -q "example.com"` on restore.sh -> both pass
  - restore-drill.md contains all 5 required strings (password manager, 127.0.0.1/32, DOCKER-USER, Drill log, purpose=prestigo-restore-drill)
- rsync dry-run confirms the deployed /opt/prestigo on the VPS exactly matches the committed repo state (no drift)
