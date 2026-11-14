---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
fixed_at: 2026-11-12T01:15:00Z
review_path: .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-REVIEW.md
iteration: 1
findings_in_scope: 16
fixed: 11
skipped: 5
no_change_needed: 0
full_suite: "424 files passed, 2 skipped (426); 13535 tests passed, 10 skipped, 138 todo (13683); run: npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'"
tsc: "8 errors, all old, all in tests/ (baseline unchanged)"
eslint: "clean (--quiet) on every changed file"
status: partial
---

# Phase 91: Code Review Fix Report

**Fixed at:** 2026-11-12
**Source review:** `.planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-REVIEW.md`
**Iteration:** 1
**Branch:** `feat/91-stops-waiting` (worked directly on the checkout, no worktree, no migration, no change to `messages/*.json`)

**Summary:**
- Findings in scope: 16 (CR-01, WR-01..WR-06, IN-01..IN-09)
- Fixed: 11 (CR-01, WR-01..WR-06, IN-01, IN-03, IN-05, IN-08)
- Skipped: 5 (IN-02, IN-04, IN-06, IN-07, IN-09: left for the owner / backlog, as instructed)
- No change needed: 0

**Final full suite:** 424 test files passed (2 skipped), 13 535 tests passed (10 skipped, 138 todo). Before the fixes: 13 478 tests.
**`npx tsc --noEmit`:** 8 errors, the same 8 old ones in `tests/` (`i18n-translate-dnt`, `nav-auth`, `passenger-actions`). **`npx eslint --quiet`:** clean on all changed files.

A new operator alert kind `ops_attention` ("Needs attention", subject `[Payment] Needs attention`) was added in `lib/payments/alerts.ts` and is the one existing alert path reused by CR-01, WR-01 and WR-06 (notes `extra_unresolved`, `extra_late_success`, `extra_second_payment`, `extra_receipt_failed`, `stops_missing`). Its mail carries ids, the reference, the client name, the pickup, an amount and a fixed code; never an address or an extra's description. The pinned contract list in `tests/payments-failure.test.ts` was updated in a follow-up commit (`f7eb2f10`, part of CR-01).

## Fixed Issues

### CR-01: A `card_extra` PaymentIntent that succeeds after its row was marked failed is only logged; the operator is told "nothing was charged" and can charge again

**Status:** fixed (money logic: requires human verification)
**Commits:** `922b3fc3`, follow-up `f7eb2f10` (contract test for the alert kinds list)
**Files changed:** `lib/payments/extra.ts`, `lib/payments/alerts.ts`, `lib/payments/stripe.ts`, `app/api/admin/bookings/[id]/extra/route.ts`, `components/admin/ExtraChargeModal.tsx`, `tests/helpers/fake-stripe.ts`, `tests/extra-charge.test.ts`, `tests/extra-webhook.test.ts`, `tests/extra-charge-modal.test.tsx`, `tests/admin-extra-route.test.ts`, `tests/payments-alerts.test.ts`, `tests/payments-failure.test.ts`
**What was done:**
- (a) Cause removed. An off-session confirm that answers `requires_action`, `processing` or anything unexpected now cancels its PaymentIntent (`closeUnfinished`, key `extra_void:<chargeId>:<attempt>`) before the row can become `failed`. A card error that leaves a live PaymentIntent (authentication required) is cancelled the same way; a plain decline (`requires_payment_method`) needs no cancel. If the cancel fails, Stripe is asked what the PaymentIntent is now: succeeded -> recorded as charged; dead -> declined; otherwise the outcome is `unresolved`: the row stays `charging` (the partial unique index blocks a new charge), an `ops_attention` alert (`alert:extra_unresolved:<chargeId>`) is sent, and the route answers 200 `{ outcome: 'unconfirmed' }`, never `declined`.
- (b) Webhook repair. `payment_intent.succeeded` for a `card_extra` on a `failed` row now repairs it `failed -> charged` with a compare-and-set (`markCharged(..., 'failed')`), writes `extra_charged:<chargeId>` once (key), sends the receipt only for the CAS winner, and alerts the operator (`alert:extra_late_success:<chargeId>:<pi>`, sent even on a redelivery that finds the row already repaired). A different PaymentIntent than the one on the row is only reported (`extra_second_payment`), the row is not rewritten.
- (c) Modal: `unconfirmed` shows "Stripe has not confirmed whether this charge went through. Do not charge again. The owner was alerted: check the payment in the Stripe Dashboard." The "Nothing was charged" line is now reachable only for a definite decline (the PaymentIntent is dead).
**Tests that prove it:** `tests/extra-charge.test.ts` "CR-01: a PaymentIntent that answers without succeeding..." (processing -> cancelled then declined; cancel fails and PI alive -> `unconfirmed`, row `charging`, alert, new charge blocked; cancel fails because PI succeeded -> charged; modal copy), the updated `requires_action` test (cancel called with the void key), `tests/extra-webhook.test.ts` "CR-01: a PaymentIntent that succeeds after its row was recorded as failed" (repair once, redelivery adds nothing, different PI only reported), `tests/extra-charge-modal.test.tsx` and `tests/admin-extra-route.test.ts` (`unconfirmed`), `tests/payments-alerts.test.ts` (ops_attention bodies).

### WR-01: A failed receipt email after a successful charge is never retried and nothing tells the operator

**Status:** fixed
**Commit:** `a6076349`
**Files changed:** `lib/payments/extra.ts`, `tests/extra-charge.test.ts`
**What was done:** `sendReceipt` raises `ops_attention` (`alert:extra_receipt:<chargeId>`, note `extra_receipt_failed`, ids and amount only) when `sendPaymentEmail` answers `failed` or throws; the row stays `charged` and nothing is re-charged (the alert path is the "operator can resend or tell the client" mechanism; I did not add a resend button). In the webhook path `finalizeExtraFromWebhook` now throws (Stripe redelivers, nothing written yet) when the booking row cannot be read, instead of substituting `{ id }` and mailing nobody.
**Tests that prove it:** `tests/extra-charge.test.ts` "WR-01: a receipt that is not sent after a successful charge is never silent" (failed, thrown, sent -> no alert, description not in the alert, one `create`; webhook throws `extra booking missing` and writes nothing).

### WR-02: Resume replays at Stripe with no reconciliation, and a row can stay `charging` forever

**Status:** fixed (money logic: requires human verification)
**Commit:** `7d0c0f0f`
**Files changed:** `lib/payments/extra.ts`, `components/admin/ExtraChargeModal.tsx` (one explanatory sentence), `tests/extra-charge.test.ts`
**What was done:** After the lease check and the take-over, `resumeExtraCharge` calls `reconcileWithStripe` before anything can be created. It lists the saved card customer's PaymentIntents since the row was requested (a list is read-after-write consistent, unlike `search`, and does not depend on Stripe's 24-hour key window) and matches `metadata.extraChargeId`: succeeded -> `finishCharged`; `canceled` / `requires_payment_method` -> `failed`; `processing`, unreadable Stripe or more than one page -> `payment_busy` (row stays `charging`); a live `requires_action` -> cancelled as in CR-01. Only when Stripe confirms no PaymentIntent exists for the row is the create replayed (same key, same amount). The way out of a stuck row: a key conflict (`idempotency`, e.g. the saved card was replaced) on that replay, after Stripe confirmed no PaymentIntent exists, ends the row `failed` with `idempotency_conflict`, which frees the booking for a new charge (new row, new key). No automatic retry anywhere. I did not add a separate "abandon" button: resume itself is the operator-confirmed exit, and it fails the row only after Stripe confirmed nothing succeeded.
**Tests that prove it:** `tests/extra-charge.test.ts` "WR-02: resume reads Stripe before it can create anything" (original call had succeeded -> charged with zero new creates; cancelled / unpaid -> failed with zero creates; processing -> busy; requires_action -> cancelled then failed; Stripe unreadable -> busy; other extras' PaymentIntents ignored and the replay uses the row's key; key conflict -> row failed and a new charge works; a key conflict on the first click is not turned into a decline).

### WR-03: A `card_extra` money event is written to the ledger twice, under kinds shared with the trip charge, and the cash adopt logic cannot tell them apart

**Status:** fixed
**Commit:** `8a41e52e`
**Files changed:** `lib/stripe-webhook/charge-events.ts`, `tests/extra-webhook.test.ts`
**What was done:** `handleCardChargeSucceeded` / `handleCardChargeFailed` hand a `card_extra` event to `finalizeExtraFromWebhook` and return before any `appendPaymentEvent`; `extra_charged` / `extra_failed` are the only ledger rows of an extra. No new ledger kind was needed.
**Tests that prove it:** `tests/extra-webhook.test.ts` "WR-03: one money event is one ledger meaning" (after a success and a failure event the ledger holds only `extra_charged` / `extra_failed`, no `charge_succeeded` / `charge_failed` / `difference_failed` kinds or `charge_succeeded:` / `extra_failed_obs:` keys; with a `capture_started` claim running, no adoptable `charge_succeeded` row exists, which is exactly what `settle.chargeSeenSinceClaim` reads). Existing observation-row expectations were updated in the same commit.

### WR-04: Manual pickup edit has no compare-and-set on the landing columns, so a concurrent "Move pickup" can desync landing, offset and pickup

**Status:** fixed
**Commit:** `f71d8d10`
**Files changed:** `app/api/admin/bookings/route.ts`, `components/admin/TripEditPanel.tsx`, `tests/admin-bookings.test.ts`
**What was done:** When the PATCH derives `pickup_offset_min` from the landing it read, the update is filtered on `landing_date`, `landing_time`, `pickup_date`, `pickup_time` as read (the `applyLandingChange` contract), selects `id`, and answers 409 `{ error: 'stale' }` when no row matches, before any audit row, email or payment re-evaluation. The edit panel shows a plain message for the 409. Edits that do not derive an offset keep the id-only update.
**Tests that prove it:** `tests/admin-bookings.test.ts` (landing describe): the compare-and-set filters are exactly id + landing + pickup, a no-match answers 409 with no audit insert and no email, a non-pickup edit stays id-only. The `wire` helper of that describe now models the filter chain.

### WR-05: The engine's "fresh" guard re-reads consent and in-flight but not the booking, and eligibility ignores an erased booking

**Status:** fixed
**Commit:** `5e394c47`
**Files changed:** `lib/payments/extra.ts`, `components/admin/ExtraChargeModal.tsx` (message for the new reason), `tests/extra-charge.test.ts`, `tests/admin-payment-api.test.ts`
**What was done:** `guard()` now reads the booking itself (`select('*')`), and `runExtraCharge` / `resumeExtraCharge` decide and charge on that row (currency, saved card, state, partner flag); the row the route loaded is only a hint (a vanished row answers 422). `isExtraChargeEligible` returns the new reason `erased` for a booking with `anonymised_at`, so the engine, the waiting preview route, the payment GET (`charge_extra` is not offered) and `previewWaitingExtra` all refuse an erased booking. The remaining window is the few awaits of one request after that read.
**Tests that prove it:** `tests/extra-charge.test.ts` "WR-05..." (booking cancelled / erased / state changed after the route loaded it -> 422 with no Stripe call and nothing written; a replaced payment method is the one charged; missing row; resume re-reads; preview refuses an erased booking; `erased` eligibility incl. `cash_guarantee` in `card_saved`), `tests/admin-payment-api.test.ts` (GET: no `charge_extra`, reason `erased`).

### WR-06: A pay-now booking created by the webhook fallback insert silently drops its paid stops

**Status:** fixed
**Commit:** `0cfdc62d`
**Files changed:** `lib/checkout/compute.ts`, `app/api/webhooks/stripe/route.ts`, `tests/webhooks-stripe.test.ts`, `tests/checkout-stops.test.ts`, `tests/checkout-stops-persist.test.ts`, `tests/booking-policy-snapshot.test.ts`
**What was done:** `buildCheckoutMeta` adds exactly one key, `stopCount` (a bare count, only when stops were priced, no addresses), to the pay-now PaymentIntent metadata. When `handleOneWaySucceeded` creates the booking through the fallback insert and `stopCount > 0` but `booking_stops` holds fewer rows (or cannot be read), it logs ids and raises `ops_attention` (`alert:stops_missing:<bookingId>`, note `stops_missing`). It never fails the webhook; I did not restore the stops from metadata (addresses are not in it, per the instruction to add nothing beyond the count).
**Tests that prove it:** `tests/webhooks-stripe.test.ts` "WR-06..." (alert with ids only; unreadable stops -> alert and 200; an alert that throws does not fail the webhook; stored stops -> no alert; no `stopCount` -> no read; reconciled capture row -> no check), `tests/checkout-stops.test.ts` (the only new key is `stopCount`, no address in it; none without stops; this replaced the old "no stop/wait key" assertion), `tests/checkout-stops-persist.test.ts` (the Stripe metadata carries `stopCount` for pay-now with stops and not without).

### IN-01: Audit rows for `pickup_offset_min`, `landing_date` and `landing_time` render as raw field names

**Status:** fixed
**Commit:** `5fe39ae8`
**Files changed:** `components/admin/BookingChangeHistory.tsx`, `tests/booking-change-history.test.tsx`
**What was done:** Labels `Landing date`, `Landing time`, `Minutes after landing` added to `FIELD_LABELS`.
**Test that proves it:** `tests/booking-change-history.test.tsx` "IN-01: the airport pickup fields read as words, not as column names".

### IN-03: Stop address schema rejects an empty address that storage and email code expect

**Status:** fixed
**Commit:** `e079903b` (the email-side test is in `bc2383ac`)
**Files changed:** `lib/checkout/compute.ts`, `tests/checkout-stops.test.ts`, `tests/checkout-stops-persist.test.ts` (and `tests/email-trip-route.test.ts` in the IN-08 commit)
**What was done:** Decided from the code: the intended rule is "a stop may have no typed address". `StopInput.address` is optional, `priceStops` uses `''`, `saveBookingStops` stores NULL for an empty address (the column CHECK is NULL or 1..500), emails and calendar print "Pinned on the map". Only the schema contradicted that, so the schema now takes a missing or empty (trimmed) address, still max 500 and no line breaks.
**Tests that prove it:** `tests/checkout-stops.test.ts` "IN-03..." (empty, blank and missing address accepted and priced, 501 chars and a line break still refused), `tests/checkout-stops-persist.test.ts` (pay-now with an empty address answers 200 and stores a NULL address), `tests/email-trip-route.test.ts` (null address renders "Pinned on the map" in client rows, driver rows and the manager alert).

### IN-05: Autumn ambiguous hour: a manual pickup edit can match the wrong offset

**Status:** fixed
**Commit:** `a035c139`
**Files changed:** `app/api/admin/bookings/route.ts`, `tests/admin-bookings.test.ts`
**What was done:** The PATCH matcher collects every allowed offset that yields the requested pickup, keeps the booking's stored offset when it is among them, else the smallest.
**Tests that prove it:** `tests/admin-bookings.test.ts` "IN-05: the autumn ambiguous hour (2027-10-31)" (landing 01:50, pickup 02:20: stored 90 is kept with no offset audit row; stored 30 kept; stored 60 is not a match so 30 wins and is audited).

### IN-08: Client emails state the waiting total in EUR even for a CZK booking

**Status:** fixed
**Commit:** `bc2383ac`
**Files changed:** `lib/email.ts`, `app/api/webhooks/stripe/route.ts`, `tests/email-trip-route.test.ts`, `tests/webhooks-stripe.test.ts`
**What was done:** `EmailTripRoute` carries the booking currency (pay-now confirmation: the PaymentIntent currency via `BookingEmailData.currency`; card-flow confirmed email: `payment_currency`). The client waiting line is `formatCZK(eurToCzk(total))` for CZK and `formatEUR(total)` for EUR (existing helpers). An unknown currency prints no waiting amount (the stop rows stay). Driver rows and the internal manager alert are unchanged. The payment-link confirmation path passes no currency, so it shows no waiting amount (admin payment-link bookings carry no stops today).
**Tests that prove it:** `tests/email-trip-route.test.ts` "IN-08..." (CZK in rows, status email and pay-now confirmation with no EUR; EUR kept; unknown -> no amount), `tests/webhooks-stripe.test.ts` (PaymentIntent currency reaches `BookingEmailData.currency`).

## Skipped Issues

### IN-02: Pay-now has no client copy for several new server codes (extends the known item)

**File:** `components/booking/steps/Step6Payment.tsx:32-44`, `components/booking/steps/Step6CardOnFile.tsx:72-84`
**Status:** skipped
**Reason:** left for the owner / backlog (needs real translations in all 7 locales; outside the requested scope).
**Original issue:** `KNOWN_STEP6_ERROR_CODES` lacks `STOPS_NOT_ALLOWED`, `LANDING_NOT_ALLOWED`, `LANDING_NOT_AIRPORT`, `PICKUP_MISMATCH`, `WAITING_NOT_AVAILABLE`, `ROUTING_UNAVAILABLE`, `STOPS_NOT_SAVED`; all fall back to the generic message; `card-checkout/init` turns a transient routing failure into `{ eligible: false }`.

### IN-04: Duplicated magic numbers (waiting caps, Stripe ceiling), one unused export

**File:** `lib/stops.ts:19`, `lib/payments/extra.ts:47-50`, `app/api/admin/bookings/[id]/extra/route.ts:51-52`, `components/admin/ExtraChargeModal.tsx:78-81`
**Status:** skipped
**Reason:** left for the owner / backlog.
**Original issue:** 480 minutes and 99_999_999 minor units are written in five places; `MAX_EXTRA_WAIT_MIN` is exported and never imported.

### IN-06: Google Routes cost control is per-IP only, with no response cache

**File:** `app/api/calculate-price/route.ts:133-147, 274-282`, `lib/route-distance.ts:52-130`
**Status:** skipped
**Reason:** left for the owner / backlog.
**Original issue:** Routes calls are limited per IP only, fail open when Upstash is down and are not cached.

### IN-07: Quote vs checkout distance can differ by a few metres between calls

**File:** `lib/checkout/compute.ts:341-354`, `app/api/card-checkout/intent/route.ts:135-141`
**Status:** skipped
**Reason:** left for the owner / backlog (the review itself says no fix is required).
**Original issue:** Each call asks Google again, so a rounding can flip and answer `409 PRICE_CHANGED`; the client handles it.

### IN-09: Admin list and dispatch board fail completely when the stops read fails

**File:** `app/api/admin/bookings/route.ts:310-318`, `app/api/admin/bookings/dispatch/route.ts:95-104`
**Status:** skipped
**Reason:** left for the owner / backlog (failing closed is defensible, per the review).
**Original issue:** A `booking_stops` read problem answers 500 for the whole list and dispatch board.

---

## Notes for the owner

- Nothing could not be done. No migration was needed and none was written; the live database stays at 089.
- Money-logic fixes (CR-01, WR-02) pass syntax and the new tests, but per the fixer rules they should get a human read before the phase is verified, and a live Stripe canary of the "unconfirmed" and resume paths is worth doing with the owner (the fake Stripe cannot reproduce Stripe's real `processing` timing).
- The new alert kind `ops_attention` is sent to `MANAGER_EMAIL` through the existing `sendPaymentOperatorAlert` / `deliverOnce` path (one mail per event key).
- Every finding got its own commit; CR-01 has one follow-up commit (`f7eb2f10`) for a contract test that pins the alert-kind list. `.planning/milestone.lock`, `.planning/state.json`, `.planning/STATE.md`, `.planning/ROADMAP.md` and the untracked root files were not touched.

---

_Fixed: 2026-11-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
