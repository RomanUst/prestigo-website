---
phase: 92-quotes
plan: 25
subsystem: admin-ui
tags: [quotes, admin-ui, lifecycle, secret-link, history, tdd]
requires: [92-13, 92-14, 92-19]
provides:
  - "components/admin/quotes/QuoteActionsBar.tsx: QuoteActionsBar (data-testid quote-actions): state badge, version, link sentence, Send / Copy new link / Resend / Edit / Cancel quote"
  - "components/admin/quotes/QuoteEventsList.tsx: QuoteEventsList (data-testid quote-events): event history and linked bookings"
affects: [92-26]
key-files:
  created:
    - components/admin/quotes/QuoteActionsBar.tsx
    - components/admin/quotes/QuoteEventsList.tsx
    - tests/quote-actions-bar.test.tsx
  modified:
    - components/admin/quotes/QuoteBuilder.tsx
    - tests/quote-builder.test.tsx
key-decisions:
  - "The bar and the history are mounted in QuoteBuilder (which owns the detail and its reload), not in page.tsx: one fetch, one refetch after every action; the real page renders both through the builder"
  - "The state badge and the 'Version N (sent|draft)' line moved from the builder header into the bar (same data-testid quote-version), so there is one of each on the page"
  - "Send, Resend and Edit open a confirmation that names the effect before any request; Copy new link has no dialog (it sends nothing and changes no state) and states its effect under the button instead; Cancel quote reuses QuoteVoidDialog"
  - "Send is disabled while the builder holds unsaved edits (it would send the saved version)"
  - "The secret URL lives only in the bar's React state: shown once with Copy, cleared by Done, by the next action and when the page is left; never stored, logged or put in a URL (test checks storage, console, location, cookies and later request bodies)"
status: complete
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
commits: 2
plan_head_before: e1703b4a7a903c72afee31bbb28aa6d6919e353d
plan_head_after: 79930c82990d1bc8a2ffca23c7c34010fefc00e0
---

# Phase 92 Plan 25: Quote actions bar and history Summary

The operator sees a quote's state, version and what its link does, can send it, copy a fresh link (shown once), resend, edit it into a new version or cancel it, and reads the full event history and the bookings made from it.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 (tracer) | 6e8719ba | quote actions bar - send, copy new link, resend, edit, cancel, one-time URL |
| 2 | 79930c82 | quote history and linked bookings on the quote page |

## What was built

- **Actions by state** (matrix pinned by a test): draft -> Send; sent / viewed / accepted / expired -> Copy new link, Resend, Edit, Cancel quote; paid -> Copy new link only plus a note that the money actions will appear in this bar (92-26); voided / cancelled -> none ("No actions: this quote is closed.").
- **Link sentence (D-02)** under the badge: the client's link works until the operator cancels, the expiry date (Prague) or the first trip; expired and voided states say the link no longer opens.
- **Each action states its effect before anything is sent**: confirmation dialogs for Send ("frozen ... email in English ... secret link"), Resend ("links the client already has keep working") and Edit ("Editing creates version N+1. The client's current link stops working."); a sentence under every button.
- **One-time URL**: after Send, Resend or Copy new link the URL appears in `quote-link-once` with Copy ("Copied", manual-select hint when the clipboard is refused) and Done; it says the previous link stops working when a new version is made. `emailed: false` shows "Email not sent - copy the link to the client".
- **Refusal sentences**: send (`first_pickup_passed`, `not_sendable`, `expired`, `distance_missing`, money reasons `deposit_missing`, `remainder_method_missing`, `terms_invalid`, `no_lines`, `amount_invalid`, `deposit_zero`, `deposit_above_total`, `deposit_below_minimum`, `remainder_below_minimum`, unknown reason fallback, 409 busy, 404, 401/403, 400/413, 5xx), link (`not_live`), revise (`deposit_in_flight`, `busy`, `not_revisable`). Stale answers (404, 422, 5xx) also refetch.
- **Dialog rules**: in-flight ref (double click = one request), Escape / scrim / Go back ignored while running (test with a held request), clean on reopen.
- **QuoteEventsList**: newest first, Prague time, human label for all 31 event kinds, version, amount (`money()` from API data), error code; bookings with reference, payment state badge, status, pickup date. Test feeds events carrying email / phone / address fields and asserts none renders.

## Verification

- `npx vitest run tests/quote-actions-bar.test.tsx tests/quote-builder.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 3 files, 107 tests passed (50 in the new file).
- `npx tsc --noEmit`: only the 8 old baseline errors in `tests/`.
- `npx eslint --quiet` on the bar, list, builder, page and both tests: clean.
- Mutation check: removing the in-flight guard and the dismiss guard fails the "cannot be dismissed ... double click is one request" test.
- Acceptance greps: `/revise` in the bar 1x (`post(quoteId, 'revise', ...)` builds the URL; the literal `/revise` appears in the test), `QuoteEventsList` / `QuoteActionsBar` appear in QuoteBuilder, not in page.tsx (see deviation 1).
- No test failed to LOAD through the symlinked node_modules. Browser check skipped (admin login needs a session; covered by the real-page render test).

## Deviations from Plan

**1. Mount in QuoteBuilder instead of page.tsx** (instruction of the orchestrator; plan 92-25 predates 92-19). The builder owns the detail fetch and its reload, so the bar and the list read the same detail and refetch through `load(true)`. The page file is unchanged; the page test renders the real page and finds `quote-actions` and `quote-events` inside `quote-builder`. The plan's two acceptance greps on page.tsx therefore do not hold literally (they hold on QuoteBuilder.tsx).

**2. [Rule 3] Builder header changed**: the badge and `quote-version` line moved into the bar; `tests/quote-builder.test.tsx` had one assertion "no button inside the builder when read-only" which now excludes the lifecycle buttons of the bar (intent unchanged: no editing controls). All other builder tests pass untouched.

**3. Send and Resend open a confirmation** (plan says "clicking Send posts once"): the orchestrator's rule that every state-changing action states its effect first took precedence; the request still goes out once, from the dialog's primary button.

**4. Unsaved-edit guard** (not in the plan): Send is disabled with a sentence while the draft differs from the saved one, because the send route freezes the stored version.

**5. Plan offers Copy new link and Resend on expired quotes**: followed, with a warning sentence (the link will not open until the expiry date is moved; the server refuses Resend with `expired`, shown as a sentence that points to Edit).

TDD note: tests were written together with the code per task; RED runs were not captured separately (the modules did not exist). The mutation check above stands in.

## Known Stubs

- Paid quote: the sentence "Cancelling with a refund, refunds, marking an invoice paid and asking for the remainder will appear in this bar." (`data-testid quote-money-note`) is an intentional pointer; plan 92-26 replaces it with the real money actions.

## Threat Flags

None. T-92-79 (URL only in component state, shown once, never stored / logged / put in a URL: tested) and T-92-80 (Edit asks with the consequence named: tested) are mitigated; T-92-SC accepted, no package installed.

## Notes for the orchestrator

- Plan 92-26 extends `QuoteActionsBar` for paid quotes: replace the `quote-money-note` paragraph and add its buttons in the `status === 'paid'` branch (`canLink` already covers paid). `QuoteActionsBar` takes `{ detail, unsavedChanges?, onChanged }`.
- No migrations, no env, no Vercel steps.

## Self-Check: PASSED

- Files exist: QuoteActionsBar.tsx, QuoteEventsList.tsx, tests/quote-actions-bar.test.tsx, modified QuoteBuilder.tsx and quote-builder.test.tsx.
- Commits 6e8719ba and 79930c82 are on the branch.
