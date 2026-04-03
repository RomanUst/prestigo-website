---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Pricing & Booking Management
status: unknown
stopped_at: "Completed 18-01-PLAN.md"
last_updated: "2026-04-03T10:50:06Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03 — v1.3 roadmap created)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 18 — schema-foundation-zone-logic-fix

## Current Position

Phase: 18 (schema-foundation-zone-logic-fix) — EXECUTING
Plan: 2 of 2 (18-01 complete; 18-02 awaiting Supabase migration apply)

## Performance Metrics

**Velocity (v1.3):**

- Total plans completed: 1
- Average duration: 3 min
- Total execution time: 0.05 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0–v1.2 decisions logged in PROJECT.md Key Decisions table.

Recent decisions affecting v1.3:

- Phase 18: Zone OR-logic fix — rename `isOutsideAllZones` to `isInAnyZone`, write 4-case unit test before touching production
- Phase 21: Holiday dates stored as JSONB key in `pricing_config` — no per-date metadata needed for v1.3
- Phase 22: Promo race condition — atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id` pattern; server re-validates promo independently, never trusts client-provided amount
- [Phase 18-01]: isInAnyZone in lib/zones.ts is single source of truth — turf imports removed from route.ts and test file
- [Phase 18-01]: quoteMode triggers only when BOTH origin AND destination are outside all active zones (was: either outside)
- [Phase 18]: CHECK constraints added on bookings.status and bookings.booking_source for DB-level enum enforcement
- [Phase 18]: No extra index on promo_codes.code — UNIQUE constraint creates one implicitly

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1` for v1.3; schedule upgrade immediately after v1.3 ships.
- **Phase 20 (refund flow):** `charge.refunded` webhook handler needed so Stripe Dashboard refunds also update local booking status. Design deduplication logic (idempotent UPSERT) before coding Phase 20.

## Session Continuity

Last session: 2026-04-03T10:50:06Z
Stopped at: Completed 18-01-PLAN.md
Resume file: None
