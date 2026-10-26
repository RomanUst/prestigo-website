---
phase: 83-crm-chatwoot-site-webhooks
plan: 03
subsystem: database
tags: [postgres, supabase, advisory-lock, rls, chatwoot, webhooks, isolation-guard]

requires:
  - phase: 82-site-crm-chatwoot-sync-foundation
    provides: contact_identities, booking_identity, integration_config, OutboxStoreError
provides:
  - migration 078 chat registry (chat_leads, chat_conversations, 10 SECURITY DEFINER RPCs)
  - lib/chat-store.ts RPC wrapper (createChatStore, personKeyFor, chatLeadRef)
  - tests/webhook-isolation-guard.test.ts import-closure barrier for the inbound webhook path (D-17 / HOOK-03)
affects: [83-04..83-16 webhook handlers, 85 chat-conversion statistics, erasure saga (D-16)]

actuals:
  tokens: 31000
  tasks: 2
  commits: 3
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: 1efcb229f22336dedc5ed762b0e59ec5eba2e931

tech-stack:
  added: []
  patterns:
    - "per-person advisory lock + partial unique index WHERE open (one open chat Lead per person)"
    - "import-closure guard: runtime closure of entry modules, type-only imports ignored, forbidden-RPC set derived from migration function bodies"

key-files:
  created:
    - supabase/migrations/078_chat_registry.sql
    - lib/chat-store.ts
    - tests/chat-store.test.ts
    - tests/chat-registry-migration.test.ts
    - tests/webhook-isolation-guard.test.ts
    - .planning/phases/83-crm-chatwoot-site-webhooks/83-03-smoke.sql
  modified: []

key-decisions:
  - "Person key is i:<identity id> or c:<chatwoot contact id>; one open row per key is a partial unique index, not handler logic"
  - "chat_lead_reserve returns the person's open Lead with own=false for a different conversation; a retry of the same conversation returns its own row even when closed"
  - "Guard treats lib/supabase.ts as a boundary (reached, not traversed); a bookings/customer_profiles table handle that does not continue into a call is flagged as unprovable"
  - "chat_erasure_scope/chat_erase also cover conversations linked to in-scope leads; empty or NULL scope matches nothing"

requirements-completed: []  # HOOK-01 / HOOK-03 close only after migration 078 is applied live (Task 3, orchestrator)

duration: 40min
completed: 2026-10-26
status: partial
---

# Phase 83 Plan 03: Chat registry and webhook isolation guard Summary

**Migration 078 makes "one open chat Lead per person" a database guarantee (partial unique index plus per-person advisory lock), lib/chat-store.ts wraps it, and a closure-based guard test proves the inbound webhook path cannot reach booking or profile writes.**

## Status

Tasks 1 and 2 are done and committed. Task 3 (apply migration 078 live and run the rolled-back smoke) is **PENDING (orchestrator)**: executors have no Supabase MCP. The smoke SQL is committed and ready.

## Accomplishments

- `supabase/migrations/078_chat_registry.sql`: `chat_leads` (with `chat_leads_one_open` partial unique index), `chat_conversations`, deny-all RLS, and ten SECURITY DEFINER functions with `SET search_path = ''` and per-function REVOKE/GRANT: `chat_hooks_start`, `chat_lead_reserve`, `chat_lead_set_espo`, `chat_lead_close`, `chat_lead_link_identity`, `chat_conversation_record`, `chat_conversation`, `chat_open_leads_for_person`, `chat_erasure_scope`, `chat_erase`.
- `lib/chat-store.ts`: `createChatStore`, `personKeyFor`, `chatLeadRef`, types per the plan contract; its only `@/lib/supabase` import is `createSupabaseServiceClient`; every RPC error or bad shape becomes `OutboxStoreError('db_error')`.
- `tests/webhook-isolation-guard.test.ts`: four rules (symbol allow-list on `@/lib/supabase`, no write chain off `bookings`/`customer_profiles`, no `auth.admin`, no migration-derived write RPC literal), 16 tests (fixtures named saveBooking / customer_profiles / import type / auth.admin plus real-tree scope and zero violations). Confirmed non-vacuous: temporarily importing `saveBooking` into `lib/chat-store.ts` fails the real-tree test.
- Verification: `npx vitest run tests/chat-registry-migration.test.ts tests/chat-store.test.ts tests/webhook-isolation-guard.test.ts tests/infra-vps-isolation-guard.test.ts` green (81 tests); eslint clean; tsc reports nothing for the new files.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (tracer) | e87d5129 | migration 078 (tables, all RPCs), lib/chat-store.ts, store and migration text tests |
| 2 | 083d643b | webhook-isolation-guard test |
| 3 smoke | 1efcb229 | 83-03-smoke.sql (rolled-back smoke for the orchestrator) |
| 3 apply | PENDING (orchestrator) | apply_migration + smoke run |

## Deviations from Plan

**1. [Process] Lifecycle RPCs landed in the Task 1 commit.** The migration and store were authored as complete files, so the Task 2 functions (`chat_lead_close`, `chat_lead_link_identity`, `chat_open_leads_for_person`, `chat_erasure_scope`, `chat_erase`) and their wrappers and tests are in commit e87d5129; the Task 2 commit adds the isolation guard only. No behavioural impact.

**2. [Process] RED phase not shown separately.** Tests were written after the code in the same pass and passed on first run; the guard's non-vacuity was checked by a temporary violation instead.

**3. [Design] Write-chain rule uses the first chained call.** The plan sketched "write verb before the next `.from(`"; that false-positives on `Map.delete` in files without statement terminators. supabase-js write verbs are always the first method after `.from(table)`, so the guard checks that call and flags a table handle that does not continue into a call as unprovable.

**4. [Design] Conversations of in-scope leads are erased too.** `chat_erase`/`chat_erasure_scope` include `chat_conversations` whose `chat_lead_id` is in scope, so no conversation row is left pointing at a deleted Lead (FK is ON DELETE SET NULL).

## Orchestrator Task 3 (PENDING)

1. MCP `apply_migration` name `078_chat_registry` with the text of `supabase/migrations/078_chat_registry.sql`.
2. `execute_sql` with `.planning/phases/83-crm-chatwoot-site-webhooks/83-03-smoke.sql`; expected error message exactly `SMOKE_OK_83_03` (failing steps are labelled a1..h4 in the assertion message). The smoke could not be run by the executor (no DB access), so a failing step label is possible and should be fixed in the SQL or migration.
3. MCP `get_advisors` (security): no new ERROR naming `chat_leads`, `chat_conversations` or a 078 function; `select count(*) from public.integration_config where key = 'chat_hooks_start'` must be 0.
4. Record apply result, smoke message, advisor ERROR count and the gate count in this SUMMARY.

Results: apply = PENDING; smoke = PENDING; advisors = PENDING; chat_hooks_start count = PENDING.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-83-12..T-83-15 mitigations are implemented; T-83-13 and T-83-15 live proof depends on the smoke).

## Notes for the orchestrator

- node_modules was symlinked from the main checkout (not committed); all tests ran through it without next-intl problems.
- `lib/chat-visit-context.ts` and `lib/chat-widget-contract.ts` match the guard's `lib/chat-*.ts` scope and pass.

## Self-Check: PASSED

- supabase/migrations/078_chat_registry.sql, lib/chat-store.ts, tests/chat-store.test.ts, tests/chat-registry-migration.test.ts, tests/webhook-isolation-guard.test.ts, 83-03-smoke.sql exist.
- Commits e87d5129, 083d643b, 1efcb229 exist on the worktree branch.
