# Phase 12: Core Booking Flow Update - Research

**Researched:** 2026-04-02
**Domain:** Next.js data caching + Turf.js geospatial + Supabase server client
**Confidence:** HIGH

---

## Summary

Phase 12 surgically modifies the live `/api/calculate-price` endpoint to source rates from the `pricing_config` Supabase table (seeded in Phase 11) instead of hardcoded constants in `lib/pricing.ts`. It also adds a point-in-polygon zone check using the `@turf/boolean-point-in-polygon` package (already installed) to set `quoteMode: true` when a booking origin or destination falls outside all active zones.

All required packages are already installed: `@turf/boolean-point-in-polygon@7.3.4`, `@turf/helpers@7.3.4`, `@supabase/supabase-js@2.101.0`, and `@supabase/ssr@0.10.0`. The project uses Next.js 16.1.7 which exports `unstable_cache` and `revalidateTag` from `next/cache` — these are the correct APIs to use for tagging the pricing config loader.

The key architectural decision is that `calculatePrice()` in `lib/pricing.ts` must accept rates as a parameter rather than reading exported constants, so that the route handler can pass DB-loaded rates. The hardcoded constants become seed-only references and must NOT be exported from the module (to prevent accidental use downstream). The zone check must be a separate concern from pricing: no zones → `quoteMode` unchanged; zones present → check each active zone's GeoJSON polygon.

**Primary recommendation:** Use `unstable_cache` (not the `use cache` directive) to wrap the Supabase pricing config loader with tag `'pricing-config'`. Use `createSupabaseServiceClient()` from `lib/supabase.ts` for the DB read — it uses the service role key and bypasses cookie requirements, making it safe to call from an API route.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-05 | `/api/calculate-price` reads rates from `pricing_config` Supabase table, not hardcoded constants | `unstable_cache` wraps Supabase query; `calculatePrice()` refactored to accept rates param |
| PRICING-06 | Pricing changes are live immediately — next booking wizard load reflects updated rates | `revalidateTag('pricing-config')` in admin PUT route (Phase 14) invalidates the cache; Phase 12 sets up the tag |
| ZONES-04 | If pickup or destination falls outside all active zones, response returns `quoteMode: true` | Turf.js `booleanPointInPolygon` against `coverage_zones` table GeoJSON; empty zones table skips check |
| ZONES-05 | When no zones are defined, no booking is blocked (graceful default) | Count active zones first; if 0, skip check entirely and proceed normally |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next/cache` | 16.1.7 (bundled) | `unstable_cache`, `revalidateTag` | Official Next.js caching API; tag-based invalidation |
| `@turf/boolean-point-in-polygon` | 7.3.4 (installed) | Point-in-polygon geospatial check | Already installed in Phase 10; Turf.js industry standard |
| `@turf/helpers` | 7.3.4 (installed) | `point()` helper to construct GeoJSON Point | Companion to boolean-point-in-polygon |
| `@supabase/supabase-js` | 2.101.0 (installed) | DB client for pricing_config + coverage_zones reads | Already in use via `createSupabaseServiceClient()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/supabase.ts` `createSupabaseServiceClient()` | existing | Service-role Supabase client | Use for server-side reads where no cookie/session needed |

**No new packages required.** All dependencies were installed in Phase 10.

---

## Architecture Patterns

### Recommended File Structure (additions only)

```
prestigo/
├── lib/
│   ├── pricing.ts           # MODIFIED: calculatePrice() accepts Rates param
│   ├── pricing-config.ts    # NEW: DB loader wrapped in unstable_cache
│   └── supabase.ts          # UNCHANGED: provides createSupabaseServiceClient()
└── app/
    └── api/
        └── calculate-price/
            └── route.ts     # MODIFIED: loads rates from DB; adds zone check
```

### Pattern 1: unstable_cache for Pricing Config Loader

**What:** Wrap a Supabase query in `unstable_cache` with a stable cache key and tag. The cached function is called inside the route handler — the cache layer sits between the route and the DB.

**When to use:** Any server-side data that changes infrequently and needs tag-based invalidation. `unstable_cache` is the correct API for API Route handlers and Server Components in Next.js 16. The `use cache` directive + `cacheTag()` is the alternative but requires the PPR/dynamicIO flags which are experimental.

**Example:**
```typescript
// lib/pricing-config.ts
// Source: next/cache module (verified from node_modules/next/cache.js)
import { unstable_cache } from 'next/cache'
import { createSupabaseServiceClient } from '@/lib/supabase'

export type PricingRates = {
  ratePerKm: Record<string, number>
  hourlyRate: Record<string, number>
  dailyRate: Record<string, number>
}

export const getPricingConfig = unstable_cache(
  async (): Promise<PricingRates> => {
    const supabase = createSupabaseServiceClient()
    const { data, error } = await supabase
      .from('pricing_config')
      .select('vehicle_class, rate_per_km, hourly_rate, daily_rate')

    if (error || !data?.length) {
      throw new Error(`Failed to load pricing config: ${error?.message}`)
    }

    return {
      ratePerKm: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.rate_per_km)])),
      hourlyRate: Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.hourly_rate)])),
      dailyRate:  Object.fromEntries(data.map(r => [r.vehicle_class, Number(r.daily_rate)])),
    }
  },
  ['pricing-config'],          // cache key parts
  { tags: ['pricing-config'] } // invalidation tag
)
```

### Pattern 2: calculatePrice() with injected Rates

**What:** Refactor `calculatePrice()` to accept a `rates` parameter instead of reading module-level constants. This makes the function testable without DB and allows the route to pass DB-loaded values.

**Example:**
```typescript
// lib/pricing.ts (modified signature)
export interface Rates {
  ratePerKm: Record<VehicleClass, number>
  hourlyRate: Record<VehicleClass, number>
  dailyRate: Record<VehicleClass, number>
}

export function calculatePrice(
  tripType: TripType,
  vehicleClass: VehicleClass,
  distanceKm: number | null,
  hours: number,
  days: number,
  rates: Rates  // NEW parameter
): PriceBreakdown {
  // ... use rates.ratePerKm[vehicleClass] instead of RATE_PER_KM[vehicleClass]
}

// Hardcoded constants remain as non-exported internal references only
// (or removed entirely, with seed SQL as the only source of truth)
```

### Pattern 3: Zone Check in Route Handler

**What:** After pricing is calculated, query `coverage_zones` for active zones. If none exist, skip check. If zones exist, use Turf.js to check whether origin and destination are inside at least one active zone.

**Turf.js API (verified from installed source):**
```typescript
// Source: node_modules/@turf/boolean-point-in-polygon/dist/cjs/index.cjs
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

// The GeoJSON stored in coverage_zones.geojson is a Feature<Polygon>
// booleanPointInPolygon accepts:
//   point: Feature<Point> | Point | number[]   (lng, lat order for GeoJSON!)
//   polygon: Feature<Polygon> | MultiPolygon | Feature<MultiPolygon>

function isInsideAnyZone(
  lat: number,
  lng: number,
  zones: Array<{ geojson: GeoJSON.Feature }>
): boolean {
  // GeoJSON uses [longitude, latitude] order
  const pt = point([lng, lat])
  return zones.some(zone => booleanPointInPolygon(pt, zone.geojson as any))
}
```

**CRITICAL:** GeoJSON coordinate order is `[longitude, latitude]`, NOT `[latitude, longitude]`. The booking store uses `{ lat, lng }` objects — must swap order when constructing the Turf point.

### Pattern 4: Zone Query in Route Handler

```typescript
// In /api/calculate-price/route.ts
const supabase = createSupabaseServiceClient()
const { data: zones } = await supabase
  .from('coverage_zones')
  .select('id, geojson')
  .eq('active', true)

// ZONES-05: if no active zones, skip check entirely
if (zones && zones.length > 0) {
  const originInside = !origin || isInsideAnyZone(origin.lat, origin.lng, zones)
  const destInside = !destination || isInsideAnyZone(destination.lat, destination.lng, zones)
  if (!originInside || !destInside) {
    return NextResponse.json({ prices: null, distanceKm: null, quoteMode: true })
  }
}
```

### Anti-Patterns to Avoid

- **Do NOT export the hardcoded constants from `lib/pricing.ts`** after migration. Currently `RATE_PER_KM`, `HOURLY_RATE`, `DAILY_RATE` are exported — they must become unexported (or deleted) to prevent any code path accidentally using stale hardcoded values.
- **Do NOT use `createClient()` from `lib/supabase/server.ts`** for the pricing config read. That client requires `cookies()` (async, Next.js headers context) and is designed for auth-aware server components. The route handler should use `createSupabaseServiceClient()` (service role, no cookie dependency).
- **Do NOT wrap zone queries in `unstable_cache`** for Phase 12. Zone data is operator-managed and expected to change; only pricing rates need caching. Phase 14 will handle invalidation when that becomes a concern.
- **Do NOT call `revalidateTag` in Phase 12.** The tag is set up here; invalidation is triggered by the admin pricing PUT route in Phase 14. Phase 12 just ensures the tag is registered.
- **Do NOT use `cacheTag` (the `use cache` directive companion).** That API requires experimental Next.js flags (`dynamicIO`). Use `unstable_cache` which is stable and works in the current configuration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-in-polygon check | Custom ray-casting math | `@turf/boolean-point-in-polygon` | Already installed; handles edge cases (boundary, antimeridian, multipolygon) |
| Cache invalidation tagging | Custom in-memory cache | `unstable_cache` + `revalidateTag` from `next/cache` | Next.js built-in; works across serverless invocations via shared cache store |
| GeoJSON polygon parsing | Custom JSON traversal | Turf.js — accepts GeoJSON Feature directly | Handles Polygon and MultiPolygon; validates geometry |

---

## Common Pitfalls

### Pitfall 1: GeoJSON Coordinate Order (lng, lat NOT lat, lng)

**What goes wrong:** Turf.js uses GeoJSON standard: `[longitude, latitude]`. The booking store and API body use `{ lat, lng }`. Swapping these silently produces wrong results — a point in Prague could test positive for a zone in South America.

**Why it happens:** JavaScript developers are conditioned to write `(lat, lng)`. GeoJSON is the opposite. The DB stores the zone as drawn by the operator's map (Phase 16 will use `@vis.gl/react-google-maps` which also uses `{lat, lng}`), but Turf expects `[lng, lat]`.

**How to avoid:** Always construct `point([lng, lat])` — longitude first. Write a comment at the call site.

**Warning signs:** Zone check always returns false even for a point clearly inside the drawn polygon.

### Pitfall 2: pricing_config NUMERIC values come back as strings from Supabase

**What goes wrong:** PostgreSQL `NUMERIC(10,2)` columns are returned by the Supabase JS client as **strings** (e.g., `"2.80"` not `2.80`). Using them directly in arithmetic yields `NaN` or string concatenation.

**Why it happens:** JavaScript's JSON parsing keeps high-precision NUMERIC as strings to avoid floating-point precision loss. This is a known Supabase JS behavior.

**How to avoid:** Always call `Number(row.rate_per_km)` or `parseFloat(row.rate_per_km)` when mapping DB results. Verify with: `typeof data[0].rate_per_km === 'string'`.

**Warning signs:** Prices returned as `NaN` or unexpectedly large string-concatenation values.

### Pitfall 3: unstable_cache is not available outside Next.js request context (tests)

**What goes wrong:** Calling `getPricingConfig()` in unit tests throws an error because `unstable_cache` requires the Next.js incremental cache context to be present.

**Why it happens:** `unstable_cache` uses Next.js internals that don't exist in a plain Vitest/jsdom environment.

**How to avoid:** Unit tests for `calculatePrice()` should NOT call `getPricingConfig()`. Pass a mock rates object directly to `calculatePrice()`. Integration smoke tests (the three required in the phase spec) must run against the actual deployed endpoint or a Next.js test server.

**Warning signs:** `Invariant: incrementalCache missing in unstable_cache` error in test output.

### Pitfall 4: Zone check must not fire for hourly/daily trips with no origin/destination

**What goes wrong:** Hourly and daily trips don't have origin/destination in the API body (they pass `null`). A zone check that dereferences `origin.lat` without a null guard will throw.

**Why it happens:** The existing route handler already short-circuits for hourly/daily before the origin/destination guard — but the zone check must respect this same flow.

**How to avoid:** Only run the zone check after confirming `origin` and `destination` are non-null. For hourly/daily trips that return before the distance check, add the zone check only to the transfer path OR skip for non-transfer types explicitly.

### Pitfall 5: Smoke test B requires a test zone in DB

**What goes wrong:** "quoteMode: true when origin outside a test zone" cannot be verified without at least one active zone in `coverage_zones`. The table is seeded empty.

**Why it happens:** Phase 11 intentionally left `coverage_zones` empty.

**How to avoid:** Plan Task includes inserting a test zone via Supabase MCP (a small polygon around a known coordinate like Prague center), running the smoke test, then deleting it. Document exact INSERT/DELETE SQL.

---

## Code Examples

### unstable_cache import (verified from next/cache.js)
```typescript
// Source: node_modules/next/cache.js — exports.unstable_cache confirmed
import { unstable_cache } from 'next/cache'
```

### Turf.js imports (verified from installed node_modules)
```typescript
// Source: node_modules/@turf/boolean-point-in-polygon — default export
// Source: node_modules/@turf/helpers — named export 'point'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
```

### Supabase service client (existing pattern from lib/supabase.ts)
```typescript
// Existing function — use as-is for DB reads in route handlers
import { createSupabaseServiceClient } from '@/lib/supabase'
const supabase = createSupabaseServiceClient()
```

### Full zone check helper (reference implementation)
```typescript
// [lng, lat] — GeoJSON coordinate order
function isOutsideAllZones(
  lat: number,
  lng: number,
  zones: Array<{ geojson: unknown }>
): boolean {
  const pt = point([lng, lat]) // NOTE: longitude first
  return !zones.some(zone =>
    booleanPointInPolygon(pt, zone.geojson as Parameters<typeof booleanPointInPolygon>[1])
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded constants in `lib/pricing.ts` | DB-loaded rates via `unstable_cache` | Phase 12 | Operator can change rates via admin UI without deploy |
| No zone coverage check | Turf.js point-in-polygon against `coverage_zones` | Phase 12 | Bookings outside service area fall back to quote flow |
| `cacheTag` (experimental `use cache` directive) | `unstable_cache` with tags | Next.js 15+ | `unstable_cache` is stable; `use cache`+`cacheTag` requires `dynamicIO` experimental flag |

**Deprecated/outdated:**
- Exporting `RATE_PER_KM`, `HOURLY_RATE`, `DAILY_RATE` from `lib/pricing.ts`: these must become internal constants or be removed after rates are loaded from DB.

---

## Open Questions

1. **Zone check scope for hourly/daily trips**
   - What we know: The phase description says "pickup/destination outside all zones triggers quoteMode: true" — but hourly/daily trips in the current route return before origin/destination are validated.
   - What's unclear: Should zone check apply to hourly/daily trips at all? For hourly, there is no route — zone check by origin only makes sense if the operator wants to restrict service area for all bookings.
   - Recommendation: Apply zone check to transfer trips only (where origin and destination are always non-null by the time zone check runs). Document this decision in the plan.

2. **Fallback behavior if DB is unreachable**
   - What we know: `unstable_cache` will throw if the wrapped function throws. There is no fallback to hardcoded constants once they are removed.
   - What's unclear: Should the route return `quoteMode: true` on DB error (safe) or 500 (explicit error)?
   - Recommendation: Catch errors in the route handler; return `quoteMode: true` with a server log entry rather than a 500. This is consistent with the existing error handling pattern in `route.ts`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && nvm use 22 && npx vitest run tests/pricing.test.ts tests/calculate-price.test.ts` |
| Full suite command | `cd /Users/romanustyugov/Desktop/Prestigo/prestigo && nvm use 22 && npx vitest run` |

**Note:** Existing `tests/pricing.test.ts` and `tests/calculate-price.test.ts` contain only `it.todo` stubs. Phase 12 should implement at minimum the stubs relevant to the refactored `calculatePrice(rates, ...)` signature.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-05 | `calculatePrice()` uses injected rates, not module constants | unit | `npx vitest run tests/pricing.test.ts` | ✅ (stubs only — Wave 0 must implement) |
| PRICING-05 | Route calls `getPricingConfig()` and passes rates to `buildPriceMap()` | smoke | Manual: POST to deployed endpoint, verify price matches seed values | ❌ Smoke test A (manual) |
| PRICING-06 | Cache tag `'pricing-config'` registered on loader | unit/integration | Verify `unstable_cache` options.tags includes `'pricing-config'` (code review) | ❌ Wave 0 |
| ZONES-04 | Origin outside active zone → `quoteMode: true` | smoke | Manual: POST with coord outside test zone | ❌ Smoke test B (manual) |
| ZONES-05 | No active zones → `quoteMode: false`, no block | smoke | Manual: POST with empty zones table | ❌ Smoke test C (manual) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/pricing.test.ts tests/calculate-price.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + all three smoke tests pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/pricing.test.ts` — implement stubs for `calculatePrice(rates, ...)` with injected rates (covers PRICING-05 unit)
- [ ] `tests/calculate-price.test.ts` — implement stubs for zone check behavior (mock Supabase client)
- [ ] Smoke test zone fixture: SQL to INSERT a test polygon into `coverage_zones`, used in Smoke test B, deleted after

*(Existing test infrastructure covers framework setup — only stub implementations and a test zone fixture are missing.)*

---

## Sources

### Primary (HIGH confidence)
- `node_modules/next/cache.js` — verified `unstable_cache`, `revalidateTag` exports
- `node_modules/@turf/boolean-point-in-polygon/dist/cjs/index.cjs` — verified function signature and GeoJSON coordinate handling
- `node_modules/@turf/helpers/dist/cjs/index.cjs` — verified `point()` export
- `prestigo/lib/pricing.ts` — current implementation (direct file read)
- `prestigo/app/api/calculate-price/route.ts` — current implementation (direct file read)
- `supabase/migrations/0002_create_pricing_config.sql` — DB schema (direct file read)
- `supabase/migrations/0003_create_coverage_zones.sql` — DB schema (direct file read)

### Secondary (MEDIUM confidence)
- Next.js docs pattern for `unstable_cache` with tags — consistent with source code behavior observed in node_modules

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in node_modules, all imports confirmed
- Architecture: HIGH — based on direct source code inspection of existing files and Turf.js internals
- Pitfalls: HIGH — NUMERIC-as-string and GeoJSON coordinate order are confirmed behaviors from library source

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable libraries; Next.js and Turf.js versions locked in package.json)
