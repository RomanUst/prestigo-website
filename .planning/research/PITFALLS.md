# Pitfalls Research — v1.1 Go Live: Supabase + Stripe + Resend + Google Maps on Vercel

**Domain:** Next.js App Router — connecting production services for a live booking/payment flow
**Researched:** 2026-03-30
**Confidence:** HIGH (all critical findings verified against official docs and multiple community sources)

---

## Critical Pitfalls

### Pitfall 1: Stripe Webhook Secret Mismatch (Test vs. Live Mode)

**What goes wrong:**
The webhook signing secret used in `STRIPE_WEBHOOK_SECRET` is the test-mode secret (`whsec_test_...`), but the registered endpoint in the Stripe Dashboard is a live-mode endpoint. Stripe sends the event with a live-mode signature; `constructEvent()` fails to verify it and returns 400. No booking is saved, no email is sent. The client sees their payment succeeded but receives nothing.

**Why it happens:**
Stripe has completely separate dashboards for test and live mode. The signing secret shown when you click "Reveal secret" is mode-specific. Developers copy the secret while in test mode, then switch to live mode to register the production endpoint — but forget to re-copy the live secret.

**How to avoid:**
1. Switch Stripe Dashboard to **Live mode** before registering the production webhook endpoint.
2. Copy the signing secret only after creating the live endpoint.
3. Set `STRIPE_WEBHOOK_SECRET` in Vercel scoped to **Production environment only** — not Preview.
4. Add a startup log: `console.log('STRIPE_WEBHOOK_SECRET prefix:', process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 12))` to confirm the right key loads.

**Warning signs:**
- Stripe Dashboard shows events delivered but with HTTP 400 response.
- Webhook logs show `"No signatures found matching the expected signature for payload"`.
- Test mode events process correctly; live mode events all fail.

**Phase to address:** Phase 1 — Stripe Live Mode Setup (webhook registration)

---

### Pitfall 2: Vercel Env Var Scope Set to All Environments Instead of Production-Only

**What goes wrong:**
A live Stripe secret key (`sk_live_...`) or live webhook secret is set in Vercel with all three scopes checked (Production, Preview, Development). A developer opens a Preview deployment for a PR review and triggers a test booking. The preview deployment uses the live Stripe key, charges a real card, and saves a real booking. Alternatively, the live Stripe key leaks into a preview URL that is shared publicly.

**Why it happens:**
Vercel's UI defaults to checking all three environment scopes when you add a variable. Developers accept the default without thinking.

**How to avoid:**
- `STRIPE_SECRET_KEY` (live): Production scope only.
- `STRIPE_WEBHOOK_SECRET` (live endpoint secret): Production scope only.
- `SUPABASE_SERVICE_ROLE_KEY` (production project): Production scope only.
- `RESEND_API_KEY` (production key): Production scope only.
- Test-mode equivalents for all four: Preview + Development scopes only.
- After setting variables, redeploy from the Vercel Dashboard (not just `vercel --prod` CLI) to ensure scope is applied correctly. A known Vercel bug causes preview env vars to appear in production when deploying via CLI without a dashboard redeploy.

**Warning signs:**
- Live bookings appearing when testing on a Preview URL.
- `VERCEL_ENV` shows `preview` in production logs.
- Stripe Dashboard shows live charges from non-production activity.

**Phase to address:** Phase 1 — Environment Variable Configuration

---

### Pitfall 3: Supabase Table Not Created Before First Webhook Fires

**What goes wrong:**
The `bookings` table schema exists only as a SQL comment in `lib/supabase.ts`. If the table is never executed against the actual Supabase project, the first real `payment_intent.succeeded` webhook fires, `saveBooking()` throws, the 3-retry backoff exhausts, and the emergency alert email is sent to the manager instead of a proper confirmation. The booking is lost from the database.

**Why it happens:**
The schema is documentation-style (a SQL comment block), not a migration file. There is no migration runner. It is easy to forget to manually execute the `CREATE TABLE` statement in the Supabase SQL Editor before go-live.

**How to avoid:**
- Execute the full `CREATE TABLE bookings (...)` statement in the Supabase SQL Editor **before** registering the Stripe live webhook.
- Verify the table exists: run `SELECT COUNT(*) FROM bookings` in the SQL Editor — should return 0, not an error.
- Verify the `UNIQUE` constraint on `payment_intent_id` is present: run `\d bookings` or check the Table Editor constraints tab.
- Add a health check endpoint (`/api/health`) that attempts a `SELECT 1 FROM bookings LIMIT 1` and returns 200/503 accordingly.

**Warning signs:**
- Emergency alert email received from manager on first smoke test booking.
- Supabase logs show `relation "bookings" does not exist`.
- `saveBooking()` throws on the very first call.

**Phase to address:** Phase 1 — Supabase Schema Setup

---

### Pitfall 4: Supabase Service Role Client Initialized with SSR/Cookie Context

**What goes wrong:**
If the Supabase client used in the webhook route is initialized using the SSR helper (`@supabase/ssr` or `createServerClient` with cookie handling), a user JWT from the request cookies can override the service role key in the `Authorization` header. The client then operates as an anonymous or authenticated user rather than service role, and RLS blocks the `INSERT` silently — returning an empty result rather than an error in some configurations.

**Why it happens:**
The SSR Supabase client is designed to inject the user session from cookies into the Authorization header, overriding the `apikey`. This is correct behavior for user-facing routes, but catastrophic for the webhook route which must write as service role.

**How to avoid:**
The existing `createSupabaseServiceClient()` in `lib/supabase.ts` correctly uses `createClient()` directly with `persistSession: false` and `autoRefreshToken: false` — this is the right pattern. Do not refactor this to use `@supabase/ssr` patterns. Keep the service client isolated.

Verify the client config is not changed during the go-live phase by confirming:
```typescript
auth: {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}
```

**Warning signs:**
- `saveBooking()` returns no error but the booking does not appear in the `bookings` table.
- Supabase logs show RLS policy violations for `INSERT`.
- The issue only appears in production (not locally), suggesting an environment difference.

**Phase to address:** Phase 1 — Supabase Setup (verify client initialization before connecting)

---

### Pitfall 5: PostgREST Schema Cache Stale After Table Creation

**What goes wrong:**
The `bookings` table is created in Supabase SQL Editor, but the PostgREST schema cache does not update immediately. The first `INSERT` via `supabase-js` silently ignores columns that PostgREST does not yet know about, inserting `NULL` into those fields. If any of those columns have `NOT NULL` constraints (e.g., `booking_reference`, `trip_type`, `pickup_date`, `vehicle_class`, `amount_czk`), the insert fails with a `not-null constraint violation`.

**Why it happens:**
PostgREST caches the database schema and receives reload signals via Postgres NOTIFY. Under certain conditions (queue issues, cold starts), the signal is delayed. Table creation in the SQL Editor does not always trigger an immediate cache reload.

**How to avoid:**
After creating the table, wait 60 seconds, then run a test insert via the Supabase JS SDK (not the SQL Editor — which bypasses RLS and PostgREST). If the insert fails with column errors, run this SQL to force a cache reload:
```sql
NOTIFY pgrst, 'reload schema';
```
Then retry. Verify all required columns accept values before registering the live webhook.

**Warning signs:**
- Insert errors mentioning `null value in column` for columns you are providing.
- Inserts succeed in the SQL Editor but fail via the SDK.
- Error only appears immediately after table creation, then resolves after a few minutes.

**Phase to address:** Phase 1 — Supabase Schema Setup (verification step after table creation)

---

### Pitfall 6: Google Maps Client-Side API Key Blocked in Production by Referrer Restrictions

**What goes wrong:**
The `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is restricted by HTTP referrer in Google Cloud Console. The referrer list includes `localhost` and the development domain but not the production domain (e.g., `rideprestige.com/*`). In production, the Places Autocomplete widget fails silently or shows a `RefererNotAllowedMapError` in the browser console. The address fields render but no suggestions appear. Users cannot complete Step 1.

**Why it happens:**
API key restrictions set up during development only cover localhost. Production domain is never added because the developer assumes the test configuration carries over. The error only appears after the production deploy.

**How to avoid:**
Before go-live, add all required referrer patterns to the client-side Maps key in Google Cloud Console:
- `https://rideprestige.com/*`
- `https://www.rideprestige.com/*`
- `https://*.vercel.app/*` (for preview deployments — optional, disable after stable launch)

Allow 5 minutes for propagation after saving. Test Places Autocomplete on the production URL before considering go-live complete.

**Warning signs:**
- `RefererNotAllowedMapError` in browser console on production.
- Address autocomplete field visible but no dropdown suggestions appear.
- Works on localhost, breaks on production URL.

**Phase to address:** Phase 2 — Google Maps API Key Configuration

---

### Pitfall 7: Server-Side Routes API Key Has HTTP Referrer Restriction (Wrong Type)

**What goes wrong:**
The server-side Google Routes API key (used in `/api/calculate-price`) has an HTTP referrer restriction. Server-side calls do not send a `Referer` header, so Google rejects every pricing request with `REQUEST_DENIED`. The price calculation endpoint returns an error, forcing all bookings into quote mode. Users cannot see prices and cannot pay.

**Why it happens:**
Google Maps has two restriction types: HTTP referrer (for client-side/browser use) and IP address (for server-side use). Using the wrong type for server-side calls is a documented gotcha. The project uses one key for client-side Places and a separate key for server-side Routes — if the server key has a referrer restriction copied from the client key setup, it will fail.

**How to avoid:**
- The server-side Routes API key must have either **no restriction** or an **IP address restriction** — never an HTTP referrer restriction.
- On Vercel, outbound requests come from dynamic IP addresses, so IP restriction is impractical. Use no application restriction on the server-side key, but restrict it by **API** (Routes API only) so it cannot be used for other services.
- Verify by calling `/api/calculate-price` from the production URL with a known route and confirming a numeric price is returned.

**Warning signs:**
- All routes return quote mode in production.
- `calculate-price` endpoint logs `REQUEST_DENIED` from Google.
- Works in local development (where server-side calls may have a consistent IP).

**Phase to address:** Phase 2 — Google Maps API Key Configuration

---

### Pitfall 8: Resend "From" Address Uses Unverified Domain

**What goes wrong:**
The sending domain `rideprestige.com` is not verified in Resend. Emails are sent using `bookings@rideprestige.com` as the From address but the domain has no SPF/DKIM records configured. All client confirmation emails and manager alerts go directly to spam — or worse, Resend rejects the send entirely with a 403 error. The client receives no confirmation after paying.

**Why it happens:**
Resend allows sending from `onboarding@resend.dev` during development without domain verification. Developers test with that address, it works, and they deploy to production without completing the domain verification step. The DNS records (DKIM CNAME, SPF TXT, DMARC TXT) are never added to the domain registrar/DNS provider.

**How to avoid:**
1. Add `rideprestige.com` to Resend Domains dashboard.
2. Add all Resend-provided DNS records to the DNS provider (MX, CNAME for DKIM, TXT for SPF).
3. Wait for verification (typically 15 minutes; up to 48 hours).
4. Confirm all records show green in Resend dashboard.
5. Send a test email from Resend to both a Gmail and an Outlook address — check spam folders.
6. Only then update the `from` address in `lib/email.ts` from any placeholder to `bookings@rideprestige.com`.

**Warning signs:**
- Resend API returns `403: The domain is not verified`.
- Client confirmation emails arrive in spam.
- Resend Dashboard shows emails delivered but recipients cannot find them in inbox.
- DMARC report shows SPF/DKIM failures.

**Phase to address:** Phase 3 — Resend Domain Verification

---

### Pitfall 9: Stripe Webhook Endpoint URL Points to Wrong Environment

**What goes wrong:**
The live-mode Stripe webhook endpoint is registered pointing at a Vercel Preview URL (e.g., `https://prestigo-git-feature-branch.vercel.app/api/webhooks/stripe`) instead of the production URL (`https://rideprestige.com/api/webhooks/stripe`). All live payment events are delivered to the preview deployment. The production site never receives them. Bookings are never saved, emails are never sent.

**Why it happens:**
The webhook endpoint is registered during development using the current deployment URL. When the production domain is configured, no one updates the webhook endpoint URL in the Stripe Dashboard.

**How to avoid:**
- Register the webhook endpoint in Stripe **live mode** using the final production domain: `https://rideprestige.com/api/webhooks/stripe`.
- After registration, use Stripe Dashboard → "Send test webhook" to verify the production endpoint returns 200.
- Keep one endpoint per mode: one test endpoint pointing to a stable preview/local URL; one live endpoint pointing to the production domain only.

**Warning signs:**
- Stripe Dashboard shows events as "Delivered" but no bookings appear in Supabase.
- The delivered URL in event logs is a non-production Vercel URL.
- Production webhook endpoint shows 0 delivered events.

**Phase to address:** Phase 1 — Stripe Live Mode Setup

---

### Pitfall 10: Vercel Deployment Protection Blocking Stripe Webhook Requests

**What goes wrong:**
Vercel's deployment protection (password protection or Vercel Authentication on Preview deployments) intercepts the incoming POST from Stripe and returns a 401/302 instead of forwarding to the webhook handler. Stripe receives a non-200 response and retries — up to 78 hours later. During that time, no bookings are saved.

**Why it happens:**
Deployment protection is sometimes enabled project-wide, including production. Stripe's webhook sender does not support authentication challenges — it just follows HTTP responses. A 302 redirect to a login page causes Stripe to abandon the request.

**How to avoid:**
- Confirm Vercel deployment protection is disabled for the production deployment (or bypassed for the `/api/webhooks/stripe` path if protection is needed elsewhere).
- After registering the live webhook, use Stripe CLI: `stripe trigger payment_intent.succeeded` pointing to the production URL and verify a 200 response.

**Warning signs:**
- Stripe webhook logs show `HTTP 401` or `HTTP 302` from the endpoint.
- The endpoint works with curl from a terminal but not from Stripe.

**Phase to address:** Phase 1 — Stripe Live Mode Setup (smoke test verification)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping same API key for all environments (test + live) | No need to manage multiple keys | Live charges during PR previews; impossible to audit which env caused a charge | Never — always use environment-scoped keys |
| Using `onboarding@resend.dev` as From address permanently | Emails work in dev without DNS setup | All production emails land in spam; domain reputation never built | Development only — must switch before go-live |
| Single Google Maps API key (no restriction) | Works everywhere, no config needed | Exposed client-side in browser; potential billing abuse if key scraped | Never in production — restrict by referrer for client-side key |
| Skipping health check endpoint | Saves one file | No way to verify all services are connected without triggering a real booking | Acceptable for MVP only if smoke test is thorough |
| Not setting DMARC record for Resend domain | One fewer DNS record | Emails may be rejected by strict receivers; no visibility into spoofing | Acceptable for initial launch; add within 30 days |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-----------------|
| Stripe webhooks | Copy signing secret while in test mode, use in production | Switch to live mode in Dashboard first; copy live endpoint secret |
| Stripe webhooks | Register endpoint with a Vercel preview URL | Register with final production domain (`rideprestige.com`) |
| Stripe webhooks | Parse body as JSON before `constructEvent()` | Use `await request.text()` — already implemented correctly in `route.ts` |
| Supabase | Run schema verification in SQL Editor (bypasses RLS/PostgREST) | Verify inserts via the SDK in a health check or smoke test |
| Supabase | Use SSR client helper in webhook route | Use `createClient()` directly with `persistSession: false` — already correct |
| Resend | Leave `from` as `onboarding@resend.dev` in production | Add and verify `rideprestige.com` in Resend Domains; update `from` in `lib/email.ts` |
| Google Maps (client) | Add `localhost` referrer only | Add production domain patterns before go-live: `https://rideprestige.com/*` |
| Google Maps (server) | Restrict server-side Routes API key by HTTP referrer | Use no application restriction or IP restriction; restrict by API (Routes API only) |
| Vercel env vars | Check all three scopes for sensitive vars | Scope live keys to Production only; use separate test keys for Preview |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Webhook handler doing too much synchronously | Vercel function timeout (10s on Hobby, longer on Pro); Stripe retries and sends duplicate events | The current implementation is sequential (save → email → email); if Supabase is slow on cold start, this can exceed limits | Under load or Supabase cold start — not a concern at v1.1 scale, monitor at 50+ bookings/day |
| Resend sending both emails sequentially | Adds latency to webhook response time | Already implemented as fire-and-forget with individual try/catch; no blocking issue | Not a problem — emails are non-fatal and sequential sends are fine at this scale |
| Google Maps pricing called on every route change | Excessive API calls during address input | Already server-side in `/api/calculate-price` — called only on explicit "calculate" trigger, not on keypress | Not a problem at current architecture |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `SUPABASE_SERVICE_ROLE_KEY` scoped to Preview/Development in Vercel | Service role key available in preview deployments; could be extracted from logs or error messages | Production scope only in Vercel settings |
| `STRIPE_SECRET_KEY` (live) used in a PR preview | Real charges from test workflows; impossible to reverse | Production scope only; use `sk_test_...` for Preview scope |
| Google Maps client key unrestricted or with wildcard `*` referrer | Key scraped from browser DevTools; used for billing abuse by bots | Add specific production domain referrers only; set billing alert in Google Cloud Console |
| Stripe webhook endpoint returning full error details in 400 response body | Leaks internal implementation details | Current implementation returns generic `Webhook Error: ${message}` — acceptable; avoid returning raw stack traces |
| Resend API key with full access (all permissions) | If key leaks, attacker can read email logs, delete domains | Create a key with `Sending Access` only, optionally restricted to `rideprestige.com` domain |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Client pays but receives no confirmation email (Resend domain not verified) | Client panics, contacts manager, loses trust | Verify Resend domain and test email delivery before enabling Stripe live mode |
| Address autocomplete broken in production (Maps key referrer wrong) | User cannot complete Step 1; abandons booking | Test Places Autocomplete on production URL before go-live |
| Booking confirmation page shows but Supabase save failed | Manager has no record of the booking; no-show risk | Emergency alert email is already implemented; ensure manager email is set correctly in `MANAGER_EMAIL` env var |
| Stripe live mode charges a real card during smoke test | Tester charged real money | Use Stripe test card `4242 4242 4242 4242` — works even in live mode for verification; immediately refund any accidental live charges from Stripe Dashboard |

---

## "Looks Done But Isn't" Checklist

- [ ] **Stripe webhook:** Endpoint registered in **live mode**, not test mode — verify by checking the Stripe Dashboard mode toggle
- [ ] **Stripe webhook:** Signing secret copied from the live endpoint (not the CLI `whsec_...` from `stripe listen`)
- [ ] **Stripe webhook:** Endpoint URL is `rideprestige.com` production domain, not a Vercel preview URL
- [ ] **Supabase table:** `CREATE TABLE bookings` executed in the actual production Supabase project — not just the local dev project
- [ ] **Supabase table:** `UNIQUE` constraint on `payment_intent_id` present — prevents duplicate inserts on webhook retries
- [ ] **Supabase env vars:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are from the **production** Supabase project, not a dev/staging project
- [ ] **Resend domain:** `rideprestige.com` shows all green DNS records in Resend Domains dashboard
- [ ] **Resend `from` address:** Updated from any placeholder to `bookings@rideprestige.com` (or equivalent verified address) in `lib/email.ts`
- [ ] **Resend test:** Client confirmation email received in Gmail inbox (not spam); manager alert received at `MANAGER_EMAIL`
- [ ] **Google Maps client key:** Production domain `rideprestige.com/*` added to HTTP referrer allowlist
- [ ] **Google Maps server key:** No HTTP referrer restriction — only API restriction (Routes API)
- [ ] **Vercel env vars:** All 6 production secrets scoped to Production environment only — not Preview or Development
- [ ] **Vercel env vars:** Redeployed from Vercel Dashboard after setting variables (not just via CLI)
- [ ] **Health check:** `/api/health` returns 200 with all services reachable (or equivalent manual smoke test)
- [ ] **End-to-end smoke test:** One full booking completed on production URL using Stripe test card `4242 4242 4242 4242` — booking appears in Supabase, both emails received

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong Stripe webhook secret | LOW | Update `STRIPE_WEBHOOK_SECRET` in Vercel → redeploy → Stripe will retry failed events automatically within 72 hours; manually replay any specific missed events from Stripe Dashboard |
| Supabase table not created | MEDIUM | Create table, verify schema; check emergency alert emails sent during the window for booking data; manually insert any confirmed paid bookings from Stripe payment records |
| Resend domain not verified, emails delivered to spam | LOW | Complete domain verification in Resend; Resend does not retry — manually send confirmation emails to affected clients using Resend Dashboard or direct email |
| Google Maps key blocked in production | LOW | Add production domain to referrer list in Google Cloud Console; propagates in ~5 minutes; no data loss |
| Env var scoped incorrectly (live key in preview) | LOW | Update scope in Vercel; redeploy affected environments; audit Stripe live mode for any test-triggered charges and refund |
| Stripe endpoint pointing to wrong URL | MEDIUM | Update webhook endpoint URL in Stripe Dashboard → Stripe retries queued events; may need to manually replay if retry window expired; check for any paid-but-not-saved bookings |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Stripe secret mismatch (test vs. live) | Phase 1 — Stripe Live Mode Setup | Stripe Dashboard shows endpoint in live mode; signing secret prefix is `whsec_` from live endpoint page |
| Vercel env var scope wrong | Phase 1 — Environment Variable Configuration | Vercel Settings → Environment Variables — each live key has only Production checked |
| Supabase table not created | Phase 1 — Supabase Schema Setup | `SELECT COUNT(*) FROM bookings` returns 0 in Supabase SQL Editor |
| Supabase SSR client override | Phase 1 — Supabase Setup | Code review: `createSupabaseServiceClient()` uses `createClient()` directly, not SSR helper |
| PostgREST schema cache stale | Phase 1 — Supabase Schema Setup | Test insert via SDK in health check or smoke test — not SQL Editor |
| Google Maps client key referrer | Phase 2 — Google Maps Configuration | Places Autocomplete returns suggestions on production URL |
| Google Maps server key type | Phase 2 — Google Maps Configuration | `/api/calculate-price` returns numeric price on production (not quote fallback) |
| Resend domain unverified | Phase 3 — Resend Domain Verification | Resend Domains dashboard shows all green; test email in inbox not spam |
| Resend `from` address placeholder | Phase 3 — Resend Domain Verification | `from` field in confirmation email shows `bookings@rideprestige.com` |
| Stripe endpoint URL wrong | Phase 1 — Stripe Live Mode Setup | Stripe Dashboard endpoint URL matches production domain exactly |
| Vercel deployment protection | Phase 1 — Stripe Live Mode Setup | Stripe "Send test webhook" returns 200 from production endpoint |

---

## Sources

- [Stripe: Resolve webhook signature verification errors](https://docs.stripe.com/webhooks/signature) — official docs
- [Stripe: Receive events in your webhook endpoint](https://docs.stripe.com/webhooks) — official docs
- [Next.js App Router + Stripe Webhook Signature Verification](https://kitson-broadhurst.medium.com/next-js-app-router-stripe-webhook-signature-verification-ea9d59f3593f) — MEDIUM confidence (verified against Stripe official docs)
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables) — official docs
- [Supabase: Why is my service role key getting RLS errors?](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — official docs
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — official docs
- [Supabase: PostgREST not recognizing new columns](https://supabase.com/docs/guides/troubleshooting/postgrest-not-recognizing-new-columns-or-functions-bd75f5) — official docs
- [Google Maps Platform: Security best practices](https://developers.google.com/maps/api-security-best-practices) — official docs
- [Google Maps Platform: Best practices — Restricting API keys](https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-restricting-api-keys/) — official blog
- [Resend: Why your emails are going to spam](https://resend.com/blog/why-your-emails-are-going-to-spam) — official blog
- [Resend: Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc) — official docs
- [Resend: What if my domain is not verifying?](https://resend.com/docs/knowledge-base/what-if-my-domain-is-not-verifying) — official docs
- [Debugging Stripe Webhook Signature Verification Errors in Production](https://dev.to/nerdincode/debugging-stripe-webhook-signature-verification-errors-in-production-1h7c) — MEDIUM confidence
- [The Webhook Failure Modes Nobody Warns You About](https://dev.to/jamesbrown/the-webhook-failure-modes-nobody-warns-you-about-346m) — MEDIUM confidence

---

*Pitfalls research for: Next.js App Router go-live — Supabase + Stripe + Resend + Google Maps on Vercel*
*Researched: 2026-03-30*
