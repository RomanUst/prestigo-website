---
phase: 14-admin-api-routes
plan: 01
subsystem: api
tags: [supabase, nextjs, zod, pricing, admin, cache]

# Dependency graph
requires:
  - phase: 12-pricing-database
    provides: pricing_config and pricing_globals DB tables, getPricingConfig with unstable_cache tag
  - phase: 13-admin-auth
    provides: createClient() SSR auth, app_metadata.is_admin admin flag pattern
provides:
  - Admin GET /api/admin/pricing returning current pricing_config rows and pricing_globals
  - Admin PUT /api/admin/pricing validating with Zod, upserting both tables, busting pricing-config cache tag
  - Auth guard function checking getUser() + app_metadata.is_admin
  - Unit tests covering 401/403/200/400/500 scenarios and revalidateTag verification
affects:
  - phase-16-admin-ui (will call these endpoints from admin pricing form)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - getAdminUser() inline auth guard using createClient().auth.getUser() + app_metadata.is_admin check
    - createSupabaseServiceClient() for all DB writes (bypasses RLS)
    - revalidateTag('pricing-config') after PUT to bust unstable_cache in lib/pricing-config.ts
    - Promise.all for parallel DB reads/writes

key-files:
  created:
    - prestigo/app/api/admin/pricing/route.ts
    - prestigo/tests/admin-pricing.test.ts
  modified: []

key-decisions:
  - "Auth guard uses getUser() (not getSession()) and checks user.app_metadata.is_admin — not user_metadata"
  - "createSupabaseServiceClient() (service role) used for all DB writes — bypasses RLS"
  - "revalidateTag tag string is 'pricing-config' with hyphen matching unstable_cache tag in lib/pricing-config.ts"
  - "pricing_globals upsert uses { onConflict: 'id' } for singleton row enforcement"
  - "Promise.all used for parallel GET reads and parallel PUT upserts"

patterns-established:
  - "Admin route auth guard pattern: getAdminUser() inline function returning typed error string '401'|'403'"

requirements-completed: [PRICING-06]

# Metrics
duration: 2min
completed: 2026-04-02
---

# Phase 14 Plan 01: Admin Pricing API Route Summary

**Admin pricing GET + PUT route with Zod validation, service-role DB upserts, and revalidateTag('pricing-config') cache busting after successful writes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-02T08:22:23Z
- **Completed:** 2026-04-02T08:24:39Z
- **Tasks:** 2 (TDD: test file + implementation)
- **Files modified:** 2

## Accomplishments

- Created admin pricing GET endpoint returning `{ config: [...], globals: {...} }` for authenticated admin users
- Created admin pricing PUT endpoint with Zod validation, parallel upserts to pricing_config and pricing_globals, and cache bust via `revalidateTag('pricing-config')`
- 7 unit tests covering auth guard (401/403), GET success (200), PUT validation (400), PUT upsert+cache bust, and DB error (500) — all passing

## Task Commits

1. **Task 1: Create pricing route unit tests** - `661ea7f` (test — TDD RED phase)
2. **Task 2: Create admin pricing route handler** - `3b79df2` (feat — TDD GREEN phase)

## Files Created/Modified

- `prestigo/app/api/admin/pricing/route.ts` - Admin pricing GET + PUT route handler with inline auth guard, Zod schemas, service-role DB operations, and cache invalidation
- `prestigo/tests/admin-pricing.test.ts` - 7 vitest unit tests covering all route behaviors (auth guard, success, validation, error states)

## Decisions Made

- Auth guard uses `getUser()` (not `getSession()`) and checks `user.app_metadata?.is_admin` — consistent with Phase 13 auth pattern; `app_metadata` is server-set and cannot be spoofed by clients
- `createSupabaseServiceClient()` used for all DB writes — service role bypasses RLS, required for admin mutations
- `revalidateTag('pricing-config')` tag string matches exactly the tag registered in `lib/pricing-config.ts` unstable_cache — hyphen not underscore
- `pricing_globals` upsert uses `{ onConflict: 'id' }` to enforce singleton row update semantics
- `Promise.all` used for both GET (parallel reads of config + globals) and PUT (parallel upserts of both tables)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/api/admin/pricing` is ready for Phase 16 admin UI to consume
- GET returns raw DB rows (strings for NUMERIC columns) — Phase 16 UI should handle string-to-number display conversion if needed
- PUT accepts numbers directly and Zod validates them as `z.number()` — no conversion needed on write path

---
*Phase: 14-admin-api-routes*
*Completed: 2026-04-02*
