---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 09
subsystem: ui
tags: [booking-wizard, zustand, next-intl, stops, waiting-fees]
status: complete

requires:
  - phase: 91-02
    provides: calculate-price returns prices[vc].waitingEur and waitingUnavailable
  - phase: 91-03
    provides: GET /api/waiting-config returning { freeMin, blockMin, maxMin, offeredClasses }
  - phase: 91-17
    provides: wizard copy keys in all 7 locales
provides:
  - per-stop wait stored in the booking store and sent to the quote as waitMinutes
  - waiting line in the wizard price summary from the server amount
  - wait options and class availability driven by the admin waiting config
  - stop reordering (up/down)
affects: [91-10, 91-16]

actuals:
  tokens: 10000
  tasks: 3
  commits: 3
plan_head_before: eda83cce9f975066c6d380cbd3bb724dc8b54078
plan_head_after: 2a3875111fc4f8eb3d3a16a9475af3977241d4dd

tech-stack:
  added: []
  patterns:
    - "module-level cached promise hook (useWaitingConfig) shared by several components, empty list on error"

key-files:
  created:
    - components/booking/useWaitingConfig.ts
    - tests/use-waiting-config.test.tsx
  modified:
    - lib/booking-store.ts
    - types/booking.ts
    - components/booking/StopItem.tsx
    - components/booking/StopList.tsx
    - components/booking/steps/Step1TripType.tsx
    - components/booking/steps/Step3Vehicle.tsx
    - components/booking/PriceSummary.tsx
    - tests/booking-store.test.ts
    - tests/StopItem.test.tsx
    - tests/StopList.test.tsx
    - tests/Step3Vehicle.test.tsx
    - tests/PriceSummary.test.tsx

key-decisions:
  - "StopItem's local display-only wait state is removed; the wait is store data (Stop.waitMinutes) that the quote request carries"
  - "onWaitChange and onMove are optional on StopItem/StopList: the multi-day planner (DayCard) has no waiting pricing, so it shows neither the wait select nor the move buttons"
  - "A class listed in waitingUnavailable is disabled by wrapping its VehicleCard (aria-disabled, inert, note) so VehicleCard itself stays untouched"

requirements-completed: [STOP-01, STOP-03]
---

# Phase 91 Plan 09: Stop waiting and reordering in the wizard Summary

The client now picks a wait per stop (stored, persisted, sent to /api/calculate-price as `waitMinutes`), sees "Waiting at stops" as its own summary line from the server's `waitingEur`, is offered only waiting the admin has priced, and can move stops up or down.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 (tracer) | 4540fbad | `setStopWait` (validated by `isValidStopWait`), new stops start at 0, StopItem select bound to the store, Step 3 sends `waitMinutes` per intermediate, PriceSummary waiting line from `waitingEur` |
| 2 | 494f1d77 | `useWaitingConfig` (one cached GET, `[]` on error), only 0/15 offered when no class offers paid waiting, free-time hint, reset of a too-long stored wait, unavailable vehicle classes disabled with a note and unselected |
| 3 | 2a387511 | `moveStop` (swap, clears price and promo, edges are no-ops), 44 px up/down buttons, `total`/`onMove` through StopList, wired in Step 1 |

## Verification

- `npx vitest run` on booking-store, StopItem, StopList, Step3Vehicle, PriceSummary, use-waiting-config, Step1TripType, i18n-completeness: 119 passed, 40 todo.
- Neighbouring wizard suites (EntryBar, BookingWizard, Step2/5/6, BookingWidget, MultiDayForm, DayCard, StickyBookingPanel, BookingSummaryBlock): 113 passed.
- `npx tsc --noEmit`: no errors outside `tests/` (8 baseline errors in `tests/`, unchanged). `npx eslint --quiet` on all changed source files: clean.
- No catalog keys added or edited; no typed euro amount in components (the line renders `&euro;{waitingEur}` from the server value).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `onWaitChange` / `onMove` made optional instead of required**
- **Found during:** Task 1 (tsc)
- **Issue:** `components/booking/DayCard.tsx` (multi-day planner, outside `files_modified`) also renders `StopList`; required props broke its compile.
- **Fix:** Props are optional. Without them StopItem hides the wait select and move buttons, because the planner has no waiting price and the old select there was display-only and misleading. The wizard (Step 1) passes both.
- **Files modified:** components/booking/StopItem.tsx, components/booking/StopList.tsx
- **Commit:** 4540fbad (wait), 2a387511 (move)

**2. [Rule 3 - Blocking] Disabled vehicle card built in Step3Vehicle, not VehicleCard**
- **Found during:** Task 2
- **Issue:** VehicleCard is outside `files_modified` and has no disabled prop.
- **Fix:** Step3Vehicle wraps the card in a `aria-disabled` + `inert` container with the note below, and `onSelect` ignores clicks for unavailable classes. The default-class effect no longer auto-selects Business when Business is the unavailable class.
- **Commit:** 494f1d77

**3. [Rule 1 - Test update] Old behaviour tests replaced**
- The "wait time is local state only" StopItem test is replaced by the store-bound tests; the StopList test AddressInput mock now renders the value so order can be asserted; all StopItem renders pass `total`.

## Known Stubs

None.

## Threat Flags

None. T-91-33 mitigated: the waiting amount is rendered only from the server's `waitingEur`; no rate or amount exists in the components or in the waiting-config hook.

## Notes for follow-up

- The real-browser behaviour (desktop and mobile layout of the new header buttons, disabled card look) is not checked here; 91-16 owner UAT covers it.
- A selected class that becomes unavailable is set to null; the default-class effect then picks Business if it is available, so the client may land on Business rather than on no selection.

## Self-Check: PASSED

- Files present: useWaitingConfig.ts, use-waiting-config.test.tsx, and the modified files above.
- Commits 4540fbad, 494f1d77, 2a387511 exist on branch worktree-agent-a44c63cdb2f84ce9e.
