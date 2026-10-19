---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 09
subsystem: sync / backfill
tags: [supabase, identity, backfill, outbox, chatwoot, tdd]
status: partial
requires:
  - phase: 82-01 (identity tables, resolvers, outbox_enqueue, outbox_kick)
  - phase: 82-05 (phone rules in identity_resolve_core)
provides:
  - migration 074 (crm_backfill_identity_pass, crm_identity_report, crm_backfill_enqueue)
  - infra/chatwoot/inspect.mjs --contacts-count and identifier-less --contact <email>
affects: [82-14, 82-15 (go-live runs the three functions), 82-07 / 82-10 (handlers receive the bf keys)]
key-files:
  created:
    - supabase/migrations/074_crm_backfill.sql
    - tests/crm-backfill.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-09-smoke.sql
  modified:
    - infra/chatwoot/inspect.mjs
    - tests/chatwoot-inspect.test.ts
decisions:
  - "The backfill has no mapping code: the identity pass calls identity_resolve_booking / identity_resolve_user, the enqueue emits the same sync.booking / sync.signup keys the live handlers consume (tag instead of time bucket)"
  - "crm_identity_report defines bookings_no_identity as non-abandoned bookings without a booking_identity row, so linked + no_identity + abandoned always equals total (erasing bookings count under no_identity)"
  - "crm_backfill_enqueue also enqueues anonymised bookings (plan says every non-abandoned booking); the handler decides they have no identity"
  - "inspect.mjs API failures now print `API error: status=<n>` only (no body, no request path: a contact search path carries an email)"
  - "--contact without --expect-identifier exits 0 with contact_found=<bool> (existence probe); with --expect-identifier behaviour is unchanged"
metrics:
  tasks_total: 3
  tasks_done: 2 (Task 3 PENDING: orchestrator, Supabase MCP)
  plan_head_before: 2732e874340e31b910c4d77935c5715f57a98296
  commits: 4
  completed: 2026-10-19
actuals:
  tokens: 14000
  tasks: 2
  commits: 4
---

# Phase 82 Plan 09: CRM backfill (identity pass, report, staggered enqueue) Summary

Migration 074 adds three service-role-only functions that replay all history through the live sync: a deterministic identity pass over every booking and profile, a counts-only review report, and a tagged, staggered enqueue that feeds every past booking and signup to the live handlers. Chatwoot inspect gained the contact count probe for post-backfill verification.

## Status

Code, tests and the smoke SQL are complete and committed. **Task 3 is PENDING** (needs the Supabase MCP; executors do not have it): apply migration 074 live and run `82-09-smoke.sql` (rolled back, ends in `SMOKE_OK_82_09`). Live dry-run counts are NOT yet recorded here; the orchestrator must add them.

## What was built

- `crm_backfill_identity_pass()`: bookings ordered by `(created_at, id)` (abandoned skipped and counted, others through `identity_resolve_booking`), then profiles ordered by `(created_at, user_id)` through `identity_resolve_user`. Returns `{bookings_seen, bookings_linked, bookings_no_identity, bookings_erasing, abandoned_skipped, profiles_seen, profiles_linked}`. Idempotent (a second pass gives the same counts).
- `crm_identity_report()`: counts only (no aggregation of names, emails or phones): identities, identities_with_user, emails_by_basis, phone_merges, shared_phones by source, bookings total / abandoned / linked / no identity / placeholder email (`@gnet.local`) / unparseable phone, profiles, profiles_linked.
- `crm_backfill_enqueue(p_tag, p_stagger_seconds)`: tag must match `^bf[0-9]{0,3}$` (else `invalid_tag`), stagger clamped to 1..60, keys `sync.booking:<id>:<tag>` / `sync.signup:<userId>:<tag>` with `available_at = now() + n * stagger`, only newly inserted rows count and are kicked (nested `EXCEPTION WHEN OTHERS` -> WARNING). Re-run with `bf2`, `bf3`, ...
- Header comment documents the run order (owner marks desk numbers shared, identity pass, report review, set `crm_sync_start`, enqueue `bf`) and the QStash budget (about 4 messages per booking).
- `infra/chatwoot/inspect.mjs`: `--contacts-count` prints `contacts=<meta.count>`; `--contact <email>` alone prints `contact_found=<bool>` and exits 0; errors report the status only.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (tracer) | 6fdc0536 | migration 074 + tests/crm-backfill.test.ts (19 tests) |
| 2 | 08b5a68e | inspect --contacts-count, identifier-less --contact, status-only API errors |
| 3 (smoke SQL) | e8dea8e2 | 82-09-smoke.sql (5.2 KB, one DO block, counts only) |
| docs | (this commit) | SUMMARY |

## Verification

- `npx vitest run tests/chatwoot-inspect.test.ts tests/crm-backfill.test.ts`: 65 passed.
- `npx tsc --noEmit`: no errors in the new/changed test files; eslint clean on changed files.
- Acceptance greps: 3 `CREATE OR REPLACE FUNCTION public.crm_` in 074; at least 3 `ORDER BY ...created_at`; `contacts-count` appears 6 times in inspect.mjs.

## Task 3 (PENDING, orchestrator)

1. MCP `apply_migration` name `074_crm_backfill` with the file contents.
2. MCP `execute_sql` with `82-09-smoke.sql` (single DO block). Expected result: an error whose message starts `SMOKE_OK_82_09 pass={...} report={...} enqueued=N` (rolls back). The smoke asserts: all bad tags raise `invalid_tag`; second identity pass and report are identical; report adds up (linked + no_identity + abandoned = total); pass and report agree; report/pass contain no `@` or `+`; first enqueue returns exactly `(total - abandoned) + profiles`; same-tag re-run returns 0; rows are tagged `:bf`, event types are only `sync.booking` / `sync.signup`; spread of `available_at` equals `(n-1) * 5 s`; `bf2` (stagger 0) and `bf3` (stagger 9999) enqueue the same count; anon/authenticated lack EXECUTE, service_role has it.
3. After the smoke: confirm `select count(*) from integration_outbox where idempotency_key ~ ':bf[0-9]*$'` = 0 and `select count(*) from contact_identities` equals its pre-smoke value (rolled back). MCP `get_advisors` (security): no ERROR naming the 074 functions.
4. Record in this SUMMARY: apply result, the pass/report counts (owner's first preview of phone merges and shared numbers), advisor ERROR count.

Live dry-run counts: **not yet recorded (pending orchestrator).**

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] API errors no longer echo the response body or request path**
- **Found during:** Task 2 (behavior line: "non-2xx exits 2 with a status-only message")
- **Issue:** `main()` printed `API error: ${error.message}`, which includes the redacted response body and the request path (for `--contact` the path holds the searched email).
- **Fix:** exported `formatApiError(error)` returning `API error: status=<n>`; `main()` uses it for all modes.
- **Files modified:** infra/chatwoot/inspect.mjs
- **Commit:** 08b5a68e

**2. [Plan adjustment] smoke assertion is stricter than the plan**
- The plan asserts `v_n >= total - abandoned`; the smoke asserts equality with `(total - abandoned) + profiles` (no bf rows exist before the run), which is the exact expected value.

Plan commit ledger (protocol 0c) was not created before the first commit; `plan_head_before` is the known worktree base (2732e874), commits counted manually (4 including this SUMMARY).

## Known Stubs

None.

## Threat Flags

None. The new functions are service-role only (REVOKE from PUBLIC, anon, authenticated), output counts only, and add no network surface. T-82-26 (wrong merges) is addressed by the deterministic order and the counts-only report; T-82-27 (burst) by the 1..60 s stagger and idempotent tagged keys.

## Self-Check: PASSED

- supabase/migrations/074_crm_backfill.sql, tests/crm-backfill.test.ts, 82-09-smoke.sql, infra/chatwoot/inspect.mjs: present.
- Commits 6fdc0536, 08b5a68e, e8dea8e2 exist on the worktree branch.
