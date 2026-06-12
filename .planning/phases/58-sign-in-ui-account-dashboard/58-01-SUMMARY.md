---
phase: 58-sign-in-ui-account-dashboard
plan: "01"
subsystem: tests
tags: [tdd, wave-0, red-tests, nav, account, auth]
dependency_graph:
  requires: []
  provides:
    - tests/nav-auth.test.tsx
    - tests/account-trips.test.tsx
    - tests/profile-actions.test.ts
    - tests/passenger-actions.test.ts
  affects:
    - components/Nav.tsx
    - app/account/trips/page.tsx
    - app/account/actions.ts
tech_stack:
  added: []
  patterns:
    - vi.hoisted mock factory (all 4 test files)
    - "@testing-library/react render + screen + fireEvent"
    - server action import → RED on missing module
key_files:
  created:
    - tests/nav-auth.test.tsx
    - tests/account-trips.test.tsx
    - tests/profile-actions.test.ts
    - tests/passenger-actions.test.ts
  modified: []
decisions:
  - "NAV-02 'hides Sign in' test checks for dedicated account trigger button with role=button and aria-label containing 'account' — requires implementation to name the button correctly"
  - "account-trips tests use dynamic import of @testing-library/react inside async test to avoid top-level issues with async server component rendering"
  - "deletePassenger and updatePassenger ownership tested via dual eq() call tracking (id + user_id) with separate mock instances"
metrics:
  duration: "5 min 22 sec"
  completed: "2026-06-12T06:40:20Z"
  tasks_completed: 2
  files_created: 4
---

# Phase 58 Plan 01: Wave-0 RED Test Scaffolds Summary

Four RED test files encode the complete behavioral contract for Phase 58 requirements before any production code exists.

## What Was Built

Wave-0 RED test scaffolds for the Sign-in UI + Account Dashboard phase. Every Phase 58 requirement (NAV-01, NAV-02, ACCT-01, ACCT-02, ACCT-03) is covered by at least one failing assertion. Tests fail because their production targets do not exist yet — that is the intended Nyquist-compliant state.

## Tasks Completed

### Task 1 — Nav auth-state + trips empty-state RED tests
**Commit:** bf0ee43

| File | Covers | RED reason |
|------|--------|-----------|
| `tests/nav-auth.test.tsx` | NAV-01, NAV-02 | Nav has no auth state; no Sign in / dropdown / menuitem elements |
| `tests/account-trips.test.tsx` | ACCT-01 | `@/app/account/trips/page` does not exist → import resolution failure |

**nav-auth.test.tsx assertions (8 RED):**
- NAV-01: "Sign in" text present in guest state
- NAV-01: "Sign in" links to /login
- NAV-02: "Sign in" absent + account trigger visible when signed in
- NAV-02: account trigger is a dedicated button (not burger) with aria-expanded
- NAV-02: dropdown shows "My trips", "Profile", "Sign out" on trigger click
- NAV-02: "My trips" menuitem links to /account/trips
- NAV-02: "Profile" menuitem links to /account/profile
- NAV-02: "Sign out" inside a form wired to customerSignOut

**account-trips.test.tsx assertions (3 RED via import failure):**
- "No trips yet" heading present
- Body text "Your booked transfers will appear here"
- "Book a transfer" link with href="/book"

### Task 2 — Profile + passenger server-action RED tests
**Commit:** f50564f

| File | Covers | RED reason |
|------|--------|-----------|
| `tests/profile-actions.test.ts` | ACCT-02, ACCT-03 | `@/app/account/actions` does not exist → import resolution failure |
| `tests/passenger-actions.test.ts` | ACCT-02 | `@/app/account/actions` does not exist → import resolution failure |

**profile-actions.test.ts assertions (8 RED):**
- ACCT-02: updateProfile returns `{ success: true }` for authenticated user
- ACCT-02: calls `from("customer_profiles").update()` with full_name, phone
- ACCT-02: scopes update via `.eq("user_id", sessionUserId)`
- ACCT-02: unauthenticated returns `{ error: "Not authenticated." }`
- ACCT-02: unauthenticated does NOT call `from()`
- T-58-01: forged user_id in FormData cannot override session user in `.eq()`
- T-58-01: update object does NOT contain caller-supplied user_id
- ACCT-03: corporate fields (company_name, ico, vat_id) included when account_type=corporate

**passenger-actions.test.ts assertions (9 RED):**
- ACCT-02: addPassenger inserts with session user_id + full_name/phone
- ACCT-02: addPassenger unauthenticated returns `{ error: "Not authenticated." }`
- ACCT-02: addPassenger strips forged user_id from FormData
- ACCT-02: deletePassenger scopes by BOTH id AND user_id
- ACCT-02: deletePassenger unauthenticated returns `{ error: "Not authenticated." }`
- ACCT-02: forged user_id cannot widen deletePassenger scope
- ACCT-02: updatePassenger updates only explicit fields (no raw FormData spread)
- ACCT-02: updatePassenger scopes update by id AND user_id
- ACCT-02: updatePassenger unauthenticated returns `{ error: "Not authenticated." }`

## Verification Results

```
npx vitest run tests/nav-auth.test.tsx tests/account-trips.test.tsx \
  tests/profile-actions.test.ts tests/passenger-actions.test.ts

Test Files  4 failed (4)
     Tests  8 failed (8)   ← nav-auth; other 3 files fail at import level
```

**RED-OK** — all four files fail because production symbols do not exist yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NAV-02 "hides Sign in" tests passing accidentally**
- **Found during:** Task 1 verification
- **Issue:** Two NAV-02 tests passed by coincidence: "hides Sign in" passed because Nav never renders "Sign in" without auth state (so `queryByText('Sign in')` was null regardless); "account trigger has aria-expanded" passed because the existing burger button has `aria-expanded`.
- **Fix:** Rewrote both tests to assert that a dedicated account trigger with `role="button"` and `name=/account/i` exists and has `aria-expanded` (distinct from the burger `aria-label="Menu"`). Now both tests properly fail RED because Nav has no such button.
- **Files modified:** tests/nav-auth.test.tsx
- **Commit:** bf0ee43 (included in same task commit)

## Known Stubs

None. This plan creates only test scaffolds — no production code with stubs.

## Threat Surface Scan

No new production code created. Test files only.

## Self-Check: PASSED

Files exist:
- FOUND: tests/nav-auth.test.tsx
- FOUND: tests/account-trips.test.tsx
- FOUND: tests/profile-actions.test.ts
- FOUND: tests/passenger-actions.test.ts

Commits exist:
- FOUND: bf0ee43
- FOUND: f50564f
