---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Return Transfer Booking
status: ready_to_plan
stopped_at: roadmap created — Phase 23 ready to plan
last_updated: "2026-04-04T00:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04 after v1.4 milestone started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 23 — Database Schema Foundation

## Current Position

Phase: 23 of 28 (Database Schema Foundation)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-04 — ROADMAP.md created; v1.4 phases 23–28 defined

Progress: [░░░░░░░░░░] 0% (v1.4 milestone)

## Accumulated Context

### Decisions

All decisions from v1.0–v1.3 logged in PROJECT.md Key Decisions table.

Key v1.4 architectural decisions (from research):
- Composite UNIQUE `(payment_intent_id, leg)` replaces single-column UNIQUE — preserves idempotency for webhook replays; real Stripe IDs stay in the column
- Atomic RPC `create_round_trip_bookings` for two-row insert — sequential JS inserts are not atomic on Vercel serverless
- Symmetric distance assumption — return `distanceKm` equals outbound; no second Google Routes API call
- Extras apply to outbound leg only — child seat and meet & greet are one-time charges
- Promo discount applied once to combined total (outbound + discounted return), not per leg

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real round-trip payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1`.
- **submit-quote.test.ts:** Pre-existing failures from Phase 5 (not regressions).
- **Research flag — Phase 25:** Inspect `Step3Vehicle.tsx` and current `quoteMode` fetch behavior before implementing combined price display. Confirm whether vehicle-class switch triggers re-fetch of both legs together.
- **Research flag — Phase 28:** Verify Stripe behavior when `stripe.refunds.create` is called with an `amount` exceeding remaining refundable balance before building the partial-cancel endpoint.

## Session Continuity

Last session: 2026-04-04
Stopped at: Roadmap created — 6 phases (23–28) defined; ready to plan Phase 23
Resume file: None
