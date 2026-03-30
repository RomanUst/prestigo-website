# Feature Research

**Domain:** Production go-live — Supabase / Stripe / Resend / Google Maps integration for a Next.js chauffeur booking app
**Researched:** 2026-03-30
**Confidence:** HIGH

---

## Context: What Is Already Built (v1.0)

The following are NOT features for this milestone — they shipped in v1.0 and must not be rebuilt:

- 6-step booking wizard with Zustand + sessionStorage state
- Google Routes API pricing engine (server-side, `lib/pricing.ts`)
- Stripe PaymentIntent creation with double-charge guard (`app/api/create-payment-intent/route.ts`)
- Stripe webhook handler at `app/api/webhooks/stripe/route.ts` — signature verification, Supabase upsert with 3-retry backoff, client confirmation + manager alert emails via Resend, emergency fallback email
- Supabase `saveBooking` / `buildBookingRow` / `withRetry` in `lib/supabase.ts`
- Resend `sendClientConfirmation` / `sendManagerAlert` / `sendEmergencyAlert` in `lib/email.ts`
- Confirmation page at `/book/confirmation` with ICS calendar download
- 32 passing Vitest tests

The code is 100% complete. The gap is that **none of the external services are connected in production**.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the production site to accept real bookings. Missing any of these = payments cannot be processed or confirmed.

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| Supabase bookings table created with correct schema | Webhook handler calls `saveBooking()` — if the table doesn't exist the upsert throws and triggers the emergency fallback | LOW | Supabase project must exist; schema is already in a comment block in `lib/supabase.ts` |
| All 8 env vars set in Vercel production | Every API route uses `process.env.*!` — missing vars cause runtime crashes, not build errors | LOW | Vercel project linked to repo; must distinguish test vs live Stripe keys |
| Stripe webhook endpoint registered and verified | `constructEvent()` in the webhook handler requires `STRIPE_WEBHOOK_SECRET` that only Stripe issues after you register an endpoint | MEDIUM | Live env vars must be set first so the signing secret is available before registration |
| Resend sending domain verified (rideprestige.com) | Email is sent from `bookings@rideprestige.com` — Resend will reject or deliver to spam without DKIM/SPF records in DNS | MEDIUM | Access to DNS panel for rideprestige.com; DNS propagation takes up to 24–48 hours |
| Health check endpoint at `/api/health` | Required to verify all integrations are live after deployment without making a real payment; standard production gate | LOW | All env vars must be set first |
| End-to-end smoke test (real test payment) | Only way to confirm the full chain — PaymentIntent → webhook → Supabase row → two emails — actually works in production | MEDIUM | All of the above must be complete first |

### Differentiators (Competitive Advantage)

Features beyond the minimum that reduce operational risk or improve verifiability for this specific system.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Health check returns per-service status (Supabase reachable, Stripe key valid, Resend key present) | Operators can hit `/api/health` to pinpoint which integration is broken without looking at logs | LOW | Each check is a lightweight probe: Supabase `.from('bookings').select('id').limit(1)`, Stripe `stripe.paymentMethods.list({limit:1})`, Resend presence check |
| Env var documentation (`.env.example` updated with all 8 vars, descriptions, and where to find each) | Eliminates guesswork when rotating keys or onboarding a second person | LOW | Currently `.env.example` only documents `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Stripe webhook event scoped to `payment_intent.succeeded` only | Reduces noise, prevents unintended event handling | LOW | Already coded — just needs to match the registration scope in Stripe Dashboard |
| Smoke test using Stripe test card in live mode (via `stripe trigger` or test clock) | Verifies the full pipeline without real money | MEDIUM | Stripe supports test payments in live mode using specific test cards |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Supabase CLI migrations / migration files | "Best practice" CI/CD pipeline | Overkill for a single-table schema on a solo project; adds toolchain setup time with no benefit here — the schema is a one-time creation | Run the SQL manually in Supabase Dashboard > SQL Editor; paste the schema from the comment block in `lib/supabase.ts` |
| Row Level Security (RLS) on the bookings table | Supabase recommends enabling RLS on all tables | The app uses the **service role key** which bypasses RLS entirely — enabling RLS without policies would silently drop inserts from the service role | Skip RLS for v1.1; revisit if the table ever needs client-side access or public reads |
| Staging / preview environment | Test before hitting production | Adds duplicate Stripe/Supabase/Resend projects to manage; Stripe already provides test mode for local development | Use Stripe test mode locally; promote to production directly once smoke-tested |
| Automated webhook registration via Stripe CLI or API | Saves a manual step | Requires Stripe CLI or API key management overhead not needed for a single endpoint | Register manually in Stripe Dashboard — takes 2 minutes; copy the signing secret to Vercel |
| Uptime monitoring service (Datadog, Hyperping) | Industry practice | Not launch-blocking; adds cost and configuration overhead | Add after v1.1 is live and the first real booking confirms the pipeline works |

---

## Feature Dependencies

```
[Supabase project exists]
    └──required by──> [Bookings table created]
                          └──required by──> [Health check: Supabase probe]
                                                └──required by──> [Smoke test passes]

[Vercel env vars set (all 8)]
    ├──required by──> [Stripe webhook endpoint registered]
    │                     └──provides──> [STRIPE_WEBHOOK_SECRET value]
    │                                        └──required by──> [Vercel STRIPE_WEBHOOK_SECRET set]
    │                                                              └──required by──> [Smoke test passes]
    ├──required by──> [Resend domain verified]
    │                     └──required by──> [Emails delivered in production]
    └──required by──> [Health check: all services probed]

[DNS records added for rideprestige.com]
    └──required by──> [Resend domain verified]
                          └──propagation: up to 48h──> [Verified status in Resend dashboard]
```

### Dependency Notes

- **Stripe webhook registration is circular:** you need `STRIPE_WEBHOOK_SECRET` to be set in Vercel, but you only get `STRIPE_WEBHOOK_SECRET` after registering the endpoint in Stripe Dashboard. The correct order is: set all OTHER env vars in Vercel first → register endpoint in Stripe Dashboard → copy the new signing secret → add `STRIPE_WEBHOOK_SECRET` to Vercel → redeploy.
- **Resend DNS propagation blocks email testing:** Start DNS setup first (it can propagate while other steps are being done). Do not block smoke testing on email — verify Supabase row creation and PaymentIntent first.
- **Health check is both a differentiator and a prerequisite for smoke test:** build it before testing, not after.

---

## MVP Definition

### Launch With (v1.1)

- [ ] Supabase bookings table created — schema from `lib/supabase.ts` comment block executed in Dashboard
- [ ] All 8 env vars documented in `.env.example` with source instructions
- [ ] All 8 env vars set in Vercel production environment
- [ ] `/api/health` endpoint built and returning per-service status
- [ ] Stripe webhook endpoint registered at `https://rideprestige.com/api/webhooks/stripe` scoped to `payment_intent.succeeded`
- [ ] `STRIPE_WEBHOOK_SECRET` (production signing secret) added to Vercel and redeployed
- [ ] Resend DNS records (SPF, DKIM, MX) added to rideprestige.com DNS
- [ ] Resend domain status verified in dashboard (status = "verified")
- [ ] Smoke test: complete one booking end-to-end in production, confirm Supabase row exists and both emails delivered

### Add After Validation (v1.x)

- [ ] Uptime monitoring on `/api/health` — trigger once first real booking has confirmed the pipeline
- [ ] `.env.example` added to repo (currently only documents 1 of 8 vars) — low value until a second contributor exists

### Future Consideration (v2+)

- [ ] Supabase CLI migration files — only relevant if schema evolves frequently
- [ ] RLS policies on bookings table — only relevant if public/client-side queries are added
- [ ] Staging environment — only relevant if deployment frequency increases significantly

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Supabase bookings table created | HIGH — bookings are lost without it | LOW — paste SQL, click run | P1 |
| Vercel env vars (all 8 set) | HIGH — site crashes without them | LOW — copy keys from dashboards | P1 |
| Stripe webhook registered | HIGH — no Supabase save or emails without it | LOW — 2 clicks in Stripe Dashboard | P1 |
| Resend domain verified | HIGH — emails go to spam or fail | MEDIUM — DNS records + 24-48h wait | P1 |
| Health check endpoint `/api/health` | MEDIUM — operator visibility | LOW — ~30 lines of route code | P1 |
| End-to-end smoke test | HIGH — confirms the chain actually works | MEDIUM — real payment, verify manually | P1 |
| `.env.example` updated with all 8 vars | LOW — only affects future contributors | LOW — text editing | P2 |
| Per-service health probes (Supabase/Stripe/Resend) | MEDIUM — faster debugging | LOW — add 3 probe calls to health route | P2 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Complete Env Var Inventory

All 8 env vars identified by scanning `process.env.*` references in the codebase:

| Var | File | Source | Test vs Live |
|-----|------|--------|--------------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `components/` (client-side Places Autocomplete) | Google Cloud Console → APIs & Services → Credentials | Same key works for both (restrict by HTTP referrer) |
| `GOOGLE_MAPS_API_KEY` | `app/api/calculate-price/route.ts` | Google Cloud Console → same key or separate server key | Same key works; restrict by IP or server referrer |
| `STRIPE_SECRET_KEY` | `app/api/create-payment-intent/route.ts`, `app/api/webhooks/stripe/route.ts` | Stripe Dashboard → Developers → API Keys | `sk_test_...` for local, `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | `app/api/webhooks/stripe/route.ts` | Stripe Dashboard → Webhooks → signing secret (only issued after endpoint is registered) | Different secret for test vs live endpoint |
| `SUPABASE_URL` | `lib/supabase.ts` | Supabase Dashboard → Project Settings → API → Project URL | Same for all environments if one project |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts` | Supabase Dashboard → Project Settings → API → service_role (secret) | Treat as a secret — never expose client-side |
| `RESEND_API_KEY` | `lib/email.ts` | Resend Dashboard → API Keys | Same key works; scope to sending only |
| `MANAGER_EMAIL` | `lib/email.ts` | Plain email address (no API — just a destination) | e.g. `roman@rideprestige.com` |

---

## Sources

- [Stripe: Set up and deploy a webhook](https://docs.stripe.com/webhooks/quickstart) — official docs, HIGH confidence
- [Stripe: Webhook signature verification pattern](https://github.com/vercel/next.js/discussions/48885) — confirmed matches existing code
- [Resend: Managing Domains](https://resend.com/docs/dashboard/domains/introduction) — official docs, HIGH confidence
- [Resend: DNS propagation up to 48h, SPF/DKIM/MX required](https://resend.com/blog/email-authentication-a-developers-guide) — official blog, HIGH confidence
- [Resend: New domains workflow (Feb 2025, Domain Connect)](https://resend.com/changelog/new-domains-workflow) — current, HIGH confidence
- [Next.js App Router health check pattern](https://hyperping.com/blog/nextjs-health-check-endpoint) — MEDIUM confidence, consistent with App Router docs
- [Supabase: Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) — official docs; CLI approach deemed anti-feature for this scope
- Codebase analysis: `lib/supabase.ts`, `lib/email.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/create-payment-intent/route.ts` — HIGH confidence (source of truth)

---

*Feature research for: PRESTIGO v1.1 production go-live*
*Researched: 2026-03-30*
