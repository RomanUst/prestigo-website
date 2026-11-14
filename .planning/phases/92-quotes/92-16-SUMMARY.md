---
phase: 92-quotes
plan: 16
subsystem: payments
tags: [quotes, stripe, consent, deposit, security, public-api]
requires: ["92-02", "92-03", "92-04", "92-09"]
provides:
  - "lib/quotes/consent.ts: renderQuoteTerms (server-rendered consent + terms text, SHA-256, QUOTE_CONSENT_VERSION)"
  - "lib/quotes/accept.ts: acceptQuote (acceptance row before Stripe, one live deposit PaymentIntent per quote)"
  - "lib/payments/customer.ts: ensureQuoteStripeCustomer"
  - "POST /api/quote/accept, POST /api/quote/state"
affects: [92-17, 92-18, 92-31]
tech-stack:
  added: []
  patterns:
    - "acceptance row first, Stripe second; amount only from the frozen version"
    - "compare-and-set on quotes.deposit_payment_intent_id; the loser cancels its own intent with qdep_void:<pi>"
    - "request carries cross-checks only; any amount or text key is a 400 (strict schema)"
key-files:
  created:
    - lib/quotes/consent.ts
    - lib/quotes/accept.ts
    - app/api/quote/accept/route.ts
    - app/api/quote/state/route.ts
    - tests/quote-accept.test.ts
    - tests/quote-accept-route.test.ts
  modified:
    - lib/payments/customer.ts
key-decisions:
  - "A stored live deposit intent is reused only when its amount, currency and metadata.versionId match the current version; otherwise it is cancelled (void key) and replaced, never handed to the client"
  - "A stored intent the server cannot classify, or a stale one it cannot cancel, answers busy (client retries); nothing is guessed"
  - "The stored consent text also carries the remainder sentence of the chosen method (Quote.remainder.<method>), because the consent says 'as described above'"
  - "acceptQuote throws on a database failure; the route turns any throw into a generic 502 payment_unavailable with a fixed log line"
requirements-completed: [QUOTE-03, QUOTE-05]
status: complete
commits: 3
plan_head_before: 8d56e16b7ddfbc3b68021eecaa9cfacb39cb1853
plan_head_after: 317c56cedc37a56706e466ecba3f7f7980bab727
actuals:
  tokens: 15100
  tasks: 3
  commits: 3
estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low
completed: 2026-11-14
---

# Phase 92 Plan 16: Accept and deposit, server side Summary

A client with a live quote link can accept and start the deposit: the server renders the exact terms in the quote's language, logs the acceptance (time, IP, user agent, version, text and its SHA-256), sets the quote to accepted, and returns the client secret of the one deposit PaymentIntent that also saves the card. A second endpoint reports the state for polling.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | b492b791 | feat: log the quote acceptance, then create the deposit PaymentIntent that saves the card |
| 2 | 852c93c3 | feat: one live deposit intent per quote, with reuse, replace and race rules |
| 3 | 317c56ce | security: public quote accept and state routes |

## What was built

- **`renderQuoteTerms`** (consent.ts): `createTranslator` over the quote's own locale catalog (`Quote` namespace, throwing `onError`), text = `Quote.consent.<method>` (reference, version, deposit; D-21 / D-22) + the remainder sentence + free / noFree + lateAll / latePercent + cap, each value wrapped in the same Unicode isolates the page uses. `sha256` is `consentSha256`; `version` is `QUOTE_CONSENT_VERSION`. The free window uses the same rule as `buildQuoteView` (first pickup minus stored free hours, `nowMs` past it gives the "no longer free" wording).
- **`acceptQuote`** (accept.ts), in this order: `resolveQuoteToken` (so D-05 / D-02 / void / revise / revoke are the one `invalid_link`, no price data); paid quote answers `already_paid`; version number and deposit cross-check (`quote_changed`); render terms; read `leadHours` from `getPaymentSettings`; insert the acceptance (IP clamped to 64, user agent to 300); compare-and-set `sent|viewed -> accepted` on `current_version_id` (an already accepted same-version quote continues; any other state is `invalid_link` or `already_paid`) plus an `accepted` event; stored-intent check; quote customer; PaymentIntent; compare-and-set store of the intent; link on the acceptance; `deposit_started` event.
- **PaymentIntent parameters:** `amount = version.deposit_minor`, `currency = version.currency`, `customer`, `payment_method_types ['card']`, `setup_future_usage 'off_session'`, no `capture_method`, no `confirm`, `quoteMetadata('card_quote_deposit', { quoteId, versionId, quoteReference, acceptanceId })`, key `stripeKeys.quoteDeposit(version, acceptance)`. Never written to any booking.
- **One live intent per quote:** live and matching (same version, amount, currency) is reused (a second acceptance row is logged, linked to that intent); `processing` / `succeeded` / `requires_capture` is `already_paying`; `canceled` or missing at Stripe is replaced; a live but mismatching intent is cancelled with `quoteDepositVoid` and replaced; the new intent is stored by compare-and-set against the replaced id (or null), and a loser cancels its own intent with `quoteDepositVoid` and answers `busy`.
- **`ensureQuoteStripeCustomer`** (customer.ts): key `cus:quote:<id>`, metadata `{ quoteId }` only, contact in the Customer's fields, reuse and update on an existing id, random-suffixed recovery key on an idempotency conflict (same pattern as the booking helper).
- **Routes:** accept: 2 000-byte cap (declared length, then the bytes actually read), rate limit `/api/quote/accept`, JSON, strict schema `{ token, displayedVersionNo, displayedDepositMinor, consent: boolean }`, `consent !== true` is 422 `CONSENT_REQUIRED`, `invalid_link` 404, `quote_changed | already_paid | already_paying | busy` 409 `{ error: code }`, `stripe_error` and any throw 502 `{ error: 'payment_unavailable' }`, success 200 `{ clientSecret, amountMinor, currency }`, `no-store` on every answer. State: cap, rate limit `/api/quote/state`, strict `{ token }`, 404 for a dead link, 200 `{ state: 'offer' | 'accepted' | 'paid', bookingReferences }` only.

## Verification

- `npx vitest run tests/quote-accept.test.ts tests/quote-accept-route.test.ts tests/payment-state-writers-gate.test.ts`: 3 files, 71 tests passed (25 + 25 + gate 21).
- Existing behaviour: `card-checkout-cash`, `card-checkout-init`, `card-checkout-intent`, `quote-resolve`, `quote-view-route`, `quote-stripe-vocabulary`, `quote-events`, `quote-convert-fake`, `payments-consent`, `middleware-csrf-forms`: 10 files, 342 tests passed together.
- `npx tsc --noEmit`: 8 errors, all the old baseline in `tests/` (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none in touched files.
- `npx eslint --quiet` on the five source files and both test files: clean.
- Plan acceptance greps: `setup_future_usage: 'off_session'` 1; `quoteMetadata('card_quote_deposit'` 1; `cardMetadata` 0; `quoteDepositVoid` 8 (>= 1); tests named "Pitfall 8" (2) and "D-05" (3), all passing; `checkRateLimit('/api/quote/accept'` 1; `CONSENT_REQUIRED` 1.
- Proof of the order rule: the Stripe double is wrapped to record how many acceptance rows exist at every call; the test asserts 1 at each of them (customers.create, paymentIntents.create, retrieve, cancel).
- Proof of the race: `Promise.all` of two accepts on the in-memory DB and Stripe creates two intents, exactly one stays live and is stored, the other is cancelled with `qdep_void:<its id>`, one `accepted` and one `deposit_started` event.
- No live Stripe or database proof (no access): the SQL path (compare-and-set on `deposit_payment_intent_id`, the acceptance guard allowing `payment_intent_id` once) is proven against the in-memory double that mirrors migration 091.

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 2 - Missing critical functionality] The stored consent text includes the remainder sentence**
- **Issue:** the consent sentences (for example saved_card) say "as described above"; the plan's text list (consent + free / noFree + lateAll / latePercent + cap) leaves that description out of the stored record, so the log would not show what "above" meant.
- **Fix:** `renderQuoteTerms` inserts `Quote.remainder.<method>` between the consent sentence and the terms. The plan's required lines are all still present; the hash covers the whole text.
- **Commit:** b492b791

**2. [Rule 2 - Missing critical functionality] Stale live intent is cancelled, not reused**
- **Issue:** the plan reuses any live stored intent. If the quote was revised after an intent was made (old version, or a different deposit) a reuse would hand out a secret for the wrong amount.
- **Fix:** reuse requires amount, currency and `metadata.versionId` to match the current version; otherwise cancel with the void key and replace (cancel failure answers `busy`). Tested.
- **Commit:** 852c93c3

**3. [Rule 2] Body cap enforced on the bytes read, not only on the declared length**
- **Issue:** `enforceMaxBody` only reads `content-length`; a chunked body would pass.
- **Fix:** the accept route also checks the byte length of the text it reads (413). Tested with no declared length.
- **Commit:** 317c56ce

### Plan choices worth knowing

- An `accepted` quote_events row (key `accepted:<version id>`) is written when the compare-and-set applies. The plan lists only `deposit_started`; `accepted` is an existing event kind and the lifecycle ledger is more complete with it.
- `already_paying` and the reuse path also log an acceptance row (linked to the existing intent), because the client did press the button and ticked the consent; refusals decided before Stripe is considered (`invalid_link`, `quote_changed`, `already_paid`) write nothing.
- A failed customer or intent write after the intent exists cancels the intent (best effort) and throws, so the route answers a generic 502; a database failure never becomes `stripe_error`.
- `state` route: an unexpected resolver throw answers 502 `{ error: 'unavailable' }` (the resolver itself never throws; this is defence in depth).
- TDD: Task 1 tests were run and seen failing (import of the missing modules) before the implementation; Task 2 and 3 tests were written together with their implementation and passed on the first run, so no separate RED capture for those.
- The per-plan commit ledger file could not be written (the sandbox refuses compound git-dir commands, as in 92-04); `plan_head_before` is the branch HEAD at start, recorded above, and `commits` was measured with `git rev-list --count`.

## Residual risks (for 92-18 / 92-31 and the orchestrator)

- **Lost create response:** if `paymentIntents.create` succeeds at Stripe but the response is lost, the next attempt has a new acceptance id (new idempotency key) and creates a second intent; the first one was never handed to a client (its secret never left Stripe), so it cannot be paid, but it stays `requires_payment_method` until expiry. Plan 92-31's tick sweep may cancel such orphans; nothing here does.
- The 92-18 webhook finds the quote by `metadata.quoteId` and the acceptance by `metadata.acceptanceId`; the acceptance's `payment_intent_id` is set for every intent this plan creates or reuses.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-92-49 (strict schema, amount from the version, 409 cross-check, tested), T-92-50 (one stored intent, reuse / replace / loser cancels, tested including a real concurrent pair), T-92-51 (acceptance before every Stripe call, failing-Stripe test), T-92-52 (valid token, rate limit, card only, CSRF from 92-04), T-92-53 (`quoteLinkState` through the resolver, D-05 / D-02 / void / superseded / revoked / cancelled tested) are mitigated; T-92-SC accepted, no package installed.

## Worktree artefacts

No test of this plan failed to load because of the symlinked `node_modules` (neither new test file mocks a `next-intl` server module).

## Self-Check: PASSED

- Files exist: lib/quotes/consent.ts, lib/quotes/accept.ts, lib/payments/customer.ts (ensureQuoteStripeCustomer), app/api/quote/accept/route.ts, app/api/quote/state/route.ts, tests/quote-accept.test.ts, tests/quote-accept-route.test.ts.
- Commits exist on the branch: b492b791, 852c93c3, 317c56ce.
