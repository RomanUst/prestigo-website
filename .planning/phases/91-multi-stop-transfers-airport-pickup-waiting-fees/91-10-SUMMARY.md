---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 10
subsystem: booking-wizard
tags: [airport-pickup, landing, stops, checkout, zustand, next-intl]
requires: [91-04, 91-07, 91-09, 91-17]
provides:
  - store fields landingDate / landingTime / pickupOffsetMin and setLandingDate / setLandingTime / setPickupOffset
  - components/booking/LandingPickupFields.tsx
  - tripExtrasForBody (shared stops + landing body builder)
  - isAirportPickupPlace (client copy of the server airport-pickup rule, in types/booking.ts)
  - waiting line in BookingSummaryBlock
affects: [Step 2, EntryBar, card/cash checkout, pay-now checkout, Step 6 summary]
tech-stack:
  added: []
  patterns: [one shared body helper for both payment flows, store-derived pickup from landing]
key-files:
  created:
    - components/booking/LandingPickupFields.tsx
    - tests/landing-pickup-fields.test.tsx
  modified:
    - lib/booking-store.ts
    - types/booking.ts
    - components/booking/EntryBar.tsx
    - components/booking/steps/Step2DateTime.tsx
    - components/booking/steps/cardCheckoutApi.ts
    - components/booking/steps/Step6Payment.tsx
    - components/booking/BookingSummaryBlock.tsx
    - tests/booking-store.test.ts
    - tests/EntryBar.test.tsx
    - tests/Step2DateTime.test.tsx
    - tests/Step6CardOnFile.test.tsx
    - tests/Step6Payment.test.tsx
    - tests/BookingSummaryBlock.test.tsx
decisions:
  - "Landing mode = tripType transfer/round_trip AND server isAirportPickup(origin); hourly/daily never show or send a landing (server answers 400 LANDING_NOT_ALLOWED to them)"
  - "isAirportPickupPlace lives in types/booking.ts (next to isAirportPlace), not lib/booking-store.ts, because several tests replace the whole '@/lib/booking-store' module"
  - "Clearing a landing field clears the derived pickup, so a stale pickup never travels without its landing"
  - "tripExtrasForBody re-derives pickupDate/pickupTime from landing + offset and overrides the body pickup, so the wizard can never send a pickup that differs from landing + offset"
status: complete
metrics:
  completed: 2026-11-12
commits: 2
plan_head_before: d7533483c4e2dc329d7dba47472bc87f1e23d932
plan_head_after: 94be87faa5b061fe633a982123bf1fa3f5852a2c
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
---

# Phase 91 Plan 10: Landing pickup and checkout bodies Summary

The wizard books an airport pickup by landing date and time plus an offset (0/15/30/45/60/90 min, default 30), shows "Your driver meets you at HH:MM" (with the date past midnight), and both payment flows send the stops and landing strings the server validates; Step 6 shows the "Waiting at stops" line from the server `waitingEur`.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | Store landing fields + LandingPickupFields + EntryBar landing mode + card/cash body | 13936400 |
| 2 | Step 2 landing mode, Step6Payment body, Step 6 waiting line, edge cases | 94be87fa |

Tracer proof: with the airport as origin, landing 14:00 + offset 30 sets `pickupTime` 14:30 in the store; `buildCardCheckoutBody` sends `landingDate`, `landingTime '14:00'`, `pickupOffsetMin '30'`, `pickupTime '14:30'` and the placed stops (tests in `tests/booking-store.test.ts`, `tests/EntryBar.test.tsx`, `tests/Step6CardOnFile.test.tsx`).

## What changed

- Store: `setLandingDate` / `setLandingTime` / `setPickupOffset` derive `pickupDate` / `pickupTime` via `pickupFromLanding` (Prague, DST-safe: 01:50 + 30 on 2027-03-28 gives 03:20; 23:50 + 30 gives 00:20 next day). `setOrigin` and `swapOriginDestination` clear the landing when the new pickup is not an airport and keep the pickup as entered. The three fields are persisted and reset.
- `LandingPickupFields`: offset select from `LANDING_OFFSETS` and the derived pickup line; all text from `Booking.landing.*`.
- `EntryBar` / `Step2DateTime`: labels, values and setters switch to landing ones in landing mode; required-field validation runs on the landing fields; in the entry bar the 12 h lead rule is evaluated on the pickup each landing slot would produce.
- `tripExtrasForBody` (in `cardCheckoutApi.ts`): stops for a transfer only (placed stops only, key omitted when empty); landing strings plus the derived pickup only for transfer / round trip with an airport pickup and a complete landing. Used by `buildCardCheckoutBody` and the `Step6Payment` body.
- `BookingSummaryBlock`: "Waiting at stops +amount" line from the selected class `waitingEur` when above 0; total unchanged.

## Deviations from Plan

**1. [Rule 1 - Bug] Landing only for transfer / round trip.** The plan gated the landing on the airport rule only, but the server (`lib/checkout/compute.ts`) answers 400 `LANDING_NOT_ALLOWED` for hourly / daily. The UI and body gate on trip type too. Files: EntryBar, Step2DateTime, cardCheckoutApi.

**2. [Rule 3 - Blocking] `isAirportPickupPlace` placed in `types/booking.ts`**, not the store, because `Step6CardOnFile` / `Step6Payment` tests replace `@/lib/booking-store` with a stub exporting only `useBookingStore`.

**3. Store mocks in `Step6CardOnFile.test.tsx` / `Step6Payment.test.tsx`** gained `stops`, `landingDate`, `landingTime`, `pickupOffsetMin` (existing tests encoding the old store shape, updated in the same task).

**4. Step 2 lead-time rule** is left on the landing date/time (stricter than needed by at most the offset, never looser), instead of re-deriving per hour/minute cell.

## Deferred / notes

- Pay-now path: the new server codes `STOPS_NOT_ALLOWED`, `LANDING_NOT_ALLOWED`, `LANDING_NOT_AIRPORT`, `PICKUP_MISMATCH` fall back to the generic init-failure text, because `Booking.step6.errors.*` has no keys for them and this plan may not edit `messages/*.json`. The wizard cannot produce those cases through the UI.
- The plan's "409 PRICE_CHANGED" handling exists only in the card flow (`Step6CardOnFile`); the test asserts it for a body with stops there. The pay-now flow has no PRICE_CHANGED path (the server prices in the intent itself).
- Full suite: 13113 passed; failures are the 7 known next-intl ERR_MODULE_NOT_FOUND files (symlinked `node_modules` artefact) plus `seo-volume-pages > sitemap`, which is unrelated and passes when run alone (flaky under the full run).
- `tsc`: only the 8 baseline errors in `tests/`. `eslint --quiet` clean on all changed files. No browser check was possible in this agent (no preview tool).

## Known Stubs

None.

## Threat Flags

None. T-91-34 mitigated: same `isAirportPickup` gate as the server, stops only for a transfer; the server stays the authority.

## Self-Check: PASSED

- components/booking/LandingPickupFields.tsx and tests/landing-pickup-fields.test.tsx exist.
- Commits 13936400 and 94be87fa exist on the worktree branch.
