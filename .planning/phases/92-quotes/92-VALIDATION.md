---
phase: "92"
slug: "quotes"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server tests) |
| **Config file** | `vitest.config.ts` (setup `tests/setup.ts`) |
| **Quick run command** | `npx vitest run tests/<file>.test.ts [tests/<file> ...]` (never `vitest related`, it crashes here) |
| **Full suite command** | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'` |
| **Estimated runtime** | ~95 seconds |

---

## Sampling Rate

- **After every task commit:** the task's own `<automated>` commands (its test files, plus the filtered `npx tsc --noEmit` and `npx eslint --quiet <files>` where listed)
- **After every plan wave:** the full suite command, plus `tests/payment-state-writers-gate.test.ts tests/payments-state.test.ts tests/quote-copy-i18n.test.ts tests/admin-no-hardcoded-colors.test.ts tests/migration-091.test.ts`
- **Before `/gsd-verify-work`:** full suite green and the `verify` skill in pre-pr mode PASS (plan 92-28)
- **Max feedback latency:** 95 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 92-01-01 | 01 | 1 | QUOTE-01, QUOTE-06 | T-92-01, T-92-03 | quote tables deny-all; hash-only links | migration text | `npx vitest run tests/migration-091.test.ts` | ❌ created in task | ⬜ pending |
| 92-01-02 | 01 | 1 | QUOTE-05, QUOTE-06 | T-92-02, T-92-04 | frozen versions and logs guarded; quote_line_id unique | migration text + fake DB | `npx vitest run tests/migration-091.test.ts tests/payments-state.test.ts tests/payments-migration-085.test.ts tests/migration-089.test.ts` | ✅ after 01-01 | ⬜ pending |
| 92-01-03 | 01 | 1 | QUOTE-05 | T-92-04 | one event per key | unit (fake DB) | `npx vitest run tests/quote-events.test.ts tests/migration-091.test.ts` | ❌ created in task | ⬜ pending |
| 92-02-01 | 02 | 1 | QUOTE-02, QUOTE-06 | T-92-05, T-92-06 | one validity rule; D-02 / D-05 on DST dates | pure unit | `npx vitest run tests/quotes-token.test.ts tests/quotes-status.test.ts` | ❌ created in task | ⬜ pending |
| 92-02-02 | 02 | 1 | QUOTE-03, QUOTE-04 | T-92-07 | deposit, floors, mode table | pure unit | `npx vitest run tests/quotes-money.test.ts` | ❌ created in task | ⬜ pending |
| 92-02-03 | 02 | 1 | QUOTE-03 | T-92-08 | quote snapshot up to 720 h; legacy fallback kept | pure unit | `npx vitest run tests/quotes-terms.test.ts tests/cancellation-policy.test.ts tests/cancellation-wording.test.ts tests/payments-cancel.test.ts` | ❌ / ✅ | ⬜ pending |
| 92-03-01 | 03 | 1 | QUOTE-03, QUOTE-04 | T-92-88 | owner answers what the saved card may be charged for on cash / link / invoice quotes (D-21, D-22) before any consent copy | manual (owner gate) | `grep -cE "^- \*\*D-2[12]:\*\*" .planning/phases/92-quotes/92-CONTEXT.md` prints 2 | ✅ | ⬜ pending |
| 92-03-02 | 03 | 1 | QUOTE-02, QUOTE-03 | T-92-09, T-92-10, T-92-89 | page and consent copy in every locale of `locales` (8, zh-hant generated), no typed money | catalog text | `npx vitest run tests/quote-copy-i18n.test.ts tests/payments-copy-i18n.test.ts` | ❌ created in task | ⬜ pending |
| 92-03-03 | 03 | 1 | QUOTE-07 | T-92-10, T-92-89 | document copy in every locale (zh-hant generated) | catalog text | `npx vitest run tests/quote-copy-i18n.test.ts` | ✅ after 03-02 | ⬜ pending |
| 92-04-01 | 04 | 1 | QUOTE-02 | T-92-11, T-92-12 | no-referrer, no-store, noindex for every locale prefix incl. /zh-hant/quote/x; private path; CSP redaction | config unit | `npx vitest run tests/next-config-headers.test.ts tests/private-link-paths.test.tsx tests/csp-report-redact.test.ts` | ✅ (extend) | ⬜ pending |
| 92-04-02 | 04 | 1 | QUOTE-02, QUOTE-03 | T-92-13, T-92-14 | strict Origin; per-IP limits | config unit | `npx vitest run tests/middleware-csrf-forms.test.ts tests/rate-limit.test.ts tests/middleware-i18n.test.ts` | ✅ (extend) | ⬜ pending |
| 92-04-03 | 04 | 1 | QUOTE-03 | T-92-15 | card_ kinds never reach the legacy chain | unit | `npx vitest run tests/quote-stripe-vocabulary.test.ts tests/payments-consent.test.ts tests/webhooks-stripe-payments.test.ts tests/extra-webhook.test.ts` | ❌ created in task | ⬜ pending |
| 92-05-01 | 05 | 1 | QUOTE-07 | T-92-SC | owner approves packages before install | manual (owner) | `node -e` check that neither package is installed yet | ✅ | ⬜ pending |
| 92-05-02 | 05 | 1 | QUOTE-07 | T-92-SC, T-92-16 | exact pins, integrity, six font families with sha256 (Noto Sans TC for zh-hant); plain `npm install` first (I1) | manual (orchestrator) | `node -e` exact-pin check on package.json | ✅ | ⬜ pending |
| 92-05-03 | 05 | 1 | QUOTE-07 | T-92-SC, T-92-16 | pins and font hashes stay honest | unit | `npx vitest run tests/quote-pdf-deps.test.ts` | ❌ created in task | ⬜ pending |
| 92-06-01 | 06 | 2 | QUOTE-05 | T-92-17, T-92-18, T-92-19, T-92-20 | one-transaction conversion; grants | migration text | `npx vitest run tests/migration-091.test.ts` | ✅ | ⬜ pending |
| 92-06-02 | 06 | 2 | QUOTE-04, QUOTE-05 | T-92-17, T-92-19 | exactly once; replay after a late cancel is first_time false (W2); other intent is intent_mismatch; mode table; claim | fake DB | `npx vitest run tests/quote-convert-fake.test.ts tests/payments-tick.test.ts` | ❌ created in task | ⬜ pending |
| 92-06-03 | 06 | 2 | QUOTE-06 | — | SQL / TS vocabularies equal | text | `npx vitest run tests/migration-091.test.ts tests/quote-events.test.ts tests/payments-state.test.ts` | ✅ | ⬜ pending |
| 92-07-01 | 07 | 2 | QUOTE-07 | T-92-21, T-92-22 | JS off, network blocked, null on failure; fonts for every locale (zh-hant: Noto Sans TC) | unit (mocked browser) | `npx vitest run tests/quote-pdf.test.ts tests/next-config-headers.test.ts` | ❌ created in task | ⬜ pending |
| 92-07-02 | 07 | 2 | QUOTE-07 | T-92-24, T-92-92 | 8-locale local spike with glyph coverage (no fallback font); admin-only check route | unit + opt-in spike | `npx vitest run tests/quote-pdf.test.ts tests/quote-pdf-spike.test.ts` | ❌ created in task | ⬜ pending |
| 92-07-03 | 07 | 2 | QUOTE-07 | T-92-23 | shaping verified, local D-14 decision recorded | manual (orchestrator + owner) | `npx vitest run tests/quote-pdf.test.ts` + Read of the 8 PDFs | ✅ | ⬜ pending |
| 92-08-01 | 08 | 2 | QUOTE-01 | T-92-25, T-92-26 | admin-only; server distance and suggestion (D-04) | route | `npx vitest run tests/admin-quotes-route.test.ts tests/quotes-pricing.test.ts` | ❌ created in task | ⬜ pending |
| 92-08-02 | 08 | 2 | QUOTE-01, QUOTE-06 | T-92-27, T-92-28 | 400 vs 422; frozen 409; safe search | route | `npx vitest run tests/admin-quotes-route.test.ts` | ✅ | ⬜ pending |
| 92-08-03 | 08 | 2 | QUOTE-01 | T-92-25 | suggestion route writes nothing | route | `npx vitest run tests/quotes-pricing.test.ts tests/admin-quotes-route.test.ts` | ✅ | ⬜ pending |
| 92-09-01 | 09 | 2 | QUOTE-02, QUOTE-06 | T-92-30, T-92-31, T-92-32 | one null for every failure; read-only resolver; client-safe view | unit (fake DB) | `npx vitest run tests/quote-resolve.test.ts` | ❌ created in task | ⬜ pending |
| 92-09-02 | 09 | 2 | QUOTE-02 | T-92-29, T-92-30 | GET writes nothing; identical invalid view; noindex metadata | component | `npx vitest run tests/quote-page.test.tsx tests/quote-copy-i18n.test.ts` | ❌ created in task | ⬜ pending |
| 92-09-03 | 09 | 2 | QUOTE-06 | T-92-29 | viewed only by POST, idempotent | route | `npx vitest run tests/quote-view-route.test.ts tests/quote-resolve.test.ts tests/quote-page.test.tsx` | ❌ created in task | ⬜ pending |
| 92-10-01 | 10 | 2 | QUOTE-04 | T-92-33 | deposit never charged twice by a price edit (D-20) | route | `npx vitest run tests/admin-bookings-edit-payment.test.ts tests/admin-bookings.test.ts tests/payments-engine-gates.test.ts` | ✅ (extend) | ⬜ pending |
| 92-10-02 | 10 | 2 | QUOTE-04 | T-92-95 | "Send payment link" answers 409 for any quote booking, generate and resend (B2) | route | `npx vitest run tests/admin-bookings-payment-link.test.ts tests/status-writers-gate.test.ts` | ✅ (extend) | ⬜ pending |
| 92-10-03 | 10 | 2 | QUOTE-04 | T-92-96, T-92-97 | pay-now reader refuses quote bookings; group payment skips them and alerts (B2) | engine + webhook | `npx vitest run tests/payments-paynow-money.test.ts tests/webhooks-stripe-group-payment.test.ts tests/payments-cancel.test.ts tests/manage-booking.test.ts` | ✅ (extend) | ⬜ pending |
| 92-30-01 | 30 | 2 | QUOTE-05 | T-92-98 | quote chip in the mounted panel; no payment-link section for quote bookings (B2) | component | `npx vitest run tests/booking-detail-panel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (extend) | ⬜ pending |
| 92-30-02 | 30 | 2 | QUOTE-04 | T-92-34 | dialog shows no fee on quote trips (D-11) | component | `npx vitest run tests/cancel-booking-dialog.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ (extend) | ⬜ pending |
| 92-29-01 | 29 | 2 | QUOTE-07 | T-92-90, T-92-91 | QuoteEmails common and sent copy in every locale (zh-hant generated) | catalog text | `npx vitest run tests/quote-copy-i18n.test.ts tests/payments-copy-i18n.test.ts` | ✅ (extend) | ⬜ pending |
| 92-29-02 | 29 | 2 | QUOTE-04, QUOTE-05, QUOTE-07 | T-92-90, T-92-91 | confirmed, remainder, cancel and refund email copy in every locale | catalog text | `npx vitest run tests/quote-copy-i18n.test.ts tests/payments-copy-i18n.test.ts tests/payments-emails.test.ts` | ✅ | ⬜ pending |
| 92-11-01 | 11 | 2 | QUOTE-04 | T-92-35 | no trip-side fee on quote bookings; quiet mode | engine | `npx vitest run tests/payments-cancel.test.ts tests/payments-cancel-notices.test.ts tests/admin-bookings-cancel.test.ts tests/manage-booking.test.ts` | ✅ (extend) | ⬜ pending |
| 92-11-02 | 11 | 2 | QUOTE-05 | T-92-36 | no manage link for quote trips | unit | `npx vitest run tests/manage-link.test.ts tests/manage-page.test.tsx` | ✅ (extend) | ⬜ pending |
| 92-12-01 | 12 | 3 | QUOTE-01, QUOTE-02 | T-92-37, T-92-38, T-92-39 | erasure covers quotes; grants re-revoked | migration text | `npx vitest run tests/migration-091.test.ts tests/erasure-payment-pii.test.ts tests/erasure-migration.test.ts tests/migration-089.test.ts` | ✅ | ⬜ pending |
| 92-12-02 | 12 | 3 | QUOTE-05 | T-92-37, T-92-40 | quote Stripe customers erased; smoke rolls back | unit + text | `npx vitest run tests/erasure.test.ts tests/erasure-page.test.tsx tests/admin-erasure.test.ts` | ✅ (extend) | ⬜ pending |
| 92-12-03 | 12 | 3 | all schema | T-92-39, T-92-40 | live grants, RLS, conversion checked by smoke | live smoke (orchestrator) | `npx vitest run tests/migration-091.test.ts` + 92-12-smoke.sql via MCP | ✅ | ⬜ pending |
| 92-13-01 | 13 | 3 | QUOTE-01, QUOTE-02, QUOTE-07 | T-92-41, T-92-43 | freeze + hash-only link + escaped email; quote shell reuses the render.ts per-locale pieces (W1), email per locale of `locales` | route + render | `npx vitest run tests/admin-quotes-lifecycle.test.ts tests/quote-emails.test.ts tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts` | ❌ created in task | ⬜ pending |
| 92-13-02 | 13 | 3 | QUOTE-02 | T-92-41, T-92-44 | fresh link; D-02 / D-05 refusals; one email under races | route | `npx vitest run tests/admin-quotes-lifecycle.test.ts` | ✅ | ⬜ pending |
| 92-13-03 | 13 | 3 | QUOTE-06 | T-92-42 | revise kills old links; no edit while paying | route | `npx vitest run tests/admin-quotes-lifecycle.test.ts tests/quote-resolve.test.ts tests/quote-emails.test.ts` | ✅ | ⬜ pending |
| 92-14-01 | 14 | 3 | QUOTE-06 | — | list and badges, sidebar mount | component | `npx vitest run tests/admin-quotes-list.test.tsx tests/AdminSidebar.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ / ✅ | ⬜ pending |
| 92-14-02 | 14 | 3 | QUOTE-01 | — | New quote creates a draft | component | `npx vitest run tests/admin-quotes-list.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-14-03 | 14 | 3 | QUOTE-06 | T-92-45 | Cancel quote sends one request | component | `npx vitest run tests/admin-quotes-list.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-15-01 | 15 | 3 | QUOTE-01 | T-92-47, T-92-48 | suggestion from the API; no distance sent | component | `npx vitest run tests/quote-line-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 92-15-02 | 15 | 3 | QUOTE-01, QUOTE-06 | — | all trip kinds; read-only mode | component | `npx vitest run tests/quote-line-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-16-01 | 16 | 3 | QUOTE-03, QUOTE-05 | T-92-49, T-92-51 | acceptance logged before Stripe; amount from the version | engine (fake Stripe) | `npx vitest run tests/quote-accept.test.ts` | ❌ created in task | ⬜ pending |
| 92-16-02 | 16 | 3 | QUOTE-03 | T-92-50, T-92-53 | one live intent; D-05; changed quote 409 | engine | `npx vitest run tests/quote-accept.test.ts` | ✅ | ⬜ pending |
| 92-16-03 | 16 | 3 | QUOTE-03 | T-92-49, T-92-52 | public route guards; no amount in body | route | `npx vitest run tests/quote-accept-route.test.ts tests/quote-accept.test.ts tests/payment-state-writers-gate.test.ts` | ❌ created in task | ⬜ pending |
| 92-18-01 | 18 | 3 | QUOTE-04, QUOTE-05 | T-92-58 | a succeeded deposit converts through the single wrapper | engine (fake DB, fake Stripe) | `npx vitest run tests/quote-convert.test.ts tests/quote-convert-fake.test.ts tests/payment-state-writers-gate.test.ts` | ❌ created in task | ⬜ pending |
| 92-18-02 | 18 | 3 | QUOTE-03 | T-92-58, T-92-61, T-92-99 | recorded deposit replays never refund (W2); orphan refund only for unrecorded payments; convert_failed alerted | engine | `npx vitest run tests/quote-convert.test.ts tests/quote-convert-fake.test.ts tests/payment-state-writers-gate.test.ts` | ✅ | ⬜ pending |
| 92-32-01 | 32 | 3 | QUOTE-07 | T-92-93, T-92-94 | small proof PR (92-05 + 92-07 code only) merged and deployed | manual (orchestrator + owner) | `npx vitest run tests/quote-pdf.test.ts tests/quote-pdf-deps.test.ts` | ✅ | ⬜ pending |
| 92-32-02 | 32 | 3 | QUOTE-07 | T-92-92 | production pdf-check for every locale; production D-14 decision recorded before wave 4 (W4) | manual (owner + orchestrator) | `grep -c "D-14 production decision" .planning/phases/92-quotes/92-32-SUMMARY.md` | ✅ | ⬜ pending |
| 92-17-01 | 17 | 4 | QUOTE-03, QUOTE-05 | T-92-54, T-92-55, T-92-56 | tokenless return URL; consent from a ref; island mounted | component | `npx vitest run tests/quote-accept-pay.test.tsx tests/quote-page.test.tsx` | ❌ created in task | ⬜ pending |
| 92-17-02 | 17 | 4 | QUOTE-03 | T-92-54 | return page reads nothing | component | `npx vitest run tests/quote-page.test.tsx tests/private-link-paths.test.tsx` | ✅ | ⬜ pending |
| 92-31-01 | 31 | 4 | QUOTE-05 | T-92-57, T-92-99 | deposit event converts through the real route; legacy chain untouched; replay after a late cancel moves no money (W2) | webhook | `npx vitest run tests/quote-webhook.test.ts tests/quote-convert.test.ts tests/payment-state-writers-gate.test.ts tests/webhooks-stripe-payments.test.ts tests/extra-webhook.test.ts` | ❌ created in task | ⬜ pending |
| 92-31-02 | 31 | 4 | QUOTE-03 | T-92-60 | failures, cancels, disputes never reach the hold handler | webhook | `npx vitest run tests/quote-webhook.test.ts tests/webhooks-stripe.test.ts tests/payments-fee-webhook.test.ts` | ✅ | ⬜ pending |
| 92-31-03 | 31 | 4 | QUOTE-05 | T-92-59 | lost webhook reconciled by the tick | engine | `npx vitest run tests/payments-tick.test.ts tests/payment-state-writers-gate.test.ts tests/quote-convert.test.ts` | ✅ (extend) | ⬜ pending |
| 92-19-01 | 19 | 4 | QUOTE-01 | — | builder mounted by the page; one PATCH | component | `npx vitest run tests/quote-builder.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 92-19-02 | 19 | 4 | QUOTE-03, QUOTE-04 | T-92-62 | no default deposit (D-07) | component | `npx vitest run tests/quote-builder.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-19-03 | 19 | 4 | QUOTE-06 | T-92-63 | frozen version read-only | component | `npx vitest run tests/quote-builder.test.tsx tests/quote-line-editor.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-20-01 | 20 | 4 | QUOTE-07 | T-92-65 | stored PDF attached; link fallback | route + render | `npx vitest run tests/admin-quotes-lifecycle.test.ts tests/quote-emails.test.ts` | ✅ (extend) | ⬜ pending |
| 92-20-02 | 20 | 4 | QUOTE-07 | T-92-64 | escaped, self-contained document for every locale of `locales` (zh-hant: Traditional face) | render | `npx vitest run tests/quote-document.test.ts` | ❌ created in task | ⬜ pending |
| 92-20-03 | 20 | 4 | QUOTE-07 | T-92-65, T-92-66 | one PDF per version, sha256 checked | unit | `npx vitest run tests/quote-document.test.ts tests/admin-quotes-lifecycle.test.ts` | ✅ | ⬜ pending |
| 92-22-01 | 22 | 4 | QUOTE-03, QUOTE-04 | T-92-69, T-92-72 | free cancel refunds once; one email | engine + route | `npx vitest run tests/quote-cancel.test.ts tests/admin-quote-cancel-route.test.ts tests/payments-cancel.test.ts` | ❌ created in task | ⬜ pending |
| 92-22-02 | 22 | 4 | QUOTE-03 | T-92-69, T-92-70, T-92-71 | late keeps only the deposit share; bounded refunds | engine + route | `npx vitest run tests/quote-cancel.test.ts tests/admin-quote-cancel-route.test.ts` | ✅ | ⬜ pending |
| 92-22-03 | 22 | 4 | QUOTE-03 | T-92-71 | Stripe refunds observed | webhook | `npx vitest run tests/quote-refund-observed.test.ts tests/webhooks-stripe.test.ts tests/payments-fee-webhook.test.ts` | ❌ created in task | ⬜ pending |
| 92-24-01 | 24 | 4 | QUOTE-04 | T-92-76 | invoice paid by admin only, once | route | `npx vitest run tests/admin-quote-invoice-route.test.ts` | ❌ created in task | ⬜ pending |
| 92-24-02 | 24 | 4 | QUOTE-04 | T-92-77, T-92-78 | remainder request guarded and throttled | route | `npx vitest run tests/admin-quote-invoice-route.test.ts tests/quote-emails.test.ts` | ✅ | ⬜ pending |
| 92-21-01 | 21 | 5 | QUOTE-05 | T-92-67 | one confirmation, crash-resume safe; no client effect after a cancel (W2) | engine | `npx vitest run tests/quote-convert-effects.test.ts tests/quote-convert.test.ts tests/quote-webhook.test.ts` | ❌ created in task | ⬜ pending |
| 92-21-02 | 21 | 5 | QUOTE-04 | T-92-67, T-92-68 | accounting copy, invoice request, reminders once | engine | `npx vitest run tests/quote-convert-effects.test.ts tests/quote-convert.test.ts` | ✅ | ⬜ pending |
| 92-23-01 | 23 | 5 | QUOTE-04 | T-92-73 | remainder amount from the server | engine + route | `npx vitest run tests/quote-remainder.test.ts tests/quote-remainder-route.test.ts tests/quote-webhook.test.ts tests/payment-state-writers-gate.test.ts` | ❌ created in task | ⬜ pending |
| 92-23-02 | 23 | 5 | QUOTE-04 | T-92-74, T-92-75 | one live intent; mismatch stamps nothing | engine | `npx vitest run tests/quote-remainder.test.ts` | ✅ | ⬜ pending |
| 92-23-03 | 23 | 5 | QUOTE-04 | — | lost remainder webhook reconciled | engine | `npx vitest run tests/payments-tick.test.ts tests/payment-state-writers-gate.test.ts` | ✅ | ⬜ pending |
| 92-25-01 | 25 | 5 | QUOTE-02, QUOTE-06 | T-92-79 | URL shown once; bar mounted by the page | component | `npx vitest run tests/quote-actions-bar.test.tsx tests/quote-builder.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 92-25-02 | 25 | 5 | QUOTE-06 | T-92-80 | revise confirm; history without PII | component | `npx vitest run tests/quote-actions-bar.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-26-01 | 26 | 6 | QUOTE-03 | T-92-81, T-92-82 | outcome stated before cancel | component | `npx vitest run tests/quote-money-dialogs.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 92-26-02 | 26 | 6 | QUOTE-03 | T-92-81, T-92-82 | bounded partial refund | component | `npx vitest run tests/quote-money-dialogs.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-26-03 | 26 | 6 | QUOTE-04 | — | invoice and remainder actions per method | component | `npx vitest run tests/quote-money-dialogs.test.tsx tests/quote-actions-bar.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 92-27-01 | 27 | 6 | QUOTE-07 | T-92-83, T-92-84 | token-gated no-store PDF; print fallback | route + component | `npx vitest run tests/quote-pdf-route.test.ts tests/quote-page.test.tsx` | ❌ created in task | ⬜ pending |
| 92-27-02 | 27 | 6 | QUOTE-04 | T-92-85 | remainder paid on the page | component | `npx vitest run tests/quote-remainder-pay.test.tsx tests/quote-page.test.tsx` | ❌ created in task | ⬜ pending |
| 92-27-03 | 27 | 6 | QUOTE-02 | T-92-84 | every locale of `locales` (8), no token or waiting price leak | component | `npx vitest run tests/quote-page.test.tsx tests/quote-copy-i18n.test.ts` | ✅ | ⬜ pending |
| 92-28-01 | 28 | 7 | all | T-92-17, T-92-49 | end to end with fakes | integration | `npx vitest run tests/phase92-e2e.test.ts` | ❌ created in task | ⬜ pending |
| 92-28-02 | 28 | 7 | all | all | full gate | full suite + tsc + verify | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'` | ✅ | ⬜ pending |
| 92-28-03 | 28 | 7 | all | T-92-86, T-92-87 | live proofs on the owner's own card and email only | manual live (owner + orchestrator MCP) | `npx vitest run tests/phase92-e2e.test.ts` + Supabase MCP queries | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan: every task writes its tests first and the shared test infrastructure is extended by the first plan that needs it.

- [ ] `tests/helpers/fake-payments-db.ts` — eight quote tables, CHECK / unique / frozen-guard emulation, ledger kinds `quote_deposit` / `quote_remainder` (92-01, wave 1); `quote_convert_to_bookings` rpc emulation (92-06, wave 2)
- [ ] `tests/migration-091.test.ts` on `tests/helpers/latest-migration.ts` (92-01, extended by 92-06 and 92-12)
- [ ] pure-module tests RED first: `tests/quotes-token.test.ts`, `tests/quotes-status.test.ts`, `tests/quotes-money.test.ts`, `tests/quotes-terms.test.ts` (92-02)
- [ ] `vi.mock('puppeteer-core')` / `vi.mock('@sparticuz/chromium-min')` in `tests/quote-pdf.test.ts`; every other test mocks `renderQuotePdf` so no test launches a browser (92-07)
- [ ] PDF spike result (8 locales, empty fallback) and the local D-14 decision recorded in `92-07-SUMMARY.md`, and the production D-14 decision recorded in `92-32-SUMMARY.md`, before 92-20 starts (W4)
- [ ] Owner answers D-21 / D-22 recorded in `92-CONTEXT.md` before 92-03 writes consent copy (W5)
- [ ] Orchestrator runs a plain `npm install` (opencc-js for `scripts/zh-hant-sync.mjs`) and the 92-05 install before spawning the other wave-1 executors (I1)
- [x] Framework install: none (Vitest present)

Locales: every copy, page, document and email test iterates `locales` from `i18n/locales.ts` (8: en, ru, es, fr, ar, hi, zh, zh-hant); `messages/zh-hant.json` is generated from `zh.json` by `scripts/zh-hant-sync.mjs`, never hand-translated, and `scripts/i18n-translate.mjs --dry-run` is never run on the repo tree.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| What the saved card may be charged for on cash, payment-link and invoice quotes | QUOTE-03, QUOTE-04 | owner decision (research Owner Questions 7 and 8) | 92-03 Task 1 (owner gate before any consent copy), recorded as D-21 / D-22 |
| Two PDF packages approved and installed at pinned two-week-old releases | QUOTE-07 | executors cannot run npm install; legitimacy check is the owner's | 92-05 Tasks 1-2 |
| Arabic, Devanagari, Simplified and Traditional Chinese shaping in the sample PDFs | QUOTE-07 | visual | 92-07 Task 3: orchestrator reads the 8 PDFs, owner confirms ar / hi / zh / zh-hant |
| Migration 091 applied live, grants, RLS and conversion correct | QUOTE-01..07 | executors have no Supabase access | 92-12 Task 3: orchestrator applies with the Supabase MCP and runs `92-12-smoke.sql` (rolled back) |
| PDF render on the production host | QUOTE-07 | Preview deploys fail; needs the Vercel runtime | 92-32 (wave 3, W4): small proof PR with 92-05 + 92-07, owner opens /api/admin/quotes/pdf-check while logged in, production D-14 decision recorded before 92-20 |
| Deposit with a saved card, conversion, holds scheduled, free cancel refund | QUOTE-03, QUOTE-04, QUOTE-05 | local Stripe key is a dead placeholder; live key and a real card needed | 92-28 Task 3 steps 2-5 on the owner's own card and email |
| Payment-link remainder paid on the page and refunded | QUOTE-04 | live Stripe | 92-28 Task 3 step 6 |
| Quote email with the PDF on a phone; quote page in en, ru, ar on desktop and mobile and once in zh-hant; admin builder | QUOTE-02, QUOTE-07, QUOTE-01 | visual, real mail client | 92-28 Task 3 steps 2 and 7, `/gsd-verify-work 92` |
| Acceptance wording per remainder method; tax documents for deposits | QUOTE-03, QUOTE-04 | counsel and accountant | 92-28 Task 3 step 8; recorded before quotes go to real clients |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 95s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
