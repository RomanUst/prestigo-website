---
phase: 25
slug: pricing-engine-step-2-step-3
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x + @testing-library/react |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -20` |
| **Full suite command** | `cd prestigo && npx vitest run 2>&1` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `cd prestigo && npx vitest run 2>&1`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | RTFR-02 | unit | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 25-01-02 | 01 | 1 | RTFR-02 | unit | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 25-02-01 | 02 | 1 | RTPR-01, RTPR-02 | unit | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 25-02-02 | 02 | 1 | RTPR-03 | unit | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -20` | ✅ | ⬜ pending |
| 25-03-01 | 03 | 2 | RTFR-03, RTFR-04 | unit+manual | `cd prestigo && npx vitest run --reporter=verbose 2>&1 \| tail -20` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Phase 24 already installed vitest + @testing-library/react with passing tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Return datetime < pickup datetime shows inline error and blocks Continue | RTFR-02 | Requires browser interaction with live date/time pickers | 1. Select Round Trip. 2. In Step 2, set return date before pickup date. 3. Confirm inline error appears and Continue is disabled. |
| Step 3 combined price updates live when switching vehicle class | RTFR-03 | Requires JavaScript rendering of computed totals | 1. Reach Step 3 with round_trip selected. 2. Click each vehicle card. 3. Confirm three-line price (outbound / return / combined) updates for each class. |
| quoteMode disables Round Trip option in Step 1 | RTPR-03 | Requires out-of-zone origin/destination in browser | 1. Enter an address outside coverage zones. 2. Confirm Round Trip option in TripTypeTabs is disabled with explanatory message. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
