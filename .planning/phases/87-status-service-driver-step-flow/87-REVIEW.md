---
phase: 87-status-service-driver-step-flow
reviewed: 2026-11-03T00:00:00Z
depth: standard
files_reviewed: 62
files_reviewed_list:
  - app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx
  - app/(internal)/admin/(dashboard)/settings/page.tsx
  - app/(internal)/driver/trip/[token]/ConfirmStepDialog.tsx
  - app/(internal)/driver/trip/[token]/InvalidTripLinkView.tsx
  - app/(internal)/driver/trip/[token]/NoShowBlock.tsx
  - app/(internal)/driver/trip/[token]/SlideToAdvance.tsx
  - app/(internal)/driver/trip/[token]/TripCompleted.tsx
  - app/(internal)/driver/trip/[token]/TripDetails.tsx
  - app/(internal)/driver/trip/[token]/TripMap.tsx
  - app/(internal)/driver/trip/[token]/TripScreen.tsx
  - app/(internal)/driver/trip/[token]/page.tsx
  - app/(internal)/driver/trip/driver-trip.css
  - app/(internal)/driver/trip/layout.tsx
  - app/api/admin/bookings/[id]/assign/route.ts
  - app/api/admin/bookings/[id]/no-show/route.ts
  - app/api/admin/bookings/cancel/route.ts
  - app/api/admin/bookings/route.ts
  - app/api/admin/settings/route.ts
  - app/api/calculate-price/route.ts
  - app/api/driver/trip/[token]/progress/route.ts
  - app/embed/chatwoot-dashboard/BookingCard.tsx
  - app/embed/chatwoot-dashboard/panel.css
  - components/admin/BookingsTable.tsx
  - components/admin/ConfirmNoShowModal.tsx
  - components/admin/DriverAssignmentSection.tsx
  - components/admin/NoShowBanner.tsx
  - components/admin/NoShowWaitSettings.tsx
  - components/admin/StatusBadge.tsx
  - components/admin/statusConflict.ts
  - components/booking/RouteMap.tsx
  - infra/espocrm/fields.json
  - infra/espocrm/lib/booking-map.mjs
  - lib/airport.ts
  - lib/booking-events.ts
  - lib/booking-status-service.ts
  - lib/booking-status.ts
  - lib/booking-transitions.ts
  - lib/chatwoot-client.ts
  - lib/chatwoot-mapping.ts
  - lib/customer-mapping.ts
  - lib/driver-nav-url.ts
  - lib/driver-trip-format.ts
  - lib/driver-trip-step.ts
  - lib/email.ts
  - lib/gnet-push.ts
  - lib/google-calendar.ts
  - lib/lead-mapping.ts
  - lib/lead-sync.ts
  - lib/no-show.ts
  - lib/noshow-alert.ts
  - lib/outbox-labels.ts
  - lib/outbox.ts
  - lib/panel-bookings.ts
  - lib/panel-dto.ts
  - lib/prague-date.ts
  - lib/start-gate.ts
  - lib/trip-token.ts
  - supabase/migrations/084_booking_statuses_status_log.sql
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 87: Code Review Report

**Reviewed:** 2026-11-03
**Depth:** standard
**Files Reviewed:** 62
**Status:** issues_found

## Summary

Phase 87 is in good shape on its core invariants. I traced each one and found it sound:

- **Compare-and-set.** `advance_booking_status` does `UPDATE ... WHERE id AND status = p_from` in one statement. The log trigger fires inside the same statement. The actor GUCs are transaction-local. The patch is an allowlist read with `?`, not `jsonb_populate_record`.
- **Grants in 084.** All re-created SECURITY DEFINER functions are revoked from PUBLIC, anon and authenticated, then granted to service_role only. `search_path` is `''` throughout. The new table has RLS on, deny policies, and its privileges revoked from anon/authenticated.
- **Driver token path.** The token must be a UUID. The lookup is a single join, re-run live on every request. `hasTripIdentity` and terminal checks run before any write. The request schema is strict, so the driver cannot send an amount. The route never touches `bookings` directly.
- **No-show threshold (driver side).** The wait time is computed server-side from the DB log row and `pricing_globals`, never from the client. The request RPC only fires while `status = 'on_location'` and no request is open. It changes no status.
- **GNet push.** Claim-then-push is concurrency-safe: a second concurrent call re-evaluates the WHERE and claims nothing.
- **Outbox alert.** The key is deterministic per request second. The handler is state-convergent and posts a private note. Logs carry ids only.
- **DST / timezone.** `pickupInstantMs` uses the two-pass offset resolution. All driver-facing times are formatted in Europe/Prague.

I found no critical issues. The six warnings are real gaps: a refund-before-CAS ordering, an incomplete terminal-status fan-out, partner-booking emails, operator no-show confirmation that bypasses the wait rule, legacy writers that can overwrite terminal statuses, and an unguarded JSON parse. The info items are smaller robustness and hand-off notes.

## Warnings

### WR-01: Cancel route issues the Stripe refund before the compare-and-set, and a lost race leaves a refunded, still-live booking

**File:** `app/api/admin/bookings/cancel/route.ts:119-137`
**Issue:** The CAS runs after `stripe.refunds.create`. Before this phase only the admin could move a booking. Now the driver can move it concurrently (assigned to en_route, en_route to on_location, and so on). If the driver's tap lands between the route's read and its write, `cancelThroughService` returns `conflict`. By then the money is already refunded. The route answers 409 `status_conflict` with `refund_id`, but the booking stays live, so the trip carries on.

For a one-way booking the `charge.refunded` webhook (stripe route, lines ~920-930) then flips the status to `cancelled` unconditionally. So the end state is "cancelled mid-trip, driver link dies", reached through a path the operator was told had failed. The comment says the order was kept "for parity", but the parity argument no longer holds now that a second writer exists.

**Fix:** On `conflict`, re-validate against the fresh status instead of failing. If `VALID_TRANSITIONS[currentStatus]` still includes `cancelled`, retry once with `expectedFrom = currentStatus`. Only if that fails, return 409 with an explicit "refund issued, booking not cancelled" message.

```ts
let result = await cancelThroughService(booking.status as string)
if (!result.ok && result.code === 'conflict' && result.currentStatus &&
    VALID_TRANSITIONS[result.currentStatus]?.includes('cancelled')) {
  result = await cancelThroughService(result.currentStatus)
}
```

`cancelThroughService` would need to take `expectedFrom` and `current` as parameters. A fresh read is needed too: the pre-read `booking` has a stale status.

### WR-02: `no_show` is missing from the server-side terminal gate on trip edits

**File:** `app/api/admin/bookings/route.ts:370`
**Issue:** The gate is still `current.status === 'completed' || current.status === 'cancelled'`. D-09 makes `no_show` terminal, and the UI already treats it so (`TripEditPanel` uses `TERMINAL_BOOKING_STATUSES`). The API does not. An admin API call can still edit price, date and route fields of a `no_show` booking. This is the "fan-out checklist" the phase was meant to close (D-02), and a direct API caller or a stale tab bypasses the UI check.

The assign route has the same gap. `app/api/admin/bookings/[id]/assign/route.ts` never rejects terminal bookings. For a `no_show`, `completed` or `cancelled` booking it still inserts a `driver_assignments` row and emails the driver a dead trip link.

**Fix:** Import `TERMINAL_BOOKING_STATUSES` and use it in both places.

```ts
if ((TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(current.status)) {
  return NextResponse.json({ error: `${current.status} bookings are final and cannot be edited` }, { status: 422 })
}
```

In the assign route, return 422 right after the booking read when the status is terminal.

### WR-03: Driver-initiated completion now emails GNet partner passengers automatically

**File:** `lib/booking-status-service.ts:244-291` (reached from `lib/driver-trip-step.ts:198-205`)
**Issue:** The `full` profile sends `sendStatusConfirmedEmail`, `sendStatusCancelledEmail` and `sendPostTripEmail` to `current.client_email` with no partner guard. GNet farm-in bookings carry either the partner passenger's email or the fallback `noreply@gnet.local` (`app/api/gnet/farmin/route.ts:374,426`). Before this phase only an admin PATCH could trigger this. Now every driver "Complete trip" tap on a GNet booking sends a "Thank you for riding with Prestigo" review mail to a partner's customer, or bounces to a fake domain, which hurts the Resend sender reputation.

D-05 says partner bookings skip money paths. `isPartnerBooking` already exists in `booking-status.ts`, and `emitBookingCompleted` already uses it. Customer-facing email is the same class of "Prestigo customer relationship" that partner bookings do not have.

**Fix:** Skip the email block when the booking is a partner booking, at least for `completed`. Also skip any recipient ending in `@gnet.local`.

```ts
if (previousStatus !== to && !isPartnerBooking(current as { booking_source?: string | null })) { /* email block */ }
```

### WR-04: Operator "Confirm no-show" does not enforce the waiting threshold or require an open request

**File:** `lib/no-show.ts:357-370`, `app/api/admin/bookings/[id]/no-show/route.ts:101-110`, `app/api/admin/bookings/route.ts` (PATCH `status: 'no_show'`)
**Issue:** The free-wait threshold is enforced only on the driver's request. `confirmNoShow` and the admin PATCH both move `on_location` to `no_show` with only the transition check. The operator can mark a no-show seconds after the driver arrives, and the action never requires `no_show_requested_at`. D-15 says the threshold is what makes a no-show chargeable (Phases 89 and 91 reuse these settings). Today `no_show` charges nothing, so this is latent. But the terminal status is irreversible, and nothing records whether the wait elapsed, so Phase 89 cannot tell a legitimate no-show from an early click.

The modal's `expected_status` guard only protects against stale views, not against an early confirm.

**Fix:** Do one of the following.
- In `confirmNoShow`, require `no_show_requested_at IS NOT NULL` or `now >= availableAt`, and return 422 otherwise.
- Allow an explicit `override: true` that is written to `booking_status_log`.
- At minimum, have Phase 89 treat only requested-and-elapsed no-shows as chargeable, and note that obligation next to the `assertMoneyEligible` hand-off in `lib/booking-events.ts`.

### WR-05: Legacy status writers can overwrite terminal statuses and bypass the compare-and-set

**File:** `app/api/gnet/farmin/route.ts:236-243`, `app/api/webhooks/stripe/route.ts:925-1031` (allowlisted in `tests/status-writers-gate.test.ts`)
**Issue:** The GNet partner-cancel branch does `.update({ status: 'cancelled' }).eq('id', ...)` with no status predicate. A late partner CANCEL on a booking that is already `completed` or `no_show` flips a terminal row to `cancelled`. That violates D-09 and the "exactly one completion fact" intent: `completed_at` stays set while the status says cancelled. The trigger logs it as actor `system`, so it is visible but not prevented. The Stripe refund paths have the same shape. The allowlist comment accepts `completed -> cancelled` for refunds. It does not discuss `no_show`, which Phase 89 will want to keep terminal.

**Fix:** Add a predicate to the GNet cancel, e.g. `.not('status', 'in', '(completed,no_show,cancelled)')`. Treat zero rows updated as an acknowledged no-op. For the Stripe refund paths, decide explicitly whether `no_show -> cancelled` is wanted and document it in the allowlist entry.

### WR-06: Settings PATCH has an unguarded `request.json()` and no cross-field sanity check

**File:** `app/api/admin/settings/route.ts:60`
**Issue:** `const body = await request.json()` is outside a try/catch. A malformed body throws an unhandled error and returns a 500 instead of 400 (the sibling routes in this phase all guard it). The file was modified in this phase to add the no-show fields, so the new write path inherits the gap. The two thresholds are also independent: nothing prevents an airport wait shorter than the city wait. That is probably a misconfiguration, since D-15 says airports wait longer.

**Fix:**
```ts
let body: unknown
try { body = await request.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}
```
Optionally warn in the UI when airport < city.

## Info

### IN-01: Stale `no_show_requested_at` is never cleared when the booking leaves `on_location`

**File:** `supabase/migrations/084_booking_statuses_status_log.sql:159-177`, `lib/no-show.ts:341-354`
**Issue:** If the driver requests a no-show and the booking then moves to `on_board`, `completed` or `cancelled`, `no_show_requested_at` stays set. All current readers gate on `status = 'on_location'` (banner, alert handler, driver page), so nothing misbehaves today. It is a trap for Phase 89, which may read the column directly.
**Fix:** Clear it inside `advance_booking_status` when `p_from = 'on_location' AND p_to <> 'no_show'`. Or document that consumers must always combine it with the status.

### IN-02: No-show request fails open when the availability instant is unknown

**File:** `lib/no-show.ts:282-295`
**Issue:** `availableAtMs === null` (no pickup instant and no `on_location` log row) lets the request through. This is the documented "fail open like the start gate" and is very unlikely for new data, since `pickup_utc` is generated and the trigger always logs `on_location`. A booking that was already `on_location` when 084 was applied has no log row, so the wait counts from `pickup` only. That is earlier than the true arrival for a late driver.
**Fix:** Acceptable as is. Optionally log a counter when the fallback is used, to confirm it never happens after the deploy window.

### IN-03: Replay of a driver step does not re-attempt a failed `trip_progress` mirror

**File:** `lib/driver-trip-step.ts:150-171, 225-234`
**Issue:** The mirror write that follows the winning CAS only logs on failure. A retap returns the replay branch before the mirror, so a failed mirror is never healed. The Chatwoot panel reads `trip_progress`, so it shows a stale step until the next transition. Admin-driven transitions never update the mirror at all (pre-existing).
**Fix:** Run the idempotent mirror update on the replay branch too. Or derive the panel's progress from `bookings.status`.

### IN-04: GNet push is at-most-once across a crash, and a failed status-recording update loses the retry

**File:** `lib/gnet-push.ts:53-79, 95-105`
**Issue:** This is documented and deliberate (D-04). It deserves a follow-up because the push runs inside `after()`, which the platform can kill. A lost COMPLETE or CANCEL is partner-visible and is never retried, since `last_push_status = X` with a null error looks successful. Also, `Number(amountEur).toFixed(2)` turns a null `amount_eur` into `"0.00"` and an undefined one into `"NaN"` and sends that to the partner.
**Fix:** Add a small reconcile sweep for gnet bookings whose `last_pushed_at` is older than N minutes while the push was claimed but unconfirmed. Guard the amount: skip the push, or log, when `amountEur` is not a finite number.

### IN-05: No-show operator email includes the passenger's pickup address

**File:** `lib/email.ts:569-622`, `lib/no-show.ts:213-220`
**Issue:** The doc comment says the alert carries "no client name, email, phone or amount". It does include `originAddress`, which for a private pickup is the passenger's home or hotel. It goes only to `MANAGER_EMAIL` as plain text, so the exposure is small. The code comment and the privacy intent disagree.
**Fix:** Drop the address from the email (the booking reference is enough to look it up), or update the comment to state that the address is deliberately included.

### IN-06: Airport detection by address regex is broad

**File:** `lib/no-show.ts:31, 44-53`
**Issue:** `/airport|letiště|letiste|václav havel|\bPRG\b/i` matches any origin address containing those words (a hotel called "Airport Hotel", a street named "Letiště" in another town). Those get the 60-minute wait. That errs in the passenger's favour. `isNearAirport` is a square degree box, not a radius. Neither is a correctness bug.
**Fix:** Prefer the coordinate check when coordinates exist, and use the regex only as a fallback when lat/lng are null.

### IN-07: Deployment-order and small UX notes

**Files:** `infra/espocrm/fields.json:61-72`, `app/(internal)/driver/trip/[token]/TripScreen.tsx:263-269`, `app/api/admin/bookings/[id]/assign/route.ts:121-133`
**Issues:**
- **EspoCRM.** The CBooking `status` enum gains `on_board` and `no_show` in `fields.json`. The live EspoCRM instance must have the metadata applied before the first booking reaches those statuses. Otherwise `sync.espo` rows fail on enum validation, and repeated failures can trip the CRM breaker for all sync. This repo has no ordering guard, so confirm the infra apply step ran.
- **Driver 409 message.** `step_conflict` always shows "The office has updated this trip". It also fires when the driver double-taps or uses a second device. That is harmless but potentially confusing.
- **Assign route.** When a booking is already `en_route`, `on_location` or `on_board` (not `assigned`), the route inserts a new assignment and emails the new driver a trip link. It does not update `bookings.driver_id`, so the new driver's link is immediately `ended` and the old driver continues. This is pre-existing, but the new statuses extend it.
**Fix:** Confirm the Espo apply step. Soften or branch the 409 copy. In the assign route, reject (409) when the status is past `assigned`, or update `driver_id` deliberately.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
