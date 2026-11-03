---
phase: 87-status-service-driver-step-flow
plan: 16
subsystem: ui
tags: [react, nextjs, driver-trip, navigation, waze, google-maps, a11y]
requires:
  - phase: 87-status-service-driver-step-flow
    provides: TripScreen, ConfirmStepDialog dialog conventions, lib/driver-nav-url.ts
provides:
  - wazeNavigationUrl (destination-only Waze deep link)
  - NavigateChooser bottom-sheet (Google Maps / Waze / Cancel)
  - Navigate buttons on both trip stops open the chooser
  - UI-SPEC Amendment A
affects: [87-19, 87-20]
status: complete
commits: 2
plan_head_before: 21dc8556785013ed7fce08dcb82d8d0cec80ae86
plan_head_after: 5c952173ec4dcfbed7d2f3ea2c357f66ecd50021
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: ["Driver dialogs: own scrim/sheet with focus trap, first-option focus, focus return to opener"]
key-files:
  created:
    - app/(internal)/driver/trip/[token]/NavigateChooser.tsx
  modified:
    - lib/driver-nav-url.ts
    - app/(internal)/driver/trip/[token]/TripScreen.tsx
    - tests/driver-nav-url.test.ts
    - tests/driver-trip-screen.test.tsx
    - .planning/phases/87-status-service-driver-step-flow/87-UI-SPEC.md
key-decisions:
  - "Both options are plain anchors (no window.open) so in-app browsers handle them natively; rel=noopener noreferrer keeps the trip token out of Referer"
  - "Chooser closes on option click via onClick that does not preventDefault"
requirements-completed: [DRV-01]
duration: 15min
completed: 2026-11-03
---

# Phase 87 Plan 16: Google Maps / Waze navigation chooser Summary

Tapping Navigate to pickup or Navigate to drop-off now opens a bottom-sheet chooser with Google Maps and Waze anchors; only the destination ever leaves the page (closes 87-UAT gap 2, D-18 as amended).

## What was built

- `wazeNavigationUrl()` in `lib/driver-nav-url.ts`: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`, address fallback `https://waze.com/ul?q=<encoded>&navigate=yes`. `googleMapsDirectionsUrl` unchanged.
- `NavigateChooser.tsx`: `role=dialog`, `aria-modal`, labelled title, `driver-dialog-scrim` / `driver-dialog-sheet`, address line, Google Maps and Waze anchors (`target=_blank`, `rel="noopener noreferrer"`, ExternalLink icon) and a Cancel button; 48px minimum targets, neutral outline only, tokens only. Initial focus on Google Maps, Tab/Shift+Tab trapped, Escape / scrim / Cancel close, focus returns to the opener.
- `TripScreen.tsx`: AddressRow's Navigate control is now `<button aria-haspopup="dialog">` calling `onNavigate`; TripScreen keeps `navTarget` state and renders the chooser. A stop with neither coordinates nor address still renders no button. `ConfirmStepDialog.tsx` untouched.
- 87-UI-SPEC.md: Amendment A appended; the old "opens https://www.google.com/maps/dir/..." sentence is struck through and marked superseded (not deleted).

## Task commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 (tracer) | 2e84eb4a | Waze builder, NavigateChooser, both Navigate buttons wired, old direct-link tests rewritten, chooser behaviour tests |
| 2 | 5c952173 | UI-SPEC Amendment A |

## Deviations from Plan

None in behaviour. Sequencing note: the drop-off wiring, focus/keyboard handling and the Task 2 tests were naturally written together with the tracer (same component, trivial to wire), so they landed in the Task 1 commit; the Task 2 commit contains only the UI-SPEC amendment. All behaviour lines of both tasks have passing tests.

## Verification

- `npx vitest run tests/driver-nav-url.test.ts tests/driver-trip-screen.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 3 files, 139 tests passed (run through the node_modules symlink in the worktree; no next-intl issue seen).
- `npx tsc --noEmit`: no errors in the changed files.
- `npx eslint --quiet` on the changed lib, app and test files: clean.
- Acceptance greps: `window.open` 0 in NavigateChooser, old `getByRole('link', { name: 'Navigate to pickup' })` 0 in tests, `aria-haspopup` 1 in TripScreen, "Amendment A" present in UI-SPEC.
- Threat mitigations: T-87-51 (param-key tests ['ll','navigate'] / ['q','navigate'] / ['api','destination'], rel attribute tests, no token or booking reference in hrefs), T-87-52 (reserved characters stay inside q / destination).

## Known Stubs

None.

## Threat Flags

None (no new network surface; outbound links only carry the destination).

## Remaining

In-app browser behaviour (WhatsApp / Telegram / Instagram opening Google Maps or Waze) is the 87-20 human check.

## Self-Check: PASSED

- NavigateChooser.tsx, driver-nav-url.ts, UI-SPEC amendment present; commits 2e84eb4a and 5c952173 present on the branch.
