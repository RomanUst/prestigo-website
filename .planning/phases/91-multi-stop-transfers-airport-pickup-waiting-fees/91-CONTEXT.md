# Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees - Context

**Gathered:** 2026-11-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Clients book a transfer with intermediate stops and a chosen waiting time per stop, at a price the server computes; an airport pickup is timed after landing; the operator can bill waiting beyond what was booked (or another extra) to the saved card as a separate charge. Covers STOP-01..STOP-05 and EXTRA-01.

Not in scope: automatic overage charging from driver timestamps (always operator-approved), stops for hourly / daily bookings, stops inside quotes (Phase 92) or day trips (Phase 93), any change to GNet bookings (extra charges are never offered for them).

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap / prior phases, not re-asked)
- The server is the price authority: distance through all stops is recomputed on the server; a `distanceKm` or price sent by the browser is ignored. This closes the current gap where `distanceKm` is trusted from the client. Security work: tests, `security:` commit prefix.
- First 15 minutes of waiting at each stop are free; each further 15 minutes costs a fee set in admin; billed per started 15-minute block (v5.0 research, FEATURES.md § E).
- Pre-selected waiting is part of the booking total, so it is inside the card hold. Anything beyond it is a separate off-session charge on the saved card (a hold cannot grow), recorded in the payment ledger, operator-approved, never automatic, never for GNet.
- Airport free waiting stays 60 minutes and city 30 minutes, from the live settings `noshow_wait_airport_min` / `noshow_wait_city_min` (Phase 89). For an airport pickup the 60 minutes count from the pickup time, not the landing time.
- All times are Prague time, DST-safe (same helpers and DST test dates as Phase 90).
- No hard-coded prices in `app/` or `components/`; every rate comes from admin (`pricing_globals` / pricing config).
- New client-facing strings need real translations in all 7 locales.
- The operator's extra-charge action lives in the shared booking panel from Phase 90 (`BookingDetailPanel`).
- Expected migration `booking_stops`, waiting rates in pricing globals, separate landing and pickup times. The roadmap says 087, but 085–088 exist; the next free number is 089 (verified in `supabase/migrations/` on 2026-11-11).

### Price with stops
- **D-01:** When a transfer has at least one stop, the price is recalculated by kilometres through all points (origin → stops in order → destination) at the per-km tariff. A fixed route price from admin is not used for a trip with stops. Owner's words: "пересчитываются км и плата за остановку в зависимости сколько времени остановка". Confirmed by the owner on 2026-11-11: the whole trip by km, not "fixed price + detour". — **Reversibility:** costly — changing to "fixed + detour" later touches the pricing route, the booking snapshot and the price summary.
- **D-02:** There is no flat fee per stop. A stop costs only its extra kilometres plus paid waiting by duration. The existing flat `extraStops × EXTRA_STOP_PRICE` add-on in `app/api/calculate-price/route.ts` is replaced by this model for transfers.
- **D-03:** A transfer without stops is priced exactly as today (fixed route price where one exists).

### Waiting fee
- **D-04:** The waiting fee per extra 15 minutes is set per vehicle class in admin (Business, First Class, Business Van), next to the hourly rates.
- **D-05:** Until a class has a rate set, paid waiting is not offered for that class (the client can only keep the free 15 minutes). No default amount is typed into code or a migration.
- **D-06:** The client picks the waiting time per stop in 15-minute steps; the price summary shows waiting as its own line.

### Airport pickup
- **D-07:** For an airport pickup the client enters the landing time and picks an offset: pickup 0 / 15 / 30 / 45 / 60 / 90 minutes after landing, default 30. Both the landing time and the resulting pickup time are stored and shown to the driver, in admin and in the confirmation email.
- **D-08:** When the flight is delayed and the landing time changes, the pickup time moves with it (landing + offset) — by an operator button, see D-11.

### Extra charge after the trip (EXTRA-01)
- **D-09:** In the booking panel the operator can add: (a) extra waiting — enters minutes, the amount is computed from the class rate in admin; (b) "other" — a description and an amount typed by hand (parking, extra km).
- **D-10:** The charge goes to the saved card as a separate off-session payment, is written to the payment ledger, and the client gets an email with the breakdown. The operator sees the amount and confirms before anything is charged.

### Decisions after research (owner, 2026-11-11)
- **D-11:** Flight delay: the operator moves the pickup with a button in the booking panel ("Move pickup to HH:MM" = new landing + the stored offset). Nothing moves without a person; the driver and the client are notified as for a normal time edit. No automatic move by the flight-refresh cron in this phase.
- **D-12:** The card-consent text gets a sentence that covers a charge for waiting beyond the booked time and for agreed extras, in all 7 locales, with a new consent version. An extra charge is allowed only on bookings made under the new consent version (server-enforced gate). — **Reversibility:** costly — the consent version is stored with every booking and gates a money action.
- **D-13:** No upper cap on the "other" amount. The safeguard is the confirm step that states the amount before the charge (plus the technical guards in Claude's Discretion: double-submit guard, idempotency key, positive integer amount, Stripe's own limits).
- **D-14:** Waiting is charged at the plain per-class rate at any time: no night, holiday, airport or minimum-fare coefficient on waiting. A promo code reduces the whole booking total, waiting included.

### Decided by Claude from the research recommendations (owner may override)
- **D-15:** An extra charge is offered only when the booking is completed, has a saved card (card hold captured, or cash with card guarantee), is not pay-now without a saved card and is not a GNet booking.
- **D-16:** Extra waiting entered by the operator is billed as ceil(minutes / 15) × the class rate, with no further free deduction (the operator enters only the billable minutes). The same per-class rate applies to waiting at pickup beyond the free 30 / 60 minutes.
- **D-17:** Stop cap is 5 (already the store's cap; Google Routes Essentials tier; never set routingPreference, departureTime, optimizeWaypointOrder or via). If Google routing fails at checkout the server fails closed (503), it never falls back to a client distance.
- **D-18:** `pickup_date` / `pickup_time` stay the pickup (landing + offset); landing is stored as new columns. Hold timing, cancellation windows, no-show wait, calendar, dispatch and reminders keep reading the pickup.

### Claude's Discretion
- The maximum waiting per stop.
- Airport detection (which addresses count as an airport pickup) — reuse `isAirportPickup` where it fits.
- Stop UI in the booking wizard (add, reorder, remove), map rendering of the route through stops, mobile layout.
- Where the paid-waiting line and the stop list appear in admin, on the driver trip page and in emails.
- Technical safeguards on the "other" amount (double-submit guard, idempotency key; no business cap, D-13), and what happens when the off-session charge fails (surface to the operator, no retry loop).
- Rounding of the recomputed price (reuse the existing rounding).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 91 — goal, five success criteria, research and planning notes
- `.planning/REQUIREMENTS.md` — STOP-01..STOP-05, EXTRA-01
- `CLAUDE.md` — hard rules (prices from admin only, i18n, security commits, migrations)

### Milestone research
- `.planning/research/FEATURES.md` § E "Multi-stop and waiting time, airport offset" and the capture / overcapture notes (lines 25, 98–105, 142, 158, 208, 247)
- `.planning/research/PITFALLS.md` — `charge.refunded` and partial-refund pitfalls that touch a second charge
- `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`

### Prior phase decisions this phase builds on
- `.planning/phases/89-*/89-CONTEXT.md` — cancellation policy, cash guarantee, no-show waits (`noshow_wait_city_min`, `noshow_wait_airport_min`), saved-card off-session charging
- `.planning/phases/88-*/88-CONTEXT.md` — card on file, hold, capture, payment ledger
- `.planning/phases/90-dispatch-views/90-CONTEXT.md` and `90-SECURITY.md` — shared booking panel, single move planner, Prague-time helpers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/calculate-price/route.ts` — server pricing; already calls Google routing for distance and has an `extraStops` count (0–5) with a flat add-on to replace.
- `lib/pricing-config.ts`, `lib/route-prices.ts` — admin-sourced rates; the place for per-class waiting rates.
- `lib/no-show.ts`, `lib/no-show-wait.ts` — `isAirportPickup`, wait thresholds.
- `components/booking/RouteMap.tsx` — map in the booking wizard.
- `components/admin/BookingDetailPanel.tsx`, `components/admin/useBookingMoves.tsx` — panel and dialog pattern for money actions (in-flight ref, confirm before send).
- `lib/prague-date.ts`, `lib/prague-calendar.ts` — Prague-time helpers.
- `app/api/admin/flight-refresh` — flight status refresh, the hook for D-08.

### Established Patterns
- Money actions: dialog states the effect and amount, PATCH/POST only from the primary button, compare-and-set on the server, ledger row per money event.
- Zod two-step parse (400 vs 422), `getAdminUser()` first on admin routes, rate limits on public routes.
- Migrations: next free number, `REVOKE ... FROM PUBLIC, anon, authenticated` after any `SECURITY DEFINER` function.

### Integration Points
- Booking wizard (entry bar, price bar, summary), `create-payment-intent` / card-checkout routes (the hold amount must include pre-selected waiting), booking insert, confirmation email, driver trip page, admin list / board / calendar / panel.

</code_context>

<specifics>
## Specific Ideas

- Owner example for the airport: landing 14:00, pickup 14:30; free 60 minutes count from 14:30.
- Stops are priced "by kilometres and by how long the stop is" — no flat per-stop fee.

</specifics>

<deferred>
## Deferred Ideas

- Automatic pickup move from the flight-refresh cron (its filter `trip_type IN ('airport_arrival','airport_departure')` matches no booking today and it runs once a day) — backlog, separate task.

- Overage suggestion from driver stop timestamps (driver taps "arrived at stop" / "left stop") — needs new driver steps; the operator enters minutes by hand in this phase.

</deferred>

---

*Phase: 91-Multi-Stop Transfers, Airport Pickup & Waiting Fees*
*Context gathered: 2026-11-11*
