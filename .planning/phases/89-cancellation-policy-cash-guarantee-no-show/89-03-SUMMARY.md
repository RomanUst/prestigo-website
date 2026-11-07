---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 03
subsystem: payments
tags: [cancellation, policy, admin-settings, zod, vitest]
status: complete
requires:
  - phase: 89-01
    provides: "pricing_globals cancel_* columns (migration 087); tests mock the row, so order does not matter"
provides:
  - "lib/cancellation-policy.ts: pure client-safe policy rules"
  - "lib/cancellation-settings.ts: guarded settings reader and snapshot builder"
  - "/api/admin/settings carries the five cancel_* fields and the 422 cross-checks"
  - "CancellationPolicySettings admin card"
affects: [89-04, 89-05, checkout, manage-page, admin-dialogs]
tech-stack:
  added: []
  patterns: ["pure integer-ms policy function shared by server and client", "guarded service read (try wraps client construction)"]
key-files:
  created:
    - lib/cancellation-policy.ts
    - lib/cancellation-settings.ts
    - components/admin/CancellationPolicySettings.tsx
    - tests/cancellation-policy.test.ts
    - tests/cancellation-policy-settings.test.tsx
  modified:
    - app/api/admin/settings/route.ts
    - components/admin/NoShowWaitSettings.tsx
    - app/(internal)/admin/(dashboard)/settings/page.tsx
    - tests/admin-settings.test.ts
key-decisions:
  - "Free is inclusive at the deadline; up to and including the km threshold is the short window (research A1, A2)"
  - "policyFromSnapshot returns LEGACY_POLICY (one hour everywhere) for NULL, malformed or out-of-bounds data, never today's settings (D-18)"
  - "Settings route reads the stored row only when a request carries one side of a pair; a failed read answers 500 rather than skipping the check"
  - "On a 422 cross-check the admin field keeps the typed text next to the explanation, and the saved baseline is reverted so a re-blur re-sends"
requirements-completed: [CANC-01]
commits: 3
plan_head_before: a6e076f163b99ea4d534892128d2044363cf0fc1
plan_head_after: 9ca96098849f88b4228413f3b4cbabd0fa692b4c
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 03: Cancellation policy rules and admin settings Summary

One pure `evaluateCancellation` shared by server, checkout, manage page and admin dialogs (free, late or too_late at the 100 km boundary), a guarded `getCancellationPolicy` reader, the five `cancel_*` settings in the admin route and card, and the WR-06 airport-below-city fix.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Policy module, settings reader, boundary tests | 3591f207 |
| 2 | Settings route: five fields, 422 cross-checks, WR-06 | e130a5a2 |
| 3 | CancellationPolicySettings card, NoShowWaitSettings airport error | 9ca96098 |

## What was built

- `lib/cancellation-policy.ts` (no server imports; `grep -cE "from '@/lib/supabase|next/server|node:"` prints 0): `CancellationPolicy`, `CancelOutcome`, `evaluateCancellation`, `freeHoursFor`, `policyFromSnapshot`, `proposedFeeMinor`, `tripFactsFromRow`, `CANCELLATION_POLICY_VERSION = '2026-11-1'`, `DEFAULT_POLICY` (100, 1, 12, 12, 100), `LEGACY_POLICY`, plus `POLICY_BOUNDS` (shared by the route-side numbers and the card).
- `lib/cancellation-settings.ts`: `getCancellationPolicy` (try wraps client construction; read error or throw gives `DEFAULT_POLICY`; each missing or out-of-bounds column falls back individually, so a deploy before migration 087 degrades safely) and `buildPolicySnapshot` returning `{ version, snapshot }` for `bookings.cancel_policy_version` / `bookings.cancel_policy`.
- `/api/admin/settings`: `cancel_free_km_threshold` (1..1000), `cancel_free_hours_short|long|hourly` (0..72), `cancel_fee_percent` (1..100) in zod, the any-field refine, GET select and response, and PATCH updates. 400 for schema, 422 `long_below_short` and 422 `airport_below_city` for cross-field rules, checked against the stored row when only one side is sent. Invalid JSON already answered 400 (the guard existed from Phase 88) and is now pinned by a test.
- `CancellationPolicySettings`: five labelled fields with UI-SPEC 7.1 helper and error texts, save on blur with only the changed key, "Saved" 2s / "Failed to save — try again" 4s, preview line (numbers as typed) in an `aria-live="polite"` box, version line. Mounted directly under `CardFlowSettings`.
- `NoShowWaitSettings` shows "Airport wait must be at least the city wait." on a 422 `airport_below_city`.

## Verification

- `npx vitest run tests/cancellation-policy.test.ts tests/admin-settings.test.ts tests/cancellation-policy-settings.test.tsx`: 125 passed.
- `tests/no-show-wait-settings.test.tsx` and `tests/admin-no-hardcoded-colors.test.ts` pass (66 tests across the three UI test files).
- `npx tsc --noEmit`: no errors in any file this plan touched. `npx eslint --quiet` on all touched source files exits 0.
- The node_modules symlink to the main checkout worked; no next-intl server module is imported by these tests, so none failed through it.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing admin-settings tests broke with the stored-row read**
- **Found during:** Task 2
- **Issue:** The existing Phase 87/88 tests mock `.eq()` as a resolved promise, so the new stored-row read (`.eq().single()`) used by the cross-checks hit an undefined `.single`, and the exact GET select string changed.
- **Fix:** Added an `armEq()` helper in `tests/admin-settings.test.ts` (an awaited `.eq()` that also exposes `.single`), gave the Phase 87 describe a stored row, and updated the GET select-string assertion. No production behaviour was relaxed.
- **Files modified:** tests/admin-settings.test.ts
- **Commit:** e130a5a2

**2. [Rule 1 - Bug] Own test had the free/late directions inverted**
- **Found during:** Task 1
- **Issue:** The "old booking keeps its terms" test asserted the wrong outcomes for a 24 h stored window.
- **Fix:** Corrected the test (stored 24 h is late at 18 h before pickup while today's 12 h would be free).
- **Commit:** 3591f207

**3. [Plan note] WR-06 invalid-JSON guard already present**
- `request.json()` was already wrapped (answers 400 "Invalid JSON"); only the airport-below-city cross-check was missing. Both are now covered by tests.

### Process note
The plan-head ledger file could not be written (the sandbox refuses compound git-dir commands), so `commits` is measured directly from the known base: `git rev-list --count a6e076f1..HEAD` was 3 before this SUMMARY commit.

## Known Stubs
None.

## Threat Flags
None. T-89-08 (zod bounds and 422 cross-checks; DB CHECKs come from 87 via plan 89-01), T-89-09 (`policyFromSnapshot` never reads today's settings; legacy rule for NULL, pinned by tests) and T-89-10 (reader never throws) are mitigated as planned.

## Notes for the orchestrator
- The settings GET now selects the five `cancel_*` columns, so it returns 500 until migration 087 (plan 89-01) is applied; apply 087 before merging this branch.
- The card and the route use `POLICY_BOUNDS` / literals matching UI-SPEC 7.1; the 087 CHECK bounds must match (1..1000, 0..72, 1..100).

## Self-Check: PASSED
Created files exist (policy, settings, card, three test files); commits 3591f207, e130a5a2, 9ca96098 exist.
