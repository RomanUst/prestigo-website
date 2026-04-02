---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Operator Dashboard
status: unknown
stopped_at: Completed 14-02-PLAN.md — Admin zones CRUD + paginated bookings GET with Zod validation and unit tests
last_updated: "2026-04-02T08:33:05.731Z"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 8
  completed_plans: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-01 — Milestone v1.2 started)

**Core value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.
**Current focus:** Phase 14 — admin-api-routes (COMPLETE)

## Current Position

Phase: 14 (admin-api-routes) — COMPLETE
Plan: 2 of 2 (all plans complete)

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

### Key Decisions (Phase 13 — Plan 01)

- redirect() called outside try/catch in signIn — Next.js throws NEXT_REDIRECT internally, catch would swallow it
- pathname !== '/admin/login' exclusion in middleware prevents infinite redirect loop
- getUser() used (not getSession()) — validates JWT with Supabase auth server
- revalidatePath('/', 'layout') in signOut clears router cache after session invalidation
- Login page uses root layout only — not inside (dashboard) route group

### Key Decisions (Phase 13 — Plan 02)

- AdminSidebar marked 'use client' for form action interactivity; layout.tsx stays Server Component for getUser() auth guard
- Route group (dashboard) pattern excludes /admin/login from layout guard cleanly — Next.js native, no config needed
- Plain <a> tags in sidebar (not next/link) — admin-only nav, Phase 15/16 can upgrade to Link for prefetching

### Key Decisions (Phase 14 — Plan 02)

- Zod z.literal('Polygon') enforces GeoJSON geometry type at schema level — prevents non-polygon shapes from being stored as coverage zones
- Bookings query applies all conditional filters before .range() — ensures pagination operates on the filtered result set
- pickup_date text column uses lexicographic .gte/.lte for date range — safe because ISO YYYY-MM-DD format sorts correctly
- limit clamped to 1-100 with Math.min/Math.max — prevents runaway queries while allowing flexible page sizes
- TDD test UUIDs must be valid RFC 4122 format — zoneToggleSchema uses z.string().uuid() which enforces this

### Key Decisions (Phase 14 — Plan 01)

- Admin auth guard checks user.app_metadata.is_admin (not user_metadata) — server-set field, cannot be spoofed by clients
- createSupabaseServiceClient() (service role) used for all DB writes — bypasses RLS for admin mutations
- revalidateTag('pricing-config') tag string exactly matches unstable_cache tag in lib/pricing-config.ts (hyphen not underscore)
- pricing_globals upsert uses { onConflict: 'id' } for singleton row enforcement
- Promise.all for parallel GET reads and parallel PUT upserts

### Last session

Stopped at: Completed 14-02-PLAN.md — Admin zones CRUD + paginated bookings GET with Zod validation and unit tests

### Key Decisions (Phase 12 — Plan 02)

- isOutsideAllZones inlined in route.ts (not extracted to lib/) — single use, co-located with zone query
- Zone check placed after origin/destination null check but before Google Routes API call — avoids unnecessary API calls when zone fails
- DB error in getPricingConfig() returns quoteMode: true (not HTTP 500) — graceful degradation keeps UX intact
- create-payment-intent also wired to DB rates (deviation fix) — prevents price mismatch between price calc and payment intent

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
