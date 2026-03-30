---
phase: 03-booking-details
plan: "03"
subsystem: booking-wizard
tags: [step5, passenger-details, react-hook-form, zod, booking-wizard]
dependency_graph:
  requires: [03-02]
  provides: [step5-passenger-form, booking-wizard-steps-4-5]
  affects: [BookingWizard, booking-store]
tech_stack:
  added: []
  patterns: [react-hook-form-onBlur, zod-factory-schema, watch-useEffect-zustand-sync]
key_files:
  created:
    - prestigo/components/booking/steps/Step5Passenger.tsx
  modified:
    - prestigo/components/booking/BookingWizard.tsx
decisions:
  - "Zod schema uses factory function pattern (passengerSchema(isAirport)) for runtime conditional required fields"
  - "isAirportRide derived in both Step5Passenger and BookingWizard — not stored, computed from origin/destination placeId"
  - "canProceed case 5 reads passengerDetails directly from store (watch+useEffect syncs on every keystroke, so store is always current)"
metrics:
  duration: "2 min"
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_modified: 2
---

# Phase 03 Plan 03: Step 5 Passenger Details Summary

Step 5 passenger details form with react-hook-form + Zod blur validation, conditional airport fields, 500-char textarea counter, and BookingWizard wired for Steps 4 and 5 with headings and canProceed gating.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Build Step5Passenger form component | 6d0c137 | prestigo/components/booking/steps/Step5Passenger.tsx |
| 2 | Wire Steps 4 and 5 into BookingWizard with headings and canProceed | d645452 | prestigo/components/booking/BookingWizard.tsx |

## What Was Built

### Step5Passenger Component

- `'use client'` directive, react-hook-form with `mode: 'onBlur'`
- Zod schema factory function: `passengerSchema(isAirport: boolean)` — flightNumber required when airport ride detected
- Airport detection via `PRG_CONFIG.placeId` comparison on origin/destination placeIds
- Required fields: First Name, Last Name, Email, Phone — all with blur-triggered error messages
- Conditional airport row: Flight Number (required for airport) + Terminal (optional) in two-column layout
- Special Requests textarea with `maxLength={500}` and live `{count}/500` character counter
- Accessibility: `aria-required`, `aria-describedby` wired to error `id` attributes
- Zustand sync: `watch()` destructured, `useEffect` writes all values to store via `setPassengerDetails`
- Default values hydrated from store to persist across step navigation

### BookingWizard Updates

- Imported `Step4Extras`, `Step5Passenger`, and `PRG_CONFIG`
- Added `origin`, `destination`, `passengerDetails` store reads
- Derived `isAirportRide` for airport-conditional flightNumber check
- `canProceed` case 4: always true (extras optional)
- `canProceed` case 5: gates on firstName, lastName, email, phone, plus flightNumber when airport ride
- `renderStepContent` case 4: `<Step4Extras />`, case 5: `<Step5Passenger />`
- Heading block extended from `currentStep <= 3` to `currentStep <= 5`
- Step 4 heading: "Add extras", Step 5 heading: "Passenger details"

## Verification

- TypeScript: `tsc --noEmit` — exits 0, no errors
- Vitest: 157 todo tests, 0 failures (pre-existing test stubs pattern)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `prestigo/components/booking/steps/Step5Passenger.tsx` created
- [x] `prestigo/components/booking/BookingWizard.tsx` modified
- [x] Commit 6d0c137 exists (Task 1)
- [x] Commit d645452 exists (Task 2)
- [x] TypeScript compiles clean
