---
phase: 88-card-on-file-scheduled-holds
plan: 10
subsystem: payments
tags: [card-on-file, checkout-ui, stripe-elements, setup-intent, consent, i18n]

requires:
  - phase: 88-03
    provides: Booking.step6.cardOnFile catalog (7 locales), consentMessageKey / consentVars, formatMinor
  - phase: 88-06
    provides: POST /api/card-checkout/init (opaque eligibility, mode, exact hold date, server amount)
  - phase: 88-08
    provides: POST /api/card-checkout/intent (setup mode, consent record, SetupIntent client secret)
provides:
  - "Step6Checkout: init gate rendering Step6CardOnFile or the unchanged legacy Step6Payment"
  - "Step6CardOnFile: save-card step (explainer, unticked consent, deferred-intent Elements, confirmSetup) with every error / notice state"
  - "CardPaymentExplainer, PromoCodeField, cardCheckoutApi (buildCardCheckoutBody, fetchCardInit, attempt helpers)"
  - "BookingWizard step 6 renders Step6Checkout"
affects: [88-12 hold_now mode (extends SUPPORTED_MODES and Elements options), 88-17 canary UAT]

actuals:
  tokens: 60000
  tasks: 2
  commits: 2
plan_head_before: affd571619d2c4950c216d42c59ce41ab7f5f6b0
plan_head_after: 97ebd4cc26055c6f539c0a1484bd7b5e7b1b538d

tech-stack:
  added: []
  patterns:
    - "Outer component owns what survives an Elements remount (init result, promo / currency, notice slot, live region); the form inside <Elements key> owns the consent tick so a remount can never carry it over"
    - "Fail open: any init failure renders the legacy step with no error shown"

key-files:
  created:
    - components/booking/steps/Step6Checkout.tsx
    - components/booking/steps/Step6CardOnFile.tsx
    - components/booking/steps/PromoCodeField.tsx
    - components/booking/steps/cardCheckoutApi.ts
    - components/booking/CardPaymentExplainer.tsx
    - tests/Step6CardOnFile.test.tsx
  modified:
    - components/booking/BookingWizard.tsx

key-decisions:
  - "One flow per attempt (88-08 follow-up): the card step marks the attemptId in sessionStorage (prestigo-card-attempt) right before the first intent POST; whenever the gate hands over to the legacy Step6Payment (init fallback or onFallback) and the current attemptId carries that marker, the attemptId is rotated to a fresh UUID and the marker cleared. A pay-now POST therefore never reuses a card_hold row. The reverse direction (card after pay-now) needs no handling: the intent route writes payment_mode explicitly."
  - "Shared helpers live in a fifth file, cardCheckoutApi.ts, and Step6Checkout re-exports buildCardCheckoutBody / fetchCardInit, to avoid a circular import between Step6Checkout and Step6CardOnFile"
  - "During a currency / promo re-init the explainer and Elements unmount and the 'Loading payment...' line shows; this guarantees the tick cannot survive and no stale amount is shown"
  - "The consent invalidation announcement is made only when the box was actually ticked (announcing 'tick the box again' for an unticked box would be noise); PRICE_CHANGED and MODE_CHANGED rely on their own notice instead of a second announcement"
  - "PaymentElement does not set fields.billingDetails.address 'never' (legacy sets it on the Elements options): with confirmSetup it would require billing address in confirmParams, and the legacy placement there is not carried over"
  - "Elements options are mode 'setup' only; hold_now Elements options (mode 'payment', amount, manual capture) are left to plan 88-12 together with SUPPORTED_MODES"

patterns-established:
  - "Server decides, UI renders: the step renders only what init / intent returned, and falls back to legacy on any result it cannot render"

requirements-completed: [HOLD-01, PAYF-05]

coverage:
  - id: D1
    description: "Gate: ineligible, init failure (network, 5xx, 429) and unsupported mode render legacy Step6Payment with no card copy; loading line while init is in flight; init called once"
    requirement: PAYF-05
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Explainer shows the exact hold date (formatLocaleDate, Latin digits in ar) and the server amount via formatMinor; Elements created with mode setup, currency, card only"
    requirement: HOLD-01
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Consent checkbox is a native unticked input on every mount, never stored, label text equals the consent string, links outside the label; button disabled until ticked and Element ready"
    requirement: HOLD-01
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Submit flow: elements.submit, intent POST (consent true, displayedAmountMinor), snapshot before confirmSetup (redirect if_required), navigation to the localized confirmation path; alreadyConfirmed skips confirmSetup"
    requirement: HOLD-01
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Error and notice states: PRICE_CHANGED, MODE_CHANGED (fallback and remount with focus), CONSENT_REQUIRED, NOT_ELIGIBLE, INVALID_PHONE, 429, network, unknown code, 3DS failure, card decline, Elements load error, Confirming state with aria-busy and Escape ignored; currency / promo re-init clears the tick with a live-region message"
    requirement: HOLD-01
    verification:
      - kind: unit
        ref: "tests/Step6CardOnFile.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fidelity: long ru / es / fr / hi explainer rows wrap at 360px; ar mirrors the leading rule and consent row; 3DS challenge fits a phone; wallets in setup mode"
    requirement: HOLD-01
    verification: []
    human_judgment: true
    rationale: "Layout, RTL mirroring and the Stripe-hosted challenge were not checked in a browser in this run (executor must not start the dev server); the orchestrator browser check and canary A on a phone cover it. Logical properties (border-inline-start, gap) are used for the RTL mirroring."

duration: 55 min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 10: Card-on-file checkout step Summary

**Allowlisted clients now get a save-card step 6 (exact hold date, unticked consent, deferred-intent Elements, confirmSetup with 3DS) behind the init gate; everyone else sees the byte-identical legacy payment step.**

## What was built

- `Step6Checkout` calls `/api/card-checkout/init` once on mount and renders the loading line, `Step6CardOnFile`, or the legacy `Step6Payment`. BookingWizard step 6 now renders it.
- `Step6CardOnFile` follows UI-SPEC Surface 1: summary, promo, currency selector, "How payment works" panel, CARD DETAILS, PaymentElement, notice slot, consent row, links line, submit button, trust line. All copy is from `Booking.step6.cardOnFile.*` and the existing `Booking.step6.*` keys; amounts go through `formatMinor`, dates through `formatLocaleDate`.
- Submit: `elements.submit()` -> intent POST -> `writePurchaseSnapshot` -> `stripe.confirmSetup({ redirect: 'if_required' })` -> localized `/book/confirmation?ref=`. `alreadyConfirmed` navigates without a confirm.
- `PromoCodeField` is a copy of the legacy promo behaviour (same endpoint and error codes), so `Step6Payment.tsx` and `tests/Step6Payment.test.tsx` are untouched (verified with `git diff --quiet`).
- 45 tests in `tests/Step6CardOnFile.test.tsx`; the four named suites (Step6CardOnFile, Step6Payment, BookingWizard, BookingWizard-phone-gate) pass (67 passed, 27 todo). eslint clean on all touched files, no tsc error outside the baseline `tests/` ones.

## Decision: one flow per attempt

The 88-08 follow-up (a pay-now re-POST of an attemptId that went through the card flow would overwrite the row without resetting `payment_mode`) is closed by rotation, not by resetting the mode server-side: the card step stores the attemptId in sessionStorage right before the first intent POST, and the gate rotates to a new UUID whenever it hands over to the legacy step and finds that marker on the current attemptId. Tested for the NOT_ELIGIBLE fallback (rotates) and for an init-time ineligible result with no card attempt (keeps the id).

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra file `cardCheckoutApi.ts`**
- **Issue:** `Step6Checkout` imports `Step6CardOnFile` (gate) and `Step6CardOnFile` needs `buildCardCheckoutBody` / `fetchCardInit` (re-init, intent body) from the contract's `Step6Checkout`; a direct import would be circular.
- **Fix:** helpers live in `cardCheckoutApi.ts`; `Step6Checkout` re-exports `buildCardCheckoutBody` and `fetchCardInit`, so the contract exports still hold.
- **Commit:** 0f7f2da6

**2. [Rule 2 - Missing critical functionality] Promo heading and "PAY IN" from the catalog**
- **Issue:** the legacy block hard-codes "PROMO CODE" / "PAY IN" / "PROMO: -x%" in English; the plan requires no literal English in new components.
- **Fix:** `PromoCodeField` and the currency selector use `promoCodeLabel`, `payInLabel`, `promoDiscount` (existing keys, translated in all locales).
- **Commit:** 97ebd4cc

**3. [Rule 2] Extra server codes handled**
- `MODE_UNSUPPORTED` (returned by the intent route for hold_now until 88-12) falls back to legacy like `NOT_ELIGIBLE`; a 429 without a body code maps to `RATE_LIMITED`.

Other plan points implemented as written. The `fields.billingDetails.address: 'never'` option is intentionally not carried over (see key-decisions).

## Known Stubs

None.

## Threat Flags

None. No new endpoints or storage beyond a sessionStorage attempt marker (an already-client-held UUID).

## Open items for later plans / the orchestrator

- 88-12 must add `'hold_now'` to `SUPPORTED_MODES` and make the Elements options mode-aware (`mode: 'payment'`, `amount`, manual capture); today a hold_now init result renders the legacy step.
- Browser check by the orchestrator after merge: 360px wrap in ru / es / fr / hi, ar mirroring, 3DS challenge fit and wallet button presence in setup mode (canary A on a phone, reported in the 88-17 SUMMARY).
- The `tests/Step6CardOnFile.test.tsx` suite asserts the SUPPORTED_MODES MODE_CHANGED remount path by temporarily pushing 'hold_now' into the array; when 88-12 adds it for real, that test can drop the push.

## Self-Check: PASSED

- Files exist: Step6Checkout.tsx, Step6CardOnFile.tsx, PromoCodeField.tsx, cardCheckoutApi.ts, CardPaymentExplainer.tsx, tests/Step6CardOnFile.test.tsx
- Commits exist: 0f7f2da6, 97ebd4cc
