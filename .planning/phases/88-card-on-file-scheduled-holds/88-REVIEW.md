---
phase: 88-card-on-file-scheduled-holds
reviewed: 2026-11-04
depth: deep
diff_base: a6d00730
slices: [88-REVIEW-A.md (money engine), 88-REVIEW-B.md (checkout + webhook), 88-REVIEW-C.md (admin + emails + infra)]
findings:
  critical: 9
  warning: 22
  info: 21
  total: 52
  unique_critical_themes: 6
status: issues_found
---

# Phase 88 — Code Review (consolidated)

Three deep reviewers, one per slice. Full findings with file:line and failure scenarios are in the slice files.
Several Critical findings were found independently by two or three slices; they are deduplicated below into fix themes.

## Critical fix themes (must close before the canary)

| Theme | Findings | Summary |
|-------|----------|---------|
| T1 Recovery link outlives the debt | A-CR-01, B-CR-02, C-CR-02 | Link never deactivated when a hold is placed / retry succeeds / settle collects / admin re-sends while a hold is live; a later link payment on `authorized`/`captured` is only logged → client charged twice. |
| T2 `send_link` offered while the engine still collects | A-CR-02, C-WR-03 | Admin can send a link on completed `authorized`/`card_saved`/`expired` rows (tick settles them within 15 min) and on cancelled/no-show rows. |
| T3 Hold-at-checkout never saves the payment method | A-CR-03, B-CR-01 | `applyHoldNowAuthorized` doesn't persist `stripe_payment_method_id` → fallback, difference (D-16) and re-hold (D-18) all fail with `missing_payment_details`. |
| T4 Cancel of a `captured` card booking | C-CR-01 | Paid via recovery link before the trip → cancel returns ok, no refund, no `refund_failed`, no alert. |
| T5 Status dropdown "Cancelled" bypasses the payment path | C-CR-03 | PATCH profile `full` cancels without releasing the hold or deactivating the link. |
| T6 Cancel during checkout leaves a live authorization | B-CR-03, A-WR-05, C-WR-02 | `checkout_pending` release makes no Stripe call; client finishing 3DS later leaves a full hold on a cancelled booking. |

## Warnings (fix before canary unless noted)

- Engine robustness: A-WR-01 (lease vs Stripe timeout, 409 idempotency classified as invalid), A-WR-02 (auth errors = declines), A-WR-03 (idempotency key reuse after price edit), A-WR-04 (hold on cancelled/no-show), A-WR-06 (stuck `placing_hold` after pickup), A-WR-07 (ledger duplicate treated as success), A-WR-08 (no backstop for completed `failed`), A-WR-09 (`charge_expired_for_capture` → fallback), A-WR-10 (ledger-before-send loses emails), A-WR-11 (admin edit re-price drops promo/extras → auto difference charge).
- Checkout/webhook: B-WR-01 (replaced hold-now PI not voided), B-WR-02 (pay-now vs card on same booking row), B-WR-03 (cancelled answered as confirmed), B-WR-04 (dispute/refund on `diff:` charge unmatched), B-WR-05 (hold date not checked at intent).
- Admin: C-WR-01 (cancel reads stale payment state vs tick claim), C-WR-04 (stale panel/list after actions), C-WR-05 (`refund_failed` can't be cleared), C-WR-06 (date-only formatted with time).

## Info

21 items across slices (A-IN-01..09, B-IN-01..07, C-IN-01..05); see slice files. Deferred unless trivially fixed alongside a theme.
