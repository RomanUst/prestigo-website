---
phase: "88"
slug: "card-on-file-scheduled-holds"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `88-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server/SQL-text tests), RTL for components |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/payments-*.test.ts tests/webhooks-stripe*.test.ts` |
| **Full suite command** | `npx vitest run` + `npx tsc --noEmit` (baseline: 8 errors in `tests/`) |
| **Estimated runtime** | quick ~15 s, full ~90 s |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/payments-*.test.ts` plus the touched route's test file
- **After every plan wave:** `npx vitest run tests/payments-*.test.ts tests/webhooks-stripe*.test.ts tests/admin-*.test.ts tests/booking-status*.test.ts tests/Step6*.test.tsx` + `npx tsc --noEmit` + `verify` skill
- **Before `/gsd-verify-work`:** full suite green + `verify pre-pr`
- **Max feedback latency:** 90 s

---

## Per-Task Verification Map

Filled by the planner per task; requirement → test mapping:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PAYF-01 | Migration 085 contract; `TRANSITIONS` ⇔ CHECK parity; only `lib/payments/state.ts` writes `payment_state`; ledger idempotent by `event_key` | contract + gate + unit | `npx vitest run tests/payments-migration-085.test.ts tests/payments-state.test.ts tests/payment-state-writers-gate.test.ts` | ❌ W0 | ⬜ pending |
| PAYF-03 | `card_*` kinds never reach legacy `saveBooking`; legacy PI still makes exactly one booking; replay no-op; refund on completed card booking keeps status + `refund_observed` | route unit | `npx vitest run tests/webhooks-stripe-payments.test.ts tests/webhooks-stripe.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| PAYF-04 | Webhook-events + QStash schedule owner scripts: idempotent, dry-run, never print keys | script + fake client | `npx vitest run tests/infra-stripe-webhook-events.test.ts tests/infra-qstash-schedule.test.ts` | ❌ W0 | ⬜ pending |
| PAYF-05 | Eligibility off/canary/allowlist; settings rejects `'on'`, lead outside 6–96 | route + component | `npx vitest run tests/card-checkout-init.test.ts tests/admin-settings.test.ts tests/CardFlowSettings.test.tsx` | ❌ W0 / ✅ | ⬜ pending |
| HOLD-01 | Intent route 400/422, consent required + stored (version, sha256, locale, IP, UA), one booking per attempt, 409 `PRICE_CHANGED`/`MODE_CHANGED`, CSRF + rate limit; consent text parity 7 locales; Step6CardOnFile unticked checkbox + exact hold date | route + unit + component | `npx vitest run tests/card-checkout-intent.test.ts tests/payments-consent.test.ts tests/Step6CardOnFile.test.tsx tests/middleware-csrf-forms.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| HOLD-02 | `computeHoldAt` DST fixtures 2027-03-28 / 2027-10-31; tick places overdue holds once, partner never held, auth, pickup edit moves `hold_at` | pure + route | `npx vitest run tests/payments-timing.test.ts tests/payments-tick.test.ts` | ❌ W0 | ⬜ pending |
| HOLD-03 | In-window manual-capture PI at checkout; `amount_capturable_updated` confirms once | route + webhook | `npx vitest run tests/card-checkout-intent.test.ts tests/webhooks-stripe-payments.test.ts` | ❌ W0 | ⬜ pending |
| HOLD-04 | Capture `amount_to_capture` (D-17); expired hold (mocked `expireHold`) ⇒ fallback charge; difference charge (D-16); concurrent settle ⇒ one Stripe create | unit (fake Stripe) | `npx vitest run tests/payments-settle.test.ts tests/booking-status-service.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| HOLD-05 | Decline ⇒ recovery link + localized client email + operator email; one retry; 24 h alert once; link paid ⇒ captured | unit + webhook | `npx vitest run tests/payments-failure.test.ts tests/webhooks-stripe-payments.test.ts` | ❌ W0 | ⬜ pending |
| HOLD-07 | Admin payment API guard order + action matrix; edit hook D-16/17/18; cancel CAS-first (WR-01); PaymentPanel render | route + component | `npx vitest run tests/admin-payment-api.test.ts tests/admin-bookings-edit-payment.test.ts tests/admin-bookings-cancel.test.ts tests/PaymentPanel.test.tsx` | ❌ W0 / ✅ | ⬜ pending |
| MAIL-01 | 4 templates × 7 locales, key parity, `rtl` for ar, NULL locale ⇒ en | unit | `npx vitest run tests/payments-emails.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/fake-stripe.ts` — in-memory Stripe with PI status machine, `amount_to_capture`, idempotency store that replays errors, scripted declines, `expireHold(piId)`
- [ ] `tests/helpers/fake-payments-db.ts` — `apply_payment_transition` / `claim_due_payment_work` / ledger uniqueness semantics
- [ ] Failing stubs for every new test file in the map above
- [ ] `tests/booking-status-service.test.ts` — update `emitBookingCompleted` assertions for async signature
- [ ] `tests/admin-bookings-cancel.test.ts` — rewrite for CAS-first order
- [x] Live `bookings.pickup_utc` check (orchestrator, 2026-11-04): GENERATED ALWAYS AS `prestigo_text_to_utc(pickup_date, pickup_time)`; DST-correct (2027-03-28 02:30 → 01:30Z, 2027-10-31 02:30 → 01:30Z)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live webhook subscribed to new events | PAYF-04 | Live Stripe key is owner-only | Owner runs `infra/stripe/webhook-events.mjs`, confirms listed events |
| QStash payment-tick schedule exists | HOLD-02 | Owner secret | Owner runs `infra/qstash/payment-tick-schedule.mjs`, confirms schedule count |
| Test-mode end-to-end path | PAYF-04 | Local test key is a dead placeholder | Owner runs `infra/stripe/card-flow-smoke.mjs` with SCA test cards |
| Owner canary booking end to end (save card → hold → complete → capture; and release) | PAYF-05 | Real card, real money | Canary runbook in phase dir |
| Real hold expiry | HOLD-04 | Cannot be simulated with test cards | Covered by mocked `expireHold` + `capture_before` watchdog alert |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
