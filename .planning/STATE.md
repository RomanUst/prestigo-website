---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Return Transfer Booking
status: defining_requirements
stopped_at: requirements definition
last_updated: "2026-04-04T00:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-04 after v1.4 milestone started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Milestone v1.4 — Return Transfer Booking

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-04 — Milestone v1.4 started

## Accumulated Context

### Decisions (carried from v1.3)

All decisions from v1.0–v1.3 logged in PROJECT.md Key Decisions table.

Notable v1.3 decisions carried forward:
- Night coefficient takes precedence over holiday when both flags true
- Cancel-before-DB pattern for Stripe refunds (refund first, DB update on success)
- Promo validation: soft `validate-promo` (UX feedback) + atomic `claim_promo_code` RPC (race safety)
- Promo state not persisted to sessionStorage — ephemeral per booking session
- Fixed sidebar requires `md:ml-[280px]` on main — sidebar does not push flex layout

### v1.4 Scoping Decisions

- Round Trip = 6th trip type in Step 1 (not a post-booking add-on)
- Two linked Supabase records per round-trip (return_for_booking_id FK)
- Single Stripe PaymentIntent for combined total
- One confirmation email, both legs listed
- Return discount % = operator-configured in admin pricing settings
- Discount shown to client in Step 3 and Step 6

### Pending Todos

None.

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real payments.
- **Stripe v22.0.0:** Released 2026-04-03 with breaking changes — stay pinned to `^21.0.1`.
- **submit-quote.test.ts:** Pre-existing failures from Phase 5 (not regressions from v1.3 work).
- **payment_intent_id UNIQUE constraint:** Round-trip creates two Supabase records sharing one PaymentIntent — need to handle uniqueness (e.g. suffix return record's stored value or relax constraint with composite unique).

## Session Continuity

Last session: 2026-04-04
Stopped at: Defining requirements for v1.4
