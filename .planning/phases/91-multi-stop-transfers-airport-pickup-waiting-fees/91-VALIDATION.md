---
phase: "91"
slug: "multi-stop-transfers-airport-pickup-waiting-fees"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server tests) |
| **Config file** | `vitest.config.ts` (setup `tests/setup.ts`) |
| **Quick run command** | `npx vitest run tests/<file>.test.ts [tests/<file> ...]` (never `vitest related`) |
| **Full suite command** | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'` |
| **Estimated runtime** | ~91 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` commands (its test files, plus `! (npx tsc --noEmit --pretty false 2>&1 | grep -E '^(<paths>)')` where listed)
- **After every plan wave:** Run the full suite command, plus `tests/payment-state-writers-gate.test.ts tests/payments-state.test.ts tests/i18n-completeness.test.ts tests/admin-no-hardcoded-colors.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green and the `verify` skill in pre-pr mode must PASS (plan 91-16)
- **Max feedback latency:** 91 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 91-01-01 | 01 | 1 | STOP-04, STOP-05, STOP-03 | T-91-01, T-91-04 | booking_stops deny-all RLS; no default waiting rate | migration text | `npx vitest run tests/migration-089.test.ts` | ❌ created in task | ⬜ pending |
| 91-01-02 | 01 | 1 | EXTRA-01, STOP-04 | T-91-02, T-91-03 | erasure clears stops and descriptions; REVOKE repeated | migration text + fake DB | `npx vitest run tests/migration-089.test.ts tests/payments-state.test.ts tests/payments-migration-085.test.ts tests/payments-migration-087.test.ts tests/erasure-payment-pii.test.ts tests/erasure-migration.test.ts` | ❌ / ✅ | ⬜ pending |
| 91-01-03 | 01 | 1 | all schema | T-91-01, T-91-03 | live grants and RLS checked by smoke | live smoke (orchestrator) | `npx vitest run tests/migration-089.test.ts` + 91-01-smoke.sql via MCP | ✅ after 01-02 | ⬜ pending |
| 91-02-01 | 02 | 1 | STOP-02, STOP-03 | T-91-05 | quote priced on server route distance | route unit | `npx vitest run tests/calculate-price-stops.test.ts tests/route-distance.test.ts tests/calculate-price.test.ts` | ❌ created in task | ⬜ pending |
| 91-02-02 | 02 | 1 | STOP-02, STOP-03 | T-91-08 | stop / wait limits 400; no flat per-stop fee | route + pure unit | `npx vitest run tests/calculate-price-stops.test.ts tests/stops-fee.test.ts tests/calculate-price-intercity.test.ts tests/pricing-helpers.test.ts tests/calculate-price.test.ts` | ❌ / ✅ | ⬜ pending |
| 91-02-03 | 02 | 1 | STOP-02 | T-91-06, T-91-07 | Essentials-only body, timeout, coordinate-only airport flag | fetch-mock unit | `npx vitest run tests/route-distance.test.ts tests/calculate-price-stops.test.ts tests/calculate-price.test.ts tests/calculate-price-intercity.test.ts` | ✅ after 02-01 | ⬜ pending |
| 91-03-01 | 03 | 2 | STOP-03 | T-91-09, T-91-11 | admin-only rate write; public route leaks no amount | route unit | `npx vitest run tests/admin-pricing.test.ts tests/waiting-config.test.ts` | ✅ / ❌ | ⬜ pending |
| 91-03-02 | 03 | 2 | STOP-03 | T-91-10 | rate positive or null on every row | component | `npx vitest run tests/pricing-form-waiting.test.tsx tests/admin-no-hardcoded-colors.test.ts tests/admin-pricing.test.ts` | ❌ created in task | ⬜ pending |
| 91-04-01 | 04 | 2 | STOP-02, STOP-03 | T-91-12, T-91-15 | client distanceKm / isAirport / amount ignored; 409 PRICE_CHANGED | route | `npx vitest run tests/checkout-stops.test.ts tests/checkout-compute.test.ts tests/card-checkout-intent.test.ts tests/card-checkout-init.test.ts tests/card-checkout-cash.test.ts tests/create-payment-intent.test.ts tests/payments-lifecycle.test.ts tests/payments-policy-lifecycle.test.ts tests/booking-policy-snapshot.test.ts` | ❌ / ✅ (mocks added) | ⬜ pending |
| 91-04-02 | 04 | 2 | STOP-02, STOP-03 | T-91-13, T-91-14 | 503 fail closed; 422 waiting not available; stop limits | route | `npx vitest run tests/checkout-stops.test.ts tests/card-checkout-init.test.ts tests/create-payment-intent.test.ts` | ✅ after 04-01 | ⬜ pending |
| 91-04-03 | 04 | 2 | STOP-02 | T-91-12 | quote / checkout parity; promo once | route | `npx vitest run tests/checkout-stops.test.ts tests/checkout-compute.test.ts tests/calculate-price-stops.test.ts` | ✅ | ⬜ pending |
| 91-05-01 | 05 | 1 | EXTRA-01 | T-91-17 | consent 2026-11-3 covers extras; gate false for older versions | text + unit | `npx vitest run tests/payments-consent.test.ts tests/i18n-completeness.test.ts` | ✅ (update) | ⬜ pending |
| 91-05-02 | 05 | 1 | EXTRA-01 | T-91-18 | only extraItem renders; escaped; reason / note never | render | `npx vitest run tests/payments-emails.test.ts tests/payments-copy-i18n.test.ts tests/i18n-completeness.test.ts` | ✅ (update) | ⬜ pending |
| 91-17-01 | 17 | 2 | STOP-01, STOP-03 | T-91-48 | stop / waiting copy in 7 locales, real translations, no amounts | catalog text | `npx vitest run tests/wizard-stops-copy.test.ts tests/i18n-completeness.test.ts` | ❌ created in task | ⬜ pending |
| 91-17-02 | 17 | 2 | STOP-05 | T-91-48 | landing copy in 7 locales, placeholders resolved | catalog text | `npx vitest run tests/wizard-stops-copy.test.ts tests/i18n-completeness.test.ts` | ✅ after 17-01 | ⬜ pending |
| 91-06-01 | 06 | 3 | STOP-04 | T-91-21 | stops saved for the captured unpaid row only | unit + route | `npx vitest run tests/booking-stops.test.ts tests/checkout-stops-persist.test.ts tests/card-checkout-intent.test.ts` | ❌ created in task | ⬜ pending |
| 91-06-02 | 06 | 3 | STOP-04 | T-91-19 | confirmed booking stops never rewritten | route | `npx vitest run tests/booking-stops.test.ts tests/checkout-stops-persist.test.ts tests/card-checkout-cash.test.ts` | ✅ after 06-01 | ⬜ pending |
| 91-06-03 | 06 | 3 | STOP-04 | T-91-20 | pay-now cancels PI and 503 STOPS_NOT_SAVED | route | `npx vitest run tests/checkout-stops-persist.test.ts tests/create-payment-intent.test.ts` | ✅ | ⬜ pending |
| 91-07-01 | 07 | 3 | STOP-05 | T-91-22 | server derives the pickup from landing + offset | route | `npx vitest run tests/checkout-landing.test.ts tests/checkout-stops.test.ts tests/card-checkout-intent.test.ts` | ❌ created in task | ⬜ pending |
| 91-07-02 | 07 | 3 | STOP-05 | T-91-24 | DST and midnight safe in 3 time zones | pure unit | `npx vitest run tests/airport-pickup.test.ts tests/prague-date.test.ts` | ❌ created in task | ⬜ pending |
| 91-07-03 | 07 | 3 | STOP-05 | T-91-22, T-91-23 | 422 PICKUP_MISMATCH / LANDING_NOT_AIRPORT; lead on derived pickup | route + unit | `npx vitest run tests/checkout-landing.test.ts tests/supabase.test.ts tests/create-payment-intent.test.ts tests/card-checkout-cash.test.ts` | ✅ | ⬜ pending |
| 91-08-01 | 08 | 2 | EXTRA-01 | T-91-25, T-91-29 | admin-only; separate card_extra PI; ledger first | route (fake DB + fake Stripe) | `npx vitest run tests/admin-extra-route.test.ts tests/payment-state-writers-gate.test.ts` | ❌ created in task | ⬜ pending |
| 91-08-02 | 08 | 2 | EXTRA-01 | T-91-26, T-91-27, T-91-28, T-91-30, T-91-31 | one charge per click; stated amount; GNet / consent refused | engine + route | `npx vitest run tests/extra-charge.test.ts tests/admin-extra-route.test.ts tests/payment-state-writers-gate.test.ts tests/admin-payment-api.test.ts` | ❌ created in task | ⬜ pending |
| 91-08-03 | 08 | 2 | EXTRA-01 | T-91-29 | card_extra never reaches hold failure; refund keeps status | webhook unit | `npx vitest run tests/extra-webhook.test.ts tests/payments-fee-webhook.test.ts tests/webhooks-stripe-payments.test.ts tests/webhooks-stripe.test.ts tests/payment-state-writers-gate.test.ts` | ❌ created in task | ⬜ pending |
| 91-09-01 | 09 | 3 | STOP-03, STOP-01 | T-91-33 | waiting amount only from the server | component | `npx vitest run tests/booking-store.test.ts tests/StopItem.test.tsx tests/Step3Vehicle.test.tsx tests/PriceSummary.test.tsx tests/i18n-completeness.test.ts` | ✅ (update) | ⬜ pending |
| 91-09-02 | 09 | 3 | STOP-03 | T-91-32 | options follow admin-offered classes | component | `npx vitest run tests/use-waiting-config.test.tsx tests/StopItem.test.tsx tests/Step3Vehicle.test.tsx tests/i18n-completeness.test.ts` | ❌ / ✅ | ⬜ pending |
| 91-09-03 | 09 | 3 | STOP-01 | N/A | reorder resets price | component | `npx vitest run tests/booking-store.test.ts tests/StopList.test.tsx tests/StopItem.test.tsx tests/i18n-completeness.test.ts tests/Step1TripType.test.tsx` | ✅ (update) | ⬜ pending |
| 91-10-01 | 10 | 4 | STOP-05, STOP-01 | T-91-34 | landing sent only for server-recognised airport pickups | component | `npx vitest run tests/booking-store.test.ts tests/landing-pickup-fields.test.tsx tests/EntryBar.test.tsx tests/Step6CardOnFile.test.tsx tests/i18n-completeness.test.ts` | ❌ / ✅ | ⬜ pending |
| 91-10-02 | 10 | 4 | STOP-05, STOP-04, STOP-03 | T-91-34 | both bodies identical; no stops for non-transfer; Step 6 waiting line from the server amount | component | `npx vitest run tests/Step2DateTime.test.tsx tests/Step6Payment.test.tsx tests/BookingSummaryBlock.test.tsx tests/booking-store.test.ts tests/Step6CardOnFile.test.tsx tests/i18n-completeness.test.ts` | ✅ (update) | ⬜ pending |
| 91-11-01 | 11 | 3 | EXTRA-01 | T-91-35 | button only from allowed_actions; stated amount | component + route | `npx vitest run tests/extra-charge-modal.test.tsx tests/admin-payment-api.test.ts tests/PaymentPanel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 91-11-02 | 11 | 3 | EXTRA-01 | T-91-35, T-91-36 | double submit sends one request; no re-send on 409 | component | `npx vitest run tests/extra-charge-modal.test.tsx tests/PaymentPanel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ after 11-01 | ⬜ pending |
| 91-12-01 | 12 | 4 | STOP-04, STOP-05 | T-91-37 | stops attached after the admin guard | route + component | `npx vitest run tests/admin-bookings.test.ts tests/trip-route-section.test.tsx tests/BookingsTable.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ / ✅ | ⬜ pending |
| 91-12-02 | 12 | 4 | STOP-04, STOP-05 | T-91-38, T-91-47 | 422 stops_edit_unsupported without override; manual pickup edit only as landing + allowed offset (else 422 landing_pickup_mismatch) | route | `npx vitest run tests/admin-bookings-dispatch.test.ts tests/admin-bookings.test.ts tests/BookingsTable.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ✅ | ⬜ pending |
| 91-13-01 | 13 | 4 | STOP-04, STOP-05 | T-91-39 | no money on the driver page | page + component | `npx vitest run tests/driver-trip.test.ts tests/driver-trip-screen.test.tsx tests/driver-trip-cash.test.ts tests/driver-trip-progress.test.ts` | ✅ (update) | ⬜ pending |
| 91-13-02 | 13 | 4 | STOP-01, STOP-04 | T-91-40 | waypoints in order, never optimised | component | `npx vitest run tests/RouteMap.test.tsx tests/StickyBookingPanel.test.tsx tests/driver-trip-screen.test.tsx` | ✅ (update) | ⬜ pending |
| 91-14-01 | 14 | 4 | STOP-04, STOP-05 | T-91-41 | addresses escaped | render | `npx vitest run tests/email-trip-route.test.ts tests/email.test.ts` | ❌ created in task | ⬜ pending |
| 91-14-02 | 14 | 4 | STOP-04 | T-91-42 | stops failure never blocks a confirmation | route + render | `npx vitest run tests/email-trip-route.test.ts tests/webhooks-stripe.test.ts tests/email.test.ts tests/payments-emails.test.ts` | ✅ | ⬜ pending |
| 91-14-03 | 14 | 4 | STOP-04, STOP-05 | T-91-41, T-91-42 | golden unchanged; calendar sync never blocked | render + unit | `npx vitest run tests/email-trip-route.test.ts tests/driver-accept-email.test.ts tests/admin-assignment.test.ts tests/google-calendar-sync.test.ts tests/email.test.ts` | ✅ | ⬜ pending |
| 91-15-01 | 15 | 5 | STOP-05 | T-91-44 | expected pickup and CAS; reevaluateAfterEdit | unit + component | `npx vitest run tests/landing-change.test.ts tests/move-pickup-dialog.test.tsx tests/trip-route-section.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ created in task | ⬜ pending |
| 91-15-02 | 15 | 5 | STOP-05 | T-91-43, T-91-45 | admin-only; only the admin route moves a pickup | route | `npx vitest run tests/admin-landing-route.test.ts tests/landing-change.test.ts tests/admin-flight-refresh.test.ts tests/cron-flight-refresh.test.ts` | ❌ created in task | ⬜ pending |
| 91-16-01 | 16 | 6 | all | T-91-12, T-91-26 | end-to-end with fakes | integration | `npx vitest run tests/phase91-e2e.test.ts` | ❌ created in task | ⬜ pending |
| 91-16-02 | 16 | 6 | all | all | full gate | full suite + tsc + verify | `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'` | ✅ | ⬜ pending |
| 91-16-03 | 16 | 6 | EXTRA-01, STOP-02, STOP-04, STOP-05 | T-91-46 | live proof on the owner's own card only | manual live (owner + orchestrator MCP) | `npx vitest run tests/phase91-e2e.test.ts` + Supabase MCP queries | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan: every task writes its tests first (TDD) and the shared test infrastructure is extended by the first plan that needs it.

- [ ] `tests/helpers/fake-payments-db.ts` — tables `booking_stops`, `booking_extra_charges`, CHECK and unique emulation, ledger kinds `extra_charged` / `extra_failed` (plan 91-01, wave 1)
- [ ] `LEDGER_KINDS` + migration CHECK parity for the two new kinds (plan 91-01, wave 1)
- [ ] hoisted `'@/lib/route-distance'` mock in the eight existing checkout test files (plan 91-04 Task 1, same task that changes priceCheckout)
- [ ] `tests/stops-fee.test.ts`, `tests/route-distance.test.ts` (91-02), `tests/airport-pickup.test.ts` (91-07) — pure / fetch-mock, written RED first
- [x] Framework install: none (Vitest present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration 089 applied live, grants and RLS correct | STOP-03, STOP-04, STOP-05, EXTRA-01 | executors have no Supabase access | 91-01 Task 3: orchestrator applies with the Supabase MCP and runs `91-01-smoke.sql` (rolled back) |
| Off-session extra charge on a real saved card | EXTRA-01 | the local Stripe key is a dead placeholder; needs the live key and a real card | 91-16 Task 3: owner's canary booking, 1 EUR "other" extra, check the card_extra PaymentIntent in Stripe, ledger rows via MCP, receipt email, refund, booking stays completed |
| Google Routes distance through stops in production | STOP-02 | tests mock Google; the live key is only in production | 91-16 Task 3 step 2-3: production booking with one stop, `distance_km` equals the server route value |
| Wizard stop list, wait select, reorder, landing + offset UI on desktop and mobile | STOP-01, STOP-03, STOP-05 | visual layout | 91-16 Task 3 step 2 and `/gsd-verify-work 91` UAT on rideprestigo.com |
| Admin Route section, move-pickup dialog and extra modal in the live admin | STOP-04, STOP-05, EXTRA-01 | localhost admin login is blocked by the fail-closed rate limiter | 91-16 Task 3 step 4 on production admin |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 91s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
