---
phase: 58-sign-in-ui-account-dashboard
plan: "05"
subsystem: account-profile
tags: [server-actions, profile, saved-passengers, forms, idor-guard, corporate-account]
dependency_graph:
  requires: [58-02]
  provides: [account-profile-editing, saved-passenger-crud]
  affects: [app/account/profile, app/account/actions, components/account/ProfileForm]
tech_stack:
  added: []
  patterns:
    - useActionState for profile + passenger mutations
    - Promise.all parallel data load in server component
    - IDOR guard — user_id always from getUser(), never FormData
    - Double-eq ownership scope: .eq('id', id).eq('user_id', user.id)
    - Partial unique index backstop for single is_default
    - Thenable+chainable mock pattern for double-eq vitest chains
key_files:
  created:
    - app/account/actions.ts
    - app/account/profile/page.tsx
    - components/account/ProfileForm.tsx
  modified:
    - tests/passenger-actions.test.ts
decisions:
  - "Server actions in app/account/actions.ts, not app/login/actions.ts (RESEARCH Open Question #2 — account mutations separate)"
  - "deletePassenger and updatePassenger scope by BOTH id AND user_id — RLS is backstop, application-layer eq is the explicit guard (T-58-13)"
  - "PassengerEditor is a closure function inside ProfileForm to share state without prop drilling"
  - "mockEqDelete/mockEqUpdate made thenable+chainable in beforeEach to support .delete().eq(id).eq(user_id) chain (Rule 1 Bug fix)"
metrics:
  duration: "7 min"
  completed_date: "2026-06-12"
  tasks_completed: 4
  files_changed: 4
---

# Phase 58 Plan 05: Profile Editing + Saved Passengers Summary

**One-liner:** Full profile-editing surface — server actions (updateProfile/addPassenger/updatePassenger/deletePassenger) with IDOR guard, ProfileForm client component (contact/corporate/passenger editor), and force-dynamic server component loading customer_profiles + saved_passengers via Promise.all.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 0 | Entry gate — confirm Plan 02 schema landed | — | PASS (verified in-process) |
| 1 | Server actions — updateProfile + passenger CRUD | 4ef7328 | DONE |
| 2 | ProfileForm client component | e64ed8a | DONE |
| 3 | /account/profile server component | 37d57ae | DONE |

## Artifacts Produced

### `app/account/actions.ts` — `'use server'` module
- `updateProfile(prevState, formData)` — updates `customer_profiles` fields (full_name, phone, account_type, company_name, ico, vat_id); ownership from `getUser()` only
- `addPassenger(prevState, formData)` — inserts `saved_passengers`; clears existing defaults before setting new one
- `updatePassenger(prevState, formData)` — updates by `id AND user_id`; handles default toggle
- `deletePassenger(prevState, formData)` — deletes by `id AND user_id` (T-58-13 IDOR guard)

### `components/account/ProfileForm.tsx` — `'use client'` component
- Section 1: full name, read-only email + "Email cannot be changed here." caption, phone, account-type toggle
- Corporate fields: company name / IČO / DIČ-VAT, conditionally in DOM with `animate-step-enter`
- Section 2: saved passengers list (Default badge, Edit/Delete 44px icon buttons), inline editor, delete-confirmation bar

### `app/account/profile/page.tsx` — server component
- `force-dynamic`, auth-gated, `Promise.all` loads both tables, renders `<ProfileForm>`

## Verification

- `npx vitest run tests/profile-actions.test.ts tests/passenger-actions.test.ts` → **18/18 GREEN**
- ProfileForm contains: `useActionState`, `Email cannot be changed here.`, `account_type`, `Set as default passenger` — PASS
- `/account/profile` contains: `from('customer_profiles')`, `from('saved_passengers')`, `ProfileForm`, `force-dynamic` — PASS
- `npx tsc --noEmit` → **0 errors in production code** (test-file TS errors are pre-existing from plan 01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double-eq mock chain in passenger-actions.test.ts**
- **Found during:** Task 1 — running `npx vitest run tests/passenger-actions.test.ts`
- **Issue:** `mockEqDelete` and `mockEqUpdate` were initialised with `vi.fn().mockResolvedValue({ error: null })` only. When `deletePassenger` chains `.delete().eq(id).eq(user_id)`, the first `.eq()` invoked `mockEqDelete` which returned a Promise — then the second `.eq()` call on the Promise threw `TypeError: .eq is not a function`
- **Fix:** Added `mockReturnValue({ eq: mockEqDelete, then: (resolve) => resolve({ error: null }) })` in `beforeEach` so each `mockEqDelete`/`mockEqUpdate` call is both awaitable (thenable) AND chainable
- **Files modified:** `tests/passenger-actions.test.ts`
- **Commit:** 4ef7328

## Known Stubs

None — all data flows from server to ProfileForm via props (email, profile, passengers).

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan's threat model covers.

## Self-Check: PASSED
