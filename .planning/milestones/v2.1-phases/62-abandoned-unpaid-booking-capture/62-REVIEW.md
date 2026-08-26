---
phase: 62-abandoned-unpaid-booking-capture
reviewed: 2026-08-20T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - app/api/admin/bookings/route.ts
  - app/api/create-payment-intent/route.ts
  - app/api/webhooks/stripe/route.ts
  - components/admin/BookingsTable.tsx
  - components/admin/StatusBadge.tsx
  - components/booking/steps/Step6Payment.tsx
  - lib/booking-store.ts
  - lib/booking-transitions.ts
  - lib/supabase.ts
  - supabase/migrations/053_unpaid_booking_status.sql
  - supabase/migrations/054_admin_search_bookings_status_filter.sql
  - tests/BookingsTable.test.tsx
  - tests/admin-bookings.test.ts
  - tests/create-payment-intent.test.ts
  - tests/webhooks-stripe.test.ts
  - types/booking.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-08-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The unpaid-capture write path itself is solid: `create-payment-intent` never blocks the payment response on a capture failure (both the attempt-keyed and legacy fallback capture calls are wrapped in `try/catch` that only logs), the admin search RPC (migration 054) binds every input as a real plpgsql parameter — no string-built SQL, no injection surface — and is `SECURITY DEFINER` with an explicit `SET search_path` and a scoped `GRANT ... TO service_role`, which is the correct pattern. The webhook's single-leg reconciliation (`reconcileBookingToConfirmed`) is a clean, DB-atomic "flip only if still unpaid" gate that survives concurrent/duplicate deliveries.

However, the **round-trip** reconciliation path has a genuine data-loss gap: if the two pre-payment capture writes for a round-trip attempt (outbound + return legs) partially fail — one leg captured, one not — the webhook's all-or-nothing fallback logic (`reconciledIds.length === 0`) never fires, and the leg that was never captured is silently never created. The customer is charged for both legs but only one leg ever reaches `confirmed`. This is the standout finding.

Separately, the admin status-transition map has drifted: `app/api/admin/bookings/route.ts` maintains its own hardcoded copy of `VALID_TRANSITIONS` instead of importing the canonical one from `lib/booking-transitions.ts` (as the sibling `assign/route.ts` correctly does). One entry (`en_route`) has drifted out of sync with what `BookingsTable.tsx`'s dropdown (`UI_TRANSITIONS`) actually offers the admin, producing a transition that always 422s.

## Critical Issues

### CR-01: Round-trip unpaid-capture partial failure permanently drops one leg's booking

**File:** `app/api/create-payment-intent/route.ts:352-364`
**File:** `app/api/webhooks/stripe/route.ts:288-335` (`handleRoundTripSucceeded`)
**File:** `lib/supabase.ts:189-255` (`captureUnpaidBooking`, `reconcileRoundTripToConfirmed`)

**Issue:**
For a round-trip checkout, the pre-payment capture is two *sequential, independent* calls inside one `try` block:

```ts
await captureUnpaidBooking(outboundUnpaid, bookingData.attemptId, 'outbound')
await captureUnpaidBooking(returnUnpaid, bookingData.attemptId, 'return')
```

If the first call succeeds and the second throws (transient DB error, a concurrent request tripping the `bookings_attempt_id_leg_unpaid_key` partial unique index from migration 053, etc.), the `catch` only logs — by design (D-05, "never block payment on capture failure"). The result: exactly **one** `unpaid` row exists for this `payment_intent_id` (e.g. `leg='outbound'`), the other leg (`leg='return'`) was never written.

When the webhook later fires `payment_intent.succeeded`, `reconcileRoundTripToConfirmed` does a single atomic `UPDATE ... WHERE payment_intent_id = $1 AND status = 'unpaid'` — with no `leg` filter, so it happily flips whichever leg(s) exist. In the partial-capture case this returns **exactly one row**, so:

```ts
if (reconciledIds.length === 0) {
  pair = await withRetry(() => saveRoundTripBookings(outboundRow, returnRow), 3, 1000)
}
```

...never runs, because `reconciledIds.length === 1`, not `0`. The fallback that would have inserted the missing leg via the atomic `create_round_trip_bookings` RPC is skipped entirely. `freshLegIds` ends up containing only the one leg that existed, and the round-trip confirmation email, ICS, QStash reminder and GA4 purchase event all proceed for a **single-leg "round trip"** — the return leg booking is never created, even though the customer was charged the combined (outbound + return) amount. There is no path in this code that detects "1 of 2 legs reconciled" and backfills the missing leg.

The same failure mode also applies to a currency-toggle/retry `UPDATE` (not just the initial `INSERT`): if one leg's `captureUnpaidBooking` update succeeds with a fresh `payment_intent_id` and the other throws, the un-updated leg row still carries a **stale** `payment_intent_id` from an earlier abandoned PaymentIntent, so it will never match the webhook's `payment_intent_id` filter for the PI that actually got paid — same net effect (permanent loss of that leg).

This exact scenario is untested: `tests/create-payment-intent.test.ts` (`ABND-06` describe block) and `tests/webhooks-stripe.test.ts` (`ABND-01/06/D-07/D-11: round-trip` describe block) only exercise "both legs captured" or "neither leg captured" — never "exactly one leg captured."

**Fix:** Make the two-leg capture atomic (single DB round trip covering both legs, or a transaction/RPC), OR change the reconcile fallback condition from `reconciledIds.length === 0` to `reconciledIds.length < 2`, and have the fallback insert only the *missing* leg (not blindly re-insert both, which would violate the `payment_intent_id, leg` unique constraint for the leg that already reconciled). Example sketch:

```ts
// after reconcileRoundTripToConfirmed
const reconciledLegs = new Set(/* fetch legs for reconciledIds, or have the RPC return leg */)
const missingOutbound = !reconciledLegs.has('outbound')
const missingReturn = !reconciledLegs.has('return')
if (missingOutbound || missingReturn) {
  // insert only the missing leg row(s), not the full pair unconditionally
}
```
At minimum, add a test that mocks `reconcileRoundTripToConfirmed` to resolve with exactly one row and asserts the missing leg is backfilled.

## Warnings

### WR-01: Admin status-transition map is duplicated and has drifted from the canonical source, breaking one real transition

**File:** `app/api/admin/bookings/route.ts:17-26`
**File:** `lib/booking-transitions.ts:11-28`
**File:** `components/admin/BookingsTable.tsx:16,718,1245,1269`

**Issue:** `lib/booking-transitions.ts` is documented as the canonical transition map ("Used by the API route (assign/route.ts) and the UI") and `app/api/admin/bookings/[id]/assign/route.ts` does import `VALID_TRANSITIONS` from it. But `app/api/admin/bookings/route.ts` (the general-purpose `PATCH` handler that the admin table's status dropdown actually calls) defines its **own inline copy**:

```ts
// app/api/admin/bookings/route.ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  ...
  en_route:    ['on_location', 'cancelled'],
  ...
}
```

vs. the canonical map:

```ts
// lib/booking-transitions.ts
export const VALID_TRANSITIONS: Record<string, string[]> = {
  ...
  en_route:    ['on_location', 'cancelled', 'completed'],
  ...
}
```

`UI_TRANSITIONS` (also in `lib/booking-transitions.ts`, consumed by `BookingsTable.tsx`'s status `<select>` at line 1269 and the mobile action buttons at line 718) only overrides `confirmed` and `assigned` — it does **not** override `en_route`, so it inherits `['on_location', 'cancelled', 'completed']` unchanged.

Net effect: when a booking is `en_route`, the admin dropdown shows **Completed** as a selectable option. Clicking it sends `PATCH { status: 'completed' }`, which the route's own local map rejects because `'completed'` is absent from its `en_route` entry, returning `422 Cannot transition from 'en_route' to 'completed'`. This transition is completely unreachable for the admin — it appears in the UI and always fails. There is no test covering `en_route → completed` in either `tests/admin-bookings.test.ts` or `tests/BookingsTable.test.tsx`, so this was never caught.

**Fix:** Delete the local `VALID_TRANSITIONS` in `app/api/admin/bookings/route.ts` and import the canonical one from `lib/booking-transitions.ts`, exactly as `assign/route.ts` already does:

```ts
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'
```

If `en_route → completed` should in fact be blocked (matching the API's current behavior), fix it the other way: add `en_route: ['on_location', 'cancelled']` to `UI_TRANSITIONS`'s override list instead, so the dropdown stops offering an option the backend will always reject.

### WR-02: `charge.refunded` claims webhook idempotency before the side effect runs, unlike the (deliberately reordered) `payment_intent.succeeded` handler

**File:** `app/api/webhooks/stripe/route.ts:61-74`

**Issue:** For `payment_intent.succeeded`, the code explicitly reorders "save then claim" and documents why (SEC-10, lines 77-83): claiming the idempotency row *before* the side effect risks a crash between the two steps permanently losing the booking, because a marked-processed event is never retried and never reprocessed.

`charge.refunded` does the opposite — it claims first, then calls the handler:

```ts
const { error: claimErr } = await supabase
  .from('stripe_processed_events')
  .insert({ event_id: event.id, event_type: event.type })
if (claimErr) { ... }
await handleChargeRefunded(event.data.object as Stripe.Charge)
return NextResponse.json({ received: true })
```

If the process is interrupted between the `insert` and the call to `handleChargeRefunded` (serverless timeout/OOM/crash), the event is already marked processed. Stripe's retry (or a future redelivery) will hit the `event_id` dedup check at the top of `POST` (in the `payment_intent.succeeded` branch) — but note `charge.refunded` re-checks via the same `stripe_processed_events` insert-then-23505 pattern, so the retry will get `23505`, be treated as `{ received: true, duplicate: true }`, and `handleChargeRefunded` will never run. The booking that should have been cancelled on refund is silently left in its prior status forever, with no operator-visible signal that a refund was received but not reflected.

**Fix:** Apply the same SEC-10 pattern here: call `handleChargeRefunded` first, then claim the `stripe_processed_events` row afterward (ignoring `23505` on the claim, same as the `payment_intent.succeeded` branch does today).

### WR-03: `captureUnpaidBooking` unique-constraint race is unhandled (relies entirely on the caller swallowing it)

**File:** `lib/supabase.ts:189-229`

**Issue:** The SELECT-then-INSERT-or-UPDATE pattern in `captureUnpaidBooking` is documented as relying on the DB's partial unique index `bookings_attempt_id_leg_unpaid_key` (migration 053) to guard against a genuine double-submit race, but the function does not catch a `23505` from that index — it just lets `insert(...)` throw a generic `Supabase capture insert failed: ...` Error. This is currently masked because every call site wraps the whole capture block in a `try/catch` that only logs (correct, per D-05's "never block payment" rule), so in practice this doesn't break checkout. But it means a genuine double-submit race is indistinguishable from any other DB failure in the logs, and if a future call site forgets to wrap the call (or awaits it un-caught), it will throw instead of gracefully falling back to the "someone else already captured this attempt" case.

**Fix:** Catch `23505` inside `captureUnpaidBooking` itself and treat it the same as "existing row found" (re-select and update), so the function's idempotency contract holds regardless of caller discipline.

## Info

### IN-01: `charge.refunded`'s one-way branch cancels the booking on *any* refund, including partial ones

**File:** `app/api/webhooks/stripe/route.ts:478-486`

The comment documents this as an intentional D-19 decision predating Phase 62, but it's worth flagging: a partial (e.g. goodwill) refund issued from the Stripe dashboard on a one-way booking will fully cancel the booking record even though the trip may still be proceeding. Not introduced by this phase; listed for visibility since the file is in scope.

### IN-02: `existingRow` cast in `captureUnpaidBooking` bypasses the DB's actual status enum

**File:** `lib/supabase.ts:214`

```ts
const existingRow = existing as { id: string; status: string }
```

`status` is loosely typed as `string` rather than the known status union used elsewhere (e.g. `types/booking.ts`), so a typo in a future status literal comparison (`existingRow.status !== 'unpaid'`) wouldn't be caught by the type checker. Minor; no functional issue found today.

---

_Reviewed: 2026-08-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
