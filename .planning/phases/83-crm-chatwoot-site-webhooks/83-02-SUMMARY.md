---
phase: 83-crm-chatwoot-site-webhooks
plan: 02
subsystem: identity / database
tags: [identity, chat, supabase, migration, security-definer, advisory-lock]
requires:
  - phase: 82-site-crm-chatwoot-sync-foundation
    provides: identity tables, identity_resolve_core (072), identity_normalize_email/phone, global identity advisory lock
provides:
  - "identity_emails.basis accepts 'chat'"
  - "identity_resolve_chat, identity_chat_lookup, identity_by_chatwoot_contact, identity_attach_chat_contact, identity_phone_usable (migration 077)"
  - "IdentityStore.chatLookup / byChatwootContact / resolveChat / attachChatContact / phoneUsable"
affects: [83-03, 83-07, 83-10]
tech-stack:
  added: []
  patterns:
    - "Chat path reuses identity_resolve_core under the same global advisory lock instead of re-implementing matching"
    - "Basis CHECK dropped by pg_get_constraintdef text, never by generated name"
key-files:
  created:
    - supabase/migrations/077_identity_chat.sql
    - tests/chat-identity-migration.test.ts
    - .planning/phases/83-crm-chatwoot-site-webhooks/83-02-smoke.sql
  modified:
    - lib/identity-store.ts
    - tests/identity-store.test.ts
key-decisions:
  - "customer = account (user_id) OR any booking_identity row; a chat stranger is an identity but not a customer (resolves D-01 / D-16)"
  - "Operator attach never merges: an email owned by another identity returns owned_elsewhere and nothing changes; attach never writes phone_flags and does not use core rule 4"
  - "byChatwootContact stamps the requested contact id onto each returned ChatIdentity (RPC does not echo it)"
requirements-completed: [HOOK-01, HOOK-03]
status: complete-pending-orchestrator
commits: 3
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: e90ef8698205072b58db68eaae658eaea9ee71f9
actuals:
  tokens: 28000
  tasks: 2
  commits: 3
---

# Phase 83 Plan 02: Chat identity layer Summary

**Migration 077 gives chat strangers a normal erasable site identity (basis 'chat') through the same locked resolver core as bookings, plus read-only customer classification and a never-merging operator attach.**

## Status

Tasks 1 and 2 complete (code + tests, committed). Task 3 (apply migration 077 live + rolled-back smoke) is PENDING (orchestrator): executors have no Supabase MCP. Migration is NOT yet applied live.

## Tasks

| Task | Name | Commit | Status |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | identity_resolve_chat + identity_chat_lookup + basis 'chat' + store wrappers | a3fe5314 | done |
| 2 | identity_by_chatwoot_contact, identity_attach_chat_contact, identity_phone_usable + wrappers | 64b8eda8 | done |
| 3 | [BLOCKING][ORCHESTRATOR] apply 077 live + smoke SMOKE_OK_83_02 | e90ef869 (smoke SQL only) | PENDING (orchestrator) |

## What was built

- `supabase/migrations/077_identity_chat.sql`
  - Basis CHECK: DO block drops every CHECK on `identity_emails` whose definition mentions `basis` (no hard-coded name), then adds `identity_emails_basis_check` allowing email, phone, signup, split, chat.
  - `identity_resolve_chat(text, text)`: global lock `pg_advisory_xact_lock(hashtextextended('identity', 0))`, then `identity_resolve_core(email, phone, 'chat', NULL)`; returns `customer` for the resolved identity. Never sets user_id.
  - `identity_chat_lookup(text)` / `identity_by_chatwoot_contact(bigint)`: STABLE, no writes, LIMIT 2 on the latter (2 rows = ambiguous).
  - `identity_attach_chat_contact(uuid, text, text)`: lock, outcomes attached / unchanged / owned_elsewhere / shared / none / erasing / identity_missing; inserts email with basis 'chat'; no merge, no phone_flags write.
  - `identity_phone_usable(text)`: E.164 or NULL when unparseable or flagged shared.
  - All five: SECURITY DEFINER, `SET search_path = ''`, per-function REVOKE FROM PUBLIC, anon, authenticated, GRANT to service_role.
- `lib/identity-store.ts`: `ChatIdentity`, `ChatResolveResult`, `AttachOutcome`, `AttachResult` types and the five store methods; every RPC error or unexpected shape becomes `OutboxStoreError('db_error')`. No CRM import.

## Verification

- `npx vitest run tests/chat-identity-migration.test.ts tests/identity-store.test.ts tests/crm-sync-migrations.test.ts`: 3 files, 71 tests passed.
- `npx tsc --noEmit`: no errors in lib/identity-store.ts or the two test files.
- `npx eslint --quiet lib/identity-store.ts tests/identity-store.test.ts tests/chat-identity-migration.test.ts`: clean.
- Tests run through the symlinked main-checkout node_modules; no next-intl issue appeared.
- Live behaviour (concurrency, ownership, privileges) is proven only by the smoke, which the orchestrator must run.

## Orchestrator hand-off (Task 3)

1. MCP execute_sql (catalog): `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.identity_emails'::regclass and contype = 'c'`; record names (RESEARCH A6).
2. MCP `apply_migration` name `077_identity_chat` with the text of `supabase/migrations/077_identity_chat.sql`.
3. MCP execute_sql with the contents of `.planning/phases/83-crm-chatwoot-site-webhooks/83-02-smoke.sql` (8.9 KB); expected exception message exactly `SMOKE_OK_83_02`; any `FAIL (x)` names the broken step (a-h).
4. MCP get_advisors (security): no new ERROR naming a 077 function.
5. Record the pre-apply constraint names, apply result, smoke message and advisor ERROR count here.

Orchestrator results: PENDING.

## Deviations from Plan

None - plan executed as written (the RED step for Task 1 was not run in isolation; tests and code were written together before the first run, Task 2 RED was observed with 4 failing tests before the SQL/TS landed).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-83-09, T-83-10, T-83-11 mitigated in code; T-83-10 concurrency and T-83-11 privileges are confirmed live only by smoke steps (b)/(h)).

## Self-Check: PASSED

- supabase/migrations/077_identity_chat.sql, tests/chat-identity-migration.test.ts, 83-02-smoke.sql exist.
- Commits a3fe5314, 64b8eda8, e90ef869 exist on the worktree branch.
