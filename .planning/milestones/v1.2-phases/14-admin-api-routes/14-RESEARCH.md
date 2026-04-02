# Phase 14: Admin API Routes — Research

**Researched:** 2026-04-02
**Domain:** Next.js 16 App Router API routes, Supabase SSR auth guard, Zod v4 validation, Next.js cache revalidation
**Confidence:** HIGH

---

## Summary

Phase 14 builds three admin-only Route Handler files under `app/api/admin/`. The project already has all required libraries installed: `@supabase/ssr` 0.10.0, `@supabase/supabase-js` 2.101.0, `zod` 4.3.6. No new installs are needed.

The auth guard pattern is already established in Phase 13: `createClient()` from `lib/supabase/server.ts` creates the SSR-aware Supabase client from the HTTP cookie. Call `supabase.auth.getUser()` — not `getSession()` — and check `user.app_metadata.is_admin` for the admin-only 403 gate. The Phase 13 dashboard layout uses this exact pattern. API routes replicate it.

The cache bust mechanism is already in place: `lib/pricing-config.ts` uses `unstable_cache` with tag `'pricing-config'`. The admin PUT route calls `revalidateTag('pricing-config')` (imported from `next/cache`) after a successful upsert. The next call to `getPricingConfig()` skips the cache and fetches fresh data.

The bookings table schema (from `0001_create_bookings.sql`) defines all columns available for the paginated GET. Pagination uses Supabase's `.range(from, to)` and `.order('created_at', { ascending: false })`. Filtering uses `.gte`/`.lte` for date range, `.eq` for trip type, and `.or` with `ilike` for name/reference search.

**Primary recommendation:** Model all three route files on the same guard helper — a small inline function that calls `getUser()`, checks `is_admin`, and returns `{ status: 401 }` or `{ status: 403 }` early. This keeps each route DRY and consistent.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-06 | Pricing changes are live immediately — next booking wizard load reflects updated rates | PUT route calls `revalidateTag('pricing-config')` after upsert; `unstable_cache` in `lib/pricing-config.ts` uses tag `'pricing-config'` — this wires the existing cache to admin mutations |
| ZONES-02 | Operator can assign a name to a drawn zone and save it (stored as GeoJSON in `coverage_zones` table) | POST `/api/admin/zones` inserts `{ name, geojson, active: true }` after Zod validation of GeoJSON structure |
| ZONES-03 | Operator can toggle a zone active or inactive without deleting it | PATCH `/api/admin/zones` (or PUT with `{ id, active }` body) updates the `active` boolean column on the `coverage_zones` row |
| BOOKINGS-01 (backend) | Paginated table of all bookings, most recent first | GET `/api/admin/bookings` with `page`, `limit`, `startDate`, `endDate`, `tripType`, `search` query params; Supabase `.range()` + `.order()` + `.ilike()` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.10.0 (installed) | SSR-aware Supabase client from cookies | Already installed; required for `getUser()` in Route Handlers |
| `@supabase/supabase-js` | 2.101.0 (installed) | Supabase query client | Already installed; used by all existing API routes |
| `zod` | 4.3.6 (installed) | Input validation schemas | Already installed; used in `Step5Passenger.tsx` with `z.object()` |
| `next/cache` | Built-in (Next.js 16.1.7) | `revalidateTag()` cache bust | Already used in `actions.ts` via `revalidatePath` — same import source |

### No New Installs Required
All packages needed for Phase 14 are already installed. Do not add dependencies.

### Installed Version Notes
- **Zod 4.3.6:** Breaking change from Zod 3 — `.parse()` still works, but `.safeParse()` result shape is unchanged. The `z.object({})` API is identical. No migration needed; project already uses Zod 4 patterns (see `Step5Passenger.tsx`).
- **`createSupabaseServiceClient()`** in `lib/supabase.ts` uses the service role key and bypasses RLS. Use this for admin write operations (upsert pricing, insert/delete zones). This is already the pattern used by `calculate-price/route.ts`.
- **`createClient()`** in `lib/supabase/server.ts` uses the anon key + cookie session. Use this for auth checks (`getUser()`).

---

## Architecture Patterns

### New Files to Create
```
prestigo/
└── app/
    └── api/
        └── admin/
            ├── pricing/
            │   └── route.ts    # GET current config; PUT upsert + cache bust
            ├── zones/
            │   └── route.ts    # GET all; POST create; DELETE by id; PATCH active toggle
            └── bookings/
                └── route.ts    # GET paginated with filters
```

### No Existing Files to Modify
Phase 14 is additive only. `lib/pricing-config.ts` and `lib/supabase.ts` are not changed.

### Pattern 1: Auth Guard — Inline Helper per Route File

Every admin route file repeats this guard at the top of each handler. Do not extract to a shared middleware — Next.js Route Handlers are isolated; shared helpers mean a separate import that adds cognitive load with minimal savings across 3 files.

```typescript
// Source: lib/supabase/server.ts (established Phase 13 pattern) + Supabase docs
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}
```

Usage in every handler:
```typescript
export async function GET(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // ... handler logic
}
```

### Pattern 2: Pricing Route (GET + PUT)

**GET** — returns all rows from both `pricing_config` and `pricing_globals`.

```typescript
// Source: lib/pricing-config.ts pattern + Supabase docs
import { createSupabaseServiceClient } from '@/lib/supabase'

export async function GET() {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const [{ data: config }, { data: globals }] = await Promise.all([
    supabase.from('pricing_config').select('*'),
    supabase.from('pricing_globals').select('*').eq('id', 1).single(),
  ])
  return NextResponse.json({ config, globals })
}
```

**PUT** — validates body, upserts all rows, busts cache.

```typescript
// Source: next/cache docs + lib/pricing-config.ts unstable_cache tag pattern
import { revalidateTag } from 'next/cache'

const pricingConfigSchema = z.object({
  vehicle_class: z.string(),
  rate_per_km: z.number().positive(),
  hourly_rate: z.number().positive(),
  daily_rate: z.number().positive(),
})

const pricingPutSchema = z.object({
  config: z.array(pricingConfigSchema),
  globals: z.object({
    airport_fee: z.number().min(0),
    night_coefficient: z.number().positive(),
    holiday_coefficient: z.number().positive(),
    extra_child_seat: z.number().min(0),
    extra_meet_greet: z.number().min(0),
    extra_luggage: z.number().min(0),
  }),
})

export async function PUT(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = pricingPutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const [configResult, globalsResult] = await Promise.all([
    supabase.from('pricing_config').upsert(parsed.data.config),
    supabase.from('pricing_globals').upsert({ id: 1, ...parsed.data.globals }),
  ])

  if (configResult.error || globalsResult.error) {
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  revalidateTag('pricing-config')  // Busts unstable_cache in lib/pricing-config.ts
  return NextResponse.json({ ok: true })
}
```

**Critical:** `revalidateTag('pricing-config')` must match the tag string in `lib/pricing-config.ts` exactly: `{ tags: ['pricing-config'] }`. It is `'pricing-config'` (with hyphen).

### Pattern 3: Zones Route (GET + POST + DELETE + PATCH)

The ROADMAP says "GET all zones; POST create (Zod validate GeoJSON); DELETE by id" plus ZONES-03 requires an active toggle. PATCH handles the toggle.

**GeoJSON Polygon Zod Schema:**
```typescript
// Source: GeoJSON RFC 7946 spec + @turf/helpers type patterns used in calculate-price/route.ts
const geojsonFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Polygon'),
    // Polygon: array of rings; outer ring is coordinates[0]; each point is [lng, lat]
    coordinates: z.array(z.array(z.array(z.number()).length(2))).min(1),
  }),
  properties: z.record(z.unknown()).optional().nullable(),
})

const zoneCreateSchema = z.object({
  name: z.string().min(1).max(100),
  geojson: geojsonFeatureSchema,
})

const zoneToggleSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
})
```

**DELETE** — uses query param `id`:
```typescript
export async function DELETE(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase.from('coverage_zones').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

Note: `coverage_zones` RLS only has a `public_read` policy. Write operations (INSERT, UPDATE, DELETE) from the admin routes bypass RLS because they use `createSupabaseServiceClient()` (service role key). No additional RLS policy is needed for Phase 14.

### Pattern 4: Bookings Route (GET paginated)

The `bookings` table has no RLS policy at all (not visible in `0001_create_bookings.sql`). The service role client bypasses RLS regardless, so this is consistent with existing write patterns.

**Query params:** `page` (default 0), `limit` (default 20, max 100), `startDate` (ISO date), `endDate` (ISO date), `tripType` (text), `search` (client name or booking reference).

```typescript
export async function GET(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const startDate = searchParams.get('startDate')  // 'YYYY-MM-DD'
  const endDate = searchParams.get('endDate')      // 'YYYY-MM-DD'
  const tripType = searchParams.get('tripType')
  const search = searchParams.get('search')

  const supabase = createSupabaseServiceClient()
  let query = supabase
    .from('bookings')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)

  if (startDate) query = query.gte('pickup_date', startDate)
  if (endDate) query = query.lte('pickup_date', endDate)
  if (tripType) query = query.eq('trip_type', tripType)
  if (search) {
    // ilike is case-insensitive; search across client_first_name, client_last_name, booking_reference
    query = query.or(
      `client_first_name.ilike.%${search}%,client_last_name.ilike.%${search}%,booking_reference.ilike.%${search}%`
    )
  }

  const { data, count, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({
    bookings: data,
    total: count ?? 0,
    page,
    limit,
  })
}
```

### Recommended Project Structure (Phase 14 additions)
```
prestigo/
└── app/
    └── api/
        └── admin/
            ├── pricing/
            │   └── route.ts
            ├── zones/
            │   └── route.ts
            └── bookings/
                └── route.ts
```

### Anti-Patterns to Avoid
- **Using `getSession()` for auth check in route handlers:** `getSession()` reads the JWT from the cookie without server-side validation. An attacker with a manually crafted JWT cookie could bypass the check. Always use `getUser()`.
- **Using `createClient()` (anon key) for DB writes:** The anon key client respects RLS. `pricing_config` and `coverage_zones` have no write policies (only `public_read`). Write operations will silently fail. Use `createSupabaseServiceClient()` (service role) for all DB mutations.
- **Parsing query params without bounds checking:** `parseInt('', 10)` returns `NaN`. Always provide a fallback default and clamp the value.
- **Checking `is_admin` as a top-level `user` property:** The `is_admin` flag is in `user.app_metadata`, not `user.user_metadata`. These are different objects.
- **Calling `revalidateTag` before confirming DB success:** If the upsert fails after the tag is busted, the cache returns stale data on the next read but the DB has old values. Always call `revalidateTag` only after confirming no DB error.
- **Trusting Zod GeoJSON validation alone:** Zod validates structure (coordinates are arrays of numbers) but does not validate geometric correctness (ring closure, coordinate order). The zone check in `calculate-price/route.ts` uses Turf.js at read time, so malformed-but-structurally-valid GeoJSON will silently fail the zone check. Add a note to keep polygon rings closed (first coordinate equals last coordinate).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination offset | Manual `slice()` on fetched array | Supabase `.range(from, to)` | Server-side; fetches only the requested page, not the full table |
| Case-insensitive search | Manual JS `toLowerCase()` filter | Supabase `.ilike()` | Server-side; benefits from DB indexes on text columns |
| GeoJSON structure validation | Manual type checks | Zod schema (already installed) | `safeParse()` returns issues array — pass directly to `400` response |
| Cache invalidation timer | `setTimeout` or cron | `revalidateTag('pricing-config')` | Already wired into `lib/pricing-config.ts`; one function call |
| Auth token verification | Manual JWT decode | `supabase.auth.getUser()` | Validates against Supabase auth server; detects revoked tokens |

**Key insight:** The service role client and the SSR cookie client both already exist in the project. The only new code is route logic — no infrastructure setup needed.

---

## Common Pitfalls

### Pitfall 1: Wrong Supabase Client for Auth vs. DB Writes
**What goes wrong:** Route uses `createClient()` (anon key) for both `getUser()` and the DB upsert. The upsert silently returns no error but writes nothing because RLS blocks it.
**Why it happens:** There are two Supabase clients: `lib/supabase/server.ts` (anon, SSR cookie) and `lib/supabase.ts` (service role). They look similar.
**How to avoid:** Always use `createClient()` for auth (`getUser()`), and `createSupabaseServiceClient()` for all DB mutations.
**Warning signs:** PUT /api/admin/pricing returns `{ ok: true }` but pricing does not change.

### Pitfall 2: `is_admin` in Wrong Metadata Object
**What goes wrong:** Code checks `user.user_metadata?.is_admin` instead of `user.app_metadata?.is_admin`. All admins get 403.
**Why it happens:** Supabase has two separate metadata objects: `user_metadata` (user-editable) and `app_metadata` (admin/service-role-only). The `is_admin` flag was set in `app_metadata` in Phase 13.
**How to avoid:** `user.app_metadata?.is_admin === true`.
**Warning signs:** Valid admin user receives 403 on all admin API routes.

### Pitfall 3: `revalidateTag` Called on Wrong Tag String
**What goes wrong:** Cache is not busted after pricing update. Booking wizard continues returning old prices.
**Why it happens:** Tag string mismatch — code calls `revalidateTag('pricing_config')` (underscore) but `lib/pricing-config.ts` registers tag `'pricing-config'` (hyphen).
**How to avoid:** Copy-paste the tag string `'pricing-config'` directly from `lib/pricing-config.ts` line 29.
**Warning signs:** After PUT /api/admin/pricing returns 200, `/api/calculate-price` still returns old rates.

### Pitfall 4: Supabase NUMERIC Columns Return Strings
**What goes wrong:** A pricing calculation using DB values produces NaN because `'2.80' * 10` returns `NaN` in some arithmetic contexts.
**Why it happens:** Already documented in STATE.md (Phase 12 decision): "Supabase NUMERIC columns return strings — Number() cast required in getPricingConfig to prevent arithmetic bugs." The admin GET route doesn't calculate prices, but the PUT Zod schema validates `z.number()` — the incoming JSON from the admin UI should send numbers, not strings.
**How to avoid:** Zod schema uses `z.number()` for rate fields. When POSTing from the future admin UI (Phase 16), send numeric values in JSON, not strings. The PUT schema will reject string values with a clear Zod error.
**Warning signs:** Zod validation fails with "Expected number, received string" from Phase 16 form.

### Pitfall 5: Search Injection via `.or()` ilike Pattern
**What goes wrong:** A search term containing `%` or `_` becomes a broad wildcard that returns all rows.
**Why it happens:** Supabase's `ilike` treats `%` as a wildcard character. User input is embedded directly in the pattern.
**How to avoid:** Escape `%` and `_` in the search term before embedding in the ilike pattern, OR accept the behavior as non-critical (admin-only feature; the operator trusts themselves). For Phase 14, the admin-only context makes this acceptable without escaping.
**Warning signs:** Searching for `%` returns the entire bookings table.

### Pitfall 6: Zones Table Has No Write RLS Policy
**What goes wrong:** POST /api/admin/zones fails silently or returns a confusing error when accidentally called with the anon client.
**Why it happens:** `0003_create_coverage_zones.sql` only defines `public_read`. No INSERT/UPDATE/DELETE policies exist.
**How to avoid:** All zone mutations (POST, DELETE, PATCH) must use `createSupabaseServiceClient()`. This is already correct if the pattern in Pitfall 1 is followed.
**Warning signs:** Zone POST returns no error but no row is inserted.

---

## Code Examples

### Route Handler Structure (all three files follow this shell)
```typescript
// Source: lib/supabase/server.ts (Phase 13 pattern) + next/server docs
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // handler logic here
}
```

### Pricing Cache Bust
```typescript
// Source: next/cache docs — revalidateTag must match tag in unstable_cache options
import { revalidateTag } from 'next/cache'

// In PUT handler, after successful DB upsert:
revalidateTag('pricing-config')
// Tag string must match: lib/pricing-config.ts line 29: { tags: ['pricing-config'] }
```

### Supabase Paginated Query
```typescript
// Source: Supabase JS docs — range() is 0-indexed, inclusive on both ends
const from = page * limit
const to = from + limit - 1
const { data, count, error } = await supabase
  .from('bookings')
  .select('*', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(from, to)
```

### Zod v4 safeParse Pattern (matching project usage in Step5Passenger.tsx)
```typescript
// Source: Step5Passenger.tsx — z.object() + safeParse is the established project pattern
import { z } from 'zod'

const schema = z.object({ name: z.string().min(1) })
const parsed = schema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
}
// Use parsed.data safely
```

### Curl Verification Commands (for phase gate)
```bash
# 1. Unauthenticated → 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/pricing
# Expected: 401

# 2. Authenticated non-admin → 403 (requires a non-admin Supabase JWT)
# (manual-only — requires second test user without is_admin)

# 3. GET pricing (with valid session cookie)
# Use browser DevTools → copy session cookie → paste below
curl -s -H "Cookie: <sb-session-cookie>" http://localhost:3000/api/admin/pricing | jq .

# 4. PUT pricing
curl -s -X PUT http://localhost:3000/api/admin/pricing \
  -H "Content-Type: application/json" \
  -H "Cookie: <sb-session-cookie>" \
  -d '{"config":[{"vehicle_class":"business","rate_per_km":2.80,"hourly_rate":55,"daily_rate":320},{"vehicle_class":"first_class","rate_per_km":4.20,"hourly_rate":85,"daily_rate":480},{"vehicle_class":"business_van","rate_per_km":3.50,"hourly_rate":70,"daily_rate":400}],"globals":{"airport_fee":0,"night_coefficient":1.0,"holiday_coefficient":1.0,"extra_child_seat":15,"extra_meet_greet":25,"extra_luggage":20}}' | jq .

# 5. GET bookings paginated
curl -s -H "Cookie: <sb-session-cookie>" \
  "http://localhost:3000/api/admin/bookings?page=0&limit=10" | jq '{total: .total, count: (.bookings | length)}'

# 6. POST zone
curl -s -X POST http://localhost:3000/api/admin/zones \
  -H "Content-Type: application/json" \
  -H "Cookie: <sb-session-cookie>" \
  -d '{"name":"Prague Center","geojson":{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[14.35,50.05],[14.50,50.05],[14.50,50.12],[14.35,50.12],[14.35,50.05]]]},"properties":{}}}' | jq .

# 7. DELETE zone
curl -s -X DELETE -H "Cookie: <sb-session-cookie>" \
  "http://localhost:3000/api/admin/zones?id=<uuid>" | jq .
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` in server code | `getUser()` in server code | 2024 (Supabase SSR) | Validates JWT with auth server; already established in Phase 13 |
| Manual pagination with JS array slice | Supabase `.range()` + `count: 'exact'` | Supabase JS v2 | Server-side; does not fetch full table |
| Custom cache invalidation | `revalidateTag()` + `unstable_cache` tags | Next.js 13.4+ | Already wired in Phase 12 (`lib/pricing-config.ts`) |
| `middleware.ts` | `proxy.ts` | Next.js 16 | Project already uses `proxy.ts`; Route Handlers are unaffected |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: replaced by `@supabase/ssr`. Project already migrated.
- `res.status(401).json(...)` (Pages Router pattern): In App Router Route Handlers, use `NextResponse.json({}, { status: 401 })`.

---

## Open Questions

1. **ZONES-03 implementation method — PATCH vs PUT vs query param**
   - What we know: ZONES-03 requires toggling `active` without deleting. The roadmap says "DELETE by id" for the zones route, but doesn't explicitly name a PATCH/PUT method.
   - What's unclear: Should the active toggle be a PATCH on `/api/admin/zones` with `{ id, active }` body, or a separate sub-route `/api/admin/zones/[id]/toggle`?
   - Recommendation: Add a `PATCH` export to `/api/admin/zones/route.ts` with body `{ id: uuid, active: boolean }`. A single route file with GET/POST/DELETE/PATCH is cleaner than a nested dynamic segment for Phase 14. Phase 16 UI will call this endpoint.

2. **`pricing_globals` upsert conflict**
   - What we know: `pricing_globals` enforces `CHECK (id = 1)` singleton. Upsert with `id: 1` should work.
   - What's unclear: Supabase upsert behavior when no `onConflict` column is specified vs. explicitly specifying `id`.
   - Recommendation: Use `supabase.from('pricing_globals').upsert({ id: 1, ...fields }, { onConflict: 'id' })` to be explicit. This matches the bookings upsert pattern in `lib/supabase.ts` line 82.

3. **Bookings table — no RLS policy in migration file**
   - What we know: `0001_create_bookings.sql` does not show `ALTER TABLE bookings ENABLE ROW LEVEL SECURITY` or any policy.
   - What's unclear: Is RLS enabled on bookings in the live Supabase project? The webhook handler uses `createSupabaseServiceClient()` which bypasses RLS regardless.
   - Recommendation: Use `createSupabaseServiceClient()` for the bookings GET. If RLS is enabled and anon reads are blocked, the service role client still works. If RLS is off, the service role client still works. Either way, service role is correct.

4. **Bookings date column type is `text`, not `date`**
   - What we know: `pickup_date` is `text NOT NULL` (from `0001_create_bookings.sql` line 18). Values are stored as `'YYYY-MM-DD'` strings.
   - What's unclear: Supabase's `.gte()` and `.lte()` on text columns use lexicographic comparison. For `'YYYY-MM-DD'` format, lexicographic order equals chronological order — so date range filtering works correctly.
   - Recommendation: Use `.gte('pickup_date', startDate).lte('pickup_date', endDate)` — valid because ISO date strings sort lexicographically.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.1 |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `nvm use 22 && npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| Full suite command | `nvm use 22 && npx vitest run 2>&1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-06 | PUT /api/admin/pricing → `revalidateTag('pricing-config')` called | unit (mock) | `nvm use 22 && npx vitest run tests/admin-pricing.test.ts -x` | ❌ Wave 0 |
| PRICING-06 | GET after PUT reflects updated rates in /api/calculate-price | smoke (curl) | Manual curl sequence — requires live Supabase | manual-only |
| ZONES-02 | POST /api/admin/zones with valid GeoJSON → row inserted | smoke (curl) | Manual — requires live Supabase | manual-only |
| ZONES-02 | POST /api/admin/zones with invalid GeoJSON → 400 | unit (mock) | `nvm use 22 && npx vitest run tests/admin-zones.test.ts -x` | ❌ Wave 0 |
| ZONES-03 | PATCH /api/admin/zones with { id, active: false } → row updated | smoke (curl) | Manual — requires live Supabase | manual-only |
| BOOKINGS-01 | GET /api/admin/bookings returns paginated response shape | unit (mock) | `nvm use 22 && npx vitest run tests/admin-bookings.test.ts -x` | ❌ Wave 0 |
| All routes | Unauthenticated → 401 | unit (mock) | Included in wave 0 test files | ❌ Wave 0 |
| All routes | Authenticated non-admin → 403 | unit (mock) | Included in wave 0 test files | ❌ Wave 0 |

Note: Unit tests for Route Handlers require mocking `@/lib/supabase/server` and `@/lib/supabase`. The existing test files (e.g., `tests/health.test.ts`, `tests/create-payment-intent.test.ts`) demonstrate this mock pattern.

### Sampling Rate
- **Per task commit:** `nvm use 22 && npx vitest run --reporter=verbose 2>&1 | tail -20`
- **Per wave merge:** `nvm use 22 && npx vitest run 2>&1`
- **Phase gate:** Full vitest suite green + manual curl verification of all 7 curl commands above (auth + data)

### Wave 0 Gaps
- [ ] `prestigo/tests/admin-pricing.test.ts` — covers PRICING-06 auth guard + revalidateTag call + Zod validation
- [ ] `prestigo/tests/admin-zones.test.ts` — covers ZONES-02/03 auth guard + Zod GeoJSON rejection + toggle
- [ ] `prestigo/tests/admin-bookings.test.ts` — covers BOOKINGS-01 auth guard + pagination response shape

*(Existing vitest infrastructure and mock patterns are sufficient — no new framework config needed)*

---

## Sources

### Primary (HIGH confidence)
- `prestigo/lib/pricing-config.ts` — confirmed `unstable_cache` tag `'pricing-config'`; establishes exact tag string for `revalidateTag`
- `prestigo/lib/supabase/server.ts` — confirmed `createClient()` uses anon key + cookie pattern
- `prestigo/lib/supabase.ts` — confirmed `createSupabaseServiceClient()` uses service role; also confirms `upsert({ onConflict: ... })` pattern
- `supabase/migrations/0001_create_bookings.sql` — confirmed all bookings columns and types (pickup_date is text)
- `supabase/migrations/0002_create_pricing_config.sql` — confirmed pricing_config and pricing_globals schema + seed values
- `supabase/migrations/0003_create_coverage_zones.sql` — confirmed coverage_zones schema (geojson is JSONB, active is BOOLEAN)
- `prestigo/package.json` — confirmed zod 4.3.6, @supabase/ssr 0.10.0, @supabase/supabase-js 2.101.0, next 16.1.7
- `prestigo/components/booking/steps/Step5Passenger.tsx` — confirmed Zod v4 usage pattern in project

### Secondary (MEDIUM confidence)
- Supabase JS v2 docs for `.range()`, `.order()`, `.ilike()`, `.or()` — verified against `supabase-js` 2.x API surface (consistent across multiple sources)
- Next.js `revalidateTag` API — consistent with `next/cache` import confirmed in `actions.ts`
- `user.app_metadata.is_admin` read pattern — consistent with STATE.md Phase 13 key decisions

### Tertiary (LOW confidence)
- Zod v4 `safeParse().error.issues` shape — assumed compatible with v3 pattern from project usage; not directly verified against zod 4.3.6 changelog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed from `package.json`
- Auth guard pattern: HIGH — `createClient()` + `getUser()` + `app_metadata.is_admin` confirmed from Phase 13 code
- Cache bust mechanism: HIGH — `unstable_cache` + `revalidateTag` tag string confirmed from `lib/pricing-config.ts`
- DB schema / column types: HIGH — confirmed from migration SQL files
- Zod v4 `.issues` shape: MEDIUM — assumed compatible, not directly tested

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (30 days — all dependencies are stable; no fast-moving packages introduced)
