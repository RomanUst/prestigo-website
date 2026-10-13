---
phase: 80-espocrm-deployment-core-entities
plan: 03
subsystem: infra
tags: [espocrm, crm, supabase, mapping, dst, vitest, pure-functions]

requires:
  - phase: 76-vps
    provides: EspoCRM VPS target the backfill will write to (consumed by plan 80-09)
provides:
  - "infra/espocrm/lib/booking-map.mjs: pure Supabase export row -> CBooking/Contact payload mapping with pinned enums and currency"
  - "infra/espocrm/lib/candidates.mjs: pure D-14 Account candidate builder with owner-confirm gate"
  - "tests pinning migration 053/039 enums, types/booking.ts unions and lib/currency.ts rates"
affects: [80-04, 80-05, 80-09]

actuals:
  tokens: 10102
  tasks: 3
  commits: 3
plan_head_before: 5e8b249eef1185a7ee9dae10742f268fae73c02c
plan_head_after: bf63dc4f96e1cfd2299ee1f863061b8a4fba503b

tech-stack:
  added: []
  patterns:
    - "Pure .mjs modules under infra/espocrm/lib with named exports, tested from tests/*.test.ts (node environment)"
    - "Pin tests read the site's own source files (migrations, types, currency) from inside the test only; the module stays I/O-free"
    - "Europe/Prague DST handled with Intl.DateTimeFormat formatToParts, no date library"

key-files:
  created:
    - infra/espocrm/lib/booking-map.mjs
    - infra/espocrm/lib/candidates.mjs
    - tests/espocrm-booking-map.test.ts
    - tests/espocrm-candidates.test.ts
  modified: []

key-decisions:
  - "Repeated autumn hour (2026-10-25 02:30 Prague) resolves to the earlier instant (summer time, 00:30Z); a skipped spring hour rolls forward one hour"
  - "A company-only group (free-mail bookers) merges into a corporate-domain group that carries the same normalized company name, so one partner is one candidate"
  - "Candidates store no booker addresses; distinct bookers are counted through an internal set that is not exposed"
  - "Rows carrying the canary company name are dropped entirely, not only the group"
  - "rowToBooking throws BookingMapError (unknown_status/source/leg/trip_type/vehicle_class, missing_id) so the backfill counts invalid rows instead of writing them"

patterns-established:
  - "Fail-closed enum mapping: values outside the pinned lists raise a coded error"
  - "Deterministic ordering with a total tie-break (count desc, name asc, key asc) so input shuffles give identical output"

requirements-completed: [CRM-03, CRM-01]

coverage:
  - id: D1
    description: "rowToBooking/rowToContact map a Supabase export row to the full D-09 CBooking payload and Contact payload, with D-18 admin link"
    requirement: "CRM-03"
    verification:
      - kind: unit
        ref: "tests/espocrm-booking-map.test.ts#tracer: confirmed online row -> CBooking + Contact payload"
        status: pass
    human_judgment: false
  - id: D2
    description: "Abandoned-checkout exclusion boundary, D-21 payment method order, CZK->EUR rounding and Europe/Prague DST conversion are pinned by tests"
    requirement: "CRM-03"
    verification:
      - kind: unit
        ref: "tests/espocrm-booking-map.test.ts#isAbandonedCheckout, inferPaymentMethod, amountEur, pickupAtUtc"
        status: pass
    human_judgment: false
  - id: D3
    description: "Enum and currency constants are pinned against migrations 053/039, types/booking.ts and lib/currency.ts"
    requirement: "CRM-03"
    verification:
      - kind: unit
        ref: "tests/espocrm-booking-map.test.ts#pins against the site sources of truth"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildCandidates/selectConfirmed/formatCandidateTable produce a deterministic, PII-free D-14 candidate list gated by explicit owner confirmation"
    requirement: "CRM-01"
    verification:
      - kind: unit
        ref: "tests/espocrm-candidates.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-13
status: complete
---

# Phase 80 Plan 03: Booking mapping and Account candidates Summary

**Two pure, fully tested transforms: Supabase booking row -> CBooking/Contact payload (exclusion boundary, D-21 payment rule, CZK->EUR rounding, Europe/Prague DST via Intl) and booking rows -> deterministic PII-free D-14 Account candidates behind an owner-confirm gate.**

## Performance

- **Duration:** about 12 min
- **Tasks:** 3 (1 tracer, 2 auto/TDD)
- **Files created:** 4 (2 modules, 2 test files); no existing file modified
- **Tests:** 102 passing across the two new test files

## Accomplishments

- `booking-map.mjs` (23 exports): `rowToBooking`, `rowToContact`, `normalizeEmail`, `isAbandonedCheckout`, `inferPaymentMethod`, `pickupAtUtc`, `amountEur`, `buildAdminLink`, `sanitizeText`, `czkToEur`, pinned enum/currency constants, `BookingMapError`. No `node:fs`, no `fetch`.
- Exclusion boundary exactly as D-08/D-21: only `unpaid` + online (missing source counts as online) + no `payment_link_id` is dropped; unpaid+manual, unpaid+link and pending+online are kept.
- `pickupAtUtc` converts Prague local date+time to UTC correctly in winter, summer and on the 2026-03-29 and 2026-10-25 switch days without a date library; `pickup_utc` wins when present.
- `amountEur` never returns 0 for missing data (null when both amounts are null) and matches `lib/currency.ts` rounding, with the rates pinned by a test that reads the TS file.
- `candidates.mjs`: grouping by corporate domain and company name, free-mail/own-domain/canary exclusion, qualification (company hit or 2+ distinct bookers), order-independent output, `selectConfirmed` gate, address-free table.

## Task Commits

1. **Task 1 (tracer): row -> CBooking/Contact payload** - `62bba70d` (feat)
2. **Task 2: exclusion, payment rule, currency, DST, empties, enum pins** - `abeafd64` (test)
3. **Task 3: D-14 account candidates** - `bf63dc4f` (feat)

The tracer feedback gate ran in end-of-phase mode with an automated-only `<verify>`: `npx vitest run tests/espocrm-booking-map.test.ts` re-run green before expansion.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations):
- Task 1 intentionally shipped `pickupAtUtc` with the `pickup_utc` branch only; the Prague-local branch was added test-first in Task 2 as planned.
- The `verify` project skill is not present in this worktree (`.claude/skills` is absent), so its checks were run directly: `npx tsc --noEmit` (no errors in the new files), `npx eslint --quiet` on the four files (clean), and the two vitest files. No secrets, no `.env*`, no hard-coded EUR prices in `app/` or `components/`.

## Verification Results

- `npx vitest run tests/espocrm-booking-map.test.ts tests/espocrm-candidates.test.ts` - 2 files, 102 tests passed.
- `grep -c "^export" infra/espocrm/lib/booking-map.mjs` = 23 (>= 15); `grep -c "node:fs\|fetch(" ...booking-map.mjs` = 0.
- Pin paths present in the test file (7 matches for migrations 053/039, types/booking.ts, lib/currency.ts).
- `grep -c "Restore Drill Canary" candidates.mjs` = 1; `grep -c "emails" candidates.mjs` = 0.

## Known Stubs

None.

## Threat Flags

None. All fixtures are synthetic (example.test / fake names, T-80-07); `sanitizeText` strips control characters and caps to `FIELD_MAX_LENGTH` (T-80-08, tested); boundary and per-branch tests cover T-80-09; no package installs (T-80-SC).

## Next Phase Readiness

Plan 80-09 (backfill) can import `rowToBooking`, `rowToContact`, `isAbandonedCheckout`, `SYNCED_BOOKING_FIELDS` and `buildCandidates`/`selectConfirmed` directly. Plan 80-04 must create the CBooking fields with exactly the payload key names, enum option lists and max lengths exported here.

## Self-Check: PASSED

- Created files exist: infra/espocrm/lib/booking-map.mjs, infra/espocrm/lib/candidates.mjs, tests/espocrm-booking-map.test.ts, tests/espocrm-candidates.test.ts
- Commits found: 62bba70d, abeafd64, bf63dc4f
