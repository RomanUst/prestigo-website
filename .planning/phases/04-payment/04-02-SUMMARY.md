---
phase: 04-payment
plan: 02
subsystem: payments
tags: [stripe, react, booking-wizard, payment-element, step6]

# Dependency graph
requires:
  - phase: 04-00
    provides: BookingStore payment fields, currency utilities, Stripe packages installed
  - phase: 04-01
    provides: /api/create-payment-intent and /api/submit-quote API routes
provides:
  - BookingSummaryBlock: read-only booking summary card (route, date, vehicle, extras, CZK+EUR total)
  - Step6Payment: Stripe Payment Element with branded appearance + Pay button with amount + inline errors
  - BookingWizard wired to Step 6 with Payment heading, quote mode skip from step 5
  - PriceSummary hidden at step 6
affects: [04-03-confirmation, 05-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Step6Payment outer/inner component split — outer fetches clientSecret, inner uses useStripe/useElements hooks inside Elements provider
    - loadStripe and Stripe appearance config defined at module scope to prevent recreation on render
    - handleNext pattern in BookingWizard for async quote mode skip without blocking normal step flow

key-files:
  created:
    - prestigo/components/booking/BookingSummaryBlock.tsx
    - prestigo/components/booking/steps/Step6Payment.tsx
  modified:
    - prestigo/components/booking/BookingWizard.tsx
    - prestigo/components/booking/PriceSummary.tsx

key-decisions:
  - "Step6Payment uses local state for clientSecret (not Zustand) to avoid re-render cascade when secret arrives"
  - "handleNext in BookingWizard is async to support quote mode fetch before navigation; normal flow calls nextStep() synchronously"
  - "BookingWizard Back/Next bar guard changed to currentStep > 1 && currentStep < 6 — Step6Payment owns its own Pay button"

patterns-established:
  - "Outer/inner Stripe component split: outer fetches PaymentIntent, inner renders form inside <Elements> provider"
  - "Module-scope Stripe config: loadStripe() and appearance object defined outside components for stability"
  - "Async handleNext: BookingWizard Next handler can intercept at any step for async side effects before proceeding"

requirements-completed: [STEP6-01, STEP6-02, STEP6-03, STEP6-04, STEP6-05, STEP6-06]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 04 Plan 02: Step 6 Payment UI Summary

**Stripe Payment Element embedded in booking wizard with branded dark theme, read-only BookingSummaryBlock showing full CZK+EUR total, quote mode skip routing, and PriceSummary hidden at step 6**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-30T15:12:17Z
- **Completed:** 2026-03-30T15:15:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- BookingSummaryBlock renders route, date, vehicle class, passenger count, extras list, and total in CZK and EUR from Zustand store
- Step6Payment fetches clientSecret on mount, mounts branded Payment Element in Elements provider, Pay button shows amount (e.g. "PAY CZK 2,450") and disables immediately on click with aria-disabled
- BookingWizard now routes step 6 to Step6Payment, shows "Payment" heading, hides generic Back/Next bar at step 6, and supports async handleNext for quote mode skip
- PriceSummary returns null at currentStep === 6 — no sidebar or mobile bar during payment step

## Task Commits

1. **Task 1: Create BookingSummaryBlock and Step6Payment components** - `754baa4` (feat)
2. **Task 2: Wire Step 6 into BookingWizard, add quote mode skip, hide PriceSummary at step 6** - `1f43039` (feat)

## Files Created/Modified
- `prestigo/components/booking/BookingSummaryBlock.tsx` - Read-only summary card with route, date, vehicle, extras, CZK total and EUR equivalent
- `prestigo/components/booking/steps/Step6Payment.tsx` - Outer (fetches PaymentIntent) + inner PaymentForm (Stripe hooks, form, Pay button, inline errors)
- `prestigo/components/booking/BookingWizard.tsx` - Added Step6Payment routing, handleNext with quote skip, heading for step 6, bar hidden at step 6
- `prestigo/components/booking/PriceSummary.tsx` - Added early return null guard at currentStep === 6

## Decisions Made
- `clientSecret` stored in local state (not Zustand) to avoid Stripe Elements re-mounting on unrelated store updates
- `handleNext` is async in BookingWizard — intercepts step 5 next in quoteMode to call /api/submit-quote, then router.push; falls through to nextStep() for all other steps
- `loadStripe()` and `appearance` object placed at module scope in Step6Payment to match Stripe's recommended pattern

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing infrastructure issue (out of scope): `npx vitest run` fails with `SyntaxError: styleText not exported from node:util` because vitest 4.x requires Node 18+ but the environment runs Node 16.14.0. This was present before this plan. TypeScript compilation passes clean (`npx tsc --noEmit` exits 0).

## User Setup Required

None - no external service configuration required for this plan specifically. Stripe env vars (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) were required from Plan 04-00.

## Next Phase Readiness
- Step 6 UI complete — user can reach the payment step, see their full booking summary, and enter card details
- After `stripe.confirmPayment()` succeeds, browser redirects to `/book/confirmation?ref=...` — this page is built in Plan 04-03
- Quote mode redirect to `/book/confirmation?type=quote&ref=...` is wired — confirmation page handles both variants

---
*Phase: 04-payment*
*Completed: 2026-03-30*
