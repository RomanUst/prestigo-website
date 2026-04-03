---
phase: 19
slug: booking-status-workflow-operator-notes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest / React Testing Library (existing) |
| **Config file** | jest.config.js (if exists) or package.json scripts |
| **Quick run command** | `npm test -- --testPathPattern=bookings` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=bookings`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | BOOKINGS-07 | unit | `npm test -- --testPathPattern=bookings` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | BOOKINGS-07 | unit | `npm test -- --testPathPattern=bookings` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 1 | BOOKINGS-07 | manual | see Manual-Only | N/A | ⬜ pending |
| 19-02-01 | 02 | 2 | BOOKINGS-09 | unit | `npm test -- --testPathPattern=bookings` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 2 | BOOKINGS-09 | manual | see Manual-Only | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `__tests__/api/admin/bookings-patch.test.ts` — FSM transition validation and 422 rejection tests for BOOKINGS-07
- [ ] `__tests__/components/BookingsTable.notes.test.tsx` — notes debounce and auto-save tests for BOOKINGS-09

*Wave 0 creates test stubs so automated verification is possible from task 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status dropdown only shows valid next states in UI | BOOKINGS-07 | Requires browser interaction with table row expand | Open admin bookings, expand a pending booking, verify dropdown shows confirmed/cancelled only |
| Notes persist on page reload | BOOKINGS-09 | Requires browser reload to verify DB persistence | Type note in expanded row, wait 800ms for auto-save, reload page, verify note still present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
