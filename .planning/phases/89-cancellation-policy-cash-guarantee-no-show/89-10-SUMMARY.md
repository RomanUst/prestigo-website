---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 10
subsystem: payments
tags: [cash-guarantee, consent, i18n, card-checkout, setup-intent, edit-hook, vitest]
requires:
  - phase: 89-07
    provides: "policy snapshot on every booking, isPolicyPublic, init policy preview"
  - phase: 89-25
    provides: "card_saved:cash email variant in 7 locales"
provides:
  - "Cash branch of createCardCheckoutIntent: payment 'cash' writes payment_mode cash_guarantee, SetupIntent only, hold_at NULL, consent mode cash_setup"
  - "Intent fields payment ('card' | 'cash', default card), displayedFreeUntilIso, displayedFreeUntilPassed; init field cashAvailable"
  - "409 POLICY_CHANGED { policy: { version, freeUntilIso, freeUntilPassed, hours, percent } } when the displayed free-until moment differs"
  - "CARD_CONSENT_VERSION 2026-11-1; ConsentMode cash_setup; catalog keys consentSetup, consentHoldNow, consentCash and the three *NoFree variants in 7 locales"
  - "consentMessageKey(mode, freeUntilPassed), consentVars freeUntil (formatLocaleDateTime, Prague 24 h), buildConsentText freeUntilMs/freeUntilPassed"
  - "Symmetric flowConflict over pay_now, card_hold, cash_guarantee (exported type CaptureFlow)"
  - "reevaluateAfterEdit cash branch (D-12) and an in-flight precheck for cash"
affects: [89-11, 89-13, 89-14, 89-15, 89-18]
tech-stack:
  added: []
  patterns:
    - "the stored consent text is always the server rendering; the client only sends the free-until moment (and whether it was shown as passed) as a cross-check"
    - "the no-hold guarantee for cash is the unchanged card_hold filter of the tick claim, asserted on the fake that mirrors 085"
key-files:
  created:
    - tests/card-checkout-cash.test.ts
  modified:
    - lib/payments/checkout.ts
    - lib/supabase.ts
    - lib/payments/consent-text.ts
    - lib/payments/consent.ts
    - lib/payments/edit-hook.ts
    - app/api/card-checkout/init/route.ts
    - app/api/card-checkout/intent/route.ts
    - lib/stripe-webhook/card-confirm.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/payments-consent.test.ts
    - tests/card-checkout-intent.test.ts
    - tests/card-checkout-init.test.ts
    - tests/payments-lifecycle.test.ts
    - tests/Step6CardOnFile.test.tsx
key-decisions:
  - "displayedFreeUntilIso is required in practice: a missing or different value answers 409 POLICY_CHANGED, so a client that does not send it (the pre-89-11 checkout) can not book; the stored consent can never name a moment the client did not see"
  - "displayedFreeUntilPassed (optional boolean, default false) is a second cross-check: the same moment can flip from free to passed between display and submit, which changes the wording variant (NoFree)"
  - "the cash path skips MODE_CHANGED and HOLD_DATE_CHANGED and always answers mode setup; a card intent keeps both"
  - "free-until and its passed flag come from the one policy read that also builds the stored snapshot; evaluateCancellation decides, in the route"
  - "the cash edit branch only moves card_saved (amount via a self-loop); cash_settled, captured, balance_due are final, other states are untouched; amount from the saved row in the booking currency, no conversion"
  - "consent pin digest now covers all six EN strings; the draft entry stays in the pin table as history"
patterns-established:
  - "wording variants chosen by one key function shared by the client renderer and the server hasher (consentMessageKey)"
requirements-completed: [CASH-01, CANC-02]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: 71ad3bce553489f6550b0c94d0e41049330ccbc2
plan_head_after: ca12d3b8cd2a61f86fc950ffa5f5fb895d024676
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 10: Cash guarantee booking and the final consent wording Summary

**Pay cash to the driver is bookable on the server: a cash intent creates a `cash_guarantee` row with a SetupIntent only and no hold, `setup_intent.succeeded` confirms it with the cash email, and the consent text is final (`2026-11-1`) in three variants and 7 locales, naming the booking's free-until moment and cross-checked with `POLICY_CHANGED`.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | cash intent through init and intent routes to a cash_guarantee row, then setup_intent.succeeded to confirmed with the cash email (consent plumbing, catalogs and consent test pin rode along, see Deviations) | db418191 |
| 2 | POLICY_CHANGED cross-check proven: different, missing, admin-changed and passed-since-display free-until, NoFree wording stored | b30afff1 |
| 3 | price edits keep the cash amount right (D-12) | ca12d3b8 |

Tracer verified end to end before expansion: `tests/card-checkout-cash.test.ts` posts to the real `card-checkout/init` and `card-checkout/intent` routes, asserts the row (`payment_mode cash_guarantee`, `hold_at null`, `payment_intent_id null`, one SetupIntent, zero PaymentIntents), the stored consent (mode `cash_setup`, version, server text, sha256, no planned hold), then delivers `setup_intent.succeeded` through the real webhook route: `confirmed`, `card_saved`, ledger `setup_started, setup_succeeded` (no `hold_scheduled`), and one `card_saved` mail whose HTML says no hold is placed and the driver is paid in cash.

## What changed

- `lib/payments/checkout.ts`: `payment: 'card' | 'cash'` on `CardCheckoutIntentInput`, `freeUntilMs`/`freeUntilPassed` required; cash picks flow `cash_guarantee`, ignores `mode`, passes `hold_at` null and consent mode `cash_setup`; the existing-row check treats a row as this flow's only when `payment_mode` matches; `recordConsent` threads the free-until moment into the stored text.
- `lib/supabase.ts`: `CaptureFlow` type; `flowConflict` is symmetric (pay_now conflicts with card_hold and cash_guarantee rows; card and cash conflict with any other mode or a paid PaymentIntent).
- `app/api/card-checkout/intent/route.ts`: `payment` (default card), `displayedFreeUntilIso`, `displayedFreeUntilPassed`; one policy read feeds the snapshot and `evaluateCancellation`; MODE_CHANGED and HOLD_DATE_CHANGED apply to card only; `POLICY_CHANGED` carries the new preview; the answer includes `payment`.
- `app/api/card-checkout/init/route.ts`: eligible answers add `cashAvailable: true`; ineligible answers (round trip, daily, lead rule, closed flow, unlisted client) are untouched.
- `lib/stripe-webhook/card-confirm.ts`: `applySetupSucceeded` skips the `hold_scheduled` row and sends `card_saved` variant `cash` for `cash_guarantee` rows.
- `lib/payments/consent-text.ts`, `consent.ts`: version `2026-11-1`, no draft marker; `cash_setup` mode; `consentMessageKey(mode, freeUntilPassed)`; `consentVars` adds `freeUntil` (Prague wall clock, 24 h, Latin digits in ar/hi/zh).
- `messages/*.json`: `consentSetup`, `consentHoldNow` rewritten from UI-SPEC Surface 2.4, new `consentCash`, `consentSetupNoFree`, `consentHoldNowNoFree`, `consentCashNoFree`; real translations in ru, es, fr, ar, hi, zh written in-session (no script run).
- `lib/payments/edit-hook.ts`: cash branch after the partner gate; `assertEditablePrecheck` covers cash in flight.

## Verification

- `npx vitest run` on the touched areas: card-checkout-cash (26), payments-consent (63), card-checkout-intent, card-checkout-init, payments-lifecycle, Step6CardOnFile (60), payment-state-writers-gate, admin-bookings-edit-payment, payments-review-engine, payments-engine-gates: all pass.
- Full suite: 356 files passed; 5 files (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) fail at load with `ERR_MODULE_NOT_FOUND` (the worktree's node_modules symlink, same as plan 89-07, unrelated). `seo-volume-pages` sitemap failed once under full-suite load and passes alone.
- `npx tsc --noEmit`: no errors outside `tests/` (the 8 baseline errors remain). `npx eslint --quiet` on all touched source and the two test files: clean.
- Acceptance greps: `grep -c draft lib/payments/consent-text.ts` is 0; `cash_guarantee` appears 4 times in `lib/supabase.ts` and 4 in `lib/payments/edit-hook.ts`; no migration file touched; no `€` literal in `app/` or `components/` changes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Consent plumbing and catalogs landed in the tracer commit**
- **Found during:** Task 1
- **Issue:** the tracer asserts the stored cash consent text, which needs the `cash_setup` mode, the `consentCash` key and `freeUntil` threading; changing the catalog strings also breaks the digest pin and every locale-parity check, so the catalogs and the pin test could not wait for Task 2 without leaving a red commit.
- **Fix:** consent code, all 7 catalogs and `tests/payments-consent.test.ts` are in commit db418191; Task 2's own commit holds the POLICY_CHANGED test suite.
- **Commits:** db418191, b30afff1

**2. [Rule 3 - Blocking] Existing tests encoded the old intent contract**
- **Found during:** Task 1
- **Issue:** `card-checkout-intent`, `payments-lifecycle` and `card-checkout-init` posted no `displayedFreeUntilIso` and asserted the old consent text and exact init body; three `Step6CardOnFile` consent-label tests compared against the catalog without `{freeUntil}`.
- **Fix:** the body helpers now send the free-until moment (computed from the fake's policy row, or taken from the init preview in the lifecycle test); init's exact body gains `cashAvailable`; the consent expectations pass `freeUntilMs`; the Step6CardOnFile expectations replace `{freeUntil}` with the (empty) value the interim client passes. No production behaviour was relaxed.
- **Commit:** db418191

**3. [Rule 1 - Bug] Own header comment tripped the single-writer gate**
- `tests/payment-state-writers-gate.test.ts` forbids the claim RPC name outside `lib/payments/state.ts`, even in a comment; reworded the `checkout.ts` header.

**4. [Process] Plan-head ledger file not written**
- The sandbox refuses compound git-dir commands (as in 89-03 and 89-07), so `commits` is measured from the known base: `rev-list --count 71ad3bce..ca12d3b8` is 3 before this SUMMARY commit.

## Notes for the orchestrator

- **Checkout client is intentionally behind the server until plan 89-11.** `Step6CardOnFile` does not yet send `displayedFreeUntilIso` or `payment`, so on this branch every card intent from the current client answers 409 `POLICY_CHANGED` (and its consent label would show an empty "after "). This is by design (the stored text must be what was ticked); 89-11 (`depends_on 89-10`) wires the init `policy.freeUntilIso`/`freeUntilPassed` into the label, the body and the new payment tiles. Do not merge this branch to production between 89-10 and 89-11.
- **Unrun:** nothing against a live database or real Stripe (no real Stripe call, `.env.local` never read). Migration 087 (live) already allows `cash_guarantee` and consent mode `cash_setup`; first live cash booking is a go-live proof.
- **Not in this plan:** the tick's reconcile of a cash `checkout_pending` row after a missed webhook (plan 89-13), `releaseHold`/`allowedPaymentActions` for cash (their own plans).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-34 (no hold on cash): the claim filter is unchanged, `hold_at` is null, and a test sets `hold_at` by hand on a confirmed cash row, moves the clock past it, and asserts neither `claimDueHolds` nor the payment tick claims it (with a control showing the same row as `card_hold` is claimed). T-89-35 (consent repudiation): full text, hash, version, ip, user agent and mode `cash_setup` stored; the free-until cross-check is covered. T-89-36 (attempt overwritten across flows): the 3x3 `captureUnpaidBooking` matrix and the route-level `ATTEMPT_CLOSED` both ways. T-89-37 (client amount): `displayedAmountMinor` is still only a cross-check (PRICE_CHANGED), the amount comes from pricing.

## Self-Check: PASSED

- tests/card-checkout-cash.test.ts, this SUMMARY: FOUND
- commits db418191, b30afff1, ca12d3b8: FOUND on branch worktree-agent-a6dcf6e2833b56ffb
