---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 27
subsystem: payments
tags: [cancellation, email, i18n, operator-alerts, driver-notice, security]
requires:
  - phase: 89-08
    provides: "cancelBooking, CancelResult, scheduleCancelRouteEmail call sites"
  - phase: 89-25
    provides: "sendPaymentEmail kind cancelled (free, by_prestigo, late), fee_decision_needed and client_cancelled operator alerts"
provides:
  - "scheduleCancelRouteEmail(booking, previousStatus, CancelNotice): the cancelled email through the payment email renderer, booking language, once per email:cancelled:<id>"
  - "CancelNotice (booking-status-service): variant free | by_prestigo | late, moneyOutcome, refundMinor, feeMinor, freeUntilMs"
  - "sendDriverCancelledEmail / buildDriverCancelledEmailHtml in lib/email.ts"
  - "cancelBooking schedules the driver mail and the operator alerts with after()"
  - "fee_decision_needed alert note case_missing (orphan of 89-08)"
affects: [89-19, 89-16, 89-28]
key-decisions:
  - "Variant follows who cancelled and what happened: admin_prestigo = by_prestigo; late only when the fee case branch ran (money kept); everything else free, with the money sentence of what actually happened (released, refunded, none)"
  - "The late mail passes feeMinor (the case proposal) and freeUntil (epoch ms) explicitly, so a legacy booking without a stored policy still gets a complete mail"
  - "A late cancel whose case could not be opened still mails the client and alerts the operator (alert key alert:fee_decision_needed:<id>:case_missing, note case_missing, body says there is no case to charge or waive)"
  - "Driver mail goes to the ACCEPTED driver only (getAcceptedDriver, as the reminders do), on every path after the status CAS, also when the money step failed; reference, pickup date and time and trip link only (T-89-29)"
  - "The renderer is imported dynamically inside after() so the status service does not load the message catalogs on paths that never send a cancelled mail"
  - "The admin PATCH status=cancelled path ('full' profile) is untouched and still sends the English sendStatusCancelledEmail"
requirements-completed: [HOLD-06, CANC-01]
status: complete
completed: 2026-11-06
commits: 2
plan_head_before: a8ea758def68907849573be3ba1f6393ee774403
plan_head_after: 3aa75cea81da16daea6de0cc9454bda9235c1860
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
---

# Phase 89 Plan 27: Everyone told once, in the right language Summary

**The cancelled email now goes out through the payment email renderer in the booking language with the variant that matches who cancelled and what happened to the money, the accepted driver gets a plain "Trip cancelled" mail with no amount and no client data, and the operator is alerted once on a late cancel, a missing fee case, and a client's own in-time cancel.**

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 2 | driver cancelled email, case_missing operator alert | 5edc8759 |
| 1 (tracer) + 2 (wiring) | cancelled email via sendPaymentEmail, driver mail and alerts scheduled from cancelBooking | 3aa75cea |

The two tasks share `lib/payments/cancel.ts`, so the code of Task 1 and the wiring of Task 2 are one commit; the independent pieces of Task 2 (sender, alert wording) came first. Tracer verified end to end in `tests/payments-cancel-notices.test.ts` before the rest was written: a late admin cancel of a `ru` booking through the real `cancelBooking`, real `scheduleCancelRouteEmail`, real renderer and sender delivered one Resend message with the Russian subject and the late wording, and the ledger row `email:cancelled:<id>`.

## What was built

- `lib/booking-status-service.ts`: `scheduleCancelRouteEmail` takes a `CancelNotice` instead of the English money enum. Same guards as before (no recipient, `unpaid`, partner) and the same `notification_flags.cancelled` silence; delivery is `sendPaymentEmail` kind `cancelled` keyed `email:cancelled:<bookingId>` (exactly once, replaces the 10-minute email-log window). Never throws into the caller.
- `lib/payments/cancel.ts`: `cancelBooking` is now a thin wrapper over `runCancel`; once the status CAS applied, `holder.applied` is set and the wrapper schedules, in one `after()`, the driver mail and the operator alerts, each part isolated so a failure is logged and never changes the result. Every success point calls `scheduleCancelRouteEmail` with a notice: free paths (`freeNotice`: by_prestigo for `admin_prestigo`, free otherwise; released, refunded with the amount, or none), and the late path (variant late, `feeMinor` = the case proposal, `freeUntilMs`). `BOOKING_COLUMNS` gained `locale` and `capture_before`.
- Operator alerts: late cancel with a case -> `fee_decision_needed` (key `alert:fee_decision_needed:<id>`, cancelledAt, freeUntil, proposedMinor); late cancel with no case -> same kind, key `...:case_missing`, `note: 'case_missing'`; client_token in-time -> `client_cancelled` (key `alert:client_cancelled:<id>`, money outcome, refund amount). An operator's own in-time cancel alerts nobody.
- `lib/email.ts`: `sendDriverCancelledEmail`, `buildDriverCancelledEmailHtml`. Subject `Trip cancelled — <reference>`; "The client cancelled this trip." (or "Prestigo cancelled this trip.") "You do not need to go."; reference, pickup date and time (Prague), OPEN TRIP button to `/driver/trip/<trip_token>`. No replyTo. Deduped with `logEmail` (`driver_cancelled`).
- `lib/payments/alerts.ts`: with `note: 'case_missing'` the fee alert body says the case could not be opened and nothing is charged, instead of "Charge or waive the fee from the booking."

## Verification

- `npx vitest run` on the 29 suites that import the touched modules plus the writer gates and `booking-status-parity`: 1158 passed. `tests/payments-cancel-notices.test.ts` (21 new), `tests/payments-cancel.test.ts` (94), `tests/admin-bookings-cancel.test.ts` (57), `tests/email.test.ts`, `tests/email-reply-to.test.ts`, `tests/payments-alerts.test.ts` (29): all green.
- New tests assert: Russian subject for locale ru; one send for two calls with the same key; free, by_prestigo and refunded wording in English; no mail for partner, unpaid, and with the flag off (driver still told); the driver mail body has no client email, phone, name, currency or fee word; no assigned or only a pending driver sends nothing; driver told when the refund failed; lookup or send failure leaves the cancel unchanged; late alert content; client_cancelled alert; no alert for an operator in-time cancel or a refused cancel; the orphan case mails and alerts.
- `npx tsc --noEmit`: no error outside `tests/`, none in touched tests. `npx eslint --quiet` on all touched files: clean.

## Deviations from Plan

**1. [Rule 2 - Missing functionality] `lib/payments/alerts.ts` and `tests/payments-alerts.test.ts` touched**
The orphan case (late cancel applied, no fee case) needed an alert that does not point at a Charge/waive button that does not exist. Neither file is in the plan's `files_modified`; the change is one conditional line in the fee body plus one test.

**2. [Rule 3 - Blocking] `tests/payments-cancel.test.ts` updated**
It encoded the old `scheduleCancelRouteEmail(booking, status, 'no_charge')` signature and "no email on a late cancel". Now asserts the notice objects. `tests/admin-bookings-cancel.test.ts` (in the plan's list) now mocks `payments/emails/send`, no longer expects `logEmail('booking_cancelled')` or the English sender, and no longer requires `after()` to be uncalled on a failed refund, an unpaid or a partner booking (the notices callback is registered there).

**3. [Process] Tasks 1 and 2 share one code commit** (see Tasks). The plan-head ledger file could not be written (sandbox); `plan_head_before` is the dispatch base and `commits` was measured with `git rev-list --count a8ea758d..HEAD` (2 before this SUMMARY commit).

## Notes for the orchestrator and later plans

- **Plan 89-19 (deploy note):** this is not behind the flag. Every client cancelled in admin from now on gets the new cancelled email in the booking language; it also changes the English wording (UI-SPEC 8.2) and the money sentence. The old English `sendStatusCancelledEmail` and `CancelMoneyOutcome` remain only for the admin PATCH `status=cancelled` ('full' profile) path, which is still English in every locale; moving that path to the same renderer is a small follow-up (not in this plan's scope).
- A booking with `locale` NULL renders English (renderer default).
- Only an ACCEPTED driver is mailed. A driver with a pending offer is not; his accept link on a cancelled booking is the responsibility of the accept route (not checked here).
- A late cancel on a booking where `isFeeEligible` is false (no money to take a fee from) is mailed as the free variant with the money sentence of what happened, and sends no operator alert (the "free cancellation" wording of `client_cancelled` would be wrong for it).
- The admin UI still sends no `cancelled_by` (plan 89-16), as flagged in 89-08.

## Known Stubs

None.

## Threat Flags

None beyond the register. T-89-29 (driver mail carries reference, time and trip link only) is mitigated and asserted by a test that plants client name, email and phone on the booking and checks they and any money wording are absent.

## Self-Check: PASSED

- lib/booking-status-service.ts, lib/payments/cancel.ts, lib/email.ts, lib/payments/alerts.ts, tests/payments-cancel-notices.test.ts: FOUND
- commits 5edc8759, 3aa75cea: FOUND
