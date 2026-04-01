# Pitfalls Research — v1.2 Operator Dashboard

**Domain:** Adding Supabase Auth, polygon zones editor, Supabase config table, and admin dashboard to an existing Next.js 14 App Router + Supabase production booking site.
**Researched:** 2026-04-01
**Confidence:** HIGH (all critical findings verified against official Supabase docs, Next.js docs, and multiple community sources)

> This document covers ONLY new pitfalls introduced by v1.2 features.
> v1.1 pitfalls (Stripe webhook, Resend domain, Google Maps key types, Vercel env scoping) are documented in the archived milestone and remain valid — do not re-do that work.

---

## Area 1: Supabase Auth Middleware — Next.js 14 App Router

### Pitfall 1A: Infinite Redirect Loop Because Cookies Are Written to Only One Side

**Risk level:** CRITICAL

**What goes wrong:**
The user signs in successfully. `signInWithPassword` resolves, the session is created client-side. But when the user navigates to `/admin`, the middleware runs, finds no valid session cookie in the request, and redirects to `/login`. The user is now in an infinite loop: login → redirect to `/admin` → middleware finds no cookie → redirect to `/login`.

The loop is not always obvious from the browser — it may manifest as the `/admin` page never loading, or as a blank page with no error. Supabase does not throw; it silently returns no session.

**Why it happens:**
The middleware must write the refreshed session token to **both** the request object (so Server Components see it) and the response object (so the browser stores it). A common mistake is updating only `response.cookies` but not `request.cookies`, or vice versa. When the response cookie is not set, the browser never stores the JWT and the next request arrives without credentials.

**Prevention:**
Follow the exact two-pass pattern from the official `@supabase/ssr` docs:

```typescript
// utils/supabase/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Pass 1: update the request so Server Components see the refreshed token
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Re-create the response with the updated request
          supabaseResponse = NextResponse.next({ request });
          // Pass 2: set the cookie on the response so the browser stores it
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // MUST call getUser() here — this triggers the refresh cycle
  await supabase.auth.getUser();
  return supabaseResponse;
}
```

**Warning signs:**
- Login form submits, no error, but `/admin` never loads.
- Browser DevTools Network tab shows a chain of 302 redirects between `/admin` and `/login`.
- `document.cookie` in the browser console is empty after successful login.
- Works in local dev (where cookies may persist differently) but breaks in production.

**Phase to address:** Phase 1 — Auth Setup (middleware implementation)

---

### Pitfall 1B: `getSession()` Used in Middleware Instead of `getClaims()` or `getUser()`

**Risk level:** HIGH

**What goes wrong:**
`supabase.auth.getSession()` is used in middleware to check whether a user is authenticated. The check passes even for tampered or expired tokens because `getSession()` reads from the cookie as-is without verifying the JWT signature. An attacker who can fabricate a valid-looking (but expired or revoked) cookie can bypass admin route protection.

**Why it happens:**
`getSession()` is the most visible auth method in older Supabase tutorials and the v1.x `@supabase/auth-helpers-nextjs` documentation. It appears to work — it returns a session object — but it does not cryptographically verify the token server-side.

**Prevention:**
Use `getClaims()` for route protection. It validates the JWT signature against the project's published public keys (JWKS endpoint), usually without a network round-trip once the keys are cached. Use `getUser()` if you need to verify the user is not banned/deleted at the Supabase Auth level (slower — always hits the Auth server).

```typescript
// In a Server Component or Route Handler protecting /admin:
const { data, error } = await supabase.auth.getClaims();
if (error || !data) redirect("/login");
```

Do NOT use `getSession()` anywhere in server-side code (middleware, Server Components, Route Handlers). The Supabase docs state explicitly: "Never trust `supabase.auth.getSession()` inside server code — it isn't guaranteed to revalidate the Auth token."

**Warning signs:**
- Auth check passes for a cookie that was manually modified in DevTools.
- Session appears valid after the user's Supabase account is deleted.
- No errors in development, but Supabase Dashboard shows the token is expired.

**Phase to address:** Phase 1 — Auth Setup (route protection logic)

---

### Pitfall 1C: `middleware.ts` Placed in Wrong Directory

**Risk level:** MEDIUM

**What goes wrong:**
The project uses a `src/` directory layout. `middleware.ts` is placed at the project root (`/middleware.ts`) instead of `/src/middleware.ts`. Next.js silently ignores the root-level file when using the `src/` convention. No middleware runs. All `/admin` routes are publicly accessible — no redirect to login.

**Why it happens:**
Most Supabase and Next.js examples in the wild show `middleware.ts` at the root, because those examples don't use `src/`. The project structure is `prestigo/src/app/...`, so the middleware must live at `prestigo/src/middleware.ts`.

**Prevention:**
Confirm the project's directory layout before placing the file. If `app/` lives inside `src/`, then `middleware.ts` must also live inside `src/`. After placing it, verify it runs by adding a `console.log('middleware hit:', request.nextUrl.pathname)` and loading any page in dev mode — the log must appear in the terminal.

**Warning signs:**
- `/admin` routes render without redirect when not authenticated.
- No middleware-related logs in the Vercel function logs.
- Changes to middleware code have no effect.

**Phase to address:** Phase 1 — Auth Setup (file placement verification)

---

### Pitfall 1D: CDN-Cached Response Contains Another User's Session Cookie

**Risk level:** HIGH (edge case, but catastrophic when hit)

**What goes wrong:**
When `@supabase/ssr` refreshes a session token server-side, it writes the updated JWT to the response via a `Set-Cookie` header. If Vercel Edge or another CDN caches that response and serves it to a different user, the second user's browser stores the first user's JWT. The second user is now signed in as the first user's admin account.

**Why it happens:**
Pages that require authentication must not be cached by any CDN. Without explicit cache-control directives, Next.js may allow a response containing a `Set-Cookie` header to be served from edge cache.

**Prevention:**
Mark all auth-sensitive pages as non-cacheable. In Next.js App Router, add this to any page or layout inside `/admin`:

```typescript
export const dynamic = "force-dynamic";
```

As of `@supabase/ssr` v0.10.0, the library automatically passes `Cache-Control: no-store`, `Expires: 0`, and `Pragma: no-cache` to the `setAll` cookie callback when a refresh occurs. Ensure your `setAll` implementation applies these headers to the response — the pattern from Pitfall 1A does this correctly via `supabaseResponse = NextResponse.next({ request })`.

**Warning signs:**
- Two different admin sessions appear to share data or see each other's state.
- Supabase Auth logs show a session being used from two different IP addresses simultaneously.
- Vercel Analytics shows identical response content being served for auth-protected routes.

**Phase to address:** Phase 1 — Auth Setup (cache headers verification)

---

### Pitfall 1E: Service Role Client Accidentally Initialized with SSR Cookies in Admin Route Handlers

**Risk level:** HIGH**

**What goes wrong:**
This pitfall already exists and was documented for v1.1 (Pitfall 4 in the archived research). It becomes relevant again in v1.2 because new Route Handlers will be added for the admin dashboard. If any admin Route Handler uses `createServerClient` from `@supabase/ssr` where a service-role client is needed (e.g., to write pricing config or update booking status), the user's JWT from cookies overrides the service role key and RLS blocks the write silently.

**Prevention:**
Maintain the existing separation: `createSupabaseServiceClient()` in `lib/supabase.ts` uses `createClient()` directly with `persistSession: false, autoRefreshToken: false, detectSessionInUrl: false`. Never refactor this to an SSR client. New admin Route Handlers that need elevated database access must import from `lib/supabase.ts`, not from `utils/supabase/server.ts`.

**Phase to address:** All phases that add new Route Handlers for admin operations.

---

## Area 2: GeoJSON Polygon Storage in Supabase

### Pitfall 2A: PostGIS Extension Not Enabled — Columns Silently Reject Geometry Types

**Risk level:** CRITICAL

**What goes wrong:**
A `coverage_zones` table is created with a column intended to store polygon geometry. PostGIS is not enabled on the Supabase project. The column is created as `TEXT` or `JSONB` as a workaround. Later, spatial queries (`ST_Contains`, `ST_Intersects`) cannot be run against text/JSONB data. The booking wizard's zone-containment check (is the pickup point inside a defined zone?) must be done in application code with a polygon-in-point algorithm instead of a single SQL query, adding complexity and fragility.

Alternatively, if the developer creates the column as `geometry(Polygon, 4326)` before enabling PostGIS, the `CREATE TABLE` statement fails with `type "geometry" does not exist`.

**Prevention:**
Enable PostGIS in the Supabase Dashboard before creating the table: Database → Extensions → search "postgis" → enable. Then create the `coverage_zones` table with a `geometry(Polygon, 4326)` column. Add a spatial GiST index immediately:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE coverage_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  polygon geometry(Polygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX coverage_zones_polygon_idx ON coverage_zones USING GIST (polygon);
```

**Warning signs:**
- `CREATE TABLE` fails with `type "geometry" does not exist`.
- Zone containment checks require loading all polygon coordinates into memory in the application.
- No `postgis` entry visible in the Supabase Dashboard under Extensions.

**Phase to address:** Phase 2 — Coverage Zones (database schema step)

---

### Pitfall 2B: PostGIS Returns Hex-Encoded WKB, Not GeoJSON

**Risk level:** HIGH

**What goes wrong:**
The coverage zones are stored correctly as PostGIS geometry. When queried via `supabase-js` (which calls the PostgREST API), the polygon column returns a hex-encoded Well-Known Binary (WKB) string like `0103000020E6100000...` instead of a GeoJSON object. The frontend map renderer (vis.gl `<Polygon>`) expects GeoJSON coordinates, not WKB. The polygon cannot be rendered.

**Why it happens:**
PostgREST serializes `geometry` columns as WKB hex by default. This is standard behavior — it is not a bug.

**Prevention:**
Use `ST_AsGeoJSON()` in a database view or a Postgres function to return the polygon as GeoJSON:

```sql
CREATE OR REPLACE VIEW coverage_zones_geojson AS
SELECT
  id,
  name,
  ST_AsGeoJSON(polygon)::json AS polygon,
  created_at
FROM coverage_zones;
```

Then query the view instead of the table directly:

```typescript
const { data } = await supabase
  .from("coverage_zones_geojson")
  .select("id, name, polygon");
```

For inserts, use `ST_GeomFromGeoJSON()` to convert incoming GeoJSON back to geometry:

```sql
INSERT INTO coverage_zones (name, polygon)
VALUES ($1, ST_GeomFromGeoJSON($2));
```

**Warning signs:**
- Frontend map receives a hex string where it expects `{ type: "Polygon", coordinates: [...] }`.
- Polygon column value in Supabase Table Editor shows a long hex string.
- `vis.gl/react-google-maps` `<Polygon>` throws a type error or renders nothing.

**Phase to address:** Phase 2 — Coverage Zones (data layer)

---

### Pitfall 2C: terra-draw Outputs Coordinates as [lng, lat] — Google Maps Expects [lat, lng]

**Risk level:** HIGH

**What goes wrong:**
terra-draw follows the GeoJSON spec and outputs coordinates in `[longitude, latitude]` order. PostGIS also uses `[longitude, latitude]` by convention (EPSG:4326). However, many Google Maps APIs (including the Maps JavaScript API `Polygon` constructor and `vis.gl/react-google-maps` `<Polygon>` paths) expect coordinates as `{ lat, lng }` objects or `[latitude, longitude]` pairs. If coordinates are passed in the wrong order, polygons render in the ocean near the Null Island (0°N, 0°E).

**Prevention:**
Establish a clear conversion boundary in code. Store and retrieve in GeoJSON `[lng, lat]` order (PostGIS native). Convert to `{ lat, lng }` objects only at the final rendering step in the React component:

```typescript
// GeoJSON coordinates [lng, lat] → Google Maps { lat, lng }
function geoJsonToGooglePath(
  coordinates: [number, number][]
): google.maps.LatLngLiteral[] {
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}
```

Never convert mid-pipeline. Write a unit test for this function — this class of bug is invisible until you look at the map.

**Warning signs:**
- Polygon appears to render but is located in the ocean or at coordinates near (0, 0).
- Polygon coordinates printed in logs have plausible-looking numbers but the wrong sign or order.
- Coverage zone containment check always returns false for points in Prague.

**Phase to address:** Phase 2 — Coverage Zones (coordinate handling)

---

### Pitfall 2D: Missing Spatial Index Causes Full-Table Scans on Zone Containment Check

**Risk level:** MEDIUM (low impact now, grows with data)

**What goes wrong:**
The booking wizard calls a server-side API to check if a pickup or dropoff point is within any defined coverage zone. Without a spatial GiST index on the `polygon` column, PostgreSQL performs a sequential scan of every polygon in the table for every price-calculation request. At a small number of zones this is imperceptible, but it is still wrong practice and will degrade as zones are added.

**Prevention:**
The index is included in Pitfall 2A's schema. If the table was created without it, add it:

```sql
CREATE INDEX coverage_zones_polygon_idx ON coverage_zones USING GIST (polygon);
```

The zone containment query in the booking wizard API route:

```sql
SELECT id, name FROM coverage_zones
WHERE ST_Contains(polygon, ST_GeomFromText('POINT(14.4378 50.0755)', 4326));
```

**Phase to address:** Phase 2 — Coverage Zones (schema, added to creation migration)

---

## Area 3: Pricing Logic Migration — Hardcoded File to Supabase Table

### Pitfall 3A: Big-Bang Cutover Breaks Live Bookings During Deployment

**Risk level:** CRITICAL

**What goes wrong:**
The existing `lib/pricing.ts` is deleted and the pricing API route is rewritten to fetch from a new Supabase `pricing_config` table in a single deployment. Between the moment the old code is removed and the moment the new Supabase table is seeded with data, any price-calculation request returns nothing. The booking wizard receives an empty or null price and either shows `NaN` to the user or falls back to quote mode for all routes — breaking the core booking flow for real customers during the deployment window.

**Why it happens:**
Treating the migration as a one-step swap rather than a gradual handover.

**Prevention:**
Use a three-phase dual-read migration — do not delete `lib/pricing.ts` until Phase 3 is complete:

**Phase 1 — Add the table, seed it:**
Create the `pricing_config` table in Supabase. Seed it with the exact values currently in `lib/pricing.ts`. Verify the seed data is correct before touching application code.

**Phase 2 — Deploy with fallback:**
Update the pricing API route to attempt a Supabase fetch first, falling back to the hardcoded values in `lib/pricing.ts` if the database returns empty or errors:

```typescript
async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from("pricing_config")
      .select("*")
      .single();
    if (error || !data) throw error;
    return data;
  } catch {
    // Fallback to hardcoded values — never silently remove this until DB is confirmed stable
    return HARDCODED_PRICING;
  }
}
```

**Phase 3 — Remove fallback (next milestone or after verification):**
After confirming the database-driven pricing works correctly in production for several real bookings, remove the fallback and delete `lib/pricing.ts`.

**Warning signs:**
- Booking wizard shows `NaN` or `undefined` prices after deployment.
- All routes enter quote mode simultaneously.
- Supabase logs show `pricing_config` table exists but has zero rows.

**Phase to address:** Phase 3 — Pricing Editor (migration step)

---

### Pitfall 3B: Pricing Config Cached Aggressively — Operator Edits Not Reflected Immediately

**Risk level:** MEDIUM

**What goes wrong:**
The pricing API route is a Next.js Route Handler that fetches from Supabase. Without explicit cache control, Next.js 14 App Router may cache the response at the edge (depending on how `fetch` is used inside Route Handlers). The operator updates a base rate in the admin dashboard, saves it, and then tests a booking — but sees the old price because the cached response is still being served. The operator believes the editor is broken.

**Why it happens:**
Next.js 14 extended `fetch` with cache semantics. Route Handlers that use `fetch` internally may opt into caching unintentionally. Supabase's JS client (`supabase-js`) uses `fetch` internally.

**Prevention:**
Mark the pricing config fetch as non-cacheable, or use `cache: "no-store"` when calling the Supabase REST endpoint directly. In App Router Route Handlers, add:

```typescript
export const dynamic = "force-dynamic";
```

at the top of the `/api/calculate-price/route.ts` file. This ensures every request to the pricing route fetches fresh data from Supabase. For better performance on a high-traffic route, implement a short in-memory cache (30–60 seconds) with explicit invalidation on admin writes — but this is optional at v1.2 scale.

**Warning signs:**
- Operator saves a new base rate in the pricing editor but booking wizard shows the old price.
- Price updates appear after ~5 minutes (consistent with Vercel's default edge cache TTL).
- Clearing browser cache or making the request from a different device shows the new price.

**Phase to address:** Phase 3 — Pricing Editor (cache headers on the pricing API route)

---

### Pitfall 3C: Pricing Config Table Has No RLS — Any Authenticated User Can Write Rates

**Risk level:** HIGH

**What goes wrong:**
A `pricing_config` table is created and RLS is enabled. An `authenticated` role SELECT policy is added so the pricing API can read rates. But no explicit restriction prevents any authenticated Supabase user from updating the table. Since the project will have only one admin, this seems harmless — but if the admin auth account is ever compromised (or if the anon key is used to auth in a test), any authenticated session can overwrite pricing for all future bookings.

**Prevention:**
Use the role-check pattern on write operations. The admin user should have a custom claim (e.g., `app_role: 'admin'`) set via a Supabase database function or manually in Supabase Dashboard user metadata. Write policies check this claim:

```sql
-- Allow anyone authenticated to read pricing (pricing API needs this)
CREATE POLICY "pricing_config_select" ON pricing_config
  FOR SELECT TO authenticated USING (true);

-- Only admin role can modify pricing
CREATE POLICY "pricing_config_admin_write" ON pricing_config
  FOR ALL TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');
```

Use `app_metadata` (not `user_metadata`) for the role claim — `user_metadata` can be modified by the end user and must never be trusted in security policies.

**Warning signs:**
- Any authenticated user can UPDATE `pricing_config` rows via the Supabase client without an explicit permission error.
- Supabase Table Editor shows the policy configuration allows writes from the `authenticated` role without a role check.

**Phase to address:** Phase 3 — Pricing Editor (RLS policies)

---

## Area 4: Admin-Only RLS — Bookings Table and Admin Tables

### Pitfall 4A: RLS Disabled by Default — New Tables Are Publicly Readable

**Risk level:** CRITICAL

**What goes wrong:**
Any new table created without explicitly enabling RLS is fully readable and writable by the `anon` role (i.e., any request using the public anon key — including every visitor to the booking site). A `bookings` table without RLS means anyone can execute `supabase.from('bookings').select('*')` from the browser and retrieve all customer names, emails, phone numbers, flight numbers, and payment amounts. GDPR violation with immediate exposure.

The existing `bookings` table from v1.1 may already have RLS enabled — verify this before adding the bookings list to the admin dashboard, as the admin dashboard will need read access.

**Prevention:**
Enable RLS on every table at creation time:

```sql
ALTER TABLE coverage_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
```

For the admin dashboard, never add a public SELECT policy on `bookings`. Add an admin-only policy:

```sql
-- Admin can read all bookings
CREATE POLICY "bookings_admin_select" ON bookings
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Webhook service role still writes (service role bypasses RLS — no policy needed)
```

Audit all tables in the Supabase Dashboard → Authentication → Policies. Any table showing "No policies" after RLS is enabled is locked to all access (deny-all). Any table showing "RLS disabled" is fully public.

**Warning signs:**
- `supabase.from('bookings').select('count()')` returns a count from an unauthenticated browser session.
- Supabase Dashboard shows a table with "RLS: disabled" in the Table Editor.
- A browser DevTools Network tab shows booking data returned from a direct Supabase REST call on the public site.

**Phase to address:** Phase 1 — Auth Setup (RLS audit of existing tables); all subsequent phases for new tables.

---

### Pitfall 4B: `anon` Key Mistakenly Treated as a Security Boundary

**Risk level:** HIGH

**What goes wrong:**
The Supabase `anon` key is visible in every browser request (it is embedded in `NEXT_PUBLIC_SUPABASE_ANON_KEY`). If a developer assumes "the anon key is secret so the data is protected," they do not enable RLS and do not write policies. All tables using the anon key — with RLS disabled — are accessible to anyone who inspects the network tab.

This is documented as the cause of a January 2025 mass data exposure incident (CVE-2025-48757) where 170+ Lovable-generated apps exposed their databases.

**Prevention:**
The `anon` key is designed to be public and is expected to appear in browser network requests. Security is enforced entirely through RLS policies, not through key secrecy. Treat the anon key as if it were already public — because it is.

Verify: open the booking site in a private browser window and run the following in DevTools console. If it returns data, RLS is not protecting the table:

```javascript
const { createClient } = supabase; // loaded from CDN for testing
const c = createClient('YOUR_SUPABASE_URL', 'YOUR_ANON_KEY');
const { data } = await c.from('bookings').select('*').limit(5);
console.log(data); // Must be null or error, never rows
```

**Phase to address:** Phase 1 — Auth Setup (security model clarification)

---

### Pitfall 4C: Database Views Bypass RLS — Admin Views Expose Data Publicly

**Risk level:** HIGH

**What goes wrong:**
A database view is created to simplify admin queries (e.g., `booking_stats_view` joining `bookings` with aggregate functions). The underlying `bookings` table has correct RLS policies. But the view is created with `SECURITY DEFINER` (Postgres default for views) and bypasses RLS — meaning any anon user can query the view and see aggregated booking data.

**Why it happens:**
PostgreSQL creates views with `security definer` by default. The view runs as the view creator (usually the `postgres` superuser), bypassing the row-level policies of the underlying tables.

**Prevention:**
On Supabase (which uses Postgres 15+), add `WITH (security_invoker = true)` to any view that accesses sensitive tables:

```sql
CREATE OR REPLACE VIEW booking_stats_view
  WITH (security_invoker = true)
AS
SELECT
  COUNT(*) AS total_bookings,
  SUM(amount_czk) AS total_revenue
FROM bookings;
```

With `security_invoker = true`, the view respects the RLS policies of the `bookings` table for whoever is calling the view — including the `anon` role.

Alternatively, place views in a non-public schema (`private` or `admin_schema`) and revoke `anon` and `authenticated` role access from that schema.

**Warning signs:**
- An unauthenticated request to the view returns data even though the underlying table is RLS-protected.
- `\d+ view_name` in Supabase SQL Editor shows `security_definer` in the view definition.

**Phase to address:** Phase 4 — Statistics (any views created for stats queries)

---

### Pitfall 4D: Enabling RLS Without Policies Locks Out the Admin Dashboard

**Risk level:** MEDIUM

**What goes wrong:**
RLS is enabled on the `bookings` table (correct). No SELECT policy is added for the admin role. The admin dashboard's bookings list page returns no rows — not an error, just an empty table. The developer thinks the query is broken and spends time debugging the frontend before realizing the database is returning nothing due to the implicit deny-all.

**Why it happens:**
RLS with no policies means "deny all access to all roles." It is a common misconception that enabling RLS alone is sufficient and that data will still be readable by admins.

**Prevention:**
After enabling RLS on any table, immediately add the necessary policies in the same migration. Do not deploy a "enable RLS, add policies later" state. Test the admin query before shipping by running it with an authenticated admin JWT via the Supabase REST API.

**Warning signs:**
- Admin dashboard bookings list is empty after correct RLS setup.
- No query errors — `supabase-js` returns `{ data: [], error: null }`.
- Direct SQL query in Supabase SQL Editor (which runs as `postgres` superuser, bypassing RLS) returns rows correctly.

**Phase to address:** All phases that add new tables.

---

## Area 5: Dynamic Import of terra-draw in Next.js (SSR)

### Pitfall 5A: `"use client"` Alone Does Not Prevent terra-draw SSR Errors

**Risk level:** CRITICAL

**What goes wrong:**
The zones editor component is marked `"use client"`. The developer assumes this prevents SSR execution. terra-draw and its adapters (e.g., `TerraDrawGoogleMapsAdapter`) access `window`, `document`, and canvas/WebGL APIs at module load time. When the module is imported in a `"use client"` component, Next.js still processes the import on the server during the initial render — just to build the module graph. terra-draw's top-level code accesses `window` during this import phase, throwing `ReferenceError: window is not defined` and crashing the server render.

**Why it happens:**
`"use client"` marks the boundary between Server and Client component trees, but it does not mean "never execute on the server." Next.js still imports and tree-shakes `"use client"` modules during the build and initial SSR pass. The actual `window` check happens at runtime, which fails on the server.

**Prevention:**
Isolate all terra-draw usage into a dedicated component and use `next/dynamic` with `ssr: false`. Do not import terra-draw anywhere that is not wrapped in a dynamic import:

```typescript
// app/admin/zones/page.tsx (or wherever the editor lives)
import dynamic from "next/dynamic";

const ZonesEditor = dynamic(
  () => import("@/components/admin/ZonesEditor"),
  {
    ssr: false,
    loading: () => <div className="h-96 bg-neutral-800 animate-pulse rounded" />,
  }
);

export default function ZonesPage() {
  return <ZonesEditor />;
}
```

The `ZonesEditor` component itself can be `"use client"` and import terra-draw normally — the `dynamic` wrapper with `ssr: false` ensures it never runs on the server.

**Warning signs:**
- `ReferenceError: window is not defined` in Vercel build logs or server error overlay.
- The error references a file inside `node_modules/terra-draw/` in the stack trace.
- The zones editor page crashes the entire server render, showing a 500 error.

**Phase to address:** Phase 2 — Coverage Zones (zones editor component)

---

### Pitfall 5B: terra-draw Instance Initialized Outside `useEffect` — Crashes on Re-render

**Risk level:** HIGH

**What goes wrong:**
The terra-draw instance is initialized at module scope or directly in the component body (not inside `useEffect`). When the component re-renders (e.g., due to a parent state update), terra-draw tries to re-attach to the same DOM node, throwing an error because the previous instance is still attached. Or the terra-draw instance is never cleaned up when the component unmounts, causing memory leaks and ghost event listeners that interfere with the next mount.

**Prevention:**
Initialize terra-draw inside `useEffect` with a proper cleanup:

```typescript
useEffect(() => {
  if (!mapRef.current) return;

  const draw = new TerraDraw({
    adapter: new TerraDrawGoogleMapsAdapter({ map: mapRef.current }),
    modes: [new TerraDrawPolygonMode()],
  });

  draw.start();

  draw.on("finish", (id) => {
    const snapshot = draw.getSnapshot();
    onPolygonDrawn(snapshot);
  });

  return () => {
    draw.stop();
  };
}, [mapRef.current]); // Re-run only when the map ref changes
```

**Warning signs:**
- `Cannot read properties of null (reading 'addEventListener')` errors in the browser console.
- Drawing tools appear to work but drawn polygons disappear on re-render.
- Memory usage grows continuously as the user navigates between admin pages.

**Phase to address:** Phase 2 — Coverage Zones (terra-draw initialization pattern)

---

### Pitfall 5C: `useMemo` Wrapping `dynamic()` — Causes Unnecessary Re-mounts

**Risk level:** LOW

**What goes wrong:**
Some Next.js examples (for react-leaflet in particular) recommend wrapping `dynamic()` inside `useMemo` to prevent the component from being re-created on every parent render. While this prevents the reference from changing, it is usually not needed for `ssr: false` dynamic imports — and using `useMemo` with an empty dependency array inside a Server Component context causes a React error.

**Prevention:**
For the zones editor, call `dynamic()` at module scope (outside the component), not inside `useMemo`. Module-scope `dynamic()` calls are stable across renders by definition:

```typescript
// At module scope — not inside a component or hook
const ZonesEditor = dynamic(() => import("@/components/admin/ZonesEditor"), {
  ssr: false,
});
```

Only use `useMemo(() => dynamic(...), [])` if the dynamic target must vary based on props — which is not the case here.

**Phase to address:** Phase 2 — Coverage Zones (dynamic import placement)

---

## Cross-Cutting Pitfalls

### Pitfall 6A: Admin Route Not in Middleware Matcher — Protection Silently Skipped

**Risk level:** CRITICAL

**What goes wrong:**
The middleware file is correctly implemented, but the `matcher` in the `config` export does not include the `/admin` path. Middleware never runs for `/admin` requests. All admin pages are publicly accessible without authentication.

**Prevention:**
The matcher must explicitly include `/admin` and all its sub-paths:

```typescript
export const config = {
  matcher: [
    // Standard Next.js assets exclusion
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

This regex matches all paths except static assets and Next.js internals, which includes `/admin`. Alternatively, be explicit:

```typescript
matcher: ["/admin", "/admin/:path*"]
```

After deploying, verify by loading `/admin` in a private browsing window without logging in — it must redirect to `/login`.

**Warning signs:**
- `/admin` loads without authentication in a logged-out browser.
- Middleware logs show no requests for the `/admin` path.
- `console.log` inside the middleware function never fires for admin routes.

**Phase to address:** Phase 1 — Auth Setup (middleware config)

---

### Pitfall 6B: New Admin Env Vars Not Added to Vercel Production Scope

**Risk level:** HIGH

**What goes wrong:**
Auth-related env vars (e.g., `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` if not already set, or a new `ADMIN_EMAIL` for the seeded admin account) are set locally in `.env.local` but not added to Vercel. The admin login page renders, the user submits credentials, and `signInWithPassword` silently fails because the Supabase client is initialized with `undefined` URL/key. The error message is often misleading ("invalid login credentials") rather than indicating a misconfigured client.

**Prevention:**
After identifying every new env var required for v1.2, add each to Vercel before the first production deployment. For v1.2, the candidates are:
- `NEXT_PUBLIC_SUPABASE_URL` — already set in v1.1, verify it is present
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already set in v1.1, verify it is present
- Any new server-side vars scoped to Production only

Verify by calling `/api/health` after deployment and checking the Supabase probe result.

**Phase to address:** Phase 1 — Auth Setup (env var checklist)

---

## Pitfall-to-Phase Mapping

| Pitfall | Risk | Prevention Phase | Verification |
|---------|------|-----------------|--------------|
| Infinite redirect loop (cookie not written to both sides) | CRITICAL | Phase 1 — Auth: middleware implementation | Login → redirect to `/admin` works without loop |
| `getSession()` in server code instead of `getClaims()` | HIGH | Phase 1 — Auth: route protection logic | Code review: no `getSession()` calls in server files |
| `middleware.ts` in wrong directory | MEDIUM | Phase 1 — Auth: file placement | Middleware log appears in dev terminal |
| CDN-cached response with session cookie | HIGH | Phase 1 — Auth: cache headers | `force-dynamic` on all admin layouts |
| Service role client using SSR cookies | HIGH | All phases with admin Route Handlers | Code review: admin writes use `createSupabaseServiceClient()` |
| PostGIS not enabled before creating geometry column | CRITICAL | Phase 2 — Zones: schema migration | `SELECT postgis_version()` returns version, not error |
| PostGIS returns WKB hex instead of GeoJSON | HIGH | Phase 2 — Zones: data layer | Querying view returns `{ type: "Polygon", coordinates: [...] }` |
| Coordinate order mismatch terra-draw vs Google Maps | HIGH | Phase 2 — Zones: coordinate conversion | Prague polygon renders over Prague on map |
| Missing spatial index | MEDIUM | Phase 2 — Zones: schema migration | Index visible in Supabase Table Editor |
| Big-bang pricing cutover breaks live bookings | CRITICAL | Phase 3 — Pricing: migration plan | Fallback deployed before `pricing_config` seeded |
| Pricing response cached — edits not immediate | MEDIUM | Phase 3 — Pricing: API route | `force-dynamic` on `/api/calculate-price` |
| Pricing config table writable by any authenticated user | HIGH | Phase 3 — Pricing: RLS policies | Non-admin authenticated user cannot INSERT/UPDATE |
| RLS disabled on new tables | CRITICAL | All phases with new tables | Anon request returns no rows (not data) |
| `anon` key treated as security boundary | HIGH | Phase 1 — Auth: security audit | DevTools console test returns no booking data |
| Database views bypass RLS | HIGH | Phase 4 — Stats: view creation | View created with `security_invoker = true` |
| RLS enabled but no policies — deny all | MEDIUM | All phases with new tables | Admin dashboard shows data, not empty table |
| terra-draw SSR crash — `window is not defined` | CRITICAL | Phase 2 — Zones: component setup | Build succeeds without SSR errors |
| terra-draw initialized outside `useEffect` | HIGH | Phase 2 — Zones: initialization | No re-render errors; cleanup on unmount verified |
| Admin route not in middleware matcher | CRITICAL | Phase 1 — Auth: middleware config | Unauthenticated request to `/admin` redirects to `/login` |
| Admin env vars missing from Vercel | HIGH | Phase 1 — Auth: env var checklist | `/api/health` returns 200 with Supabase probe green |

---

## Sources

- [Supabase: Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — official docs (HIGH confidence)
- [Supabase: Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — official docs (HIGH confidence)
- [Supabase: Advanced Auth guide (cookie dual-write pattern)](https://supabase.com/docs/guides/auth/server-side/advanced-guide) — official docs (HIGH confidence)
- [Supabase: getClaims reference](https://supabase.com/docs/reference/javascript/auth-getclaims) — official docs (HIGH confidence)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — official docs (HIGH confidence)
- [Supabase: RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — official docs (HIGH confidence)
- [Supabase: Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security) — official docs (HIGH confidence)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — official docs (HIGH confidence)
- [Supabase: PostGIS geo queries](https://supabase.com/docs/guides/database/extensions/postgis) — official docs (HIGH confidence)
- [Supabase: Migrate from auth-helpers to SSR package](https://supabase.com/docs/guides/troubleshooting/how-to-migrate-from-supabase-auth-helpers-to-ssr-package-5NRunM) — official docs (HIGH confidence)
- [Supabase: Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) — official docs (HIGH confidence)
- [Next.js: Lazy Loading guide](https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading) — official docs (HIGH confidence)
- [GitHub: supabase-js issue — cookies not set in App Router](https://github.com/supabase/supabase-js/issues/1396) — community report (MEDIUM confidence, corroborates official docs)
- [GitHub: next.js discussion — cookies() should be awaited with Turbopack](https://github.com/vercel/next.js/discussions/81445) — community report (MEDIUM confidence)
- [GitHub: react-leaflet issue — window is not defined in Next.js 15](https://github.com/PaulLeCam/react-leaflet/issues/1152) — community report (MEDIUM confidence)
- [Medium: How Missing RLS in Supabase Can Expose User Data (Mar 2026)](https://medium.com/@Gakusen/how-missing-row-level-security-in-supabase-can-expose-user-data-599dcab749f3) — MEDIUM confidence
- [Geospatial Polygons: Full-Stack Guide with PostGIS, Node.js](https://medium.com/@KilgortTrout/geospatial-polygons-a-full-stack-guide-with-postgis-node-js-and-react-da55ab0e7fdd) — MEDIUM confidence
- [PlaceKit: Making React-Leaflet work with Next.js](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i) — MEDIUM confidence (general SSR pattern, applicable to terra-draw)

---

*Pitfalls research for: v1.2 Operator Dashboard — Supabase Auth + GeoJSON Zones + Pricing Config + Admin RLS + terra-draw on Next.js 14 App Router*
*Researched: 2026-04-01*
