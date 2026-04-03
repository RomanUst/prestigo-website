# Prestigo — Booking Wizard + Operator Dashboard

## What This Is

Custom multi-step booking wizard for rideprestigo.com — a premium chauffeur service based in Prague — with a full operator dashboard for pricing, coverage zones, and booking management.

Clients book one-way transfers, airport rides, hourly or daily hire directly on the site: selecting a vehicle class with a live price, adding optional extras, filling in passenger details, and paying online via Stripe. The operator controls all pricing (base rates per vehicle class, airport fee, night/holiday coefficients, extras surcharges) via a protected `/admin` dashboard, draws coverage zones on Google Maps to define the service area, and monitors all bookings and revenue in real time.

**Current state:** v1.2 Operator Dashboard shipped 2026-04-02. Live at rideprestigo.com.

## Core Value

A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

## Requirements

### Validated

- ✓ Zustand store with sessionStorage persistence — v1.0
- ✓ 6-step wizard shell with progress bar and animated transitions — v1.0
- ✓ Step 1: trip type selector (5 types), Google Places Autocomplete, PRG airport auto-fill — v1.0
- ✓ Step 2: date picker (no past dates) + 15-min time slots — v1.0
- ✓ Step 3: vehicle selection (Business, First Class, Business Van) with live price — v1.0
- ✓ Google Routes API pricing engine server-side, API key never exposed — v1.0
- ✓ "Request a quote" fallback for unmapped routes — v1.0
- ✓ Step 4: optional extras (child seat, meet & greet, extra luggage) with price increments — v1.0
- ✓ Step 5: passenger details with inline Zod validation on blur — v1.0
- ✓ Flight number field for airport rides (no live flight API) — v1.0
- ✓ Step 6: Stripe PaymentIntent, double-charge protection, inline error recovery — v1.0
- ✓ Confirmation page at /book/confirmation with booking reference + ICS calendar download — v1.0
- ✓ Supabase persistence with 3-retry backoff + Stripe webhook as source of truth — v1.0
- ✓ Client confirmation email + manager alert email via Resend — v1.0
- ✓ BookingWidget on homepage (replaced LimoAnywhere iframe) — v1.0
- ✓ Fully responsive at 375px, WCAG touch targets 44px, keyboard navigation — v1.0
- ✓ Supabase bookings table in production (33-column schema, SQL migration file) — v1.1
- ✓ All 8 env vars set in Vercel Production scope — v1.1
- ✓ `/api/health` endpoint with per-service probes (Supabase, Stripe, Resend) — v1.1
- ✓ Stripe live-mode webhook registered at production URL — v1.1
- ✓ Google Maps two-key separation (server unrestricted, client domain-restricted) — v1.1
- ✓ Resend domain `rideprestigo.com` verified (SPF + DKIM), emails to inbox confirmed — v1.1
- ✓ DB-driven pricing via `pricing_config` table, `unstable_cache` with tag `pricing-config` — v1.2 (Phase 12)
- ✓ Turf.js coverage zone enforcement for transfer trips (`coverage_zones` table, `quoteMode: true` when outside) — v1.2 (Phase 12)
- ✓ Supabase Auth email+password login gate for `/admin/*` with middleware redirect — v1.2 (Phase 13)
- ✓ `signIn`/`signOut` Server Actions, login page with `useActionState`, inline error display — v1.2 (Phase 13)
- ✓ Admin dashboard layout with server-side `getUser()` double-guard, `AdminSidebar` with nav + sign-out — v1.2 (Phase 13)
- ✓ Admin API routes: GET/PUT `/api/admin/pricing` (Zod validation, cache bust), GET/POST/DELETE/PATCH `/api/admin/zones`, GET `/api/admin/bookings` (paginated, filterable) — v1.2 (Phase 14)

  - ✓ Supabase Auth-protected `/admin` area (email+password, `is_admin` app_metadata gate) — v1.2 (Phase 13)
  - ✓ Admin pricing editor: base rates, extras, airport fee, night/holiday coefficients — all changes live immediately — v1.2 (Phases 14, 16, 17)
  - ✓ Coverage zone editor: draw polygons on Google Maps, store GeoJSON in Supabase, drive quoteMode in booking wizard — v1.2 (Phases 12, 14, 16)
  - ✓ Bookings table with pagination, filters (date, trip type), search, expandable rows — v1.2 (Phase 16)
  - ✓ Stats dashboard with revenue charts (12-month) and KPI cards — v1.2 (Phase 16)
  - ✓ Airport fee coordinate-based detection (resilient to placeId mismatches) — v1.2 (Phase 17)

### Active

<!-- v1.3 Pricing & Booking Management -->

- [ ] ZONES-06: Zone logic — trip shows price if pickup OR dropoff is within an active zone; quoteMode only when neither point is in any zone
- [ ] PRICING-07: Operator can configure holiday dates in admin; trips booked on those dates auto-apply holiday_coefficient
- [ ] PRICING-08: Operator can set minimum fare per vehicle class; calculated prices below the floor are raised to the minimum
- [ ] PROMO-01: Operator can create promo codes (code, discount type %, expiry, usage limit) in admin
- [ ] PROMO-02: Operator can deactivate or delete promo codes
- [ ] PROMO-03: Client can enter promo code in booking wizard; valid code updates displayed price
- [ ] PROMO-04: Promo code validated server-side before payment; invalid codes rejected with error
- [ ] BOOKINGS-06: Operator can create manual booking via admin form (for phone orders)
- ✓ BOOKINGS-07: Operator can change booking status (pending → confirmed → completed → cancelled) — v1.3 (Phase 19)
- [ ] BOOKINGS-08: Operator can cancel booking with optional Stripe refund
- ✓ BOOKINGS-09: Operator can add internal notes to any booking — v1.3 (Phase 19)
- [ ] UX-01: Admin panel is responsive and usable on mobile (375px+)

## Current Milestone: v1.3 Pricing & Booking Management

**Goal:** Enhance admin pricing logic (zone direction fix, holidays, promo codes, minimum fare) and add full booking management actions (manual creation, status workflow, cancellation + Stripe refund, operator notes) plus mobile-responsive admin UI.

**Target features:**
- Zone pricing logic: show price if pickup OR dropoff in zone
- Holiday dates configuration with auto-coefficient
- Minimum fare per vehicle class
- Promo code system (admin management + client entry)
- Manual booking creation (phone orders)
- Booking status workflow
- Booking cancellation + Stripe refund
- Operator notes on bookings
- Mobile-responsive admin panel

### Out of Scope

- Multi-language support (CS/RU/DE) — deferred to v2
- Real-time flight tracking API — flight number collected only, no live lookup
- User accounts / booking history — deferred to v2
- SMS confirmation — email sufficient for v1
- Partial payment / deposit — full Stripe payment only
- Real-time availability calendar — manual confirmation flow
- Promo / discount codes — revenue optimization, v2
- Multi-stop routes — edge case, v2
- Uptime monitoring (Hyperping) — deferred to v2
- Stripe failed payment alerts — deferred to v2
- Admin view / booking cancellation / manual override — deferred to v2
- Czech / Russian localization — deferred to v2

## Context

- **Shipped:** v1.2 Operator Dashboard on 2026-04-02 — 8 phases (10-17), 16 plans, 66 files changed, 14,012 insertions
- **Shipped:** v1.1 Go Live on 2026-04-01 — 3 phases (7-9), 7 plans, 31 files, 5,021 insertions
- **Shipped:** v1.0 MVP on 2026-03-30 — 6 phases, 25 plans, 82 files, 17,244 insertions
- **Repository:** RomanUst/prestigo-website (main branch)
- **Tech stack:** Next.js 14+ App Router, TypeScript, Tailwind CSS, Zustand, Zod, Stripe Elements, Supabase, Resend, Google Maps Platform, Recharts, TanStack Table, Terra Draw
- **Deployment:** Vercel (serverless, Hobby plan)
- **~11,890 LOC TypeScript** | **25/25 tests passing** (Vitest)
- **Production domain:** rideprestigo.com
- **Known tech debt:** Stripe env vars still test mode keys — must swap live before scaling; Nyquist sign-off pattern not consistently applied across v1.2 phases

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom form instead of LimoAnywhere iframe | Full design control, no vendor lock-in, matches brand exactly | ✓ Good — iframe fully removed, widget verified production-ready |
| Wizard pattern (multi-step) over single page | Reduces cognitive load, allows live price reveal after route+vehicle | ✓ Good — UX flow verified with human sign-off |
| Stripe full payment at booking | Simpler flow, premium clients expect instant confirmation | ✓ Good — double-charge guard and error recovery in place |
| Mini widget on homepage + full wizard on /book | Serves "quick start" and "detailed booking" user needs | ✓ Good — widget data carries into wizard at Step 2/3 |
| Live Google Maps pricing with quote fallback | Best UX for known routes, graceful degradation for edge cases | ✓ Good — quoteMode verified working |
| Stripe webhook as source of truth | Booking saved and emails sent only after confirmed payment | ✓ Good — avoids double-saves on client retries |
| Supabase over Notion for booking persistence | Structured relational data, UNIQUE constraint for dedup | ✓ Good — payment_intent_id UNIQUE prevents replay saves |
| Rate tables server-side only (lib/pricing.ts) | Pricing logic never reaches browser bundle | ✓ Good — API key protection verified |
| sessionStorage for wizard state via Zustand partialize | Survives page refresh; clears on browser close | ✓ Good — tested at all steps |
| Stripe fetch client (`createFetchHttpClient`) on Vercel Hobby | Vercel Hobby doesn't support Stripe's Node.js http module | ✓ Good — resolves connection errors; maxNetworkRetries: 0 required |
| printf over echo for Vercel CLI env var injection | echo adds trailing \n, breaking webhook signature verification | ✓ Good — critical pattern for secret injection via CLI |
| Google Maps server key with no HTTP referrer restriction | Vercel serverless Route Handlers send no Referer header | ✓ Good — prevents REQUEST_DENIED on /api/calculate-price |
| Two separate Google Maps keys (server + client) | Server key needs unrestricted; client key restricted to domain | ✓ Good — security + functionality balance |
| DB-driven pricing with no cache (plain async fn) | `unstable_cache` tag busting unreliable in Next.js 16; always-fresh is simpler | ✓ Good — admin pricing changes reflect instantly |
| Airport detection by coordinates, not placeId | Google Places API can return different placeIds for the same location | ✓ Good — resolves airport_fee not applying in production |
| priceBreakdown not persisted in sessionStorage | Persisted breakdown caused stale prices when globals changed in admin | ✓ Good — Step 3 always fetches fresh |
| terra-draw with `next/dynamic ssr:false` | terra-draw uses browser APIs incompatible with SSR | ✓ Good — two-layer SSR bypass pattern established |
| `signInWithPassword` Server Actions + `useActionState` | Avoids client-side secret exposure; follows @supabase/ssr pattern | ✓ Good — no infinite redirect loop |

## Constraints

- **Tech stack:** Next.js App Router + TypeScript + Tailwind — no framework changes
- **Deployment:** Vercel Hobby — serverless functions only (no long-running processes)
- **Payment:** Stripe only — no other gateways in v1
- **Maps:** Google Maps Platform (Places Autocomplete + Routes API)
- **Notifications:** Resend transactional email service

---
*Last updated: 2026-04-03 after Phase 19 complete — booking status workflow + operator notes shipped*
