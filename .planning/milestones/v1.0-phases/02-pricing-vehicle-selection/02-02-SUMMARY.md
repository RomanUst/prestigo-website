---
phase: 02-pricing-vehicle-selection
plan: 02
subsystem: booking-wizard
tags: [react-day-picker, date-picker, time-slots, step2, zustand]
dependency_graph:
  requires: [02-01]
  provides: [Step2DateTime component, react-day-picker v9]
  affects: [BookingWizard wiring in Plan 04]
tech_stack:
  added: [react-day-picker@9.14.0]
  patterns: [inline calendar, scrollable listbox, useBookingStore]
key_files:
  created:
    - prestigo/components/booking/steps/Step2DateTime.tsx
  modified:
    - prestigo/package.json
    - prestigo/package-lock.json
decisions:
  - react-day-picker v9 styles prop uses UI enum string keys (root, day, day_button, caption_label, weekday, button_next, button_previous) — not the v8 camelCase keys suggested in the plan spec
  - modifiersStyles handles selected/disabled/today visual states on DayPicker
  - TimeSlotItem split into separate component to enable per-ref scrollIntoView on mount/selection change
  - Time list shows empty state "Select a pickup date to continue" when no pickupDate set, instead of 96 slots (improves UX — no point picking time before date)
metrics:
  duration: 3 min
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_changed: 3
---

# Phase 02 Plan 02: Step2DateTime Component Summary

**One-liner:** React-day-picker v9 inline calendar with copper selected state, Daily Hire return date, and 96-slot scrollable 15-min time listbox wired to Zustand store.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Install react-day-picker v9 | 6c400e7 | package.json, package-lock.json |
| 2 | Create Step2DateTime component | 5f244a4 | components/booking/steps/Step2DateTime.tsx |

## What Was Built

`Step2DateTime.tsx` is a `'use client'` component that renders:

1. **Pickup date calendar** — react-day-picker v9, `mode="single"`, past dates disabled via `{ before: today }`, copper background on selected day, warmgrey for disabled
2. **Return date calendar** — Only when `tripType === 'daily'`, disabled before the selected pickup date. Clears automatically if pickup date changes to after return date.
3. **Time slot list** — 96 slots at 15-minute increments (`00:00`–`23:45`), rendered as `ul[role=listbox]` / `li[role=option]` with `aria-selected`. Selected slot has copper left border + anthracite-mid background. Shows empty state message until a pickup date is chosen.
4. **Auto-scroll** — Selected time slot scrolls into view on mount and on selection change via `useEffect` + `ref.scrollIntoView({ block: 'center' })`.
5. **No buttons** — Back/Continue buttons are intentionally absent; BookingWizard shell (Plan 04) owns those.

**Touch targets:** All day cells and time slots are minimum 44px height.

**Desktop layout:** Flex-row with calendar ~60%, time list ~40%, 32px gap. Mobile: stacked flex-col.

## Decisions Made

1. **v9 `styles` prop keys are enum strings** — The plan spec provided v8 camelCase key names (`months`, `head_cell`, `nav_button`). React-day-picker v9 replaced these with the `UI` enum values: `root`, `months`, `caption_label`, `weekday`, `day`, `day_button`, `button_previous`, `button_next`. Used the correct v9 API after reading the type definitions.

2. **`modifiersStyles` for day states** — Visual overrides for `selected`, `disabled`, and `today` are passed via `modifiersStyles` (not `styles`), matching the v9 API contract.

3. **Empty state before pickup date** — Time slot list shows "Select a pickup date to continue" when `pickupDate` is null. This is a UX improvement over showing 96 unselectable-feeling slots with no context.

4. **`TimeSlotItem` as sub-component** — Extracting each slot as its own component allows a `ref` on each `<li>`, enabling `scrollIntoView` when `isSelected` changes. A flat `map` over a parent ref array would also work but this pattern is cleaner.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written with one API adaptation:

**[Rule 1 - Bug-prevention] Corrected react-day-picker v9 `styles` prop keys**
- **Found during:** Task 2 — before writing component
- **Issue:** Plan spec provided v8 `styles` keys (`months`, `head_cell`, `nav_button`, etc.) which are deprecated/removed in v9
- **Fix:** Read `UI.d.ts` and `types/shared.d.ts` from installed package; used v9 enum string keys
- **Files modified:** Step2DateTime.tsx (correct API used from the start)

## Self-Check: PASSED

- `/Users/romanustyugov/Desktop/Prestigo/prestigo/components/booking/steps/Step2DateTime.tsx` — exists
- `/Users/romanustyugov/Desktop/Prestigo/prestigo/package.json` — contains `"react-day-picker": "^9.14.0"`
- Commit `6c400e7` — chore(02-02): install react-day-picker v9.14.0
- Commit `5f244a4` — feat(02-02): create Step2DateTime component with calendar and time slots
- `npx tsc --noEmit` — passes with 0 errors
