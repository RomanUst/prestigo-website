---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 03
subsystem: admin-pricing
tags: [pricing, waiting-fee, admin, api, stops]
requires:
  - phase: 91-02
    provides: "waitingRate mapping in getPricingConfig(), waiting_rate_per_15min column (migration 089), lib/stops.ts constants"
provides:
  - "waiting_rate_per_15min (positive number or null) in the PUT /api/admin/pricing schema"
  - "GET /api/waiting-config -> { freeMin, blockMin, maxMin, offeredClasses } (no amounts)"
  - "per-class waiting-rate input in Admin > Pricing"
affects: [91-04, 91-08, 91-09]
tech-stack:
  added: []
  patterns:
    - "public read route that states which classes offer a feature but never an amount"
    - "react-hook-form setValueAs mapping an empty field to null instead of NaN"
key-files:
  created:
    - app/api/waiting-config/route.ts
    - tests/waiting-config.test.ts
    - tests/pricing-form-waiting.test.tsx
  modified:
    - app/api/admin/pricing/route.ts
    - components/admin/PricingForm.tsx
    - tests/admin-pricing.test.ts
key-decisions:
  - "An error reading pricing answers 200 with offeredClasses [] and Cache-Control no-store, so a failed read is never cached at the CDN for minutes"
  - "The waiting input has no min attribute: the browser would block the submit with its own tooltip and hide the form's validation message for 0 or a negative value"
  - "Form defaults normalise waiting_rate_per_15min with Number() or null, since the DB may return NUMERIC as text"
patterns-established:
  - "Every config row in the pricing PUT carries waiting_rate_per_15min (number or null) so a bulk upsert never clears a rate by omission"
requirements-completed: [STOP-03]
status: complete
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: 8d16038928b07bfc3ed103fe050970e8097fda46
plan_head_after: d97721cf09dc7a937a385e6e28280e225ecca3a7
duration: 12min
completed: 2026-11-11
---

# Phase 91 Plan 03: Admin waiting rate and public waiting-config Summary

**The owner sets a waiting rate per extra 15 minutes for each class in Admin > Pricing (empty = not offered), and GET /api/waiting-config tells the wizard which classes offer paid waiting without exposing any amount.**

## Performance

- **Duration:** about 12 min
- **Tasks:** 2 (1 tracer, 1 auto), both TDD
- **Files:** 3 created, 3 modified

## Accomplishments

- Tracer: PUT with `waiting_rate_per_15min` 12.5 / null / null reaches the upsert unchanged, and `/api/waiting-config` then lists only `business`.
- PUT validation: `0`, `-5` and `'12'` give 400 and no upsert; an unauthenticated PUT gives 401 before parsing (guard order unchanged).
- `/api/waiting-config`: `force-dynamic`, cache header `public, s-maxage=60, stale-while-revalidate=300`, `offeredClasses` in `VEHICLE_CLASSES` order, the only numbers in the body are 15, 15 and 120; any read error gives 200 with `offeredClasses: []`.
- Pricing form: one labelled input per class ("Waiting per extra 15 min (EUR)") with the help text "Leave empty to not offer paid waiting for this class", no placeholder and no default amount; empty maps to null; 0 or negative shows "Enter an amount above 0, or leave empty to not offer waiting" and sends no PUT; every PUT config row carries the key.

## Task Commits

1. **Task 1 (tracer): admin PUT schema + public waiting-config route** - `283b35b8` (feat)
2. **Task 2: Pricing form waiting-rate input** - `d97721cf` (feat)

## Verification

- `npx vitest run tests/pricing-form-waiting.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-pricing.test.ts tests/waiting-config.test.ts` : 4 files, 67 tests passed. `tests/AdminSidebar.test.tsx` and `tests/seo-snippets-no-prices.test.ts` also pass.
- `npx tsc --noEmit`: no errors in any file touched by this plan (the 8 baseline errors in `tests/` are unrelated).
- `npx eslint --quiet` on all touched source and test files: clean.
- TDD RED was observed before each implementation (admin PUT tests failed with 200 instead of 400 because zod stripped the key; all form tests failed before the markup existed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Native `min` attribute hid the form's own validation message**
- **Found during:** Task 2
- **Issue:** with `min="0"` on the new input, jsdom (and real browsers) block submit natively for -1, so react-hook-form never ran and no message showed.
- **Fix:** no `min` attribute on the waiting input; the zod schema is the single validator.
- **Files modified:** components/admin/PricingForm.tsx
- **Commit:** d97721cf

**2. [Rule 2 - Missing critical] Error responses of /api/waiting-config are not CDN-cached**
- **Issue:** the plan asks for the same shape on error; caching that for 60 s plus 300 s stale would hide paid waiting after a transient DB failure.
- **Fix:** error path sends `Cache-Control: no-store`; success path keeps the plan's header. Covered by a test.
- **Commit:** 283b35b8

Otherwise the plan was executed as written.

## Issues Encountered

None. No next-intl or Supabase mocking problems; the worktree used a `node_modules` symlink (not committed).

## Known Stubs

None.

## Threat Flags

None. The new public route returns no amounts and no user data (T-91-11 mitigated); admin guard order is unchanged (T-91-09); value is validated positive-or-null and sent on every row (T-91-10).

## Next Phase Readiness

91-09 (wizard) can call `GET /api/waiting-config` to decide which wait options to show per class. 91-04 and 91-08 read the same rates through `getPricingConfig().waitingRate`. Migration 089 (column + CHECK > 0) is already live from 91-01.

## Self-Check: PASSED

- FOUND: app/api/waiting-config/route.ts, tests/waiting-config.test.ts, tests/pricing-form-waiting.test.tsx
- FOUND commits: 283b35b8, d97721cf
