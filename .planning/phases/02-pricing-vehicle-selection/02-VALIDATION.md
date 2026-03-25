---
phase: 2
slug: pricing-vehicle-selection
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (Wave 0 installs if absent) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | STEP2-01 | unit | `npx vitest run src/lib/pricing` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | PRICE-01, PRICE-02 | unit | `npx vitest run src/lib/pricing` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | PRICE-03, PRICE-04 | unit | `npx vitest run src/lib/pricing` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | STEP2-02, STEP2-03 | unit | `npx vitest run src/components` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | STEP3-01, STEP3-02 | unit | `npx vitest run src/components` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | STEP3-03, STEP3-04 | unit | `npx vitest run src/components` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | PRICE-05, PRICE-06 | unit | `npx vitest run src/api` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | STEP3-05 | manual | N/A — API key visibility check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/pricing/__tests__/pricing.test.ts` — stubs for PRICE-01 through PRICE-06 (base fare, distance multiplier, unmappable fallback)
- [ ] `src/components/__tests__/DateTimePicker.test.tsx` — stubs for STEP2-01 through STEP2-03 (past dates blocked, 15-min increments)
- [ ] `src/components/__tests__/VehicleCard.test.tsx` — stubs for STEP3-01 through STEP3-04 (vehicle display, real-time price update)
- [ ] `src/api/__tests__/distance.test.ts` — stubs for PRICE-05, PRICE-06 (server-side Maps API proxy)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google Maps API key not visible in browser network requests | STEP3-05 | Requires browser DevTools network inspection | Open DevTools → Network tab → trigger route calculation → verify no request from client contains API key |
| "Request a quote" shown for unmappable route | PRICE-06 | Requires a real unmappable route scenario | Enter an origin/destination with no valid road route → verify price panel shows "Request a quote" text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
