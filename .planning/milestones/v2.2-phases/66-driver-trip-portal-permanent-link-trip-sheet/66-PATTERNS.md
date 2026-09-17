# Phase 66: Driver Trip Portal — Permanent Link & Trip Sheet - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 7 (1 migration, 1 new page, 1 new client component (optional), 3 modified API/lib files, 1 modified admin component)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/migrations/060_driver_assignments_trip_token.sql` | migration | CRUD (schema) | `supabase/migrations/059_admin_search_bookings_sort.sql` (structure/comment convention); `048_saved_passengers.sql` / `055_booking_edit_audit_log.sql` (gen_random_uuid() DEFAULT usage) | role-match |
| `app/driver/trip/[token]/page.tsx` | route (server component) | request-response (token-gated read) | `app/driver/response/page.tsx` | exact |
| `app/driver/trip/[token]/TripSheetMap.tsx` (optional client island, D-09) | component | request-response | `components/booking/RouteMap.tsx` | role-match |
| `app/api/admin/bookings/[id]/assign/route.ts` | route (controller) | request-response + CRUD | itself (existing file — extend in place) | exact (self-modify) |
| `app/api/admin/bookings/[id]/assignment/route.ts` | route (controller) | request-response | itself (existing file — extend in place) | exact (self-modify) |
| `lib/email.ts` (`DriverAssignmentEmailData`, `buildDriverAssignmentHtml`, `sendDriverAssignmentEmail`) | service/utility | transform | itself (existing file — extend in place) | exact (self-modify) |
| `components/admin/DriverAssignmentSection.tsx` | component | request-response | itself (existing file — extend "assigned" branch with copy-link control) | exact (self-modify) |

## Pattern Assignments

### `supabase/migrations/060_driver_assignments_trip_token.sql` (migration)

**Analog:** `supabase/migrations/059_admin_search_bookings_sort.sql` (comment header convention + "applied live by operator" note) and the `gen_random_uuid()` DEFAULT precedent from `048`/`055`.

**Convention to copy** — every migration in this repo opens with a comment block explaining what/why, and ends with a note that migrations are applied LIVE by the operator, not auto-pushed:
```sql
-- Migration 060: driver_assignments permanent trip_token (Phase 66, DTRIP-01/02/08)
--
-- Adds a NEW trip_token uuid column, separate from the existing single-use
-- `token` (accept/decline) column. DEFAULT gen_random_uuid() means Postgres
-- backfills every existing row's trip_token in the same ALTER TABLE
-- statement — no explicit UPDATE needed (D-12).
--
-- Applied LIVE by the operator (this repo's established convention — no
-- migrations are auto-pushed).

ALTER TABLE driver_assignments
  ADD COLUMN trip_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS driver_assignments_trip_token_idx
  ON driver_assignments (trip_token);
```

**Critical pitfall to avoid** (from migration 059's own history, cited in RESEARCH.md): this migration does NOT touch any `SECURITY DEFINER` RPC, so the "DROP+CREATE re-grants PUBLIC EXECUTE" gotcha does not apply here — a plain `ADD COLUMN` needs no `REVOKE`/`GRANT` lines. Do not add any RPC to this migration; if a future migration adds one, it MUST end with `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated;` then `GRANT ... TO service_role;` exactly like 059's tail.

---

### `app/driver/trip/[token]/page.tsx` (route, request-response, NEW)

**Analog:** `app/driver/response/page.tsx` (full file read — 283 lines, exact structural template)

**Imports pattern** (lines 1-4 of analog):
```typescript
import type { Metadata } from 'next'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { czkToEur, formatCZK, formatEUR } from '@/lib/currency'
import DriverResponseClient from './DriverResponseClient'
```
For the trip sheet, swap the client-island import for a map component (or omit if server-only render is chosen) and keep the rest identical.

**noindex metadata pattern** (lines 6-8, D-08 — copy verbatim, this satisfies DTRIP-02's noindex requirement exactly):
```typescript
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```

**Token param pattern** — analog uses `searchParams` (query-param style); Phase 66 uses a path param per D-09/Discretion, so adapt the prop shape:
```typescript
// Analog (query-param):
interface PageProps {
  searchParams: Promise<{ token?: string; action?: string }>
}
// New (path-param):
interface PageProps {
  params: Promise<{ token: string }>
}
```

**Uniform invalid-token lookup + validity check pattern** (lines 64-91 of analog — this is the exact shape to replicate for D-03/D-11, just with a different predicate):
```typescript
export default async function DriverResponsePage({ searchParams }: PageProps) {
  const { token } = await searchParams
  if (!token) return <InvalidTokenView />

  const supabase = createSupabaseServiceClient()

  const { data: assignment, error: assignmentError } = await supabase
    .from('driver_assignments')
    .select('id, status, token_used_at, token_expires_at, booking_id, driver_id')
    .eq('token', token)
    .single()

  if (assignmentError || !assignment) {
    return <InvalidTokenView />
  }

  const isValid =
    !assignment.token_used_at && new Date(assignment.token_expires_at) > new Date()

  if (!isValid) {
    return <InvalidTokenView />
  }
  // ... proceed to fetch booking + driver, render
}
```
For the trip sheet, replace the `token_used_at`/`token_expires_at` predicate with D-03's predicate (join to `bookings`, compare `driver_id`, check non-terminal status) — see RESEARCH.md Pattern 1 for the exact join query shape (`.select('id, driver_id, bookings!inner(*), drivers(name, phone, vehicle_info)').eq('trip_token', token).single()`), and the terminal-status set sourced from `lib/booking-transitions.ts` (`completed`, `cancelled` — the two keys with empty arrays in `VALID_TRANSITIONS`). **Do not fetch `lib/booking-transitions.ts`'s empty-array keys dynamically at runtime with a loop** — hardcode the two-element `Set(['completed', 'cancelled'])` as RESEARCH.md's Pattern 1 does, since that is the exact literal check already established.

**Invalid-view component pattern** (lines 14-62, `InvalidTokenView` — copy layout structure, change copy per D-11):
```typescript
function InvalidTokenView() {
  return (
    <main style={{ background: 'var(--anthracite)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'var(--font-montserrat)' }}>
      <div style={{ background: 'var(--anthracite-mid)', border: '1px solid var(--anthracite-light)', borderRadius: '2px', maxWidth: '480px', width: '100%', padding: '32px 48px' }}>
        <div className="wordmark" style={{ marginBottom: '32px', display: 'block', textAlign: 'center' }}>
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
        </div>
        <p style={{ color: 'var(--warmgrey)', fontSize: '14px', fontWeight: 300, lineHeight: 1.75, textAlign: 'center', letterSpacing: '0.03em' }}>
          This trip link is no longer active.
        </p>
      </div>
    </main>
  )
}
```
D-11 requires this SAME copy/component for BOTH "token unknown" and "token invalidated" — do not add a second variant.

**Trip detail grid pattern** (lines 233-275 — the label/value two-column grid to extend for D-06's larger field set):
```typescript
const labelStyle = { fontSize: '13px', fontWeight: 300, letterSpacing: '0.25em', textTransform: 'uppercase' as const, color: 'var(--copper-light)' }
const valueStyle = { fontSize: '13px', fontWeight: 300, color: 'var(--offwhite)', letterSpacing: '0.03em' }

<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '32px' }}>
  <span style={labelStyle}>Date</span>
  <span style={valueStyle}>{booking.pickup_date}</span>
  {/* ...repeat per field... */}
</div>
```
Extend this grid with: flight info, booking reference (prominent per D-05 — model like the booking-reference box in `lib/email.ts` lines 1446-1449, not just a grid row), vehicle class (via `formatVehicleLabel()`, export it from `lib/email.ts` per Don't-Hand-Roll), driver name/phone, and `drivers.vehicle_info` (Pitfall 4 — show both class AND vehicle_info, distinctly labeled).

**Heading/wordmark pattern** (lines 195-217, D-05 — reuse verbatim, change the `<h1>` text to "Trip Sheet" and add the booking reference prominently):
```typescript
<div className="wordmark" style={{ marginBottom: '32px', display: 'block', textAlign: 'center' }}>
  <span className="wordmark-presti">PRESTI</span>
  <span className="wordmark-go">GO</span>
</div>
<h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '28px', fontWeight: 300, lineHeight: 1.2, color: 'var(--offwhite)', letterSpacing: '0.05em', marginBottom: '8px' }}>
  Trip Sheet
</h1>
```

---

### `app/driver/trip/[token]/TripSheetMap.tsx` (component, D-07 embedded map, NEW — optional file, may inline into page.tsx client island)

**Analog:** `components/booking/RouteMap.tsx` (imports + props read, lines 1-160 read this session)

**Props shape to reuse as-is:**
```typescript
interface RouteMapProps {
  origin: PlaceResult | null       // { address, placeId, lat, lng } — use placeId: '' (unused by component)
  destination: PlaceResult | null
  pickupTime?: string | null       // 24h HH:MM
}
```

**Loader singleton pattern** (lines 11-26 — copy verbatim if building a new map wrapper, or just import `RouteMap` directly and skip re-implementing this):
```typescript
let mapsLoaderPromise: Promise<void> | null = null
function ensureMapsLibraryLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) return Promise.resolve()
  if (mapsLoaderPromise) return mapsLoaderPromise
  setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, libraries: ['maps', 'places', 'routes'], v: 'weekly' })
  mapsLoaderPromise = importLibrary('maps').then(() => undefined)
  return mapsLoaderPromise
}
```

**Recommendation: do not build a new map component — import `RouteMap` directly** from `components/booking/RouteMap.tsx` and pass `PlaceResult`-shaped objects built from `bookings.origin_lat/origin_lng/destination_lat/destination_lng` (all nullable — Pitfall 3: pass `null` through when a coordinate is missing rather than `{lat:0,lng:0}`, letting `RouteMap`'s existing "Route unavailable" empty state handle it).

**Attribution safety confirmed:** `RouteMap.tsx` does not call any attribution-hiding CSS/`disableDefaultUI` flag that removes the Google logo — safe to reuse per project memory's ToS-risk warning. Do NOT reuse `components/RoutesMap.tsx` (the homepage map) — flagged in RESEARCH.md and project memory as the attribution-risk component.

---

### `app/api/admin/bookings/[id]/assign/route.ts` (controller, request-response, MODIFY existing)

**Analog:** itself — extend in place, following its own established conventions.

**Auth guard pattern** (lines 23-26 — already present, unchanged):
```typescript
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**Insert select-list extension needed** (line 73 — RESEARCH.md flags this exact edit):
```typescript
// Before:
.select('id, driver_id, status, token')
// After:
.select('id, driver_id, status, token, trip_token')
```

**Email URL construction pattern to extend** (lines 172-193 — add `tripUrl` alongside `acceptUrl`/`declineUrl`):
```typescript
if (allowed) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rideprestigo.com'
  const acceptUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=accepted`
  const declineUrl = `${siteUrl}/driver/response?token=${assignment.token}&action=declined`
  const tripUrl = `${siteUrl}/driver/trip/${assignment.trip_token}`   // NEW

  after(() => sendDriverAssignmentEmail({
    // ...existing fields...
    acceptUrl,
    declineUrl,
    tripUrl,
  }).catch(err => console.error('[driver-assign]:', err)))
}
```

**SEC-18 comment convention to preserve** — the response payload deliberately omits raw tokens (line 203): `// SEC-18: token omitted — used only server-side for email URL, must not be returned to browser`. `trip_token` is DIFFERENT — it must be exposed to the admin (D-10 copy-link control needs it), so add it to the `assignment/route.ts` GET response instead (see next section), not to this POST response.

---

### `app/api/admin/bookings/[id]/assignment/route.ts` (controller, request-response, MODIFY existing)

**Analog:** itself — full file is 31 lines, single targeted edit.

**Current select to extend** (line 22):
```typescript
// Before:
.select('id, driver_id, status, created_at, drivers(name, email)')
// After:
.select('id, driver_id, status, created_at, trip_token, drivers(name, email)')
```
This is the ONLY change needed — `trip_token` becomes available to `DriverAssignmentSection.tsx` for the "copy link" control, and this is a GET/read-only endpoint so no CSRF-list entry is needed (per RESEARCH.md Security Domain: CSRF only guards mutation methods).

---

### `lib/email.ts` — `DriverAssignmentEmailData` / `buildDriverAssignmentHtml` / `sendDriverAssignmentEmail` (service/utility, transform, MODIFY existing)

**Analog:** itself (lines 1403-1512 read this session — interface, HTML builder, send function).

**Interface extension** (lines 1403-1418):
```typescript
export interface DriverAssignmentEmailData {
  driverName: string
  driverEmail: string
  bookingReference: string
  pickupDate: string
  pickupTime: string
  originAddress: string
  destinationAddress: string
  passengerFirstName: string
  passengerLastName: string
  passengerPhone: string
  driverPriceCzk: number | null
  specialRequests?: string | null
  acceptUrl: string
  declineUrl: string
  tripUrl: string   // NEW — D-10
}
```

**CTA button block pattern to extend** (lines 1488-1492 — add a third button/link for the trip sheet, following the exact same inline-style convention as accept/decline):
```typescript
<div style="text-align: center; padding: 24px 32px; display: flex; gap: 16px; justify-content: center;">
  <a href="${escapeHtml(data.acceptUrl)}" style="display: inline-block; border: 1px solid #BFA06A; color: #BFA06A; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Inter', Arial, sans-serif; margin-right: 12px;">ACCEPT TRIP</a>
  <a href="${escapeHtml(data.declineUrl)}" style="display: inline-block; border: 1px solid #CC3333; color: #CC3333; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Inter', Arial, sans-serif;">DECLINE TRIP</a>
</div>
```
Add a `<a href="${escapeHtml(data.tripUrl)}" ...>VIEW TRIP SHEET</a>` in the same block or as a separate line below, using the neutral gold/border style (not the red decline style).

**escapeHtml convention** — every interpolated value in this file's HTML builders is wrapped in `escapeHtml(...)` (visible throughout lines 1448-1496); apply the same to `data.tripUrl`.

**formatVehicleLabel export needed** (line 67, currently module-private):
```typescript
function formatVehicleLabel(vehicleClass: string): string {
```
Per RESEARCH.md Don't-Hand-Roll: change to `export function formatVehicleLabel(...)` so the trip-sheet page can import and reuse it rather than duplicating the class→label mapping.

---

### `components/admin/DriverAssignmentSection.tsx` (component, request-response, MODIFY existing)

**Analog:** itself — full file read (303 lines); extend the `mode === 'assigned'` render branch.

**Assignment type to extend** (lines 11-19 — add `trip_token`):
```typescript
interface Assignment {
  id: string
  driver_id: string
  status: string
  trip_token: string   // NEW — D-10
  drivers: {
    name: string
    email: string
  }
}
```

**"assigned" branch pattern to extend** (lines 213-242 — insert a "Copy link" button next to the existing Reassign button, reusing the same `reassignButtonStyle`-family inline-style convention and hover handlers):
```typescript
if (mode === 'assigned' && assignment) {
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={sectionLabelStyle}>Driver</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 300, color: 'var(--offwhite)' }}>
          {assignment.drivers?.name ?? 'Unknown driver'}
        </span>
        <StatusBadge variant={getStatusBadgeVariant(assignment.status)} label={assignment.status} />
        <button onClick={handleCopyTripLink} style={reassignButtonStyle} /* same hover pattern as Reassign */>
          Copy Link
        </button>
        <button onClick={handleReassign} style={reassignButtonStyle}>
          Reassign
        </button>
      </div>
    </div>
  )
}
```
`handleCopyTripLink` should build `${window.location.origin}/driver/trip/${assignment.trip_token}` and call `navigator.clipboard.writeText(...)`, following the same async-handler style as `handleAssign` (try/catch, no loading state needed for a synchronous clipboard call — a brief mode flag can show "Copied" feedback if desired, mirroring the `mode === 'submitting'` pattern already in this file).

**Data-fetch pattern already covers `trip_token`** (lines 43-58) — no change needed here beyond the `Assignment` interface, since the existing `fetch(`/api/admin/bookings/${bookingId}/assignment`)` call already lands the full row into `setAssignment(data.assignment)`; once the API route (above) selects `trip_token`, it flows through automatically.

## Shared Patterns

### Uniform invalid-token / no-enumeration response
**Source:** `app/driver/response/page.tsx` `InvalidTokenView()` + `app/api/driver/respond/route.ts` lines 40-47 (`return NextResponse.json({ error: 'invalid_token' }, { status: 400 })` for BOTH not-found and expired/used cases)
**Apply to:** `app/driver/trip/[token]/page.tsx` — same neutral response for unknown token AND invalidated token (D-11); do not add distinguishing branches.

### Service-role Supabase client for public token-gated reads
**Source:** `createSupabaseServiceClient()` — used identically in `app/driver/response/page.tsx:71` and `app/api/driver/respond/route.ts:31`
```typescript
import { createSupabaseServiceClient } from '@/lib/supabase'
const supabase = createSupabaseServiceClient()
```
**Apply to:** `app/driver/trip/[token]/page.tsx` (bypasses RLS for the public/unauthenticated driver-facing route, same trust model as `/driver/response`).

### noindex metadata export
**Source:** `app/driver/response/page.tsx:6-8`
```typescript
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```
**Apply to:** `app/driver/trip/[token]/page.tsx` (D-08, mandatory).

### Admin auth guard order
**Source:** `app/api/admin/bookings/[id]/assign/route.ts:23-26` and `assignment/route.ts:9-12`
```typescript
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
**Apply to:** Any new/modified admin-facing route in this phase (none of this phase's new endpoints are admin-mutating beyond the two already-guarded routes being extended).

### Zod two-step parse (JSON.parse try/catch, then safeParse)
**Source:** `app/api/driver/respond/route.ts:18-28` and `assign/route.ts:32-42`
```typescript
let body: unknown
try {
  body = await request.json()
} catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}
const parsed = someSchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
}
```
**Apply to:** Not directly needed by this phase (no new POST endpoint is planned — the trip-sheet page is a GET-only server component per RESEARCH.md's Open Question 1 recommendation), but if the planner surfaces a dedicated copy-link API route instead of client-side URL construction, this is the pattern to use, plus token-shape validation (`z.string().uuid()`) mirroring `respondSchema` at `app/api/driver/respond/route.ts:7-10`.

### Migration comment-header + "applied live by operator" convention
**Source:** `supabase/migrations/059_admin_search_bookings_sort.sql:1-27` (header block) and its closing note about live application
**Apply to:** `supabase/migrations/060_driver_assignments_trip_token.sql`.

## No Analog Found

None — every file in this phase's scope has a direct or role-matched analog already in the codebase (confirmed by RESEARCH.md's own conclusion: "every mechanism this phase needs already has exactly one established implementation elsewhere in this codebase").

## Metadata

**Analog search scope:** `app/driver/`, `app/api/driver/`, `app/api/admin/bookings/[id]/`, `components/booking/`, `components/admin/`, `lib/email.ts`, `lib/booking-transitions.ts`, `supabase/migrations/` (059, 055, 048)
**Files scanned:** 7 analog files fully read (response page, respond route, DriverAssignmentSection, assign route, assignment route, RouteMap, email.ts driver-assignment section) + 1 migration read for convention
**Pattern extraction date:** 2026-08-31
