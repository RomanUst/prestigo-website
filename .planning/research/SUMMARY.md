# Project Research Summary

**Project:** Prestigo v1.1 — Production Go-Live
**Domain:** Service integration — Next.js chauffeur booking app connecting live Supabase, Stripe, Resend, and Google Maps
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

Prestigo v1.1 is not a feature development milestone — it is a production service-connection milestone. The Next.js 16 app, all API routes, and all business logic are 100% complete and tested (32 passing Vitest tests). The only gap is that four external services (Supabase, Stripe, Resend, Google Maps) have never been connected in a live production environment. No new code is needed beyond a health check endpoint and a SQL migration file; everything else is configuration, credential management, and DNS propagation.

The recommended approach is a strict dependency-ordered execution: create the Supabase table first, then set all Vercel environment variables (minus the Stripe webhook secret), then build and deploy the health check endpoint, then register the Stripe webhook (which yields the final env var), then verify Resend domain DNS, and finally run an end-to-end smoke test. The critical constraint is that the Stripe webhook signing secret cannot be obtained until the webhook endpoint is registered in live mode in the Stripe Dashboard — this creates a deliberate ordering requirement that is easy to get wrong.

The dominant risk category is misconfiguration, not code bugs. Eleven specific pitfalls have been identified — the most dangerous involve using test-mode Stripe credentials in production (silent 400 failures), scoping live API keys to all Vercel environments instead of production-only (live charges from PR previews), and the Supabase table not existing when the first real webhook fires (booking data lost to emergency fallback email). All pitfalls are preventable with the verification checklist in PITFALLS.md before smoke testing.

---

## Key Findings

### Recommended Stack

No new runtime npm dependencies are needed for v1.1. The existing packages (Next.js 16.1.7, React 19.2.3, stripe ^21.0.1, @supabase/supabase-js ^2.101.0, resend ^6.9.4, @googlemaps/js-api-loader ^2.0.2) cover all requirements and must not be version-bumped during go-live. Version changes introduce new test surface without delivering go-live value.

Two local developer tools are needed (not npm packages): Stripe CLI v1.40.0 for local webhook smoke testing, and Vercel CLI for env var management. Both are install-and-use — no project configuration required.

**Core technologies:**
- **Next.js 16.1.7 / App Router:** All API routes already implemented — health check added as a plain GET Route Handler with `force-dynamic`
- **Stripe SDK ^21.0.1:** PaymentIntents + webhook signature verification already coded; go-live requires Dashboard webhook registration (live mode only)
- **@supabase/supabase-js ^2.101.0:** Service role client already coded with correct `persistSession: false` config; go-live requires table creation via SQL Editor
- **Resend ^6.9.4:** Email templates and send functions already coded; go-live requires domain verification (SPF + DKIM + MX DNS records for rideprestige.com)
- **@googlemaps/js-api-loader ^2.0.2:** Client-side Places Autocomplete already coded; go-live requires HTTP referrer restriction + server key restriction type verification
- **Vercel CLI:** Environment variable management — all 8 vars must be scoped to Production only

### Expected Features

All application features shipped in v1.0. The v1.1 feature set is purely operational.

**Must have (table stakes — P1):**
- Supabase `bookings` table created with correct schema (without this, the first real webhook destroys booking data)
- All 8 environment variables set in Vercel with correct production scope (missing any = runtime crash or live charges from previews)
- Stripe webhook endpoint registered at `https://rideprestige.com/api/webhooks/stripe` in live mode (without this, no Supabase saves and no emails)
- Resend domain `rideprestige.com` verified with SPF/DKIM/MX DNS records (without this, emails go to spam or Resend rejects sends with 403)
- Health check endpoint at `/api/health` with per-service status probes (prerequisite for smoke test verification)
- End-to-end smoke test with Stripe test card on production URL (only proof the full chain works)

**Should have (P2):**
- `.env.example` updated with all 8 variables and source instructions (currently documents only 1 of 8)
- Per-service boolean probes in health check (faster debugging vs. checking 4 dashboards separately)

**Defer (v2+):**
- Uptime monitoring service (Datadog, Hyperping) — add after first real booking confirms pipeline
- Supabase CLI migration files — relevant only if schema evolves frequently
- RLS policies on bookings table — relevant only if client-side queries are added
- Staging environment — relevant only if deployment frequency increases

### Architecture Approach

The v1.1 architecture adds exactly three artifacts to the existing codebase: a SQL migration file extracted from the comment block in `lib/supabase.ts`, an updated `.env.example`, and a new `app/api/health/route.ts` Route Handler. No existing routes, libraries, or data flows change. The health check reuses `createSupabaseServiceClient()` from `lib/supabase.ts` directly — no duplication of client initialization. The entire booking flow (wizard to PaymentIntent to webhook to Supabase upsert to Resend emails) is unchanged.

**Major components:**
1. `supabase/migrations/0001_create_bookings.sql` — runnable DDL extracted from `lib/supabase.ts` comment; one-time manual execution in Supabase SQL Editor; schema contract with `buildBookingRow()`
2. `app/api/health/route.ts` — new GET handler with `force-dynamic`; probes Supabase (SELECT 1), Stripe (list PaymentIntents), and Resend (list domains); returns `{ ok, timestamp, checks: { env, supabase, stripe, resend } }`
3. `.env.example` (updated) — documents all 8 required variables with source instructions and security annotations (NEXT_PUBLIC_ prefix rules)
4. Stripe Dashboard webhook registration — manual configuration step; yields the production `STRIPE_WEBHOOK_SECRET` that cannot be obtained any other way

### Critical Pitfalls

1. **Stripe webhook secret mismatch (test vs. live mode)** — switch Stripe Dashboard to live mode before registering the production endpoint; copy the signing secret only from the live endpoint registration screen; scope `STRIPE_WEBHOOK_SECRET` to Production environment only in Vercel
2. **Vercel env var scope set to all environments** — live keys (`sk_live_`, `whsec_`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`) must be scoped to Production only; defaulting to all three scopes causes live Stripe charges from PR preview deployments
3. **Supabase table not created before first webhook fires** — the schema exists only as a comment in source code; execute `CREATE TABLE bookings` in Supabase SQL Editor before registering the live Stripe webhook; verify with `SELECT COUNT(*) FROM bookings` returning 0 (not an error)
4. **PostgREST schema cache stale after table creation** — wait 60 seconds after table creation; run `NOTIFY pgrst, 'reload schema'` if health check inserts fail with null-constraint errors immediately after creation
5. **Google Maps API key restriction type mismatch** — client-side key (`NEXT_PUBLIC_`) must use HTTP referrer restriction (`rideprestige.com/*`); server-side key for `/api/calculate-price` must use API restriction only (no HTTP referrer — Vercel has dynamic egress IPs, so a referrer restriction causes `REQUEST_DENIED` on every price calculation)

---

## Implications for Roadmap

Based on the dependency graph in FEATURES.md and the pitfall-to-phase mapping in PITFALLS.md, four phases are appropriate. The phases follow a strict dependency chain — each phase is a prerequisite for the next.

### Phase 1: Foundation — Supabase Schema + Env Vars + Deploy

**Rationale:** Everything else depends on the Supabase table existing and env vars being set. The Stripe webhook secret is the only env var that cannot be set yet (it does not exist until Phase 2), but all 7 others must be in Vercel before deployment. DNS records for Resend should also be submitted now to allow propagation time while Phases 2 and 3 proceed.
**Delivers:** Production Supabase schema, complete Vercel env var configuration (7 of 8), SQL migration file, updated `.env.example`, deployed production build at rideprestige.com, Resend DNS records submitted
**Addresses:** Supabase table creation (P1), env var documentation (P2), Vercel Production-scope configuration (P1)
**Avoids:** Pitfall 3 (table not created before first webhook), Pitfall 2 (env vars scoped to all environments), Pitfall 4 (PostgREST cache — verify immediately after table creation)

### Phase 2: Stripe + Health Check Verification

**Rationale:** The production URL must exist (from Phase 1 deploy) before registering the Stripe webhook. The health check must be deployed before the smoke test. The signing secret obtained here completes the env var set (8 of 8).
**Delivers:** Live Stripe webhook registered at `rideprestige.com`, `STRIPE_WEBHOOK_SECRET` set in Vercel and redeployed, health check endpoint live and returning all-green, Google Maps key restrictions verified
**Addresses:** Stripe webhook registration (P1), `/api/health` endpoint (P1)
**Avoids:** Pitfall 1 (test-mode secret in production), Pitfall 9 (endpoint URL pointing to wrong environment), Pitfall 10 (Vercel deployment protection blocking Stripe), Pitfall 6 and 7 (Google Maps referrer and key type)

### Phase 3: Resend Domain Verification

**Rationale:** DNS propagation takes up to 48 hours and is the longest lead-time task in the milestone. DNS records were submitted in Phase 1 to allow propagation. Phase 3 is the confirmation step — verify all records are green in Resend Dashboard, send test emails to Gmail and Outlook inboxes to confirm not-spam delivery, and confirm `from` address in `lib/email.ts` matches the verified domain.
**Delivers:** `rideprestige.com` verified in Resend with SPF/DKIM/MX records; client confirmation and manager alert emails deliverable to inbox
**Addresses:** Resend domain verification (P1)
**Avoids:** Pitfall 8 (unverified domain causing 403 or spam delivery)

### Phase 4: Smoke Test + Go-Live Sign-Off

**Rationale:** All dependencies (Supabase table, env vars, webhook, health check, Resend) must be complete before a meaningful end-to-end test is possible. The smoke test is the final gate.
**Delivers:** Verified production booking pipeline — confirmed Supabase row written, confirmed client confirmation email in inbox, confirmed manager alert email, confirmed Stripe PaymentIntent visible in live mode dashboard
**Addresses:** End-to-end smoke test (P1)
**Avoids:** All pitfalls — the "Looks Done But Isn't" checklist in PITFALLS.md serves as the Phase 4 gate before declaring go-live complete

### Phase Ordering Rationale

- The Stripe webhook signing secret creates a hard dependency: Phase 1 (deploy) must precede Phase 2 (webhook registration). This ordering is non-negotiable.
- Resend DNS propagation is the longest lead-time task (up to 48 hours) — DNS records should be submitted during Phase 1 even though verification confirmation lands in Phase 3. This parallelism is the only way to avoid Resend becoming the critical path.
- The health check must be deployed (Phase 2) before the smoke test (Phase 4) — it is both a differentiator feature and a smoke-test prerequisite.
- Google Maps key restriction verification is a Phase 2 concern because the production URL must exist to test client-side Places Autocomplete and to confirm the server-side Routes API key type.

### Research Flags

No phase requires a `/gsd:research-phase` deep dive. All required procedures are fully documented across the four research files.

Phases with well-documented patterns (skip deeper research):
- **Phase 1:** Supabase SQL Editor table creation and Vercel env var management are straightforward; all commands documented in STACK.md
- **Phase 2:** Health check Route Handler pattern is standard Next.js App Router; Stripe webhook registration is a dashboard walkthrough documented in STACK.md and ARCHITECTURE.md
- **Phase 3:** Resend domain verification is a dashboard walkthrough; DNS record types are specified in STACK.md
- **Phase 4:** Smoke test procedure is deterministic — Stripe test card `4242 4242 4242 4242`, verify Supabase row, verify two emails; checklist is in PITFALLS.md

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All claims verified against official docs; no new dependencies; existing versions confirmed compatible with Next.js 16/React 19 |
| Features | HIGH | Feature set derived directly from codebase analysis (`process.env.*` scan across all API routes) + official service docs |
| Architecture | HIGH | Three new artifacts are minimal and well-defined; existing code architecture unchanged; all integration points verified against source |
| Pitfalls | HIGH | 10 of 11 pitfalls verified against official Stripe/Supabase/Resend/Google/Vercel docs; 3 MEDIUM-confidence sources corroborated by official docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Resend DNS propagation timing:** The 24-48 hour window is variable. If propagation takes the full 48 hours, Resend becomes the critical path for go-live. Mitigate by submitting DNS records during Phase 1 before any other step.
- **Google Maps server-side key restriction type:** PITFALLS.md identifies a risk that the server-side Routes API key may have an HTTP referrer restriction set during development. Verify the restriction type in Google Cloud Console during Phase 2 — if wrong, `/api/calculate-price` silently forces all bookings into quote mode with no obvious error.
- **Vercel deployment protection status:** Check Vercel project settings before registering the Stripe webhook. If deployment protection is enabled project-wide, it will intercept incoming POST requests from Stripe and return 401/302, causing all webhooks to fail silently from Stripe's perspective.

---

## Sources

### Primary (HIGH confidence)
- [Stripe Webhooks Docs](https://docs.stripe.com/webhooks) — production endpoint registration, signing secrets, live vs. test mode distinction
- [Stripe CLI Use Guide](https://docs.stripe.com/stripe-cli/use-cli) — `stripe listen` is local-only, not production
- [Stripe: Resolve webhook signature verification errors](https://docs.stripe.com/webhooks/signature) — test vs. live secret mismatch behavior
- [Resend Domain Management](https://resend.com/docs/dashboard/domains/introduction) — SPF/DKIM/MX requirements, verification workflow
- [Resend: DMARC](https://resend.com/docs/dashboard/domains/dmarc) — DMARC as optional but recommended follow-up
- [Vercel CLI Env Docs](https://vercel.com/docs/cli/env) — `vercel env add` command pattern
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables) — scope management, redeploy requirement
- [Supabase RLS Guide](https://supabase.com/docs/guides/database/postgres/row-level-security) — service role bypass behavior, SQL Editor does not auto-enable RLS
- [Supabase: PostgREST schema cache](https://supabase.com/docs/guides/troubleshooting/postgrest-not-recognizing-new-columns-or-functions-bd75f5) — `NOTIFY pgrst, 'reload schema'` procedure
- [Supabase: Service role RLS errors](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — SSR client override pitfall
- [Google Maps Platform: Security best practices](https://developers.google.com/maps/api-security-best-practices) — HTTP referrer vs. IP restriction distinction
- [Next.js App Router Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) — `force-dynamic` caching behavior
- Codebase analysis: `lib/supabase.ts`, `lib/email.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/create-payment-intent/route.ts` — ground truth for feature inventory and env var list

### Secondary (MEDIUM confidence)
- [Next.js health check pattern](https://hyperping.com/blog/nextjs-health-check-endpoint) — consistent with App Router docs
- [Next.js App Router + Stripe Webhook integration](https://blog.stackademic.com/integrating-stripe-payment-elements-with-next-js-14-app-router-webhooks-typescript-4d6eb7710c40) — verified against official Stripe docs
- [Debugging Stripe Webhook Signature Verification Errors](https://dev.to/nerdincode/debugging-stripe-webhook-signature-verification-errors-in-production-1h7c) — corroborates official Stripe signature docs

---

*Research completed: 2026-03-30*
*Ready for roadmap: yes*
