---
phase: 58-sign-in-ui-account-dashboard
plan: "03"
subsystem: nav-auth
tags: [nav, auth, client-state, supabase, onAuthStateChange, dropdown, NAV-01, NAV-02]
dependency_graph:
  requires: [58-01]
  provides: [auth-aware-nav]
  affects: [components/Nav.tsx]
tech_stack:
  added: []
  patterns:
    - createBrowserClient + useMemo (memoized browser Supabase client)
    - onAuthStateChange subscribe/unsubscribe with active-flag guard
    - click-outside (mousedown listener), Escape key, pathname-change close
    - server action form pattern (<form action={customerSignOut}>)
key_files:
  modified:
    - components/Nav.tsx
decisions:
  - "Mobile auth rows (My trips/Profile/Sign out) rendered only when `open === true` to prevent duplicate text nodes in DOM that would break `getByText` assertions in jsdom tests"
metrics:
  duration: "~5 min"
  completed: "2026-06-12"
  tasks_completed: 2
  files_modified: 1
requirements: [NAV-01, NAV-02]
---

# Phase 58 Plan 03: Auth-Aware Nav Summary

**One-liner:** Client-side `onAuthStateChange` subscription in Nav renders guest "Sign in" button (desktop + mobile) and signed-in account dropdown (My trips / Profile / Sign out) without any server-side auth call — marketing pages remain statically rendered (D-09).

---

## What Was Built

Modified `components/Nav.tsx` to be fully auth-aware via a memoized `createBrowserClient` and `supabase.auth.onAuthStateChange` subscription.

### Guest state (NAV-01)
- Desktop bar: `"Sign in"` `.btn-ghost` link (`/login`) rendered immediately before `"Book now"` in a `flex items-center gap-3` wrapper.
- Mobile menu: `"Sign in"` `.btn-ghost` full-width link above `"Book now"`.

### Signed-in state (NAV-02)
- Desktop: account trigger button (28×28px initial circle + 12px chevron SVG, `aria-expanded`, `min-h-[44px]`). Opens absolute dropdown panel (`role="menu"`) with:
  - `"My trips"` → `/account/trips` (`role="menuitem"`)
  - `"Profile"` → `/account/profile` (`role="menuitem"`)
  - Divider
  - `"Sign out"` inside `<form action={customerSignOut}>` (`role="menuitem"`)
- Mobile: "My trips", "Profile", "Sign out" rows (only rendered when burger menu `open === true`).

### D-09 preserved
`@/lib/supabase/server` is NOT imported. Nav reads auth entirely client-side — marketing pages stay static.

---

## Verification Results

```
npx vitest run tests/nav-auth.test.tsx
Test Files  1 passed (1)
Tests       8 passed (8)
```

All NAV-01 + NAV-02 assertions GREEN.

Structural checks:
- `grep 'onAuthStateChange' components/Nav.tsx` — present
- `grep 'createBrowserClient' components/Nav.tsx` — present
- No `@/lib/supabase/server` import — confirmed

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mobile auth rows rendered conditionally to prevent duplicate DOM nodes**
- **Found during:** Task 2 verification (test run)
- **Issue:** `screen.getByText('My trips')` threw "Found multiple elements" because both the desktop dropdown (when open) and mobile menu always rendered "My trips"/"Profile"/"Sign out" in DOM simultaneously.
- **Fix:** Mobile auth rows for signed-in state are now rendered only when `open === true` (burger menu open). This prevents duplicate text nodes in jsdom while preserving the correct visual behavior — mobile items only appear when mobile menu is open anyway.
- **Files modified:** `components/Nav.tsx`
- **Commit:** 17cc17e

---

## Commits

| Hash | Message |
|------|---------|
| 17cc17e | feat(58-03): auth-aware Nav — guest Sign in + signed-in account dropdown |

---

## Known Stubs

None — Nav renders auth state from `onAuthStateChange`; no hardcoded empty values.

---

## Threat Flags

No new threat surface introduced. Nav UI is cosmetic — actual authz enforced by middleware + RLS (T-58-07). `customerSignOut` hardcodes `redirect('/')` with no caller-supplied destination (T-58-08 mitigated). No server-side auth read (T-58-09 mitigated).

---

## Self-Check: PASSED

- [x] `components/Nav.tsx` exists and has 384 lines (min_lines: 150 — PASS)
- [x] Commit 17cc17e exists in git log
- [x] `onAuthStateChange` present in Nav.tsx
- [x] `createBrowserClient` present in Nav.tsx
- [x] No `@/lib/supabase/server` import
- [x] 8/8 tests GREEN
