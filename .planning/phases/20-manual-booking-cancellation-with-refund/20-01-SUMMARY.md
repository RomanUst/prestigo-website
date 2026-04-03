---
phase: 20-manual-booking-cancellation-with-refund
plan: 01
subsystem: api, ui
tags: [react, nextjs, supabase, zod, stripe, vitest]

requires:
  - phase: 19-booking-status-workflow-operator-notes
    provides: Admin bookings page with BookingsTable, PATCH endpoint, StatusBadge

provides:
  - POST /api/admin/bookings endpoint for manual booking creation
  - ManualBookingForm modal component wired into admin bookings page
  - Shared generateBookingReference utility in lib/booking-reference.ts
  - MANUAL badge in BookingsTable for booking_source='manual' rows
  - POST /api/admin/bookings/cancel endpoint (cancel + Stripe refund)

affects:
  - 20-02-plan (cancel endpoint already implemented as Rule 3 fix)
  - Any plan referencing generateBookingReference (now shared)

tech-stack:
  added: []
  patterns:
    - Zod schema validation on POST API endpoint before DB insert
    - Lazy Stripe client initialization (getStripe()) for testability
    - refreshKey pattern on BookingsTable to trigger re-fetch after creation
    - booking_source field distinguishes 'manual' vs 'online' bookings

key-files:
  created:
    - prestigo/lib/booking-reference.ts
    - prestigo/components/admin/ManualBookingForm.tsx
    - prestigo/app/api/admin/bookings/cancel/route.ts
  modified:
    - prestigo/app/api/admin/bookings/route.ts
    - prestigo/app/api/create-payment-intent/route.ts
    - prestigo/components/admin/BookingsTable.tsx
    - prestigo/app/admin/(dashboard)/bookings/page.tsx
    - prestigo/tests/admin-bookings.test.ts

key-decisions:
  - "generateBookingReference extracted to shared lib/booking-reference.ts — imported by both admin and payment-intent routes"
  - "cancel/route.ts uses getStripe() lazy factory instead of module-level Stripe instance — avoids createFetchHttpClient static method failure in Vitest mock environment"
  - "booking_source field added to BookingsTable Booking interface as 'online' | 'manual'"
  - "refreshKey prop on BookingsTable triggers re-fetch after manual booking creation without full page reload"
  - "ManualBookingForm uses plain useState (not react-hook-form) per RESEARCH.md decision for admin forms"

patterns-established:
  - "Lazy Stripe factory: getStripe() called at usage site so Vitest can mock the Stripe constructor without static method issues"
  - "Admin POST endpoints: auth check -> Zod validate -> generate refs -> insert -> return 201 with row"

requirements-completed: [BOOKINGS-06]

duration: 25min
completed: 2026-04-03
---

# Phase 20 Plan 01: Manual Booking Creation Summary

**POST /api/admin/bookings with Zod validation creates manual bookings (booking_source='manual', no Stripe), with ManualBookingForm modal wired into admin bookings page showing MANUAL badge in table**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-03T17:44:00Z
- **Completed:** 2026-04-03T17:50:00Z
- **Tasks:** 2 (plus 1 deviation auto-fix)
- **Files modified:** 8

## Accomplishments

- Extracted `generateBookingReference` to `lib/booking-reference.ts` as shared utility; removed duplicate from `create-payment-intent/route.ts`
- Added POST handler to `/api/admin/bookings` with Zod `manualBookingSchema`, creates bookings with `booking_source='manual'`, `payment_intent_id=null`, `status='pending'`, `booking_type='confirmed'`
- Created `ManualBookingForm` modal (640px, copper accent, TRIP DETAILS + PASSENGER DETAILS sections, loading/error states)
- Wired "New Booking" button into bookings page header; `refreshKey` prop re-fetches `BookingsTable` on creation
- Added `booking_source: 'online' | 'manual'` to `Booking` interface and MANUAL amber badge in REF column
- Created `POST /api/admin/bookings/cancel` with Stripe refund + FSM guard (deviation Rule 3)
- All 28 admin-bookings tests pass

## Task Commits

1. **Task 1: Extract generateBookingReference + POST endpoint (TDD)** - `a8a8d21` (feat)
2. **Task 2: ManualBookingForm modal + wiring** - `50a01b9` (feat)
3. **Chore: gitignore update** - `93b98b0` (chore)

## Files Created/Modified

- `prestigo/lib/booking-reference.ts` — Shared `generateBookingReference()` exported function
- `prestigo/app/api/admin/bookings/route.ts` — Added POST handler with `manualBookingSchema`, `czkToEur` for `amount_eur`, DB insert returning created row
- `prestigo/app/api/create-payment-intent/route.ts` — Removed duplicate `generateBookingReference`, added import from shared lib
- `prestigo/components/admin/ManualBookingForm.tsx` — Modal form component with copper design system styling
- `prestigo/app/admin/(dashboard)/bookings/page.tsx` — Added `showNewBooking` state, "New Booking" button, `refreshKey` on BookingsTable, ManualBookingForm render
- `prestigo/components/admin/BookingsTable.tsx` — Added `booking_source` field, updated REF column to `cell: ({ row })` pattern with MANUAL badge
- `prestigo/app/api/admin/bookings/cancel/route.ts` — Cancel endpoint with FSM guard and optional Stripe refund (Rule 3 deviation)
- `prestigo/tests/admin-bookings.test.ts` — 8 new POST tests + booking-reference and currency mocks

## Decisions Made

- `generateBookingReference` extracted to shared lib so both `create-payment-intent` and `admin/bookings` POST routes use the same implementation
- Lazy `getStripe()` factory in cancel route: calling `Stripe.createFetchHttpClient()` at module level breaks Vitest mock which doesn't expose static methods
- `booking_source` field needed on `Booking` interface to render MANUAL badge conditionally — changed REF column from `getValue` to `({ row })` pattern
- Cancel route created immediately (Rule 3) because the test file pre-imported `CANCEL_POST` from the non-existent route, blocking all test runs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created cancel endpoint to unblock test import**
- **Found during:** Task 2 setup (running vitest after Task 1 commit)
- **Issue:** The pre-existing commit `test(20-02)` added `import { POST as CANCEL_POST } from '@/app/api/admin/bookings/cancel/route'` to the shared test file. This route didn't exist, causing all admin-bookings tests to fail at import time.
- **Fix:** Created `prestigo/app/api/admin/bookings/cancel/route.ts` with full FSM guard, Stripe refund, and lazy `getStripe()` factory. Also discovered `getStripe()` needed a guard for `createFetchHttpClient` (static method absent in Vitest Stripe mock).
- **Files modified:** prestigo/app/api/admin/bookings/cancel/route.ts (new)
- **Verification:** All 28 tests pass including 8 new cancel tests
- **Committed in:** `50a01b9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Cancel route implementation was necessary to prevent test file import failure. The cancel route spec was fully defined in pre-existing tests, so no guessing was needed. This effectively completes plan 20-02's API endpoint portion early.

## Issues Encountered

- Vitest Stripe mock `vi.mock('stripe', () => ({ default: function MockStripe() {...} }))` doesn't expose static methods like `Stripe.createFetchHttpClient()`. Solved by wrapping Stripe instantiation in a `getStripe()` factory that guards the static method call.

## Next Phase Readiness

- POST /api/admin/bookings endpoint ready for use
- Cancel endpoint implemented — plan 20-02 can focus on UI wiring and webhook handler
- ManualBookingForm deployed and functional in admin UI
- Pre-existing test failures in `submit-quote.test.ts`, `BookingWidget.test.tsx`, `admin-pricing.test.ts`, `webhooks-stripe.test.ts` are out of scope for 20-01 (belong to other plans)

---
*Phase: 20-manual-booking-cancellation-with-refund*
*Completed: 2026-04-03*

## Self-Check: PASSED

- FOUND: prestigo/lib/booking-reference.ts
- FOUND: prestigo/components/admin/ManualBookingForm.tsx
- FOUND: prestigo/app/api/admin/bookings/cancel/route.ts
- FOUND: .planning/phases/20-manual-booking-cancellation-with-refund/20-01-SUMMARY.md
- FOUND commit a8a8d21 (Task 1)
- FOUND commit 50a01b9 (Task 2)
- FOUND commit 93b98b0 (chore)
- 28/28 admin-bookings tests pass
