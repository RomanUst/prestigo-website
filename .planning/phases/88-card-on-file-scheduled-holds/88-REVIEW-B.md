---
phase: 88-card-on-file-scheduled-holds
slice: B (checkout + Stripe webhook)
reviewed: 2026-11-04T00:00:00Z
depth: deep
diff_base: a6d00730
files_reviewed: 24
files_reviewed_list:
  - lib/checkout/compute.ts
  - lib/payments/checkout.ts
  - lib/payments/config.ts
  - lib/payments/consent.ts
  - lib/payments/consent-text.ts
  - app/api/card-checkout/init/route.ts
  - app/api/card-checkout/intent/route.ts
  - app/api/create-payment-intent/route.ts
  - app/api/webhooks/stripe/route.ts
  - lib/stripe-webhook/dispatch.ts
  - lib/stripe-webhook/card-confirm.ts
  - lib/stripe-webhook/hold-events.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/recovery-events.ts
  - lib/stripe-payment-links.ts
  - middleware.ts
  - lib/rate-limit.ts
  - components/booking/BookingWizard.tsx
  - components/booking/CardPaymentExplainer.tsx
  - components/booking/steps/Step6Checkout.tsx
  - components/booking/steps/Step6CardOnFile.tsx
  - components/booking/steps/PromoCodeField.tsx
  - components/booking/steps/cardCheckoutApi.ts
  - lib/payments/stripe.ts
findings:
  critical: 3
  warning: 5
  info: 7
  total: 15
status: issues_found
---

# Phase 88: Code Review Report, Slice B (Checkout + Stripe Webhook)

**Reviewed:** 2026-11-04
**Depth:** deep (traced into lib/payments/{hold,settle,tick,recovery,customer,state}.ts, lib/supabase.ts, migration 085, admin cancel / payment-link routes)
**Files Reviewed:** 24
**Status:** issues_found

## Summary

These parts hold up when checked against the source:
- **Price recompute:** the amount comes only from `priceCheckout`. `displayedAmountMinor` is only a cross-check.
- **Mode:** the server decides it, and a mismatch gets a 409 `MODE_CHANGED`.
- **Eligibility:** both routes re-check it on every request. Init answers in a way that does not reveal the flag or the allowlist.
- **Consent:** it must be the JSON value `true`. The stored text is rendered on the server from server values and then hashed.
- **Webhook signature:** it is checked before `dispatchPaymentEvent`.
- **Metadata routing:** card objects carry only `kind`/`cofBookingId` and never the legacy `bookingId` key. The recovery link puts metadata on both the link and `payment_intent_data`.
- **Idempotency:** card events use SEC-10 ordering (read, side effect, claim), backed by ledger `event_key`s inside each handler.
- **Middleware:** the matcher is unchanged. `/api/card-checkout` is in both CSRF lists, and the new rate-limit entries are present.
- **Hard-coded €:** none in `app/` or `components/` for this slice.

The defects are in the money lifecycle that the webhook and checkout code feed:
1. Hold-at-checkout bookings never store the saved card. Every later off-session operation then fails: the fallback charge, the difference charge and a re-hold.
2. A recovery link stays payable after the engine has already collected the money. A payment on that link is only logged, which allows a double charge.
3. A hold-at-checkout authorisation on a cancelled or released booking is never voided.

## Critical Issues

### B-CR-01: Hold-at-checkout (`card_hold_now`) bookings never store `stripe_payment_method_id`, so the fallback charge, the difference charge and any re-hold fail

**File:** `lib/stripe-webhook/card-confirm.ts:319-340` (also `lib/payments/checkout.ts:313-333`)
**Issue:** `applyHoldNowAuthorized` writes only `hold_payment_intent_id`, `hold_amount_minor`, `hold_placed_at` and `capture_before`. The setup path does persist `stripe_payment_method_id: idOf(si.payment_method)` (card-confirm.ts:249), but no code writes the card that the hold-now PaymentIntent saved through `setup_future_usage: 'off_session'`. `grep stripe_payment_method_id` finds only one writer, the SetupIntent path. Every off-session operation reads the column:
- `settle.ts:158-160` `chargeSavedCard` returns `missing_payment_details` when it is empty.
- `hold.ts:233-236` `placeHold` takes the `missing_payment_details` definitive failure.
- `actions.ts:86` the admin shows "card saved: false".

**Failure scenarios:**
- D-16: the client books inside 72 h (hold_now) and the operator raises the price. At completion the hold is captured, but `chargeSavedCard('card_difference')` fails with `missing_payment_details`. The booking goes to `balance_due` and the client gets a payment-link email, although a usable saved card exists.
- D-18: the operator moves the pickup later, so the hold is released and must be placed again. `placeHold` fails at once, and the booking goes to `failed` with a "payment failed" email and an operator alert.
- HOLD-04: the hold is gone (expired or cancelled) at completion. The saved-card charge fails for the same reason.

**Fix:** persist the card in the authorisation transition. Tick step E reuses this function, so it is fixed by the same change.
```ts
patch: cancelled
  ? { hold_payment_intent_id }
  : {
      hold_payment_intent_id,
      hold_amount_minor: amountMinor,
      hold_placed_at: new Date().toISOString(),
      capture_before: captureBefore,
      stripe_customer_id: idOf(pi.customer),
      stripe_payment_method_id: idOf(pi.payment_method),
    },
```
Add a test: a hold_now booking followed by a price increase must create a `card_difference` PaymentIntent with `payment_method` set.

### B-CR-02: A recovery link stays payable after the engine collects the money; a later link payment is only logged, so the client is charged twice

**File:** `lib/stripe-webhook/recovery-events.ts:112, 170-177, 181-203` (root cause in `lib/payments/tick.ts:212-247`, `lib/payments/hold.ts:283-301`, `lib/payments/settle.ts:428-441`)
**Issue:** `handlePaymentFailure` emails a recovery Payment Link. The link is deactivated only in `releaseHold` (hold.ts:386-392) and when it is replaced (`refreshRecoveryLink`). It is not deactivated on these paths:
- the automatic retry in tick step B: failed → placing_hold → authorized (`placeHold` success, hold.ts:283-301);
- the retry settle, or a completion settle of a `failed` booking (`CLAIMABLE` includes `failed`, and the success path at settle.ts:428-441 sets `captured`).

If the client later pays the link they were emailed, `handleRecoveryPaid` sees `authorized`, `expired` or `captured`, which are not `failed` or `balance_due`. It calls `parkUnmatchedPayment`, which writes a ledger row and a `console.error`, and nothing else: no refund, no hold release, no operator email (D-14 requires an email alert). The tick-B comment ("A client who paid the recovery link meanwhile is captured … never selected") covers only one order of events.

**Failure scenario:** the scheduled hold is declined at T-72 h, so the link is emailed and `payment_retry_at` is set to T-60 h. The retry hold succeeds at T-60 h (authorized), and the link stays active. The client opens the email at T-50 h and pays. The webhook parks the payment. At completion `settleBooking` captures the hold. Result: the client paid the full amount twice, and the only trace is a server log line. The same happens with an `expired` booking, and after the fallback charge of a `failed` booking at completion.

**Fix:**
1. When a booking leaves `failed`/`balance_due` by any path other than `recovery_paid`, deactivate `recovery_link_id`. Do this before the Stripe call in `placeHold`/`settleBooking` claims, or inside `claimForHold`/the settle claim.
2. In `handleRecoveryPaid`, treat money that arrives for `authorized` as payment. Cancel the hold through `releaseHold`-style code with `cancelHoldIntent`, then move authorized → captured with the recovery PaymentIntent as `payment_intent_id`.
3. For `captured`, `released` or other non-payable states, call `sendPaymentOperatorAlert('recovery_unmatched', …)`, or refund automatically, rather than only writing to `console.error`.

### B-CR-03: A hold-at-checkout authorisation on a cancelled or released booking is never voided; the full amount stays frozen for about 7 days

**File:** `lib/stripe-webhook/card-confirm.ts:311-342` (contributing: `lib/payments/hold.ts:361-364`, `lib/payments/tick.ts:105-116`)
**Issue:**
- `unpaid → cancelled` is a legal status move (`lib/booking-transitions.ts:17`).
- When an operator cancels an unpaid card_hold booking still in `checkout_pending`, `releaseHold` moves it to `released` "without Stripe call" (hold.ts:361-364). The hold-now PaymentIntent the client holds a secret for (`hold_payment_intent_id`) stays confirmable.
- When the client then completes 3DS, the PaymentIntent reaches `requires_capture`. `applyHoldNowAuthorized` gets `outcome === 'cancelled'`, and its transition from `checkout_pending` does not apply (the state is already `released`), so it `return`s.
- Nothing cancels the PaymentIntent. Tick step E only scans `payment_state = 'checkout_pending'`. `placeHold` has the right "orphan authorisation → void" logic (hold.ts:306-312), but this path does not.

**Failure scenario:** the operator clears an abandoned "unpaid" row from the recovery queue while the client still has the payment step open. The client clicks "Hold €X" and passes 3DS, and the page navigates to the confirmation screen. The booking is cancelled, yet the client's full fare is authorised until Stripe's automatic cancel about 7 days later. No email is sent and no operator alert fires.

**Fix:** in `applyHoldNowAuthorized`, void the authorisation whenever this booking will not own it:
```ts
if (cancelled || (!moved.applied && moved.duplicate !== true)) {
  if (str(booking.hold_payment_intent_id) !== pi.id || cancelled || moved.currentState !== 'authorized') {
    try { await cancelPaymentIntent(pi.id, stripeKeys.voidHoldNow(pi.id)) } catch { console.error(...) }
  }
  return
}
```
Also, in `releaseHold`, cancel `hold_payment_intent_id` when the state is `checkout_pending` and that id is set, so the PaymentIntent cannot be confirmed later.

## Warnings

### B-WR-01: `applyHoldNowAuthorized` accepts any `card_hold_now` PaymentIntent, including a superseded one; the PaymentIntent that loses the race stays authorised

**File:** `lib/stripe-webhook/card-confirm.ts:307-343`; `lib/payments/checkout.ts:252-273`
**Issue:** `createHoldNowIntent` tries to cancel the previous hold-now PaymentIntent on a best-effort basis (a failure is only `console.warn`), then sets `hold_payment_intent_id` to the new one. `applyHoldNowAuthorized` never compares `pi.id` with `booking.hold_payment_intent_id`, unlike `handleHoldCanceled` at hold-events.ts:127. Whichever PaymentIntent authorises first wins the `checkout_pending → authorized` compare-and-set, and its patch overwrites `hold_payment_intent_id`. The second authorisation gets `applied: false` without `duplicate` and returns without voiding.

**Failure scenario:** the client duplicates the tab (sessionStorage, including `attemptId`, is copied). Both tabs submit; tab 2's void of pi_A fails or races tab 1's 3DS. Both pi_A and pi_B authorise, and the client has two full-amount holds. The booking tracks one of them. If the tracked one is the PaymentIntent that tab 2 cancelled, the capture at completion fails and the fallback charge then collects the money a second time.

**Fix:** if `pi.id !== booking.hold_payment_intent_id`, or the transition did not apply, cancel `pi` (key `pi_void:<pi>`) and record an observation row. Never adopt a PaymentIntent that is not the current one.

### B-WR-02: "One payment flow per attempt" is enforced only in the browser; the server lets pay-now and card checkout overwrite each other's row

**File:** `lib/supabase.ts:278-284` (update path), `app/api/create-payment-intent/route.ts:145-146`, `lib/payments/checkout.ts:140-141`; client guard in `components/booking/steps/cardCheckoutApi.ts:157-172`
**Issue:** `captureUnpaidBooking` updates any `unpaid` row with the same `attempt_id` using a row from `buildBookingRow`, which has no payment columns.
- A pay-now POST on an attempt the card flow created leaves `payment_mode='card_hold'`, `payment_state='checkout_pending'` and `setup_intent_id` in place, and adds `payment_intent_id`.
- A card POST on a pay-now attempt sets `payment_intent_id` to NULL.

The code comment at cardCheckoutApi.ts:157-161 names this as a known follow-up; only `rotateAttemptIfCardUsed`, which depends on sessionStorage, prevents it.

The admin legacy payment-link route (`app/api/admin/bookings/[id]/payment-link/route.ts:164`) has the same gap. It accepts any `unpaid` booking, including card_hold rows, and the legacy `handlePaymentLinkSucceeded` then confirms the row with a `payment_intent_id`.

**Failure scenario:** a pay-now confirmed row keeps `payment_mode='card_hold'` and a `setup_intent_id` whose SetupIntent succeeded (the card-flow webhook was late, or the SetupIntent succeeded after a client-side error). Tick step E (tick.ts:131-143) runs `applySetupSucceeded`: the status is already confirmed, so it moves checkout_pending → card_saved. A hold is then placed and captured, so the client is charged on top of the pay-now payment.

**Fix:** enforce this on the server:
1. `create-payment-intent` (and the admin payment-link route) refuses, or rotates on, a row whose `payment_mode='card_hold'`.
2. `createCardCheckoutIntent` refuses a row with a non-null `payment_intent_id` or a non-`card_hold` mode. For example, add `.or('payment_mode.is.null,payment_mode.eq.card_hold')` / `.is('payment_intent_id', null)` guards to the capture update, and return a 409 so the client rotates the attempt.

### B-WR-03: A cancelled booking is reported to the client as "already confirmed"

**File:** `lib/payments/checkout.ts:128-130, 142-145`; `components/booking/steps/Step6CardOnFile.tsx:321-324`
**Issue:** `existing.status !== 'unpaid'` returns `already_confirmed` for every non-unpaid status, including `cancelled`. The same happens when `captureUnpaidBooking` returns `[]` because the row was cancelled in between. The client then writes the purchase snapshot and navigates to `/book/confirmation`.
**Failure scenario:** the operator cancels an abandoned unpaid card row, and the client returns to the open tab and submits. The client sees "Booking confirmed" with GA4/Meta purchase events, but no booking exists.
**Fix:** return `already_confirmed` only for live statuses (`confirmed`, `assigned`, …). For `cancelled`, return a distinct result such as 409 `ATTEMPT_CLOSED`; the client then rotates `attemptId` and calls init again.

### B-WR-04: Disputes and refunds on a `card_difference` charge cannot be matched to their booking

**File:** `lib/stripe-webhook/recovery-events.ts:206-228`; `lib/stripe-webhook/dispatch.ts:188-191`
**Issue:** `findDisputedBookings` and `observeRefund` look the booking up only by `payment_intent_id` / `hold_payment_intent_id`. The off-session difference PaymentIntent (settle.ts:405-416) is stored only as a ledger row (`difference_charged:<pi>`) and is never put on the booking row, so a dispute or refund on it matches nothing. No operator alert fires, which contradicts the plan's dispute-alert intent; the legacy refund handler finds nothing either.
**Fix:** the dispute and the charge carry `payment_intent`, so retrieve that PaymentIntent and resolve the booking through `metadata.cofBookingId` (with `kind` starting `card_`) as a fallback when the column lookup returns no rows. Do the same in `observeRefund`.

### B-WR-05: The intent route does not check that the hold date the client saw is the one it records

**File:** `app/api/card-checkout/intent/route.ts:108-121`; `lib/payments/checkout.ts:164-175`
**Issue:** the consent text names the hold date (`{holdDate}`). The intent route cross-checks only the amount (`PRICE_CHANGED`) and the mode (`MODE_CHANGED`). `holdAtMs` is recomputed from the current `settings.leadHours`. If the owner changes the lead time between init and intent while the mode stays `setup`, the server stores and hashes a consent text with a date the client never saw. The confirmation proceeds without a 409, so the stored legal record no longer matches the text the client ticked.
**Fix:** send `displayedHoldDateIso` from the client (`current.holdDateIso`). If it differs from `holdDateIso(holdAtMs)`, answer 409 `MODE_CHANGED` (or a new `HOLD_DATE_CHANGED`) with the new date. The client already clears the tick when its consent key changes.

## Info

### B-IN-01: Canary eligibility relies on an email address the client types

**File:** `lib/payments/config.ts:95-101`; `app/api/card-checkout/init/route.ts:74-77`
Anyone who types an allowlisted address in step 5 gets the card flow before the Phase 89 legal sign-off (D-04). `eligible: true` also confirms allowlist membership: init allows 30 requests per minute per IP. This is acceptable for an owner-only canary, but it is not an access control. Record it in the threat model, or gate the card flow on a signed-in owner session.

### B-IN-02: The server price still uses `distanceKm` and `isAirport` from the client

**File:** `lib/checkout/compute.ts:146, 220`
This predates the phase; the code is carried over verbatim from create-payment-intent. That amount now also becomes the hold amount and the consented amount. "Client cannot set the amount" holds only as far as the client cannot shrink the distance. Consider recomputing the distance on the server before public go-live.

### B-IN-03: In setup mode, the promo code is claimed and a GA4 purchase is sent when the card is saved

**File:** `lib/stripe-webhook/card-confirm.ts:128-163, 267-269`
SEC-01 ("claim after the money moves") does not hold for setup mode: no money moves at card save. A limited-use code can be used up by saving cards and cancelling. GA4/Meta revenue also counts bookings that are later released. Consider claiming at hold or capture.

### B-IN-04: Duplicated helpers

**File:** `lib/stripe-webhook/card-confirm.ts:281-299` duplicates the exported `captureBeforeIso` in `lib/payments/hold.ts` (which hold-events.ts already imports). `trimEmail` is duplicated in both card-checkout routes, and `idOf` exists in 3 or more files. Import the existing ones.

### B-IN-05: Any init failure, including a stale promo or a pricing outage, silently moves an eligible client to pay-now

**File:** `app/api/card-checkout/init/route.ts:91-92, 105-107`; `components/booking/steps/Step6CardOnFile.tsx:623-626`
`PROMO_INVALID` and `PRICING_UNAVAILABLE` become `{eligible:false}`, so the canary sees the legacy pay-now step without being told why. UI-SPEC E1 ("never block checkout") intends this, but a promo the user can fix should show as a promo error rather than switch the flow.

### B-IN-06: The operator "new booking" alert is claimed before sending and never retried

**File:** `lib/stripe-webhook/card-confirm.ts:217-228`
If `sendManagerAlert` throws after the `alert:new_booking` ledger row is inserted, the alert is lost for good. Only `console.error` records it.

### B-IN-07: The consent hash covers only the server's rendering

**File:** `lib/payments/consent-text.ts:1-9`; `lib/payments/money.ts:24`
The comment says the ticked and stored strings "cannot diverge". The browser renders the text with its own ICU (currency and grouping separators for `cs-CZ` / `formatEUR`), and the server renders it with Node's ICU. They can differ in whitespace or separators. This is harmless in practice, but the guarantee is overstated. Consider having the client post the exact label it rendered so the two can be compared.

---

Counts: Critical 3 · Warning 5 · Info 7 · Total 15

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
