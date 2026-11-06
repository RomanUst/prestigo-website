---
phase: 88-card-on-file-scheduled-holds
verified: 2026-11-06T09:36:55Z
re_verified: 2026-11-06T12:15:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/88-card-on-file-scheduled-holds/88-01-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-01-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-02-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-02-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-03-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-03-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-04-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-04-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-05-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-05-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-06-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-06-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-07-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-07-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-08-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-08-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-09-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-09-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-10-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-10-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-11-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-11-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-12-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-12-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-13-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-13-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-14-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-14-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-15-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-15-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-16-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-16-SUMMARY.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-17-PLAN.md"
  - ".planning/phases/88-card-on-file-scheduled-holds/88-17-SUMMARY.md"
  - "app/(internal)/admin/(dashboard)/settings/page.tsx"
  - "app/[locale]/book/confirmation/page.tsx"
  - "app/api/admin/bookings/[id]/payment-link/route.ts"
  - "app/api/admin/bookings/[id]/payment/route.ts"
  - "app/api/admin/bookings/cancel/route.ts"
  - "app/api/admin/bookings/route.ts"
  - "app/api/admin/settings/route.ts"
  - "app/api/card-checkout/init/route.ts"
  - "app/api/card-checkout/intent/route.ts"
  - "app/api/create-payment-intent/route.ts"
  - "app/api/cron/payment-tick/route.ts"
  - "app/api/webhooks/stripe/route.ts"
  - "components/admin/BookingsTable.tsx"
  - "components/admin/CardFlowSettings.tsx"
  - "components/admin/PaymentPanel.tsx"
  - "components/admin/PaymentStateBadge.tsx"
  - "components/admin/StatusBadge.tsx"
  - "components/booking/BookingWizard.tsx"
  - "components/booking/CardPaymentExplainer.tsx"
  - "components/booking/steps/PromoCodeField.tsx"
  - "components/booking/steps/Step6CardOnFile.tsx"
  - "components/booking/steps/Step6Checkout.tsx"
  - "components/booking/steps/cardCheckoutApi.ts"
  - "infra/lib/secret-io.mjs"
  - "infra/qstash/payment-tick-schedule.mjs"
  - "infra/stripe/README.md"
  - "infra/stripe/card-flow-smoke.mjs"
  - "infra/stripe/webhook-events.mjs"
  - "lib/booking-events.ts"
  - "lib/booking-status-service.ts"
  - "lib/checkout/compute.ts"
  - "lib/email.ts"
  - "lib/payments/actions.ts"
  - "lib/payments/alerts.ts"
  - "lib/payments/checkout.ts"
  - "lib/payments/config.ts"
  - "lib/payments/consent-text.ts"
  - "lib/payments/consent.ts"
  - "lib/payments/customer.ts"
  - "lib/payments/edit-hook.ts"
  - "lib/payments/emails/render.ts"
  - "lib/payments/emails/send.ts"
  - "lib/payments/hold.ts"
  - "lib/payments/money.ts"
  - "lib/payments/notify.ts"
  - "lib/payments/recovery-link.ts"
  - "lib/payments/recovery.ts"
  - "lib/payments/settle.ts"
  - "lib/payments/state.ts"
  - "lib/payments/stripe.ts"
  - "lib/payments/tick.ts"
  - "lib/payments/timing.ts"
  - "lib/rate-limit.ts"
  - "lib/stripe-payment-links.ts"
  - "lib/stripe-webhook/card-confirm.ts"
  - "lib/stripe-webhook/charge-events.ts"
  - "lib/stripe-webhook/dispatch.ts"
  - "lib/stripe-webhook/hold-events.ts"
  - "lib/stripe-webhook/recovery-events.ts"
  - "lib/supabase.ts"
  - "messages/ar.json"
  - "messages/en.json"
  - "messages/es.json"
  - "messages/fr.json"
  - "messages/hi.json"
  - "messages/ru.json"
  - "messages/zh.json"
  - "middleware.ts"
  - "supabase/migrations/085_payment_state_card_on_file.sql"
  - "supabase/migrations/086_payment_transition_status_gate.sql"
  - "vercel.json"
covered_digest: "v2:sha256:59bd0b550ae44ed5fe8d8805d15dbb9b51e7bffe2b7c5dae000a59c07c0f831a"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "SC4 (clause): the operator sees an append-only ledger of every money event in admin (goal: every money event visible to the operator; PAYF-01)"
    status: partial
    reason: "A successful refund of a card booking reaches the ledger only through charge.refunded, and the live Stripe endpoint is not subscribed to it (88-17-SUMMARY line 30). This covers more than the Dashboard refunds the SUMMARY names: the site's own refund of a captured card booking also leaves no ledger row and no state change."
    artifacts:
      - path: "app/api/admin/bookings/cancel/route.ts"
        issue: "Lines 257-262: a successful refund of a captured card booking writes no ledger row and moves no payment_state. Only the failure path writes one (refund_failed)."
      - path: "lib/stripe-webhook/dispatch.ts"
        issue: "Lines 180-213: observeRefund is the only writer of a successful-refund row (refund_observed). It cannot run on production while charge.refunded is not delivered."
      - path: "infra/stripe/webhook-events.mjs"
        issue: "Line 118: ensure checks REQUIRED_EVENTS only. KEPT_EVENTS (line 46) is never checked, so the script prints OK while charge.refunded is missing. Lines 20-22 and infra/stripe/README.md line 31 say the event stays subscribed; on production it is not there."
    missing:
      - "Subscribe charge.refunded on the live endpoint (Dashboard, or add it to REQUIRED_EVENTS so ensure adds it). Do this BEFORE refunding the two 69 EUR canary charges, or those refunds stay out of the ledger."
      - "Owner should know the effect first: the legacy handler then runs as well, so a Dashboard refund on an unfinished pay-now booking cancels that booking (app/api/webhooks/stripe/route.ts:947-951). Completed and no_show trips are kept."
      - "Optional hardening: append a ledger row in the cancel route when the refund succeeds, so the site's own refund does not depend on webhook delivery."
behavior_unverified_items:
  - truth: "SC5 (clause): a working test-mode path exists (PAYF-04)"
    test: "Owner runs STRIPE_TEST_SECRET_KEY=<sk_test key> node infra/stripe/card-flow-smoke.mjs"
    expected: "PASS for every scenario: off-session manual-capture hold, partial capture, release, authentication_required, decline after setup, idempotency replay, metadata search"
    why_human: "The script is present and its logic passes against a fake client, but no record shows it ever ran against real Stripe test mode (optional step 5 of plan 88-17 Task 2; absent from 88-17-SUMMARY). The local test key is a dead placeholder, so only the owner can run it."
---

# Phase 88: Card on File & Scheduled Holds Verification Report

**Phase Goal:** A client can book by saving a card with nothing charged, and the full amount is then held, captured or recovered automatically, with every money event visible to the operator and the whole flow behind an owner-controlled flag.
**Verified:** 2026-11-06T09:36:55Z
**Status:** gaps_found
**Re-verification:** No, initial verification
**Code verified:** main at 2d408b43 (PRs #88, #89, #90)
**Evidence limits:** canary rows and the live endpoint's event list come from 88-17-SUMMARY as confirmed by the orchestrator's SQL and the owner. No Stripe or database call was made here.

## Goal Achievement

### Observable Truths

| # | Success criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Client books by saving a card: 3DS at checkout, nothing charged, unticked consent in all 7 locales, exactly one booking, consent version, locale, time and IP stored | ✓ VERIFIED | Consent gate takes only JSON `true`: `app/api/card-checkout/intent/route.ts:88-91`. SetupIntent with `request_three_d_secure: 'any'`: `lib/payments/checkout.ts:206-220`. Consent row: `lib/payments/checkout.ts:57-72`, with `locale` and `accepted_at` NOT NULL in `085:213,217`. Unticked box: `components/booking/steps/Step6CardOnFile.tsx:165,386,460`. One booking per attempt: `lib/payments/checkout.ts:128-163`. Catalogs: 23 `cardOnFile` keys in each of 7 locales, parity tests pass. **Canary:** PRG-20261106-229544 card_saved with no money until capture; 1B6728 and 83DA6A ended with 0 captured; consent rows carry version, sha256, ip, confirmed_at. |
| 2 | Hold placed automatically at a configurable lead (default 72 h, admin), at checkout inside the window, DST-safe, follows a pickup edit, missed run caught up, GNet never held | ✓ VERIFIED | Lead: `085:247-249`, `app/api/admin/settings/route.ts`, `components/admin/CardFlowSettings.tsx`. Timing: `lib/payments/timing.ts:59-79`; DST fixtures `tests/payments-timing.test.ts:28-49` pass. Due-not-exact claim: `085:476-482`; three-days-overdue case `tests/payments-tick.test.ts:224`. Tick: `lib/payments/tick.ts:87-113`, triggers `vercel.json:22-23` and QStash `*/15`. Pickup edit: `lib/payments/edit-hook.ts:146-161`, wired `app/api/admin/bookings/route.ts:690-699`, tests `tests/admin-bookings-edit-payment.test.ts:254-331`. GNet: `lib/payments/hold.ts:397-405`, `tests/payments-lifecycle.test.ts:669`. **Canary:** 50AED4 and 38C861 held at checkout; 229544 proved `placeHold` live through Place hold now. **Limit:** no tick-placed hold has run on a real booking, see Human Verification item 2. |
| 3 | Completion captures the hold; a gone hold falls back to the saved card, never twice; any failure gives the client a link and the operator a non-VPS alert | ✓ VERIFIED | Completion: `lib/booking-status-service.ts:200-212` calls `lib/booking-events.ts:53-64`, for admin and driver alike (`lib/driver-trip-step.ts:198`). Backstop: `lib/payments/tick.ts:204-255`. Capture and fallback: `lib/payments/settle.ts:154-161,474-475`. Never twice: CAS claim `settle.ts:434-446`, attempt keys `settle.ts:160,218`, tests `tests/payments-settle.test.ts:387` and `:631`. Failure: `lib/payments/recovery.ts:136-195`. Alert goes straight to Resend and `MANAGER_EMAIL`: `lib/payments/alerts.ts:177,197`. Lifecycle tests `tests/payments-lifecycle.test.ts:512,557` pass. **Canary:** 229544 and 38C861 authorized -> captured, 6900/6900, no `last_payment_error`. **Limit:** the fallback and decline branches are proven on fakes only, see Human Verification item 3. |
| 4 | Operator sees payment state, hold expiry and an append-only ledger of every money event, can capture, release, retry or send a link; the four client emails arrive in the booking language in all 7 locales | ✗ FAILED (partial) | **Holds:** badge `components/admin/BookingsTable.tsx:1702,2105`; panel `:2314,2776`; hold expiry `lib/payments/actions.ts:100`; action matrix `actions.ts:62-81`; ledger read `app/api/admin/bookings/[id]/payment/route.ts`; append-only trigger in 085; emails `lib/payments/emails/render.ts` with 7-locale tests. Canary used Place hold now and admin release. **Fails:** the ledger misses successful refunds on production, see Gaps Summary. **Warning:** every non-English payment email keeps an English "or" in its contact line (`lib/email.ts:16` via `render.ts:332`). |
| 5 | Webhook routes by purpose, no duplicate bookings or false alerts, partial refund never cancels a completed trip; owner script subscribes the events; a working test-mode path exists; owner canary passes behind the flag | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Routing before the legacy chain: `app/api/webhooks/stripe/route.ts:75`, `lib/stripe-webhook/dispatch.ts:100-140`. Refund keeps finished trips: `route.ts:936-951`, `tests/webhooks-stripe.test.ts:800`. Script: `infra/stripe/webhook-events.mjs:36-43`, owner reports the six events added. Flag: `085:250-252` has no `'on'` value; `lib/payments/config.ts` fails closed. **Canary:** plan scenarios A, B and C all passed on five bookings with allowlist = owner only. **Open:** `infra/stripe/card-flow-smoke.mjs` exists and passes against a fake client, but no run against Stripe test mode is on record. |

**Score:** 3/5 truths verified (1 present, behavior-unverified; 1 failed)

### Items the SUMMARY lists for Phase 89, checked against the Phase 88 criteria

| Item | Contradicts a Phase 88 criterion? | Decision |
| --- | --- | --- |
| `charge.refunded` not on the live endpoint | **Yes: SC4 and PAYF-01.** The SUMMARY understates it: the site's own refund is affected too, not only Dashboard refunds | Gap |
| English "or" in the payment email contact line | **Yes, literally: SC4 "in the booking language"**, but one word in a footer line | Warning, does not fail SC4 alone |
| Same-key different-parameter settle error loops without an alert | **Partly: SC3 "any hold or charge fails ... operator gets an alert".** The row stays `capturing` and only logs (`settle.ts:109-113,378-382`). Normal edits cannot reach it, because the edit is refused while capturing (`edit-hook.ts:41,53`) | Warning |
| Confirmation page and cancelled email in English | No. SC1's "all 7 locales" covers the consent; the page was already English; the cancelled email is not one of the four SC4 emails | Out of scope |
| Retry from `expired` may replay the old hold key | No. Stripe prunes keys after about 24 h and the fallback charge keeps the money safe | Out of scope |
| 20 h notice retry window; `alert:new_booking` and `send_link` claim before send | No criterion covers these windows or alerts | Out of scope |
| Radar, D-23 erasure, counsel review, flag at `canary` | No. These are Phase 89 go-live conditions and the allowlist stays owner-only | Out of scope |
| no_show via PATCH keeps the hold; 46 s intent; chat button overlap; 3DS position; Revolut merchant name; `setup_started` ledger name | No | Out of scope |

### Deferred Items

None. Phase 89's roadmap section names HOLD-06 refunds as policy, but says nothing about the webhook subscription or about recording refunds in the ledger, so the gap stays a real gap.

### Required Artifacts

`verify.artifacts` over all 17 plans: 53/53 passed. `verify.key-links`: 36/36 verified. Spot-read for substance: `lib/payments/{checkout,hold,settle,tick,recovery,alerts,notify,actions,edit-hook,timing,config}.ts`, `lib/stripe-webhook/{dispatch,hold-events,recovery-events}.ts`, both card-checkout routes, `app/api/cron/payment-tick/route.ts`, `app/api/admin/bookings/cancel/route.ts`, `infra/stripe/webhook-events.mjs`. No stubs found.

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Stripe live endpoint | `lib/stripe-webhook/dispatch.ts` `observeRefund` | `charge.refunded` delivery | ✗ NOT_WIRED on production | Code is correct and tested; the event is not subscribed |
| Stripe live endpoint | card handlers | six `REQUIRED_EVENTS` | ✓ WIRED | Owner reports them added; canary confirmed via webhook-driven states |
| QStash `prestigo-payment-tick` | `app/api/cron/payment-tick/route.ts` | signed POST | ✓ WIRED | POST 200 proves the signature passed. It does not prove clean steps: the route answers 200 even when a step failed (`route.ts:11-13`) |
| `lib/booking-status-service.ts` | `lib/payments/settle.ts` | `emitBookingCompleted` | ✓ WIRED | Canary captures |
| `components/admin/PaymentPanel.tsx` | `app/api/admin/bookings/[id]/payment/route.ts` | GET and POST | ✓ WIRED | Canary admin actions |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| PaymentPanel | payment facts, events | `bookings` + `booking_payment_events` via admin GET | Yes | ✓ FLOWING, except refund rows (gap) |
| PaymentStateBadge | `payment_state` | bookings list | Yes | ✓ FLOWING |
| Consent row | `text_rendered` | server rendering, never client text | Yes | ✓ FLOWING |
| Payment emails | amount, date | booking row, `formatMinor`, `formatLocaleDate` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase test files | `npx vitest run` on the 36 Phase 88 test files | 36 files, 1331 passed, 5 todo (legacy, in `tests/create-payment-intent.test.ts`) | ✓ PASS |
| Full suite, once | `npx vitest run` | 353 files passed, 2 skipped; 9905 tests passed | ✓ PASS |
| Types | `npx tsc --noEmit` | 8 errors, all in `tests/`, matching the baseline | ✓ PASS |
| Real test-mode smoke | `infra/stripe/card-flow-smoke.mjs` | Not run: no Stripe calls allowed here | ? SKIP |

### Probe Execution

None declared. No `scripts/*/tests/probe-*.sh` exists and no plan names a probe.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| PAYF-01 | 88-01, 88-07 | ✗ BLOCKED (partial) | State, mode and append-only ledger hold; "every money event" does not, for refunds |
| PAYF-03 | 88-09 | ✓ SATISFIED | SC5 routing; canary shows no duplicates |
| PAYF-04 | 88-04 | ? NEEDS HUMAN | Script used by the owner; test-mode path never run for real |
| PAYF-05 | 88-06, 88-10 | ✓ SATISFIED | Flag plus owner canary |
| HOLD-01 | 88-02, 88-03, 88-05, 88-08, 88-09, 88-10 | ✓ SATISFIED | SC1 |
| HOLD-02 | 88-06, 88-11 | ✓ SATISFIED | SC2 |
| HOLD-03 | 88-06, 88-09, 88-12 | ✓ SATISFIED | SC2, canary 50AED4 and 38C861 |
| HOLD-04 | 88-13 | ✓ SATISFIED | SC3 |
| HOLD-05 | 88-07, 88-14 | ✓ SATISFIED | SC3 |
| HOLD-07 | 88-07, 88-15, 88-16 | ✓ SATISFIED | SC4 admin clauses |
| MAIL-01 | 88-03, 88-05, 88-09 | ✓ SATISFIED, with warning | The English "or" |

No orphaned requirements: all 11 IDs mapped to Phase 88 appear in plan frontmatter. REQUIREMENTS.md still shows them unticked; the ROADMAP line still reads 16/17.

### Decision Coverage

`check.decision-coverage-verify`: 25/25 CONTEXT.md decisions honored.

### Prohibitions

**Test tier, 18 items, all with wired enforcement that passed in this run.** Examples: no `'on'` value `tests/payments-migration-085.test.ts:167`; no PII in the ledger `:103`; no money in setup mode `tests/card-checkout-intent.test.ts:213-279`; boolean-only consent `:580`; no trace for ineligible clients `tests/Step6CardOnFile.test.tsx:210`; no hold before `hold_at` `tests/payments-tick.test.ts:231`; never over-collect `tests/payments-settle.test.ts:631`; no auto-cancel `tests/payments-failure.test.ts:469`; no amount in admin requests `tests/admin-payment-api.test.ts:427`; confirm modal `tests/PaymentPanel.test.tsx:369`; no money on a lost race `tests/admin-bookings-cancel.test.ts:489`.

**Judgment tier, 2 items: `unverified-prohibition, human review recommended`.** The verdicts below are non-authoritative.

| Prohibition | LLM-judge verdict | Basis |
| --- | --- | --- |
| Do not run `scripts/i18n-translate.mjs` on the repo tree (88-05) | Likely honored | Stub and not-English tests pass; history cannot prove the script was never run |
| Canary only for the owner's email, and only after the events and schedule exist (88-17) | Likely honored | SUMMARY states the allowlist and the order; not rechecked in the database |

PR #90 adds "Your payment is being refunded to your card" to the cancelled email. Plan 88-03 bars refund promises in client payment emails. This is not a breach: it is the status email (`lib/email.ts`), and it is sent only after the refund call succeeded (`cancel/route.ts:257-261`).

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/payments-lifecycle.test.ts` | SC1-SC4 | All | 0 | No | Behavioral | Sound, over fake Stripe and fake DB |
| `tests/payments-settle.test.ts` | HOLD-04 | All | 0 | No | Value + behavioral | Sound |
| `tests/payments-tick.test.ts`, `tests/payments-timing.test.ts` | HOLD-02 | All | 0 | No | Value | Sound; DST values are independent fixtures |
| `tests/payments-failure.test.ts` | HOLD-05 | All | 0 | No | Behavioral | Sound |
| `tests/admin-bookings-cancel.test.ts` | HOLD-07 | All | 0 | No | Behavioral | **Weak spot:** the captured-refund case at `:649` never asserts a ledger row, so the gap passes unseen |
| `tests/infra-stripe-webhook-events.test.ts` | PAYF-04 | All | 0 | No | Behavioral | Weak spot: the fixture assumes `charge.refunded` is on the endpoint |

Disabled tests on requirements: 0. Circular patterns: 0. Insufficient assertions: 2 weak spots above (WARNING).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `app/api/admin/bookings/cancel/route.ts` | 257-262 | Successful refund leaves no ledger row | 🛑 Blocker | See gap |
| `infra/stripe/webhook-events.mjs` | 46, 118 | `KEPT_EVENTS` is documented but never checked; comment at 20-22 is wrong for production | ⚠️ Warning | Script prints OK with `charge.refunded` missing |
| `lib/email.ts` | 16 | English "or" reused in localized emails | ⚠️ Warning | SC4 wording |
| `lib/payments/settle.ts` | 109-113, 378-382 | Idempotency-parameter error loops, log only | ⚠️ Warning | No alert in a rare case |
| `app/api/cron/payment-tick/route.ts` | 11-13 | 200 returned even with step errors | ℹ️ Info | By design; read the body, not the status |

No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or placeholder text in the 71 changed files. No typed euro amounts in `app/` or `components/`.

### Human Verification Required

These stay open after the gap closes. Each is a live check that no automated test can give.

### 1. Test-mode smoke (SC5, PAYF-04)

**Test:** Run `STRIPE_TEST_SECRET_KEY=<sk_test key> node infra/stripe/card-flow-smoke.mjs`.
**Expected:** PASS on every scenario.
**Why human:** Only the owner has a working test key, and SC5 asks for a working path, not only a script.

### 2. First hold placed by the tick on a real booking (SC2)

**Test:** Make a canary booking in the card_saved state whose `hold_at` falls within a day, and let QStash reach it. Read the tick response body in the QStash log.
**Expected:** The booking moves card_saved -> authorized with the actor `payment_tick`; one hold_placed email; `errors: []` in the response.
**Why human:** The canary placed its hold by hand. The live claim RPC passed the 88-01 smoke and `placeHold` ran live, but the two have not run together on production.

### 3. A real decline (SC3)

**Test:** Before Phase 89 opens the flow, exercise one declined off-session attempt, in test mode or with a canary.
**Expected:** failed state, recovery link, payment_failed email, `[Payment]` alert to the manager inbox, and a paid link ending in captured.
**Why human:** This branch has only run on fake Stripe. Real hold expiry cannot be simulated, as 88-VALIDATION records.

### 4. Arabic card_saved email (plan 88-17 backstop truth)

**Test:** Open a card_saved email from a booking made on `/ar/book` with a far-out pickup.
**Expected:** Right-to-left layout, Latin digits.
**Why human:** The Arabic canary (50AED4) held at checkout, so it sent hold_placed, not card_saved. The owner's "emails look right" does not name this one.

### 5. Two judgment-tier prohibitions

**Test:** Owner confirms the allowlist in admin holds only the owner's address, and that the translate script was not run.
**Expected:** Both confirmed.
**Why human:** Marked judgment tier by the plans.

### Gaps Summary

One gap, and it is narrow. The money engine works and the canary passed. The goal and SC4 promise that every money event is visible to the operator, and on production a successful refund of a card booking is not.

The ledger has no row kind for "refund issued". The only record of a successful refund is `refund_observed`, written from the `charge.refunded` webhook, and that event is not delivered on production. So:

- A refund made in the Stripe Dashboard never reaches the ledger. The SUMMARY says this.
- The admin cancel of a captured card booking calls Stripe, returns ok and writes nothing. The booking shows cancelled with `captured` money and no sign of the refund. The SUMMARY does not say this.
- The two 69 EUR canary charges are due to be refunded by hand, so this will happen on real data. If the event is added first, they will be recorded.

The automatic refund of a duplicate link payment is not affected: it records `recovery_paid` with `duplicate_refunded`.

No client money is at risk and the flow is owner-only, so this does not call for rollback. It is a Phase 88 contract gap, not a Phase 89 item, because no Phase 89 criterion covers it.

**If the owner decides to leave the event off for now,** this can be accepted by adding to the frontmatter:

```yaml
overrides:
  - must_have: "SC4 (clause): the operator sees an append-only ledger of every money event in admin"
    reason: "{why refunds may stay out of the ledger until Phase 89, and where they are tracked meanwhile}"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

The SC5 test-mode clause is separate: it needs one owner run of the smoke script, not a code change.

---

_Verified: 2026-11-06T09:36:55Z_
_Verifier: Claude (gsd-verifier)_

## Re-verification 2026-11-06 (SC4 ledger gap closed)

The owner added `charge.refunded` to the live endpoint in the Stripe Dashboard and refunded 69 EUR on PRG-20261106-38C861.

- Ledger: `refund_observed`, 6900 eur, `ch_3UYjJsFoizgdF9t91Ah5JbYU`, actor webhook, 2026-11-06 12:11:56 UTC.
- Booking stayed `completed` / `captured`; production log shows the warning for a refund on a finished trip.
- The site's own refund of a captured card booking goes through the same event and handler, but was not run live after the event was added.
- PRG-20261106-229544 was refunded before the event was on the endpoint, so it has no refund row. Test booking, accepted.

`ensure` keeps the event (it sends a union), but it still does not check for it: move `charge.refunded` to `REQUIRED_EVENTS` in Phase 89.

## Re-verification 2026-11-06 (SC5 test-mode path)

The owner ran `infra/stripe/card-flow-smoke.mjs` against Stripe test mode: 7 of 8 passed. S1-S4 and S6-S8 passed.

S5 failed on the script's own expectation: `pm_card_authenticationRequiredChargeDeclinedInsufficientFunds`, attached without a completed 3DS, returned `authentication_required`, not `insufficient_funds`. The engine handles that code (`classifyStripeError` -> `auth_required`, same branch as S4). S5 now expects `authentication_required`; the script was not re-run, since the recorded result already matches.

Not observed in Stripe: a real `insufficient_funds` decline. It takes the same `card_declined` branch as S6.

Not proven live, checklist before Phase 89 go-live: tick-placed hold on a real booking, decline and recovery on production, Arabic `card_saved` email, site refund of a captured card booking after the event was added.
