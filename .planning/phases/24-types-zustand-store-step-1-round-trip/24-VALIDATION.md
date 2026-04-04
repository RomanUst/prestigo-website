---
phase: 24
slug: types-zustand-store-step-1-round-trip
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 + @testing-library/react ^16.3.2 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts tests/TripTypeTabs.test.tsx` |
| **Full suite command** | `cd prestigo && node_modules/.bin/vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts tests/TripTypeTabs.test.tsx`
- **After every plan wave:** Run `cd prestigo && node_modules/.bin/vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | RTFR-01 (SC-1) | unit | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts` | ✅ | ⬜ pending |
| 24-01-02 | 01 | 1 | RTFR-01 (SC-2) | unit | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts` | ✅ | ⬜ pending |
| 24-01-03 | 01 | 1 | RTFR-01 (SC-3) | unit | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts` | ✅ | ⬜ pending |
| 24-01-04 | 01 | 1 | RTFR-01 (SC-4) | unit | `cd prestigo && node_modules/.bin/vitest run tests/booking-store.test.ts` | ✅ | ⬜ pending |
| 24-01-05 | 01 | 1 | RTFR-01 (UI) | unit | `cd prestigo && node_modules/.bin/vitest run tests/TripTypeTabs.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `booking-store.test.ts` and `TripTypeTabs.test.tsx` both exist with `it.todo` stubs. The plan will implement these stubs as real tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual: "ROUND TRIP" tab renders with correct copper underline style when active | RTFR-01 | CSS visual assertion beyond unit test scope | Load booking wizard, select Round Trip, verify copper underline appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
