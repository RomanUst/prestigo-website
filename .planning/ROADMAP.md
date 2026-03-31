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
  - **Plans:** 2 plans
    - [ ] 07-01-PLAN.md — Create migration file, complete .env.example, clean supabase.ts
    - [ ] 07-02-PLAN.md — Run migration in Supabase, set Vercel env vars, verify deployment, submit Resend DNS

- [ ] **Phase 8: Stripe + Health Check + Maps Keys**
  - Build `/api/health` Route Handler with per-service probes (Supabase, Stripe, Resend)
  - Register Stripe live webhook at production URL, copy signing secret
  - Set `STRIPE_WEBHOOK_SECRET` in Vercel (Production scope), redeploy
  - Verify Google Maps server-side key has no HTTP referrer restriction
  - Verify Google Maps client-side key is restricted to `rideprestige.com/*`
  - Confirm `/api/health` returns all-green
  - **Covers:** STRP-01, STRP-02, STRP-03, MAPS-01, MAPS-02
  - **Plans:** 3 plans
    - [ ] 08-01-PLAN.md — Create health endpoint unit tests (Wave 0)
    - [ ] 08-02-PLAN.md — Register Stripe webhook, set env vars, verify health endpoint
    - [ ] 08-03-PLAN.md — Verify Google Maps API key restrictions

- [ ] **Phase 9: Resend Domain Verification + Email Sign-Off**
  - Confirm DNS records propagated and domain verified in Resend Dashboard
  - Update `from` address in `lib/email.ts` to use verified domain
  - Send test emails to Gmail and Outlook, confirm inbox delivery (not spam)
  - **Covers:** EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
  - **Plans:** 2 plans
    - [ ] 09-01-PLAN.md — Verify Resend domain DNS, fix domain typo in email.ts
    - [ ] 09-02-PLAN.md — Deploy domain fix, email delivery sign-off

## Phase Details

### Phase 7: Foundation — Supabase Schema + Env Vars + Deploy
**Goal**: Production infrastructure is ready — Supabase schema migrated, all env vars set in Vercel, and a successful production deployment confirms the build works end-to-end
**Depends on**: Phase 6
**Requirements**: DB-01, DB-02, ENV-01, ENV-02, ENV-03
**Plans:** 1/2 plans executed
**Success Criteria** (what must be TRUE):
  1. `supabase/migrations/0001_create_bookings.sql` exists with full bookings schema extracted from `lib/supabase.ts`
  2. Bookings table exists in production Supabase and accepts inserts without error
  3. `.env.example` documents all 8 required environment variables with descriptions
  4. All 8 env vars set in Vercel Production scope (live keys not scoped to Preview or Development)
  5. Production Vercel deployment succeeds with all env vars set
  6. Resend DNS records submitted (starts 24–48h propagation clock)

### Phase 8: Stripe + Health Check + Maps Keys
**Goal**: All live service integrations are wired, tested, and confirmed working — Stripe webhook active, health endpoint green, Maps keys properly restricted
**Depends on**: Phase 7
**Requirements**: STRP-01, STRP-02, STRP-03, MAPS-01, MAPS-02
**Plans:** 2/3 plans executed
Plans:
- [ ] 08-01-PLAN.md — Create health endpoint unit tests (Wave 0)
- [ ] 08-02-PLAN.md — Register Stripe webhook, set env vars, verify health endpoint
- [ ] 08-03-PLAN.md — Verify Google Maps API key restrictions
**Success Criteria** (what must be TRUE):
  1. `/api/health` returns 200 with all service checks passing in production
  2. Stripe live-mode webhook registered at production URL, `STRIPE_WEBHOOK_SECRET` set in Vercel
  3. Google Maps server-side key has API restriction only (no HTTP referrer)
  4. Google Maps client-side key restricted to `rideprestige.com/*`

### Phase 9: Resend Domain Verification + Email Sign-Off
**Goal**: Emails are delivered to inbox from the verified domain — booking confirmation and manager alert both land correctly
**Depends on**: Phase 7
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04
**Plans:** 0/2 plans executed
Plans:
- [ ] 09-01-PLAN.md — Verify Resend domain DNS, fix domain typo in email.ts
- [ ] 09-02-PLAN.md — Deploy domain fix, email delivery sign-off
**Success Criteria** (what must be TRUE):
  1. `rideprestigo.com` domain verified in Resend Dashboard (SPF + DKIM propagated)
  2. `from` address in `lib/email.ts` updated to verified domain
  3. Client confirmation email delivered to inbox (not spam) from verified domain
  4. Manager alert email delivered to inbox (not spam) from verified domain

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Trip Entry | v1.0 | 6/6 | Complete | 2026-03-25 |
| 2. Pricing & Vehicle Selection | v1.0 | 5/5 | Complete | 2026-03-26 |
| 3. Booking Details | v1.0 | 4/4 | Complete | 2026-03-27 |
| 4. Payment | v1.0 | 4/4 | Complete | 2026-03-30 |
| 5. Backend & Notifications | v1.0 | 3/3 | Complete | 2026-03-30 |
| 6. Homepage Widget & Polish | v1.0 | 3/3 | Complete | 2026-03-30 |
| 7. Foundation — Supabase + Env + Deploy | 1/2 | In Progress|  | — |
| 8. Stripe + Health Check + Maps Keys | 2/3 | In Progress|  | — |
| 9. Resend Domain + Email Sign-Off | v1.1 | 0/2 | Planned | — |
