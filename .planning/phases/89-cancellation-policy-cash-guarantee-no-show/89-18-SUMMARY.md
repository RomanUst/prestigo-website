---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 18
subsystem: payments
tags: [email, i18n, cancellation-policy, manage-link, confirmation-page, next-intl]
requires:
  - phase: 89-04
    provides: "PaymentEmails shell with policy box and Manage button, ensureManageToken, buildManageUrl, policyBoxFromRow"
  - phase: 89-07
    provides: "cancel_policy_version / cancel_policy stored on pay-now, card and admin rows; init policy"
  - phase: 89-28
    provides: "the manage page the link points at"
provides:
  - "lib/payments/emails/policy-block.ts: buildPolicyBlockHtml (one row or several), policyFareOf"
  - "renderPolicyBlock in render.ts (box and outlined button in the booking language, own lang and dir)"
  - "optional policyBlockHtml on BookingEmailData, RoundTripEmailData, GroupPaymentEmailData, StatusEmailBooking and ReminderEmailBooking"
  - "Booking.confirmation catalog namespace (27 keys, 7 locales) and a translated confirmation page"
  - "lib/confirmation-notice.ts: writeConfirmationNotice / readConfirmationNotice"
affects: [89-19, 89-22]
tech-stack:
  added: []
  patterns:
    - "additive email block: '' / undefined leaves the legacy HTML byte-identical, verified against the HEAD version of lib/email.ts"
    - "one-shot sessionStorage notice keyed by booking reference for facts the confirmation page cannot read from a row"
key-files:
  created:
    - lib/payments/emails/policy-block.ts
    - lib/confirmation-notice.ts
    - tests/email-policy-block.test.ts
    - tests/confirmation-page-i18n.test.tsx
  modified:
    - lib/payments/emails/render.ts
    - lib/payments/emails/send.ts
    - lib/email.ts
    - app/api/webhooks/stripe/route.ts
    - lib/booking-status-service.ts
    - app/api/admin/bookings/route.ts
    - app/api/cron/reminder-24h/route.ts
    - app/api/cron/reminder-2h/route.ts
    - app/[locale]/book/confirmation/page.tsx
    - components/booking/steps/Step6Payment.tsx
    - components/booking/steps/Step6CardOnFile.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/confirmation-page.test.tsx
    - tests/cron-reminder-24h.test.ts
    - tests/cron-reminder-2h.test.ts
    - tests/booking-status-service.test.ts
    - tests/admin-bookings-payment-link.test.ts
key-decisions:
  - "One policyBlockHtml string (box then button) is inserted below the journey table, as the plan says; UI-SPEC 8.1 would put the button after Add to calendar, which the single-string field cannot do. The block is therefore one unit under the journey."
  - "The gate is the row: buildPolicyBlockHtml returns '' with no database call unless a row has cancel_policy_version. The webhook one-way and round-trip paths additionally gate on the checkout metadata key cancelPolicy, so a legacy pay-now booking costs no extra read."
  - "policyFareOf is a local copy of the feeBaseFor / manage-view base (leg share first, amount_eur fallback; card and cash rows use payment_amount_minor). Importing lib/payments/fee.ts would load the Stripe engine into every confirmation mail; a test pins the copy to feeBaseFor on seven row shapes."
  - "Several bookings in one mail: each box and each button is named by the booking reference (new keys policyBox.labelFor and manage.ctaFor, 7 locales). A single booking uses the plain label."
  - "Group payment: one box (first row with a computable fare), one link per row. Group rows carry amount 0 by design, so such a row has a link but no box; no fee is invented from the group total."
  - "The bearer link goes to the client only: the manager alerts, the driver reminder and the cancelled mail never read policyBlockHtml (asserted)."
  - "The confirmation page reads its notice in an effect with a once-guard and the read clears it, so a reload or a new tab shows neither new sentence and StrictMode cannot overwrite it with the empty second read."
  - "Step6Payment writes the notice behind showAcceptance (= init returned a policy); Step6CardOnFile always writes it (the step exists only with a policy) and adds the cash label from formatMinor."
patterns-established:
  - "Failure-tolerant call sites: every builder call is .catch(() => '') or sits in a try, so a broken block can never cost the confirmation email."
requirements-completed: [CANC-02]
status: complete
completed: 2026-11-07
commits: 4
plan_head_before: 666c6f20344091f84d57bea81bcead2ffff1b313
plan_head_after: c38d752ae97e3ecf94ffc38fd3a3c5bb68aaf27a
actuals:
  tokens: 34000
  tasks: 3
  commits: 4
---

# Phase 89 Plan 18: Policy in the older confirmation emails and a translated confirmation page Summary

**Pay-now, payment-link, round-trip, group, status-confirmed and both reminder emails now carry the cancellation box and the Manage booking button in the booking language when the booking stored a policy (byte-identical otherwise), and the confirmation page is translated in all 7 locales with the manage-link and cash sentences gated on a stored policy.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | confirmed pay-now row through the webhook to sendClientConfirmation with the localized block; renderer extraction, policy-block, catalog keys, round-trip, group and payment-link wiring | cb2e8791 |
| 2 | status-confirmed (admin PATCH service and admin manual create) and both reminder crons | 272c4374 |
| 3 | confirmation page in 7 locales, confirmation notice, step writers | aa37bd46 |
| fix | admin manual-create test awaits the now-asynchronous send | c38d752a |

Tracer verified first: `tests/email-policy-block.test.ts` posts a `payment_intent.succeeded` to the real webhook route with a stored-policy row, and asserts the data handed to `sendClientConfirmation` (Russian box, `/ru/manage/<43 chars>` link, `dir="rtl"` for Arabic, `/manage/<token>` for English), then expanded. Because the webhook is one file, round trip, group and payment-link wiring landed in the same commit as the tracer; their tests are in the same file.

## What was built

- **render.ts**: the box and the outlined button were extracted from `buildShell` into `shellStyle`, `boxHtml`, `policyBoxHtml` and `manageButtonHtml` (the Phase 88 emails render the same markup; the existing payments-emails suite is unchanged and green). New export `renderPolicyBlock(locale, items, { boxes })` returns one fragment wrapped in its own `lang` and `dir`.
- **policy-block.ts**: `buildPolicyBlockHtml(row | rows, { boxes })`. Reuses `policyBoxFromRow` and `manageUrlFromRow` (now exported from send.ts), the catalog and the escaping of the Phase 88 renderer. Never throws: any failure logs a bookingId and returns ''. A cash row adds the cash sentence.
- **lib/email.ts**: `policyBlockHtml?` on the five data types; inserted below the journey (confirmation, round trip: below both journeys, group: below the leg cards, status confirmed, client reminder). `sendStatusConfirmedEmail` passes it explicitly, so the cancelled and change mails sharing the type never print it.
- **Call sites**: webhook (payment-link, one-way, round trip, group), `advanceBookingStatus` and admin manual create (inside `after()`), both reminder crons (columns added to the select, block built after the dedup gate, client mail only).
- **Confirmation page**: all static strings from `Booking.confirmation` (27 keys); vehicle label from the existing `Booking.vehicleClasses`; GA4 item names stay English. Dates stay ISO as before (only text was translated). New keys translated in-session for ru, es, fr, ar, hi, zh; no script was run.

## Verification

- Byte-identity proven against the real HEAD version of `lib/email.ts` (temporary side-by-side test, deleted): confirmation, round trip, group, status confirmed and cancelled, both reminders produce identical HTML with no block. The permanent tests assert the block is purely additive (`withBlock.replace(block, '') === plain`).
- `npx vitest run` over the new and touched suites plus email, payments-emails, payments-copy-i18n, i18n-completeness, webhooks-stripe*, Step6*, locale-links-backstop, meta-pixel-locale: all green (738 + 609 tests in two batches).
- Full suite: 11250 passed, 1 failed (fixed afterwards: `admin-bookings-payment-link`, now green), 8 files failing at load with `ERR_MODULE_NOT_FOUND` for `next-intl/dist/esm/development/server.react-server.js`: account-trips, auth-customer, login-actions, passenger-actions, profile-actions, and manage-actions / manage-page (plan 28). That is the node_modules symlink of this worktree, not this plan; none touch the changed files. Expected to pass in the main checkout, where they should be re-run once.
- `npx tsc --noEmit`: no errors outside the 8 baseline errors in `tests/`. `npx eslint --quiet` on all changed source and test files: clean. No `€` literal added under `app/` or `components/` (the cash label comes from `formatMinor`).

## Deviations from Plan

**1. [Rule 1 - Bug] Existing admin test raced the new async send**
- **Found during:** full suite
- **Issue:** `tests/admin-bookings-payment-link.test.ts` asserted the confirmed email right after the response with an `after()` double that does not await; the block is built first now.
- **Fix:** `await vi.waitFor(...)` before the assertion. No production behaviour changed.
- **Commit:** c38d752a

**2. [Rule 3 - Blocking] Existing confirmation page test needs an intl context**
- **Found during:** Task 3
- **Issue:** the page now calls `useTranslations`.
- **Fix:** `tests/confirmation-page.test.tsx` renders through `renderWithIntl` (English catalog); all 12 original assertions unchanged.
- **Commit:** aa37bd46

**3. [Rule 2 - Robustness] Block builder failure must never cost the email**
- Every call site catches a rejected builder (`.catch(() => '')`) in addition to the builder's own try/catch; tested for the status service.

**4. Plan structure note:** the webhook is a single file, so the round-trip, group and payment-link wiring that the plan lists under Task 2 shipped with the Task 1 commit.

## Known limitations (for 89-19 and the verifier)

- **Group payment boxes will usually be absent.** Group rows carry amount 0 by design, so there is no fare to take a percent of; the rows get their Manage links but the box is dropped. Showing a box would need a deliberate rule for the fee base of a group (not decided in the phase).
- **Button position:** one block under the journey, not after Add to calendar (UI-SPEC 8.1 wording); acceptable under the plan's single-field contract, but a visual check of the real emails is worth doing before go-live.
- **Reminder at 2 hours** carries the box with a free-until time that is already in the past; that is the stored fact, per the spec.
- **Plan 89-19 should record** the deliberate early change: the translated confirmation page is client-visible from the deploy and not behind the flag; only the two sentences are gated.
- **UI E21:** emails sent before go-live carry no button; bookings made before go-live have no stored policy and get no link. No resend path was built.

## Known Stubs

None.

## Threat Flags

None. T-89-59 (link on the confirmation page) is asserted by test: the page HTML contains no `/manage/` and no 43-character token, and the notice stores only the reference and a formatted amount. T-89-60 (unescaped values in the block) is covered by the Phase 88 renderer's escaping; the test with a `<b>` reference confirms it.

## Self-Check: PASSED

- Files present: lib/payments/emails/policy-block.ts, lib/confirmation-notice.ts, tests/email-policy-block.test.ts, tests/confirmation-page-i18n.test.tsx
- Commits present: cb2e8791, 272c4374, aa37bd46, c38d752a
