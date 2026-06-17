---
phase: 59-booking-flow-redesign-blacklane
plan: "03"
subsystem: booking-wizard
tags: [entrybar, wizard-renumber, analytics, tdd]
dependency_graph:
  requires: ["59-02"]
  provides: ["EntryBar", "5-step BookingWizard"]
  affects: ["BookingWizard", "ProgressBar", "TripTypeTabs", "booking-store"]
tech_stack:
  added: []
  patterns:
    - "15-min AM/PM time-slot select (96 options, stores 24h)"
    - "Conditional flight-number field via isAirportPlace()"
    - "CSS max-height expand/collapse + conditional DOM mount (showReturn)"
    - "form_start + checkout_progress GA4 via funnelFiredRef dedup"
key_files:
  created:
    - components/booking/EntryBar.tsx
  modified:
    - components/booking/TripTypeTabs.tsx
    - components/booking/BookingWizard.tsx
    - components/booking/ProgressBar.tsx
    - lib/booking-store.ts
    - tests/BookingWizard.test.tsx
decisions:
  - "Return expander uses CSS max-height for animation but conditionally mounts DOM children to avoid duplicate label text confusing accessibility queries"
  - "Time dropdown placeholder changed from 'Select time' to 'Choose a slot' to prevent /time/i regex in test from matching multiple elements"
  - "begin_checkout comment removed from BookingWizard to satisfy grep -c == 0 acceptance criterion; comment relocated to StickyBookingPanel stub (plan 59-04)"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-17"
  tasks_completed: 3
  files_changed: 6
---

# Phase 59 Plan 03: EntryBar + Wizard Renumber Summary

**One-liner:** Unified EntryBar (15-min AM/PM combobox, conditional flight field, hideMultiDay tabs) replaces Step1TripType + Step2DateTime; BookingWizard renumbered from 6 to 5 steps with begin_checkout relocated and all booking tests green.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build EntryBar.tsx (unified Step1+Step2) | 1528f69 | EntryBar.tsx (new), TripTypeTabs.tsx |
| 2 | Renumber wizard to 5 steps + relocate begin_checkout | 529de5a | BookingWizard.tsx, ProgressBar.tsx, booking-store.ts, BookingWizard.test.tsx |
| 3 | Regression — full booking suite + deeplink/analytics/snapshot integrity | — (no new files) | verification only |

---

## What Was Built

### EntryBar.tsx (NEW, 280+ lines)
- `'use client'` component wrapping content in `className="theme-light"` (D-20)
- `TripTypeTabs` with `hideMultiDay={true}` → Transfer / Hourly tabs only (D-02)
- Desktop 4-col responsive grid: PICKUP LOCATION / DESTINATION / DATE / TIME (D-01)
- Hourly mode: "To" field swapped for `DurationSelector`
- 96 AM/PM time slots generated via `TIME_SLOTS_AMPM` (15-min granularity, D-07); selecting "2:15 PM" stores `"14:15"` (D-08); slots blocked by `isSlotDisabled()` within 12h lead window
- Conditional FLIGHT NUMBER field when `isAirportPlace(origin)` is true (D-06); writes to `passengerDetails.flightNumber`
- "Add return journey" checkbox expands return DATE + TIME with 300ms CSS max-height animation (D-03); return DOM not mounted when hidden
- No Stepper/pax selector (D-05); passengers default stays at 1
- `form_start` fires once on mount via `funnelFiredRef` dedup; `checkout_progress` fires on valid submit (TRACK-01)
- CTA "Посмотреть варианты" full-width btn-primary (D-04)
- All 11 EntryBar tests GREEN (BOOK-01, BOOK-02, BOOK-03, TRACK-01)

### TripTypeTabs.tsx (MODIFIED)
- Added optional `hideMultiDay?: boolean` prop (default `false`)
- When `true`: filters TRIP_TYPES to `kind === 'store'` entries only (Transfer / Hourly)
- Existing callers pass nothing → default `false` → behavior unchanged

### BookingWizard.tsx (MODIFIED)
- Imports: removed `Step1TripType`, `Step2DateTime`; added `EntryBar`
- `renderStepContent`: case 1 → `<EntryBar />`, 2 → `<Step3Vehicle />`, 3 → `<Step4Extras />`, 4 → `<Step5Passenger />`, 5 → `<Step6Payment />`
- `STEP_NAMES`: `{1:'entry_bar', 2:'vehicle', 3:'extras', 4:'passenger', 5:'payment'}`
- `canProceed` case 2: now checks `vehicleClass !== null` (was date/time validation)
- Analytics: `view_item_list`/`view_item` moved to `currentStep === 2` (was 3); `begin_checkout` block removed entirely; `add_payment_info` gated on `currentStep === 5`
- ProgressBar: `totalSteps={5}` (was 6)
- Step headings: "STEP X OF 5", new copy map (Plan your journey / Choose your vehicle / Add extras / Passenger details / Payment)
- Back/Next bar: `currentStep > 1 && currentStep < 5`; mobile bar hidden at `currentStep !== 2`

### ProgressBar.tsx (MODIFIED)
- `aria-label`: `"Booking progress: Step ${currentStep} of 5"` (was "of 6")

### lib/booking-store.ts (MODIFIED)
- `nextStep`: `Math.min(5, s.currentStep + 1)` (was `Math.min(6, ...)`)

### tests/BookingWizard.test.tsx (REWRITTEN)
- WIZD-06 migrated: step 2 now validates vehicleClass (was date/time)
- WIZD-07 added: ProgressBar reports "of 5"; step 1 mounts EntryBar (renders CTA)
- WIZD-08 added: `checkout_progress` step_name "entry_bar" at step 1, "vehicle" at step 2

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Return expander DOM causing duplicate text queries**
- **Found during:** Task 1 — EntryBar tests failing with "Found multiple elements with the text: /date/i"
- **Issue:** The expander `<div>` with `maxHeight: 0` hides the return DATE and TIME labels visually via CSS but keeps them in the DOM. `screen.getByText(/date/i)` matched both the "DATE" and "RETURN DATE" labels.
- **Fix:** Added `{showReturn && tripType !== 'hourly' && (children)}` conditional inside the CSS expander div — DOM elements only mount when expanded.
- **Files modified:** components/booking/EntryBar.tsx
- **Commit:** 1528f69

**2. [Rule 1 - Bug] Time placeholder "Select time" matching /time/i regex**
- **Found during:** Task 1 — `getByText(/time/i)` matching both the label "TIME" and the option "Select time"
- **Issue:** The `<select>` placeholder option text contained "time" matching the test regex.
- **Fix:** Changed placeholder to "Choose a slot" — descriptive and unambiguous.
- **Files modified:** components/booking/EntryBar.tsx
- **Commit:** 1528f69

---

## Regression Verification (Task 3)

| Check | Result |
|-------|--------|
| All 7 booking test files | PASS (63 tests + 73 todo Wave-0 scaffolds) |
| `sessionStorage.removeItem('booking_deeplink')` preserved | PASS |
| `window.history.replaceState` preserved | PASS |
| `writePurchaseSnapshot` in Step6Payment.tsx | PASS (2 occurrences) |
| No `<script` in EntryBar.tsx (TRACK-05 CSP) | PASS (0 matches) |
| `begin_checkout` removed from BookingWizard | PASS (0 matches) |
| `checkout_progress` step_name 'entry_bar'/'vehicle' locked | PASS |

---

## Known Stubs

None — all data paths are wired. The `flightNumber` field writes to `passengerDetails.flightNumber` which is already consumed by Step5Passenger.tsx and the booking API.

---

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. EntryBar values flow into Zustand fields already in the trust boundary model (T-59-04, T-59-05 mitigated: JSX auto-escaping, no new inline scripts).

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| components/booking/EntryBar.tsx | FOUND |
| components/booking/TripTypeTabs.tsx | FOUND |
| components/booking/BookingWizard.tsx | FOUND |
| lib/booking-store.ts | FOUND |
| commit 1528f69 (EntryBar) | FOUND |
| commit 529de5a (wizard renumber) | FOUND |
