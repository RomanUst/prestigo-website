---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
verified: 2026-11-14T13:30:00Z
status: passed
score: 6/6 must-haves verified (5/5 roadmap success criteria and the 91-06 stops-replace truth); 6/6 requirements have implementation evidence; 8 human items open (5 deferred by the owner, 3 never observed on production)
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
  - app/[locale]/book/confirmation/page.tsx
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
  - components/booking/BookingWizard.tsx
  - components/booking/EntryBar.tsx
  - components/booking/LandingPickupFields.tsx
  - components/booking/PriceSummary.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/booking/StopItem.tsx
  - components/booking/StopList.tsx
  - components/booking/steps/Step3Vehicle.tsx
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
  - lib/payments/emails/render.ts
  - lib/payments/emails/send.ts
  - lib/payments/extra.ts
  - lib/route-distance.ts
  - lib/stops.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/dispatch.ts
  - lib/supabase.ts
  - supabase/migrations/089_admin_search_bookings_hide_cancelled.sql
  - supabase/migrations/089_stops_landing_extra_charges.sql
  - tests/EntryBar.test.tsx
  - tests/Step3Vehicle.test.tsx
  - tests/checkout-stops-persist.test.ts
  - tests/confirmation-page.test.tsx
  - tests/extra-webhook.test.ts
  - tests/phase91-e2e.test.ts

covered_digest: "v2:sha256:214ac675955275a5e5c3191560db81766f31645a2ad8155b3d03b4e138607ca7"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Stops UI was not mounted on the public wizard (found by production UAT, fixed by PR #105): EntryBar, the real step 1, renders StopList"
    - "Vehicle step had a second route editor without stops that broke the landing / pickup pair (PR #106): the route bar returns to step 1, no inline editor"
    - "Stops were missing from the card-on-file confirmation email and from the confirmation page (PR #110)"
    - "Waiting display rule replaced by the owner (PR #107 then #108): the client sees one total, no separate waiting amount; wait options 0, 15 (free), 30, 45, 60, 90, 120"
    - "Pay-now one-way retry without stops left the earlier stops on the booking (found by the pass of 13:05Z, fixed by commit 2f8e0cd8)"
    - "Pay-now attempt re-posted as a round trip kept the stop of the earlier one-way attempt (found by the pass of 13:20Z, fixed by commit 3d33ad1b)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Wizard: stops on a transfer (desktop and phone width)"
    expected: "On a Prague transfer add 1..5 stops (the 6th is not offered), pick an address in each, remove one, move one up/down; the order in the list is the order drawn on the map with numbered markers and the km/min changes; a stop change clears the cached price and the promo and a new price is fetched"
    why_human: "Layout, reorder interaction, Google Places/Directions rendering"
    resolution: "Passed on production 2026-11-12 after PR #105 and #106 (91-UAT.md test 1). Not observed there: promo reset after a stop change, phone width"
  - test: "Wizard: waiting select and price (owner rule of 2026-11-12)"
    expected: "Without any waiting rate only 'No wait' and 15 min are offered. With rates the options are 0, 15 (labelled free), 30, 45, 60, 90, 120; 15 min costs nothing, 30 min costs one block, two stops of 15 min cost nothing; the client sees ONE total that includes the waiting and no separate waiting amount"
    why_human: "Visual price panel and the real /api/waiting-config + /api/calculate-price round trip in a browser"
    resolution: "Passed on production 2026-11-12 (quotes and options) and 2026-11-14 (new option list, one total on the vehicle step) (91-UAT.md test 2 and 'Owner changes'). Not observed there: step 6 summary as rendered, a class without a rate next to classes with one"
  - test: "Wizard: airport pickup landing + offset"
    expected: "Prague Airport as pickup turns date/time into landing date/time with an offset picker (0/15/30/45/60/90, default 30) and 'Your driver meets you at HH:MM'; next-day and DST dates give the right pickup; a non-airport pickup clears the landing"
    why_human: "UI copy, layout and the derived-pickup line in a real browser"
    resolution: "Passed on production 2026-11-12 (91-UAT.md test 3). Not observed there: phone width"
  - test: "Tamper check on a live checkout"
    expected: "A card-checkout request resent with distanceKm=1 and a changed isAirport stores the server distance and the quoted amount; a pickup that differs from landing + offset is refused"
    why_human: "Needs a real browser session against real Google Routes and creates a live Stripe object"
    note: "DEFERRED by the owner on 2026-11-14 to the first real card booking (91-UAT.md test 4, Deferred Follow-Ups). Not passed. Storage half seen once on the owner's canary PRG-20261114-59EC72 (server distance 183.324 km stored)"
  - test: "Admin > Pricing: waiting rate per class"
    expected: "A waiting-rate field per class: a positive number persists, empty saves NULL (not offered), 0 or text is rejected, saving other fields never clears a rate"
    why_human: "Form behaviour and persistence in the real admin"
    resolution: "Passed on production 2026-11-12 (91-UAT.md test 5): the owner set 7 / 20 / 10 EUR. Empty, zero and text cases are covered by tests only"
  - test: "Admin booking panel: Route section and trip edit"
    expected: "A booking with stops shows each stop in order with wait, paid blocks and the waiting total; an airport booking shows landing, pickup and offset; price edits of a booking with stops answer the set-price-by-hand message; a pickup that is not landing + an allowed offset is refused"
    why_human: "Panel layout across the list, the board and the calendar"
    resolution: "Passed on production 2026-11-12 on the TEST booking (91-UAT.md test 6), opened from the list only"
  - test: "Admin: Add extra charge modal (completed card booking under consent 2026-11-3)"
    expected: "The action appears only for such a booking; waiting mode shows minutes, blocks and the server amount; Other mode takes a description and an amount; the confirm step states amount, currency and the charge to the saved card; one request on a double click; the extra is listed in the panel afterwards"
    why_human: "Interaction and the money-confirm UX on a real completed card booking"
    note: "DEFERRED by the owner on 2026-11-14 to the first real card booking (91-UAT.md test 7). Not passed. Negative case seen: a manual booking shows no extra-charge action"
  - test: "Admin: Move pickup after a flight delay"
    expected: "'Move pickup...' takes a new landing, shows 'Move pickup to HH:MM' before anything is sent; landing and pickup move together, the audit shows readable rows, the calendar event moves, the client is mailed only when 'Notify client' is ticked"
    why_human: "Dialog UX, email delivery and the Google Calendar side effect"
    resolution: "Passed on production 2026-11-12 on the TEST booking (91-UAT.md test 8). Not observed: prefill from a flight estimate"
  - test: "Driver trip page and maps"
    expected: "A booking with 2 stops and an airport pickup shows Landing, Pickup, 'Free waiting until HH:MM' (60 min from the pickup), each stop with address and wait, no price or fee; the map goes through the stops in order"
    why_human: "Visual layout, Google Directions waypoints"
    resolution: "Passed on production 2026-11-12 on the TEST booking (91-UAT.md test 9). Not observed: a city pickup (30 minutes), a booking without stops"
  - test: "Emails, confirmation page and calendar as rendered"
    expected: "Client confirmation (pay-now and card flow) lists the stops with waits and the landing row and NO waiting amount (owner rule of 2026-11-12); the confirmation page lists the booked stops; driver mails show stops without money; the manager alert shows the waiting amount; the extra_charged receipt renders in every locale; the ops calendar event lists landing and stops"
    why_human: "Rendered HTML in real mail clients, translations read by a person, real Calendar event"
    note: "DEFERRED by the owner on 2026-11-14 to the first real card booking (91-UAT.md test 10). Not passed. PR #110 (stops in the card-flow mail and on the confirmation page) is live but has not been seen in a mailbox or on the page"
  - test: "Live Stripe: canary booking with a stop and a 1 EUR extra (plan 91-16 Task 3)"
    expected: "A separate PaymentIntent with kind card_extra, booking_extra_charges status charged, ledger admin_action then extra_charged, one receipt, booking payment state unchanged; a refund of it does not change the booking's own payment state"
    why_human: "Real Stripe, real card, real production data"
    note: "DEFERRED by the owner on 2026-11-14 (91-UAT.md test 11). Not passed. The owner's canary PRG-20261114-59EC72 was cancelled before completion; only its storage (one booking_stops row, server distance, consent 2026-11-3) was read from production"
  - test: "Live Stripe: decline, authentication-required, unconfirmed and resume paths of the extra charge"
    expected: "Declined and authentication-required cards end declined with the PaymentIntent cancelled; a lost answer leaves the row charging and resume asks Stripe first; a late success raises the operator alert and no second charge; the webhook finalises a charging row exactly once"
    why_human: "Depends on real Stripe timing and network behaviour (review CR-01 / WR-02)"
    note: "DEFERRED by the owner on 2026-11-14 (91-UAT.md test 12). Not passed"
  - test: "Wizard at phone width (stops, wait select, landing fields, vehicle step)"
    expected: "On a phone the stop rows with address, wait select and up / down / remove, the landing fields with the offset picker and the vehicle step with its bottom price bar are readable and usable"
    why_human: "Layout at a real phone width"
    note: "NOT OBSERVED on production (91-UAT.md tests 1 and 3 were run at desktop width only). Not passed"
  - test: "Promo reset after a stop change"
    expected: "With a promo code applied, adding, removing, changing or re-timing a stop clears the promo and the cached price; the next quote and the payment step show the price without the old promo"
    why_human: "End-to-end behaviour in the real wizard; the store rule is covered by tests/booking-store.test.ts only"
    note: "NOT OBSERVED on production (91-UAT.md test 1). Not passed"
  - test: "Step 6 summary after PR #108"
    expected: "On the payment step of a booking with paid waiting the summary shows one total that includes the waiting and no separate waiting amount"
    why_human: "Rendered summary on the real payment step; covered by tests/BookingSummaryBlock.test.tsx only"
    note: "NOT OBSERVED on production (91-UAT.md test 2 and 'Owner changes': the payment step was not reached). Not passed"
---

# Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees Verification Report

**Phase Goal:** Clients book transfers with intermediate stops and waiting time at a server-computed price, airport pickups are timed after landing, and the operator can bill waiting beyond what was booked.
**Verified:** 2026-11-14T13:30:00Z
**Status:** human_needed
**Re-verification:** Yes - full pass at 13:05Z against `origin/main` at 665cf0ff (PRs #105, #106, #107, #108, #110), then two passes on truth 6 only after the fix commits 2f8e0cd8 and 3d33ad1b on `docs/91-close` (13:20Z and 13:30Z)

The five roadmap success criteria hold in the code as it is now, and every UI must-have was traced from the component up to the page the user opens. The re-verification found one gap on a side path (the pay-now route did not replace the stored stops of an attempt when a later request of the same attempt had none); it was fixed in two commits and is now verified in code and tests on every branch of the route. No gap is open. The status is `human_needed` because eight human items are open: five deferred by the owner to the first real card booking and three that were never observed on production. None of them is passed.

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | SC1: a client can add intermediate stops on a transfer; the price is by distance through all stops, recomputed on the server; a tampered distance or price is ignored | VERIFIED | Mount chain: `app/[locale]/book/page.tsx:143` renders `BookingWizard`; `BookingWizard.tsx:234` step 1 is `EntryBar`; `EntryBar.tsx:294-306` renders `StopList` for `tripType === 'transfer'` with add / remove / update / wait / move bound to the store; a stop row without an address blocks the step (`EntryBar.tsx:125`). Store (`lib/booking-store.ts:105-141`): max 5, every stop change clears the cached price and the promo; round trip, hourly and daily clear the stops. Step 2 is `Step3Vehicle`: no inline editor any more, the four route-bar segments call `prevStep()` (`Step3Vehicle.tsx:90-92, 248-266`); the quote request forwards `intermediates` with `waitMinutes` in list order (`:98-117`). Server unchanged since the last report: `calculate-price` prices per km through the stops (no fixed route when stops exist), `lib/checkout/compute.ts` recomputes the distance through Google (503 `ROUTING_UNAVAILABLE`, client `distanceKm` never read, `STOPS_NOT_ALLOWED` outside a transfer), `lib/route-distance.ts` keeps the stop order. Both checkout bodies send the stops through `tripExtrasForBody` (`Step6CardOnFile.tsx:387, 878`, `Step6Payment.tsx:408`). Tests pass: EntryBar (add stop, sixth not offered, no stops UI on hourly / round trip), BookingWizard (step 1 mounts EntryBar), Step3Vehicle (intermediates forwarded; route bar returns to step 1 keeping stops, landing and pickup), calculate-price-stops, checkout-stops, route-distance, phase91-e2e (tampered distance ignored). Production UAT test 1 passed after #105 and #106 |
| 2 | SC2: the client chooses a waiting time per stop; the first 15 minutes are free, each further 15 minutes costs the admin fee, and the price the client sees includes it (owner rule of 2026-11-12: one total, no separate waiting amount) | VERIFIED (as amended by the owner) | `StopItem.tsx:26-29` options 0, 15, 30, 45, 60, 90, 120; the 15-minute option uses the 'free' label (`:116`); with no rate at all only 0 and 15 are offered and a stored longer wait is brought back to 15 (`:53-64`). `WaitSelector` is mounted because `EntryBar` passes `onWaitChange={setStopWait}`. Fee rules in `lib/stops.ts` (`waitingBlocks`, per stop, never pooled; `isValidStopWait` accepts 0..120 in 15-minute steps, so 90 and 120 pass the server). `calculate-price/route.ts:89-111, 307-311` adds the waiting to `base` and `total` of every class after the night / holiday / airport / minimum-fare adjustments; a class without a rate is listed in `waitingUnavailable` and `Step3Vehicle.tsx:177-208` shows it disabled with the note and unselects it. One total: no client component reads `waitingEur` (grep over `components/booking`: nothing); `StickyBookingPanel`, `PriceSummary` (mobile bar) and `BookingSummaryBlock` (step 6, mounted by `Step6Checkout`, `Step6CardOnFile`, `Step6Payment`) show `base + extras` only. Tests pass: StopItem (option list, free label, 75 moves up to 90), StickyBookingPanel ('shows only the price when the quote carries a waiting amount'), BookingSummaryBlock ('renders no waiting line'), stops-fee, calculate-price-stops. The amount is still shown to the operator: `components/admin/TripRouteSection.tsx:117` and the manager alert (`lib/email.ts:215-216`). Production UAT test 2 passed; the new rule was seen on production on the vehicle step on 2026-11-14 |
| 3 | SC3: airport pickup is set as landing + offset; the pickup is derived; the 60 free minutes count from the pickup; both times are stored and shown to the driver (Prague time, DST-safe) | VERIFIED | Mount chain: `EntryBar.tsx:111` `landingMode` (transfer or round trip with an airport origin) switches the date / time fields to the landing and renders `LandingPickupFields` (`:428`); the store derives the pickup from landing + offset (`booking-store.ts:148-160`) and drops the landing when the pickup leaves the airport. The second editor that changed the pickup without the landing is gone (PR #106). Server unchanged: `lib/airport-pickup.ts` (`LANDING_OFFSETS` 0/15/30/45/60/90, instant arithmetic), `compute.ts` `PICKUP_MISMATCH` / `LANDING_NOT_AIRPORT`, landing columns stored beside the pickup, driver page computes 'Free waiting until' from the pickup (`driver/trip/[token]/page.tsx:200-208`, `TripDetails.tsx:156-164`, mounted by `TripScreen.tsx:710`). Tests pass: EntryBar landing block (7 cases), landing-pickup-fields, airport-pickup (DST dates), checkout-landing, driver-trip, driver-trip-screen. Production UAT tests 3 and 9 passed |
| 4 | SC4: stops, waiting times and landing / pickup are saved with the booking and visible in admin, on the driver trip page and in the confirmation email | VERIFIED | Saved: `lib/payments/checkout.ts:208` (card and cash, always replace-all) and `create-payment-intent/route.ts:175, 185` (pay-now round trip and one-way, replace-all since commits 3d33ad1b and 2f8e0cd8, fail closed with 503 `STOPS_NOT_SAVED` when the request has stops). Admin: `TripRouteSection` in `BookingDetailPanel.tsx:223`, opened through `BookingPanelProvider` from the list, the board and the calendar (`BookingsWorkspace.tsx:348`). Driver: `loadStopsSafe` after the token check, no fee columns. Confirmation email, card-on-file flow (the flow real clients use): `lib/payments/emails/send.ts:204-228` reads the stored stops and the landing columns, `render.ts:691-713` prints the stop rows between From and To and the landing row above the date, never an amount; the stops are written at checkout before the client confirms the card, so they exist when the webhook sends the mail. Pay-now confirmation, driver assignment / accepted and manager alert: `lib/email.ts` rows (no amount for client and driver, amount in the manager alert). Confirmation page: `app/[locale]/book/confirmation/page.tsx:269-270, 518-532` lists the booked stops with their wait. Tests pass: payments-emails (stops in driving order, markup escaped, landing row, no rows without stops in every locale), email-trip-route, confirmation-page (stops listed; none without stops), checkout-stops-persist, booking-stops, trip-route-section, driver-trip, google-calendar-sync. Production: the owner's live booking PRG-20261114-59EC72 stored one `booking_stops` row and the server distance; UAT tests 6 and 9 passed. The mail and the page after #110 have not been seen rendered (deferred item 10) |
| 5 | SC5: the operator can charge waiting beyond the chosen wait (or other extras) to the saved card as a separate charge, amount from admin rates, recorded in the payment ledger, never for GNet | VERIFIED | No file of the extra engine changed since the last report (`git log --since` is empty for `lib/payments/extra.ts`, the `extra` route, `ExtraChargeModal.tsx`, `charge-events.ts`, `dispatch.ts`). Mount chain: `ExtraChargeModal` in `PaymentPanel.tsx:1154-1166` (only with the `charge_extra` action or an in-flight extra), `PaymentPanel` in `BookingDetailPanel.tsx:468`. Guards still in place: `isExtraChargeEligible` (`isPartnerBooking`, `anonymised_at`, `consentCoversExtras` with `EXTRAS_CONSENT_VERSIONS = {'2026-11-3'}`), `amount_changed` 409, separate `card_extra` PaymentIntent. Tests pass: extra-charge, extra-webhook, admin-extra-route, extra-charge-modal, phase91-e2e. Nothing of this has been exercised against live Stripe (deferred items 7, 11, 12) |
| 6 | 91-06 must-have: a retry of the same attempt replaces the stops, so the stored stops always equal the last priced request | VERIFIED | Every `captureUnpaidBooking` call site that captures an outbound row is followed by a stops write for the captured row: `lib/payments/checkout.ts:192-208` (card and cash), `create-payment-intent/route.ts:171-175` (pay-now round trip, clears with the empty list a round trip prices) and `:180-185` (pay-now one-way, which is also the path of hourly and daily). An empty capture (the booking is no longer unpaid) never touches the stops. The remaining pay-now branch without an attemptId inserts a new row and stops are refused there (400). Behavioral evidence, `tests/checkout-stops-persist.test.ts`: card 'retry without stops clears the stops of the earlier attempt'; pay-now 'a retry of the same attempt replaces the stops', 'a retry of the same attempt without stops clears the earlier stops (the price no longer includes them)', 'the same attempt re-posted as a round trip clears the stops of the earlier one-way attempt', 'no stops and the booking is already confirmed: its stored stops stay as they were'. All pass. Two extra probes (a transfer with a stop re-posted as hourly and as daily) also pass: 200, one booking, no stop rows. The two probes that failed in the earlier passes (one-way without stops, round trip) are now these real tests |

**Score:** 6/6 truths verified (0 present but behavior-unverified).

### Note on truth 2 (owner decision, not a gap)

ROADMAP SC2 ends with "and the price summary shows it" and 91-CONTEXT D-06 says the summary shows waiting "as its own line". The owner replaced that on 2026-11-12 (PR #108, recorded in `91-UAT.md` "Owner changes after the first run"): the client sees one total and no separate waiting amount; the admin panel and the manager alert keep the amount. The code and the tests follow the new rule and the truth was verified against it. No override entry was written for this, because the decision is the owner's and is already on record; if a strict paper trail is wanted, add an `overrides:` entry for SC2 or bring the wording of ROADMAP SC2 and D-06 in line.

### Advisory (New Scope, Unevidenced)

None. The one new finding of this re-verification (truth 6) had deterministic evidence, was reported as a gap and is closed.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `components/booking/EntryBar.tsx` | Public step 1 with stops and the airport landing | VERIFIED | Renders `StopList` and `LandingPickupFields`; mounted by `BookingWizard` on `/book` |
| `components/booking/StopList.tsx`, `StopItem.tsx`, `useWaitingConfig` | Stop rows, reorder, wait select | VERIFIED | Substantive; wait select bound to the store; options follow the owner rule |
| `components/booking/steps/Step3Vehicle.tsx` | Vehicle step without a second route editor | VERIFIED | Route bar returns to step 1; quote carries the stops; class without a rate disabled |
| `components/booking/StickyBookingPanel.tsx`, `PriceSummary.tsx`, `BookingSummaryBlock.tsx` | One total, no waiting amount | VERIFIED | No use of `waitingEur`; totals come from the server `base` that already includes waiting |
| `lib/payments/emails/render.ts`, `send.ts` | Stop rows and landing row in the card-on-file mails | VERIFIED | Data read from `booking_stops` and the landing columns; 8 locale files carry the labels (56 key hits) |
| `app/[locale]/book/confirmation/page.tsx` | Booked stops on the confirmation page | VERIFIED | Reads the stops from the wizard store snapshot taken before the reset |
| `app/api/create-payment-intent/route.ts` | Pay-now stores stops, fail closed | VERIFIED | One-way (also hourly, daily) and round trip replace the stops of the captured row on every request; fails closed with 503 `STOPS_NOT_SAVED` when a request with stops cannot be stored |
| Server pricing, checkout, landing, migration 089, extra engine, admin panel, driver page | As in the report of 2026-11-12 | VERIFIED | Unchanged since then except `lib/email.ts` (waiting amount removed from the client rows); all their tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `/book` page | `StopList` | `BookingWizard` step 1 -> `EntryBar` | WIRED | The link the code-level verification of 2026-11-12 missed; now checked file by file |
| `EntryBar` | booking store | `addStop` / `removeStop` / `updateStop` / `setStopWait` / `moveStop`, landing setters | WIRED | Each stop change clears price and promo |
| `Step3Vehicle` route bar | step 1 | `prevStep()` | WIRED | No other route editor on step 2 |
| `Step3Vehicle` | `/api/calculate-price` | `intermediates` with `waitMinutes` | WIRED | Response `waitingUnavailable` drives the disabled class |
| Wizard store | checkout bodies | `tripExtrasForBody` | WIRED | Card, cash and pay-now |
| Checkout capture | `booking_stops` | `saveBookingStops` | WIRED | Card, cash, pay-now one-way and pay-now round trip all replace the stops of the captured row |
| `booking_stops` + landing columns | card-on-file mails | `emailVarsFromRow` -> `loadStopsSafe` | WIRED | Added by PR #110 |
| Wizard store snapshot | confirmation page | `storeRef.current.stops` | WIRED | Transfers only; stops without an address skipped |
| Stored stops | admin panel, dispatch, driver page, legacy mails, calendar | `attachStops` / `loadStopsSafe` | WIRED | Unchanged |
| `PaymentPanel` | `ExtraChargeModal` -> `POST /extra` -> `card_extra` webhook | `charge_extra` action | WIRED | Unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Vehicle cards and price panels | `priceBreakdown[class].base` | `/api/calculate-price` (Google distance through the stops + admin waiting rate) | Yes | FLOWING |
| Wait select options | `offeredClasses` | `/api/waiting-config` (admin pricing config) | Yes | FLOWING |
| Card-on-file mail stop rows | `vars.stops`, `vars.landing` | `booking_stops`, `bookings.landing_*` | Yes | FLOWING |
| Confirmation page stop lines | `bookedStops` | persisted wizard store (the same stops that were sent to the checkout) | Yes | FLOWING |
| Admin Route section, driver page | `booking.stops`, landing columns | `booking_stops`, bookings row | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Files changed after the last report (wizard, panels, mails, confirmation page, copy) | `npx vitest run` on EntryBar, Step3Vehicle, StickyBookingPanel, PriceSummary, BookingSummaryBlock, StopItem, confirmation-page, email-trip-route, payments-emails, wizard-stops-copy, BookingWizard, landing-pickup-fields, use-waiting-config | 13 files, 952 passed, 21 todo | PASS |
| Server, admin, driver and extra-charge tests of the phase | `npx vitest run` on calculate-price-stops, checkout-stops, checkout-stops-persist, checkout-landing, route-distance, airport-pickup, stops-fee, booking-stops, phase91-e2e, extra-charge, extra-webhook, admin-extra-route, extra-charge-modal, admin-landing-route, landing-change, move-pickup-dialog, trip-route-section, driver-trip, driver-trip-screen, migration-089, waiting-config, pricing-form-waiting, admin-pricing, admin-bookings, google-calendar-sync, driver-accept-email, book-page-render | 27 files, 938 passed | PASS |
| Stops replace on every pay-now retry (the two earlier failing probes, one-way without stops and re-post as a round trip, are now real tests) | `npx vitest run tests/checkout-stops-persist.test.ts tests/booking-stops.test.ts tests/phase91-e2e.test.ts tests/create-payment-intent.test.ts tests/checkout-stops.test.ts` after commit 3d33ad1b | 5 files, 134 passed, 5 todo | PASS |
| A pay-now transfer with a stop re-posted as hourly and as daily leaves no stop rows (probe, temporary copy of `tests/checkout-stops-persist.test.ts` with two added cases, deleted after the run) | `npx vitest run tests/zz-probe-paynow-types.test.ts -t "PROBE pay-now retry as"` | 2 passed | PASS |
| Type check | `npx tsc --noEmit` | 8 errors, all in `tests/` (baseline) | PASS |
| Debt markers in the source changed after the last report | grep TBD / FIXME / XXX / TODO / HACK | none | PASS |
| Removed flat stop fee | grep `EXTRA_STOP_PRICE`, `extraStops` in app, lib, components | none | PASS |

The full suite was not run in this pass (worktree with a linked `node_modules`; seven files that mock `next-intl` server modules do not load there, a known artefact).

### Probe Execution

Step 7c: SKIPPED - no probe scripts are declared by any plan of this phase.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| STOP-01 | 91-09, 91-10, 91-13, 91-16, 91-17 | Client can add intermediate stops on a transfer | SATISFIED | Truth 1; stops UI on the real step 1; production UAT test 1 |
| STOP-02 | 91-02, 91-04 | Price by distance through all stops, recomputed on the server | SATISFIED | Truth 1; phase91-e2e; server distance stored on the owner's live booking |
| STOP-03 | 91-01, 91-02, 91-03, 91-04, 91-09, 91-17 | Waiting per stop, 15 minutes free, fee from admin | SATISFIED | Truth 2 (display rule as amended by the owner) |
| STOP-04 | 91-01, 91-06, 91-10, 91-12, 91-13, 91-14 | Stops saved and visible in admin, driver page, emails | SATISFIED | Truths 4 and 6 |
| STOP-05 | 91-01, 91-07, 91-10, 91-12, 91-13, 91-14, 91-15, 91-17 | Airport pickup after landing, free wait from the pickup, both times stored and shown | SATISFIED | Truth 3 |
| EXTRA-01 | 91-01, 91-05, 91-08, 91-11, 91-16 | Operator extra charge to the saved card | SATISFIED in code, live proof deferred | Truth 5; human items 7, 11, 12 |

No orphaned requirement. Bookkeeping left for the orchestrator: REQUIREMENTS.md still shows the six IDs unticked and `Pending`; ROADMAP shows 16/17 plans with 91-16 unticked.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `app/api/create-payment-intent/route.ts` | 175, 185, 187-207 | A failed clear on a request without stops is logged and the payment continues | Warning | Deliberate and commented; after a database error on the delete the booking could keep earlier stops with no operator alert |
| `components/booking/BookingSummaryBlock.tsx` | 40-41 | Comment still describes the removed waiting line ('shown as its own line') | Info | Misleading comment only |
| `messages/*.json` | `waitingLine` (2 keys per locale) | Message keys no longer used by any component | Info | Dead copy |
| `91-CONTEXT.md` D-06, ROADMAP SC2 | - | Wording still describes the separate waiting line | Info | Paper trail differs from the owner rule of 2026-11-12 |
| `supabase/migrations/` | - | Two files share the prefix 089 | Warning (carried from 2026-11-12) | Next migration must be 090 or higher |
| `91-UAT.md` | tests 4, 7, 10, 11, 12 | Skip reasons now start with 'Deferred follow-up:' (changed by the orchestrator after the first pass) | Info | `gsd-tools phase uat-passed 91` no longer counts the five as blockers; they stay deferred, not passed |

Open review info items recorded in `91-REVIEW-DISPOSITION.md` are unchanged (IN-02, IN-04, IN-06, IN-07, IN-09).

### Human Verification Required

Fifteen items are in the frontmatter. Seven were done on production on 2026-11-12 and 2026-11-14 and are recorded with a `resolution` (details and what was not observed are in `91-UAT.md`). Eight are open and NOT passed: five deferred by the owner's decision of 2026-11-14 to the first real card booking (1 to 5 below) and three never observed on production (6 to 8 below).

### 1. Tamper check on a live checkout (UAT test 4)

**Test:** Resend the card-checkout request with `distanceKm=1` and a changed `isAirport`; send a pickup that differs from landing + offset.
**Expected:** The server distance and the quoted amount are stored; the differing pickup is refused.
**Why human:** Creates a live booking and a live Stripe object.

### 2. Add extra charge modal (UAT test 7)

**Test:** On a completed card booking under consent 2026-11-3 open 'Add extra charge...', try waiting mode and Other mode, confirm, double click.
**Expected:** Server amount shown, one request, the extra listed in the panel.
**Why human:** Needs a completed real card booking.

### 3. Emails, confirmation page and calendar as rendered (UAT test 10)

**Test:** Make a booking with a stop and look at the confirmation mail, the confirmation page, the driver and manager mails, the extra_charged receipt and the ops calendar event.
**Expected:** Stops with waits and the landing row, no waiting amount for the client, the amount in the manager alert.
**Why human:** Rendered output in real clients; PR #110 has not been seen in a mailbox or on the page yet.

### 4. Live Stripe extra charge proof (UAT test 11)

**Test:** A small 'Other' extra on the owner's own booking (or with the client's agreement), refunded at once.
**Expected:** `card_extra` PaymentIntent, `booking_extra_charges` charged, ledger `admin_action` then `extra_charged`, one receipt, booking payment state unchanged.
**Why human:** Real card and production data.

### 5. Extra charge failure paths (UAT test 12)

**Test:** Declined card, authentication required, lost answer and resume, late success.
**Expected:** As listed in the frontmatter.
**Why human:** Cannot be forced with a live card; watch the first real cases.

### 6. Wizard at phone width (not observed)

**Test:** Open `/book` on a phone: add stops, choose a wait, set an airport landing, go to the vehicle step.
**Expected:** Stop rows, the wait select, the landing fields and the bottom price bar are readable and usable.
**Why human:** Layout at a real phone width; production runs were at desktop width only.

### 7. Promo reset after a stop change (not observed)

**Test:** Apply a promo code, go back, add or change a stop, return to the payment step.
**Expected:** The promo and the cached price are cleared and the new price carries no old promo.
**Why human:** End-to-end behaviour in the real wizard; only the store rule is tested (`tests/booking-store.test.ts`).

### 8. Step 6 summary after PR #108 (not observed)

**Test:** Reach the payment step with a stop that has paid waiting.
**Expected:** One total that includes the waiting, no separate waiting amount.
**Why human:** Rendered summary on the real payment step; covered by `tests/BookingSummaryBlock.test.tsx` only.

### Gaps Summary

No open gap. The one gap this re-verification found had one root cause: the pay-now route (`app/api/create-payment-intent/route.ts`) did not replace the stored stops of an attempt when a later request of the same attempt had none, so a client who removed every stop, or turned the trip into a round trip, kept the removed stop on the booking. Commit 2f8e0cd8 fixed the one-way branch and commit 3d33ad1b the round-trip branch; every capture of an unpaid outbound row is now followed by a replace of its stops, and the cases are pinned by tests.

Everything the phase promised is in the code and on the page the user opens. The remaining risk is what has not been exercised live: the extra charge against real Stripe and the mails as rendered, which the owner chose to check on the first real card booking, and the three items never seen on production.

The Closing note below was written on 2026-11-14 before this re-verification and is kept as it was. The verifier's status for this report is `human_needed`: no gap is open, and eight human items are open (five deferred by the owner, three never observed), none of them passed. Setting the status to `passed` is the owner's recorded decision that the note describes, not a finding of this verification.

---

_Verified: 2026-11-14T13:30:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Closing note (2026-11-14)

Human verification ran on production on 2026-11-12 and 2026-11-14 (`91-UAT.md`): 7 of 12 items passed, and it found four gaps that the code-level verification above had missed, all fixed and live:

- the stops UI was not mounted on the public wizard (PR #105);
- the vehicle step had a second route editor without stops that broke the landing / pickup pair (PR #106);
- stops were missing from the card-on-file confirmation email and from the confirmation page (PR #110);
- the desktop waiting line (PR #107), later removed on the owner's decision that the client sees one total (PR #108, with the new wait options).

Five items need a completed real card booking (extra charge modal, rendered emails, checkout tamper check, live Stripe proof and its failure paths). The owner closed the phase on 2026-11-14 and deferred them to the first real booking; they are listed in `91-UAT.md` Deferred Follow-Ups. Status is set to passed on that recorded owner decision, not on new evidence.

Lesson recorded for later phases: a must-have about UI needs the name of the component the page really renders and a test that mounts the real parent.
