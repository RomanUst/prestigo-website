---
phase: "90"
slug: "dispatch-views"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| (filled by planner / validate-phase) | | | | | | | | | |

Requirement → test map (from 90-RESEARCH.md § Validation Architecture):

| Req | Behavior | Command | Exists |
|-----|----------|---------|--------|
| DISP-01 | Dispatch range route (auth, validation, paging, truncated) | `npx vitest run tests/admin-bookings-dispatch.test.ts` | ❌ W0 |
| DISP-01 | Board columns, order, collapsed terminals, card content | `npx vitest run tests/dispatch-board.test.tsx` | ❌ W0 |
| DISP-01 | Default range = today in Prague; quick ranges | `npx vitest run tests/dispatch-range.test.ts` | ❌ W0 |
| DISP-02 | `planMove` for every (status, target) pair = `UI_TRANSITIONS`; routing | `npx vitest run tests/booking-moves.test.ts` | ❌ W0 |
| DISP-02 | Menu targets, PATCH with expected_status, 409 keeps card | `npx vitest run tests/dispatch-board.test.tsx` | ❌ W0 |
| DISP-02 | Complete confirm states capture effect | `npx vitest run tests/complete-trip-dialog.test.tsx` | ❌ W0 |
| DISP-03 | Prague placement under 3 TZs, DST 2027-03-28 / 2027-10-31, midnight edges | `npx vitest run tests/prague-calendar.test.ts` | ❌ W0 |
| DISP-03 | Overlap layout, min block, active filter + Show all | `npx vitest run tests/prague-calendar.test.ts tests/dispatch-calendar.test.tsx` | ❌ W0 |
| DISP-03 | Duration estimate parity after move to `lib/trip-duration.ts` | `npx vitest run tests/google-calendar-sync.test.ts` | ✅ |
| DISP-04 | Row/card/event open the same panel; Esc/close | `npx vitest run tests/booking-detail-panel.test.tsx tests/BookingsTable.test.tsx` | ❌ W0 / ✅ |
| DISP-04 | Extraction parity: existing table tests green | `npx vitest run tests/BookingsTable.test.tsx` | ✅ |
| DISP-05 | Poll hook 30 s, pause rules, visibility, stale drop | `npx vitest run tests/use-dispatch-bookings.test.tsx` | ❌ W0 |
| D-04 | View cookie parsers, `?view=` precedence, `?search=` | `npx vitest run tests/admin-shell-prefs.test.ts tests/bookings-workspace.test.tsx` | ✅ / ❌ W0 |
| ADM-03 | No colour literals in new files | `npx vitest run tests/admin-no-hardcoded-colors.test.ts` | ✅ |
| KPI | KPI fetch URLs unchanged | `npx vitest run tests/admin-bookings-kpi-decoupling.test.tsx` | ✅ (retarget) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/prague-calendar.test.ts` — DISP-03
- [ ] `tests/booking-moves.test.ts` — DISP-02
- [ ] `tests/admin-bookings-dispatch.test.ts` — DISP-01
- [ ] `tests/use-dispatch-bookings.test.tsx` — DISP-05
- [ ] `tests/dispatch-board.test.tsx`, `tests/dispatch-calendar.test.tsx`, `tests/booking-detail-panel.test.tsx`, `tests/complete-trip-dialog.test.tsx`, `tests/bookings-workspace.test.tsx`
- [ ] Spike: `DndContext` + one draggable/droppable under React 19 in jsdom
- [ ] `npm install @dnd-kit/core@6.3.1 @dnd-kit/utilities@3.2.2` (orchestrator runs it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop feel on desktop and touch | DISP-02 | Pointer physics not reproducible in jsdom; localhost admin login blocked by Upstash limiter | On deployed admin, drag cards between allowed/disallowed columns |
| Calendar in a non-Prague browser timezone | DISP-03 | Real browser TZ | Set OS/browser TZ to e.g. America/New_York, check midnight bookings |
| Live driver-step refresh | DISP-05 | Needs real driver app + deployed admin | Tap a driver step, watch board/calendar update within ~30 s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
