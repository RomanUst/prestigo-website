---
phase: 87-status-service-driver-step-flow
plan: 10
subsystem: driver-trip-ui
tags: [driver-trip, mobile-first, light-theme, slide-control, confirm-dialog, completed-view, anti-enumeration, vitest]
status: complete

requires:
  - phase: 87-02
    provides: DRIVER_STEP_LABEL, nextStepFor, TERMINAL_BOOKING_STATUSES
  - phase: 87-03
    provides: status service behind the progress route
  - phase: 87-08
    provides: strict progress route contract (200 / 400 / 409 step_conflict / 409 too_early / 429 / 500), buildTripView, tripLinkViewState
provides:
  - "always-light driver wrapper (layout.tsx + driver-trip.css) reusing the Phase 86 admin theme"
  - "TripScreen (TripScreenProps contract), SlideToAdvance (keyboard activation, locked / awaiting-confirm / submitting), ConfirmStepDialog (step and help modes), TripCompleted (in-session / reopened), InvalidTripLinkView (one uniform view)"
  - "lib/driver-trip-format.ts: formatPragueTime, formatPragueUnlock, formatPickupDate, formatPickupTime, DRIVER_STATUS_LABEL"
  - "colour guard now scans app/(internal)/driver/trip"
affects: [87-11 passenger card / map / note / no-show on the same TripScreen, 87-14 slide gesture, 87-13 UAT]

tech-stack:
  added: []
  patterns:
    - "Server truth only: the screen shows the status from the page props; a 200 sets a 'settling' state (Saving...) until the refreshed props reach the confirmed status, never optimistic"
    - "Completion is the one step without router.refresh(): the link is closed, a refresh would render the details-free reopened view and drop the in-session summary"
    - "Dialog focus management inside the dialog (capture opener on mount, focus 'Not yet', trap Tab, restore on unmount)"

key-files:
  created:
    - "app/(internal)/driver/trip/layout.tsx"
    - "app/(internal)/driver/trip/driver-trip.css"
    - "app/(internal)/driver/trip/[token]/TripScreen.tsx"
    - "app/(internal)/driver/trip/[token]/SlideToAdvance.tsx"
    - "app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx"
    - "app/(internal)/driver/trip/[token]/TripCompleted.tsx"
    - "app/(internal)/driver/trip/[token]/InvalidTripLinkView.tsx"
    - lib/driver-trip-format.ts
    - tests/driver-trip-screen.test.tsx
  modified:
    - "app/(internal)/driver/trip/[token]/page.tsx"
    - tests/driver-trip.test.ts
    - tests/admin-no-hardcoded-colors.test.ts
  deleted:
    - "app/(internal)/driver/trip/[token]/TripProgressClient.tsx"

key-decisions:
  - "The page selects an explicit column list and never selects the booking amount (D-06); buildTripView gets amount_eur: null"
  - "In-session completion renders from the 200 answer without router.refresh(); 87-11's periodic / visibility refresh must not swap a completed in-session screen for the reopened one (it is only an issue if it fires after completion; the TripScreen is already replaced by TripCompleted, which has no timers)"
  - "Knob is a div role=button (not a native button) so Enter/Space are the only keyboard paths and no synthesized click appears; 87-14 owns click / AT activation and the tap hint"
  - "Help dialog initial focus is Close (not the tel link), so a stray Enter cannot dial"
  - "Info banners (409 step_conflict) clear after 8 s; amber and danger banners stay until the next successful action"

requirements-completed: [DRV-01, DRV-03, DRV-04]

commits: 2
plan_head_before: 14c34330c8c81c5cdf04bd67fcfa5e8cf29107ed
plan_head_after: 2262b167692bb0594eddbe2a2c397c6b28e48233
actuals:
  tokens: 20000
  tasks: 2
  commits: 2

coverage:
  - id: C1
    description: "The active screen shows exactly one control labelled with the next step; the list of steps is never rendered; no Back control; no price, amount or currency text"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: one next step"
        status: pass
      - kind: integration
        ref: "tests/driver-trip.test.ts#TripSheetPage active assigned booking renders exactly one control"
        status: pass
    human_judgment: false
  - id: C2
    description: "Confirm before send (D-13): Enter opens 'Confirm: {step}', nothing is sent until the primary button; Not yet / Escape cancel; Complete trip adds the irreversible warning; double send prevented"
    requirement: "DRV-03"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: confirm then POST"
        status: pass
    human_judgment: false
  - id: C3
    description: "Start gate lock (D-14): Too early to start + Unlocks at HH:MM / on Wed 4 Nov at HH:MM (Prague time, DST-safe), Waiting for the office for confirmed / pending / unpaid, aria-disabled, Enter does nothing"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#TripScreen: locked states, lib/driver-trip-format"
        status: pass
      - kind: integration
        ref: "tests/driver-trip.test.ts#before the unlock instant the control is locked"
        status: pass
    human_judgment: false
  - id: C4
    description: "Stale and failed steps handled (DRV-04): 409 step_conflict / too_early banners, 429 banner, network / 500 keeps dialog with Try again, 400 invalid_token refreshes; status always from server truth"
    requirement: "DRV-04"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#ConfirmStepDialog behaviour, #confirm then POST (409 cases)"
        status: pass
    human_judgment: false
  - id: C5
    description: "Completed and ended views reveal nothing personal (D-17, D-09): in-session summary has Booking / Date / Completed at only; reopened has none; six ended reasons produce byte-identical HTML"
    requirement: "DRV-03"
    verification:
      - kind: component
        ref: "tests/driver-trip-screen.test.tsx#completing the trip in session, #TripCompleted and InvalidTripLinkView"
        status: pass
      - kind: integration
        ref: "tests/driver-trip.test.ts#byte-identical ended HTML, #completed booking renders the reopened view"
        status: pass
    human_judgment: false
  - id: C6
    description: "Light-only English theme: layout wraps in div.admin-shell.driver-shell[data-admin-theme=light], colour guard scans the driver root, no colour literal in driver-trip.css, no useTranslations / messages change"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts (SCAN_ROOTS includes app/(internal)/driver/trip)"
        status: pass
    human_judgment: false
  - id: C7
    description: "Sticky control stays visible and completed / ended screens do not clip at 360x640, 390x844 and 200% text zoom (UI-SPEC E3 / E7 backstops)"
    requirement: "DRV-01"
    verification:
      - kind: manual
        ref: "87-13 UAT: viewport and zoom check on a real phone (E4 in-app browsers, E2 map attribution too)"
        status: pending
    human_judgment: true

completed: 2026-11-03
---

# Phase 87 Plan 10: Light driver trip screen with one-step control Summary

**The driver link now opens a mobile-first, always-light screen that shows only the next step ("On my way" -> "I have arrived" -> "Passenger on board" -> "Complete trip"), confirms it in a dialog before sending, explains locked / stale / failed states from server truth, and ends in a "Trip completed" or uniform "no longer active" view that exposes no passenger data or amount.**

## What was built

- **Tracer (Task 1, `d1286ef6`).** `layout.tsx` + `driver-trip.css` give a fixed `div.admin-shell.driver-shell[data-admin-theme="light"]` (no cookie, no toggle). `page.tsx` is rewritten: noindex kept, uuid pre-check, one read-only join with an explicit column list (no amount), `tripLinkViewState` -> ended / completed(reopened) / active, `buildTripView` for `nextStep` / `lockReason` / `unlocksAt`. `TripScreen` renders header (wordmark), time row + `StatusBadge`, address timeline, banner slot, polite live region, sticky `SlideToAdvance` and the step dialog. Submission POSTs `{ step }` to `/api/driver/trip/{token}/progress` only from the dialog's primary button; a 200 announces `Status updated: {step}.`, holds the control in "Saving..." and calls `router.refresh()`. `SlideToAdvance` (track 64, knob 56, inset 4) has Enter/Space activation and the ready, locked-early, locked-waiting, awaiting-confirm and submitting renderings. `lib/driver-trip-format.ts` formats Prague times (tested across the 2026-10-25 DST change). Old `TripProgressClient` deleted; `SCAN_ROOTS` extended.
- **Task 2 (`2262b167`).** `TripCompleted` (in-session summary: Booking, Date, Completed at; reopened: heading + body only; both with the `BUSINESS_TEL_URL` link), `InvalidTripLinkView` (second line + tel link, no props so identical markup for every reason), Help dialog (`mode="help"`: "Need help?", `Call the office` tel link, number, `Close`, focus returns to Help), and the error states (network / 5xx keep the dialog open with `role="alert"` and "Try again"; 429 amber banner; 400 `invalid_token` refresh; info banners clear after 8 s).

## Verification

- `npx vitest run tests/driver tests/admin-theme-css.test.ts tests/admin-no-hardcoded-colors.test.ts tests/start-gate.test.ts`: 8 files, 252 tests pass. New: `tests/driver-trip-screen.test.tsx` (40 tests), rewritten page block of `tests/driver-trip.test.ts`.
- Scoped `tsc --noEmit` (grep driver): no errors. `eslint --quiet` on `app/(internal)/driver/trip`, `lib/driver-trip-format.ts` and both test files: clean.
- Acceptance greps: no `TripProgressClient.tsx`; 0 colour literals in `driver-trip.css`; no `useTranslations` / `getTranslations` under the driver trip root; `messages/` untouched; no Back control; `BUSINESS_TEL_URL` in dialog, completed and ended views.
- Tracer gate: the tracer `<verify>` passed and the task has no `blocking-human` gate, so expansion proceeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Page test file stayed `.ts`, not `.tsx`**
- **Found during:** Task 1 (tests)
- **Issue:** the plan names `tests/driver-trip.test.ts`; JSX is not allowed in `.ts`.
- **Fix:** the page tests build the layout wrapper with `createElement` and keep the file name.

**2. [Rule 1 - Bug] react-hooks/purity on `Date.now()` in the async page**
- **Found during:** Task 1 (eslint)
- **Fix:** the request time is read through a small module-level `currentTimeMs()` helper.

### Interpretation points (not deviations)

- Completing the trip does not call `router.refresh()`: the link is already closed, so the refreshed page would render the details-free reopened variant and the in-session summary (required by D-17) would never show. The 200 answer is the server truth used.
- The plan's props contract carries passenger, map and note fields; they are accepted by `TripScreen` and passed by the page but not rendered here (87-11 owns passenger card, map, details, note, no-show). Until 87-11 lands, the driver screen does not show the passenger name or phone, and the note (formerly in `TripProgressClient`) is not available. Do not merge phase 87 to `main` before 87-11.

## Handoff

- **87-11:** extend `TripScreen` in place. The server already passes `trip.*` and `initialNote`. `ConfirmStepDialog` takes `mode`; add `'no-show'` to the union (there is a comment marking it). If 87-11 adds periodic / visibility `router.refresh()`, skip it once the in-session completed screen is showing (that component has no refresh logic, so it is naturally safe).
- **87-14:** `SlideToAdvance` internals only. Knob is a `div role="button"` with `data-driver-focus`; there is deliberately no `onClick`. VoiceOver "double tap" generates a click, not a key event, so 87-14 should decide how an AT click activates (for example `event.detail === 0`) while keeping the plain-tap "Slide to continue" hint. `.driver-spin` already honours `prefers-reduced-motion`.
- **87-13 UAT:** E3 / E7 overflow at 360x640, 390x844 and 200% zoom, E4 in-app browsers, E2 map attribution (map arrives in 87-11).

## Known Stubs

None. Nothing placeholder-like renders to the driver; absent features (passenger card, map, note, no-show) are 87-11 scope, not stubs.

## Threat Flags

None. No new endpoint or schema. Mitigations: T-87-33 (reopened / ended views carry no passenger, address, phone or amount; ended HTML byte-identical for six reasons, tested), T-87-34 (noindex tested), T-87-35 (dialog before any request, submitting ignores input, in-flight guard), T-87-36 (status only from server responses / refreshed props). No package installs.

## Self-Check: PASSED

- Files exist: layout.tsx, driver-trip.css, page.tsx, TripScreen.tsx, SlideToAdvance.tsx, ConfirmStepDialog.tsx, TripCompleted.tsx, InvalidTripLinkView.tsx, lib/driver-trip-format.ts, tests/driver-trip-screen.test.tsx
- Commits exist: d1286ef6, 2262b167
- STATE.md and ROADMAP.md untouched
