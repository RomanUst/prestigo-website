# Phase 65: Dispatch — Future-First Bookings List - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 9 (5 modified, 2–3 new helpers/tests, 2 new migrations)
**Analogs found:** 9 / 9 (this is a pure brownfield extension — every touch point already exists in-repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/058_*.sql` (new) | migration | schema | `supabase/migrations/047_customer_profiles_profile_fields.sql` (ALTER ADD COLUMN + CHECK) | role-match |
| `supabase/migrations/059_*.sql` (new) | migration | schema (RPC) | `supabase/migrations/054_admin_search_bookings_status_filter.sql` (self — same RPC, prior param add) | exact |
| `app/api/admin/settings/route.ts` (modify) | route | request-response / CRUD | self (the `notification_flags` GET/PATCH already in the file) | exact |
| `app/api/admin/bookings/route.ts` (modify) | route | request-response / CRUD | self (`KNOWN_STATUSES` whitelist + `.rpc()` call already in GET, L213-267) | exact |
| `components/admin/BookingsTable.tsx` (modify) | component | request-response | self (`statusFilter`/`showDateFilter` state + `fetchBookings`, L1041-1277) | exact |
| `app/admin/(dashboard)/bookings/page.tsx` (modify) | component (page) | request-response | self (KPI fetches L36-61 — keep decoupled) | exact |
| `app/admin/(dashboard)/settings/page.tsx` (modify) | component (page) | request-response | self (server fetch → pass props to widget, L4-52) | exact |
| Dispatch-horizon Settings widget (new component) | component | request-response | `components/admin/NotificationToggles.tsx` (client widget PATCHing `/api/admin/settings`) | role-match |
| `lib/prague-date.ts` (new) + `tests/*` | utility | transform | inline `getMonday`/`toISOString().split('T')[0]` in `bookings/page.tsx` L7,38 | partial |

## Pattern Assignments

### `supabase/migrations/059_*.sql` (migration, RPC adaptive sort)

**Analog:** `supabase/migrations/054_admin_search_bookings_status_filter.sql` (the same RPC — copy its structure verbatim and add ONE `p_sort` param).

**Signature-change discipline** (054 lines 26-40 + 87 — DROP exact old signature, CREATE, re-GRANT):
```sql
DROP FUNCTION IF EXISTS public.admin_search_bookings(text, text, text, text, text, integer, integer);
-- ... CREATE OR REPLACE FUNCTION ... SECURITY DEFINER SET search_path TO 'public','pg_temp' ...
GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, text, text, text, text, text, integer, integer) TO service_role;
```
- DROP targets the **current live 7-arg signature** (054's, with `p_status`), NOT the pre-054 6-arg shape.
- Only `service_role` is re-granted; per migration 057 `PUBLIC`/`anon`/`authenticated` were already revoked — do NOT re-grant them.
- Live apply is a `[BLOCKING]` operator step (user runs the SQL), not an MCP auto-apply.

**Sort must change in TWO places (Pitfall 1)** — the current 054 body has both a `paged` CTE `ORDER BY created_at DESC` (L73-79) AND a `jsonb_agg(... ORDER BY paged.created_at DESC)` (L81). Both must carry the identical adaptive `CASE` expression:
```sql
ORDER BY
  CASE WHEN p_sort = 'pickup_asc'  THEN pickup_date END ASC,
  CASE WHEN p_sort = 'pickup_desc' THEN pickup_date END DESC,
  created_at DESC   -- tiebreak / 'created_desc' default
```
- Use static `CASE`, never dynamic `EXECUTE 'ORDER BY '||p_sort` (SQL-injection surface inside SECURITY DEFINER).
- `p_sort text DEFAULT 'created_desc'` preserves pre-phase behavior for any caller that omits it.
- Preserve the existing `p_limit` clamp `IF p_limit > 100 THEN p_limit := 100` (054 L45-47) as the DoS pattern.

---

### `supabase/migrations/058_*.sql` (migration, pricing_globals columns)

**Analog:** `ALTER TABLE ... ADD COLUMN ... CHECK` pattern (project precedent = TEXT+CHECK over Postgres ENUM, per STATE.md `customer_profiles.account_type`).

```sql
ALTER TABLE public.pricing_globals
  ADD COLUMN dispatch_default_horizon text NOT NULL DEFAULT 'future'
    CHECK (dispatch_default_horizon IN ('future', 'last_n_days', 'all')),
  ADD COLUMN dispatch_horizon_days integer NOT NULL DEFAULT 7
    CHECK (dispatch_horizon_days > 0);
```
Shipped default `'future'` is load-bearing (D-03: DISP-01 must hold on first load). `pricing_globals` is id=1 single-row.

---

### `app/api/admin/settings/route.ts` (route, extend GET + PATCH)

**Analog:** self — the file's existing `notification_flags` handlers.

**Imports / auth-guard order** (lines 1-14 — copy exactly, guard BEFORE any parse):
```typescript
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'
// ...
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

**GET select+return** (lines 16-25) — extend the `.select()` and JSON body:
```typescript
const { data } = await supabase.from('pricing_globals')
  .select('notification_flags, dispatch_default_horizon, dispatch_horizon_days')
  .eq('id', 1).single()
return NextResponse.json({
  notification_flags: data.notification_flags,
  dispatch_default_horizon: data.dispatch_default_horizon,
  dispatch_horizon_days: data.dispatch_horizon_days,
})
```

**PATCH validation** (lines 7-9, 36-49) — extend the schema; keep the 400-on-parse-fail shape:
```typescript
const settingsPatchSchema = z.object({
  notification_flags: z.record(z.string(), z.boolean()).optional(),
  dispatch_default_horizon: z.enum(['future', 'last_n_days', 'all']).optional(),
  dispatch_horizon_days: z.number().int().min(1).max(365).optional(),
}).refine(d => d.notification_flags !== undefined
  || d.dispatch_default_horizon !== undefined
  || d.dispatch_horizon_days !== undefined,
  { message: 'At least one settings field must be provided' })
```
Build the `.update({...})` object only from the fields present in `parsed.data` (don't clobber `notification_flags` with undefined). `enforceMaxBody(request, 2_048)` stays.

---

### `app/api/admin/bookings/route.ts` (route, GET horizon resolution)

**Analog:** self — the GET handler at L213-267.

**Whitelist pattern** (mirror `KNOWN_STATUSES`, L231-232):
```typescript
const rawStatusFilter = searchParams.get('status')
const statusFilter = rawStatusFilter && KNOWN_STATUSES.has(rawStatusFilter) ? rawStatusFilter : null
```
New param follows this shape exactly:
```typescript
const KNOWN_HORIZONS = new Set(['future', 'past', 'all', 'last_n_days'])
const rawHorizon = searchParams.get('horizon')
const horizon = rawHorizon && KNOWN_HORIZONS.has(rawHorizon) ? rawHorizon : null
```

**Horizon → date-range + sort resolution** (new; server owns it — D-01 server-computed today). Preserve the existing manual `startDate`/`endDate` picker values as the base (Pitfall 5 / D-07 precedence):
```typescript
let resolvedStartDate = startDate ?? null
let resolvedEndDate = endDate ?? null
let sort = 'created_desc'
if (horizon) {
  const today = getPragueTodayISO()
  if (horizon === 'future')      { resolvedStartDate = today; sort = 'pickup_asc' }
  else if (horizon === 'past')   { resolvedEndDate = shiftIsoDate(today, -1); sort = 'pickup_desc' }
  else if (horizon === 'last_n_days') {
    const rawDays = parseInt(searchParams.get('horizonDays') ?? '7', 10)
    const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 7
    resolvedStartDate = shiftIsoDate(today, -days); sort = 'pickup_desc'   // D-06: unbounded end (future-inclusive)
  } else { sort = 'pickup_desc' } // 'all'
}
```

**RPC call** (L245-254 — add `p_sort`, feed resolved dates):
```typescript
const { data, error: dbError } = await supabase.rpc('admin_search_bookings', {
  p_query: boundedSearch,
  p_start_date: resolvedStartDate,
  p_end_date: resolvedEndDate,
  p_trip_type: tripType ?? null,
  p_status: statusFilter,
  p_sort: sort,
  p_offset: page * limit,
  p_limit: limit,
})
```
Return shape `{ bookings, total, page, limit }` unchanged (L261-266).

---

### `components/admin/BookingsTable.tsx` (component, segmented control)

**Analog:** self — existing filter state at L1041-1052 and `fetchBookings` at L1228-1277.

**State pattern** (L1045-1052) — add TWO distinct slots (D-03/D-04: persisted default read-only after mount, ephemeral override):
```typescript
const [statusFilter, setStatusFilter] = useState<string>('all')  // existing sibling
const [startDate, setStartDate] = useState('')
const [endDate, setEndDate] = useState('')
const [showDateFilter, setShowDateFilter] = useState(false)
// NEW:
// - accept persisted default via prop (from bookings/page.tsx): defaultHorizon, horizonDays
// - const [horizon, setHorizon] = useState(defaultHorizon)  // ephemeral, NEVER PATCHes settings
```

**fetch-param assembly** (L1231-1240) — append `horizon`/`horizonDays`, add `horizon` to the deps array (L1273):
```typescript
const params = new URLSearchParams()
params.set('page', String(page)); params.set('limit', String(limit))
if (startDate) params.set('startDate', startDate)
if (endDate) params.set('endDate', endDate)
if (tripType !== 'all') params.set('tripType', tripType)
if (statusFilter !== 'all') params.set('status', statusFilter)
if (debouncedSearch) params.set('search', debouncedSearch)
// NEW: params.set('horizon', horizon); if (horizon==='last_n_days') params.set('horizonDays', String(horizonDays))
const res = await fetch(`/api/admin/bookings?${params.toString()}`)
```
Segmented control renders like the existing `showDateFilter` toggle button styling (L1519-1521, copper active state). The control must never call `PATCH /api/admin/settings`.

---

### `app/admin/(dashboard)/bookings/page.tsx` (page, KPI decoupling guard)

**Analog:** self — KPI fetches at L36-61. **DO NOT MODIFY these two fetches (D-05/DISP-04).**
```typescript
fetch(`/api/admin/bookings?startDate=${todayISO}&endDate=${todayISO}&limit=1`)      // TODAY count
fetch(`/api/admin/bookings?startDate=${mondayISO}&endDate=${sundayISO}&limit=100`)  // week revenue
```
These must NEVER gain a `horizon` param and must never read from `BookingsTable`'s ephemeral segmented-control state. The only change here: fetch settings on mount (or in the parent server component) and pass `defaultHorizon`/`horizonDays` down as props to `<BookingsTable>`.

---

### Dispatch-horizon Settings widget (new client component)

**Analog:** `components/admin/NotificationToggles.tsx` — copy its structure (client component receiving `initial*` prop, optimistic PATCH to `/api/admin/settings`, dark-theme card).

**Props + optimistic PATCH pattern** (NotificationToggles L27-56):
```typescript
'use client'
interface Props { initialHorizon: string; initialDays: number }
// on change: setHorizon(next) optimistically, then:
const res = await fetch('/api/admin/settings', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dispatch_default_horizon: next }),
})
if (!res.ok) throw new Error('Save failed')  // revert on catch, show feedback for 2s
```
**Card styling** (NotificationToggles L67-83): `background: var(--anthracite-mid)`, `border: 1px solid var(--anthracite-light)`, uppercase 11px letter-spaced section header in `var(--font-montserrat)`, rows `minHeight: 44`.

Mount it in `app/admin/(dashboard)/settings/page.tsx` next to `<NotificationToggles>` (L49), passing `data.dispatch_default_horizon` / `data.dispatch_horizon_days` from the existing server fetch (L4-33).

---

### `lib/prague-date.ts` (new utility) + tests

No exact analog — the closest existing date-string logic is inline in `bookings/page.tsx` (`getMonday`, `toISOString().split('T')[0]`), but that is client-side and UTC-anchored. This new helper is server-only, Prague-aware, using built-in `Intl` (zero deps):
```typescript
export function getPragueTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now)
}
export function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
```
**Test analog:** `tests/admin-settings.test.ts` (`vi.hoisted` pattern, Vitest via `npx vitest run`). New `tests/prague-date.test.ts` (pure, DST/UTC-boundary) and `tests/admin-bookings-kpi-decoupling.test.tsx` (the concrete D-05 guard — assert KPI fetch call-count stays 2 across a horizon toggle).

## Shared Patterns

### Admin auth guard (applies to BOTH route files)
**Source:** `app/api/admin/settings/route.ts:11-14` and `app/api/admin/bookings/route.ts:213-216`
```typescript
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
Guard runs FIRST, before any query-param parse or body read. New horizon/settings fields sit behind this existing guard — never add a new auth surface.

### Zod-validated PATCH with 400-on-fail
**Source:** `app/api/admin/settings/route.ts:36-43`
**Apply to:** the extended settings PATCH.
```typescript
const parsed = settingsPatchSchema.safeParse(body)
if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
```

### Server-side param whitelist via `Set`
**Source:** `app/api/admin/bookings/route.ts:231-232` (`KNOWN_STATUSES`)
**Apply to:** the new `horizon` GET param (`KNOWN_HORIZONS`) — anything not in the set is treated as "no override," never forwarded raw.

### Supabase client selection
**Source:** both routes — `createSupabaseServiceClient()` (service-role) for the RPC/settings row after the admin guard passes.

## No Analog Found

None. Every file has an in-repo analog (most are self-extensions). The only genuinely new artifact is `lib/prague-date.ts`, which uses a built-in (`Intl`) rather than copying an existing pattern — flagged as a partial match, not a gap.

## Metadata

**Analog search scope:** `app/api/admin/`, `app/admin/(dashboard)/`, `components/admin/`, `supabase/migrations/`, `tests/`
**Files scanned:** 8 read + migration directory listing
**Next free migration number:** 058 (last on disk = 057_security_rls_hardening.sql) — this phase uses 058 (columns) + 059 (RPC)
**Pattern extraction date:** 2026-08-28
