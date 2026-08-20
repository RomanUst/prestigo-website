---
phase: 53-driver-assignment-ui
reviewed: 2026-05-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - supabase/migrations/041_booking_driver_id.sql
  - components/admin/DriverAssignmentSection.tsx
  - app/api/admin/bookings/[id]/assign/route.ts
  - app/api/admin/bookings/[id]/assignment/route.ts
  - components/admin/BookingsTable.tsx
  - tests/admin-assignment.test.ts
  - tests/DriverAssignmentSection.test.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 53: Code Review Report

**Reviewed:** 2026-05-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 53 adds driver assignment to the admin UI: a migration adding `driver_id` FK to `bookings`, a POST endpoint to create `driver_assignments` rows, a GET endpoint to query the latest assignment, a `DriverAssignmentSection` React component, and integration into `BookingsTable`. The code is well-structured overall, with correct auth guards, Zod validation, idempotent migration, and proper React hook ordering. Three warnings were found — none are crashes but all carry real risk of incorrect runtime behavior.

---

## Warnings

### WR-01: VALID_TRANSITIONS divergence between API route and UI table

**File:** `app/api/admin/bookings/[id]/assign/route.ts:14-22` and `components/admin/BookingsTable.tsx:71-79`

**Issue:** Two independent hard-coded copies of `VALID_TRANSITIONS` exist and they differ for the `confirmed` and `assigned` states. The API route allows `confirmed → completed` and `assigned → completed`; the BookingsTable UI does not expose those transitions (it omits `completed` from both). If a future edit updates one copy without the other, the UI will offer transitions the API rejects or vice-versa. The duplication is the structural bug — the divergence today happens to be intentional (UI hides direct-to-completed shortcuts), but it is undocumented and fragile.

**Fix:** Extract the canonical map to a shared module (e.g. `lib/booking-transitions.ts`) and import it in both places. Add a comment at each usage site if intentional UI subsetting is needed:

```typescript
// lib/booking-transitions.ts
export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['assigned', 'completed', 'cancelled'],
  assigned:    ['en_route', 'cancelled', 'completed'],
  en_route:    ['on_location', 'cancelled', 'completed'],
  on_location: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
}

// BookingsTable.tsx — UI subset (omit direct-to-completed shortcuts)
export const UI_TRANSITIONS: Record<string, string[]> = {
  ...VALID_TRANSITIONS,
  confirmed: ['assigned', 'cancelled'],
  assigned:  ['en_route', 'cancelled'],
}
```

---

### WR-02: `handleAssign` error mode not reset before retry

**File:** `components/admin/DriverAssignmentSection.tsx:94-123`

**Issue:** When `mode === 'error'` the component renders the assign UI again (correct), but `handleAssign` does not reset `mode` away from `'error'` before proceeding. The sequence `mode=error → user clicks Assign → setMode('submitting')` works because `setMode('submitting')` is called synchronously on line 96. However if `selectedDriverId` is empty the early return on line 95 leaves `mode` stuck at `'error'` permanently — the user cannot clear the error without selecting a driver, which is unexpected UX. More critically, the error message will persist even after a successful re-assign attempt completes: `setMode('assigned')` is only set on the happy path after the re-fetch (line 111), so any flash between `submitting` and re-fetching keeps the error div visible.

**Fix:** Clear the error state at the top of `handleAssign` regardless of the guard:

```typescript
async function handleAssign() {
  if (!selectedDriverId) return
  setMode('submitting')   // already clears error; no change needed here

  // ...existing code...
}
```

The real fix is to also clear `error` when the user changes `selectedDriverId`:

```typescript
onChange={(e) => {
  setSelectedDriverId(e.target.value)
  if (mode === 'error') setMode('no-assignment')
}}
```

---

### WR-03: `handleAssign` re-fetch failure leaves component in `mode='error'` after successful POST

**File:** `components/admin/DriverAssignmentSection.tsx:105-119`

**Issue:** After a successful POST (201), the component performs a second GET to fetch the full assignment object (lines 107-115). If that GET fails (network blip, timeout), `setMode('error')` is called on line 115. This incorrectly tells the user "assignment failed" even though the `driver_assignments` row was created and the booking status was already updated server-side. A re-load of the page would show the assignment as successful, creating a confusing discrepancy.

**Fix:** On GET failure after a successful POST, fall back to constructing a minimal assignment object from the POST response rather than setting error state:

```typescript
if (res.ok || res.status === 201) {
  const postData = await res.json()
  const assignRes = await fetch(`/api/admin/bookings/${bookingId}/assignment`)
  if (assignRes.ok) {
    const data = await assignRes.json()
    setAssignment(data.assignment)
  } else {
    // POST succeeded — show partial data rather than error
    setAssignment({
      id: postData.assignment.id,
      driver_id: postData.assignment.driver_id,
      status: postData.assignment.status,
      drivers: { name: 'Driver assigned', email: '' },
    })
  }
  setMode('assigned')
  setSelectedDriverId('')
  onAssigned?.('assigned')
} else {
  setMode('error')
}
```

---

## Info

### IN-01: Migration file comment says `supabase db push` not required — could mislead fresh environment setup

**File:** `supabase/migrations/041_booking_driver_id.sql:5-9`

**Issue:** The comment `Running supabase db push is NOT required` is correct for the live database but could mislead a developer setting up a fresh local environment. In that context, the migration IS required. The `IF NOT EXISTS` guard protects idempotency but the comment should be scoped.

**Fix:** Rephrase to clarify the scope:

```sql
-- NOTE: Already applied to the live Supabase database on 2026-04-27.
-- For fresh/local environments: run normally via supabase db push.
-- IF NOT EXISTS guard ensures idempotency in both cases.
```

---

### IN-02: `assignment/route.ts` silently swallows Supabase errors

**File:** `app/api/admin/bookings/[id]/assignment/route.ts:21-28`

**Issue:** The `{ data }` destructure on line 21 ignores the `error` field from Supabase. A real DB error (connection failure, schema mismatch) returns `data: null, error: <Error>` from `maybeSingle()`. The route returns `{ assignment: null }` with HTTP 200, indistinguishable from "no assignment exists". The caller (`DriverAssignmentSection`) treats a 200 response with `null` as "no assignment" and shows the assign UI — silently hiding that an error occurred.

**Fix:** Destructure and check the error:

```typescript
const { data, error } = await supabase
  .from('driver_assignments')
  .select('id, driver_id, status, created_at, drivers(name, email)')
  .eq('booking_id', bookingId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

if (error) {
  console.error('[assignment GET] db error:', error.message)
  return NextResponse.json({ error: 'Failed to fetch assignment' }, { status: 500 })
}

return NextResponse.json({ assignment: data })
```

---

### IN-03: `DriverAssignmentSection` initial fetch API errors treated as "no assignment"

**File:** `components/admin/DriverAssignmentSection.tsx:55-63`

**Issue:** On lines 55-63, a non-OK response from `GET /assignment` falls through to `setMode('no-assignment')`. This is intentional as a defensive fallback, but a 401/403 (session expired) or 500 will silently show the assign UI as if there is simply no driver yet. The admin could accidentally assign a driver and get a 401 from the POST, which would then show as an assignment error — confusing causality.

**Fix:** For correctness, distinguish between "no assignment" (404/empty response) and auth/server errors. At minimum, log the status code:

```typescript
if (assignRes.ok) {
  const data = await assignRes.json()
  setAssignment(data.assignment)
  setMode(data.assignment ? 'assigned' : 'no-assignment')
} else if (assignRes.status === 401 || assignRes.status === 403) {
  setMode('error')  // surface auth failures rather than hiding them
} else {
  setMode('no-assignment')  // tolerate 404 / transient errors gracefully
}
```

---

_Reviewed: 2026-05-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
