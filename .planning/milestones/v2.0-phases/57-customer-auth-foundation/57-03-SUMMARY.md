---
phase: 57-customer-auth-foundation
plan: 03
subsystem: database
tags: [supabase, rls, migrations, postgres, typescript-types, auth]

requires:
  - phase: 57-01
    provides: migrations 044 (customer_profiles + RLS) and 045 (bookings.user_id FK)
  - phase: 57-02
    provides: customer auth surface (login, callback, middleware, account) consuming the new schema
provides:
  - customer_profiles table live in production with 3 own-row RLS policies
  - bookings.user_id nullable FK live in production (anonymous bookings un-regressed)
  - types/database.types.ts regenerated from the live schema
affects: [phase-60-booking-account-linking, customer-account-features]

tech-stack:
  added: []
  patterns: [Supabase MCP apply_migration for DDL, generated Database types committed to repo]

key-files:
  created: [types/database.types.ts]
  modified: [.planning/phases/57-customer-auth-foundation/57-VALIDATION.md]

key-decisions:
  - "bookings RLS left untouched: rowsecurity already ON with deny-anon policies; anonymous inserts work via service-role client which bypasses RLS, so 045 needed no policy changes"
  - "Generated types committed even though Supabase clients are currently untyped — additive, gives a source of truth for the live schema and unblocks future typed clients"

patterns-established:
  - "Schema-push gate: migrations applied to the live DB via Supabase MCP apply_migration, verified with execute_sql before phase verification, preventing false-positive type checks against stale generated types"

requirements-completed: [AUTH-06, ACCT-04]

duration: ~40min
completed: 2026-06-11
---

# Phase 57 / Plan 03: Live DB Migration + Verification Gate Summary

**Migrations 044 + 045 applied to the live Supabase database after an RLS pre-check; live schema verified, types regenerated, full automated gate green, and the manual OAuth/email round-trips approved by the user.**

## Performance

- **Duration:** ~40 min (incl. blocked-on-MCP investigation by the executor, then orchestrator-applied via Supabase MCP)
- **Completed:** 2026-06-11
- **Tasks:** 3/3 (Task 1 + Task 2 automated; Task 3 human-verify checkpoint approved)
- **Files modified:** 2 (types/database.types.ts created, 57-VALIDATION.md finalized)

## Accomplishments

### Task 1 — [BLOCKING] Apply migrations + regenerate types
- **bookings RLS pre-check** (RESEARCH Open Question 3 / A5): `relrowsecurity = true` with 4 deny-anon policies (delete/insert/select/update). Decision: 045 is safe as written and needs NO bookings RLS change — anonymous booking inserts use the service-role client, which bypasses RLS.
- **Applied migration 044** (`customer_profiles` table + index + 3 own-row RLS policies) via Supabase MCP `apply_migration` → `{success:true}`.
- **Applied migration 045** (`bookings.user_id` nullable FK + partial index) via `apply_migration` → `{success:true}`.
- **Verified live schema** via `execute_sql`:
  - `customer_profiles` columns: id, user_id (NOT NULL UNIQUE), account_type (NOT NULL), company_name (nullable), created_at, updated_at.
  - `bookings.user_id` exists with `is_nullable = YES`.
  - 3 policies present: `customer_profiles_select_own` / `_insert_own` / `_update_own`, all using `(SELECT auth.uid()) = user_id`.
- **Regenerated** `types/database.types.ts` from the live schema (contains `customer_profiles` + `bookings.user_id`). `npx tsc --noEmit` green.
- Commit: `9b1ec26`.

### Task 2 — Full verification gate
- Full suite: 808 passed, 10 skipped, 139 todo, **29 pre-existing failures** in 4 files (`google-reviews`, `create-payment-intent`, `admin-bookings`, `BookingWizard`) — reproduced identically at pre-phase commit `4dcc017`, so zero new failures from Phase 57. Tracked as a separate follow-up task.
- Phase-relevant tests: **49/49 GREEN** (auth-customer 10, auth-callback 8, middleware-customer 7, webhooks-stripe 24 incl. ACCT-04 anonymous-insert regression).
- RLS isolation (AUTH-06): confirmed 3 own-row policies via `execute_sql`; cross-row reads blocked by `auth.uid() = user_id`.
- Anonymous-booking regression (ACCT-04): 16 existing bookings, 0 with user_id, latest row reads back fine; no write path forced to supply user_id.
- 57-VALIDATION.md finalized (`status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`, T1/T2 rows → ✅).
- Commit: `2112ed4`.

### Task 3 — Manual OAuth + email round-trip (checkpoint:human-verify)
- Presented the 7-step live verification checklist (magic-link, Google OAuth, Apple OAuth, corporate register, password reset, admin separation, sign-out).
- **User response: approved.**

## Deviations

- **Executor blocked on MCP, orchestrator completed Task 1:** the spawned `gsd-executor` subagent could not reach the Supabase MCP tools from its context and returned a `checkpoint:human-action`. The orchestrator (which does have Supabase MCP access) applied the migrations, verified the schema, regenerated the types, and committed — then continued Task 2 inline. Net result matches the plan's acceptance criteria exactly.
- **29 pre-existing test failures** are out of scope for this plan; documented as a baseline rather than fixed here.

## Verification

- Migrations confirmed applied via Supabase MCP `execute_sql` (columns + policies + nullable FK). ✅
- `npx vitest run` — no new failures vs the 29-failure baseline; 49/49 phase tests green incl. ACCT-04. ✅
- `npx tsc --noEmit` green against regenerated types. ✅
- Manual OAuth + email round-trips approved by user. ✅
