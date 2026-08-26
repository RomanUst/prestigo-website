# Phase 63: Admin Booking Editing + Change Notification - Pattern Map

**Mapped:** 2026-08-21
**Files analyzed:** 5 (2 new, 3 modified)
**Analogs found:** 5 / 5 (all in-repo — this is a pure composition phase, zero new dependencies)

> Every new/modified file has an exact in-repo analog. The risk in this phase is NOT choosing patterns — it is faithfully porting three already-correct code blocks (recompute+override, notification gating, branded-email shell) into a new PATCH-trip-fields path without silently diverging. All line numbers below are verified against the current working tree.

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `app/api/admin/bookings/route.ts` (PATCH handler) | Modified | route (API handler) | request-response / CRUD | POST handler in the *same file* (recompute+override) + existing PATCH status block (notification gating) | exact (self-analog) |
| `components/admin/BookingsTable.tsx` (edit mode, per-field save, price-review) | Modified | component | request-response / CRUD | existing inline-edit of `operator_notes` / `driver_price_czk` in the *same file* | exact (self-analog) |
| `components/admin/BookingChangeHistory.tsx` | New | component | request-response (lazy per-row fetch) | `components/admin/FlightStatusBlock.tsx` (lazy per-row sub-fetch) | role + data-flow match |
| `lib/email.ts` (`sendBookingChangedEmail` + `buildChangeEmailHtml`) | Modified | utility (email builder) | transform → send | `sendStatusConfirmedEmail` + `buildStatusEmailHtml` + `StatusEmailBooking` in the *same file* | exact (shell reuse, diff-table content) |
| `supabase/migrations/055_booking_edit_audit_log.sql` | New | migration | schema (batch/DDL) | `053_unpaid_booking_status.sql`, `054_admin_search_bookings_status_filter.sql` | convention match |

**Confirmed next migration number: `055`** (highest existing is `054_admin_search_bookings_status_filter.sql`).

---

## Pattern Assignments

### `app/api/admin/bookings/route.ts` — PATCH handler extension (route, request-response/CRUD)

Covers AEDIT-01, 02, 03, 04, 05, 06, 07. This one file holds ALL the server analogs. Import unchanged: `getAdminUser` (line 1), `computeOutboundLegTotal` (8), `logEmail` (13), `VALID_TRANSITIONS` (16).

**Auth guard (copy verbatim — already present in PATCH, lines 118):**
```typescript
const { error } = await getAdminUser()   // 401/403 guard — do NOT add a second code path
```
For the audit `operator_id`, use the `user` from `getAdminUser()` — the POST handler already destructures it (`const { user, error } = await getAdminUser()`, line 354) and logs `user?.id` for override audit (line ~459).

**zod whitelist schema to extend (lines 38-56):** the current `bookingPatchSchema` has `id`, `status`, `operator_notes`, `driver_price_czk`. Extend with cheap fields + price-affecting fields + `notify_client`, `override_price`, `amount_czk`. Reuse `NO_CRLF` (defined line 300) on every single-line PII string field — same guard `manualBookingSchema` uses (lines 316-322). Build `updatePayload` field-by-field; never spread `request.json()` into `.update()` (mass-assignment guard).

**Price recompute + override (port from POST handler, lines 406-455):**
```typescript
// app/api/admin/bookings/route.ts:406-455 [VERIFIED]
const outboundLegEur = computeOutboundLegTotal(
  d.vehicle_class, d.distance_km ?? null, d.hours ?? 2, days, d.trip_type,
  d.pickup_date, d.pickup_time, d.is_airport ?? false, rates,
)
// ... + computeExtrasTotal, then:
const priceDiverges = Math.abs(computedTotalCzk - d.amount_czk) > ADMIN_PRICE_TOLERANCE_CZK  // line 437
if (priceDiverges && !d.override_price) {
  return NextResponse.json({ error: 'Price mismatch ...', submittedCzk, computedCzk }, { status: 422 })  // line 439
}
const authoritativeAmountCzk = priceDiverges ? d.amount_czk : computedTotalCzk  // line 454
```
`ADMIN_PRICE_TOLERANCE_CZK = 2` is defined at line 348 — import/reuse, do NOT redefine a second tolerance.

**Notification gating (mirror existing PATCH status-email block, lines 167-217):**
```typescript
// app/api/admin/bookings/route.ts:167-206 [VERIFIED]
const { data: flagsRow } = await supabase.from('pricing_globals')
  .select('notification_flags').eq('id', 1).single()          // line 170
const flags = flagsRow?.notification_flags as Record<string, boolean> | null  // line 174
// null/missing flags row = all-enabled: flags[key] !== false
const shouldSend = await logEmail({ bookingId, emailType: 'booking_changed', recipient })  // line 188 — dedup BEFORE Resend
if (shouldSend) after(() => sendBookingChangedEmail(current, changes).catch(...))  // line 198 — fire-and-forget
```
**The one genuinely new piece of logic:** AND-gate the send with the per-save `notify_client` toggle from the request body (`notify_client && flag !== false`). Status emails have no such toggle — this AND-gate exists nowhere verbatim.

**Status-transition / editable-status gate:** reuse `VALID_TRANSITIONS` (line 145 usage). Reject trip-field edits when `current.status` is `completed` or `cancelled` (the two terminal states with empty outgoing arrays) with 422, in addition to hiding controls client-side.

**Leg isolation (Pitfall 5):** every `.update()` / audit insert / email scoped by `.eq('id', ...)` (existing pattern) — never by `payment_intent_id`. This makes D-12 free.

**GNet guard:** for `booking_source === 'gnet'`, do NOT push trip-detail changes (no such GNet API exists — `lib/gnet-client.ts` only pushes status). Local-only + passive UI warning.

---

### `components/admin/BookingsTable.tsx` — edit mode + per-field save + price-review (component, request-response/CRUD)

Covers AEDIT-01, 02, 03, 04, 06, 07 (UI side). All analogs are in this same file.

**PATCH caller to extend (lines 158-169):**
```typescript
// components/admin/BookingsTable.tsx:158-169 [VERIFIED]
const patchBooking = useCallback(async (body: { id: string; status?; operator_notes?; driver_price_czk? }) => {
  const res = await fetch('/api/admin/bookings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) { const data = await res.json().catch(()=>({error:'Unknown error'})); throw new Error(data.error ?? 'Update failed') }
  return res.json()
}, [])
```
Extend the `body` type union with the new trip fields. Note: the 422 price-mismatch response body carries `computedCzk`/`submittedCzk` — the price-review step reads these.

**Per-field save state machine (copy for each new cheap field — lines 129, 185-220):**
```typescript
// components/admin/BookingsTable.tsx:185-197 [VERIFIED] — three-state indicator idle|saving|saved|error
const flushNotes = useCallback(async (bookingId, value) => {
  setNotesSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
  try {
    await patchBooking({ id: bookingId, operator_notes: value })
    setNotesSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
    setTimeout(() => setNotesSaving(prev => prev[bookingId]==='saved' ? {...prev,[bookingId]:'idle'} : prev), 2000)
  } catch { setNotesSaving(prev => ({ ...prev, [bookingId]: 'error' })) }
}, [patchBooking])
```
State keyed by `booking.id`, debounced (800ms, `notesDebounceRef` lines 199-209) or blur-flushed. Cheap fields (name/email/phone/flight/date/time) commit directly this way (AEDIT-01, AEDIT-04). Optimistic local mutate example: `driver_price` flush at line 238 (`setBookings(prev => prev.map(...))`).

**Address editing (AEDIT-03) — reuse `AddressInput` (NOT `AddressInputNew`):** follow the admin precedent in `components/admin/ManualBookingForm.tsx:4` (imports `AddressInput` directly, no flag). Replicate its distance round-trip (`ManualBookingForm.tsx:103-149,196-224`): collect `PlaceResult{address,placeId,lat,lng}` → `POST /api/calculate-price` with `{origin,destination,tripType,pickupDate,pickupTime,...}` → read `distanceKm` + preview price → surface in price-review step → submit `distance_km` in the PATCH. Do NOT call Google Routes API directly.

**Price-review step (D-06, AEDIT-07):** triggered by saving a price-affecting field (vehicle_class / route). Show `old → new` amount, override input, `notify_client` toggle, confirm. On confirm submit `{ vehicle_class?, origin_address?, destination_address?, distance_km?, amount_czk, override_price?, notify_client }`. If server returns 422, populate the review UI from `computedCzk` and require explicit override.

**GNet passive warning:** mirror the existing GNet cancellation copy at `BookingsTable.tsx:1621-1631` (plain-language partner-boundary note) for `booking_source === 'gnet'`.

---

### `components/admin/BookingChangeHistory.tsx` — NEW (component, lazy per-row fetch)

**Analog:** `components/admin/FlightStatusBlock.tsx` (225 lines) — a per-row sub-component that lazily fetches when the row is expanded.

**Pattern to copy (`FlightStatusBlock.tsx:2,37-60`):**
```typescript
import { useState, useCallback } from 'react'
export function FlightStatusBlock({ ... }) {
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [localFlightData, setLocalFlightData] = useState({ ... })
  // fetch('/api/admin/flight-refresh', ...) on demand
}
```
For the history block: fetch `GET /api/admin/bookings/[id]/audit-log` (NEW route — Pitfall 4: the `admin_search_bookings` RPC returns raw `bookings.*` only, no audit join, so a dedicated lazy fetch is lower-risk than modifying the SECURITY DEFINER RPC). Render one entry per audit row grouped by `changed_at`, each showing `field label: old → new`, operator, timestamp, and whether the client was notified. Rendered inside the expanded row (D-11). Reuse `StatusBadge` (imported at `BookingsTable.tsx:13`) for the notified flag.

---

### `lib/email.ts` — `sendBookingChangedEmail()` + `buildChangeEmailHtml()` (utility, transform→send)

**Analog:** `StatusEmailBooking` interface (lines 993-1006), `buildStatusEmailHtml()` (line 1008), `sendStatusConfirmedEmail()` — the status-email family (D-09).

**Reuse the shell chrome, replace the content shape.** `buildStatusEmailHtml` renders a *current-values snapshot* table — D-07 needs an *old→new diff* table, so build a NEW `buildChangeEmailHtml(booking, changes: {field,label,oldValue,newValue}[])` that reuses the same shell helpers:
- `escapeHtml` (line 58), `formatPickupDate` (line 73)
- `formatCZK` / `formatEUR` / `czkToEur` (imported line 2, used e.g. line 258)
- brand colors `#0F1D2C` / `#BFA06A` / `#F3EEE3` (see inline styles lines 153-258)
- `getResend()` wrapper (lines 18-29) for the actual send

Price change appears as an `old → new` amount row in the same diff table. Follow the `escapeHtml`-everything discipline (see the round-trip email's `*Safe` variables, lines 518-535).

---

### `supabase/migrations/055_booking_edit_audit_log.sql` — NEW (migration, DDL)

**Analog:** `053_unpaid_booking_status.sql`, `054_admin_search_bookings_status_filter.sql` (idempotent DROP+RECREATE / `IF NOT EXISTS` convention).

Proposed shape (planner to confirm exact columns — D-10 requires per-field old→new, operator, timestamp, notified):
```sql
CREATE TABLE IF NOT EXISTS public.booking_edit_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  operator_id uuid,               -- getAdminUser().user.id, nullable defensively
  changed_at  timestamptz NOT NULL DEFAULT now(),
  notified    boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS booking_edit_audit_log_booking_id_idx
  ON public.booking_edit_audit_log (booking_id, changed_at DESC);
```
`old_value`/`new_value` as `text` (field set spans dates/strings/enums/numbers). One row per changed field per PATCH, sharing `changed_at` for visual grouping. Service-role-only table → likely no RLS (mirrors `email_log`); planner confirms. Do NOT hand-edit `types/database.types.ts` (it is stale — Pitfall 1); use local `interface` declarations as `BookingsTable.tsx` and the zod schemas already do.

---

## Shared Patterns

### Server-authoritative pricing (recompute + override)
**Source:** `app/api/admin/bookings/route.ts:406-455` (POST handler) + constant `ADMIN_PRICE_TOLERANCE_CZK = 2` (line 348)
**Apply to:** PATCH handler price-affecting branch (AEDIT-02, 03, 07). Never trust client `amount_czk`; recompute, tolerance-check, accept override only via explicit `override_price`.

### Admin auth guard
**Source:** `getAdminUser()` — `lib/supabase/server.ts`, used at `route.ts:59,118,354`
**Apply to:** the (unchanged) PATCH guard covering all new fields, and any new `GET /api/admin/bookings/[id]/audit-log` route.

### Input validation / mass-assignment guard
**Source:** `bookingPatchSchema` (line 38) + `NO_CRLF` regex (line 300)
**Apply to:** all new editable string fields; build `updatePayload` field-by-field, never spread request JSON.

### Notification gating (flag + logEmail dedup + after)
**Source:** `app/api/admin/bookings/route.ts:167-206`
**Apply to:** change-email send, AND-gated with the new `notify_client` toggle. `emailType: 'booking_changed'`, flag key `notification_flags.booking_changed` (name deferred to planner).

### Distance round-trip (client-orchestrated, no library call)
**Source:** `components/admin/ManualBookingForm.tsx:103-149,196-224` → `AddressInput` (`components/booking/AddressInput.tsx`) → `POST /api/calculate-price` (`app/api/calculate-price/route.ts:236-284`, Google Routes API)
**Apply to:** route-edit flow (AEDIT-03). Reuse `AddressInput`, not `AddressInputNew`.

### Leg isolation
**Source:** `.eq('id', ...)` scoping throughout the existing PATCH handler (`route.ts:161`)
**Apply to:** every write, audit insert, and email — scope by `bookings.id`, never `payment_intent_id` (D-12, Pitfall 5).

## No Analog Found

None. Every file has an in-repo analog. The only piece of logic with no verbatim precedent is the `notify_client && flag !== false` AND-gate (documented above) — a trivial composition of two existing patterns, not a missing analog.

## Metadata

**Analog search scope:** `app/api/admin/`, `components/admin/`, `components/booking/`, `lib/`, `supabase/migrations/`
**Files scanned:** route.ts (514 lines), BookingsTable.tsx (1729), lib/email.ts (1736), ManualBookingForm.tsx (742), AddressInput.tsx (502), FlightStatusBlock.tsx (225), migrations dir listing
**Pattern extraction date:** 2026-08-21
</content>
</invoke>
