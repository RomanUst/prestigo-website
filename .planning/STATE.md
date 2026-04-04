---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Return Transfer Booking
status: unknown
stopped_at: Completed 24-02-PLAN.md — ROUND TRIP tab added, swap icon guard, canProceed guard, 5 TripTypeTabs tests passing
last_updated: "2026-04-04T19:28:20.103Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04 after v1.4 milestone started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 24 — types-zustand-store-step-1-round-trip

## Current Position

Phase: 24 (types-zustand-store-step-1-round-trip) — COMPLETE
Plan: 2 of 2 (all plans complete)

## Accumulated Context

### Decisions

All decisions from v1.0–v1.3 logged in PROJECT.md Key Decisions table.

Key v1.4 architectural decisions (from research):

- Composite UNIQUE `(payment_intent_id, leg)` replaces single-column UNIQUE — preserves idempotency for webhook replays; real Stripe IDs stay in the column
- Atomic RPC `create_round_trip_bookings` for two-row insert — sequential JS inserts are not atomic on Vercel serverless
- Symmetric distance assumption — return `distanceKm` equals outbound; no second Google Routes API call
- Extras apply to outbound leg only — child seat and meet & greet are one-time charges
- Promo discount applied once to combined total (outbound + discounted return), not per leg
- [Phase 23-database-schema-foundation]: Composite UNIQUE(payment_intent_id, leg) replaces single-column UNIQUE for round-trip support
- [Phase 23-database-schema-foundation]: linked_booking_id uses ON DELETE SET NULL — cancelling one leg does not delete the partner
- [Phase 24-01-types-store]: returnTime cleared conditionally in setTripType via spread — only when switching away from round_trip
- [Phase 24-01-types-store]: returnDate shared between daily hire and round_trip — setTripType never clears returnDate
- [Phase 24-01-types-store]: returnTime persisted to sessionStorage via partialize alongside returnDate
- [Phase 24-02-ui-tab]: returnTime excluded from canProceed guard — return time UI deferred to Phase 25 to avoid blocking round_trip users with no input available

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real round-trip payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1`.
- **submit-quote.test.ts:** Pre-existing failures from Phase 5 (not regressions).
- **Research flag — Phase 25:** Inspect `Step3Vehicle.tsx` and current `quoteMode` fetch behavior before implementing combined price display. Confirm whether vehicle-class switch triggers re-fetch of both legs together.
- **Research flag — Phase 28:** Verify Stripe behavior when `stripe.refunds.create` is called with an `amount` exceeding remaining refundable balance before building the partial-cancel endpoint.

## Session Continuity

Last session: 2026-04-04T21:32:00.000Z
Stopped at: Completed 24-02-PLAN.md — ROUND TRIP tab added, swap icon guard, canProceed guard, 5 TripTypeTabs tests passing
Resume file: None
