# Roadmap: Prestigo Booking Form

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-03-30)
- ✅ **v1.1 Go Live** — Phases 7–9 (shipped 2026-04-01)
- 🚧 **v1.2 Operator Dashboard** — Phases 10–16 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–6) — SHIPPED 2026-03-30</summary>

- [x] Phase 1: Foundation & Trip Entry (6/6 plans) — completed 2026-03-25
- [x] Phase 2: Pricing & Vehicle Selection (5/5 plans) — completed 2026-03-26
- [x] Phase 3: Booking Details (4/4 plans) — completed 2026-03-27
- [x] Phase 4: Payment (4/4 plans) — completed 2026-03-30
- [x] Phase 5: Backend & Notifications (3/3 plans) — completed 2026-03-30
- [x] Phase 6: Homepage Widget & Polish (3/3 plans) — completed 2026-03-30

See full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Go Live (Phases 7–9) — SHIPPED 2026-04-01</summary>

- [x] Phase 7: Foundation — Supabase Schema + Env Vars + Deploy (2/2 plans) — completed 2026-03-31
- [x] Phase 8: Stripe + Health Check + Maps Keys (3/3 plans) — completed 2026-03-31
- [x] Phase 9: Resend Domain Verification + Email Sign-Off (2/2 plans) — completed 2026-04-01

See full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

---

## v1.2 Operator Dashboard (Phases 10–15)

### Phase 10: Auth Infrastructure
**Goal:** Install `@supabase/ssr`, create `lib/supabase/server.ts` + `lib/supabase/middleware.ts`, add `middleware.ts` at project root (session refresh only, no redirect logic yet), add env vars. Booking wizard must be fully regression-free after this phase.

**Dependencies:** None (additive only — no existing code changed except adding packages and new lib files)
**Requirements covered:** AUTH-01 (partially — middleware exists, redirect logic added in Phase 13)
**Risk:** Low — all new files, no existing code modified

**Key deliverables:**
- `npm install @supabase/ssr @turf/boolean-point-in-polygon @turf/helpers`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` added to `.env.local` and Vercel
- `lib/supabase/server.ts` — `createServerClient` wrapper from `@supabase/ssr`
- `lib/supabase/middleware.ts` — `updateSession()` (session refresh only, no redirects)
- `middleware.ts` at project root
- Regression test: booking wizard end-to-end still works

**Plans:** 1/1 plans complete

Plans:
- [ ] 10-01-PLAN.md — Auth infrastructure: install @supabase/ssr, env vars, lib/supabase/server.ts, lib/supabase/middleware.ts, root middleware.ts, regression gate

---

### Phase 11: Database Schema
**Goal:** Apply two new Supabase migrations: `pricing_config` table (seeded from current `lib/pricing.ts` constants) and `coverage_zones` table (empty). Both tables have RLS enabled with public-read policy.

**Dependencies:** Phase 10 (Supabase client patterns established)
**Requirements:** [PRICING-05, ZONES-04]
**Risk:** Low — additive schema changes, existing `bookings` table untouched

**Key deliverables:**
- `supabase/migrations/0002_create_pricing_config.sql` — pricing_config + pricing_globals tables + RLS + seed
- `supabase/migrations/0003_create_coverage_zones.sql` — table + RLS, empty
- Verification: `pricing_config` rows match current `lib/pricing.ts` hardcoded constants exactly

**Plans:** 1/1 plans complete

Plans:
- [x] 11-01-PLAN.md — Write migration SQL files (pricing_config + pricing_globals + coverage_zones) and apply via Supabase MCP — completed 2026-04-01

---

### Phase 12: Core Booking Flow Update
**Goal:** Modify `/api/calculate-price/route.ts` to read rates from `pricing_config` (cached, tag: `'pricing-config'`) and add Turf.js point-in-polygon zone check. When no zones exist, pricing is unaffected. When zones exist, pickup/destination outside all zones triggers `quoteMode: true`.

**Dependencies:** Phase 11 (tables must exist with seed data)
**Requirements covered:** PRICING-05, PRICING-06, ZONES-04, ZONES-05
**Risk:** HIGH — modifies the live pricing endpoint. Pricing must match before and after migration. Smoke test thoroughly.

**Key deliverables:**
- `lib/pricing-config.ts` — DB loader with Next.js cache tag `'pricing-config'`
- Modified `lib/pricing.ts` — `calculatePrice()` accepts rates as parameter (hardcoded constants become seed-only reference, not exported)
- Modified `/api/calculate-price/route.ts` — loads rates from DB; adds zone check
- Smoke test A: prices match hardcoded values after migration
- Smoke test B: `quoteMode: true` when origin outside a test zone
- Smoke test C: `quoteMode: false` when no zones are defined

**Plans:** 2/2 plans complete

Plans:
- [x] 12-01-PLAN.md — Data layer: unit tests + pricing-config.ts DB loader + refactor pricing.ts to accept rates param — completed 2026-04-02
- [x] 12-02-PLAN.md — Route wiring: modify route.ts to use DB rates + Turf.js zone check + smoke test verification — completed 2026-04-02

---

### Phase 13: Admin Auth + Login UI
**Goal:** Add redirect logic to `updateSession()`. Create `/admin/login` page (email+password form). Create `app/admin/layout.tsx` (server-side double-guard + admin sidebar shell). Manually create the operator's Supabase Auth user.

**Dependencies:** Phase 10 (middleware infrastructure), Phase 12 (core flow stable — no regressions to debug during auth work)
**Requirements covered:** AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Risk:** Medium — infinite redirect loop if cookie dual-write is missing; follow `@supabase/ssr` pattern exactly

**Key deliverables:**
- Supabase Auth email provider enabled; admin user created in Dashboard; `is_admin: true` in `app_metadata`
- `/admin/login/page.tsx` — `signInWithPassword` form, redirect to `/admin` on success
- `app/admin/layout.tsx` — server `getUser()` double-check, `AdminSidebar` shell, unauthenticated → redirect
- Redirect logic in `lib/supabase/middleware.ts`: `/admin/*` (not login) + no session → `/admin/login`; login + session → `/admin`
- Verification: unauthenticated GET `/admin/pricing` → redirect to `/admin/login` → login → redirect to `/admin`

**Plans:** 2/2 plans complete

Plans:
- [x] 13-01-PLAN.md — Redirect logic in updateSession() + login page with Server Actions — completed 2026-04-02
- [x] 13-02-PLAN.md — Admin dashboard layout (route group), AdminSidebar, sign-out + end-to-end verification — completed 2026-04-02

---

### Phase 14: Admin API Routes
**Goal:** Build all three admin API route handlers: pricing (GET + PUT with cache bust), zones (GET + POST + DELETE + PATCH), bookings (GET paginated). All routes verify session via `getUser()`. No UI yet — verify with curl/Postman.

**Dependencies:** Phase 11 (tables exist), Phase 13 (auth guard pattern established)
**Requirements covered:** PRICING-06, ZONES-02, ZONES-03, BOOKINGS-01 (backend)
**Risk:** Low — isolated route handlers with no client-side state

**Key deliverables:**
- `/api/admin/pricing/route.ts` — `GET` returns current config; `PUT` validates + upserts + calls `revalidateTag('pricing-config')`
- `/api/admin/zones/route.ts` — `GET` all zones; `POST` create (Zod validate GeoJSON); `DELETE` by id; `PATCH` toggle active; all verify `is_admin`
- `/api/admin/bookings/route.ts` — `GET` paginated with date range, trip type, search query params
- All routes: `401` for unauthenticated; `403` for authenticated non-admin
- Verification: curl tests for each endpoint (auth + data correctness)

**Plans:** 2/2 plans complete

Plans:
- [ ] 14-01-PLAN.md — Admin pricing route (GET + PUT with cache bust) + unit tests
- [ ] 14-02-PLAN.md — Admin zones route (GET/POST/DELETE/PATCH) + bookings route (GET paginated) + unit tests

---

### Phase 15: UI Design Contract
**Goal:** Produce `UI-SPEC.md` — a pixel-level design contract for all admin pages before any code is written. Based on two operator design references. Covers layout, component library, color tokens, typography, and component-by-component specs for all 4 admin pages.

**Dependencies:** Phase 14 (API shape finalized — forms know what fields they have)
**Requirements covered:** Design foundation for PRICING-01–04, ZONES-01–03, BOOKINGS-01–05, STATS-01–05
**Risk:** Low — no code; output is a spec document

**Design references:**
- **Ref 1:** Requests dashboard — left sidebar with pinned/category nav, quick filter chips (Today/Open/Confirmed/Ongoing/In house), data table with colored status badges (Open=red, Confirmed=green, Ongoing=orange), search bar at top
- **Ref 2:** Chauffeur admin wireframe (TAYLOR) — KPI metric cards row, Booking Volume bar+line charts, Upcoming Bookings table, Recent Activity Log panel, Trip Detail view

**Key deliverables:**
- Run `/gsd:ui-phase 15` with both references as input
- `UI-SPEC.md` covering: admin color palette (PRESTIGO copper/anthracite adapted for light admin UI), typography scale, layout grid, sidebar component, status badge variants, KPI card component, table component specs, chart specs, form layout specs
- Component inventory: AdminSidebar, StatusBadge, KPICard, BookingsTable, PricingForm, ZoneMap, StatsChart, FilterChips
- Responsive breakpoints for desktop-first admin (min 1024px)

**Plans:** 1 plan

Plans:
- [ ] 15-01-PLAN.md — Validate UI-SPEC.md against source-of-truth files and finalize as approved design contract

---

### Phase 16: Admin UI Pages
**Goal:** Build all four admin UI pages per UI-SPEC.md. Install remaining packages (`@vis.gl/react-google-maps`, `terra-draw`, `recharts`, `@tanstack/react-table`). Wire each page to its API route.

**Dependencies:** Phase 14 (all admin API routes working), Phase 15 (UI-SPEC.md approved), Phase 13 (admin layout exists)
**Requirements covered:** PRICING-01–04, ZONES-01–03, BOOKINGS-01–05, STATS-01–05
**Risk:** High — terra-draw SSR must use `next/dynamic` with `ssr: false`; most complex phase

**Key deliverables:**
- `npm install @vis.gl/react-google-maps terra-draw recharts @tanstack/react-table`
- `components/admin/PricingForm.tsx` — react-hook-form + zod; per-vehicle class rows; save → `PUT /api/admin/pricing`
- `app/admin/pricing/page.tsx` — loads config; renders `PricingForm`
- `components/admin/ZoneMap.tsx` — `next/dynamic` with `ssr: false`; `@vis.gl/react-google-maps` + terra-draw; polygon → `POST /api/admin/zones`; zone list with active toggle + delete
- `app/admin/zones/page.tsx` — zone manager
- `components/admin/BookingsTable.tsx` — `@tanstack/react-table`; filter chips (status + date + trip type); expandable rows; status badges per UI-SPEC
- `app/admin/bookings/page.tsx` — bookings table with KPI summary cards (today's count, this week revenue)
- `app/admin/stats/page.tsx` — recharts bar chart (12-month revenue) + KPI cards row
- Verification: all pages render and mutate correctly; zone save activates quoteMode in booking wizard; pricing change reflected in next price calculation

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Trip Entry | v1.0 | 6/6 | Complete | 2026-03-25 |
| 2. Pricing & Vehicle Selection | v1.0 | 5/5 | Complete | 2026-03-26 |
| 3. Booking Details | v1.0 | 4/4 | Complete | 2026-03-27 |
| 4. Payment | v1.0 | 4/4 | Complete | 2026-03-30 |
| 5. Backend & Notifications | v1.0 | 3/3 | Complete | 2026-03-30 |
| 6. Homepage Widget & Polish | v1.0 | 3/3 | Complete | 2026-03-30 |
| 7. Foundation — Supabase + Env + Deploy | v1.1 | 2/2 | Complete | 2026-03-31 |
| 8. Stripe + Health Check + Maps Keys | v1.1 | 3/3 | Complete | 2026-03-31 |
| 9. Resend Domain + Email Sign-Off | v1.1 | 2/2 | Complete | 2026-04-01 |
| 10. Auth Infrastructure | v1.2 | 1/1 | Complete | 2026-04-01 |
| 11. Database Schema | v1.2 | 1/1 | Complete | 2026-04-01 |
| 12. Core Booking Flow Update | v1.2 | 2/2 | Complete | 2026-04-02 |
| 13. Admin Auth + Login UI | v1.2 | 2/2 | Complete | 2026-04-02 |
| 14. Admin API Routes | v1.2 | 2/2 | Complete | 2026-04-02 |
| 15. UI Design Contract | v1.2 | 0/1 | In Progress | — |
| 16. Admin UI Pages | v1.2 | 0/? | Pending | — |
