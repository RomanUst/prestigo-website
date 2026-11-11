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
- Expected migration `booking_stops`, waiting rates in pricing globals, separate landing and pickup times. The roadmap says 087; the next free number is 084 (migrations 081–083 are the latest live) — the planner uses the next free number.

### Price with stops
- **D-01:** When a transfer has at least one stop, the price is recalculated by kilometres through all points (origin → stops in order → destination) at the per-km tariff. A fixed route price from admin is not used for a trip with stops. Owner's words: "пересчитываются км и плата за остановку в зависимости сколько времени остановка". (Interpretation by Claude: full per-km recalculation, not "fixed price + detour".) — **Reversibility:** costly — changing to "fixed + detour" later touches the pricing route, the booking snapshot and the price summary.
- **D-02:** There is no flat fee per stop. A stop costs only its extra kilometres plus paid waiting by duration. The existing flat `extraStops × EXTRA_STOP_PRICE` add-on in `app/api/calculate-price/route.ts` is replaced by this model for transfers.
- **D-03:** A transfer without stops is priced exactly as today (fixed route price where one exists).

### Waiting fee
- **D-04:** The waiting fee per extra 15 minutes is set per vehicle class in admin (Business, First Class, Business Van), next to the hourly rates.
- **D-05:** Until a class has a rate set, paid waiting is not offered for that class (the client can only keep the free 15 minutes). No default amount is typed into code or a migration.
- **D-06:** The client picks the waiting time per stop in 15-minute steps; the price summary shows waiting as its own line.

### Airport pickup
- **D-07:** For an airport pickup the client enters the landing time and picks an offset: pickup 0 / 15 / 30 / 45 / 60 / 90 minutes after landing, default 30. Both the landing time and the resulting pickup time are stored and shown to the driver, in admin and in the confirmation email.
- **D-08:** When the flight is delayed and the landing time changes, the pickup time moves with it (landing + offset).

### Extra charge after the trip (EXTRA-01)
- **D-09:** In the booking panel the operator can add: (a) extra waiting — enters minutes, the amount is computed from the class rate in admin; (b) "other" — a description and an amount typed by hand (parking, extra km).
- **D-10:** The charge goes to the saved card as a separate off-session payment, is written to the payment ledger, and the client gets an email with the breakdown. The operator sees the amount and confirms before anything is charged.

### Claude's Discretion
- Maximum number of stops (research suggests 5; keep the Google Routes Essentials SKU) and the maximum waiting per stop.
- Airport detection (which addresses count as an airport pickup) — reuse `isAirportPickup` where it fits.
- Stop UI in the booking wizard (add, reorder, remove), map rendering of the route through stops, mobile layout.
- Where the paid-waiting line and the stop list appear in admin, on the driver trip page and in emails.
- Limits and safeguards on the "other" amount (upper bound, double-submit guard, idempotency key), and what happens when the off-session charge fails (surface to the operator, no retry loop).
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

- Overage suggestion from driver stop timestamps (driver taps "arrived at stop" / "left stop") — needs new driver steps; the operator enters minutes by hand in this phase.

</deferred>

---

*Phase: 91-Multi-Stop Transfers, Airport Pickup & Waiting Fees*
*Context gathered: 2026-11-11*
