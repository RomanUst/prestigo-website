# Phase 8: Stripe + Health Check + Maps Keys — Research

**Researched:** 2026-03-31
**Domain:** Stripe webhook registration, Next.js health endpoint, Google Maps API key restrictions
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STRP-01 | Stripe live-mode webhook endpoint registered in Stripe Dashboard at production URL (`/api/webhooks/stripe`) listening to `payment_intent.succeeded` | Stripe Dashboard Webhooks tab → Create event destination → HTTPS URL + event type selection. Code already exists at `app/api/webhooks/stripe/route.ts`. |
| STRP-02 | `STRIPE_WEBHOOK_SECRET` set in Vercel with production signing secret and redeployed | After endpoint registration, reveal signing secret (`whsec_...`) from Stripe Dashboard → paste into Vercel env var → trigger redeploy. |
| STRP-03 | `/api/health` endpoint live at production URL, returning 200 with all service checks passing | Endpoint already fully implemented at `app/api/health/route.ts`. Requires `STRIPE_WEBHOOK_SECRET` to be set before health check passes (Stripe probe checks for `whsec_` prefix). Also requires `HEALTH_SECRET` env var set in Vercel. |
| MAPS-01 | Google Maps server-side key (`GOOGLE_MAPS_API_KEY`) confirmed with API restriction only — no HTTP referrer restriction (prevents `REQUEST_DENIED` on `/api/calculate-price`) | Google Cloud Console → Credentials → edit server key → Application restrictions: None (or IP addresses only) → API restrictions: Routes API only. |
| MAPS-02 | Google Maps client-side key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) restricted to production domain referrer (`rideprestige.com/*`) | Google Cloud Console → Credentials → edit client key → Application restrictions: HTTP referrers → add `https://rideprestige.com/*`. |
</phase_requirements>

---

## Summary

Phase 8 is almost entirely a configuration and verification phase, not a code-writing phase. The critical insight is that the `/api/health` route (`app/api/health/route.ts`) and the Stripe webhook handler (`app/api/webhooks/stripe/route.ts`) **already exist and are fully implemented**. The code was written as part of the v1.0 MVP build (Phases 4–5).

What remains is three external-dashboard configuration tasks plus one verification task: (1) register the live webhook endpoint in the Stripe Dashboard and copy the signing secret, (2) set `STRIPE_WEBHOOK_SECRET` and `HEALTH_SECRET` in Vercel and redeploy, (3) verify both Google Maps API keys have correct restriction types in Google Cloud Console, and (4) confirm `/api/health` returns 200 with `status: "ok"` in production.

The health endpoint uses Bearer token authorization (`HEALTH_SECRET`), so that env var must also be set in Vercel before `/api/health` returns 200 rather than 401. This is a gap not explicitly called out in the requirements but blocking STRP-03.

**Primary recommendation:** This phase requires no new code. All five requirements are satisfied through external dashboard configuration (Stripe, Vercel, Google Cloud Console) plus a single `curl` verification command.

---

## Standard Stack

### Core (already installed — no new packages required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | ^21.0.1 | Stripe SDK — webhook signature verification via `stripe.webhooks.constructEvent()` | Already in `package.json`; used in `app/api/webhooks/stripe/route.ts` |
| `next` | 16.1.7 | App Router Route Handlers — `app/api/health/route.ts`, `app/api/webhooks/stripe/route.ts` | Project framework |
| `@supabase/supabase-js` | ^2.101.0 | Health probe: `supabase.from('bookings').select('id').limit(1)` | Already in project |
| `resend` | ^6.9.4 | Health probe: `resend.domains.list()` | Already in project |

**No new packages to install.** This phase is zero-dependency.

### Env Vars Required in Vercel (Production scope)

| Variable | Source | Status |
|----------|--------|--------|
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint signing secret | NOT YET SET (deferred from Phase 7) |
| `HEALTH_SECRET` | Generate: `openssl rand -hex 32` | NOT YET SET |

All other 7 env vars were set in Phase 7.

---

## Architecture Patterns

### Existing Code Structure (Do Not Change)

```
prestigo/app/api/
├── health/
│   └── route.ts          # FULLY IMPLEMENTED — probes Supabase, Stripe, Resend
├── webhooks/
│   └── stripe/
│       └── route.ts      # FULLY IMPLEMENTED — constructEvent, saveBooking, sendEmail
├── calculate-price/
│   └── route.ts          # Uses GOOGLE_MAPS_API_KEY (server-side key, no HTTP referrer)
└── create-payment-intent/
    └── route.ts
```

### Pattern 1: Health Endpoint Authorization

The `/api/health` route uses Bearer token auth, not public access:

```typescript
// Source: prestigo/app/api/health/route.ts (existing)
const expected = process.env.HEALTH_SECRET
if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Implication:** To verify STRP-03, the `curl` command must include the `Authorization` header:
```bash
curl -H "Authorization: Bearer <HEALTH_SECRET_VALUE>" https://rideprestige.com/api/health
```

### Pattern 2: Stripe Webhook Signature Verification

The existing webhook handler uses raw body (`request.text()`) — this is mandatory for Stripe signature verification:

```typescript
// Source: prestigo/app/api/webhooks/stripe/route.ts (existing)
const body = await request.text() // MUST be .text() — NOT .json()
event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
```

This is already correct. No changes needed.

### Pattern 3: Health Probe — Stripe Check

The health endpoint validates `STRIPE_WEBHOOK_SECRET` by format check, not a live API call (avoids Vercel Hobby cold-start overhead):

```typescript
// Source: prestigo/app/api/health/route.ts (existing)
const keyOk = key.startsWith('sk_live_') || key.startsWith('sk_test_')
const webhookOk = webhookSecret.startsWith('whsec_')
results.stripe = keyOk && webhookOk ? { ok: true } : { ok: false, error: '...' }
```

**Implication:** The Stripe health probe passes as soon as `STRIPE_WEBHOOK_SECRET=whsec_...` is set in Vercel. No live Stripe API call is made.

### Pattern 4: Google Maps Key Separation

Two separate keys with different restriction types:

| Key | Env Var | Restriction Type | Reason |
|-----|---------|-----------------|--------|
| Server-side | `GOOGLE_MAPS_API_KEY` | API restriction only (no HTTP referrer) | Used in server-side Route Handler (`/api/calculate-price`) — no `Referer` header in server-to-server calls; HTTP referrer restriction causes `REQUEST_DENIED` |
| Client-side | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | HTTP referrer: `https://rideprestige.com/*` | Used in browser (Places Autocomplete) — restricts usage to production domain only |

### Anti-Patterns to Avoid

- **Adding HTTP referrer restriction to the server-side key:** Vercel serverless functions do not send a `Referer` header. Adding `rideprestige.com/*` to `GOOGLE_MAPS_API_KEY` will cause `REQUEST_DENIED` on all `/api/calculate-price` calls. The `.env.example` and STATE.md already document this correctly — do not change it.
- **Using the Stripe test-mode signing secret in production:** Copying the `whsec_` from a test-mode endpoint will cause all live webhook events to fail signature verification silently (400 errors logged but no 500).
- **Calling `/api/health` without the Authorization header:** Returns 401, not a service failure. The verification curl must include `Authorization: Bearer <HEALTH_SECRET>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC comparison | `stripe.webhooks.constructEvent()` | Stripe SDK handles timing-safe comparison, header parsing, and tolerance window — already implemented |
| Health probe response format | Custom format | Existing `{ status, services }` shape | Already implemented and correct |
| Google Maps key restriction | Code-level IP filtering | Google Cloud Console key restrictions | Platform-enforced; no runtime overhead |

---

## Common Pitfalls

### Pitfall 1: Stripe Live vs. Test Mode Mismatch

**What goes wrong:** Registering the webhook endpoint in Stripe's **test mode** Dashboard instead of **live mode** Dashboard. The live Stripe secret key (`sk_live_`) will not match events from a test-mode webhook endpoint.
**Why it happens:** Stripe Dashboard has a toggle between Test/Live at the top. Easy to miss.
**How to avoid:** Confirm the mode toggle shows "Live" before registering the endpoint. The signing secret from a live endpoint starts with `whsec_` but is scoped to live mode.
**Warning signs:** `/api/health` Stripe check shows `ok: false` with "missing/invalid" error after setting the secret.

### Pitfall 2: `HEALTH_SECRET` Not Set Means 401, Not 200

**What goes wrong:** Setting `STRIPE_WEBHOOK_SECRET` in Vercel but forgetting `HEALTH_SECRET`. The health endpoint returns 401 for every request, which looks like a failure.
**Why it happens:** `HEALTH_SECRET` was added to `.env.example` but was not in the original 7 env vars set in Phase 7.
**How to avoid:** Set both `STRIPE_WEBHOOK_SECRET` and `HEALTH_SECRET` in Vercel in the same session. Generate `HEALTH_SECRET` with `openssl rand -hex 32`.
**Warning signs:** `curl` returns `{"error":"Unauthorized"}` with 401 status.

### Pitfall 3: HTTP Referrer Must Include Scheme in Google Cloud Console

**What goes wrong:** Adding `rideprestige.com/*` (without `https://`) to the client-side key's referrer restrictions. Google requires the scheme.
**Why it happens:** Intuitive to omit the protocol, but Google validates the format.
**How to avoid:** Use `https://rideprestige.com/*` (with scheme) in the HTTP referrers field.
**Warning signs:** Maps API returns 403 or `OVER_QUERY_LIMIT` on production site.

### Pitfall 4: Vercel Does Not Auto-Redeploy After Env Var Change

**What goes wrong:** Setting `STRIPE_WEBHOOK_SECRET` in Vercel but not triggering a redeploy. The running deployment still has the old env var values (absent = `undefined`).
**Why it happens:** Vercel caches the env vars at build/deploy time.
**How to avoid:** After setting env vars in Vercel Dashboard, trigger a redeploy ("Redeploy" button on the last deployment, or push a commit).
**Warning signs:** Health endpoint still shows Stripe `ok: false` after setting the secret.

### Pitfall 5: Stripe Webhook URL Must Be HTTPS

**What goes wrong:** Accidentally registering `http://` instead of `https://` in Stripe Dashboard.
**Why it happens:** Copy-paste error.
**How to avoid:** Use `https://rideprestige.com/api/webhooks/stripe` exactly.

---

## Code Examples

No new code is required for this phase. All route handlers are already implemented.

### Verification Commands (for human action tasks)

```bash
# Verify health endpoint returns 200 with all-green (replace TOKEN with HEALTH_SECRET value)
curl -s -H "Authorization: Bearer TOKEN" https://rideprestige.com/api/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "services": {
#     "supabase": { "ok": true },
#     "stripe": { "ok": true },
#     "resend": { "ok": true }
#   }
# }
```

```bash
# Generate HEALTH_SECRET value
openssl rand -hex 32
```

### Stripe Dashboard — Webhook Registration Path

```
Stripe Dashboard (Live mode)
  → Developers
  → Workbench
  → Webhooks tab
  → "Create an event destination"
  → Endpoint URL: https://rideprestige.com/api/webhooks/stripe
  → Events: payment_intent.succeeded
  → Save
  → Open endpoint detail → Signing secret → "Reveal secret" → copy whsec_...
```

### Vercel — Set Env Vars Path

```
Vercel Dashboard
  → rideprestige project
  → Settings → Environment Variables
  → Add: STRIPE_WEBHOOK_SECRET = whsec_... (Production scope only)
  → Add: HEALTH_SECRET = <openssl output> (Production scope only)
  → Deployments → Redeploy last deployment
```

### Google Cloud Console — Client-Side Key Restriction Path

```
Google Cloud Console
  → APIs & Services → Credentials
  → Edit client key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
  → Application restrictions → HTTP referrers (websites)
  → Add: https://rideprestige.com/*
  → Save
```

### Google Cloud Console — Server-Side Key Verification Path

```
Google Cloud Console
  → APIs & Services → Credentials
  → Edit server key (GOOGLE_MAPS_API_KEY)
  → Application restrictions: should be "None" or "IP addresses" (NOT HTTP referrers)
  → API restrictions: Routes API (or Distance Matrix API) only
  → Confirm and Save if needed
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Stripe Webhooks tab in old Dashboard | Stripe Workbench → Webhooks tab (current UI as of 2025) | Navigation path has changed; "Create an event destination" is the button label |
| HTTP referrer without scheme (`example.com/*`) | Must include scheme (`https://example.com/*`) | Invalid format rejected by Google Console |
| Polling for env var changes in Vercel | Must redeploy to pick up new env vars | Common source of "it's not working" after setting secrets |

---

## Open Questions

1. **Is `HEALTH_SECRET` already set in Vercel from Phase 7?**
   - What we know: The 7 env vars set in Phase 7 were: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `MANAGER_EMAIL`. `HEALTH_SECRET` is not in this list.
   - What's unclear: Whether it was added separately during Phase 7 execution.
   - Recommendation: Plan task should verify Vercel env vars list and set `HEALTH_SECRET` if missing — do not assume it's set.

2. **What API restriction is currently on the Google Maps server-side key?**
   - What we know: `.env.example` documents the correct intended state (no HTTP referrer). STATE.md Phase 7 decision confirms separate keys.
   - What's unclear: Whether the key was already correctly configured in Google Cloud Console at project start, or needs verification/change.
   - Recommendation: Plan task should verify current state in Google Cloud Console and document what was found — change only if HTTP referrer restriction is present.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts` |
| Full suite command | `cd prestigo && npx vitest run` |

**Known constraint:** Vitest 4.x requires Node 18+. The project runs Node 16. `npx vitest run` fails with `styleText` not exported error. This is a pre-existing incompatibility documented in STATE.md and does not affect production builds.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRP-01 | Live webhook endpoint registered at correct URL | manual-only | — human: Stripe Dashboard verification | N/A |
| STRP-02 | `STRIPE_WEBHOOK_SECRET` set in Vercel, redeploy successful | manual-only | — human: Vercel Dashboard + `curl` health check | N/A |
| STRP-03 | `/api/health` returns 200 with all services `ok: true` | manual-only (integration/smoke) | `curl -H "Authorization: Bearer TOKEN" https://rideprestige.com/api/health` | N/A — production only |
| MAPS-01 | Server-side key has no HTTP referrer restriction | manual-only | — human: Google Cloud Console verification | N/A |
| MAPS-02 | Client-side key restricted to `https://rideprestige.com/*` | manual-only | — human: Google Cloud Console verification | N/A |

**All Phase 8 requirements are manual-only.** They involve external service dashboard configurations and production endpoint verification that cannot be automated in vitest. The existing `tests/webhooks-stripe.test.ts` covers the webhook handler unit behavior (signature verification logic, saveBooking call, email dispatch) and was completed in Phase 5.

### Wave 0 Gaps

- [ ] `tests/health.test.ts` — unit test covering `/api/health` GET handler: tests 401 on missing/wrong auth, tests 200 shape with mocked Supabase/Resend, tests 503 on probe failure. This test does not exist yet and should be created in Wave 0 of this phase.

---

## Sources

### Primary (HIGH confidence)

- Existing codebase: `prestigo/app/api/health/route.ts` — health endpoint implementation verified by direct read
- Existing codebase: `prestigo/app/api/webhooks/stripe/route.ts` — Stripe webhook handler verified by direct read
- `.planning/phases/07-foundation-supabase-schema-env-vars-deploy/07-02-SUMMARY.md` — confirmed which env vars were set in Phase 7
- `.env.example` — documents all 8 required env vars including `HEALTH_SECRET` and `STRIPE_WEBHOOK_SECRET`

### Secondary (MEDIUM confidence)

- [Stripe Webhooks Documentation](https://docs.stripe.com/webhooks) — webhook registration process, Workbench UI navigation
- [Stripe Webhook Signature Verification](https://docs.stripe.com/webhooks/signature) — `whsec_` format, Reveal secret flow
- [Google Cloud — Adding restrictions to API keys](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys) — HTTP referrer restriction requires scheme; `browserKeyRestrictions` vs `serverKeyRestrictions`
- [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices) — separate keys for client vs server
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) — App Router GET handler pattern confirmation

### Tertiary (LOW confidence)

None — all critical claims verified against codebase or official documentation.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — code already exists, no new packages, verified by direct read
- Architecture: HIGH — all patterns verified from existing source files
- Pitfalls: HIGH (dashboard navigation) / MEDIUM (Google key format) — cross-referenced with official docs
- Test map: HIGH — direct inspection of `tests/` directory confirmed no health test exists

**Research date:** 2026-03-31
**Valid until:** 2026-05-01 (stable integrations — Stripe/Google Cloud API key UIs change infrequently)
