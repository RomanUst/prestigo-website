---
phase: 88-card-on-file-scheduled-holds
plan: 17
subsystem: payments
tags: [stripe, canary, rollout, card-on-file, holds, emails]
status: complete

requires:
  - phase: 88-16
    provides: CAS-first cancel, card hold release on cancel, trip-edit hook
provides:
  - "Phase 88 live on production behind card_flow_mode, owner-only canary passed"
  - "QStash schedule prestigo-payment-tick (*/15), six webhook events on the live endpoint"
  - "Admin cancel now emails the client after the money step succeeds"
affects: [89]

commits: 3
---

# Plan 88-17 summary: end-to-end test, production rollout, owner canary

Merged to production with the flag off (PR #88), rollout steps done by the owner, canary passed on 2026-11-06.
Canary fixes shipped in PR #89 and PR #90.

## Rollout

- PR #88 merged, commit 08bbfb18, production deploy success, `card_flow_mode` off at merge.
- QStash schedule `prestigo-payment-tick` (`*/15 * * * *`) created by the owner; tick reached production, POST 200.
- Stripe: disabled duplicate endpoint deleted by the owner; six events added to the live endpoint.
- Not on the live endpoint: `charge.refunded`. A refund made by hand in the Stripe Dashboard is not seen by the site.

## Canary results (owner card, allowlist = ustyugov.roman.payment@gmail.com)

| Booking | Scenario | Result |
|---|---|---|
| PRG-20261106-229544 | Far out, en, card saved, Place hold now, completed | card_saved -> authorized -> captured, 6900/6900 |
| PRG-20261106-50AED4 | Under 72 h, ar, hold at checkout, cancelled | authorized -> released, 0 captured, hold_released from admin and webhook |
| PRG-20261106-1B6728 | Far out, card saved, cancelled | card_saved -> released, 0 captured, no Stripe object |
| PRG-20261106-83DA6A | Far out, card saved, cancelled after PR #90 | released, 0 captured, `booking_cancelled` in email_log |
| PRG-20261106-38C861 | Under 72 h, en, hold at checkout, completed | authorized -> captured, 6900/6900 |

Consent rows carry text_version `2026-11-draft-1`, text_sha256, ip, confirmed_at. Ledger rows matched the plan on every
booking, no `last_payment_error`, no refund_failed marker. A released booking keeps `hold_at`, but the tick claims only
`card_saved`, so no hold follows.

Also seen: PRG-20261106-133BD1 was a real pay-now payment of 69 EUR because the flag was off, refunded by the owner.
PRG-20261106-D8ED0F is an abandoned pay-now attempt, status unpaid, no money moved.

Owner observations: Apple Pay offered on both forms; the 3DS screen sat slightly off at first on the Arabic page, then
was usable; the owner confirmed the emails after the fixes look right.

## Fixes from the canary

- PR #89: payment email intro moved from p to div (some mail apps closed the p at the first bdi, leaving black text on
  navy); contact line has explicit gold links in all transactional emails; confirmation page got a linked wordmark,
  Book another ride and Back to home.
- PR #90: the admin cancel dialog sent the client no email at all, for pay-now refunds too. It now sends the cancelled
  email after the refund or release succeeds, with a line about the money. A failed refund sends nothing.

## Open for Phase 89 (before any client sees the flow)

Owner decisions and Dashboard:
- Radar for saved payment methods, pricing plan and MCC 4121 notes: not confirmed.
- `charge.refunded` on the live endpoint: not decided.
- `card_flow_mode` was canary at the end of the canary; the plan's rule stands: no address but the owner's before Phase 89.

Found in the canary:
- One intent request took about 46 s (08:01:34 to about 08:02:19), of which about 25 s sat between pricing and getUser.
  Later requests took about 5 s. Cause not proven; route page traffic ran at the same time. Add step timings if it recurs.
- The chat button covers the end of the consent text on a phone.
- Confirmation page and the cancelled email are English in every locale. In payment emails the contact line keeps an
  English "or".
- 3DS position on RTL pages: check again on an LTR page.
- Revolut shows the merchant as Transfersline.com although Stripe sends RIDEPRESTIGO.COM. Bank side, other banks unchecked.
- The ledger row for a hold-at-checkout booking is named `setup_started`.
- Red error on the old pay-now form before a successful second tap: read as a failed first attempt, not reproduced.

Carried from the review: no_show via PATCH keeps the hold until it lapses; retry from `expired` may replay the old hold
key (the fallback charge keeps the money safe); 20 h notice retry window; `alert:new_booking` and admin `send_link` claim
the ledger key before sending; same-key different-parameter settle error loops without an alert; D-23 erasure; counsel
review of consent text.

## Test money

Both test charges are refunded. 229544 was refunded on 2026-11-06 at 07:22 UTC, before charge.refunded reached the site, so it has no ledger row. 38C861 was refunded at 12:11 UTC and has its refund_observed row.
