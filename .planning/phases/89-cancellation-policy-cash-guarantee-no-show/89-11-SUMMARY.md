---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 11
subsystem: payments
tags: [checkout, cash-guarantee, cancellation-policy, i18n, next-intl, vitest]
requires:
  - phase: 89-07
    provides: "init policy preview { version, freeUntilIso, freeUntilPassed, hours, percent, feeMinor, waitMin }"
  - phase: 89-10
    provides: "cash intent, POLICY_CHANGED cross-check, final consent wording and consentMessageKey"
provides:
  - "CancellationPolicyNote and CancellationAcceptanceLine (components/booking/CancellationPolicyNote.tsx)"
  - "Payment choice radiogroup, cash explainer and cash submit path in Step6CardOnFile"
  - "Strict init policy parsing (parseInitPolicy) and InitEligible.policy / cashAvailable"
  - "Catalog keys Booking.step6.cancellation.* and 13 new Booking.step6.cardOnFile.* keys in 7 locales"
affects: [89-13, 89-14, 89-22, 89-23]
tech-stack:
  added: []
  patterns:
    - "rich-text tag <bdi> in the catalog around dates and amounts (as Hero's price token), because next-intl rich values must be strings"
    - "ICU plural with the number written as {hours} inside each branch (not #), so ar/hi/zh keep Latin digits"
key-files:
  created:
    - components/booking/CancellationPolicyNote.tsx
    - tests/cancellation-policy-note.test.tsx
  modified:
    - components/booking/steps/Step6Checkout.tsx
    - components/booking/steps/Step6CardOnFile.tsx
    - components/booking/steps/Step6Payment.tsx
    - components/booking/steps/cardCheckoutApi.ts
    - components/booking/CardPaymentExplainer.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/Step6CardOnFile.test.tsx
    - tests/Step6Payment.test.tsx
key-decisions:
  - "An eligible init answer without a usable policy is treated as a failed init (legacy Step6Payment): the intent route answers 409 to any request without the free-until moment, so a card form could never book"
  - "Cash tile choice is a plain component state defaulting to card on every mount; switching clears the tick, announces the Phase 88 sentence, remounts Elements (key = payment + mode + currency) and calls startNewAttempt"
  - "POLICY_CHANGED patches version, freeUntilIso, freeUntilPassed, hours, percent into the local policy and recomputes the fee with proposedFeeMinor (card flow is one-way and hourly only); PRICE_CHANGED recomputes the fee the same way"
  - "Pay-now fallback after a card-step failure hands the original EUR init policy to Step6Payment; the pay-now note converts the fee with eurToCzk when the client toggles CZK"
  - "The terms link points to /terms (no fragment): the terms page has no cancellation anchor yet (plan 89-20 rewrites section 4)"
  - "Cash button label reuses ctaSetup, which already reads 'Save card & book' in all locales"
requirements-completed: [CASH-01, CANC-02]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: ac78525e121f9c08c66a422ec98db8b7474d3df9
plan_head_after: b34e1c7ed6059a7d4ee47f675adceb1f3d70324c
actuals:
  tokens: 65000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 11: Checkout cancellation note, payment choice and cash path Summary

**The checkout now shows the exact free-cancellation deadline before the card form, offers "Pay by card" or "Pay cash to the driver", and answers the 89-10 server contract: the consent label names the init policy's free-until moment, the submit sends `payment`, `displayedFreeUntilIso` and `displayedFreeUntilPassed`, and a 409 POLICY_CHANGED re-asks the tick with the new deadline.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | init policy through Step6Checkout to CancellationPolicyNote and the acceptance line on pay-now; Booking.step6.cancellation in 7 locales | cfe9229e |
| 2 | payment choice tiles, cash explainer, cash submit path, POLICY_CHANGED, chat-launcher space; cardOnFile choice keys in 7 locales | 5a142358 |
| 3 | catalog parity tests for both key sets in 7 locales (plural coverage, Latin digits, logical properties) | b34e1c7e |

Tracer verified before the expansion: `tests/Step6Payment.test.tsx` renders the real `Step6Payment` with a policy (note between the currency selector and the payment form, acceptance line as the element directly above the pay button, no checkbox) and without (no note, no acceptance line, nothing of the Phase 89 copy in the DOM), and confirms payment still goes through.

## What changed

- `cardCheckoutApi.ts`: `InitPolicy`, `parseInitPolicy` (strict shape, invalid means ignored), `InitEligible.policy` and `cashAvailable`, `InitResult` ineligible may carry `policy`.
- `Step6Checkout.tsx`: the legacy branch carries `policy` (from `{ eligible: false, policy }`, from an unsupported mode, or from the card step's fallback) into `<Step6Payment policy>`.
- `Step6Payment.tsx`: optional `policy` prop. With it: `CancellationPolicyNote` under the currency selector (fee converted with `eurToCzk` on the CZK toggle) and `CancellationAcceptanceLine` directly above the pay button. Without it the step renders as before.
- `Step6CardOnFile.tsx`: `PaymentChoiceTiles` (`role="radiogroup"`, roving tabindex, arrows and Space, RTL-aware arrows, one column on phones and two from 560px); `payment` state (card on every mount); `effectiveMode` (cash is always `setup`, no hold date, never the held-now variant); the consent key is `consentMessageKey(cash ? 'cash_setup' : mode, freeUntilPassed)` with `freeUntilMs` from the policy, so the label equals what the server hashes; submit body adds `payment`, `displayedFreeUntilIso`, `displayedFreeUntilPassed`; POLICY_CHANGED handler; `pb-28 md:pb-0` on the step wrapper so the fixed chat launcher (`bottom-24`) cannot sit on the consent and its links when scrolled to the end.
- `CardPaymentExplainer.tsx`: `payment="cash"` variant (headline, Today / On the day / Only if needed rows, amount in `<bdi>`).
- `CancellationPolicyNote.tsx`: new; three rows from the init policy, past-deadline sentence, terms link in a new tab, `border-inline-start`, `<bdi>` around the date and amount through the catalog tag.
- Catalogs: `Booking.step6.cancellation.*` (7 keys) and 13 `Booking.step6.cardOnFile.*` keys, real translations in ru, es, fr, ar, hi, zh written in-session (no script run). Icons `Banknote`, `Phone`, `CalendarX` exist in lucide-react 1.8.0 but UI-SPEC Surface 2 uses none of them (tiles use the dot and `CircleCheck`), so none was imported.

## Verification

- `npx vitest run` full suite: 359 files passed, 10627 tests passed. 5 files (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) fail at load with `ERR_MODULE_NOT_FOUND` for next-intl in this worktree's node_modules symlink (the same 5 as plans 89-07 and 89-10), unrelated to this plan.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet components/booking` and the touched tests: clean.
- Acceptance: `grep -c "€" components/booking/CancellationPolicyNote.tsx` prints 0 (also none in the other touched components); a test asserts the no-policy render has no `cancellation-note`, no acceptance line and no Phase 89 copy; Step6CardOnFile tests cover default card, tick cleared on switch, no hold date on cash, POLICY_CHANGED; `payments-copy-i18n`, `i18n-completeness`, `i18n-freeze-manifest` green.

## Deviations from Plan

**1. [Plan note] Translations ship with the EN keys, not in Task 3**
- **Issue:** `i18n-completeness` and `payments-copy-i18n` fail as soon as one locale lacks a key, so EN-only commits for Tasks 1 and 2 would be red.
- **Fix:** each task's commit carries all 7 locales for its keys; Task 3 became the parity test file (keys, ICU arguments, rich tags, real translation, plural coverage, Latin digits, logical properties).
- **Commits:** cfe9229e, 5a142358, b34e1c7e

**2. [Rule 2 - Missing critical] Eligible init without a policy now falls back to legacy**
- **Issue:** a card form for an init answer without the policy could never produce a valid `displayedFreeUntilIso` (the intent route answers 409), and the consent label would be empty.
- **Fix:** `fetchCardInit` returns null in that case, so the gate shows Step6Payment. The server always sends the policy on an eligible answer, so this only guards a malformed or older response. Existing tests' `eligibleInit` helper now carries a policy.

**3. [Rule 3 - Blocking] next-intl rich values must be strings**
- **Issue:** `<bdi>` elements passed as `t.rich` values do not type-check.
- **Fix:** the catalog wraps `{freeUntil}` and `{amount}` in `<bdi>…</bdi>` (rowFree, rowFee, cashOnTheDay) and the components provide the `bdi` tag, as `Hero` does for its price token.

**4. [Process] Plan-head ledger file not written**
- The sandbox refuses compound git-dir commands, so `commits` is measured from the known base: `rev-list --count ac78525e..b34e1c7e` is 3 before this SUMMARY commit.

## Notes for the orchestrator

- **Do not merge 89-10 without 89-11:** with this plan the checkout client matches the server contract. Unrun: a real browser check at 360px (long ru, es, fr, hi strings in the tiles, the note and the consent; the launcher overlap fix is padding only), Apple Pay / Google Pay in the setup-mode PaymentElement on the cash path (assumption A9, owner check on a phone in 89-22), and a live cash booking.
- **Pay-now fee after a promo:** the pay-now note's fee comes from the init made on mount; applying or removing a promo inside the legacy step does not re-init, so the displayed percent amount can lag the final price (display only; the server prices the booking and stores the policy snapshot; T-89-39).
- **Terms link** goes to `/terms` without a fragment until plan 89-20 adds a cancellation section; if it gets an anchor, change the two `href`s in `CancellationPolicyNote.tsx`.
- **Confirmation page (UI-SPEC 2.5)** is not part of this plan's file list and was not touched.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-38 (stale consent tick): the tick is cleared on any change of choice, amount, currency, mode, hold date or free-until moment (`consentKey`), on PRICE_CHANGED, MODE_CHANGED, HOLD_DATE_CHANGED and POLICY_CHANGED, and a switch remounts the form. T-89-39 (client trust in the shown amount): display only, the server recomputes and cross-checks.

## Self-Check: PASSED

- components/booking/CancellationPolicyNote.tsx, tests/cancellation-policy-note.test.tsx, this SUMMARY: FOUND
- commits cfe9229e, 5a142358, b34e1c7e: FOUND on branch worktree-agent-aa2f40d8b7eb3df2b
