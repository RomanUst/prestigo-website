---
phase: 88-card-on-file-scheduled-holds
slice: C (admin + emails + infra scripts)
reviewed: 2026-11-04T00:00:00Z
depth: deep
diff_base: a6d00730
files_reviewed: 22
files_reviewed_list:
  - app/api/admin/bookings/[id]/payment/route.ts
  - app/api/admin/bookings/cancel/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/admin/settings/route.ts
  - app/(internal)/admin/(dashboard)/settings/page.tsx
  - components/admin/BookingsTable.tsx
  - components/admin/CardFlowSettings.tsx
  - components/admin/PaymentPanel.tsx
  - components/admin/PaymentStateBadge.tsx
  - components/admin/StatusBadge.tsx
  - lib/payments/alerts.ts
  - lib/payments/emails/render.ts
  - lib/payments/emails/send.ts
  - lib/email.ts
  - infra/lib/secret-io.mjs
  - infra/qstash/payment-tick-schedule.mjs
  - infra/stripe/webhook-events.mjs
  - infra/stripe/card-flow-smoke.mjs
  - infra/stripe/README.md
  - vercel.json
  - messages/*.json (PaymentEmails.*, Booking.step6.cardOnFile.*; 7 locales)
  - (traced, not in slice) lib/payments/{actions,hold,recovery,settle,edit-hook,state,timing,tick}.ts, lib/stripe-webhook/{recovery-events,card-confirm,hold-events}.ts, lib/booking-transitions.ts, middleware.ts, supabase/migrations/085_payment_state_card_on_file.sql
findings:
  critical: 3
  warning: 6
  info: 5
  total: 14
status: issues_found
---

# Phase 88: Code Review Report, Slice C (Admin, Emails, Infra)

**Reviewed:** 2026-11-04
**Depth:** deep (cross-file call chains into lib/payments and lib/stripe-webhook)
**Files Reviewed:** 22
**Status:** issues_found

## Summary

These parts hold up: the admin guard order, CSRF (`/api/admin` is in the strict-Origin list), the strict `{ action }` schema with no amount field, and settings validation. The settings checks are correct: `'on'` is rejected, the hold lead must be 6–96, and the canary list takes at most 20 emails, each trimmed, lower-cased and checked as an email. The other sound parts are HTML escaping in the client emails, RTL `dir` on `<html>`/`<body>`, the https-only pay/calendar URL check, scrubbed and argv-refusing infra scripts, truly read-only `--dry-run` paths, an idempotent QStash `scheduleId` upsert, and the daily cron entry. Locale parity is clean: 42 `PaymentEmails` keys and 23 `cardOnFile` keys exist in all 7 locales, with matching placeholders, no `[XX]` stubs and no ICU apostrophe traps.

The defects are in how cancel, payment links and the admin action matrix work together across modules. Three of them move or keep client money incorrectly:

1. A card booking that was already paid through a recovery link is cancelled with `{ ok: true }`. Nothing is refunded and no one is alerted.
2. A recovery link is never deactivated when the booking is later held or charged another way, so the client can pay twice.
3. The status dropdown cancels card bookings without releasing the hold.

## Critical Issues

### C-CR-01: Cancelling a card booking that was already paid by recovery link silently keeps the money

**File:** `app/api/admin/bookings/cancel/route.ts:96-97, 198-207` (via `lib/payments/hold.ts:364-372`)

**Issue:** For `payment_mode === 'card_hold'` the route never refunds (`refundsPayNow = !isHold && ...`). It always calls `releaseHold`. `releaseHold` has no branch for `captured`: that state falls through to `return 'noop'`, and the route answers `{ ok: true }`. A card booking reaches `captured` *before the trip* on a designed path:

- a scheduled hold is declined: `recordDefinitiveFailure` → `failed` → `handlePaymentFailure` sends the client a recovery Payment Link (D-13);
- the client pays it: `handleRecoveryPaid` (`lib/stripe-webhook/recovery-events.ts:112-145`) moves `failed → captured` and sets `payment_intent_id`;
- the booking status is still `confirmed`/`assigned`, so the cancel route allows it (`NON_CANCELLABLE_STATUSES` only lists `cancelled/completed/no_show`).

**Failure scenario:** The client pays the full fare through the "payment failed" email. The trip is then cancelled in admin. The dialog says "Cancelling releases the hold on the client's card. Nothing is charged." (`BookingsTable.tsx`, Variant D). The route returns 200. Nothing is refunded, no `refund_failed` ledger row is written, no operator alert is sent and no banner appears. The client has paid for a ride that was cancelled, and nobody is told.

**Fix:** Handle money already collected in the hold branch. At minimum, treat it as a D-20 money failure so the operator refunds by hand:
```ts
if (isHold) {
  const collected = booking.payment_state === 'captured' || booking.payment_state === 'balance_due'
    || (num(booking.captured_amount_minor) ?? 0) > 0
  if (collected) {
    // Phase 89 owns the policy; until then never answer ok while money is held.
    return moneyFailed(new Error('collected'), 'refund')   // refund_failed ledger + alert + 502
  }
  ...
}
```
Also add `captured_amount_minor` to the SELECT at line 76-80. Pass the collected amount to `failedAmount` (not `hold_amount_minor`). Have the dialog show a refund variant when `payment_state` is `captured`. A real fix refunds `payment_intent_id` with `stripeKeys.refund`.

### C-CR-02: Recovery Payment Link stays payable after the booking is held or charged another way (double charge)

**Files:** `lib/payments/actions.ts:37-38, 65, 143-163` (admin Retry / Send link), `lib/payments/hold.ts:283-327`, `lib/payments/settle.ts` (no link handling), `lib/stripe-webhook/recovery-events.ts:173-174, 178-198`

**Issue:** A recovery link (`restrictions.completed_sessions.limit: 1`, one fixed amount) is deactivated only by `releaseHold`, by `refreshRecoveryLink` when it is replaced, and by `handleRecoveryPaid` itself. No other way of collecting the money deactivates it:

- the admin **Place hold now** (`retry` before the trip) and the automatic D-13 retry (tick step B) take the booking `failed → placing_hold → authorized`. `placeHold` never touches `recovery_link_id`;
- `settleBooking` charging a `failed`/`card_saved`/`expired` booking after the trip (admin **Capture** / **Retry charge**, completion sweep) does not deactivate it;
- the matrix offers **Send payment link** while a hold is still live (`completed && authorized`, `LINK_STATES_COMPLETED`). Capture then stays possible for the same booking.

When the client pays a link while the state is `authorized`/`captured`, `handleRecoveryPaid` calls `parkUnmatchedPayment`. That function only writes a ledger row and a `console.error`. No operator alert is sent and nothing is refunded.

**Failure scenario:** The hold is declined at 14:00 and the client is emailed "Pay {amount} securely". The email copy says "If you pay with the link, we won't try your card again". The automatic retry at 02:00 succeeds (`authorized`). The client opens the email in the morning and pays the still-live link. The webhook parks the payment silently. The driver completes the trip and `settleBooking` captures the hold. The client is charged the full fare twice, and only a server log line records it.

**Fix:** Deactivate and clear the recovery link inside every transition that secures the money another way. These are `placing_hold → authorized` in `placeHold`, the `capturing → captured` patches in settle, and the `card_confirm` authorized path. Add `recovery_link_id: null, recovery_link_url: null` to the patch, then call `deactivateBookingPaymentLink(oldLinkId)` after the CAS wins. Remove `authorized` from `LINK_STATES_COMPLETED` (or release the hold before creating the link). In `parkUnmatchedPayment`, call `sendPaymentOperatorAlert('refund_failed' | new 'unmatched_payment', ...)` so a stray payment always reaches the owner.

### C-CR-03: Cancelling through the status dropdown skips the hold release for card bookings

**Files:** `app/api/admin/bookings/route.ts:324-345` (status branch), `components/admin/BookingsTable.tsx:1311-1317` (`requestStatusChange`), `lib/booking-transitions.ts:16-26`

**Issue:** `UI_TRANSITIONS` offers `cancelled` from every active status. `requestStatusChange` sends it to `PATCH /api/admin/bookings { status: 'cancelled' }` → `advanceBookingStatus(profile 'full')`. Nothing in that path calls `releaseHold`, cancels the PaymentIntent, deactivates the recovery link or writes a ledger row: `releaseHold` is called only from the cancel route and `actions.ts`. Only the "Cancel booking" button goes through `/api/admin/bookings/cancel`, which implements D-04/D-20.

**Failure scenario:** The operator picks "Cancelled" in the status select of a card booking in `authorized`. The booking is cancelled and profile `full` sends the client the "cancelled" email. The full-fare authorization stays on the client's card until Stripe lets it lapse (up to ~7 days). The admin shows "Hold active" with no alert. A booking in `failed` keeps its live recovery link, so the client can still pay for the cancelled trip, and that payment is parked silently (see C-CR-02).

**Fix:** Reject `to === 'cancelled'` in the PATCH status branch for `payment_mode === 'card_hold'` (422 `use_cancel_route`), or delegate it to the cancel route's logic. In the UI, send `requestStatusChange(b, 'cancelled')` to `setPendingCancel(b)` so every cancel goes through one money-aware path:
```ts
if (newStatus === 'cancelled') { setPendingCancel(booking); return }
```

## Warnings

### C-WR-01: The cancel route uses the pre-CAS snapshot, so a hold can be placed on a cancelled booking (and the client is emailed "hold placed")

**File:** `app/api/admin/bookings/cancel/route.ts:99-103, 139-148, 198-206`; `lib/payments/hold.ts:211, 285-327, 353-384`

**Issue:** The `placing_hold`/`capturing` 409 check runs on the row read at line 74. The tick can claim the row (`card_saved → placing_hold`) after that read. The status CAS then still succeeds, and `releaseHold(booking)` works from the stale `card_saved`: its CAS fails with `currentState: 'placing_hold'` and returns `'busy'`, so the route writes `refund_failed` and returns 502. Meanwhile `placeHold` checks no booking status. It authorizes the hold (`placing_hold → authorized`) and sends the client the `hold_placed:scheduled` email for the cancelled booking. The alert tells the operator to "Cancel the … hold manually in the Stripe Dashboard", but at that moment the hold may not exist yet. In the rarer variant where the tick finishes before `releaseHold`'s CAS (or the hold expired to `expired`), `releaseHold` returns `'noop'` and the route answers `{ ok: true }` with a live hold or a stale state.

**Fix:** After the status CAS, re-read `payment_state` and pass the fresh row to `releaseHold`. When the answer is `busy`, wait for the lease (or schedule a follow-up release) instead of only alerting. In `placeHold`, re-check `status` (or add `status IN active` to the `apply_payment_transition` call for `placing_hold → authorized`). If the booking is cancelled, void the PaymentIntent and skip the email. Treat `noop` from the cancel path as a failure unless the fresh state is `released`/`none`.

### C-WR-02: Cancelling a card booking in `checkout_pending` leaves the checkout hold unvoided

**File:** `app/api/admin/bookings/cancel/route.ts:101`; `lib/payments/hold.ts:364-366`; `lib/stripe-webhook/card-confirm.ts:318-337`

**Issue:** The edit hook treats `checkout_pending` as in flight (`edit-hook.ts:40`). The cancel route does not: it releases `checkout_pending → released` without calling Stripe. If the client's at-checkout hold (`card_hold_now`) authorizes afterwards, `applyHoldNowAuthorized` tries `from: ['checkout_pending']`, which fails because the state is already `released`. Its own `cancelled` branch also only moves to `released` and never cancels the PaymentIntent. Nothing voids the authorization.

**Failure scenario:** The operator cancels a pending card booking while the client is completing 3DS for a pickup inside 72 h. The client's card is authorized for the full fare. Nobody owns the authorization, so it stays until Stripe lets it lapse (about 7 days), with no alert.

**Fix:** Add `checkout_pending` to the cancel route's 409 `payment_busy` states (same as the edit hook). Also, in `applyHoldNowAuthorized`, when `cancelled` is true or the CAS is lost because the state is `released`, call `paymentIntents.cancel(pi.id, …, { idempotencyKey: stripeKeys.voidHoldNow(pi.id) })`.

### C-WR-03: The action matrix ignores `cancelled` / `no_show`, so it offers "Place hold now" and "Send payment link" on cancelled bookings

**File:** `lib/payments/actions.ts:53-67` (served by `app/api/admin/bookings/[id]/payment/route.ts:102, 153`)

**Issue:** `allowedPaymentActions` looks only at `payment_state` and `status === 'completed'`. A cancelled booking in `card_saved`/`expired`/`failed` gets `retry` and `send_link` (and `failed` gets `send_link`). Those states are reachable through the C-WR-01 race, a DB failure during release, or C-CR-03. `claimForHold`/`placeHold` do not check status either. The same applies to terminal `no_show`, where a full-fare link can be sent before Phase 89 defines the no-show policy.

**Failure scenario:** The panel shows a cancelled booking in `expired` with a "Place hold now" button and a "No valid hold" banner (`PaymentPanel.tsx:451-459`, which checks `!completed` only). Clicking it authorizes the full fare on a cancelled trip.

**Fix:** At the top of `allowedPaymentActions`:
```ts
if (booking.status === 'cancelled' || booking.status === 'no_show') {
  return RELEASE_STATES.has(state) || state === 'authorized' ? ['release'] : []
}
```
Also make `computeBanner` skip the hold banners for cancelled bookings.

### C-WR-04: Stale payment data in admin after cancel and after panel actions; a dead link stays copyable

**File:** `components/admin/BookingsTable.tsx:1412-1416, 1428-1430`; `components/admin/PaymentPanel.tsx:783-797`; `lib/payments/actions.ts:178-191`

**Issue:**
- After a successful cancel (or the D-20 502), `handleCancel` only patches `status`. `payment_state` is not updated and `paymentRefreshKeys` is not bumped. The row badge keeps showing "Hold active" or "Payment failed", and an open PaymentPanel keeps the "Release hold" button. The new refund-failed banner does not appear until a reload.
- PaymentPanel actions never tell the parent, so the row's `PaymentStateBadge` stays stale after Release, Capture or Waive.
- **Send payment link** with `email_failed` (502): `refreshRecoveryLink` has already created the new link, stored it and *deactivated the old one*. The panel shows "Could not complete the action. Nothing was changed." and does not refetch, so the facts grid still offers **Copy link** for the old, deactivated URL. The same "Nothing was changed" text appears on the 500 after `admin_action` was written and the engine threw part-way.

**Failure scenario:** The client says the email never arrived. The operator copies the link from the panel and sends it by WhatsApp. The client gets a dead Stripe link.

**Fix:** Bump `paymentRefreshKeys[booking.id]` in both `handleCancel` paths. Add an `onChanged(state)` callback from PanelBody to BookingsTable that updates `payment_state`. Call `onRefetch()` on every non-409 error, and use a text that does not claim nothing changed for 500/502 (for example "The action may have partly completed. The panel shows the current state.").

### C-WR-05: The `refund_failed` flag is permanent, with no way to resolve it

**File:** `app/api/admin/bookings/[id]/payment/route.ts:91-92, 103`; `components/admin/PaymentPanel.tsx:415, 710-719`

**Issue:** `refund_failed` is true whenever *any* `refund_failed` ledger row exists, and the ledger is append-only. After the operator refunds or releases by hand in Stripe as instructed, the danger badge and banner ("Refund it manually in the Stripe Dashboard") stay forever. This happens even after the panel's own **Release hold** moves the booking to `released`, and for pay-now bookings as well. The operator cannot tell an open failure from a closed one.

**Fix:** Clear the flag when a later resolving row exists (`hold_released`/`refund_observed` with `created_at` after the latest `refund_failed`). Alternatively, add an admin action "Mark refund resolved" that writes a `refund_resolved`-style ledger row (new `LEDGER_KINDS` entry plus a CHECK in a new migration), and compute `refund_failed` as "latest failure has no later resolution".

### C-WR-06: The "Pickup moved, hold released" message shows a made-up time

**File:** `components/admin/BookingsTable.tsx:222-227` (with `lib/payments/edit-hook.ts:212`, `lib/payments/timing.ts:47-49`)

**Issue:** `hold_date_iso` is a Prague calendar date `YYYY-MM-DD` (`holdDateIso`). `formatPragueFull(effect.hold_date_iso)` parses it as UTC midnight and renders it with hour and minute, so the operator reads "A new hold is placed on Thu 12 Nov, 01:00" (02:00 in summer). The real hold instant is pickup minus the lead (for example 14:00). If the new hold time has already passed, the hold is placed on the next tick, not on that date.

**Fix:** Return the instant (`hold_at_iso: new Date(newHoldAtMs).toISOString()`) from the edit hook and format that. Or format the date only (`day month`) without a time, and say "on the next run" when `newHoldAtMs <= Date.now()`.

## Info

### C-IN-01: Arabic email dates are forced LTR, so RTL readers see them in reverse order

**File:** `lib/payments/emails/render.ts:103-107, 255-256`

**Issue:** Every ICU parameter, including the localized long date (`formatLocaleDate(..., 'ar')` → `12 نوفمبر 2026`), and the journey date row are wrapped in `<bdi dir="ltr">`. For a string that contains Arabic words, an LTR isolate puts the tokens visually left to right. An Arabic reader then reads year → month → day. Amounts, references and times are correct in LTR.

**Fix:** Wrap localized dates in `<bdi dir="auto">` (or `dir="rtl"` for `ar`), and keep `ltr` for amounts, references and times.

### C-IN-02: The client email check is looser than the server's zod check, so the operator sees only a generic error

**File:** `components/admin/CardFlowSettings.tsx:56, 120-127, 196-199`

**Issue:** `EMAIL_SHAPE` accepts `a@b.c`, which zod `.email()` rejects (it needs a TLD of at least 2 characters). The 400 response carries `issues`, but `persist` throws `'Save failed'`. The list rolls back with "Failed to save — try again", so the operator cannot tell which address is wrong. Rapid tile clicks also send PATCHes that can arrive out of order, leaving the UI and the database disagreeing about the mode.

**Fix:** Mirror the TLD rule (`\.[^\s@,;]{2,}$`), show the server issue path when the answer is 400, and serialise saves (ignore clicks while a save is in flight).

### C-IN-03: A failed hold release is described as a failed refund in the panel

**File:** `components/admin/PaymentPanel.tsx:403-410`; `components/admin/BookingsTable.tsx:196-201`

**Issue:** The cancel route records a hold-release failure as `refund_failed` and sends `note: 'release'` to the alert, and the alert text is correct. The panel banner and the cancel dialog line still say "the refund … did not go through. Refund it manually", which is the wrong Stripe action for an uncaptured authorization.

**Fix:** Return `kind: 'release' | 'refund'` in the 502 body and store the distinction (for example `error_code` `release:<code>`). Then show "Cancel the hold in the Stripe Dashboard" for releases.

### C-IN-04: The runbook puts secrets in shell history

**File:** `infra/stripe/README.md:35-36, 52-53, 66`

**Issue:** The scripts refuse secrets in argv. The runbook's examples still use `STRIPE_SECRET_KEY=<key> node …` and `QSTASH_TOKEN=<token> node …` inline, which saves live keys in `~/.zsh_history`. The hidden prompt is the safer default and is already supported.

**Fix:** Lead with the prompt form (`node infra/stripe/webhook-events.mjs --dry-run`). Mention `export` from a password manager, or a leading space with `HISTCONTROL=ignorespace`, as the env alternative.

### C-IN-05: Guard order and the `user` null check in the cancel route are inconsistent

**File:** `app/api/admin/bookings/cancel/route.ts:51-56, 132, 142`

**Issue:** Admin auth runs before `enforceMaxBody`, while the payment route documents the project order (`enforceMaxBody` → admin). There is also no `if (!user) return 401` as in `[id]/payment/route.ts:118`, so a null user would cancel with `actor.id = null`. Today this is harmless, but it is not consistent across the two money routes.

**Fix:** Move `enforceMaxBody` first and add `if (!user) return unauthorized`.

---

Counts: Critical 3 / Warning 6 / Info 5 / Total 14

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer), slice C_
_Depth: deep_
