---
phase: 85-statistics
plan: 03
subsystem: database
tags: [postgres, supabase, plpgsql, rpc, stats, repeat-customers, b2b]
status: partial
requires:
  - phase: 85-statistics/85-01
    provides: public.stats_trips() (single paid-order and person definition, migration 081)
provides:
  - public.stats_customers(date, date) jsonb (STAT-02)
  - public.stats_b2b(date, date) jsonb (STAT-03)
affects: [85-02 admin stats routes, lib/admin-stats.ts zod contract]
tech-stack:
  added: []
  patterns: [MATERIALIZED stats_trips() CTE, pickup_date text period filter, service_role-only SECURITY DEFINER read RPC]
key-files:
  created:
    - supabase/migrations/082_stats_customers_b2b.sql
    - tests/stats-customers-b2b-migration.test.ts
    - .planning/phases/85-statistics/85-03-smoke.sql
  modified: []
key-decisions:
  - "D-19 attribution key is COALESCE(trip.user_id, lowest auth.users id with the same identity_normalize_email), the /admin/accounts precedence, so a trip is never counted for two accounts"
  - "The corporate smoke bookings are inserted after the customer assertions, because they deliberately share one email and would otherwise add a 5-trip 'person' to the customer counts"
commits: 2
plan_head_before: 542f7733074efb070195f4b74bd7f45644cf912b
plan_head_after: b4dcf83c658074bae6288f65aaf76e46f231bdcf
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 85 Plan 03: stats_customers and stats_b2b Summary

**Two read-only service-role RPCs on top of `stats_trips()`: repeat-customer rate with revenue share and top 10 (non-GNet persons, 2+ trips all-time), and per-corporate-account bookings/revenue with `/admin/accounts` attribution (user_id first, then account email).**

## Status

Tasks 1 and 2 are done and committed. Task 3 (apply migration 082 live and run the smoke) is
**PENDING (orchestrator)**: gsd-executors have no Supabase MCP.

## What was built

- `supabase/migrations/082_stats_customers_b2b.sql`
  - `stats_b2b(p_from, p_to)`: trips from one MATERIALIZED `public.stats_trips()` CTE filtered on
    `pickup_date` text between `to_char(p_from, 'YYYY-MM-DD')` and `to_char(p_to, 'YYYY-MM-DD')`;
    owners CTE (`auth.users` id + `identity_normalize_email(email)`, lowest id when ambiguous); account key
    `COALESCE(t.user_id, owner id)`; join to `customer_profiles` with `account_type = 'corporate'` and to
    `auth.users` for the email. Per account: `bookings`, `revenue_eur`, `avg_eur = round(revenue/bookings)`,
    `last_trip`, `without_amount` (amount 0, group payments). Order revenue DESC, bookings DESC,
    company ASC NULLS LAST, user_id ASC. Totals `b2b_*` over listed accounts, `all_*` over every trip in the
    period, `accounts_total` = corporate profiles. Empty period gives `accounts: []`.
  - `stats_customers(p_from, p_to)`: population = `stats_trips()` rows with `booking_source <> 'gnet'`,
    `NOT anonymised`, `person_key IS NOT NULL`; per-person all-time aggregates, name/email from the newest
    trip, period aggregates through `FILTER`; `customers`, `repeat_customers`, `revenue_eur`,
    `repeat_revenue_eur`, `repeat_customers_all_time`; `top` = repeat customers (2+ trips all-time) ordered
    revenue DESC, trips DESC, last_trip DESC, email ASC NULLS LAST, person_key ASC, `LIMIT 10`; the person
    key is never returned.
  - Both: `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''`, `RAISE EXCEPTION 'invalid period'`
    on NULL or inverted arguments, `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`.
    The file never repeats the paid-status list and never recreates `stats_trips` (D-18).
- `tests/stats-customers-b2b-migration.test.ts`: static contract (shape, guards, attribution, ordering,
  result keys, read-only, no `pickup_date` cast, grants, search_path count, smoke file shape).
- `.planning/phases/85-statistics/85-03-smoke.sql`: one rolled-back `DO $smoke$` block ending in
  `RAISE EXCEPTION 'SMOKE_OK_85_03'`. Covers round trip = one trip (900000 + return leg with NULL amount),
  1 vs 2 trips boundary, GNet booking with a real email excluded, anonymised row excluded, newest-trip name,
  equal-revenue tie order (E before F), empty period keeps the all-time top, D-19 guest email with spaces and
  upper case, user_id precedence (U2 booking with U1's email), cancelled excluded, zero-amount counted in
  `without_amount`, personal and idle corporate accounts omitted, `accounts_total` = before + 2, privileges,
  STABLE/SECURITY DEFINER/pinned search_path.

## Verification

- `npx vitest run tests/stats-customers-b2b-migration.test.ts tests/stats-migration.test.ts tests/webhook-isolation-guard.test.ts`: 3 files, 139 tests, all green.
- `npx eslint --quiet tests/stats-customers-b2b-migration.test.ts`: clean. `npx tsc --noEmit`: no errors in the new files.
- Acceptance greps: one `stats_b2b(` and one `stats_customers(` definition, `SET search_path = ''` count 2, no `FUNCTION public.stats_trips(`, no five-status literal, no `pickup_date ::`, one `SMOKE_OK_85_03`.

## Task 3: live apply and smoke - PENDING (orchestrator)

Results to fill in by the orchestrator (Supabase MCP):

- `list_migrations`: 081 newest, no 082 before apply; `apply_migration` name `082_stats_customers_b2b`: ___
- Smoke `85-03-smoke.sql` message (only `SMOKE_OK_85_03` counts): ___
- proacl of `stats_customers` and `stats_b2b` (only postgres and service_role): ___
- Live probe `stats_customers(current_date - 89, current_date)`: customers ___, repeat_customers ___, top length ___
- Live probe `stats_b2b(current_date - 89, current_date)`: accounts_total ___ (expected 8), accounts length ___, b2b ___ / ___, all ___ / ___
- `get_advisors` security ERROR items naming a 082 function: ___
- Fixture-only fixes to the smoke (NOT NULL columns, auth.users, signup triggers, an email-with-spaces constraint on bookings): ___

## Deviations from Plan

None in the migration. One smoke-design adjustment: the plan lists all fixtures as one set, but the corporate
bookings share a single email (U1's, in several case/space variants, plus U2's booking) and are one
5-trip "person" for `stats_customers`. They are therefore inserted after the customer assertions so the
planned numbers (customers 4, repeat 1, repeat revenue 900000) hold exactly.

## Threat model

T-85-10 (grants), T-85-11 (search_path), T-85-12 (single attribution key) are mitigated in the text and
pinned by tests; the live proacl check and privilege steps run in Task 3.

## Known Stubs

None.

## Self-Check: PASSED

- supabase/migrations/082_stats_customers_b2b.sql: found
- tests/stats-customers-b2b-migration.test.ts: found
- .planning/phases/85-statistics/85-03-smoke.sql: found
- commits bb125758 and b4dcf83c: found
