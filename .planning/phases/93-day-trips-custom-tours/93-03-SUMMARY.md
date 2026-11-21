---
phase: 93-day-trips-custom-tours
plan: 03
subsystem: booking-payments
tags: [stripe, card-checkout, refactor, consent, tour-checkout]
requires: []
provides:
  - "components/booking/CardPaymentStage.tsx: CardPaymentStage, PaymentChoiceTiles, CardPaymentStageProps (store-agnostic card / cash stage)"
  - "tests/card-payment-stage.test.tsx: proof the stage runs on injected callbacks with no wizard store"
affects: [93-18 tour checkout]
tech-stack:
  added: []
  patterns: ["payment UI as a controlled, store-agnostic stage; caller supplies trip body, attempt lifecycle, invalid-phone and after-confirm hooks"]
key-files:
  created:
    - components/booking/CardPaymentStage.tsx
    - tests/card-payment-stage.test.tsx
  modified:
    - components/booking/steps/Step6CardOnFile.tsx
    - tests/confirmation-page-i18n.test.tsx
    - tests/payments-engine-gates.test.ts
decisions:
  - "attempt prop gains an optional renew(); a caller that passes its own attempt without renew gets a no-op, never the wizard store"
  - "reiniting prop added: the wizard keeps the currency/promo re-init, the stage shows the loading line, clears and announces the tick"
  - "source-grep gates retargeted to CardPaymentStage.tsx (moved code); Step6CardOnFile.test.tsx and Step6Payment.test.tsx untouched"
metrics:
  duration: "about 25 min"
  completed: 2026-11-18
status: complete
commits: 2
plan_head_before: 22c3ca2ff23902275bffa2d2dd82de7829a07e34
plan_head_after: 3ddfdd39ed9512350a336599e66b00420289a225
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 93 Plan 03: CardPaymentStage extraction Summary

The Phase 88/89 card / cash payment UI is now one store-agnostic `CardPaymentStage` that both the transfer wizard and the upcoming tour checkout (93-18) render; the wizard behaves as before.

## What changed

- `components/booking/CardPaymentStage.tsx` (new): CardForm, PaymentChoiceTiles (exported), the explainer + CancellationPolicyNote + consent + Elements block, and their helpers moved unchanged in markup, copy keys (`Booking.step6.*`, consent text still hashed from the same keys) and behaviour. The three wizard-store reads are props: `buildIntentBody(attemptId)` (trip part of the intent body, sent as `{ ...buildIntentBody(id), currency, mode, payment, consent: true, displayedAmountMinor, displayedHoldDateIso, displayedFreeUntilIso, displayedFreeUntilPassed }`), `onInvalidPhone()`, and `onConfirmed({ ref, cashLabel })` (runs after the purchase snapshot, before `writeConfirmationNotice` and navigation). The file contains no `booking-store` import and no amount from the trip part.
- `components/booking/steps/Step6CardOnFile.tsx`: thin wizard wrapper (summary, promo, currency switch, re-init, GA4 total) that renders `CardPaymentStage`; re-exports `PaymentChoice`, `SUPPORTED_MODES`, `SlotMessage`.
- `tests/card-payment-stage.test.tsx`: 6 cases (body shape, INVALID_PHONE, onConfirmed ordering for card and cash, consent unticked on mount and after card/cash switches, wizard-store mock that throws is never touched).

## Verification

- `tests/Step6CardOnFile.test.tsx`, `tests/Step6Payment.test.tsx`, `tests/cancellation-policy-note.test.tsx`, `tests/confirmation-page-i18n.test.tsx`, `tests/payments-engine-gates.test.ts`, `tests/quote-accept-pay.test.tsx`: 310 passed, 20 todo.
- `tests/card-payment-stage.test.tsx`: 6 passed.
- `npx tsc --noEmit`: 8 errors, all in the old `tests/` baseline, none in the touched files. `npx eslint --quiet` clean on the touched files.
- `git diff` on `tests/Step6CardOnFile.test.tsx` and `tests/Step6Payment.test.tsx`: empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Source-grep gate tests pointed at the moved code**
- **Found during:** Task 1
- **Issue:** `tests/confirmation-page-i18n.test.tsx` (notice written before the redirect, cash amount via formatMinor) and `tests/payments-engine-gates.test.ts` (no typed euro amount) read `Step6CardOnFile.tsx` source; the code they guard now lives in `CardPaymentStage.tsx`.
- **Fix:** the confirmation test reads `CardPaymentStage.tsx` (same regex and ordering assertions); the euro gate adds `CardPaymentStage.tsx` to its file list (Step6CardOnFile stays listed).
- **Files modified:** tests/confirmation-page-i18n.test.tsx, tests/payments-engine-gates.test.ts
- **Commit:** cbf6bb6e

**2. [Rule 2 - Missing critical] attempt.renew and reiniting props**
- **Found during:** Task 1
- **Issue:** the plan's `attempt { ensure, mark }` could not cover `startNewAttempt()` (payment switch, ATTEMPT_CLOSED), which also lives in the wizard store, and the wizard's re-init needs the tick cleared and announced while the form unmounts.
- **Fix:** optional `attempt.renew` (default: wizard `startNewAttempt`; no-op when a caller supplies its own `attempt` without it) and an optional `reiniting` prop that shows the loading line and clears and announces the tick. Behaviour for the wizard is identical.
- **Commit:** cbf6bb6e

## Known Stubs

None.

## Threat Flags

None. T-93-07 (consent, displayed-terms cross-check) kept: consent unticked on mount and switch, displayedFreeUntil / displayedHoldDate still sent; regression tests green. T-93-08: the stage adds no amount; the intent route is unchanged.

## Notes for the orchestrator

- Full suite in the worktree: 11 files fail, none touch the payment stage. Eight are the known worktree vi.mock load errors (account-trips, auth-customer, login-actions, manage-actions, manage-page, passenger-actions, profile-actions, quote-page); quote-builder, seo-volume-pages and use-booking-moves failed on unrelated assertions (admin quote / SEO route lists / driver moves). The orchestrator should re-run the full suite in the main checkout after merge. Payment-related files all pass. Re-run `tests/Step6CardOnFile.test.tsx tests/card-payment-stage.test.tsx` in the main checkout after merge as a precaution.
- Plan 93-18 should pass its own `attempt` (with `renew`) and a `buildIntentBody` for the tour; the stage never reads a store.

## Self-Check: PASSED

- components/booking/CardPaymentStage.tsx: FOUND
- tests/card-payment-stage.test.tsx: FOUND
- commits cbf6bb6e, 3ddfdd39: FOUND
