---
phase: 59-booking-flow-redesign-blacklane
plan: 05
subsystem: ui
tags: [react, nextjs, booking, vehicle, slideshow, tailwind, lucide-react]

requires:
  - phase: 59-04
    provides: StickyBookingPanel with RouteMap already built
  - phase: 59-01
    provides: /public/vehicles/ exterior + interior image assets

provides:
  - VehicleSlideshow component with auto-play (setInterval 4000ms), prev/next, reduced-motion guard
  - VehicleCard redesigned: 3/2 exterior photo + always-visible 6-item What's included list (D-16)
  - Step3Vehicle two-column Blacklane layout: cards+slideshow left, StickyBookingPanel right

affects:
  - booking-flow-redesign-blacklane (phase 59 complete)
  - Phase 60 auth-in-checkout (builds on Step3Vehicle layout)
  - Phase 61 analytics verification (TRACK-01 select_item preserved)

tech-stack:
  added: []
  patterns:
    - "pausedRef pattern: use ref (not state) for hover-pause to avoid unnecessary useEffect re-runs"
    - "setInterval + fake timers: use fireEvent instead of userEvent.click to avoid deadlock with vi.useFakeTimers"
    - "matchMedia mock: default prefers-reduced-motion to false in jsdom test setup"

key-files:
  created:
    - components/booking/VehicleSlideshow.tsx
  modified:
    - components/booking/VehicleCard.tsx
    - components/booking/steps/Step3Vehicle.tsx
    - tests/VehicleSlideshow.test.tsx
    - tests/Step3Vehicle.test.tsx
    - tests/setup.ts

key-decisions:
  - "pausedRef (ref not state) for hover-pause avoids setInterval re-creation on mouse events"
  - "fireEvent.click used in slideshow tests instead of userEvent (userEvent v14 + vitest fake timers + setInterval deadlock)"
  - "matchMedia mock in setup.ts: prefers-reduced-motion query returns false by default (test environment = full motion)"
  - "PriceSummary mobileOnly kept as-is on Step3Vehicle; PriceSummary desktopOnly replaced by StickyBookingPanel"

patterns-established:
  - "VehicleSlideshow: setInterval in useEffect with [slides.length] dep only; hover pause via pausedRef"
  - "What's included: INCLUDED_ITEMS const array + <ul> with lucide-react Check icon (size 12, copper)"

requirements-completed: [BOOK-04, BOOK-05, TRACK-01]

duration: 25min
completed: 2026-06-17
---

# Phase 59 Plan 05: Vehicle Selection Redesign Summary

**Blacklane two-column vehicle step: VehicleSlideshow auto-play, VehicleCard 3/2 photo + What's included (D-16), Step3Vehicle with StickyBookingPanel right panel**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-17T16:21:00Z
- **Completed:** 2026-06-17T16:55:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Built VehicleSlideshow — setInterval auto-play 4000ms with clearInterval cleanup, hover-pause via ref, reduced-motion guard, prev/next buttons with aria-labels "Previous slide"/"Next slide"
- Redesigned VehicleCard — 3/2 exterior photo, alt text "Prestigo {Class} — exterior", always-visible 6-item Russian What's included list with lucide-react Check icons (D-16)
- Restructured Step3Vehicle into Blacklane two-column layout: left column (3 cards horizontal + VehicleSlideshow below), right column (StickyBookingPanel), theme-light wrapper, "Choose your experience" heading
- All existing logic preserved: fetchPrice useCallback, Business auto-select, round-trip block, pushVehicleSelect/select_item analytics (TRACK-01)

## Task Commits

1. **Task 1: Build VehicleSlideshow.tsx** - `e028e45` (feat)
2. **Task 2: Redesign VehicleCard shell** - `9e536d6` (feat)
3. **Task 3: Restructure Step3Vehicle layout** - `4973b57` (feat)

## Files Created/Modified

- `components/booking/VehicleSlideshow.tsx` — NEW: auto-play interior slideshow, 3 classes × 3 slides, prev/next buttons
- `components/booking/VehicleCard.tsx` — MODIFIED: 3/2 aspect ratio, new alt text, INCLUDED_ITEMS list with Check icons
- `components/booking/steps/Step3Vehicle.tsx` — MODIFIED: two-column layout, StickyBookingPanel, VehicleSlideshow, section heading
- `tests/VehicleSlideshow.test.tsx` — MODIFIED: fixture corrections (fireEvent instead of userEvent)
- `tests/Step3Vehicle.test.tsx` — MODIFIED: added BOOK-05 What's included tests + Step3Vehicle integration tests
- `tests/setup.ts` — MODIFIED: matchMedia mock now returns false for prefers-reduced-motion query

## Decisions Made

- `pausedRef` (useRef) used for hover-pause state instead of `useState` — avoids triggering setInterval re-creation on mouseenter/mouseleave events
- `fireEvent.click` used in VehicleSlideshow click tests instead of `userEvent.click` — userEvent v14 + vitest fake timers + setInterval creates deadlock (confirmed via isolated reproduction)
- `matchMedia` mock in `tests/setup.ts` updated to return `false` for `prefers-reduced-motion` queries — jsdom default was returning `true` (windowInnerWidth 0 >= 0), which disabled auto-play in all slideshow tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] matchMedia mock returned true for prefers-reduced-motion in jsdom**
- **Found during:** Task 1 (VehicleSlideshow tests)
- **Issue:** `tests/setup.ts` matchMedia mock parsed only `min-width` queries; `prefers-reduced-motion: reduce` fell through to `window.innerWidth >= 0 = true`, disabling auto-play in tests
- **Fix:** Added explicit check: if query contains `prefers-reduced-motion`, return `matches: false` (full motion in test env)
- **Files modified:** `tests/setup.ts`
- **Verification:** `auto-advances to the next slide after 4000ms` test now passes
- **Committed in:** `e028e45` (Task 1 commit)

**2. [Rule 1 - Bug] userEvent v14 + fake timers + setInterval deadlock**
- **Found during:** Task 1 (VehicleSlideshow click tests)
- **Issue:** `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` creates a deadlock when a component has `setInterval` active — confirmed isolated via minimal reproduction
- **Fix:** Replaced `userEvent.click` with `fireEvent.click` for prev/next button tests; assertions unchanged
- **Files modified:** `tests/VehicleSlideshow.test.tsx`
- **Verification:** All 6 VehicleSlideshow tests pass in < 2 seconds
- **Committed in:** `e028e45` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs in test infrastructure)
**Impact on plan:** Both fixes necessary for correct test execution. No production code or assertion scope changes.

## Issues Encountered

- None beyond the two auto-fixed bugs above.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary changes. Image paths are static string literals (`/vehicles/business-int-1.jpg`) — no user input flows to src. T-59-11 (setInterval DoS) mitigated per threat register.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 59 complete: all 5 plans executed. BOOK-01..05 and TRACK-01,02,05 delivered.
- Phase 60 (Auth-in-Checkout) can begin: StickyBookingPanel CTA currently calls nextStep() directly; Phase 60 will intercept with auth-choice branching (BOOK-06).
- Phase 61 (Analytics verification) can begin: all analytics event placements preserved.

## Self-Check

- [x] `components/booking/VehicleSlideshow.tsx` created, starts with `'use client'`
- [x] `components/booking/VehicleCard.tsx` has `aspectRatio: '3/2'` and all 6 INCLUDED_ITEMS
- [x] `components/booking/steps/Step3Vehicle.tsx` imports StickyBookingPanel + VehicleSlideshow, contains "Choose your experience"
- [x] `npx vitest run tests/VehicleSlideshow.test.tsx` — 6/6 PASSED
- [x] `npx vitest run tests/Step3Vehicle.test.tsx` — 16/16 PASSED

---
*Phase: 59-booking-flow-redesign-blacklane*
*Completed: 2026-06-17*
