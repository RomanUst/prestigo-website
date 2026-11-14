# Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees - Research

**Researched:** 2026-11-11
**Domain:** server-authoritative pricing (Google Routes with intermediates), Next.js booking wizard, Supabase schema, Stripe off-session charges
**Confidence:** HIGH on repo facts and Google/Stripe mechanics, MEDIUM on the consent/legal and flight-delay policy items (see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (roadmap / prior phases, not re-asked)**
- The server is the price authority: distance through all stops is recomputed on the server; a `distanceKm` or price sent by the browser is ignored. This closes the current gap where `distanceKm` is trusted from the client. Security work: tests, `security:` commit prefix.
- First 15 minutes of waiting at each stop are free; each further 15 minutes costs a fee set in admin; billed per started 15-minute block (v5.0 research, FEATURES.md § E).
- Pre-selected waiting is part of the booking total, so it is inside the card hold. Anything beyond it is a separate off-session charge on the saved card (a hold cannot grow), recorded in the payment ledger, operator-approved, never automatic, never for GNet.
- Airport free waiting stays 60 minutes and city 30 minutes, from the live settings `noshow_wait_airport_min` / `noshow_wait_city_min` (Phase 89). For an airport pickup the 60 minutes count from the pickup time, not the landing time.
- All times are Prague time, DST-safe (same helpers and DST test dates as Phase 90).
- No hard-coded prices in `app/` or `components/`; every rate comes from admin (`pricing_globals` / pricing config).
- New client-facing strings need real translations in all 7 locales.
- The operator's extra-charge action lives in the shared booking panel from Phase 90 (`BookingDetailPanel`).
- Expected migration `booking_stops`, waiting rates in pricing globals, separate landing and pickup times. The roadmap says 087; the next free number is 084 (migrations 081–083 are the latest live) — the planner uses the next free number.

**Price with stops**
- **D-01:** When a transfer has at least one stop, the price is recalculated by kilometres through all points (origin → stops in order → destination) at the per-km tariff. A fixed route price from admin is not used for a trip with stops. Owner's words: "пересчитываются км и плата за остановку в зависимости сколько времени остановка". Confirmed by the owner on 2026-11-11: the whole trip by km, not "fixed price + detour". — **Reversibility:** costly.
- **D-02:** There is no flat fee per stop. A stop costs only its extra kilometres plus paid waiting by duration. The existing flat `extraStops × EXTRA_STOP_PRICE` add-on in `app/api/calculate-price/route.ts` is replaced by this model for transfers.
- **D-03:** A transfer without stops is priced exactly as today (fixed route price where one exists).

**Waiting fee**
- **D-04:** The waiting fee per extra 15 minutes is set per vehicle class in admin (Business, First Class, Business Van), next to the hourly rates.
- **D-05:** Until a class has a rate set, paid waiting is not offered for that class (the client can only keep the free 15 minutes). No default amount is typed into code or a migration.
- **D-06:** The client picks the waiting time per stop in 15-minute steps; the price summary shows waiting as its own line.

**Airport pickup**
- **D-07:** For an airport pickup the client enters the landing time and picks an offset: pickup 0 / 15 / 30 / 45 / 60 / 90 minutes after landing, default 30. Both the landing time and the resulting pickup time are stored and shown to the driver, in admin and in the confirmation email.
- **D-08:** When the flight is delayed and the landing time changes, the pickup time moves with it (landing + offset).

**Extra charge after the trip (EXTRA-01)**
- **D-09:** In the booking panel the operator can add: (a) extra waiting — enters minutes, the amount is computed from the class rate in admin; (b) "other" — a description and an amount typed by hand (parking, extra km).
- **D-10:** The charge goes to the saved card as a separate off-session payment, is written to the payment ledger, and the client gets an email with the breakdown. The operator sees the amount and confirms before anything is charged.

### Claude's Discretion
- Maximum number of stops (research suggests 5; keep the Google Routes Essentials SKU) and the maximum waiting per stop.
- Airport detection (which addresses count as an airport pickup) — reuse `isAirportPickup` where it fits.
- Stop UI in the booking wizard (add, reorder, remove), map rendering of the route through stops, mobile layout.
- Where the paid-waiting line and the stop list appear in admin, on the driver trip page and in emails.
- Limits and safeguards on the "other" amount (upper bound, double-submit guard, idempotency key), and what happens when the off-session charge fails (surface to the operator, no retry loop).
- Rounding of the recomputed price (reuse the existing rounding).

### Deferred Ideas (OUT OF SCOPE)
- Overage suggestion from driver stop timestamps (driver taps "arrived at stop" / "left stop") — needs new driver steps; the operator enters minutes by hand in this phase.

Also out of scope (CONTEXT.md domain): stops for hourly / daily bookings, stops inside quotes (Phase 92) or day trips (Phase 93), any change to GNet bookings.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STOP-01 | Client can add intermediate stops when booking a transfer | Stop UI already exists (`StopList`/`StopItem`, store `stops`, cap 5) but stops are never sent to checkout nor saved; see "Current state" and Plans 03/05 |
| STOP-02 | Price is calculated by distance through all stops, recomputed on the server | Shared server route-distance module with Google Routes `intermediates`, wired into `priceCheckout`; closes client-trusted `distanceKm` (Pitfalls 1-3, Security Domain) |
| STOP-03 | Client chooses a waiting time per stop; 15 min free, then a fee set in admin | Pure fee function (per started 15-min block), `pricing_config.waiting_rate_per_15min` per class, own price-summary line |
| STOP-04 | Stops and waiting saved with the booking; visible in admin, driver page, emails | `booking_stops` table + landing columns; display-surface inventory in Architecture (admin panel, driver page, 4 email builders, calendar) |
| STOP-05 | Airport pickup: landing time + offset, free wait counts from pickup, both times stored and shown to driver | `landing_date/landing_time/pickup_offset_min` columns; `pickup_*` stays the operational instant so hold/cancel/no-show/calendar/dispatch need no change |
| EXTRA-01 | Operator charges waiting beyond the chosen wait (or other extras) to the saved card as a separate charge | New `booking_extra_charges` table + `lib/payments/extra.ts` modelled on `fee.ts`/`settle.ts` keys, ledger kinds, webhook routing for `card_extra`, panel modal, localized email |
</phase_requirements>

## Summary

Three facts shape this phase. (1) The wizard already has most stop UI, but it is half-wired: `StopList`/`StopItem` exist, the Zustand store holds `stops` (cap 5), and `Step3Vehicle.fetchPrice` already sends `intermediates` to `/api/calculate-price`, which already forwards them to Google Routes — yet the per-stop wait selector is display-only local state, and neither checkout body builder (`buildCardCheckoutBody`, `Step6Payment`) sends stops, so a booking today is priced with a client-supplied `distanceKm` that happens to include the detour, while the stops themselves are never saved. (2) The server never recomputes distance at checkout: `checkoutBookingSchema` accepts `distanceKm` as a client string and `priceCheckout` prices it as-is; `isAirport` is also client-supplied at checkout. Fixing this means a shared server-side Google Routes call inside `priceCheckout` (one change point for the pay-now, card and cash flows), plus returning the server distance so cancellation-policy evaluation and the stored `distance_km` stop using the client value. (3) Money for EXTRA-01 cannot reuse the fee-case table (one case per booking, UNIQUE) nor `settleBooking` (it drives `payment_state`); it needs its own small engine that copies the fee engine's discipline (admin_action ledger row first, locked amount, deterministic Stripe key from row id + attempt, no automatic retry) and routes a new PaymentIntent kind `card_extra` explicitly through the webhook classifier so it cannot fall into the hold-failure handler.

The airport model is simpler than it looks: keep `pickup_date`/`pickup_time` (and the generated `pickup_utc`) as THE operational instant = landing + offset. Then the Phase 88/89/90 machinery (hold lead, cancellation windows, no-show wait anchored on `pickup`, Google Calendar sync, dispatch board/calendar) is correct without changes, because all of it already keys off the pickup instant. Landing is new data only (`landing_date`, `landing_time`, `pickup_offset_min`), validated server-side against the recomputed pickup. Two traps: the existing daily flight-refresh cron filters `trip_type IN ('airport_arrival','airport_departure')`, values that no booking has (so it processes nothing), and it only runs once a day; and the Phase 89 consent wording does not authorise post-trip extras, so EXTRA-01 needs a wording decision before it can be used safely.

**Primary recommendation:** Build one server pricing path (`lib/route-distance.ts` + `priceCheckout`) that takes coordinates, stops (lat/lng/waitMinutes) and landing/offset, ignores every client distance, amount and airport flag, and returns distance, waiting fee and breakdown; persist stops/landing in the same capture step as the unpaid booking row; add the extra-charge engine as a separate module with its own table. Plan it in four waves (see Plan Breakdown).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Distance through stops, price, waiting fee | API / Backend | — | Server is price authority; browser value ignored (locked) |
| Stop entry, per-stop wait selector, landing + offset UI | Browser / Client | — | Wizard state in Zustand; display only, server revalidates |
| Pickup = landing + offset (DST-safe) | API / Backend (validate) | Browser (preview) | One pure helper on `lib/prague-date` instants used by both tiers; server decides |
| Stops/landing persistence | Database / Storage | API / Backend | `booking_stops` + landing columns, written by service role at capture |
| Waiting rates per class | Database / Storage (`pricing_config`) | Admin UI (`PricingForm`) | Rates live next to `hourly_rate`; null = not offered |
| Extra charge (compute, confirm, charge) | API / Backend | Admin UI (panel modal) | Operator-only, amount derived from admin rates + row currency, off-session via Stripe |
| Extra charge ledger / audit | Database / Storage | API / Backend | `booking_payment_events` (append-only) + new `booking_extra_charges` |
| Stops/landing display (admin, driver, emails, calendar) | API / Backend (loaders) | Browser / SSR pages | One loader module feeds all surfaces |
| Flight delay -> pickup move (D-08) | API / Backend | Admin UI | Needs a trigger that actually runs; see Open Question 1 |

## Standard Stack

No new runtime dependency. Everything is built on libraries already in `package.json`. [VERIFIED: package.json] `next ^16.2.3`, `stripe ^21.0.1`, `zod ^4.3.6`, `next-intl 4.14.2`, `vitest ^4.1.1`, Node v24.14.1 (`node --version` this session).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Google Routes API `computeRoutes` (REST, existing fetch) | v2 | Server distance through stops | Already used in `app/api/calculate-price/route.ts:247`; no SDK |
| stripe (node) | ^21.0.1 | Off-session extra charge | Same client/keys/classifiers as fee/settle (`lib/payments/stripe.ts`) |
| zod | ^4.3.6 | Strict request schemas (`strictObject`, 400 vs 422) | Project pattern (`app/api/admin/bookings/[id]/fee/route.ts`) |
| Intl (Node ICU) via `lib/prague-date.ts`, `lib/prague-calendar.ts` | built-in | DST-safe landing -> pickup | Existing helpers `pickupInstantMs`, `pragueDateOf`, `formatPragueTime` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand (persist, sessionStorage) | existing | Wizard stop / landing state | Extend `lib/booking-store.ts` |
| next-intl | 4.14.2 | Wizard + payment-email strings | 7 locales, real translations |
| Vitest + `tests/helpers/fake-payments-db.ts`, `fake-stripe.ts` | existing | Money-path tests | Extend fake DB with the two new tables |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Google Routes REST | Distance Matrix / Directions (legacy) | Legacy APIs; the repo already standardised on Routes |
| Own `booking_extra_charges` table | Reuse `booking_fee_cases` | Fee cases are `UNIQUE (booking_id)` with kinds `late_cancel`/`no_show` only [VERIFIED: supabase/migrations/087_cancellation_cash_fee.sql:303-306 `booking_id uuid NOT NULL UNIQUE`, `CHECK (kind IN ('late_cancel', 'no_show'))`]; extras can be many per booking |
| `booking_stops` table | `bookings.stops jsonb` | jsonb flows through `select('*')` and `admin_search_bookings` (`SELECT b.*`) for free; a table matches the roadmap/CONTEXT expectation and is queryable. Recommend the table with one shared loader (see Pitfall 9) |

**Installation:** none.

**Version verification:** no packages added, so no registry lookup needed. Stripe SDK stays at 21.0.1 (STATE.md: "Zero new runtime dependencies expected; Stripe SDK stays at 21.0.1").

## Package Legitimacy Audit

No external packages are recommended for installation in this phase. The `package-legitimacy` gate is not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Current State (verified by reading the code this session)

### The price path today, with the trust points

```
Wizard Step3Vehicle.fetchPrice (components/booking/steps/Step3Vehicle.tsx:161-205)
  POST /api/calculate-price { origin, destination, tripType:'transfer', hours, pickupDate/Time,
                              returnDate/Time, isAirport, intermediates:[{lat,lng}] }   <- NO routeSlug / placeIds
    app/api/calculate-price/route.ts
      - schema: intermediates max(5) (L33-38), extraStops 0..5 (L45)
      - airportFlag = isNearAirport(origin)||isNearAirport(destination)||isAirport===true (L115)
      - intercity fixed-price branch only if routeSlug || placeIds sent (L153)
      - Google Routes computeRoutes, field mask 'routes.distanceMeters,routes.duration' (L247-256)
      - buildPriceMap('transfer', distanceKm) -> applyGlobals(airport, night, holiday, minFare) -> applyExtrasAndRound (+ extraStops*EXTRA_STOP_PRICE)
      - returns prices, returnLegPrices, distanceKm, durationMin
  store.setDistanceKm(data.distanceKm)

Step6: buildCardCheckoutBody (components/booking/steps/cardCheckoutApi.ts:107-135) / Step6Payment.tsx:365-390
  bookingData.distanceKm = String(store.distanceKm)      <- client value
  bookingData.isAirport  = String(isAirportPlace(...))   <- client value
  NO stops, NO landing

POST /api/card-checkout/init | /intent  and  POST /api/create-payment-intent
  lib/checkout/compute.ts
    checkoutBookingSchema: distanceKm: z.string().max(20).optional()  (L49)
    validateCheckoutBooking: const distanceKm = bookingData.distanceKm ? parseFloat(bookingData.distanceKm) : null (L146)
    priceCheckout: const isAirport = bookingData.isAirport === 'true' (L220) -> computeOutboundLegTotal(...) (L226-236)
    buildCheckoutMeta: distanceKm: bookingData.distanceKm ?? '' (L358)   <- stored distance_km is the client value
  card routes then use validated.distanceKm for the cancellation policy:
    app/api/card-checkout/init/route.ts:73, intent/route.ts:151 and :183
  buildBookingRow(meta, ...) -> captureUnpaidBooking (lib/supabase.ts:94-151, 277+)
```

[VERIFIED: files read this session; line numbers above are from those reads]

Key verbatim quotes the planner needs (in-repo discrete values):
- `distanceKm: z.string().max(20).optional(),` (`lib/checkout/compute.ts:49`)
- `const distanceKm = bookingData.distanceKm ? parseFloat(bookingData.distanceKm) : null` (`lib/checkout/compute.ts:146`)
- `const isAirport = bookingData.isAirport === 'true'` (`lib/checkout/compute.ts:220`)
- `distanceKm: bookingData.distanceKm ?? '',` (`lib/checkout/compute.ts:358`)
- `extraStops: z.number().int().min(0).max(5).optional().default(0),` (`app/api/calculate-price/route.ts:45`)
- `export const EXTRA_STOP_PRICE = 20  // EUR per extra stop (CALC-05)` (`lib/pricing-helpers.ts:5`)
- `if (s.stops.length >= 5) return s  // STOP-01 max 5 enforcement` (`lib/booking-store.ts:76`)
- `const WAIT_TIME_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120] as const` and the comment "Wait time is display-only per STOP-01 — local state, NEVER sent to API or store." (`components/booking/StopItem.tsx:14,19`)
- `export interface Stop { id: string; place: PlaceResult | null; waitMinutes?: number }` (`types/booking.ts`, Stop interface)

### Fixed route prices (D-01 / D-03): what actually happens today
- `route_prices` matching exists only inside `/api/calculate-price` (`getRoutePrice(routeSlug)` / `findRouteByPlaceIds`). [VERIFIED: grep of `routeSlug|matchedRouteSlug|findRouteByPlaceIds|getRoutePrice` across `app/api components lib types` — the only non-page consumer is `app/api/calculate-price/route.ts`; no component sends `routeSlug`/`originPlaceId`/`destinationPlaceId`]. Step3Vehicle's fetch body (quoted above) sends neither.
- `lib/route-prices.ts` `applyDistanceFares` says public fares are "road distance × per-km rate from admin ... same formula as /api/calculate-price", i.e. fixed fares were deliberately converted to distance fares.
- `priceCheckout` never matches `route_prices`; it is per-km on distance only.
- Consequence for planning: D-03 ("no stops = unchanged") is automatically true for the wizard and for checkout. D-01 needs one rule in `/api/calculate-price`: when `intermediates.length > 0`, SKIP the intercity branch (L153-203) even if `routeSlug`/place ids are supplied. Remove `extraStops` and `EXTRA_STOP_PRICE` use (the param has no first-party caller; zod objects ignore unknown keys, so removal is backward compatible). Update `tests/calculate-price-intercity.test.ts:207` ("extraStops=3 adds €60") and `tests/pricing-helpers.test.ts:34`.

### Google routing: API, SKU, limits (CITED, current docs)
- The server already uses Routes API `computeRoutes`, not Distance Matrix. [VERIFIED: `app/api/calculate-price/route.ts:247`] A second, independent Routes fetch lives in `app/api/gnet/farmin/route.ts:144` (field mask `routes.distanceMeters`); leave it untouched.
- Intermediates: "Up to 25 intermediate waypoints are supported." [CITED: developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes]. Default waypoints are stop-overs; `via` is opt-in (the repo sends plain `location.latLng`, so each intermediate becomes a leg). "Each leg corresponds to the trip between two non-`via` Waypoint" [CITED: same page].
- `Route.distanceMeters`: "The travel distance of the route, in meters." (total across legs) [CITED: same page].
- SKU: Essentials is "Billed for requests that use only basic features with a maximum of 10 intermediate waypoints"; Pro is billed for advanced features "such as the TRAFFIC_AWARE or TRAFFIC_AWARE_OPTIMAL"; "Requests using the waypoint optimization argument are billed at a higher rate"; "Requests containing more than 10 waypoints are billed at a higher rate" [CITED: developers.google.com/maps/documentation/routes/usage-and-billing].
- No `routingPreference` is set today and the enum doc says "ROUTING_PREFERENCE_UNSPECIFIED: No routing preference specified. Default to TRAFFIC_UNAWARE." [CITED: developers.google.com/maps/documentation/routes/reference/rest/v2/RoutingPreference]. So today's call is Essentials and stays Essentials with <=5 intermediates, as long as the new code does NOT set `routingPreference` (TRAFFIC_AWARE*), `departureTime`, `optimizeWaypointOrder`, or `via`.
- Price list: Compute Routes Essentials free cap 10,000/month then $5.00 per 1,000; Pro 5,000 free then $10.00 per 1,000 [CITED: developers.google.com/maps/billing-and-pricing/pricing].
- Field mask: the usage page does not say the mask changes the SKU; keep `routes.distanceMeters,routes.duration` (the SKU is driven by the request features, not the mask). [CITED: usage-and-billing page "does not mention field masks"] -> keep as-is, tag the "mask does not affect SKU" reading as MEDIUM.
- Recommended caps: MAX_STOPS = 5 (matches store cap, calculate-price schema `.max(5)`; well under the 10-waypoint Essentials ceiling). Max wait per stop = 120 min (matches the existing selector 0..120 in 15-min steps; 8 blocks). Both are constants, not prices.

### Where per-class rates live (D-04 / D-05)
- `pricing_config` (one row per `vehicle_class`: `rate_per_km, hourly_rate, daily_rate, min_fare`) read by `getPricingConfig()` (`lib/pricing-config.ts:73-77`), written by `PUT /api/admin/pricing` whose schema is `pricingConfigSchema = z.object({ vehicle_class, rate_per_km, hourly_rate, daily_rate, min_fare })` (`app/api/admin/pricing/route.ts:17-23`) and edited in `components/admin/PricingForm.tsx` (575 lines). Global settings live in `pricing_globals` id 1.
- Put the waiting rate in `pricing_config` as a nullable column (e.g. `waiting_rate_per_15min numeric NULL CHECK (waiting_rate_per_15min IS NULL OR waiting_rate_per_15min > 0)`), because it is per class "next to the hourly rates" (D-04) and NULL = not offered (D-05, no default in a migration). Extend `PricingRates` with `waitingRate: Record<string, number>` containing only classes with a positive value, read defensively (`rates.waitingRate?.[vc]`) because existing tests build partial rate objects (`tests/checkout-compute.test.ts` DEFAULT_PRICING has no such key). The admin PUT schema gets `waiting_rate_per_15min: z.number().positive().nullable().optional()`; `PricingForm` shows a blank = "not offered" input.
- Free-wait thresholds "reuse Phase 89 admin settings": those are only the pickup waits `noshow_wait_city_min` (default 30) and `noshow_wait_airport_min` (default 60) [VERIFIED: `lib/no-show-wait.ts:10-11` `export const DEFAULT_CITY_MIN = 30`, `export const DEFAULT_AIRPORT_MIN = 60`; `getNoShowThresholds` reads them]. The per-stop free 15 minutes is a fixed constant in this phase (locked D "first 15 minutes free"), e.g. `STOP_FREE_WAIT_MIN = 15`, `WAIT_BLOCK_MIN = 15` in a pure `lib/stops.ts`.

### Pickup storage and what a separate landing time touches
- `bookings.pickup_utc` is `GENERATED ALWAYS` from `pickup_date` + `pickup_time` via `prestigo_text_to_utc(pickup_date, pickup_time)` [CITED: .planning/milestones/v4.0-phases/84-chatwoot-dashboard-app/84-01-SUMMARY.md line 80]. `pickup_time` is NOT NULL (same source). It cannot be inserted.
- Everything below keys off the pickup instant and therefore needs NO change if `pickup_*` = landing + offset: hold timing (`computeHoldAt(pickupMs, leadHours)` in `app/api/card-checkout/*`), cancellation windows (`evaluateCancellation(..., pickupMs)`), no-show availability (`noShowAvailableAtMs` = `max(pickupMs, onLocationMs) + thresholdMin`, `lib/no-show.ts:47-55`; the 60 minutes for airport therefore already count from the pickup), Google Calendar sync (reads `pickup_utc`), dispatch board/calendar (Phase 90, `pickup_utc`), reminders.
- The landing instant is new, display/validation-only data: `landing_date text`, `landing_time text`, `pickup_offset_min smallint` (offsets 0/15/30/45/60/90, default 30). Do NOT add a generated `landing_utc` unless a surface needs it.
- Midnight roll-over: landing 23:50 + 30 min = 00:20 next day, so `pickup_date` must be derived with the instant arithmetic, not by editing the time string. Use `pickupInstantMs({pickup_utc:null, pickup_date: landingDate, pickup_time: landingTime})` + offset*60_000, then `pragueDateOf(ms)` and `formatPragueTime(ms)` from `lib/prague-calendar.ts` [VERIFIED exports: `pragueDateOf`, `formatPragueTime`, `lib/prague-calendar.ts:35,57`]. DST fixtures: 2027-03-28 (02:00->03:00, a 02:30 wall time does not exist) and 2027-10-31 (03:00->02:00, 02:30 occurs twice), same as Phase 90.
- Airport detection: client = `isAirportPlace(origin)` (placeId or 3 km haversine, `types/booking.ts`); EntryBar shows the flight field when `isAirportPlace(origin)` (`components/booking/EntryBar.tsx:85`). Server = `isAirportPickup({origin_lat, origin_lng, origin_address})` in `lib/no-show-wait.ts` (coordinates via `isNearAirport`, or an address regex `/airport|letiště|letiste|václav havel|\bPRG\b/i`). For STOP-05 the airport PICKUP is origin-based. Use `isAirportPickup` on the server with the body's `originLat/originLng/originAddress` (already present in the body). Caveat: `isNearAirport` is a degree box (`PRG_RADIUS_DEG = 0.027`, ~3 km lat, ~1.9 km lng) while the client uses a true 3 km radius, so a point at the edge can disagree; the server answer wins (a mismatch becomes a 422/409, never a silent accept).

### Wizard structure (where each new thing fits)
| Concern | Location |
|---------|----------|
| Store (Zustand, `sessionStorage` key `prestigo-booking`) | `lib/booking-store.ts`; `stops` persisted (L161); price/distance deliberately not persisted (L169-172) |
| Step 1 stops + airport flight field | `components/booking/steps/Step1TripType.tsx:176-200` (`showStops = tripType === 'transfer'`, `StopList`), `components/booking/EntryBar.tsx` (flight number, date, time) |
| Step 2 date/time | `components/booking/steps/Step2DateTime.tsx` (DayPicker + 5-minute time grid, MIN_LEAD_HOURS 12) |
| Step 3 vehicle + price fetch | `components/booking/steps/Step3Vehicle.tsx:161-205` |
| Step 5 passenger/flight check | `components/booking/steps/Step5Passenger.tsx` (flight check calls `/api/check-flight`) |
| Step 6 | `Step6Checkout.tsx` -> `Step6CardOnFile.tsx` (card/cash) or `Step6Payment.tsx` (pay-now) |
| Price bar / summary | `components/booking/PriceSummary.tsx` (client sums `selectedPrice.base + extrasTotal`), `BookingSummaryBlock.tsx`, `StickyBookingPanel.tsx` |
| Map | `components/booking/RouteMap.tsx` (client `DirectionsService`, no waypoints; `onRouteInfo` reads only `result.routes[0].legs?.[0]`) |
| i18n namespaces | `Booking.stopItem` (keys `stopLabel, removeStop, addressPlaceholder, addressAria, waitTimeLabel, waitTimeAria, noWait, minutes`), `Booking.stopList` (`addStop`), `Booking.step3vehicle`, `Booking.entryBar`, `Booking.priceSummary`, `Booking.summaryBlock`, `Booking.step6.cardOnFile`, `PaymentEmails` [VERIFIED by `node -e` over `messages/en.json`] |

Two body builders exist and BOTH must send stops/landing: `buildCardCheckoutBody` (`cardCheckoutApi.ts`) for card/cash, and the inline literal in `Step6Payment.tsx` (~L365-390) for pay-now.

### Off-session charge machinery (Phase 88/89) and what EXTRA-01 can reuse
- Ledger: `booking_payment_events` (append-only), written only through `appendPaymentEvent` / `applyTransition` in `lib/payments/state.ts` (single writer; `tests/payment-state-writers-gate.test.ts` fails if any other file names the three RPCs or writes a `payment_state` key). Kinds are a CHECK list mirrored in TS (`LEDGER_KINDS`) and pinned by `tests/payments-state.test.ts` via `latestCheckValues('booking_payment_events_kind_check','kind')` [VERIFIED: tests/helpers/latest-migration.ts]. The latest list (087) ends `'fee_opened','cash_settled','cash_reopened'`.
- Off-session call shape (verbatim from `lib/payments/settle.ts` `chargeSavedCard`): `stripe.paymentIntents.create({ amount, currency, customer, payment_method, payment_method_types:['card'], off_session:true, confirm:true, metadata: cardMetadata(kind, {...}) }, { idempotencyKey })`, then branches on `pi.status === 'succeeded'`, else `requires_action -> authentication_required`.
- Idempotency keys: deterministic from ids + attempt, never the amount (`stripeKeys.feeCharge(caseId, n)` = `fee:${caseId}:${n}`). Add `extra: (chargeId, n) => `extra:${chargeId}:${n}``.
- Operator route pattern: `POST /api/admin/bookings/[id]/fee` — guard order "enforceMaxBody -> admin session (401 / 403) -> await params -> id is a uuid (400) -> JSON parse (400) -> strict schema (400) -> booking (404) -> business rules (422) -> engine (409 while busy)", `z.strictObject` (an unknown field such as a currency is a 400), cap and currency taken from the row, never the request, an `admin_action` ledger row appended BEFORE anything can fail (`runFeeCharge`).
- Action matrix: `allowedPaymentActions(booking)` in `lib/payments/actions.ts` feeds the admin GET (`allowed_actions`) which `PaymentPanel` renders; add `charge_extra` there, with the same re-check on POST. Partner (GNet) bookings return `[]` at the top (`isPartnerBooking` = `booking_source === 'gnet'`, `lib/booking-status.ts:124-126`), and `assertMoneyEligible` throws `PartnerBookingMoneyError`; reuse both so "never for GNet" holds by construction.
- Webhook routing (`lib/stripe-webhook/dispatch.ts`): an unknown `card_*` kind on `payment_intent.succeeded` classifies as `'unrouted'` (acknowledged, no write), but on `payment_intent.payment_failed` EVERY `card_*` kind routes to `handlePaymentFailed`, which falls through to `handleHoldFailed` for any kind other than `card_charge|card_difference|card_fee`. So a new `card_extra` kind MUST be added explicitly: to `CardKind` (`lib/payments/stripe.ts`), to `classifyPaymentEvent`'s succeeded list, to `SUCCEEDED_KINDS`, and to the failed branch (otherwise a declined extra would be handled as a failed HOLD). 
- `charge.refunded`: the legacy handler has a status guard (`app/api/webhooks/stripe/route.ts:965-978` "refund on a finished trip, status kept") and `observeRefund` finds the booking through the ledger (`cardBookingIdForPaymentIntent`). The extra PaymentIntent id must never be written to `bookings.payment_intent_id` (the DB rejects it unless target is captured/balance_due, and it is the cancel/refund handler's join key); store it only on `booking_extra_charges` and in the ledger `stripe_object_id`.
- PITFALLS.md C2 / C4 / M8 apply: [CITED: .planning/research/PITFALLS.md] "Capturing more than the hold ... Overcapture is restricted"; extras are a second off-session charge under the mandate, ledgered, with the fee function table-tested (0/14/15/16/29/30/31 min) and the fee config snapshotted on the booking.

### Display surfaces for stops/landing (STOP-04)
| Surface | File | How it gets data today | Change |
|---------|------|------------------------|--------|
| Admin list/board/calendar/panel | `app/api/admin/bookings/route.ts` -> RPC `admin_search_bookings` returns `SELECT b.*` as jsonb; `components/admin/BookingDetailPanel.tsx`, `bookingTypes.ts` `AdminBooking` | new landing columns flow automatically; stops need one `booking_stops ... .in('booking_id', ids)` attach step (route + the Phase 90 dispatch route `app/api/admin/bookings/dispatch/route.ts`) | extend `AdminBooking`, render stops + landing/pickup + paid wait in the panel |
| Driver trip page | `app/(internal)/driver/trip/[token]/page.tsx` explicit `TRIP_SELECT` string; `TripScreen`/`TripDetails.tsx`; English only | add columns + stops query; pass through `trip` prop; show landing, pickup, "free waiting until" (pickup + `getNoShowThresholds().airportMin`) | nav link (`lib/driver-nav-url.ts`) sends only the destination; optional: Google Maps URL `waypoints` for stops |
| Client confirmation emails (English-only builders) | `lib/email.ts`: `BookingEmailData` + `buildConfirmationHtml` (pay-now, webhook), `StatusEmailBooking` + `buildStatusEmailHtml` (card flow "confirmed" via `advanceBookingStatus`), `DriverAssignmentEmailData`/`driverTripDetailsRows`, reminders (`ReminderEmailBooking`) | `bookingEmailDataFromRow` (`lib/payments/emails/send.ts:37`) builds from the row | add optional `stops`, `landing` fields; shared HTML snippet |
| Google Calendar | `lib/google-calendar.ts` `CalendarBooking`; trigger `bookings_gcal_sync` fires `AFTER INSERT OR UPDATE OF status, pickup_utc, ... flight_number, terminal, ...` (063) | description could list stops/landing | re-create the trigger with the new columns in the same migration if landing is shown; stops are read at sync time |
| CRM sync (outbox) | `lib/customer-mapping.ts`, `lib/crm-sync.ts` | not required by STOP-04 | leave untouched |
| GNet | `app/api/gnet/farmin/route.ts` imports `computeOutboundLegTotal` and has its own Routes fetch | none | keep `computeOutboundLegTotal`'s signature; add new params only as optional/new functions |

Erasure: `supabase/migrations/088_erasure_payment_pii.sql` (latest) NULLs `origin_address`, `destination_address`, `special_requests`, `flight_number` on the booking row (anonymise, not delete). Stop addresses are the same kind of location PII, so the erasure function must also clear/delete `booking_stops` rows (and null the landing fields are not PII; leave). That means a full `CREATE OR REPLACE FUNCTION` copy in the new migration, as 087 did for `apply_payment_transition` (`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` repeated; see memory "Function PUBLIC EXECUTE grant gotcha").

## Architecture Patterns

### System Architecture Diagram

```
 Browser (wizard)                           Server (Next.js route handlers)                     External / DB
 ----------------                           -------------------------------                     -------------
 Step1: origin, destination,
        stops[{place, waitMinutes}]
        (EntryBar: airport origin ->
         landing time + offset)
            |
 Step3: POST /api/calculate-price ------->  validate (zod, cap 5, wait%15, <=120)
        {origin,dest,intermediates         skip intercity branch if stops>0
         [{lat,lng,waitMinutes}],          lib/route-distance.ts --------------------------->  Google Routes computeRoutes
         pickup*, landing*}                  (origin, ordered intermediates, destination;       (Essentials SKU: no
            |                                no optimize, no traffic pref)                      routingPreference)
            |                              buildPriceMap(per-km on TOTAL km) -> applyGlobals
            |                              + waitingFee(blocks x class rate, null => not offered)
            |<--- prices(+waiting line), distanceKm, waiting{freeMin,blockMin,rateByClass|null}
            |
 Step6: POST /api/card-checkout/init|intent
        POST /api/create-payment-intent  -->  validateCheckoutBooking (no distance trust)
        bookingData{..., stops[], landing*,   priceCheckout: SAME route-distance + stops + waiting + airport
        displayedAmountMinor}                  detection server-side; landing+offset => expected pickup
            |                                  returns priced{combined, distanceKm, durationMin, waitingFeeEur, stops}
            |                                  displayedAmountMinor != server => 409 PRICE_CHANGED (existing)
            |                                  cancellation facts use priced.distanceKm
            |                                captureUnpaidBooking(row incl. server distance_km, landing*)
            |                                saveBookingStops(bookingId, priced.stops)  ----->  booking_stops (service role)
            |                                Stripe SetupIntent / PaymentIntent (amount = server total incl. waiting)
            |
 Operator panel (BookingDetailPanel/PaymentPanel)
   "Add extra charge" modal ---> POST /api/admin/bookings/[id]/extra  --> getAdminUser -> strict schema -> allowedPaymentActions
        (minutes | description+amount)          booking_extra_charges row (pending, amount locked) + admin_action ledger row
                                                lib/payments/extra.ts: stripe.paymentIntents.create(off_session, confirm,
                                                  key extra:<chargeId>:<attempt>, kind card_extra) ---------------> Stripe
                                                ledger extra_charged | extra_failed ; localized email (PaymentEmails.extraCharged)
 Stripe webhook --> dispatchPaymentEvent: card_extra succeeded -> observation row; failed -> observation row (NOT hold-failed)
```

### Recommended Project Structure
```
lib/
├── stops.ts                 # PURE: MAX_STOPS, STOP_FREE_WAIT_MIN, WAIT_BLOCK_MIN, MAX_STOP_WAIT_MIN, waitingBlocks(), waitingFeeEur(), stop schema (zod)
├── airport-pickup.ts        # PURE: LANDING_OFFSETS, DEFAULT_OFFSET, pickupFromLanding(landingDate, landingTime, offsetMin) (DST-safe), freeWaitUntil()
├── route-distance.ts        # SERVER: computeRouteDistance({origin,destination,intermediates}) -> {distanceKm, durationMin} | error; used by calculate-price AND priceCheckout
├── booking-stops.ts         # SERVER: saveBookingStops(), loadStopsByBookingIds(), attachStops(rows)
└── payments/extra.ts        # SERVER: extra-charge engine (compute amount, lock, charge, ledger, receipt)
app/api/admin/bookings/[id]/extra/route.ts   # operator charge route (+ GET preview optional)
supabase/migrations/089_*.sql
tests/ (new): stops-fee.test.ts, airport-pickup.test.ts, route-distance.test.ts, checkout-stops.test.ts, booking-stops.test.ts, extra-charge.test.ts, admin-extra-route.test.ts, extra-webhook.test.ts, migration-089.test.ts
```

### Pattern 1: One server pricing function (pure fee + injected distance)
**What:** Keep `priceCheckout` the single call site. Add to it: (a) resolve distance via `computeRouteDistance` from the body's coordinates and stops (ignore `bookingData.distanceKm`), (b) detect airport from coordinates (ignore `bookingData.isAirport`), (c) `waitingFeeEur = Math.round(sum(blocks) * rate[class])`, (d) feed `extrasEur: extrasTotalEur + waitingFeeEur` into `computeCombinedTotalMinor` so promo and rounding behave exactly as today, and return `waitingFeeEur`, `distanceKm`, `durationMin`, `stops` in `PricedCheckout`.
**When to use:** every flow (pay-now, card, cash) — they already share `priceCheckout`.
**Example:**
```typescript
// lib/stops.ts  (pure; table-test 0/14/15/16/29/30/31 and the 15-minute steps)
export const MAX_STOPS = 5
export const STOP_FREE_WAIT_MIN = 15
export const WAIT_BLOCK_MIN = 15
export const MAX_STOP_WAIT_MIN = 120
/** Billable blocks of one stop: first 15 min free, each STARTED further 15 min is one block. */
export function waitingBlocks(waitMinutes: number): number {
  if (!Number.isFinite(waitMinutes) || waitMinutes <= STOP_FREE_WAIT_MIN) return 0
  return Math.ceil((waitMinutes - STOP_FREE_WAIT_MIN) / WAIT_BLOCK_MIN)
}
```
(15-min steps give 30 -> 1 block, 45 -> 2, ...; ceil keeps 16/31 correct if a non-multiple ever reaches it. The server schema still rejects non-multiples of 15.)

### Pattern 2: Server route distance module (shared, no new SKU risk)
```typescript
// Source: existing call in app/api/calculate-price/route.ts:232-256 + Routes docs (intermediates <=25, Essentials <=10)
const body = {
  origin: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
  destination: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
  intermediates: stops.map((s) => ({ location: { latLng: { latitude: s.lat, longitude: s.lng } } })),
  travelMode: 'DRIVE',
  // NEVER add: routingPreference TRAFFIC_AWARE*, departureTime, optimizeWaypointOrder, via:true  (SKU / order)
}
// headers: 'X-Goog-Api-Key' (GOOGLE_MAPS_API_KEY with the trailing "\\n" defence from calculate-price L226), 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
```
Add a timeout (`AbortSignal.timeout(8000)`), return a typed result (`ok:false` -> 503 `ROUTING_UNAVAILABLE` in checkout, `quoteMode` in calculate-price as today).

### Pattern 3: Extra-charge engine = fee engine discipline, own table
Money action contract (copy `fee.ts` / `fee/route.ts`): (1) admin session, (2) strict zod schema, (3) `allowedPaymentActions` includes `charge_extra`, (4) amount derived on the server: waiting = `ceil(minutes / 15) * waitingRate[class]` converted to the row's `payment_currency` (EUR -> CZK via `eurToCzk`), "other" = typed amount validated `1..cap`, (5) `admin_action` ledger row FIRST, (6) insert `booking_extra_charges` (status `pending`, amount locked), CAS `pending -> charging`, (7) Stripe create with key from `row.id + attempt`, (8) success: `charged` + ledger `extra_charged`, receipt email; decline: `failed` + ledger `extra_failed`, attempt+1, surface `declined` to the operator, NO automatic retry; transient: stay `charging`, same key replays on the next click (lease like `LEASE_SECONDS`).
The operator confirmation (D-10) is the existing dialog pattern: the dialog states amount + currency + "charged to the saved card now"; the POST is sent only from the primary button; an in-flight ref blocks double submit (`useBookingMoves.tsx` pattern; `paymentParts.tsx` `useDecisionRequest`).

### Anti-Patterns to Avoid
- **Trusting any client number:** do not read `bookingData.distanceKm`, `isAirport`, amount, or the client's waiting fee. Do not add the new `stops` to `.catchall(BOUNDED_STRING)` as a string; declare a typed `stops` field in the schema.
- **Setting `optimizeWaypointOrder` or `TRAFFIC_AWARE`:** reorders the chauffeur route (STATE.md constraint, code comment at `calculate-price/route.ts:238`) and/or leaves the Essentials SKU.
- **Moving `pickup_*` back to the landing time:** breaks hold lead, cancellation, no-show, calendar, dispatch (PITFALLS C10).
- **Reusing `settleBooking`/`payment_state` for extras:** the single-writer gate test would fail and a captured booking has no transitions (`captured: []`).
- **Storing the extra PaymentIntent in `bookings.payment_intent_id`.**
- **Hard-coding any EUR amount in `app/` or `components/`:** rate and currency strings come from the API; unicode escapes used today (`€`) stay as they are.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prague wall clock <-> instant, DST | own offset table / `new Date(local)` | `pickupInstantMs`, `pragueDateOf`, `formatPragueTime` | already DST-tested; avoid the 2027-03-28 / 2027-10-31 traps |
| Off-session charge + idempotency + error classes | new Stripe wrapper | `getPaymentsStripe`, `stripeKeys`, `cardMetadata`, `classifyStripeError`, `isNotTheClientsFault` | retries/timeouts/lease sizing already tuned |
| Ledger writes | direct inserts | `appendPaymentEvent` | single-writer gate test, event_key idempotency |
| Admin auth + body guards | ad-hoc | `getAdminUser` from `@/lib/supabase/server`, `enforceMaxBody`, strictObject two-step 400/422 | project API pattern |
| Partner exclusion | `booking_source` string compare | `isPartnerBooking` / `assertMoneyEligible` | one definition of "GNet" |
| Distance math for pricing | haversine "approximation" | Google Routes server call | locked decision; haversine under-counts road km |
| Amount formatting | template strings | `formatMinor` (`lib/payments/money.ts`) | currency decimals |
| Modal/dialog | custom | `components/admin/Modal.tsx`, `paymentParts.tsx` hooks | focus, in-flight handling |

**Key insight:** every hard part of this phase (money, time, routing, auth) already has a tested module; the work is wiring one new input (stops/landing) through them and adding one new money table. New bespoke logic should be limited to the pure fee function and the pure landing->pickup function.

## Common Pitfalls

### Pitfall 1: Client `distanceKm` survives somewhere
**What goes wrong:** the server recomputes in `priceCheckout`, but `buildCheckoutMeta` still writes `distanceKm: bookingData.distanceKm` (L358) into `bookings.distance_km`, and the card routes still call `evaluateCancellation(... validated.distanceKm ...)` (`init/route.ts:73`, `intent/route.ts:151,183`), so a tampered value keeps steering the free-cancellation window (short vs long trips: `cancel_free_hours_short` 1 h vs `cancel_free_hours_long` 12 h by km threshold).
**How to avoid:** return `distanceKm` from `priceCheckout` (PricedCheckout), pass `priced.distanceKm` to `buildCheckoutMeta` and to the three cancellation call sites; a test asserts a request with `distanceKm:'1'` and far coordinates stores the server value. Stop requiring `distanceKm` in `validateCheckoutBooking` for transfers (keep accepting and ignoring it for old clients).
**Warning signs:** `distance_km` on a booking equals the request value rather than the mocked route distance.

### Pitfall 2: Client `isAirport` lets a client dodge the airport fee
**What goes wrong:** `const isAirport = bookingData.isAirport === 'true'` (compute.ts:220) — a crafted `false` removes `globals.airportFee` from the server total. `/api/calculate-price` uses coordinates (`isNearAirport(origin)||isNearAirport(destination)||isAirport`).
**How to avoid:** one shared `isAirportTrip(origin, destination)` used by both (coordinates only; ignore the client flag in checkout). Parity test between calculate-price and priceCheckout for an airport trip.

### Pitfall 3: Price drift between wizard quote and checkout recompute
**What goes wrong:** the wizard shows the price from one Routes call; checkout recomputes with another; a Google route variation changes rounded km by a hair -> `PRICE_CHANGED` 409 loops.
**How to avoid:** the existing cross-check already handles drift (409 -> client re-reads `amountMinor`); make sure the wizard handles it for the new inputs (stops, wait). Add a test: same inputs twice produce the same total; a changed distance yields 409, not a silent accept.

### Pitfall 4: Failure mode of the server Routes call
**What goes wrong:** deciding "if Google fails, fall back to the client's distance" re-opens the hole.
**How to avoid:** fail closed in checkout: `503 ROUTING_UNAVAILABLE`. The wizard price itself already depends on Google (`quoteMode` on failure), so this adds no new dependency. `card-checkout/init` maps any priced failure to opaque `{eligible:false}` (existing behaviour); `intent` returns the code.

### Pitfall 5: Stops never persisted / lost on retry
**What goes wrong:** stops are priced but not written, or written once and then stale when the same `attemptId` is re-POSTed (currency toggle, retry), or lost on the pay-now webhook defensive insert (metadata-only).
**How to avoid:** write stops right after `captureUnpaidBooking` returns a non-empty array (the row is `unpaid`) in all three flows, as replace-all (delete by `booking_id` then insert) so a retry replaces them; never touch stops of a booking that has left `unpaid` (`captureUnpaidBooking` returns `[]` then). For the pay-now fallback insert, either accept the documented degrade (capture row normally exists) or add compact `stop1..stop5` metadata keys (`buildCheckoutMeta` currently emits ~37 keys vs Stripe's 50-key / 500-char limit; stay under both, clamp the address).

### Pitfall 6: Wait fee, night/holiday coefficient and promo
**What goes wrong:** applying `applyGlobals` (night coefficient, airport fee, `minFare`) to the waiting fee, or letting promo apply per part.
**How to avoid (recommended, see Open Question 4):** waiting fee is added AFTER `applyGlobals` (no coefficient, no airport fee, no minFare), included in `extrasEur` of `computeCombinedTotalMinor` so promo applies once on the sum, exactly the T-26-03 rule. Return it as its own number for the summary line.

### Pitfall 7: Class without a waiting rate
**What goes wrong:** client picks 60 min at a stop on Step 1 (class unknown), later picks a class with NULL rate; the server prices 0 or throws.
**How to avoid:** the price response includes per-class `waitingFee` (number) or `waitingAvailable:false`; checkout returns `422 WAITING_NOT_AVAILABLE` if any stop wait > free and the class has no rate (never silently clamps or charges 0). UI: disable/flag that vehicle card or show the free-15 note. `StopItem` can read rates from the last price response; otherwise it keeps all options and the vehicle step explains.

### Pitfall 8: Landing/pickup consistency and DST
**What goes wrong:** client sends `pickupTime` that does not equal landing + offset; wall times that do not exist (02:30 on 2027-03-28).
**How to avoid:** the server derives the pickup from `landing*` + offset (ignoring the sent pickup, or 422 if they differ), rejects offsets outside {0,15,30,45,60,90}, rejects landing fields for a non-airport origin, runs the 12-hour/lead checks on the DERIVED pickup, and has fixtures for 2027-03-28 and 2027-10-31 plus a 23:50 -> next-day roll-over case. Behaviour for a non-existent wall time must be documented in the test (`pickupInstantMs` shifts forward).

### Pitfall 9: Stops table vs `select('*')` surfaces
**What goes wrong:** a new table is invisible to the code paths that rely on the booking row (`select('*')`, `admin_search_bookings` `b.*`, email builders `bookingEmailDataFromRow`, calendar), so surfaces silently omit stops.
**How to avoid:** one loader (`loadStopsByBookingIds`) and one `attachStops(rows)` used by the admin list, dispatch, panel, driver page, email senders and calendar sync; a checklist test per surface ("renders stops when present, nothing when absent"). (If the planner prefers jsonb-on-bookings for zero-loader display, the persistence/erasure/test points above still apply.)

### Pitfall 10: Trip edit of a booking that has stops
**What goes wrong:** `TripEditPanel` (`components/admin/TripEditPanel.tsx:284`) calls `/api/calculate-price` with origin/destination only, so editing an address/vehicle of a booking with stops recomputes a price WITHOUT the detour and WITHOUT waiting; the PATCH at `app/api/admin/bookings/route.ts` accepts client `distance_km` ("trusted only at the price level", comment at L70) for admin.
**How to avoid (minimum):** return 422 `stops_edit_unsupported` from the PATCH price-edit branch when the booking has stops (operator uses the override path), or pass stops as `intermediates` and add waiting. Planner decision; flagged because it silently lowers prices otherwise.

### Pitfall 11: `RouteMap` reads only the first leg
**What goes wrong:** with waypoints `result.routes[0].legs` has several legs; `onRouteInfo(leg.distance..., leg.duration...)` (RouteMap.tsx ~L230) uses `legs?.[0]` -> wrong km/minutes shown and wrong "estimated drop-off" derived from it.
**How to avoid:** sum `legs[].distance.value` / `duration.value`; add `waypoints: stops.map(s => ({ location, stopover: true }))` to the client `DirectionsService.route` (client-side Maps JS, billed separately from the server Routes SKU; keep at <=5) and markers per stop. Server `durationMin` (sum of legs from Routes) remains the number used for pricing/duration displays.

### Pitfall 12: Consent text does not cover extras
**What goes wrong:** the stored authorisation (`Booking.step6.cardOnFile.consentSetup` etc.) authorises: save card, hold, charge after trip, cancel/no-show fee "up to the full fare", and "If the price of my booking changes, I authorise Prestigo to charge or release the difference." [VERIFIED: `messages/en.json` Booking.step6.cardOnFile.consentSetup / consentHoldNow / consentCash]. It says nothing about waiting beyond the booked time or other extras (parking, extra km). PITFALLS C5/M8 require the wording to state how waiting fees/extras are computed.
**How to avoid / decision:** see Open Question 2. If the owner adds a sentence, it is a consent change: bump `CARD_CONSENT_VERSION` (`lib/payments/consent-text.ts:25`, currently `'2026-11-2'`), 7 locales, update `tests/payments-consent.test.ts` EN pins and the `tests/payments-copy-i18n.test.ts` allow-list (no typed amounts; amounts via ICU params).

### Pitfall 13: Dead / daily flight-refresh cron (D-08)
**What goes wrong:** `app/api/cron/flight-refresh/route.ts:20` selects `.in('trip_type', ['airport_arrival', 'airport_departure'])`, but `buildBookingRow` stores `trip_type: meta.tripType` (`lib/supabase.ts:115`) whose values are `'transfer' | 'hourly' | 'daily' | 'round_trip'` (`types/booking.ts` TripType). The cron therefore matches nothing, and `vercel.json` runs it once a day at `0 5 * * *`. The admin `POST /api/admin/flight-refresh` refreshes one booking on demand but only writes `flight_status`, `flight_estimated_arrival`, `flight_delay_minutes`, ... and never touches pickup.
**How to avoid:** D-08 needs a real trigger; see Open Question 1. Whatever moves the pickup must go through one function that updates `pickup_date/pickup_time` and then calls `reevaluateAfterEdit` (`lib/payments/edit-hook.ts`, as the admin PATCH does at `app/api/admin/bookings/route.ts:714-722`) so hold date, amount and the Google Calendar trigger stay consistent, and writes the audit/notification the same way as a manual edit.

### Pitfall 14: Test infrastructure drift
**What goes wrong:** `tests/helpers/fake-payments-db.ts` has a fixed `TABLES` list (`booking_fee_cases`, `booking_manage_tokens`, `booking_payment_notes` ...) and a per-table CHECK emulation; a new table is unknown to it. `tests/payments-state.test.ts` pins `LEDGER_KINDS` to the latest migration CHECK; adding `extra_charged`/`extra_failed` without both updates fails it. Many existing tests (`checkout-compute`, `card-checkout-init/intent/cash`, `create-payment-intent`, `payments-lifecycle`, `webhooks-stripe`, `supabase`) pass a client `distanceKm` and will need the route-distance module mocked.
**How to avoid:** Wave 0 updates helpers/mocks first (see Validation Architecture).

## Code Examples

### Landing -> pickup (pure, DST-safe)
```typescript
// lib/airport-pickup.ts  (uses existing helpers; no new dependency)
import { pickupInstantMs } from '@/lib/prague-date'
import { pragueDateOf, formatPragueTime } from '@/lib/prague-calendar'

export const LANDING_OFFSETS = [0, 15, 30, 45, 60, 90] as const   // D-07
export const DEFAULT_LANDING_OFFSET = 30

export function pickupFromLanding(landingDate: string, landingTime: string, offsetMin: number) {
  if (!(LANDING_OFFSETS as readonly number[]).includes(offsetMin)) return null
  const landingMs = pickupInstantMs({ pickup_utc: null, pickup_date: landingDate, pickup_time: landingTime })
  if (landingMs === null) return null
  const ms = landingMs + offsetMin * 60_000
  return { pickupMs: ms, pickupDate: pragueDateOf(ms), pickupTime: formatPragueTime(ms) }  // e.g. 14:00 + 30 -> 14:30
}
```
([VERIFIED: lib/prague-calendar.ts] `formatPragueTime` is documented `'HH:MM', 24 h, Prague wall clock` and returns `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`.)

### Operator extra charge request (strict, two-step parse)
```typescript
// Source: pattern of app/api/admin/bookings/[id]/fee/route.ts:52-65
const bodySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('waiting'), minutes: z.number().int().min(1).max(480) }),
  z.strictObject({ kind: z.literal('other'),
                   description: z.string().trim().min(3).max(200),
                   amount_minor: z.number().int().positive() }),   // cap + currency come from the booking row, never the body
])
```

### Webhook classification additions
```typescript
// lib/stripe-webhook/dispatch.ts — handlePaymentFailed must branch BEFORE the hold fallback:
if (kind === 'card_charge' || kind === 'card_difference' || kind === 'card_fee' || kind === 'card_extra') return handleCardChargeFailed(event)
```
(and `card_extra` in the `payment_intent.succeeded` list, `SUCCEEDED_KINDS`, `CardKind`, `handleCardChargeFailed`'s kind gate.)

## Migration plan (next free number is 089, not 084/087)

[VERIFIED: `ls supabase/migrations` -> last file `088_erasure_payment_pii.sql`; no migration numbered 089+ exists on any local or remote branch (checked with `git ls-tree` over all refs this session)]. CONTEXT.md/ROADMAP/STATE all say 084/087, which are stale; use **089** and re-check `ls supabase/migrations` at write time. Migrations are applied by the orchestrator through the Supabase MCP (executors have no Supabase MCP; migration 071 header: "Applied LIVE by the orchestrator via the Supabase MCP (no migrations are auto-pushed in this repo)").

089 contents (all additive):
1. `booking_stops` (`id uuid pk`, `booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE`, `position smallint NOT NULL CHECK (position BETWEEN 1 AND 5)`, `address text NOT NULL CHECK (char_length(address) <= 500)`, `lat/lng double precision`, `wait_minutes smallint NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 120 AND wait_minutes % 15 = 0)`, `free_minutes smallint NOT NULL`, `fee_per_block_eur numeric` (snapshot, null when none), `blocks smallint NOT NULL DEFAULT 0`, `fee_eur numeric NOT NULL DEFAULT 0`, `UNIQUE (booking_id, position)`), deny-all RLS + `REVOKE ALL ... FROM anon, authenticated` (pattern of `booking_fee_cases` in 087).
2. `bookings`: `landing_date text NULL`, `landing_time text NULL`, `pickup_offset_min smallint NULL CHECK (pickup_offset_min IS NULL OR pickup_offset_min IN (0,15,30,45,60,90))`. Recreate `bookings_gcal_sync` trigger with the new columns if landing is shown in the calendar event.
3. `pricing_config.waiting_rate_per_15min numeric NULL CHECK (... > 0)`.
4. `booking_extra_charges` (`id uuid pk`, `booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE` (NOT unique), `kind text CHECK (kind IN ('waiting','other'))`, `status text CHECK (status IN ('pending','charging','charged','failed'))`, `currency CHECK ('eur','czk')`, `amount_minor bigint CHECK (> 0)`, `minutes int NULL`, `rate_per_block_eur numeric NULL` (snapshot), `description text NULL CHECK (char_length <= 200)` (operator free text lives here, never in the ledger, like fee `reason`), `attempt int NOT NULL DEFAULT 0`, `stripe_payment_intent_id text NULL`, `requested_at`, `requested_by text`, `charged_at`), deny-all RLS.
5. Ledger CHECK: drop/re-add `booking_payment_events_kind_check` with the 087 list plus `extra_charged`, `extra_failed` (mirror in `LEDGER_KINDS`; `append_payment_event` only checks `p_event->>'key'`, `'kind'`, `'actor_type'` are non-null and inserts, so the table CHECK is the only kind allow-list [VERIFIED: supabase/migrations/085_payment_state_card_on_file.sql:428 `IF p_event->>'key' IS NULL OR p_event->>'kind' IS NULL OR p_event->>'actor_type' IS NULL THEN`]; `apply_payment_transition` 087 has the same guard at line 102, so neither function needs editing).
6. Erasure: `CREATE OR REPLACE` the latest erasure function (088) adding stop deletion/clearing and extra-charge `description` clearing; repeat `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.
7. If the owner chooses the consent-version gate (Open Question 2), nothing extra in SQL: `booking_payment_consents.text_version` already exists (`recordConsent` writes `text_version: CARD_CONSENT_VERSION`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `€20` per extra stop (`EXTRA_STOP_PRICE`) | Per-km through stops + waiting by 15-min blocks, rates in admin | This phase (D-01/D-02) | remove constant + test, no flat fee |
| Client-supplied `distanceKm` priced at checkout | Server recompute via Routes | This phase | security fix |
| Display-only wait selector | Stored `waitMinutes` priced server-side | This phase | `StopItem` rewired to the store |
| Overcapture / growing a hold | Separate off-session `card_extra` charge | v5.0 research (PITFALLS C4) | `booking_extra_charges` |

**Deprecated/outdated:** the `extraStops` parameter of `/api/calculate-price`; `EXTRA_STOP_PRICE`; the TESTING.md in `.planning/codebase/` (dated 2026-03-20, says no test runner; the repo actually uses Vitest with ~400 test files, see Validation Architecture).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Routes SKU is determined by request features, not the field mask | Current State / Google | Cost tier higher than expected; low impact at <=5 stops and current volume |
| A2 | Extra charges are legally/contractually covered only if the consent wording mentions them; gating extras on a new consent version is prudent | Pitfall 12 / OQ2 | Chargebacks/disputes on extras charged to cards that never authorised them. The owner accepted the no-lawyer risk for Phase 89 (D-16), but this is a new charge type |
| A3 | Waiting fee should not receive night/holiday coefficient, airport fee or min fare | Pitfall 6 / OQ4 | Price differs from owner expectation; easy to change in one function |
| A4 | A cumulative cap of 100% of the booked amount per booking for the "other" extras is acceptable | Security / OQ5 | Operator may need larger one-off charges; they can use a payment link |
| A5 | Extras are allowed only for `card_hold` (state `captured`) and `cash_guarantee` (card saved, trip completed); pay-now has no saved card so it is excluded | Pattern 3 / OQ3 | Operator expects extras on pay-now bookings and must use the payment-link flow instead |
| A8 | EUR waiting rate may be non-integer; fee is rounded to whole EUR with `Math.round` like other legs | Pattern 1 | Cent-level mismatch with owner expectation |
| A9 | Client payment emails are localized (PaymentEmails catalog); the booking confirmation emails in `lib/email.ts` are English-only | Display surfaces | If the owner wants localized confirmations, scope grows (out of this phase) |

## Open Questions

1. **D-08 trigger: who moves the pickup when the flight is delayed?**
   - What we know: `flight_estimated_arrival` can be refreshed on demand (admin route) and daily (cron, currently dead: wrong `trip_type` filter, once a day). Moving pickup must go through the trip-edit hook (hold date, calendar) and PITFALLS C10 says to notify, not silently move.
   - What's unclear: automatic move vs operator-confirmed move; threshold to avoid flapping; notify driver/client.
   - Recommendation: implement ONE function `applyLandingChange(bookingId, newLanding, actor)` (updates `landing_*`, recomputes `pickup_*` = landing + `pickup_offset_min`, runs `reevaluateAfterEdit`, writes the audit row, optional driver/client email). Trigger it from (a) the existing admin flight-refresh route as an operator button "Move pickup to HH:MM" (confirm dialog), and (b) optionally the cron after fixing the `trip_type` filter to "airport pickup" via `isAirportPickup`. Ship (a) in this phase; make the cron move automatic only if the owner says so (it also cannot track same-day delays at one run per day on Vercel Hobby).

2. **Does the consent text authorise extras? Which bookings may be charged?**
   - What we know: current wording covers fare, cancel/no-show, price-change difference only.
   - Recommendation: add one sentence to the three consent variants (waiting beyond the booked time / other extras during the trip, charged to this card, a person at Prestigo decides each charge, breakdown by email), bump `CARD_CONSENT_VERSION`, and enable `charge_extra` only when the booking's stored consent `text_version` >= the new version, OR the operator confirms an explicit override with a reason (owner's call). Needs owner decision before planning the UI gate.

3. **Which bookings may receive an extra charge?** Recommend: non-partner, `payment_mode` `card_hold` with `payment_state = 'captured'` or `cash_guarantee` with a saved card (`stripe_customer_id` and `stripe_payment_method_id` present), `status = 'completed'`. Pay-now: not offered (no saved card), use a payment link. Confirm with owner (cash bookings especially).

4. **Waiting fee vs coefficients/promo.** Recommend: no night/holiday/airport/min-fare on waiting; promo applies (same total). Confirm.

5. **Limits on "other".** Recommend: per-charge and cumulative-per-booking cap = booked `payment_amount_minor` (same 100% cap philosophy as fees, D-14), minimum 1 minor unit, description 3-200 chars, one charge in flight per booking (CAS), no automatic retry. Confirm cap.

6. **Waiting at the pickup beyond the free 30/60 min (EXTRA-01a).** The operator enters billable minutes; recommend `ceil(minutes / 15) * class rate` with NO further free deduction (the minutes entered are already beyond free). Confirm the same per-class rate is used for pickup waiting as for stop waiting.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/tests | ✓ | v24.14.1 | — |
| Vitest | tests | ✓ | ^4.1.1 | — |
| Google Routes API key (`GOOGLE_MAPS_API_KEY`, server) | server distance | assumed present in production (`calculate-price` already needs it); not read (`.env.local` is off-limits) | — | none: fail closed (503) in checkout; tests mock the module |
| Stripe live key | extra charge UAT | `.env.local` key is a dead placeholder (memory "Stripe local key invalid") | — | unit tests with `fake-stripe`; live proof via a script the owner runs |
| Supabase MCP | apply migration 089 | orchestrator only (executors have none) | — | orchestrator applies and smokes |

**Missing dependencies with no fallback:** none for planning. **With fallback:** live Stripe proof is owner-run.

## Validation Architecture

(`workflow.nyquist_validation` is not set to false in `.planning/config.json`, so this section is included.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server tests), `globals: true`, setup `./tests/setup.ts` [VERIFIED: vitest.config.ts] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npx vitest run` (~90 s) |
| Conventions | `vi.hoisted` stubs before `vi.mock`; money tests use `tests/helpers/fake-payments-db.ts` + `fake-stripe.ts`; migration/text tests use `tests/helpers/latest-migration.ts`; `vitest related` crashes here, grep `tests/` instead; golden JSON-LD tests normalize `priceValidUntil` |
| Baseline | `npx tsc --noEmit` has 8 old errors in `tests/` only; `npx eslint --quiet <files>` baseline: `<a>`->`<Link>` in both `not-found.tsx` |

(`.planning/codebase/TESTING.md` is stale; do not follow it.)

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STOP-02 | waiting fee table (0/14/15/16/29/30/31, 15-min steps, null rate) | unit | `npx vitest run tests/stops-fee.test.ts` | ❌ Wave 0 |
| STOP-02 | route-distance builds intermediates in order, no optimize/traffic/via, fails closed, trailing `\n` key defence | unit (fetch mock) | `npx vitest run tests/route-distance.test.ts` | ❌ Wave 0 |
| STOP-02 | priceCheckout ignores client distance/airport/amount, uses server distance + stops + waiting; stored `distance_km` = server; cancellation facts = server distance; tampered `distanceKm:'1'` ignored | unit | `npx vitest run tests/checkout-stops.test.ts tests/checkout-compute.test.ts` | ❌ new / ✅ existing (update mocks) |
| STOP-02 | calculate-price: stops skip intercity branch (D-01), no-stops unchanged (D-03), `extraStops` gone, parity with checkout | unit | `npx vitest run tests/calculate-price.test.ts tests/calculate-price-intercity.test.ts` | ✅ (update) |
| STOP-02/05 | card-checkout init/intent + create-payment-intent: 409 PRICE_CHANGED on stop/wait change, stops saved, 422 WAITING_NOT_AVAILABLE, 400 on >5 stops/bad wait/stops with non-transfer | route | `npx vitest run tests/card-checkout-init.test.ts tests/card-checkout-intent.test.ts tests/card-checkout-cash.test.ts tests/create-payment-intent.test.ts` | ✅ (update) |
| STOP-01/03 | store: stop wait setter clears price; persisted; max 5; wizard sends stops in BOTH body builders; summary shows waiting line | component | `npx vitest run tests/booking-store.test.ts tests/StopItem.test.tsx tests/StopList.test.tsx tests/Step3Vehicle.test.tsx tests/Step6CardOnFile.test.tsx tests/Step6Payment.test.tsx tests/PriceSummary.test.tsx` | ✅ (update) |
| STOP-04 | `saveBookingStops` replace-all, retry idempotent, never after confirmed; loader/attach; erasure clears stops | unit/migration text | `npx vitest run tests/booking-stops.test.ts tests/migration-089.test.ts` | ❌ Wave 0 |
| STOP-04 | surfaces render stops/landing: admin panel, driver page props, `buildConfirmationHtml`, `buildStatusEmailHtml`, driver assignment email | component/unit | `npx vitest run tests/email.test.ts tests/driver-trip-screen.test.tsx tests/BookingsTable.test.tsx tests/admin-bookings.test.ts` | ✅ (extend) |
| STOP-05 | landing->pickup incl. 23:50 roll-over, 2027-03-28 and 2027-10-31, offsets whitelist; server rejects landing for non-airport; pickup mismatch | unit | `npx vitest run tests/airport-pickup.test.ts tests/prague-date.test.ts` | ❌ / ✅ |
| STOP-05/D-08 | `applyLandingChange` moves pickup, calls `reevaluateAfterEdit`, audit row | unit | `npx vitest run tests/landing-change.test.ts` | ❌ Wave 0 |
| EXTRA-01 | amount from class rate x blocks in row currency; "other" cap; strict schema (currency in body = 400); GNet -> 422 `action_not_allowed`; non-completed -> 422; double click = one charge (same key); decline unlocks, no retry; ledger rows `admin_action` then `extra_charged`/`extra_failed` | route+engine (fake DB + fake Stripe) | `npx vitest run tests/extra-charge.test.ts tests/admin-extra-route.test.ts` | ❌ Wave 0 |
| EXTRA-01 | webhook: `card_extra` succeeded -> observation row; failed -> NOT `handleHoldFailed`; `charge.refunded` on an extra does not cancel a completed booking | unit | `npx vitest run tests/extra-webhook.test.ts tests/payments-fee-webhook.test.ts` | ❌ / ✅ |
| EXTRA-01 | ledger vocabulary vs migration; single-writer gate still green; payment email copy parity 7 locales | text | `npx vitest run tests/payments-state.test.ts tests/payment-state-writers-gate.test.ts tests/payments-copy-i18n.test.ts tests/payments-consent.test.ts` | ✅ (update) |
| i18n | new `Booking.*` keys in all 7 locales, no stubs | text | `npx vitest run tests/i18n-completeness.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** the single new/updated test file(s) of that task (`npx vitest run <files>`), plus `npx tsc --noEmit` filtered to changed files.
- **Per wave merge:** the grouped commands above for the wave, plus `tests/payment-state-writers-gate.test.ts`, `tests/payments-state.test.ts`, `tests/i18n-completeness.test.ts`.
- **Phase gate:** full `npx vitest run` + the `verify` skill in `pre-pr` mode green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/helpers/fake-payments-db.ts`: add tables `booking_stops` and `booking_extra_charges` to `TABLES`, defaults and CHECK emulation (pattern of `booking_fee_cases`, lines ~92-210 and ~544-560).
- [ ] A shared route-distance mock (e.g. `tests/helpers/route-distance-mock.ts`) and updates to the ~8 existing tests that pass a client `distanceKm`.
- [ ] `tests/stops-fee.test.ts`, `tests/airport-pickup.test.ts`, `tests/route-distance.test.ts` (pure/fetch-mock, written RED first).
- [ ] `LEDGER_KINDS` + migration CHECK parity for `extra_charged`, `extra_failed`.
- [ ] Framework install: none.

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` -> included. This phase is security-relevant (roadmap) and closes a price-tampering gap; use the `security:` commit prefix after tests pass.

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (operator charge) | `getAdminUser()` first, 401/403; no new public auth surface |
| V3 Session Management | no change | existing Supabase session |
| V4 Access Control | yes | admin-only extra route; driver page remains token-scoped (add only display fields; never an amount); partner (GNet) excluded by `isPartnerBooking`/`assertMoneyEligible`; deny-all RLS on both new tables |
| V5 Input Validation | yes | zod: stops array `.max(5)`, lat/lng ranges, `waitMinutes` int multiple of 15 `0..120`, address length + `NO_LINE_BREAKS`, landing date/time regex, offset whitelist, `strictObject` on the operator route, body size caps (calculate-price 6 KB -> raise modestly for stops; checkout 16-50 KB already enough: 5 stops x ~600 B) |
| V6 Cryptography | no | none new; Stripe keys/idempotency only |
| V7/V8 Error handling & data protection | yes | logs carry ids/codes only; operator free text only on the deny-all row; erasure clears stop addresses |
| V13 API | yes | rate limits: `/api/calculate-price` 30, `/api/card-checkout/init` 30, `/intent` 10, `/api/create-payment-intent` 10 [VERIFIED: lib/rate-limit.ts:22-29]; add a limit key for the new admin route is optional (admin-authenticated) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Browser sends low `distanceKm`/amount/`isAirport=false` | Tampering | Server recompute from coordinates; ignore client values; `displayedAmountMinor` is a cross-check only (409) |
| Coordinates not matching the address text (client sends nearby coords, far address) | Tampering | Residual risk (no server geocoding today). Mitigate cheaply: driver and admin see address AND the route; optionally validate stop/origin/destination lie in a coverage zone (reuse `coverage_zones` check from calculate-price L209-221, currently absent at checkout). Document as accepted residual risk or add zone check |
| Stop-count / repeated calls to burn the Google quota (cost/DoS) | DoS / cost | cap 5 (schema `.max(5)` server-side, not only UI), stays Essentials (<=10 waypoints, no traffic pref), existing per-IP rate limits, body size caps, fail closed with 503, no raw-address cache; checkout adds ~2 Routes calls per booking (init + intent) |
| Operator charge without authorization / by non-admin | Elevation | `getAdminUser`, guard order, `allowedPaymentActions` re-check on a fresh row |
| Double charge (double click, retry, two operators) | Tampering | `admin_action` ledger first, CAS `pending -> charging`, deterministic Stripe key from row id + attempt (never the amount), amount locked at first click, one in-flight charge per booking, unique ledger `event_key` per outcome |
| Overlarge or negative amount | Tampering | integer minor units > 0, currency from the booking row not the body, cap = booked amount (cumulative), waiting amount computed server-side from rates snapshot, UI validation is convenience only |
| Extra charge on GNet/partner booking | Elevation | `isPartnerBooking` returns `[]` actions; engine re-checks `assertMoneyEligible` |
| Extra PaymentIntent mistaken for the booking's payment (refund cancels a completed trip, hold-failure handler runs) | Tampering / Repudiation | explicit `card_extra` routing; never write the PI to `bookings.payment_intent_id`; status guard already present on `charge.refunded` |
| Charge not covered by cardholder consent | Repudiation (dispute) | consent wording + version gate (Pitfall 12 / OQ2); client email with breakdown (D-10) |
| Stop addresses retained after erasure | Information disclosure | erasure migration clears `booking_stops`, extra `description` |
| PII in logs / ledger | Information disclosure | ids and codes only; operator text never in the ledger or client email (existing T-89-13/22 rule) |

## Sources

### Primary (HIGH confidence)
- Repository files read this session (paths and line numbers cited inline): `app/api/calculate-price/route.ts`, `lib/checkout/compute.ts`, `app/api/create-payment-intent/route.ts`, `app/api/card-checkout/{init,intent}/route.ts`, `lib/payments/{checkout,config,state,stripe,settle,fee,actions}.ts`, `lib/stripe-webhook/{dispatch,charge-events}.ts`, `lib/server-pricing.ts`, `lib/pricing.ts`, `lib/pricing-config.ts`, `lib/pricing-helpers.ts`, `lib/route-prices.ts`, `lib/no-show.ts`, `lib/no-show-wait.ts`, `lib/airport.ts`, `lib/supabase.ts`, `lib/booking-store.ts`, `types/booking.ts`, wizard components, `app/api/admin/{pricing,flight-refresh,bookings,bookings/[id]/fee}`, `app/api/cron/flight-refresh/route.ts`, driver trip page, `lib/email.ts`, `lib/google-calendar.ts`, migrations 063, 071, 087, 088, tests and helpers, `vercel.json`, `messages/en.json`.
- Context7 was not used (MCP needs authorization this session); official docs fetched directly:
- https://developers.google.com/maps/documentation/routes/usage-and-billing (SKU tiers, waypoint billing)
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes (intermediates limit, legs, distanceMeters)
- https://developers.google.com/maps/documentation/routes/reference/rest/v2/RoutingPreference (UNSPECIFIED = TRAFFIC_UNAWARE)
- https://developers.google.com/maps/billing-and-pricing/pricing (Essentials 10,000 free then $5.00/1,000; Pro 5,000 free then $10.00/1,000)

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` (C2, C4, C5, C10, M8) and `FEATURES.md` § E, cited from the in-repo milestone research (Stripe overcapture/hold facts were verified there against Stripe docs on 2026-11-02).

### Tertiary (LOW confidence)
- Legal reading of consent sufficiency for post-trip extras (A2): training-knowledge reasoning, needs the owner's decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every module named was read.
- Architecture: HIGH — price path, webhook routing, display surfaces, migration number all verified in code.
- Google behaviour: HIGH for SKU/limits (official docs), MEDIUM for "field mask does not matter".
- Pitfalls: HIGH for repo-specific ones (dead cron filter, consent text, webhook failed-kind fallthrough); MEDIUM for legal/consent reasoning.

**Research date:** 2026-11-11
**Valid until:** 2026-12-11 (repo moves fast between phases; re-check `ls supabase/migrations` and the Google pricing page before the plan is executed)

## Project Constraints (from CLAUDE.md)

- Brand spelling Prestigo / rideprestigo.com; Next.js App Router + next-intl (en, ru, es, fr, ar, hi, zh), Supabase, Stripe, Resend, Vercel (merge to `main` = production).
- Type check `npx tsc --noEmit` (baseline 8 old errors in `tests/` only); lint `npx eslint --quiet <files>`; tests `npx vitest run [files]`; `vitest related` crashes (grep `tests/`); full gate = the `verify` skill; dev server via `preview_start` name `prestigo`, never `npm run dev` in Bash.
- No hard-coded `€` prices in `app/` or `components/` (rates from `lib/route-prices.ts`, `lib/pricing-config.ts`, `lib/airport-promo.ts`; pre-commit enforces). Waiting rates therefore come from admin/API; the stop UI shows API-returned numbers only.
- No secrets or `.env*` in commits; never read `.env.local`.
- Marketing content has no prices (not touched by this phase).
- `middleware.ts` matcher must exclude every static extension (not touched; do not add routes that need static files).
- New EN strings in `messages/en.json` need real translations in all other locales; never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil`.
- Security work (auth, CSRF, validation, rate limits): run tests, commit with `security:` prefix (this phase's pricing/charge work qualifies).
- Vercel Preview deploys always fail (missing Supabase env) — non-blocking.
- Additional memory rules relevant here: executors have no Supabase MCP (orchestrator applies migrations); re-REVOKE `FROM PUBLIC, anon, authenticated` after any `CREATE OR REPLACE` of a SECURITY DEFINER function; never create a Supabase client during render; pages use `params.locale` + `setRequestLocale`.

## Suggested Plan / Wave Breakdown

**Wave 0 (foundation, nothing user-visible)**
- 91-01: migration 089 (tables, columns, rate column, ledger kinds, erasure, trigger) written; pure modules `lib/stops.ts`, `lib/airport-pickup.ts`; fake-DB/helper updates; RED tests for fee table, landing->pickup (DST), migration text. Orchestrator applies 089 live and smokes.

**Wave 1 (server authority; `security:` commits)**
- 91-02: `lib/route-distance.ts`, refactor `/api/calculate-price` (stops + waiting + skip intercity + drop `extraStops`), `priceCheckout` (server distance, airport detection, stops, waiting, landing->pickup validation), `buildCheckoutMeta`, three routes use `priced.distanceKm`; checkout body schema (typed `stops`, `landing*`); update ~8 existing tests.
- 91-03: persistence: `lib/booking-stops.ts` (`saveBookingStops` replace-all, loader, attach), `buildBookingRow` landing columns, wire card/cash/pay-now captures; admin pricing (`getPricingConfig`, PUT schema, `PricingForm` waiting-rate field, D-05 null).

**Wave 2 (client + display)**
- 91-04: wizard: store (stop wait setter, landing/offset), `StopItem` rewired, EntryBar/Step 1-2 airport landing + offset UI with plain-language timeline, Step3 request + per-class waiting availability, `PriceSummary`/`BookingSummaryBlock`/`StickyBookingPanel` waiting line, `RouteMap` waypoints (sum legs), both Step 6 body builders; i18n 7 locales.
- 91-05: display surfaces: admin panel + list/dispatch attach, driver trip page (+ free-wait-until), email builders (confirmation, status, driver assignment, reminders), calendar description; trip-edit guard for bookings with stops (Pitfall 10).

**Wave 3 (operator money + flight)**
- 91-06: EXTRA-01 engine `lib/payments/extra.ts`, route `app/api/admin/bookings/[id]/extra`, `allowedPaymentActions` + admin GET, webhook `card_extra` routing, ledger kinds, localized `extra_charged` email, `PaymentPanel` modal; consent wording + version bump + gate if the owner agrees (OQ2).
- 91-07: D-08 `applyLandingChange` + admin refresh button (+ cron fix if owner agrees, OQ1).

**Wave 4:** security review tests (tampering matrix, double-charge, GNet), full suite, `verify pre-pr`, owner-run live Stripe proof of one extra charge, UAT of the wizard (stops + airport on desktop and mobile).
