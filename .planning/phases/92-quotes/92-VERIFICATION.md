---
phase: 92-quotes
verified: 2026-11-17T08:55:00Z
verified_closed: 2026-11-18
status: passed
score: 9/11 must-haves verified (gap closed by PR #118 on 2026-11-18); 2 backstop truths and 4 human items open, deferred by the owner on 2026-11-18 (same practice as Phase 91)
covered_files: [".planning/phases/92-quotes/92-01-PLAN.md",".planning/phases/92-quotes/92-01-SUMMARY.md",".planning/phases/92-quotes/92-02-PLAN.md",".planning/phases/92-quotes/92-02-SUMMARY.md",".planning/phases/92-quotes/92-03-PLAN.md",".planning/phases/92-quotes/92-03-SUMMARY.md",".planning/phases/92-quotes/92-04-PLAN.md",".planning/phases/92-quotes/92-04-SUMMARY.md",".planning/phases/92-quotes/92-05-PLAN.md",".planning/phases/92-quotes/92-05-SUMMARY.md",".planning/phases/92-quotes/92-06-PLAN.md",".planning/phases/92-quotes/92-06-SUMMARY.md",".planning/phases/92-quotes/92-07-PLAN.md",".planning/phases/92-quotes/92-07-SUMMARY.md",".planning/phases/92-quotes/92-08-PLAN.md",".planning/phases/92-quotes/92-08-SUMMARY.md",".planning/phases/92-quotes/92-09-PLAN.md",".planning/phases/92-quotes/92-09-SUMMARY.md",".planning/phases/92-quotes/92-10-PLAN.md",".planning/phases/92-quotes/92-10-SUMMARY.md",".planning/phases/92-quotes/92-11-PLAN.md",".planning/phases/92-quotes/92-11-SUMMARY.md",".planning/phases/92-quotes/92-12-PLAN.md",".planning/phases/92-quotes/92-12-SUMMARY.md",".planning/phases/92-quotes/92-13-PLAN.md",".planning/phases/92-quotes/92-13-SUMMARY.md",".planning/phases/92-quotes/92-14-PLAN.md",".planning/phases/92-quotes/92-14-SUMMARY.md",".planning/phases/92-quotes/92-15-PLAN.md",".planning/phases/92-quotes/92-15-SUMMARY.md",".planning/phases/92-quotes/92-16-PLAN.md",".planning/phases/92-quotes/92-16-SUMMARY.md",".planning/phases/92-quotes/92-17-PLAN.md",".planning/phases/92-quotes/92-17-SUMMARY.md",".planning/phases/92-quotes/92-18-PLAN.md",".planning/phases/92-quotes/92-18-SUMMARY.md",".planning/phases/92-quotes/92-19-PLAN.md",".planning/phases/92-quotes/92-19-SUMMARY.md",".planning/phases/92-quotes/92-20-PLAN.md",".planning/phases/92-quotes/92-20-SUMMARY.md",".planning/phases/92-quotes/92-21-PLAN.md",".planning/phases/92-quotes/92-21-SUMMARY.md",".planning/phases/92-quotes/92-22-PLAN.md",".planning/phases/92-quotes/92-22-SUMMARY.md",".planning/phases/92-quotes/92-23-PLAN.md",".planning/phases/92-quotes/92-23-SUMMARY.md",".planning/phases/92-quotes/92-24-PLAN.md",".planning/phases/92-quotes/92-24-SUMMARY.md",".planning/phases/92-quotes/92-25-PLAN.md",".planning/phases/92-quotes/92-25-SUMMARY.md",".planning/phases/92-quotes/92-26-PLAN.md",".planning/phases/92-quotes/92-26-SUMMARY.md",".planning/phases/92-quotes/92-27-PLAN.md",".planning/phases/92-quotes/92-27-SUMMARY.md",".planning/phases/92-quotes/92-28-PLAN.md",".planning/phases/92-quotes/92-28-SUMMARY.md",".planning/phases/92-quotes/92-29-PLAN.md",".planning/phases/92-quotes/92-29-SUMMARY.md",".planning/phases/92-quotes/92-30-PLAN.md",".planning/phases/92-quotes/92-30-SUMMARY.md",".planning/phases/92-quotes/92-31-PLAN.md",".planning/phases/92-quotes/92-31-SUMMARY.md",".planning/phases/92-quotes/92-32-PLAN.md",".planning/phases/92-quotes/92-32-SUMMARY.md","app/(internal)/admin/(dashboard)/quotes/[id]/page.tsx","app/(internal)/admin/(dashboard)/quotes/page.tsx","app/[locale]/quote/[token]/InvalidQuoteLinkView.tsx","app/[locale]/quote/[token]/QuoteAcceptPay.tsx","app/[locale]/quote/[token]/QuotePdfButton.tsx","app/[locale]/quote/[token]/QuoteRemainderPay.tsx","app/[locale]/quote/[token]/QuoteViewedPing.tsx","app/[locale]/quote/[token]/page.tsx","app/[locale]/quote/done/page.tsx","app/api/admin/quotes/[id]/cancel/route.ts","app/api/admin/quotes/[id]/invoice-paid/route.ts","app/api/admin/quotes/[id]/link/route.ts","app/api/admin/quotes/[id]/refund/route.ts","app/api/admin/quotes/[id]/remainder-request/route.ts","app/api/admin/quotes/[id]/revise/route.ts","app/api/admin/quotes/[id]/route.ts","app/api/admin/quotes/[id]/send/route.ts","app/api/admin/quotes/[id]/void/route.ts","app/api/admin/quotes/pdf-check/route.ts","app/api/admin/quotes/price/route.ts","app/api/admin/quotes/route.ts","app/api/quote/accept/route.ts","app/api/quote/pdf/route.ts","app/api/quote/remainder/route.ts","app/api/quote/state/route.ts","app/api/quote/view/route.ts","components/admin/quotes/InvoicePaidDialog.tsx","components/admin/quotes/QuoteActionsBar.tsx","components/admin/quotes/QuoteBuilder.tsx","components/admin/quotes/QuoteCancelDialog.tsx","components/admin/quotes/QuoteEventsList.tsx","components/admin/quotes/QuoteLineEditor.tsx","components/admin/quotes/QuoteRefundDialog.tsx","components/admin/quotes/QuoteSettingsFields.tsx","components/admin/quotes/QuoteStatusBadge.tsx","components/admin/quotes/QuoteVoidDialog.tsx","components/admin/quotes/QuotesTable.tsx","components/admin/quotes/quoteDraft.ts","lib/quotes/accept.ts","lib/quotes/admin-http.ts","lib/quotes/alerts.ts","lib/quotes/cancel.ts","lib/quotes/consent.ts","lib/quotes/convert.ts","lib/quotes/document.ts","lib/quotes/documents.ts","lib/quotes/emails/accounting.ts","lib/quotes/emails/cancelled.ts","lib/quotes/emails/confirmed.ts","lib/quotes/emails/remainder-due.ts","lib/quotes/emails/remainder-paid.ts","lib/quotes/emails/sent.ts","lib/quotes/emails/shell.ts","lib/quotes/events.ts","lib/quotes/invoice.ts","lib/quotes/lifecycle.ts","lib/quotes/money.ts","lib/quotes/pdf-file-name.ts","lib/quotes/pdf-fonts.ts","lib/quotes/pdf-sample.ts","lib/quotes/pdf.ts","lib/quotes/pricing.ts","lib/quotes/remainder.ts","lib/quotes/resolve.ts","lib/quotes/schemas.ts","lib/quotes/status.ts","lib/quotes/store.ts","lib/quotes/terms.ts","lib/quotes/token.ts","lib/quotes/types.ts","lib/quotes/view.ts","lib/quotes/vocabulary.ts","lib/stripe-webhook/dispatch.ts","lib/stripe-webhook/quote-events.ts","middleware.ts","next.config.ts","supabase/migrations/091_quotes.sql","tests/phase92-e2e.test.ts"]
covered_digest: "v2:sha256:24280d7921cfc72fd80c3e12c274f03679a742f9963f9cb15a1a02a770cab049"
behavior_unverified: 0
overrides_applied: 0
gaps: []
gaps_closed:
  - truth: "type check at baseline (92-28 gate)"
    fix: "tests/quote-convert-effects.test.ts:243 .exec(mail.html ?? \"\"); npx tsc --noEmit = 8 baseline errors; the test passes 19/19"
human_verification:
  - test: "Quote page UAT: open a live quote in en, ru and ar on desktop and on a phone, and a zh-hant quote once; also walk through the admin builder (92-28 Task 3 step 7)"
    expected: "Itemised trips, total, deposit, remainder, terms, PDF button and accept area read clearly. ar is right-to-left, with dates, times and references isolated left-to-right. zh-hant shows Traditional characters with no missing glyphs."
    why_human: "Deferred by the owner on 2026-11-18 (phase closed with this open). Visual layout and RTL rendering. Both live canaries (Q-20261117-1R96ZT, Q-20261117-TDP64Q) ran in en only, and 92-28-SUMMARY records no UAT notes for ru, ar or zh-hant."
  - test: "Send one canary quote in ru to the owner's own email (the 92-28 live truth asked for Russian)"
    expected: "The email is in Russian with Prestigo-quote-<ref>-v1.pdf attached, the PDF is in Russian, and the link opens /ru/quote/<token>."
    why_human: "Deferred by the owner on 2026-11-18. The canaries were sent in en. The ru PDF render is proven on production (92-32 pdf-check, ru ok) and the email language is selected by version.locale (lib/quotes/emails/sent.ts:37, unit-tested in quote-emails.test.ts), but no ru email was sent end to end on production."
  - test: "Counsel review of the four Quote.consent.* acceptance texts and the accountant's answer on deposit tax documents (research Q4)"
    expected: "The answers, or an explicit 'pending' or 'risk accepted by the owner', are recorded in 92-28-SUMMARY.md before quotes go to real clients"
    why_human: "Status: pending, deferred by the owner on 2026-11-18; must be answered before quotes go to real clients. Backstop truth (non-inferable). 92-28-SUMMARY.md 'Task 3: live proofs' does not mention counsel or the accountant at all, not even 'pending', although the plan's step 8 asked for it."
  - test: "Confirm the judgment-tier prohibitions: (a) live proofs used only the owner's own card and email; (b) the two PDF packages were installed only after the owner approved them (92-05 Task 1)"
    expected: "The owner confirms both"
    why_human: "Judgment-tier prohibitions. The verifier's non-authoritative read: 92-28-SUMMARY says 'Owner's own email and card only, small amounts', and 92-05-SUMMARY records the approval before the install. Both look satisfied but are flagged as unverified-prohibition, human review recommended."
---

# Phase 92: Quotes Verification Report

**Phase Goal:** The operator builds a multi-trip quote, the client opens it by a secret link, accepts it and pays a deposit, and the accepted quote becomes linked bookings collected the way the operator chose.
**Verified:** 2026-11-17T08:55:00Z
**Status:** passed, human items deferred by the owner (the phase goal is achieved in code and on production; the tsc regression was fixed by PR #118, merge 83a953fc, on 2026-11-18; the owner closed the phase on 2026-11-18 with the human items below deferred)
**Re-verification:** No, this is the initial verification

Branch checked: feat/92-quotes at 29c3f67f. Its code equals origin/main f90e4b71 (PRs #114, #116, #117); only planning docs are on top. The local `main` ref is stale and was not used.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: The operator builds a quote of several trips (route, date, time, vehicle, price per line) in admin and sees the lifecycle draft/sent/viewed/accepted/paid/expired. Editing a sent quote creates a new version and voids the old links. | ✓ VERIFIED | `091_quotes.sql`: quotes.status CHECK has all 7 states; `quote_version_lines` has origin/destination, pickup_date/time, vehicle_class and amount_minor, up to 20 lines. The builder (`QuoteBuilder`, `QuoteLineEditor`, `QuoteSettingsFields`) calls `/api/admin/quotes*` → `lib/quotes/store.ts`. `effectiveQuoteStatus` (status.ts) derives `expired`, and `QuoteStatusBadge` renders it in `QuotesTable` and `QuoteActionsBar`. The sidebar entry is at AdminSidebar.tsx:39. `reviseQuote` (lifecycle.ts:428) copies version n into n+1 and moves `current_version_id`. Old links die because `quoteLinkState` rejects `link.version_id !== current_version_id`. The e2e test (step 8) shows the old URL then gets 404 `invalid_link`. |
| 2 | SC2: The client opens the quote by a secret link (unguessable, expiring, not indexed) and sees an itemised summary. A voided or expired link shows a clear message and no price data. | ✓ VERIFIED | `token.ts`: 32 random bytes, base64url, and only the SHA-256 is stored (`quote_links.token_hash`). `quoteLinkState` covers operator expiry, the first-pickup bound, revoked, superseded and cancelled links. Headers in next.config.ts:211-225 apply `X-Robots-Tag: noindex, nofollow`, `no-referrer` and `no-store` to every locale prefix, and page metadata sets `robots: {index:false}`. The page renders per-trip lines and a summary (total, deposit, remainder). `InvalidQuoteLinkView` takes only the locale and shows no amounts. Tests: quote-page, quote-resolve, quote-view-route and quotes-status all pass. |
| 3 | SC3: The deposit is set as a percent or a fixed amount. Acceptance is logged with time, IP and quote version. The deposit is paid on the quote page, which also saves the card. | ✓ VERIFIED | `depositMinorFor('percent'|'fixed')` in money.ts. The builder offers "Percent of the total" or "Fixed amount". `quote_acceptances` stores accepted_at, ip, user_agent, version_id, terms_sha256 and terms_rendered (accept.ts:132-144, IP from `getClientIp`, accept route:77). The PaymentIntent uses `setup_future_usage: 'off_session'`, kind `card_quote_deposit` (accept.ts:190-197). The amount comes from the server only: the strict schema answers 400 to any amount key (T-92-49 test). The `QuoteAcceptPay` island is mounted on the page. Live: canary 1 deposit of 13.80 was paid. |
| 4 | SC4: When the deposit is paid, each line becomes a booking linked to the quote. The remainder is collected by the method chosen for the quote: saved card (hold/capture per trip), payment link, cash to driver, or invoice. | ✓ VERIFIED | The `quote_convert_to_bookings` RPC (091:677) inserts one booking per line with quote_id and quote_line_id. A unique index on quote_line_id makes this exactly-once. Modes: saved_card → card_hold/card_saved with hold_at; cash → cash_guarantee; link/invoice → quote. Route: webhook → `dispatch.ts:112` → `handleQuoteDepositPaid` → `applyQuoteDepositPaid`. Remainder paths: the hold engine `claimDueHolds` (e2e step 7), `/api/quote/remainder` plus `QuoteRemainderPay` (payment link), and `/api/admin/quotes/[id]/invoice-paid` and `remainder-request` (invoice). Live: canary 1 produced 2 card_hold bookings with hold_at 72 h before pickup; canary 2 produced a payment-link booking whose remainder was paid on the quote page. |
| 5 | SC5: The client can download the quote as a PDF, and the quote email includes it in the client's language. | ✓ VERIFIED | `/api/quote/pdf` (POST, token in the body) → `getOrRenderQuotePdf`, which stores the file per version. `QuotePdfButton` is on the page, with Print as the fallback. `sendQuote` attaches `Prestigo-quote-<ref>-v<n>.pdf` (lifecycle.ts). The email and the PDF both use `version.locale` (emails/sent.ts:37, documents.ts:136). Production pdf-check returned ok for all 8 locales with no fallback glyphs (92-32). Live: canary 1 email_sent with a 183 638-byte PDF stored. |
| 6 | 92-28: An e2e run over fakes goes from the builder to a refunded cancel, through every real route. | ✓ VERIFIED | `tests/phase92-e2e.test.ts` passes (part of the 40-file phase run below). |
| 7 | 92-28: The full suite, the type check (baseline only), lint and verify pre-pr all pass. | ✓ VERIFIED after fix (PR #118; was ✗ FAILED) | Phase tests are green, and lint on the files I checked is clean. `npx tsc --noEmit` now reports **9** errors: the baseline 8 plus `tests/quote-convert-effects.test.ts(243,69)` TS2345, added by 6dbd16e4 (PR #117) after the 92-28 gate. |
| 8 | 92-28 live: a saved-card canary is received with the PDF, accepted, the deposit paid, the bookings appear in admin, the DB rows check out, and a free cancel refunds the deposit. | ✓ VERIFIED (with deviation) | 92-28-SUMMARY "Task 3: live proofs": Q-20261117-1R96ZT. Events created→…→converted. Two card_hold bookings with quote_line_id, payment_intent_id null and quote_deposit ledger 690+690. Cancel and deposit refund confirmed in Stripe. **Deviation:** sent in en, not ru. Moved to human verification. |
| 9 | 92-28 live: a payment-link canary's remainder is paid on the quote page and refunded. | ✓ VERIFIED | Q-20261117-TDP64Q: remainder_paid → deposit_refunded, remainder_refunded, refund_observed ×2. Owner confirmed. |
| 10 | 92-28 backstop: quote page UAT in en/ru/ar on desktop and mobile, plus the admin builder | ? insufficient_spec (human) | No UAT notes are recorded for ru, ar or zh-hant. |
| 11 | 92-28 backstop: counsel and accountant answers recorded | ? insufficient_spec (human) | Not recorded in 92-28-SUMMARY, not even as "pending". |

**Score:** 8/11 truths verified (0 present-but-behavior-unverified, 2 backstop truths routed to a human, 1 failed)

### Prohibitions (ADR-550)

| Prohibition | Tier | Disposition | Evidence |
|---|---|---|---|
| MUST NOT write to the DB while rendering the GET page | test | ✓ enforced | quote-page.test.tsx:308 and 637 (`counter.writes.count === 0`), quote-resolve.test.ts:145 |
| MUST NOT store a raw quote token in any column | test | ✓ enforced | admin-quotes-lifecycle.test.ts:223/232/491, phase92-e2e.test.ts:385 (`JSON.stringify(db.state)` does not contain the token) |
| MUST NOT accept an amount from the body or put the deposit PI id on a booking | test | ✓ enforced | quote-accept-route.test.ts:109; quote-convert-fake.test.ts:258-259 and phase92-e2e.test.ts:459 (`payment_intent_id` null); RPC inserts no payment_intent_id |
| MUST NOT run live proofs on anyone else's card or email | judgment | ⚑ flagged (non-authoritative: looks satisfied) | 92-28-SUMMARY: "Owner's own email and card only" |
| MUST NOT npm install the PDF packages before owner approval | judgment | ⚑ flagged (non-authoritative: looks satisfied) | 92-05-SUMMARY |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/091_quotes.sql` | quote tables, hashed links, acceptance log, event ledger, conversion RPC, erasure | ✓ VERIFIED | 1625 lines. Deny-all RLS on every table. RPC revoked from PUBLIC, anon and authenticated, granted to service_role. Live per 92-12. |
| `lib/quotes/*` (29 modules) | core, lifecycle, accept, convert, remainder, invoice, cancel, PDF, emails | ✓ VERIFIED | Substantive, imported by the routes. No TBD/FIXME/XXX/TODO markers. |
| `app/api/admin/quotes/**` (13 routes) | admin CRUD, price, send, link, revise, void, cancel, refund, invoice-paid, remainder-request, pdf-check | ✓ VERIFIED | `getAdminUser` guard; the UI fetches them (quotes/page.tsx:85,210; QuoteBuilder:112,201; QuoteActionsBar:140) |
| `app/api/quote/{view,accept,state,pdf,remainder}` | public token-gated POSTs | ✓ VERIFIED | Rate-limited, no-store, CSRF prefix `/api/quote` in middleware.ts |
| `app/[locale]/quote/[token]/page.tsx` + islands | client quote page | ✓ VERIFIED | force-dynamic, one invalid view, locale redirect to the quote's language |
| `lib/stripe-webhook/quote-events.ts` | deposit/remainder/failure/dispute handlers | ✓ VERIFIED | Wired from dispatch.ts:112-115 |
| `tests/phase92-e2e.test.ts` | cross-plan integration | ✓ VERIFIED | Passes |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| Admin quotes UI | `/api/admin/quotes*` | fetch | ✓ WIRED |
| `/api/admin/quotes/[id]/send` | `sendQuote` → `getOrRenderQuotePdf` → Resend attachment | lifecycle.ts | ✓ WIRED |
| Quote page | `resolveQuoteToken` → `buildQuoteView` (allow-list) | server component | ✓ WIRED |
| `QuoteAcceptPay` | `/api/quote/accept` → `acceptQuote` → Stripe PI (off_session) | fetch | ✓ WIRED |
| Stripe webhook | `handleQuoteDepositPaid` → `applyQuoteDepositPaid` → RPC `quote_convert_to_bookings` | dispatch.ts | ✓ WIRED (e2e + live) |
| card_hold quote bookings | hold engine `claimDueHolds` | payment_mode/hold_at | ✓ WIRED (e2e step 7) |
| `QuoteRemainderPay` | `/api/quote/remainder` → lib/quotes/remainder.ts | fetch | ✓ WIRED (live canary 2) |
| Legacy money paths | quote-booking guards (payment-link 409, pay-now throw, group-payment skip, cancel engine free) | edit-hook.ts, pay-now.ts:149, webhook route:517-550, payments/cancel.ts:353 | ✓ WIRED (10 guard test files pass) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Quote page | QuoteView | `resolveQuoteToken` → quote_links/quotes/quote_versions/lines/stops (service client) | yes | ✓ FLOWING |
| Admin quotes list | rows + effective_status | `listQuotes` → `quotes` table | yes | ✓ FLOWING |
| PDF | bytes | `quote_documents` or render → stored | yes (183 638 B live) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| All phase 92 tests (40 files incl. e2e, migration-091, page, accept, convert, webhook, PDF, i18n) | `npx vitest run --exclude '.claude/**' tests/{admin-quote*,admin-quotes*,migration-091,phase92-e2e,quote-*,quotes-*}` | 39 passed, 1 skipped; 1250 tests passed | ✓ PASS |
| Quote guards in legacy payment paths | `npx vitest run` on 10 files (admin-bookings-edit-payment, admin-bookings-payment-link, erasure, manage-link, payments-cancel, payments-tick, payments-paynow-money, webhooks-stripe-group-payment, cancel-booking-dialog, booking-detail-panel) | 10 passed, 492 tests | ✓ PASS |
| Type check | `npx tsc --noEmit` | 9 errors (baseline 8 + quote-convert-effects.test.ts:243) | ✗ FAIL (gap) |
| Production pdf-check | 92-32-SUMMARY JSON | 8/8 locales ok | ✓ PASS (recorded) |

### Probe Execution

No probe scripts are declared for this phase. Step 7c: SKIPPED.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| QUOTE-01 | Multi-trip quote builder in admin | ✓ SATISFIED | Truth 1 |
| QUOTE-02 | Secret link (unguessable, expiring, not indexed), itemised summary | ✓ SATISFIED | Truth 2 |
| QUOTE-03 | Deposit percent or fixed, paid on the quote page, card saved | ✓ SATISFIED | Truth 3 |
| QUOTE-04 | Remainder method per quote (saved card / link / cash / invoice) | ✓ SATISFIED | Truth 4 |
| QUOTE-05 | Logged acceptance, each line becomes a linked booking on deposit | ✓ SATISFIED | Truths 3 and 4 |
| QUOTE-06 | Lifecycle visible, revise creates a new version and voids old links | ✓ SATISFIED | Truth 1 |
| QUOTE-07 | PDF download, PDF attached to the quote email | ✓ SATISFIED | Truth 5 |

No orphaned requirements. REQUIREMENTS.md maps exactly QUOTE-01..07 to Phase 92.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| tests/quote-convert-effects.test.ts | 243 | new tsc error (TS2345) | ⚠️ Warning, but it fails the 92-28 gate truth | Breaks the "8 baseline tsc errors" invariant in CLAUDE.md. No runtime or production impact. |
| (phase source files) | n/a | TBD/FIXME/XXX/TODO/placeholder | none found | n/a |

Informational, noted by the owner in 92-28 and not gaps: an iOS mail spacing quirk around `<bdi>`, and no reminder that a deposit is still held when every trip of a paid quote is cancelled from Bookings (a possible UX follow-up).

### Human Verification Required

1. **Quote page UAT (en, ru, ar desktop and mobile, zh-hant once; admin builder).** Test that layout, RTL and glyphs read clearly. Both canaries ran in en only, and no UAT notes are recorded for the other locales.
2. **One ru canary quote email.** Expected: a Russian email with a Russian PDF attached and a /ru/quote link. The 92-28 live truth asked for Russian; the canaries used en.
3. **Counsel and accountant items.** Record the answers, or "pending", or an owner risk acceptance, in 92-28-SUMMARY before real clients receive quotes.
4. **Judgment prohibitions.** The owner confirms that live proofs used only the owner's own card and email, and that the PDF packages were installed only after approval.

### Gaps Summary

The phase goal is achieved. All 5 roadmap success criteria and all 7 requirements are backed by real, wired code, passing tests (1 742 tests across the phase and guard files) and two live production canaries with real Stripe money (deposit, conversion to bookings, remainder, cancel and refunds).

One must-have truth fails. The 92-28 quality-gate truth says the type check is at baseline, but PR #117 (6dbd16e4) added a 9th tsc error in `tests/quote-convert-effects.test.ts:243` (`mail.html` is `string | undefined`). The fix is one line, test-only, with no production impact. Re-run `npx tsc --noEmit` afterwards and re-verify; the human items above stay open either way, so after the fix the expected status is `human_needed`.

No gap is deferred to a later phase (Phases 93 and 94 do not cover it).

---

_Verified: 2026-11-17T08:55:00Z_
_Verifier: Claude (gsd-verifier)_
