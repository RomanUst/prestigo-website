# Milestones

## v1.2 Operator Dashboard (Shipped: 2026-04-02)

**Phases completed:** 8 phases, 16 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---

## v1.1 Go Live (Shipped: 2026-04-01)

**Phases:** 3 (Phases 7–9) · **Plans:** 7 · **Timeline:** 2 days (2026-03-30 → 2026-04-01)
**Files changed:** 31 · **Insertions:** 5,021

**Key accomplishments:**

1. Supabase bookings table live in production — 33-column schema migration extracted to `supabase/migrations/0001_create_bookings.sql`, all 8 env vars documented in `.env.example`
2. All 8 environment variables set in Vercel (Production scope only) — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MANAGER_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
3. `/api/health` endpoint live — returns 200 with per-service probes (Supabase, Stripe, Resend); 6 unit tests passing; Stripe live-mode webhook registered at `rideprestigo.com/api/webhooks/stripe`
4. Google Maps two-key pattern verified — server key unrestricted (Vercel Route Handlers send no Referer), client key restricted to `https://rideprestige.com/*`
5. Resend domain `rideprestigo.com` verified (SPF + DKIM propagated); `rideprestige.com` typo fixed across all 6 occurrences in `lib/email.ts`
6. End-to-end email delivery confirmed — client confirmation and manager alert both land in inbox (not spam) from `bookings@rideprestigo.com`; Stripe fetch client fix resolves Vercel Hobby connectivity issue

**Archive:** `.planning/milestones/v1.1-ROADMAP.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

---

## v1.0 MVP (Shipped: 2026-03-30)

**Phases:** 6 (Phases 1–6) · **Plans:** 25 · **Timeline:** 6 days (2026-03-24 → 2026-03-30)
**LOC:** ~360K TypeScript · **Files changed:** 82 · **Insertions:** 17,244

**Key accomplishments:**

1. 6-step booking wizard at `/book` — Zustand store with sessionStorage persistence, animated step transitions, Google Places Autocomplete for address fields
2. Google Routes API pricing engine (server-side, key never exposed) — 3 vehicle classes (Business, First Class, Business Van), live price updates, "Request a quote" fallback for unmapped routes
3. Steps 4–5: optional extras (child seat, meet & greet, extra luggage) + passenger details form with inline Zod validation on blur; flight number field for airport rides
4. Full Stripe integration — server-side PaymentIntent, double-charge protection, inline error recovery, confirmation page at `/book/confirmation` with ICS calendar download
5. Supabase persistence + Resend transactional emails (client confirmation + manager alert) triggered by Stripe webhook, with 3-retry exponential backoff and emergency fallback
6. BookingWidget on homepage (replaced LimoAnywhere iframe) — fully mobile-responsive at 375px, WCAG-compliant touch targets (44px), safe-area-inset, keyboard navigation; 32/32 tests passing

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`

---
