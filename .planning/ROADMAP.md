# Roadmap: Prestigo Booking Form

## Milestones

- ✅ **v1.0 MVP** — Phases 1–6 (shipped 2026-03-30)
- 🚧 **v1.1 Go Live** — Phases 7–9 (started 2026-03-30)

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

### v1.1 Go Live (Phases 7–9)

- [ ] **Phase 7: Foundation — Supabase Schema + Env Vars + Deploy**
  - Extract SQL schema to `supabase/migrations/0001_create_bookings.sql`
  - Update `.env.example` with all 8 required variables
  - Create `bookings` table in production Supabase project
  - Set 7 of 8 env vars in Vercel (Production scope only)
  - Submit Resend DNS records for `rideprestige.com` (starts 24–48h propagation clock)
  - Deploy to Vercel and confirm production build succeeds
  - **Covers:** DB-01, DB-02, ENV-01, ENV-02, ENV-03

- [ ] **Phase 8: Stripe + Health Check + Maps Keys**
  - Build `/api/health` Route Handler with per-service probes (Supabase, Stripe, Resend)
  - Register Stripe live webhook at production URL, copy signing secret
  - Set `STRIPE_WEBHOOK_SECRET` in Vercel (Production scope), redeploy
  - Verify Google Maps server-side key has no HTTP referrer restriction
  - Verify Google Maps client-side key is restricted to `rideprestige.com/*`
  - Confirm `/api/health` returns all-green
  - **Covers:** STRP-01, STRP-02, STRP-03, MAPS-01, MAPS-02

- [ ] **Phase 9: Resend Domain Verification + Email Sign-Off**
  - Confirm DNS records propagated and domain verified in Resend Dashboard
  - Update `from` address in `lib/email.ts` to use verified domain
  - Send test emails to Gmail and Outlook, confirm inbox delivery (not spam)
  - **Covers:** EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Trip Entry | v1.0 | 6/6 | Complete | 2026-03-25 |
| 2. Pricing & Vehicle Selection | v1.0 | 5/5 | Complete | 2026-03-26 |
| 3. Booking Details | v1.0 | 4/4 | Complete | 2026-03-27 |
| 4. Payment | v1.0 | 4/4 | Complete | 2026-03-30 |
| 5. Backend & Notifications | v1.0 | 3/3 | Complete | 2026-03-30 |
| 6. Homepage Widget & Polish | v1.0 | 3/3 | Complete | 2026-03-30 |
| 7. Foundation — Supabase + Env + Deploy | v1.1 | 0/? | Pending | — |
| 8. Stripe + Health Check + Maps Keys | v1.1 | 0/? | Pending | — |
| 9. Resend Domain + Email Sign-Off | v1.1 | 0/? | Pending | — |
