---
phase: 93-day-trips-custom-tours
plan: 12
subsystem: tours-booking-ui
tags: [tours, booking-box, sticky-bar, chat-launcher, checkout-query]
requires: ["93-05", "93-02"]
provides:
  - "components/tours/TourBookingBox.tsx (client booking box; handle: focusFirstMissing, book)"
  - "components/tours/StickyBookBar.tsx (mobile sticky bar)"
  - "lib/tours/checkout-query.ts: buildTourCheckoutHref, parseTourCheckoutQuery, tourBoxStorageKey, TourCheckoutQuery, MAX_TOUR_PASSENGERS"
  - "lib/tours/start-times.ts: startTimeOptions, isStartBookable, isDateBookable"
  - "ChatLauncher tour-page lift + no greeting card"
affects: ["93-13 (places box and bar on the page)", "93-16 / 93-17 (server re-validates the six query values)"]
tech-stack:
  added: []
  patterns:
    - "Box prices come only from props through the shared pure tourFare; formatEUR for display"
    - "Roving-tabindex radiogroups for time chips and car rows"
key-files:
  created:
    - components/tours/TourBookingBox.tsx
    - components/tours/StickyBookBar.tsx
    - lib/tours/checkout-query.ts
    - lib/tours/start-times.ts
    - tests/tour-booking-box.test.tsx
    - tests/tour-checkout-query.test.ts
    - tests/tour-sticky-bar.test.tsx
  modified:
    - components/ChatLauncher.tsx
decisions:
  - "TourBookingBox does not read sessionStorage: it only writes tour-box:<slug>; restoring is 93-13 (its `initial` prop)"
  - "Reassurance lines reuse Tours.facts.freeCancel / Tours.facts.payLater (Tours.box has no such keys)"
  - "A class without an extra-hour price is hidden while extra time > 0 and hides the stepper when chosen"
status: complete
commits: 3
plan_head_before: 36e0c261d15b2525161a34ef45ccdc45a3f4fc13
plan_head_after: 36c4b1f6400a50a649a6f941a8f29e7fff82b1cd
actuals:
  tokens: 15000
  tasks: 3
  commits: 3
metrics:
  completed: 2026-11-18
---

# Phase 93 Plan 12: Tour booking box and mobile sticky bar Summary

Client booking box (date, 30-minute start chips, passengers, per-car prices with 0..12 extra hours, "Book this trip" to /book/tour with six validated query values) plus the mobile sticky bar and the chat-launcher lift on tour pages.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1 (tracer) date, time, pax, car to /book/tour | f8588301 | box + checkout-query + start-times; DST-safe 12 h lead (2027-03-28 test) |
| 2 extra time, total, errors + focus, custom-tour links | 24d40f30 | stepper 0..12, per-car totals, never-disabled CTA, imperative handle |
| 3 sticky bar + chat launcher rule | 36c4b1f6 | StickyBookBar, ChatLauncher tour-page rule |

## Verification

- `npx vitest run --exclude '.claude/**'` on tour-booking-box (22), tour-checkout-query (24), tour-sticky-bar (17), chat-launcher, chat-launcher-i18n, private-link-paths: all green (562 tests in the last combined run).
- tsc: no new errors (baseline only in tests/); eslint --quiet clean on all changed files; no euro sign in components/tours.
- Not done: the 320px ru/fr/hi browser check (Task 3 human-check). The tour page does not exist until 93-13, so there is nothing to open; run it after 93-13.

## Deviations from Plan

**1. [Rule 1 - Bug] Chat launcher lift runs to lg, not md**
- **Issue:** UI-SPEC 3.9 lifts the launcher below 768px, but the sticky bar is visible below 1024px; between 768 and 1023px the launcher (md:bottom-6, end side) would sit on the bar's "Book this trip" button.
- **Fix:** on tour pages the classes are `bottom-24 md:bottom-24 lg:bottom-6`. /book and ordinary pages are unchanged (existing placement tests pass).
- **File:** components/ChatLauncher.tsx (the `md:bottom-6` moved from the shared class string into each branch).

**2. [Interface addition] StickyBookBar has an optional `focusFirstMissing` prop**
- The plan's prop list has no way to focus the first missing field. If the page passes it, an incomplete tap scrolls then calls it; if not, the tap falls back to `onBook()`, which in the box shows the errors and focuses the first missing field.
- TourBookingBox additionally exposes `book()` on its imperative handle so 93-13 can route the bar's `onBook` to the same navigation.

**3. Accessible-name spacing:** `{' '}` between the car row's label, model and price spans so the radio's name does not run words together.

## Notes for 93-13

- `TourBookingBox` props per plan; `ref` (forwardRef) gives `{ focusFirstMissing(), book() }`, `boxRef` is the section element for the sticky bar's `targetRef`.
- `onStateChange({ complete, totalEur, fromEur })` feeds the bar. `fromEur` is the lowest fitting row price including current extra hours.
- 93-13 adds the `initial` prop and sessionStorage restore; the box writes `{ date, time, pax, car, xh }` JSON under `tourBoxStorageKey(slug)`.
- The date picker's weekday/month names use react-day-picker's default (English) labels like the rest of the booking wizard; the field value uses `formatLocaleDate`.

## Known Stubs

None.

## Threat Flags

None. T-93-33 mitigated by `parseTourCheckoutQuery` (every value validated, extras dropped); T-93-34 by sharing `tourFare` with the server path (server cross-check is 93-16 / 93-17).

## Self-Check: PASSED

All 8 files exist; commits f8588301, 24d40f30, 36c4b1f6 are on the branch.
