---
phase: 21-pricing-enhancements-holiday-dates-minimum-fare
plan: 02
subsystem: ui
tags: [react, admin, pricing, react-hook-form, lucide-react]

# Dependency graph
requires:
  - phase: 21-01
    provides: "Admin PUT endpoint accepting holiday_dates + min_fare; calculate-price applying holiday coefficient and minimum fare floor"
provides:
  - "PricingForm Section A with MIN FARE column (5-column grid) and editable numeric input per vehicle class"
  - "PricingForm Section D HOLIDAY DATES card with add/remove date functionality and duplicate rejection"
  - "Admin pricing page wired to pass holiday_dates from GET response to PricingForm as initialData.holidayDates"
affects: [pricing, admin, calculate-price]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "holiday_dates managed via useState (not react-hook-form) and merged into PUT body at submit time"
    - "(no floor) hint driven by watch() from react-hook-form for reactive display"
    - "Duplicate date detection: button disabled + red border when newDate already in holidayDates array"

key-files:
  created: []
  modified:
    - prestigo/components/admin/PricingForm.tsx
    - prestigo/app/admin/(dashboard)/pricing/page.tsx

key-decisions:
  - "holiday_dates managed via useState not react-hook-form — keeps it outside Zod schema; merged into PUT body at submit"
  - "5-column grid layout (160px 1fr 1fr 1fr 1fr) for vehicle class rates — MIN FARE is the 5th column"
  - "Duplicate date detection disables + ADD DATE button and turns input border red (#f87171) inline"

patterns-established:
  - "State outside react-hook-form merged at submit: useState field appended to PUT body in onSubmit handler"

requirements-completed: [PRICING-07, PRICING-08]

# Metrics
duration: 15min
completed: 2026-04-03
---

# Phase 21 Plan 02: Pricing Form UI — MIN FARE + HOLIDAY DATES Summary

**Admin PricingForm extended with 5-column rate grid (MIN FARE column) and HOLIDAY DATES card with reactive add/remove/duplicate-rejection UI, wired to the Plan 01 PUT endpoint.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-03T17:43:15Z
- **Completed:** 2026-04-03T19:50:00Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Section A vehicle class rates grid expanded to 5 columns with MIN FARE input per class
- Section D HOLIDAY DATES card added with add/remove date functionality, empty state, and duplicate date rejection
- Admin pricing page updated to pass `holiday_dates` from GET response into PricingForm as `initialData.holidayDates`
- Human verification approved — MIN FARE persists, HOLIDAY DATES add/remove/save confirmed working

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend PricingForm with MIN FARE column and HOLIDAY DATES section** - `7da0302` (feat)
2. **Task 2: Verify pricing form UI and end-to-end save** - checkpoint:human-verify — approved by user

**Plan metadata:** pending docs commit (docs: complete plan)

## Files Created/Modified
- `prestigo/components/admin/PricingForm.tsx` - Extended with MIN FARE column in Section A grid, HOLIDAY DATES Section D card, updated onSubmit to merge holiday_dates into PUT body
- `prestigo/app/admin/(dashboard)/pricing/page.tsx` - Updated to pass holiday_dates from GET response as initialData.holidayDates prop to PricingForm

## Decisions Made
- `holiday_dates` is managed via `useState` rather than react-hook-form, keeping it outside the Zod schema. It is merged into the PUT body at submit time in `onSubmit`.
- The "(no floor)" hint uses `watch('config.${index}.min_fare')` for reactivity rather than reading `initialData` directly.
- Duplicate date detection is inline: `+ ADD DATE` button disabled and date input border turns red (`#f87171`) when `newDate` is already in `holidayDates`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed the plan spec directly. All acceptance criteria met and vitest suite passed after Task 1.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 21 is fully complete: backend (Plan 01) + UI (Plan 02) both implemented and human-verified
- Phase 22 (promo codes) can proceed — pricing config foundation is stable
- Holiday coefficient and minimum fare are live in calculate-price and editable from admin panel

---
*Phase: 21-pricing-enhancements-holiday-dates-minimum-fare*
*Completed: 2026-04-03*
