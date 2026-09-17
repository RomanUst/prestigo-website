# Phase 67: Driver Trip Portal — Status Marking, Notes & Admin Visibility - Pattern Map

**Mapped:** 2026-09-02
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/061_driver_assignments_trip_progress.sql` | migration | CRUD (schema) | `supabase/migrations/060_driver_assignments_trip_token.sql` | exact |
| `app/api/driver/trip/[token]/progress/route.ts` (NEW) | route (API) | request-response / CRUD write | `app/api/driver/respond/route.ts` | exact |
| `app/driver/trip/[token]/TripProgressClient.tsx` (NEW) | component (client island) | request-response | `app/driver/response/DriverResponseClient.tsx` | exact |
| `app/driver/trip/[token]/page.tsx` (EXTEND) | route (server component) | request-response | itself (Phase 66, already read) — pattern of mounting a client island unchanged | exact (self) |
| `middleware.ts` (EXTEND) | config | request-response (CSRF gate) | itself — `CSRF_PROTECTED_PREFIXES` array, add one string | exact (self) |
| `lib/rate-limit.ts` (EXTEND) | utility | request-response | itself — `LIMITS` map, add one key | exact (self) |
| `app/api/admin/bookings/[id]/assignment/route.ts` (EXTEND) | route (API) | request-response / CRUD read | itself — one-line select-list extension (exact precedent: Phase 66 Plan 02 already did this once for `trip_token`) | exact (self) |
| `components/admin/DriverAssignmentSection.tsx` (EXTEND) | component (admin, client) | request-response (re-fetch-on-expand) | itself — extend `Assignment` interface + render in `mode === 'assigned'` branch | exact (self) |
| `tests/driver-trip-progress.test.ts` (NEW) | test | — | `tests/driver-trip.test.ts` (existing conventions: `vi.hoisted`, Supabase mock shape) | exact |

## Pattern Assignments

### `supabase/migrations/061_driver_assignments_trip_progress.sql` (migration)

**Analog:** `supabase/migrations/060_driver_assignments_trip_token.sql` (Phase 66 — additive column pattern) and `059_admin_search_bookings_sort.sql` (DROP+CREATE+REVOKE convention — NOT needed here since this is a plain `ADD COLUMN`, no RPC touched).

**Pattern to copy** — plain additive columns, TEXT + CHECK convention (not a Postgres ENUM), comment block explaining isolation rationale:
```sql
ALTER TABLE driver_assignments
  ADD COLUMN trip_progress text NULL
    CHECK (trip_progress IS NULL OR trip_progress IN
      ('en_route', 'arrived', 'on_board', 'completed', 'no_show')),
  ADD COLUMN trip_note text NULL,
  ADD COLUMN trip_updated_at timestamptz NULL;
```
Confirmed next migration number: **061** (`ls supabase/migrations` tail: ...058, 059, 060 exist; 061 is next). No REVOKE/GRANT needed (no SECURITY DEFINER RPC touched by this migration) — contrast with 059's DROP+CREATE+REVOKE dance.

---

### `app/api/driver/trip/[token]/progress/route.ts` (route, request-response, NEW)

**Analog:** `app/api/driver/respond/route.ts` (full file read this session, 46 lines)

**Imports pattern** (lines 1-5):
```typescript
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendDriverDeclineNotification } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
```
New route needs: `NextResponse` from `next/server`, `z` from `zod`, `createSupabaseServiceClient` from `@/lib/supabase`, `checkRateLimit`/`getClientIp` from `@/lib/rate-limit`, and `isTripLinkValid` from `@/lib/trip-token` (NOT in the analog — new for this route). **Must NOT import** `@/lib/gnet-client` or anything from `@/lib/booking-transitions` — this is the literal DTRIP-04 enforcement mechanism (grep-verifiable, `grep -c "gnet-client\|VALID_TRANSITIONS\|booking-transitions" <file>` must return `0`).

**Rate-limit + parse pattern** (lines 11-28):
```typescript
export async function POST(request: Request) {
  const { allowed } = await checkRateLimit('/api/driver/respond', getClientIp(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }
```
Note: `checkRateLimit` takes a **fixed logical path string** as its key, not `request.url`/`nextUrl.pathname` — new route must pass a literal like `'/api/driver/trip/progress'`, and add a matching key to `LIMITS` in `lib/rate-limit.ts` (see below). Passing the dynamic `[token]`-containing URL would silently give every token its own rate-limit bucket.

**Lookup + uniform-invalid-token pattern** (lines 30-45):
```typescript
  const { data: assignment, error: lookupError } = await supabase
    .from('driver_assignments')
    .select('id, booking_id, driver_id, status, token_used_at, token_expires_at')
    .eq('token', token)
    .single()

  if (lookupError || !assignment) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }
```
New route re-uses this uniform-`invalid_token`-on-every-failure shape but looks up by `trip_token` (not `token`) and validates via `isTripLinkValid()` from `lib/trip-token.ts` (read this session by the researcher; header comment: "reused by app/driver/trip/[token]/page.tsx (Plan 01) and Phase 67" — literally written for this reuse). Join shape needed: `.select('id, driver_id, bookings!inner(driver_id, status)')` — cast the joined `bookings` result through an explicit interface (do not use `any`) exactly as `page.tsx`'s `TripSheetAssignmentRow`/`TripSheetBookingRow` do, since `createSupabaseServiceClient()` is not `Database`-generic anywhere in this codebase (same type-inference workaround Phase 66 already solved once).

**Update pattern (non-clobber field-by-field)** — `app/api/driver/respond/route.ts` lines 47-58 write the whole object in one shot since it only ever sets 2 fields; the new route needs the **non-clobber** convention instead (documented in STATE.md Phase 65 log — "PATCH .update() built field-by-field from parsed.data, only present keys"):
```typescript
const updatePayload: Record<string, unknown> = { trip_updated_at: new Date().toISOString() }
if (parsed.data.progress !== undefined) updatePayload.trip_progress = parsed.data.progress
if (parsed.data.note !== undefined) updatePayload.trip_note = parsed.data.note

const { error: updateError } = await supabase
  .from('driver_assignments')
  .update(updatePayload)
  .eq('id', assignment.id)
```
**Absolute constraints for this file (DTRIP-04):** only `.update()` call target is `driver_assignments`; never `.from('bookings')`. Zero references to `gnet-client`/`VALID_TRANSITIONS`/`booking-transitions`.

**Zod schema shape** (new — no analog for `.refine()` at-least-one, but matches `respondSchema`'s enum-closed style):
```typescript
const TRIP_PROGRESS_VALUES = ['en_route', 'arrived', 'on_board', 'completed', 'no_show'] as const
const progressSchema = z.object({
  progress: z.enum(TRIP_PROGRESS_VALUES).optional(),
  note: z.string().max(2000).optional(),
}).refine(d => d.progress !== undefined || d.note !== undefined, { message: 'At least one of progress or note must be provided' })
```
`note` validation matches `special_requests`' exact shape elsewhere in the codebase (`z.string().max(1000).optional()` at `app/api/admin/bookings/route.ts:893` — no CRLF/header-injection regex needed since it's never used in an email header, only rendered as JSX text, React auto-escapes).

---

### `app/driver/trip/[token]/TripProgressClient.tsx` (component, client island, NEW)

**Analog:** `app/driver/response/DriverResponseClient.tsx` (full file read this session)

**Full shape to copy — client component skeleton** (lines 1-33):
```typescript
'use client'

import { useState } from 'react'

interface DriverResponseClientProps {
  token: string
  initialAction?: 'accepted' | 'declined'
}

type SubmitState = 'idle' | 'submitting' | 'done' | 'error'

export default function DriverResponseClient({ token }: DriverResponseClientProps) {
  const [state, setState] = useState<SubmitState>('idle')
  const [confirmedAction, setConfirmedAction] = useState<'accepted' | 'declined' | null>(null)

  async function handleAction(action: 'accepted' | 'declined') {
    setState('submitting')
    try {
      const res = await fetch('/api/driver/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      })
      const json = await res.json()
      if (json.ok) {
        setConfirmedAction(action)
        setState('done')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  const isSubmitting = state === 'submitting'
  ...
```
New component: props become `{ token, initialProgress, initialNote }`; state tracks `progress`/`note`/`state: SubmitState`; POST target becomes `/api/driver/trip/${token}/progress` with body `{ progress: next }` or `{ note }`. Keep the identical `try { fetch → json → json.ok check } catch { setState('error') }` shape — this is the established error-handling convention for driver-facing client fetches in this codebase. Inline styles (not Tailwind classes) match the dark-theme trip-sheet styling per D-06 — copy the analog's inline `style={{...}}` object convention rather than introducing a new styling approach.

**Mount site in `page.tsx`:** the server component must extend its existing join query to also `SELECT trip_progress, trip_note` from `driver_assignments`, then pass them as `initialProgress`/`initialNote` props to `<TripProgressClient>` — no second round-trip fetch needed on page load. This mirrors how `page.tsx` currently already selects and passes other assignment fields (read this session by the researcher).

---

### `middleware.ts` (EXTEND)

**Analog:** itself — `CSRF_PROTECTED_PREFIXES` array (lines 7-14, read this session):
```typescript
const CSRF_PROTECTED_PREFIXES = [
  '/api/admin',
  '/api/submit-quote',
  '/api/contact',
  '/api/create-payment-intent',
  '/api/calculate-price',
  '/api/driver/respond',
]
```
**Required change:** add the new route's prefix, e.g. `'/api/driver/trip'`, as a new array entry. This is an **explicit allowlist**, not a wildcard on `/api/driver` — the new route is NOT auto-covered without this edit (Pitfall 3 in RESEARCH.md). Do NOT touch `isDynamicPath` — `/api/*` is already covered there. `/api/driver/trip` is NOT currently in `CSRF_STRICT_ORIGIN_REQUIRED` territory (only `/api/admin` and `/api/create-payment-intent` are strict) — match `/api/driver/respond`'s precedent (not strict) unless there's a reason to diverge.

---

### `lib/rate-limit.ts` (EXTEND)

**Analog:** itself — `LIMITS` map (line 21) and the existing `/api/driver/respond` entry (line 32):
```typescript
const LIMITS: Record<string, number> = {
  ...
  '/api/driver/respond':         10, // SEC-02: prevent token oracle enumeration
  ...
}
```
**Required change:** add a new entry with a fixed logical key (NOT the dynamic URL), e.g.:
```typescript
'/api/driver/trip/progress':   20, // Phase 67: driver may tap through multiple progress states + note
```
`checkRateLimit(pathname, ip)` keys its sliding-window store by the **literal string passed in** (`lib/rate-limit.ts:182 — const limit = LIMITS[pathname]`) — the route handler must pass this exact fixed string, never `request.nextUrl.pathname` (which would include the dynamic `[token]` segment and defeat rate limiting entirely — Pitfall 5).

---

### `app/api/admin/bookings/[id]/assignment/route.ts` (EXTEND)

**Analog:** itself (full file read this session, 29 lines) — exact literal precedent from Phase 66 Plan 02, which already did an identical one-line select-list edit to expose `trip_token`.

**Current select** (line 22):
```typescript
.select('id, driver_id, status, created_at, trip_token, drivers(name, email)')
```
**Required change:**
```typescript
.select('id, driver_id, status, created_at, trip_token, trip_progress, trip_note, trip_updated_at, drivers(name, email)')
```
No other change needed in this file — auth guard (`getAdminUser()`), query shape (`.eq('booking_id', bookingId).order(...).limit(1).maybeSingle()`), and response shape (`{ assignment: data }`) all stay identical.

---

### `components/admin/DriverAssignmentSection.tsx` (EXTEND)

**Analog:** itself (full file read this session) — `Assignment` interface (lines 12-20) and `mode === 'assigned'` render branch.

**Current `Assignment` interface** (lines 12-20):
```typescript
interface Assignment {
  id: string
  driver_id: string
  status: string
  trip_token: string
  drivers: {
    name: string
    email: string
  }
}
```
**Required change:** add `trip_progress: string | null`, `trip_note: string | null`, `trip_updated_at: string | null` to this interface.

**Fetch pattern already re-fetches on every row expand** (lines 46-65, `useEffect` in `loadData()`):
```typescript
const assignRes = await fetch(`/api/admin/bookings/${bookingId}/assignment`)
if (!cancelled) {
  if (assignRes.ok) {
    const data = await assignRes.json()
    setAssignment(data.assignment)
    setMode(data.assignment ? 'assigned' : 'no-assignment')
  } else {
    setMode('no-assignment')
  }
}
```
No fetch-logic change needed — the new fields ride along automatically once the GET route's select-list is extended (see above). Only a **render addition** is needed in the `mode === 'assigned'` JSX branch: a trip-progress badge (reuse `StatusBadge` import already present, or a new `TRIP_PROGRESS_LABELS` map mirroring `STATUS_LABELS` in `components/admin/BookingsTable.tsx:83-92`) + note text + "last updated" timestamp, placed next to the existing driver name / Copy Trip Link row. `getStatusBadgeVariant()` (lines 32-35) is the existing label-mapping convention to mirror for a parallel `getTripProgressBadgeVariant()` if a colored badge is wanted; `components/admin/StatusBadge.tsx`'s variant union may need extending if reused directly for trip-progress values (`'arrived'|'on_board'|'no_show'` are not in the current union — confirm via reading `StatusBadge.tsx` at plan time).

---

## Shared Patterns

### Uniform invalid-token response (never differentiate rejection reason)
**Source:** `app/api/driver/respond/route.ts` — every failure path (`lookupError`, `!assignment`, expired, used) returns the identical `{ error: 'invalid_token' }` / 400.
**Apply to:** `app/api/driver/trip/[token]/progress/route.ts` — the write-path re-check via `isTripLinkValid()` must return this same uniform shape for every rejection reason (unknown token, malformed UUID, terminal booking status, reassigned driver).

### Rate limit + CSRF for unauthenticated token-gated mutation routes
**Source:** `lib/rate-limit.ts` `LIMITS` map + `middleware.ts` `CSRF_PROTECTED_PREFIXES` array.
**Apply to:** any new `/api/driver/*` write route — both files require an explicit new entry; neither is automatic.

### Non-clobber field-by-field `.update()`
**Source:** documented convention in STATE.md Phase 65 log; concretely demonstrated pattern shape (build `updatePayload` from only present keys, never spread the whole parsed body).
**Apply to:** `app/api/driver/trip/[token]/progress/route.ts` — `progress` and `note` are independently optional (DTRIP-06), so the update payload must only include keys actually present in the parsed body.

### Isolation-by-omission (DTRIP-04, the hard constraint)
**Source:** `app/api/admin/bookings/route.ts:342-387` (the ONE place `bookings.status` is written, admin-gated) and `:454-510` (the ONE GNet push site, gated behind `booking_source === 'gnet'` and an actual status change).
**Apply to:** the new driver-facing write route must be structurally unable to reach either — no import of `@/lib/gnet-client` or `@/lib/booking-transitions`, no `.from('bookings')` anywhere in the file. This is a grep-verifiable acceptance criterion, not just a code-review note.

## No Analog Found

None — every file this phase touches has either a direct precedent (`app/api/driver/respond/route.ts`, `app/driver/response/DriverResponseClient.tsx`, `060_driver_assignments_trip_token.sql`) or is a self-extension of a file whose current shape is the pattern to preserve (`middleware.ts`, `lib/rate-limit.ts`, the admin assignment GET route, `DriverAssignmentSection.tsx`).

## Metadata

**Analog search scope:** `app/api/driver/`, `app/driver/`, `app/api/admin/bookings/`, `components/admin/`, `supabase/migrations/`, `lib/rate-limit.ts`, `middleware.ts` — all read directly this session (files listed in RESEARCH.md's Sources section were re-confirmed via targeted `Read`/grep rather than re-derived).
**Files scanned:** 9 (7 pattern-mapped + `lib/trip-token.ts` + `types/database.types.ts`, both referenced but not separately excerpted since RESEARCH.md already captured the relevant lines).
**Pattern extraction date:** 2026-09-02
</content>
