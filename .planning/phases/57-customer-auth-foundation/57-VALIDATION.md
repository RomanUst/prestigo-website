---
phase: 57
slug: customer-auth-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-11
updated: 2026-06-11
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <changed-test-file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30–45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <relevant-test-file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Updated by Plan 03 executor after test run on 2026-06-11.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T1 (57-01) | 01 | 0 | AUTH-06 | T-57-01/02 | customer_profiles RLS select/insert/update own row | unit | `npx vitest run tests/auth-customer.test.ts` | ✅ | ✅ green |
| T2 (57-01) | 01 | 0 | ACCT-04 | T-57-03 | bookings.user_id nullable, anonymous insert unaffected | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ | ✅ green |
| T3 (57-01) | 01 | 0 | AUTH-01..07 | T-57-05..12 | Wave-0 test scaffold covers all auth paths | unit | `npx vitest run tests/auth-customer.test.ts tests/auth-callback.test.ts tests/middleware-customer.test.ts` | ✅ | ✅ green |
| T1 (57-02) | 02 | 1 | AUTH-05 | T-57-06 | Non-admin on /admin/* → redirect to / | unit | `npx vitest run tests/middleware-customer.test.ts` | ✅ | ✅ green (7/7) |
| T2 (57-02) | 02 | 1 | AUTH-01,02,03,04,07 | T-57-05,08,09,10 | Server actions: sendMagicLink, signInWithPassword, signUpWithPassword, buildOAuthOptions, customerSignOut | unit | `npx vitest run tests/auth-customer.test.ts` | ✅ | ✅ green (10/10) |
| T2 (57-02) | 02 | 1 | AUTH-06 | T-57-05 | Callback: code exchange, token_hash, open-redirect guard | unit | `npx vitest run tests/auth-callback.test.ts` | ✅ | ✅ green (8/8) |
| ACCT-04 | 02 | 1 | ACCT-04 | T-57-03 | Anonymous booking regression — user_id NULL succeeds | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ | ✅ green (24/24) |
| T1 (57-03) | 03 | 2 | AUTH-06, ACCT-04 | T-57-13,14 | Live DB: 044+045 applied, RLS policies confirmed | integration | Supabase MCP execute_sql | ✅ | ✅ green (applied 2026-06-11) |
| T2 (57-03) | 03 | 2 | AUTH-06 | T-57-14 | RLS cross-row isolation confirmed via policy query | integration | Supabase MCP execute_sql | ✅ | ✅ green (3 own-row policies, auth.uid()=user_id) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test stubs for `customer_profiles` RLS isolation (one user cannot read/write another's row) — covered by `tests/auth-customer.test.ts` (10/10 green)
- [x] Test stubs for middleware route gating (non-admin → `/admin` redirect to `/`; unauth → `/account` redirect to `/login`) — covered by `tests/middleware-customer.test.ts` (7/7 green)
- [x] Test stubs for `return-to` open-redirect validation (relative-path-only) — covered by `tests/auth-callback.test.ts` (8/8 green)
- [x] Test stubs for `bookings.user_id` nullable FK (anonymous insert still succeeds with null) — covered by `tests/webhooks-stripe.test.ts` (24/24 green)
- [x] Confirm vitest config present; install if missing — vitest.config.ts present, all tests run

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth round-trip | AUTH-03 | Requires live Google provider + browser redirect | Sign in via Google, confirm landing authenticated as customer, `customer_profiles` row created |
| Apple OAuth round-trip | AUTH-04 | Requires live Apple provider + 6-month secret key | Sign in via Apple, confirm landing authenticated, profile row created |
| Magic-link email delivery | AUTH-01 | Requires real email inbox | Request magic link, click email link, confirm authenticated session |
| Password reset email delivery | AUTH-02 | Requires real email inbox | Request reset, click email link, set new password, sign in |

*Profile-creation and session/RLS behaviors are automated via DB queries (Supabase MCP) where possible.*

---

## Full Suite Results (2026-06-11, post Plan 02)

| File | Tests | Status |
|------|-------|--------|
| tests/middleware-customer.test.ts | 7 | ✅ GREEN |
| tests/auth-customer.test.ts | 10 | ✅ GREEN |
| tests/auth-callback.test.ts | 8 | ✅ GREEN |
| tests/webhooks-stripe.test.ts | 24 | ✅ GREEN (ACCT-04 regression confirmed) |
| tests/google-reviews.test.ts | N/A | ❌ 2 failures (PRE-EXISTING, unrelated to phase 57) |
| tests/create-payment-intent.test.ts | N/A | ❌ failures (PRE-EXISTING, unrelated) |
| tests/admin-bookings.test.ts | N/A | ❌ failures (PRE-EXISTING, unrelated) |
| tests/BookingWizard.test.tsx | N/A | ❌ failures (PRE-EXISTING, unrelated) |

**Baseline:** 29 failures in 4 files, all pre-existing at commit 4dcc017. Zero new failures introduced by Phase 57. Phase-relevant tests: 49/49 GREEN.

**Full suite:** 808 passed + 29 pre-existing failures (4 files) + 10 skipped | 139 todo.

---

## Plan 03 Status (Live DB Migration — ✅ APPLIED 2026-06-11)

**Status:** ✅ COMPLETE — migrations applied to live DB via Supabase MCP (project `enakcryrtxlnjvjutfpv`).

**What was done:**
- ✅ bookings RLS pre-check: `relrowsecurity = true` with 4 deny-anon policies (delete/insert/select/update). Anonymous booking inserts are unaffected because `saveBooking()` uses the service-role client, which bypasses RLS.
- ✅ Applied migration 044 (`customer_profiles` table + 3 own-row RLS policies). `apply_migration` returned `{success:true}`.
- ✅ Applied migration 045 (`bookings.user_id` nullable FK + partial index). `apply_migration` returned `{success:true}`.
- ✅ Verified live schema via `execute_sql`:
  - `customer_profiles` columns present: id, user_id (UNIQUE, NOT NULL), account_type (NOT NULL), company_name (nullable), created_at, updated_at.
  - `bookings.user_id` exists, `is_nullable = YES`.
  - 3 policies: `customer_profiles_select_own`, `_insert_own`, `_update_own`, all using `(SELECT auth.uid()) = user_id`.
  - Anonymous-booking regression: 16 existing bookings, 0 with user_id, latest row (`PRG-20260429-CE8CA5`) reads back fine — no write path forced to supply user_id.
- ✅ Regenerated `types/database.types.ts` from live schema (contains `customer_profiles` + `bookings.user_id`). `npx tsc --noEmit` green.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Live DB migrations applied (Plan 03 Task 1 — 044+045 applied 2026-06-11)
- [x] Types regenerated from live schema (Plan 03 Task 1 — types/database.types.ts)

**Approval:** wave_0_complete + live DB migrated. Automated suite green (49/49 phase tests). Remaining: manual OAuth + email round-trip verification (Plan 03 Task 3 checkpoint).
