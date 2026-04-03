---
phase: 20-manual-booking-cancellation-with-refund
plan: 02
subsystem: api
tags: [stripe, refund, webhook, next-api-routes, react, modal, tdd]

# Dependency graph
requires:
  - phase: 19-booking-status-workflow-operator-notes
    provides: admin bookings PATCH endpoint and status FSM

provides:
  - POST /api/admin/bookings/cancel — FSM-guarded cancel with optional Stripe full refund
  - charge.refunded webhook handler — syncs local status when refund issued via Stripe Dashboard
  - CancellationModal in BookingsTable — variant A (refund warning) and variant B (manual cancel)

affects: [20-03-manual-booking-cancellation-with-refund, admin-bookings, stripe-webhooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cancel-before-DB: Stripe refund issued first, DB updated only on success to prevent orphaned state"
    - "Webhook deduplication via charge.refunded: sets status=cancelled by payment_intent_id match"
    - "CancellationModal inline component with pendingCancel state gate"
    - "TDD red-green cycle: failing tests committed before implementation"

key-files:
  created:
    - prestigo/app/api/admin/bookings/cancel/route.ts
  modified:
    - prestigo/app/api/webhooks/stripe/route.ts
    - prestigo/components/admin/BookingsTable.tsx
    - prestigo/tests/admin-bookings.test.ts
    - prestigo/tests/webhooks-stripe.test.ts

key-decisions:
  - "Cancel route reads payment_intent_id from DB (never trusts client) to decide Stripe refund"
  - "Module-level Stripe instance in cancel route — enables vi.mock interception in tests"
  - "charge.refunded handler added BEFORE payment_intent.succeeded block in webhook route"
  - "CancellationModal state (cancelling, cancelError) resets via useEffect when pendingCancel changes"

patterns-established:
  - "Pattern: Stripe refund before DB update — ensures no DB update if Stripe call fails (502 returned)"
  - "Pattern: Optimistic UI update after cancel — setBookings mutates local state, no re-fetch needed"

requirements-completed: [BOOKINGS-08]

# Metrics
duration: 10min
completed: 2026-04-03
---

# Phase 20 Plan 02: Booking Cancellation with Optional Stripe Refund Summary

**POST /api/admin/bookings/cancel with FSM guard and full Stripe refund, charge.refunded webhook sync, and CancellationModal with Stripe vs manual booking variants**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-03T15:43:10Z
- **Completed:** 2026-04-03T15:52:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Cancel endpoint enforces FSM guard (only pending/confirmed can be cancelled), issues full Stripe refund for online bookings, blocks DB update if Stripe fails (502)
- charge.refunded webhook handler added — Stripe Dashboard refunds now sync local booking status to cancelled via payment_intent_id lookup
- CancellationModal renders two variants: Variant A for Stripe-paid bookings shows "A FULL STRIPE REFUND WILL BE ISSUED." warning; Variant B for manual bookings shows simple cancel message

## Task Commits

Each task was committed atomically:

1. **Task 1: Cancel API endpoint + charge.refunded webhook handler (TDD RED)** - `7c863c8` (test)
2. **Task 1: Cancel API endpoint + charge.refunded webhook handler (TDD GREEN)** - `d8558d0` (feat)
3. **Task 2: CancellationModal + cancel button in BookingsTable** - `023e013` (feat)

_Note: TDD task has two commits (test RED → feat GREEN)_

## Files Created/Modified
- `prestigo/app/api/admin/bookings/cancel/route.ts` - New cancel endpoint with Stripe refund and FSM guard
- `prestigo/app/api/webhooks/stripe/route.ts` - Added charge.refunded handler and createSupabaseServiceClient import
- `prestigo/components/admin/BookingsTable.tsx` - Added CancellationModal, cancel button in expanded row, pendingCancel/cancelling/cancelError state, handleCancel callback
- `prestigo/tests/admin-bookings.test.ts` - Added stripeRefundsStub mock and 8 cancel endpoint tests
- `prestigo/tests/webhooks-stripe.test.ts` - Added supabaseServiceStub mock and charge.refunded webhook test

## Decisions Made
- Module-level `stripe` constant (not lazy factory) in cancel route — required for vi.mock to intercept at import time in tests
- Stripe refund issued BEFORE DB update — if refund succeeds but DB fails, logs orphaned refund_id for manual recovery
- charge.refunded handler placed before payment_intent.succeeded handler in webhook route for logical flow

## Deviations from Plan

None - plan executed exactly as written.

The cancel route was found pre-created with a `getStripe()` factory pattern (using `Stripe.createFetchHttpClient()`) from partial plan 01 execution. This was replaced with the plan-specified module-level `stripe` instance to match the test mock pattern.

## Issues Encountered
- The cancel route file pre-existed with a different implementation from an earlier (uncommitted) attempt. The existing `getStripe()` factory called `Stripe.createFetchHttpClient()` which doesn't exist on the vi.mock stub. Rewrote to module-level `stripe` constant per plan spec.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cancel endpoint and webhook handler ready for plan 03 (BookingsTable.tsx booking source badge)
- All 41 tests in admin-bookings.test.ts and webhooks-stripe.test.ts pass
- Pre-existing failures in submit-quote.test.ts and admin-pricing.test.ts are unrelated (out of scope)

---
*Phase: 20-manual-booking-cancellation-with-refund*
*Completed: 2026-04-03*
