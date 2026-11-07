---
phase: "89"
slug: "cancellation-policy-cash-guarantee-no-show"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-06"
signed: "2026-11-07"
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Signed in plan 89-19 (Task 1).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run <touched tests>` |
| **Full suite command** | `npx vitest run` |
| **Type check** | `npx tsc --noEmit` (baseline: 8 old errors, all under `tests/`) |
| **Estimated runtime** | ~90 seconds on the main checkout |

---

## Sampling Rate

- **After every task commit:** the quick run command on the touched tests
- **After every plan wave:** the full suite command
- **Before `/gsd-verify-work`:** full suite green, `npx tsc --noEmit` at the baseline, eslint clean on the touched files
- **Max feedback latency:** 90 seconds

---

## Per-Requirement Verification Map

Every row names a command that exits non-zero when the behaviour breaks. The lifecycle file drives the real route
handlers over the in-memory payments database and the fake Stripe (no engine function is replaced); the unit files pin
each module on its own.

| Requirement | Plans | Secure behaviour (threat) | Test type | Automated command | Status |
|-------------|-------|---------------------------|-----------|-------------------|--------|
| HOLD-06 cancel releases or keeps money by the stored policy | 02, 08, 15, 27, 28 | late cancel never releases or refunds (D-07); in-time cancel voids the hold (T-89-26) | unit + lifecycle | `npx vitest run tests/payments-cancel.test.ts tests/payments-cancel-notices.test.ts tests/admin-bookings-cancel.test.ts tests/payments-policy-lifecycle.test.ts` | green |
| HOLD-06 stored terms decide, today's settings do not | 03, 07 | stale page learns the current outcome and cancels nothing (T-89-27) | unit | `npx vitest run tests/cancellation-policy.test.ts tests/booking-policy-snapshot.test.ts tests/card-checkout-intent.test.ts` | green |
| CANC-01 free window and fee percent are configurable | 03, 07 | thresholds validated, a bad value falls back | unit | `npx vitest run tests/cancellation-policy-settings.test.tsx tests/no-show-wait-settings.test.tsx tests/admin-settings.test.ts` | green |
| CANC-01 manage link: read-only GET, acknowledged POST | 02, 15, 28 | token in the body, one 404 for every bad token, no-referrer (T-89-50, T-89-51) | unit + lifecycle | `npx vitest run tests/manage-link.test.ts tests/manage-booking.test.ts tests/manage-page.test.tsx tests/manage-actions.test.tsx tests/private-link-paths.test.tsx tests/next-config-headers.test.ts` | green (see note 1) |
| CASH-01 pay cash to the driver: card saved, no hold | 10, 11 | the tick never claims a cash row (T-89-34) | unit + lifecycle | `npx vitest run tests/card-checkout-cash.test.ts tests/Step6CardOnFile.test.tsx tests/payments-policy-lifecycle.test.ts` | green |
| CASH-02 no-show only after the free wait | 09, 14 | server-side wait from database facts, the client timer is display only (D-15) | unit + lifecycle | `npx vitest run tests/driver-no-show.test.ts tests/admin-no-show.test.ts tests/admin-no-show-confirm.test.ts tests/payments-policy-lifecycle.test.ts` | green |
| CASH-03 operator charges up to 100 %, evidence stored, once | 06, 12, 13, 16, 17, 25, 26 | amount locked on the case, keys derive from case and attempt, never from the amount (T-89-21) | unit + lifecycle | `npx vitest run tests/payments-fee.test.ts tests/admin-fee-route.test.ts tests/payments-fee-webhook.test.ts tests/payments-settle.test.ts tests/payments-failure.test.ts tests/payments-policy-lifecycle.test.ts` | green |
| CASH-04 cash settled by driver or operator, reversible | 12, 14, 17 | note mandatory on reversal; keyed events make the second confirmation distinct (D-22) | unit + lifecycle | `npx vitest run tests/payments-cash.test.ts tests/driver-trip-cash.test.ts tests/admin-cash-panel.test.tsx tests/payments-policy-lifecycle.test.ts` | green |
| Criterion 5 partner booking refused before Stripe or token work | all | assumption-delta invariant over the new entry points | gate + lifecycle | `npx vitest run tests/payments-engine-gates.test.ts tests/payments-policy-lifecycle.test.ts` | green |
| Single writers of payment state and booking status | 01, 08, 12 | one writer per column | gate | `npx vitest run tests/payment-state-writers-gate.test.ts tests/status-writers-gate.test.ts` | green |
| Schema 087 and erasure of the new tables | 01, 05 | deny-all tables, erasure anonymises consents | migration | `npx vitest run tests/payments-migration-087.test.ts tests/erasure-migration.test.ts tests/erasure-payment-pii.test.ts` | green |
| CANC-02 policy shown in the confirmation email, mails and manage page, 7 locales | 04, 18, 25, 28 | one wording per locale from one table, no typed amount | unit | `npx vitest run tests/payments-copy-i18n.test.ts tests/email-policy-block.test.ts tests/confirmation-page-i18n.test.tsx tests/i18n-completeness.test.ts` | green |
| CANC-02 policy at checkout and in the terms | 20, 21, 24 | public wording | later plans | not part of the dark deploy; plans 89-20, 89-21 and 89-24 add their own rows | pending (by design) |

---

## Wave 0 Requirements

- [x] `tests/helpers/fake-stripe.ts` and `tests/helpers/fake-payments-db.ts` (Phase 88) model the Phase 89 tables, the partial capture, the declines and the lapsed hold
- [x] `tests/payments-policy-lifecycle.test.ts` — the three lifecycles and the partner table (this plan)
- [x] `tests/payments-engine-gates.test.ts` — extended with the partner gate and the typed-amount gate over the files Phase 89 added

Existing infrastructure covers every other requirement.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production deploy leaves public terms unchanged | HOLD-06, CANC-02 | needs the live site and the live database | Task 2 of plan 89-19: flag value before and after, count of stored policies outside the owner's address is 0, curl checks on `/manage/not-a-token` |
| The owner's own test of a late cancel and a cash booking on production | CANC-01, CASH-01..04 | needs a live card and the owner's canary address (D-17) | after the dark deploy, with the flag closed |

---

## Notes

1. Four test files import `next-intl/server` modules (`manage-actions`, `manage-page`, `passenger-actions`, `profile-actions` among them). They fail inside a git worktree that links `node_modules` from the main checkout (module resolution through the symlink) and pass on the main checkout. The orchestrator re-runs them there before the merge.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] nyquist_compliant set to true in the frontmatter

**Approval:** approved 2026-11-07
