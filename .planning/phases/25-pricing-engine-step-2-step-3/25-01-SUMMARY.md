---
phase: 25-pricing-engine-step-2-step-3
plan: 01
subsystem: ui
tags: [react, zustand, testing-library, vitest, booking-wizard, round-trip]

# Dependency graph
requires:
  - phase: 24-types-store
    provides: returnTime / setReturnTime fields and actions in BookingStore

provides:
  - Return date + return time pickers rendered in Step 2 for round_trip trip type
  - Inline datetime ordering error with role=alert when return <= pickup
  - canProceed case 2 blocks round_trip progression unless returnDate + returnTime set and returnDatetime > pickupDatetime
  - 11 new passing tests covering all round_trip UI + guard behavior

affects:
  - 25-02 (Step 3 combined price display depends on valid round_trip state from Step 2)
  - 25-03 (returnTime plumbing to API requires this UI to exist)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - isReturnBeforeOrEqualPickup helper for ISO string datetime comparison without Date objects
    - TDD red-green for UI guard: write failing tests first, implement, verify 6+5 pass

key-files:
  created: []
  modified:
    - prestigo/components/booking/steps/Step2DateTime.tsx
    - prestigo/components/booking/BookingWizard.tsx
    - prestigo/tests/Step2DateTime.test.tsx
    - prestigo/tests/BookingWizard.test.tsx
    - prestigo/tests/setup.ts

key-decisions:
  - "scrollIntoView mock added to tests/setup.ts globally — jsdom does not implement it"
  - "Test click-slot assertion scoped to return time listbox via querySelector to avoid collision with pickup listbox"
  - "sessionStorage booking_deeplink=1 set in BookingWizard tests to prevent mount effect from resetting to step 1"
  - "getContinueButton() helper uses getAllByRole[0] since BookingWizard renders desktop + mobile Continue buttons"

patterns-established:
  - "ISO string comparison for datetime ordering: YYYY-MM-DDTHH:MM lexicographic ordering is correct without Date parsing"
  - "Round_trip return section rendered after the two-column flex row, not inside it"

requirements-completed: [RTFR-02]

# Metrics
duration: 7min
completed: 2026-04-04
---

# Phase 25 Plan 01: Step 2 Round Trip Return Pickers Summary

**Return date + return time pickers added to Step 2 for round_trip with inline ordering validation; canProceed case 2 blocks Continue until returnDatetime strictly after pickupDatetime**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-04T22:44:09Z
- **Completed:** 2026-04-04T22:51:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Step 2 renders RETURN DATE calendar and RETURN TIME listbox (288 slots) only for round_trip trip type
- Inline error "Return must be after pickup" with role=alert shown when return datetime <= pickup datetime
- BookingWizard canProceed case 2 now enforces returnDate + returnTime presence and strict datetime ordering for round_trip
- 11 new TDD tests pass (6 in Step2DateTime, 5 in BookingWizard); transfer and daily behavior unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Add return date + time pickers and ordering validation to Step2DateTime.tsx** - `0490ee2` (feat)
2. **Task 2: Add round_trip canProceed guard to BookingWizard case 2** - `f374415` (feat)

_Note: TDD tasks have single commits (test + implementation together per task)_

## Files Created/Modified
- `prestigo/components/booking/steps/Step2DateTime.tsx` - isReturnBeforeOrEqualPickup helper, returnTime/setReturnTime selectors, RETURN DATE expanded to daily+round_trip, RETURN TIME listbox, ordering error alert
- `prestigo/components/booking/BookingWizard.tsx` - returnTime selector, canProceed case 2 block with round_trip guard
- `prestigo/tests/Step2DateTime.test.tsx` - 6 new real tests replacing it.todo stubs for STEP2-04 round_trip behavior
- `prestigo/tests/BookingWizard.test.tsx` - 5 new canProceed tests for WIZD-06 round_trip guard cases
- `prestigo/tests/setup.ts` - scrollIntoView mock added for jsdom compatibility

## Decisions Made
- `scrollIntoView` not available in jsdom — added `window.HTMLElement.prototype.scrollIntoView = vi.fn()` to setup.ts globally (Rule 2: missing critical test infrastructure)
- Click test for return time slot scoped to return time listbox via `getByRole('listbox', { name: /return time/i })` then `querySelectorAll('[role=option]')` to avoid collision with pickup time listbox options
- Set `sessionStorage.setItem('booking_deeplink', '1')` in BookingWizard test setup to prevent the mount useEffect from resetting currentStep to 1
- Used `getAllByRole('button', { name: /continue/i })[0]` helper since BookingWizard renders two Continue buttons (desktop + mobile sticky bar)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added scrollIntoView mock to test setup**
- **Found during:** Task 1 (RED phase test run)
- **Issue:** jsdom does not implement `scrollIntoView`; all TimeSlotItem useEffect calls threw `TypeError: ref.current.scrollIntoView is not a function`
- **Fix:** Added `window.HTMLElement.prototype.scrollIntoView = vi.fn()` to `prestigo/tests/setup.ts`
- **Files modified:** prestigo/tests/setup.ts
- **Verification:** All 6 Step2DateTime tests pass after fix
- **Committed in:** 0490ee2 (Task 1 commit)

**2. [Rule 1 - Bug] Test query collision between pickup and return time listboxes**
- **Found during:** Task 1 (GREEN phase, click-slot test)
- **Issue:** `screen.getAllByRole('option').find(el => el.textContent === '10:00')` matched the pickup time listbox option, calling `setPickupTime` instead of `setReturnTime`
- **Fix:** Scoped query to return time listbox element before querying options
- **Files modified:** prestigo/tests/Step2DateTime.test.tsx
- **Verification:** `useBookingStore.getState().returnTime === '10:00'` assertion passes
- **Committed in:** 0490ee2 (Task 1 commit)

**3. [Rule 2 - Missing Critical] BookingWizard test: prevent mount useEffect reset**
- **Found during:** Task 2 (RED phase analysis)
- **Issue:** BookingWizard mount useEffect resets currentStep to 1 unless `booking_deeplink=1` in sessionStorage, causing canProceed buttons to render for step 1 (no Continue button visible at step 2)
- **Fix:** `sessionStorage.setItem('booking_deeplink', '1')` added to `setupStep2State()` helper
- **Files modified:** prestigo/tests/BookingWizard.test.tsx
- **Verification:** All 5 canProceed tests see the Continue button at step 2
- **Committed in:** f374415 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 2 missing test infra, 1 Rule 1 test bug, 1 Rule 2 missing test setup)
**Impact on plan:** All auto-fixes necessary for correct test execution. No scope creep.

## Issues Encountered
- Pre-existing uncommitted changes in other files (TripTypeTabs.tsx, admin-pricing route, etc.) cause TripTypeTabs.test.tsx and admin-pricing.test.ts to fail in full suite run. These failures are caused by out-of-scope changes from prior phase work, not by Plan 25-01 changes. Verified by git stash confirm: those tests pass on the last committed state.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Step 2 fully equipped for round_trip: RETURN DATE picker, RETURN TIME listbox, ordering validation, canProceed guard
- Plan 25-02 (Step 3 combined price display) can now access returnDate + returnTime from store
- Plan 25-03 (returnTime API plumbing) has UI to populate the fields it needs

---
*Phase: 25-pricing-engine-step-2-step-3*
*Completed: 2026-04-04*
