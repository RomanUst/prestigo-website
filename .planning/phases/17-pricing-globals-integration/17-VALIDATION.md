---
phase: 17
slug: pricing-globals-integration
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-02
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && nvm use 22 && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts` |
| **Full suite command** | `cd prestigo && nvm use 22 && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/pricing.test.ts tests/admin-pricing.test.ts`
- **After every plan wave:** Run full suite + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green + `tsc --noEmit` passes
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-T1 | 01 | 1 | PRICING-06 | build | `cd prestigo && npx tsc --noEmit` | ✅ | ✅ green |
| 17-01-T2 | 01 | 1 | PRICING-03, PRICING-04 | unit | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ | ✅ green |
| 17-02-T1 | 02 | 2 | PRICING-03 | unit | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ | ✅ green |
| 17-02-T2 | 02 | 2 | PRICING-03, PRICING-04 | unit | `cd prestigo && npx vitest run tests/pricing.test.ts` | ✅ | ✅ green |
| 17-02-T3 | 02 | 2 | PRICING-03 | unit | `cd prestigo && npx vitest run tests/admin-pricing.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.
- `prestigo/tests/pricing.test.ts` — extend with globals test cases (no new file needed)
- `prestigo/tests/admin-pricing.test.ts` — extend with isAirport bookingData test case (no new file needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Airport fee applied in booking wizard UI (price display) | PRICING-03 | Requires running dev server + Google Maps API key | Load /admin/pricing, set airport_fee to 200, save. Open booking wizard, select airport pickup, advance to Step 3 — price should include +200 CZK vs non-airport. |
| Night coefficient applied to price | PRICING-04 | Requires running dev server with specific pickup time | Set night_coefficient to 1.5. Book a transfer with pickup time 23:00 — price should be 1.5× base rate vs daytime. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-02 — all tasks green, 21/21 tests passing, build clean
