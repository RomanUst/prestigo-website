---
phase: 57
plan: "01"
subsystem: auth
tags: [migration, rls, tdd, wave-0, customer-auth]
dependency_graph:
  requires: []
  provides:
    - "supabase/migrations/044_customer_profiles.sql"
    - "supabase/migrations/045_bookings_user_id.sql"
    - "tests/auth-customer.test.ts"
    - "tests/auth-callback.test.ts"
    - "tests/middleware-customer.test.ts"
  affects:
    - "Phase 57 Plan 02 (implements Plan 02 modules to satisfy Wave-0 tests)"
    - "Phase 57 Plan 03 (applies migrations 044 + 045 to live DB)"
tech_stack:
  added: []
  patterns:
    - "TEXT + CHECK for account_type (not enum) — matches existing bookings status/source pattern"
    - "(select auth.uid()) RLS wrapping for per-statement caching"
    - "Partial index WHERE user_id IS NOT NULL for sparse FK columns"
    - "vi.hoisted pattern for Supabase mock in Wave-0 tests"
key_files:
  created:
    - supabase/migrations/044_customer_profiles.sql
    - supabase/migrations/045_bookings_user_id.sql
    - tests/auth-customer.test.ts
    - tests/auth-callback.test.ts
    - tests/middleware-customer.test.ts
  modified: []
decisions:
  - "TEXT + CHECK chosen over Postgres ENUM for account_type per CONTEXT.md D-05 and existing codebase convention"
  - "No DELETE RLS policy on customer_profiles — row removal handled solely by ON DELETE CASCADE from auth.users"
  - "Migration 045 adds no RLS to bookings — deferred to Phase 60 per plan spec"
  - "Wave-0 test files import non-existent Plan 02 modules intentionally — RED state is correct pre-Plan-02"
metrics:
  duration_seconds: 328
  completed_date: "2026-06-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 0
---

# Phase 57 Plan 01: Customer Profiles Migration + Wave-0 Test Scaffolds Summary

**One-liner:** customer_profiles table with RLS isolation + nullable bookings.user_id FK + Wave-0 failing test scaffold for AUTH-01..07 + ACCT-04.

## What Was Built

### Task 1: Migration 044 — customer_profiles (commit dadfa59)

`supabase/migrations/044_customer_profiles.sql` creates the `customer_profiles` table keyed to `auth.users(id)` with full RLS isolation:

- `user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE`
- `account_type TEXT NOT NULL DEFAULT 'personal' CHECK (account_type IN ('personal', 'corporate'))` — TEXT+CHECK, not enum
- `company_name TEXT` (nullable — corporate field, optional)
- RLS enabled with 3 own-row policies (SELECT / INSERT / UPDATE) using `(select auth.uid()) = user_id` for per-statement caching
- No DELETE policy — rows removed only via cascade when `auth.users` row is deleted
- `customer_profiles_user_id_idx` index for FK lookup performance

### Task 2: Migration 045 — bookings.user_id (commit fd9c00b)

`supabase/migrations/045_bookings_user_id.sql` adds a nullable FK column to `bookings`:

- `user_id uuid` — no NOT NULL, no DEFAULT — anonymous inserts remain valid
- `REFERENCES auth.users(id) ON DELETE SET NULL`
- `bookings_user_id_idx` partial index `WHERE user_id IS NOT NULL`
- No RLS changes to bookings (Phase 60 scope)

### Task 3: Wave-0 Test Scaffolds (commit 28464fe)

Three test files authored as failing (RED) until Plan 02 implements the production modules:

**tests/auth-customer.test.ts** — AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-07, ACCT-04
- `sendMagicLink` dispatches OTP with `/auth/callback` redirect, returns `{success:true}`
- `signInWithPassword` returns `{error:'Invalid email or password.'}` on auth error
- Rate-limit check fires before signInWithOtp; 6th call returns "Too many attempts"
- `buildOAuthOptions('google')` and `('apple')` produce redirectTo pointing to `/auth/callback`
- `signUpWithPassword` upserts `customer_profiles` with account_type + company_name
- `customerSignOut` calls `supabase.auth.signOut()` then redirects to `/`
- `saveBookingWithUserId` passes `user_id` through to `from('bookings').insert()`

**tests/auth-callback.test.ts** — AUTH-06
- Valid `?code=` → `exchangeCodeForSession` → `customer_profiles` upsert with `ignoreDuplicates:true` → redirect to `/account`
- `return-to=/booking/confirm` honored as relative path
- `exchangeCodeForSession` failure → `/login?error=auth_callback_error`
- `token_hash + type=signup` → `verifyOtp` → profile upsert → `/account`
- `return-to=https://evil.com` rejected → falls back to `/account`
- `return-to=//evil.com` (protocol-relative) rejected → `/account`
- No code and no token_hash → `/login?error=auth_callback_error`

**tests/middleware-customer.test.ts** — AUTH-05
- Authenticated customer (no `is_admin`) requesting `/admin/dashboard` → redirect to `/`
- Admin user requesting `/admin` → NOT redirected to `/`
- Unauthenticated user requesting `/admin/dashboard` → still `/admin/login` (existing behavior)
- Unauthenticated user requesting `/account` → `/login?return-to=%2Faccount`
- Unauthenticated user requesting `/account/profile` → `/login?return-to=%2Faccount%2Fprofile`
- Authenticated customer requesting `/account` → NOT redirected to `/login`

## Test Results

| File | Status | Reason |
|------|--------|--------|
| tests/auth-customer.test.ts | RED | `@/app/login/actions` not found (Plan 02 not yet implemented) |
| tests/auth-callback.test.ts | RED | `@/app/auth/callback/route` not found (Plan 02 not yet implemented) |
| tests/middleware-customer.test.ts | RED (partial) | 4 new branches fail; 3 existing-behavior tests pass |
| tests/webhooks-stripe.test.ts | GREEN | 24/24 — ACCT-04 anonymous booking regression unaffected |

## Deviations from Plan

None — plan executed exactly as written. The SQL in both migrations matches the spec verbatim (including the `(select auth.uid())` RLS form and partial index). The three test files cover all requirement IDs from the RESEARCH test map.

## TDD Gate Compliance

- RED gate: test files authored importing non-existent modules (`test(57-01)` commit `28464fe`)
- GREEN gate: pending Plan 02 implementation
- This is the correct Wave-0 state per plan spec: "These tests MUST currently fail to import/resolve (RED) — that is expected and correct for Wave 0."

## Security Notes

- T-57-01 mitigated: RLS SELECT policy `USING ((select auth.uid()) = user_id)` in migration 044
- T-57-02 mitigated: RLS INSERT/UPDATE WITH CHECK policies in migration 044
- T-57-03 mitigated: Migration 045 has no NOT NULL and no DEFAULT on `user_id`; anonymous insert path preserved (confirmed by `tests/webhooks-stripe.test.ts` 24/24 green)
- T-57-04 mitigated: No DELETE policy; rows removed only via ON DELETE CASCADE on auth.users

## Commits

| Hash | Type | Description |
|------|------|-------------|
| dadfa59 | feat | migration 044 customer_profiles with RLS (3 policies, no enum, company_name nullable) |
| fd9c00b | feat | migration 045 nullable bookings.user_id FK (no NOT NULL, no DEFAULT, partial index) |
| 28464fe | test | Wave-0 failing auth test scaffolds (auth-customer, auth-callback, middleware-customer) |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| supabase/migrations/044_customer_profiles.sql | FOUND |
| supabase/migrations/045_bookings_user_id.sql | FOUND |
| tests/auth-customer.test.ts | FOUND |
| tests/auth-callback.test.ts | FOUND |
| tests/middleware-customer.test.ts | FOUND |
| .planning/phases/57-customer-auth-foundation/57-01-SUMMARY.md | FOUND |
| commit dadfa59 | FOUND |
| commit fd9c00b | FOUND |
| commit 28464fe | FOUND |
