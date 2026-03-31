# Requirements: Prestigo Booking Form

**Defined:** 2026-03-30
**Core Value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

## v1.0 Requirements (Complete)

See archive: `.planning/milestones/v1.0-REQUIREMENTS.md`

---

## v1.1 Requirements — Go Live

### Database

- [x] **DB-01**: SQL migration file exists at `supabase/migrations/0001_create_bookings.sql` with full bookings schema extracted from `lib/supabase.ts`
- [x] **DB-02**: Bookings table created in production Supabase project and accepts inserts without error

### Environment

- [x] **ENV-01**: `.env.example` documents all 8 required environment variables with descriptions and source instructions (currently documents only 1 of 8)
- [x] **ENV-02**: All 8 env vars set in Vercel with Production scope only (live keys must not be scoped to Preview or Development)
- [x] **ENV-03**: Production deployment on Vercel succeeds with all env vars set

### Stripe

- [ ] **STRP-01**: Stripe live-mode webhook endpoint registered in Stripe Dashboard at production URL (`/api/webhooks/stripe`) listening to `payment_intent.succeeded`
- [ ] **STRP-02**: `STRIPE_WEBHOOK_SECRET` set in Vercel with production signing secret and redeployed
- [ ] **STRP-03**: `/api/health` endpoint live at production URL, returning 200 with all service checks passing

### Email & Google Maps

- [ ] **EMAIL-01**: Resend domain `rideprestige.com` verified in Resend Dashboard (SPF + DKIM DNS records propagated)
- [ ] **EMAIL-02**: `from` address in `lib/email.ts` updated to use verified domain (not `onboarding@resend.dev`)
- [ ] **EMAIL-03**: Client confirmation email is delivered to inbox (not spam) from verified domain
- [ ] **EMAIL-04**: Manager alert email is delivered to inbox (not spam) from verified domain
- [ ] **MAPS-01**: Google Maps server-side key (`GOOGLE_MAPS_API_KEY`) confirmed with API restriction only — no HTTP referrer restriction (prevents `REQUEST_DENIED` on `/api/calculate-price`)
- [ ] **MAPS-02**: Google Maps client-side key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) restricted to production domain referrer (`rideprestige.com/*`)

## v2 Requirements

### Monitoring

- **MON-01**: Uptime monitoring (Hyperping or similar) alerting on `/api/health` downtime
- **MON-02**: Stripe failed payment webhook alerts
- **MON-03**: Supabase storage and row-count dashboards

### Operations

- **OPS-01**: Admin view of bookings table (Supabase dashboard sufficient for v1.1)
- **OPS-02**: Booking cancellation flow with Stripe refund
- **OPS-03**: Manual booking override (add booking without payment)

### Localization

- **LOC-01**: Czech language version of booking wizard
- **LOC-02**: Russian language version of booking wizard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Supabase CLI migration tooling | One-time schema creation; CLI overhead adds no value |
| Row Level Security (RLS) policies | Service role key bypasses RLS; no client-side DB access in v1 |
| Staging environment | Single production env sufficient while booking volume is low |
| Stripe test mode dashboard | Local `stripe listen` covers dev testing; not a production concern |
| DMARC DNS record | Recommended but not required for deliverability; defer to v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 7 | Complete |
| DB-02 | Phase 7 | Complete |
| ENV-01 | Phase 7 | Complete |
| ENV-02 | Phase 7 | Complete |
| ENV-03 | Phase 7 | Complete |
| STRP-01 | Phase 8 | Pending |
| STRP-02 | Phase 8 | Pending |
| STRP-03 | Phase 8 | Pending |
| EMAIL-01 | Phase 9 | Pending |
| EMAIL-02 | Phase 9 | Pending |
| EMAIL-03 | Phase 9 | Pending |
| EMAIL-04 | Phase 9 | Pending |
| MAPS-01 | Phase 8 | Pending |
| MAPS-02 | Phase 8 | Pending |

**Coverage:**
- v1.1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after v1.1 milestone definition*
