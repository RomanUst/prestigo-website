---
phase: 87-status-service-driver-step-flow
plan: 05
subsystem: admin-ui, chatwoot-panel
tags: [booking-status, on_board, no_show, compare-and-set, expected_status, status_conflict, badges]
status: complete

requires:
  - phase: 87-02
    provides: BOOKING_STATUS_LABELS, TERMINAL_BOOKING_STATUSES, BookingStatus, BOOKING_STATUSES (lib/booking-status.ts)
  - phase: 87-03
    provides: PATCH /api/admin/bookings expected_status field and 409 { error: 'status_conflict', currentStatus }
provides:
  - "BookingsTable shows On Board / No-Show everywhere, treats no_show as terminal, sends expected_status and renders the locked inline conflict copy on a 409"
  - "StatusBadge exports StatusBadgeVariant (BookingStatus is assignable to it)"
  - "Own on_board (teal) and no_show (danger) hues in the Chatwoot panel (panel.css, BookingCard)"
  - "One label source for admin table, accounts page and panel DTO"
affects: [87-12 (no-show confirm modal intercepts the No-Show choice in the generic select), 87-14]

tech-stack:
  added: []
  patterns:
    - "Per-row inline conflict message (role=alert, var(--status-danger-fg)) keyed by booking id, cleared on the next status action for that row"
    - "Panel status hues: STATUS_HUES derived from BOOKING_STATUSES, so a status without a .badge-<status> rule is caught by tests/panel-status-hues.test.ts"

key-files:
  created:
    - tests/panel-status-hues.test.ts
  modified:
    - components/admin/BookingsTable.tsx
    - components/admin/StatusBadge.tsx
    - components/admin/DriverAssignmentSection.tsx
    - "app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx"
    - lib/panel-dto.ts
    - app/embed/chatwoot-dashboard/BookingCard.tsx
    - app/embed/chatwoot-dashboard/panel.css
    - tests/BookingsTable.test.tsx
    - tests/StatusBadge.test.tsx
    - tests/DriverAssignmentSection.test.tsx
    - tests/embed-panel-cards.test.tsx

key-decisions:
  - "handleStatusChange takes the row's status as a third argument (fromStatus) instead of looking it up in state, so expected_status is exactly what the clicked control showed"
  - "Conflict is recognised by PatchError status 409 and error 'status_conflict'; any other failure keeps window.alert"
  - "panel.css light hues for on_board / no_show mirror the admin-theme.css --status-teal / --status-danger light values; the dark blocks reuse the values the panel already used for assigned / cancelled, which equal the admin dark teal / danger values"
  - "The local STATUS_LABELS name is kept as a Record<string, string> alias of BOOKING_STATUS_LABELS in BookingsTable and the accounts page (indexed by arbitrary row.status strings)"

requirements-completed: [DRV-02, PAYF-02]

duration: ~30 min
completed: 2026-11-03
commits: 2
plan_head_before: ac6714b7ae80e9eadebf71336a9c9edfaf9b6cca
plan_head_after: 54ca84d3bb02924fcf5d7a9d5826d4bfc952dbaf
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 87 Plan 05: Admin and panel surfaces for On Board / No-Show, plus the admin conflict message Summary

**An on_board booking now shows the teal "On Board" badge and a no_show booking the danger "No-Show" badge in the admin list, the expanded row, the mobile cards, the accounts page and the Chatwoot panel; no_show is final in admin, and an admin status change that loses the race to the driver shows the locked inline message instead of overwriting.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | BookingsTable: shared labels / terminal set / BookingStatus casts, expected_status, inline 409 copy, StatusBadgeVariant export | 3da41017 |
| 2 | DriverAssignmentSection terminal guard, accounts page + panel-dto labels, BookingCard hues, panel.css hue pairs | 54ca84d3 |

Tracer gate: the tracer verify (BookingsTable, StatusBadge and the colour guard test, scoped tsc) was green before expansion; the task carries no blocking-human gate.

## What was built

- **BookingsTable.** `STATUS_LABELS` is now an alias of `BOOKING_STATUS_LABELS`; `TripEditPanel.isTerminal` uses `TERMINAL_BOOKING_STATUSES` (so no_show shows "No-Show bookings are final and cannot be edited." and no edit form); the three `status as '...'` casts are `as BookingStatus`. `PatchBody.expected_status` and `PatchError.currentStatus` were added; `patchBooking` copies `currentStatus` from a `status_conflict` body. `handleStatusChange(bookingId, newStatus, fromStatus)` sends `expected_status: fromStatus`; on 409 `status_conflict` it stores "This booking was just changed to {label} by the driver. Reload to see the latest state." per booking, rendered with `role="alert"` and `var(--status-danger-fg)` under the desktop select and under the mobile status buttons, cleared on the next status action for that row. The control re-enables, the row status is not changed optimistically, there is no automatic reload and no `alert()`. Other failures keep `alert()`.
- **Select options** come from `UI_TRANSITIONS` (unchanged file), so on_location offers On Board and No-Show; the no_show row has no transitions and shows the existing "(final)" badge ("No-Show (final)").
- **StatusBadge** exports `StatusBadgeVariant`; the family map already had on_board teal and no_show danger (test pins both).
- **DriverAssignmentSection** returns null for any status in `TERMINAL_BOOKING_STATUSES` (completed, cancelled, no_show).
- **Accounts detail page** takes labels from `BOOKING_STATUS_LABELS` (this also adds the previously missing "Unpaid" label) and casts the badge variant to `BookingStatus`.
- **Chatwoot panel.** `lib/panel-dto.ts` `STATUS_LABELS` is a spread of `BOOKING_STATUS_LABELS`. `BookingCard` `STATUS_HUES` is built from `BOOKING_STATUSES`; `PROGRESS_HUES` maps on_board and no_show to their own hue names. `panel.css` declares `--b-on_board-bg/fg` and `--b-no_show-bg/fg` in all three theme blocks (light, dark attribute, dark media query) plus `.badge-on_board` and `.badge-no_show`.

## Tests

- `tests/BookingsTable.test.tsx` (+8): On Board badge, No-Show badge + final badge + final notice + no select, mobile labels, on_location select options, PATCH body `{ id, status, expected_status }`, desktop 409 copy (alert role, danger token, no `alert()`, control re-enabled, row unchanged), mobile 409 copy, non-409 failure keeps `alert()`.
- `tests/StatusBadge.test.tsx` (+2): every BookingStatus is a valid variant with a family; on_board teal, no_show danger.
- `tests/DriverAssignmentSection.test.tsx` (+1): null for no_show.
- `tests/embed-panel-cards.test.tsx`: expectations for the progress hues moved from assigned / cancelled to on_board / no_show (old borrowed-hue assertions replaced), plus a status-badge case.
- `tests/panel-status-hues.test.ts` (new): panel-dto labels equal the shared vocabulary; both hue pairs exist in every theme block that declares en_route; every booking status has a `.badge-<status>` rule.

Verification: `npx vitest run` on BookingsTable, StatusBadge, DriverAssignmentSection, admin-no-hardcoded-colors, panel-bookings, panel-status-hues, embed-panel-cards, embed-panel and dashboard-app-isolation-guard: all green (98 tests in the first three-file run, 257 in the second seven-file run). Scoped `tsc --noEmit` shows no error in the changed files; `admin-caps-scan.mjs` exits 0 on BookingsTable, DriverAssignmentSection and the accounts page; `eslint --quiet` is clean on all changed TS/TSX files.

## Deviations from Plan

None - plan executed as written.

Notes (not deviations):
- The acceptance check `grep -c -- "--b-on_board-bg"` equals `grep -c -- "--b-en_route-bg:"` compares a pattern without and a pattern with the trailing colon: on_board-bg also appears in the `var(--b-on_board-bg)` of the `.badge-on_board` rule, so the raw counts are 4 and 3. The intent (one declaration per theme block) is covered exactly by `tests/panel-status-hues.test.ts` (3 declarations per variable, 3 theme blocks).
- Plan 87-12 will intercept the No-Show choice in the generic select with the confirm modal; this plan deliberately does not add it, so for now picking No-Show in the select applies immediately.

## Known Stubs

None.

## Threat Flags

None. T-87-15 and T-87-16 are accepted as planned (the client only makes writes stricter; the message discloses only the current status label to an authenticated admin). T-87-SC: no package installed.

## Self-Check: PASSED

- Files exist: tests/panel-status-hues.test.ts, components/admin/BookingsTable.tsx, components/admin/StatusBadge.tsx, app/embed/chatwoot-dashboard/panel.css
- Commits exist: 3da41017, 54ca84d3
- STATE.md and ROADMAP.md untouched.
