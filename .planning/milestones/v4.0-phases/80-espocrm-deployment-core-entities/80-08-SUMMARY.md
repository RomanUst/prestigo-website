---
phase: 80-espocrm-deployment-core-entities
plan: 08
subsystem: infra
tags: [espocrm, unique-index, metadata-overlay, vps, idempotency]
status: complete
requirements: [CRM-03]
requires: ["80-07"]
provides:
  - "Live unique index supabaseBookingIdDeleteId on CBooking (supabaseBookingId + deleteId), proven by a rejected duplicate"
  - "infra/espocrm/overlay.mjs (mergeOverlay, hasOverlay; CLI merge/check/precheck/rebuild/probe-unique)"
affects: [80-09, 80-10, 80-12, 82]
key-files:
  created:
    - infra/espocrm/overlay/CBooking.entityDefs.json
    - infra/espocrm/overlay.mjs
    - tests/espocrm-overlay.test.ts
  modified: []
decisions:
  - "Unique index is created only by EspoCRM's own rebuild from a metadata overlay (core User.userName pattern); no SQL touched MariaDB"
  - "probe-unique treats any non-2xx API answer except 401/403/transport failure as 'enforced', then confirms exactly one row holds the key"
metrics:
  duration: ~25min
  completed: 2026-10-13
actuals:
  tokens: 6500
  tasks: 2
  commits: 1
plan_head_before: c787efe8e2cef905ab4cd99931916d401cc65a3d
plan_head_after: c20ebddebd5fc17037fccdc04db76a6e6c859b05
---

# Phase 80 Plan 08: CBooking unique index via metadata overlay Summary

The CRM itself now refuses a second CBooking with the same `supabaseBookingId`: a metadata overlay (`indexes.supabaseBookingIdDeleteId` unique on `supabaseBookingId` + `deleteId`, plus `deleteId: true`) was merged into the FieldManager-written custom file on the VPS and EspoCRM's own rebuild created the index.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 | Owner approves the four VPS commands (D-19) | done, owner replied "vps approved" (allow rules for `ssh *prestigo-vps*` / `scp *prestigo-vps*`) | none (checkpoint) |
| 2 (tracer) | Overlay tool + live apply | done | c20ebdde |

`commits: 1` is measured from the continuation base c787efe8 (the earlier partial-summary commit 3e91404a and its merge are in that base); the final SUMMARY commit follows this one.

## Live run (in the planned order, one command at a time)

1. `precheck`: `cbooking_total=0`, exit 0 (soft-deleted acl-probe rows from 80-07 are invisible to the list API and carry unique values).
2. S1 backup: `Result=success` (restic snapshot taken before the overlay).
3. S2 fetch: 5374 bytes saved to `infra/espocrm/.work/CBooking.current.json` (rollback copy, git-ignored). `check` on it: `overlay missing`, exit 3 as expected.
4. `merge`: `merge: added=indexes.supabaseBookingIdDeleteId,deleteId`. Fields and links verified identical between current and merged; the current file already had an `indexes` key, which was extended, not replaced.
5. S3 upload and S4 install: both exit 0, file copied into the app container and chowned to www-data.
6. `rebuild`: `rebuild: done`, exit 0 (rollback not needed).
7. `probe-unique` run 1: `unique=enforced`. Run 2: `unique=enforced` (fresh key each run, probe records deleted, so deleteId frees keys and no leftovers remain; follow-up `precheck` shows `cbooking_total=0`).
8. S2 again into `CBooking.after.json`: `check` -> `overlay present`, exit 0.
9. `node infra/espocrm/sync.mjs --dry-run`: `summary: create=0 update=0 removed=0` (every resource unchanged; the overlay did not disturb the declared model).

Only the four owner-approved VPS commands (S1, S2 twice, S3, S4) were run on the host. The "Restore Drill Canary" Account was not touched. No credentials were printed.

## Verification

- `npx vitest run tests/espocrm-overlay.test.ts`: 21 tests pass (merge correctness, key order, idempotency byte-for-byte, wrong-file guard, unrelated index kept, probe enforced / 500 / absent / 403 surfaced, precheck duplicate detection without printing keys, rebuild).
- `npx eslint --quiet` on the new files: clean. `npx tsc --noEmit`: no errors in the new files (the 8 baseline errors are in older tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mergeOverlay aliased overlay objects into its result**
- **Found during:** Task 2 (RED/GREEN, a test mutating the merged output changed the shared overlay constant)
- **Issue:** `indexes[name] = def` shared the overlay's index object with the result.
- **Fix:** `structuredClone(def)`.
- **Files modified:** infra/espocrm/overlay.mjs
- **Commit:** c20ebdde

**2. [Rule 3 - Blocking] tsc rejected the option-object calls to the .mjs functions in the test**
- **Found during:** Task 2 (type check)
- **Issue:** `= {}` parameter defaults made the inferred option type empty.
- **Fix:** JSDoc `@param` types, removed the `= {}` defaults.
- **Files modified:** infra/espocrm/overlay.mjs
- **Commit:** c20ebdde

## Known Stubs

None.

## Threat Flags

None. T-80-23 (broken file): merge guard + restic snapshot + rollback copy, rebuild succeeded so rollback unused. T-80-24: only the four listed commands ran. T-80-25: precheck found no duplicates.

## Next step

Plan 80-09 / 80-10 (parallel) and the orchestrator merge; the unique index is now available for the 80-12 backfill and the Phase 82 outbox.

## Self-Check: PASSED

- FOUND: infra/espocrm/overlay.mjs, infra/espocrm/overlay/CBooking.entityDefs.json, tests/espocrm-overlay.test.ts
- FOUND commit: c20ebdde
