---
phase: 59
plan: "04"
subsystem: booking-ui
tags: [google-maps, route-map, sticky-panel, analytics, tdd]
dependency_graph:
  requires: ["59-02", "59-03"]
  provides: ["RouteMap", "StickyBookingPanel"]
  affects: ["components/booking/steps/Step3Vehicle.tsx", "BookingWizard.tsx"]
tech_stack:
  added: []
  patterns:
    - "@googlemaps/js-api-loader singleton with setOptions (same key as AddressInput)"
    - "RAF animation loop with cancelAnimationFrame cleanup"
    - "Class-based Vitest mocks for google.maps constructors"
    - "getState() fresh reads in event handlers (stale-closure prevention)"
key_files:
  created:
    - components/booking/RouteMap.tsx
    - components/booking/StickyBookingPanel.tsx
  modified:
    - tests/RouteMap.test.tsx
decisions:
  - "D-13: Reuse NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — no new credentials"
  - "D-11: One-shot 3s RAF animation; reduced-motion places dot at midpoint"
  - "D-12: InfoWindow time labels at origin and destination markers"
  - "TRACK-02: begin_checkout + InitiateCheckout relocated to StickyBookingPanel CTA"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-17T14:41:26Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 59 Plan 04: RouteMap and StickyBookingPanel Summary

**One-liner:** Animated Google Maps route with copper dot + time labels (BOOK-04) and sticky desktop booking panel with relocated begin_checkout/InitiateCheckout analytics (TRACK-02).

---

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Build RouteMap.tsx (Google Maps JS SDK, animated dot, time labels) | f2a9d3a | GREEN |
| 2 | Build StickyBookingPanel.tsx (map + summary + Select CTA with analytics) | 29055ff | GREEN |

---

## Test Results

```
Tests:  6 passed (6)
Files:  2 passed (2)
```

- `tests/RouteMap.test.tsx` — 4 tests GREEN
- `tests/StickyBookingPanel.test.tsx` — 2 tests GREEN

---

## Artifacts Produced

### `components/booking/RouteMap.tsx` (NEW, 253 lines)

- `'use client'` component with props: `origin`, `destination`, `pickupTime`, `distanceKm`
- Module-level `ensureMapsLibraryLoaded()` singleton: reuses `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (D-13), `setOptions` with `['maps', 'places', 'routes']` — 'places' preserved so AddressInput autocomplete keeps working (Pitfall 2)
- `GREYSCALE_STYLES` array for minimal/greyscale tile styling
- `animateDotAlongPath()` — RAF-based one-shot animation, returns cleanup function with `cancelAnimationFrame` (D-11, T-59-09)
- Reduced-motion: `window.matchMedia('(prefers-reduced-motion: reduce)')` — dot placed at midpoint, no RAF (D-11)
- `DirectionsService` for accurate polyline; fallback to straight-line `Polyline` if Directions fails
- Origin/destination markers with copper and dark fill
- InfoWindow time labels: pickup time (24h→12h formatted), estimated drop-off (D-12)
- Empty state div: "Route unavailable — you can still select a vehicle class." when origin or destination is null
- Map container: `role="img"`, `aria-label="Route map from {origin} to {destination}"`, `height: 220`

### `components/booking/StickyBookingPanel.tsx` (NEW, 205 lines)

- `'use client'` component, zero props (reads from Zustand)
- `hidden md:block sticky` — desktop-only (D-10)
- Renders `RouteMap` + divider + class name + price + "All fees included" + Select CTA (D-09)
- CTA text: "SELECT A CLASS" when no class; "SELECT [CLASS]" when selected
- CTA `aria-label` includes price: "Select Business class — €84"
- `handleSelectClass()`: `useBookingStore.getState()` fresh read → compute `totalEur` (base + extras - promo) → `pushGA4Event('begin_checkout', ...)` → `trackMetaEvent('InitiateCheckout', ...)` → `nextStep()` (TRACK-02)
- CTA disabled (opacity 0.4, no analytics) when `vehicleClass` is null

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Vitest google.maps constructor mocks in RouteMap.test.tsx**
- **Found during:** Task 1 — first test run
- **Issue:** `vi.fn().mockReturnValue({...})` cannot be used with `new` in Vitest — throws "Cannot use mockReturnValue when called with new"
- **Fix:** Replaced all 7 google.maps constructors with proper ES class mocks (MockMap, MockDirService, MockMarker, etc.) and added missing `MockPolyline`, `TravelMode` stub needed by RouteMap implementation
- **Files modified:** `tests/RouteMap.test.tsx`
- **Commit:** f2a9d3a (included with Task 1)

---

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| (none) | — | No new network endpoints, auth paths, or trust boundaries introduced |

T-59-07 (CSP): RouteMap reuses `@googlemaps/js-api-loader` (already authorized via nonce + strict-dynamic). No new script origin or inline script added (TRACK-05). ✓
T-59-08 (Key disclosure): `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally public, restricted by HTTP referrer in Google Cloud. Reused, not newly added. ✓
T-59-09 (RAF loop): `cancelAnimationFrame` called in useEffect cleanup on unmount. One-shot animation (3s), not infinite. ✓

---

## Known Stubs

None. All data flows are wired:
- RouteMap reads origin/destination/pickupTime/distanceKm from props (passed from StickyBookingPanel which reads Zustand)
- StickyBookingPanel reads vehicleClass, priceBreakdown, extras, promoDiscount from Zustand store
- handleSelectClass computes real totalEur and fires real analytics events

---

## Requirements Satisfied

- **BOOK-04** (D-11, D-12): Animated route map with pickup + drop-off time labels at the vehicle step ✓
- **TRACK-02**: InitiateCheckout (Meta Pixel) fires from the Select CTA with trackMetaEvent (unchanged API) ✓
- **TRACK-05** (D-13): CSP intact — existing loader + key reused, no new inline scripts or credentials ✓

---

## Self-Check: PASSED

```
FOUND: components/booking/RouteMap.tsx
FOUND: components/booking/StickyBookingPanel.tsx
FOUND: f2a9d3a (feat(59-04): build RouteMap.tsx...)
FOUND: 29055ff (feat(59-04): build StickyBookingPanel.tsx...)
```
