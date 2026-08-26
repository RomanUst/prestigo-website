---
phase: 63-admin-booking-editing-change-notification
reviewed: 2026-08-21T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - app/api/admin/bookings/route.ts
  - app/api/admin/bookings/[id]/audit-log/route.ts
  - components/admin/BookingChangeHistory.tsx
  - components/admin/BookingsTable.tsx
  - lib/email.ts
  - supabase/migrations/055_booking_edit_audit_log.sql
findings:
  critical: 1
  warning: 5
  info: 2
  total: 8
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-08-21T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the admin booking-editing PATCH endpoint, the audit-log read route, the
change-history UI, the trip-edit panel in `BookingsTable.tsx`, the new
`sendBookingChangedEmail`/`buildChangeEmailHtml` pair in `lib/email.ts`, and
migration 055. Admin auth guarding (401/403) is consistently applied on both
routes. HTML escaping in the change-notification email is correct — every
interpolated `change.label` / `change.oldValue` / `change.newValue` is passed
through `escapeHtml()`, and the CRLF-blocking regex on single-line PII fields
in the Zod schema is present and correctly wired. The price recompute +
tolerance + override sub-branch is a faithful, well-guarded port of the POST
handler's existing pattern, and the mass-assignment guard (building
`tripUpdatePayload` field-by-field instead of spreading the body) is
consistently applied.

The one blocking issue is that the change-notification email is built from
the *pre-update* booking snapshot (`current`) rather than the merged
post-update state. When the field being edited is `client_email` itself, the
notification is sent to (and de-duplicated against) the stale address, not
the corrected one — the client who just had their email fixed never receives
the "your booking was updated" email, and a stranger who happens to hold the
old address does. Several warnings around silently-dropped fields, missing
input bounds, and one client-side edge case round out the report.

## Critical Issues

### CR-01: Change-notification email sent to the stale client_email when client_email is the field being edited

**File:** `app/api/admin/bookings/route.ts:451-693` (fetch of `current`, and the `sendBookingChangedEmail(current, entries)` call at line 690), cross-referenced with `lib/email.ts:1231-1243` (`sendBookingChangedEmail` sends `to: [booking.client_email]`)

**Issue:**
`current` is fetched once at the top of the trip-edit branch, *before* the
DB `.update()` is applied:

```ts
const { data: current, error: fetchError } = await supabase
  .from('bookings')
  .select('*')
  .eq('id', parsed.data.id)
  .single()
...
const { error: dbError } = await supabase
  .from('bookings')
  .update(tripUpdatePayload)
  .eq('id', parsed.data.id)
...
shouldSend = await logEmail({
  bookingId: current.id,
  emailType: 'booking_changed',
  recipient: current.client_email,   // <-- OLD address
})
...
if (shouldSend) {
  after(() => sendBookingChangedEmail(current, entries).catch(...))  // <-- OLD address + OLD name in greeting
}
```

`current` is never re-merged with `tripUpdatePayload` before it's handed to
`logEmail` (as the dedup `recipient` key) or `sendBookingChangedEmail` (whose
`to:` field and "Dear {firstName} {lastName}" greeting both read straight
from the `booking` argument, per `lib/email.ts` `sendBookingChangedEmail` /
`buildChangeEmailHtml`).

Concretely: an admin opens a booking, corrects a mistyped `client_email` via
`TripEditPanel`'s "Save Email" button, and checks "Notify client" — wait,
there's no notify checkbox on the cheap-field save groups, but the endpoint
itself doesn't forbid `client_email` + `notify_client: true` in one request,
and any raw API caller (or a future UI change) legitimately can combine them
per the schema. In that case:
- The email is sent to the **old** address, not the corrected one.
- The greeting line still reads "Dear {old first name} {old last name}" if
  the name was changed in the same batch.
- The dedup key in `email_log` is keyed off the old address too, so a
  follow-up correction attempt with the same old (wrong) recipient could be
  silently suppressed by the 10-minute dedup window.

This is a real notification-delivery bug and a minor PII-exposure risk (the
booking reference, and — depending on which other fields changed in the same
batch — trip details are sent to whoever currently holds the stale address).

**Fix:** Build the notification/email snapshot from the merged post-update
state, not the raw pre-update `current` row:

```ts
const emailSnapshot = { ...current, ...tripUpdatePayload }

let shouldSend = false
if (entries.length > 0 && parsed.data.notify_client === true) {
  ...
  shouldSend = await logEmail({
    bookingId: current.id,
    emailType: 'booking_changed',
    recipient: emailSnapshot.client_email,
  })
}
...
if (shouldSend) {
  after(() => sendBookingChangedEmail(emailSnapshot, entries).catch(err =>
    console.error('[booking-notify] changed:', err)
  ))
}
```

## Warnings

### WR-01: `operator_notes` and `driver_price_czk` are silently dropped when combined with a trip-edit field in one PATCH

**File:** `app/api/admin/bookings/route.ts:450-696` (the `hasTripField` branch), vs. the schema `.refine()` at lines 129-133

**Issue:** `bookingPatchSchema`'s own validation explicitly allows a request
to carry `operator_notes` and/or `driver_price_czk` together with any
`TRIP_EDIT_FIELDS`/`PRICE_EDIT_FIELDS` key ("At least one of status,
operator_notes, driver_price_czk, or a trip field must be provided"). But
inside the `hasTripField` branch, `tripUpdatePayload` is only ever populated
from `TRIP_EDIT_FIELDS`, `PRICE_EDIT_FIELDS`, and the auto-generated
price-override note (`tripUpdatePayload.operator_notes = ...` at line
590-592). `parsed.data.operator_notes` and `parsed.data.driver_price_czk`
are never read in this branch, so a valid, schema-accepted request that
combines e.g. `pickup_date` + `operator_notes` silently discards the notes
— the response is `{ ok: true }` with no error, no audit row, nothing.

Not currently reachable from `BookingsTable.tsx` (each save action — notes,
driver price, trip fields — issues its own single-purpose PATCH), so there's
no live user-facing repro today, but it's a real gap in the endpoint's own
contract that will silently lose data the moment any caller (a future UI
change, an internal script, direct API use) combines these fields.

**Fix:** In the `hasTripField` branch, also apply `operator_notes` and
`driver_price_czk` when present (being careful not to clobber the
auto-generated override note — append rather than overwrite):

```ts
if (parsed.data.driver_price_czk !== undefined) tripUpdatePayload.driver_price_czk = parsed.data.driver_price_czk
if (parsed.data.operator_notes !== undefined) {
  tripUpdatePayload.operator_notes = tripUpdatePayload.operator_notes
    ? `${parsed.data.operator_notes}\n${tripUpdatePayload.operator_notes}`
    : parsed.data.operator_notes
}
```

### WR-02: `distance_km` has no server-side lower bound

**File:** `app/api/admin/bookings/route.ts:120` (`distance_km: z.number().nullable().optional()`)

**Issue:** The only guard against a bad `distance_km` is the transfer-trip
check at line 507 (`effectiveDistanceKm <= 0` → 400). For `hourly`/`daily`
bookings, `distance_km` isn't used in pricing but is still written verbatim
to `tripUpdatePayload.distance_km` (line 575) with no bound at all — a raw
API call (or a future UI bug) can persist a negative distance.

**Fix:** Add `.nonnegative()` (or `.positive()`, if 0 shouldn't be stored)
to the schema: `distance_km: z.number().nonnegative().nullable().optional()`.

### WR-03: `destination_address` accepts an empty string even though transfer trips require it

**File:** `app/api/admin/bookings/route.ts:115` (`destination_address: z.string().max(500).optional()`)

**Issue:** Unlike `origin_address` (`.min(1)`), `destination_address` has no
minimum length. Combined with WR-02, a raw API call can send
`destination_address: ''` for a `transfer` booking without touching
`distance_km`, leaving a booking with a blank destination and a stale
non-zero distance — an internally inconsistent record that the transfer-trip
distance guard (line 507) won't catch because `distance_km` wasn't touched.

**Fix:** Either add `.min(1)` unconditionally (mirroring `origin_address`),
or add an explicit check mirroring the distance guard: reject an empty
`destination_address` when `current.trip_type === 'transfer'`.

### WR-04: `operator_notes` grows unbounded on repeated price overrides

**File:** `app/api/admin/bookings/route.ts:589-592`

**Issue:** Every time `priceDiverges && override_price` is true, a new line
is appended to `current.operator_notes` with no cap — unlike the 2000-char
limit enforced on `operator_notes` when an admin edits it directly
(`z.string().max(2000)` at line 99). Repeated overrides on the same booking
(e.g., an admin reopening "Review Price" and re-confirming the same override
by mistake) grow this field without bound, and the write bypasses the schema
entirely since it's constructed server-side, not user input.

**Fix:** Truncate/cap the concatenated note (e.g., keep only the most recent
override line, or clamp total length to the same 2000-char limit used
elsewhere) before writing it.

### WR-05: Confirming a price review after reverting the vehicle-class selection produces a confusing 400

**File:** `components/admin/BookingsTable.tsx:392` (`confirmPriceReview`), cross-referenced with the schema `.refine()` in `app/api/admin/bookings/route.ts:129-133`

**Issue:** The `<select>` for vehicle class (line 584-594) stays enabled
while the price-review panel is open. If an admin opens "Review Price" for a
vehicle-class change, then changes the select back to the original
`vehicle_class` before clicking "Confirm & Save", `patch.vehicle_class` is
omitted (`vehicleClass !== booking.vehicle_class` guard at line 392 is now
false). The resulting `patch = { id, amount_czk, notify_client }` has no
`TRIP_EDIT_FIELDS`/`PRICE_EDIT_FIELDS` key set, which fails the schema's
first `.refine()` server-side and returns a generic 400 "Invalid payload" —
a confusing error for what should be a harmless no-op.

**Fix:** Either disable the vehicle-class `<select>` while a price review is
open for that trigger, or have `confirmPriceReview` detect "nothing actually
changed" and just close the panel without issuing a PATCH.

## Info

### IN-01: Change history shows raw operator UUID instead of a name

**File:** `components/admin/BookingChangeHistory.tsx:175` (`{group.operatorId ?? 'Unknown operator'}`)

**Issue:** The audit trail displays the raw `operator_id` UUID rather than a
human-readable admin name/email, which reduces the usefulness of the
"who made this change" attribution for a single-operator-today, multi-admin
tomorrow admin tool.

**Fix:** Join against the admin users table (or a static id→name map) either
in the audit-log route or in the component.

### IN-02: Cleared fields render as a blank instead of the placeholder dash

**File:** `components/admin/BookingChangeHistory.tsx:198`

**Issue:** `{row.old_value ?? '—'} → {row.new_value ?? '—'}` only substitutes
the em-dash placeholder for `null`. Clearing an optional field (e.g.
`flight_number`) stores `new_value: ''` (per `diffFields()` in
`route.ts`), which renders as a trailing blank rather than the intended
"—" placeholder, e.g. "Flight number: OK123 → ".

**Fix:** Treat `''` the same as `null`: `row.new_value || '—'` (and same for
`old_value`).

---

_Reviewed: 2026-08-21T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
