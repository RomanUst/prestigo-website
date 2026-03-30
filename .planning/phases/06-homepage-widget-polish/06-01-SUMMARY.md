---
phase: 06-homepage-widget-polish
plan: 01
subsystem: ui
tags: [react, zustand, next.js, booking-widget, vitest, testing-library]

# Dependency graph
requires:
  - phase: 01-foundation-trip-entry
    provides: TripTypeTabs, AddressInput, DurationSelector, booking-store setters
  - phase: 02-pricing-vehicle-selection
    provides: BookingWizard Step 3 vehicle selection flow
provides:
  - BookingWidget.tsx: mini booking form for homepage (trip type, origin/dest, date/time, Book Now CTA)
  - Updated BookingSection.tsx: replaces LimoAnywhere iframe with BookingWidget
  - tests/BookingWidget.test.tsx: 12 passing tests for HOME-01, HOME-02, HOME-03
affects:
  - homepage, BookingSection, /book wizard deep-link entry

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Captured AddressInput onSelect callbacks via Map in tests to trigger widget local state
    - Widget uses local state (origin, destination, date, time) written to Zustand store only on CTA click
    - todayStr set via useEffect to avoid SSR hydration mismatch on date input min attribute

key-files:
  created:
    - prestigo/components/booking/BookingWidget.tsx
    - prestigo/tests/BookingWidget.test.tsx
  modified:
    - prestigo/components/BookingSection.tsx

key-decisions:
  - "BookingWidget uses local state for origin/destination/date/time, writes to Zustand only on CTA click (not reactive Zustand)"
  - "Test mocks replace AddressInput/TripTypeTabs/DurationSelector with lightweight DOM equivalents; capturedOnSelect Map used to trigger onSelect callbacks from tests"
  - "todayStr initialized via useEffect (not inline new Date()) to prevent SSR hydration mismatch"
  - "step=900 on time input enforces 15-minute increments at the HTML level"

patterns-established:
  - "capturedOnSelect Map pattern: mock AddressInput captures onSelect by ariaLabel key so tests can fire selection without real Google Places"

requirements-completed: [HOME-01, HOME-02, HOME-03]

# Metrics
duration: 8min
completed: 2026-03-30
---

# Phase 06 Plan 01: BookingWidget Summary

**Homepage booking widget with deep-link to /book Step 3 — replaces LimoAnywhere iframe with TripTypeTabs, AddressInput, date/time inputs, and BOOK NOW CTA writing to Zustand store**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-30T19:22:33Z
- **Completed:** 2026-03-30T19:27:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- BookingWidget.tsx: 'use client' component renders TripTypeTabs, origin/destination AddressInputs (or DurationSelector for hourly), date input (min=today, dark colorScheme), time input (step=900), validation, BOOK NOW button
- CTA handler validates required fields, writes origin/destination/date/time to Zustand store, sets currentStep=3 + completedSteps={1,2}, navigates to /book
- BookingSection.tsx: LimoAnywhere iframe and LIMOANYWHERE_URL constant removed entirely; right column now renders BookingWidget inside the styled container div
- 12 passing tests covering HOME-01 (renders), HOME-02 (fields + hourly conditional), HOME-03 (validation, store mutation, navigation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create test stubs and BookingWidget component** - `632e157` (feat)
2. **Task 2: Integrate BookingWidget into BookingSection, remove iframe** - `19af102` (feat)

**Plan metadata:** (this summary + STATE.md commit to follow)

_Note: Task 1 used TDD — RED (import error, 0 tests) → GREEN (12 tests passing)_

## Files Created/Modified

- `prestigo/components/booking/BookingWidget.tsx` - Mini booking form component for homepage (145 lines)
- `prestigo/tests/BookingWidget.test.tsx` - 12 passing tests covering all HOME-0x requirements
- `prestigo/components/BookingSection.tsx` - Replaced iframe + placeholder with BookingWidget container

## Decisions Made

- Local state (not Zustand) for origin/destination/date/time in widget — only written to store on CTA click, avoiding reactive side effects on the homepage
- Tests mock AddressInput to a lightweight div; `capturedOnSelect` Map captures callbacks by ariaLabel so tests can simulate address selection without Google Places
- `todayStr` via `useEffect` prevents SSR hydration mismatch on `<input type="date" min={...}>`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate `ariaLabel` in test mock interface**
- **Found during:** Task 1 TypeScript check
- **Issue:** Mock AddressInput interface had `ariaLabel: string` listed twice causing TS2300 error
- **Fix:** Removed one duplicate declaration
- **Files modified:** prestigo/tests/BookingWidget.test.tsx
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 19af102 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug - duplicate TS interface field)
**Impact on plan:** Minimal. TypeScript fix only. Component and test behavior unchanged.

## Issues Encountered

- Node.js v16 incompatible with vitest 4.1.1 (requires `styleText` from `node:util`, available in Node 18.20+). All test runs use `nvm use v22.22.1` to run vitest. This is a pre-existing environment constraint, not introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BookingWidget live on homepage at `/` in the BookingSection, replacing iframe
- Deep-link to /book at Step 3 with Zustand store pre-filled is functional
- Ready for Phase 06 Plan 02 (visual polish / responsive layout verification)

---
*Phase: 06-homepage-widget-polish*
*Completed: 2026-03-30*
