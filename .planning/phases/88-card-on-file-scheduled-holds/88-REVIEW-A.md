---
phase: 88-card-on-file-scheduled-holds
slice: A (money engine)
reviewed: 2026-11-04T00:00:00Z
depth: deep
diff_base: a6d00730
files_reviewed: 15
files_reviewed_list:
  - supabase/migrations/085_payment_state_card_on_file.sql
  - lib/payments/state.ts
  - lib/payments/hold.ts
  - lib/payments/settle.ts
  - lib/payments/tick.ts
  - lib/payments/recovery.ts
  - lib/payments/actions.ts
  - lib/payments/edit-hook.ts
  - lib/payments/money.ts
  - lib/payments/timing.ts
  - lib/payments/stripe.ts
  - lib/payments/customer.ts
  - lib/booking-events.ts
  - lib/booking-status-service.ts
  - app/api/cron/payment-tick/route.ts
traced_outside_scope:
  - lib/stripe-webhook/card-confirm.ts
  - lib/stripe-webhook/hold-events.ts
  - lib/stripe-webhook/charge-events.ts
  - lib/stripe-webhook/recovery-events.ts
  - lib/stripe-payment-links.ts
  - lib/payments/checkout.ts
  - lib/payments/config.ts
  - lib/payments/alerts.ts
  - lib/payments/emails/send.ts
  - app/api/admin/bookings/route.ts
  - app/api/admin/bookings/cancel/route.ts
findings:
  critical: 3
  warning: 11
  info: 9
  total: 23
status: issues_found
---

# Phase 88: Code Review Report, Slice A (Money Engine)

**Reviewed:** 2026-11-04
**Depth:** deep (cross-file, call chains traced into the webhook handlers, checkout, admin routes)
**Files Reviewed:** 15 in scope + 11 traced
**Status:** issues_found

## Summary

The core primitives are solid. The CAS in `apply_payment_transition` is correct: it locks the row first, and its
duplicate check plus sub-transaction rollback work. `claim_due_payment_work` uses SKIP LOCKED correctly. Grants and
`search_path` are correct on every SECURITY DEFINER function. The ledger table is RLS deny-all and append-only. The
cron auth compares in constant time and fails closed. The Stripe idempotency keys are numbered per attempt.

The defects are in how the paths fit together. Three of them collect money twice or cannot collect it at all:

1. A recovery Payment Link stays payable after the engine has already collected (or re-held) the money. A payment
   that arrives on that link in a state other than `failed`/`balance_due` is only logged, so the client is charged twice.
2. The admin `send_link` action is offered in states that the tick will still settle automatically, so that path can
   also charge twice.
3. Hold-at-checkout bookings (every pickup within 72 h) never store `stripe_payment_method_id`. Every fallback charge
   and every D-16 difference charge on those bookings fails with `missing_payment_details`.

The warnings cover lease and timeout races, Stripe error classification, holds placed on cancelled bookings,
authorizations that are never voided, rows stuck in `placing_hold` or `capturing`, and completed trips with no backstop.

## Critical Issues

### A-CR-01: Recovery link is never deactivated when the engine collects or re-holds, and a payment in any other state is only logged, so the client is charged twice

**File:** `lib/payments/hold.ts:285-327`, `lib/payments/settle.ts:420-458`, `lib/stripe-webhook/recovery-events.ts:112,176-177,181-203`

**Issue:** `handlePaymentFailure` emails the client a recovery Payment Link after a hold or charge decline
(recovery.ts:155-169). The only code that deactivates that link is `releaseHold` (hold.ts:386-393), the recovery-paid
webhook (recovery-events.ts:149-156) and a later `refreshRecoveryLink`. Neither success path does it:

- `placeHold` success: placing_hold → authorized, hold.ts:285-327.
- `settleBooking` success: capturing → captured, settle.ts:429-458.

When the client then pays the still-live link, `handleRecoveryPaid` only acts in `failed` or `balance_due`
(recovery-events.ts:112). In `authorized` or `captured` it calls `parkUnmatchedPayment`, which writes one ledger row
and a `console.error` (lines 188-202). It changes no state and sends no operator alert.

**Failure scenarios:**

1. Scheduled hold declines (T). Client gets a "payment failed" email with a link. Step B retries at T+12 h and the
   hold is authorized, so the client also gets "hold placed". The client pays the link from the first email. The
   booking is `authorized`, so the payment is parked. At completion `settleBooking` captures the hold. Result: two
   full charges, and nobody is told.
2. Post-trip charge declines and a link is sent. Step B's retry succeeds (captured). The client pays the link: parked,
   double charge.
3. A pre-trip hold fails and no retry is possible (pickup too close). The trip completes, and the completion event
   charges the saved card (`failed` is in `CLAIMABLE`, settle.ts:64). The client later pays the link: parked, double
   charge.
4. The client pays while step B holds the row in `placing_hold`. The handler throws (line 171/176) and Stripe
   redelivers. The next delivery sees `authorized` and parks the payment. Same double charge.

**Fix:**
- Deactivate `recovery_link_id` (and clear it in the same patch) whenever the engine moves a row to `authorized` or
  `captured`. That means `placeHold` and `handleHoldAuthorized` success, and `settleBooking`'s final transition.
  Deactivate before the Stripe create where possible: deactivate at claim time in `claimForHold` and in the settle
  claim, and recreate the link only if the attempt fails again.
- In `handleRecoveryPaid`, if the booking is `authorized`, treat the recovery payment as the collection. Cancel the
  hold PI and move authorized → captured (add that edge to `TRANSITIONS`). Otherwise, refund the unmatched payment
  automatically or at least call `sendPaymentOperatorAlert('dispute' | new 'unmatched_payment', ...)` inside
  `parkUnmatchedPayment`.
- A second Payment Link checkout session may already be open when the link is deactivated. Make the engine check
  `recovery_paid` rows before any capture or charge, and skip the collection when one already covers the amount.

### A-CR-02: Admin `send_link` is offered in states the engine still collects from automatically

**File:** `lib/payments/actions.ts:38,65,173-191`

**Issue:** `LINK_STATES_COMPLETED = {'expired','card_saved','authorized'}` puts `send_link` on completed trips that
still have a live hold or saved card. Step C of the tick (tick.ts:175) selects exactly those states for completed
trips and settles them within 15 minutes. `settleBooking` claims them because all three are in `CLAIMABLE`, and it
captures the hold or charges the saved card. Meanwhile the client holds a payable link for the full amount
(`dueMinor = payment_amount_minor - captured_amount_minor`, line 175). If the client pays the link first, the booking
is still `authorized`/`card_saved`, so `handleRecoveryPaid` parks the payment (see A-CR-01) and the tick collects
again. If the tick collects first, the booking is `captured`, and a later link payment is parked as well. Either
order ends in a double charge.

**Fix:** Allow `send_link` only in `failed` and `balance_due`, which are the states the recovery webhook can close.
For a completed trip in `authorized`/`card_saved`/`expired`, the operator action should be `capture` (it already
exists). If a manual link is really needed there, first move the row to a "link pending" state that `CLAIMABLE` and
step C exclude, and cancel the hold.

```ts
const LINK_STATES: ReadonlySet<string> = new Set(['failed', 'balance_due'])
// remove LINK_STATES_COMPLETED
if (LINK_STATES.has(state)) actions.push('send_link')
```

### A-CR-03: Hold-at-checkout bookings never persist the payment method, so fallback and difference charges always fail

**File:** `lib/stripe-webhook/card-confirm.ts:320-331` (patch), consumed at `lib/payments/settle.ts:158-160` and `lib/payments/hold.ts:232-236`

**Issue:** `applyHoldNowAuthorized` moves checkout_pending → authorized. Its patch has only `hold_payment_intent_id`,
`hold_amount_minor`, `hold_placed_at` and `capture_before`. It never stores `stripe_payment_method_id`. In the repo
that column is written only by `applySetupSucceeded` (card-confirm.ts:249). The hold-now PaymentIntent is created
with `setup_future_usage: 'off_session'` (checkout.ts:290), so the card is saved at Stripe, but the booking does not
know which card it is. The engine paths that need the saved card all bail out:

- `chargeSavedCard`: `if (!customer || !paymentMethod) return { kind: 'failed', code: 'missing_payment_details' }`
  (settle.ts:160).
- `placeHold`: `missing_payment_details` leads to `recordDefinitiveFailure` (hold.ts:234-236).

**Failure scenarios** (every booking whose pickup is ≤ lead time away at checkout):
- The operator raises the price (D-16). At completion the main capture succeeds and the difference charge fails
  immediately. Result: `balance_due`, a "payment failed" email to the client, and an operator alert, with no Stripe
  attempt at all.
- The hold lapses or is released before completion, or capture fails. The fallback charge (HOLD-04) fails with
  `missing_payment_details`, so the booking is `failed` and the client gets an email.
- The pickup is moved later (D-18). `reevaluateAfterEdit` cancels the hold and returns the row to `card_saved`
  (edit-hook.ts:186-205). The tick then claims it and `placeHold` fails definitively. The client gets a "payment
  failed" email for a card that works.
- The admin panel shows `card_saved: false` (actions.ts:86).

No test covers hold-now plus a fallback or difference charge (grep `tests/` for `stripe_payment_method_id` with
hold_now finds nothing).

**Fix:** In `applyHoldNowAuthorized`, persist the payment method, and keep `stripe_customer_id` consistent:

```ts
: {
    hold_payment_intent_id,
    hold_amount_minor: amountMinor,
    hold_placed_at: new Date().toISOString(),
    capture_before: captureBefore,
    stripe_payment_method_id: idOf(pi.payment_method),
  },
```

Also add a test where a hold_now booking gets a price raise, then completes, and assert that the difference charge is
attempted.

## Warnings

### A-WR-01: The lease is shorter than the worst-case Stripe call chain, and same-key concurrency is classified as a definitive failure

**File:** `lib/payments/config.ts:31`, `lib/payments/stripe.ts:25,93-112`, `lib/payments/settle.ts:134-145`, `lib/payments/hold.ts:259-275`, `supabase/migrations/085_payment_state_card_on_file.sql:481`

**Issue:** `LEASE_SECONDS = 300` is fixed and never renewed. `maxNetworkRetries: 2` with stripe-node's default 80 s
timeout gives up to about 240 s per call. A settle makes 3-5 calls (retrieve, capture, retrieve, optional search,
diff create), plus ledger writes and an email. Step A also claims 20 rows at once with a single 300 s lease and then
processes them one after another, so later rows can have an expired lease before they are even started. The daily
Vercel cron and the 15-minute QStash schedule can overlap. Once a lease expires:

- the other run re-claims the row (claim_due_payment_work line 481, settle `capturing` re-claim);
- it replays the same idempotency key while the first request is still in flight;
- Stripe rejects concurrent use of an in-flight key with HTTP 409, and `classifyStripeError` maps it to `'invalid'`
  (StripeIdempotencyError or default branch, lines 106-110), not `'transient'`.

In `collectFromHold` that leads to `recordFailure`, which moves the row capturing → failed and sends the client a
"payment failed" email with a recovery link. The first run's capture succeeds, but its final transition loses the
CAS. If the client pays the link, combined with A-CR-01 the client is charged twice. In `placeHold` the same race
produces a false `hold_failed` and voids a good authorization (hold.ts:306-313).

**Fix:**
- Treat 409 and StripeIdempotencyError as `'transient'`.
- Set Stripe `timeout` to about 20 s on the payments client.
- Claim one row at a time in step A, or set the lease to `HOLD_CLAIM_LIMIT × per-row budget`.
- Renew the lease (a capturing → capturing self-loop) before each Stripe call in settle.

### A-WR-02: Auth/permission errors and other non-card errors are treated as client declines

**File:** `lib/payments/stripe.ts:93-112`, consumers `lib/payments/hold.ts:272-274`, `lib/payments/settle.ts:200-203`

**Issue:** `StripeAuthenticationError` (401) and `StripePermissionError` (403) fall to `default`, which returns
`'invalid'`. Examples: a rotated or revoked `STRIPE_SECRET_KEY`, or a restricted key without the right scope.
`'invalid'` follows the definitive-failure path. Every due booking advances its attempt counter, uses up its one
automatic retry, and the client is emailed "payment failed" with a recovery link. One configuration mistake therefore
sends wrong decline emails to every client whose hold falls due during the outage.

**Fix:** Add a `'config'` class for `StripeAuthenticationError`, `StripePermissionError`, and
`StripeInvalidRequestError` with codes like `api_key_expired`/`secret_key_required`. On that class, return the row
with a transient outcome (same attempt) and send one operator alert. Send the client email only for
`card_declined`/`auth_required`.

### A-WR-03: Price edit after a transient hold attempt replays the old idempotency key with different parameters

**File:** `lib/payments/hold.ts:261-270`, `lib/payments/edit-hook.ts:133-140,246-259`

**Issue:** A transient hold error returns the row to `card_saved` with the same `hold_attempts` on purpose, so the
next tick replays `hold:<id>:<n>`. `reevaluateAfterEdit` on `card_saved` changes `payment_amount_minor` but leaves
`hold_attempts` as it is. The next tick replays the key with a new `amount`. If Stripe had already executed the first
request, for example a connection drop after the PI was created and authorized, Stripe answers
`StripeIdempotencyError`. That is classified `'invalid'`, so `recordDefinitiveFailure` runs: the booking becomes
`failed` and the client gets a decline email. The authorized PI with the old amount is not in the booking row, so it
is never voided, and the client's funds stay frozen until the hold expires. A later retry places a second hold.

**Fix:** When the amount changes in `card_saved`, bump `hold_attempts` in the same self-loop. Before that, look up and
void any `requires_capture` PI from the old attempt with `paymentIntents.search` on
`metadata['cofBookingId']` + `metadata['attempt']`.

### A-WR-04: Holds can be placed on cancelled or no-show bookings

**File:** `lib/payments/hold.ts:109-124,194-211`, `lib/payments/actions.ts:62,149-151`, `app/api/admin/bookings/cancel/route.ts:101,201-203`

**Issue:** `claimForHold` and `placeHold` never check `bookings.status`. Only the SQL claim filters by status, and
only at claim time.

- **Admin retry:** `allowedPaymentActions` offers `retry` in `card_saved`/`expired`/`failed` without a status check.
  That includes a cancelled booking whose release returned busy, or a `failed` cancelled booking.
- **Claim/cancel race:** the cancel route reads `card_saved` and applies the status cancel. Meanwhile the tick claims
  the row (card_saved → placing_hold). `releaseHold` then loses the CAS and returns busy, which is reported as
  `refund_failed`. `placeHold` goes on to authorize the full amount on a cancelled booking and sends the client
  "hold placed". Nothing ever releases that hold.

**Fix:** In `placeHold`, re-read `status` (or rely on the claimed row's `status`) and skip with a release to
`card_saved`/`released` when the status is not in ACTIVE_STATUSES. Also void the PI if the status changed after the
Stripe call. Gate `retry` in `allowedPaymentActions` on an active status.

### A-WR-05: Released or cancelled checkouts leave a live hold-now authorization that is never voided

**File:** `lib/payments/hold.ts:364-366`, `lib/stripe-webhook/card-confirm.ts:316-336`

**Issue:** `releaseHold` on `checkout_pending` moves to `released` without a Stripe call, but a hold-now PI may be
waiting for 3DS (`hold_payment_intent_id` is set at checkout, checkout.ts:316-317). If the client then completes 3DS,
`applyHoldNowAuthorized` sees the booking `cancelled`. It moves checkout_pending → released, or ignores it because
the row is already released, and returns (line 336) without cancelling the PI. The client's full amount stays
authorized for up to 7 days on a cancelled booking. The same happens when the cancel arrives between the client's
3DS and the webhook.

**Fix:** In `releaseHold` for `checkout_pending`, cancel `hold_payment_intent_id` (an unconfirmed one) and the
SetupIntent. In `applyHoldNowAuthorized`, when `cancelled` or `!moved.applied`, call `cancelPaymentIntent(pi.id,
stripeKeys.voidHoldNow(pi.id))`, matching the orphan-void logic in placeHold.

### A-WR-06: A row in `placing_hold` after pickup is stuck forever with no escape hatch

**File:** `supabase/migrations/085_payment_state_card_on_file.sql:478-482`, `lib/payments/settle.ts:64`, `lib/payments/actions.ts:53-66`, `lib/payments/edit-hook.ts:40`, `app/api/admin/bookings/cancel/route.ts:101`

**Issue:** A `placing_hold` row with an expired lease is re-claimed only while `pickup_utc > now()`. If the lease
holder dies near pickup, the row stays in `placing_hold` permanently. Examples: Vercel timeout, or an
`applyTransition` throw after Stripe authorized, during an admin "place hold now" or a late retry. After that:

- settle never claims it (not in `CLAIMABLE`), and step C does not select it;
- `allowedPaymentActions` offers nothing;
- the cancel route answers 409 `payment_busy`, and the trip edit answers 409 `payment_in_progress`.

The trip completes and no money is collected. If Stripe authorized, that authorization is never captured.

**Fix:** Treat `placing_hold` with an expired lease as recoverable everywhere. Add it to settle's CLAIMABLE, since the
SQL lease rule already blocks live leases; settle then retrieves the PI by searching on `cofBookingId` + `attempt`
when `hold_payment_intent_id` is unset. Also let step C, release and cancel proceed once the lease has expired.

### A-WR-07: Settle treats a ledger-key duplicate as success even when the state did not move

**File:** `lib/payments/settle.ts:283-290,429-446`, `supabase/migrations/085_payment_state_card_on_file.sql:316-321`

**Issue:** `apply_payment_transition` checks the event key before the CAS, so `duplicate: true` says nothing about
the state. `recordDifferenceFailure` appends `captured:<mainPi>` (line 283) before its capturing → balance_due
transition. Suppose that transition throws: the row stays `capturing` and is re-driven after the lease. Suppose also
the diff then succeeds: after 24 h the key is pruned, and `searchFirst` finds no succeeded diff, so a new diff charge
is created and succeeds. The final transition then uses the same key `captured:<mainPi>` and returns `duplicate`.
Line 443 accepts that as success and sends "charged", but the row stays in `capturing` forever. Every sweep re-claims
it, re-reconciles and returns `captured` without the state ever changing.

**Fix:** Use a distinct key in `recordDifferenceFailure` (for example `main_captured:<pi>`). In the final transition,
when `duplicate === true`, re-read the state and treat the result as success only if `currentState === 'captured'`.

### A-WR-08: Completed trips in `failed` have no durable backstop

**File:** `lib/payments/tick.ts:175,215-224`, `lib/booking-events.ts:58-62`

**Issue:** Step C leaves out `failed` on purpose. Step B selects `failed` only when `payment_retry_count = 0` AND
`payment_retry_at <= now`. A pre-trip hold failure whose retry is used, or whose `payment_retry_at` is NULL because
`retryAt` returned null when pickup was too close, depends entirely on the completion event inside `after()` to be
charged after the trip. `booking-events.ts` itself says that `after()` can die. When it does, the trip is never
charged automatically, and step D's alerts stop at pickup.

**Fix:** In step C, also select `failed` rows that have `completed_at` set and no completion-time settle attempt. One
way is a ledger check for `capture_started` after `completed_at`. Another is a column such as
`settle_attempted_at`. Mark the first post-completion settle so step C runs it exactly once.

### A-WR-09: An expired authorization caught at capture time is reported as a client decline instead of falling back

**File:** `lib/payments/settle.ts:134-145`

**Issue:** If `capture_before` has passed but Stripe has not yet moved the PI to `canceled`, the capture fails with
`charge_expired_for_capture` (an invalid_request error). The second retrieve still shows `requires_capture`, so the
code returns `failed` instead of `gone`. The saved-card fallback (HOLD-04) is skipped and the client gets "payment
failed" with a link. The fallback only happens 12 h later in step B, if the retry is still unused.

**Fix:** Map `charge_expired_for_capture` to `{ kind: 'gone' }`, as well as any PI with
`requires_capture` whose `capture_before` is in the past.

### A-WR-10: Client recovery emails and operator alerts are lost permanently on a transient send failure

**File:** `lib/payments/emails/send.ts:113-138`, `lib/payments/alerts.ts:170-210`, `lib/payments/recovery.ts:160-191`

**Issue:** Both senders claim the ledger key before calling Resend. On failure they only append `<key>:send_failed`,
and the next caller with the same key gets `duplicate`. `handlePaymentFailure` runs once per attempt, so one Resend
5xx means the client never receives the D-13 "payment failed" link email and the operator never receives the D-14
alert. The `:send_failed` row is never acted on, and no sweep re-sends it.

**Fix:** Add a tick step that finds `email_sent`/`alert_sent` rows that have a matching `:send_failed` row and no
`:resent` row, and retries them once. An alternative is to claim with a `pending` row and confirm after the send.

### A-WR-11: Admin trip edits re-price card bookings without promo or extras, and the engine now charges the difference automatically

**File:** `app/api/admin/bookings/route.ts:505-538` → `lib/payments/edit-hook.ts:133-140`

**Issue:** The PATCH route recomputes `amount_eur`/`amount_czk` from pricing config whenever a price field changes
(vehicle_class, address, distance). The recompute is `outboundLegEur + extrasEur` with boosterSeat/meetAndGreet set
to 0 and no promo, and within tolerance it overrides what was submitted. Before Phase 88 this only recorded the new
amount (the route's own comment says "no auto-charge"). Now `reevaluateAfterEdit` copies the new amount into
`payment_amount_minor`, and `settleBooking` charges any increase off-session (D-16). Example: an operator fixes an
address typo on a 10 % promo booking, and the client is charged an extra 10 % after the trip. The `amount_raised`
`payment_effect` is shown only after the save.

**Fix:** Change `payment_amount_minor` only when the operator explicitly changed the amount (`override_price` or a
submitted amount different from the current one). Otherwise, for card_hold bookings, keep the checkout amount
(promo and extras included) or recompute with the stored promo percentage.

## Info

### A-IN-01: The QStash signature is verified without binding the destination URL
**File:** `app/api/cron/payment-tick/route.ts:61-63`. `Receiver.verify` is called without `url`, so a valid QStash
signature for any other endpoint on the same account would pass. The tick is idempotent, so the impact is low. Pass
`url: \`${SITE_URL}/api/cron/payment-tick\``.

### A-IN-02: The SQL CAS does not enforce the transition graph
**File:** `supabase/migrations/085_payment_state_card_on_file.sql:323-377`. `TRANSITIONS` is enforced only in TS
(`state.ts:164`). Any service-role caller of the RPC can move any state to any state, for example
`captured` → `card_saved`. Consider an `allowed(from, to)` table check inside the function for defence in depth.

### A-IN-03: Customers can read the new payment columns through RLS
**File:** `supabase/migrations/049_bookings_customer_rls.sql` + `085:29-52`. `bookings_select_own` lets an
authenticated client SELECT their own rows, which now include `stripe_customer_id`, `stripe_payment_method_id`,
`hold_payment_intent_id`, `recovery_link_url` and `last_payment_error`. These are not secrets, but they are internal.
Consider column-level privileges or a view.

### A-IN-04: An `expired` hold before pickup is never re-placed automatically
**File:** `085:480`, `lib/payments/edit-hook.ts:245-259`. The claim only picks `card_saved`, and the edit hook keeps
`expired` as `expired` when the pickup changes. Only an operator alert and the manual retry remain. Moving
`expired` → `card_saved` (with `hold_attempts+1`) when `pickup > now` would let the scheduler handle it (D-18).

### A-IN-05: Holds with an unknown `capture_before` never get the expiring alert
**File:** `lib/payments/tick.ts:304`. `.lte('capture_before', …)` leaves out NULL, and `captureBeforeIso` returns null
on lookup failure. Use a fallback such as `hold_placed_at + 4 d`.

### A-IN-06: The one automatic retry is shared between the hold and charge phases
**File:** `lib/payments/hold.ts:94-95`, `lib/payments/settle.ts:232,241`. `payment_retry_count` never resets, so if
the pre-trip hold retry was used, a post-trip charge decline gets no automatic retry. Confirm this is the intended
reading of D-13.

### A-IN-07: Retries are scheduled for failures that cannot succeed
**File:** `lib/payments/settle.ts:241,388`. A `missing_payment_details` failure still sets
`payment_retry_at = now + 12h`, so step B wastes the one retry on it.

### A-IN-08: A completed trip still in `checkout_pending` answers `busy` forever
**File:** `lib/payments/settle.ts:64,367-371`. The admin capture returns 409 with no hint why. Return
`skipped:not_confirmed` instead.

### A-IN-09: `captureBeforeIso` is duplicated
**File:** `lib/payments/hold.ts:65-83` and `lib/stripe-webhook/card-confirm.ts:280-297`. The bodies are identical.
card-confirm should import the exported one from hold.ts.

---

**Counts:** Critical 3 · Warning 11 · Info 9 · Total 23

_Reviewed: 2026-11-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
