---
phase: 66-driver-trip-portal-permanent-link-trip-sheet
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/api/admin/bookings/[id]/assign/route.ts
  - app/api/admin/bookings/[id]/assignment/route.ts
  - app/driver/trip/[token]/page.tsx
  - components/admin/DriverAssignmentSection.tsx
  - lib/email.ts
  - lib/trip-token.ts
  - supabase/migrations/060_driver_assignments_trip_token.sql
  - tests/DriverAssignmentSection.test.tsx
  - tests/admin-assignment.test.ts
  - tests/driver-trip.test.ts
  - types/database.types.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 66: Code Review Report

**Reviewed:** 2026-08-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the permanent driver trip-token feature: migration 060 (`trip_token` column + unique index), the `isTripLinkValid` predicate, the token-gated `/driver/trip/[token]` page, the admin "Copy Trip Link" control, and the email/API wiring that delivers the link.

The security-sensitive surface holds up well:
- **SEC-18** is correctly enforced — the `assign` POST `.select()` fetches `trip_token` for server-side email use only; the response body explicitly omits it (confirmed by a dedicated regression test).
- **Anti-enumeration** is correctly implemented — `z.string().uuid().safeParse(token)` rejects malformed tokens *before* any Supabase call, and every invalid reason (unknown token, bad shape, terminal status, reassigned, orphaned booking) renders the exact same neutral "This trip link is no longer active." view with no branch leaking which case occurred.
- The trip page performs **read-only** access — a single `.select()` join, no `.insert()`/`.update()`/`.delete()` anywhere in `page.tsx`.
- **DTRIP-07** holds — `app/api/driver/respond/route.ts` and its tests are untouched by this diff; the trip-link validity predicate (`isTripLinkValid`) is independent of `driver_assignments.status`, matching documented decision D-03 (this is intentional per `66-CONTEXT.md`, not a gap).
- `isTripLinkValid`'s `TERMINAL_STATUSES` set (`completed`, `cancelled`) matches exactly the two empty-array keys of `VALID_TRANSITIONS` in `lib/booking-transitions.ts`, so the "matches the two terminal states" comment is verifiably true, not just asserted.

No critical/blocker issues were found. The warnings below are all in the admin "Copy Trip Link" UI state machine and in accompanying email copy — none affect the token security boundary itself.

## Warnings

### WR-01: `copyState` is not reset when reassigning, leaking stale copy-result UI into the next assignment

**File:** `components/admin/DriverAssignmentSection.tsx:140-143`
**Issue:** `handleReassign()` resets `mode` and `selectedDriverId` but never resets `copyState`. Sequence that reproduces it: (1) admin clicks "Copy Trip Link", clipboard write fails (denied permission, insecure context, etc.) → `copyState` becomes `'failed'`; (2) admin clicks "Reassign" and picks a different driver → `handleAssign()` succeeds and sets `mode` back to `'assigned'`. Because `copyState` was never cleared, the component immediately re-renders the "Couldn't copy — select and copy the link manually." error block and the read-only `<input>` (populated with the *new* assignment's `trip_token`) even though the admin never attempted to copy the new link. The same staleness applies to the `'copied'` state — if reassignment happens within the 2s auto-reset window, the button briefly reads "Copied!" for a link that was never actually copied.
**Fix:**
```tsx
function handleReassign() {
  setMode('reassigning')
  setSelectedDriverId('')
  setCopyState('idle')   // clear stale copy-result UI for the new assignment
}
```

### WR-02: `setTimeout` in `handleCopyTripLink` is not cleaned up on unmount

**File:** `components/admin/DriverAssignmentSection.tsx:145-155`
**Issue:** After a successful clipboard write, `setTimeout(() => setCopyState('idle'), 2000)` is scheduled with no corresponding `clearTimeout`. If the row/component unmounts before the 2s elapses (e.g. the admin navigates away, the bookings list re-renders/filters the row out, or the booking transitions to a state that hides this section — see the `completed`/`cancelled` early-return a few lines above), React will warn about (or, depending on version, throw during) a state update on an unmounted component. This is a minor but real robustness gap; the existing `useEffect`'s `cancelled` flag pattern in this same file shows the project's established convention for guarding against exactly this class of bug.
**Fix:** Track the timeout id in a ref and clear it in a cleanup, or guard with a mounted-ref:
```tsx
const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

async function handleCopyTripLink() {
  if (!assignment) return
  const tripUrl = `${window.location.origin}/driver/trip/${assignment.trip_token}`
  try {
    await navigator.clipboard.writeText(tripUrl)
    setCopyState('copied')
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 2000)
  } catch {
    setCopyState('failed')
  }
}

// in a useEffect cleanup or component-unmount handler:
useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current) }, [])
```

### WR-03: "These links are valid for 48 hours" note sits directly under the permanent (non-expiring) trip-sheet link

**File:** `lib/email.ts:1495-1502`
**Issue:** The new "VIEW TRIP SHEET" CTA (built from the permanent, non-expiring `trip_token` per D-01) is rendered immediately above the existing note "These links are valid for 48 hours. Please respond as soon as possible." Visually and textually, "These links" now reads as covering all three CTAs directly above it, including VIEW TRIP SHEET — but that link never expires. A driver could reasonably conclude the permanent trip-sheet link (the one meant to be presentable to police control at any point in the future) will stop working after 48 hours and discard/lose it, or lose confidence in it during an actual control check. This directly undercuts the feature's core value proposition (a durable, presentable link). Note: this was a deliberate choice in the phase plan to leave the existing note textually unchanged (DTRIP-07 scoping to accept/decline only) — flagging it here because the resulting reader-facing ambiguity is a genuine, demonstrable defect regardless of implementation intent.
**Fix:** Scope the note to the two links it actually describes, or add a second line for the trip-sheet link, e.g.:
```html
<div style="padding: 0 32px 24px; text-align: center;">
  <p style="font-size: 12px; color: #A9AEB0; ...; margin: 0;">The ACCEPT/DECLINE links above are valid for 48 hours — please respond as soon as possible. The trip sheet link does not expire.</p>
</div>
```

## Info

### IN-01: Trip sheet renders the raw ISO pickup date instead of a human-readable format

**File:** `app/driver/trip/[token]/page.tsx:277`
**Issue:** `<FieldRow label="Date" value={booking.pickup_date} />` prints the raw `'YYYY-MM-DD'` string (e.g. `2026-09-01`) directly. Every other customer/driver-facing surface in this codebase (`formatPickupDate` in `lib/email.ts`, used in both the client confirmation and driver-assignment emails) formats pickup dates as `"1 September 2026"`. Given this page is explicitly designed to be shown to a police officer as a professional trip document, the raw ISO string is a visible inconsistency with the rest of the product's presentation quality.
**Fix:** Reuse (or duplicate, since `formatPickupDate` in `lib/email.ts` is not currently exported) the same date formatting helper used elsewhere:
```tsx
<FieldRow label="Date" value={formatPickupDate(booking.pickup_date)} />
```

### IN-02: Migration 060's `ADD COLUMN` is not idempotent, inconsistent with its own sibling statement and most prior migrations

**File:** `supabase/migrations/060_driver_assignments_trip_token.sql:19`
**Issue:** `ALTER TABLE driver_assignments ADD COLUMN trip_token uuid NOT NULL DEFAULT gen_random_uuid();` has no `IF NOT EXISTS` guard, while the very next statement in the same file (`CREATE UNIQUE INDEX IF NOT EXISTS ...`) is idempotent. Most other migrations in `supabase/migrations/` (045, 043, 047, 041, 052, 050, 056, 053, 051) use `ADD COLUMN IF NOT EXISTS`. Given this repo's convention of applying migrations live by hand (per the file's own header comment), a re-run (e.g. after a partial failure applying the index) will error out on the column statement instead of no-op'ing.
**Fix:**
```sql
ALTER TABLE driver_assignments
  ADD COLUMN IF NOT EXISTS trip_token uuid NOT NULL DEFAULT gen_random_uuid();
```

---

_Reviewed: 2026-08-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
