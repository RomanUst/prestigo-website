---
phase: 87-status-service-driver-step-flow
plan: 12
subsystem: admin-ui, no-show, settings
tags: [no-show, operator-banner, confirm-modal, settings, noshow_wait, bookings-table, D-15, D-16]
status: complete

requires:
  - phase: 87-05
    provides: BookingsTable BookingStatus casts, expected_status, PatchError.currentStatus, locked 409 copy, StatusBadge
  - phase: 87-09
    provides: GET/POST /api/admin/bookings/{id}/no-show (confirm / dismiss), noshow_wait_city_min / noshow_wait_airport_min in /api/admin/settings
provides:
  - "components/admin/NoShowBanner.tsx: NoShowBanner (warn banner with Confirm no-show / Client found), NoShowChip, hasOpenNoShowRequest"
  - "components/admin/ConfirmNoShowModal.tsx: destructive confirmation on the existing Modal (POST confirm with expected_status on_location)"
  - "components/admin/NoShowWaitSettings.tsx: city / airport waiting-time card (1..240, save on blur, optimistic with revert)"
  - "components/admin/statusConflict.ts: shared statusConflictMessage + STATUS_CONFLICT_STYLE (moved out of BookingsTable)"
  - "BookingsTable: no_show_requested_at, chip in row and mobile card, banner in both expanded views, every path to no_show goes through the modal"
affects: [87-13 go-live, 87-14, 89 no-show charge]

tech-stack:
  added: []
  patterns:
    - "One interception point (requestStatusChange) in front of handleStatusChange: 'no_show' opens the modal, everything else applies as before"
    - "Banner owns its own dismiss request; the modal owns the confirm request; the table only mirrors the result into row state"

key-files:
  created:
    - components/admin/NoShowBanner.tsx
    - components/admin/ConfirmNoShowModal.tsx
    - components/admin/NoShowWaitSettings.tsx
    - components/admin/statusConflict.ts
    - tests/no-show-banner.test.tsx
    - tests/no-show-wait-settings.test.tsx
  modified:
    - components/admin/BookingsTable.tsx
    - "app/(internal)/admin/(dashboard)/settings/page.tsx"
    - tests/BookingsTable.test.tsx

key-decisions:
  - "The no-show confirm goes through POST /api/admin/bookings/{id}/no-show (status service, admin_no_show source), never the generic PATCH; the select/mobile 'No-Show' choice opens the same modal and therefore ends in the same route"
  - "statusConflictMessage / STATUS_CONFLICT_STYLE moved to components/admin/statusConflict.ts so the table and the modal show identical 409 copy; BookingsTable behaviour unchanged"
  - "On confirm success the row gets status no_show AND no_show_requested_at null locally (UI-SPEC: success sets the row to no_show, banner and chip gone); the server keeps the timestamp as history for Phase 89"
  - "Invalid threshold input keeps the typed text with an inline error (aria-invalid) instead of snapping back, so the operator can correct it; only a failed PATCH reverts"

requirements-completed: [DRV-01, DRV-02]

duration: ~25 min
completed: 2026-11-03
commits: 2
plan_head_before: cbc4370d5a7c74e2080eed203e0f5ab4978f528b
plan_head_after: d185a6a446ec5f66135ae9c328a36d659f4aada1
actuals:
  tokens: 14000
  tasks: 2
  commits: 2

coverage:
  - id: D1
    description: "A booking on_location with an open no-show request shows the 'No-show requested' chip next to its badge (desktop row, mobile card) and the warn banner at the top of its expanded view with the driver name and Prague HH:MM; no chip when the field is null/absent or the status is not on_location; each booking gets its own chip"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx#BookingsTable no-show request: chip, banner, confirm modal (chip, no chip, many chips, mobile, banner text)"
        status: pass
      - kind: unit
        ref: "tests/no-show-banner.test.tsx#NoShowBanner"
        status: pass
    human_judgment: false
  - id: D2
    description: "'Confirm no-show' (banner, select, mobile buttons) opens the Confirm no-show modal; only the modal primary POSTs { action: 'confirm', expected_status: 'on_location' } once; success sets the row to No-Show (final) and removes banner and chip; 409 shows the locked conflict copy; Keep booking open sends nothing; the generic PATCH is never used for no_show"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/BookingsTable.test.tsx (banner button opens modal; Keep booking open; 409 in modal; select path; mobile button path; other select choices still PATCH immediately)"
        status: pass
      - kind: unit
        ref: "tests/no-show-banner.test.tsx#ConfirmNoShowModal"
        status: pass
    human_judgment: false
  - id: D3
    description: "'Client found' POSTs { action: 'dismiss' } once with both banner buttons disabled and the pressed one reading 'Saving…'; success removes banner and chip and keeps the status; failure shows 'Could not clear the request. Reload and try again.' in --status-danger-fg"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/no-show-banner.test.tsx#NoShowBanner (dismiss pending, failure, network error); tests/BookingsTable.test.tsx#Client found"
        status: pass
    human_judgment: false
  - id: D4
    description: "Settings shows 'No-show waiting time' under DispatchDefault with City (30) / Airport (60) inputs; integers 1..240 save on blur with only the changed key; 0, 241, 12.5, empty, negative and exponent input show 'Enter a whole number from 1 to 240.' and send nothing; Saved 2 s / Failed to save 4 s with revert"
    requirement: "DRV-01"
    verification:
      - kind: unit
        ref: "tests/no-show-wait-settings.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 86 guards: no colour literal in the new admin components and no capital-typed labels"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
      - kind: command
        ref: "node scripts/qa/admin-caps-scan.mjs (NoShowBanner, ConfirmNoShowModal, NoShowWaitSettings, BookingsTable) exit 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "A long driver name wraps inside the banner (overflow-wrap: anywhere) without horizontal scroll at 360px and both buttons keep a 44px target, stacked on phones and side by side from 640px"
    requirement: "DRV-02"
    verification:
      - kind: unit
        ref: "tests/no-show-banner.test.tsx#long driver names wrap (style assertions only)"
        status: pass
    human_judgment: true
    rationale: "UI-SPEC marks this a held-out visual backstop: the 360px / 640px layout (Tailwind flex-col / sm:flex-row) cannot be proven in jsdom; the owner or verifier should look at the expanded banner at 360px and 640px"
---

# Phase 87 Plan 12: Admin no-show banner, confirm modal and waiting-time settings Summary

**The operator now sees each driver no-show request in /admin/bookings (chip in the row and the card, warn banner in the expanded view), confirms it only through a destructive "Confirm no-show" modal that POSTs to the status-service route with a stale-click guard, clears it in one click with "Client found", and sets the city and airport free waiting times from Settings.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Open request -> chip + banner -> Confirm modal -> POST confirm -> row final No-Show; Client found clears it | 97148d81 |
| 2 | No-show waiting time settings card | d185a6a4 |

Tracer gate: the tracer `<verify>` (no-show-banner, BookingsTable, admin-no-hardcoded-colors, scoped tsc) was green before expansion; no `blocking-human` gate on the task and no `<human-check>`, so expansion proceeded.

## What was built

- **NoShowBanner / NoShowChip.** Full-width warn banner (`--status-warn-bg/fg`, `TriangleAlert` 20px, 16px padding, `--admin-radius-md`) at the top of the expanded desktop row and the expanded mobile card. Text "{driver name} asked for a no-show at HH:MM after waiting for the passenger. Try to reach the client, then confirm or dismiss." with the name from `GET /api/admin/bookings/{id}/no-show` (fallback "The driver" on a failed or empty GET) and the Prague time from `formatPragueTime`. Buttons are 44px high, `w-full` stacked on phones, `sm:w-auto` side by side from 640px. "Confirm no-show" (`--admin-danger-solid` / `--admin-on-danger`) only asks the table to open the modal; "Client found" POSTs `{ action: 'dismiss' }` with no confirmation, disables both buttons and reads "Saving…" while pending, and on failure shows "Could not clear the request. Reload and try again." in `--status-danger-fg`. The chip uses the warn family with the same leading dot as `StatusBadge`.
- **ConfirmNoShowModal.** On the existing `Modal`: title "Confirm no-show", body "Mark booking {reference} as a no-show? The driver's trip link stops working and the status cannot be changed back.", secondary "Keep booking open" (1px `--admin-border-strong`), primary "Confirm no-show" (danger solid) that POSTs `{ action: 'confirm', expected_status: 'on_location' }` once (an in-flight ref blocks a double click). Pending: primary reads "Confirming…", both buttons disabled, `onClose` is a no-op (Escape, scrim and X do nothing). A 409 `status_conflict` shows the 87-05 conflict copy with the real current status label; any other failure shows a generic line; reopening clears the error.
- **BookingsTable.** `no_show_requested_at?: string | null` on `Booking`; `hasOpenNoShowRequest` (on_location + set) drives the chip and the banner at all four render sites. `requestStatusChange` sits in front of `handleStatusChange` for the desktop select and the mobile status buttons: a `no_show` choice opens the modal and never PATCHes; every other choice behaves as before (including `expected_status` and the 409 copy). On a confirmed no-show the row becomes `no_show` with the request flag cleared, which turns the select into the existing "No-Show (final)" badge. On "Client found" only the flag is cleared.
- **NoShowWaitSettings.** Card under `DispatchDefault`: heading "No-show waiting time", the muted helper line, labelled number inputs "City pickup (minutes)" (default 30) and "Airport pickup (minutes)" (default 60) built on `inputBaseStyle` (44px) with `focusRingHandlers` and a sentence-case label (not the uppercase `labelStyle`). Blur validates `^\d+$` and 1..240; invalid input shows `errorStyle` text "Enter a whole number from 1 to 240." and sends nothing; a changed valid value PATCHes only its own key (`noshow_wait_city_min` or `noshow_wait_airport_min`); "Saved" for 2 s, "Failed to save — try again" for 4 s with the input reverted. The settings page passes `data.noshow_wait_city_min` / `data.noshow_wait_airport_min`.

## Tests

- `tests/no-show-banner.test.tsx` (new, 17): banner text / fallback driver name / confirm button sends nothing / dismiss pending and success / failure and network error / long-name wrapping and 44px / token pairs; modal closed / copy / Keep booking open / POST body once / pending lock including Escape / 409 / generic failure / tokens / reopen clears error.
- `tests/BookingsTable.test.tsx` (+13): chip desktop, no-chip cases, many chips, mobile chip + banner, banner text, banner -> modal -> confirm -> No-Show (final), Keep booking open, modal 409, Client found, select interception (no PATCH), select path confirm, other select choices still PATCH, mobile button interception.
- `tests/no-show-wait-settings.test.tsx` (new, 19): render and props, 30/60 fallback, per-key PATCH, bounds 1 and 240, six invalid inputs, error clearing on edit, unchanged value, Saved 2 s, failure 4 s + revert, network error, baseline after save, 44px / tokens, settings page wiring (import, props, order after DispatchDefault).

Verification: `npx vitest run` on the seven suites (no-show-banner, BookingsTable, no-show-wait-settings, admin-no-hardcoded-colors, admin-settings, DriverAssignmentSection, StatusBadge): 188 passed. Scoped `tsc --noEmit` shows no error under `components/admin`, `app/(internal)/admin` or the touched tests; `admin-caps-scan.mjs` exits 0 on the four components; `eslint --quiet` exits 0 on all changed TS/TSX files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Generic failure copy for the confirm modal**
- **Found during:** Task 1
- **Issue:** UI-SPEC defines the modal's 409 copy (reused from 87-05) but no text for a network error, 5xx, 404 or 422 on confirm. Silently doing nothing would leave the operator unsure whether the booking was marked.
- **Fix:** added "Could not confirm the no-show. Reload and try again." (same `role="alert"` + `--status-danger-fg` treatment, modal stays open, primary re-enabled).
- **Files modified:** components/admin/ConfirmNoShowModal.tsx, tests/no-show-banner.test.tsx
- **Commit:** 97148d81

**2. [Plan structure] Shared 409 helper extracted**
- `statusConflictMessage` / `STATUS_CONFLICT_STYLE` moved from BookingsTable to `components/admin/statusConflict.ts` (not in the plan's file list) so the modal and the table cannot drift. Pure move; the 87-05 tests are unchanged and green.

**Total deviations:** 1 auto-fixed (Rule 2), 1 structural addition. **Impact:** none on the stated contract.

## Issues Encountered

- The shell tool refuses compound commands in this worktree, so the plan head ledger was written with a plain redirect and the commit count measured with a plain `git rev-list --count`.
- The first run of the `tests/BookingsTable.test.tsx` append used a Python heredoc that the shell refused; the test block was written through the Write tool and appended instead (no content impact).

## Notes for the verifier / owner

- UI-SPEC E8 says both banner buttons are disabled while "confirm or dismiss is pending". Dismiss is pending inside the banner (covered). Confirm is pending inside the modal, whose scrim sits over the banner, so the banner buttons cannot be pressed meanwhile; the banner does not mirror the modal's pending state.
- Held-out visual check (UI-SPEC backstop, `human_judgment: true` in D6): open the expanded banner at 360px and 640px with a very long driver name; buttons should stack at 360px and sit side by side at 640px with no horizontal scroll.
- The admin list is not live (UI-SPEC): the chip and banner appear on the next list load; the operator email / Chatwoot note from 87-09 is the immediate signal.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-87-40 (accidental terminal no_show): every UI path to `no_show` (banner button, desktop select, mobile status button) opens `ConfirmNoShowModal`, the modal sends `expected_status: 'on_location'` so a stale click becomes a 409, and a test asserts the generic PATCH is never used. T-87-41: the server logs the admin actor in `booking_status_log` (87-02 / 87-09); this plan sends nothing that overrides it. T-87-42: client validation 1..240 mirrors the server zod and the 084 CHECK, which stay authoritative. T-87-SC: no package installed.

## Self-Check: PASSED

- Files exist: components/admin/NoShowBanner.tsx, components/admin/ConfirmNoShowModal.tsx, components/admin/NoShowWaitSettings.tsx, components/admin/statusConflict.ts, tests/no-show-banner.test.tsx, tests/no-show-wait-settings.test.tsx
- Commits exist: 97148d81, d185a6a4
- Acceptance greps: `ConfirmNoShowModal` in BookingsTable.tsx = 2; trip-link sentence in ConfirmNoShowModal.tsx = 1; `NoShowWaitSettings` in settings page = 2; range error string in NoShowWaitSettings.tsx = 1; caps scan exit 0; eslint exit 0
- STATE.md and ROADMAP.md untouched
