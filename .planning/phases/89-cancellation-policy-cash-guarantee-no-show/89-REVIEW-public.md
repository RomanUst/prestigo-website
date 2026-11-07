---
phase: 89-cancellation-policy-cash-guarantee-no-show
reviewed: 2026-11-07T00:00:00Z
depth: deep
scope: public and driver surfaces (manage page and API, middleware, headers, rate limits, My trips, driver trip, confirmation page, Step6, policy libs, client emails, admin dialogs)
diff_base: 5a3188e133dc7414192d92f5f9292e70df81b98e
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 89: Public and Driver Surfaces Code Review

**Branch:** feat/89-cancellation-cash-noshow
**Locked decisions respected:** D-01 to D-24 (the bearer-link model, late cancel kept for a person to decide, cash amount shown to the driver on cash trips only, no counsel sign-off) are not reported.

## Summary

The token model itself holds up. The token is 256 bits, checked against a regex before any database call, and every invalid reason gives the same 404 or the same invalid view. Both `/api/manage/*` routes are in the CSRF list with Origin required, and both have their own rate-limit key. The unauthenticated path to `cancelBooking` is only `app/api/manage/cancel/route.ts`, and it needs a resolved token. The `Referrer-Policy: no-referrer` and `no-store` headers cover `/manage` and the six locale prefixes. All seven analytics, banner and chat components skip private paths. The matcher is unchanged and a token can never contain a dot. The driver surface shows an amount only through `buildDriverCash`, which returns null unless the booking is `cash_guarantee` in a due or settled state, and the page passes no other money field to the browser. With the flag closed, `fetchCardInit` gets `{eligible:false}` with no policy, so `Step6Payment` renders as before. Message key and placeholder parity for Manage, Account.trips, Booking.confirmation and Booking.step6 holds in all 7 locales.

Real defects found:

- One money-losing bug on pay-now round trips cancelled through the manage link (CR-01).
- Six warnings.
- Four info items.

Findings CR-01 and WR-01 appear only after the flag or canary is open, because a booking gets a token only when it stored a policy. WR-05 matters on the first deploy, because it affects every ordinary booking with the flag closed.

## Critical Issues

### CR-01: Cancelling one leg of a pay-now round trip through the manage link refunds the whole payment and cancels both legs

**File:** `lib/payments/cancel.ts:341,357-368` (cause), `app/api/manage/cancel/route.ts:100-105` (does not pass `leg`), `lib/manage-view.ts:202-209,236-247` (page shows something else)

**Scenario:**
1. A client pays a pay-now round trip once. Two rows exist (outbound and return), both stored with the policy and both with the same `payment_intent_id`. Both get a manage link (`policyFareOf` and the webhook block build one per leg).
2. The client opens the **return** leg link, in time, and cancels.
3. The route calls `cancelBooking` with no `leg`. `refundsPayNow` is true, `refundParams` stays `{ payment_intent }` with no amount, and the code refunds the entire PaymentIntent, both legs.
4. The webhook `charge.refunded` sees a full refund on a two-row PI and bulk-cancels both rows (`webhooks/stripe/route.ts:985-993`). The outbound leg is cancelled with no driver notice and no client email.
5. If the outbound trip had already been driven (completed), the money for it is refunded anyway. The status is kept but the cash is gone.

The page promises something else. On the return row `amount_eur` is NULL (see the data-model note in `payment-link/route.ts:102-110`), so `fareOf` returns null and `freeMoneyOf` returns `none`. The return-leg page says "Nothing has been charged" while the cancel refunds everything. On the outbound row `amount_eur` holds the combined total. A late cancel of the outbound leg opens the fee case from `feeBaseFor(row)` with `leg` undefined, so the base is 100% of **both** legs. The page, meanwhile, computes the fee from `row.leg` and shows the one-leg amount.

The admin dialog avoids this by sending `leg` (`CancelBookingDialog.tsx:290-294`). The manage route has no equivalent.

**Fix:** Do not rely on the unpopulated `linked_booking_id` column (the comment in `payment-link/route.ts` says no insert path fills it). Detect a sibling by the shared PaymentIntent, as the payment-link route does. For `client_token`, derive the leg inside `cancelBooking`:

```ts
// in runCancel, before refundParams is built
let leg = input.leg
if (isClient && !leg && refundsPayNow && (booking.leg === 'outbound' || booking.leg === 'return')) {
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('payment_intent_id', booking.payment_intent_id as string)
    .neq('id', bookingId)
  if ((count ?? 0) > 0) leg = booking.leg
}
```

Then use `leg` instead of `input.leg` for `legAmountCents`, `legKey` and `feeCaseBase`. Make `manage-view.fareOf`, `freeMoneyOf` and `paymentOf` use the leg amount for such a row. Add a test with two rows sharing a PI, cancelled through the manage route, that asserts a refund with `amount` and `metadata.leg`.

## Warnings

### WR-01: My trips offers a manage link for an abandoned pay-now checkout row, and the page and cancel then treat it as a paid booking

**File:** `app/[locale]/account/trips/page.tsx:62-79`, `lib/manage-view.ts:171-176,203-207`, `lib/payments/cancel.ts:341`, `lib/payments/fee.ts:109`

**Scenario:** `create-payment-intent` writes an `unpaid` row with `payment_intent_id` set and the stored policy before the client pays (`captureUnpaidBooking`). The My trips loop skips only completed, cancelled and no_show, so a signed-in client with an unfinished checkout gets a Manage link on that row.
- The manage page says "Paid by card" (`paymentOf` checks only that the PI is non-empty) and promises a refund.
- A cancel makes `cancelBooking` call `refunds.create` on an unpaid PI, which Stripe rejects. That writes a `refund_failed` ledger row and sends a false "Refund failed" alert to the operator, while the client is told the money is handled manually.
- A late cancel makes `isFeeEligible` true (pay-now with any PI) and opens a fee case. The operator gets "Decision needed" to keep 100% of money that was never paid.

**Fix:** Use payment truth, not PI presence, in `paymentOf`, `freeMoneyOf`, `isFeeEligible` for pay-now and `refundsPayNow`. Require `paid_at` or a status other than `unpaid`. Also skip `unpaid` rows in the My trips loop.

### WR-02: A CSP violation report on a manage URL writes the bearer token to the logs

**File:** `app/api/csp-report/route.ts:5-7`, `middleware.ts:84` (static policy used for `/manage`)

**Scenario:** `/manage/<token>` gets the static policy with `report-uri /api/csp-report`. A violation, for example from a browser extension injecting a script or style, produces a report containing `document-uri` and `referrer` with the full path. The route logs the whole report with `console.warn('[CSP violation]', JSON.stringify(report))`. Anyone who can read the logs gets a working cancel link for that booking. The same exposure exists for `/driver/trip/<token>`, which Phase 87 left open.

**Fix:** Redact the path before logging:

```ts
const redact = (u: unknown) => typeof u === 'string' ? u.replace(/\/(manage|driver\/trip)\/[^/?#]+/g, '/$1/[redacted]') : u
const safe = { ...report, 'document-uri': redact(report['document-uri']), referrer: redact(report.referrer) }
```

or omit `document-uri`, `referrer` and `blocked-uri` from the log line.

### WR-03: Confirmation and reminder emails promise "Free cancellation until" a moment that is already past

**File:** `lib/payments/emails/send.ts:75-101` (`policyBoxFromRow`), `lib/payments/emails/render.ts:~570` (`policyBox.body`)

**Scenario:** A client books 3 hours before a 150 km pickup (12 h rule). Checkout correctly shows "Free cancellation is not available for this trip" (`freeUntilPassed`), and the consent stores the NoFree wording. The confirmation email's cancellation box still prints "Free cancellation until 12 November, 02:00", a time before the booking existed. The 24 h and 2 h reminders add the same box for every later email. The email is the written document a disputing client will quote.

**Fix:** In `policyBoxFromRow`, take the outcome of `evaluateCancellation` against `Date.now()` and pass `freeUntilPassed`. Add a catalog variant of `policyBox.body` without the first sentence (the consent already has `NoFree` variants to copy from), in all 7 locales. For reminders, drop the sentence once the deadline has passed.

### WR-04: Free-cancellation deadlines are shown on the Prague clock with no time zone label

**File:** `lib/locale-date.ts:34-45`, `components/booking/CancellationPolicyNote.tsx:47`, `app/[locale]/manage/[token]/page.tsx:~262-297`, `lib/payments/consent-text.ts:57-60`, `lib/payments/emails/render.ts:~570`

**Scenario:** `formatLocaleDateTime` always formats in Europe/Prague but prints no zone. The checkout note, the stored consent text, the cancellation emails and the manage panel all say "Free cancellation until 12 November 2026, 14:30" with nothing next to it. Only the pickup row on the manage page carries "Prague time". Many clients book from other zones, and the consent text is stored per booking as the legal record. A client in New York or Dubai who reads 14:30 on their own clock misses the window by hours, then meets "late".

**Fix:** Add the zone to the sentence. Either add `timeZoneName: 'short'` to `DATE_TIME_OPTIONS` (gives CET or CEST, which tracks DST), or add a catalog suffix "(Prague time)" in all 7 locales. The stored consent text must change with the same edit, and that needs a policy or consent version bump.

### WR-05: Every booking write and several reads now depend on migration 087, including with the flag closed

**File:** `lib/supabase.ts:149,482` (`...parseCancelPolicyMeta(meta.cancelPolicy)` always spreads `cancel_policy_version: null, cancel_policy: null`), `app/api/cron/reminder-24h/route.ts:54`, `app/api/cron/reminder-2h/route.ts:58`, `app/[locale]/account/trips/page.tsx:52-56`

**Scenario:** If the production deploy reaches Vercel before migration 087 is applied, the next `payment_intent.succeeded` fails its insert on an unknown column for every ordinary client. Webhook retries do not help. The reminder crons stop sending (their select names the new columns). My trips shows "no trips" to every signed-in client, because the page ignores the error: `const { data: bookings } = ...` followed by `bookings ?? []`.

**Fix:**
1. Confirm 087 and 088 are live in production (Supabase MCP) before merging, and make that a written gate in the deploy plan.
2. Cheap hardening: spread the policy columns only when non-null (`...(version ? {cancel_policy_version, cancel_policy} : {})`).
3. In My trips, check `error` and render an error state instead of the empty state.

### WR-06: A client's late cancel of a booking that has no fee case produces no operator mail

**File:** `lib/payments/cancel.ts:202-232` (`scheduleCancelNotices`)

**Scenario:** The only operator mails are `fee_decision_needed` (late with money kept, or db_failed) and `client_cancelled` (only when `outcome === 'free'`). A late client cancel of a fee-ineligible booking falls through: a group-payment row (amount 0, no PI), a manual booking with no card, a cash booking with no saved method. The result is `ok / late / none`. The status changes and the driver is told, but the operator gets no email. The same client cancelling a minute earlier would have triggered `client_cancelled`. A group-paid trip can be dropped late without anyone at the office hearing of it.

**Fix:** Send `client_cancelled` for every client-initiated successful cancel that did not create a fee case, not only for free ones:

```ts
} else if (result.kind === 'ok' && isClient && result.money !== 'kept') {
```

and give the alert a "late, no fee possible" line.

## Info

### IN-01: The manage pages run under the public static CSP and preconnect to third-party hosts

**File:** `middleware.ts:84-96` and `:395-407` (`/manage` is not in `isDynamicPath`), `components/SiteChrome.tsx:109-115`

The page gets `script-src 'unsafe-inline' https: https://chat.rideprestigo.com` and allows the chat origin in frame, img and connect, although the page never mounts the chat. `SiteChrome` also emits `preconnect` to googletagmanager and connect.facebook.net on every route, including `/manage`. No URL is sent, but the visit is disclosed to those hosts by connection. A tighter policy and skipping the hints on private paths would match the stated intent (D-02).

### IN-02: Group payment emails give the payer a manage link for every booking in the group

**File:** `lib/payments/emails/policy-block.ts:~89-105`, `app/api/webhooks/stripe/route.ts:570`

The group confirmation goes to `first.client_email` and carries one manage button per row. If the rows are for different passengers, the payer holds cancel power over all of them. Probably intended for B2B; worth the owner's explicit yes.

### IN-03: The pay-now step has no staleness check on the terms shown

**File:** `components/booking/steps/Step6Payment.tsx` (note and acceptance line), `app/api/create-payment-intent/route.ts:108-126`

The card flow cross-checks `displayedFreeUntilIso` (409 POLICY_CHANGED). The pay-now flow shows the init-time deadline and snapshots whatever the settings are at intent time, with no check. A client who sits on the pay step past the deadline "accepts the terms above" with a deadline that has already gone. Consider re-running init before the pay button enables, or a lighter version of the cross-check.

### IN-04: `manage/[token]/loading.tsx` reads the locale with a bare `getLocale()`

**File:** `app/[locale]/manage/[token]/loading.tsx:16`

The route is `force-dynamic`, so no static route is made dynamic and there is no regression. It does not pass `params` the way the rest of the page does, so keep it out of any future static route group.

---

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

**Count by severity: critical 1, warning 6, info 4 (total 11).**
