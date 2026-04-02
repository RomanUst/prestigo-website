---
phase: 16
slug: admin-ui-pages
status: complete
created: 2026-04-02
---

# Phase 16: Admin UI Pages — Research

**Researched:** 2026-04-02
**Domain:** React UI components, @vis.gl/react-google-maps, terra-draw, recharts, @tanstack/react-table, Next.js SSR dynamic imports
**Confidence:** HIGH

---

## Summary

Phase 16 builds all four admin UI pages by wiring React components to the already-complete Phase 14 API routes. The design contract is locked in `15-UI-SPEC.md`. The project uses custom inline `style={{}}` objects exclusively — no Tailwind, no shadcn. Four new packages must be installed before any component work begins.

The single highest-risk item is the ZoneMap: terra-draw requires a real browser DOM and cannot run under SSR. The correct pattern is a two-layer dynamic import — the `ZoneMap.tsx` component must be loaded via `next/dynamic` with `ssr: false` from a Client Component wrapper (not from a Server Component directly). Additionally, terra-draw requires a **separate adapter package** (`terra-draw-google-maps-adapter`) that was not listed in the phase brief — this must also be installed.

All four pages live inside `app/admin/(dashboard)/` which already provides the layout shell with `AdminSidebar` and the auth guard. New pages are simply page files inside that route group — no layout changes needed.

**Primary recommendation:** Install five packages (not four — add `terra-draw-google-maps-adapter`), implement ZoneMap with two-stage dynamic import, and mark all chart/table/map components `'use client'`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRICING-01 | Operator edits base rates per vehicle class (rate_per_km, hourly_rate, daily_rate) | PricingForm Section A — react-hook-form + zod; PUT /api/admin/pricing shape confirmed |
| PRICING-02 | Operator edits extras surcharges (child seat, meet & greet, extra luggage) | PricingForm Section B — globals object in API schema |
| PRICING-03 | Operator edits airport fee | PricingForm Section B — airport_fee field in pricing_globals |
| PRICING-04 | Operator edits night/holiday coefficients | PricingForm Section B — night_coefficient, holiday_coefficient in pricing_globals |
| ZONES-01 | Operator draws polygon on interactive Google Maps canvas | ZoneMap with @vis.gl/react-google-maps + terra-draw polygon mode |
| ZONES-02 | Operator names drawn zone and saves it as GeoJSON | POST /api/admin/zones accepts geojsonFeatureSchema; ZoneMap collects polygon + name |
| ZONES-03 | Operator toggles zone active/inactive | PATCH /api/admin/zones with { id, active }; toggle switch in zone list panel |
| BOOKINGS-01 | Paginated table of all bookings | BookingsTable with @tanstack/react-table; GET /api/admin/bookings?page=N&limit=20 |
| BOOKINGS-02 | Filter by pickup date range | Date range inputs in filter bar; startDate/endDate query params |
| BOOKINGS-03 | Filter by trip type | FilterChips (All/Transfer/Hourly/Daily); tripType query param |
| BOOKINGS-04 | Search by client name or booking reference | Search input; search query param; ilike filter already in API |
| BOOKINGS-05 | Expandable row showing full booking detail | @tanstack/react-table getExpandedRowModel; row.getIsExpanded() + second <tr> |
| STATS-01 | Revenue for current and previous month | KPICard with MONTHLY REVENUE — aggregated from bookings query |
| STATS-02 | Booking counts for today/week/month | KPICards: TODAY / THIS WEEK / THIS MONTH — aggregated from bookings query |
| STATS-03 | Revenue breakdown by vehicle class | StatsChart "REVENUE BY CLASS" — grouped BarChart, 3 series |
| STATS-04 | Revenue breakdown by trip type | StatsChart "REVENUE BY TRIP TYPE" — grouped BarChart, 3 series |
| STATS-05 | 12-month revenue bar chart | StatsChart "12-MONTH REVENUE" — single-series BarChart with monthly totals |
</phase_requirements>

---

## Standard Stack

### Core (to install)

| Library | Verified Version | Purpose | Why This Library |
|---------|-----------------|---------|-----------------|
| `@vis.gl/react-google-maps` | 1.8.2 (latest) | React wrapper for Google Maps JS API | Official vis.gl/deck.gl project; native React 19 support; replaces deprecated @react-google-maps/api |
| `terra-draw` | 1.27.0 (latest) | Polygon/shape drawing on maps | Google-recommended replacement for Drawing Manager (deprecated Aug 2025) |
| `terra-draw-google-maps-adapter` | 1.3.1 (latest) | Terra Draw adapter for Google Maps | Required separate package for Google Maps integration; not included in terra-draw core |
| `recharts` | 3.8.1 (latest) | Bar charts and data visualization | React-native chart library; no D3 peer dep; CSS-variable theming; ResponsiveContainer |
| `@tanstack/react-table` | 8.21.3 (latest) | Headless table with sorting/filtering/expansion | Industry standard for data tables; headless = full style control; v8 stable |

### Already Installed (relevant to this phase)

| Library | Version | Role in Phase 16 |
|---------|---------|-----------------|
| `react-hook-form` | ^7.72.0 | PricingForm state management |
| `@hookform/resolvers` | ^5.2.2 | Zod schema resolver for react-hook-form |
| `zod` | ^4.3.6 | Form validation schema |
| `lucide-react` | ^1.6.0 | Icons: ChevronDown/Up, Search, Trash2, MapPin |
| `@googlemaps/js-api-loader` | ^2.0.2 | Already present — may be used by ZoneMap or superseded by APIProvider |
| `next` | 16.1.7 | `next/dynamic` for SSR-disabled ZoneMap |

### Peer Dependencies Note

`recharts` 3.x requires `react-is` — check if already installed. `react-is` latest is 19.2.4, which matches the project's React 19.2.3. If not present, `npm install react-is` is needed.

**Installation command:**
```bash
npm install @vis.gl/react-google-maps terra-draw terra-draw-google-maps-adapter recharts @tanstack/react-table
```

**Version verification (confirmed against npm registry 2026-04-02):**
- `@vis.gl/react-google-maps@1.8.2` published latest
- `terra-draw@1.27.0` published latest
- `terra-draw-google-maps-adapter@1.3.1` published latest
- `recharts@3.8.1` published latest (v3 stable; alpha/beta tracks exist but 3.8.1 is `latest`)
- `@tanstack/react-table@8.21.3` published latest (v9 alpha exists but v8 is `latest`)

---

## Architecture Patterns

### Recommended File Structure

```
prestigo/
├── components/
│   └── admin/
│       ├── AdminSidebar.tsx       (EXISTING — modify: <a> → next/link + active state)
│       ├── KPICard.tsx            (NEW)
│       ├── StatusBadge.tsx        (NEW)
│       ├── PricingForm.tsx        (NEW — 'use client')
│       ├── BookingsTable.tsx      (NEW — 'use client')
│       ├── ZoneMap.tsx            (NEW — 'use client' + next/dynamic internal)
│       └── StatsChart.tsx         (NEW — 'use client')
└── app/
    └── admin/
        └── (dashboard)/
            ├── layout.tsx         (EXISTING — no changes needed)
            ├── page.tsx           (EXISTING — no changes needed)
            ├── pricing/
            │   └── page.tsx       (NEW — Server Component, fetches GET /api/admin/pricing)
            ├── zones/
            │   └── page.tsx       (NEW — Server Component shell, client mutations via ZoneMap)
            ├── bookings/
            │   └── page.tsx       (NEW — Server Component shell, passes initial data)
            └── stats/
                └── page.tsx       (NEW — Server Component, fetches stats data)
```

### Pattern 1: SSR-disabled ZoneMap (CRITICAL)

**What:** terra-draw requires browser DOM. `next/dynamic` with `ssr: false` must be used — but this flag is only allowed inside Client Components, not Server Components.

**When to use:** Any component that uses terra-draw, canvas APIs, or browser-only mapping.

**The two-layer pattern:**
```tsx
// components/admin/ZoneMap.tsx — 'use client' at top (this IS the client component)
'use client'
// terra-draw imports happen here — safe because this file is already client-only
import dynamic from 'next/dynamic'

const ZoneMapInner = dynamic(() => import('./ZoneMapInner'), { ssr: false, loading: () => <div style={{ background: 'var(--anthracite)', minHeight: '480px', borderRadius: '4px' }} /> })

export default function ZoneMap(props: ZoneMapProps) {
  return <ZoneMapInner {...props} />
}
```

Alternatively, the page can do the dynamic import:
```tsx
// app/admin/(dashboard)/zones/page.tsx (Server Component)
import dynamic from 'next/dynamic'

const ZoneMap = dynamic(() => import('@/components/admin/ZoneMap'), { ssr: false })
```

**CRITICAL RULE:** `ssr: false` in a `dynamic()` call inside a Server Component causes a build error. The `dynamic()` call with `ssr: false` must live in a file marked `'use client'` or in a Client Component.

Source: [Next.js Lazy Loading Guide](https://nextjs.org/docs/app/guides/lazy-loading)

### Pattern 2: terra-draw + @vis.gl/react-google-maps Integration

**The div ID problem:** terra-draw's Google Maps adapter requires the map container `<div>` to have an `id` attribute. When using `@vis.gl/react-google-maps`, the `id` set on `<Map>` goes to the parent element, not the actual map div returned by `mapInstance.getDiv()`. This causes the error: `"Google Map container div requires an id to be set"`.

**Solution:** Use the `useMap()` hook from `@vis.gl/react-google-maps` to get the map instance, then call `map.getDiv()` and set the `id` attribute on that element programmatically before initializing terra-draw.

```tsx
// Source: terra-draw adapter docs + community integration pattern
'use client'
import { useMap } from '@vis.gl/react-google-maps'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter'
import { useEffect, useRef } from 'react'

function ZoneMapInner() {
  const map = useMap()
  const drawRef = useRef<TerraDraw | null>(null)

  useEffect(() => {
    if (!map) return

    // Fix the div ID issue
    const mapDiv = map.getDiv()
    if (!mapDiv.id) mapDiv.id = 'terra-draw-map-container'

    const draw = new TerraDraw({
      adapter: new TerraDrawGoogleMapsAdapter({
        lib: google.maps,
        map,
        coordinatePrecision: 9,
      }),
      modes: [new TerraDrawPolygonMode(), new TerraDrawSelectMode()],
    })

    // Google adapter requires 'ready' event before setMode
    draw.on('ready', () => {
      drawRef.current = draw
    })

    draw.start()

    return () => { draw.stop() }
  }, [map])
}
```

Source: [terra-draw adapters guide](https://github.com/JamesLMilner/terra-draw/blob/main/guides/3.ADAPTERS.md), [Bricyyy/react-visgl-terradraw-maps](https://github.com/Bricyyy/react-visgl-terradraw-maps)

### Pattern 3: @vis.gl/react-google-maps APIProvider

The `APIProvider` wraps all map components and handles the Google Maps JS API loading. The existing project uses `@googlemaps/js-api-loader` — `APIProvider` is the React-native alternative.

```tsx
// Source: https://visgl.github.io/react-google-maps/
import { APIProvider, Map } from '@vis.gl/react-google-maps'

<APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY!}>
  <Map
    defaultCenter={{ lat: 50.0755, lng: 14.4378 }}  // Prague
    defaultZoom={11}
    mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID}  // for dark style
    style={{ width: '100%', height: '100%' }}
    disableDefaultUI
  >
    {/* terra-draw layer goes here as a child */}
  </Map>
</APIProvider>
```

### Pattern 4: TanStack Table v8 with Expandable Rows

All `@tanstack/react-table` usage must be in Client Components.

```tsx
// Source: https://tanstack.com/table/v8/docs/guide/expanding
'use client'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
} from '@tanstack/react-table'
import { useState } from 'react'

const [expanded, setExpanded] = useState<ExpandedState>({})

const table = useReactTable({
  data,
  columns,
  state: { expanded },
  onExpandedChange: setExpanded,
  getExpandedRowModel: getExpandedRowModel(),
  getCoreRowModel: getCoreRowModel(),
  getRowCanExpand: () => true,
})
```

Expanded row rendering: check `row.getIsExpanded()` in the body loop and render a second `<tr>` with `<td colSpan={columns.length}>` containing the detail panel.

**Critical:** Define `columns` inside the Client Component file, not in a Server Component. Passing column definitions (which contain render functions) from Server to Client causes a Next.js serialization error.

### Pattern 5: recharts BarChart in a Client Component

```tsx
// Source: https://recharts.github.io/en-US/api/BarChart/
'use client'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// Parent div MUST have explicit height or ResponsiveContainer cannot measure
<div style={{ height: '280px' }}>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#3A3A3F" />
      <XAxis dataKey="month" stroke="#9A958F" tick={{ fontSize: 11, fontFamily: 'var(--font-montserrat)' }} />
      <YAxis stroke="#9A958F" tick={{ fontSize: 11, fontFamily: 'var(--font-montserrat)' }} />
      <Tooltip
        contentStyle={{ backgroundColor: '#1C1C1E', border: '1px solid #3A3A3F' }}
        labelStyle={{ color: '#F5F2EE', fontSize: 11 }}
      />
      <Bar dataKey="revenue" fill="#B87333" radius={[2, 2, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

### Pattern 6: AdminSidebar Active State Upgrade

Per UI-SPEC.md, Phase 16 must upgrade `<a>` tags to `next/link` and add active nav detection.

```tsx
// Source: UI-SPEC.md §1 + Next.js docs
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const pathname = usePathname()
const isActive = pathname.startsWith(item.href)

<Link
  href={item.href}
  style={{
    display: 'block',
    padding: '10px 20px',       // locked legacy value
    fontSize: '13px',
    color: isActive ? 'var(--offwhite)' : 'var(--warmgrey)',
    textDecoration: 'none',
    letterSpacing: '0.08em',
    borderLeft: isActive ? '3px solid var(--copper)' : '3px solid transparent',
    paddingLeft: isActive ? '17px' : '20px',  // compensate for 3px border
    transition: 'color 150ms ease',
  }}
>
  {item.label}
</Link>
```

### Pattern 7: PricingForm with react-hook-form + zod

```tsx
// Source: API route shape from app/api/admin/pricing/route.ts
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const pricingSchema = z.object({
  config: z.array(z.object({
    vehicle_class: z.string(),
    rate_per_km: z.number().positive(),
    hourly_rate: z.number().positive(),
    daily_rate: z.number().positive(),
  })),
  globals: z.object({
    airport_fee: z.number().min(0),
    night_coefficient: z.number().positive(),
    holiday_coefficient: z.number().positive(),
    extra_child_seat: z.number().min(0),
    extra_meet_greet: z.number().min(0),
    extra_luggage: z.number().min(0),
  }),
})

const { register, handleSubmit, formState: { isSubmitting } } = useForm({
  resolver: zodResolver(pricingSchema),
  defaultValues: initialData,  // loaded server-side from GET /api/admin/pricing
})
```

### Anti-Patterns to Avoid

- **`ssr: false` in Server Component:** Build error — move dynamic import into a `'use client'` file
- **Column definitions in Server Component:** Serialization error — define columns in the Client Component
- **No explicit height on recharts parent:** ResponsiveContainer fails to measure, chart invisible
- **terra-draw without `draw.on('ready', ...)` for Google Maps adapter:** Google adapter is asynchronous; calling `setMode()` before `ready` event silently fails
- **terra-draw `draw.stop()` missing in cleanup:** Memory leak if ZoneMap unmounts — always return cleanup function from useEffect
- **Importing terra-draw at module level in a file without `'use client'`:** SSR crash — terra-draw uses `window`, `document`, `HTMLElement`
- **Tailwind classNames on admin components:** All admin styling uses inline `style={{}}` — confirmed locked by UI-SPEC.md
- **Font sizes outside {11, 13, 28, 32}px:** Typography contract — any other value violates the spec
- **Non-4px-multiple spacing in new components:** Spacing scale is 4px-based; legacy sidebar values (10px, 2px) are locked exceptions

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Map polygon drawing | Custom canvas overlay | terra-draw + TerraDrawGoogleMapsAdapter | Event handling, mode management, GeoJSON output are complex |
| Table with sorting/expansion | Custom `<table>` with useState | @tanstack/react-table | Handles row expansion state, filtered row models, keyboard accessibility |
| Form validation | Manual input validation | react-hook-form + zod | Already installed; matches API schema exactly |
| Bar charts | SVG/canvas D3 charts | recharts | Already selected; handles responsive sizing, tooltips, dark theme |
| Date range filtering | Custom date comparison logic | Native `<input type="date">` + API query params | Date range already handled in bookings API route |

**Key insight:** The API routes are already complete and tested. Phase 16 is purely UI binding — avoid any business logic in components.

---

## Common Pitfalls

### Pitfall 1: `ssr: false` in a Server Component
**What goes wrong:** Next.js throws `Error: 'ssr: false' is not allowed with next/dynamic in Server Components` at build time.
**Why it happens:** The page files in `app/admin/(dashboard)/` are Server Components by default. Putting `dynamic(..., { ssr: false })` directly in `page.tsx` triggers this error.
**How to avoid:** Either (a) mark the page file `'use client'`, or (b) do the dynamic import inside a child component that is already `'use client'`.
**Warning signs:** Build fails with the error message above.

### Pitfall 2: terra-draw "ready" event required for Google Maps
**What goes wrong:** Calling `draw.setMode('polygon')` immediately after `draw.start()` silently fails — the draw mode appears not to activate.
**Why it happens:** The Google Maps adapter creates an `OverlayView` which is async. terra-draw emits `ready` when the overlay is attached.
**How to avoid:** Always use `draw.on('ready', () => { draw.setMode('polygon') })` — never call `setMode` directly after `start()` with the Google adapter.
**Warning signs:** Clicking DRAW ZONE button does nothing.

### Pitfall 3: terra-draw map container div ID mismatch
**What goes wrong:** Error: `"Google Map container div requires an id to be set"` in the browser console.
**Why it happens:** `@vis.gl/react-google-maps` places the `id` prop on the parent element, not the actual map div that `map.getDiv()` returns.
**How to avoid:** After `useMap()` returns the map instance, call `map.getDiv().id = 'unique-id'` before creating `TerraDrawGoogleMapsAdapter`.
**Warning signs:** The error appears as soon as the component mounts.

### Pitfall 4: recharts ResponsiveContainer with no height
**What goes wrong:** Chart renders with zero height — invisible.
**Why it happens:** `ResponsiveContainer width="100%" height="100%"` cannot measure if the parent has no explicit height.
**How to avoid:** Always wrap ResponsiveContainer in a `<div style={{ height: '280px' }}>` per the UI-SPEC.md chart spec.
**Warning signs:** Chart card renders but is blank.

### Pitfall 5: TanStack Table column definitions in Server Component
**What goes wrong:** Next.js error about passing functions from Server to Client components.
**Why it happens:** Column definitions contain render functions (JSX), which cannot be serialized across the Server/Client boundary.
**How to avoid:** Define `columns` array inside the `'use client'` BookingsTable component, not in `page.tsx`.
**Warning signs:** Build error about functions not being serializable.

### Pitfall 6: PricingForm `register` with number inputs
**What goes wrong:** Form submits string values instead of numbers; API rejects with 400 "Invalid payload".
**Why it happens:** `<input type="number">` returns strings in HTML; react-hook-form passes them as-is unless `valueAsNumber: true` is specified.
**How to avoid:** Use `register('fieldName', { valueAsNumber: true })` on all numeric inputs.
**Warning signs:** Zod validation fails with "Expected number, received string".

### Pitfall 7: Stats page aggregation — no dedicated stats API endpoint
**What goes wrong:** Stats page has no pre-built API route; it must derive all stats from the bookings data.
**Why it happens:** Phase 14 built `/api/admin/bookings` (paginated list) but no `/api/admin/stats` endpoint.
**How to avoid:** Stats page can either (a) call the existing bookings API with large limit to aggregate client-side, or (b) create a minimal `/api/admin/stats` route that runs aggregation queries directly against Supabase. Option (b) is cleaner and avoids loading hundreds of bookings just for counts.
**Warning signs:** Stats page is slow if aggregating from paginated API.

---

## Code Examples

### ZoneMap — Full SSR-safe wrapper

```tsx
// Source: Next.js lazy loading docs + terra-draw adapter guide
// app/admin/(dashboard)/zones/page.tsx
import dynamic from 'next/dynamic'  // This is a Server Component
// NOTE: dynamic with ssr:false is NOT allowed here directly
// Must delegate to a 'use client' component
import ZoneManager from '@/components/admin/ZoneManager'

// ZoneManager is 'use client' and does: dynamic(() => import('./ZoneMapInner'), { ssr: false })
```

### Bookings API — fetching with filters

```ts
// Direct fetch from page/component — uses session cookie automatically
const params = new URLSearchParams({
  page: String(page),
  limit: '20',
  ...(startDate && { startDate }),
  ...(endDate && { endDate }),
  ...(tripType && tripType !== 'all' && { tripType }),
  ...(search && { search }),
})
const res = await fetch(`/api/admin/bookings?${params}`)
const { bookings, total } = await res.json()
```

### StatusBadge component (exact spec)

```tsx
// Source: UI-SPEC.md §2
const variantStyles = {
  active:   { bg: '#1a3a2a', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' },
  inactive: { bg: '#2a1a1a', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
  pending:  { bg: '#3a2a1a', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)' },
  quote:    { bg: '#1a2a3a', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' },
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  const s = variantStyles[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '4px 8px', backgroundColor: s.bg, color: s.color,
      border: s.border, borderRadius: '2px',
      fontFamily: 'var(--font-montserrat)', fontSize: '11px',
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.color }} />
      {label}
    </span>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Maps Drawing Manager | terra-draw + adapter | Deprecated Aug 2025 | Drawing Manager removed May 2026; all new drawing must use terra-draw |
| @react-google-maps/api | @vis.gl/react-google-maps | 2024 | vis.gl is the actively maintained successor |
| react-table (v7) | @tanstack/react-table v8 | 2022 | New scoped package, TypeScript-first, headless |
| recharts v2 | recharts v3 | 2024-2025 | v3 latest stable; v3 alpha/beta track also exists |

**Deprecated/outdated:**
- Google Maps `DrawingManager`: deprecated Aug 2025 — do not use
- `@react-google-maps/api`: community-maintained only, not actively developed — use `@vis.gl/react-google-maps`

---

## Open Questions

1. **Stats aggregation endpoint**
   - What we know: `/api/admin/stats` was not built in Phase 14; bookings API exists with full filter support
   - What's unclear: Whether stats page should call the existing bookings API and aggregate client-side, or whether a new `/api/admin/stats` route should be created in Phase 16
   - Recommendation: Create a minimal `/api/admin/stats` route in Wave 1 of Phase 16 that does direct Supabase aggregate queries (COUNT + SUM grouped by month/vehicle_class/trip_type). This avoids loading hundreds of rows for display.

2. **Google Maps Map ID for dark style**
   - What we know: UI-SPEC.md specifies "dark / night tile style" via `mapId`; `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` env var may or may not be set
   - What's unclear: Whether a dark map ID has been configured in the Google Cloud Console
   - Recommendation: Check if `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` is in `.env.local`; if not, the map will render in default light style. The planner should include a verification step for this.

3. **react-is peer dependency for recharts**
   - What we know: recharts 3.x lists `react-is` as a peer dependency; react-is 19.2.4 is compatible
   - What's unclear: Whether `npm install recharts` auto-installs react-is or requires manual addition
   - Recommendation: Include `react-is` in the install command if npm warns about missing peer dependency.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `nvm use 22 && npx vitest run --reporter=verbose tests/admin-pricing.test.ts tests/admin-zones.test.ts tests/admin-bookings.test.ts` |
| Full suite command | `nvm use 22 && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRICING-01–04 | PricingForm renders fields, submits correct payload to PUT /api/admin/pricing | unit (component) | `npx vitest run tests/PricingForm.test.tsx` | ❌ Wave 0 |
| ZONES-01–03 | ZoneMap renders, zone list panel renders active/inactive states, toggle calls PATCH | unit (component) | `npx vitest run tests/ZoneMap.test.tsx` | ❌ Wave 0 |
| BOOKINGS-01–05 | BookingsTable renders rows, filter chips trigger re-fetch, row expansion shows detail | unit (component) | `npx vitest run tests/BookingsTable.test.tsx` | ❌ Wave 0 |
| STATS-01–05 | Stats page renders KPICards with correct labels; chart data transforms correct | unit (component) | `npx vitest run tests/StatsPage.test.tsx` | ❌ Wave 0 |
| API integration | `/api/admin/stats` (if created) returns correct aggregated data | unit (route) | `npx vitest run tests/admin-stats.test.ts` | ❌ Wave 0 (if route created) |

**Existing test files (already pass):**
- `tests/admin-pricing.test.ts` — covers the API route (Phase 14)
- `tests/admin-zones.test.ts` — covers the API route (Phase 14)
- `tests/admin-bookings.test.ts` — covers the API route (Phase 14)

**Note on terra-draw/map component testing:** `ZoneMap.tsx` uses browser-only APIs (canvas, DOM overlay). In vitest/jsdom, the map and terra-draw must be fully mocked. The test should verify: (a) the component renders without crashing, (b) the zone list panel displays correctly, (c) API calls are fired on save/toggle/delete. It should NOT test the actual drawing interaction.

### Sampling Rate

- **Per task commit:** `nvm use 22 && npx vitest run tests/[relevant-test-file]`
- **Per wave merge:** `nvm use 22 && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/PricingForm.test.tsx` — covers PRICING-01–04; mocks fetch for PUT /api/admin/pricing
- [ ] `tests/ZoneMap.test.tsx` — covers ZONES-01–03; mocks @vis.gl/react-google-maps, terra-draw, and fetch
- [ ] `tests/BookingsTable.test.tsx` — covers BOOKINGS-01–05; mocks fetch for GET /api/admin/bookings
- [ ] `tests/StatsPage.test.tsx` — covers STATS-01–05; mocks fetch for stats data
- [ ] `tests/admin-stats.test.ts` — covers stats API route (if created)

---

## Sources

### Primary (HIGH confidence)

- npm registry (verified 2026-04-02): `@vis.gl/react-google-maps@1.8.2`, `terra-draw@1.27.0`, `terra-draw-google-maps-adapter@1.3.1`, `recharts@3.8.1`, `@tanstack/react-table@8.21.3`
- [Next.js Lazy Loading Guide](https://nextjs.org/docs/app/guides/lazy-loading) — `next/dynamic` with `ssr: false` must be in Client Components
- [TanStack Table v8 Expanding Guide](https://tanstack.com/table/v8/docs/guide/expanding) — `getExpandedRowModel`, `getRowCanExpand`, `row.getIsExpanded()`
- [terra-draw Adapters Guide](https://github.com/JamesLMilner/terra-draw/blob/main/guides/3.ADAPTERS.md) — `TerraDrawGoogleMapsAdapter` usage, `ready` event requirement
- Project source files: `prestigo/app/api/admin/pricing/route.ts`, `prestigo/app/api/admin/zones/route.ts`, `prestigo/app/api/admin/bookings/route.ts` — API shapes confirmed
- `prestigo/components/admin/AdminSidebar.tsx` — existing locked values confirmed
- `prestigo/app/admin/(dashboard)/layout.tsx` — dashboard route group confirmed

### Secondary (MEDIUM confidence)

- [Google Maps Terra Draw example](https://developers.google.com/maps/documentation/javascript/examples/map-drawing-terradraw) — Drawing Manager deprecated Aug 2025, terra-draw recommended
- [Bricyyy/react-visgl-terradraw-maps](https://github.com/Bricyyy/react-visgl-terradraw-maps) — community integration example confirming div ID fix pattern
- [recharts BarChart API](https://recharts.github.io/en-US/api/BarChart/) — ResponsiveContainer parent height requirement
- [vis.gl react-google-maps docs](https://visgl.github.io/react-google-maps/) — APIProvider + Map + useMap() hook

### Tertiary (LOW confidence)

- Community Stack Overflow reports on `@vis.gl/react-google-maps` + terra-draw div ID issue — verified pattern exists but exact fix code is community-sourced

---

## Metadata

**Confidence breakdown:**
- Standard stack (packages/versions): HIGH — verified against npm registry on 2026-04-02
- Architecture (SSR pattern, component split): HIGH — based on Next.js official docs + confirmed project patterns
- terra-draw integration: MEDIUM — core API confirmed from official docs; div ID fix is community-validated
- Pitfalls: HIGH — all pitfalls are either confirmed from official docs or directly observable in project source

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable libraries — recharts, tanstack-table; terra-draw active development warrants 30-day window)
