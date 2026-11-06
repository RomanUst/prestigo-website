---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 25
subsystem: payments
tags: [email, i18n, operator-alerts, cancellation-policy, cash-guarantee, no-show]
requires:
  - phase: 89-04
    provides: "PaymentEmails shell with policy box and Manage button, FEE_WORDING_ALLOWED allow-list, emailVarsFromRow"
provides:
  - "PaymentEmailKind cancelled, fee_charged, fee_waived; variants card_saved:cash, cancelled:{free,by_prestigo,late}, fee_charged:{late_cancel,no_show,cash_unpaid,cash_card}, payment_failed:fee"
  - "PaymentEmailExtra (sendPaymentEmail / emailVarsFromRow input): feeMinor, refundMinor, moneyOutcome, feeLabel, freeUntil, waitMin on top of kind and variant"
  - "OPERATOR_ALERT_KINDS fee_decision_needed, fee_no_show_needed, fee_pending_24h ([Fee]); client_cancelled, change_request ([Booking])"
  - "PaymentEmails catalog keys for all of it in 7 locales, including contactOr (localized 'or' in the contact line)"
  - "buildBookUrl(locale) in lib/manage-link.ts"
affects: [89-06, 89-08, 89-10, 89-13, 89-27, 89-28]
tech-stack:
  added: []
  patterns:
    - "engine plans name a kind, a variant and the facts; the sender fills freeUntil, waitMin, the proposed fee and the Book another ride link from the booking's stored policy"
    - "a required var that is missing (freeUntil, waitMin, feeMinor) throws in the renderer: a client mail never leaves an open parameter, the sender answers 'failed'"
    - "fee and refund wording is a positive allow-list by key prefix, closed and asserted per locale"
key-files:
  created:
    - tests/payments-alerts.test.ts
  modified:
    - lib/payments/emails/render.ts
    - lib/payments/emails/send.ts
    - lib/payments/alerts.ts
    - lib/manage-link.ts
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/payments-emails.test.ts
    - tests/payments-copy-i18n.test.ts
    - tests/payments-failure.test.ts
key-decisions:
  - "No reason or note field exists on PaymentEmailVars or PaymentEmailExtra (T-89-13); the sender copies only named fields from the booking row, asserted by a test that plants operator text on the row"
  - "Required vars throw instead of falling back: cancelled late and fee_charged late_cancel/no_show need feeMinor; cash_unpaid, cash_card and a trip fee fall back to the booking amount (the whole fare is what those mails charge)"
  - "freeUntil is accepted as epoch ms or ISO string (the fee case carries ISO, the policy evaluator ms); displayed on the Europe/Prague wall clock with formatLocaleDateTime"
  - "Book another ride is an outlined button (payment_failed stays the only filled one) and renders only with a https bookAgainUrl; the sender sets it for cancelled and fee_waived"
  - "The contact pair is built in render.ts with the catalog word contactOr; each link is isolated ltr, the outer bdi is dir=auto so the word sets the direction (Arabic reads email, 'أو', phone). EMAIL_CONTACT_LINE stays for the English-only legacy emails"
  - "Chinese joins the money sentences without a space (full stop already separates them)"
patterns-established:
  - "money sentences shared by cancelled and fee_waived live under PaymentEmails.money.* (nothing, released, refunded) and are composed in code per mode, so no ICU select in the catalog"
requirements-completed: [CANC-02, HOLD-06, CASH-03]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: 8daa77f111e8ea3a3d01f1bec89d487dce1da624
plan_head_after: 5d96a18feb14fb9d78329fa833ec8ad66be9501d
actuals:
  tokens: 35000
  tasks: 3
  commits: 3
---

# Phase 89 Plan 25: Remaining client emails and all operator mail Summary

**Cancelled, fee charged, fee waived, cash card-saved and fee-failed client emails in all 7 locales plus the five new operator alert kinds with [Fee] and [Booking] subject prefixes, so the engine plans only name a kind, a variant and the facts.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | cancelled email through sendPaymentEmail to HTML, remaining kinds and localized contact line, English | 745cb4c3 |
| 2 | operator alert kinds and subject prefixes of Surface 8.3 | 6653ff26 |
| 3 | real translations in ru, es, fr, ar, hi, zh, extended allow-list, full locale matrix | 5d96a18f |

Tracer verified end to end before expansion: `sendPaymentEmail({kind:'cancelled', variant:'free', moneyOutcome:'released'})` on a seeded booking delivered one Resend message with the English subject, H1, "Nothing was charged. The hold on your card is released." and the Book another ride button to `https://rideprestigo.com/book`; a second call with the same ledger key answered `duplicate` and sent nothing.

## What was built

- `render.ts`: `PaymentEmailKind` gained `cancelled`, `fee_charged`, `fee_waived`; `PaymentEmailVariant` union; new `PaymentEmailVars` fields `feeMinor`, `refundMinor`, `moneyOutcome`, `feeLabel`, `freeUntil`, `waitMin`, `bookAgainUrl`. Eight new TEMPLATES entries (card_saved:cash, cancelled x3, fee_charged x4, fee_waived) plus payment_failed:fee. Templates with no kind-specific box (cancelled free and by_prestigo, fee_waived) skip the box. The cash variant of card_saved adds the sentence "You pay {amount} in cash to your driver. Your card is only a guarantee." to the cancellation box (the cash sentence 89-04 left open).
- `send.ts`: `PaymentEmailExtra`; `emailVarsFromRow` derives `freeUntil`, `waitMin` and (cancelled late) the proposed fee from the booking's stored policy when the caller omits them, never from today's settings; sets `bookAgainUrl` for cancelled and fee_waived. `sendPaymentEmail` takes the same fields flat.
- `alerts.ts`: five new kinds; `[Fee]` for fee_decision_needed, fee_no_show_needed, fee_pending_24h; `[Booking]` for client_cancelled, change_request; `[Payment]` unchanged for the nine older kinds. New details fields freeUntil, proposedMinor, captureBefore (falls back to booking.capture_before), cancelledAt, arrivedAt, requestedAt, thresholdMin, openedAt, moneyOutcome, message. Missing fields are omitted. The change-request message is HTML-escaped, capped at 2000 characters and never reaches the ledger row (the row carries amount, currency and code only).
- Catalog: about 45 new keys per locale under `PaymentEmails` (`contactOr`, `common.bookAgainCta`, `common.decides`, `money.*`, `cancelled.*`, `feeCharged.*`, `feeWaived.*`, cash keys of `cardSaved`, `policyBox.cash`, fee keys of `paymentFailed`), translated in-session in a formal register with ICU parameters and the brand untouched. No script was run; `git diff --stat -- scripts/` is empty.
- `tests/payments-copy-i18n.test.ts`: `FEE_WORDING_ALLOWED` is now the box plus exactly the kinds of UI-SPEC 8.2 (by key prefix, closed set, asserted against Phase 88 keys); per-key parameter contract; Latin digits only; a typed number only in the bank-delay sentence.
- `tests/payments-emails.test.ts`: tracer through the sender, copy of every 8.2 row in English, required-var failures, no reason/note leak (T-89-13), long-address wrap (E21), and a render matrix of every new kind x 7 locales (no open parameter, rtl only for ar, Latin digits, single filled button, localized "or", "a person at Prestigo decides", money sentences, cash sentence).
- `tests/payments-alerts.test.ts` (new): prefix and body lines per kind, omission of missing fields, escaping and ledger check for change_request (T-89-72), once per event key.

## Verification

- `npx vitest run tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts tests/payments-alerts.test.ts` green; with `payments-failure`, `-settle`, `-hold`, `-tick`, `-lifecycle`, `webhooks-stripe-payments`, `manage-link`, `email`, `driver-trip`, `admin-payment-api`, `admin-bookings*`, `payments-engine-gates`, `payments-review-engine`, `i18n-completeness`, `i18n-freeze-manifest`, `i18n-catalog-array-types`, `i18n-translate-manifest`, `i18n-translate-dnt`: 934 passed.
- Key-parity one-liner of the plan over the six locales: ok. `npx tsc --noEmit`: no error outside `tests/`, none in the touched tests. `npx eslint --quiet` on every touched source and test file: exit 0.
- The worktree used the symlinked node_modules; no next-intl server module failure appeared in any run.

## Deviations from Plan

**1. [Rule 2 - Consistency with the must-have] cancelled late intro says "decides", not "will decide"**
- **Found during:** Task 1
- **Issue:** UI-SPEC 8.2 gives "A person at Prestigo will decide and email you", while the plan's must-have and the 8.2 rules require the words "a person at Prestigo decides" in every late and no-show mail.
- **Fix:** EN source reads "A person at Prestigo decides and emails you." The fee_charged late_cancel and no_show receipts carry a third line, `common.decides` ("A person at Prestigo decides every charge."). Translations follow.
- **Commit:** 745cb4c3

**2. [Rule 3 - Blocking] `contactOr` added to the six non-English catalogs in Task 1**
- Every render now reads `contactOr`, so leaving it for Task 3 would have broken every non-English render and the Task 1 verify command. Only that one key was translated in Task 1 (ru "или", es "o", fr "ou", ar "أو", hi "या", zh "或"); the rest followed in Task 3. Between the two commits `tests/payments-copy-i18n.test.ts` was red by design (EN keys only), as in 89-04.

**3. [Rule 2 - Missing functionality] `buildBookUrl` in `lib/manage-link.ts`**
- The Book another ride button needs the localized `/book` URL on the same site-URL and `getPathname` path as the manage link. Added next to `buildManageUrl` rather than duplicating the base-URL trimming.

**4. [Rule 2 - Missing functionality] `tests/payments-failure.test.ts` kind list**
- The test pins the full `OPERATOR_ALERT_KINDS` list; extended with the five new kinds.

Process note: the plan-head ledger file was not written (sandbox); `plan_head_before` is the dispatch base and `commits` was measured with `git rev-list --count 8daa77f1..HEAD` (3 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- Contract for callers (89-06, 89-08, 89-10, 89-27): `sendPaymentEmail({ kind, variant, booking, eventKey, feeMinor?, refundMinor?, moneyOutcome?, feeLabel?, freeUntil?, waitMin? })`. Required per variant: `cancelled:late` needs `feeMinor` (defaults to the stored-policy proposal) and `freeUntil` (defaults to the stored policy); `fee_charged:late_cancel` needs `feeMinor` (the decided amount) and `freeUntil` (default stored); `fee_charged:no_show` needs `feeMinor` and `waitMin` (default from the no-show thresholds); `payment_failed:fee` with `feeLabel` `cancellation` or `no_show` needs `feeMinor`, `feeLabel: 'trip'` (default) uses `feeMinor ?? booking amount`. A caller that cannot supply them gets `'failed'` and a log line, never a half-filled mail. `moneyOutcome` defaults to `'none'`.
- `payment_failed:fee` lets the recovery path pick the label: `feeLabel` is `'cancellation' | 'no_show' | 'trip'`.
- D-21 holds: there is no cash-not-received client mail and no `[Cash]` operator alert kind in this plan; a card failure during a cash trip sends the client nothing (no template exists for it).
- The `[Cash]` row of UI-SPEC 8.3 is dropped by D-21, and the driver "Trip cancelled" mail is not part of this plan's file list; neither was built here.
- Arabic right-to-left rendering in Gmail, Outlook and Apple Mail cannot be proven without real sends; the owner reviews the ar cancel and cash emails in plan 89-22 (planner assumption kept).
- `change_request` expects the route (89-28) to pass the already length-checked message; the alert caps it at 2000 characters again and escapes it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-89-13 (no reason/note variable, asserted in English and in all 7 locales, and a row planted with operator text never reaches the vars), T-89-72 (change-request message escaped, capped, not in the ledger).

## Self-Check: PASSED

- lib/payments/emails/render.ts, send.ts, lib/payments/alerts.ts, tests/payments-alerts.test.ts: FOUND
- commits 745cb4c3, 6653ff26, 5d96a18f: FOUND on branch worktree-agent-a98716253b32e9300
