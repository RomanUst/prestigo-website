# Architecture Research — Prestigo v1.1 Go-Live

**Domain:** Production service integration — Next.js 14 App Router on Vercel
**Researched:** 2026-03-30
**Confidence:** HIGH (all findings verified against official Stripe, Supabase, Resend, and Next.js documentation)

---

## Context: What Already Exists (v1.0)

The v1.0 architecture is fully built and tested. This document covers only the **four new artifacts** required for v1.1 go-live and how each integrates with what already exists.

**Existing API surface:**

```
prestigo/app/api/
├── calculate-price/route.ts       # Google Routes API proxy (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
├── create-payment-intent/route.ts # Stripe PaymentIntent creation (STRIPE_SECRET_KEY)
├── submit-quote/route.ts          # Quote request fallback (RESEND_API_KEY, MANAGER_EMAIL)
└── webhooks/stripe/route.ts       # Payment confirmation handler (STRIPE_SECRET_KEY,
                                   #   STRIPE_WEBHOOK_SECRET, SUPABASE_URL,
                                   #   SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
                                   #   MANAGER_EMAIL)
```

**Existing lib layer:**

```
prestigo/lib/
├── booking-store.ts  # Zustand store (wizard state + sessionStorage)
├── currency.ts       # CZK/EUR conversions
├── email.ts          # Resend templates + send functions
├── extras.ts         # Extras configuration
├── pricing.ts        # Rate tables (server-side only)
└── supabase.ts       # Service client, saveBooking, withRetry, buildBookingRow
                      # (SQL schema lives in a comment block at the top of this file)
```

---

## New Artifacts and Integration Points

### 1. SQL Migration File

**What it is:** A standalone `.sql` file that creates the `bookings` table in Supabase Dashboard > SQL Editor.

**Current state:** The complete schema is embedded as a comment block at lines 1–38 of `lib/supabase.ts`. It is not a runnable file — it is documentation inside source code.

**New artifact:** `supabase/migrations/0001_create_bookings.sql`

**Integration:** This file has zero runtime integration. It is a one-time manual operation run against the Supabase project via the Dashboard SQL Editor or the Supabase CLI (`supabase db push`). After the table exists, the existing `saveBooking()` in `lib/supabase.ts` works without any code changes.

**Why this folder:** The `supabase/migrations/` convention is the Supabase-standard location (used by `supabase db push` and `supabase db diff`). Using a timestamped filename (`0001_` prefix) makes the creation order explicit and supports future schema additions.

**Relationship to existing code:** None — purely additive. The schema in the migration file must exactly match the columns expected by `buildBookingRow()` in `lib/supabase.ts`.

---

### 2. .env.example

**What it is:** A committed, safe-to-publish template listing all required environment variable names with placeholder values.

**Current state:** The existing `.env.example` contains only one variable:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
```

Six additional variables are required for live operation (documented in PROJECT.md under "Known gaps") but absent from `.env.example`.

**New artifact:** Updated `prestigo/.env.example` with all 8 variables:

```
# Google Maps — client-side, restricted to Places API + HTTP referrer
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE

# Stripe — server-side only, never prefix with NEXT_PUBLIC_
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Supabase — service role key has full DB access, server-side only
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Email — server-side only
RESEND_API_KEY=re_...
MANAGER_EMAIL=roman@rideprestige.com
```

**Integration:** `.env.example` is a documentation artifact only. The actual secrets live in:
- `prestigo/.env.local` for local development (already exists, gitignored)
- Vercel Project Settings > Environment Variables for production

**Critical distinction:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the only browser-exposed variable. All others are server-side. They must never receive the `NEXT_PUBLIC_` prefix.

---

### 3. Health Check API Route

**What it is:** A new GET endpoint at `/api/health` that verifies all four external service connections are live and returns a structured status object.

**New artifact:** `prestigo/app/api/health/route.ts`

**Integration point:** This is a **new file** in the existing `app/api/` directory. It does not modify any existing route.

**What it checks:** Each integration can be independently verified:

| Check | How | Failure signal |
|-------|-----|---------------|
| Supabase | `createSupabaseServiceClient()` then `SELECT 1 FROM bookings LIMIT 1` | Throws or returns Supabase error |
| Stripe | `new Stripe(key).paymentIntents.list({ limit: 1 })` | Throws or returns Stripe error |
| Resend | `new Resend(key).emails.send(...)` is not used — call `resend.domains.list()` instead | Throws or returns Resend error |
| Env vars | Check all 7 server-side vars are non-empty strings | Missing var returns false |

**Response contract:**

```typescript
// GET /api/health
{
  ok: boolean,           // true only if ALL checks pass
  timestamp: string,     // ISO 8601
  checks: {
    env: boolean,        // all 7 env vars present
    supabase: boolean,   // bookings table reachable
    stripe: boolean,     // Stripe API key valid
    resend: boolean      // Resend API key valid
  }
}
```

**Vercel caching:** Next.js App Router GET handlers are statically cached by default. The health check must declare `export const dynamic = 'force-dynamic'` to prevent Vercel from serving a stale cached response. Without this, the build-time result is returned indefinitely.

**Security:** This endpoint does not expose secrets. It returns boolean statuses only. No authentication needed — the response reveals nothing exploitable.

**Reuse of existing lib:** The health route imports `createSupabaseServiceClient` from `lib/supabase.ts`. It does not duplicate the client initialization.

---

### 4. Stripe Webhook Endpoint Registration

**What it is:** A manual configuration step in the Stripe Dashboard that tells Stripe to POST payment events to the production URL of the existing `/api/webhooks/stripe` route.

**Current state:** The route handler at `app/api/webhooks/stripe/route.ts` is fully implemented and tested. The Stripe webhook endpoint has not yet been registered in the Stripe Dashboard because no production URL existed until deployment.

**No new files.** This is a configuration operation, not a code change.

**Registration steps:**
1. Deploy to Vercel first — the production URL must exist before registration.
2. In Stripe Dashboard > Developers > Webhooks, add endpoint: `https://rideprestige.com/api/webhooks/stripe`
3. Select event: `payment_intent.succeeded` only (the handler ignores all other events).
4. Copy the new Signing Secret (`whsec_...`) generated by Stripe for this endpoint.
5. Set `STRIPE_WEBHOOK_SECRET` in Vercel Project Settings to this new value.
6. Trigger a redeploy so Vercel picks up the updated env var.

**Critical pitfall:** The `STRIPE_WEBHOOK_SECRET` used during local testing (Stripe CLI) is different from the production signing secret. The production secret is generated the moment the endpoint is registered in the Stripe Dashboard. If the old CLI secret is used in production, every webhook will return `400 Webhook Error: No signatures found matching the expected signature`.

**Relationship to existing code:** The existing `stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)` in the route handler uses this secret. No code changes required — only the env var value changes.

---

## System Overview: v1.1 Architecture

```
Browser
  │
  ├─ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Places Autocomplete)
  │
  └─ Vercel Edge (rideprestige.com)
       │
       ├── GET  /api/health              [NEW] ─── Supabase (SELECT 1)
       │                                      ├── Stripe (list PaymentIntents)
       │                                      └── Resend (list domains)
       │
       ├── POST /api/calculate-price ───────── Google Routes API
       │
       ├── POST /api/create-payment-intent ─── Stripe API (create PaymentIntent)
       │
       ├── POST /api/submit-quote ──────────── Resend (manager alert only)
       │
       └── POST /api/webhooks/stripe ───────── Stripe (inbound webhook)
                │                               │
                ├── lib/supabase.ts ─────────── Supabase (upsert booking)
                └── lib/email.ts ─────────────── Resend (client + manager emails)
```

**New files added in v1.1:**

```
prestigo/
├── .env.example                          UPDATED — adds 7 missing vars
├── supabase/
│   └── migrations/
│       └── 0001_create_bookings.sql      NEW — runnable DDL extracted from lib/supabase.ts comment
└── app/
    └── api/
        └── health/
            └── route.ts                  NEW — integration verification endpoint
```

**Manual operation (no file):**
- Stripe Dashboard > Webhooks > Add endpoint → `https://rideprestige.com/api/webhooks/stripe`
- Copy signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel

---

## Data Flow Changes (v1.0 → v1.1)

No existing data flows change. v1.1 adds one new flow:

**Health check flow:**

```
Developer / smoke tester
  → GET /api/health
  → health route queries each service in parallel
  → returns { ok, timestamp, checks: { env, supabase, stripe, resend } }
  → human reads response to confirm all services are live
```

The booking flow is unchanged: user completes wizard → Stripe PaymentIntent → `payment_intent.succeeded` webhook → Supabase upsert + Resend emails.

---

## Build Order (v1.1)

Dependencies determine this order:

1. **`supabase/migrations/0001_create_bookings.sql`** — No dependencies. Extracted directly from existing `lib/supabase.ts` comment. Must exist before health check can verify Supabase.

2. **`.env.example`** — No dependencies. Documentation only. Complete all 8 vars.

3. **`app/api/health/route.ts`** — Depends on: migration file run (table must exist to test), all env vars set in Vercel. Import `createSupabaseServiceClient` from existing `lib/supabase.ts`.

4. **Vercel env vars** — Set all 8 in Vercel dashboard before deploying. `STRIPE_WEBHOOK_SECRET` is a placeholder at this stage — the real production secret comes from step 5.

5. **Deploy to Vercel** — Required before Stripe webhook registration (URL must be live).

6. **Stripe webhook registration** — Depends on: Vercel deployment. Register endpoint → copy new signing secret → update `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy.

7. **Smoke test via `/api/health`** — Final verification that all connections are live.

---

## Architectural Patterns

### Pattern 1: Webhook as Source of Truth (existing, confirmed)

**What:** Booking data is written to Supabase only inside the Stripe webhook handler, never from the client or the `create-payment-intent` route.
**When to use:** Any payment-gated write operation.
**Trade-offs:** Slight delay between payment confirmation and DB write (webhook latency ~1–5 seconds). Eliminates double-saves and unconfirmed bookings.

### Pattern 2: Non-Fatal Email Sends (existing, confirmed)

**What:** Both `sendClientConfirmation` and `sendManagerAlert` are wrapped in individual try/catch blocks. Email failures do not propagate to the webhook handler. The webhook returns `{ received: true }` regardless of email outcome.
**When to use:** Any notification channel that is secondary to the core transaction.
**Trade-offs:** Email delivery is not guaranteed by the webhook response. Monitor Resend logs independently.

### Pattern 3: Emergency Alert Fallback (existing, confirmed)

**What:** If `withRetry()` exhausts all 3 Supabase attempts, `sendEmergencyAlert()` fires a raw JSON dump of the booking row to the manager email. This prevents data loss when Supabase is temporarily unavailable.
**When to use:** Any critical write with a single destination.
**Trade-offs:** Email becomes the last-resort database. Manager must manually re-enter the booking if Supabase recovers.

### Pattern 4: force-dynamic Health Route (new)

**What:** `export const dynamic = 'force-dynamic'` on the health check route handler prevents Next.js from pre-rendering the response at build time.
**When to use:** Any GET route that performs real-time checks (health, status, live data).
**Trade-offs:** Cannot be served from Vercel's edge cache. Acceptable for a non-customer-facing diagnostic endpoint.

---

## Anti-Patterns

### Anti-Pattern 1: Reusing Stripe CLI Webhook Secret in Production

**What people do:** Copy the `whsec_...` secret from `stripe listen` output into Vercel env vars.
**Why it's wrong:** The CLI signing secret is ephemeral and scoped to local tunnels. Stripe generates a new, permanent signing secret when you register an endpoint in the Dashboard. Using the CLI secret causes all production webhooks to fail signature verification.
**Do this instead:** Register the endpoint in Stripe Dashboard, copy the new signing secret from that registration screen, set it as `STRIPE_WEBHOOK_SECRET` in Vercel.

### Anti-Pattern 2: Calling `.json()` Instead of `.text()` in the Webhook Handler

**What people do:** `const body = await request.json()` in the Stripe webhook route.
**Why it's wrong:** Stripe's signature verification (`constructEvent`) requires the raw request body as a string. Parsing to JSON first transforms the body and invalidates the HMAC signature check, causing all webhooks to return 400.
**Do this instead:** `const body = await request.text()` — this is already correct in the existing `app/api/webhooks/stripe/route.ts`.

### Anti-Pattern 3: Prefixing Secret Keys with NEXT_PUBLIC_

**What people do:** Accidentally name `NEXT_PUBLIC_STRIPE_SECRET_KEY` or `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
**Why it's wrong:** The `NEXT_PUBLIC_` prefix embeds the value in the browser JavaScript bundle, exposing it to any user via devtools.
**Do this instead:** Only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` belongs client-side. All other keys are server-only and must not have this prefix.

### Anti-Pattern 4: Running Health Check Against a Cached GET Response

**What people do:** Deploy health route without `export const dynamic = 'force-dynamic'` and interpret the cached `{ ok: true }` as proof services are live.
**Why it's wrong:** The build-time response may have been generated before env vars were set or before the Supabase table existed. The cached response will incorrectly report healthy.
**Do this instead:** Always include `export const dynamic = 'force-dynamic'` in any diagnostic GET route.

---

## Integration Points Summary

### External Services

| Service | Integration Pattern | New in v1.1 | Notes |
|---------|---------------------|-------------|-------|
| Supabase | Service client via `lib/supabase.ts`, server-only | Migration SQL file | `payment_intent_id UNIQUE` prevents duplicate saves |
| Stripe | PaymentIntents + webhook signature verification | Webhook endpoint registration | Separate signing secrets for CLI vs Dashboard |
| Resend | Transactional email via `lib/email.ts`, server-only | Domain verification (DNS) | `bookings@rideprestige.com` requires SPF + DKIM records in DNS |
| Google Maps | Client-side Places Autocomplete + server-side Routes API | None | Only `NEXT_PUBLIC_` variable in the project |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `app/api/health` → `lib/supabase.ts` | Direct import | Reuses existing `createSupabaseServiceClient()` |
| `app/api/webhooks/stripe` → `lib/supabase.ts` | Direct import | Existing, unchanged |
| `app/api/webhooks/stripe` → `lib/email.ts` | Direct import | Existing, unchanged |
| `supabase/migrations/` → `lib/supabase.ts` | Schema contract | Migration DDL must match column names in `buildBookingRow()` |

---

## Sources

- [Stripe webhook endpoint registration — official docs](https://docs.stripe.com/webhooks/quickstart) — HIGH confidence
- [Next.js App Router route.js reference](https://nextjs.org/docs/app/api-reference/file-conventions/route) — HIGH confidence
- [Vercel: Common mistakes with Next.js App Router](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them) — HIGH confidence (force-dynamic caching behavior)
- [Supabase database migrations guide](https://supabase.com/docs/guides/deployment/database-migrations) — HIGH confidence
- [Resend domain verification docs](https://resend.com/docs/dashboard/domains/introduction) — HIGH confidence
- [Next.js health check discussion](https://github.com/vercel/next.js/discussions/18055) — MEDIUM confidence (community pattern, consistent with official docs)
- [Stripe webhook + Next.js 14 App Router integration](https://blog.stackademic.com/integrating-stripe-payment-elements-with-next-js-14-app-router-webhooks-typescript-4d6eb7710c40) — MEDIUM confidence (verified against official docs)

---

*Architecture research for: Prestigo v1.1 — production service connection*
*Researched: 2026-03-30*
