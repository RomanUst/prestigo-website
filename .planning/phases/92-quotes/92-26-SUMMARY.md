---
phase: 92-quotes
plan: 26
subsystem: admin-ui
tags: [quotes, admin-ui, money, refunds, cancel, invoice, remainder, tdd]
requires: [92-25, 92-22, 92-24]
provides:
  - "components/admin/quotes/QuoteCancelDialog.tsx: QuoteCancelDialog (data-testid quote-cancel-dialog): cancel a paid quote with the refund decision"
  - "components/admin/quotes/QuoteRefundDialog.tsx: QuoteRefundDialog (data-testid quote-refund-dialog): partial refund of the deposit or a paid remainder"
  - "components/admin/quotes/InvoicePaidDialog.tsx: InvoicePaidDialog (data-testid invoice-paid-dialog): mark an invoice paid"
  - "QuoteActionsBar money actions: quote-action-cancel, quote-action-refund, quote-action-invoice-paid, quote-action-remainder"
affects: [92-31]
key-files:
  created:
    - components/admin/quotes/QuoteCancelDialog.tsx
    - components/admin/quotes/QuoteRefundDialog.tsx
    - components/admin/quotes/InvoicePaidDialog.tsx
    - tests/quote-money-dialogs.test.tsx
  modified:
    - components/admin/quotes/QuoteActionsBar.tsx
    - lib/quotes/store.ts
    - tests/quote-actions-bar.test.tsx
key-decisions:
  - "The cancel dialog never decides free or late itself: it loads GET cancel?initiator=..., states the server's outcome, and the 'Prestigo cancels' switch asks the server again with admin_prestigo"
  - "Late refund input is bounded by deposit minus already refunded (from the preview), typed in the quote currency, 0 allowed, sent as minor units; free sends refund_minor null"
  - "Refund stays available on a cancelled quote while something is refundable (retry of a failed cancel refund, 92-22 notes); Cancel quote is hidden there and disabled once a booking is in a started status"
  - "Send remainder request goes through the bar's confirmation dialog (amount named before the request), like Send / Resend in 92-25"
  - "Amount due for the button is computed in the browser with remainderDueMinor (lib/quotes/money, client-safe) over the detail's lines and bookings; the server stays the authority (nothing_due)"
status: complete
completed: 2026-11-16
estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low
actuals:
  tokens: 26000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 9ad438a13a09cf05370e465fdce7f07a97f7a21d
plan_head_after: 6c8b4741815e6a4393ba96c986d54960533a735c
---

# Phase 92 Plan 26: Admin money dialogs of a paid quote Summary

On a paid quote the operator can cancel it knowing exactly what is refunded and what is kept, return part of the deposit or of a remainder paid on the page, mark an invoice paid under its number, and email a payment-link client the amount still due, each from a dialog that states the money effect before anything is sent.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | 88d6ece7 | cancel a paid quote with the stated refund outcome |
| 2 | e7e403e0 | partial refund of a paid quote from the admin quote page |
| 3 | 6c8b4741 | mark invoice paid and send remainder request on a paid quote |

## What was built

- **QuoteCancelDialog (D-03, D-11, D-13)**: loads the preview on open. Free: "Free. The deposit of X is refunded in full." (or the rest of it when earlier refunds exist); late: "Late. Under this quote's terms the deposit of X is kept." (or "Y of the deposit of X") with a refund input prefilled with the proposed refund, an "At most X" bound that disables the button; a paid remainder is stated as refunded in full; a total line ("Refunded to the client's card now ... Kept by Prestigo ..."). Operator-only and trips-started rules are stated in the dialog and under the bar button (button disabled once a booking is en route / on location / on board / completed / no show). Error sentences: 422 `trips_started`, `already_cancelled`, `not_paid`, `refund_out_of_range` (preview reloads), 409 `busy` (a second try finishes), 404, 401/403, 400/413, 5xx (may have partly completed). `refundFailed: true` keeps the cancel, shows "Cancelled. The refund failed - the operator alert has the details." with Close only, and refetches.
- **QuoteRefundDialog (D-12)**: Deposit and, when a remainder was paid through Stripe on the page, Remainder; shows paid, refunded before and the bound; amount typed in the currency, button "Refund <amount>", one POST `{ source, amount_minor }`; sentences for 422 `out_of_range`, `not_paid`, 502 `refund_failed`, 404, 5xx.
- **InvoicePaidDialog (D-17)**: invoice number required (trimmed, one line, 60 characters), states "No card is charged and no email is sent", sentences for `not_invoice`, `not_paid`, `number_conflict`, 400, 5xx; after success the bar shows "Invoice N is marked paid."
- **Remainder request (D-16)**: "Send remainder request (amount)" for paid payment-link quotes with an amount due; the confirmation names the amount, the recipient and the language; sentences for 429 `recently_sent` ("A request was sent less than 10 minutes ago."), `nothing_due`, `not_payment_link`, `not_paid`, 502 `email_failed`; success shows "Request sent. ..." .
- **Dialog rules (all dialogs)**: in-flight ref, cannot be dismissed (Escape, scrim, Go back) while running, clean on reopen, one request on a double click, page refetch after success.
- **Mount**: the bar is rendered by QuoteBuilder, which the real page renders; `tests/quote-money-dialogs.test.tsx` renders the real page (`app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx`) and drives the dialogs through it.

## Verification

- `npx vitest run tests/quote-money-dialogs.test.tsx tests/quote-actions-bar.test.tsx tests/quote-builder.test.tsx tests/admin-no-hardcoded-colors.test.ts` plus every test that imports `lib/quotes/store`: 5 files, 192 tests passed (50 in the new file).
- `npx tsc --noEmit`: only the 8 old baseline errors in `tests/`.
- `npx eslint --quiet` on the three dialogs, the bar, `lib/quotes/store.ts` and the new test: clean.
- Mutation checks: removing the in-flight guard in the cancel, refund or invoice dialog fails the double-click tests (both clicks are delivered in one `act` scope so the disabled button cannot mask it; a first version of the tests with two `fireEvent.click` calls did NOT catch the mutation and was replaced).
- Acceptance greps: `QuoteCancelDialog` in the bar 2, `/refund` in QuoteRefundDialog 1, `remainder-request` in the bar 1, `InvoicePaidDialog` in the bar 2. No euro sign in the new source files.
- No test failed to LOAD through the symlinked node_modules. Browser check skipped (admin login needs a session; covered by the real-page render tests).
- The `verify` skill was not invoked as a separate step; its gates (tsc, eslint, tests, price check) were run by hand.

## Deviations from Plan

**1. [Rule 3 - blocking] Existing test `tests/quote-actions-bar.test.tsx` edited.** The assertion "a paid quote shows no Cancel quote and has the money note" described the 92-25 stub that this plan replaces. It now asserts no Edit, no void action, the paid Cancel quote present and the note gone. All other 49 tests untouched and green.

**2. [Rule 3] `lib/quotes/store.ts`:** the quote detail's bookings now select `paid_at` and the type has an optional `paid_at` (not in the plan's file list). The page needs it to compute the amount due for the remainder request button with the same rule as the server (`remainderDueMinor` skips paid trips). Additive; no other consumer changed.

**3. Send remainder request opens a confirmation** (plan: "it posts once and shows Request sent"): the orchestrator rule that every dialog names the money effect first took precedence; the request still goes out once, from the dialog's primary button, and "Request sent" is shown after it.

**4. Refund on a cancelled quote** (not in the plan): offered while something is refundable, because 92-22 documents that this is how a failed cancel refund is retried.

**5. Cancel quote is disabled when a booking has started** (not in the plan): the server refuses it anyway (`trips_started`); the button states it up front.

TDD note: tests were written together with the code per task (the modules did not exist); the mutation checks above stand in for a captured RED run.

## Known Stubs

None. The 92-25 `quote-money-note` stub is removed.

## Threat Flags

None beyond the plan's register. T-92-81 (UI bound, disabled button; server bound stays authoritative) and T-92-82 (in-flight ref proved by mutation) are mitigated; T-92-SC accepted, no package installed.

## Notes for the orchestrator

- No migrations, no env, no Vercel steps. `lib/stripe-webhook/dispatch.ts` still needs the `observeQuoteRefund` call noted by 92-22 (owned by 92-31); not touched here.
- Only Stripe-collected money has a payment to refund: a remainder paid by cash or marked paid on an invoice does not show a Remainder refund source.

## Self-Check: PASSED

- Files exist: QuoteCancelDialog.tsx, QuoteRefundDialog.tsx, InvoicePaidDialog.tsx, tests/quote-money-dialogs.test.tsx; modified QuoteActionsBar.tsx, store.ts, quote-actions-bar.test.tsx.
- Commits 88d6ece7, e7e403e0 and 6c8b4741 are on the branch.
