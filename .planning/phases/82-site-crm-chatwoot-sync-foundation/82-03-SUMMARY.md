---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 03
subsystem: admin-search / chatwoot-config
tags: [supabase, migration, chatwoot, custom-attributes, admin-bookings]
requires:
  - 82-LIVE-SCHEMA.md (live admin_search_bookings definition, from 82-01 Task 0)
provides:
  - admin_search_bookings email clause (migration 071, applied live by the orchestrator)
  - seven Chatwoot contact attribute definitions (config-as-code)
affects:
  - lib/chatwoot-mapping.ts (plan 82-10 writes these attribute keys)
  - plan 82-14 (live Chatwoot attribute apply at go-live)
tech-stack:
  added: []
  patterns: [verbatim-live-function-copy, config-as-code attributes]
key-files:
  created:
    - supabase/migrations/071_admin_search_bookings_email.sql
    - tests/admin-search-bookings-email.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-03-smoke.sql
  modified:
    - infra/chatwoot/custom-attributes.json
    - tests/chatwoot-config.test.ts
decisions:
  - "Kept the live search_path (SET search_path TO 'public', 'pg_temp') instead of the plan text's search_path = '' - the contract says copy the live definition verbatim and only add the email clause"
metrics:
  tasks_completed: 2
  tasks_pending: 1
  files: 5
status: complete-pending-orchestrator
commits: 3
plan_head_before: e8f6657b7b0a2fb8e71421be9af7dae9b31bbd4e
plan_head_after: 5b6c28696a72b06d0a9090751bddba131d3c6c48
actuals:
  tokens: 9000
  tasks: 2
  commits: 3
---

# Phase 82 Plan 03: Admin email search and Chatwoot contact attributes Summary

The site admin bookings list now finds a customer by email (`/admin/bookings?search=<email>`), and Chatwoot has seven contact attribute definitions ready for the sync to fill. Migration 071 is written and tested but NOT yet applied live (Task 3 is orchestrator-only).

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 (tracer) | Migration 071 + SQL-text and route tests | Done | 9620a742 |
| 2 | Seven Chatwoot contact attributes + config tests | Done | 1c464bc7 |
| 3 | Apply 071 live + rolled-back smoke `SMOKE_OK_82_03` | PENDING (orchestrator, Supabase MCP) | 5b6c2869 (smoke SQL only) |

## What was built

- `supabase/migrations/071_admin_search_bookings_email.sql`: `CREATE OR REPLACE FUNCTION public.admin_search_bookings(...)` copied from the live definition in 82-LIVE-SCHEMA.md (identical to 059) with one added line, `OR b.client_email ILIKE v_like`. Same 8-argument signature, return shape, both ORDER BY sites, SECURITY DEFINER; same `REVOKE ... FROM PUBLIC, anon, authenticated` and `GRANT ... TO service_role` as 059 (T-82-10).
- `tests/admin-search-bookings-email.test.ts` (8 tests): SQL text contract (single email clause, old matches kept, SECURITY DEFINER and search_path, signature, both ORDER BY sites, REVOKE/GRANT, no dynamic SQL) and route test (`?search=jane.doe%40example.com` calls `rpc('admin_search_bookings')` with `p_query: 'jane.doe@example.com'`). BookingsTable and the route are untouched.
- `infra/chatwoot/custom-attributes.json`: contact attributes after `site_locale`: `next_trip`, `trip_count`, `last_trip_date`, `repeat_customer`, `lifetime_value` (display name "Lifetime value") as text; `crm_contact_url`, `admin_bookings_url` as link. No currency words.
- `tests/chatwoot-config.test.ts`: the contact-key assertion updated deliberately to the eight keys in order, plus a display-type assertion and a currency-token assertion (uses the price gate's `hasCurrencyToken`).
- `82-03-smoke.sql`: one DO block (inserts a booking with email `smoke+82-03@rideprestigo.com`, asserts email search total 1, reference search total 1, partial email search total 1, anon/authenticated cannot EXECUTE and service_role can, then `RAISE EXCEPTION 'SMOKE_OK_82_03'`).

## Verification

- `npx vitest run tests/admin-search-bookings-email.test.ts tests/admin-bookings.test.ts`: 99 passed.
- `npx vitest run tests/chatwoot-config.test.ts`: 77 passed.
- `node scripts/qa/chatwoot_price_gate.mjs` with the attributes file staged: exit 0.
- `node infra/chatwoot/sync.mjs --dry-run --only attributes`: `attributes: create=7 update=0 unchanged=16 skipped=0 deleted=0` (the seven creations are `contact_attribute:next_trip`, `trip_count`, `last_trip_date`, `repeat_customer`, `lifetime_value`, `crm_contact_url`, `admin_bookings_url`). The live apply is left to go-live (plan 82-14).
- `npx tsc --noEmit`: no errors in the touched test files. `npx eslint --quiet` on both test files: clean.

## Pending for the orchestrator (Task 3)

1. Supabase MCP `apply_migration` name `071_admin_search_bookings_email` with the file contents.
2. `execute_sql` with `82-03-smoke.sql`; expected error message exactly `SMOKE_OK_82_03`.
3. `get_advisors` (security): no new ERROR naming `admin_search_bookings`.
4. Record the apply result, smoke message and advisor ERROR count here.

Results: not yet recorded.

## Deviations from Plan

**1. [Rule 1 - Plan/live mismatch] search_path text.** The plan's must-haves and behavior list say `search_path = ''`, but the live function (and 059) use `SET search_path TO 'public', 'pg_temp'`. The same plan says to copy the live definition verbatim and change only the email clause, so I kept the live setting; the test asserts the live value. Changing it would be a behavior change outside this plan's scope. No commit beyond Task 1 (9620a742).

**2. Plan commit ledger.** The ledger file was created after the first task commit (using the known base e8f6657b), so the measured commit count is correct (3).

## Known Stubs

None.

## Threat Flags

None. The new surface is one extra ILIKE column inside the existing admin-only SECURITY DEFINER function; privileges are unchanged.

## Self-Check: PASSED

- FOUND: supabase/migrations/071_admin_search_bookings_email.sql
- FOUND: tests/admin-search-bookings-email.test.ts
- FOUND: .planning/phases/82-site-crm-chatwoot-sync-foundation/82-03-smoke.sql
- FOUND commits: 9620a742, 1c464bc7, 5b6c2869
