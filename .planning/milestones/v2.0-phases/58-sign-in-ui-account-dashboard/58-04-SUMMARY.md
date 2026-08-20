---
phase: 58-sign-in-ui-account-dashboard
plan: "04"
subsystem: account-ui
tags: [account, trips, overview, server-component, empty-state, tdd]
dependency_graph:
  requires: [58-01]
  provides: [ACCT-01, account-overview-route, account-trips-route]
  affects: [app/account/page.tsx, app/account/trips/page.tsx]
tech_stack:
  added: []
  patterns: [force-dynamic-server-component, getUser-auth-gate, empty-state-shell]
key_files:
  created:
    - app/account/trips/page.tsx
  modified:
    - app/account/page.tsx
    - tests/account-trips.test.tsx
decisions:
  - "D-01 enforced: /account/trips makes no bookings query; trip history is Phase 60 scope"
  - "D-02 enforced: /account overview and /account/trips are separate routes, not tabs"
  - "Nav owns sign-out: inline customerSignOut form removed from /account overview (Plan 03 decision)"
  - "Test cleanup: added afterEach(cleanup) to account-trips.test.tsx to prevent DOM accumulation across it() blocks"
metrics:
  duration: "~2 minutes"
  completed: "2026-06-12"
  tasks_completed: 2
  files_changed: 3
---

# Phase 58 Plan 04: Account Overview + Trips Empty-State Shell Summary

**One-liner:** Force-dynamic auth-gated /account overview (heading, email, two nav cards) and /account/trips empty-state shell ("No trips yet" + Book a transfer CTA) with zero DB query per D-01.

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | /account/trips empty-state shell (TDD GREEN) | f722e3c | app/account/trips/page.tsx, tests/account-trips.test.tsx |
| 2 | /account overview page (heading, email, two cards) | 0b1b77f | app/account/page.tsx |

---

## What Was Built

### app/account/trips/page.tsx (NEW)

- Async server component, `export const dynamic = 'force-dynamic'`
- `createClient().auth.getUser()` — user guaranteed non-null by /account/* middleware gate
- Phase 58 D-01 strictly honoured: **no bookings query, no user_id linking** (Phase 60 scope)
- `void user` suppresses unused variable warning
- Empty state panel: `max-w-md mx-auto mt-16 text-center` with `bg-anthracite-mid border border-anthracite-light rounded p-12`
- Inline 48×48px SVG calendar icon using `color: var(--anthracite-light)` (muted, NOT copper)
- Cormorant 18px heading: "No trips yet"
- Montserrat 14px weight-300 warmgrey body: "Your booked transfers will appear here. Ready to travel?"
- `<Link href="/book" className="btn-primary" style={{ padding: '12px 32px' }}>Book a transfer</Link>`

### app/account/page.tsx (MODIFIED)

- Evolved from placeholder into full UI-SPEC overview
- Container: `max-w-7xl mx-auto px-6 md:px-12 pt-24 pb-16` — pt-24 (96px) clears fixed 64px nav
- Cormorant 28px "My Account" heading + `.copper-line` div (marginBottom 24px)
- "Signed in as {user?.email}" — Montserrat 12px weight-400 warmgrey 0.08em letterSpacing
- Two-card grid (`grid grid-cols-1 md:grid-cols-2 gap-6 mt-8`):
  - Card 1: label "My Trips", heading "Your journey history", body "View all bookings associated with your account.", CTA "View trips" → /account/trips
  - Card 2: label "Profile", heading "Account details", body "Update your contact information and manage saved passengers.", CTA "Edit profile" → /account/profile
- Inline sign-out form **removed** (Nav dropdown owns sign-out per Plan 03)
- `customerSignOut` import **removed** (no longer needed in this file)

---

## Verification

```
npx vitest run tests/account-trips.test.tsx
→ Test Files  1 passed (1)
→ Tests  3 passed (3)
```

Grep checks:
- `Signed in as` present in app/account/page.tsx ✓
- `/account/trips` present in app/account/page.tsx ✓
- `/account/profile` present in app/account/page.tsx ✓
- `My Account` present in app/account/page.tsx ✓
- No `from('bookings')` or `from("bookings")` in trips page ✓ (D-01)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DOM accumulation in account-trips.test.tsx**
- **Found during:** Task 1 — running `npx vitest run tests/account-trips.test.tsx`
- **Issue:** Tests 2 and 3 failed with "Found multiple elements" because each `it()` block called `render()` without prior cleanup, accumulating DOM across tests within the same suite
- **Fix:** Added `afterEach` with `cleanup()` import from `@testing-library/react` in the test file (standard pattern for test suites that render in multiple `it()` blocks without a shared `beforeEach` render)
- **Files modified:** `tests/account-trips.test.tsx`
- **Commit:** f722e3c

---

## Threat Mitigations Applied (from plan threat_model)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-58-10: Elevation of Privilege | Both pages: `force-dynamic` + server `getUser()` + middleware gate | ✓ Applied |
| T-58-11: Information Disclosure (trips history) | No bookings query in /account/trips (D-01) | ✓ Applied |
| T-58-12: Information Disclosure (XSS via email) | Email rendered via React JSX auto-escape — no dangerouslySetInnerHTML | ✓ Applied |

---

## Known Stubs

None — the trips page intentionally renders an empty-state shell per D-01. Real trip history is Phase 60 scope (per migration 045 header comment). This is a deliberate design boundary, not an unintentional stub.

---

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced in this plan.

---

## Self-Check: PASSED

- [x] app/account/trips/page.tsx exists
- [x] app/account/page.tsx modified (92 insertions, 17 deletions)
- [x] Commit f722e3c exists (trips shell + test fix)
- [x] Commit 0b1b77f exists (account overview)
- [x] tests/account-trips.test.tsx: 3/3 GREEN
