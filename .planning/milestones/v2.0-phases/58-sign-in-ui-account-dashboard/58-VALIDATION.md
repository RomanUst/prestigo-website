---
phase: 58
slug: sign-in-ui-account-dashboard
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-12
updated: 2026-06-16
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run tests/nav-auth.test.tsx tests/profile-actions.test.ts tests/passenger-actions.test.ts tests/account-trips.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| NAV-01 | Guest state: Nav renders "Sign in" button linking to /login (desktop + mobile) | unit | `npx vitest run tests/nav-auth.test.tsx` | ✅ | ✅ green |
| NAV-02 | Signed-in state: Nav renders account trigger with dropdown items (My trips / Profile / Sign out) | unit | `npx vitest run tests/nav-auth.test.tsx` | ✅ | ✅ green |
| NAV-02 | Sign out: `customerSignOut` server action invoked from dropdown | unit | `npx vitest run tests/nav-auth.test.tsx` | ✅ | ✅ green |
| ACCT-01 | `/account/trips` renders empty state ("No trips yet" + Book CTA) | unit | `npx vitest run tests/account-trips.test.tsx` | ✅ | ✅ green |
| ACCT-02 | `updateProfile` action updates customer_profiles, returns success | unit | `npx vitest run tests/profile-actions.test.ts` | ✅ | ✅ green |
| ACCT-02 | `updateProfile` action: unauthenticated call returns error (no write) | unit | `npx vitest run tests/profile-actions.test.ts` | ✅ | ✅ green |
| ACCT-02 | `addPassenger` action inserts saved_passengers row scoped to user | unit | `npx vitest run tests/passenger-actions.test.ts` | ✅ | ✅ green |
| ACCT-02 | `deletePassenger` action removes only the caller's own row | unit | `npx vitest run tests/passenger-actions.test.ts` | ✅ | ✅ green |
| ACCT-03 | Corporate fields (company / ico / vat_id) render only when account_type=corporate | unit | `npx vitest run tests/profile-actions.test.ts` | ✅ | ✅ green |
| Migration 047 | customer_profiles gains full_name, phone, ico, vat_id columns | manual | Supabase MCP `list_tables` / `execute_sql` | N/A | ✅ green — applied & verified via Supabase MCP during execution |
| Migration 048 | saved_passengers table exists with own-row RLS + partial unique index on is_default | manual | Supabase MCP `list_tables` / `execute_sql` | N/A | ✅ green — applied & verified via Supabase MCP during execution |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/nav-auth.test.tsx` — NAV-01, NAV-02: guest vs signed-in rendering, dropdown items, sign-out action
- [x] `tests/profile-actions.test.ts` — ACCT-02, ACCT-03: updateProfile (success, unauthenticated, corporate-field handling)
- [x] `tests/passenger-actions.test.ts` — ACCT-02: addPassenger / updatePassenger / deletePassenger (success, ownership)
- [x] `tests/account-trips.test.tsx` — ACCT-01: empty-state render

**Test pattern guidance (project conventions — see `tests/auth-customer.test.ts`, `tests/middleware-customer.test.ts`):**
- All mock factories use `vi.hoisted()`.
- Server actions tested by importing the action and mocking `@/lib/supabase/server` with a Supabase client mock.
- Component tests use `@testing-library/react` (`render` + `screen` + `fireEvent`/`userEvent`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|--------------------|--------|
| Migration 047 columns live on DB | ACCT-02/03 | DB schema state not observable via unit tests (types come from config, not live DB) | After `supabase db push`, run Supabase MCP `list_tables` and confirm full_name, phone, ico, vat_id on customer_profiles | ✅ Verified via Supabase MCP during execution (Plan 02) |
| Migration 048 table + RLS + partial unique index | ACCT-02 | RLS enforcement is DB-side; partial unique index race-safety not unit-testable | Supabase MCP `execute_sql` — verify policies and index exist; attempt cross-user select returns 0 rows | ✅ Verified via Supabase MCP during execution (Plan 02) |
| Nav does not force marketing pages dynamic | NAV-01/02 (D-09) | Static-render preservation is a build-time property | Confirm `/`, route pages remain statically rendered in `next build` output after Nav change | ✅ Confirmed — Nav.tsx has no server `createClient`/`cookies()`/`headers()` import |
| Full end-to-end UAT (browser) | All | Real auth flow (magic link email, OAuth redirect, cookie-consent overlay) requires a live browser session, not unit-testable | Conversational UAT via `/gsd-verify-work 58` | ✅ 9/9 passed — see 58-UAT.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-06-16

---

## Validation Audit 2026-06-16

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

Gaps found while re-running the quick command for this audit (regressions from the
58-REVIEW-FIX pass, not from this audit itself):
1. `tests/nav-auth.test.tsx` — Nav's WR-06 eager `getUser()` call (added during code-review
   fix) had no corresponding mock default, throwing `Cannot read properties of undefined
   (reading 'then')` in all 8 tests. Fixed by resolving `mockGetUser` to `{ data: { user: null } }`
   in `beforeEach`.
2. `tests/account-trips.test.tsx` and `tests/profile-actions.test.ts` — same root cause class:
   `account/trips/page.tsx` now renders `<Nav />` (added to fix the missing-Nav UAT gap), which
   the trips test didn't mock; `profile-actions.test.ts` mocked `.update().eq()` but the CR-02 fix
   switched the action to `.upsert()`. Fixed by stubbing `@/components/Nav` in the trips test and
   rewriting the upsert-shaped mock + assertions in the profile-actions test.

Full suite (`npx vitest run`) confirms these 4 files are clean; the only remaining suite-wide
failures are pre-existing and unrelated to phase 58 (`tests/google-reviews.test.ts`,
`tests/create-payment-intent.test.ts`, `tests/admin-bookings.test.ts`,
`tests/BookingWizard.test.tsx` — none touched by any phase 58 commit). `npx tsc --noEmit` is clean.
