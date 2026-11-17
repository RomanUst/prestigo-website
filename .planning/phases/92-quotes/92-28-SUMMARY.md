---
phase: 92-quotes
plan: 28
subsystem: quotes / phase close (integration test, quality gate, live proofs)
status: complete
tags: [quotes, e2e, stripe, webhook, quality-gate]
requires: ["92-10", "92-12", "92-21", "92-26", "92-27", "92-30", "92-32"]
provides:
  - "tests/phase92-e2e.test.ts: one quote from the builder to a refunded cancel through the real admin, public and webhook routes"
  - "Phase 92 quality gate report (full suite, tsc, eslint on every phase file, verify pre-pr incl. build)"
affects: []
tech-stack:
  added: []
  patterns:
    - "cross-plan e2e: one hoisted world (payments fake + fake Stripe) behind every route; @/lib/supabase mocked with importActual + overrides so the webhook legacy exports, the admin store and the cancel engine share one fake"
    - "next/server after() collected and awaited by the test, test clock and fake DB clock moved together (setNow)"
key-files:
  created:
    - tests/phase92-e2e.test.ts
    - .planning/phases/92-quotes/deferred-items.md
  modified: []
decisions:
  - "The claim step uses the real claimDueHolds wrapper (claim_due_payment_work in the fake), as the plan says, not the full payment tick; the cancel runs after the claim's 60 s lease has lapsed, so the cancel engine's lapsed-lease path (voidHoldAttempt + release) is part of the proof."
  - "Line 1 is saved at the server suggestion (284 EUR, not overridden), line 2 at 180 EUR (overridden); with 30% both lines keep a remainder, so both become card_hold / card_saved (the quote-mode branch for a zero remainder stays covered by tests/quote-webhook.test.ts)."
  - "No production code changed: every plan's contract held end to end on the first run."
metrics:
  duration: "~35 min"
  completed: 2026-11-16
estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 7400
  tasks: 2
  commits: 2
plan_head_before: 7d8e9f854597a63265a016f88a9fad1a3cc4c2d4
plan_head_after: 151258c9333641d0c2819e9c262c290ec266506e
---

# Phase 92 Plan 28: Phase close, e2e integration test and full quality gate Summary

One integration test now drives a quote through the real routes of every Phase 92 plan, from the operator's builder to a refunded cancel. The full gate is green: no real test failures, type check at baseline, lint clean, verify pre-pr PASS including the build. Task 3 (owner live proofs on production) is done: see "Task 3: live proofs (2026-11-17)".

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | One integration test from the builder to a refunded cancel | 3a5a5ae3 | tests/phase92-e2e.test.ts |
| 2 | Full suite, type check, lint and the verify skill in pre-pr mode | 151258c9 | .planning/phases/92-quotes/deferred-items.md (no code change needed) |
| 3 | [BLOCKING, human-action] Owner and orchestrator live proofs on production | pending | n/a |

## Task 1: what the test proves (tests/phase92-e2e.test.ts, 1 test, passes)

The test runs these real handlers: `app/api/admin/quotes/route` (POST), `[id]/route` (PATCH), `price/route`, `[id]/send/route`, `[id]/revise/route` and `[id]/cancel/route`, plus `app/api/quote/view`, `accept` and `state`, `app/api/webhooks/stripe/route`, `classifyPaymentEvent` and `claimDueHolds`. Behind them it uses the payments fake (`quote_convert_to_bookings`, `claim_due_payment_work`), the fake Stripe, and mocks for Resend, Google Routes, the tariffs, `renderQuotePdf`, the admin session, the rate limiter and the webhook signature.

1. **Builder.** The test creates a draft. The price route suggests 28400 for line 1 (130 km from the mocked route plus 2 waiting blocks). PATCH saves line 1 at that price with one stop (Brno, 45 min), so `price_overridden` is false. Line 2 is saved at 18000, so `price_overridden` is true. Deposit is 30%, remainder method saved_card, 48 free hours.
2. **Send.** Version 1 is frozen: total 46400, deposit 13920, shares [8520, 5400], remainders [19880, 12600]. One link is created and only its hash is stored (the raw token is nowhere in the DB). One client email goes out with `Prestigo-quote-<ref>-v1.pdf` attached, byte-identical to what the mocked renderer returned.
3. **View.** The quote becomes `viewed`, with exactly one viewed event.
4. **Accept.** The accept call sends the version number and deposit the page showed, plus consent. The route answers with a client secret for 13920 EUR. One acceptance row is written and the quote becomes `accepted`. One PaymentIntent is created with `setup_future_usage: off_session` and kind `card_quote_deposit`. `/api/quote/state` answers accepted with no booking references yet.
5. **Deposit.** The fake intent is set to succeeded (`pm_ok`). `classifyPaymentEvent` routes the event to `quote_deposit_paid`, and the real webhook answers 200. The conversion runs once (actor webhook, event id), and none of the legacy booking chain is called.
   - The quote is `paid` and has two bookings, both `card_hold` / `card_saved`, with the right `hold_at` (computeHoldAt, 72 h), `quote_id` and `quote_line_id`, `payment_intent_id` null and `stripe_payment_method_id` `pm_ok`.
   - Booking 1 carries the Brno stop and booking 2 has none.
   - The quote events include sent, viewed, accepted, deposit_started, deposit_paid and converted.
   - The client gets exactly one confirmation email, and `/api/quote/state` answers paid with both booking references.
6. **Replay.** The same event is answered as `duplicate`, and a new event id for the same intent is answered as replayed. Bookings, stops and quotes are byte-identical afterwards: no second conversion, no extra mail, no refund.
7. **Claim.** One minute before trip 1's `hold_at` the claim returns nothing. One minute after, it returns only trip 1 (now `placing_hold`); trip 2 is still `card_saved`.
8. **Revise.** A second quote is sent and viewed, then revised. Its draft is back, and the first URL now gets a 404 `invalid_link` from `/api/quote/view`.
9. **Cancel.** The cancel runs inside the free window, after the claim lease has lapsed, with `initiator: admin_client` and `refund_minor: null`. It answers `{ok, outcome: free, refundedMinor: 13920, refundFailed: false}`.
   - Both trips are cancelled, with no fee cases and no per-trip email.
   - There is exactly one `refunds.create`, for the whole deposit, under `refund:quote:<id>:deposit:13920`, and no PaymentIntent is created.
   - The quote records `cancel_outcome: free` and `deposit_refunded_minor: 13920`, with one deposit_refunded event.
   - The client gets one cancellation email with the amount.
   - A second click answers 422 `already_cancelled`, and the refund count stays at 1.

**TDD note:** this tracer is an integration test over existing code. It passed on its first run, so there was no RED phase, and no production code was needed.

## Task 2: quality gate results

### Full suite
`npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'` (run in the worktree):

```
 Test Files  10 failed | 455 passed | 3 skipped (468)
      Tests  2 failed | 14898 passed | 11 skipped | 138 todo (15049)
```

None of the 10 failed files is a real failure:

- **8 files failed to load because of the known worktree artefact.** Each one gets `ERR_MODULE_NOT_FOUND` for `node_modules/next-intl/dist/esm/development/server.react-server.js` (the `next-intl/server` mock does not resolve through the symlinked node_modules). **The orchestrator should re-run these in the main checkout:**
  - tests/account-trips.test.tsx
  - tests/auth-customer.test.ts
  - tests/login-actions.test.ts
  - tests/manage-actions.test.tsx
  - tests/manage-page.test.tsx
  - tests/passenger-actions.test.ts
  - tests/profile-actions.test.ts
  - tests/quote-page.test.tsx (the only Phase 92 file among them)
- **2 tests are the known flakes under parallel load.**
  - Under load: `tests/quote-builder.test.tsx` ("a quote of 19 trips takes one more, and at 20 the Add trip button is gone") failed, and so did `tests/seo-volume-pages.test.ts` ("sitemap > lists every mirror route and landing page").
  - Alone: `npx vitest run tests/quote-builder.test.tsx tests/seo-volume-pages.test.ts` gave `Test Files 2 passed (2), Tests 78 passed (78)`.

### Type check
`npx tsc --noEmit`: 8 errors, all in the baseline (tests/nav-auth.test.tsx x5, tests/i18n-translate-dnt.test.ts x2, tests/passenger-actions.test.ts x1). The plan's filter command counts **0** errors outside the baseline.

### Lint
`npx eslint --quiet` over every .ts/.tsx file the phase changed (203 files, the union of `main...HEAD` and the skill's `merge-base origin/main`): **0 errors**. Neither not-found.tsx file is in the phase diff.

### verify skill (pre-pr mode, steps 1-7)

```
VERIFY: PASS        (pre-pr, 203 changed ts/tsx files)
Types:      OK (8 baseline errors only, 0 new)
Lint:       OK (0 errors on all 203 phase files)
Tests:      full suite run (pre-pr): 14898 passed; 0 real failures (8 worktree-only load errors listed above, 2 known flakes green alone)
Invariants: OK
            price check (no hard-coded euro amount, i.e. € followed by 2+ digits, in app/ or components/, pre-commit logic): PASS (0 files)
            secrets: PASS (pre-commit SECRET_RE over the added lines of main...HEAD: 0 hits); no .env* file in the phase diff
            middleware.ts: only CSRF prefixes for /api/quote added; matcher untouched (static extensions still excluded)
            new API routes: every app/api/admin/quotes/** route calls getAdminUser (and enforceMaxBody/readCappedJson on body methods; pdf-check is GET only); every app/api/quote/** route calls checkRateLimit and answers no-store
            JSON-LD snapshots: no phase change touches them
i18n:       OK - en has 126 new keys; ar, es, fr, hi, ru, zh and zh-hant have every en key (0 missing), 0 [XX] stubs, 0 English copies among the new keys
Browser:    skipped (no browser in the executor, per instructions; owner UAT is Task 3 step 7)
Build:      OK - `npm run build` exit 0, "Compiled successfully", the /api/quote/* routes and /api/webhooks/stripe in the route list
```

**verify: PASS**

### Real defects found and fixed
None. Every plan's contract held end to end, and Task 2 found no regression.

## Deviations from Plan

- **The build created files outside the plan's scope.** `npm run build` runs the `prebuild` zh-hant sync, which generated three untracked `content/blog/zh-hant/*.mdx` files: zh-hant copies of blog posts that came in from main. They are not quote code, so they were removed from the worktree, not committed, and logged in `deferred-items.md`. A pre-existing Turbopack warning on `lib/lastmod.ts` (not a phase file) is logged there too.
- **No code change in Task 2.** Its commit carries only `deferred-items.md`.

## Task 3: CHECKPOINT (blocking-human, pending owner)

The owner and the orchestrator still have to do Task 3 on production. It is not attempted here.

- **Precondition, unchanged:** 091 is live (92-12), 92-32 holds the D-14 production decision, and the owner has merged the phase PR so production runs this code.
- **Steps:** follow 92-28-PLAN.md Task 3, steps 2-8.
  - A saved-card canary quote to the owner's own email in ru: receive it with the PDF, open it on a phone, accept, pay a small deposit on the owner's card. Then check admin (list, board, calendar, "From quote" chip), check the bookings with the Supabase MCP, and do a free cancel with the deposit refund.
  - A payment-link canary: pay the remainder on the quote page, then refund both payments through the Refund dialog.
  - UAT of the quote page in en, ru, ar and zh-hant, plus the admin builder.
  - The counsel review of the four `Quote.consent.*` texts and the accountant's answer on research Q4.
- **To record here when done:**
  - both canary references
  - canary 1's bookings `payment_mode` / `payment_state` rows and the MCP query results
  - the Stripe refund confirmations
  - the owner's UAT notes
  - the counsel / accountant answers, or "pending"
  - the owner's "live proofs done"
- **Optional user setup:** `ACCOUNTING_EMAIL` in Vercel Production (without it, `MANAGER_EMAIL` receives the deposit copies).

## Self-Check: PASSED

- FOUND: tests/phase92-e2e.test.ts
- FOUND: .planning/phases/92-quotes/deferred-items.md
- FOUND: 3a5a5ae3 (test(92-28)), 151258c9 (chore(92-28))

## Task 3: live proofs (2026-11-17), done

Production runs the phase code: PR #116 (merge d18f452d) and PR #117 (f90e4b71, see below). Owner's own email and card only, small amounts. Rows checked by the orchestrator through the Supabase MCP.

**Canary 1: saved card, Q-20261117-1R96ZT** (en; total 138.00, deposit 13.80)
- Events: created → sent → link_minted → email_sent (PDF stored, 183 638 bytes, byte_size = length) → viewed → accepted → deposit_started → deposit_paid → converted → accounting email → operator alert → confirmation email → reminders.
- Two bookings, PRG-20261117-575FE9 and PRG-20261117-68C20A: card_hold, quote_line_id set, deposit share 690 each, hold_at 72 h before pickup, payment_intent_id null. Ledger: quote_deposit 690 + 690.
- The owner cancelled both trips from Bookings (cancel_prestigo). Holds were released and cancellation emails sent. The deposit stayed with the quote (D-11/D-12). The owner then refunded it from the quote page: deposit_refunded and refund_observed are both recorded, and Stripe confirmed.

**Canary 2: payment link, Q-20261117-TDP64Q** (en; total 10.00, deposit 1.00, remainder 9.00)
- deposit_paid → converted (1 booking) → confirmation email → remainder_started → remainder_paid on the quote page → cancel with refund → deposit_refunded, remainder_refunded, refund_observed ×2, cancellation email. Owner confirmed: "бронь отменена и деньги вернули".

**Found in the proofs and fixed:** the confirmation email told a payment-link client to pay "on your quote page" but had no link to it. PR #117 makes the conversion mint a system link (created_by null) and adds the "Open your quote" button. Merged and deployed (Vercel success).

**Noted, not changed:**
- iOS mail shows a space before "," and "." after a `<bdi>` value. The stored data has no space, so this is a client rendering quirk.
- When every trip of a paid quote is cancelled from Bookings, nothing reminds the operator that the deposit is still held. This is a possible UX follow-up.
- Both canaries were sent in en, not ru. The ru PDF render was already proven by the pdf-check in 92-32.
