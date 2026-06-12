---
phase: 58
slug: sign-in-ui-account-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
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
| NAV-01 | Guest state: Nav renders "Sign in" button linking to /login (desktop + mobile) | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ W0 | ⬜ pending |
| NAV-02 | Signed-in state: Nav renders account trigger with dropdown items (My trips / Profile / Sign out) | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ W0 | ⬜ pending |
| NAV-02 | Sign out: `customerSignOut` server action invoked from dropdown | unit | `npx vitest run tests/nav-auth.test.tsx` | ❌ W0 | ⬜ pending |
| ACCT-01 | `/account/trips` renders empty state ("No trips yet" + Book CTA) | unit | `npx vitest run tests/account-trips.test.tsx` | ❌ W0 | ⬜ pending |
| ACCT-02 | `updateProfile` action updates customer_profiles, returns success | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ W0 | ⬜ pending |
| ACCT-02 | `updateProfile` action: unauthenticated call returns error (no write) | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ W0 | ⬜ pending |
| ACCT-02 | `addPassenger` action inserts saved_passengers row scoped to user | unit | `npx vitest run tests/passenger-actions.test.ts` | ❌ W0 | ⬜ pending |
| ACCT-02 | `deletePassenger` action removes only the caller's own row | unit | `npx vitest run tests/passenger-actions.test.ts` | ❌ W0 | ⬜ pending |
| ACCT-03 | Corporate fields (company / ico / vat_id) render only when account_type=corporate | unit | `npx vitest run tests/profile-actions.test.ts` | ❌ W0 | ⬜ pending |
| Migration 047 | customer_profiles gains full_name, phone, ico, vat_id columns | manual | Supabase MCP `list_tables` / `execute_sql` | N/A | ⬜ pending |
| Migration 048 | saved_passengers table exists with own-row RLS + partial unique index on is_default | manual | Supabase MCP `list_tables` / `execute_sql` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/nav-auth.test.tsx` — NAV-01, NAV-02: guest vs signed-in rendering, dropdown items, sign-out action
- [ ] `tests/profile-actions.test.ts` — ACCT-02, ACCT-03: updateProfile (success, unauthenticated, corporate-field handling)
- [ ] `tests/passenger-actions.test.ts` — ACCT-02: addPassenger / updatePassenger / deletePassenger (success, ownership)
- [ ] `tests/account-trips.test.tsx` — ACCT-01: empty-state render

**Test pattern guidance (project conventions — see `tests/auth-customer.test.ts`, `tests/middleware-customer.test.ts`):**
- All mock factories use `vi.hoisted()`.
- Server actions tested by importing the action and mocking `@/lib/supabase/server` with a Supabase client mock.
- Component tests use `@testing-library/react` (`render` + `screen` + `fireEvent`/`userEvent`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration 047 columns live on DB | ACCT-02/03 | DB schema state not observable via unit tests (types come from config, not live DB) | After `supabase db push`, run Supabase MCP `list_tables` and confirm full_name, phone, ico, vat_id on customer_profiles |
| Migration 048 table + RLS + partial unique index | ACCT-02 | RLS enforcement is DB-side; partial unique index race-safety not unit-testable | Supabase MCP `execute_sql` — verify policies and index exist; attempt cross-user select returns 0 rows |
| Nav does not force marketing pages dynamic | NAV-01/02 (D-09) | Static-render preservation is a build-time property | Confirm `/`, route pages remain statically rendered in `next build` output after Nav change |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
