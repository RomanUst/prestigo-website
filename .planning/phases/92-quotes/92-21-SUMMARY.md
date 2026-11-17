---
phase: 92-quotes
plan: 21
subsystem: payments
tags: [quotes, email, resend, qstash, accounting, idempotency]
requires: ["92-18", "92-31", "92-13", "92-29"]
provides:
  - "lib/quotes/convert.ts: runQuotePaidEffects(quoteId), called by applyQuoteDepositPaid after a converted or replayed outcome"
  - "lib/quotes/emails/confirmed.ts: renderQuoteConfirmedEmail"
  - "lib/quotes/emails/accounting.ts: renderQuoteAccountingEmail"
affects: [92-20, 92-23]
tech-stack:
  added: []
  patterns:
    - "send THEN record: each effect is claimed by a quote event key, each email carries a Resend idempotency key derived from the quote id"
    - "re-read the quote before every client-facing step (W2)"
key-files:
  created:
    - lib/quotes/emails/confirmed.ts
    - lib/quotes/emails/accounting.ts
    - tests/quote-convert-effects.test.ts
  modified:
    - lib/quotes/convert.ts
    - tests/quote-convert.test.ts
key-decisions:
  - "Event keys: invoice_requested, email:accounting, alert:quote_paid (claimed inside sendQuoteOperatorAlert), email:confirmed, reminders; a failed email is recorded under <key>:failed so a later delivery retries it"
  - "Resend keys: quote-confirmed:<quoteId>, quote-accounting:<quoteId>"
  - "The accounting copy carries the client name and the billing details, never the client email address or phone number"
  - "Reminders are awaited (scheduleQStashReminder never throws) instead of after(): the event row is written only after the calls were made"
requirements-completed: [QUOTE-04, QUOTE-05]
status: complete
duration: ~1h
completed: 2026-11-14
estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 2
  confidence: low
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: e1703b4a7a903c72afee31bbb28aa6d6919e353d
plan_head_after: 0c980e917e8a99d32732d829b5301b2bbb5bf41d
commits: 2
---

# Phase 92 Plan 21: What happens after the deposit is paid Summary

A paid quote deposit now produces exactly one client confirmation (all 8 locales, from `QuoteEmails.confirmed`), one English accounting copy, one `quote_paid` operator alert and the usual 2-hour QStash reminder per booking, each at most once under webhook redelivery and tick reconcile.

## What was built

- **Task 1 (tracer, e164aeae).** `runQuotePaidEffects` in `convert.ts`, called through `finishQuotePaid` for the `converted` outcome and for both `replayed` paths (the recorded-intent early return and the database's `first_time = false`). An effects failure is caught and logged with the quote id only; the conversion result is returned either way, so the webhook never answers 500 for a converted quote. `renderQuoteConfirmedEmail` builds the confirmation through the shared shell: deposit received, one line per booking (reference, long date, time, route), the remainder sentence of the method, the Prague-time note. `saved_card` and `cash` use the remainder of the live lines, `payment_link` and `invoice` use `remainderDueMinor`; a zero remainder says "fully paid". No waiting amount and no per-trip price appears; only the saved-card sentence mentions the card.
- **Task 2 (0c980e91).** `renderQuoteAccountingEmail` (English HTML, every value escaped): reference, client name, billing name / address / company id / VAT id / note, deposit, receipt date in Prague time, currency, Stripe payment id, remainder method, total, and a per-trip table with amount, deposit share and remainder. For the invoice method the subject and body start with "Invoice requested" and `quotes.invoice_requested_at` is set once (`.is('invoice_requested_at', null)`) with an `invoice_requested` event. The operator alert reuses `sendQuoteOperatorAlert('quote_paid')` (amount = deposit). Reminders call `scheduleQStashReminder(bookingId, pickupMs)` per non-cancelled booking and record `reminders`.
- **W2.** Before the confirmation and before the reminders the quote is read again; a quote with `cancelled_at`, `voided_at` or `anonymised_at` gets neither. The invoice record, the accounting copy and the operator alert are still completed.

## Verification

- `npx vitest run` on 16 files (quote-convert-effects, quote-convert, quote-webhook, quote-emails, quote-events, quote-stripe-vocabulary, quote-refund-observed, payments-tick, payments-failure, payments-fee-webhook, payments-review-engine, extra-webhook, webhooks-stripe-payments, payment-state-writers-gate, status-writers-gate, booking-status-parity): 477 passed. `quote-convert-fake`, `quote-cancel`: green.
- `tests/quote-convert-effects.test.ts`: 19 tests. Mutation check: the cancelled-quote guard disabled makes the W2 test fail.
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/`. `npx eslint --quiet` on the five touched source and test files: clean.
- Nothing ran against live Resend, QStash, Stripe or Supabase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] quote-convert.test.ts (92-18) counted mails the conversion now sends**
- **Found during:** Task 1 and Task 2
- **Issue:** the file asserts exact Resend call counts and `alert_sent` counts after a conversion; the confirmation, the accounting copy and the `quote_paid` alert are new traffic. It also had no QStash double (a real publish would have been attempted from Task 2 on).
- **Fix:** `paidQuote()` clears the Resend mock after the first conversion; the convert-failed retry counts only `quote_convert_failed` mails; the orphan test counts only `alert:quote_orphan_refunded` events; `@/lib/qstash` is mocked. No assertion about money was changed.
- **Files modified:** tests/quote-convert.test.ts
- **Commits:** e164aeae, 0c980e91

**2. Reminders awaited, not scheduled with `after()`.** The webhook, the tick and the manual flows use `after()`, but `after()` cannot tell whether the call happened and throws outside a request scope. The reminder step awaits `scheduleQStashReminder` (it never throws) and writes the `reminders` row afterwards. A crash between the calls and the row would schedule the reminders twice; the cron route skips a booking whose reminder flag is set, and QStash is the only layer without a dedup key (`lib/qstash.ts` is outside this plan's files).

## Known limits (for the orchestrator)

- A failed step (Resend down, ledger unreadable) is recorded and logged but nothing retries it later on its own: the tick reconciles only unpaid quotes and Stripe is answered 200. A later redelivery or a manual replay of the deposit finishes the missing steps. A follow-up could let the tick re-run `runQuotePaidEffects` for paid quotes with a missing key.
- `ACCOUNTING_EMAIL` is read from the environment (optional, falls back to `MANAGER_EMAIL`); it is not yet listed in `.env.example` or Vercel (owner: set it in prestigo-site Production if a separate mailbox is wanted).
- PDF attachment: not attached (plan 92-20 is not merged). The seam is the comment above `renderQuoteConfirmedEmail` in `runQuotePaidEffects`: pass `attachments` to `sendQuoteEmail`; the Resend key and the event key stay the same.
- `quoteUrl` is passed as `null`: only the hash of the quote link is stored, so a new link cannot be shown here; the client has the link from the quote email, and the remainder-due email (92-24) mints one when needed.

## Known Stubs

None.

## Threat Flags

None. The accounting mail is the only new outbound path with personal data; it goes to the business's own mailbox and carries no client email address or phone number. Logs carry quote ids, step names and codes only (T-92-68).

## Self-Check: PASSED

- lib/quotes/emails/confirmed.ts, lib/quotes/emails/accounting.ts, tests/quote-convert-effects.test.ts: present
- Commits e164aeae and 0c980e91: present on branch worktree-agent-a7048e359ff3d5d61
