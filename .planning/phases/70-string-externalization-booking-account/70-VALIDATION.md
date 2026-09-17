---
phase: 70
slug: string-externalization-booking-account
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-04
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (see project testing patterns) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run <changed test files>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~TBD seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test files>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

> Nyquist coverage is real and lives in each PLAN.md. Every plan carries `<verify><automated>` commands on all three tasks (catalog-shape assertion → per-file/test assertion → wave test-slice + stub-sync). The rows below record the terminal per-wave `<automated>` slice command for each plan; the intermediate catalog/grep assertions are in the plans' Task 1/Task 2 `<verify>` and `<acceptance_criteria>` blocks. There is no separate upfront Wave 0 migration task — the `render()` → `renderWithIntl()` migration is performed incrementally, per plan, in each plan's final task (see Wave 0 Requirements below).

| Plan | Wave | Requirement | Terminal `<automated>` slice command (from PLAN.md final task) | Status |
|------|------|-------------|----------------------------------------------------------------|--------|
| 70-01 | 1 | STR-02 | `npx vitest run tests/EntryBar.test.tsx` (+ 6-stub `cmp -s` sync) | ⬜ pending |
| 70-02 | 2 | STR-02 | `npx vitest run tests/login-actions.test.ts tests/auth-customer.test.ts tests/auth-callback.test.ts` (+ stub sync) | ⬜ pending |
| 70-03 | 3 | STR-02 | `npx vitest run tests/TripTypeTabs.test.tsx tests/AddressInput.test.tsx tests/DurationSelector.test.tsx tests/StopList.test.tsx tests/StopItem.test.tsx tests/RouteMap.test.tsx tests/ProgressBar.test.tsx tests/Stepper.test.tsx` (+ stub sync) | ⬜ pending |
| 70-04 | 4 | STR-02 | `npx vitest run tests/VehicleSlideshow.test.tsx tests/StickyBookingPanel.test.tsx tests/Step3Vehicle.test.tsx` (+ stub sync) | ⬜ pending |
| 70-05 | 5 | STR-02 | `npx vitest run tests/PriceSummary.test.tsx tests/BookingSummaryBlock.test.tsx tests/Step4Extras.test.tsx tests/BookingWidget.test.tsx tests/BookingWizard.test.tsx` (+ stub sync) | ⬜ pending |
| 70-06 | 6 | STR-02 | `npx vitest run tests/Step1TripType.test.tsx tests/Step2DateTime.test.tsx tests/Step5Passenger.test.tsx tests/Step6Payment.test.tsx` (+ stub sync) | ⬜ pending |
| 70-07 | 7 | STR-02 | `npx vitest run tests/MultiDayForm.test.tsx tests/DayCard.test.tsx tests/Step3Auth.test.tsx` (+ stub sync) | ⬜ pending |
| 70-08 | 8 | STR-02 | phase gate: `npx vitest run && npm run build && test $(grep -rn "First Class" …) -eq 0` (full suite + build + residual-literal check) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

There is **no separate upfront Wave 0 task** for this phase. The `render()` → `renderWithIntl()` migration flagged in RESEARCH.md (~10+ booking/account test files) is performed **incrementally, per plan**, alongside the strings it covers — each plan's final task swaps the bare `render` import for the aliased `renderWithIntl` in exactly the test files that plan touches, then runs that wave's test slice:

- Wave 1 (70-01 Task 2/3): `tests/EntryBar.test.tsx`
- Wave 2 (70-02 Task 3): `login-actions`, `auth-customer`, `auth-callback`
- Wave 3 (70-03 Task 3): TripTypeTabs, AddressInput, DurationSelector, StopList, StopItem, RouteMap, ProgressBar, Stepper
- Wave 4 (70-04 Task 3): VehicleSlideshow, StickyBookingPanel, Step3Vehicle
- Wave 5 (70-05 Task 3): PriceSummary, BookingSummaryBlock, Step4Extras, BookingWidget, BookingWizard
- Wave 6 (70-06 Task 3): Step1TripType, Step2DateTime, Step5Passenger, Step6Payment
- Wave 7 (70-07 Task 3): MultiDayForm, DayCard, Step3Auth
- Wave 8 (70-08 Task 2/3): account/profile tests + full-suite phase gate

The catalog helper (`tests/helpers/renderWithIntl.tsx`) and `NextIntlClientProvider` wiring already exist from Phase 69, so no scaffolding task is required before Wave 1. Because every migration step is co-located with a real `<automated>` verify, Nyquist sampling is satisfied per-wave rather than in one upfront batch.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| _(filled by planner)_ | STR-02 | | |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

> **Note on `nyquist_compliant`:** Held at `false` in frontmatter **only** as a lifecycle marker — it is flipped to `true` after the 70-08 Wave 8 phase gate (`npx vitest run && npm run build && residual-literal check`) passes green, per the validate-phase §6 lifecycle. This is **not** a Nyquist gap: every plan (70-01…70-08) already carries real `<automated>` verify commands on all three tasks and migrates its own test files per-wave (see Per-Task Verification Map and Wave 0 Requirements above). Substance-wise Nyquist coverage is met today; the flag flips on final phase-gate sign-off.

**Approval:** pending
