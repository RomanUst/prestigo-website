# Prestigo — Booking Form

## What This Is

Custom multi-step booking wizard for rideprestigo.com — a premium chauffeur service based in Prague. Clients can book one-way transfers, airport rides (pickup and dropoff), hourly hire, or daily hire directly on the site. They select a vehicle class with a live price, add optional extras, fill in passenger details, and pay online via Stripe — all without leaving the site.

Built inside the existing Next.js + Tailwind CSS project (`prestigo/`), matching the PRESTIGO brand: anthracite background, copper accent, Cormorant Garamond + Montserrat typography. A mini booking widget on the homepage lets users pre-fill key fields and jump into the wizard.

**Current state:** Live in production at rideprestigo.com, accepting real bookings end-to-end.

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

### Active

## Current Milestone: v1.2 Operator Dashboard

**Goal:** Give the operator full control over pricing, coverage zones, and booking visibility through a protected admin dashboard.

**Target features:**
- Supabase Auth-protected `/admin` area (email+password, role-based)
- Pricing editor: base rates per vehicle class, extras surcharges, airport fee, night/holiday coefficients
- Coverage zones: draw polygons on Google Maps, store in Supabase, drive "Request a quote" fallback in booking wizard
- Bookings list: filterable table of all orders with statuses
- Statistics: revenue, booking count, period breakdown

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

- **Shipped:** v1.1 Go Live on 2026-04-01 — 3 phases (7-9), 7 plans, 31 files, 5,021 insertions
- **Previously shipped:** v1.0 MVP on 2026-03-30 — 6 phases, 25 plans, 82 files, 17,244 insertions, ~360K LOC TypeScript
- **Repository:** RomanUst/prestigo-website (main branch)
- **Tech stack:** Next.js 14+ App Router, TypeScript, Tailwind CSS, Zustand, Zod, Stripe Elements, Supabase, Resend, Google Maps Platform
- **Deployment:** Vercel (serverless, Hobby plan)
- **32/32 tests passing** (Vitest + Testing Library)
- **Production domain:** rideprestigo.com (note: rideprestige.com typo was corrected in v1.1)
- **Known tech debt:** Stripe env vars currently set to test mode keys (`sk_test_`, `pk_test_`) — must swap to live keys before accepting real payments; Stripe webhook created in test mode

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

## Constraints

- **Tech stack:** Next.js App Router + TypeScript + Tailwind — no framework changes
- **Deployment:** Vercel Hobby — serverless functions only (no long-running processes)
- **Payment:** Stripe only — no other gateways in v1
- **Maps:** Google Maps Platform (Places Autocomplete + Routes API)
- **Notifications:** Resend transactional email service

---
*Last updated: 2026-04-02 — Phase 12 complete: DB-driven pricing + coverage zone enforcement live*
