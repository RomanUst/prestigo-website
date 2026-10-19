---
phase: 82-site-crm-chatwoot-sync-foundation
plan: 01
subsystem: sync / identity
tags: [supabase, outbox, identity, triggers, qstash, tdd]
status: partial
requires:
  - phase: 81 (integration_outbox 064, outbox_kick 067, lead dispatcher)
provides:
  - identity tables (contact_identities, identity_emails, identity_phones, phone_flags, booking_identity)
  - bookings_crm_sync and customer_profiles_crm_sync capture triggers (gated by crm_sync_start)
  - resolver RPCs identity_resolve_booking / identity_resolve_user, read RPCs crm_booking / identity_person
  - lib/identity-store.ts, lib/sync-resolve.ts (resolver hop), lib/dispatch-outcomes.ts
  - kick route allow-set for sync.booking / sync.signup
affects: [82-02, 82-03, 82-05, 82-07, 82-10, 82-12, 82-14]
key-files:
  created:
    - supabase/migrations/069_identity_core_sync_triggers.sql
    - lib/dispatch-outcomes.ts
    - lib/identity-store.ts
    - lib/sync-resolve.ts
    - tests/sync-resolve.test.ts
    - tests/identity-store.test.ts
    - tests/crm-sync-migrations.test.ts
    - .planning/phases/82-site-crm-chatwoot-sync-foundation/82-01-smoke.sql
  modified:
    - lib/outbox.ts
    - lib/lead-sync.ts
    - app/api/integrations/kick/route.ts
    - tests/outbox.test.ts
    - tests/integrations-kick.test.ts
decisions:
  - "identity_resolve_core is internal: REVOKEd from PUBLIC/anon/authenticated and NOT granted to service_role, so nothing can resolve without the global advisory lock"
  - "A signup claiming an identity is skipped (user_id stays unique) when the user already owns a different identity; merging two identities is out of scope here"
  - "enqueue_profile_sync also skips UPDATEs that re-send identical full_name/phone, same as the booking trigger"
  - "parseOutboxKey keeps lead.* results byte-identical (no tag property); the optional tag exists only on sync.* / erase.person results"
  - "sync.espo / sync.chatwoot / erase.person complete failed unsupported_event until plans 82-07, 82-10, 82-12 add their handlers"
metrics:
  tasks_total: 4
  tasks_done: 3 (Task 0 by orchestrator, Tasks 1 and 2 by this executor); Task 3 PENDING (orchestrator MCP)
  commits: 3
  plan_head_before: e8f6657b7b0a2fb8e71421be9af7dae9b31bbd4e
  plan_head_after: 5b7503bd9cfa690bdda07a7b533099073e3604b9
  completed: 2026-10-19
actuals:
  tokens: 27000
  tasks: 3
  commits: 3
---

# Phase 82 Plan 01: Identity core + booking/signup capture + resolver hop Summary

Booking and signup writes are captured by exception-safe, bucketed triggers into ids-only `sync.booking` / `sync.signup` outbox rows; the dispatcher resolves each to one person in Supabase (email rule) and fans out per-person `sync.espo` / `sync.chatwoot` rows (or one orphan CBooking row), with no booking, payment or signup code touched.

## Status

Code and tests for Tasks 1 and 2 are complete and committed. **Task 3 (apply migration 069 live, run the rolled-back smoke, advisor check) is PENDING** - gsd-executors have no Supabase MCP. The orchestrator must apply it and fill in the results below.

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 0 | Live schema snapshot 82-LIVE-SCHEMA.md (orchestrator) | done | e8f6657b |
| 1 | Tracer: booking trigger -> sync.booking -> resolver hop -> identity -> fan-out | done | a21cf7fa |
| 2 | Signup capture, user resolver, person/booking read contract, kick allow-set | done | 73e46aa8 |
| 3 | Apply 069 live + smoke SMOKE_OK_82_01 (orchestrator, Supabase MCP) | **PENDING** | smoke SQL committed in 5b7503bd |

## What was built

- **Migration 069** (`supabase/migrations/069_identity_core_sync_triggers.sql`): `bookings.anonymised_at`; five deny-all identity tables (RLS on, REVOKE ALL from anon/authenticated, four deny policies each); `identity_normalize_email`, `identity_is_abandoned`, `identity_resolve_core` (email rules only, phones arrive in 82-05), `identity_resolve_booking`, `identity_resolve_user`, `crm_booking`, `identity_person`, `identity_email_owners`, `identity_set_espo_contact`, `identity_set_chatwoot_contact`; trigger functions `enqueue_booking_sync` / `enqueue_profile_sync` with `sync.*:<id>:<floor(epoch/90)>` keys, `available_at = now() + 90 s`, `crm_sync_start` gate, outer and kick exception blocks. 12 functions, 12 `SET search_path = ''`, one REVOKE line per function. Only booking columns listed in 82-LIVE-SCHEMA.md are used (all 25 synced columns exist live; `crm_booking` columns all exist too, so none are emitted as forced JSON null).
- **TS**: `syncBucketKey` and the new key shapes in `lib/outbox.ts`; `lib/dispatch-outcomes.ts` (skip / breaker / retryLater moved out of lead-sync unchanged); `lib/identity-store.ts` (RPC wrappers, every error -> `OutboxStoreError('db_error')`); `lib/sync-resolve.ts` (`deliverResolve`); `lib/lead-sync.ts` routes `sync.booking` / `sync.signup` to the hop without the EspoCRM gate, the other new types fail `unsupported_event`; kick route allow-set `{lead.booking, sync.booking, sync.signup}`.
- **Tests**: 252 tests pass across `sync-resolve`, `identity-store`, `crm-sync-migrations`, `integrations-kick`, `outbox`, `lead-sync`, `lead-sync-booking`, `lead-purge`, `outbox-sweep`, `infra-vps-isolation-guard`. `eslint --quiet` is clean on every touched lib/app/test file and `tsc --noEmit` reports no error outside the pre-existing `tests/` baseline.

## Deviations from Plan

**1. [Process] Tests were written after the implementation, not before.** Plan asked for RED then GREEN; I wrote the code first and the tests second in each task, so there was no observed RED run. All tests pass; the migration-text guards and the in-memory dispatcher doubles fully cover the plan's behavior list.

**2. [Rule 2 - correctness] `identity_resolve_core` is not granted to service_role.** The plan says GRANT for "the non-trigger ones"; the core is documented as internal with the caller holding the lock, so granting it would allow a lock-free call and a duplicate-identity race (T-82-04). It is REVOKEd from PUBLIC/anon/authenticated like the rest.

**3. [Rule 1 - robustness] Unique `user_id` guard.** If a signup's address already belongs to identity I but the user already owns a different identity J, setting `I.user_id` would violate `contact_identities.user_id UNIQUE` and abort the hop. The UPDATE is guarded with `NOT EXISTS`, and I is returned `resolved`; J is returned as `previous_identity_id`, so both persons are refreshed. Merging I and J is not attempted (later plans).

**4. [Rule 2] `enqueue_profile_sync` skips identical-value UPDATEs** (OLD/NEW `full_name`, `phone` IS NOT DISTINCT FROM), mirroring the booking trigger, so a profile re-save without changes enqueues nothing.

**5. [Environment] Plan-head ledger file not written.** `.git/worktrees/<id>/` is not writable from this sandbox; `plan_head_before` is the dispatch base e8f6657b (commits counted manually: 3).

**6. [Smoke design] Statuses.** The smoke SQL uses `pending` instead of `confirmed` for the generic inserts (avoids the 063 calendar trigger entirely) and `unpaid` for the abandoned case. Step (h) (read contracts) runs before (e) so the two-bookings assertion is valid.

## Auth gates

None.

## Known Stubs

None. `sync.espo`, `sync.chatwoot` and `erase.person` completing `failed / unsupported_event` is an intentional hand-off to 82-07, 82-10 and 82-12; no capture is live yet (`crm_sync_start` absent), so nothing reaches those branches in production.

## Threat Flags

None beyond the plan's register (T-82-01..05, 48). No new endpoint or customer-readable path; the kick route only widened its allow-set to two more id-only key shapes.

## Task 3 handoff (ORCHESTRATOR, Supabase MCP)

1. `apply_migration` name `069_identity_core_sync_triggers` with the committed file text.
2. `execute_sql` the single DO block in `.planning/phases/82-site-crm-chatwoot-sync-foundation/82-01-smoke.sql`. Success is exactly the error message `SMOKE_OK_82_01`; any other message is `FAIL (<step>): ...` naming the assertion. Notes: step (g) inserts into `auth.users` (needs INSERT for the executing role; if it is denied, drop the auth.users/profile part of (g) and test the signup path with an existing user id inside the rolled-back transaction). Step (b) cannot cross a bucket boundary (now() is fixed in a transaction), so "next bucket gets a second row" is covered only by the key-format tests.
3. `get_advisors` (security): no new ERROR naming a 069 table or function.
4. `select count(*) from public.integration_config where key = 'crm_sync_start'` must be 0.
5. Fill in: apply result, smoke message, advisor ERROR count, crm_sync_start count.

| Item | Result |
|------|--------|
| apply_migration 069 | _PENDING_ |
| smoke message | _PENDING_ (expect `SMOKE_OK_82_01`) |
| advisor ERRORs on 069 objects | _PENDING_ (expect 0) |
| crm_sync_start count after smoke | _PENDING_ (expect 0) |

Test-environment note: tests ran through the symlinked main-checkout `node_modules`; no next-intl failures were seen, but the orchestrator should still re-run the verify command on the main checkout.

## Self-Check: PASSED

- Files exist: migration 069, `lib/dispatch-outcomes.ts`, `lib/identity-store.ts`, `lib/sync-resolve.ts`, `82-01-smoke.sql`, the four new test files.
- Commits exist: a21cf7fa, 73e46aa8, 5b7503bd (plus snapshot e8f6657b from the orchestrator).
- No file under `app/api/webhooks`, `create-payment-intent`, `app/api/admin`, `app/api/gnet`, `submit-quote`, `app/auth` or the login page was changed.
