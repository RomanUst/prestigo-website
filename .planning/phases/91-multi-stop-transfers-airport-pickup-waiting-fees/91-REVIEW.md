---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
reviewed: 2026-11-12T00:00:00Z
depth: standard
files_reviewed: 65
files_reviewed_list:
  - app/(internal)/driver/trip/[token]/TripDetails.tsx
  - app/(internal)/driver/trip/[token]/TripMap.tsx
  - app/(internal)/driver/trip/[token]/TripScreen.tsx
  - app/(internal)/driver/trip/[token]/page.tsx
  - app/api/admin/bookings/[id]/assign/route.ts
  - app/api/admin/bookings/[id]/extra/route.ts
  - app/api/admin/bookings/[id]/landing/route.ts
  - app/api/admin/bookings/[id]/payment/route.ts
  - app/api/admin/bookings/dispatch/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/admin/pricing/route.ts
  - app/api/calculate-price/route.ts
  - app/api/card-checkout/init/route.ts
  - app/api/card-checkout/intent/route.ts
  - app/api/create-payment-intent/route.ts
  - app/api/waiting-config/route.ts
  - app/api/webhooks/stripe/route.ts
  - components/admin/BookingDetailPanel.tsx
  - components/admin/ExtraChargeModal.tsx
  - components/admin/MovePickupDialog.tsx
  - components/admin/PaymentPanel.tsx
  - components/admin/PricingForm.tsx
  - components/admin/TripEditPanel.tsx
  - components/admin/TripRouteSection.tsx
  - components/admin/bookingTypes.ts
  - components/booking/BookingSummaryBlock.tsx
  - components/booking/EntryBar.tsx
  - components/booking/LandingPickupFields.tsx
  - components/booking/PriceSummary.tsx
  - components/booking/RouteMap.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/booking/StopItem.tsx
  - components/booking/StopList.tsx
  - components/booking/steps/Step1TripType.tsx
  - components/booking/steps/Step2DateTime.tsx
  - components/booking/steps/Step3Vehicle.tsx
  - components/booking/steps/Step6Payment.tsx
  - components/booking/steps/cardCheckoutApi.ts
  - components/booking/useWaitingConfig.ts
  - lib/airport-pickup.ts
  - lib/airport.ts
  - lib/booking-stops.ts
  - lib/booking-store.ts
  - lib/checkout/compute.ts
  - lib/driver-accept-email.ts
  - lib/email.ts
  - lib/google-calendar.ts
  - lib/landing-change.ts
  - lib/payments/actions.ts
  - lib/payments/checkout.ts
  - lib/payments/consent-text.ts
  - lib/payments/emails/render.ts
  - lib/payments/emails/send.ts
  - lib/payments/extra.ts
  - lib/payments/state.ts
  - lib/payments/stripe.ts
  - lib/pricing-config.ts
  - lib/pricing-helpers.ts
  - lib/route-distance.ts
  - lib/stops.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/dispatch.ts
  - lib/supabase.ts
  - supabase/migrations/089_stops_landing_extra_charges.sql
  - types/booking.ts
findings:
  critical: 1
  warning: 6
  info: 9
  total: 16
status: issues_found
---

# Phase 91: Code Review Report

**Reviewed:** 2026-11-12
**Depth:** standard (money and price-authority paths read in full, plus cross-file tracing into `lib/payments/settle.ts`, `lib/payments/tick.ts`, `lib/stripe-webhook/hold-events.ts`, `lib/stripe-webhook/recovery-events.ts`, `lib/server-pricing.ts`, middleware CSRF lists)
**Files Reviewed:** 65
**Status:** issues_found

## Summary

The phase is carefully built. What I verified as sound:

- **Server price authority.** `lib/checkout/compute.ts` no longer reads `distanceKm` or `isAirport` from the body; distance comes from Google Routes through the stops, the airport flag from coordinates, the pickup from landing + offset, and a routing failure answers 503 (no client fallback). Quote and checkout agree on waiting (added after night, holiday, airport, min-fare; rounded once; promo applied to total incl. waiting), and round trips with stops cannot be built through the UI (`setTripType` clears stops) and are refused by the checkout (`STOPS_NOT_ALLOWED`).
- **Extra-charge concurrency.** One `charging` row per booking via the partial unique index, Stripe key `extra:<chargeId>:<attempt>` (never the amount), compare-and-set finalisation shared by the sync path and the webhook with identical ledger keys, so a sync and a webhook delivery cannot double-record or double-mail. Resume replays the same key and amount.
- **Guard order and auth.** New admin routes call `getAdminUser()` before reading anything, strict zod bodies, no currency/booking id/amount from the client for waiting, `/api/admin` is in the middleware CSRF strict list. GNet / partner bookings are refused in the engine (`isPartnerBooking`), the preview, and the webhook (`assertMoneyEligible`).
- **Injection and PII.** Stop addresses and the extra description are HTML-escaped in every email path (`escapeHtml`, the `html()` token pipeline in `render.ts`); the description is never in a subject, ledger row or log; logs carry ids and fixed codes only.
- **Migration.** New tables are deny-all, `ON DELETE RESTRICT` on the money table, the one widened CHECK only adds values, the replaced SECURITY DEFINER functions repeat the REVOKE/GRANT lines, and the 089 copy of `erasure_anonymise_person` differs from 088 only by the stop and extra-description scrubbing (verified with a diff).
- **DST.** I ran `pickupFromLanding` on 2027-03-28 and 2027-10-31 and across midnight (23:50 + 30 -> next day 00:20); results are correct apart from the autumn ambiguous hour (IN-05).

Key concern: the `card_extra` path that can leave money collected while the row says `failed` (CR-01). The executor reported this as log-only; it needs an operator alert and a state repair, and the cheaper fix is to stop the situation arising. The remaining findings are warnings about the lost receipt, ledger semantics, a missing compare-and-set, stale eligibility data and the pay-now fallback.

## Critical Issues

### CR-01: A `card_extra` PaymentIntent that succeeds after its row was marked failed is only logged; the operator is told "nothing was charged" and can charge again

**File:** `lib/payments/extra.ts:212-214` (cause), `:248-262` / `:309-325` (row marked failed), `:562-567` (webhook only logs); `lib/stripe-webhook/charge-events.ts:79-89`; `components/admin/ExtraChargeModal.tsx:153-155`

**Issue:** `chargeSavedCard` maps every PaymentIntent answer other than `succeeded` to a definitive decline: `requires_action` becomes `authentication_required`, anything else (for example `processing`) becomes `unexpected_status`, and `collect` then calls `finishFailed`, which flips the row `charging -> failed`. For those statuses the PaymentIntent is NOT dead: it was created and is still live at Stripe and nothing cancels it. If it later succeeds, `finalizeExtraFromWebhook` finds `charge.status === 'failed'` and only does `console.error(...)` and `return`. Result:

- money is collected from the client's card (the observation row `charge_succeeded:<pi>` is written, but the `booking_extra_charges` row stays `failed`);
- the operator was shown "The card was declined (unexpected_status). Nothing was charged." and the panel lists the row as "Declined";
- eligibility does not block a new charge (a `failed` row is not `charging`), so the natural next step is a second click, which charges the client twice for the same extra;
- no receipt is sent, and a `console.error` in Vercel logs is the only trace (not an operator alert).

`requires_action` / `processing` are unusual for an off-session card confirm (Stripe normally throws a card error instead), so likelihood is low; but the consequence is a silent double charge to a real client, and the fix is small. A log line does not meet the bar the rest of the payments code sets (see `sendPaymentOperatorAlert` use in `charge-events.ts:135`).

**Fix:** Two parts, both small.

1. Do not call a non-terminal status a decline. In `chargeSavedCard`, for any `pi.status !== 'succeeded'` cancel the PaymentIntent (best effort, own try/catch, deterministic idempotency key) before returning `declined`, so it cannot succeed later:

```ts
if (pi.status === 'succeeded') return { kind: 'ok', pi }
try {
  await getPaymentsStripe().paymentIntents.cancel(pi.id, undefined, {
    idempotencyKey: `extra_cancel:${charge.id}:${charge.attempt}`,
  })
} catch { /* already terminal; the webhook repair below covers the race */ }
```

2. Repair instead of log in `finalizeExtraFromWebhook`. When `outcome === 'succeeded'` and the row is `failed` and `charge.stripe_payment_intent_id` is null or equals `pi.id`, flip it with a compare-and-set on `status = 'failed'` (`failed -> charged`, set `stripe_payment_intent_id`, `charged_at`, clear `last_error_code`), write `extra_charged:<chargeId>` (the key already makes this exactly-once), send the receipt for the winner of that CAS, and call `sendPaymentOperatorAlert` (new kind or reuse `duplicate_payment` with `note: 'extra_succeeded_after_failed'`) so a person sees it. Keep the ids-only log.

## Warnings

### WR-01: A failed receipt email after a successful charge is never retried and nothing tells the operator

**File:** `lib/payments/extra.ts:264-284` and `:305`

**Issue:** `finishCharged` flips the row to `charged` first and sends the receipt only for the writer that won that flip. If `sendPaymentEmail` returns `failed` (render error, Resend outage, missing recipient) or throws, `sendReceipt` only does `console.error`. The row is already `charged`, so neither a webhook redelivery (`markCharged` returns false) nor a second click can resend it. D-10 promises the client an email with the breakdown; here the client can be charged with no receipt and no signal anywhere in the admin. The webhook path makes this likelier: `finalizeExtraFromWebhook` falls back to `{ id: bookingId }` when the booking read returns null, and `sendPaymentEmail` then answers `failed` ("no recipient").

**Fix:** Make the receipt retryable and visible. Either send the receipt before the CAS and key it by the ledger (`email:extra_charged:<id>` already dedups via `deliverOnce`) so a redelivery re-attempts it, or on `failed`/`threw` call `sendPaymentOperatorAlert('email_failed', booking, { eventKey: 'alert:extra_receipt:<chargeId>' })`. In the webhook path, throw (so Stripe redelivers) when the booking row cannot be read instead of substituting `{ id }`.

### WR-02: Resume replays at Stripe with no reconciliation, and a row can stay `charging` forever

**File:** `lib/payments/extra.ts:500-536`, `:176-226`

**Issue:** `resumeExtraCharge` only waits for the 10-minute lease, then re-runs `paymentIntents.create` with the original key. Stripe keeps idempotency keys for 24 hours. A resume after that creates a brand-new PaymentIntent for the same amount, so if the original call had actually succeeded and its `payment_intent.succeeded` webhook was missed or failed, the client is charged twice. Conversely, transient/`config`/`idempotency` outcomes always leave the row `charging` (`extra.ts:219-222`), and the only exits are a successful replay or a webhook; there is no operator action to abandon a row. One stuck row blocks every later extra for that booking (partial unique index) and is `payment_busy` forever. An `idempotency` error is realistic if the booking's saved payment method was replaced between the first call and the resume (same key, different parameters).

**Fix:** Before replaying, look the PaymentIntent up by `metadata.extraChargeId` (`paymentIntents.search({ query: "metadata['extraChargeId']:'<id>'" })` or list by customer) and, if one exists, settle the row from it (`succeeded` -> `finishCharged`, failed/canceled -> `finishFailed`) instead of creating again. Refuse a replay older than 23 hours with a message that points to reconciliation. Add an operator-confirmed "abandon pending charge" that CASes `charging -> failed` only after that Stripe lookup shows no succeeded PaymentIntent.

### WR-03: A `card_extra` money event is written to the ledger twice, under kinds shared with the trip charge, and the cash adopt logic cannot tell them apart

**File:** `lib/stripe-webhook/charge-events.ts:79-86`, `:171-181`; `lib/payments/extra.ts:291-306`, `:309-325`; read by `lib/payments/settle.ts:517-546`, `lib/payments/tick.ts:430`

**Issue:** For one extra charge the ledger gets `charge_succeeded:<pi>` (webhook observation) and `extra_charged:<chargeId>` (finalisation), and on failure `charge_failed` (`extra_failed_obs:<pi>`) plus `extra_failed`. The observation rows reuse the trip charge kinds `charge_succeeded` / `charge_failed`. Two consequences:

- Anything that sums or lists money by kind sees the extra's amount twice.
- `chargeSeenSinceClaim` (`settle.ts:517`) treats any `charge_succeeded` row newer than the latest `capture_started` as "a payment Stripe executed while this cash claim ran" and, when the cash charge's own answer is lost, can adopt an extra's PaymentIntent as the cash charge. Extras are offered on `cash_guarantee` bookings in `card_saved`/`failed` (`CASH_EXTRA_STATES`), so this overlap is reachable, although it needs a lost answer inside a narrow window.

**Fix:** Do not write the generic observation row for `card_extra` (the dedicated `extra_charged` / `extra_failed` rows already carry the pi id, amount and currency): in `handleCardChargeSucceeded` / `handleCardChargeFailed` return before `appendPaymentEvent` when `kind === 'card_extra'` and let `finalizeExtraFromWebhook` write the only rows. If the observation is wanted, give it its own ledger kind.

### WR-04: Manual pickup edit has no compare-and-set on the landing columns, so a concurrent "Move pickup" can desync landing, offset and pickup

**File:** `app/api/admin/bookings/route.ts:462-486` (offset derived from the row read earlier), `:756-759` (update guarded by `id` only)

**Issue:** The PATCH reads `current`, derives `landingOffsetUpdate` from `current.landing_date/landing_time`, awaits pricing and other work, then updates `.eq('id', ...)` with `pickup_date`, `pickup_time` and `pickup_offset_min`. `applyLandingChange` (the other writer) correctly CASes on pickup and landing, but this path does not. If a second operator moves the landing in between, the update still lands: the row ends with the new landing and a pickup/offset computed from the old landing, i.e. exactly the D-18 desync the guard exists to prevent (driver, hold and calendar all follow the wrong time).

**Fix:** When `landingOffsetUpdate` is set, add `.eq('landing_date', current.landing_date).eq('landing_time', current.landing_time).eq('pickup_date', current.pickup_date).eq('pickup_time', current.pickup_time)` to the update, `select('id')`, and answer 409 `stale` when no row matches (the same contract as `applyLandingChange`).

### WR-05: The engine's "fresh" guard re-reads consent and in-flight but not the booking, and eligibility ignores an erased booking

**File:** `lib/payments/extra.ts:364-378`, `:153-172`; `app/api/admin/bookings/[id]/extra/route.ts:184-201`

**Issue:** `guard()` is documented as a re-check "on a fresh context (T-91-25)", but it passes the `booking` row the route loaded earlier into `isExtraChargeEligible`, so `status`, `payment_state`, `payment_mode` and the Stripe ids are as old as the request start (the payment panel can be open for minutes, but even within a request the window spans several awaits). Separately, `isExtraChargeEligible` never checks `anonymised_at`. The erasure SQL clears Stripe ids only for `captured/released/cash_settled` rows, so an erased `cash_guarantee` booking in `card_saved` or `failed` keeps `stripe_customer_id` (the Customer was deleted by the saga), and the extra is offered, charged against a deleted Customer, and its receipt is mailed to `erased-<id>@erased.invalid`.

**Fix:** Re-read the booking inside `runExtraCharge` / `resumeExtraCharge` (one `select('*')`) and pass that row to `guard`. Add `if (booking.anonymised_at) return { ok: false, reason: 'no_saved_card' }` (or a new `erased` reason) to `isExtraChargeEligible`.

### WR-06: A pay-now booking created by the webhook fallback insert silently drops its paid stops

**File:** `app/api/webhooks/stripe/route.ts` (fallback insert in `handleOneWaySucceeded`), `app/api/create-payment-intent/route.ts:104-113`

**Issue:** Confirmed as the orchestrator described. The checkout fails closed (503, PI cancelled) when stops cannot be stored, so the fallback only arises when the unpaid capture row is gone by the time payment succeeds. In that case the client has paid for the detour and waiting, the booking row has no `booking_stops`, and the driver, the calendar event and every email show a plain A-to-B trip. Nothing flags it: the PaymentIntent carries the amount but no sign that stops were priced.

**Fix:** Add a compact `stopCount` (and optionally `stopsJson` of `lat,lng,wait` tuples, which fits the 500-char value limit for 5 stops) to the pay-now metadata in `buildCheckoutMeta`; in the fallback insert, restore stops from it when present, or at minimum send the operator alert and write an operator note so the booking is reviewed before dispatch.

## Info

### IN-01: Audit rows for `pickup_offset_min`, `landing_date` and `landing_time` render as raw field names

**File:** `components/admin/BookingChangeHistory.tsx:22-38`; written by `lib/landing-change.ts:53-58, 156-160` and `app/api/admin/bookings/route.ts:481-483`

**Issue:** Confirms the known item and extends it: `FIELD_LABELS` has no entry for any of the three new audited fields (it falls back to `field`). The erasure SQL also wipes the old/new values of these fields (not in its allow-list), which is fine.

**Fix:** Add `landing_date: 'Landing date'`, `landing_time: 'Landing time'`, `pickup_offset_min: 'Minutes after landing'`.

### IN-02: Pay-now has no client copy for several new server codes (extends the known item)

**File:** `components/booking/steps/Step6Payment.tsx:32-44`, `components/booking/steps/Step6CardOnFile.tsx:72-84`; codes from `lib/checkout/compute.ts:152-340`, `app/api/create-payment-intent/route.ts:111, 197`

**Issue:** `KNOWN_STEP6_ERROR_CODES` has none of `STOPS_NOT_ALLOWED`, `LANDING_NOT_ALLOWED`, `LANDING_NOT_AIRPORT`, `PICKUP_MISMATCH`, `WAITING_NOT_AVAILABLE`, `ROUTING_UNAVAILABLE` (503) or `STOPS_NOT_SAVED` (503); all fall back to the generic `paymentInitFailed`. `ROUTING_UNAVAILABLE` and `STOPS_NOT_SAVED` are transient and most likely in production ("try again" is the right copy); `WAITING_NOT_AVAILABLE` happens when an admin removes a rate while a client is mid-booking. Also, `card-checkout/init` swallows every `priced` failure into `{ eligible: false }`, so a transient Google outage silently drops a client from the card flow to the legacy pay-now flow.

**Fix:** Add catalog keys in all 7 locales for the transient and the waiting codes; let `init` answer 503 (or a retry hint) on `ROUTING_UNAVAILABLE` instead of `ineligible`.

### IN-03: Stop address schema rejects an empty address that storage and email code expect

**File:** `lib/checkout/compute.ts:88`, `lib/booking-stops.ts:48-49`, `lib/email.ts:200` ("Pinned on the map")

**Issue:** The schema requires `address` to be 1-500 characters after trim, so a pinned stop with an empty address makes the whole checkout answer 400 `INVALID_REQUEST`, while `saveBookingStops`, the emails and the calendar all handle `address === null` ("Pinned on the map"). The two halves disagree; the 400 is also a generic copy.

**Fix:** Either allow `''` in the schema (`.max(500)` only) and keep storing NULL, or drop the unreachable null-address rendering and keep `.min(1)`.

### IN-04: Duplicated magic numbers (waiting caps, Stripe ceiling), one unused export

**File:** `lib/stops.ts:19` (`MAX_EXTRA_WAIT_MIN`, unused), `lib/payments/extra.ts:47-50`, `app/api/admin/bookings/[id]/extra/route.ts:51-52`, `components/admin/ExtraChargeModal.tsx:78-81`; migration `089:118`

**Issue:** 480 minutes and 99_999_999 minor units are written in five places; `MAX_EXTRA_WAIT_MIN` in `lib/stops.ts` is exported and never imported.

**Fix:** Use `MAX_EXTRA_WAIT_MIN` and `EXTRA_AMOUNT_CEILING_MINOR` everywhere (the modal can import them; both files are client-safe if the ceiling moves next to the minutes cap in `lib/stops.ts`).

### IN-05: Autumn ambiguous hour: a manual pickup edit can match the wrong offset

**File:** `app/api/admin/bookings/route.ts:467-474`, `lib/airport-pickup.ts:31-42`

**Issue:** Verified by running `pickupFromLanding`: on 2027-10-31, landing 01:50 gives pickup "02:20" for both offset 30 (CEST 02:20) and offset 90 (CET 02:20), and `pickup_utc` picks the CET occurrence. The PATCH matcher uses `LANDING_OFFSETS.find`, so an operator re-saving 02:20 on a booking with offset 90 rewrites the offset to 30 and writes an audit row. One hour per year; documented as accepted in the helper, noted for completeness.

**Fix:** Prefer the booking's stored offset first (`[current.pickup_offset_min, ...LANDING_OFFSETS]`) when several offsets match.

### IN-06: Google Routes cost control is per-IP only, with no response cache

**File:** `app/api/calculate-price/route.ts:133-147, 274-282`, `lib/route-distance.ts:52-130`, `lib/rate-limit.ts:21-29`

**Issue:** Stop count is capped at 5 in the schema and again in `computeRouteDistance`, so one request is one Essentials call. But `calculate-price` (30/min), `card-checkout/init` (30/min) and `create-payment-intent` (10/min) each call Google per request, the limiter fails open when Upstash is down, and identical quotes are not cached; a distributed caller is bounded only by Google's quota.

**Fix:** Cache `computeRouteDistance` results for a few minutes keyed by the rounded (5 decimal) point list, and set a Google Cloud daily quota on the Routes API as the hard stop.

### IN-07: Quote vs checkout distance can differ by a few metres between calls

**File:** `lib/checkout/compute.ts:341-354`, `app/api/card-checkout/intent/route.ts:135-141`

**Issue:** Quote, `init` and `intent` each ask Google again and price `Math.round(distanceKm * rate)` per class; a small change in the returned `distanceMeters` can flip a rounding and answer `409 PRICE_CHANGED` between init and intent. The client handles that code, so this is friction not a defect. Related known item: on a crafted API round trip with stops the quote reuses the outbound distance for the return leg and carries no waiting; I confirmed no UI path produces it and the checkout refuses stops on round trips, so it cannot cause a charge mismatch (dismiss).

**Fix:** None required; the cache in IN-06 also removes the flicker within a session.

### IN-08: Client emails state the waiting total in EUR even for a CZK booking

**File:** `lib/email.ts:195`, `:212`

**Issue:** `tripRouteRowsHtml('client')` always prints `formatEUR(waiting)`, while the booking and the receipt may be in CZK.

**Fix:** Pass the booking currency into `EmailTripRoute` and use `formatCZK(eurToCzk(waiting))` when it is `czk`.

### IN-09: Admin list and dispatch board fail completely when the stops read fails

**File:** `app/api/admin/bookings/route.ts:310-318`, `app/api/admin/bookings/dispatch/route.ts:95-104`

**Issue:** Both routes answer 500 "DB read failed" when `attachStops` throws, so a problem with `booking_stops` alone takes down the operators' list and the dispatch board (the emails and calendar degrade instead via `loadStopsSafe`). Failing closed is defensible because a booking shown without its stops is also dangerous for dispatch.

**Fix:** Optional: return the rows with `stops: []` plus `stops_unavailable: true`, and have `TripRouteSection` show a visible "stops could not be loaded" notice.

---

_Reviewed: 2026-11-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
