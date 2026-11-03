---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 01
subsystem: lead-capture
tags: [outbox, supabase, inquiries, qstash, rls, forms]
status: complete-pending-mcp
requires: []
provides:
  - "public.integration_outbox + integration_config + outbox_enqueue/claim/complete/reschedule RPCs (migration 064)"
  - "public.inquiries + enqueue_inquiry_lead trigger (migration 065)"
  - "lib/outbox.ts (parseOutboxKey, inquiryOutboxKey, publishOutboxDispatch, dispatchAfterResponse, enqueueOutboxEvent)"
  - "lib/inquiries.ts (storeInquiry, InquiryKind, InquiryInput)"
affects:
  - app/api/contact/route.ts
  - app/api/corporate-contact/route.ts
  - app/api/submit-multiday-quote/route.ts
tech-stack:
  added: []
  patterns:
    - "ids-only outbox, per-aggregate advisory-lock lease claim"
    - "never-throwing best-effort store with 3 s race and code-only logging"
    - "after() wrapped in try/catch; daily sweep re-arms"
key-files:
  created:
    - supabase/migrations/064_integration_outbox.sql
    - supabase/migrations/065_inquiries.sql
    - lib/outbox.ts
    - lib/inquiries.ts
    - tests/inquiry-routes.test.ts
    - tests/outbox-migrations.test.ts
    - tests/outbox.test.ts
  modified:
    - app/api/contact/route.ts
    - app/api/corporate-contact/route.ts
    - app/api/submit-multiday-quote/route.ts
decisions:
  - "Dispatch is scheduled only after the email succeeded; if the email fails the inquiry row and its pending outbox row still exist and the daily sweep (plan 81-10) delivers it"
  - "integration_outbox_set_updated_at also gets REVOKE EXECUTE (all five functions in 064 are revoked from PUBLIC/anon/authenticated)"
requirements: [LEAD-01, LEAD-02, LEAD-03, LEAD-05]
metrics:
  tasks_total: 3
  tasks_completed: 2
  task_pending: "Task 3 (live migration apply) - orchestrator via Supabase MCP"
commits: 2
plan_head_before: e402616a5fe02ad76897effbe173c320ad8aad3e
plan_head_after: 7e8ac1d46340cd7ff449d1f7bfa1a7c69b0d92fc
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
completed: 2026-10-18
---

# Phase 81 Plan 01: Outbox core + inquiry capture for the three site forms Summary

Every contact, corporate and multi-day-quote submission is now stored in a new `inquiries` table whose INSERT trigger enqueues an ids-only `integration_outbox` row; the visitor-facing response and emails are unchanged even when storage fails. Migrations 064/065 are written and structurally tested but NOT yet applied to the live database (Task 3 is MCP-gated).

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: contact form -> inquiries -> outbox -> publish after response | done | c3862283 |
| 2 | Corporate + multi-day join the same path; outbox helper tests | done | 7e8ac1d4 |
| 3 | [BLOCKING] Apply 064/065 to live Supabase + rolled-back smoke | DONE - orchestrator applied via Supabase MCP | - |

## Task 3: DONE - orchestrator applied via Supabase MCP (2026-10-18)

The executor has no Supabase MCP tools and did not improvise (no psql, no CLI against prod).
The orchestrator must, in order:

1. `apply_migration` name `064_integration_outbox`, body = `supabase/migrations/064_integration_outbox.sql`
2. `apply_migration` name `065_inquiries`, body = `supabase/migrations/065_inquiries.sql`
3. `list_tables` (schema public): integration_outbox, integration_config, inquiries exist with RLS enabled
4. `execute_sql` one DO block that must end in an error whose message is exactly `SMOKE_OK_81_01` (so everything rolls back). It must:
   - insert an inquiry (kind `contact`, email `smoke+81-01@rideprestigo.com`)
   - assert exactly one outbox row with key `'lead.inquiry:' || id` and status `pending`
   - assert `outbox_claim(key, 60)` returns one row with status `processing` and attempts 1
   - assert a second `outbox_claim(key, 60)` returns no row
   - assert `outbox_complete(key, 'sent', NULL)` is true
   - assert `NOT has_function_privilege('anon', 'public.outbox_claim(text,integer)', 'EXECUTE')`
   - assert `NOT has_table_privilege('anon', 'public.inquiries', 'SELECT')`
   - end with `RAISE EXCEPTION 'SMOKE_OK_81_01'`
5. `get_advisors` type security: no ERROR-level item naming integration_outbox, integration_config, inquiries, outbox_enqueue, outbox_claim, outbox_complete, outbox_reschedule or enqueue_inquiry_lead (record WARNs)

If a file must change to apply cleanly, fix it, re-run `npx vitest run tests/outbox-migrations.test.ts`, and commit as `security(81-01): fix migration for live apply`. Both migrations are idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).

MCP results (project enakcryrtxlnjvjutfpv, 2026-10-18): apply 064 = success, apply 065 = success, RLS = true on integration_outbox / integration_config / inquiries, smoke = error exactly `SMOKE_OK_81_01` (all asserts passed: one pending outbox row, first claim -> processing/attempts 1, second claim -> no row, complete sent -> true, anon has no EXECUTE on outbox_claim and no SELECT on inquiries; rolled back, 0 leftover rows), advisors (security) = no ERROR/WARN naming any 064/065 object (only pre-existing INFO rls_enabled_no_policy on other tables + Auth leaked-password WARN).

## What was built

- **064_integration_outbox.sql**: `integration_outbox` (unique `idempotency_key`, status CHECK, `last_error` CHECK `^[a-z0-9_]{1,40}$`, due + aggregate indexes, updated_at trigger), `integration_config` (not seeded), RLS deny-all + REVOKE ALL from anon/authenticated, RPCs `outbox_enqueue` (ON CONFLICT DO NOTHING), `outbox_claim` (advisory xact lock per aggregate, lease, attempts+1), `outbox_complete`, `outbox_reschedule`; all SECURITY DEFINER with `search_path = ''`, EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role.
- **065_inquiries.sql**: `inquiries` (kind CHECK, generated `email_normalized`, payload jsonb; no IP/browser-identification column, no purge), RLS deny-all, exception-guarded `enqueue_inquiry_lead()` AFTER INSERT trigger with key `lead.inquiry:<id>`.
- **lib/outbox.ts**: key parser/builder, QStash publish (delay clamp 0..604800, sanitised dedup id, never throws), `dispatchAfterResponse` (after() in try/catch), `enqueueOutboxEvent` (RPC only).
- **lib/inquiries.ts**: `storeInquiry` - env pre-check, client built inside try, 3 s race, logs `[inquiries] store failed code=<code>` only, inserts exactly kind/email/name/phone/company/payload.
- **Routes**: storage starts in parallel with the email and is awaited after it; status codes and bodies unchanged. Corporate keeps the honeypot return before any store; multi-day stores the full day list, quote reference and E.164 phone.

## Verification

- `npx vitest run tests/inquiry-routes.test.ts tests/outbox.test.ts tests/outbox-migrations.test.ts tests/corporate-contact.test.ts tests/submit-multiday-quote.test.ts`: 80 passed
- `tests/infra-vps-isolation-guard.test.ts`: 24 passed (new files contain no CRM env names)
- `npx tsc --noEmit`: 8 errors, same as the documented baseline in tests/ (none in touched files)
- `npx eslint --quiet` on all touched source and test files: clean
- `tests/corporate-contact.test.ts` and `tests/submit-multiday-quote.test.ts` unchanged vs plan base (empty `git diff`)
- Acceptance greps: pg_advisory_xact_lock present; no ip/user_agent column; no direct outbox table insert; no CRM env names in outbox/inquiries/contact route
- Pre-commit hooks (secret + price scan) ran and passed on both commits. The standalone `verify` skill was not invoked; its checks (tsc, eslint, scoped tests) were run by hand as above.

## Deviations from Plan

**1. [Process] Tests written after the implementation, not RED-first.** Task 1 is marked `tdd="true"`; the implementation and tests were written in the same pass and run green together, so no separate failing-test run was recorded. Behaviour coverage in the plan's `<behavior>` list is complete.

**2. [Rule 1 - Bug] Test regex false positive.** The first "service_role only" check in `tests/outbox-migrations.test.ts` matched the schema name `public` as the `PUBLIC` role. Replaced with a per-line check that every GRANT ends with `TO service_role;`. Fixed in the Task 1 commit.

**3. [Process] Plan commit ledger not persisted.** The `gsd-plan-head-before-81-01` ledger write was rejected by the sandbox's compound-command guard; `plan_head_before` was taken from the known worktree base SHA, and `commits: 2` was measured with `git rev-list --count <base>..HEAD` before this SUMMARY commit.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-81-01..04 mitigations are implemented in the migrations and covered by structural tests; T-81-01 live proof depends on the pending Task 3 smoke).

## Notes for the verifier

- Edge LEAD-05: any failure mode other than the five covered (PostgREST error, thrown client, missing env, 3 s timeout, `after()` throwing) is untested.
- The `integration_config.lead_capture_start` key is intentionally not seeded (plan 81-11 writes it at go-live).

## Self-Check: PASSED (code + live apply)

- FOUND: supabase/migrations/064_integration_outbox.sql, supabase/migrations/065_inquiries.sql, lib/outbox.ts, lib/inquiries.ts, tests/inquiry-routes.test.ts, tests/outbox.test.ts, tests/outbox-migrations.test.ts
- FOUND commits: c3862283, 7e8ac1d4
