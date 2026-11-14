---
phase: 92-quotes
plan: 11
subsystem: payments
tags: [quotes, cancel, money, manage-link, security]
requires: ["92-01"]
provides:
  - "CancelBookingInput.suppressClientEmail in lib/payments/cancel.ts"
  - "quote rule in cancelBooking: a booking with quote_id is always a free cancel on the trip side (D-11, D-12)"
  - "quote_id condition in isEligibleBooking of lib/manage-link.ts"
affects: [92-22]
key-files:
  modified:
    - lib/payments/cancel.ts
    - lib/manage-link.ts
    - tests/payments-cancel.test.ts
    - tests/manage-link.test.ts
key-decisions:
  - "The quote rule sets outcome = 'free' right after the policy evaluation and before the client acknowledge compare, so the whole existing free path (release hold, refund collected card money, status only for quote/manual modes) runs unchanged; no new money code"
  - "The client_token limits (too_late after pickup, partner, on_board) stay in front of the quote rule"
  - "suppressClientEmail silences every client cancel email (free, refunded, released, partner, and the late notice of a non-quote booking); driver and operator notices are unchanged"
requirements-completed: [QUOTE-04, QUOTE-05]
status: complete
duration: ~25min
completed: 2026-11-14
estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: 841fef416f81f31534b145f82a956d63e47cfa17
commits: 2
---

# Phase 92 Plan 11: Cancel engine for quote trips Summary

A trip of a quote is always free on the trip side, a quote-level cancel can silence the per-trip client emails, and quote trips get no manage links.

## What was built

- **Task 1 (tracer)** - `lib/payments/cancel.ts`: `quote_id` added to the booking read; after the outcome evaluation a non-null `quote_id` forces `outcome = 'free'`, so no fee case is opened, nothing is kept and the hold is released / a saved card stays uncharged / a quote-mode trip only changes status. `suppressClientEmail?: boolean` on `CancelBookingInput` turns every client cancel mail (one `clientMail` wrapper over `scheduleCancelRouteEmail`) into a no-op. Commit `bdd5942d`.
- **Task 2** - `lib/manage-link.ts`: `isEligibleBooking` refuses a booking with `quote_id`; `ensureManageToken` reads `quote_id` and returns null with no token row. Commit `841fef41`.

## Tests

- `tests/payments-cancel.test.ts`: D-11 tracer (late admin_client, authorized hold released, no case, free mail), control (same cancel without quote_id still keeps the hold and opens a case), card_saved, cash_guarantee, quote mode (no Stripe call), cancel after pickup, client too_late preserved, suppressClientEmail on hold / saved card / quote mode / partner / refund and on a non-quote late cancel (case still opened, no mail).
- `tests/manage-link.test.ts`: quote trip gets no token; `quote_id: null` keeps eligibility.
- Green: payments-cancel, payments-cancel-notices, admin-bookings-cancel, manage-booking, manage-link, payments-policy-lifecycle, payments-paynow-money, payments-engine-gates, payments-emails, email-policy-block, confirmation-page-i18n.

## Deviations from Plan

None to the behaviour. Notes:
- `tests/manage-page.test.tsx` and `tests/manage-actions.test.tsx` fail to LOAD in this worktree (`next-intl/.../server.react-server.js` not found through the symlinked node_modules): the known worktree artefact, not a regression. They should be re-run on the integrated branch.
- The per-plan commit ledger file could not be written (shared git dir is outside the worktree); `plan_head_before` was taken from HEAD before the first commit and `commits` measured with `git rev-list --count`.

## Verification

- `npx tsc --noEmit`: no errors outside `tests/` (no new errors).
- `npx eslint --quiet` on the four touched files: clean.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Both commits exist (`bdd5942d`, `841fef41`); `grep -c suppressClientEmail lib/payments/cancel.ts` = 3; `grep -c quote_id lib/manage-link.ts` = 2.
