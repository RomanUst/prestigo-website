# Phase 66 — API Coverage Declaration

**Detector result:** `detected: true` (signals matched the word "SDK"/"API" in RESEARCH.md's
`Architectural Responsibility Map` and `Alternatives Considered` rows describing the Google Maps
JS SDK / Static Maps API).

**Declaration: No NEW external API integration.**

This phase integrates no new external API, SDK, or service. Both signals point at capabilities
that are **already integrated** in this repo:

1. **Google Maps JS SDK** — consumed only by reusing the existing, already-wired
   `components/booking/RouteMap.tsx` client component (which already loads
   `@googlemaps/js-api-loader` with the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). No new
   Maps surface, endpoint, key, or SDK method is added — the trip sheet renders the same
   component the booking flow already uses.
2. **Supabase** — the trip-token lookup uses the existing internal
   `createSupabaseServiceClient()` (already used by `/driver/response` and `/api/driver/respond`).
   No new external service.

Per "Full API Coverage by Default — Opt Out, Never Opt In": because this phase adds **no new
external API**, the full INTEGRATE/OPT-OUT coverage matrix does not apply. `resend` (assignment
email) is likewise already integrated (`lib/email.ts`); this phase only adds one link to an
existing email template.

*Recorded 2026-08-31 by gsd-planner.*
