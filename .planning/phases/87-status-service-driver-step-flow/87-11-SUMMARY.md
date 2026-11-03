---
phase: 87-status-service-driver-step-flow
plan: 11
subsystem: driver-trip-ui
tags: [driver-trip, route-map, no-show-request, driver-note, freshness, navigation, mobile-first, vitest]
status: complete

requires:
  - phase: 87-09
    provides: getNoShowView, driver no-show HTTP contract ({ action: 'request_no_show' } -> 200 / 409 too_early / 409 step_conflict / 400 / 429 / 500)
  - phase: 87-10
    provides: TripScreen / TripScreenProps, ConfirmStepDialog (step + help modes), always-light driver shell, driver-trip-format
provides:
  - "TripScreen now renders the full D-18 layout: header, passenger + vehicle card, route map with distance chip, bottom sheet (handle, time + status, address timeline with Navigate, details + note, no-show block, slide control last)"
  - "TripMap.tsx (map surface, chip, 'Map unavailable' placeholder), TripDetails.tsx (details rows + driver note form), NoShowBlock.tsx (caption / neutral button / requested line)"
  - "ConfirmStepDialog mode 'no-show'; TripScreenProps.noShow { availableAt, requestedAt }"
  - "components/booking/RouteMap.tsx: optional height, onRouteInfo, onRouteError (existing callers unchanged)"
  - "lib/driver-nav-url.ts: googleMapsDirectionsUrl({ lat, lng } | { address })"
  - "freshness: router.refresh() every 30 s while visible and non-terminal, on visibilitychange to visible and on online"
affects: [87-13 UAT (map attribution E2, 360x640 / 390x844 / 200% zoom, in-app browsers E4), 87-14 slide gesture (SlideToAdvance untouched here)]

tech-stack:
  added: []
  patterns:
    - "Callbacks into RouteMap live in refs, and TripMap keys its PlaceResult memo on primitive lat/lng/address, so neither a new callback identity nor a router.refresh() re-render (fresh coordinate objects) rebuilds the Google map"
    - "One shared failure handler for step and no-show posts (400 invalid_token, 429, 409 step_conflict); only too_early differs per request"
    - "The note draft and the expanded flag live in TripScreen, so collapsing the sheet and server re-renders never lose the driver's text"

key-files:
  created:
    - "app/(internal)/driver/trip/[token]/TripMap.tsx"
    - "app/(internal)/driver/trip/[token]/TripDetails.tsx"
    - "app/(internal)/driver/trip/[token]/NoShowBlock.tsx"
    - lib/driver-nav-url.ts
    - tests/driver-nav-url.test.ts
  modified:
    - "app/(internal)/driver/trip/[token]/TripScreen.tsx"
    - "app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx"
    - "app/(internal)/driver/trip/[token]/page.tsx"
    - "app/(internal)/driver/trip/driver-trip.css"
    - components/booking/RouteMap.tsx
    - tests/RouteMap.test.tsx
    - tests/driver-trip-screen.test.tsx
    - tests/driver-trip.test.ts

key-decisions:
  - "RouteMap gets a third optional prop onRouteError (Directions failure or Maps library load failure). The plan interface only listed height and onRouteInfo, but the chip contract ('12.4 km (est.)' only after a Directions failure, no chip while loading) needs a failure signal; it is additive and optional"
  - "A getNoShowView answer with availableAt null (server could not compute: read error, or neither pickup instant nor arrival log row) shows the Request no-show button immediately: the server stays the authority and answers 409 too_early (or accepts, matching its own fail-open rule), so the screen never hides a button the server would honour"
  - "The draft is sent trimmed; an empty (whitespace-only) draft disables Send note, so a note cannot be cleared from the screen (spec: empty note disables the button)"
  - "Local no-show 'requested' time from the 200 answer is dropped whenever the server prop noShow.requestedAt changes, so an operator dismissal ('Client found') brings the button back on the next refresh"
  - "Map placeholder fill on the light screen is overridden from driver-trip.css (one !important rule on .driver-map [role=img], tokens only) because RouteMap sets a dark anthracite fill inline for the booking flow; nothing in the css or TripMap targets Google's gm-style / gmnoprint elements"

requirements-completed: [DRV-01, DRV-02]

commits: 3
plan_head_before: cbc4370d5a7c74e2080eed203e0f5ab4978f528b
plan_head_after: c305263ee0ab92cbbee7c616aebef1a5894c4200
actuals:
  tokens: 21000
  tasks: 3
  commits: 3

coverage:
  - id: E1
    description: "D-18 layout: passenger + vehicle card (name single-line ellipsis, 'vehicle label · vehicle_info' with the segment dropped when absent, Call passenger tel: link only when a phone exists), map, sheet with pickup time / date / status, address timeline with Navigate buttons, slide control last"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: passenger card, map and navigation (D-18)"
        status: pass
    human_judgment: false
  - id: E2
    description: "Map: fluid height clamp(200px, 32dvh, 320px); chip '12.4 km · 18 min (est.)' only after onRouteInfo; '12.4 km (est.)' only after a Directions failure; 'Map unavailable' placeholder when a coordinate pair is missing; chip top-left, nothing positioned over the bottom of the map"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#passenger card, map and navigation; tests/RouteMap.test.tsx#Phase 87 additive props"
        status: pass
      - kind: manual
        ref: "87-13 UAT: Google logo / attribution fully visible at the clamp height with the top-left chip (real browser)"
        status: pending
    human_judgment: true
  - id: E3
    description: "RouteMap additive props: default height 300 unchanged, onRouteInfo(12.4, 18) once from the Directions OK branch, not on failure; public booking (StickyBookingPanel, book page) renders exactly as before"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/RouteMap.test.tsx; tests/StickyBookingPanel.test.tsx; tests/book-page-render.test.tsx (no snapshot written)"
        status: pass
    human_judgment: false
  - id: E4
    description: "Navigate buttons open https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng> (encoded address without coordinates) with target _blank and rel noopener noreferrer; only the destination leaves the page, never the token"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/driver-nav-url.test.ts; tests/driver-trip-screen.test.tsx#Navigate buttons"
        status: pass
    human_judgment: false
  - id: E5
    description: "No-show request (D-15, D-16): caption before availableAt, one timer flips it to the neutral 'Request no-show' button, dialog posts { action: 'request_no_show' } only on 'Send request', requested line replaces the button, 409 too_early / step_conflict / network handled, no block outside on_location, slide control stays available"
    requirement: "DRV-02"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: no-show request (D-15, D-16)"
        status: pass
      - kind: integration
        ref: "tests/driver-trip.test.ts#passes the no-show times from getNoShowView to the screen while on site"
        status: pass
    human_judgment: false
  - id: E6
    description: "Driver note kept (D-21): 'Note for the office' textarea (16px, maxLength 2000, prefilled), Send note disabled while empty, posts { note } only, Sending… / Note sent / 'Could not send the note. Try again.'; flight and client-notes rows only when present; addresses clamp to 2 lines only while collapsed"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: sheet handle, details and driver note (D-21)"
        status: pass
    human_judgment: false
  - id: E7
    description: "Freshness: refresh every 30 s while visible and non-terminal, on visibilitychange to visible and on online; none while hidden, on terminal statuses, after unmount or on the in-session completed screen; unlock flip announces 'Start step unlocked.'; expanded state and note draft survive a re-render"
    requirement: "DRV-04"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: freshness; #sheet handle (survive a re-render)"
        status: pass
    human_judgment: false
  - id: E8
    description: "A 2000-character note and a long passenger / client note wrap without horizontal scroll at 360px"
    requirement: "DRV-01"
    verification:
      - kind: manual
        ref: "87-13 UAT: backstop check at 360x640 and 390x844 (jsdom only proves overflow-wrap / width 100% / ellipsis styles)"
        status: pending
    human_judgment: true

duration: ~45min
completed: 2026-11-03
---

# Phase 87 Plan 11: Driver trip screen — passenger, map, navigation, details, note, no-show, freshness Summary

**The driver screen now shows who to pick up (name, vehicle, one-tap call), a live route map with a "km · min (est.)" chip, one-tap Google Maps navigation per address, trip details with the kept office note, a two-tap "Request no-show" flow that only asks the office and changes nothing, and it re-syncs itself every 30 seconds without a manual reload.**

## What was built

- **Tracer (Task 1, `c3d3bb67`).** `RouteMap` gained three optional props (`height`, default 300; `onRouteInfo(km, min)` from the Directions OK branch; `onRouteError` for a Directions or Maps-load failure), held in refs so a new callback identity never rebuilds the map. `TripMap` mounts it at `clamp(200px, 32dvh, 320px)` inside a bordered `role="region"` wrapper, keys its `PlaceResult` memo on primitive coordinates (a 30 s `router.refresh()` hands over fresh objects and must not reload the map), shows the chip top-left only (nothing over the bottom of the map) and the "Map unavailable" placeholder when a coordinate pair is null. `TripScreen` renders the passenger card (`Call passenger` `tel:` link only with a phone; digits and `+` only in the href) and Navigate buttons (`lib/driver-nav-url.ts`) on both timeline rows.
- **Task 2 (`81b1a330`).** `NoShowBlock` (caption, neutral outline button, `role="status"` requested line), `ConfirmStepDialog` mode `no-show` (same focus trap, Escape and submitting rules), page passes `getNoShowView` times, `TripScreen` posts `{ action: 'request_no_show' }` through the same fetch helper and a shared failure handler. One `setTimeout` flips the caption to the button at `availableAt`.
- **Task 3 (`c305263e`).** Tap-only 48px handle (bar only, `aria-expanded`, label toggles), two-line address clamp while collapsed (`.driver-address-clamp`), `TripDetails` (Booking, Flight and Notes from the client when present, then the note form), and the freshness effect (interval, `visibilitychange`, `online`; all cleaned up on unmount; never on terminal statuses or after in-session completion).

## Verification

- `npx vitest run tests/RouteMap.test.tsx tests/driver-nav-url.test.ts tests/driver-trip-screen.test.tsx tests/driver-trip.test.ts tests/StickyBookingPanel.test.tsx tests/book-page-render.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-theme-css.test.ts`: 8 files, 217 tests pass, no snapshot written. Wider: `tests/driver*` plus `status-writers-gate`, `infra-vps-isolation-guard`, `Step3Vehicle`, `shared-sections-i18n`: 11 files, 343 pass.
- Scoped `tsc --noEmit` (grep driver / RouteMap): no errors (only the baseline `tests/` errors remain). `eslint --quiet` on the driver trip root, `RouteMap.tsx`, `lib/driver-nav-url.ts` and the four touched test files: clean.
- Acceptance greps: `onRouteInfo` 5 hits in RouteMap; 0 `gm-style|gmnoprint` in `TripMap.tsx` and `driver-trip.css`; "Nothing is charged and the trip stays open." 1 in the dialog; `getNoShowView(` 1 in `page.tsx`; `danger` 0 in `NoShowBlock.tsx`; "Note for the office" 1 and `maxLength` 1 in `TripDetails.tsx`; `30_000` 1 in `TripScreen.tsx`; `tests/__snapshots__` unchanged.
- Tracer gate: the tracer `<verify>` passed and the task has no `blocking-human` gate, so expansion proceeded.
- Not run here: the full suite (parallel plans 87-12 and 87-14 run concurrently; the orchestrator re-runs it on merge). No browser session: the map and layout need the real-device pass in 87-13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `onRouteError` on RouteMap**
- **Found during:** Task 1 (behavior "12.4 km (est.)" only after a Directions failure signal)
- **Issue:** the plan interface exposes only `onRouteInfo`, which fires on success, so a failure could not be told apart from "still loading" and the fallback chip could never be shown without a guess.
- **Fix:** optional `onRouteError`, called from the Directions failure branch and from a `.catch` on the Maps library load. Existing callers pass nothing and render exactly as before. The new `.catch` also stops an unhandled rejection when the loader fails.
- **Files modified:** components/booking/RouteMap.tsx, tests/RouteMap.test.tsx
- **Commit:** c3d3bb67

**2. [Rule 1 - Bug] Map would reload on every refresh**
- **Found during:** Task 1 (design check against the 30 s refresh)
- **Issue:** `RouteMap`'s effect depends on the `origin` / `destination` object identity; props rebuilt by each server render would recreate the Google map every 30 s and flash the chip.
- **Fix:** `TripMap` memoizes `PlaceResult` on primitive lat / lng / address; `RouteMap` reads callbacks through refs. Covered by the "keeps the chip across a router.refresh re-render" test.
- **Commit:** c3d3bb67

### Interpretation points (not deviations)

- New copy not in the UI-SPEC table (needed so the flows have a message): no-show network failure "Could not send the request. Your trip was not changed. Check your connection and try again."; no-show `too_early` banner "Too early to request a no-show. You can request it after HH:MM."; live-region announcement "No-show requested."
- The sheet handle uses negative vertical margins (-16 / -32) so the 48px hit area does not add 48px of height to the collapsed sheet on a 360x640 phone; the visual order is unchanged.
- jsdom cannot parse `clamp()`, so the RouteMap test asserts the pass-through with `25rem`; the exact `clamp(200px, 32dvh, 320px)` string is asserted on the `RouteMap` props in the screen tests.

## Known Stubs

None. Every rendered value comes from the page props; absent data hides its row (flight, notes, phone) or shows the specified placeholder.

## Threat Flags

None beyond the plan's model. Mitigations: T-87-37 (Navigate links carry only coordinates or the encoded address, `target="_blank"` with `rel="noopener noreferrer"`, token-free URL asserted), T-87-38 (no-show posts only from the dialog's primary button, UI shows server times only, 409 too_early reconciled by refresh), T-87-39 (refresh only while visible and non-terminal, one interval, listeners and timers cleared on unmount, never after in-session completion). No package installs.

## Handoff

- **87-13 UAT (browser, real phone):** E2 Google logo / attribution fully visible at `clamp(200px, 32dvh, 320px)` with the top-left chip (if anything overlaps, shrink the chip, never the attribution); the wrapper's `overflow: hidden` with `--admin-radius-md` could clip the very corner of the bottom-left logo, check it; 360x640 / 390x844 / 200% zoom for the sticky control and the 2000-character note; E4 in-app browsers.
- **87-14:** `SlideToAdvance.tsx` and the slide tests were not touched. `TripScreen` still passes `label`, `state`, `secondaryLine`, `onActivate` unchanged.
- **Known limitation:** the dark `--anthracite-mid` fill that `RouteMap` sets inline is overridden on the driver screen only (css rule, tokens); the booking flow is unchanged.

## Self-Check: PASSED

- Files exist: TripMap.tsx, TripDetails.tsx, NoShowBlock.tsx, lib/driver-nav-url.ts, tests/driver-nav-url.test.ts, this SUMMARY
- Commits exist: c3d3bb67, 81b1a330, c305263e
- STATE.md and ROADMAP.md untouched
