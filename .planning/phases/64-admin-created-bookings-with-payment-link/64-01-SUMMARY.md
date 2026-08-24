---
phase: 64-admin-created-bookings-with-payment-link
plan: 01
subsystem: payments
tags: [stripe, payment-links, webhooks, resend, admin-bookings, supabase]

requires:
  - phase: 62-abandoned-unpaid-booking-capture
    provides: "unpaid booking status + reconcile-in-place webhook pattern (stripe_processed_events idempotency, status-gated UPDATE)"
provides:
  - "createBookingPaymentLink — server-authoritative Stripe Payment Link creation"
  - "reconcileBookingByIdToConfirmed — id-keyed unpaid→confirmed reconciliation"
  - "sendPaymentRequestEmail / buildPaymentRequestHtml — branded Pay Now CTA email"
  - "POST /api/admin/bookings collect_payment branch + D-02 no-link status choice"
  - "checkout.session.completed webhook branch + handlePaymentLinkSucceeded"
  - "migration 056 (payment_link_url, payment_link_id columns) — schema file, not yet applied live"
affects: [64-02-round-trip-payment-links, 64-03-admin-ui, 64-04-live-schema-and-webhook-subscription]

actuals:
  tokens: 14800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Stripe Payment Link (not Checkout Session) for reusable, non-expiring, re-sendable admin-generated pay links"
    - "checkout.session.completed reconciliation keyed on session.metadata.bookingId (never PaymentIntent metadata — Payment Link metadata is NOT auto-copied to the resulting PaymentIntent)"

key-files:
  created:
    - lib/stripe-payment-links.ts
    - supabase/migrations/056_bookings_payment_link.sql
    - tests/payment-links.test.ts
    - tests/webhooks-stripe-checkout-session.test.ts
    - tests/email-payment-request.test.ts
  modified:
    - lib/supabase.ts
    - lib/email.ts
    - app/api/admin/bookings/route.ts
    - app/api/webhooks/stripe/route.ts
    - tests/admin-bookings.test.ts

key-decisions:
  - "D-01/D-02 status routing: collect_payment=true forces status='unpaid' (Phase 62 recovery queue); otherwise status = operator's explicit choice, defaulting to 'confirmed' (was 'pending' pre-Phase-64)"
  - "Payment Link amount is Math.round(booking.amount_eur * 100) — the already server-recomputed/tolerance-checked amount_eur, never a client-submitted figure (T-64-01)"
  - "restrictions.completed_sessions.limit: 1 — Payment Link auto-deactivates after first successful payment (defense in depth on top of webhook idempotency)"
  - "Booking insert and the Stripe-link/email step are non-atomic by design — a link/email failure never loses the already-persisted booking row"
  - "Round-trip linkedBookingId reconciliation is deliberately deferred to Plan 02 — this tracer reconciles only the primary bookingId"

patterns-established:
  - "handlePaymentLinkSucceeded sources BookingEmailData from the reconciled DB row (select('*')), not from thin Stripe metadata — mirrors handleOneWaySucceeded's shape but with a different data source"

requirements-completed: [ANEW-01, ANEW-02, ANEW-03, ANEW-04, ANEW-05]

coverage:
  - id: D1
    description: "Server-side Stripe Payment Link creation with booking UUID metadata and server-authoritative amount (ANEW-02, T-64-01)"
    requirement: ANEW-02
    verification:
      - kind: unit
        ref: "tests/payment-links.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "checkout.session.completed webhook branch reconciles the same unpaid booking row to confirmed with no duplicate, idempotent on retry/duplicate delivery, no-ops when payment_status != paid or bookingId missing"
    requirement: ANEW-04
    verification:
      - kind: unit
        ref: "tests/webhooks-stripe-checkout-session.test.ts (5 tests)"
        status: pass
      - kind: unit
        ref: "tests/webhooks-stripe.test.ts (36 tests, regression guard — payment_intent.succeeded path unaffected)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Branded payment-request email with a single Pay Now CTA, trip summary, EUR amount due, conditional flight-number row, no admin-only internals"
    requirement: ANEW-03
    verification:
      - kind: unit
        ref: "tests/email-payment-request.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/admin/bookings: collect_payment=true yields status 'unpaid' + generated/persisted link + payment-request email; no-link save honors operator status choice, default 'confirmed'"
    requirement: ANEW-01
    verification:
      - kind: unit
        ref: "tests/admin-bookings.test.ts POST /api/admin/bookings Tests 5-9 (22 tests in describe block total)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Migration 056 schema file (payment_link_url, payment_link_id nullable columns) — file only, live application against the remote Supabase project is the [BLOCKING] task in Plan 64-04"
    requirement: ANEW-02
    verification:
      - kind: other
        ref: "grep -c 'ADD COLUMN IF NOT EXISTS' supabase/migrations/056_bookings_payment_link.sql == 2"
        status: pass
    human_judgment: true
    rationale: "Live application to the remote Supabase project cannot be verified from this environment — deferred to Plan 64-04's [BLOCKING] human-action task."

duration: 30min
completed: 2026-08-24
status: complete
---

# Phase 64 Plan 01: Admin-Created Bookings with Payment Link — Tracer Summary

**Stripe Payment Link generation with server-authoritative amount, persisted URL, branded payment-request email, and a `checkout.session.completed` webhook branch that reconciles the same `unpaid` booking row to `confirmed` with no duplicate insert.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-24T16:05:00Z (approx.)
- **Completed:** 2026-08-24T16:35:00Z
- **Tasks:** 2 completed
- **Files modified:** 10 (5 created, 5 modified) — excludes `.planning/` metadata

## Accomplishments

- `createBookingPaymentLink` (`lib/stripe-payment-links.ts`) generates a Stripe Payment Link with inline `price_data` (EUR, `unit_amount = Math.round(amountEur*100)`), card-only payment methods, single-use `restrictions.completed_sessions.limit: 1`, and `bookingId`/`leg`/`linkedBookingId?` metadata on both the link and `payment_intent_data`.
- `reconcileBookingByIdToConfirmed` (`lib/supabase.ts`) flips a booking row `unpaid → confirmed` keyed on its own primary key (the only value known at link-creation time), returning the full row so the webhook can build email data without a second SELECT — same "empty array = already handled" contract as the Phase 62 reconcilers.
- `sendPaymentRequestEmail` / `buildPaymentRequestHtml` (`lib/email.ts`) render the branded shell + booking-reference box + TRIP DETAILS section + a single gold "PAY NOW" CTA linking to the payment link; the flight-number row is conditionally omitted when absent; no operator-only internals ever appear.
- `POST /api/admin/bookings` now accepts `collect_payment` and `status` fields: `collect_payment=true` routes the row to `status='unpaid'`, generates + persists the Payment Link, and sends the payment-request email (via `logEmail` dedup); a no-link save honors the operator's explicit status choice, defaulting to `confirmed` (D-02, replacing the old universal `'pending'` default). The booking insert and the Stripe/email step are non-atomic — a Stripe or email failure never loses the persisted booking.
- `app/api/webhooks/stripe/route.ts` gained a new `checkout.session.completed` branch + `handlePaymentLinkSucceeded`, reusing the exact `stripe_processed_events` idempotency table and side-effect-first/claim-after ordering as the existing `payment_intent.succeeded` branch — reading `session.metadata.bookingId` (never PaymentIntent metadata, which Stripe does not auto-copy from a Payment Link).
- Migration 056 (schema file) adds `payment_link_url`/`payment_link_id` nullable columns to `bookings`; live application is the `[BLOCKING]` task in Plan 64-04.

## Task Commits

1. **Task 1: Wave 0 — migration 056 file + failing test scaffolds** - `716dc4d` (test)
2. **Task 2: TRACER — one-way create-with-payment-link, reconciled end-to-end** - `30f56a5` (feat)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified

- `supabase/migrations/056_bookings_payment_link.sql` - adds `payment_link_url text`, `payment_link_id text` (nullable, schema file only)
- `lib/stripe-payment-links.ts` - `createBookingPaymentLink(params)`
- `lib/supabase.ts` - adds `reconcileBookingByIdToConfirmed(bookingId, paymentIntentId)`
- `lib/email.ts` - adds `PaymentRequestEmailData`, `buildPaymentRequestHtml`, `sendPaymentRequestEmail`
- `app/api/admin/bookings/route.ts` - POST: `collect_payment`/`status` schema fields, D-01/D-02 status routing, payment-link generation + persist + email, `paymentLinkUrl` response field
- `app/api/webhooks/stripe/route.ts` - new `checkout.session.completed` branch + `handlePaymentLinkSucceeded`
- `tests/payment-links.test.ts` - 8 tests for `createBookingPaymentLink`
- `tests/webhooks-stripe-checkout-session.test.ts` - 5 tests for the reconcile branch
- `tests/email-payment-request.test.ts` - 11 tests for the payment-request email
- `tests/admin-bookings.test.ts` - fixed Test 5's status assertion (D-02 default) + added Tests 7-9 for `collect_payment`/status-choice coverage

## Decisions Made

- D-01/D-02 (plan-locked): `collect_payment` drives a single status branch — `true` → `unpaid`; `false`/absent → operator's explicit `status` choice, default `confirmed`.
- T-64-01 (plan-locked): Payment Link `unit_amount` is derived exclusively from the server-recomputed `amount_eur` — never a raw request field.
- RESEARCH A3 (plan-locked): `restrictions.completed_sessions.limit: 1` — the link auto-deactivates after the first successful payment.
- Tracer scope (plan-locked): `handlePaymentLinkSucceeded` reconciles only the primary `bookingId` in this plan; round-trip `linkedBookingId` leg reconciliation is Plan 64-02's job.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing broken mock queue in `tests/admin-bookings.test.ts` POST tests**
- **Found during:** Task 2, running the plan's own `<verify>` command for the first time
- **Issue:** Tests 5 and 6 (pre-existing, written before Phase 64) mocked two `supabase.from()` calls to stand in for `getPricingConfig()`'s `pricing_config`/`pricing_globals` selects. But `getPricingConfig()` short-circuits to a zero-`.from()`-call `PRICING_FALLBACK` whenever `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are absent from the process environment — the same fallback path every other `describe` block in this file (e.g. the Phase 63 PATCH price-affecting tests) already correctly assumes. The desynced mock queue meant the actual `bookings` insert call consumed the wrong mocked object and threw `insert is not a function`. Verified as pre-existing (not introduced by this plan) by running the identical test against the Task-1-only commit before any Task 2 production code existed — same failure, same line.
- **Fix:** Removed the two unused `pricing_config`/`pricing_globals` mocks from Test 5, Test 6, and this plan's new Test 7/8/9, so `supabaseServiceStub.from` is set up to match the file's own working pattern (bookings insert as the first-and-only-or-first `.from()` call).
- **Files modified:** `tests/admin-bookings.test.ts`
- **Verification:** `npx vitest run tests/admin-bookings.test.ts` — 68/68 pass, including the two now-fixed pre-existing tests.
- **Committed in:** `30f56a5` (part of Task 2's commit)

Other pre-existing full-suite failures (12 unrelated test files — booking-widget UI, gnet status push, admin-zones, google-reviews, validate-promo) were confirmed identical before and after this plan's changes and are logged (not fixed, out of scope) in `.planning/phases/64-admin-created-bookings-with-payment-link/deferred-items.md`.

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug).
**Impact:** Necessary to satisfy this plan's own acceptance criteria ("existing tests/admin-bookings.test.ts still pass"). No scope creep — the fix only touched the exact describe block this plan's own new tests extend.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this plan. (Live Stripe Dashboard webhook subscription to `checkout.session.completed` and live migration 056 application are explicitly deferred to Plan 64-04's `[BLOCKING]` human-action tasks, per the plan.)

## Known Stubs

None — every deliverable in this plan is fully wired (no hardcoded empty values, no placeholder UI text). The plan's own scope excludes the admin UI (`ManualBookingForm.tsx`/`BookingsTable.tsx` row action) and the D-05 `[id]/payment-link` attach-later route, which are Plan 03/02's responsibility respectively — not stubs, just out of this plan's declared scope.

## Next Phase Readiness

Ready for Plan 02 (round-trip payment-link support + the D-05 `[id]/payment-link` attach-later route), which builds directly on `createBookingPaymentLink`, `reconcileBookingByIdToConfirmed`, and `handlePaymentLinkSucceeded`'s `linkedBookingId` parameter (currently accepted but unused — wired in Plan 02).

No blockers.

---
*Phase: 64-admin-created-bookings-with-payment-link*
*Completed: 2026-08-24*

## Self-Check: PASSED

- All created/modified files verified present on disk with `[ -f ]`.
- Both task commits (`716dc4d`, `30f56a5`) verified present via `git log --oneline --all`.
- All 5 targeted test files (payment-links, webhooks-stripe-checkout-session, email-payment-request, webhooks-stripe, admin-bookings) re-run green (123/123 tests).
- `npx tsc --noEmit` clean (no new errors; pre-existing unrelated errors in account-trips.test.tsx/gnet-farmin.test.ts/nav-auth.test.tsx/passenger-actions.test.ts confirmed present at HEAD before this plan).
