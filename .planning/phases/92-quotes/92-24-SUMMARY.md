---
phase: 92-quotes
plan: 24
subsystem: api
tags: [quotes, invoice, remainder, admin-api, email, i18n, exactly-once]
requires: [92-18, 92-13, 92-29]
provides:
  - "lib/quotes/invoice.ts: markInvoicePaid, requestRemainder, readRemainderDue, isValidInvoiceNumber"
  - "lib/quotes/emails/remainder-due.ts: renderQuoteRemainderDueEmail"
  - "routes POST /api/admin/quotes/[id]/invoice-paid and /remainder-request"
affects: [92-25, 92-23]
key-files:
  created:
    - lib/quotes/invoice.ts
    - lib/quotes/emails/remainder-due.ts
    - "app/api/admin/quotes/[id]/invoice-paid/route.ts"
    - "app/api/admin/quotes/[id]/remainder-request/route.ts"
    - tests/admin-quote-invoice-route.test.ts
  modified: []
key-decisions:
  - "Mark paid is a compare-and-set on invoice_paid_at IS NULL (plus status paid and not cancelled); a lost race re-reads and answers changed false (same number) or number_conflict (another number)"
  - "A replay with the same number finishes bookings an interrupted call did not reach and writes the keyed invoice_paid event if it is missing; it reports changed true only when a booking actually changed"
  - "remainder_requested is written only after the email was sent, so a failed send never blocks the operator's retry; the 10-minute guard reads the latest remainder_requested event"
  - "The remainder link is minted with mintQuoteLink; the URL exists only in the response of that call and the email (hash only stored); the Resend idempotency key and event keys use a hash of the URL, never the token"
status: complete
commits: 2
plan_head_before: c655ba8497d637243ef8f76bcdcc506e4c86b7ec
plan_head_after: a51098072c6eff23b55b53c0b08d8a365f51e01e
estimate:
  tokens: 50000
  raw_tokens: 50000
  tasks: 2
  confidence: low
actuals:
  tokens: 13000
  tasks: 2
  commits: 2
completed: 2026-11-14
---

# Phase 92 Plan 24: Invoice remainder and remainder request Summary

The operator can mark an invoice quote paid (invoice number, exactly once, quote plus live quote-mode bookings, audit events with the admin id, no Stripe, no email) and ask a client to pay a payment-link remainder (fresh hash-only link, email in the quote language with the amount due, 10-minute repeat guard).

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | ae83d6f4 | mark a quote invoice paid |
| 2 | a5109807 | remainder request email for payment-link quotes |

## What was built

- **markInvoicePaid** (D-17, D-22): checks method (`not_invoice`), then paid and not cancelled (`not_paid`), then a replay (`number_conflict` for another number). Writes an `admin_action` event, then one compare-and-set on the quote (`invoice_number`, `invoice_paid_at`), then `paid_at` and `invoice_number` on the quote-mode, not-cancelled, not-yet-paid bookings, then `invoice_paid` (amount = the remainders settled, currency of the quote). `payment_state` and `payment_mode` are never touched, no Stripe call, no email.
- **requestRemainder** (D-16): order of refusals `not_found`, `not_payment_link`, `not_paid`, `nothing_due` (remainderDueMinor over lines and bookings), `recently_sent` (latest `remainder_requested` younger than 10 minutes). Then `admin_action`, `mintQuoteLink`, the email through the shared shell, `email_sent`, `remainder_requested`. A failed render or send records `email_failed` and answers 502; the link row exists and the retry is allowed at once.
- **renderQuoteRemainderDueEmail**: `QuoteEmails.remainderDue` (subject, h1, intro with `{amount}`, button) plus the shared greeting, contact and sign-off; amount pre-formatted with `formatMinor`; the link goes through the shell's http(s)-only check; no waiting amount.
- **Routes**: `enforceMaxBody -> getAdminUser -> uuid -> JSON -> strict zod`; invoice number trimmed, 1..60 chars, single line (no control characters, no U+2028/2029); empty or missing, long or multi-line is 400, state refusals are 422 `{ error: 'action_not_allowed', reason }`; remainder-request takes `{}` or no body, 429 `{ error: 'recently_sent' }`, 502 `{ error: 'email_failed' }`; every answer `no-store`; logs carry ids only.

## Verification

- `npx vitest run tests/admin-quote-invoice-route.test.ts tests/quote-emails.test.ts`: 2 files, 94 tests passed (59 in the new file: 29 invoice, 22 remainder request, 8 email locales). Also green: `payment-state-writers-gate`, `admin-quotes-lifecycle`, `quote-copy-i18n` (197 tests).
- Mutation checks: dropping the `invoice_paid_at IS NULL` compare-and-set fails the concurrent-calls test; disabling the 10-minute guard fails 2 tests.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`.
- `npx eslint --quiet` on all 5 touched files: clean.
- Acceptance greps: `invoice_paid_at` in invoice.ts 7, `mintQuoteLink` 4. No `€` in the new source files.
- No test failed to load through the symlinked `node_modules`.
- The `verify` skill was not invoked as a separate step; its gates (tsc, eslint, tests, price and secret checks on the changed files) were run by hand as listed.

## Deviations from Plan

**1. [Rule 2 - correctness] Replay repair.** The plan says a second mark-paid with the same number is 200 with no change. It is, but it also finishes bookings an interrupted first call did not reach (quote updated, bookings not): without it a crash between the two writes would leave the quote paid and a trip unpaid with no way to fix it (a different number is refused). When nothing needs repair it is a pure no-op (`changed: false`, no new event).

**2. Event order for remainder-request.** The plan says every action writes `admin_action` before acting; remainder-request writes it after the refusals and before the link is minted (so a refused request leaves no event). Its key is per request (random uuid), because each attempt is an audit row; invoice-paid uses one key per quote.

**3. `remainder_requested` is recorded after a successful send**, not before: recording first would hold the 10-minute guard after a failed send and block the retry the 502 invites. Consequence: two requests landing in the same instant can both pass the guard and send two emails (two links, both valid). Judged acceptable for a low-severity flooding threat (T-92-78) that needs an admin session; a database claim would need a non-append-only ledger.

**4. Order of the first two refusals.** Method before paid state: an unpaid invoice quote is `not_paid`, an unpaid saved-card quote is `not_invoice` (the plan lists both without an order).

TDD note: tests and code were written in one pass per task against the real modules and the in-memory payments database; mutation checks above stand in for a captured RED run.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-92-76 (guard order, admin id on both events), T-92-77 (method and due checks with 422 reasons) and T-92-78 (10-minute guard) are covered by tests.

## Notes for the orchestrator

- Nothing outside the five planned files changed; `lib/stripe-webhook/dispatch.ts`, `lib/payments/tick.ts`, `lib/quotes/cancel.ts` and `messages/*.json` are untouched.
- Plan 92-25 (admin UI) can call: `POST .../invoice-paid { invoice_number }` -> `{ changed }` or 422 `reason` in `not_invoice | not_paid | number_conflict`; `POST .../remainder-request {}` -> `{ amountMinor }`, 422 `reason` in `not_payment_link | not_paid | nothing_due`, 429 `recently_sent`, 502 `email_failed`.
- `readRemainderDue(supabase, quoteId, versionId)` is exported from `lib/quotes/invoice.ts` if the UI or 92-23 want the same "amount due" number.
- A remainder request does not look at an in-flight remainder PaymentIntent (92-23's side): a client who is paying at that moment can still get the email. No money is affected.

## Self-Check: PASSED

- Files exist: lib/quotes/invoice.ts, lib/quotes/emails/remainder-due.ts, both routes, tests/admin-quote-invoice-route.test.ts.
- Commits ae83d6f4 and a5109807 are on the branch.
