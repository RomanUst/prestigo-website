---
phase: 85-statistics
plan: 01
subsystem: database
tags: [postgres, supabase, stats, funnel, chat-registry, rpc]
requires:
  - phase: 82-site-crm-chatwoot-sync-foundation
    provides: identity tables and helpers (identity_normalize_email, identity_is_abandoned, booking_identity, identity_emails, identity_phones, phone_flags)
  - phase: 83-chat-intake
    provides: chat_leads / chat_lead_reserve (078)
provides:
  - chat_leads.channel column with CHECK (web, whatsapp, email, telegram, other)
  - public.chat_channel_bucket(text)
  - public.chat_lead_reserve 6-arg (trailing p_channel DEFAULT NULL), old 5-arg dropped
  - public.stats_trips() one row per paid order (reused by plan 85-03 / migration 082)
  - public.stats_conversion(date, date) jsonb funnel + direct rows
affects: [85-02, 85-03, 85-04, 85-06]
tech-stack:
  added: []
  patterns:
    - "STABLE read-only SECURITY DEFINER stats RPC, service_role only, search_path pinned"
    - "Paid-status list defined once in stats_trips(); funnel matches through a LATERAL ... LIMIT 1 over one MATERIALIZED trips CTE"
key-files:
  created:
    - supabase/migrations/081_stats_conversion.sql
    - tests/stats-migration.test.ts
    - .planning/phases/85-statistics/85-01-smoke.sql
  modified: []
key-decisions:
  - "Per-source revenue_eur counts each converting booking once per source (DISTINCT booking per source); funnel_total counts DISTINCT bookings across sources"
  - "An explicit converted_booking_id that points to a non-qualifying booking falls through to identity matching instead of forcing 'not converted'"
  - "Chat-lead person key = identity_id, else the sole non-shared owner of the lead's phone (array_agg(DISTINCT ...)[1] with HAVING count = 1, no min() over uuid)"
patterns-established:
  - "Smoke isolates each step in its own 2001 calendar period so steps cannot contaminate each other"
requirements-completed: [STAT-01]
duration: ~35min
completed: 2026-10-31
status: complete
commits: 2
plan_head_before: 4af55a40599bfcc1c499497b12473f0c2d20272a
plan_head_after: 3c95750aeb9b6fc89643d991b5d01350700f8dbc
actuals:
  tokens: 22000
  tasks: 2
  commits: 2
---

# Phase 85 Plan 01: Statistics - conversion funnel migration Summary

**Migration 081: chat channel column + bucket mapping, 6-arg chat_lead_reserve, shared stats_trips() and the read-only stats_conversion(date, date) funnel RPC (nine fixed sources, eight direct rows, DISTINCT-booking totals), pinned by a static test and a rolled-back live smoke.**

## Performance

- **Tasks:** 2 of 3 executed by the executor; Task 3 (apply 081 live + run smoke) DONE by the orchestrator via Supabase MCP on 2026-10-31
- **Files created:** 3

## Accomplishments

- `stats_trips()`: one row per paid order (`leg IS DISTINCT FROM 'return'`, five paid statuses listed exactly once in the file), person key = booking_identity, else `'e:'` + normalised email, NULL for anonymised rows and GNet placeholders; EUR amount with the 080 round-trip fallback plus a last-resort `amount_czk * 0.04`.
- `stats_conversion(p_from, p_to)`: Prague-local period, three inquiry sources (inquiries, chat_leads, abandoned order rows, one inquiry per row), `LATERAL ... LIMIT 1` match (explicit chat-lead booking first, then same person within 90 days inclusive), per-source rows in the fixed D-05 order, `window_open`, `funnel_total` with `count(DISTINCT booking_id)`, and the D-06 direct rows (`trips_in_period = direct_total.bookings + attributed_bookings`).
- `chat_channel_bucket` + 6-arg `chat_lead_reserve`: channel stored on INSERT only; the static test proves the SQL class strings equal the `case 'Channel::...'` strings parsed from `lib/chat-classify.ts`.
- Grants: REVOKE FROM PUBLIC, anon, authenticated and GRANT service_role on all four new signatures; none names the old 5-arg signature; `SET search_path = ''` count equals function count (4).

## Task Commits

1. **Task 1 (tracer): stats_trips + stats_conversion funnel** - `391b8c7d` (security)
2. **Task 2: channel bucket, 6-arg reserve, phone-resolved chat leads, direct rows, smoke script** - `3c95750a` (security)
3. **Task 3: apply 081 live + smoke SMOKE_OK_85_01** - DONE (orchestrator, 2026-10-31)

## Tracer gate

Tracer verified by re-running the static contract (`tests/stats-migration.test.ts`) and `tests/webhook-isolation-guard.test.ts` before expanding in Task 2. No Postgres is available in the sandbox, so the SQL has not been executed yet; the live smoke is the first execution.

## Verification (executor side)

- `npx vitest run tests/stats-migration.test.ts tests/chat-registry-migration.test.ts tests/webhook-isolation-guard.test.ts` : 3 files, 99 tests passed
- `npx tsc --noEmit`: no new errors outside the known baseline; `npx eslint --quiet tests/stats-migration.test.ts`: clean
- Acceptance greps from the plan (counts 1/1/1/0/1 for Task 1, 1/1/0/4=4/1 for Task 2) all match

## DONE (orchestrator) - Task 3

Execute with the Supabase MCP, in this order:
1. `list_migrations` (080 newest, no 081); confirm `chat_leads` has no `channel` column and only the 5-arg `chat_lead_reserve` exists; `apply_migration` name `081_stats_conversion` with the file text.
2. `execute_sql` with `.planning/phases/85-statistics/85-01-smoke.sql`; only the message `SMOKE_OK_85_01` is success. If a step fails on fixture setup (a NOT NULL or CHECK on `bookings`, e.g. `lead_channel` on a non-manual row, a GNet-specific column, `unpaid` with a payment link), fix only the fixture; if an assertion fails, fix the migration (re-apply via `081_stats_conversion_fix`, copy the fix into 081) and rerun `tests/stats-migration.test.ts`.
3. Read-only: `proacl` of the four functions (postgres + service_role only); `select public.stats_conversion(current_date - 89, current_date)` returns 9 funnel entries; record live `funnel_total` and `direct_total` here.
4. `get_advisors` (security): no new ERROR naming a 081 function.
5. Commit the smoke SQL if fixtures changed: `test(85-01): rolled-back smoke for migration 081`.

Results: apply = success (`apply_migration 081_stats_conversion`; preconditions checked: 080 newest, only the 5-arg chat_lead_reserve, no channel column, every referenced column exists, reserve body == live 078 body) ; smoke message = `SMOKE_OK_85_01` on the first run, fixture unchanged ; proacl = asserted inside the smoke (step k: anon/authenticated no EXECUTE, service_role EXECUTE, search_path pinned, old 5-arg gone) ; leftovers after rollback = 0 bookings / 0 inquiries / 0 chat_leads / 0 identity_emails ; live 90-day funnel_total = 15 inquiries, 1 converted, 14 window_open, 1 converting booking ; live direct_total = 37 bookings ; trips_in_period = 39 (= 37 direct + 2 attributed) ; advisor ERRORs = 0 (only pre-existing INFO rls_enabled_no_policy + WARN leaked-password protection, none naming a 081 function)

## Decisions Made

- Per-source `revenue_eur` is a sum over DISTINCT converting bookings within the source; only `funnel_total` is global-distinct. (The plan only mandated distinct totals; this avoids double counting inside one row as well.)
- A chat lead with an explicit `converted_booking_id` that is not a currently qualifying trip (e.g. cancelled) still matches through the lead's identity/phone if that person has another qualifying trip in the window; with no identity it stays unconverted (smoke e2).
- `stats_trips()` returns a NULL person key for anonymised rows explicitly (not only via the `@erased.invalid` rule).

## Deviations from Plan

None - the plan was executed as written. Two environment notes:

- The `gsd-plan-head-before` ledger and `gsd-spawn-toplevel` sentinel could not be written (the sandbox refuses writes under the worktree's git dir); `commits` and `plan_head_before` were measured from the dispatched base SHA `4af55a40` instead (`git rev-list --count 4af55a40..HEAD` = 2 at SUMMARY time).
- No local Postgres exists, so the migration SQL and smoke are syntax-checked only by review plus the static tests; the first real execution is the orchestrator's Task 3.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-85-01 grants, T-85-02 search_path, T-85-03 channel bucket + CHECK, T-85-04 no pickup_date cast are all mitigated and pinned by tests).

## Self-Check: PASSED

- supabase/migrations/081_stats_conversion.sql, tests/stats-migration.test.ts, .planning/phases/85-statistics/85-01-smoke.sql exist
- commits 391b8c7d and 3c95750a exist on the branch
