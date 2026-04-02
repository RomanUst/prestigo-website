---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Operator Dashboard
status: unknown
stopped_at: Completed 12-01-PLAN.md — pricing data layer implemented
last_updated: "2026-04-02T06:35:59.849Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 4
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01 — Milestone v1.2 started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 12 — core-booking-flow-update

## Current Position

Phase: 12 (core-booking-flow-update) — EXECUTING
Plan: 2 of 2

## Accumulated Context

All decisions from v1.0 and v1.1 are logged in PROJECT.md Key Decisions table.

### Pending Todos

None.

### Key Decisions (Phase 10)

- @supabase/ssr async server client uses await cookies() — required for Next.js 15+/16 async dynamic API
- updateSession() calls getUser() not getSession() — validates JWT with auth server
- No redirect logic in Phase 10 middleware — deferred to Phase 13 to avoid infinite loops
- NEXT_PUBLIC_SUPABASE_ANON_KEY is placeholder — must be retrieved from Supabase Dashboard before Phase 13
- lib/supabase.ts (service-role client) left completely untouched

### Blockers/Concerns

- **Stripe test mode:** All Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`). Must swap to live keys before accepting real payments. Stripe webhook (`we_1THKa5FoizgdF9t9hz08WxJ9`) also created in test mode — needs a live-mode webhook.
- **Node 16 / vitest 4.x:** `npx vitest run` fails in Node 16 shell — use `nvm use 22` first. Pre-existing, does not affect production build.
- **NEXT_PUBLIC_SUPABASE_ANON_KEY:** Placeholder value in .env.local — must retrieve real anon key from Supabase Dashboard before Phase 13 auth UI works.
- **Pre-existing TS error:** tests/health.test.ts:95 Mock type mismatch — pre-existing, out of scope, does not affect build or test runtime.

### Last session

Stopped at: Completed 12-01-PLAN.md — pricing data layer implemented

### Key Decisions (Phase 12 — Plan 01)

- Rates interface uses Record<string, number> (not Record<VehicleClass, number>) — DB returns plain strings, not VehicleClass union
- Internal rate constants (RATE_PER_KM etc.) kept in pricing.ts as seed reference docs but not exported
- unstable_cache key ['pricing-config'] matches tag — enables targeted revalidation from Phase 14 admin PUT route
- Supabase NUMERIC columns return strings — Number() cast required in getPricingConfig to prevent arithmetic bugs

### Key Decisions (Phase 11)

- Migrations applied via Supabase MCP (not CLI) — functionally equivalent, no CLI auth setup needed
- pricing_globals singleton enforced via CHECK (id = 1) constraint — prevents accidental duplicate row
- coverage_zones seeded empty — operator draws zones via admin UI in Phase 16
- airport_fee=0, night_coefficient=1.0, holiday_coefficient=1.0 — zero/unity defaults preserve current pricing behavior exactly
