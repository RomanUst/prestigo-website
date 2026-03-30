---
phase: 4
slug: payment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.1 + @testing-library/react 16.3.2 |
| **Config file** | `prestigo/vitest.config.ts` |
| **Quick run command** | `cd prestigo && npx vitest run tests/booking-store.test.ts tests/Step6Payment.test.tsx` |
| **Full suite command** | `cd prestigo && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd prestigo && npx vitest run tests/booking-store.test.ts tests/Step6Payment.test.tsx`
- **After every plan wave:** Run `cd prestigo && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-STEP6-01 | TBD | 1 | STEP6-01 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-STEP6-02 | TBD | 1 | STEP6-02 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-STEP6-03 | TBD | 1 | STEP6-03 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-STEP6-04 | TBD | 1 | STEP6-04 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-STEP6-05 | TBD | 1 | STEP6-05 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-STEP6-06 | TBD | 1 | STEP6-06 | unit | `cd prestigo && npx vitest run tests/Step6Payment.test.tsx` | ❌ W0 | ⬜ pending |
| 4-PAY-01 | TBD | 1 | PAY-01 | unit | `cd prestigo && npx vitest run tests/create-payment-intent.test.ts` | ❌ W0 | ⬜ pending |
| 4-PAY-02 | TBD | 1 | PAY-02 | manual | `grep -r "STRIPE_SECRET_KEY" prestigo/components prestigo/app --include="*.tsx" --include="*.ts" \| grep -v api` | manual only | ⬜ pending |
| 4-PAY-03 | TBD | 1 | PAY-03 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | ❌ W0 | ⬜ pending |
| 4-PAY-04 | TBD | 1 | PAY-04 | unit | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prestigo/tests/Step6Payment.test.tsx` — stubs for STEP6-01 through STEP6-06 (describe blocks by req ID)
- [ ] `prestigo/tests/create-payment-intent.test.ts` — stubs for PAY-01 (amount conversion, clientSecret returned)
- [ ] `prestigo/tests/webhooks-stripe.test.ts` — stubs for PAY-03, PAY-04 (constructEvent mock, event dispatch)
- [ ] `prestigo/tests/confirmation-page.test.tsx` — stubs for store reset, type=quote rendering, booking reference display
- [ ] Stripe module mock — add to `prestigo/tests/setup.ts` or `vi.mock` in each Stripe test file

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| STRIPE_SECRET_KEY not in any client bundle | PAY-02 | Build-time secret isolation cannot be asserted in unit tests | `grep -r "STRIPE_SECRET_KEY" prestigo/components prestigo/app --include="*.tsx" --include="*.ts" \| grep -v api` — must return zero matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
