---
phase: 64-admin-created-bookings-with-payment-link
verified: 2026-08-25T20:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 64: Admin-Created Bookings with Payment Link Verification Report

**Phase Goal:** Operator can originate a booking on behalf of a client from the admin panel — with or without collecting payment at that moment — and get paid without the client ever visiting the public booking flow.
**Verified:** 2026-08-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can create a new booking from the admin panel entering trip/vehicle/client details, price auto-calculated from current rates | ✓ VERIFIED | `app/api/admin/bookings/route.ts:840-887` — server recomputes `computedTotalCzk`/`computedTotalEur` from `getPricingConfig()` rates; `priceDiverges` gate returns 422 unless `override_price`; `ManualBookingForm.tsx` posts trip/vehicle/client fields. Pre-existing feature (not new to Phase 64) confirmed still intact. |
| 2 | On saving, operator can choose to generate a Stripe payment link and email it to the client in the same action | ✓ VERIFIED | `route.ts:946-978` — `collect_payment===true` branch calls `createBookingPaymentLink`, persists `payment_link_url/id`, then `logEmail`+`sendPaymentRequestEmail` in the same POST. UI: `ManualBookingForm.tsx:944-1057` "Collect payment via link" toggle → `collect_payment:true` in POST body, submit CTA becomes "Create & Send Payment Link". `tests/admin-bookings.test.ts` + `tests/payment-links.test.ts` + `tests/email-payment-request.test.ts` all green. |
| 3 | When the client pays through the link, the booking's status updates to paid automatically, reconciled against the same record — no duplicate | ✓ VERIFIED | `app/api/webhooks/stripe/route.ts:165-320` `checkout.session.completed` branch reads `session.metadata.bookingId` (never PaymentIntent metadata) and calls `reconcileBookingByIdToConfirmed` — a status-gated `UPDATE ... WHERE id=X AND status='unpaid'` (`lib/supabase.ts:174-187`), so a retry/duplicate delivery matches zero rows (in-place reconcile, no INSERT anywhere in this path). `tests/webhooks-stripe-checkout-session.test.ts` (9 tests: fresh reconcile, duplicate-delivery short-circuit, already-confirmed no-op, round-trip both-legs, payment_status!=paid no-op) all pass. **Live confirmation (operational, outside repo):** migration 056 applied to live Supabase (`information_schema` probe: `payment_link_url`/`payment_link_id` text, nullable — 64-04-SUMMARY.md) and a live E2E round-trip on production confirmed unpaid→confirmed with no duplicate row and exactly one confirmation email (human-verified, 64-04-SUMMARY.md Task 2). |
| 4 | Operator can save an admin-created booking with no payment link at all (cash/invoice), created successfully without any Stripe interaction | ✓ VERIFIED | `route.ts:923,946` — `status: d.collect_payment ? 'unpaid' : (d.status ?? 'confirmed')`; the `createBookingPaymentLink`/Stripe block is gated strictly behind `if (d.collect_payment === true)` — a no-link save never touches `lib/stripe-payment-links.ts`. UI: toggle OFF shows "Booking status" radio (Confirmed default/Pending), submit CTA "Create Booking". `tests/admin-bookings.test.ts` Tests 5-9 assert status default/choice and zero Stripe calls on the no-link path. |

**Score:** 4/4 roadmap success criteria verified.

### Consolidated Plan Must-Haves (representative sample of the ~30 truths across 64-01..04-PLAN.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | Payment Link `unit_amount` is server-authoritative — `Math.round(amountEur*100)`, never a client-submitted figure (T-64-01) | ✓ VERIFIED | `lib/stripe-payment-links.ts:57` uses `params.amountEur` only; caller sites (`route.ts:951`, `[id]/payment-link/route.ts:171`) pass the server-recomputed `amount_eur` / DB-read `amount_eur`, never a raw request body field. |
| 6 | Non-atomic create — a Stripe/email failure after insert never loses the booking row | ✓ VERIFIED | `route.ts:940-990` wraps the link/email step in its own try/catch after the insert already returned; response degrades to `paymentLinkUrl:null` on failure but the row persists. |
| 7 | D-05 attach-later route: generate for existing unpaid/pending booking, pending→unpaid direct set (bypasses `VALID_TRANSITIONS`), rejects confirmed/cancelled and already-linked bookings, resend bypasses `logEmail` dedup (D-07) | ✓ VERIFIED | `app/api/admin/bookings/[id]/payment-link/route.ts` — status guard (line 157), existing-link guard (line 162), resend path calls `sendPaymentRequestEmail` directly without `logEmail` (line 129-151); no `VALID_TRANSITIONS` import (`grep` confirms only comment references per 64-02-SUMMARY.md self-check). `tests/admin-bookings-payment-link.test.ts` (14 tests) green. |
| 8 | Round-trip: a link generated for one leg carries `linkedBookingId`; `checkout.session.completed` reconciles BOTH legs once with a single combined confirmation | ✓ VERIFIED | `[id]/payment-link/route.ts:104-123` sibling lookup by shared `payment_intent_id`; `stripe/route.ts:263-320` `handlePaymentLinkSucceeded` reconciles primary + sibling via two independently status-gated calls, unions "newly reconciled", fires side-effects once. `tests/webhooks-stripe-checkout-session.test.ts` round-trip cases pass. |
| 9 | UI: create-flow toggle/status choice/result-panel (Copy full URL, Resend) and BookingsTable row-level Generate Payment Link action, gated to unpaid/pending with no existing link | ✓ VERIFIED | `ManualBookingForm.tsx` (toggle, status radio, result panel, handleClose reset) and `BookingsTable.tsx` (`PaymentLinkSection`, mounted in both desktop expanded row and mobile card, `status IN (unpaid,pending)` gate). `npx tsc --noEmit` clean for both files. UAT.md Tests 9-10 human-verified pass. |

**Score:** 9/9 must-haves sampled verified (0 failed, 0 present-but-behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/056_bookings_payment_link.sql` | 2 nullable columns, additive | ✓ VERIFIED | File present, exactly 2 `ADD COLUMN IF NOT EXISTS`; **live-applied** per 64-04-SUMMARY.md information_schema probe. |
| `lib/stripe-payment-links.ts` | `createBookingPaymentLink` | ✓ VERIFIED | Present, wired, server-authoritative amount, card-only, `restrictions.completed_sessions.limit:1`. |
| `lib/supabase.ts` (`reconcileBookingByIdToConfirmed`) | id-keyed status-gated reconcile | ✓ VERIFIED | Present at line 174, "empty array = already handled" contract matches Phase 62 pattern. |
| `lib/email.ts` (`sendPaymentRequestEmail`/`buildPaymentRequestHtml`) | branded Pay Now email | ✓ VERIFIED | Present, escapeHtml on all fields, conditional flight row, `coversBothLegs` notice, no admin internals. |
| `app/api/admin/bookings/route.ts` (POST `collect_payment`/`status`) | branch + response `paymentLinkUrl` | ✓ VERIFIED | Present and wired exactly as specified. |
| `app/api/admin/bookings/[id]/payment-link/route.ts` | generate + resend | ✓ VERIFIED | Present, auth-guarded, status/existing-link guards, round-trip sibling detection. |
| `app/api/webhooks/stripe/route.ts` (`checkout.session.completed` branch) | reconcile + side-effects | ✓ VERIFIED | Present, idempotency-guarded, session-metadata-keyed, round-trip aware. |
| `components/admin/ManualBookingForm.tsx` | toggle + status + result panel | ✓ VERIFIED | Present and wired to the POST route. |
| `components/admin/BookingsTable.tsx` | row action + result panel | ✓ VERIFIED | Present and wired to `[id]/payment-link`, both desktop and mobile. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ManualBookingForm` submit | `POST /api/admin/bookings` | `fetch` with `collect_payment`/`status` body | ✓ WIRED | `ManualBookingForm.tsx:320-357` |
| POST `collect_payment` branch | `createBookingPaymentLink` | direct call, server-recomputed `amount_eur` | ✓ WIRED | `route.ts:946-954` |
| Payment link persist | `sendPaymentRequestEmail` | `logEmail` dedup gate → email | ✓ WIRED | `route.ts:964-978` |
| `checkout.session.completed` | `session.metadata.bookingId` | `reconcileBookingByIdToConfirmed` | ✓ WIRED | `stripe/route.ts:180-190, 263-277` |
| `BookingsTable` row action | `POST [id]/payment-link` | `fetch` (generate/resend) | ✓ WIRED | `BookingsTable.tsx:815, 859` |
| `[id]/payment-link` sibling lookup | round-trip `linkedBookingId` | `createBookingPaymentLink(linkedBookingId)` | ✓ WIRED | `[id]/payment-link/route.ts:104-123, 168-174` |

### Behavioral Spot-Checks / Test Evidence

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-64 targeted suite (6 files) | `npx vitest run tests/payment-links.test.ts tests/webhooks-stripe-checkout-session.test.ts tests/email-payment-request.test.ts tests/admin-bookings-payment-link.test.ts tests/webhooks-stripe.test.ts tests/admin-bookings.test.ts` | 141/141 pass, 6/6 files | ✓ PASS |
| `tsc --noEmit` | `npx tsc --noEmit` | Only 12 pre-existing errors in unrelated test files (account-trips, gnet-farmin, nav-auth, passenger-actions) — none in Phase 64 files | ✓ PASS |
| Anti-pattern scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/"not yet implemented") | `grep` across all 9 Phase-64 files | 0 matches | ✓ PASS |
| Live migration + live webhook + live E2E reconciliation | Supabase MCP `apply_migration` + `information_schema` probe; operator-confirmed Stripe Dashboard subscription + production round-trip | success:true; both columns present; unpaid→confirmed no-duplicate confirmed | ✓ PASS (operational, per 64-04-SUMMARY.md, accepted as evidence per this session's established facts) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ANEW-01 | 64-01, 64-03 | Operator can create a booking manually from admin | ✓ SATISFIED | `route.ts` POST, `ManualBookingForm.tsx` |
| ANEW-02 | 64-01, 64-02, 64-03, 64-04 | Generate + attach Stripe payment link on save | ✓ SATISFIED | `createBookingPaymentLink`, POST branch, `[id]/payment-link` route, live migration applied |
| ANEW-03 | 64-01, 64-02, 64-03 | Email the client the payment link | ✓ SATISFIED | `sendPaymentRequestEmail`, `logEmail` dedup, resend path |
| ANEW-04 | 64-01, 64-02, 64-04 | Booking status updates to paid when client pays via link | ✓ SATISFIED | `checkout.session.completed` branch + live E2E confirmation (64-04) |
| ANEW-05 | 64-01, 64-03, 64-04 | Admin-created booking can be saved with no payment link | ✓ SATISFIED | `collect_payment:false` path, no Stripe call, tested |

**Note (documentation-sync, non-blocking):** `.planning/REQUIREMENTS.md` still shows `ANEW-04` as an unchecked `[ ]` checkbox and "Pending" in its traceability table (lines 34, 80), even though `64-04-SUMMARY.md` (committed `5b71c86`) documents the live webhook subscription and E2E reconciliation confirmed. This is a stale-checkbox issue in the requirements doc, not a code or functional gap — all code-level and operational evidence for ANEW-04 checks out. Recommend updating REQUIREMENTS.md's checkbox/traceability row to `[x]`/`Complete` as a follow-up doc fix.

### Anti-Patterns Found

None. No debt markers (TBD/FIXME/XXX), no TODO/HACK/PLACEHOLDER comments, no stub returns, no hardcoded empty data flowing to render in any of the 9 files touched by this phase.

### Full-Suite Regression Check

`npx vitest run` (from 64-01/02/03 SUMMARY self-checks, consistent across all three plans): 66 pre-existing failures across the same 12 unrelated test files (BookingWidget, BookingWizard, Step3Vehicle, Step5Passenger, VehicleSlideshow, account-trips, admin-assignment, admin-zones, gnet-farmin, gnet-status-push, google-reviews, validate-promo) — confirmed identical at the pre-Phase-64 baseline commit, not a regression introduced by this phase. Logged as tech debt in `deferred-items.md`, not a Phase 64 gap.

### Human Verification Required

None outstanding. `64-UAT.md` shows 10/11 tests passed with Test 11 ("live migration 056 applied") originally blocked — that block is now resolved: `64-04-SUMMARY.md` documents the live migration application (Supabase MCP `apply_migration` → `{"success":true}`, confirmed via `information_schema` probe) and the human-verified live Stripe webhook subscription + E2E no-duplicate reconciliation on production. UAT Tests 9-10 (ManualBookingForm/BookingsTable UI, flagged `human_judgment: true` in 64-03-SUMMARY.md coverage since no automated test exercises these components) were already human-verified as `pass` in `64-UAT.md`.

### Gaps Summary

No gaps found. All 4 roadmap success criteria, all 5 requirement IDs (ANEW-01..05), and the sampled must-have truths across all 4 plans are verified against the actual codebase — not just claimed in SUMMARY.md. The two operational facts that code alone cannot prove (live migration application, live webhook subscription + real payment reconciliation) are documented with concrete evidence (a live `information_schema` probe and an operator-confirmed production round-trip) in 64-04-SUMMARY.md, consistent with this session's established facts.

One non-blocking documentation-sync issue: `.planning/REQUIREMENTS.md`'s ANEW-04 checkbox/traceability status was not updated after Plan 64-04 completed. Recommend a follow-up doc-only fix; it does not affect the phase's functional completeness.

---

*Verified: 2026-08-25*
*Verifier: Claude (gsd-verifier)*
