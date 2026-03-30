# Milestones

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
