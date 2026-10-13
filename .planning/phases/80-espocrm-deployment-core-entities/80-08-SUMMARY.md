---
phase: 80-espocrm-deployment-core-entities
plan: 08
subsystem: infra
tags: [espocrm, unique-index, metadata-overlay, vps, checkpoint]
status: blocked
requirements: [CRM-03]
requires: ["80-07"]
provides: []
key-files:
  created: []
  modified: []
decisions: []
metrics:
  duration: ~5min
  completed: 2026-10-13
actuals:
  tokens: 0
  tasks: 0
  commits: 0
plan_head_before: 6f89a434d64c30c27290bba84d8b3b2ca98a8bc9
plan_head_after: 6f89a434d64c30c27290bba84d8b3b2ca98a8bc9
---

# Phase 80 Plan 08: CBooking unique index via metadata overlay Summary (PARTIAL, blocked at Task 1)

Status: blocked at Task 1 (`checkpoint:human-action`, `gate="blocking-human"`). No code was written and no VPS command was run. The plan's first task is the D-19 owner approval of the four VPS commands; Task 2 (the tracer) carries the precondition "owner replied `vps approved`", which is unmet, so Task 2 was not started and not partially committed.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 | Owner approves the four VPS commands (D-19) | awaiting owner | none |
| 2 (tracer) | Overlay tool + live apply (backup, fetch, merge, install, rebuild, duplicate rejected) | not started (precondition unmet) | none |

## What is prepared for the owner

Exact command set (from the plan, unchanged) that the continuation executor will run, in this order, only after approval:

- Local prep (no VPS): `mkdir -p infra/espocrm/.work` (the directory is git-ignored).
- S1 backup: `ssh prestigo-vps 'sudo systemctl start prestigo-backup.service && systemctl show -p Result prestigo-backup.service'` (must end `Result=success`; first and only VPS command before the rest).
- S2 fetch: `ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose exec -T app cat custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json' > infra/espocrm/.work/CBooking.current.json`
- S3 upload: `scp infra/espocrm/.work/CBooking.merged.json prestigo-vps:/tmp/CBooking.merged.json`
- S4 install: `ssh prestigo-vps 'cd /opt/prestigo/espocrm && sudo docker compose cp /tmp/CBooking.merged.json app:/var/www/html/custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json && sudo docker compose exec -T app chown www-data:www-data custom/Espo/Custom/Resources/metadata/entityDefs/CBooking.json && rm /tmp/CBooking.merged.json'`
- Rollback (only if rebuild fails): S3/S4 with `infra/espocrm/.work/CBooking.current.json`, then `node infra/espocrm/overlay.mjs rebuild`.
- S2 is run a second time (output to `CBooking.after.json`) after the rebuild to check that the overlay keys persisted.

## Deviations from Plan

None - plan executed exactly as written up to the checkpoint.

## Known Stubs

None.

## Next step

Owner replies "vps approved" (after adding allow-rules for S1-S4 and the rollback pair, or switching to Ask mode, and making sure nobody edits EspoCRM Entity Manager for about 10 minutes). Then a continuation executor runs Task 2: tests and overlay tool first (RED/GREEN), then the live sequence precheck, S1, S2, check (expect exit 3), merge, S3, S4, rebuild, probe-unique twice, S2 again, check (exit 0), `sync.mjs --dry-run` (create=0 update=0), commit, final SUMMARY.

## Self-Check: PASSED

No files or commits are claimed beyond this SUMMARY.
