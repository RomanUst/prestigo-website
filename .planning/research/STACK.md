# Stack Research — Prestigo v1.1 Go Live

**Domain:** Service connections for existing Next.js 16 + Vercel app
**Researched:** 2026-03-30
**Confidence:** HIGH (all core claims verified against official docs)

---

## Context

This is a subsequent-milestone stack file. The existing app (Next.js 16.1.7, React 19.2.3, App Router) already has full implementations of Supabase, Stripe, Resend, and Google Maps. All client code is written and tested. The v1.1 milestone is exclusively about connecting external services and verifying the production integration — not about adding new runtime libraries.

**Existing production packages (already in package.json):**
| Package | Version |
|---------|---------|
| next | 16.1.7 |
| react | 19.2.3 |
| stripe | ^21.0.1 |
| @stripe/react-stripe-js | ^6.0.0 |
| @stripe/stripe-js | ^9.0.0 |
| @supabase/supabase-js | ^2.101.0 |
| resend | ^6.9.4 |
| @googlemaps/js-api-loader | ^2.0.2 |

**Do not bump these versions during go-live.** Any version change is a new risk surface that requires retesting.

---

## Recommended Stack Additions

### Core Technologies

No new runtime dependencies are needed. The go-live work is configuration and tooling only.

### Supporting Libraries

No new npm packages are needed. The health check endpoint is a plain Next.js Route Handler — zero dependencies.

### Development Tools

These are local developer tools (not npm packages), used only during the go-live process. Do not add them to package.json.

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| Stripe CLI | v1.40.0 (current as of 2026-03-30) | Webhook local testing during smoke test | `brew install stripe/stripe-cli/stripe` (macOS) |
| Vercel CLI | Latest | Env var management, deployment trigger | `npm i -g vercel` |

---

## Installation

```bash
# No new npm dependencies needed for go-live.
# Dev tooling only (not in package.json):

# Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe
stripe login

# Vercel CLI
npm i -g vercel
vercel login
vercel link
```

---

## Environment Variables

All 8 env vars must be set in Vercel Dashboard > Settings > Environment Variables (Production scope).

| Variable | Source | Notes |
|----------|--------|-------|
| `SUPABASE_URL` | Supabase Dashboard > Settings > API | Project URL (not anon key URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API | Service role key — bypasses RLS — server-side only, never `NEXT_PUBLIC_` prefix |
| `STRIPE_SECRET_KEY` | Stripe Dashboard > Developers > API Keys (live mode) | Starts with `sk_live_` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard > Developers > API Keys (live mode) | Starts with `pk_live_` — `NEXT_PUBLIC_` prefix is correct here, this is browser-safe |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Developers > Webhooks > endpoint detail | Starts with `whsec_` — obtained AFTER registering the production endpoint |
| `RESEND_API_KEY` | Resend Dashboard > API Keys | Starts with `re_` |
| `MANAGER_EMAIL` | Manual | Email address for manager alerts and emergency fallback |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Cloud Console > APIs & Services > Credentials | Restrict by HTTP referrer to `rideprestige.com/*` |

**Vercel CLI commands for setting vars:**
```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add RESEND_API_KEY production
vercel env add MANAGER_EMAIL production
vercel env add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY production

# Verify
vercel env ls
```

After adding any env var, redeploy for it to take effect: `vercel --prod` or push a commit.

---

## Service Setup Procedures

### Supabase: Table Creation

The `bookings` table SQL is already written in `lib/supabase.ts` as a comment block. Run it directly in Supabase Dashboard > SQL Editor — no CLI or migration tooling needed for a single-table v1.1.

**Critical:** The table is created with the SQL Editor (not Table Editor UI), so RLS is NOT auto-enabled. You must explicitly run:
```sql
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
```

The app uses the Service Role Key exclusively (server-side webhook handler only), which bypasses RLS. Enabling RLS with no policies means the `anon` role (browser) has zero access — which is correct for this app. The service role key bypasses RLS regardless of policies.

Do not use the Supabase CLI or migration files for v1.1. A single SQL script run manually is appropriate for a single table on a single environment.

### Stripe: Webhook Registration

The webhook endpoint URL is: `https://rideprestige.com/api/webhooks/stripe`

**Production registration is via Stripe Dashboard only — not Stripe CLI.**

The Stripe CLI `stripe listen` command is for local development forwarding (sandbox events only). It does not register production endpoints.

Steps:
1. Stripe Dashboard > Developers > Webhooks > Create event destination
2. Set URL to `https://rideprestige.com/api/webhooks/stripe`
3. Select event: `payment_intent.succeeded` (only this event — minimal scope)
4. Copy the signing secret (`whsec_...`) — this is unique to this endpoint
5. Set `STRIPE_WEBHOOK_SECRET` in Vercel with this value

Local smoke-test workflow (before production):
```bash
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# In another terminal:
stripe trigger payment_intent.succeeded
```

### Resend: Domain Verification

Domain to verify: `rideprestige.com`

Steps:
1. Resend Dashboard > Domains > Add Domain > enter `rideprestige.com`
2. Resend generates the required DNS records (SPF TXT + DKIM TXT + MX for bounce processing)
3. Add all records to the DNS registrar for `rideprestige.com`
4. Click "Verify DNS Records" in Resend Dashboard
5. Propagation takes up to 24 hours (Resend checks for up to 72 hours)
6. Status progresses: `pending` → `verified`

The `from` address in `lib/email.ts` is already set to `bookings@rideprestige.com`. This will only work after the domain is verified. Until verified, use `onboarding@resend.dev` as a temporary `from` address for smoke testing.

**No CLI tool exists for Resend domain verification.** It is dashboard-only with a REST API as an alternative.

### Google Maps: API Key Restriction

The `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` must be restricted before go-live:
1. Google Cloud Console > APIs & Services > Credentials
2. Select the key > Application restrictions > HTTP referrers
3. Add: `rideprestige.com/*` and `www.rideprestige.com/*`
4. API restrictions: Places API + Routes API only (Routes API covers Distance Matrix)
5. Set a budget alert at $50/month in Google Cloud Console > Billing > Budgets

### Health Check Endpoint

A `GET /api/health` Route Handler must be created at `app/api/health/route.ts`. It should verify all 4 external services by performing real (minimal) API calls:
- Supabase: list 0 rows from `bookings` table (confirms credentials + table exists)
- Stripe: retrieve account details (confirms live key works)
- Resend: list domains (confirms API key + domain verified status)
- Google Maps: not tested in health check (client-side key, test via browser smoke test)

Response: JSON `{ status: "ok", services: { supabase: "ok", stripe: "ok", resend: "ok" } }` with HTTP 200, or appropriate error on any failure.

This is a plain Next.js Route Handler — no new dependencies.

---

## Alternatives Considered

| Our Approach | Alternative | Why Not |
|-------------|-------------|---------|
| Supabase SQL Editor for table creation | Supabase CLI + migration files | Over-engineered for single table on single environment; CLI setup adds friction with no benefit at v1.1 scale |
| Stripe Dashboard webhook registration | Stripe CLI `stripe webhooks create` | CLI `stripe listen` is local-only; production endpoints must be registered in Dashboard |
| Vercel Dashboard + Vercel CLI for env vars | dotenvx encrypted .env files | dotenvx adds complexity for a solo project; Vercel's built-in env management is sufficient and simpler |
| Manual DNS entry for Resend | Resend REST API domain management | Dashboard walkthrough is the intended path; API is equivalent but adds no value here |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any new npm runtime dependency | v1.1 is infrastructure-only; new deps create new test surface | Existing packages cover all needs |
| `dotenvx` or `dotenv-vault` | Unnecessary complexity for Vercel deployment; Vercel natively handles encrypted env vars | Vercel Dashboard env management |
| Supabase CLI (`supabase` npm package) | Overkill for single-table creation; requires Docker for local dev setup | Supabase Dashboard SQL Editor |
| `@vercel/postgres` or `prisma` | App already uses Supabase; adding a second DB layer creates confusion | `@supabase/supabase-js` (already installed) |
| `stripe-webhook-middleware` or similar | App already implements `stripe.webhooks.constructEvent` correctly in the webhook route | Existing `lib/webhooks/stripe/route.ts` implementation |

---

## Version Compatibility

All existing packages are currently compatible with Next.js 16.1.7 / React 19:

| Package | Version in use | Compatibility status |
|---------|---------------|---------------------|
| stripe | ^21.0.1 | Compatible — Stripe Node SDK v21 supports Node 18+ (Vercel uses Node 20) |
| @supabase/supabase-js | ^2.101.0 | Compatible — no known issues with Next.js 16 |
| resend | ^6.9.4 | Compatible — SDK is framework-agnostic |
| @stripe/react-stripe-js | ^6.0.0 | Compatible with React 19 |

---

## Sources

- [Stripe CLI Releases](https://github.com/stripe/stripe-cli/releases) — v1.40.0 confirmed current (2026-03-30); HIGH confidence
- [Stripe Webhooks Docs](https://docs.stripe.com/webhooks) — production endpoint registration via Dashboard confirmed; HIGH confidence
- [Stripe CLI Use Guide](https://docs.stripe.com/stripe-cli/use-cli) — `stripe listen` is sandbox/local only, not production; HIGH confidence
- [Resend Domain Management](https://resend.com/docs/dashboard/domains/introduction) — SPF + DKIM + MX records required, dashboard-only verification flow; HIGH confidence
- [Vercel CLI Env Docs](https://vercel.com/docs/cli/env) — `vercel env add <NAME> production` command pattern; HIGH confidence
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables) — sensitive env vars, redeploy required after changes; HIGH confidence
- [Supabase RLS Guide](https://supabase.com/docs/guides/database/postgres/row-level-security) — SQL Editor does not auto-enable RLS, service role bypasses RLS; HIGH confidence
- [Next.js App Router Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) — health check as `app/api/health/route.ts` GET handler; HIGH confidence
- [Stripe Go-Live Checklist (Vercel KB)](https://vercel.com/kb/guide/getting-started-with-nextjs-typescript-stripe) — env var naming, `NEXT_PUBLIC_` prefix rules; HIGH confidence

---

*Stack research for: Prestigo v1.1 Go Live — service connections*
*Researched: 2026-03-30*
