---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 10
subsystem: lead-capture
tags: [supabase, cron, outbox, espocrm, retention, security]
status: complete
requires: ["81-07", "81-09"]
provides:
  - "supabase/migrations/068_outbox_sweep.sql: outbox_enqueue_expired_unpaid(), outbox_enqueue_abandoned_purge(), outbox_due_keys(integer) (NOT yet applied live)"
  - "GET /api/cron/outbox-sweep: daily sweep (CRON_SECRET bearer, three isolated steps)"
  - "lib/outbox-store.ts: enqueueExpiredUnpaid, enqueueAbandonedPurge, dueKeys"
  - "lib/lead-sync.ts: lead.purge branch (purge_not_eligible, purge_lead_not_dead)"
  - "vercel.json: cron /api/cron/outbox-sweep at 0 4 * * *"
affects: [81-11]
tech-stack:
  added: []
  patterns:
    - "time-based enqueue in SQL, delivery in the signed dispatcher: the cron never touches the CRM"
    - "key says 'consider', live row decides: purge eligibility re-checked on the current booking and the current Lead status"
    - "per-step isolation in the cron: a failing step reports a code and null, the others still run"
key-files:
  created:
    - supabase/migrations/068_outbox_sweep.sql
    - app/api/cron/outbox-sweep/route.ts
    - tests/outbox-sweep.test.ts
    - tests/lead-purge.test.ts
    - .planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-10-smoke.sql
  modified:
    - lib/outbox-store.ts
    - lib/lead-sync.ts
    - vercel.json
    - tests/outbox-migrations.test.ts
    - tests/lead-sync.test.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
key-decisions:
  - "Sweep RPC wrappers are plain exported functions in lib/outbox-store.ts, not OutboxStore members, so the dispatcher's store doubles did not have to grow again"
  - "Due keys are read AFTER the two enqueue steps, so rows enqueued today are published today instead of waiting a day"
  - "Purge deletes every Lead found for the cSupabaseRef only when ALL are Dead; any non-Dead match keeps them all (purge_lead_not_dead)"
  - "No capture-start re-check in the purge branch: the SQL predicate already applies created_at >= start and a Lead only exists for captured bookings"
requirements: [LEAD-04, LEAD-05, LEAD-06]
commits: 3
plan_head_before: afebb336e278b0fed15d73455f78a1dacc121afa
plan_head_after: 11ab6c2d22619364d4219429c811d597554323e9
actuals:
  tokens: 50000
  tasks: 3
  commits: 3
completed: 2026-10-18
---

# Phase 81 Plan 10: Daily outbox sweep, Dead after pickup, 90-day purge Summary

One daily Vercel cron enqueues `lead.booking:<id>:dead` for unpaid outbound bookings past pickup (D-03) and `lead.purge:<id>` for abandoned online checkouts more than 90 days past pickup (D-15/D-20), then re-publishes every due or lease-expired outbox row (up to 200 per run) as the safety net behind success criterion 7. The dispatcher gained the purge branch; LEAD-04 wording now records the calculator strike (D-01).

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: daily cron -> expired unpaid enqueued -> published -> dispatched -> Lead Dead | done | 7870734d |
| 2 | 90-day purge of abandoned online checkouts (D-15/D-20) + LEAD-04 wording (D-01) | done | dad89d0d |
| 3 | [BLOCKING] apply migration 068 live + rolled-back sweep smoke | DONE - orchestrator applied via Supabase MCP | 11ab6c2d (smoke SQL) |

## What was built

- **Migration 068** (three `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''` functions, each REVOKEd from PUBLIC, anon, authenticated and GRANTed to service_role only):
  - `outbox_enqueue_expired_unpaid()`: status `unpaid`, `pickup_utc < now()` (strict), `leg IS DISTINCT FROM 'return'`, `created_at >= v_start`; key `lead.booking:<id>:dead`; `ON CONFLICT (idempotency_key) DO NOTHING`; returns `ROW_COUNT`; returns 0 while `lead_capture_start` is absent.
  - `outbox_enqueue_abandoned_purge()`: `booking_source = 'online'`, `unpaid`, `payment_link_id IS NULL`, outbound, `created_at >= v_start`, `pickup_utc < now() - interval '90 days'` (strict); key `lead.purge:<id>`.
  - `outbox_due_keys(p_limit)`: pending and due, or processing with an expired lease; ordered by `available_at`; `LIMIT least(greatest(p_limit, 1), 500)`.
  - The migration only INSERTs into `integration_outbox`; it never writes `bookings` or `integration_config`.
- **Sweep route** `GET /api/cron/outbox-sweep` (`maxDuration = 300`): CRON_SECRET bearer copied from reminder-24h (timing-safe, fail-closed). Steps run in order expired -> purge -> due keys, each in its own try/catch; due keys are published in batches of 10 with `dedupSuffix: 's<YYYYMMDD>'` (UTC). Response `200 { ok, expired, purge, due, published, errors }`; a failed step gives `null` and a code (`expired_failed`, `purge_failed`, `due_failed`), never error text. Imports only `lib/outbox` and `lib/outbox-store` (zero `lead-sync`/`espocrm` matches).
- **Dispatcher** `lead.purge` branch: booking row gone -> skipped `source_missing`; `!isPurgeEligible(row, now)` -> skipped `purge_not_eligible` (zero CRM requests); GET Lead by `cSupabaseRef = booking:<id>` (select id,status); none -> sent; any live status other than Dead -> skipped `purge_lead_not_dead`; `DELETE /Lead/<id>` -> sent, 404 = already gone = sent; 503 -> backoff reschedule, 401 -> 6 h breaker (shared classification). The store has no booking write method, so the booking row is never touched (D-15). No Task, reminder or notification (D-04).
- **Requirement text**: `.planning/REQUIREMENTS.md` LEAD-04 bullet replaced exactly as specified; `.planning/ROADMAP.md` Phase 81 criterion 4 got the scoped note `(calculator capture struck — page removed 2026-05-04, D-01)`. No progress checkbox or counter touched.
- **vercel.json**: fourth cron entry appended; the three existing entries are byte-for-byte unchanged.

## Verification

- `npx vitest run` on outbox-sweep, lead-purge, outbox-migrations, lead-sync-booking, lead-sync, infra-vps-isolation-guard, integrations-dispatch, integrations-kick, lead-mapping: 9 files, 264 tests passed.
- New tests: 13 in `tests/outbox-sweep.test.ts` (401 paths, fail-closed, maxDuration, per-step isolation, no leak of error text, batch size, publish-count semantics, wiring checks for the route imports and the exact `vercel.json` cron list, and the end-to-end tracer: expired unpaid booking -> sweep -> publish -> `dispatchOutboxKey` -> fake-CRM Lead `Dead` -> next day's run enqueues nothing); 25 in `tests/lead-purge.test.ts` (eligible delete, 404, no Lead, five re-opened statuses, nine ineligibility cases including the exact-90-day and 90-day-plus-1-ms boundaries, source gone, 503, 401, duplicate delivery, only-one-DELETE scope); 10 new 068 structure checks in `tests/outbox-migrations.test.ts`.
- eslint clean on the route, `lib/outbox-store.ts`, `lib/lead-sync.ts` and all touched test files; `tsc --noEmit` reports only the 8 baseline errors in `tests/`.
- Acceptance greps: cron list check exits 0 (4 paths); `lead-sync|espocrm` in the route = 0; `git diff afebb336..HEAD -- lib/purge-quote-leads.ts app/api/cron/reminder-24h/route.ts` is empty (D-01); `isPurgeEligible` in lead-sync = 2; `purge_lead_not_dead` = 1; `from('bookings').update|delete` in outbox-store/lead-sync = 0; `calculator was removed 2026-05-04` = 1; `LEAD-04.*Phase 81 D-01` = 1; `calculator capture struck` in ROADMAP = 1.
- Not run in this worktree: the full suite (known next-intl symlink artifact); the orchestrator should re-run it on the main checkout.

## Task 3 - DONE, orchestrator applied via Supabase MCP (2026-10-18)

- Pre-apply schema check: bookings has created_at, status, booking_source, leg, pickup_utc (timestamptz), payment_link_id (text).
- MCP results (project enakcryrtxlnjvjutfpv): apply 068 = success; smoke = error exactly `SMOKE_OK_81_10` (every assertion below passed, rolled back); after the smoke lead_capture_start rows = 0, smoke bookings = 0, `lead.purge:%`/`lead.booking:%` outbox rows = 0, all three functions SECURITY DEFINER; advisors (security) = no ERROR/WARN naming any 068 function (only pre-existing INFO rls_enabled_no_policy on unrelated tables + Auth leaked-password WARN).

- Migration file: `supabase/migrations/068_outbox_sweep.sql`, MCP `apply_migration` name `068_outbox_sweep`.
- Smoke SQL: `.planning/phases/81-lead-capture-site-forms-supabase-espocrm/81-10-smoke.sql` (one DO block ending in `RAISE EXCEPTION 'SMOKE_OK_81_10'`; only that message is success). It inserts its own `lead_capture_start` row inside the transaction (the live DB has none) and the rollback removes it; it aborts up front if the key already exists. Insert column lists are the ones proven live by 81-09-smoke.sql; past pickups are set through `pickup_date` / `pickup_time`.
- Expectations: apply succeeds; smoke returns exactly `SMOKE_OK_81_10`, which proves: capture off -> both enqueue functions return 0; with seven smoke bookings (a online unpaid pickup 2 days ago, b online 91 days, c manual 91 days, d online with payment link 91 days, e online future pickup, f online return leg 91 days, h online 91 days created before the capture start) `outbox_enqueue_expired_unpaid()` returns 4 (a, b, c, d) and 0 on the second call; `outbox_enqueue_abandoned_purge()` returns 1 (only b, key `lead.purge:<b id>`) and 0 on the second call; `outbox_due_keys(500)` contains the `:dead` key of a, the purge key of b and an expired-lease processing row but not a live-lease, future-pending or sent row; `p_limit` 0 is raised to 1 and the cap is 500; all seven smoke bookings stay `unpaid`; anon/authenticated cannot EXECUTE any of the three functions, service_role can.
- After the smoke (separate calls): `select count(*) from public.integration_config where key='lead_capture_start'` = 0; `select count(*) from public.bookings where client_email='smoke+81-10@rideprestigo.com'` = 0; no `lead.purge:%` / `lead.booking:%` outbox rows left; `get_advisors` (security) shows no ERROR naming `outbox_enqueue_expired_unpaid`, `outbox_enqueue_abandoned_purge` or `outbox_due_keys`.
- The migration must be applied before the first cron run, otherwise the sweep reports `expired_failed` / `purge_failed` / `due_failed` codes (harmless, but nothing is swept).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing test used `lead.purge` as its "unsupported event" example**
- **Found during:** Task 2
- **Issue:** `tests/lead-sync.test.ts` "an unsupported event type is failed unsupported_event" built its row with `event_type: 'lead.purge'`, which is now a supported event, so the test failed after the purge branch landed.
- **Fix:** the row now uses `event_type: 'lead.something_else'` (the dispatcher switches on `event_type`); the assertion is unchanged.
- **Files modified:** tests/lead-sync.test.ts
- **Commit:** dad89d0d

**2. [Plan deviation - process] Task 3 not executed by this agent**
- The Supabase MCP tools are not available to the executor; handed back as documented above.

**3. [Process] Plan commit ledger not persisted.** As in 81-07 and 81-09, writing the ledger file into the git dir is blocked by the sandbox compound-command guard. `plan_head_before` is the worktree base SHA; `commits: 3` was measured with `git rev-list --count afebb336..HEAD` before this SUMMARY commit.

**4. [Process] TDD order.** The migration was written before its structure tests (those passed on first run); the sweep route tests and the purge tests were written first and observed RED (missing module; 24 of 25 failing) before the implementation.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-81-30 (timing-safe fail-closed bearer; purge selection is date-based so an extra call cannot purge early), T-81-31 (SQL predicate + live `isPurgeEligible` re-check + Lead must be Dead + boundary tests + negative smoke rows), T-81-33 (200-key cap, per-day dedup suffix, sent rows never selected) are mitigated; T-81-32 accepted (each purge leaves its outbox row as the audit record).

## Notes for the verifier / follow-ups

- "Dead after pickup" can lag pickup by up to ~25 h (daily cron). The Lead is Dead earlier whenever the dispatcher runs for any other event after pickup, because `bookingLeadStatus` already maps unpaid-past-pickup to Dead.
- "90 days after becoming Dead" is measured from pickup (flagged assumption in the plan): a Lead that went Dead earlier by cancellation is not an abandoned checkout and is never purged.
- Edge: the daily purge only enqueues each booking once (`ON CONFLICT` on the key). If a purge row is skipped because the owner re-opened the Lead, it is not re-evaluated later; the owner re-opened it deliberately.
- Plan 81-11 (go-live) sets `lead_capture_start`; until then the two enqueue functions return 0 and only already-pending rows (inquiries) are re-published.

## Self-Check: PASSED

- Files exist: migration 068, sweep route, `tests/outbox-sweep.test.ts`, `tests/lead-purge.test.ts`, smoke SQL, this SUMMARY.
- Commits exist: 7870734d, dad89d0d, 11ab6c2d.
