---
phase: 94-driver-cabinet
plan: 10
subsystem: driver-cabinet-ui
tags: [driver-cabinet, rides, past-view, freshness, loading, error-boundary, security]
requires:
  - "94-06: lib/driver-cabinet/rides.ts (pastMonthView, isValidMonth, monthLabel), RideList (RideRow, DayGroupHeader, RidesEmptyState), (tabs)/layout.tsx"
  - "94-02: requireDriver(nextPath) and safeDriverNext accepting /driver/rides?view=past&month=YYYY-MM"
provides:
  - "components/driver/RideList.tsx: RidesViewSwitch, MonthBar, MonthTotalCard"
  - "Past view at /driver/rides?view=past&month=YYYY-MM"
  - "components/driver/CabinetRefresh.tsx, components/driver/TabLoading.tsx"
  - "(tabs)/loading.tsx and (tabs)/error.tsx"
  - "colour-guard root components/driver"
affects: [94-11, 94-12]
tech-stack:
  added: []
  patterns:
    - "the URL is the view state: view and month are read from searchParams, validated, and only the validated values build the requireDriver return path"
    - "disabled month arrow is a span with aria-disabled and no href (not a link)"
key-files:
  created:
    - components/driver/CabinetRefresh.tsx
    - components/driver/TabLoading.tsx
    - app/(internal)/driver/(cabinet)/(tabs)/loading.tsx
    - app/(internal)/driver/(cabinet)/(tabs)/error.tsx
    - tests/driver-cabinet-shell.test.tsx
  modified:
    - app/(internal)/driver/(cabinet)/(tabs)/rides/page.tsx
    - components/driver/RideList.tsx
    - app/(internal)/driver/(cabinet)/(tabs)/layout.tsx
    - tests/driver-cabinet-rides-ui.test.tsx
    - tests/admin-no-hardcoded-colors.test.ts
key-decisions:
  - "A repeated query key (array value) for view or month counts as absent, so the page falls back to Upcoming / the current Prague month"
  - "Month neighbours are computed with integer month arithmetic (no Date), so they cannot shift with the server time zone"
  - "TabLoading falls back to the Rides title and label on an unknown path"
  - "error.tsx destructures only reset: the thrown error is never read, so no internals can reach the screen"
  - "Existing 94-06 UI tests now select ride rows by href (/driver/rides/<id>) because the switch and month arrows are links too"
patterns-established:
  - "past badges reuse the existing RideRow StatusBadge mapping from 94-06 (Completed ok, Cancelled and No-show danger); no new mapping was needed"
requirements-completed: [DCAB-06]
status: complete
commits: 2
plan_head_before: 64dddc05a8abdda99d8825b96f8ac57f24e01edb
plan_head_after: 9904bffd85676427974a854dfe81c1cc82429ef8
actuals:
  tokens: 10400
  tasks: 2
  commits: 2
completed: 2026-11-25
---

# Phase 94 Plan 10: Past rides by month, tab freshness, loading and error Summary

The Rides tab now has an Upcoming / Past switch with one Prague month of past rides at a time and the month's own fee total (hidden when nothing priced was completed), and every tab refreshes itself on return, shows static placeholders while loading and a retry view on failure.

## What was built

- **Task 1 (8d67b410):** `RidesViewSwitch` (nav "Rides view", `aria-current`), `MonthBar` (48px arrows, disabled arrow is a non-link with `aria-disabled`), `MonthTotalCard` ("Your fees for completed rides", `formatCZK`). The rides page reads `searchParams`, validates `view` and `month` (invalid, repeated or future month becomes the current Prague month), calls `requireDriver` with the validated full path, and renders Past through `pastMonthView`. The total card renders only when `feeTotal !== null` (D-11). Empty month: "No past rides in {Month Year}" plus "Use the arrows to see other months." only when an earlier month has rides. `components/driver` added to the colour guard's `SCAN_ROOTS` (and `RideList.tsx` to its `SCOPE_FLOOR`).
- **Task 2 (9904bffd):** `CabinetRefresh` (router.refresh on visible, online, every 30 s while visible; cleanup on unmount) mounted once in `(tabs)/layout.tsx`; `TabLoading` + `(tabs)/loading.tsx` (title from the path, three static 80px blocks, `aria-busy` region); `(tabs)/error.tsx` (fixed copy, accent "Try again" calling `reset()`, error never rendered).

## Verification

- `npx vitest run --exclude '.claude/**' tests/driver-cabinet-shell.test.tsx tests/driver-cabinet-rides-ui.test.tsx tests/driver-cabinet-rides.test.ts tests/admin-no-hardcoded-colors.test.ts`: 4 files, 82 tests passed.
- `npx tsc --noEmit`: 8 errors, all baseline (tests/ only), none in this plan's files.
- `npx eslint --quiet` on all changed source files and the shell test: exit 0.
- Acceptance greps: `pastMonthView` in the page, `Your fees for completed rides` in RideList, `'components/driver'` in the guard, 0 euro / `formatEUR` / `czkToEur` in RideList, 0 `error.message` in error.tsx, `CabinetRefresh` in the layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing Upcoming UI tests counted all links**
- **Found during:** Task 1 (RED run)
- **Issue:** the new view switch adds two links to the page, so 94-06 tests that used `getAllByRole('link')` to count ride rows would break.
- **Fix:** added a `rideLinks()` helper (links matching `/driver/rides/<id>`) and switched those assertions to it; page calls pass `{}` as props.
- **Files modified:** tests/driver-cabinet-rides-ui.test.tsx
- **Commit:** 8d67b410

**2. [Rule 3 - Blocking] `next/navigation` mock lacked `useRouter` for the layout tests**
- **Found during:** Task 2
- **Issue:** the (tabs) layout now renders `CabinetRefresh`, which calls `useRouter`; the 94-06 layout tests' mock did not export it.
- **Fix:** added a no-op `useRouter` to that mock.
- **Files modified:** tests/driver-cabinet-rides-ui.test.tsx
- **Commit:** 9904bffd

Otherwise the plan was executed as written. The Past badge mapping the plan listed already existed in 94-06's `RideRow`, so no new mapping code was added.

## Known Stubs

None.

## Threat Flags

None. T-94-47 (month query), T-94-48 (error boundary) and T-94-49 (money on Past) are mitigated and covered by tests.

## Self-Check: PASSED

- FOUND: components/driver/CabinetRefresh.tsx, components/driver/TabLoading.tsx, app/(internal)/driver/(cabinet)/(tabs)/loading.tsx, app/(internal)/driver/(cabinet)/(tabs)/error.tsx, tests/driver-cabinet-shell.test.tsx
- FOUND commits: 8d67b410, 9904bffd
