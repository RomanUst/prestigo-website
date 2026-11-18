---
phase: 93-day-trips-custom-tours
plan: 18
subsystem: tours-checkout-ui
tags: [tours, checkout, card-payment-stage, pickup-refusal, confirmation-snapshot]
requires: ["93-17", "93-03", "93-12"]
provides:
  - "app/[locale]/book/tour/page.tsx: noindex dynamic server page of the tour checkout (missing-query and tour-unavailable states)"
  - "components/tours/TourCheckout.tsx: two-stage client checkout on its own state (Stage A details -> init -> Stage B CardPaymentStage)"
  - "components/tours/TourTripSummary.tsx: collapsible (below 1024px) / sticky (from 1024px) trip summary"
  - "components/tours/PickupRefusalPanel.tsx: PickupRefusalPanel + GuidancePanel (role=status, copper)"
  - "lib/tours/confirmation-snapshot.ts: writeTourConfirmation, readTourConfirmation, TourConfirmationSnapshot"
  - "CardPaymentStage optional onAmountChange prop"
affects: ["93-19+ confirmation page (reads readTourConfirmation)"]
tech-stack:
  added: []
  patterns:
    - "Tour checkout owns its state and attempt id; never imports the wizard store"
    - "Client pickup check (checkTourPickup) is UX only; server init reason codes drive the same panel"
key-files:
  created:
    - app/[locale]/book/tour/page.tsx
    - components/tours/TourCheckout.tsx
    - components/tours/TourTripSummary.tsx
    - components/tours/PickupRefusalPanel.tsx
    - lib/tours/confirmation-snapshot.ts
    - tests/tour-checkout.test.tsx
  modified:
    - components/booking/CardPaymentStage.tsx
decisions:
  - "Own init fetch (postInit) in TourCheckout instead of fetchCardInit: fetchCardInit collapses every failure to null and drops reason, but the tour states need the reason code and network vs server"
  - "Stage B heading is Booking.step6.securePaymentLabel (existing key in all locales); no new message keys were added"
  - "'Message us' link on the too-late panel reuses Footer.contactHeading and points at /contact"
  - "freeCancelHours is not a prop: the policy always comes from the init answer, so the page does not pass it"
status: complete
commits: 3
plan_head_before: 6ae92cbba366f9b7700fe7aceddf7dd6133d3622
plan_head_after: d2623a1d7b9e72405a993c54a33ea30fd71ca8f5
actuals:
  tokens: 24000
  tasks: 3
  commits: 3
metrics:
  completed: 2026-11-18
---

# Phase 93 Plan 18: Tour checkout (/book/tour) Summary

A visitor arrives from the tour page with six validated query values, enters a Prague pickup and contact details, continues to `/api/card-checkout/init` (tripType `tour`, no amount) and lands in the shared card / cash payment stage with the server amount and the tour terms; every refusal and error has a state that says what to do next.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 (tracer) valid query -> details -> init -> mounted payment stage | 5f3530fd | server page, TourCheckout, TourTripSummary, tests |
| 2 pickup refusal panel and every state | 2addd200 | PickupRefusalPanel, init reasons, errors, page states, onAmountChange |
| 3 confirmation snapshot and way back | d2623a1d | confirmation-snapshot, onConfirmed wiring, Change trip details |

## What was built

- Server page: `params.locale` + `setRequestLocale`, `robots: noindex`, query parsed with `parseTourCheckoutQuery`, tour via `getPublishedTourForLocale` (published and complete in the locale), client fare via the shared `tourFare`. Invalid query (or a car that cannot seat the party) shows "We could not find your trip details"; unknown, unpublished, incomplete-locale or unpriced tour shows "This day trip is not available" with both buttons.
- TourCheckout: pickup (AddressInputNew), names, email, phone (E.164 normalised), wishes (maxLength 1000, counter from 900). "Continue to payment" validates, posts the init body of the plan interface (no amount key) with an attempt UUID, shows "Checking..." with `aria-busy`, then collapses Stage A and focuses the Stage B heading. "Edit details" unmounts Stage B; continuing calls init again. `onInvalidPhone` reopens Stage A and focuses the phone field.
- Refusals: client `checkTourPickup` (radius prop) and server `PICKUP_OUT_OF_AREA` / `AIRPORT_PICKUP` show the same copper panel with a prefilled custom-tour link; Continue stays blocked; choosing a valid address removes it. `LEAD_TIME` shows the "closes {hours}" text (hours from `MIN_BOOKING_LEAD_MS`), plain `{ eligible: false }` the booking-off text, `TOUR_UNAVAILABLE` the unavailable text. Fetch rejection and 5xx show `role="alert"` messages above the button ("Nothing was charged" for the server error), typed values kept.
- Summary: date, start (Prague time), passengers, car, time at the destination (included + extra), pickup and return (once chosen), "Total per car" (client fare before init, server amount after, updated on a 409 PRICE_CHANGED). "Change trip details" links to `/services/<slug>#book` and refreshes `tour-box:<slug>` with the current choices.
- Confirmation snapshot: `onConfirmed` writes `tour-confirmation:<ref>` (ref, title, date, time, pickup address, car, hours included and extra, card / cash, amount label) before the stage navigates; `readTourConfirmation` validates every field and returns null for another ref or a tampered value. No name, email or phone is stored.

## Verification

- `npx vitest run --exclude '.claude/**' tests/tour-checkout.test.tsx tests/card-payment-stage.test.tsx tests/card-checkout-tour.test.ts`: 3 files, 64 tests passed (tour-checkout: 41 cases incl. LEAD_TIME, airport, "Nothing was charged").
- Also green: Step6CardOnFile, Step6Payment, payments-engine-gates, confirmation-page-i18n, quote-accept-pay (CardPaymentStage touched).
- `npx tsc --noEmit`: 8 errors, all the old `tests/` baseline. `npx eslint --quiet` clean on components/tours, the page, the snapshot lib, CardPaymentStage and the test. No euro literal in the new app / components files. `booking-store` appears in none of the checkout files (asserted by a test).
- Not done here (orchestrator): browser check of `/book/tour` at 320 / 1024px and in `ar`; E12 human-check (Places script blocked); a live card / cash booking with a real published tour. The local Stripe key is a dead placeholder.

## Deviations from Plan

**1. [Rule 3 - Blocking] Own init fetch instead of `fetchCardInit`**
- `fetchCardInit` returns null for any failure and drops `reason`, so it cannot tell "network" from "server" or carry `LEAD_TIME` / `PICKUP_OUT_OF_AREA`. `postInit` in TourCheckout reuses `parseInitPolicy` and returns a discriminated result. `cardCheckoutApi.ts` is untouched.

**2. [Rule 2 - Missing critical] `onAmountChange` on `CardPaymentStage`**
- UI-SPEC 4.5 says the summary total updates after a 409 PRICE_CHANGED, but the stage keeps that patch internal. Added an optional, additive prop called from `handleServerPatch` (file outside the plan's list; wizard behaviour unchanged, its tests pass).

**3. Plan said `freeCancelHours` is a prop.** It is not passed: the free-until moment and hours come only from the init policy the stage already renders.

## Known Stubs

None.

## Deferred / notes for the orchestrator

- **Wishes length:** the field allows 1000 characters (UI-SPEC), but `lib/checkout/compute.ts` `buildCheckoutMeta` clamps `specialRequests` to `.slice(0, 490)` before storing, so text past 490 characters is dropped server-side. Out of this plan's files; raise or tour-scope that clamp in a later plan if 1000 must be stored.
- The `Contact` link text on the too-late panel is `Footer.contactHeading`; replace it if a dedicated "message us" key is added.
- The confirmation page (later plan) should call `readTourConfirmation(ref)`; the snapshot is not one-shot (a reload keeps showing the trip).

## Threat Flags

None beyond the register. T-93-49 (client check is UX; server refuses), T-93-50 (no amount in init or intent body, asserted by test), T-93-51 (snapshot has only what the confirmation shows, validated on read, tested), T-93-52 (no change to the Origin list).

## Self-Check: PASSED

- FOUND: app/[locale]/book/tour/page.tsx, components/tours/TourCheckout.tsx, components/tours/TourTripSummary.tsx, components/tours/PickupRefusalPanel.tsx, lib/tours/confirmation-snapshot.ts, tests/tour-checkout.test.tsx
- FOUND commits 5f3530fd, 2addd200, d2623a1d
