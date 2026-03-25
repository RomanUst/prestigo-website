---
phase: 02-pricing-vehicle-selection
plan: 01
subsystem: api
tags: [zustand, pricing, google-routes-api, next-api-route, css-animation]

# Dependency graph
requires:
  - phase: 01-foundation-trip-entry
    provides: BookingStore type, TripType/VehicleClass/PriceBreakdown types, sessionStorage persist pattern

provides:
  - Extended BookingStore with Phase 2 fields (pickupDate, pickupTime, returnDate, vehicleClass, distanceKm, priceBreakdown, quoteMode)
  - VehicleConfig interface and VEHICLE_CONFIG constant
  - lib/pricing.ts with rate tables and calculatePrice/buildPriceMap/dateDiffDays functions
  - POST /api/calculate-price route proxying Google Routes API
  - .skeleton-shimmer CSS utility class with shimmer keyframe animation
  - prestigo/public/vehicles/ directory with placeholder images

affects:
  - 02-02 (DateTimePicker — needs pickupDate, pickupTime, setPickupDate, setPickupTime)
  - 02-03 (VehicleSelector — needs VEHICLE_CONFIG, vehicleClass, priceBreakdown, /api/calculate-price)
  - 02-04 (pricing tests — needs calculatePrice, buildPriceMap, dateDiffDays)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-only pricing module (lib/pricing.ts never imported from 'use client' components)
    - Google Maps API key in GOOGLE_MAPS_API_KEY (no NEXT_PUBLIC_ prefix) — proxy pattern via API route
    - quoteMode: true fallback on any pricing error — graceful degradation
    - X-Goog-FieldMask: routes.distanceMeters — minimal billing footprint

key-files:
  created:
    - prestigo/lib/pricing.ts
    - prestigo/app/api/calculate-price/route.ts
    - prestigo/public/vehicles/business.jpg (placeholder)
    - prestigo/public/vehicles/first-class.jpg (placeholder)
    - prestigo/public/vehicles/business-van.jpg (placeholder)
  modified:
    - prestigo/types/booking.ts
    - prestigo/lib/booking-store.ts
    - prestigo/app/globals.css

key-decisions:
  - "Rate tables live in server-side lib/pricing.ts only — never imported by client components"
  - "GOOGLE_MAPS_API_KEY without NEXT_PUBLIC_ prefix — API key never reaches browser bundle"
  - "X-Goog-FieldMask: routes.distanceMeters minimizes Routes API billing"
  - "All error paths in calculate-price route return quoteMode: true for graceful degradation"
  - "Vehicle placeholder images created as minimal 1x1 PNG (named .jpg for future replacement)"

patterns-established:
  - "Pricing proxy pattern: client calls /api/calculate-price, server calls Google Routes API, key never exposed"
  - "quoteMode fallback: any unresolvable route or API error sets quoteMode: true, UI shows quote request form"
  - "Phase 2 fields partialize: all new store fields added to sessionStorage partialize list"

requirements-completed: [PRICE-01, PRICE-02, PRICE-03, PRICE-04, PRICE-05, PRICE-06]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 2 Plan 01: Data Layer — Pricing Module and Store Extension Summary

**Zustand store extended with Phase 2 fields, server-side pricing module with rate tables, Google Routes API proxy route, and shimmer skeleton CSS for loading states**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-25T22:02:15Z
- **Completed:** 2026-03-25T22:05:25Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- BookingStore interface and Zustand store extended with all Phase 2 fields (pickupDate, pickupTime, returnDate, vehicleClass, distanceKm, priceBreakdown, quoteMode) with sessionStorage persistence
- lib/pricing.ts: rate tables for 3 vehicle classes x 3 trip types plus calculatePrice, buildPriceMap, dateDiffDays functions
- /api/calculate-price POST route: proxies Google Routes API, returns prices for all 3 vehicle classes, falls back to quoteMode: true on any error — Google Maps key never reaches client bundle
- .skeleton-shimmer CSS animation added to globals.css with reduced-motion support

## Task Commits

1. **Task 1: Extend BookingStore types and Zustand store** - `b24a5cc` (feat)
2. **Task 2: Create pricing module and API route** - `8815c5e` (feat)
3. **Task 3: Add shimmer CSS animation and vehicle placeholder images** - `466aec9` (feat)

## Files Created/Modified

- `prestigo/types/booking.ts` - Added Step 2/3 fields, VehicleConfig interface, VEHICLE_CONFIG constant, Phase 2 actions
- `prestigo/lib/booking-store.ts` - Added Phase 2 initial values, setter actions, partialize entries
- `prestigo/lib/pricing.ts` - Rate tables and pricing calculation functions (server-only)
- `prestigo/app/api/calculate-price/route.ts` - Google Routes API proxy returning prices + quoteMode
- `prestigo/app/globals.css` - @keyframes shimmer and .skeleton-shimmer utility class
- `prestigo/public/vehicles/business.jpg` - Placeholder image (replace with real photo)
- `prestigo/public/vehicles/first-class.jpg` - Placeholder image (replace with real photo)
- `prestigo/public/vehicles/business-van.jpg` - Placeholder image (replace with real photo)

## Decisions Made

- Rate tables live server-side only — lib/pricing.ts must never be imported by 'use client' components
- GOOGLE_MAPS_API_KEY without NEXT_PUBLIC_ prefix ensures key never reaches browser bundle
- X-Goog-FieldMask: routes.distanceMeters limits Routes API response to only what's needed (reduced billing)
- All error paths return quoteMode: true — UI falls back gracefully to quote request form
- Vehicle placeholder images created as minimal 1x1 PNG files named .jpg for easy future photo replacement

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `git add prestigo/types/booking.ts` failed because `prestigo` is a submodule — resolved by `cd prestigo && git add types/booking.ts`

## User Setup Required

- Set `GOOGLE_MAPS_API_KEY` in `.env.local` (server-side only, no NEXT_PUBLIC_ prefix)
- Replace vehicle placeholder images in `prestigo/public/vehicles/` with actual photos when available

## Next Phase Readiness

- All Phase 2 UI components (DateTimePicker, VehicleSelector) can consume the store fields and API endpoint defined here
- TypeScript compiles cleanly against extended types
- Vehicle images directory ready — replace placeholders before launch

---
*Phase: 02-pricing-vehicle-selection*
*Completed: 2026-03-25*
