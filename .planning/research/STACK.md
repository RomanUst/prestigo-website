# Stack Research — Prestigo v1.2 Operator Dashboard

**Domain:** Operator Dashboard — admin auth, geo-zones editor, pricing config, bookings table, statistics charts
**Researched:** 2026-04-01
**Confidence:** HIGH (all versions verified via `npm view` 2026-04-01; deprecation timelines from official sources)

> This document covers ONLY net-new additions to the existing stack.
> Validated capabilities already in production — Next.js 16.1.7, React 19.2.3, TypeScript, Tailwind CSS 4,
> Supabase (`@supabase/supabase-js` ^2.101.0), Stripe, Resend, Google Maps (`@googlemaps/js-api-loader` ^2.0.2),
> Zustand, Zod, React Hook Form — are NOT re-researched here.

---

## Recommended Stack — Net New Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@supabase/ssr` | 0.10.0 | Supabase Auth in Next.js App Router — middleware session refresh, `createServerClient`, `createBrowserClient` | The only current official package for Supabase Auth in App Router. Replaces the deprecated `@supabase/auth-helpers-nextjs`. Exports `createBrowserClient` (Client Components) and `createServerClient` (Server Components, middleware, Route Handlers). Peer dep satisfied by the existing `@supabase/supabase-js` ^2.101.0 — no conflict. |
| `@vis.gl/react-google-maps` | 1.8.2 | React components and hooks for Google Maps — `<APIProvider>`, `<Map>`, `<Polygon>`, `useMapsLibrary`, `useMap` | Google-sponsored React wrapper (OpenJS Foundation). Coexists safely with the existing `@googlemaps/js-api-loader` — both use Google's singleton dynamic import API; the script is loaded exactly once. Required for rendering editable polygon overlays on the zones editor. React 19 compatible. |
| `terra-draw` | 1.27.0 | Interactive polygon drawing — create, edit vertices, delete, output GeoJSON | Google's `DrawingManager` was deprecated August 2025 and will be removed in May 2026. Terra Draw is Google's own recommended replacement — the official Google Maps docs link directly to a Terra Draw example. The vis.gl team confirmed migration to Terra Draw in their repo. Outputs standard GeoJSON. Works with `@vis.gl/react-google-maps` via `OverlayView`. Must NOT use `useMapsLibrary('drawing')` — it will throw at runtime after May 2026. |
| `recharts` | 3.8.1 | SVG charts — revenue line chart and booking-count bar chart on the stats page | React-native, TypeScript-first, 1M+ weekly downloads. The de-facto standard for 2026 Next.js admin dashboards. Theming maps directly to Tailwind CSS color tokens via `stroke`/`fill` props — no external CSS to import. No conflict with existing packages. |
| `@tanstack/react-table` | 8.21.3 | Headless data table — bookings list with sorting, filtering, server-side pagination | Headless, 10–15 kb, zero runtime dependencies beyond React. Full control over markup — renders with existing Tailwind CSS classes and PRESTIGO design tokens. Supports server-side pagination (fetch one page from Supabase, pass array to `useReactTable`). React 19 compatible. Industry standard in 2026 Next.js admin stacks. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` | 0.10.0 | Three Supabase client factory functions: browser, server, middleware | Every `/admin` route and the `middleware.ts` file |
| `@vis.gl/react-google-maps` | 1.8.2 | Map container + polygon rendering | `/admin/zones` page only |
| `terra-draw` | 1.27.0 | Interactive drawing controls | `/admin/zones` editor only — lazy-import so the ~200 kb library never enters the customer-facing booking bundle |
| `recharts` | 3.8.1 | `<LineChart>`, `<BarChart>`, `<Tooltip>`, `<Legend>` | `/admin/stats` page only |
| `@tanstack/react-table` | 8.21.3 | `useReactTable`, column definitions, pagination state | `/admin/bookings` page only |

### Pricing Editor

No new library needed. The pricing configuration editor reuses the existing stack:
- `react-hook-form` + `@hookform/resolvers` + `zod` for form state and validation (already installed)
- Supabase Server Action (`upsert`) to persist to a `pricing_config` table (JSONB column)
- Tailwind CSS for layout — a straightforward labeled-input grid

Reaching for a JSON schema form library or a dynamic config UI library would add complexity with no benefit for a fixed-shape pricing schema.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase Dashboard — Auth | Create the single admin user manually | Dashboard → Authentication → Users → Invite user. Disable email confirmation for the admin account. No public sign-up route needed. |
| Supabase SQL Editor | Create `pricing_config` and `zones` tables | Follow existing pattern in `prestigo/supabase/migrations/`. `pricing_config`: `id`, `data JSONB`, `updated_at`. `zones`: `id`, `name TEXT`, `coordinates JSONB`, `created_at`. |

---

## Installation

```bash
# Auth (needed for all /admin routes)
npm install @supabase/ssr

# Maps + polygon drawing (zones editor only)
npm install @vis.gl/react-google-maps terra-draw

# Charts (stats page only)
npm install recharts

# Data table (bookings list only)
npm install @tanstack/react-table
```

No dev-only dependencies. All four are runtime packages.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Never for new code — it is deprecated and receives no further updates |
| `terra-draw` | `useMapsLibrary('drawing')` / DrawingManager | Never — it will be removed from the Maps JS API in May 2026 and is already firing deprecation warnings |
| `terra-draw` | Custom mouse-event polygon drawing | Only if terra-draw's polygon-with-holes limitation is a blocker. v1.2 zones are simple convex/concave polygons — not a concern. |
| `@vis.gl/react-google-maps` | `@react-google-maps/api` (tomchentw) | If the project predated vis.gl and migrating is costly. For new code, tomchentw is largely unmaintained. |
| `@vis.gl/react-google-maps` | `@googlemaps/react-wrapper` | Never for new code — Google archived this package; vis.gl is the official successor. |
| `recharts` | Tremor | If you want pre-styled KPI cards, filters, and 35+ dashboard components out of the box. Tremor is built on Recharts + Radix UI — overkill when only 2 chart types are needed and the brand diverges from Tremor's design system. |
| `recharts` | Chart.js + react-chartjs-2 | If canvas rendering performance matters (tens of thousands of data points). Admin stats have at most hundreds of rows — SVG rendering is fine and TypeScript support is stronger in Recharts. |
| `@tanstack/react-table` | AG Grid Community | If the table needs Excel-like features, virtual scrolling of 100k+ rows, or enterprise column grouping. Bookings list for a single-operator service will not reach that scale in v1. AG Grid is 200 kb+. |
| No new library (pricing editor) | `react-jsonschema-form` / Formik + JSON schema | Only if pricing config shape is unknown at build time. The shape is fully known — typed Zod schema on top of existing react-hook-form is simpler, safer, and already in the project. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@supabase/auth-helpers-nextjs` | Deprecated; not maintained | `@supabase/ssr` 0.10.0 |
| `google.maps.drawing.DrawingManager` (via `useMapsLibrary('drawing')`) | Deprecated August 2025, removed May 2026 — runtime failure guaranteed | `terra-draw` 1.27.0 |
| `supabase.auth.getSession()` in middleware or Server Components | Returns unverified cookie data — spoofable by the client; does not call the Auth server | `supabase.auth.getUser()` — makes a network call to verify the token on every request |
| `next-auth` / `Auth.js` | Adds OAuth providers, JWT configuration, and a callbacks layer not needed for a single email+password admin account | Supabase Auth + `@supabase/ssr` — already in the stack, simpler, cohesive |
| Tremor | Pulls in Radix UI as a transitive dependency; opinionated design diverges from PRESTIGO copper/anthracite brand; Tremor is itself a wrapper over Recharts | `recharts` directly |
| `@googlemaps/react-wrapper` | Archived by Google | `@vis.gl/react-google-maps` |

---

## Stack Patterns by Variant

**For polygon storage — if spatial queries are needed later (e.g. "is this pickup point inside any coverage zone?"):**
- Enable PostGIS on Supabase (available on all plans at no extra cost)
- Store zones as `geography(Polygon, 4326)` instead of JSONB
- Query: `SELECT id FROM zones WHERE ST_Contains(coordinates::geometry, ST_Point($lng, $lat))`
- Terra Draw outputs GeoJSON — convert with `ST_GeomFromGeoJSON()`
- This is a v2 concern; v1.2 point-in-polygon check can run client-side with a ray-casting helper or `@turf/boolean-point-in-polygon`

**For polygon storage — v1.2 scope (simple client-side check):**
- Store as JSONB: `[{ lat: number, lng: number }]`
- Point-in-polygon check in the booking wizard: small utility function, no library needed
- Migrating to PostGIS later only requires a column type change and one query update

**For auth — if multi-operator support is added in v2:**
- Add `role TEXT` to `auth.users.raw_user_meta_data` or a `profiles` table joined to `auth.users`
- Check `user.user_metadata.role === 'admin'` in middleware after `getUser()`
- v1.2 requires none of this — single user, any authenticated session is the admin session

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `@supabase/ssr` | 0.10.0 | `@supabase/supabase-js` ^2.101.0 | Peer dep already satisfied |
| `@supabase/ssr` | 0.10.0 | Next.js 16.1.7 App Router | Designed for App Router; middleware pattern tested |
| `@vis.gl/react-google-maps` | 1.8.2 | React 19.2.3 | React 19 confirmed supported |
| `@vis.gl/react-google-maps` | 1.8.2 | `@googlemaps/js-api-loader` ^2.0.2 | Safe coexistence — both use the singleton dynamic import API |
| `terra-draw` | 1.27.0 | `@vis.gl/react-google-maps` 1.8.2 | Integration via `OverlayView`; official example at visgl.github.io/react-google-maps/examples/terra-draw |
| `recharts` | 3.8.1 | React 19.2.3 | React 19 supported |
| `@tanstack/react-table` | 8.21.3 | React 19.2.3 | React 19 supported; no peer dep conflicts |

---

## Sources

- [Supabase — Setting up Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) — `@supabase/ssr` pattern, `getUser()` vs `getSession()` security requirement; HIGH confidence
- [vis.gl/react-google-maps — Drawing deprecation discussion #825](https://github.com/visgl/react-google-maps/discussions/825) — DrawingManager removed May 2026, Terra Draw as migration path; HIGH confidence
- [Google Maps Docs — Draw on a map using Terra Draw](https://developers.google.com/maps/documentation/javascript/examples/map-drawing-terradraw) — official Google endorsement of Terra Draw; HIGH confidence
- [vis.gl/react-google-maps — Polygons discussion #636](https://github.com/visgl/react-google-maps/discussions/636) — `<Polygon>` component and manual drawing patterns; HIGH confidence
- [vis.gl/react-google-maps homepage](https://visgl.github.io/react-google-maps/) — React 19 support, coexistence with js-api-loader; HIGH confidence
- Versions verified 2026-04-01 via `npm view`: `@vis.gl/react-google-maps@1.8.2`, `terra-draw@1.27.0`, `@supabase/ssr@0.10.0`, `@tanstack/react-table@8.21.3`, `recharts@3.8.1`
- [Syncfusion — Top 5 React Chart Libraries 2026](https://www.syncfusion.com/blogs/post/top-5-react-chart-libraries) — Recharts recommendation rationale; MEDIUM confidence (community source, consistent with npm download data)

---

*Stack research for: Prestigo v1.2 Operator Dashboard*
*Researched: 2026-04-01*
