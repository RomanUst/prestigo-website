---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Pricing & Booking Management
status: unknown
stopped_at: "Completed 21-01-PLAN.md"
last_updated: "2026-04-03T17:43:15Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 9
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03 — v1.3 roadmap created)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 21 — pricing-enhancements-holiday-dates-minimum-fare

## Current Position

Phase: 21 (pricing-enhancements-holiday-dates-minimum-fare) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity (v1.3):**

- Total plans completed: 2
- Average duration: 4 min
- Total execution time: 0.13 hours

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
- [Phase 20-02]: Cancel endpoint uses module-level stripe constant (not lazy factory) — required for vi.mock interception at import time in tests
- [Phase 20-02]: Stripe refund issued BEFORE DB update — if refund succeeds but DB fails, logs orphaned refund_id for manual recovery
- [Phase 20-02]: charge.refunded webhook updates booking status to cancelled by matching payment_intent_id
- [Phase 20-03]: Phase 20 accepted with partial verification — Stripe-paid cancel path and charge.refunded webhook tested by unit tests only; no Stripe-paid bookings available in dev at verification time
- [Phase 21-01]: Night coefficient takes precedence over holiday when both flags true — `isNight ? nightCoefficient : isHoliday ? holidayCoefficient : 1.0`
- [Phase 21-01]: isHolidayDate and applyGlobals exported from calculate-price route.ts for direct unit testing without HTTP layer
- [Phase 21-01]: minFare applied as final Math.max after coefficient and airport fee — floor is always the last operation
- [Phase 21-01]: revalidateTag('pricing-config', 'max') missing from admin PUT — added as Rule 1 bug fix

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1` for v1.3; schedule upgrade immediately after v1.3 ships.
- **Phase 20 (refund flow — done):** `charge.refunded` webhook handler implemented in 20-02. Full end-to-end test of Stripe-paid cancel + webhook deferred to staging; unit tests pass.

## Session Continuity

Last session: 2026-04-03T17:43:15Z
Stopped at: Completed 21-01-PLAN.md
Resume file: .planning/phases/21-pricing-enhancements-holiday-dates-minimum-fare/21-02-PLAN.md
