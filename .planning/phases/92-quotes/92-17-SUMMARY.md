---
phase: 92-quotes
plan: 17
subsystem: public-quote-page
tags: [quotes, stripe, payment-element, consent, security, next-intl]
requires: ["92-09", "92-16"]
provides:
  - "app/[locale]/quote/[token]/QuoteAcceptPay.tsx: accept-and-pay island (data-testid quote-accept)"
  - "quote page mounts the island for a quote that is not paid; paid block (quote-paid) already shown"
  - "app/[locale]/quote/done/page.tsx: tokenless Stripe return page"
affects: [92-18, 92-27, 92-31]
tech-stack:
  added: []
  patterns:
    - "island translates nothing: server builds copy, consent text (renderQuoteTerms) and the button label"
    - "tick read from a ref; one POST at a time (busy ref); cross-check values only"
    - "amount in the accept answer must equal the displayed deposit, else nothing is confirmed"
    - "browser only polls /api/quote/state; bookings are created by the webhook"
key-files:
  created:
    - "app/[locale]/quote/[token]/QuoteAcceptPay.tsx"
    - "app/[locale]/quote/done/page.tsx"
    - tests/quote-accept-pay.test.tsx
  modified:
    - "app/[locale]/quote/[token]/page.tsx"
    - tests/quote-page.test.tsx
key-decisions:
  - "The accept area shows for state offer AND accepted (accepted, not yet paid), because the 92-16 route lets an already accepted same-version quote continue; a client who closed the card form can come back and pay"
  - "A consent text that cannot be rendered hides the accept area (fail closed); the quote itself still shows"
  - "The button amount is wrapped in left-to-right isolates like every other amount on the page"
requirements-completed: [QUOTE-03, QUOTE-05]
status: complete
commits: 2
plan_head_before: c655ba8497d637243ef8f76bcdcc506e4c86b7ec
plan_head_after: 3a1da82005ce24f77eb4028b11ed76da0d9cde03
actuals:
  tokens: 14500
  tasks: 2
  commits: 2
estimate:
  tokens: 65000
  raw_tokens: 65000
  tasks: 2
  confidence: low
completed: 2026-11-14
---

# Phase 92 Plan 17: Accept and pay card form, return page Summary

A client on a live quote page ticks the terms, presses "Pay deposit", and the island runs `elements.submit()`, POSTs `/api/quote/accept` (token, displayed version, displayed deposit, consent true), confirms with the returned secret with a tokenless `/<locale>/quote/done` return URL, then polls `/api/quote/state` until the quote is paid and refreshes the page.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | af81c84b | feat: accept and pay island on the public quote page |
| 2 | 3a1da820 | feat: tokenless Stripe return page for the quote deposit |

## What was built

- **`QuoteAcceptPay`** ('use client'): `loadStripe` at module scope, `<Elements>` in mode `payment` with the displayed deposit, `setupFutureUsage: 'off_session'`, `paymentMethodTypes: ['card']`, appearance copied from the card checkout step, `locale: STRIPE_ELEMENTS_LOCALE[locale]` (Hindi `auto`, zh-hant `zh-TW`). Same PaymentElement options as Step6CardOnFile (tabs, wallets auto). The consent text is shown in the label exactly as the server stored and hashed it (`white-space: pre-line`). The pay button is disabled until the box is ticked, the element is ready and Stripe is loaded; the tick lives in a ref (T-92-55) and a busy ref makes a double press send one POST.
- **Answers handled:** 200 with `amountMinor` and `currency` equal to the displayed ones then confirm (any other amount or currency is refused as "changed", the tick is cleared, nothing is confirmed); 409 `quote_changed` changed text + untick; 409 `already_paid` refresh; 409 `already_paying` straight to confirming; 404 unavailable; 422 consent; anything else (busy, 429, 502, network) the generic error. A card decline (`card_error`) shows the declined text; any other Stripe error shows the generic error, never raw Stripe text.
- **Confirming:** after `succeeded` / `processing` / `requires_capture` the island shows `Quote.accept.confirming` and polls `/api/quote/state` every 2 s for at most 30 polls (60 s), calls `router.refresh()` on `paid`, keeps the text if it never arrives. A failed poll does not stop the loop. The browser never creates bookings (T-92-56).
- **Page** (`page.tsx`): resolves once, builds the view, and for a quote that is not paid renders `renderQuoteTerms(...).text` (server, same text the accept route stores) into the island after the cancellation terms, with the ready `Quote.accept.*` strings and the button label `Pay deposit <amount>` built with `formatMinor`. Paid quotes keep the existing `quote-paid` block with the booking references.
- **Done page** (`quote/done/page.tsx`): `params.locale` + `setRequestLocale`, `Quote.done.title` and `Quote.done.body`, noindex/nofollow, `referrer: no-referrer`, no database, no `searchParams` (Stripe appends `payment_intent_client_secret`; it is never read or echoed). The path is already private in `lib/private-link-path.ts` (92-04).

## Verification

- `npx vitest run tests/quote-accept-pay.test.tsx`: 39 passed (repo config).
- `tests/quote-page.test.tsx` (with the worktree workaround below): 64 tests passed including the real page mounting the real island, the page props reaching the POST body, all 8 locales (`locales`, `zh-hant` included), the paid view and the done page; with `tests/private-link-paths.test.tsx`: 126 passed. Neighbours `quote-copy-i18n`, `quote-accept`, `quote-accept-route`, `next-config-headers`: 7 files, 361 tests passed together.
- `npx tsc --noEmit`: 8 errors, all the old baseline in `tests/`; none in touched files.
- `npx eslint --quiet` on the three source files and both test files: clean.
- Acceptance greps: `QuoteAcceptPay` in page.tsx 4 (>= 2); `setupFutureUsage: 'off_session'` in the island 1; `/quote/done` in the island 2 (>= 1); `setRequestLocale` in the done page 3 (the plan expects 1: one import, one call, plus a mention in a comment; the call itself is exactly 1).
- No live Stripe proof (no access): the island is tested against a Stripe double; the order, amounts and return URL are asserted.

## Worktree artefact (orchestrator action)

`tests/quote-page.test.tsx` mocks `next-intl/server` with its react-server build and fails to LOAD in this worktree through the symlinked `node_modules` (`Cannot find module '/@fs/.../server.react-server.js'`), same as in 92-09. I ran it with a throwaway untracked `vitest.tmp.config.ts` (repo config + `server.fs.strict: false`, deleted before the summary commit): 64 of 64 pass. **Re-run `npx vitest run tests/quote-page.test.tsx` in the main checkout.** Tests were not weakened.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Accept area also for an accepted-but-unpaid quote**
- **Issue:** the plan mounts the island for state `offer` only. The 92-16 route sets the quote to `accepted` before the card is confirmed and explicitly lets an already accepted same-version quote continue; a client who closed the tab or was declined would come back to a page with no way to pay.
- **Fix:** the island renders whenever the view state is not `paid`. Tested ("an accepted quote that is not paid yet can still pay").
- **Commit:** af81c84b

**2. [Rule 2] Server answer amount cross-check**
- **Issue:** the plan says the amount shown is the one the server returned; nothing stopped confirming a secret for another amount.
- **Fix:** if the answer's `amountMinor` / `currency` differ from the displayed deposit, nothing is confirmed, the tick is cleared and the changed text is shown. Tested.
- **Commit:** af81c84b

**3. Existing test updated:** the "names no waiting amount" page test counted 5 euro signs (two trips, total, deposit, remainder); the accept area adds the deposit once in the consent text and once on the button, so it now expects 7, with the reason in a comment.

### Plan choices worth knowing

- The island takes `locale` as a prop (the layout has no client message provider; the island uses no `useLocale`).
- The wording catalogs were not edited; every string the plan needs exists in `Quote.accept.*`, `Quote.paid.*`, `Quote.done.*`.
- No `loading` or Stripe-load-error string exists in the `Quote` catalog: an Element load error shows `Quote.accept.error`; while the Element is loading the button keeps its label and is disabled.
- CSP: the public pages already use the static CSP that allows `js.stripe.com`, `hooks.stripe.com` and `api.stripe.com`; no nonce is involved (the card checkout step has none either).
- TDD: the island and page tests were written before the implementations; the RED runs were not captured separately (missing module fails the import by construction). The per-plan commit ledger file was not written (sandbox refuses compound git-dir commands); `plan_head_before` is the branch HEAD at start and `commits` was measured with `git rev-list --count`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-92-54 (return URL without token, asserted in the island test, the page test and the source test), T-92-55 (tick in a ref, button disabled, forced submit posts nothing, tested), T-92-56 (the island only reads state, tested) are mitigated; T-92-SC accepted, no package installed.

## Notes for later plans

- 92-18 / 92-31: the island relies on the webhook (or reconcile) to move the quote to `paid` so the poll sees it; until then the page keeps the confirming text after 60 s.
- 92-27 adds the PDF button and the remainder payment area next to the accept area.

## Self-Check: PASSED

- Files exist: app/[locale]/quote/[token]/QuoteAcceptPay.tsx, app/[locale]/quote/done/page.tsx, tests/quote-accept-pay.test.tsx; page.tsx and tests/quote-page.test.tsx modified.
- Commits exist on the branch: af81c84b, 3a1da820.
