---
phase: 86-admin-shell
plan: 09
subsystem: ui
tags: [admin, typography, sentence-case, d-10, vitest]
status: complete

requires:
  - phase: 86-01
    provides: scripts/qa/admin-caps-scan.mjs capital-label scanner
  - phase: 86-05
    provides: colour conversion of the same files (D-03 order)
provides:
  - sentence-case display strings (source) with inline textTransform 'uppercase' in the outbox, manual booking, wizard, flight status, dispatch default and zones screens
affects: [86-08, 86-13]

plan_head_before: 9bf6cf45e1dbb6f56925e6a1d8d5a9f36d191018
plan_head_after: c48c6aa769452d622f7c3f5e10b14b3d37941794

actuals:
  tokens: 1500   # chars/4 over the changed lines of 9 source files and 1 test
  tasks: 3
  commits: 3     # measured: git rev-list --count 9bf6cf45..HEAD at SUMMARY write (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Display text lives in sentence case in the source; the element's inline textTransform 'uppercase' keeps dark capitals"

key-files:
  created: []
  modified:
    - components/admin/OutboxTable.tsx
    - "app/(internal)/admin/(dashboard)/outbox/page.tsx"
    - components/admin/ManualBookingForm.tsx
    - components/admin/AdminBookingWizard.tsx
    - components/admin/FlightStatusBlock.tsx
    - components/admin/DriverAssignmentSection.tsx
    - components/admin/DispatchDefault.tsx
    - components/admin/ZoneMapInner.tsx
    - tests/manual-booking-channel.test.tsx

key-decisions:
  - "No new textTransform was needed: every converted element (header cells, KPICard label span, labelStyle, sectionLabelStyle, wizard header paragraph, zone buttons and heading) already carried inline textTransform 'uppercase', so dark renders the same capitals as before"
  - "AddressInput (components/booking, shared with the public booking flow, not in this plan) renders its label through the global .label class; the two admin labels are now sentence case in the source, dark still shows capitals via that class"

requirements-completed: [ADM-03]

duration: 5min
completed: 2026-11-02
---

# Phase 86 Plan 09: Sentence-case labels for operations and booking screens Summary

**Case-only D-10 edit: outbox, manual booking, wizard header, flight status, dispatch default and zones labels are sentence case in the source, with the existing inline uppercase keeping the dark theme unchanged.**

## Performance

- **Duration:** about 5 minutes
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 9 source files + 1 test modified

## Accomplishments

- Tracer: outbox column headers and KPI labels converted; tests and scanner green before expansion.
- ManualBookingForm, wizard header and the remaining operational panels converted; scanner exits 0 on all nine source files of the plan.
- Words unchanged (case only); currency codes stay in capitals, "optional" is lower case.

## Changes (before -> after)

| File | Before | After |
|------|--------|-------|
| OutboxTable.tsx COLUMNS | STATUS, EVENT, REFERENCE, ATTEMPTS, LAST ERROR, NEXT ATTEMPT | Status, Event, Reference, Attempts, Last error, Next attempt |
| outbox/page.tsx KPICard labels | PENDING, PROCESSING, FAILED, STUCK, OLDEST PENDING | Pending, Processing, Failed, Stuck, Oldest pending |
| AdminBookingWizard.tsx header | NEW BOOKING — STEP {currentStep} OF 6 | New booking — step {currentStep} of 6 |
| ManualBookingForm.tsx sections | TRIP DETAILS, PASSENGER DETAILS, PAYMENT | Trip details, Passenger details, Payment |
| ManualBookingForm.tsx fields | TRIP TYPE, PICKUP DATE, PICKUP TIME, PICKUP ADDRESS, DESTINATION ADDRESS, VEHICLE CLASS, PASSENGERS, LUGGAGE, CHANNEL, FIRST NAME, LAST NAME, EMAIL, PHONE, BOOKING STATUS | Trip type, Pickup date, Pickup time, Pickup address, Destination address, Vehicle class, Passengers, Luggage, Channel, First name, Last name, Email, Phone, Booking status |
| ManualBookingForm.tsx prices | PRICE (CZK), PRICE (EUR), FLIGHT NUMBER (OPTIONAL) | Price (CZK), Price (EUR), Flight number (optional) |
| DispatchDefault.tsx | DISPATCH DEFAULT | Dispatch default |
| FlightStatusBlock.tsx | FLIGHT STATUS | Flight status |
| ZoneMapInner.tsx | DRAW ZONE, STOP DRAWING, SAVE ZONE, ZONES | Draw zone, Stop drawing, Save zone, Zones |
| DriverAssignmentSection.tsx | Driver Note (Title Case, not flagged by the scanner) | Driver note |
| tests/manual-booking-channel.test.tsx | 'pick PICKUP ADDRESS', 'CHANNEL', 'TRIP TYPE' | 'pick Pickup address', 'Channel', 'Trip type' |

AdminStep6Create.tsx already used sentence case in the source (scanner exit 0, no edit). No `caps-ok` markers were added.

## Task Commits

1. **Task 1 (tracer): outbox labels** - `841edc38` (feat)
2. **Task 2: manual booking and wizard labels** - `fbec5810` (feat)
3. **Task 3: dispatch, flight and zones labels** - `c48c6aa7` (feat)

## Verification Results

- `npx vitest run` on outbox-admin-page, manual-booking-channel, manual-booking-form-send-confirmation, FlightStatusBlock, DriverAssignmentSection, admin-no-hardcoded-colors, admin-theme-css: 7 files, 100 tests passed.
- `node scripts/qa/admin-caps-scan.mjs` on the nine source files: exit 0, no output.
- Scoped `tsc --noEmit` grep for this plan's files: no error lines.
- Acceptance greps: `'Last error'` x1, `New booking — step` x1, `Save zone` x1.
- Tests importing next-intl server modules did not fail through the node_modules symlink here; no ERR_MODULE_NOT_FOUND occurred.

## Deviations from Plan

**1. [Rule 2 - Consistency] Driver note label**
- **Found during:** Task 3
- **Issue:** `Driver Note` (Title Case) in DriverAssignmentSection is not caught by the scanner but breaks the sentence-case rule of the plan's interfaces block.
- **Fix:** `Driver note`; case-only, no test queried it.
- **Commit:** c48c6aa7

Environment notes (not deviations): the sandbox refused shell commands with computed paths, so multi-file edits were done with a throwaway node script in the session scratchpad (exact-string replacements, throws on a missing match). The per-plan commit ledger file under the git dir was not used; the spawn-time base `9bf6cf45` was asserted at start and is used for the measured commit count.

## Known Limitations

- The `AddressInput` labels (Pickup address, Destination address) are rendered by `components/booking/AddressInput.tsx` with the global `.label` class (`text-transform: uppercase` in `app/globals.css`), not an inline style. Dark is unchanged; in light these two labels will still render in capitals unless plan 86-08's safety net or a later admin-scoped override handles `.label`. That component is shared with the public booking flow and outside this plan's files.
- The 86-08 light safety net (inline `text-transform:uppercase` matcher) was not yet in this worktree, so the light rendering was not visually checked; the owner UAT covers it.

## Known Stubs

None.

## Threat Flags

None. Case-only text edits (T-86-18): words unchanged, changes listed above, tests green.

## Next Phase Readiness

Ready for the remaining Wave 3 plans. The orchestrator should re-run the vitest suites above on the main checkout after merge as a double check.

## Self-Check: PASSED

- Modified files exist and commits `841edc38`, `fbec5810`, `c48c6aa7` are in `git log 9bf6cf45..HEAD`.
- STATE.md and ROADMAP.md not modified.
