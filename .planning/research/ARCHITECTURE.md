# Architecture Research — Prestigo v1.2 Operator Dashboard

**Domain:** Admin-protected Next.js App Router extension — operator dashboard integrated into existing booking site
**Researched:** 2026-04-01
**Confidence:** HIGH (verified against official Supabase `@supabase/ssr` docs, Next.js App Router docs, Turf.js)

---

## Context: What Already Exists (v1.1)

```
prestigo/app/api/
├── calculate-price/route.ts       # Google Routes API + lib/pricing.ts (hardcoded rates)
├── create-payment-intent/route.ts # Stripe PaymentIntent
├── submit-quote/route.ts          # Quote request email
├── webhooks/stripe/route.ts       # Payment confirmation; writes to Supabase
└── health/route.ts                # Per-service probes

prestigo/lib/
├── booking-store.ts   # Zustand store (wizard state)
├── currency.ts        # CZK/EUR conversions
├── email.ts           # Resend templates
├── extras.ts          # Extras config
├── pricing.ts         # HARDCODED rate tables — replaced in v1.2
└── supabase.ts        # createSupabaseServiceClient (service role, no auth)

Supabase:
└── bookings           # 33-column table, payment_intent_id UNIQUE
```

No `middleware.ts` exists. No auth. No admin routes. No `@supabase/ssr`.

---

## System Overview: v1.2 Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                           Browser                                 │
├─────────────────────────┬─────────────────────────────────────────┤
│  Public routes (no auth)│  Admin routes (Supabase Auth required)  │
│  /  /book  /fleet ...   │  /admin/login  /admin/*                 │
│  Zustand + Stripe       │  Server Components + client form islands│
└───────────┬─────────────┴──────────────────┬────────────────────┘
            │                                │
            ▼                                ▼
┌───────────────────────────────────────────────────────────────────┐
│              middleware.ts  (Next.js Edge, runs first)            │
│  • updateSession(): refreshes Supabase Auth JWT in cookie         │
│  • /admin/* (not /admin/login) + no session → redirect /admin/login│
│  • /admin/login + session → redirect /admin                       │
│  • All other requests pass through unchanged                      │
└───────────────────────────┬───────────────────────────────────────┘
                            │
          ┌─────────────────┴──────────────────┐
          ▼                                     ▼
┌──────────────────────┐         ┌──────────────────────────────────┐
│  Booking API Routes  │         │  Admin API Routes                │
│  /api/calculate-price│         │  /api/admin/pricing  GET | PUT   │
│  /api/create-payment │         │  /api/admin/zones    GET|POST|DEL│
│  /api/webhooks/stripe│         │  /api/admin/bookings GET         │
│  /api/submit-quote   │         │  All: verify session + role,     │
│  /api/health         │         │  use service role key for writes │
└──────────┬───────────┘         └──────────────────┬───────────────┘
           │                                         │
           └─────────────────┬───────────────────────┘
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                          Supabase                                 │
├──────────────────┬──────────────────────┬─────────────────────────┤
│  bookings        │  pricing_config       │  coverage_zones         │
│  (EXISTING)      │  (NEW)               │  (NEW)                  │
│  33 columns      │  vehicle_class PK    │  id uuid PK             │
│  all bookings    │  rate_per_km         │  name text              │
│  + quotes        │  hourly_rate         │  polygon jsonb          │
│                  │  daily_rate          │  active boolean         │
│                  │  airport_fee         │  created_at             │
│                  │  night_coeff         │  updated_at             │
│                  │  holiday_coeff       │                         │
└──────────────────┴──────────────────────┴─────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | New or Modified |
|-----------|----------------|-----------------|
| `middleware.ts` (root) | Refresh Supabase Auth JWT cookie on every non-static request; redirect `/admin/*` to `/admin/login` when unauthenticated | **NEW** |
| `lib/supabase/server.ts` | `createServerClient` from `@supabase/ssr` with cookie support — for Server Components and admin API routes that need session context | **NEW** (supplements `lib/supabase.ts`) |
| `lib/supabase/middleware.ts` | `updateSession()` helper consumed by `middleware.ts` | **NEW** |
| `lib/pricing.ts` | Hardcoded rate constants become seed-only reference; `calculatePrice()` signature unchanged but receives rates as params from DB loader | **MODIFIED** |
| `lib/pricing-config.ts` | Loads `pricing_config` from Supabase; uses plain service client with Next.js cache tag `'pricing-config'` and `revalidate: 60` | **NEW** |
| `app/admin/login/page.tsx` | Email+password sign-in via `signInWithPassword`; redirects on success | **NEW** |
| `app/admin/layout.tsx` | Admin shell: server-side `getUser()` double-check, sidebar navigation | **NEW** |
| `app/admin/pricing/page.tsx` | Pricing editor: loads current config, renders `PricingForm` | **NEW** |
| `app/admin/zones/page.tsx` | Zone manager: `ZoneMap` drawing, zone list, delete | **NEW** |
| `app/admin/bookings/page.tsx` | Paginated bookings table with status filter | **NEW** |
| `app/admin/stats/page.tsx` | Revenue + booking count aggregates | **NEW** |
| `/api/admin/pricing/route.ts` | GET config; PUT validated update + `revalidateTag('pricing-config')` | **NEW** |
| `/api/admin/zones/route.ts` | GET all active zones; POST create; DELETE by id | **NEW** |
| `/api/admin/bookings/route.ts` | GET bookings with pagination + filter params | **NEW** |
| `/api/calculate-price/route.ts` | Load rates from `pricing_config` (cached); load zones; run Turf.js point-in-polygon check before pricing | **MODIFIED** |
| `components/admin/AdminSidebar.tsx` | Navigation links for admin area | **NEW** |
| `components/admin/PricingForm.tsx` | Form fields for per-vehicle rates + coefficients | **NEW** |
| `components/admin/ZoneMap.tsx` | Google Maps Drawing Manager; emits GeoJSON polygon on complete | **NEW** |
| `components/admin/BookingsTable.tsx` | Sortable/filterable table of bookings | **NEW** |
| `types/admin.ts` | TypeScript types: `PricingConfig`, `CoverageZone`, `AdminBookingRow` | **NEW** |

---

## Recommended Project Structure

```
prestigo/
├── middleware.ts                          # NEW — root-level, required by Next.js
├── lib/
│   ├── supabase.ts                        # EXISTING — service client (unchanged)
│   ├── supabase/
│   │   ├── server.ts                      # NEW — @supabase/ssr server client
│   │   └── middleware.ts                  # NEW — updateSession()
│   ├── pricing.ts                         # MODIFIED — constants kept as defaults/fallback
│   └── pricing-config.ts                  # NEW — DB loader with cache tag
├── app/
│   ├── admin/
│   │   ├── layout.tsx                     # NEW — admin shell + server-side auth guard
│   │   ├── page.tsx                       # NEW — redirect to /admin/bookings or dashboard
│   │   ├── login/
│   │   │   └── page.tsx                   # NEW — sign-in form
│   │   ├── pricing/
│   │   │   └── page.tsx                   # NEW — pricing editor
│   │   ├── zones/
│   │   │   └── page.tsx                   # NEW — zone manager
│   │   ├── bookings/
│   │   │   └── page.tsx                   # NEW — bookings list
│   │   └── stats/
│   │       └── page.tsx                   # NEW — statistics
│   └── api/
│       ├── admin/
│       │   ├── pricing/
│       │   │   └── route.ts               # NEW — GET | PUT
│       │   ├── zones/
│       │   │   └── route.ts               # NEW — GET | POST | DELETE
│       │   └── bookings/
│       │       └── route.ts               # NEW — GET (paginated)
│       └── calculate-price/
│           └── route.ts                   # MODIFIED — DB rates + zone check
├── components/
│   ├── admin/                             # NEW folder
│   │   ├── AdminSidebar.tsx
│   │   ├── PricingForm.tsx
│   │   ├── ZoneMap.tsx
│   │   └── BookingsTable.tsx
│   └── booking/                           # EXISTING, unchanged
├── types/
│   ├── booking.ts                         # EXISTING, unchanged
│   └── admin.ts                           # NEW
└── supabase/
    └── migrations/
        ├── 0001_create_bookings.sql        # EXISTING (v1.1)
        ├── 0002_create_pricing_config.sql  # NEW
        └── 0003_create_coverage_zones.sql  # NEW
```

### Structure Rationale

- **`middleware.ts` at project root (not in `app/`):** Next.js requires middleware at the project root or `src/` root — it cannot be nested inside `app/`.
- **`lib/supabase/` subdirectory:** The new `@supabase/ssr` server client is distinctly different from the existing service client in `lib/supabase.ts`. Keeping them separate prevents accidental use of the cookie-based client in contexts where you want the cached service client (and vice versa).
- **`app/admin/` as a real directory (not route group):** `/admin` is an intended URL prefix. Route groups like `(admin)` are for layout-only separation without URL changes. Use a plain `admin/` folder.
- **`app/api/admin/` namespace:** Grouping admin API routes under `/api/admin/` allows the middleware matcher to include them in session-checking logic with a single pattern.

---

## Architectural Patterns

### Pattern 1: Supabase Auth Middleware with `@supabase/ssr`

**What:** A `middleware.ts` at project root intercepts every non-static request. It calls `updateSession()` which creates a per-request Supabase client using `createServerClient` from `@supabase/ssr`, refreshes the JWT in the cookie jar, and checks `supabase.auth.getUser()` for route guards. Server Components cannot write cookies — the middleware handles all token refresh.

**When to use:** Required for any Supabase Auth integration with Next.js App Router. Without this, session cookies expire silently.

**Trade-offs:** One `getUser()` call to Supabase Auth per matching request. Keep the matcher tight (exclude static files) to avoid unnecessary overhead. Never use `getSession()` in server code — it reads the JWT without revalidating it against the auth server; a tampered token passes silently.

**Skeleton:**
```typescript
// middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

```typescript
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  // Always getUser(), never getSession()
  const { data: { user } } = await supabase.auth.getUser()

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isLoginPage = request.nextUrl.pathname === '/admin/login'

  if (isAdminRoute && !isLoginPage && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}
```

### Pattern 2: Admin Route Double-Guard (Middleware + Server Component)

**What:** The middleware guards the URL — unauthenticated requests never reach the page. The `admin/layout.tsx` adds a second server-side `getUser()` check and redirects if somehow the middleware was bypassed. Defense in depth.

**When to use:** Any admin Server Component that renders sensitive data. The middleware is the primary guard; the layout is the fallback.

**Trade-offs:** Two `getUser()` calls per admin page load. Both are necessary — the middleware cannot be relied on alone in all edge cases (e.g., direct API calls that bypass middleware matching).

**Skeleton:**
```typescript
// app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1">{children}</main>
    </div>
  )
}
```

### Pattern 3: Pricing Config Loaded from Supabase (replacing `lib/pricing.ts`)

**What:** The `pricing_config` table stores one row per vehicle class. The `lib/pricing-config.ts` loader uses the plain service client (not `@supabase/ssr`) with a custom fetch that passes a Next.js cache tag. The `/api/calculate-price` route calls this loader — prices are cached for 60 seconds. When an admin saves new rates via `PUT /api/admin/pricing`, the handler calls `revalidateTag('pricing-config')` to bust the cache immediately.

**When to use:** Any config value that an operator needs to change without a code deploy.

**Trade-offs:** `@supabase/ssr` clients opt out of Next.js fetch caching. Use the plain `createSupabaseServiceClient()` from `lib/supabase.ts` with a manually-constructed cache-tagged fetch for the pricing config loader. Admin pages that display current config should use `export const dynamic = 'force-dynamic'` to always show the latest values.

**Schema:**
```sql
-- supabase/migrations/0002_create_pricing_config.sql
CREATE TABLE pricing_config (
  vehicle_class  text        PRIMARY KEY,
  rate_per_km    numeric(8,2) NOT NULL,
  hourly_rate    numeric(8,2) NOT NULL,
  daily_rate     numeric(8,2) NOT NULL,
  airport_fee    numeric(8,2) NOT NULL DEFAULT 0,
  night_coeff    numeric(4,2) NOT NULL DEFAULT 1.0,
  holiday_coeff  numeric(4,2) NOT NULL DEFAULT 1.0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS: public read for calculate-price; writes require service role
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON pricing_config FOR SELECT USING (true);

-- Seed from current lib/pricing.ts hardcoded values
INSERT INTO pricing_config VALUES
  ('business',     2.80, 55, 320, 0, 1.0, 1.0, now()),
  ('first_class',  4.20, 85, 480, 0, 1.0, 1.0, now()),
  ('business_van', 3.50, 70, 400, 0, 1.0, 1.0, now());
```

### Pattern 4: Coverage Zones as JSONB (GeoJSON) + Turf.js Point-in-Polygon

**What:** The `coverage_zones` table stores polygon data as a GeoJSON `Feature` object in a `jsonb` column. The zone check in `/api/calculate-price` fetches all active zones and uses `@turf/boolean-point-in-polygon` to determine whether the route's origin and destination both fall within any active zone. If either point is outside all zones, `quoteMode = true` is returned.

**When to use:** Zone counts are small (O(10) zones for a single-operator chauffeur service). Full PostGIS is unnecessary complexity for this scale. Turf.js in the route handler adds ~15 KB to the server bundle and runs in under 1 ms for small zone counts.

**Trade-offs vs PostGIS:** PostGIS provides SQL-level spatial indexing and is necessary at O(1000+) zones or for complex spatial operations (buffers, intersections). Turf.js approach is simpler to build, easier to debug, and has a clear upgrade path: replace the JS check with an RPC call to a PostGIS function when scale demands it.

**Schema:**
```sql
-- supabase/migrations/0003_create_coverage_zones.sql
CREATE TABLE coverage_zones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  polygon     jsonb       NOT NULL,
  -- polygon stores a GeoJSON Feature:
  -- { "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [...] } }
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: public read (calculate-price); writes require service role
ALTER TABLE coverage_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON coverage_zones FOR SELECT USING (true);
```

**Zone check insertion in `calculate-price`:**
```typescript
// After resolving distanceKm, before calling buildPriceMap():
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

const { data: zones } = await supabase.from('coverage_zones')
  .select('polygon').eq('active', true)

if (zones && zones.length > 0) {
  const originPt = point([origin.lng, origin.lat])
  const destPt   = point([destination.lng, destination.lat])
  const covered = zones.some(z =>
    booleanPointInPolygon(originPt, z.polygon) &&
    booleanPointInPolygon(destPt, z.polygon)
  )
  if (!covered) {
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
// If no zones are defined yet, do not block pricing (graceful default)
```

---

## Data Flow

### Booking Price Calculation (Modified in v1.2)

```
User selects origin + destination in BookingWizard Step 1
    ↓
Step 3: POST /api/calculate-price
    ↓
calculate-price Route Handler:
  1. Load pricing_config from Supabase (cached 60s, tag: 'pricing-config')
  2. Call Google Routes API → distanceKm
  3. Load active coverage_zones from Supabase (no cache — fast, small)
  4. Turf.js: are both origin + destination inside any zone?
         No  → return { prices: null, distanceKm: null, quoteMode: true }
         Yes → continue
  5. calculatePrice() using DB rates → PriceBreakdown
  6. return { prices, distanceKm, quoteMode: false }
    ↓
Wizard renders VehicleCard with live price  [NO CHANGE to client components]
```

### Admin Authentication Flow

```
GET /admin/pricing  (no auth cookie)
    ↓
middleware.ts: updateSession() → getUser() → null
    ↓
Redirect → /admin/login
    ↓
Operator enters email + password → signInWithPassword()
    ↓
Supabase sets HTTP-only session cookie (handled by @supabase/ssr)
    ↓
Redirect → /admin  (middleware detects valid session, passes through)
    ↓
app/admin/layout.tsx: second getUser() check → confirms user → renders
    ↓
Admin dashboard visible
```

### Admin Pricing Update Flow

```
Operator edits rate in PricingForm → submits
    ↓
Client-side fetch: PUT /api/admin/pricing  { vehicle_class, field, value }
    ↓
Route Handler:
  1. createServerClient → getUser() → confirm session
  2. Check user.user_metadata.is_admin (or app_metadata)
  3. Zod validate body
  4. UPDATE pricing_config SET ... WHERE vehicle_class = ...
  5. revalidateTag('pricing-config')
  6. Return 200
    ↓
Next request to /api/calculate-price fetches fresh rates from DB
```

### Admin Zone Save Flow

```
Operator draws polygon on Google Maps (ZoneMap component)
    ↓
ZoneMap emits GeoJSON Feature on polygon complete
    ↓
Client-side fetch: POST /api/admin/zones  { name, polygon: GeoJSON Feature }
    ↓
Route Handler:
  1. Verify session + role
  2. Zod validate GeoJSON structure
  3. INSERT INTO coverage_zones (name, polygon)
  4. Return { id, name }
    ↓
Zone is active immediately — next calculate-price request loads it
```

---

## Integration Points

### New vs. Modified: Explicit Breakdown

| Item | Status | What Changes |
|------|--------|-------------|
| `middleware.ts` (project root) | **NEW** | Does not exist in v1.1 |
| `@supabase/ssr` npm package | **NEW** (install) | Required by middleware + Server Component auth clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var | **NEW** | `@supabase/ssr` needs the anon key client-side; v1.1 only had the service role key |
| `NEXT_PUBLIC_SUPABASE_URL` env var | **NEW** | Was `SUPABASE_URL` (server-only) in v1.1; needs `NEXT_PUBLIC_` prefix for `@supabase/ssr` browser client |
| `lib/supabase/server.ts` | **NEW** | Auth-aware SSR client for Server Components |
| `lib/supabase/middleware.ts` | **NEW** | `updateSession()` for `middleware.ts` |
| `lib/pricing.ts` | **MODIFIED** | Rate constant exports removed (moved to DB seed); `calculatePrice()` accepts rates as parameter |
| `lib/pricing-config.ts` | **NEW** | DB loader for `pricing_config` with Next.js cache tag |
| `pricing_config` table | **NEW** | Seeds from current `lib/pricing.ts` values |
| `coverage_zones` table | **NEW** | GeoJSON polygons; initially empty (no zones = no blocking) |
| `/api/calculate-price/route.ts` | **MODIFIED** | Reads rates from DB (cached); adds zone check via Turf.js |
| `/api/admin/pricing/route.ts` | **NEW** | PUT invalidates `'pricing-config'` cache tag |
| `/api/admin/zones/route.ts` | **NEW** | CRUD for coverage zones |
| `/api/admin/bookings/route.ts` | **NEW** | Read-only paginated access to `bookings` table |
| `app/admin/**` pages | **NEW** | Protected by middleware + layout double-guard |
| `components/admin/**` | **NEW** | Admin-only, never imported into public pages |
| `types/admin.ts` | **NEW** | `PricingConfig`, `CoverageZone`, `AdminBookingRow` |
| `@turf/boolean-point-in-polygon` | **NEW** (install) | Server-side only inside `calculate-price` route handler |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | `@supabase/ssr` cookie-based sessions; `signInWithPassword` for email+password | Requires anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); service key used only in server-side writes |
| Supabase Database (existing) | `createSupabaseServiceClient()` from `lib/supabase.ts` unchanged | Two client types coexist: service client (no auth) for data ops, SSR client (auth-aware) for session verification |
| Google Maps Drawing Manager | Client-side in `ZoneMap.tsx`; uses existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Drawing Manager is part of Google Maps JS API; no new API keys needed |
| Turf.js | Server-side only inside `calculate-price` route handler | `npm install @turf/boolean-point-in-polygon @turf/helpers` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `middleware.ts` ↔ Supabase Auth | HTTP per request (getUser()) | Per-request client, never a global singleton |
| Admin pages ↔ Admin API routes | HTTP (fetch from client form components) | Session cookie forwarded automatically by browser |
| `calculate-price` ↔ `pricing_config` | Supabase SDK with cache tag | Do NOT use `@supabase/ssr` client here — it disables Next.js fetch cache |
| `calculate-price` ↔ `coverage_zones` | Supabase SDK, no cache | Small table, no cache needed; always fresh |
| `ZoneMap` component ↔ `/api/admin/zones` | Client-side fetch (POST on polygon complete) | `ZoneMap.tsx` must be a Client Component (`'use client'`) |
| `PricingForm` ↔ `/api/admin/pricing` | Client-side fetch (PUT on save) | Zod validation on both client and server |

---

## Build Order

Dependencies determine the order: schema before API, auth infrastructure before protected routes, modified core booking flow before admin UI.

```
Phase 1 — Auth Infrastructure (no user-visible UI yet)
  1a. npm install @supabase/ssr @turf/boolean-point-in-polygon @turf/helpers
  1b. Add NEXT_PUBLIC_SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_URL to .env.local + Vercel
      (rename existing SUPABASE_URL → keep both; anon key is new)
  1c. Create lib/supabase/server.ts  (createServerClient wrapper)
  1d. Create lib/supabase/middleware.ts  (updateSession, no redirect logic yet)
  1e. Create middleware.ts at project root (session refresh only, no redirects)
  1f. Verify: existing booking wizard still works end-to-end (no regressions)

Phase 2 — Database Schema
  2a. Create + apply supabase/migrations/0002_create_pricing_config.sql
      (table + RLS + seed from lib/pricing.ts values)
  2b. Create + apply supabase/migrations/0003_create_coverage_zones.sql
      (table + RLS, empty)
  2c. Verify: pricing_config rows match lib/pricing.ts constants exactly

Phase 3 — Modify Core Booking Flow
  3a. Create lib/pricing-config.ts (DB loader with cache tag 'pricing-config')
  3b. Modify /api/calculate-price/route.ts:
        - Load rates from pricing_config via lib/pricing-config.ts
        - Add zone check (Turf.js) after distance resolution
  3c. Smoke test: booking wizard prices match; quoteMode = false when no zones exist
  3d. Smoke test: quoteMode = true when origin outside a test zone

Phase 4 — Admin Auth + Login
  4a. Enable Email Auth provider in Supabase Dashboard > Authentication > Providers
  4b. Create admin user via Supabase Dashboard (email + password)
  4c. Set is_admin: true in user's app_metadata via Supabase Dashboard or SQL
  4d. Add /admin redirect logic to lib/supabase/middleware.ts updateSession()
  4e. Create app/admin/login/page.tsx (signInWithPassword form)
  4f. Create app/admin/layout.tsx (server getUser() + AdminSidebar shell)
  4g. Verify: /admin/* redirects to /admin/login; login works; sidebar visible after auth

Phase 5 — Admin API Routes
  5a. /api/admin/pricing/route.ts (GET + PUT with revalidateTag)
  5b. /api/admin/zones/route.ts (GET + POST + DELETE)
  5c. /api/admin/bookings/route.ts (GET paginated)
  5d. Verify each route with curl/Postman: unauthenticated returns 401; authenticated returns data

Phase 6 — Admin UI Pages
  6a. /admin/pricing — PricingForm reading from GET, saving via PUT
  6b. /admin/zones — ZoneMap + zone list; test that a saved zone activates quoteMode
  6c. /admin/bookings — BookingsTable with status filter
  6d. /admin/stats — aggregate query for revenue + booking counts
```

**Rationale:**
- Phase 1 (auth infra) runs before any route protection so regressions in the existing wizard are caught early.
- Phase 2 (schema) must complete before Phase 3 reads from DB.
- Phase 3 (modified calculate-price) is tested standalone before any admin UI exists — if the zone check logic is wrong, it's debugged in isolation.
- Phase 4 (auth login) before Phase 5 (admin API) — no point building protected routes before the login mechanism works.
- Phase 5 (admin API) before Phase 6 (admin UI) — forms need working endpoints to call.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 operator, <100 bookings/day | Current architecture — no changes needed |
| 1k bookings/day | Add cache for coverage_zones (revalidate on zone save) to avoid one Supabase query per price-check |
| 50+ zones | Migrate to PostGIS: `geography(POLYGON, 4326)` column + `ST_Contains` RPC function; replace Turf.js with `supabase.rpc('is_in_coverage', { lat, lng })` |
| Multiple operators / drivers | Add user roles table; expand admin to per-user dashboards; Supabase RLS policies per operator_id |

### Scaling Priorities

1. **First bottleneck:** Two Supabase queries per price-check request (pricing_config + coverage_zones). Fix: pricing_config is already cached; cache coverage_zones with `revalidateTag('coverage-zones')` on zone write.
2. **Second bottleneck:** Admin `getUser()` in layout on every page navigation. Acceptable at current scale; Next.js caches Server Component renders.

---

## Anti-Patterns

### Anti-Pattern 1: Using `getSession()` Instead of `getUser()` in Server Code

**What people do:** Call `supabase.auth.getSession()` inside `middleware.ts` or Server Components to check authentication.

**Why it's wrong:** `getSession()` reads the JWT from the cookie without verifying it against the Supabase Auth server. A tampered, replayed, or expired token may pass the check. Official Supabase docs state explicitly: "Never trust `supabase.auth.getSession()` inside Server Components or Middleware."

**Do this instead:** Always use `supabase.auth.getUser()`. It makes a live network request to validate the token on every call.

### Anti-Pattern 2: Using `@supabase/ssr` Client for Cached Data Fetches

**What people do:** Use `createServerClient` from `@supabase/ssr` inside the `calculate-price` route handler, expecting Next.js to cache the pricing config query.

**Why it's wrong:** `@supabase/ssr` sets `cache: 'no-store'` on its internal fetch calls — it opts out of the Next.js data cache to ensure fresh session state. Pricing config fetched this way will never cache regardless of `revalidate` options.

**Do this instead:** Use the existing `createSupabaseServiceClient()` from `lib/supabase.ts` (plain `@supabase/supabase-js`) with a custom fetch wrapper that passes Next.js `{ next: { tags: ['pricing-config'] } }` options, or use a dedicated `lib/pricing-config.ts` loader.

### Anti-Pattern 3: Exposing `SUPABASE_SERVICE_ROLE_KEY` to Client Components

**What people do:** Pass the service role key to a client-side Supabase instance so admin UI components can write directly to Supabase.

**Why it's wrong:** The service role key bypasses all Row Level Security. It belongs only in server-side Route Handlers. Exposing it client-side allows any user with devtools to execute arbitrary database operations.

**Do this instead:** Admin writes always go through `/api/admin/*` route handlers. The session cookie proves identity; the route handler uses `createSupabaseServiceClient()` server-side.

### Anti-Pattern 4: Hardcoding Admin Email in Middleware

**What people do:** Check `user.email === 'roman@rideprestigo.com'` inside middleware or route handlers to determine admin access.

**Why it's wrong:** Brittle and non-scalable. Breaks if the operator changes their email or a second admin is added. The check lives in code, requiring a deploy for any admin roster change.

**Do this instead:** Set `is_admin: true` in `user.app_metadata` via Supabase Dashboard (Authentication > Users > edit user). Check `user.app_metadata?.is_admin === true` in middleware and route handlers. For v1.2 with a single operator, this is sufficient without custom auth hooks.

### Anti-Pattern 5: Creating `@supabase/ssr` Client as a Module-Level Singleton

**What people do:** `const supabase = createServerClient(...)` at the top of a module (outside the request handler function).

**Why it's wrong:** With Vercel Fluid compute and Next.js server components, the client must be created fresh per request because it captures the cookie state at construction time. A module-level singleton captures the cookies from the first request and reuses them for all subsequent requests.

**Do this instead:** Always create the SSR client inside the request handler function or Server Component function body.

---

## Sources

- [Setting up Server-Side Auth for Next.js — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) — HIGH confidence (official)
- [Creating a Supabase client for SSR — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — HIGH confidence (official)
- [Migrating to the SSR package from Auth Helpers — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers) — HIGH confidence (official)
- [Custom Claims & RBAC — Supabase Docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — HIGH confidence (official)
- [PostGIS: Geo queries — Supabase Docs](https://supabase.com/docs/guides/database/extensions/postgis) — HIGH confidence (official)
- [Managing JSON and unstructured data — Supabase Docs](https://supabase.com/docs/guides/database/json) — HIGH confidence (official)
- [Next.js Route Groups — Official Docs](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) — HIGH confidence (official)
- [Fetching and caching Supabase data in Next.js — Supabase Blog](https://supabase.com/blog/fetching-and-caching-supabase-data-in-next-js-server-components) — MEDIUM confidence (blog, consistent with official docs)
- [Next.js 13/14 stale data when changing RLS — Supabase Troubleshooting](https://supabase.com/docs/guides/troubleshooting/nextjs-1314-stale-data-when-changing-rls-or-table-data-85b8oQ) — HIGH confidence (official troubleshooting guide)
- Turf.js `@turf/boolean-point-in-polygon` — HIGH confidence (well-established geospatial library, no version concerns for this use case)

---

*Architecture research for: Prestigo v1.2 Operator Dashboard*
*Researched: 2026-04-01*
