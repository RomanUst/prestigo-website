---
phase: 16
slug: admin-ui-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x / vitest (Next.js project) |
| **Config file** | `package.json` jest config or `vitest.config.ts` |
| **Quick run command** | `npm run build -- --no-lint` (TypeScript compile check) |
| **Full suite command** | `npm run build && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build -- --no-lint`
- **After every plan wave:** Run `npm run build && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 0 | PRICING-01 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | PRICING-02 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-01-03 | 01 | 1 | PRICING-03 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-01-04 | 01 | 1 | PRICING-04 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | ZONES-01 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 1 | ZONES-02 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 1 | ZONES-03 | manual | See Manual-Only section | n/a | ⬜ pending |
| 16-03-01 | 03 | 1 | BOOKINGS-01 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-03-02 | 03 | 1 | BOOKINGS-02 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-03-03 | 03 | 2 | BOOKINGS-03 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-03-04 | 03 | 2 | BOOKINGS-04 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-03-05 | 03 | 2 | BOOKINGS-05 | manual | See Manual-Only section | n/a | ⬜ pending |
| 16-04-01 | 04 | 2 | STATS-01 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-04-02 | 04 | 2 | STATS-02 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-04-03 | 04 | 2 | STATS-03 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-04-04 | 04 | 2 | STATS-04 | build | `npm run build -- --no-lint` | ❌ W0 | ⬜ pending |
| 16-04-05 | 04 | 2 | STATS-05 | manual | See Manual-Only section | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install @vis.gl/react-google-maps terra-draw terra-draw-google-maps-adapter recharts @tanstack/react-table` — install all required packages before any component work
- [ ] Verify `package.json` contains all five new dependencies

*Wave 0 is package installation only — no test stubs needed as build checks serve as verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zone polygon draws and saves to DB, activates quoteMode | ZONES-03 | Requires browser + Google Maps API + real DB interaction | 1. Visit /admin/zones. 2. Click draw tool. 3. Draw polygon. 4. Click Save. 5. Verify zone appears in list. 6. Create test booking — confirm zone is applied. |
| Bookings table filter chips update results | BOOKINGS-05 | Requires browser interaction with filter state | 1. Visit /admin/bookings. 2. Click status chip "confirmed". 3. Verify table filters. 4. Click date filter. 5. Verify date range filters results. |
| Stats chart renders real monthly data | STATS-05 | Requires live DB data + visual inspection | 1. Visit /admin/stats. 2. Verify bar chart shows 12 months. 3. Verify KPI cards show non-zero values matching DB state. |
| Pricing change reflected in next quote | PRICING-04 | Requires end-to-end flow across admin + booking wizard | 1. Visit /admin/pricing. 2. Change a base price. 3. Save. 4. Open booking wizard. 5. Verify quote uses updated price. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
