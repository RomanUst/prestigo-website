---
phase: 53
slug: driver-assignment-ui
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | prestigo/vitest.config.ts |
| **Quick run command** | `cd prestigo && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd prestigo && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd prestigo && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | DRIVER-ASSIGN-01 | — | Migration adds driver_id FK nullable | migration | `supabase db push` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 1 | DRIVER-ASSIGN-01 | — | DriverAssignmentSection returns null for completed/cancelled | unit | `cd prestigo && npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 53-01-03 | 01 | 1 | DRIVER-ASSIGN-02 | — | assign endpoint sets driver_id + status=assigned | unit | `cd prestigo && npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 53-01-04 | 01 | 1 | DRIVER-ASSIGN-02 | — | GNet push fires for gnet-sourced bookings on first assign | unit | `cd prestigo && npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/admin-assignment.test.ts` — covers DRIVER-ASSIGN-01, DRIVER-ASSIGN-02 (assign endpoint + GNet push)
- [x] `tests/DriverAssignmentSection.test.tsx` — null-guard render, bookingStatus prop, onAssigned callback

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Optimistic update in BookingsTable after assign | DRIVER-ASSIGN-01 | Requires browser interaction | Assign driver, verify row status changes without page reload |
| GNet push logged in gnet_bookings table | DRIVER-ASSIGN-02 | Requires live Supabase + GNet stub | Assign driver to gnet booking, query gnet_bookings for new row |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
