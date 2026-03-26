---
phase: 3
slug: booking-details
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | STEP4-01, STEP4-02, STEP4-03 | unit stub | `cd prestigo && npx vitest run tests/Step4Extras.test.tsx` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | STEP5-01, STEP5-02, STEP5-03, STEP5-04 | unit stub | `cd prestigo && npx vitest run tests/Step5Passenger.test.tsx` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | STEP4-01 | unit | `cd prestigo && npx vitest run tests/Step4Extras.test.tsx` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | STEP4-02 | unit | `cd prestigo && npx vitest run tests/Step4Extras.test.tsx` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | STEP4-03 | unit | `cd prestigo && npx vitest run tests/PriceSummary.test.tsx` | ✅ (stubs) | ⬜ pending |
| 3-03-01 | 03 | 2 | STEP5-01 | unit | `cd prestigo && npx vitest run tests/Step5Passenger.test.tsx` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | STEP5-02 | unit | `cd prestigo && npx vitest run tests/Step5Passenger.test.tsx` | ❌ W0 | ⬜ pending |
| 3-03-03 | 03 | 2 | STEP5-03 | unit | `cd prestigo && npx vitest run tests/Step5Passenger.test.tsx` | ❌ W0 | ⬜ pending |
| 3-03-04 | 03 | 2 | STEP5-04 | unit | `cd prestigo && npx vitest run tests/Step5Passenger.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/Step4Extras.test.tsx` — stubs for STEP4-01, STEP4-02, STEP4-03
- [ ] `prestigo/tests/Step5Passenger.test.tsx` — stubs for STEP5-01, STEP5-02, STEP5-03, STEP5-04
- [ ] `prestigo/tests/PriceSummary.test.tsx` — add STEP4-03 extras total stub (file exists, needs extension)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extras toggle price visually updates in PriceSummary | STEP4-03 | Visual price display | Toggle each extra, confirm total increases/decreases in the mobile bar and sidebar |
| Validation error appears on blur only (not on page load) | STEP5-04 | Timing / UX behavior | Tab through each field without input, verify error appears only after leaving the field |
| Flight Number field conditionally appears for airport routes | STEP5-02 | Conditional UI render | Book with PRG as origin, confirm Flight Number appears; book non-airport, confirm it's hidden |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
