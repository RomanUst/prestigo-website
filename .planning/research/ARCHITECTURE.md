# Architecture Research — v4.0 Helpdesk + CRM

**Domain:** Self-hosted Chatwoot + EspoCRM on a Hostinger VPS, two-way linked to a production Next.js/Supabase/Vercel site
**Researched:** 2026-09-27
**Confidence:** HIGH (integration points against real code) / MEDIUM (Chatwoot/EspoCRM webhook & Dashboard App mechanics, verified via docs search, not yet exercised against the actual self-hosted instance)

This document is scoped to the delta for v4.0 only. It assumes the existing Next.js App Router + Supabase + Stripe + QStash architecture described in `.planning/PROJECT.md` and does not restate it. The `.planning/codebase/` snapshot is stale (dated 2026-03-20, pre-Supabase, pre-booking-flow) — all facts below come from reading the current `main` branch directly.

## Standard Architecture

### System Overview

```
┌──────────────────────────────── VERCEL (must never depend on VPS uptime) ─────────────────────────────┐
│                                                                                                          │
│  Browser ── forms (contact/corporate/multiday/quote) ──► app/api/* routes                               │
│  Browser ── booking checkout ──► app/api/create-payment-intent ──► Stripe                                │
│  Stripe ──► app/api/webhooks/stripe (event-id dedup, existing)                                           │
│                        │                                                                                 │
│                        ▼ (same txn / same request, INSERT only)                                          │
│              ┌─────────────────────┐        ┌──────────────────┐                                        │
│              │ Supabase Postgres   │        │  integration_     │  outbox rows                          │
│              │ bookings            │──────► │  outbox (NEW)     │──────┐                                │
│              │ customer_profiles   │        └──────────────────┘       │                                │
│              │ inquiries (NEW)     │                                    │ QStash.publishJSON (delay 0)  │
│              │ crm_identity_map    │                                    ▼                                │
│              │ (NEW)               │                          app/api/integrations/dispatch (NEW)        │
│              └─────────────────────┘                                    │                                │
│                        ▲                                                │ HTTPS (server-to-server)       │
│                        │ write-back (booking summaries only,            │                                │
│                        │ read-only view/RPC)                            ▼                                │
│              app/api/chatwoot/* (NEW)                        ┌──────────────────────┐                    │
│              app/api/crm/webhook (NEW)                       │ Chatwoot REST API /   │                    │
│                        ▲                                     │ EspoCRM REST API      │                    │
│                        │ inbound webhooks (HMAC-verified)     └──────────┬────────────┘                  │
└────────────────────────┼──────────────────────────────────────────────┼─────────────────────────────────┘
                          │                                              │
                          │                                 ┌────────────▼────────────┐
              ┌───────────┴───────────┐                     │  Hostinger VPS (Docker)  │
              │ Chatwoot conversation  │◄────────────────────┤  Chatwoot + EspoCRM +    │
              │ webhook → our API      │  Chatwoot Dashboard  │  Postgres/MySQL + Caddy  │
              │ → EspoCRM contact/lead │  App (iframe, embeds │  TLS + backups          │
              └────────────────────────┘  OUR page)          └──────────────────────────┘
                          ▲
                          │ consent-gated widget script (browser, loaded from VPS)
                     Browser (customer)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| `integration_outbox` (Supabase) | Durable, ordered record of every domain event that must reach Chatwoot/CRM | Postgres table, `INSERT` in the same code path (or DB trigger) that writes the source row |
| Outbox dispatcher (`app/api/integrations/dispatch`) | Turns one outbox row into an idempotent write to Chatwoot and/or EspoCRM | Next.js API route, invoked by QStash; verifies QStash signature |
| Outbox enqueue helper (`lib/outbox.ts`) | Single call site every write path uses to insert an outbox row + fire the immediate QStash publish | Thin wrapper, mirrors `lib/qstash.ts`'s fire-and-forget `after()` pattern |
| Outbox sweep cron (`app/api/cron/outbox-sweep`) | Catches rows stuck `pending` past a threshold (QStash publish failed, process crashed before publish) | Vercel Cron → re-publishes stragglers to QStash, capped retry count |
| `crm_identity_map` (Supabase) | Canonical join between a Supabase identity (customer / guest booking contact) and `chatwoot_contact_id` / `espocrm_contact_id` / `espocrm_account_id` | Postgres table, service-role only |
| `inquiries` (Supabase) | Persists every form submission that today is email-only (contact, corporate, multi-day quote) | Postgres table, replaces "email-only, never stored" |
| Chatwoot webhook receiver (`app/api/webhooks/chatwoot`) | Ingests conversation/contact events from Chatwoot, syncs into EspoCRM | Next.js API route, HMAC-verified (`X-Chatwoot-Signature`) |
| EspoCRM webhook receiver (`app/api/webhooks/espocrm`) | Optional, narrow: reflects CRM-side pipeline state back to the site | Next.js API route, HMAC-verified (`X-Signature`), off by default |
| Chatwoot Dashboard App page (`app/embed/chatwoot-dashboard` or similar) | Renders a customer's Supabase bookings inside the Chatwoot conversation sidebar | Server component page, no admin session cookie, `frame-ancestors` CSP scoped to the Chatwoot origin, identity via Chatwoot's own `postMessage` context |
| Widget identity endpoint (`app/api/chatwoot/identify`) | Computes the widget's `identifier_hash` (HMAC-SHA256) server-side for logged-in customers | Next.js API route, never exposes the widget's `hmac_token` |
| `lib/identity.ts` (NEW) | Normalizes email + phone (E.164) and dedupes/merges contacts before they reach Chatwoot/EspoCRM | Pure functions, `libphonenumber-js` for E.164 |

## Recommended Project Structure

```
app/
├── api/
│   ├── integrations/
│   │   └── dispatch/route.ts          # NEW — QStash → outbox row → Chatwoot/EspoCRM write
│   ├── webhooks/
│   │   ├── stripe/route.ts            # EXISTING — unchanged, still the booking source of truth
│   │   ├── chatwoot/route.ts          # NEW — inbound Chatwoot conversation/contact webhook
│   │   └── espocrm/route.ts           # NEW — optional, narrow CRM→site reflection (off by default)
│   ├── chatwoot/
│   │   ├── identify/route.ts          # NEW — widget identifier_hash minting (auth'd customers only)
│   │   └── dashboard-app/route.ts     # NEW — read-only booking summaries for the Dashboard App page
│   ├── cron/
│   │   └── outbox-sweep/route.ts      # NEW — stragglers past pending threshold
│   ├── contact/route.ts               # MODIFIED — also inserts into `inquiries`
│   ├── corporate-contact/route.ts     # MODIFIED — also inserts into `inquiries`
│   └── submit-multiday-quote/route.ts # MODIFIED — also inserts into `inquiries`
├── embed/
│   └── chatwoot-dashboard/page.tsx    # NEW — Dashboard App iframe target, no admin cookie
│
lib/
├── outbox.ts                          # NEW — enqueueOutboxEvent() single call site
├── identity.ts                        # NEW — normalizeEmail, normalizePhoneE164, resolveIdentity
├── chatwoot-client.ts                 # NEW — thin REST wrapper (contacts, conversations, custom attrs)
├── espocrm-client.ts                  # NEW — thin REST wrapper (Contact/Account/Lead/Opportunity)
├── qstash.ts                          # EXISTING — add publishOutboxDispatch() alongside scheduleQStashReminder()
├── webhook-verify.ts                  # NEW — X-Chatwoot-Signature / X-Signature HMAC verification helpers
│
supabase/migrations/
├── 063_integration_outbox.sql         # NEW
├── 064_crm_identity_map.sql           # NEW
├── 065_inquiries.sql                  # NEW
```

### Structure Rationale

- **`app/api/integrations/`:** one dispatcher, not per-provider routes — QStash calls a single endpoint per outbox row; the endpoint fans out to Chatwoot and/or EspoCRM based on `event_type`. Keeps QStash config (one target URL) stable as providers are added later.
- **`app/api/webhooks/{chatwoot,espocrm}`:** siblings of the existing `app/api/webhooks/stripe`, same directory convention, same "verify signature, then act" shape.
- **`app/embed/`:** new top-level route group, distinct from `app/[locale]/` — the Dashboard App page is agent-tool UI, not a customer-facing localized page, and must NOT go through the CSP/consent/next-intl composition built for the public site. It gets its own narrow middleware carve-out (see Anti-Patterns).
- **`lib/outbox.ts` as the only insert path:** every future event producer (booking webhook, admin edit route, customer signup) calls one function instead of hand-rolling `supabase.from('integration_outbox').insert(...)` in N places — keeps event shape and idempotency-key generation consistent.

## Architectural Patterns

### Pattern 1: Outbox table + QStash dispatch (not a DB trigger, not n8n)

**What:** Every write path that produces a CRM-relevant event does two things in the same request: (1) its existing Supabase write (booking insert/update, `inquiries` insert, `customer_profiles` insert), (2) an `integration_outbox` insert via `lib/outbox.ts`. That helper also fires `after(() => qstash.publishJSON({ url: '.../api/integrations/dispatch', body: { outbox_id } }))` — mirroring the existing `scheduleQStashReminder` fire-and-forget convention in `lib/qstash.ts`.

**When to use:** Any event that must reach Chatwoot and/or EspoCRM. Not used for reads.

**Trade-offs:**
- vs. a Postgres trigger (`pg_net`/`supabase_functions.http_request`) that fires on `INSERT`/`UPDATE`: the trigger approach removes the "must remember to call `lib/outbox.ts`" discipline risk, but Supabase's async trigger delivery has weaker retry/observability than an explicit QStash publish, and debugging a trigger requires DB-side log access rather than Vercel function logs. Given the existing codebase already has an established "service-role client + explicit fire-and-forget QStash" idiom (`scheduleQStashReminder`), the explicit-insert approach is more consistent and easier for future agents to grep for. Recommendation: explicit insert, not trigger.
- vs. n8n: explicitly rejected by the locked decision in PROJECT.md — integration logic lives in-repo, versioned, tested.
- Immediate QStash publish (delay 0) gives near-real-time delivery in the common case; the `outbox-sweep` cron is the safety net for the "publish call itself failed" case (network blip between Vercel and Upstash) — this is the same two-layer pattern QStash reminders already rely on implicitly (QStash's own retries) plus a fallback (the sweep) for failures QStash never received at all.

**Example (schema sketch, migration 063):**
```sql
CREATE TABLE public.integration_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,        -- 'booking.created' | 'booking.paid' | ...
  aggregate_type  text NOT NULL,        -- 'booking' | 'inquiry' | 'customer'
  aggregate_id    uuid NOT NULL,        -- bookings.id / inquiries.id / customer_profiles.id
  payload         jsonb NOT NULL,       -- denormalized snapshot at enqueue time (never re-read source row later)
  idempotency_key text NOT NULL,        -- see Pattern 2
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE UNIQUE INDEX integration_outbox_idempotency_key_idx ON public.integration_outbox (idempotency_key);
CREATE INDEX integration_outbox_status_created_idx ON public.integration_outbox (status, created_at) WHERE status = 'pending';
-- Service-role only, no RLS policy — mirrors booking_edit_audit_log's posture.
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
```
The payload is a **denormalized snapshot**, not a foreign-key-only pointer — deliberately, because by the time the dispatcher runs (possibly minutes later on a sweep retry), the source `bookings` row may have changed again (e.g. a `booking.status_changed` event racing an admin edit). Snapshotting at enqueue time is the same principle the Stripe webhook already applies (it reads `paymentIntent.metadata`, a point-in-time snapshot, not a live re-query for most fields).

### Pattern 2: Idempotency key, not "exactly-once" delivery

**What:** `idempotency_key` is a deterministic string derived from `(event_type, aggregate_id, a version/timestamp discriminator)`, e.g. `booking.status_changed:{booking_id}:{status}:{updated_at}`. The dispatcher's Chatwoot/EspoCRM calls use this same key as an idempotency token where the target API supports it (EspoCRM custom field `externalId`, Chatwoot conversation custom attributes), or fall back to an upsert-by-lookup pattern (find-by-email/phone, then update).

**When to use:** Every outbox row. QStash itself retries on non-2xx, and the dispatcher may also be re-invoked by the sweep cron — the dispatcher must be safe to run twice for the same row.

**Trade-offs:** This is the exact same idempotency discipline already proven in `app/api/webhooks/stripe/route.ts` (`stripe_processed_events`, claim-after-side-effect ordering, `ON CONFLICT DO NOTHING`). Reuse the pattern rather than inventing a new one: dispatcher marks `status = 'sent'` only AFTER the Chatwoot/EspoCRM call succeeds (side-effect-first, claim-after — a crash mid-flight means a harmless retry, not a lost event).

### Pattern 3: Identity resolution before every Chatwoot/EspoCRM write

**What:** `lib/identity.ts` exports `normalizeEmail(email)` (lowercase, trim) and `normalizePhoneE164(phone, defaultCountry='CZ')` (via `libphonenumber-js`, NOT currently a dependency — must be added). Before the dispatcher creates a Chatwoot contact or EspoCRM Contact/Lead, it queries `crm_identity_map` by normalized email OR normalized phone. A match reuses the existing `chatwoot_contact_id`/`espocrm_contact_id`; no match creates new records in both systems and inserts a new `crm_identity_map` row.

**When to use:** Every outbound sync to Chatwoot or EspoCRM.

**Trade-offs:** Matching on email-OR-phone (not AND) is deliberately permissive to avoid duplicate CRM contacts — the cost is a rare false-positive merge (two different people sharing a phone, e.g. a corporate booking desk). Given the domain (premium chauffeur, low volume, high-touch), false-positive merges are cheaper to manually split in EspoCRM than duplicate contacts are to manually merge across two systems. Flag this as a MEDIUM-confidence design choice for the phase-planning stage to confirm with the owner.

**Example:**
```sql
CREATE TABLE public.crm_identity_map (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email   text,
  normalized_phone_e164 text,
  supabase_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable: guest bookings have none
  chatwoot_contact_id integer,
  espocrm_contact_id text,
  espocrm_account_id text,          -- corporate accounts (hotels/agencies) map here, not contact_id
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_identity_map_email_idx ON public.crm_identity_map (normalized_email) WHERE normalized_email IS NOT NULL;
CREATE UNIQUE INDEX crm_identity_map_phone_idx ON public.crm_identity_map (normalized_phone_e164) WHERE normalized_phone_e164 IS NOT NULL;
```

## Data Flow

### Event types and their producers

| `event_type` | Producer (write path) | Consumers |
|---|---|---|
| `booking.created` | `saveBooking` / `saveRoundTripBookings` call sites (Stripe webhook `payment_intent.succeeded`, `checkout.session.completed`; `submit-quote` route) | EspoCRM: create/update Opportunity or Order on the matched Contact/Account |
| `booking.paid` | Same Stripe webhook handlers, on the `status → confirmed` transition | Chatwoot: post a private note on the customer's conversation; EspoCRM: mark Opportunity won / create Order |
| `booking.status_changed` | `app/api/admin/bookings` PATCH route (existing `VALID_TRANSITIONS` map) | EspoCRM: update pipeline stage |
| `booking.edited` | Same PATCH route, alongside the existing `booking_edit_audit_log` insert | EspoCRM: update Order/Opportunity fields |
| `lead.created` | `inquiries` insert (contact/corporate/multi-day forms) | Chatwoot: nothing (leads don't have a conversation yet); EspoCRM: create Lead |
| `customer.signed_up` | Supabase Auth `on_auth_user_created`-adjacent app code, or `customer_profiles` insert path (Phase 57's existing insert-own-row flow) | EspoCRM: create/update Contact |

### Request Flow — booking paid → CRM

```
Stripe payment_intent.succeeded
    ↓
app/api/webhooks/stripe (EXISTING — unchanged, still writes `bookings` first, claims `stripe_processed_events` after)
    ↓ (new call, same request, after booking confirmed)
lib/outbox.ts enqueueOutboxEvent('booking.paid', bookingRow)
    ↓ INSERT integration_outbox (status=pending) + after(() => qstash.publishJSON(...))
    ↓
QStash → app/api/integrations/dispatch (verifies QStash signature header)
    ↓
lib/identity.ts resolveIdentity(email, phone) ──► crm_identity_map lookup/create
    ↓
lib/espocrm-client.ts upsert Opportunity/Order on matched Contact/Account
    ↓
UPDATE integration_outbox SET status='sent', sent_at=now() WHERE id = ... (claim AFTER side effect)
```

### Request Flow — Chatwoot conversation → EspoCRM

```
Customer messages via WhatsApp/widget/email → Chatwoot conversation created/updated
    ↓
Chatwoot fires outgoing webhook (X-Chatwoot-Signature: sha256=HMAC(webhook_secret, "{timestamp}.{raw_body}"))
    ↓
app/api/webhooks/chatwoot (verifies signature over the RAW body — same "read .text() not .json() first" discipline as the Stripe route)
    ↓
lib/identity.ts resolveIdentity(contact.email, contact.phone_number)
    ↓
lib/espocrm-client.ts create/update Contact + Lead (or append conversation summary to existing Contact history)
```

### Request Flow — Dashboard App (agent viewing a customer's bookings inside Chatwoot)

```
Agent opens a conversation in Chatwoot → Chatwoot renders the Dashboard App iframe
  src = https://rideprestigo.com/embed/chatwoot-dashboard   (STATIC url, no templated contact_id in the URL)
    ↓
Our page loads (no admin session cookie; frame-ancestors CSP restricts embedding to the Chatwoot origin)
    ↓
Our page: window.parent.postMessage('chatwoot-dashboard-app:fetch-info', '*')
    ↓
Chatwoot's own JS (already authenticated as the agent) responds via `message` event with
  { conversation, contact: { email, phone_number, id } }
    ↓ (only happens if we are genuinely embedded by an authenticated Chatwoot session —
    ↓  a direct top-level visit to the URL never receives this response)
Our page: fetch('/api/chatwoot/dashboard-app', { method: 'POST', body: { email, phone } })
    ↓
app/api/chatwoot/dashboard-app: looks up bookings by normalized email/phone via a read-only
  RPC (booking summaries only — reference, status, pickup date, vehicle class; NOT payment_intent_id,
  NOT full address, NOT admin notes)
    ↓
Renders a small booking-history list inside the iframe
```

## Anti-Patterns

### Anti-Pattern 1: Admin session cookie (or any cookie-based session) inside the Dashboard App iframe

**What people do:** Reuse the existing admin auth (`getAdminUser()` / Supabase GoTrue cookie) to gate the embed page, since it is conceptually "an admin tool."
**Why it's wrong:** The iframe runs inside Chatwoot's origin context in the agent's browser. A cookie-based session tied to `rideprestigo.com` may or may not be sent depending on `SameSite` policy and whether the agent is also separately logged into the admin panel in the same browser — this is fragile and, worse, couples an unrelated third-party surface (Chatwoot) to the admin session's blast radius (a leaked Dashboard App URL becomes a way to probe admin-cookie state). It also violates the explicit locked constraint in the milestone context.
**Instead:** No cookie-based identity at all on this route. Identity comes from the Chatwoot `postMessage` handshake (see Pattern above) plus a narrow, read-only, booking-summary-only backend query. `frame-ancestors` is the load-bearing access control, not a session.

### Anti-Pattern 2: Treating Chatwoot webhooks as unauthenticated

**What people do:** Assume (as this milestone's initial framing did) that Chatwoot webhooks carry no signature, and gate the receiver on a secret query-string token alone.
**Why it's wrong:** Verified via Chatwoot's developer docs (MEDIUM confidence — the docs describe current behavior; confirm the specific self-hosted version pinned in the VPS docker-compose actually emits `X-Chatwoot-Signature`, since this is a comparatively recent addition): Chatwoot DOES sign outgoing webhooks — `X-Chatwoot-Signature: sha256=HMAC-SHA256(webhook_secret, "{X-Chatwoot-Timestamp}.{raw_body}")`. Skipping HMAC verification and relying on a static URL token is weaker (a leaked/logged URL is a permanent bypass; a leaked webhook secret is rotatable and time-boxed via the timestamp check).
**Instead:** Verify `X-Chatwoot-Signature` over the raw request body (read via `request.text()`, mirroring the Stripe route's `.text()` discipline — never `.json()` first). Reject requests where the `X-Chatwoot-Timestamp` is more than ~5 minutes old (replay protection). Keep an IP allowlist (the VPS's static egress IP) as defense-in-depth, not as the primary control, since it's the weaker signal. Apply the identical pattern to the EspoCRM receiver (`X-Signature` header, per EspoCRM's webhook docs).

### Anti-Pattern 3: Loading the Chatwoot widget script unconditionally on every page

**What people do:** Drop the Chatwoot widget `<script>` snippet into the root layout like a typical SaaS embed.
**Why it's wrong:** Violates the existing consent architecture (`components/CookieBanner.tsx`'s `prestigo_consent_v2` per-category model) and would set third-party cookies before consent — the same class of problem `MetaPixel.tsx` already solves by listening for `prestigo:consent-granted`. It's also an unconditional new `connect-src`/`frame-src`/`script-src`/`img-src` CSP surface added to every route, whereas the widget is only needed where a chat entry point makes sense.
**Instead:** Extend `ConsentState` with a `support` (or reuse `marketing`, phase-planning decision) category, mount the widget loader component the same way `MetaPixel.tsx` does — listen for the consent CustomEvent, inject the script only then. Add the VPS's Chatwoot subdomain to `middleware.ts`'s CSP builder (`script-src`, `connect-src` incl. `wss://` for the widget's websocket, `frame-src` if the widget itself opens an iframe, `img-src` for avatars) and to `scripts/qa/baselines/csp_baseline.json` in the same change (per the existing hard rule).

### Anti-Pattern 4: Reusing `quote_leads` for the new `inquiries` table

**What people do:** Since a similar-sounding table already exists (`quote_leads`, migration 038), extend it for contact/corporate/multi-day form submissions.
**Why it's wrong:** `quote_leads` has purpose-built, incompatible semantics — a 30-day GDPR retention window enforced by `app/api/cron/purge-quote-leads` and a deny-all RLS posture tuned for ephemeral calculator captures. CRM-bound inquiries need to persist indefinitely (they become EspoCRM Leads and stay linked via `crm_identity_map`).
**Instead:** New `inquiries` table (migration 065), no purge cron, same "service-role only, no public RLS" posture as `booking_edit_audit_log`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Chatwoot (self-hosted, VPS) | REST API (outbound, `lib/chatwoot-client.ts`) + outgoing webhooks (inbound, HMAC-verified) + Dashboard App (iframe embed of our page) + website widget (script embed, consent-gated, identity-validated via `identifier_hash`) | Auth for our→Chatwoot calls: Chatwoot API access token (agent-bot or platform app token), stored as a VPS-and-Vercel-shared env var, never committed |
| EspoCRM (self-hosted, VPS) | REST API (outbound, `lib/espocrm-client.ts`) via an API User with API Key or HMAC auth (HMAC recommended per EspoCRM docs — "most secure method") + optional outgoing webhooks (inbound, `X-Signature` HMAC-verified, off by default for v4.0 core scope) | API User must be scoped (Roles/ACL) to only the entities it needs (Contact, Account, Lead, Opportunity) — least privilege |
| QStash (Upstash) | Already integrated (`lib/qstash.ts`). Reuse the same client for immediate (`delay: 0`) dispatch publishes, distinct target URL (`/api/integrations/dispatch`) | QStash signs its own callbacks (`Upstash-Signature`) — verify in the dispatch route the same way reminder routes presumably already do; check `app/api/cron/reminder-2h/route.ts` for the existing verification helper and reuse it rather than re-implementing |
| WhatsApp Cloud API | Configured inside Chatwoot (existing +420 number) — no direct site-side integration; the site only ever talks to Chatwoot, never to WhatsApp Cloud API directly | Out of the site's integration surface entirely |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Booking write paths (Stripe webhook, admin PATCH, submit-quote) ↔ outbox | Direct function call to `lib/outbox.ts`, same request/transaction | Must NOT block the response — `after()` for the QStash publish, but the outbox row INSERT itself should be synchronous (durability first, dispatch is fire-and-forget) |
| Outbox ↔ Chatwoot/EspoCRM clients | QStash-mediated, async, at-least-once | Dispatcher is the ONLY code path allowed to call `lib/chatwoot-client.ts` / `lib/espocrm-client.ts` for outbound writes — keeps retry/idempotency logic in one place |
| Chatwoot/EspoCRM webhooks ↔ Supabase | Inbound HTTP → `lib/identity.ts` → direct Supabase writes (`crm_identity_map`, and — per the locked decision — NEVER `bookings` or `customer_profiles`, since Supabase is the one-way source of truth for those) | Enforce structurally: the webhook receivers must not import `lib/supabase.ts`'s booking-write functions (`saveBooking`, `buildBookingRow`, etc.) — same "isolation by omission" pattern already used for the driver trip-progress route (DTRIP-04) to keep it from touching `booking.status`/GNet |
| Dashboard App page ↔ Supabase | Read-only RPC returning a narrow booking-summary projection, no admin client exposed to the browser | New Postgres function (e.g. `chatwoot_dashboard_bookings(p_email text, p_phone text)`) called via the service-role client from the API route only — never a client-side Supabase call |

## Sources

- [How to use webhooks? — Chatwoot User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks) (MEDIUM — official docs, version not pinned to the VPS deployment target)
- [HMAC Verification and Identity Validation — DeepWiki chatwoot/chatwoot](https://deepwiki.com/chatwoot/chatwoot/11.4-hmac-verification-and-identity-validation) (MEDIUM — third-party code-derived doc, cross-checked against Chatwoot's own webhook signature description)
- [How to enable identity validation in Chatwoot? — Chatwoot User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677587479-how-to-enable-identity-validation-in-chatwoot) (MEDIUM)
- [How to use Dashboard Apps? — Chatwoot User Guide](https://www.chatwoot.com/hc/user-guide/articles/1677691702-how-to-use-dashboard-apps) (MEDIUM)
- [Securing Dashboard Apps? — chatwoot/chatwoot Discussion #5878](https://github.com/orgs/chatwoot/discussions/5878) (LOW — community discussion, corroborates the postMessage-only trust model, not an authoritative spec)
- [Webhooks — EspoCRM Documentation](https://docs.espocrm.com/administration/webhooks/) (MEDIUM — official docs)
- [API overview — EspoCRM Documentation](https://docs.espocrm.com/development/api/) (MEDIUM — official docs)
- Codebase: `app/api/webhooks/stripe/route.ts`, `lib/qstash.ts`, `lib/rate-limit.ts`, `middleware.ts`, `lib/supabase/server.ts`, `components/CookieBanner.tsx`, `components/MetaPixel.tsx`, `supabase/migrations/038_quote_leads.sql`, `supabase/migrations/044_customer_profiles.sql`, `supabase/migrations/055_booking_edit_audit_log.sql` (HIGH — read directly from the `main` branch, 2026-09-27)

---
*Architecture research for: v4.0 Helpdesk + CRM integration layer*
*Researched: 2026-09-27*
