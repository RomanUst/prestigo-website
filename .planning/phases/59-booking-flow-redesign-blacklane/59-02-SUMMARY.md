---
phase: 59-booking-flow-redesign-blacklane
plan: "02"
subsystem: booking-tests
tags: [tdd, wave-0, red-tests, booking-flow, analytics]
dependency_graph:
  requires: []
  provides:
    - tests/EntryBar.test.tsx
    - tests/RouteMap.test.tsx
    - tests/VehicleSlideshow.test.tsx
    - tests/StickyBookingPanel.test.tsx
  affects:
    - plans/59-03-PLAN.md (GREEN gate for EntryBar)
    - plans/59-04-PLAN.md (GREEN gate for RouteMap + VehicleSlideshow)
    - plans/59-05-PLAN.md (GREEN gate for StickyBookingPanel)
tech_stack:
  added: []
  patterns:
    - vi.useFakeTimers for interval-based slideshow auto-advance assertions
    - Object.defineProperty window.google for Maps stub (no real loader)
    - vi.mock('@/components/MetaPixel') to observe trackMetaEvent calls
    - sessionStorage booking_deeplink guard + useBookingStore.setState reset pattern
key_files:
  created:
    - tests/EntryBar.test.tsx
    - tests/RouteMap.test.tsx
    - tests/VehicleSlideshow.test.tsx
    - tests/StickyBookingPanel.test.tsx
  modified: []
decisions:
  - "RouteMap test uses Object.defineProperty with configurable:true for google.maps stub so beforeEach can reset it cleanly"
  - "StickyBookingPanel test mocks RouteMap as stub div to isolate analytics from Google Maps side-effects"
  - "VehicleSlideshow test uses data-active/aria-current attribute query to detect active slide change — leaves implementation freedom"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-06-17"
  tasks_completed: 3
  files_created: 4
---

# Phase 59 Plan 02: Wave 0 RED Test Scaffolds Summary

Wave 0 TDD: four RED test files lock behaviour contracts for EntryBar, RouteMap, VehicleSlideshow, and StickyBookingPanel before any implementation exists.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED tests for EntryBar (BOOK-01/02/03 + TRACK-01) | 5dad7b4 | tests/EntryBar.test.tsx |
| 2 | RED tests for RouteMap (BOOK-04) | 4c2967e | tests/RouteMap.test.tsx |
| 3 | RED tests for VehicleSlideshow (BOOK-05) + StickyBookingPanel (TRACK-02) | e4bb0a2 | tests/VehicleSlideshow.test.tsx, tests/StickyBookingPanel.test.tsx |

## What Was Built

**tests/EntryBar.test.tsx** — 9 test cases covering:
- BOOK-01: 4 field labels (PICKUP LOCATION, DESTINATION, DATE, TIME) render
- D-04: CTA text "Посмотреть варианты"
- BOOK-02/D-08: selecting "2:15 PM" slot writes "14:15" to 24h store
- BOOK-03: conditional FLIGHT NUMBER field shows when `isAirportPlace(origin)=true`, hides otherwise (uses PRG_CONFIG.placeId for airport detection)
- TRACK-01: `form_start` gtag event fires once on mount with `form_id='booking_wizard'`
- TRACK-01: `checkout_progress` gtag event fires on valid submit + `nextStep()` advances `currentStep`

**tests/RouteMap.test.tsx** — 4 test cases covering:
- BOOK-04: map container exposes `aria-label` containing "Route map"
- Empty/error state: exact copy "Route unavailable — you can still select a vehicle class." for null origin, null destination, and both null
- Google Maps loader fully mocked; `window.google.maps` stub includes Map, DirectionsService, DirectionsRenderer, Marker, LatLng, SymbolPath, MapTypeId, InfoWindow

**tests/VehicleSlideshow.test.tsx** — 5 test cases covering:
- BOOK-05/D-15: first slide image renders on mount
- Auto-advance: `vi.advanceTimersByTime(4000)` triggers active slide index change
- Prev/Next buttons with `aria-label="Previous slide"` / `aria-label="Next slide"` exist
- Next button click advances active slide index
- Prev button click from index 0 wraps to last slide

**tests/StickyBookingPanel.test.tsx** — 2 test cases covering:
- TRACK-02: `window.gtag` called with `begin_checkout` event on SELECT CTA click
- TRACK-02: `trackMetaEvent` called with `'InitiateCheckout'` on SELECT CTA click
- RouteMap mocked as stub div to avoid Google Maps contamination
- MetaPixel `trackMetaEvent` mocked as `vi.fn()` for observation

## RED State Confirmed

All four test files fail with "Failed to resolve import" errors because the referenced components do not exist yet. This is the correct Wave 0 RED state.

```
tests/EntryBar.test.tsx       → FAIL (no components/booking/EntryBar.tsx)
tests/RouteMap.test.tsx       → FAIL (no components/booking/RouteMap.tsx)
tests/VehicleSlideshow.test.tsx → FAIL (no components/booking/VehicleSlideshow.tsx)
tests/StickyBookingPanel.test.tsx → FAIL (no components/booking/StickyBookingPanel.tsx)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — test files only, no production stubs.

## Threat Flags

None — test-only plan; no runtime trust boundary crossed. Google Maps loader is mocked, never loaded.

## Self-Check: PASSED

- tests/EntryBar.test.tsx: FOUND
- tests/RouteMap.test.tsx: FOUND
- tests/VehicleSlideshow.test.tsx: FOUND
- tests/StickyBookingPanel.test.tsx: FOUND
- Commits 5dad7b4, 4c2967e, e4bb0a2: verified in git log
