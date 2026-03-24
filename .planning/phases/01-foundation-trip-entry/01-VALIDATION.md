---
phase: 1
slug: foundation-trip-entry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + @testing-library/react 16.x |
| **Config file** | `prestigo/vitest.config.ts` — Wave 0 creates this |
| **Quick run command** | `cd prestigo && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd prestigo && npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd prestigo && npx vitest run && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-W0-01 | W0 | 0 | ARCH-01, ARCH-02 | unit | `cd prestigo && npx vitest run tests/booking-store.test.ts` | ❌ W0 | ⬜ pending |
| 1-W0-02 | W0 | 0 | ARCH-03 | type-check | `cd prestigo && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 1-W0-03 | W0 | 0 | WIZD-01, WIZD-04, WIZD-05 | unit | `cd prestigo && npx vitest run tests/BookingWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 1-W0-04 | W0 | 0 | WIZD-02 | unit | `cd prestigo && npx vitest run tests/ProgressBar.test.tsx` | ❌ W0 | ⬜ pending |
| 1-W0-05 | W0 | 0 | WIZD-03, STEP1-04, STEP1-07 | unit | `cd prestigo && npx vitest run tests/Step1TripType.test.tsx` | ❌ W0 | ⬜ pending |
| 1-W0-06 | W0 | 0 | STEP1-01 | unit | `cd prestigo && npx vitest run tests/TripTypeTabs.test.tsx` | ❌ W0 | ⬜ pending |
| 1-W0-07 | W0 | 0 | STEP1-02, STEP1-03 | unit | `cd prestigo && npx vitest run tests/AddressInput.test.tsx` | ❌ W0 | ⬜ pending |
| 1-W0-08 | W0 | 0 | STEP1-05, STEP1-06 | unit | `cd prestigo && npx vitest run tests/Stepper.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-01 | impl | 1 | ARCH-01, ARCH-02 | unit | `cd prestigo && npx vitest run tests/booking-store.test.ts` | ❌ W0 | ⬜ pending |
| 1-impl-02 | impl | 1 | ARCH-03 | type-check | `cd prestigo && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 1-impl-03 | impl | 2 | WIZD-01, WIZD-02 | unit | `cd prestigo && npx vitest run tests/BookingWizard.test.tsx tests/ProgressBar.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-04 | impl | 2 | WIZD-03, WIZD-04, WIZD-05 | unit | `cd prestigo && npx vitest run tests/BookingWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-05 | impl | 3 | STEP1-01 | unit | `cd prestigo && npx vitest run tests/TripTypeTabs.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-06 | impl | 3 | STEP1-02, STEP1-03 | unit | `cd prestigo && npx vitest run tests/AddressInput.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-07 | impl | 3 | STEP1-04, STEP1-07 | unit | `cd prestigo && npx vitest run tests/Step1TripType.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-08 | impl | 3 | STEP1-05, STEP1-06 | unit | `cd prestigo && npx vitest run tests/Stepper.test.tsx` | ❌ W0 | ⬜ pending |
| 1-impl-09 | impl | 4 | WIZD-06 | smoke | manual browser check | manual only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/vitest.config.ts` — Vitest config with jsdom environment, path aliases
- [ ] `prestigo/tests/setup.ts` — Testing Library setup file
- [ ] `prestigo/tests/booking-store.test.ts` — stubs for ARCH-01, ARCH-02
- [ ] `prestigo/tests/BookingWizard.test.tsx` — stubs for WIZD-01, WIZD-04, WIZD-05
- [ ] `prestigo/tests/ProgressBar.test.tsx` — stubs for WIZD-02
- [ ] `prestigo/tests/TripTypeTabs.test.tsx` — stubs for STEP1-01
- [ ] `prestigo/tests/AddressInput.test.tsx` — stubs for STEP1-02, STEP1-03 (Places API mocked)
- [ ] `prestigo/tests/Step1TripType.test.tsx` — stubs for WIZD-03, STEP1-04, STEP1-07
- [ ] `prestigo/tests/Stepper.test.tsx` — stubs for STEP1-05, STEP1-06
- [ ] Framework install: `cd prestigo && npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom`
- [ ] `.env.local` with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=placeholder` — required for dev build

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /book page renders BookingWizard in browser | WIZD-06 | Requires live browser + Next.js dev server | Run `npm run dev`, open `/book`, confirm wizard renders with Step 1 active |
| Google Places Autocomplete shows real suggestions | STEP1-02/03 | Requires live Google Maps API key | Set real API key in `.env.local`, type 3+ chars in origin field, verify dropdown appears |
| CSS fadeUp animation fires on step change | WIZD-05 | Animation timing requires visual verification | Click Next, observe step container fades up over ~0.3s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
