---
phase: 22
slug: mobile-admin-promo-code-system
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | PROMO-01 | integration | `npx vitest run prestigo/tests/admin-promo-codes.test.ts` | Plan 01 Task 1 creates | ⬜ pending |
| 22-01-02 | 01 | 1 | PROMO-01 | integration | `npx vitest run prestigo/tests/admin-promo-codes.test.ts` | Plan 01 Task 1 creates | ⬜ pending |
| 22-02-00 | 02 | 0 | UX-01 | unit (component) | `npx vitest run prestigo/tests/AdminSidebar.test.tsx prestigo/tests/BookingsTable.test.tsx` | Plan 02 Task 0 creates | ⬜ pending |
| 22-02-01 | 02 | 1 | UX-01 | unit (component) | `npx vitest run prestigo/tests/AdminSidebar.test.tsx` | Plan 02 Task 0 creates | ⬜ pending |
| 22-02-02 | 02 | 1 | UX-01 | unit (component) | `npx vitest run prestigo/tests/BookingsTable.test.tsx` | Plan 02 Task 0 creates | ⬜ pending |
| 22-03-01 | 03 | 1 | PROMO-03, PROMO-04 | integration | `npx vitest run prestigo/tests/validate-promo.test.ts prestigo/tests/create-payment-intent.test.ts` | Plan 03 Task 1 creates | ⬜ pending |
| 22-03-02 | 03 | 1 | PROMO-03 | type check | `npx tsc --noEmit` | — | ⬜ pending |
| 22-04-01 | 04 | 2 | UX-01 | manual | visual inspection at 375px | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `prestigo/tests/AdminSidebar.test.tsx` — component test for hamburger button render + Promos nav link (UX-01) — created in Plan 02 Task 0
- [x] `prestigo/tests/BookingsTable.test.tsx` — component test for mobile card layout conditional render (UX-01) — created in Plan 02 Task 0
- [x] `prestigo/tests/admin-promo-codes.test.ts` — covers PROMO-01, PROMO-02, PROMO-04 — created in Plan 01 Task 1
- [x] `prestigo/tests/validate-promo.test.ts` — covers PROMO-03 soft validation endpoint — created in Plan 03 Task 1

*Existing vitest infrastructure is in place — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin panel sidebar collapses to hamburger at 375px | UX-01 | Requires browser resize visual check | Resize browser to 375px, verify sidebar collapses to hamburger icon, tap icon, verify sidebar opens as overlay |
| All interactive elements meet 44px touch targets | UX-01 | Requires DevTools touch target inspection | Use Chrome DevTools mobile emulator, verify buttons/links are >=44px |
| Bookings table switches to card layout below 768px | UX-01 | Requires browser resize visual check | Resize browser to 767px, verify table is hidden and card list is shown |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
