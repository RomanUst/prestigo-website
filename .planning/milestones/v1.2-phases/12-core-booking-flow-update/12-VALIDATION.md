---
phase: 12
slug: core-booking-flow-update
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run tests/pricing.test.ts tests/calculate-price.test.ts` |
| **Full suite command** | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/pricing.test.ts tests/calculate-price.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + all three smoke tests pass
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | PRICING-05 | unit | `npx vitest run tests/pricing.test.ts` | ✅ (stubs only) | ⬜ pending |
| 12-01-02 | 01 | 0 | PRICING-05 | unit | `npx vitest run tests/calculate-price.test.ts` | ✅ (stubs only) | ⬜ pending |
| 12-01-03 | 01 | 1 | PRICING-05 | unit | `npx vitest run tests/pricing.test.ts` | ✅ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | PRICING-06 | code review | Verify `unstable_cache` options.tags includes `'pricing-config'` | ❌ W0 | ⬜ pending |
| 12-01-05 | 01 | 1 | ZONES-04 | smoke | Manual: POST with coord outside test zone | ❌ Smoke test B (manual) | ⬜ pending |
| 12-01-06 | 01 | 1 | ZONES-05 | smoke | Manual: POST with empty zones table | ❌ Smoke test C (manual) | ⬜ pending |
| 12-02-01 | 02 | 2 | PRICING-05 | smoke | Manual: POST to endpoint, verify price matches seed values | ❌ Smoke test A (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/pricing.test.ts` — implement stubs for `calculatePrice(rates, ...)` with injected rates (covers PRICING-05 unit)
- [ ] `tests/calculate-price.test.ts` — implement stubs for zone check behavior (mock Supabase client)
- [ ] Smoke test zone fixture: SQL to INSERT a test polygon into `coverage_zones`, used in Smoke test B, deleted after

*Existing Vitest infrastructure is in place — only stub implementations and zone fixture are missing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Prices match hardcoded values after migration | PRICING-05 | Requires live Supabase + Next.js server; unstable_cache not available in Vitest | POST `/api/calculate-price` with known inputs; compare response prices to Phase 11 seed values |
| `quoteMode: true` when origin outside a test zone | ZONES-04 | Requires a real zone in DB and live endpoint | INSERT test polygon (Prague center), POST with coord outside it, verify `quoteMode: true`, DELETE zone |
| `quoteMode: false` when no zones defined | ZONES-05 | Requires empty `coverage_zones` table and live endpoint | Ensure no active zones in DB, POST request, verify `quoteMode` absent or false |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
