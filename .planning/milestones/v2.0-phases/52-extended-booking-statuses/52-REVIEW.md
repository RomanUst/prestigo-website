---
phase: 52-extended-booking-statuses
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - supabase/migrations/040_extended_booking_statuses.sql
  - lib/gnet-client.ts
  - app/api/admin/bookings/route.ts
  - components/admin/StatusBadge.tsx
  - components/admin/BookingsTable.tsx
  - tests/gnet-status-push.test.ts
  - tests/gnet-client.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 52: Code Review Report

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 52 adds three new booking statuses (`assigned`, `en_route`, `on_location`) to the database
constraint, the GNet status-push mapping, the admin API route, and the admin UI. The migration,
GNet client, and server-side transition guard are all correct. Tests cover the happy path and all
new status transitions.

Three logic issues were found: a client/server VALID_TRANSITIONS mismatch that causes silent 422
errors when the operator attempts `assigned → completed` via the UI; a missing cancel button for
the new "in-progress" statuses despite the transitions table allowing cancellation from all of them;
and a missing `amount_eur` field in the shared test fixture, which causes `pushGnetStatus` to
receive `"NaN"` as the totalAmount in every status-push test — the GNet API call is technically
wrong in all tests, even though they pass.

---

## Warnings

### WR-01: Client VALID_TRANSITIONS allows `assigned → completed` but server rejects it with 422

**File:** `components/admin/BookingsTable.tsx:74`

**Issue:** The client-side `VALID_TRANSITIONS` map includes `'completed'` as a valid next state
from `'assigned'`:

```ts
assigned: ['en_route', 'cancelled', 'completed'],   // BookingsTable.tsx line 74
```

The server-side map does not:

```ts
assigned: ['en_route', 'cancelled'],                // route.ts line 28
```

When an operator selects "Completed" from the dropdown of an `assigned` booking, the UI sends a
PATCH request, the server returns 422, and the UI shows a generic `alert()` with the error message.
The operation silently fails from the operator's perspective because the dropdown reverts with no
permanent feedback. This is a UX-breaking logic error in an admin-only surface.

**Fix:** Align the two maps. The server is authoritative; remove `'completed'` from the
`assigned` transitions in `BookingsTable.tsx`:

```ts
// components/admin/BookingsTable.tsx
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['completed', 'cancelled', 'assigned'],
  assigned:    ['en_route', 'cancelled'],             // remove 'completed'
  en_route:    ['on_location', 'cancelled'],
  on_location: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
}
```

---

### WR-02: Cancel button hidden for `assigned`, `en_route`, `on_location` despite transitions allowing it

**File:** `components/admin/BookingsTable.tsx:934` and `:1284`

**Issue:** The dedicated "Cancel Booking" button (which routes through the `/api/admin/bookings/cancel`
endpoint) is conditionally rendered only for `pending` and `confirmed` bookings:

```tsx
{(booking.status === 'pending' || booking.status === 'confirmed') && (
  <button onClick={...}>Cancel Booking</button>
)}
```

The `VALID_TRANSITIONS` map (both client and server) explicitly allows `cancelled` as a target from
`assigned`, `en_route`, and `on_location`. Operators can technically cancel via the status dropdown,
but the cancel confirmation modal (which shows refund information and triggers the dedicated cancel
endpoint) will never appear. More importantly, the cancel endpoint likely handles GNet CANCEL push
and Stripe refund logic that the generic PATCH endpoint does not.

**Fix:** Extend the condition to include the new in-progress statuses:

```tsx
{(['pending', 'confirmed', 'assigned', 'en_route', 'on_location'] as const)
  .includes(booking.status as never) && (
  <button onClick={(e) => { e.stopPropagation(); setPendingCancel(booking) }}>
    Cancel Booking
  </button>
)}
```

Apply the same fix at both sites (mobile card line ~934 and desktop expanded row line ~1284).

---

### WR-03: Test fixture missing `amount_eur` — `pushGnetStatus` receives `"NaN"` as totalAmount in all integration tests

**File:** `tests/gnet-status-push.test.ts:82-90`

**Issue:** The shared `bookingRow` fixture does not include `amount_eur`:

```ts
const bookingRow = {
  id: BOOKING_UUID,
  status: 'pending',
  booking_source: 'gnet',
  client_email: 'a@b.com',
  pickup_utc: null,
  client_first_name: 'Test',
  client_last_name: 'User',
  // amount_eur: missing
}
```

In `route.ts` line 235, the production code computes:

```ts
const totalAmount = Number(current.amount_eur).toFixed(2)
```

When `current.amount_eur` is `undefined`, `Number(undefined)` is `NaN`, and `NaN.toFixed(2)` is
`"NaN"`. Every test that asserts `pushGnetStatus` is called with `expect.any(String)` passes,
but the actual call in tests is `pushGnetStatus('RES-123', 'CONFIRMED', 'NaN')` — not a valid
totalAmount. If the GNet API validates this field, these tests are not representative of production
behaviour.

**Fix:** Add `amount_eur` to the fixture:

```ts
const bookingRow = {
  id: BOOKING_UUID,
  status: 'pending',
  booking_source: 'gnet',
  client_email: 'a@b.com',
  pickup_utc: null,
  client_first_name: 'Test',
  client_last_name: 'User',
  amount_eur: 120.00,   // add this
}
```

And tighten the assertions in STATUS-01 and the Phase 52 tests to verify the amount string is a
valid decimal (e.g., `'120.00'`) rather than `expect.any(String)`.

---

## Info

### IN-01: Duplicate `// Operator Notes` label string in desktop expanded row

**File:** `components/admin/BookingsTable.tsx:1227`

**Issue:** The string `"Operator Notes"` appears as a `div` text node inside the expanded desktop
row rather than inside a `DetailField` label component (as used elsewhere). This is minor
inconsistency, not a bug.

**Fix:** Use the `DetailField` component or extract a shared constant if this string is referenced
in multiple places.

---

### IN-02: `gnet-client.ts` line 36 — `\\n` escape in regex is a single backslash-n, not a newline

**File:** `lib/gnet-client.ts:36`

**Issue:**

```ts
const base = process.env.GNET_API_URL?.replace(/\\n$/, '').trim()
```

The regex `/\\n$/` matches a literal two-character sequence `\n` at the end of the string (because
in a regex literal, `\\` is an escaped backslash producing `\`, followed by `n`). If the env var
contains an actual newline character (ASCII 0x0A) — which is the common case when secrets are
injected via `.env` files on some platforms — this regex would not strip it. This is the same
pattern used on line 77 for `GNET_GRIDDID`.

This is also present in the existing Phase 50 code (not introduced in Phase 52), so it is flagged
as informational rather than a regression. However if `GNET_API_URL` ends with a real newline, the
URL would include a trailing newline, causing all fetch calls to fail.

**Fix:** Use a character class that matches both a literal `\n` sequence and a real newline:

```ts
const base = process.env.GNET_API_URL?.replace(/(?:\\n|\n)$/, '').trim()
```

Or more defensively, strip any trailing whitespace:

```ts
const base = (process.env.GNET_API_URL ?? 'https://api.grdd.net/Platform.svc').trim()
```

The `.trim()` call already handles real newlines, so if you move it before `.replace()` you can
drop the replace entirely.

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
