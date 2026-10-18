---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 08
subsystem: infra
tags: [espocrm, lead, unique-index, metadata-overlay, vps, idempotency]
requires: [81-03, 81-06]
provides:
  - Live unique index cSupabaseRefDeleteId on Lead (cSupabaseRef + deleteId) via custom entityDefs overlay
  - overlay.mjs generalised to --entity CBooking|Lead (ENTITY_SPECS: keyField, overlayFile, probeBody, emptyKeyProbe, createHeaders)
  - probe-unique for Lead proves duplicates are refused AND keyless (manual) Leads stay creatable
affects: [81-07, 81-09, 81-10, 81-11]
tech-stack:
  added: []
  patterns:
    - "probe creates on stock Lead send X-Skip-Duplicate-Check so EspoCRM's name-based duplicate detection cannot mask the DB index"
key-files:
  created:
    - infra/espocrm/overlay/Lead.entityDefs.json
  modified:
    - infra/espocrm/overlay.mjs
    - infra/espocrm/lib/client.mjs
    - infra/espocrm/README.md
    - tests/espocrm-overlay.test.ts
key-decisions:
  - "Same mechanism as Phase 80 D-19 (custom metadata overlay + rebuild), owner-approved SSH L1-L4 only"
  - "Admin client request() takes optional extra headers that never override auth headers"
requirements-completed: []
duration: ~45min
completed: 2026-10-18
commits: 4
plan_head_before: a0b56069
---

# Plan 81-08: Lead unique index on cSupabaseRef — Summary

The CRM itself now refuses a second Lead with the same site reference: a unique index on `Lead.cSupabaseRef` (+ `deleteId`, so soft-deleted rows don't block) is live, installed through the same metadata-overlay path as the Phase 80 CBooking index. Leads without a reference (created by hand in the CRM) are still accepted.

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | [checkpoint] owner approves VPS commands L1-L4 | DONE — owner replied "vps approved"; L1 → `Result=success` | — |
| 2 | Generalised overlay tool + live apply (tracer) | DONE | 3dab773b (RED), 037442e7 (GREEN), 915a4952, a2f1ca39 (fixes found live) |

## Live run (orchestrator, 2026-10-18)

1. `overlay.mjs precheck --entity Lead` → `lead_total=0`, exit 0 (no duplicate keys).
2. L1 backup → `Result=success`. L2 fetch → `Lead.current.json` (1465 bytes); `check --entity Lead` → `check: overlay missing`, exit 3 (expected).
3. `merge ... --entity Lead` → `merge: added=indexes.cSupabaseRefDeleteId,deleteId`; fields and links deep-equal to the live file.
4. L3 upload + L4 install → success.
5. `overlay.mjs rebuild` → `rebuild: done` (RESEARCH A3 held: deleteId on the stock lead table rebuilt cleanly). No rollback needed.
6. `probe-unique --entity Lead` twice → `unique=enforced`, `empty_keys=allowed`, exit 0 both times; every probe record deleted (`lead_total=0` afterwards).
7. L2 again → `Lead.after.json`; `check --entity Lead` → `check: overlay present`, exit 0.
8. `sync.mjs --dry-run` → create=0 update=0 for every resource (fields unchanged=36).
9. Regression: `probe-unique` (CBooking default) → `unique=enforced`, exit 0; `precheck` → `cbooking_total=56 duplicates=0`.

## Deviations from Plan

**1. [Rule 1 - Bug, found live] Lead probe masked by EspoCRM duplicate detection** (915a4952)
- First live probe exited 2: stock Lead runs name-based duplicate detection, so the second create got a 409 *duplicate list* before reaching the database, and the control create (same lastName) was refused the same way. A refusal in that state says nothing about the index.
- Fix: `ENTITY_SPECS.Lead.createHeaders = { 'X-Skip-Duplicate-Check': 'true' }` on every probe create (the header the site dispatcher already uses, 81-07); `lib/client.mjs` `request(method, path, body, extraHeaders)` merges caller headers under the auth headers. New tests assert the header on all 5 Lead probe POSTs and its absence on CBooking.
- The failed run left nothing behind (finally-block cleanup; `lead_total=0`).

**2. [Rule 1 - Bug, pre-existing since Phase 80 review] CBooking control key exceeded varchar(36)** (a2f1ca39)
- The regression probe failed with 400 `maxLength` on `supabaseBookingId`: the 35-char key plus `-control` = 43 > 36. Same code existed before this phase (the control step was added in the Phase 80 review), so not a regression from 81-08.
- Fix: key = `unique-probe-<base36 ms>-<3 random bytes hex>` (28 chars, 36 with `-control`); tests pin the format and assert every probe key ≤ 36 chars.

**3. README.md** got a one-line `--entity Lead` mention (not in files_modified).

## Verification

- `npx vitest run tests/espocrm-*.test.ts tests/crm-runbook.test.ts` → 15 files, 595 tests passed.
- eslint clean on overlay.mjs, lib/client.mjs, tests/espocrm-overlay.test.ts.
- `grep -c "cSupabaseRefDeleteId" infra/espocrm/overlay/Lead.entityDefs.json` → 1.

## Known Stubs

None.

## Threat Flags

None new. The probe creates only `lastName: unique-probe` records with synthetic keys and deletes them; no PII is printed.

## Self-Check: PASSED
