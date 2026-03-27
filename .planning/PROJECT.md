# Prestigo — Booking Form

## What This Is

Custom multi-step booking wizard for rideprestige.com — a premium chauffeur service based in Prague. Clients can book one-way transfers, airport rides, hourly, or daily hire directly on the site, see a live price estimate, and pay online via Stripe.

Built inside the existing Next.js + Tailwind CSS project (`prestigo/`), matching the PRESTIGO brand: anthracite background, copper accent, Cormorant Garamond + Montserrat typography.

## Core Value

A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

## Requirements

### Validated

- [x] Optional extras: child seat, meet & greet, extra luggage — Validated in Phase 3: booking-details
- [x] Flight number field for airport rides (no live flight API in v1) — Validated in Phase 3: booking-details
- [x] Inline field validation (on blur, not on submit) — Validated in Phase 3: booking-details

### Active

- [ ] Mini booking widget embedded on the homepage (trip type selector + key fields)
- [ ] Full multi-step booking wizard at `/book` (Step 1: Type + Route → Step 2: Date/Time → Step 3: Vehicle → Step 4: Extras → Step 5: Passenger details → Step 6: Payment)
- [ ] 4 trip types: One-way transfer, Airport pickup, Airport dropoff, Hourly hire, Daily/multi-day
- [ ] Live price calculation via Google Maps Routes API (distance × rate per km per class)
- [ ] Fallback to "Request a quote" for unmapped routes
- [ ] Google Places Autocomplete for address fields
- [ ] Flight number field for airport rides (no live flight API in v1)
- [ ] 3 vehicle classes: Business, First Class, Business Van — with photos, capacity, features
- [ ] Optional extras: child seat, meet & greet, extra luggage
- [ ] Stripe online payment (full amount at booking)
- [ ] Email confirmation to client (booking summary)
- [ ] Email notification to manager (new booking alert)
- [ ] Booking saved to Notion database via Notion API
- [ ] Booking saved to own DB via Next.js API routes
- [ ] Form state persisted across steps (no data loss on back navigation)
- [ ] Inline field validation (on blur, not on submit)
- [ ] Progress bar showing current step
- [ ] Fully responsive — mobile-first (375px+)
- [ ] EN only

### Out of Scope

- Multi-language support (CS/RU/DE) — deferred to v2
- Real-time flight tracking API — not needed for v1, flight number collected only
- User accounts / booking history — deferred to v2
- SMS confirmation — email sufficient for v1
- Partial payment / deposit — full Stripe payment only
- Real-time availability calendar — manual confirmation flow

## Context

- **Existing project:** `prestigo/` — Next.js 14+ App Router, TypeScript, Tailwind CSS, Vercel deployment
- **Existing `/book` page:** already exists, will be replaced/upgraded with the wizard
- **Brand palette:** anthracite `#1C1C1E`, copper `#B87333`, off-white `#F5F2EE`, warm grey `#9A958F`
- **Fonts:** Cormorant Garamond (display headings), Montserrat (body/labels)
- **Target audience:** business travellers, premium clients — high expectation for polish
- **Reference UX patterns:** almasyf.cz 3-step wizard, blacklane.com homepage widget, driveczech.com 4-step progress

## Constraints

- **Tech stack:** Next.js App Router + TypeScript + Tailwind — no framework changes
- **Deployment:** Vercel — serverless functions only (no long-running processes)
- **Payment:** Stripe only — no other gateways in v1
- **Maps:** Google Maps Platform (Places Autocomplete + Routes API)
- **Notifications:** Resend or similar transactional email service

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom form instead of LimoAnywhere iframe | Full design control, no vendor lock-in, matches brand exactly | — Pending |
| Wizard pattern (multi-step) over single page | Reduces cognitive load, allows live price reveal after route+vehicle selected | — Pending |
| Stripe full payment at booking | Simpler flow, premium clients expect instant confirmation | — Pending |
| Mini widget on homepage + full wizard on /book | Serves both "quick start" and "detailed booking" user needs | — Pending |
| Live Google Maps pricing with quote fallback | Best UX for known routes, graceful degradation for edge cases | — Pending |

---
*Last updated: 2026-03-27 — Phase 3 (booking-details) complete: Steps 4-5 built and verified*
