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

---
---

# Architecture Research — Prestigo v1.3 Pricing & Booking Management

**Domain:** Integration architecture for 9 new features on top of v1.2 Next.js/Supabase/Stripe stack
**Researched:** 2026-04-03
**Confidence:** HIGH (all findings derived from direct codebase read — no external sources required for this integration analysis)

---

## System Overview: v1.3 Changes

The v1.2 architecture is sound and unchanged. v1.3 adds new DB tables, new API routes, and targeted modifications to two existing routes (`calculate-price` and `create-payment-intent`). No architectural shifts — only additive surface area.

```
┌───────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                          │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐   │
│  │  Booking Wizard      │  │      /admin/* pages              │   │
│  │  + promo code field  │  │  + holidays, promos, manual      │   │
│  │  (Zustand store)     │  │    booking, status, cancel,      │   │
│  │                      │  │    notes, mobile-responsive      │   │
│  └──────────┬───────────┘  └───────────────┬──────────────────┘   │
└─────────────┼──────────────────────────────┼─────────────────────┘
              │ fetch                         │ fetch (cookie auth)
┌─────────────▼──────────────────────────────▼─────────────────────┐
│                  Next.js Route Handlers (Vercel)                  │
│                                                                   │
│  MODIFIED:                        NEW:                            │
│  /api/calculate-price             /api/validate-promo             │
│  /api/create-payment-intent       /api/admin/holidays             │
│  /api/admin/pricing (Zod + col)   /api/admin/promos               │
│  /api/admin/bookings (+ POST)     /api/admin/bookings/[id]        │
│                                   /api/admin/bookings/[id]/cancel │
└──────────┬──────────────────────────────────┬────────────────────┘
           │                                  │
┌──────────▼──────────┐           ┌───────────▼───────────────────┐
│     Supabase        │           │          Stripe               │
│  EXISTING tables:   │           │  PaymentIntents (existing)    │
│  bookings           │           │  Refunds API (NEW use)        │
│  pricing_config     │           └───────────────────────────────┘
│  pricing_globals    │
│  coverage_zones     │
│                     │
│  NEW tables:        │
│  holiday_dates      │
│  promo_codes        │
│                     │
│  NEW columns:       │
│  bookings.status    │
│  bookings.operator_notes│
│  bookings.promo_code│
│  bookings.discount_eur│
│  pricing_config     │
│    .minimum_fare    │
└─────────────────────┘
```

---

## Integration Map: Feature by Feature

Each feature is classified as **MODIFY** (changes existing code) or **NEW** (net-new files/tables).

---

### 1. Zone Logic Fix (ZONES-06) — MODIFY only

**What changes:** `isOutsideAllZones` in `/api/calculate-price/route.ts` currently triggers `quoteMode: true` when EITHER point is outside a zone. This is a logic inversion: the current check returns price only when BOTH points are inside. The fix returns price when EITHER point is inside any zone; quoteMode only when NEITHER point is inside any zone.

**Current code (lines 132-138):**
```typescript
const originOutside = isOutsideAllZones(origin.lat, origin.lng, zones)
const destOutside = isOutsideAllZones(destination.lat, destination.lng, zones)
if (originOutside || destOutside) {
  return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
}
```

**Fixed logic:**
```typescript
const originInside = !isOutsideAllZones(origin.lat, origin.lng, zones)
const destInside   = !isOutsideAllZones(destination.lat, destination.lng, zones)
if (!originInside && !destInside) {
  return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
}
```

**Files modified:** `prestigo/app/api/calculate-price/route.ts` — one conditional, ~4 lines.
**No DB changes. No new routes. No client changes.**

---

### 2. Holiday Dates (PRICING-07) — NEW table + MODIFY two routes + NEW admin route

**New DB table (`0004_create_holiday_dates.sql`):**
```sql
CREATE TABLE holiday_dates (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE        NOT NULL UNIQUE,
  label      TEXT,                          -- e.g. "Christmas Day"
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE holiday_dates ENABLE ROW LEVEL SECURITY;
-- No public read — only service role reads this
CREATE POLICY "service_role_only" ON holiday_dates USING (false);
```

**How `calculate-price` reads holiday dates:**
The route already calls `createSupabaseServiceClient()` for zone lookup. The holiday lookup is a single additional query using the `pickupDate` already in the request body:
```typescript
const { data: holidayMatch } = await supabase
  .from('holiday_dates')
  .select('id')
  .eq('date', pickupDate)  // pickupDate is "YYYY-MM-DD"
  .maybeSingle()
const isHoliday = !!holidayMatch
```

`applyGlobals()` already has a comment: `// isHoliday deferred — no detection mechanism exists yet`. The `holidayCoefficient` is already in `PricingGlobals` and loaded from DB. The fix is to add the `isHoliday` boolean parameter and apply it:
```typescript
const coefficient = isNight
  ? globals.nightCoefficient
  : isHoliday
    ? globals.holidayCoefficient
    : 1.0
```

**`create-payment-intent` also needs the holiday check** — it independently recomputes price for server-side verification. The same lookup must be added there or the PaymentIntent amount will diverge from the displayed price on holiday dates.

**Recommended extraction:** Create `lib/pricing-helpers.ts` with:
```typescript
export async function isHolidayDate(date: string | null, supabase: SupabaseClient): Promise<boolean>
```
Both `calculate-price` and `create-payment-intent` call this helper to avoid duplication.

**New admin route:** `prestigo/app/api/admin/holidays/route.ts`
- GET: list all holiday_dates ordered by date
- POST: `{ date: string, label?: string }` — insert new row, validates date format
- DELETE `?id=`: remove holiday by id
- Auth guard: same `getAdminUser()` pattern from `admin/pricing/route.ts`

**Files modified:** `prestigo/app/api/calculate-price/route.ts`, `prestigo/app/api/create-payment-intent/route.ts`.
**Files new:** `prestigo/app/api/admin/holidays/route.ts`, `prestigo/lib/pricing-helpers.ts`.

---

### 3. Minimum Fare (PRICING-08) — MODIFY only (new DB column + code changes)

**New DB column:**
```sql
ALTER TABLE pricing_config ADD COLUMN minimum_fare NUMERIC(10,2) NOT NULL DEFAULT 0;
```

**`lib/pricing-config.ts` change:** Add `minimumFare: Record<string, number>` to `PricingRates` type and read `minimum_fare` column:
```typescript
minimumFare: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.minimum_fare ?? 0)])),
```

**Application point:** After all coefficients and airport fee are applied, before returning from `applyGlobals()`:
```typescript
const flooredBase = Math.max(adjustedBase, rates.minimumFare[vehicleClass] ?? 0)
```

The minimum fare is the absolute floor on base price. Extras (child seat, meet & greet, luggage) are additive on top and are always positive, so they need no floor check.

**`/api/admin/pricing` Zod schema update:** Add `minimum_fare: z.number().min(0)` to `pricingConfigSchema`.

**Admin pricing editor UI:** Add a "Minimum fare" field per vehicle class row. No new route — existing PUT handles it after the schema addition.

**Files modified:** `prestigo/app/api/calculate-price/route.ts`, `prestigo/app/api/create-payment-intent/route.ts`, `prestigo/lib/pricing-config.ts`, `prestigo/app/api/admin/pricing/route.ts`.

---

### 4. Promo Codes (PROMO-01 to PROMO-04) — NEW table + NEW routes + MODIFY wizard + MODIFY PaymentIntent

**New DB table (`0005_create_promo_codes.sql`):**
```sql
CREATE TABLE promo_codes (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code           TEXT        NOT NULL UNIQUE,   -- stored uppercase, matched case-insensitive
  discount_type  TEXT        NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,        -- percent: 0-100, fixed: EUR amount
  expires_at     TIMESTAMPTZ,                   -- NULL = no expiry
  usage_limit    INTEGER,                       -- NULL = unlimited
  usage_count    INTEGER     NOT NULL DEFAULT 0,
  active         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON promo_codes USING (false);
```

**New public validation route:** `prestigo/app/api/validate-promo/route.ts`
- POST `{ code: string, amountEur: number }`
- Rate-limited via existing `checkRateLimit()` from `lib/rate-limit.ts`
- Looks up code with `ilike` for case-insensitive match
- Checks: `active = true`, `expires_at IS NULL OR expires_at > NOW()`, `usage_limit IS NULL OR usage_count < usage_limit`
- Returns `{ valid: true, discountType, discountValue, discountedAmountEur }` or `{ valid: false, reason: string }`
- Does NOT increment `usage_count` — validation is read-only (UX only)

**Integration into `create-payment-intent`:**
1. Client sends `promoCode` string in `bookingData` (no discount amount — never trusted from client)
2. Route re-validates the code server-side (same query logic as validate-promo)
3. Applies discount to the server-computed total
4. Increments usage_count atomically:
   ```sql
   UPDATE promo_codes
   SET usage_count = usage_count + 1
   WHERE id = $id
   AND (usage_limit IS NULL OR usage_count < usage_limit)
   ```
   Postgres row-level lock prevents concurrent double-use for single-use codes
5. Creates PaymentIntent with discounted amount
6. Stores `promoCode` and `discountEur` in PaymentIntent metadata (for webhook → booking record)

**Preventing code reuse:** The atomic UPDATE WHERE clause is the enforcement gate. Race conditions on single-use codes are prevented by Postgres row locking — the first request gets the update, the second finds `usage_count >= usage_limit` and the condition fails.

**Wizard integration (PROMO-03):** Add promo code input to Step 4 (Extras) or Step 5 (Passenger Details). On blur/submit, client calls `POST /api/validate-promo`. Display discount feedback. Store `promoCode` (string) and `discountAmountEur` (number) in Zustand store — not persisted to sessionStorage (same pattern as `priceBreakdown`).

**New admin route:** `prestigo/app/api/admin/promos/route.ts`
- GET: list all promo_codes (paginated)
- POST: create new code (operator sets code, type, value, expiry, usage_limit)
- PATCH `?id=`: toggle `active` or update fields
- DELETE `?id=`: hard delete (soft delete via `active = false` preferred)

**New bookings columns for record-keeping:**
```sql
ALTER TABLE bookings ADD COLUMN promo_code   TEXT;
ALTER TABLE bookings ADD COLUMN discount_eur NUMERIC(10,2);
```
`buildBookingRow()` in `lib/supabase.ts` reads these from PaymentIntent metadata when available.

**Files new:** `prestigo/app/api/validate-promo/route.ts`, `prestigo/app/api/admin/promos/route.ts`.
**Files modified:** `prestigo/app/api/create-payment-intent/route.ts`, `prestigo/lib/supabase.ts` (`buildBookingRow`), `prestigo/lib/booking-store.ts` (add `promoCode` + `discountAmountEur` state, not persisted).

---

### 5. Manual Booking (BOOKINGS-06) — NEW POST handler on existing admin bookings route

**No Stripe involvement.** Admin fills a form; booking saved directly to Supabase via service role client.

**Add POST to `prestigo/app/api/admin/bookings/route.ts`:**
- Auth guard: existing `getAdminUser()`
- Accepts full booking payload matching `buildBookingRow` shape minus `payment_intent_id`
- Generates `bookingReference` server-side — extract `generateBookingReference()` from `create-payment-intent/route.ts` to a shared location (e.g., `lib/booking.ts`)
- Sets `payment_intent_id = null`, `booking_type = 'manual'`, `status = 'confirmed'`
- Saves via `createSupabaseServiceClient()` directly (no retry needed — admin action, not webhook)
- Optionally sends manager alert email via existing `sendManagerAlert()`

**Dedup consideration:** `saveBooking()` upserts on `payment_intent_id` UNIQUE. Manual bookings have `payment_intent_id = null`. Postgres allows multiple NULL values in a UNIQUE column — each manual booking gets its own row, no collision. The `booking_reference` is always unique by construction (timestamp + random suffix).

**Files modified:** `prestigo/app/api/admin/bookings/route.ts` (add POST handler).
**Files new:** Potentially `prestigo/lib/booking.ts` to export `generateBookingReference()`.

---

### 6. Booking Status (BOOKINGS-07) — NEW column + NEW PATCH route

**New DB column:**
```sql
ALTER TABLE bookings
  ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled'));
```

`DEFAULT 'confirmed'` is correct — existing Stripe-webhook-saved bookings all should be `confirmed`. Manual bookings can be `pending` until operator confirms.

**New route:** `prestigo/app/api/admin/bookings/[id]/route.ts`
- PATCH: `{ status?: 'pending' | 'confirmed' | 'completed' | 'cancelled', operatorNotes?: string }`
- Auth guard: `getAdminUser()`
- Updates via service client: `supabase.from('bookings').update(updates).eq('id', id)`
- Returns `{ ok: true }`

The PATCH handler accepts a partial payload — either field, or both together.

**Files new:** `prestigo/app/api/admin/bookings/[id]/route.ts`.
**Files modified:** `prestigo/lib/supabase.ts` (`buildBookingRow` defaults `status: 'confirmed'`).

---

### 7. Cancellation + Stripe Refund (BOOKINGS-08) — NEW route

**New route:** `prestigo/app/api/admin/bookings/[id]/cancel/route.ts`
- POST: `{ refund: boolean, refundAmountCents?: number }`
- Auth guard: `getAdminUser()`
- Fetches booking by id (service client) to get `payment_intent_id`, `amount_czk`, `amount_eur`
- If `refund: true` and `payment_intent_id` is not null:
  ```typescript
  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(refundAmountCents ? { amount: refundAmountCents } : {}),
  })
  ```
- Updates `status = 'cancelled'` via service client
- Returns `{ ok: true, refundId?: string }`
- Manual bookings (`payment_intent_id = null`): skip Stripe call, update status only

**Critical Vercel Hobby pattern — must replicate from `create-payment-intent`:**
```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
  maxNetworkRetries: 0,
})
```

**Files new:** `prestigo/app/api/admin/bookings/[id]/cancel/route.ts`.

---

### 8. Operator Notes (BOOKINGS-09) — NEW column, HANDLED by existing [id] PATCH route

**Two options evaluated:**

| Option | Complexity | Query cost | Audit trail |
|--------|-----------|------------|-------------|
| `booking_notes` separate table | High (JOIN, migrations, types) | JOIN on every bookings fetch | Yes (versioned) |
| `operator_notes TEXT` column on bookings | Low (one migration, one field) | None | No (last-write-wins) |

**Recommendation: single column.** Spec says "add internal notes" — no history requirement. One admin, one operator, no versioning needed.

```sql
ALTER TABLE bookings ADD COLUMN operator_notes TEXT;
```

**Handled by the same PATCH handler created for status** (Step 6). No additional route needed.

---

### 9. Mobile Admin (UX-01) — NO new libraries, NO new routes

Pure Tailwind responsive classes. No npm installs.

**Approach per component type:**

| Component | Mobile fix |
|-----------|-----------|
| Data tables (TanStack) | Wrap in `overflow-x-auto`; hide less-critical columns on `sm` with `hidden sm:table-cell` |
| Admin sidebar | Collapse to hamburger/drawer on `sm`; `md:flex` for desktop |
| Form inputs | `w-full` instead of fixed widths |
| Stats cards | `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` |
| Recharts | Already uses `ResponsiveContainer` — no change needed |
| Terra Draw zone map | Show "Use desktop for zone editing" message on `sm`; acceptable trade-off |

**No new dependencies. No new API routes.**

---

## New DB Schema Changes (Complete List)

| Table | Change | Migration file |
|-------|--------|---------------|
| `holiday_dates` | NEW TABLE | `0004_create_holiday_dates.sql` |
| `promo_codes` | NEW TABLE | `0005_create_promo_codes.sql` |
| `bookings.status` | ADD COLUMN `TEXT NOT NULL DEFAULT 'confirmed'` | `0006_bookings_v13_columns.sql` |
| `bookings.operator_notes` | ADD COLUMN `TEXT` | `0006_bookings_v13_columns.sql` |
| `bookings.promo_code` | ADD COLUMN `TEXT` | `0006_bookings_v13_columns.sql` |
| `bookings.discount_eur` | ADD COLUMN `NUMERIC(10,2)` | `0006_bookings_v13_columns.sql` |
| `pricing_config.minimum_fare` | ADD COLUMN `NUMERIC(10,2) NOT NULL DEFAULT 0` | `0007_pricing_minimum_fare.sql` |

Group all four bookings column additions into one migration (`0006`) for atomic rollback. Keep `pricing_config` change separate (`0007`) since it has different rollback implications.

---

## New and Modified API Routes (Complete List)

### New routes

| Route | Method(s) | Auth | Purpose |
|-------|-----------|------|---------|
| `/api/validate-promo` | POST | none (public, rate-limited) | Client-facing promo code validation (read-only) |
| `/api/admin/holidays` | GET, POST, DELETE | admin | Holiday date CRUD |
| `/api/admin/promos` | GET, POST, PATCH, DELETE | admin | Promo code CRUD |
| `/api/admin/bookings/[id]` | PATCH | admin | Update booking status and/or operator notes |
| `/api/admin/bookings/[id]/cancel` | POST | admin | Cancel booking + optional Stripe refund |

### Modified routes

| Route | What changes |
|-------|-------------|
| `/api/calculate-price` | Zone logic inversion (ZONES-06), holiday date lookup, minimum fare floor |
| `/api/create-payment-intent` | Holiday check, minimum fare floor, promo validation + atomic usage_count increment |
| `/api/admin/pricing` | Zod schema + upsert updated for `minimum_fare` column |
| `/api/admin/bookings` | Add POST handler for manual booking creation |

---

## Data Flow Changes

### Price Calculation Flow (v1.3)

```
POST /api/calculate-price
    ↓
1. Rate-limit check (existing)
2. Parse body: origin, destination, tripType, pickupDate, pickupTime, isAirport (existing)
3. Load pricing rates from pricing_config + pricing_globals (existing)
   - now includes minimum_fare per vehicle class (NEW)
4. Airport detection by coordinates (existing)
5. Night time detection (existing)
6. Holiday detection (NEW):
   SELECT id FROM holiday_dates WHERE date = pickupDate LIMIT 1
7. Zone check for transfer trips (MODIFIED):
   originInside OR destInside → price; neither inside → quoteMode
8. Google Routes API for distance (existing)
9. buildPriceMap() (existing)
10. applyGlobals():
    - apply night OR holiday coefficient (MODIFIED — holiday now active)
    - add airport fee (existing)
    - apply minimum fare floor per vehicle class (NEW)
    ↓
return { prices, distanceKm, quoteMode: false }
```

### Promo Code Flow

```
Wizard Step 4/6: user enters promo code
    ↓ POST /api/validate-promo { code, amountEur }
    ↓ SELECT from promo_codes WHERE code ILIKE $1 AND active = true
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (usage_limit IS NULL OR usage_count < usage_limit)
    ↓ Returns { valid, discountType, discountValue, discountedAmountEur }
Zustand stores: promoCode (string), discountAmountEur (number) — NOT persisted to sessionStorage
    ↓
Step 6: proceed to payment
    ↓ POST /api/create-payment-intent { bookingData: { ...existing, promoCode } }
Server re-validates promoCode (never trusts client discount amount)
Server computes discount on server-computed total
    ↓ UPDATE promo_codes SET usage_count = usage_count + 1
      WHERE id = $id AND (usage_limit IS NULL OR usage_count < usage_limit)
      (atomic — Postgres prevents concurrent over-use of single-use codes)
    ↓ stripe.paymentIntents.create({ amount: discountedAmountCents, metadata: { promoCode, discountEur } })
    ↓ Returns { clientSecret, bookingReference }
Stripe webhook: payment_intent.succeeded
    ↓ buildBookingRow reads promoCode + discountEur from PaymentIntent metadata
    ↓ Saves to bookings with promo_code + discount_eur columns populated
```

### Manual Booking Flow (admin)

```
Admin fills form at /admin/bookings/new
    ↓ POST /api/admin/bookings { full booking payload }
Server: getAdminUser() — verify session + is_admin
Server: generateBookingReference() → "PRG-YYYYMMDD-XXXX"
Server: INSERT INTO bookings { ...payload, payment_intent_id: null, booking_type: 'manual', status: 'confirmed' }
Server: sendManagerAlert() (optional — uses existing Resend integration)
    ↓ Returns { ok: true, bookingReference }
Admin redirected to booking detail — new entry visible in bookings list
```

### Cancellation + Refund Flow

```
Admin clicks Cancel on booking
    ↓ POST /api/admin/bookings/[id]/cancel { refund: true, refundAmountCents?: number }
Server: getAdminUser()
Server: SELECT payment_intent_id FROM bookings WHERE id = $id
IF payment_intent_id IS NOT NULL AND refund = true:
    ↓ stripe.refunds.create({ payment_intent: paymentIntentId, amount?: refundAmountCents })
    ↓ Stripe returns { id: refundId, status: 'succeeded' | 'pending' }
Server: UPDATE bookings SET status = 'cancelled' WHERE id = $id
    ↓ Returns { ok: true, refundId? }
Admin sees booking status updated to "cancelled" in list
```

---

## Recommended Build Order

| Step | Feature | Dependency |
|------|---------|------------|
| 1 | DB migrations: `0004_create_holiday_dates.sql`, `0005_create_promo_codes.sql` | None — run first |
| 2 | DB migrations: `0006_bookings_v13_columns.sql` (status, operator_notes, promo_code, discount_eur) | None — run first |
| 3 | DB migrations: `0007_pricing_minimum_fare.sql` | None — run first |
| 4 | Zone logic fix (ZONES-06) | No DB deps — quick win, fixes existing bug |
| 5 | Holiday dates: admin route + `calculate-price` integration + `create-payment-intent` integration | Needs `0004` migration (Step 1) |
| 6 | Minimum fare: `pricing-config.ts` type update + both API routes + admin pricing editor | Needs `0007` migration (Step 3) |
| 7 | Promo codes: `validate-promo` route + admin promos route | Needs `0005` migration (Step 1) |
| 8 | Promo integration: `create-payment-intent` + Zustand store + wizard UI | Needs `validate-promo` route (Step 7) and `0006` migration (Step 2) for booking columns |
| 9 | Booking status: extract `generateBookingReference()`, add POST to admin bookings route | Needs `0006` migration (Step 2) |
| 10 | PATCH `/api/admin/bookings/[id]` for status + operator notes | Needs `0006` migration (Step 2) |
| 11 | Cancel + Stripe refund route | Needs status column (Steps 2, 10) |
| 12 | Admin UI for holidays, promos, manual booking form, status/notes/cancel controls | Needs all above routes complete |
| 13 | Mobile admin responsive pass | Last — pure Tailwind, no blockers, easier after all new UI exists |

Steps 4, 5, 6, 7 can be parallelized — they touch different files. Steps 9 and 10 can be batched in the same phase (they share the `[id]` route file).

---

## Component Responsibilities (v1.3 Changes)

| Component | Type | Responsibility |
|-----------|------|----------------|
| `/api/calculate-price/route.ts` | Modified | Zone logic inversion, holiday lookup, minimum fare floor |
| `/api/create-payment-intent/route.ts` | Modified | Holiday check, minimum fare, promo validation + atomic usage_count increment |
| `/api/admin/pricing/route.ts` | Modified | Zod schema + upsert updated for `minimum_fare` |
| `/api/admin/bookings/route.ts` | Modified | Add POST handler for manual booking creation |
| `/api/validate-promo/route.ts` | New | Public promo validation — read-only, rate-limited |
| `/api/admin/holidays/route.ts` | New | GET/POST/DELETE holiday_dates |
| `/api/admin/promos/route.ts` | New | GET/POST/PATCH/DELETE promo_codes |
| `/api/admin/bookings/[id]/route.ts` | New | PATCH status and/or operator_notes |
| `/api/admin/bookings/[id]/cancel/route.ts` | New | Cancel + optional Stripe refund |
| `lib/pricing-config.ts` | Modified | Add `minimumFare` to `PricingRates` type, read `minimum_fare` column |
| `lib/pricing-helpers.ts` | New | `isHolidayDate()` shared by calculate-price and create-payment-intent |
| `lib/supabase.ts` (`buildBookingRow`) | Modified | Add `status`, `promo_code`, `discount_eur` to row builder |
| `lib/booking.ts` | New | Extract `generateBookingReference()` for sharing between webhook and manual booking |
| `lib/booking-store.ts` | Modified | Add `promoCode` + `discountAmountEur` state (not persisted to sessionStorage) |
| Admin holidays page | New | Date picker + list UI for holiday_dates |
| Admin promo codes page | New | Table + form for promo_codes CRUD |
| Admin booking list | Modified | Add status badge, notes field, Cancel action, manual-create link |
| Admin pricing editor | Modified | Add minimum fare field per vehicle class |
| Wizard Step 4 or Step 5 | Modified | Promo code input + validation feedback display |

---

## Anti-Patterns to Avoid (v1.3 specific)

### Anti-Pattern 1: Trust Client-Sent Discount Amount

**What people do:** Client sends `discountedAmountEur` from the validate-promo response; server creates PaymentIntent at that amount.
**Why it's wrong:** Request can be intercepted and the amount modified. A 200 EUR booking becomes a 0 EUR payment.
**Do this instead:** Client sends only `promoCode` (string). Server re-validates and computes the discount independently.

### Anti-Pattern 2: Increment `usage_count` in `validate-promo`

**What people do:** Increment the usage counter at the point of UI validation (when user types the code).
**Why it's wrong:** User may validate multiple times or abandon the wizard. The code gets exhausted without a completed booking.
**Do this instead:** Increment only inside `create-payment-intent`, immediately before `stripe.paymentIntents.create`. Accept the rare edge case where a Stripe creation failure after increment leaves the count slightly inflated — this is less harmful than over-exhausting codes pre-payment.

### Anti-Pattern 3: Omit `Stripe.createFetchHttpClient()` in the Cancel Route

**What people do:** `new Stripe(key)` without specifying httpClient in the new cancel route.
**Why it's wrong:** Vercel Hobby does not support Node.js http module. The existing `create-payment-intent` route already solves this. The cancel route is a new file and must replicate the pattern.
**Do this instead:** Always use `Stripe.createFetchHttpClient()` and `maxNetworkRetries: 0` in every new Stripe-using route handler.

### Anti-Pattern 4: Separate Table for Operator Notes

**What people do:** Create a `booking_notes` table anticipating future versioning.
**Why it's wrong:** No history requirement in spec. One admin. Adds JOIN complexity and migration overhead for zero benefit.
**Do this instead:** Single `operator_notes TEXT` column on the bookings table.

### Anti-Pattern 5: Holiday Check Only in `calculate-price`

**What people do:** Add holiday detection to the display-price route but not to `create-payment-intent`.
**Why it's wrong:** The two routes independently compute prices. If only one applies the holiday coefficient, the PaymentIntent amount diverges from the displayed price — client pays the wrong amount.
**Do this instead:** Extract `isHolidayDate()` to `lib/pricing-helpers.ts` and call it in both routes.

### Anti-Pattern 6: Storing `discountAmountEur` in sessionStorage

**What people do:** Persist the promo discount in sessionStorage alongside other Zustand state.
**Why it's wrong:** If the operator deactivates or expires the promo between the user entering it and completing payment, the stored discount would still show but the server would reject it. More importantly, priceBreakdown already follows the "not persisted" pattern intentionally.
**Do this instead:** Do not include `promoCode` or `discountAmountEur` in the `partialize` list. They are re-entered or re-fetched each session.

---

## Scaling Considerations

| Concern | At current scale (Vercel Hobby) | Notes |
|---------|--------------------------------|-------|
| Holiday lookup on every price calculation | Tiny table (<50 rows/year), fast index on `date` column | Add `CREATE INDEX ON holiday_dates (date)` in migration |
| Promo code race conditions | Postgres row-level lock on the atomic UPDATE WHERE handles concurrent requests | Acceptable — promo validation is low-frequency relative to price checks |
| Manual bookings without Stripe source of truth | No webhook — notification depends only on `sendManagerAlert()` | Use the existing `withRetry()` pattern if saving fails |
| Stripe refund latency in serverless | Stripe responds in ~200ms — within Vercel function timeout | No async needed |

---

## Sources

- Codebase read directly — HIGH confidence: `prestigo/app/api/calculate-price/route.ts`, `prestigo/app/api/create-payment-intent/route.ts`, `prestigo/app/api/webhooks/stripe/route.ts`, `prestigo/app/api/admin/bookings/route.ts`, `prestigo/app/api/admin/pricing/route.ts`, `prestigo/lib/pricing-config.ts`, `prestigo/lib/pricing.ts`, `prestigo/lib/supabase.ts`, `prestigo/lib/booking-store.ts`, `supabase/migrations/0001_create_bookings.sql`, `supabase/migrations/0002_create_pricing_config.sql`, `supabase/migrations/0003_create_coverage_zones.sql`
- Stripe Refunds API: standard REST endpoint, established pattern, HIGH confidence from existing Stripe integration in codebase
- Postgres UNIQUE constraint behavior with NULL values: multiple NULLs allowed per SQL standard — HIGH confidence
- Postgres row-level locking on UPDATE WHERE for concurrent usage_count increment — HIGH confidence (standard SQL semantics)

---

*Architecture research for: Prestigo v1.3 Pricing & Booking Management*
*Researched: 2026-04-03*
