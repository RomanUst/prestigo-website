---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Pricing & Booking Management
status: unknown
stopped_at: Completed 20-01-PLAN.md
last_updated: "2026-04-03T15:52:32.914Z"
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 7
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03 — v1.3 roadmap created)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 20 — manual-booking-cancellation-with-refund

## Current Position

Phase: 20 (manual-booking-cancellation-with-refund) — EXECUTING
Plan: 1 of 3

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
- [Phase 19-01]: UUID format in tests must match Zod v4 strict pattern — aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee fails, use valid v4 UUIDs in test payloads
- [Phase 19-01]: Notes-only PATCH skips current-status SELECT query — no FSM check when status field absent
- [Phase 19-02]: Optimistic update for status changes — mutate local state immediately, no re-fetch after PATCH success
- [Phase 19-02]: alert() for status update failures in admin — single-operator v1.3, no toast infrastructure needed
- [Phase 19-02]: localNotes seeded from fetched data only when booking not in local edit state — preserves in-flight edits on re-fetch
- [Phase 20]: generateBookingReference extracted to shared lib/booking-reference.ts
- [Phase 20]: Cancel endpoint uses lazy getStripe() factory for Vitest compatibility (no static method calls at module load)
- [Phase 20]: booking_source 'online' | 'manual' field in Booking interface — MANUAL amber badge in REF column of BookingsTable

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1` for v1.3; schedule upgrade immediately after v1.3 ships.
- **Phase 20 (refund flow):** `charge.refunded` webhook handler needed so Stripe Dashboard refunds also update local booking status. Design deduplication logic (idempotent UPSERT) before coding Phase 20.

## Session Continuity

Last session: 2026-04-03T15:52:32.908Z
Stopped at: Completed 20-01-PLAN.md
Resume file: None
