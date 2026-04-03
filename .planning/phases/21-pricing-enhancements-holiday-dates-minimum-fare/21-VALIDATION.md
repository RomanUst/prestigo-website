---
phase: 21
slug: pricing-enhancements-holiday-dates-minimum-fare
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (jsdom environment) |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts` |
| **Full suite command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts`
- **After every plan wave:** Run `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 0 | PRICING-07, PRICING-08 | unit stub | `npx vitest run tests/pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 0 | PRICING-07, PRICING-08 | unit stub | `npx vitest run tests/admin-pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | PRICING-08 | unit | `npx vitest run tests/pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-02 | 02 | 1 | PRICING-07 | unit | `npx vitest run tests/pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-03 | 02 | 1 | PRICING-07 | unit | `npx vitest run tests/pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-03-01 | 03 | 2 | PRICING-07, PRICING-08 | unit | `npx vitest run tests/admin-pricing.test.ts` | ❌ W0 | ⬜ pending |
| 21-04-01 | 04 | 3 | PRICING-07, PRICING-08 | manual | N/A — admin UI | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New `describe('PRICING-07: Holiday date detection', ...)` block in `tests/pricing.test.ts`
  - `isHolidayDate('2026-12-25', ['2026-12-25'])` returns `true`
  - `isHolidayDate('2026-12-26', ['2026-12-25'])` returns `false`
  - `isHolidayDate(null, ['2026-12-25'])` returns `false`
  - Holiday coefficient applied in `applyGlobals` when `isHoliday=true`
- [ ] New `describe('PRICING-08: Minimum fare enforcement', ...)` block in `tests/pricing.test.ts`
  - Price raised to `minFare` when calculated price < `minFare`
  - Price unchanged when calculated price >= `minFare`
- [ ] Updated `validPutBody` fixture in `tests/admin-pricing.test.ts` to include `holiday_dates` and `min_fare`

*(Existing test files present — add new describe blocks, do not overwrite existing tests.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator sees holiday date add/remove UI in admin | PRICING-07 | React UI interaction | Open admin pricing page, add a date, verify it appears in list, save, reload — date persists |
| Operator sees min_fare column in admin pricing table | PRICING-08 | React UI interaction | Open admin pricing page, find per-class rate table, verify min_fare input present, change value, save, reload — value persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
