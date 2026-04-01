---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Operator Dashboard
status: unknown
stopped_at: Phase 11 complete — Phase 12 (Core Booking Flow Update) is next
last_updated: "2026-04-01T22:00:03.711Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01 — Milestone v1.2 started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 11 — database-schema

## Current Position

Phase: 11 (database-schema) — COMPLETE
Plan: 11-01 — complete (2/2 tasks done)

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

Stopped at: Phase 11 complete — Phase 12 (Core Booking Flow Update) is next

### Key Decisions (Phase 11)

- Migrations applied via Supabase MCP (not CLI) — functionally equivalent, no CLI auth setup needed
- pricing_globals singleton enforced via CHECK (id = 1) constraint — prevents accidental duplicate row
- coverage_zones seeded empty — operator draws zones via admin UI in Phase 16
- airport_fee=0, night_coefficient=1.0, holiday_coefficient=1.0 — zero/unity defaults preserve current pricing behavior exactly
