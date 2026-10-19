---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 08
subsystem: sync / identity admin
tags: [supabase, identity, admin-api, outbox, split, shared-phones, tdd]
status: complete
requires:
  - phase: 82-01 (identity tables, global identity lock, outbox_enqueue, publishOutboxDispatch)
provides:
  - migration 073 (identity_admin_log, identity_phone_merges, identity_shared_phones, identity_mark_shared, identity_split)
  - lib/identity-admin-store.ts (listPhoneMerges, listSharedPhones, splitIdentity, markPhoneShared)
  - GET /api/admin/identities, POST /api/admin/identities/split, POST /api/admin/identities/shared
affects: [82-11 (identities page), 82-07 / 82-10 (handlers converge after a split)]
key-files:
  created:
    - supabase/migrations/073_identity_admin.sql
    - lib/identity-admin-store.ts
    - app/api/admin/identities/route.ts
    - app/api/admin/identities/split/route.ts
    - app/api/admin/identities/shared/route.ts
    - tests/identity-admin.test.ts
    - tests/identity-admin-migration.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-08-smoke.sql
  modified: []
decisions:
  - "identity_split flags the causing phone as shared with source 'split' via ON CONFLICT DO UPDATE ... WHERE source <> 'manual', so a manual mark is never downgraded"
  - "The split route publishes each returned key with dedupSuffix 'p' and answers 200 even if a publish fails (rows are already pending; the daily sweep re-arms them); the response carries the count of successful publishes"
  - "identity_mark_shared takes the global identity lock too (the resolver reads phone_flags under it) and re-marks a row whose shared flag was false as manual"
  - "The route normalises the phone with lib/phone.ts normalizePhone (never guesses a country code); 073 only checks the E.164 regex and does not call identity_normalize_phone (arrives with 072)"
metrics:
  tasks_total: 3
  tasks_done: 3 (Task 3 by orchestrator via Supabase MCP)
  plan_head_before: c7ab2f3fe2d25f16e1be293b798a025cbf3d38e2
  plan_head_after: 54d27bed84936d0502f8a15969e00463f99db1e7
  commits: 3
  completed: 2026-10-19
actuals:
  tokens: 21000
  tasks: 2
  commits: 3
---

# Phase 82 Plan 08: Identities admin backend Summary

Migration 073 plus three admin routes let the owner list phone-based merges and shared numbers, mark a number as shared by hand, and split a wrong phone merge in one transaction with propagation to EspoCRM and Chatwoot through the outbox (no CRM call from the request).

## Status

Code, tests and the smoke SQL are complete and committed. Task 3 was done by the orchestrator on 2026-10-19 ~19:58 UTC (results below).

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Tracer: split route -> identity_split RPC -> new identity + enqueued sync rows -> keys published | done | a0589b2a |
| 2 | List merges and shared numbers + mark a number as shared | done | 3b8f8092 |
| 3 | Apply 073 live + rolled-back smoke SMOKE_OK_82_08 (orchestrator, Supabase MCP) | DONE (orchestrator) | smoke SQL 54d27bed |

## What was built

- **Migration 073** (`supabase/migrations/073_identity_admin.sql`):
  - `identity_admin_log` (action, actor, identity_id, created_at; ids only; RLS deny-all with four policies; REVOKE ALL from anon/authenticated).
  - `identity_split(p_email, p_actor) -> jsonb`: takes `pg_advisory_xact_lock(hashtextextended('identity', 0))`; refuses unknown email (`not_found`), non-phone basis (`not_phone_merge`), erasing identity (`erasing`); otherwise creates a new identity, re-homes the email with `basis = 'split'` (via_phone kept), moves the `booking_identity` rows whose booking client email is that address, moves the account link when the old identity's auth email equals the split email, flags the causing phone `shared / split` (manual stays manual), writes the audit row, and enqueues `sync.espo` and `sync.chatwoot` (`person` aggregate, key `<type>:<id>:s<epoch>`) for both identities. Returns outcome, both ids and the four keys.
  - `identity_phone_merges()`, `identity_shared_phones()`, `identity_mark_shared(p_phone, p_note, p_actor)` as specified (E.164 regex check, `left(btrim(note), 80)`, source `manual`, `already_shared`, no unmark).
  - Four functions, each SECURITY DEFINER, `SET search_path = ''`, one REVOKE line from PUBLIC/anon/authenticated and a GRANT to service_role. No call to `identity_normalize_phone`.
- **Store** `lib/identity-admin-store.ts`: RPC wrappers only; every RPC error or unexpected shape becomes `Error('db_error')`; no CRM or Chatwoot import.
- **Routes** (guard order: body size, session 401/403, JSON 400, zod strict 400, semantics 422; logs are `[admin/identities.<METHOD>] code=db_error` only):
  - `GET /api/admin/identities` -> `{ merges, shared }`.
  - `POST /api/admin/identities/split { email }` -> 200 `{ ok, oldIdentityId, newIdentityId, published }` after `publishOutboxDispatch(key, { dedupSuffix: 'p' })` for each key; `not_found | not_phone_merge | erasing` -> 422 `{ error }`.
  - `POST /api/admin/identities/shared { phone, note? }` -> normalizePhone null -> 422 `invalid_phone` (message "Enter the number with country code, for example +420 777 123 456."), `already_shared` -> 422 (message "That number is already marked as shared."), else 200 `{ ok, phone }`.
- **Tests**: `tests/identity-admin.test.ts` (24 tests: 401/403/400/422/500 per route, key publication, GET shape, no PII in logs, no CRM import specifiers) and `tests/identity-admin-migration.test.ts` (text guards: lock, basis rules, phone flag source rule, audit, privileges, no unmark, no identity_normalize_phone). With `tests/infra-vps-isolation-guard.test.ts`: 64 tests pass. `eslint --quiet` clean on every touched file; `tsc --noEmit` reports nothing for these files.

## Deviations from Plan

**1. [Process] Tests written alongside / after the implementation, not strictly RED first** (same as 82-01). Two first-run failures were fixed (zod `.trim()` ordering so a padded email is accepted; the privilege test's signature matching) and are covered by tests.

**2. [Environment] Plan-head ledger file not written** (`git rev-parse --git-dir` points into the main repo's `.git/worktrees/`; not written from the sandbox). `plan_head_before` is the dispatch base c7ab2f3f; commits counted with `git rev-list --count c7ab2f3f..HEAD` = 3 (before this SUMMARY commit).

**3. [Rule 2 - correctness] `identity_mark_shared` takes the global identity lock**, because the resolver (82-05) reads `phone_flags` under it; without the lock a mark could race a first-booking merge for the same number. It also revives a `shared = false` row instead of failing on the primary key.

No other deviations.

## Task 3 handoff (ORCHESTRATOR, Supabase MCP)

1. `apply_migration` name `073_identity_admin` with the committed file text (requires 069 live; the file does not depend on 072).
2. `execute_sql` the single DO block in `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-08-smoke.sql`. Success is exactly the error message `SMOKE_OK_82_08`; any other message is `FAIL (<step>): ...`. Precondition: `crm_sync_start` must not exist. Steps: (1) merges list; (2) refused splits; (3) split (identity, booking, phone flag, 4 outbox rows, audit); (4) shared list; (5) mark shared incl. invalid / already_shared / 80-char cut; (6) manual mark not downgraded and account link moves (inserts one `auth.users` row, rolled back); (7) privileges.
3. `get_advisors` (security): no new ERROR naming `identity_admin_log` or a 073 function.

| Item | Result |
|------|--------|
| apply_migration 073 | success (live 2026-10-19) |
| smoke message | `ERROR: P0001: SMOKE_OK_82_08`; leftovers 0 (identities, phone_flags, admin log, SMK-82-08 bookings, outbox rows); crm_sync_start 0 |
| advisor ERRORs on 073 objects | 0 (only pre-existing INFO x10 + WARN leaked-password) |

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan register (T-82-23, T-82-24, T-82-25 mitigated: admin guard first, service_role-only RPCs, audit log with ids only, global lock plus erasing refusal). No route imports a CRM or Chatwoot module; no package was installed.

## Self-Check: PASSED

- Files exist: migration 073, `lib/identity-admin-store.ts`, the three route files, both test files, `82-08-smoke.sql`.
- Commits exist: a0589b2a, 3b8f8092, 54d27bed.
- STATE.md and ROADMAP.md were not modified.
