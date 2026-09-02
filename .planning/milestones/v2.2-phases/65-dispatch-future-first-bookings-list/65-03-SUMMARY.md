---
phase: 65-dispatch-future-first-bookings-list
plan: 03
subsystem: api
tags: [nextjs, zod, supabase, admin-settings, react-client-component]

requires:
  - phase: 65-dispatch-future-first-bookings-list (65-01)
    provides: pricing_globals.dispatch_default_horizon / dispatch_horizon_days columns + admin_search_bookings p_sort RPC
provides:
  - "/api/admin/settings GET/PATCH extended to read/write dispatch_default_horizon + dispatch_horizon_days on pricing_globals (id=1)"
  - "components/admin/DispatchDefault.tsx — persistent Dispatch Default settings widget"
  - "settings/page.tsx now returns both new fields for downstream consumers (Plan 65-04's bookings/page.tsx default-horizon seed)"
affects: [65-04-dispatch-future-first-bookings-list]

actuals:
  tokens: 4167
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "PATCH .update() object built field-by-field from parsed.data (only present keys) so a partial settings PATCH never clobbers sibling fields — same discipline as the existing notification_flags handler"
    - "Client settings widget mirrors NotificationToggles exactly: optimistic local update -> PATCH -> revert+error feedback on failure, 2s/4s auto-clearing feedback message"

key-files:
  created:
    - components/admin/DispatchDefault.tsx
  modified:
    - app/api/admin/settings/route.ts
    - tests/admin-settings.test.ts
    - app/admin/(dashboard)/settings/page.tsx

key-decisions:
  - "settingsPatchSchema became a refined z.object with all three fields optional (was: notification_flags required) — a .refine() enforces at least one recognized field is present, matching the plan's exact schema"
  - "DispatchDefault PATCHes only the field that changed (horizon selection PATCHes dispatch_default_horizon alone; Days-field blur PATCHes dispatch_horizon_days alone) rather than always sending both — this is what makes the non-clobber guarantee visible client-side, not just server-side"
  - "Days input kept as a separate string-state (daysInput) from the persisted numeric state (days) so an in-progress edit can render freely (including empty) without prematurely clamping mid-keystroke; clamp/PATCH decision happens on blur only, per E3 partial-state spec"

patterns-established:
  - "Settings-page widgets follow the NotificationToggles shape: 'use client' + initial* props + optimistic PATCH + Saved/Failed feedback — DispatchDefault is the second instance of this pattern, confirming it as the project convention for /api/admin/settings-backed widgets"

requirements-completed: [DISP-02]

coverage:
  - id: D1
    description: "PATCH /api/admin/settings persists dispatch_default_horizon and dispatch_horizon_days to pricing_globals id=1 and a follow-up GET returns them"
    requirement: "DISP-02"
    verification:
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH { dispatch_default_horizon, dispatch_horizon_days } persists both and round-trips via GET"
        status: pass
      - kind: unit
        ref: "tests/admin-settings.test.ts#GET returns notification_flags AND dispatch_default_horizon AND dispatch_horizon_days"
        status: pass
    human_judgment: false
  - id: D2
    description: "A horizon-only or days-only PATCH never clobbers notification_flags (mass-assignment discipline)"
    requirement: "DISP-02"
    verification:
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH { dispatch_default_horizon } only does NOT overwrite notification_flags"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid dispatch_default_horizon (not future/last_n_days/all) rejected 400; dispatch_horizon_days validated as integer clamped 1..365; empty-body PATCH rejected 400"
    requirement: "DISP-02"
    verification:
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH { dispatch_default_horizon: \"bogus\" } → 400"
        status: pass
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH { dispatch_horizon_days: 0 } → 400 (below min)"
        status: pass
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH { dispatch_horizon_days: 500 } → 400 (above max)"
        status: pass
      - kind: unit
        ref: "tests/admin-settings.test.ts#PATCH {} (no recognized field) → 400"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dispatch Default widget renders the persisted horizon (copper radio dot), shows Days field + D-06 helper text only when Last N days is active, correct brand-copper active state (rgba(191,160,106,0.09) + var(--copper), no stale rgb(184,115,51) literal), mounted in Settings page"
    requirement: "DISP-02"
    verification:
      - kind: other
        ref: "grep -c 'rgba(191,160,106,0.09)' components/admin/DispatchDefault.tsx == 1; grep -c 'rgb(184,115,51)' == 0; grep -c 'DispatchDefault' app/admin/(dashboard)/settings/page.tsx == 2; npx tsc --noEmit clean for these files"
        status: pass
    human_judgment: true
    rationale: "Visual rendering (radio dot styling, conditional Days field, helper text wrap, Saved/Failed feedback timing) needs a human/browser check — no automated UI test was written for this component in this plan; grep+tsc only prove the static contract, not the rendered result."

duration: 4min
completed: 2026-08-28
status: complete
---

# Phase 65 Plan 03: Dispatch Default Settings Backend + Widget Summary

**Extended /api/admin/settings to persist dispatch_default_horizon + dispatch_horizon_days on pricing_globals, and added a Dispatch Default widget (Future only / Last N days / All) to the admin Settings page reusing the NotificationToggles optimistic-PATCH pattern.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-28T15:28:35+02:00
- **Completed:** 2026-08-28T15:32:23+02:00
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `/api/admin/settings` GET now returns `notification_flags`, `dispatch_default_horizon`, `dispatch_horizon_days` together; PATCH accepts any subset of the three fields with a refined Zod schema (enum + int 1..365 + at-least-one-field), and builds its `.update()` payload only from present fields so a horizon-only save can never blank out notification flags (or vice versa).
- New `components/admin/DispatchDefault.tsx` client widget: three radio-style options with copper active styling, a conditional `Days` field + helper text for `Last N days`, optimistic save with `Saved`/`Failed to save — try again` feedback (verbatim reuse of `NotificationToggles`' copy), and blur-time clamp-to-persisted-or-default-7 for invalid Days input (never PATCHes an invalid body).
- Widget mounted in `app/admin/(dashboard)/settings/page.tsx` directly after `NotificationToggles`, reading `dispatch_default_horizon`/`dispatch_horizon_days` from the same existing server-side settings fetch — this GET response is also what Plan 65-04's `bookings/page.tsx` will read to seed `BookingsTable`'s persisted default.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend /api/admin/settings GET + PATCH for the horizon default** - `ba839e5` (feat)
2. **Task 2: Dispatch Default settings widget + mount** - `27c88aa` (feat)

## Files Created/Modified

- `app/api/admin/settings/route.ts` - settingsPatchSchema extended (all 3 fields optional + at-least-one refine); GET select/return extended; PATCH `.update()` assembled field-by-field from parsed data
- `tests/admin-settings.test.ts` - 7 new tests: GET round-trip of all 3 fields, PATCH round-trip via follow-up GET, non-clobber assertion, enum 400, days-min 400, days-max 400, empty-body 400
- `components/admin/DispatchDefault.tsx` (new) - Dispatch Default settings widget
- `app/admin/(dashboard)/settings/page.tsx` - mounts `<DispatchDefault>` with `initialHorizon`/`initialDays` props

## Decisions Made

- Widget PATCHes only the field that changed per interaction (horizon selection sends `dispatch_default_horizon` alone; Days-field blur sends `dispatch_horizon_days` alone) rather than always sending the full pair — this exercises the server's non-clobber guarantee on every real interaction, not just in tests.
- Days input uses a separate string-state (`daysInput`) from the committed numeric state (`days`) so the field can be freely edited (including transiently empty) without clamping mid-keystroke; the clamp-or-save decision happens only on blur, matching the UI-SPEC's E3 `partial` resolution.

## Deviations from Plan

None — plan executed exactly as written. Both tasks matched their `<action>` specs; all `<verify>` commands and `<acceptance_criteria>` passed as specified.

## Issues Encountered

One in-flight test-authoring fix (not a plan deviation, caught before commit): the combined PATCH-then-GET round-trip test initially failed because the Supabase mock's shared `eq` stub had been overridden with `mockResolvedValue` for the PATCH call, breaking the chain for the subsequent GET's `.eq().single()`. Fixed by resetting `eq.mockReturnValue(chainStub)` between the PATCH and GET portions of that single test — a test-harness correction, not a source-code change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 65-04 can now read `dispatch_default_horizon`/`dispatch_horizon_days` from the same `/api/admin/settings` GET response (already extended by this plan) to seed `BookingsTable`'s persisted default and wire the in-session Future/Past/All segmented control. No blockers.

---
*Phase: 65-dispatch-future-first-bookings-list*
*Completed: 2026-08-28*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commit hashes (`ba839e5`, `27c88aa`) verified in git log.
