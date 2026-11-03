---
phase: 87-status-service-driver-step-flow
plan: 14
subsystem: driver-trip-ui
tags: [driver-trip, slide-control, pointer-events, accessibility, reduced-motion, offline, vitest]
status: complete

requires:
  - phase: 87-10
    provides: SlideToAdvance props contract (label, state, secondaryLine, onActivate), keyboard path, locked / awaiting-confirm / submitting renderings
provides:
  - "SlideToAdvance full gesture contract behind the unchanged 87-10 props: drag with 85% threshold and snap-back, 600 ms press-and-hold with ring, plain-tap hint, assistive-technology click activation, offline lock, submitting lock, reduced motion"
  - "tests/slide-to-advance.test.tsx (32 cases)"
affects: [87-11 (renders SlideToAdvance in TripScreen, no change needed), 87-13 UAT (real-phone drag, VoiceOver double tap, in-app browsers)]

tech-stack:
  added: []
  patterns:
    - "Hand-rolled pointer events with setPointerCapture; no gesture or slider library"
    - "useSyncExternalStore for navigator.onLine and prefers-reduced-motion (server snapshots: online, no reduce)"
    - "Assistive-technology click = a click that no pointerdown on the knob preceded; a pointerdown arms a flag that the click consumes or a 500 ms window expires"
    - "Derived UI state reset during render (prev-state pattern) instead of setState in effects"

key-files:
  created:
    - tests/slide-to-advance.test.tsx
  modified:
    - "app/(internal)/driver/trip/[token]/SlideToAdvance.tsx"

key-decisions:
  - "Knob position is a translateX transform on a fixed left offset; the resting end position uses the measured travel (track width - 56 - 2 x 4), measured in a callback ref, on pointerdown and on window resize"
  - "After a successful release or hold the knob stays at the end until the parent changes state (dialog dismissed -> ready resets it), so a parent that never reaches awaiting-confirm still shows the held position"
  - "Offline overrides only the idle states (ready, locked-early, locked-waiting); while the dialog is open (awaiting-confirm) or a request runs (submitting) those states stay visible, because the dialog reports network failure itself and hiding 'Saving...' would mislead"
  - "Spinner uses motion-safe:animate-spin as the plan states, plus the class is dropped when matchMedia reports reduce; the 87-10 .driver-spin CSS still serves ConfirmStepDialog"
  - "Hold ring is a 64 px SVG circle (r 30, stroke 4) inside the knob with a 600 ms stroke-dashoffset transition; under reduced motion it is drawn fully with no transition"

requirements-completed: [DRV-01, DRV-03]

commits: 2
plan_head_before: cbc4370d5a7c74e2080eed203e0f5ab4978f528b
plan_head_after: 67d3e110e399026998b33c6c7cad152b72e7e3da
actuals:
  tokens: 14000
  tasks: 2
  commits: 2

coverage:
  - id: C1
    description: "Dragging the knob to at least 85% of travel and releasing calls onActivate once and holds the knob at the end; a shorter release or pointercancel snaps back and calls nothing"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/slide-to-advance.test.tsx#drag gesture"
        status: pass
    human_judgment: false
  - id: C2
    description: "The control never sends a request; activation only calls onActivate (confirm dialog stays the only sender)"
    requirement: "DRV-03"
    verification:
      - kind: component
        ref: "tests/slide-to-advance.test.tsx#never calls fetch, #source contract"
        status: pass
    human_judgment: false
  - id: C3
    description: "Non-drag paths: 600 ms hold, Enter/Space, assistive click; plain tap shows 'Slide to continue' for 2 s"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/slide-to-advance.test.tsx#press and hold, #tap hint, #assistive-technology activation"
        status: pass
    human_judgment: false
  - id: C4
    description: "Locked-early, locked-waiting, locked-offline and submitting ignore every input; offline copy and WifiOff icon; online event restores the prop state"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/slide-to-advance.test.tsx#offline lock, #submitting, #drag gesture (locked)"
        status: pass
    human_judgment: false
  - id: C5
    description: "Reduced motion removes the snap-back transition, ring transition and spinner rotation; no colour literal; no new dependency"
    requirement: "DRV-01"
    verification:
      - kind: component
        ref: "tests/slide-to-advance.test.tsx#reduced motion, #source contract"
        status: pass
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: C6
    description: "Real-device feel: one-handed drag outdoors, VoiceOver / TalkBack double tap actually delivers a click without a preceding pointerdown, edge-swipe-back clearance, in-app browsers"
    requirement: "DRV-01"
    verification:
      - kind: manual
        ref: "87-13 UAT on a real phone"
        status: pending
    human_judgment: true

completed: 2026-11-03
---

# Phase 87 Plan 14: Slide-to-advance gesture contract Summary

**The driver's next-step control now works by dragging to 85% of the track, by holding the knob for 600 ms, by Enter/Space, or by a screen-reader click; a plain tap only shows "Slide to continue", the control locks with "No connection" while offline, and every path ends in the same `onActivate` that opens the confirm dialog.**

## What was built

- **Tracer (Task 1, `d1b16835`).** Pointer-event drag on the knob: `setPointerCapture` on pointerdown, offset clamped to 0..travel (track width - 56 - 2 x 4), knob moved with `translateX`, label opacity `1 - 0.6 x progress`. Release at or beyond 85% of travel calls `onActivate` once and keeps the knob at the end; shorter release or `pointercancel` snaps back with `transform 150ms ease-out`. The resting position is derived from the prop state (end for awaiting-confirm and submitting), so a dismissed dialog returns the knob to the start. Props, aria-label, Enter/Space and the locked renderings are as 87-10 left them.
- **Task 2 (`67d3e110`).** 600 ms hold timer with a 4 px accent ring (SVG circle, stroke-dashoffset transition), cancelled by pointerup, pointercancel or movement over 8 px (which continues as a drag). A plain tap shows "Slide to continue" for 2 s. `onClick` activates only when no pointerdown on the knob armed the pointer flag (assistive-technology activation). Offline status via `useSyncExternalStore` on the window online/offline events renders the locked look with `WifiOff`, "No connection" and "Steps cannot be saved offline." and ignores all input. Submitting ignores all input; the spinner uses `motion-safe:animate-spin`. `prefers-reduced-motion` (read with `matchMedia`, subscribed to changes) removes the snap-back, ring and spinner motion.

## Verification

- `npx vitest run tests/slide-to-advance.test.tsx tests/driver-trip-screen.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/driver-trip.test.ts`: all pass (32 new cases in `tests/slide-to-advance.test.tsx`; the 87-10 TripScreen tests still pass unchanged against the new control).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (none in the slide control or its test). `eslint --quiet` on both files: clean.
- Acceptance: `setPointerCapture` present; no `fetch(` in the component; `prefers-reduced-motion`, `useSyncExternalStore` and the offline line present; no commit of this plan touches `package.json` / `package-lock.json`; the task commits touch only `SlideToAdvance.tsx` and `tests/slide-to-advance.test.tsx` (TripScreen untouched).
- Tracer gate: the tracer `<verify>` passed and the task has no `blocking-human` gate, so expansion proceeded.

## Deviations from Plan

None - plan executed as written. Interpretation points:

- Offline overrides the idle states only (see key-decisions); while a dialog is open or a request runs, the awaiting-confirm / submitting look stays.
- The plan mentions a 500 ms-style expiry only implicitly ("a click that no pointerdown preceded"); a stale pointer flag (pointerdown with no click, for example a drag released off the knob in some browsers) expires 500 ms after pointerup so a later screen-reader click is not swallowed.
- jsdom limits: real PointerEvent timing, real layout width and VoiceOver click synthesis are mocked or untestable here; they are on the 87-13 real-phone UAT list.

## Known Stubs

None.

## Threat Flags

None. No endpoint, schema or dependency was added. Mitigations: T-87-45 (85% threshold, tap only hints, submitting ignores input, no request from the control, fetch spy test), T-87-46 (hold, keyboard and assistive-click paths tested; explicit offline lock with copy). T-87-SC: no package installs.

## Handoff

- **87-11 / 87-13:** no change needed in TripScreen; the control keeps the 87-10 props. On the 87-13 phone UAT, check a real drag (one-handed, in an in-app browser), the 600 ms hold, VoiceOver / TalkBack double tap on the knob (expects exactly one dialog opening), and toggling airplane mode with the screen open.
- `.driver-spin` in `driver-trip.css` is still used by `ConfirmStepDialog`; the slide control no longer uses it.

## Self-Check: PASSED

- Files exist: `app/(internal)/driver/trip/[token]/SlideToAdvance.tsx`, `tests/slide-to-advance.test.tsx`
- Commits exist: d1b16835, 67d3e110
- STATE.md and ROADMAP.md untouched; node_modules symlink not committed
