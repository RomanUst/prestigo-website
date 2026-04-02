---
phase: 16-admin-ui-pages
plan: 03
subsystem: ui
tags: [terra-draw, google-maps, vis-gl, react-google-maps, polygon-drawing, zones, next-dynamic, ssr]

# Dependency graph
requires:
  - phase: 14-admin-api-routes
    provides: GET/POST/PATCH/DELETE /api/admin/zones API routes
  - phase: 16-01
    provides: StatusBadge component, admin layout shell
provides:
  - ZoneMapInner: browser-only Google Maps canvas with terra-draw polygon drawing, zone list panel
  - ZoneMap: SSR-safe 'use client' wrapper using next/dynamic with ssr:false
  - /admin/zones page: Server Component zones page with Coverage Zones heading
affects: [16-04, 16-05]

# Tech tracking
tech-stack:
  added: []  # terra-draw, terra-draw-google-maps-adapter, @vis.gl/react-google-maps already installed in prior plan
  patterns:
    - Two-layer SSR bypass: ZoneMap ('use client') wraps ZoneMapInner via dynamic(ssr:false) — zones page stays Server Component
    - drawRef cross-boundary wiring: declared in outer component, passed to DrawLayer child, assigned in draw.on('ready') callback
    - terra-draw div ID fix: mapDiv.id set programmatically before TerraDrawGoogleMapsAdapter init

key-files:
  created:
    - prestigo/components/admin/ZoneMapInner.tsx
    - prestigo/components/admin/ZoneMap.tsx
    - prestigo/app/admin/(dashboard)/zones/page.tsx
  modified: []

key-decisions:
  - "drawRef declared in outer ZoneMapInner component and passed to DrawLayer child — cross-boundary wiring avoids silent button failure (terra-draw ready event Pitfall 2)"
  - "ZoneMap.tsx must be 'use client' because next/dynamic with ssr:false is only allowed in Client Components — zones page remains Server Component"
  - "terra-draw FeatureId type is string|number — draw.on('finish') callback uses loose equality (==) for snapshot.find to match either type"
  - "div ID assigned via mapDiv.id = 'terra-draw-map-container' before adapter init — @vis.gl/react-google-maps places id on parent, not on map.getDiv() element"

patterns-established:
  - "Two-layer SSR bypass: Server Component page → 'use client' wrapper → dynamic(ssr:false) inner component"
  - "terra-draw integration: div ID fix + ready event + cleanup stop() — all three pitfalls mitigated"
  - "drawRef cross-boundary: ref declared in outer component, assigned in child's useEffect after ready event, read in outer event handlers"

requirements-completed: [ZONES-01, ZONES-02, ZONES-03]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 16 Plan 03: Zones Admin Page Summary

**Google Maps + terra-draw polygon zone editor with SSR-safe two-layer dynamic import, zone list panel, toggle/delete, and save prompt**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-02T11:28:18Z
- **Completed:** 2026-04-02T11:32:50Z
- **Tasks:** 2
- **Files modified:** 3 created

## Accomplishments
- ZoneMapInner: full browser-only component with terra-draw polygon drawing, zone CRUD, and zone list panel
- ZoneMap: SSR-safe 'use client' wrapper ensuring terra-draw never executes on the server
- /admin/zones page: Server Component shell with "Coverage Zones" heading and ZoneMap import

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ZoneMapInner component with terra-draw integration** - `8e2290d` (feat)
2. **Task 2: Create ZoneMap SSR wrapper and zones page** - `33a889f` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `prestigo/components/admin/ZoneMapInner.tsx` - Browser-only map component with terra-draw drawing, zone list panel with StatusBadge/toggle/delete, save prompt, empty state
- `prestigo/components/admin/ZoneMap.tsx` - 'use client' wrapper using next/dynamic with ssr:false and loading placeholder
- `prestigo/app/admin/(dashboard)/zones/page.tsx` - Server Component page with Cormorant h1 "Coverage Zones" and ZoneMap render

## Decisions Made
- terra-draw `FeatureId` type is `string | number` — used loose equality (`==`) in `snapshot.find()` rather than strict equality to avoid TypeScript type mismatch
- `drawRef` declared in outer `ZoneMapInner` component (not inside `DrawLayer`) — enables "DRAW ZONE" / "STOP DRAWING" button handlers in the outer component to call `drawRef.current.setMode()`
- `ZoneMap.tsx` marked `'use client'` (not the page) — Next.js 16 requires `ssr: false` in `dynamic()` to live inside a Client Component

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed terra-draw FeatureId TypeScript type mismatch**
- **Found during:** Task 2 (TypeScript build check)
- **Issue:** `draw.on('finish', (id: string) => ...)` — terra-draw's `FeatureId` type is `string | number`, causing TS2345 type error
- **Fix:** Removed explicit `string` annotation from callback parameter; used loose equality `f.id == id` for snapshot.find with eslint-disable comment
- **Files modified:** `prestigo/components/admin/ZoneMapInner.tsx`
- **Verification:** `tsc --noEmit` reports no errors in ZoneMapInner.tsx
- **Committed in:** `33a889f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Type fix necessary for correct TypeScript compilation. No scope creep.

## Issues Encountered
- Turbopack build error in `app/globals.css` is pre-existing (confirmed by testing stash without our changes) — unrelated to zones implementation, does not affect runtime

## User Setup Required
None - no external service configuration required. `NEXT_PUBLIC_GOOGLE_MAPS_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` already required by the project and documented in `.env.example`.

## Next Phase Readiness
- Zones page complete — operator can draw, name, save, toggle, and delete coverage zones
- All three ZONES-01/02/03 requirements fulfilled
- Ready for Plan 16-04 (Bookings page) and 16-05 (Stats page)

---
*Phase: 16-admin-ui-pages*
*Completed: 2026-04-02*
