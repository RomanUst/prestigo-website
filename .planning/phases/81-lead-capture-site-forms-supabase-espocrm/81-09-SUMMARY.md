---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 09
subsystem: lead-capture
tags: [supabase, trigger, outbox, pg_net, espocrm, security]
status: partial-pending-mcp
requires: ["81-01", "81-04", "81-07"]
provides:
  - "supabase/migrations/067_bookings_lead_outbox.sql: booking_lead_status(), outbox_kick(), enqueue_booking_lead() + trigger bookings_lead_outbox (NOT yet applied live)"
  - "POST /api/integrations/kick: pg_net -> QStash bridge (Bearer OUTBOX_KICK_SECRET)"
  - "lib/lead-sync.ts: lead.booking branch (source_missing, return_leg, before_capture_start, unmapped_status)"
  - "lib/outbox-store.ts: BookingRecord, readBooking, readReturnLeg, readCaptureStart"
affects: [81-10, 81-11]
tech-stack:
  added: []
  patterns:
    - "single capture point: AFTER INSERT OR UPDATE OF status trigger, no booking write path touched"
    - "exception-safe trigger: outer EXCEPTION block plus a nested block around the pg_net kick"
    - "state-convergent booking Lead: the key says 'something changed', the Lead is built from the current row"
key-files:
  created:
    - supabase/migrations/067_bookings_lead_outbox.sql
    - app/api/integrations/kick/route.ts
    - tests/lead-sync-booking.test.ts
    - tests/integrations-kick.test.ts
    - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-09-smoke.sql
  modified:
    - lib/lead-sync.ts
    - lib/outbox-store.ts
    - tests/outbox-migrations.test.ts
    - tests/lead-sync.test.ts
key-decisions:
  - "Kick route checks the Bearer secret before reading the body (unauthenticated callers get 401 regardless of payload)"
  - "readCaptureStart returns null for an unparsable value; the dispatcher then skips with before_capture_start (capture off), matching the trigger's WARNING-and-no-enqueue behaviour"
  - "OutboxStore gained three required methods, so tests/lead-sync.test.ts got three inert stubs to keep tsc clean"
requirements: [LEAD-04, LEAD-06]
commits: 3
plan_head_before: 2b7f3ff53cede33a3d4a0eb41325c22b1665838b
plan_head_after: d07fb060806ba2fe4afaf04b042a785a8bdebccb
actuals:
  tokens: 45000
  tasks: 2
  commits: 3
completed: 2026-10-18
---

# Phase 81 Plan 09: Booking -> Lead capture Summary

Every booking write, from any source, is captured by one exception-safe trigger into the ids-only outbox; a Bearer-protected kick route wakes the dispatcher, and the dispatcher builds the Lead from the current booking row (New / In Process / Converted / Dead) without touching any booking write path. Tasks 1 and 2 are done and tested; Task 3 (apply migration 067 live + rolled-back smoke) is PENDING and must be run by the orchestrator through the Supabase MCP.

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: unpaid website booking -> trigger -> outbox -> kick -> dispatch -> Lead New 'Website booking' | done | 3b50bbd0 |
| 2 | Status follows the booking for every source (round trips, quotes, manual channel, GNet, forward-only, concurrency) | done | 2c80268c |
| 3 | [BLOCKING] apply migration 067 live + rolled-back trigger smoke | PENDING - orchestrator applies via MCP | d07fb060 (smoke SQL) |

## What was built

- **Migration 067**: `booking_lead_status(text)` (IMMUTABLE SQL, 8 statuses, ELSE NULL), `outbox_kick(text)` (reads Vault `outbox_kick_url` / `outbox_kick_secret`, no-op while either is absent, POSTs `{key}` with Bearer header, 5 s timeout), `enqueue_booking_lead()` (whole body in one exception block, kick in a nested one; skips unmapped statuses, same-group updates, return legs, missing `lead_capture_start`, rows created before it; enqueues `lead.booking:<id>:<status>` available 90 s later). Trigger `bookings_lead_outbox AFTER INSERT OR UPDATE OF status ... FOR EACH ROW`. All three functions REVOKEd from PUBLIC, anon, authenticated; helpers GRANTed to service_role. No reference to `booking_source` (all writers captured).
- **Kick route** `POST /api/integrations/kick`: fail-closed timing-safe Bearer check against `OUTBOX_KICK_SECRET`, `enforceMaxBody` 512 plus a measured check, strict zod `{key}`, only `lead.booking` keys (400 otherwise), `publishOutboxDispatch(key, { delaySeconds: 90, dedupSuffix: 'k' })`, 200 `{ ok, published }`. Imports only `lib/outbox` and `lib/request-guards` (not allowlisted by the isolation guard, guard still green).
- **Dispatcher** `lead.booking` branch: source row gone -> skipped `source_missing` (GNet ghost); return leg -> `return_leg`; no capture start or `created_at` before it -> `before_capture_start`; unmapped status -> `unmapped_status`; round-trip outbound looks up the return leg (shared payment intent, else attempt id) for `cReturnBookingReference`; then the same upsert as inquiries (lookup by `cSupabaseRef`, create with skip-duplicate header + assignee, else `diffSyncOwned` PUT including status). Out-of-order and concurrent events converge because every run re-reads the current booking; the per-aggregate claim mutex defers the loser. No Contact/CBooking/Account write and no conversion (D-09).
- **Store**: `readBooking` (exact column list), `readReturnLeg`, `readCaptureStart` (unparsable -> null). `linked_booking_id` is not used anywhere.

## Verification

- `npx vitest run` on lead-sync-booking, integrations-kick, outbox-migrations, lead-sync, lead-mapping, integrations-dispatch, infra-vps-isolation-guard, outbox: 8 files, 231 tests passed.
- New tests: 36 in `tests/lead-sync-booking.test.ts` and `tests/integrations-kick.test.ts` cover tracer, D-06 transitions, D-03 past-pickup unpaid, unmapped status, round trip (payment intent and attempt id), one-way no lookup, two bookings of one customer, manual channels (5), GNet placeholders, GNet ghost, forward-only (null start, 1 ms before, exact boundary, microsecond timestamps), concurrent, out of order, D-09 scope; `tests/outbox-migrations.test.ts` gained 067 structure checks and the SQL/TS parity test over all 8 statuses.
- eslint clean on all touched source and test files; `tsc --noEmit` reports only the 8 baseline errors in `tests/`.
- Acceptance greps: `AFTER INSERT OR UPDATE OF status` count 1; non-comment `booking_source` count 0; `espocrm|ESPOCRM_|lead-sync` in the kick route 0; `linked_booking_id` 0 in both lib files; `git diff --name-only 2b7f3ff5..HEAD -- app/api/webhooks app/api/create-payment-intent app/api/admin app/api/gnet app/api/submit-quote lib/supabase.ts` is empty (no booking write path touched).
- Not run in this worktree: the full suite (known next-intl symlink artifact); the orchestrator should re-run it on the main checkout.

## Task 3 - PENDING, orchestrator applies via MCP

- Migration file: `supabase/migrations/067_bookings_lead_outbox.sql`, MCP `apply_migration` name `067_bookings_lead_outbox`.
- Smoke SQL: `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-09-smoke.sql` (one DO block ending in `RAISE EXCEPTION 'SMOKE_OK_81_09'`; only that message is success).
- Expectations: apply succeeds; smoke returns exactly `SMOKE_OK_81_09`; afterwards `select count(*) from public.integration_config where key='lead_capture_start'` = 0; no bookings left with `client_email = 'smoke+81-09@rideprestigo.com'`; `get_advisors` security shows no ERROR naming `booking_lead_status`, `outbox_kick` or `enqueue_booking_lead`.
- MCP results: not yet recorded (apply / smoke / advisors to be filled in by the orchestrator).
- Caveat: the base `bookings` table is not in the repo's migrations, so the smoke fills exactly the columns `buildBookingRow` writes. If the live schema requires another NOT NULL column without a default, add it to the INSERT lists (the assertions do not depend on it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OutboxStore interface growth broke the inquiry test double**
- **Found during:** Task 1
- **Issue:** `readBooking` / `readReturnLeg` / `readCaptureStart` are required members of `OutboxStore`, so the in-memory store in `tests/lead-sync.test.ts` no longer type-checked.
- **Fix:** three inert stubs added to that test double (behaviour of inquiry tests unchanged).
- **Files modified:** tests/lead-sync.test.ts
- **Commit:** 3b50bbd0

**2. [Plan deviation - process] Task 3 not executed by this agent**
- Supabase MCP tools are not available to the executor; handed back as documented above.

Otherwise the plan was executed as written. TDD note: the implementation and the tracer test were written together before the first run (tests passed on first run); the Task 2 test matrix was added after the implementation and also passed on first run, so no RED phase was observed for those tests.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-81-25..T-81-29 mitigations implemented: exception blocks, Bearer + timing-safe + fail-closed + key allowlist + body cap, search_path pinned and REVOKEs, ids-only key and kick body, forward-only cutoff in trigger and dispatcher).

## Self-Check: PASSED

- Files exist: migration 067, kick route, both new test files, smoke SQL.
- Commits exist: 3b50bbd0, 2c80268c, d07fb060.
