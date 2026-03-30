---
phase: 6
slug: homepage-widget-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/BookingWidget.test.tsx`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | HOME-01 | unit | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx -t "renders"` | ❌ Wave 0 | ⬜ pending |
| 06-01-02 | 01 | 1 | HOME-02 | unit | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx -t "fields"` | ❌ Wave 0 | ⬜ pending |
| 06-01-03 | 01 | 1 | HOME-03 | unit | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx -t "CTA"` | ❌ Wave 0 | ⬜ pending |
| 06-01-04 | 01 | 1 | UX-04 | unit | `cd prestigo && npx vitest run tests/BookingWidget.test.tsx -t "aria"` | ❌ Wave 0 | ⬜ pending |
| 06-02-01 | 02 | 2 | UX-01 | manual | Browser devtools at 375px viewport | manual-only | ⬜ pending |
| 06-02-02 | 02 | 2 | UX-02 | manual | Browser devtools sticky/fixed visual check | manual-only | ⬜ pending |
| 06-02-03 | 02 | 2 | UX-03 | manual | iOS Safari or Chrome mobile emulation | manual-only | ⬜ pending |
| 06-02-04 | 02 | 2 | UX-05 | manual | Tab key navigation in browser | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/BookingWidget.test.tsx` — stubs for HOME-01, HOME-02, HOME-03, UX-04 (aria tests)
  - Mock `useRouter` from `next/navigation`
  - Mock `useBookingStore` or use real store in test
  - Follow `.tsx` for React component tests (established pattern)
  - Follow `describe('HOME-01', () => { ... })` pattern per project convention

*Note: Check existing `AddressInput.test.tsx`, `TripTypeTabs.test.tsx`, `Stepper.test.tsx` for any existing aria-label tests that may partially cover UX-04.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No overflow at 375px | UX-01 | CSS layout not testable in jsdom | Chrome DevTools → device emulation → 375px → check all wizard steps |
| PriceSummary sticky desktop / fixed mobile | UX-02 | Sticky/fixed positioning not testable in jsdom | Check Step 3 on desktop (sticky) and mobile 375px (fixed bar) |
| CTA buttons above keyboard on mobile | UX-03 | Requires real device or OS-level keyboard emulation | iOS Safari or Chrome Android emulation; tap address field, verify CTA bar still visible |
| Keyboard tab order through all steps | UX-05 | Tab order not reliably testable in jsdom | Tab through each step manually; verify logical DOM order, no skipped/trapped focus |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
