---
phase: "90"
slug: "dispatch-views"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: validated
nyquist_compliant: false
wave_0_complete: true
created: "2026-11-09"
---

# Phase 90 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + jsdom + @testing-library/react 16 + user-event 14 |
| **Config file** | `vitest.config.ts` (`// @vitest-environment node` per file for pure/API tests; `tests/setup.ts`) |
| **Quick run command** | `npx vitest run tests/<file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds (full), < 30 s per task |

---

## Sampling Rate

- **After every task commit:** Run the affected test files plus `npx tsc --noEmit` and `npx eslint --quiet <changed>`
- **After every plan wave:** Run `npx vitest run tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/cancel-booking-dialog.test.tsx tests/no-show-banner.test.tsx tests/PaymentPanel.test.tsx tests/DriverAssignmentSection.test.tsx`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 90-01-T1 | 01 | 1 | DISP-04 | T-90-01 | extraction keeps expected_status, the no-show modal path and the cancel dialog | regression | `npx vitest run tests/BookingsTable.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-01-T2 | 01 | 1 | DISP-04 | T-90-01 | one hook owns moves and both money dialogs | regression | `npx vitest run tests/BookingsTable.test.tsx tests/cancel-booking-dialog.test.tsx tests/no-show-banner.test.tsx` | ✅ | ✅ |
| 90-01-T3 | 01 | 1 | DISP-04 | T-90-13 | pending notes flushed on unmount | component + regression | `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx tests/PaymentPanel.test.tsx tests/DriverAssignmentSection.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-02-T1 | 02 | 1 | DISP-03 | T-90-03 | Prague day/minute under 3 process TZs, both DST days | unit (node) | `npx vitest run tests/prague-calendar.test.ts tests/prague-date.test.ts` | ✅ | ✅ |
| 90-02-T2 | 02 | 1 | DISP-03, DISP-01 | T-90-03 | overlap layout, month grid, Prague ranges, duration parity | unit (node) | `npx vitest run tests/prague-calendar.test.ts tests/dispatch-range.test.ts tests/google-calendar-sync.test.ts` | ✅ | ✅ |
| 90-02-T3 | 02 | 1 | DISP-01 (D-04) | T-90-02 | strict view-cookie parsers, view precedence | unit (node) | `npx vitest run tests/admin-shell-prefs.test.ts tests/admin-shell-layout.test.tsx` | ✅ (extended) | ✅ |
| 90-03-T1 | 03 | 1 | DISP-01, DISP-05 | T-90-04 | admin guard before any parse or RPC | unit | `npx vitest run tests/admin-bookings-dispatch.test.ts tests/use-dispatch-bookings.test.tsx` | ✅ | ✅ |
| 90-03-T2 | 03 | 1 | DISP-01 | T-90-05, T-90-06, T-90-07 | 62-day span, 5-page cap, no-store, no PII in logs, tripType whitelist | unit (node) | `npx vitest run tests/admin-bookings-dispatch.test.ts tests/admin-bookings.test.ts` | ✅ | ✅ |
| 90-03-T3 | 03 | 1 | DISP-05 | T-90-08 | 30 s poll, pause, visibility, stale drop, 401 stop | unit (hook, fake timers) | `npx vitest run tests/use-dispatch-bookings.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-04-T1 | 04 | 1 | DISP-02 | T-90-09 | money targets never a bare PATCH; UI_TRANSITIONS matrix | unit (node) | `npx vitest run tests/booking-moves.test.ts tests/booking-status.test.ts` | ✅ | ✅ |
| 90-04-T2 | 04 | 1 | DISP-02 | T-90-SC | exact pinned, audited packages (orchestrator install) | install check | `node -e` version check of @dnd-kit/core 6.3.1 and @dnd-kit/utilities 3.2.2 | n/a | ✅ |
| 90-04-T3 | 04 | 1 | DISP-02 | T-90-10, T-90-11 | effect stated before capture; in-flight guard; React 19 spike | component | `npx vitest run tests/complete-trip-dialog.test.tsx tests/dnd-kit-spike.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-05-T1 | 05 | 2 | DISP-04 | T-90-12 | dialogs mounted once by the provider | component + regression | `npx vitest run tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/booking-detail-panel.test.tsx` | ✅ (re-pointed) | ✅ |
| 90-05-T2 | 05 | 2 | DISP-04 | T-90-12 | mobile opens the same panel | component + regression | `npx vitest run tests/BookingsTable.test.tsx tests/booking-detail-panel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (re-pointed) | ✅ |
| 90-05-T3 | 05 | 2 | DISP-04, DISP-05 | T-90-13 | Escape guard, unsaved input pauses polling, syncRows keeps typing | component | `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx tests/PaymentPanel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (extended) | ✅ |
| 90-06-T1 | 06 | 2 | DISP-02 | T-90-14 | no optimistic apply; 409 refetch, no alert | hook | `npx vitest run tests/use-booking-moves.test.tsx tests/complete-trip-dialog.test.tsx tests/booking-moves.test.ts` | ✅ | ✅ |
| 90-06-T2 | 06 | 2 | DISP-02 | T-90-15, T-90-16 | double-submit guard; GNet no money step; picker | hook + regression | `npx vitest run tests/use-booking-moves.test.tsx tests/BookingsTable.test.tsx tests/booking-detail-panel.test.tsx tests/DriverAssignmentSection.test.tsx tests/cancel-booking-dialog.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-07-T1 | 07 | 3 | DISP-01, DISP-02, DISP-04 | T-90-17 | menu offers UI_TRANSITIONS only; no move before server accept | component | `npx vitest run tests/dispatch-board.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-07-T2 | 07 | 3 | DISP-02, DISP-05 | T-90-17 | disallowed columns refuse drops; drag pauses polling | component | `npx vitest run tests/dispatch-board.test.tsx tests/dnd-kit-spike.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-07-T3 | 07 | 3 | DISP-01 | T-90-18 | card content, ranges, states, mobile | component | `npx vitest run tests/dispatch-board.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-08-T1 | 08 | 3 | DISP-03, DISP-04 | T-90-19 | placement in Prague under America/Los_Angeles | component | `npx vitest run tests/dispatch-calendar.test.tsx tests/prague-calendar.test.ts tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-08-T2 | 08 | 3 | DISP-03 | T-90-19 | day/month views, DST week, remembered view | component | `npx vitest run tests/dispatch-calendar.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-08-T3 | 08 | 3 | DISP-03, DISP-05 | T-90-19 | Show all, polling pause and events, states | component | `npx vitest run tests/dispatch-calendar.test.tsx tests/use-dispatch-bookings.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |
| 90-09-T1 | 09 | 4 | DISP-01, DISP-03, DISP-04 | T-90-20, T-90-22 | view precedence from cookie and URL; admin gate untouched | component + node | `npx vitest run tests/bookings-workspace.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/BookingsTable.test.tsx tests/admin-shell-prefs.test.ts` | ✅ | ✅ |
| 90-09-T2 | 09 | 4 | DISP-01, DISP-04 | T-90-21 | deep link unchanged; filters and selection across tabs | component | `npx vitest run tests/bookings-workspace.test.tsx tests/BookingsTable.test.tsx tests/admin-bookings-kpi-decoupling.test.tsx tests/dispatch-board.test.tsx tests/dispatch-calendar.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ✅ |

Wave 0 note (planner): no separate Wave 0 plan; every "❌ W0" test file is written first inside the task that needs it (tdd tasks), the dnd-kit spike runs in 90-04 Task 3 right after the orchestrator install in 90-04 Task 2.

Requirement → test map (from 90-RESEARCH.md § Validation Architecture):

| Req | Behavior | Command | Exists |
|-----|----------|---------|--------|
| DISP-01 | Dispatch range route (auth, validation, paging, truncated) | `npx vitest run tests/admin-bookings-dispatch.test.ts` | ✅ |
| DISP-01 | Board columns, order, collapsed terminals, card content | `npx vitest run tests/dispatch-board.test.tsx` | ✅ |
| DISP-01 | Default range = today in Prague; quick ranges | `npx vitest run tests/dispatch-range.test.ts` | ✅ |
| DISP-02 | `planMove` for every (status, target) pair = `UI_TRANSITIONS`; routing | `npx vitest run tests/booking-moves.test.ts` | ✅ |
| DISP-02 | Menu targets, PATCH with expected_status, 409 keeps card | `npx vitest run tests/dispatch-board.test.tsx` | ✅ |
| DISP-02 | Complete confirm states capture effect | `npx vitest run tests/complete-trip-dialog.test.tsx` | ✅ |
| DISP-03 | Prague placement under 3 TZs, DST 2027-03-28 / 2027-10-31, midnight edges | `npx vitest run tests/prague-calendar.test.ts` | ✅ |
| DISP-03 | Overlap layout, min block, active filter + Show all | `npx vitest run tests/prague-calendar.test.ts tests/dispatch-calendar.test.tsx` | ✅ |
| DISP-03 | Duration estimate parity after move to `lib/trip-duration.ts` | `npx vitest run tests/google-calendar-sync.test.ts` | ✅ |
| DISP-04 | Row/card/event open the same panel; Esc/close | `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx` | ✅ |
| DISP-04 | Extraction parity: existing table tests green | `npx vitest run tests/BookingsTable.test.tsx` | ✅ |
| DISP-05 | Poll hook 30 s, pause rules, visibility, stale drop | `npx vitest run tests/use-dispatch-bookings.test.tsx` | ✅ |
| D-04 | View cookie parsers, `?view=` precedence, `?search=` | `npx vitest run tests/admin-shell-prefs.test.ts tests/bookings-workspace.test.tsx` | ✅ |
| ADM-03 | No colour literals in new files | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ✅ |
| KPI | KPI fetch URLs unchanged | `npx vitest run tests/admin-bookings-kpi-decoupling.test.tsx` | ✅ (retarget) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/prague-calendar.test.ts` — DISP-03
- [x] `tests/booking-moves.test.ts` — DISP-02
- [x] `tests/admin-bookings-dispatch.test.ts` — DISP-01
- [x] `tests/use-dispatch-bookings.test.tsx` — DISP-05
- [x] `tests/dispatch-board.test.tsx`, `tests/dispatch-calendar.test.tsx`, `tests/booking-detail-panel.test.tsx`, `tests/complete-trip-dialog.test.tsx`, `tests/bookings-workspace.test.tsx`
- [x] Spike: `DndContext` + one draggable/droppable under React 19 in jsdom
- [x] `npm install @dnd-kit/core@6.3.1 @dnd-kit/utilities@3.2.2` (orchestrator runs it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop feel on desktop and touch | DISP-02 | Pointer physics not reproducible in jsdom; localhost admin login blocked by Upstash limiter | On deployed admin, drag cards between allowed/disallowed columns |
| Calendar in a non-Prague browser timezone | DISP-03 | Real browser TZ | Set OS/browser TZ to e.g. America/New_York, check midnight bookings |
| Live driver-step refresh | DISP-05 | Needs real driver app + deployed admin | Tap a driver step, watch board/calendar update within ~30 s |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-11

Manual-only items were exercised on production on 2026-11-11 (see `90-UAT.md`, 6/6 passed). Still not observed in a real browser: a non-Prague OS timezone and the card-hold completion dialog (both covered by automated tests, recorded as deferred follow-ups in `90-UAT.md`).

## Validation Audit 2026-11-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 25 test files named in the map exist and pass (1028 tests); `@dnd-kit/core` 6.3.1 and `@dnd-kit/utilities` 3.2.2 are pinned.
