---
phase: 04-payment
plan: 01
subsystem: api
tags: [stripe, nextjs, api-routes, payments, webhooks]

# Dependency graph
requires:
  - phase: 04-00
    provides: Stripe SDK installed, currency.ts helpers, booking-store payment fields
provides:
  - POST /api/create-payment-intent — creates Stripe PaymentIntent in CZK hellers, returns clientSecret + PRG-YYYYMMDD-NNNN booking reference
  - POST /api/submit-quote — Phase 4 stub returning QR-YYYYMMDD-NNNN quote reference
  - POST /api/webhooks/stripe — verifies stripe-signature, handles payment_intent.succeeded with Phase 5 hook point
affects: [04-02-step6-payment, 04-03-confirmation, 05-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Stripe PaymentIntent creation with CZK hellers (amount * 100) and automatic_payment_methods enabled
    - Webhook raw body via request.text() (not request.json()) for signature verification
    - TypeScript unknown catch type with instanceof Error guard

key-files:
  created:
    - prestigo/app/api/create-payment-intent/route.ts
    - prestigo/app/api/submit-quote/route.ts
    - prestigo/app/api/webhooks/stripe/route.ts
  modified: []

key-decisions:
  - "Webhook route uses request.text() raw body — request.json() would break constructEvent signature verification"
  - "submit-quote is a Phase 4 stub (log only) — Phase 5 adds Notion save and manager alert email"
  - "PaymentIntent metadata includes bookingReference and all bookingData fields for webhook correlation"

patterns-established:
  - "PRG-YYYYMMDD-NNNN: booking reference format for paid trips"
  - "QR-YYYYMMDD-NNNN: quote reference format for quote-mode trips"
  - "Phase 5 hook point comment pattern to mark stub expansion points"

requirements-completed: [PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 04 Plan 01: API Routes Summary

**Three Stripe server-side API routes: PaymentIntent creation (CZK hellers, PRG- reference), quote stub (QR- reference), and webhook handler (signature-verified, payment_intent.succeeded)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T15:08:15Z
- **Completed:** 2026-03-30T15:10:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- PaymentIntent API route creates Stripe charge in CZK (hellers), returns only clientSecret and PRG-YYYYMMDD-NNNN booking reference
- Quote submission stub returns QR-YYYYMMDD-NNNN reference with Phase 5 hook comment for Notion + email integration
- Webhook route verifies stripe-signature via constructEvent using raw request.text() body; handles payment_intent.succeeded with Phase 5 hook point

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /api/create-payment-intent and /api/submit-quote routes** - `5a1b625` (feat)
2. **Task 2: Create /api/webhooks/stripe route** - `4d53aa0` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `prestigo/app/api/create-payment-intent/route.ts` - POST endpoint: validates amount, creates Stripe PaymentIntent in CZK hellers, returns clientSecret + PRG booking reference
- `prestigo/app/api/submit-quote/route.ts` - POST endpoint: Phase 4 stub returning QR-prefixed quote reference
- `prestigo/app/api/webhooks/stripe/route.ts` - POST endpoint: verifies stripe-signature, logs payment_intent.succeeded metadata, Phase 5 hook point

## Decisions Made
- `request.text()` used in webhook route (not `request.json()`) — Stripe's `constructEvent` requires the raw unparsed body string for HMAC verification
- submit-quote intentionally stub-only in Phase 4 — Phase 5 (notifications) will add Notion persistence and manager email
- bookingData spread into PaymentIntent metadata alongside bookingReference to enable webhook-side correlation

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
**External services require manual configuration.** The following env vars must be set before testing payment flows:

- `STRIPE_SECRET_KEY` — Stripe Dashboard -> Developers -> API keys -> Secret key (sk_test_...)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Stripe Dashboard -> Developers -> API keys -> Publishable key (pk_test_...)
- `STRIPE_WEBHOOK_SECRET` — Stripe Dashboard -> Developers -> Webhooks -> Add endpoint -> Signing secret (whsec_...)

Dashboard config: Create webhook endpoint pointing to `your-domain/api/webhooks/stripe` for `payment_intent.succeeded` events.

## Next Phase Readiness
- All three server-side routes complete; Step6Payment (Plan 02) can call `/api/create-payment-intent` on mount
- Webhook stub ready; Phase 5 adds Notion + email inside the `payment_intent.succeeded` handler
- PAY-02 verified: STRIPE_SECRET_KEY never appears in client component code

---
*Phase: 04-payment*
*Completed: 2026-03-30*
