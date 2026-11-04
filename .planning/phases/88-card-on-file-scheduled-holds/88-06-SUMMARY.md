---
phase: 88-card-on-file-scheduled-holds
plan: 06
subsystem: payments
tags: [card-on-file, canary-flag, eligibility, dst, hold-timing, csrf, rate-limit, admin-settings]

requires:
  - phase: 88-01
    provides: pricing_globals payment_hold_lead_hours / card_flow_mode / card_flow_canary_emails (migration 085), payment_state gate
  - phase: 88-02
    provides: lib/checkout/compute.ts (checkoutBookingSchema, validateCheckoutBooking, priceCheckout)
provides:
  - "lib/payments/config.ts: getPaymentSettings (fail closed), isCardFlowEligible, normalizeEmail, CARD_FLOW_TRIP_TYPES and all engine constants"
  - "lib/payments/timing.ts: computeHoldAt, decideHoldMode, holdDateIso, meetsBookingLeadTime, retryAt, needsReplace (client-safe, integer ms)"
  - "POST /api/card-checkout/init: opaque eligibility + mode + exact hold date + server amount"
  - "CSRF (protected + strict Origin) and rate limits (init 30, intent 10) for /api/card-checkout"
  - "Admin settings fields and the CardFlowSettings card (Off / Owner test only, lead hours, test emails)"
affects: [88-08 card-checkout intent, 88-10 checkout UI, 88-11 payment tick, 88-12+ pickup edit (needsReplace)]

actuals:
  tokens: 36500
  tasks: 3
  commits: 3
plan_head_before: e69289647e8dac55b43e87f9649163e7c1b9a5d4
plan_head_after: 8bcb4560473c5ecc60f1db47fe9e58df2cde2d36

tech-stack:
  added: []
  patterns:
    - "Timing constants live in the client-safe timing.ts and config.ts re-exports them, so the checkout UI and the server share one definition"
    - "Opaque ineligibility: every non-eligible path returns the identical { eligible: false } body (no reason leaks)"
    - "Settings reads fail closed to off / 72 / empty list"

key-files:
  created:
    - lib/payments/config.ts
    - lib/payments/timing.ts
    - app/api/card-checkout/init/route.ts
    - components/admin/CardFlowSettings.tsx
    - tests/card-checkout-init.test.ts
    - tests/payments-timing.test.ts
    - tests/CardFlowSettings.test.tsx
  modified:
    - middleware.ts
    - lib/rate-limit.ts
    - app/api/admin/settings/route.ts
    - "app/(internal)/admin/(dashboard)/settings/page.tsx"
    - tests/middleware-csrf-forms.test.ts
    - tests/rate-limit.test.ts
    - tests/admin-settings.test.ts

key-decisions:
  - "Engine timing constants (MIN_BOOKING_LEAD_MS, RETRY_*, REPLACE_MARGIN_MS, HOLD_DAY_CUTOFF_PRAGUE) are defined in timing.ts and re-exported from config.ts, because config.ts imports the Supabase service client and must not reach client bundles while the hold date is shown in the checkout UI"
  - "The step-5 email is trimmed before zod in /init (the strict email format check would otherwise reject ' Owner@Example.com ' with a 400 instead of matching the allowlist)"
  - "Admin settings PATCH body cap raised from 2 KB to 8 KB: 20 addresses of up to 254 chars no longer fit in 2 KB"
  - "isCardFlowEligible re-normalises the stored allowlist on compare (defence in depth if a row was written outside the admin route)"

patterns-established:
  - "Eligibility is decided only by the checkout routes via getPaymentSettings + isCardFlowEligible (D-09a); no tick/hold/settle/webhook module references them (gate test still green)"

requirements-completed: [PAYF-05, HOLD-02, HOLD-03]

coverage:
  - id: D1
    description: "init answers { eligible: true, mode, holdAtIso, holdDateIso, amountMinor, currency } only for canary + allowlisted exact email + transfer/hourly; every other case is exactly { eligible: false } (HTTP 200)"
    requirement: PAYF-05
    verification:
      - kind: unit
        ref: "tests/card-checkout-init.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hold timing is DST-safe integer-ms math: four 2027 fixtures, 23:30 Prague cutoff to next midnight, hold_now/setup boundary at raw <= now, retryAt clamp, needsReplace rules"
    requirement: HOLD-02
    verification:
      - kind: unit
        ref: "tests/payments-timing.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "/api/card-checkout is Origin-checked (strict, missing Origin refused) and rate limited 30/10 per minute; cron tick and Stripe webhook stay outside the strict list"
    requirement: HOLD-03
    verification:
      - kind: unit
        ref: "tests/middleware-csrf-forms.test.ts"
        status: pass
      - kind: unit
        ref: "tests/rate-limit.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Admin settings accept lead 6..96, mode off|canary ('on' rejected), <= 20 normalised de-duplicated emails; GET returns all three; invalid JSON is 400"
    requirement: PAYF-05
    verification:
      - kind: unit
        ref: "tests/admin-settings.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "CardFlowSettings card: two-tile radiogroup with roving tabindex and arrow keys, lead and email validation with UI-SPEC copy, empty-list info line, optimistic save with revert, tokens only"
    requirement: PAYF-05
    verification:
      - kind: unit
        ref: "tests/CardFlowSettings.test.tsx"
        status: pass
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fidelity of the settings card in the real admin shell (tile dot, 44px tiles, stacking below 480px, light and dark theme)"
    requirement: PAYF-05
    verification: []
    human_judgment: true
    rationale: "Layout and theme rendering were not checked in a browser in this run (executor has no preview server); unit tests assert tokens and structure only"

duration: 40 min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 06: Canary Flag, Eligibility and Hold Timing Summary

**Owner-controlled card-flow switch (off / owner-test allowlist), a side-effect-free `/api/card-checkout/init` that returns the exact DST-correct hold date and server amount only to allowlisted emails, the hold timing rules, and Origin/rate-limit protection for the new routes.**

## Performance

- **Tasks:** 3 of 3 (1 tracer, 2 auto/tdd), all committed with the `security(88-06)` prefix
- **Files:** 7 created, 7 modified

## Accomplishments

- Tracer: pricing_globals settings -> `getPaymentSettings` -> `isCardFlowEligible` -> `validateCheckoutBooking` -> 12 h pickup-instant check -> `priceCheckout` -> `computeHoldAt` + `decideHoldMode` -> response. Verified end to end (27 tests) before expanding.
- With the flag off nothing past the settings read runs (no pricing, no promo lookup). The route only reads `pricing_globals`; no insert/update/upsert, no Stripe, no ledger.
- Allowlist match is exact after trim + lower-case: `owner@example.com.evil`, `xowner@example.com` and an empty list are all ineligible; round_trip and daily never are (D-19).
- Hold timing verified on the four 2027 DST fixtures (spring forward hold 2027-03-25 10:00Z, nonexistent 02:30 -> 01:30Z, ambiguous 02:30 -> 01:30Z, fall back hold 2027-10-28 11:00Z); a raw hold at 23:30 or later moves to the next Prague midnight (at most 30 min), including across a month end in summer time.
- `/api/card-checkout` added to `CSRF_PROTECTED_PREFIXES` and `CSRF_STRICT_ORIGIN_REQUIRED` (middleware matcher untouched); `LIMITS` has init 30 and intent 10. Cron tick and Stripe webhook verified not blocked.
- Settings route: three new fields with DB-equal bounds, `'on'` rejected, emails normalised and de-duplicated in first-occurrence order, `request.json()` wrapped (invalid JSON -> 400, closes WR-06 for this route).
- `CardFlowSettings` follows UI-SPEC Surface 3 verbatim (heading, helper lines, error strings, info line) and is rendered directly under `NoShowWaitSettings`.

## Task Commits

1. **Task 1 (tracer): eligibility endpoint, config, timing** - `e4431226`
2. **Task 2: DST/boundary tests, CSRF + rate-limit registration** - `197c3f9d`
3. **Task 3: admin settings fields and CardFlowSettings** - `8bcb4560`

## Verification

- `npx vitest run` over card-checkout-init, payments-timing, middleware-csrf-forms, middleware-matcher, rate-limit, admin-settings, CardFlowSettings, no-show-wait-settings, admin-no-hardcoded-colors, payment-state-writers-gate: 10 files, 271 tests passed.
- `npx tsc --noEmit`: 8 errors, the documented baseline (none in touched files).
- `npx eslint --quiet` on the route, component, new tests, middleware and rate-limit: clean. The settings `page.tsx` was not linted by itself (the sandbox refused the parenthesised path); its change is two lines and type-checks.
- Acceptance greps: `isCardFlowEligible(` count 1 in init; insert/update/upsert count 0; `month >= 4` 0 in timing and init; `'/api/card-checkout'` 2 lines in middleware; `'/api/card-checkout/intent'` 1 in rate-limit; `z.enum(['off','canary'])` 1; no colour literal in the component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Untrimmed email rejected before the allowlist check**
- **Found during:** Task 1
- **Issue:** the plan expects `' Owner@Example.com '` to match the allowlist, but `checkoutBookingSchema` validates `email` with strict `.email()` (no trim), so such a body returned 400.
- **Fix:** `trimEmail()` trims `bookingData.email` before zod in `/init`; the later pricing/validation also see the trimmed value.
- **Files modified:** app/api/card-checkout/init/route.ts
- **Commit:** e4431226

**2. [Rule 2 - Missing critical] Settings PATCH body cap too small for 20 emails**
- **Found during:** Task 3
- **Issue:** `enforceMaxBody(request, 2_048)` would reject a legal list of 20 long addresses with 413.
- **Fix:** raised to 8_192.
- **Files modified:** app/api/admin/settings/route.ts
- **Commit:** 8bcb4560

**3. [Rule 3 - Blocking] node_modules missing in the worktree**
- **Fix:** symlinked the main checkout's `node_modules` (untracked/ignored, nothing installed).

**4. [Structure] Timing constants live in timing.ts, re-exported by config.ts**
- The plan lists the constants under config.ts. They are defined in the client-safe timing module and re-exported, so `import { MIN_BOOKING_LEAD_MS } from '@/lib/payments/config'` works as specified without dragging the Supabase client into the browser bundle. `tests/payments-timing.test.ts` asserts every documented value through `config`.

**Total deviations:** 4 (1 bug, 1 critical addition, 1 environment, 1 structural). **Impact:** none on contracts.

## Authentication Gates

None.

## Issues Encountered

- A bad body (schema failure, including a malformed email format) still answers 400 `INVALID_REQUEST`, as the plan allows ("400 only for a malformed body"). It reveals nothing about the flag or the allowlist.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-88-13 (probing: identical body, 30/min/IP, strict Origin), T-88-14 (server-side eligibility; `'on'` rejected by zod), T-88-15 (admin guard, size cap, zod bounds = DB CHECKs, invalid JSON -> 400), T-88-16 (Origin entries and middleware tests) are mitigated and tested. Plan 88-08 must repeat the eligibility check in `/intent` and trim the email the same way.

## Next Phase Readiness

88-08 (`/api/card-checkout/intent`) can import `getPaymentSettings`, `isCardFlowEligible`, `computeHoldAt`, `decideHoldMode`, `meetsBookingLeadTime`; the pickup-edit plan can use `needsReplace`; the tick plan (88-11) must NOT import `getPaymentSettings` (D-09a gate test enforces this for tick/hold/settle/recovery files). The settings card should get a quick visual check in the admin UI after merge.

## Self-Check: PASSED

- Files exist: lib/payments/config.ts, lib/payments/timing.ts, app/api/card-checkout/init/route.ts, components/admin/CardFlowSettings.tsx, tests/card-checkout-init.test.ts, tests/payments-timing.test.ts, tests/CardFlowSettings.test.tsx.
- Commits e4431226, 197c3f9d, 8bcb4560 exist on branch `worktree-agent-ac3562ce437db061a`.
