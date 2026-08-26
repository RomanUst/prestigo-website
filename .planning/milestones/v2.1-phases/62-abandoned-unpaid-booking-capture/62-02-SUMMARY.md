---
phase: 62-abandoned-unpaid-booking-capture
plan: 02
subsystem: payments
tags: [stripe, supabase, postgres, webhooks, zustand, unpaid-capture, round-trip, idempotency]

requires:
  - phase: 62-abandoned-unpaid-booking-capture
    provides: "62-01 — migration 053 (unpaid status + attempt_id column + partial unique index), buildBookingRow('unpaid'), one-way reconcileBookingToConfirmed, one-way capture + webhook reconcile"
provides:
  - "attempt_id dedup anchor (D-06) — client-generated UUID in the booking Zustand store, sessionStorage-persisted, threaded to create-payment-intent"
  - "captureUnpaidBooking — SELECT-then-INSERT-or-UPDATE attempt-keyed capture helper in lib/supabase.ts (insert on new attempt, UPDATE-in-place on retry, no-op once confirmed)"
  - "Round-trip unpaid capture — buildBookingRows(meta, paymentIntentId, bookingType) widened to emit 2 unpaid rows (outbound + return) sharing one PaymentIntent"
  - "reconcileRoundTripToConfirmed — atomic UPDATE flipping BOTH round-trip legs unpaid→confirmed in one statement (shared payment_intent_id)"
  - "webhooks/stripe handleRoundTripSucceeded rewritten to reconcile-first, defensive-RPC-insert-fallback, side-effects fire exactly once off the combined gate"
affects: [62-03, 62-04]

actuals:
  tokens: 8068
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Attempt-keyed capture (D-06): SELECT (attempt_id, leg) then INSERT-or-UPDATE-or-noop, gated by status='unpaid' — retries overwrite the full mutable row (payment_intent_id, booking_reference, amounts, promo), never touch a confirmed row"
    - "Round-trip pre-payment capture mirrors the one-way shape: 2 rows keyed per leg, sharing attempt_id and payment_intent_id"
    - "Round-trip reconciliation: single atomic UPDATE scoped by payment_intent_id + status='unpaid' flips both legs in one statement (no per-leg query needed since they share the PI)"

key-files:
  created: []
  modified:
    - lib/booking-store.ts
    - types/booking.ts
    - components/booking/steps/Step6Payment.tsx
    - lib/supabase.ts
    - app/api/create-payment-intent/route.ts
    - app/api/webhooks/stripe/route.ts
    - tests/create-payment-intent.test.ts
    - tests/webhooks-stripe.test.ts

key-decisions:
  - "SELECT-then-INSERT-or-UPDATE (not ON CONFLICT) for captureUnpaidBooking — matches 62-RESEARCH.md Open Question 3: checkout is single-tab/sequential, no realistic double-submit race, and Supabase-js's upsert() cannot express the partial unique index's WHERE predicate as an ON CONFLICT target anyway"
  - "buildBookingRows widened with an optional bookingType param ('confirmed' default) rather than a separate builder — every existing call site (webhook confirmed-insert) is byte-identical; only the new capture call site passes 'unpaid'"
  - "Round-trip reconcile is ONE atomic UPDATE scoped by payment_intent_id (not per-leg), since both legs always share a single PaymentIntent — cheaper and simpler than two separate reconcile calls"
  - "Test-only: mocking @supabase/supabase-js's createClient (the true module boundary) instead of only the lib/supabase createSupabaseServiceClient export — captureUnpaidBooking calls createSupabaseServiceClient() as an internal same-module reference, which vi.mock's partial-override + importActual pattern cannot intercept (known ESM self-reference limitation); caught one layer down where there is no self-reference"

patterns-established:
  - "captureUnpaidBooking(row, attemptId, leg) — the canonical attempt-keyed capture primitive Plan 62-03/62-04 and any future capture surface should reuse rather than re-implementing SELECT-then-write dedup"
  - "reconcileRoundTripToConfirmed(paymentIntentId) — the round-trip mirror of the one-way reconcileBookingToConfirmed, both following the 'empty array = already handled' idempotency contract"

requirements-completed: [ABND-01, ABND-06]

coverage:
  - id: D1
    description: "A stable client-generated attempt_id is sent to create-payment-intent and used as the dedup key; a retry/currency-toggle re-POST with the same attempt_id UPDATEs the existing unpaid row in place instead of inserting a second one"
    requirement: "ABND-06"
    verification:
      - kind: unit
        ref: "tests/create-payment-intent.test.ts#ABND-06: attempt_id dedup + round-trip capture (Phase 62-02) (a)/(b)/(c)/(d)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A round-trip attempt persists TWO unpaid rows (leg='outbound' and leg='return'), sharing the attempt and the single PaymentIntent; retry updates both legs in place"
    requirement: "ABND-01"
    verification:
      - kind: unit
        ref: "tests/create-payment-intent.test.ts#ABND-06: attempt_id dedup + round-trip capture (Phase 62-02) (e)/(f)"
        status: pass
    human_judgment: false
  - id: D3
    description: "payment_intent.succeeded on a round-trip reconciles BOTH unpaid legs to confirmed atomically and fires the round-trip side-effects (client email, manager alert, GA4, per-leg QStash reminders) exactly once for the pair; redelivery fires none; a lost-capture round-trip falls back to the defensive RPC insert and still fires side-effects once"
    requirement: "ABND-06"
    verification:
      - kind: unit
        ref: "tests/webhooks-stripe.test.ts#ABND-01/06/D-07/D-11: round-trip unpaid→confirmed reconciliation (Phase 62-02) (a)/(b)/(c)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live-DB verification that migration 053's attempt_id/unpaid-status schema behaves as coded"
    verification: []
    human_judgment: true
    rationale: "Migrations 053/054 are not yet applied to the live database (blocking step in Plan 62-04) — this plan only verifies against mocked Supabase; live-schema confirmation is deferred to 62-04's blocking-human task."

duration: 45min
completed: 2026-08-20
status: complete
---

# Phase 62 · Plan 02: Attempt-ID Dedup + Round-Trip Capture Summary

**Client-generated `attempt_id` now dedups every checkout retry to one unpaid row per (attempt, leg), and round-trip attempts capture and reconcile both legs atomically — the operator's unpaid follow-up queue stays clean for both one-way and round-trip checkouts.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-20
- **Tasks:** 2 (both `type="auto" tdd="true"`, no checkpoints)
- **Files modified:** 8 (0 created)
- **Commits:** 2 (`af37b13`, `c9c2d28`)

## Accomplishments

- **Client plumbing (D-06):** `lib/booking-store.ts` + `types/booking.ts` gained `attemptId: string | null` + `setAttemptId`, persisted via the existing sessionStorage `partialize` (survives the 3DS redirect / same-tab reload) and cleared in `resetBooking`. `Step6Payment.tsx` generates the id lazily via `crypto.randomUUID()` on first reach of the payment step and sends it on every `create-payment-intent` POST for that attempt (currency toggle, promo apply, retry all reuse the SAME id).
- **Attempt-keyed capture (`captureUnpaidBooking`, D-06):** new helper in `lib/supabase.ts` implementing SELECT `(attempt_id, leg)` → INSERT (no row) / UPDATE-in-place (existing `unpaid` row, overwriting the full mutable field set — `payment_intent_id`, `booking_reference`, amounts, promo, PII) / no-op (row already `confirmed` — IDOR-safe, a client-supplied `attempt_id` can never mutate a paid booking). `createPaymentIntentSchema` validates `attemptId` as `z.string().uuid()` (V5 input validation) before it ever reaches a query.
- **Round-trip capture (D-07):** `buildBookingRows` widened with an optional `bookingType: 'confirmed' | 'unpaid'` param (default `'confirmed'` — zero behavior change for the existing webhook call site); the `create-payment-intent` round-trip branch now writes TWO unpaid rows via `captureUnpaidBooking`, keyed per leg, sharing `attempt_id` and the single `PaymentIntent`.
- **Round-trip reconciliation (`reconcileRoundTripToConfirmed`, D-07/D-11):** new helper flips both legs `unpaid → confirmed` in ONE atomic UPDATE scoped by the shared `payment_intent_id`. `handleRoundTripSucceeded` in the Stripe webhook now reconciles first, falls back to the original `saveRoundTripBookings` RPC insert only when no unpaid legs matched (lost capture), and fires the round-trip side-effects (client confirmation, manager alert, GA4 purchase, per-leg QStash reminders) exactly once off the combined `reconciledIds/pair` gate — redelivery fires none.

## Task Commits

1. **Task 1: attempt_id dedup — client plumbing + attempt-keyed UPSERT-in-place capture** - `af37b13` (feat)
2. **Task 2: Round-trip capture (2 legs) + round-trip reconcile (both legs, side-effects once)** - `c9c2d28` (feat)

## Files Created/Modified

- `lib/booking-store.ts` - `attemptId` field/setter, partialize persistence, resetBooking clear
- `types/booking.ts` - `BookingStore.attemptId` + `setAttemptId` type additions
- `components/booking/steps/Step6Payment.tsx` - lazy attempt-id generation + pass-through in the create-payment-intent request body
- `lib/supabase.ts` - `captureUnpaidBooking`, `reconcileRoundTripToConfirmed`, `buildBookingRows` widened with `bookingType`
- `app/api/create-payment-intent/route.ts` - `attemptId` UUID validation; attempt-keyed capture routing (one-way single row, round-trip two rows); no-attemptId fallback preserved
- `app/api/webhooks/stripe/route.ts` - `handleRoundTripSucceeded` rewritten: reconcile-first, RPC-insert fallback, combined side-effect gate
- `tests/create-payment-intent.test.ts` - attempt_id dedup tests (insert/update/no-op/malformed-UUID) + round-trip two-row capture tests
- `tests/webhooks-stripe.test.ts` - round-trip reconcile tests (fresh/redelivery/lost-capture-fallback)

## Decisions Made

- SELECT-then-INSERT-or-UPDATE (not `ON CONFLICT`) for the attempt-keyed capture — matches 62-RESEARCH.md's recommendation given single-tab/sequential checkout traffic and Supabase-js's inability to target a partial unique index's WHERE predicate via `onConflict`.
- `buildBookingRows`'s `bookingType` param defaults to `'confirmed'` so the existing webhook confirmed-insert call site is untouched; only the new capture call site opts into `'unpaid'`.
- Round-trip reconciliation is a single UPDATE scoped by `payment_intent_id` (not two per-leg UPDATEs) since both legs always share one PaymentIntent — matches the one-way `reconcileBookingToConfirmed`'s "empty array = already handled" idempotency contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocked `@supabase/supabase-js`'s `createClient` in `tests/create-payment-intent.test.ts` (test-only)**
- **Found during:** Task 1 — writing the attempt-keyed capture tests
- **Issue:** `captureUnpaidBooking` (kept REAL via the test file's `...actual` import) calls `createSupabaseServiceClient()` as an internal same-module reference. Overriding only the `createSupabaseServiceClient` export in `vi.mock('@/lib/supabase', ...)` does not intercept that internal call (Vitest/ESM partial-mock cannot rewrite a module's own internal function references) — every capture-path test failed with `supabaseUrl is required` (the real, unconfigured Supabase client).
- **Fix:** Added `vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabaseServiceStub) }))` — one layer down, where there is no self-reference, so both the internal `captureUnpaidBooking` call and the route's direct `createSupabaseServiceClient()` promo-lookup call land on the same stub.
- **Files modified:** tests/create-payment-intent.test.ts
- **Verification:** All 4 previously-failing attempt-dedup tests pass; full file green (29 → 34 tests after Task 2 additions).
- **Committed in:** af37b13 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, test-only — no production code affected)
**Impact on plan:** Necessary to make the plan's own acceptance-criteria tests (real SELECT/INSERT/UPDATE chain assertions) actually exercise the real `captureUnpaidBooking`/`reconcileRoundTripToConfirmed` implementations rather than a fully-mocked stand-in. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required. (Migrations 053/054 still need live application — that remains Plan 62-04's blocking-human task, unaffected by this plan.)

## Next Phase Readiness

- `captureUnpaidBooking` and `reconcileRoundTripToConfirmed` are the canonical dedup/reconcile primitives — Plan 62-03 (admin queue presentation) and 62-04 (live migration apply + verification) can build on them without further schema surface changes.
- Both Vitest suites (`create-payment-intent.test.ts`, `webhooks-stripe.test.ts`) green; `tsc --noEmit` clean for all files this plan touched (remaining errors are the pre-existing debt in `tests/account-trips.test.tsx`, `tests/gnet-farmin.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts` — unrelated to Phase 62).
- Blocking gap carried forward unchanged: migrations 053 (this plan builds on) and 054 are not yet applied to the live Supabase project — production capture/reconcile writes will fail against the live schema until Plan 62-04's blocking-human migration-apply step runs.

---
*Phase: 62-abandoned-unpaid-booking-capture*
*Completed: 2026-08-20*

## Self-Check: PASSED

All 8 modified files confirmed present on disk; both task commits (`af37b13`, `c9c2d28`) confirmed in git log.
