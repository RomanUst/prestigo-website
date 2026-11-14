---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
verified: 2026-11-12T01:35:00Z
status: human_needed
score: 5/5 roadmap success criteria verified in code (6/6 requirements satisfied); 0 failed; 12 human items
covered_files:
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-01-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-01-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-02-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-02-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-03-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-03-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-04-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-04-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-05-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-05-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-06-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-06-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-07-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-07-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-08-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-08-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-09-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-09-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-10-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-10-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-11-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-11-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-12-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-12-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-13-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-13-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-14-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-14-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-15-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-15-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-16-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-16-SUMMARY.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-17-PLAN.md
  - .planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-17-SUMMARY.md
  - app/(internal)/driver/trip/[token]/TripDetails.tsx
  - app/(internal)/driver/trip/[token]/page.tsx
  - app/api/admin/bookings/[id]/extra/route.ts
  - app/api/admin/bookings/[id]/landing/route.ts
  - app/api/admin/bookings/dispatch/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/calculate-price/route.ts
  - app/api/create-payment-intent/route.ts
  - app/api/waiting-config/route.ts
  - components/admin/BookingsTable.tsx
  - components/admin/ExtraChargeModal.tsx
  - components/admin/MovePickupDialog.tsx
  - components/admin/PricingForm.tsx
  - components/admin/TripRouteSection.tsx
  - components/admin/dispatch/DispatchBoard.tsx
  - components/admin/dispatch/boardModel.ts
  - components/booking/BookingSummaryBlock.tsx
  - components/booking/LandingPickupFields.tsx
  - components/booking/PriceSummary.tsx
  - components/booking/StopItem.tsx
  - components/booking/steps/cardCheckoutApi.ts
  - lib/airport-pickup.ts
  - lib/airport.ts
  - lib/booking-stops.ts
  - lib/booking-store.ts
  - lib/checkout/compute.ts
  - lib/driver-accept-email.ts
  - lib/email.ts
  - lib/google-calendar.ts
  - lib/landing-change.ts
  - lib/payments/checkout.ts
  - lib/payments/consent-text.ts
  - lib/payments/extra.ts
  - lib/route-distance.ts
  - lib/stops.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/dispatch.ts
  - lib/supabase.ts
  - supabase/migrations/089_admin_search_bookings_hide_cancelled.sql
  - supabase/migrations/089_stops_landing_extra_charges.sql
  - tests/extra-webhook.test.ts
  - tests/phase91-e2e.test.ts
covered_digest: "v2:sha256:40c240e3ade82c2dc22ac18be3242c11c987b656f0e11de918f3f03ddd14750e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Wizard: stops on a transfer (desktop and phone width)"
    expected: "On a Prague transfer add 1..5 stops (the 6th is refused), pick an address in each, remove one, move one up/down; the order in the list is the order drawn on the map with numbered markers and the km/min chip changes; any change to a stop clears the cached price and the promo and a new price is fetched"
    why_human: "Layout, reorder interaction, Google Places/Directions rendering and numbered markers cannot be seen by grep or jsdom"
  - test: "Wizard: waiting select and price line, before and after the owner sets rates"
    expected: "With NO waiting rate set (D-05) the wait select offers only 0 and 15 minutes. After the owner sets a rate for one class, options up to 120 min in 15-min steps appear; a class without a rate is shown disabled with the 'reduce waiting to 15 minutes' note and is unselected if it was selected; 15 min costs nothing, 30 min costs one block, two stops of 15 min cost nothing; PriceSummary and the Step 6 summary show a separate 'Waiting at stops' line whose amount equals the rate times the paid blocks; the total includes it"
    why_human: "Visual price summary, disabled-state styling and real /api/waiting-config + /api/calculate-price round trip in a browser"
  - test: "Wizard: airport pickup landing + offset"
    expected: "Choose Prague Airport as pickup: the date/time fields become landing date/time and an offset picker (0/15/30/45/60/90, default 30) appears, with 'Your driver meets you at HH:MM'. Landing 14:00 + 30 shows 14:30. Landing 23:50 + 30 shows 00:20 on the next date. Changing the pickup away from the airport clears the landing fields. Try 2027-03-28 landing 01:50 (shows pickup 03:20) and 2027-10-31 landing 02:40. Reads clearly on a phone"
    why_human: "UI copy, layout and the derived-pickup line in a real browser; DST dates in the real UI"
  - test: "Tamper check on a live checkout"
    expected: "In the browser devtools resend the card-checkout request with distanceKm changed to 1 and isAirport changed; the booking is created with the server distance (distance_km in admin / DB) and the same amount as the quote, the amount shown never changes; a pickup that differs from landing + offset answers an error"
    why_human: "Needs a real browser session against real Google Routes (the code path and fakes are covered by tests, the live proof is not)"
  - test: "Admin > Pricing: waiting rate per class"
    expected: "A 'Waiting per 15 min' field exists per class next to the hourly rate; saving a positive number persists it; clearing the field saves empty (paid waiting not offered); 0 or text is rejected; saving other fields never clears an existing rate"
    why_human: "Form behaviour and persistence in the real admin"
  - test: "Admin booking panel: Route section and trip edit (list, board, calendar)"
    expected: "A booking with stops shows a Route section with every stop in order, its wait and paid blocks and the 'Waiting at stops' total; an airport booking shows landing time, pickup time and offset; a booking without stops or landing shows no Route section. Editing price-related fields of a booking with stops answers the 'set the price by hand' message (stops_edit_unsupported); editing the pickup time of an airport booking to something that is not landing + an allowed offset is refused with a clear message"
    why_human: "Visual panel layout across three views and the operator-facing messages"
  - test: "Admin: Add extra charge modal (on a completed card booking made under consent 2026-11-3)"
    expected: "'Add extra charge...' appears only for such a booking (not for GNet, pay-now, unfinished or old-consent bookings). Waiting mode: entering minutes shows minutes, blocks and the server amount; Other mode: description + amount. The confirm step states amount, currency, 'charged to the saved card now' and the email receipt; the primary button is labelled with the amount; a double click sends one request; the modal cannot be closed while submitting; the extra appears in the panel's list of extra charges afterwards"
    why_human: "Interaction, button labelling, focus and the money-confirm UX"
  - test: "Admin: Move pickup after a flight delay"
    expected: "On an airport booking press 'Move pickup...', enter a new landing time (prefilled from the flight estimate when known); the dialog shows 'Move pickup to HH:MM' (new landing + stored offset); after confirming, landing and pickup move together, the audit history shows readable rows ('Landing date', 'Minutes after landing'), the client gets the changed-booking email only when 'Notify client' is ticked, and the calendar event time moves"
    why_human: "Dialog UX, email delivery and the Google Calendar side effect"
  - test: "Driver trip page and maps"
    expected: "Open the driver link of a booking with 2 stops and an airport pickup: it lists Landing HH:MM, Pickup HH:MM, 'Free waiting until HH:MM' (60 min from the pickup for airport, 30 for city), each stop with its address and 'wait N min'; no price or waiting fee anywhere; the map and the km/min chip go through the stops in order. A booking without stops looks exactly as before. Check on a phone"
    why_human: "Visual layout, mobile, Google Directions waypoints and numbered markers"
  - test: "Emails as rendered"
    expected: "The client confirmation (pay-now and card flow), driver assignment, driver-accepted and manager alert emails show the stops in order with waits, the 'Waiting at stops' amount (in the booking currency) for the client mail, and Landing/Pickup rows for an airport pickup; no stop rows when there are none; addresses are not mangled. The extra_charged receipt renders in all 7 locales (waiting variant with minutes and amount, other variant with the item line). The ops Google Calendar event description lists landing and stops"
    why_human: "Rendered HTML in real mail clients, translations read by a person, real Calendar event"
  - test: "Live Stripe: owner sets waiting rates, canary booking with a stop, 1 EUR extra (plan 91-16 Task 3)"
    expected: "After the production deploy the owner sets a rate for each class in Admin > Pricing. A production canary booking with one stop shows the waiting line, stores the server distance and the stop (booking_stops row, hold amount includes waiting). After completing it, a 1 EUR 'Other' extra on the owner's own card creates a separate PaymentIntent with metadata kind card_extra, booking_extra_charges status charged, ledger rows admin_action then extra_charged, one receipt email, and bookings.payment_intent_id / payment_state unchanged; then refund it in Stripe and confirm charge.refunded does not change the booking's own payment state"
    why_human: "Real Stripe, real card, real production data; explicitly not reproducible with the fake Stripe"
  - test: "Live Stripe: decline, 3DS-required, unconfirmed and resume paths of the extra charge"
    expected: "In Stripe test mode (or a restricted live trial) a declined card answers 'declined' with no automatic retry and the PaymentIntent is cancelled; an authentication-required card ends declined and cancelled (never left requires_action); a lost synchronous answer leaves the row 'charging' (second click answers payment_busy), the operator can Resume only after the lease and it replays the same idempotency key and amount; a PaymentIntent that succeeds after its row was marked failed produces the 'late success' operator alert and no second charge. Also confirm the webhook finalises a still-charging row exactly once (one extra_charged row, one receipt)"
    why_human: "The 'unconfirmed' and resume branches depend on real Stripe timing/network behaviour (code-review CR-01 / WR-02 are marked 'money logic: requires human verification')"
---

# Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees Verification Report

**Phase Goal:** Clients book transfers with intermediate stops and waiting time at a server-computed price, airport pickups are timed after landing, and the operator can bill waiting beyond what was booked.
**Verified:** 2026-11-12
**Status:** human_needed
**Re-verification:** Yes - after merging origin/main (see the note below)

All code-level must-haves are present, substantive, wired and data-flowing. Nothing was checked in a real browser or against live Stripe; the twelve items above are what remains. No gap, no blocker.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Client can add intermediate stops; price is by distance through all stops, recomputed on the server; a tampered distance or price is ignored | VERIFIED | `lib/route-distance.ts` computeRouteDistance (origin, destination, intermediates in order; field mask `routes.distanceMeters,routes.duration`; no routingPreference/departureTime/optimizeWaypointOrder/via). `app/api/calculate-price/route.ts` skips the fixed route price when `intermediates.length > 0` (D-01), drops `extraStops`/`EXTRA_STOP_PRICE` (grep over app/lib/components: nothing), airport flag from `isAirportTrip` only. `lib/checkout/compute.ts` priceCheckout calls Google through the stops, answers 503 `ROUTING_UNAVAILABLE` on failure (no client fallback), `distanceKm` in the body is "legacy, never read", `buildCheckoutMeta` stores `priced.distanceKm`; card-checkout init/intent use `priced.distanceKm` for the cancellation window. Stops refused outside `transfer` (`STOPS_NOT_ALLOWED`), max 5 (zod). Tests: calculate-price-stops, checkout-stops, route-distance, phase91-e2e (run twice, browser distance 130 and tampered 1, both store 130 km and the same amount) all pass |
| 2 | Client picks waiting per stop; first 15 min free, each further 15 min costs the admin fee; price summary shows it | VERIFIED | `lib/stops.ts` waitingBlocks (0 for <=15, ceil((w-15)/15)), per stop never pooled, `waitingFeeEur` rounded once per booking. Rate per class from `pricing_config.waiting_rate_per_15min` (migration 089, no default, no UPDATE: D-05); admin field in `components/admin/PricingForm.tsx`, `PUT /api/admin/pricing`, public `/api/waiting-config`. Waiting added after night/holiday/airport/min-fare (D-14) in the quote and joined to extras in `computeCombinedTotalMinor` at checkout (promo reduces it, once); a class without a rate gets `waitingEur: null`, `waitingUnavailable`, and checkout answers 422 `WAITING_NOT_AVAILABLE`. UI: `StopItem.tsx` wait select + `useWaitingConfig`, `Step3Vehicle.tsx` disabled class, `PriceSummary.tsx:145` and `BookingSummaryBlock.tsx:460` waiting line from server `waitingEur` (the euro sign is a symbol around a variable, no typed amount; the pre-commit EUR rule matches nothing). Visual check is a human item |
| 3 | Airport pickup: landing + offset, pickup derived, 60 min free counted from pickup, both stored and shown to driver, Prague time, DST-safe | VERIFIED | `lib/airport-pickup.ts` pickupFromLanding via `pickupInstantMs` instant arithmetic (23:50+30 -> 00:20 next day; 2027-03-28 01:50+30 -> 03:20; autumn ambiguous hour pinned in tests), `freeWaitUntilMs(pickup, minutes)`. `validateCheckoutBooking` derives the pickup, `PICKUP_MISMATCH` 422 on a differing client pickup, `LANDING_NOT_AIRPORT` 422, partial landing 400, offsets only 0/15/30/45/60/90. Stored: migration 089 `landing_date/landing_time/pickup_offset_min` (all-or-none CHECK) written by `buildBookingRow` (`lib/supabase.ts`), pickup_date/time stay the pickup (D-18). Driver page `page.tsx` reads landing and computes `freeWaitUntil` from the pickup with the live no-show threshold; `TripDetails.tsx` renders Landing / Pickup / "Free waiting until". Tests airport-pickup, checkout-landing, driver-trip pass |
| 4 | Stops, waits, landing/pickup saved with the booking and visible in admin, on the driver page and in the confirmation email | VERIFIED | `lib/booking-stops.ts` saveBookingStops (replace-all) called from `lib/payments/checkout.ts` (card/cash) and `create-payment-intent/route.ts` (pay-now, fail closed: cancels the PaymentIntent and answers 503 `STOPS_NOT_SAVED`; stops require attemptId). Admin: `attachStops` in `admin/bookings/route.ts` and `dispatch/route.ts`, `TripRouteSection.tsx` in `BookingDetailPanel.tsx:223`; stops_edit_unsupported guard and landing/pickup consistency with compare-and-set in `admin/bookings/route.ts`. Driver: `loadStopsSafe` after the token is validated, no fee columns mapped. Emails/calendar: `lib/email.ts` (loadStopsSafe, landing rows, waiting total in booking currency), `driver-accept-email.ts`, `assign/route.ts`, `webhooks/stripe/route.ts`, `google-calendar.ts` (landing + stops in the description). Tests email-trip-route, google-calendar-sync, driver-accept-email, admin-bookings pass. Rendered output is a human item |
| 5 | Operator can charge waiting beyond the chosen wait (or other extras) to the saved card as a separate charge, amount from admin rates, in the payment ledger, never for GNet | VERIFIED | `lib/payments/extra.ts` + `POST/GET /api/admin/bookings/[id]/extra`: admin guard first, strict zod schemas, `isExtraChargeEligible` (partner/GNet via `isPartnerBooking`, erased, not completed, payment mode/state, saved card, `consentCoversExtras`, in-flight), waiting = ceil(min/15) x admin class rate with `amount_changed` 409 when the confirmed amount differs, `other` positive integer up to Stripe's ceiling (D-13), partial unique index = one charging row, idempotency key `extra:<chargeId>:<attempt>`, `admin_action` ledger row before Stripe, `extra_charged` / `extra_failed` after, separate `card_extra` PaymentIntent that never writes `bookings.payment_state` / `payment_intent_id`. Webhook routing in `dispatch.ts` / `charge-events.ts` (`finalizeExtraFromWebhook`). Consent `CARD_CONSENT_VERSION = '2026-11-3'` + `EXTRAS_CONSENT_VERSIONS` gate (D-12). Operator UI `ExtraChargeModal.tsx` wired from `PaymentPanel.tsx`. Tests extra-charge, extra-webhook, admin-extra-route, extra-charge-modal, payment-state-writers-gate pass. Real Stripe is a human item |

**Score:** 5/5 roadmap truths verified in code. Plan-level truths (91-01 .. 91-17) were each traced to code and to a passing test; none contradicted. The two `verification: backstop` truths (91-04 coordinate/address mismatch residual, 91-16 UI reads clearly on desktop and mobile) are not inferable from code and are carried as human items 1 and 3 (the first is a documented accepted residual).

### Documented deviation from a plan truth (not a gap)

91-08 plan text says the webhook for `card_extra` "adds a charge_succeeded observation". Code-review fix WR-03 deliberately removed it: `charge-events.ts` writes no generic observation for `card_extra` and only calls `finalizeExtraFromWebhook`, so an extra has exactly one money row (`extra_charged` / `extra_failed`) and the cash settle logic cannot mistake it for the trip charge. Tests (extra-webhook, payments-lifecycle) match the new behaviour. Accepted as a correct improvement.

### Review fixes verified in code

| Finding | Evidence in code |
| ------- | ---------------- |
| CR-01 late success after failed row | `extra.ts` `closeUnfinished` cancels or reconciles an unfinished PaymentIntent, returns `unresolved` -> row stays charging + `extra_unresolved` alert; `repairFailedExtra` + `extra_late_success` / `extra_second_payment` alerts; `ops_attention` kind in `payments/alerts.ts` and the contract test |
| WR-01 receipt failure | `extra.ts` `sendReceipt` raises `extra_receipt_failed` alert |
| WR-02 resume reconciles | `reconcileWithStripe`, `idempotency_conflict` ends the row failed, lease check in `resumeExtraCharge` |
| WR-03 single ledger meaning | see deviation above |
| WR-04 compare-and-set on landing | `admin/bookings/route.ts` update `.eq('landing_date')`, `.eq('landing_time')` + stale 409 |
| WR-05 fresh booking + erased | `isExtraChargeEligible` `anonymised_at` -> `erased`; `loadFreshBooking` in the engine |
| WR-06 fallback insert drops stops | `webhooks/stripe/route.ts` `alertIfPaidStopsMissing` + `stopCount` in checkout meta |
| IN-01, IN-03, IN-05, IN-08 | `BookingChangeHistory.tsx` labels; address optional in `compute.ts` schema and NULL in `saveBookingStops`; offset choice for the ambiguous hour in `admin/bookings/route.ts`; currency in `lib/email.ts` / webhook meta |

Open info items left by decision (not blockers, recorded in 91-REVIEW-DISPOSITION.md): IN-02 (no client copy for some pay-now server codes), IN-04 (duplicated caps), IN-06 (Google Routes cost control per-IP only, no cache), IN-07 (quote vs checkout distance may differ by metres), IN-09 (admin list / dispatch fail whole when the stops read fails).

### Locked decisions honoured (D-01 .. D-18)

D-01/D-02/D-03 (km through stops, no flat fee, no-stop quote unchanged: confirmed in calculate-price diff), D-04/D-05 (per-class admin rate, NULL = not offered, no default in migration), D-06 (own summary line), D-07/D-18 (landing columns beside the pickup; pickup_utc untouched), D-08/D-11 (only `landing/route.ts` -> `applyLandingChange`; flight-refresh cron not edited), D-09/D-10/D-13/D-15/D-16 (extra engine), D-12 (consent version 2026-11-3 + server gate), D-14 (waiting after coefficients; promo covers it), D-17 (cap 5, Essentials field mask, 503 fail closed).

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `supabase/migrations/089_stops_landing_extra_charges.sql` | VERIFIED | booking_stops, landing columns + CHECKs, `waiting_rate_per_15min`, booking_extra_charges with `booking_extra_charges_one_charging`, ledger kinds extra_charged/extra_failed, erasure function copies; deny-all RLS; live-applied by the orchestrator (smoke `SMOKE_OK_91_01`, per 91-01-SUMMARY) |
| `lib/stops.ts`, `lib/route-distance.ts`, `lib/booking-stops.ts`, `lib/airport-pickup.ts`, `lib/landing-change.ts` | VERIFIED | Substantive and imported by routes |
| `lib/payments/extra.ts` + `extra` / `landing` routes | VERIFIED | Substantive (813 lines), wired to routes, webhook and panel |
| `components/booking/{StopItem,LandingPickupFields,PriceSummary,BookingSummaryBlock}`, `useWaitingConfig` | VERIFIED | Imported in EntryBar, Step2DateTime, Step3Vehicle, Step6Payment |
| `components/admin/{TripRouteSection,MovePickupDialog,ExtraChargeModal,PricingForm}` | VERIFIED | Mounted in BookingDetailPanel / PaymentPanel / pricing page |
| `messages/*.json` (7 locales) | VERIFIED | i18n-completeness, payments-copy-i18n, wizard-stops-copy tests pass |

### Key Link Verification

| From | To | Status | Details |
| ---- | -- | ------ | ------- |
| Wizard store stops/landing | checkout bodies | WIRED | `tripExtrasForBody` (cardCheckoutApi.ts) used by card/cash and `Step6Payment.tsx:408` |
| Wizard | /api/calculate-price, /api/waiting-config | WIRED | `Step3Vehicle.tsx` (waitMinutes per stop), `useWaitingConfig` |
| priceCheckout | Google Routes | WIRED | computeRouteDistance with intermediates; 503 on failure |
| checkout capture | booking_stops | WIRED | saveBookingStops in `payments/checkout.ts` and pay-now route |
| stored stops | admin list, dispatch, driver page, emails, calendar | WIRED | attachStops / loadStopsSafe |
| PaymentPanel | ExtraChargeModal -> POST /extra | WIRED | allowed_actions `charge_extra` from the payment GET |
| Stripe webhook | finalizeExtraFromWebhook | WIRED | dispatch.ts routes `card_extra` success and failure away from the hold handler |
| TripRouteSection | MovePickupDialog -> POST /landing -> applyLandingChange | WIRED | only caller (D-11) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| -------- | ---- | ------ | --------- | ------ |
| PriceSummary waiting line | `prices[vc].waitingEur` | /api/calculate-price (Google distance + admin rate) | Yes | FLOWING |
| Admin Route section | `booking.stops`, landing columns | booking_stops via attachStops, bookings row | Yes | FLOWING |
| Driver page stops / free wait | loadStopsSafe, pickup + live no-show thresholds | DB | Yes | FLOWING |
| Extra modal amount | GET /extra?minutes=N | server preview from admin rate | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase tests (quote, checkout, stops, landing, extra, webhook, routes, migration, e2e) | `npx vitest run` on 17 files | 17 files, 788 tests passed | PASS |
| UI / invariants (i18n completeness, no hard-coded colors, ledger writers gate, state vocabulary, driver, email, route section, extra modal, move dialog) | `npx vitest run` on 10 files | 10 files, 275 tests passed | PASS |
| Full suite (run by orchestrator, not repeated) | `npx vitest run --exclude ...` | 424 files / 13 535 tests passed | PASS (reported) |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (baseline) | PASS |
| Debt markers in phase-changed source | grep TBD/FIXME/XXX | none | PASS |
| Removed flat stop fee | grep `EXTRA_STOP_PRICE\|extraStops` in app/lib/components | none | PASS |

### Probe Execution

Step 7c: SKIPPED - no probe scripts declared by any plan (`scripts/*/tests/probe-*.sh` not referenced).

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
| ----------- | ------------ | ------ | -------- |
| STOP-01 add intermediate stops | 91-09, 91-10, 91-13, 91-16, 91-17 | SATISFIED (UI check human) | store, StopItem/StopList, checkout bodies, map through stops |
| STOP-02 price by distance through all stops, on the server | 91-02, 91-04 | SATISFIED | route-distance, calculate-price, compute.ts |
| STOP-03 wait per stop, 15 free, fee from admin | 91-01, 91-02, 91-03, 91-04, 91-09, 91-17 | SATISFIED | stops.ts, pricing config, waiting-config, summary lines |
| STOP-04 stops saved and shown in admin, driver, emails | 91-01, 91-06, 91-10, 91-12, 91-13, 91-14 | SATISFIED | booking_stops + all display surfaces |
| STOP-05 airport pickup after landing, 60 min from pickup, both stored and shown to driver | 91-01, 91-07, 91-10, 91-12, 91-13, 91-14, 91-15, 91-17 | SATISFIED | airport-pickup, compute.ts, driver page, Move pickup |
| EXTRA-01 operator extra charge to the saved card | 91-01, 91-05, 91-08, 91-11, 91-16 | SATISFIED (live Stripe human) | extra.ts and route |

All six phase IDs are declared in plan frontmatter and match the ROADMAP requirement list; no orphaned requirement for Phase 91 in REQUIREMENTS.md. Bookkeeping to do by the orchestrator: REQUIREMENTS.md still shows the six IDs as `Pending` (and unticked) and ROADMAP shows 16/17 plans with 91-16 unticked, because Task 3 (owner live proofs) is open.

### Anti-Patterns Found

None blocking. No TODO/FIXME/XXX markers, no stub handlers, no hollow props in the phase's changed source. Warning-level notes: the driver trip page strings are English only (the driver surface is English elsewhere too); two of the five open review info items (IN-06 no routing cache, IN-09 whole-list failure on a stops read error) are operational risks worth a backlog entry.

### Human Verification Required

Twelve items are listed in the frontmatter `human_verification` block (UI in a real browser: wizard stops, waiting, landing; admin pricing, Route section, extra modal, Move pickup; driver page; rendered emails; live-Stripe canary and the unconfirmed / resume paths).

### Gaps Summary

No code gaps. The phase goal is implemented end to end and covered by passing tests, including one integration test that walks a quote with a stop and 45 minutes of waiting through checkout, storage, the admin list and a charged waiting extra. What remains is human only: browser and mail-client checks, and the live production steps of plan 91-16 Task 3 after deploy (owner sets waiting rates, canary booking with a stop, 1 EUR extra on the owner's card, refund). Until the owner sets rates, paid waiting is "not offered" by design (D-05).

## Re-verification 2026-11-12 after merging main

Trigger: `verification.status` answered `stale` after commit 2b2d64a4 (one new test) and the merge of `origin/main` (PR #103 "hide cancelled bookings from the working list and the board") into feat/91-stops-waiting. New since the first report: `91-SECURITY.md` (64/65 threats closed, T-91-46 procedural, open until the owner's live proof) and `91-UAT.md` (the 12 human items above). Changes inspected with `git diff f9612810..HEAD`.

Result: no regression of any Phase 91 must-have. Status stays `human_needed`, score stays 5/5.

| Changed file | Phase 91 truth touched | Finding |
| ------------ | ---------------------- | ------- |
| `app/api/admin/bookings/route.ts` (GET only: `hideCancelled` + `p_hide_cancelled` RPC argument) | SC4 admin list shows stops/landing | `attachStops(rpcRows)` is still applied to every RPC row (line 325); the RPC still returns `to_jsonb(b.*)`, so `landing_date`, `landing_time`, `pickup_offset_min` still arrive. The PATCH guards (`stops_edit_unsupported`, landing/pickup consistency with compare-and-set) are outside the diff and unchanged. |
| `supabase/migrations/089_admin_search_bookings_hide_cancelled.sql` | SC4 | Drops the 8-argument `admin_search_bookings`, re-creates it with `p_hide_cancelled boolean DEFAULT false`, re-REVOKEs PUBLIC/anon/authenticated and grants service_role only. With the default the result equals migration 071. The dispatch route (old named arguments) keeps working. Return shape unchanged. |
| `components/admin/BookingsTable.tsx`, `dispatch/DispatchBoard.tsx`, `dispatch/boardModel.ts` | SC4 panel/board visibility | Only the cancelled-booking filter changed (`isHiddenCancelled`; a cancelled booking with a pending fee case stays visible). The shared booking panel with the Route section and the extra-charge action is untouched. |
| `tests/extra-webhook.test.ts` (+1 test) | SC5 webhook path, CR-01 | A `payment_intent.canceled` on a `card_extra` PaymentIntent changes nothing on the booking, the charge row or the ledger and sends no mail. Strengthens the CR-01 cancel path; passes. |
| `91-SECURITY.md`, `91-UAT.md` | none | Documents only. |

Runs on the merged tree: `extra-webhook`, `admin-bookings`, `admin-bookings-dispatch`, `dispatch-board`, `admin-search-bookings-hide-cancelled`, `phase91-e2e`, `admin-bookings-edit-payment`, `migration-089` = 8 files, 291 tests passed. Full suite on the merged tree (reported by the orchestrator): 425 files / 13 554 tests passed; `tsc` baseline only.

Warning (not a Phase 91 gap): two migration files now share the prefix `089` (`089_stops_landing_extra_charges.sql` and `089_admin_search_bookings_hide_cancelled.sql`). Both are live and independent (different objects), and the tests pass with both, but the next migration must be numbered 090 or higher and a fresh-database replay must apply both. Note for the migration-numbering memory: next free number is 090.

Open until the owner: T-91-46 (procedural, closed only by the live proof, human item 11) and all twelve human items (now persisted in `91-UAT.md`).

---

_Verified: 2026-11-12 (re-verified after the merge of main)_
_Verifier: Claude (gsd-verifier)_
