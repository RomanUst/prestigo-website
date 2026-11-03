# Phase 84: Chatwoot Dashboard App - Research

**Researched:** 2026-10-26
**Domain:** Chatwoot Dashboard App (iframe + postMessage), operator-token verification against Chatwoot, narrow CSP/frame-ancestors embed route in Next.js 16, read-only Supabase projection, config-as-code registration
**Confidence:** HIGH on Chatwoot mechanics and repo seams (read from v4.18.0 source and the repo this session); MEDIUM on browser behaviour (clipboard in a cross-origin iframe, storage sharing); the CVE-2025-12245 gate is a FINDING that changes the gate (see Summary and Open Questions 1-2)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (locked in earlier phases - do not re-decide)**
- Supabase is the single source of truth for `bookings` / `customer_profiles`; Chatwoot/CRM never write them (PROJECT.md v4.0, REQUIREMENTS Out of Scope).
- Identity: normalized email = same person; E.164 phone merges only when not shared; shared phones never merge; links live in `contact_identities` + `identity_emails` / `identity_phones` (82 D-04..D-06).
- Chatwoot contact attributes already carry next trip, counters, total spent and `admin_bookings_url = /admin/bookings?search=<email>` (82 D-02, `lib/chatwoot-mapping.ts`). Full per-booking history was explicitly left to this phase.
- Chatwoot is pinned at `chatwoot/chatwoot:v4.18.0-ce` (`infra/vps/chatwoot/compose.yml`). Per `.planning/research/PITFALLS.md` Pitfall 16, CVE-2025-12245 affects Chatwoot <= 4.7.0 - research must confirm the fix against the advisory/changelog and record the evidence; it is a PANEL-02 gate, not an assumption.
- `app/embed/` (or equivalent) route outside `app/[locale]/`, no next-intl, own narrow CSP with `frame-ancestors https://chat.rideprestigo.com` (research ARCHITECTURE.md). Middleware matcher rules from CLAUDE.md still apply.
- Security work -> run tests, commit with `security:` prefix (CLAUDE.md).

**Operator verification (PANEL-02)**
- **D-01:** The panel API authenticates the operator with the operator's **personal Chatwoot access token** (from their Chatwoot profile). The server validates it against the Chatwoot API and requires that this agent can access the requested conversation. No admin session cookie, no shared secret in the iframe URL, no separate panel login. Removing an agent in Chatwoot revokes panel access immediately. - **Reversibility:** costly - the token handshake, API contract and runbook are built around Chatwoot-issued identity.
- **D-02:** The token is pasted once per browser into the panel and kept in the iframe's `localStorage` (partitioned storage is acceptable; re-paste if it is lost). It travels only as a request header to our own API. The server never persists it; at most a short-lived cache of the validation result keyed by a hash of the token.
- **D-03:** The iframe sends only the **conversation id** (from Chatwoot's `postMessage` context, after `event.origin` is checked against the exact Chatwoot origin). The server fetches the conversation from the Chatwoot API with the operator's token and takes the contact's email/phone from that response. Contact data from `postMessage` is never trusted for the lookup, so the API cannot be used to look up bookings by an arbitrary email.
- **D-04:** Any Chatwoot agent who can access the conversation sees its bookings. Panel permissions mirror Chatwoot permissions: no admin-only gate, no env allowlist. A 2nd operator works without extra setup.

**What the panel shows (PANEL-01)**
- **D-05:** Layout: header with counters (total trips, total spent EUR); an "Upcoming" block with **all** future bookings, nearest first; a "Past" block with the **10 most recent**, newest first, then a "more" control or a link to `/admin`.
- **D-06:** Each booking card shows date/time, route, reference, booking status, payment status, link into `/admin`, **plus** vehicle class, passengers/luggage, amount in EUR, assigned driver and driver trip progress (Phase 67 status), flight number and customer notes/special requests. Showing amounts is fine: this is an internal operator tool, and the marketing "no prices" rule does not apply. Amounts still come from booking data, not typed constants (pre-commit `€` guard).
- **D-07:** Panel UI is English and matches the `/admin` visual language and status vocabulary. Plain internal tool, no next-intl. Readable in Chatwoot's light and dark themes and at a narrow sidebar width (~320-400 px).
- **D-08:** Empty state (no bookings): "No bookings", the email/phone that was searched, and plain links: "Create booking in admin" (`/admin`) and the open EspoCRM Lead if one exists. Links only; the panel performs no writes.

**Payment link**
- **D-09:** For an unpaid booking that already has a Stripe payment link, show it with a **Copy** button so the operator can paste it into the reply. Creating a new payment link stays in `/admin` (reached by a link). The panel stays strictly read-only. This partially closes the 77 D-19 "one-click link from Chatwoot" item; generating links from the panel is deferred.

**Whose bookings**
- **D-10:** Matching goes through the Phase 82 identity tables: the Chatwoot contact's email/phone -> identity -> bookings across all linked emails/phones, using the same merge rules (shared phones never count). The panel sees what the sync sees after any split or merge.
- **D-11:** Only bookings where the contact's email/phone is the **booker** (the same field sync and erasure key on). Passenger-name/phone matching is not used. An agency writing in sees its bookings; a passenger of an agency booking does not see that trip.
- **D-12:** A contact with no email and no phone (e.g. Telegram name only) shows a hint: "Add an email or phone to this contact in Chatwoot to see bookings". The panel refreshes after the operator adds one. No name search and no manual search box: the panel is not a general booking search for any agent.

### Claude's Discretion
- Exact route paths (`app/embed/chatwoot-dashboard`, `app/api/chatwoot/dashboard-app` or similar), handshake message flow (`chatwoot-dashboard-app:fetch-info`, re-fetch on conversation switch), and request shape.
- Which Chatwoot API endpoints prove agent identity and conversation access (`/api/v1/profile`, conversation GET) and how the CE v4.18 permission model maps to "can access the conversation".
- Validation cache TTL and storage, rate limiting per token/IP (existing Upstash limiter pattern), and response headers (`Cache-Control: no-store`, `Referrer-Policy`, CSP with `frame-ancestors`).
- Read-only data access: a narrow RPC or projection query via the service-role client on the server only; structural guard test that the panel modules cannot import booking/profile write helpers (like the 83 D-17 guard).
- Token-entry UX (where the operator finds the token, error states for an invalid or revoked token), loading and error states, and the "more" behaviour for past trips.
- Admin link targets (`/admin/bookings?search=<reference or email>`; there is no booking detail page).
- Registering the Dashboard App in Chatwoot via the existing `infra/chatwoot` config-as-code (`sync.mjs`) vs a runbook step; how CVE-2025-12245 patch evidence is recorded (runbook/verification).

### Deferred Ideas (OUT OF SCOPE)
- **Generate a payment link from the panel** (write via Stripe from Chatwoot): would require rewriting PANEL-02's read-only rule. Candidate backlog item; remainder of 77 D-19.
- **Manual booking search in the panel** (by email/phone/reference): rejected for now, since it would turn the panel into a booking search for any agent.
- **Passenger-based matching** for agency bookings: not used (D-11).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PANEL-01 | Inside a Chatwoot conversation the operator sees the customer's bookings from the site (upcoming + past, status, payment, link into /admin) in the sidebar | Dashboard App protocol verified from Chatwoot v4.18.0 source (handshake, payload, remount on conversation switch); new read-only RPC `panel_bookings` over `booking_identity` (migration 080); card fields mapped to `bookings` columns; status vocabulary quoted from `BookingsTable.tsx`; registration via a new `dashboardApps` resource in `infra/chatwoot/sync.mjs` |
| PANEL-02 | Panel is read-only, renders only when embedded in Prestigo's Chatwoot (frame-ancestors + origin-validated postMessage), never uses the admin session cookie, and runs on a Chatwoot version patched for CVE-2025-12245 | Operator-token verification via `GET /api/v1/profile` + `GET /conversations/{id}` (permission model read from `ConversationPolicy`); embed CSP + middleware carve-out; cookie-stripping middleware branch; structural read-only/no-cookie guard test; **CVE gate FINDING: no released Chatwoot version fixes CVE-2025-12245 and the CVE is in the website widget SDK, not Dashboard Apps - the literal "patched version" criterion cannot be met; see Open Questions 1** |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Type check `npx tsc --noEmit` (baseline: 8 old errors in `tests/` only); lint `npx eslint --quiet <files>` (baseline: `<a>`->`<Link>` errors in both `not-found.tsx`); tests `npx vitest run [files]` (full ~90s; `vitest related` crashes - grep `tests/` instead); full gate = the `verify` skill; dev server via `preview_start` name `prestigo`, never `npm run dev` in Bash.
- No hard-coded `€` prices in `app/` or `components/` (pre-commit `grep -rEl '€[0-9]{2,}'`); amounts must be rendered from data (use the ISO code "EUR" or `Intl.NumberFormat(..., { currency: 'EUR' })`, never a typed literal).
- No secrets / `.env*` in commits; never read `.env.local`.
- `middleware.ts` matcher must exclude every static/metadata extension; the extension exclusion must NOT apply under `api/ admin/ driver/ auth/ account/` (T-74-07) - the new `embed/` prefix belongs in that protected group.
- next-intl sets `NEXT_LOCALE` on every response; its presence is not a user choice.
- Security work (auth, CSRF, validation, rate limits): run tests, commit with `security:` prefix.
- Vercel Preview deploys always fail (missing Supabase env); merge to `main` = production deploy.
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil` (not touched by this phase).
- Marketing no-prices rule does not apply to this internal tool (D-06), but the `€` pre-commit guard still does.

## Summary

The Dashboard App mechanism in the pinned Chatwoot (v4.18.0-ce) is small and fully readable. A Dashboard App is an account-level row `{title, content:[{type:'frame', url}]}`; Chatwoot renders one `<iframe src=url>` per conversation tab, keyed by `currentChat.id + '-' + dashboardApp.id`, so **every conversation switch creates a brand-new iframe (a full page reload of our embed)**. The iframe asks for context with the string `chatwoot-dashboard-app:fetch-info`; Chatwoot checks `event.source === iframe.contentWindow` and replies with `JSON.stringify({event:'appContext', data:{conversation, contact, currentAgent, customAttributes, theme}})` posted to target origin `'*'`. Because our listener may attach after Chatwoot's one-shot `load` push, the fetch-info request after mount (with retry, since Chatwoot only answers while the tab is visible) is mandatory. Dashboard Apps can be created by an administrator through `POST /api/v1/accounts/{id}/dashboard_apps` with `{dashboard_app:{title, content:[{type:'frame', url}]}}`, so `infra/chatwoot/sync.mjs` can own the registration.

Operator verification (D-01..D-04) maps cleanly onto Chatwoot's own authorization: `GET /api/v1/profile` proves the token belongs to a human `User` (an AgentBot token is rejected on that endpoint) and `GET /api/v1/accounts/{id}/conversations/{displayId}` is authorized by `ConversationPolicy#show?` = `administrator? || agent_bot? || inbox_access? || team_access?`; an unauthorized agent gets **401** (`Pundit::NotAuthorizedError` -> `render_unauthorized`), a missing conversation **404**. The conversation payload carries `meta.sender.{id,email,phone_number,identifier,custom_attributes}` and `meta.hmac_verified` (and also the latest message body, which the server must never forward). The existing Chatwoot proxy drops underscore headers, so the server must send `api-access-token` (hyphenated).

**CVE-2025-12245 finding (changes the gate).** The CVE is in the **website widget SDK** (`app/javascript/sdk/IFrameHelper.js`, `initPostMessageCommunication`, `popoutChatWindow` with attacker-controlled `baseUrl`) - it is not part of the Dashboard App code path (`DashboardApp/Frame.vue` checks `event.source`). More importantly, **no Chatwoot release contains a fix**: the GitHub advisory GHSA-hgg8-54gw-8v33 lists no patched version ("vendor ... did not respond"), the vulnerable function is byte-identical in v4.7.0 vs v4.18.0 (apart from a date-fns import change), and identical again in v4.19.1 (released 2026-10-24) and `develop`. "<= 4.7.0" in the NVD/OSV record is only the last version the reporter tested. So PANEL-02's "runs on a Chatwoot version confirmed patched" cannot be satisfied by pinning or upgrading. The honest gate is: (a) record the scope + evidence, (b) show Dashboard Apps are not on the vulnerable path, (c) add a compensating control where the exposure actually is - Prestigo's own widget loader on `rideprestigo.com` (the SDK runs in the host page) - and (d) get the user's explicit decision to re-word the gate. The pinned v4.18.0 is, however, above the patched version of every repo-published Chatwoot advisory (4.13.0, 4.11.2, 4.9.0, 3.16.0).

**Second finding (changes D-02's premise).** The iframe origin `https://rideprestigo.com` and its top-level embedder `https://chat.rideprestigo.com` share a registrable domain, so they are same-site. Browser storage partitioning is keyed by top-level *site*, therefore the iframe's `localStorage` is **not partitioned** from `localStorage` of the public marketing pages on the same origin (which run GTM/GA/Meta Pixel/Clarity under `unsafe-inline`). A Chatwoot personal token in that `localStorage` is readable by any script on `rideprestigo.com`. The panel must not store a full-power agent token there without a conscious decision (Open Questions 2).

**Primary recommendation:** Build `POST /api/chatwoot/dashboard-app` (Bearer = operator Chatwoot token, body = `{conversationId}`), verify via cached `/profile` + uncached conversation GET, resolve the booker through a new read-only SECURITY DEFINER RPC `panel_bookings(p_email, p_phone)` (migration 080), serve the UI from a cookie-less `app/embed/chatwoot-dashboard` route group with its own root layout, a dedicated nonce CSP carrying `frame-ancestors https://chat.rideprestigo.com`, a middleware branch that skips next-intl and `updateSession` and strips the `cookie` request header, and register the app through `sync.mjs`. Take Open Questions 1 and 2 to the user before the plan is frozen.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Show bookings panel in Chatwoot sidebar | Browser / Client (iframe, client component) | Frontend Server (embed layout/page shell + CSP) | Chatwoot hosts the iframe; the page is a thin shell, all data arrives over fetch |
| postMessage handshake + origin check | Browser / Client | - | `event.origin`/`event.source` can only be checked in the receiving window; Chatwoot origin passed in as a prop by the server shell |
| Frame-embedding restriction (`frame-ancestors`) | Frontend Server (middleware CSP header) | CDN / Static (n/a) | A response header decided per request in `middleware.ts`; `next.config.ts` `X-Frame-Options: DENY` must not apply to `/embed` |
| Operator identity + conversation access | API / Backend (route handler -> Chatwoot REST) | - | Chatwoot is the identity provider; server calls `/profile` and `/conversations/{id}` with the operator's token |
| Booker -> identity -> bookings lookup | Database / Storage (SECURITY DEFINER RPC) | API / Backend (DTO mapping, payment-state derivation, classification) | Identity rules (shared phones, erasing, abandoned) already live in SQL; reuse them, do not reimplement in TS |
| Rate limiting | API / Backend (`lib/rate-limit.ts`, Upstash) | - | Existing per-IP sliding window, fail-closed variant |
| Token persistence | Browser / Client (storage choice - Open Question 2) | - | Server never persists; only a hashed, in-memory TTL cache |
| App registration in Chatwoot | Tooling (`infra/chatwoot/sync.mjs`, run from workstation) | - | Config-as-code (D-18); admin-only API |
| Read-only structural enforcement | Test layer (vitest guard) | - | Same pattern as the 83 D-17 / 76 isolation guards |

## Standard Stack

### Core
No new runtime dependencies. Everything needed is already in the repo.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.3 | embed route group, route handler, middleware | [VERIFIED: package.json:34] already the app framework |
| react | 19.2.3 | embed client component | [VERIFIED: package.json:37] |
| zod | ^4.3.6 | request-body and Chatwoot-response shape validation | [VERIFIED: package.json:48]; repo's validation standard |
| @supabase/supabase-js | ^2.101.0 | service-role RPC call (server only) | [VERIFIED: package.json:25]; `createSupabaseServiceClient` from `@/lib/supabase` |
| node:crypto | built-in | sha256 of the token for the cache key | no dependency |
| vitest + jsdom + @testing-library/react | 4.1.x / 29 / 16 | tests | [VERIFIED: package.json, vitest 4.1.5 installed] |

### Supporting (in-repo modules to reuse)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/chatwoot-client.ts` | exports `CHATWOOT_AUTH_HEADER = 'api-access-token'`, `SiteChatwootError`, `classifyChatwootError` | reuse the header constant and error class; do NOT reuse `loadSiteChatwootConfig` (it requires the site `CHATWOOT_API_TOKEN`, which the panel must never need) |
| `lib/rate-limit.ts` | `checkRateLimit(pathname, ip, { failClosed: true })`, `getClientIp` | add a `LIMITS` entry for the panel route |
| `lib/request-guards.ts` | `enforceMaxBody`, safe string helpers | first step of the route handler |
| `lib/env.ts` | `readEnv()` (strips trailing `\n`) | read `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `ESPOCRM_BASE_URL` |
| `lib/lead-mapping.ts` `bookingLeadAmountEur` | EUR amount with round-trip CZK fallback | same amount rule as the `lifetime_value` sync attribute |
| `lib/prague-date.ts` | Europe/Prague helpers | upcoming/past boundary if classified in TS |
| `components/admin/StatusBadge.tsx` variants + `STATUS_LABELS` / `vehicleClassMap` | status vocabulary | mirror, do not import the client component with hard-coded dark colors (see Pitfall 8) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Operator personal token (D-01, locked) | Chatwoot-signed context | Chatwoot v4.18 has no signed Dashboard-App context [VERIFIED: Frame.vue sends plain JSON]; locked decision stands |
| New RPC `panel_bookings` | `identity_person()` + client-side filtering | `identity_person` returns `crm_booking()` which lacks `luggage`, `special_requests`, `payment_link_url`, `paid_at`, trip progress; extending it would change the CRM/chat contract. A new narrow RPC keeps blast radius small |
| In-memory token-hash cache | Upstash cache | Serverless instances do not share memory, but the cache only saves one `/profile` call; Redis adds a token-derived key to a third system. Keep in-memory |
| `localStorage` (D-02) | `sessionStorage`, or a dedicated `panel.` origin | See Open Questions 2 |

**Installation:** none (`npm install` not needed). **Version verification:** all versions read from `package.json` this session; no package is added.

## Package Legitimacy Audit

No external packages are installed by this phase, so no `package-legitimacy check` was required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Operator browser (Chatwoot SPA at https://chat.rideprestigo.com)
 |  opens conversation C, clicks the "Bookings" tab
 v
Chatwoot DashboardApp/Frame.vue mounts <iframe key="C-<appId>" src="https://rideprestigo.com/embed/chatwoot-dashboard">
 |                                                             (new iframe on EVERY conversation switch)
 v
[Vercel] middleware.ts
 |  /embed/*: skip checkCsrf (GET), skip next-intl, skip updateSession,
 |  strip `cookie` request header, set nonce CSP incl. frame-ancestors https://chat.rideprestigo.com
 v
app/embed/layout.tsx (own <html><body>, no SiteChrome/analytics/cookie banner/chat launcher)
 -> app/embed/chatwoot-dashboard/page.tsx  (server shell: reads CHATWOOT_BASE_URL -> chatwootOrigin prop)
 -> <PanelClient chatwootOrigin>  (client)
      |  not framed (window.parent === window) or origin unconfigured -> inert "Open from Chatwoot" state, NO listeners
      |  addEventListener('message'): accept only e.origin === chatwootOrigin && e.source === window.parent
      |  window.parent.postMessage('chatwoot-dashboard-app:fetch-info', chatwootOrigin)   (retry ~1s x5)
      |<--- JSON {event:'appContext', data:{conversation:{id}, contact, currentAgent, theme}}   (only conversation.id + theme used)
      |  token = storage (Open Q2) ; none -> token-entry state
      v
POST https://rideprestigo.com/api/chatwoot/dashboard-app   Authorization: Bearer <operator token>   body {conversationId}
 |
 v
route handler:  enforceMaxBody -> checkRateLimit(failClosed) -> zod body (400) -> verifyOperator
 |   verifyOperator (server -> https://chat.rideprestigo.com, header `api-access-token`, redirect:error, timeout):
 |     1. GET /api/v1/profile                      (cached 5 min by sha256(token); AgentBot -> 401; non-account-member -> no access)
 |     2. GET /api/v1/accounts/{ACCOUNT}/conversations/{id}   (never cached: this is the live permission + fresh contact)
 |         200 -> take ONLY meta.sender.{email,phone_number,identifier,custom_attributes.crm?}, meta.hmac_verified
 |         401 (profile ok) -> no_access ; 404 -> not_found ; network/5xx -> 502
 |   panel_bookings(p_email, p_phone) via createSupabaseServiceClient  (read-only SECURITY DEFINER RPC, migration 080)
 |   chat_conversations.espo_lead_id (by conversation id) for the Lead link (inside the same RPC or a second read-only RPC)
 v
JSON DTO (allowlisted fields, Cache-Control: no-store) -> client renders counters, Upcoming (all), Past (10), cards, Copy button, links
 re-fetch: window focus / visibilitychange / 30 s while visible / Refresh button (server re-reads the contact, so a newly added email appears)
```

### Recommended Project Structure
```
app/embed/
  layout.tsx                        # own root layout: <html lang="en"><body>, system font stack, panel.css, noindex metadata
  chatwoot-dashboard/page.tsx       # server shell, force-dynamic, reads origin env, renders <PanelClient>
  chatwoot-dashboard/PanelClient.tsx  # 'use client': handshake, token entry, fetch, render
  chatwoot-dashboard/panel.css      # theme-aware CSS variables (data-theme light/dark), 320-400 px layout
app/api/chatwoot/dashboard-app/route.ts   # POST only
lib/chatwoot-operator.ts            # panel Chatwoot client: loadPanelChatwootConfig (BASE_URL+ACCOUNT_ID only), verifyOperator, token-hash cache
lib/panel-bookings.ts               # RPC call + DTO mapping + payment-state + upcoming/past split (no write helpers imported)
lib/panel-links.ts                  # admin / Espo link builders (pure)
supabase/migrations/080_panel_bookings.sql   # read-only RPC(s) + REVOKE/GRANT
supabase/migrations/080-smoke.sql   # (phase convention: NN-smoke.sql under the phase dir)
infra/chatwoot/dashboard-apps.json  # [{title:'Bookings', content:[{type:'frame', url:'https://rideprestigo.com/embed/chatwoot-dashboard'}]}]
infra/chatwoot/sync.mjs             # + 'dashboardApps' resource
infra/vps/runbooks/chatwoot-dashboard-app.md  # operator token how-to, registration, CVE evidence, rotation/revocation, UAT
tests/ (see Validation Architecture)
```

### Pattern 1: Verified Dashboard App handshake (client side)
**What:** Request context explicitly, accept only the exact parent, validate shape, use only `conversation.id` and `theme`.
**When to use:** the whole embed client.
**Example:**
```typescript
// Protocol verified against chatwoot/chatwoot@v4.18.0 app/javascript/dashboard/components/widgets/DashboardApp/Frame.vue
// (FETCH_INFO_MESSAGE = 'chatwoot-dashboard-app:fetch-info'; reply = JSON.stringify({ event: 'appContext', data }), target '*')
const FETCH_INFO = 'chatwoot-dashboard-app:fetch-info'

function parseAppContext(raw: unknown): { conversationId: number; theme: 'light' | 'dark' } | null {
  if (typeof raw !== 'string') return null
  let msg: unknown
  try { msg = JSON.parse(raw) } catch { return null }
  const m = msg as { event?: unknown; data?: { conversation?: { id?: unknown }; theme?: unknown } }
  if (m?.event !== 'appContext') return null
  const id = m.data?.conversation?.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  return { conversationId: id, theme: m.data?.theme === 'dark' ? 'dark' : 'light' }
}

useEffect(() => {
  if (window.parent === window) return            // not framed: stay inert
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== chatwootOrigin) return        // exact origin from the server shell
    if (e.source !== window.parent) return
    const ctx = parseAppContext(e.data)
    if (ctx) setContext(ctx)
  }
  window.addEventListener('message', onMessage)
  // Chatwoot answers only while the tab is visible, and its one-shot 'load' push can precede hydration -> retry.
  let tries = 0
  const t = setInterval(() => {
    if (gotContextRef.current || ++tries > 5) return clearInterval(t)
    window.parent.postMessage(FETCH_INFO, chatwootOrigin)   // explicit target origin, never '*'
  }, 1000)
  window.parent.postMessage(FETCH_INFO, chatwootOrigin)
  return () => { window.removeEventListener('message', onMessage); clearInterval(t) }
}, [chatwootOrigin])
```

### Pattern 2: Operator verification (server)
**What:** Two Chatwoot calls with the operator's token; typed failure outcomes; no body/header/token ever in error text (mirror `SiteChatwootError`).
```typescript
// Facts (all [VERIFIED: chatwoot@v4.18.0 source]):
//  GET /api/v1/profile  -> Api::V1::ProfilesController < Api::BaseController ; validate_bot_access_token! rejects an AgentBot (401)
//  GET /api/v1/accounts/:account_id/conversations/:id -> find_by!(display_id: params[:id]); authorize :show?
//  ConversationPolicy#show? = administrator? || agent_bot? || agent_can_view_conversation?  (inbox_access? || team_access?)
//  Pundit::NotAuthorizedError -> 401 'You are not authorized to do this action'; RecordNotFound -> 404
// Contract of verifyOperator(token, conversationId):
//   { ok: true, agentId, contact: { email, phone, identifier, hmacVerified, chatwootContactId } }
//   | { ok: false, reason: 'invalid_token' | 'no_access' | 'not_found' | 'unavailable' | 'not_configured' }
// Rules: profile result cached by sha256(token) for <= 5 min (positive only, max ~500 entries);
//        conversation GET never cached; on conversation 401 with a CACHED profile, re-run /profile uncached once
//        to tell 'revoked token' (-> invalid_token) from 'no access to this conversation' (-> no_access).
//        Require profile.accounts[].id includes CHATWOOT_ACCOUNT_ID; never forward profile.access_token / pubsub_token.
```

### Pattern 3: Embed middleware carve-out
**What:** `/embed` is a fourth non-localized prefix with its own branch that never touches next-intl or Supabase session refresh.
**Facts from `middleware.ts`:** `NON_LOCALIZED_PREFIXES = ['/admin', '/api', '/auth', '/driver']` (line 195); `isDynamicPath` (line 127) routes `/admin /api /driver /book ...` into `updateSession` (Supabase cookie session); the nonce CSP is used only for raw `/admin` and `/driver` (line 252); the matcher's protected group is `(?:api|admin|driver|auth)/|(?:[a-z]{2}/)?account/` (line 330).
**Required edits:**
1. Add `'/embed'` to `NON_LOCALIZED_PREFIXES` - without it next-intl rewrites `/embed/...` to `/en/embed/...` -> 404.
2. In `middleware()` handle `/embed` before `runCspAndAuthChain`: build `buildCspEmbed(nonce)`, set `Content-Security-Policy` AND `x-nonce` on the *request* headers (Next applies the nonce to framework scripts from the request header, as for `/admin`), **delete the `cookie` request header** so nothing downstream can read the admin session, call `NextResponse.next({ request: { headers } })`, set the CSP + `Cache-Control: no-store` + `Referrer-Policy: no-referrer` on the response. No `updateSession`, no Supabase round-trip, no `Set-Cookie`.
3. Do the same cookie-strip + skip-`updateSession` for `/api/chatwoot/dashboard-app` (a same-site iframe sends the admin's `SameSite=Lax` cookies on every request; the route must be structurally unable to see them).
4. Matcher: add `embed` to the protected group: `(?!(?:api|admin|driver|auth|embed)/|...)` so `/embed/x.xml` still enters middleware; add cases to `tests/middleware-matcher.test.ts`.
5. `CSRF_PROTECTED_PREFIXES` (line 9): add `'/api/chatwoot/dashboard-app'` (non-strict). The iframe fetch is same-origin so Origin passes; the call is token-authenticated so CSRF is not the real control, this is defence in depth.
6. Do not alter `buildCsp` / `buildCspStatic` output: `tests/middleware-i18n.test.ts` pins the exact directive strings ("removing the added chat-origin tokens ... restores the previous directive strings exactly").

**Embed CSP (recommended, nonce-based like `/admin`):**
```
default-src 'none'; script-src 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none';
frame-ancestors https://chat.rideprestigo.com; report-uri /api/csp-report
```
(`'unsafe-eval'` only in development, as `buildCsp` does. Use a system font stack so no `next/font` is needed.)

### Pattern 4: X-Frame-Options must not hit `/embed`
`next.config.ts` lines 112-118 set `X-Frame-Options: DENY` on `source: "/(.*)"`. Exclude the embed prefix with a path-regex source, e.g. `source: "/((?!embed(?:/|$)).*)"`, and add a second header entry for `/embed/:path*` that carries the *other* security headers (nosniff, X-XSS-Protection, Referrer-Policy `no-referrer`, Permissions-Policy, HSTS) but no `X-Frame-Options`. Modern browsers let CSP `frame-ancestors` override XFO when both exist [ASSUMED], but depending on that is unnecessary risk - remove the conflict. Verify with `curl -sI https://rideprestigo.com/embed/chatwoot-dashboard` after deploy (must show `content-security-policy: ... frame-ancestors https://chat.rideprestigo.com` and no `x-frame-options`).

### Pattern 5: Read-only RPC (migration 080)
```sql
-- panel_bookings(p_email text, p_phone text) RETURNS jsonb
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''   (same shape as identity_person / crm_booking, 069)
-- Resolution (conservative, no cross-person leakage):
--   v_email := public.identity_normalize_email(p_email);  v_phone := public.identity_normalize_phone(p_phone)
--   phone dropped when a phone_flags row has shared = true (same rule as identity_resolve_core rule "A number flagged shared is never used again")
--   identity := owner of v_email in identity_emails; ELSE (email absent or unowned) the identity owning v_phone in identity_phones,
--               only when exactly ONE identity owns it. Never union two identities.
--   identity.erasing_at IS NOT NULL  -> return identity_found=false (treat as no bookings)
--   bookings := booking_identity bi JOIN bookings b, NOT identity_is_abandoned(b.status,b.booking_source,b.payment_link_id), b.anonymised_at IS NULL
-- Projection (explicit list, never SELECT *): id, booking_reference, status, leg, trip_type, linked_booking_id, pickup_utc, pickup_date,
--   pickup_time, origin_address, destination_address, hours, vehicle_class, passengers, luggage, amount_eur, amount_czk,
--   outbound_amount_czk, return_amount_czk, paid_at, invoice_number, payment_link_url, flight_number, special_requests,
--   booking_source, lead_channel, accepted driver name (driver_assignments.status='accepted', newest) + trip_progress + trip_progress_updated_at
--   DO NOT project client_phone/client_email/operator_notes/driver contact data.
-- Cap: ORDER BY pickup_utc DESC NULLS LAST LIMIT 200 (upcoming/past split and counters can then be done in the RPC or in TS).
REVOKE EXECUTE ON FUNCTION public.panel_bookings(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.panel_bookings(text, text) TO service_role;
```
Memory gotcha applies: DROP+CREATE of a SECURITY DEFINER function re-grants PUBLIC EXECUTE; the REVOKE line must always be re-run and a migration test must assert it. Next free number is **080** (`ls supabase/migrations` ends at `079_webhook_security_fixes.sql`).

### Suggested plan slicing (for the planner)
- **Wave 0 (RED tests + scaffolds):** every test file listed in Validation Architecture, empty-but-failing; guard-test edits (`frame-ancestors` directive name, allowlist entries).
- **Wave 1:** migration 080 + smoke SQL (orchestrator applies via Supabase MCP - executors have no MCP); `lib/chatwoot-operator.ts`; `lib/panel-bookings.ts`; route handler; middleware + `next.config.ts` + matcher + CSRF + rate-limit + robots edits.
- **Wave 2:** embed layout/page/PanelClient/CSS; Copy button; states.
- **Wave 3:** `sync.mjs` `dashboardApps` + `dashboard-apps.json`; runbook (token how-to, CVE evidence, revocation); CSP baseline step; live UAT checkpoint (human-verify, needs a Chatwoot session and a second restricted agent).
- Commits: `security:` prefix for the route, middleware, guard and CSP work.

### Anti-Patterns to Avoid
- **Trusting `contact` from the postMessage** (D-03): send only the conversation id; the server re-fetches the contact.
- **`postMessage(..., '*')` from the iframe** and `e.origin` prefix/`includes` checks - use strict equality with the exact origin.
- **Importing `createClient` from `@/lib/supabase/server`, `getAdminUser`, `cookies()`/`headers()` cookie access** in anything reachable from the panel route or embed page.
- **Using `loadSiteChatwootConfig` / the site token** in the panel path (it would let a bug act with the site's privileges).
- **Forwarding Chatwoot's conversation payload** (contains the latest message body and the contact's attributes) - map to an allowlisted DTO.
- **Logging headers/URLs/bodies**; log only `[panel] outcome=<> code=<>`.
- **`dangerouslySetInnerHTML` / `href={user text}`** for booking notes, route text, payment link: React-escape text, validate every URL (`https:` + allowlisted host) before rendering as a link.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Operator authentication | A panel login, HMAC handshake or signed iframe URL | Chatwoot's own token + `ConversationPolicy` via the two GETs | Revocation and per-conversation access come for free (D-01/D-04) |
| Identity / merge rules | Email/phone matching in TS | SQL helpers `identity_normalize_email`, `identity_normalize_phone`, `phone_flags`, `booking_identity`, `identity_is_abandoned` | The rules (shared phones, erasing, abandoned) are subtle and already tested; the panel must "see what the sync sees" (D-10) |
| Rate limiting | New counter | `checkRateLimit('/api/chatwoot/dashboard-app', ip, { failClosed: true })` + `LIMITS` entry | Atomic Upstash sliding window already exists |
| Body size / parse | Manual | `enforceMaxBody`, zod two-step parse (400 shape, 422 business) | Repo standard (memory: API route patterns) |
| App registration | Manual UI click as the only record | `infra/chatwoot/sync.mjs` resource + `dashboard-apps.json` | Git is source of truth (D-18); idempotent matching by title |
| Token hashing | custom | `crypto.createHash('sha256')` | Cache key only, never stored/logged |
| Read-only proof | Reviewer vigilance | Structural guard test (closure + RPC allowlist + no cookie APIs) | Matches 83 D-17 |
| Clipboard | Assume `navigator.clipboard` works | try `writeText`, fallback `document.execCommand('copy')` on a hidden textarea, final fallback a selectable read-only input | The Chatwoot iframe has no `allow="clipboard-write"` (Pitfall 6) |

**Key insight:** every hard part (who is the operator, may they see this conversation, which bookings belong to this person) is already decided by an existing system (Chatwoot policy, Phase 82 SQL). The phase is glue plus a hardened shell; custom logic is where leaks happen.

## Common Pitfalls

### Pitfall 1: The "patched Chatwoot" gate cannot be met by version
**What goes wrong:** Plans schedule an upgrade or a "confirm >= X" check and the check can never pass.
**Why it happens:** PITFALLS.md read "affects <= 4.7.0" as "fixed in 4.7.1+". Evidence this session: GHSA-hgg8-54gw-8v33 has empty `vulnerabilities`/no patched version; OSV lists "Fixed: none"; `IFrameHelper.js` `initPostMessageCommunication` is identical in v4.7.0, v4.18.0, v4.19.1 and `develop` (`window.onmessage = e => { if (typeof e.data !== 'string' || e.data.indexOf('chatwoot-widget:') !== 0) return; ... IFrameHelper.events[message.event](message) }` - no `e.origin` check); `popoutChatWindow: ({ baseUrl, websiteToken, locale }) => { const cwCookie = Cookies.get('cw_conversation'); window.$chatwoot.toggle('close'); popoutChatWindow(baseUrl, websiteToken, locale, cwCookie) }`.
**How to avoid:** Record evidence + scope in the runbook; get the user's decision on the gate wording (Open Questions 1); implement the compensating control; add a re-check recipe (`gh api repos/chatwoot/chatwoot/security-advisories`, diff `IFrameHelper.js` on each Chatwoot bump).
**Warning signs:** a task that says "verify version >= 4.7.1".

### Pitfall 2: Conversation switch = new iframe, not an in-place update
**What goes wrong:** Designs assume the listener receives a second `appContext` when the operator clicks another conversation. Verified: `<DashboardAppFrame :key="currentChat.id + '-' + dashboardApp.id" ...>` (ConversationBox.vue:140), so the old iframe is destroyed and a fresh page loads.
**How to avoid:** make the cold-start path fast and idempotent (token read, one POST). Still handle later `appContext` pushes (theme change, custom-attribute change) by replacing context. Chatwoot also does not re-send when the operator edits the contact; refresh by focus/visibility/30 s/button because the server re-reads the contact by conversation id.

### Pitfall 3: Missed handshake
Chatwoot sends context on iframe `load` and on `fetch-info`, but only `if (!this.isVisible) return` for fetch-info and `sendContextToFrames` returns while `iframeLoading`. Attach the listener first, then request, then retry a few times. Without it the panel can sit on "Loading..." forever on a slow hydrate.

### Pitfall 4: Same-site storage sharing (D-02 premise)
See Summary. `https://rideprestigo.com` `localStorage` is origin-scoped and shared with the marketing site pages (GTM/GA/Meta/Clarity, `script-src 'unsafe-inline' https:`). MDN: partitioning key is "the scheme and registrable domain of the top-level page" [CITED: developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning]; `chat.rideprestigo.com` and `rideprestigo.com` have the same registrable domain, so the embed is not a third party. Chatwoot personal tokens are full-power (an owner token is account administrator). Options in Open Questions 2.

### Pitfall 5: Admin cookie rides along
The embed and the API are same-site, so `SameSite=Lax` Supabase cookies are sent on every request. The route must not read them, and middleware `updateSession` on `/api/*` would otherwise refresh/rotate them. Strip `cookie` in middleware for both paths and assert it in a test; the structural guard forbids `@/lib/supabase/server`, `next/headers` cookies and `getAdminUser`.

### Pitfall 6: Clipboard inside Chatwoot's iframe
`Frame.vue` renders `<iframe :id :src @load>` with no `allow` attribute, so `navigator.clipboard.writeText` is governed by the default Permissions Policy for a cross-origin frame and can throw `NotAllowedError` [ASSUMED - confirm in UAT]. Implement `try writeText -> catch -> execCommand('copy') fallback -> selectable input`, and show "Copied"/"Press Ctrl/Cmd+C" feedback. The D-09 Copy button is a headline feature, so test it live.

### Pitfall 7: VPS isolation guard (Phase 76) will fail the new files
`tests/infra-vps-isolation-guard.test.ts` forbids, in `app/ components/ lib/ i18n/ middleware.ts next.config.ts`, any host literal `chat|crm.rideprestigo.com`, any `CHATWOOT_*`/`ESPOCRM_*` env name and any chatwoot/espocrm bare package import, plus every file that transitively imports such a file, unless on `VPS_ASYNC_ALLOWLIST` (line 88). Consequences:
- The route, `lib/chatwoot-operator.ts`, `lib/panel-bookings.ts` (if it names `ESPOCRM_*`), and the embed `page.tsx` (reads `CHATWOOT_BASE_URL`) need allowlist entries with an honest reason ("operator-only request path behind a Chatwoot operator token; never a public page render or booking/payment/contact path; a VPS outage degrades only this panel"). The header comment defines entries as async-only; add the rationale to the guard's doc comment as a deliberate new category rather than hiding it.
- `middleware.ts` carries the host literal only via CSP lines; `CSP_DIRECTIVE_NAMES` (line 52) does not include `frame-ancestors`, so `"frame-ancestors https://chat.rideprestigo.com"` is flagged. Add `frame-ancestors` (and `base-uri`, `object-src` if written on their own line) to the list; the five exemption fixture tests stay valid.
- `lib/chatwoot-client.ts` allowlist reason says "imported only by the QStash-invoked ... dispatcher"; if the panel imports `SiteChatwootError`/`CHATWOOT_AUTH_HEADER` from it, that reason becomes false. Prefer re-declaring the header constant and a small error class in `lib/chatwoot-operator.ts` (or move the shared bits to a neutral file) so the old reason stays true.
- Write the middleware literal so it still matches `CSP_DIRECTIVE_LINE_RE` (a single directive string alone on its line).

### Pitfall 8: Theme and the admin `StatusBadge`
`StatusBadge` hard-codes dark-navy backgrounds (`#1a3a2a` etc.) and uses `var(--font-montserrat)`; Chatwoot sends `theme: 'light'|'dark'` in `appContext` [VERIFIED: Frame.vue `getCurrentTheme`, `theme: this.currentTheme`]. Build panel badges from the same hue per status but with theme-scoped CSS variables (`[data-theme=light]`/`[data-theme=dark]`) and ensure AA contrast in both; do not import the admin component (it pulls inline dark styles and an unset font var).

### Pitfall 9: Operator-visible data from an unverified contact
A website visitor can type any email in the pre-chat form, and an agent can edit a contact's email. D-03 prevents *API* enumeration, but the panel will show the booking history of whatever email the contact carries. Show a verification hint derived from data the server already has: `meta.hmac_verified` (identity-validated widget session) and `contact.identifier` (Supabase user id set by the identity route). "Verified (signed-in customer)" vs "Unverified email - confirm identity before sharing booking details". (Recommended; not in CONTEXT, so planner/user to confirm as in-scope polish.)

### Pitfall 10: Admin deep link only accepts references
`readBookingDeepLink` accepts only `^[A-Za-z0-9-]{1,40}$` (BookingsTable.tsx:1054-1062). `lib/chatwoot-mapping.ts` builds `admin_bookings_url` with `?search=<email>`, which the table ignores. For card links use `/admin/bookings?search=<booking_reference>` (valid). For "all bookings of this customer" there is currently no working deep link; do not promise one (the existing attribute link is a known no-op for emails).

### Pitfall 11: Payment state is not a column
Migration 051: "Payment is an attribute, not a status." `paid_at` is set by the payment-link / invoice paths; the card-checkout path leaves `paid_at` NULL and relies on `status` (`confirmed` after Stripe validated the charge, comment in `lib/supabase.ts`). Derive one explicit `paymentState` server-side (rule in Code Examples) and unit-test it; flag the rule for user confirmation (Assumptions A1).

### Pitfall 12: Fail-closed limiter locks everyone out when Upstash is down
`checkRateLimit(..., { failClosed: true })` returns `degraded:true, allowed:false` if Upstash is unreachable (same pattern as `/admin/login`; memory notes localhost admin login blocked by it). For a read-only helper panel this is acceptable and safer (the route is an auth-oracle proxy to Chatwoot); render a clear "Temporarily unavailable" state on 429/503 instead of a generic error.

### Pitfall 13: CSP baseline mechanics
`scripts/qa/csp_regression.py` captures against **live production** (`https://rideprestigo.com`) and `--capture` rewrites the whole `csp_baseline.json`; a route class added to `ROUTE_CLASSES` before the baseline has it yields "no baseline entry". Sequence: (1) before merge, `--compare` against prod must be clean (proves existing classes did not drift: the existing 11 entries are unchanged by this phase); (2) after the production deploy, add `/embed/chatwoot-dashboard` to `ROUTE_CLASSES` and run `--capture` (review the diff of the JSON: only the new key may be added); the new class has a nonce so `NONCE_RE` normalization applies.

### Pitfall 14: `next.config` header merge semantics are unverified
Multiple `headers()` entries that match one path merge; behaviour for a duplicate key is not something this research could confirm offline. Avoid relying on it (Pattern 4 uses a negative-lookahead source) and prove the result with a live `curl -sI`.

## Code Examples

### Route handler order (mirrors the admin pattern, with a token guard instead of `getAdminUser`)
```typescript
// app/api/chatwoot/dashboard-app/route.ts  (POST only; export const dynamic = 'force-dynamic'; runtime nodejs)
// 1. enforceMaxBody(request, 2_000)
// 2. checkRateLimit('/api/chatwoot/dashboard-app', getClientIp(request), { failClosed: true })  -> 429
// 3. token = Authorization: Bearer <printable ASCII, <=128>   -> 401 {error:'invalid_token'} when missing/malformed
// 4. zod body { conversationId: z.number().int().positive().max(2**31-1) } -> 400 (malformed JSON / shape)
// 5. verifyOperator(token, conversationId):  invalid_token -> 401 ; no_access/not_found -> 403 {error:'no_access'} (same body, no oracle)
//                                            unavailable -> 502 ; not_configured -> 503
// 6. panel_bookings via createSupabaseServiceClient (only symbol imported from @/lib/supabase)  -> DTO
// 7. NextResponse.json(dto, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
// Never: cookies(), headers() cookie read, getAdminUser, createClient from @/lib/supabase/server, console.log of headers/body.
```

### Payment-state derivation (to be unit-tested; rule is Assumption A1)
```typescript
type PaymentState = 'paid' | 'awaiting_payment' | 'quote' | 'cancelled'
function paymentState(b: { status: string; paid_at: string | null }): PaymentState {
  if (b.status === 'cancelled') return 'cancelled'
  if (b.paid_at) return 'paid'
  if (b.status === 'unpaid') return 'awaiting_payment'
  if (b.status === 'pending') return 'quote'          // quote request not yet priced/paid
  return 'paid'                                         // confirmed/assigned/en_route/on_location/completed (VALUE_STATUSES: charge validated)
}
// Copy button shown only when paymentState === 'awaiting_payment' && payment_link_url is https and host is on an allowlist (buy.stripe.com).
```

### Upcoming / past split (D-05)
```typescript
// upcoming = pickup instant >= now AND status not in (cancelled, completed), ascending ; ALL of them
// past     = everything else, descending, first 10 + pastTotal for the "more" control
// pickup instant = pickup_utc, else Europe/Prague wall-clock of (pickup_date, pickup_time). Do NOT drop rows whose pickup_utc is NULL
// (lib/chatwoot-mapping.ts drops them from both lists: NaN comparisons). Counters mirror the sync attribute rule:
//   trips = rows where leg !== 'return' && status !== 'cancelled' ; totalSpentEur = sum of bookingLeadAmountEur over
//   VALUE_STATUSES {confirmed, assigned, en_route, on_location, completed} so the header equals the Chatwoot `trip_count`/`lifetime_value` attributes.
// Return legs are separate rows with their own pickup/driver/status: list them with a "Return" badge, do not hide them.
```

### Status vocabulary to mirror (quoted verbatim from `components/admin/BookingsTable.tsx:80-95`)
```typescript
const vehicleClassMap: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

const STATUS_LABELS: Record<string, string> = {
  unpaid:      'Unpaid',
  pending:     'Pending',
  confirmed:   'Confirmed',
  completed:   'Completed',
  cancelled:   'Cancelled',
  assigned:    'Assigned',
  en_route:    'En Route',
  on_location: 'On Location',
}
```
Driver trip progress (Phase 67) values [VERIFIED: `app/api/driver/trip/[token]/progress/route.ts:20`]: `const TRIP_PROGRESS_VALUES = ['en_route', 'arrived', 'on_board', 'completed', 'no_show'] as const`; labels [VERIFIED: `components/admin/DriverAssignmentSection.tsx:43-49`]: `en_route: 'En Route', arrived: 'Arrived', on_board: 'On Board', completed: 'Completed', no_show: 'No-Show'`. Status colour families (hue per status) from `StatusBadge.tsx` variantStyles: unpaid amber `#f59e0b`, pending orange `#fb923c`, confirmed sky `#38bdf8`, assigned emerald `#34d399`, en_route violet `#a78bfa`, on_location amber `#fbbf24`, completed green `#4ade80`, cancelled red `#f87171`; admin palette tokens `--anthracite #0F1D2C`, `--anthracite-mid #17293B`, `--copper #BFA06A`, `--offwhite #F3EEE3`, `--warmgrey #A9AEB0` (`app/globals.css:55-62`).

### Registering the app in `sync.mjs` (pattern from `syncLabels`, `sync.mjs:381-407`)
```javascript
// RESOURCE_ORDER += 'dashboardApps' (after 'automation'); HANDLERS.dashboardApps = syncDashboardApps
// desired = ctx.read('dashboard-apps.json').dashboardApps   // [{ title, content: [{ type: 'frame', url }] }]
// existing = await ctx.list('/dashboard_apps')              // GET returns a bare JSON array (index.json.jbuilder: json.array!)
// keyOf = title ; differs = JSON.stringify(want.content) !== JSON.stringify(have.content)
// create: ctx.mutate('POST',  '/dashboard_apps',       { dashboard_app: { title, content } })
// update: ctx.mutate('PATCH', `/dashboard_apps/${id}`, { dashboard_app: { title, content } })
// never DELETE (operator-made apps are left alone). Needs an ADMINISTRATOR token (DashboardAppPolicy#create?/update? = administrator?);
// the owner token in ~/.config/prestigo/chatwoot-api.env is one. Server-side validation: content items need type == 'frame' and
// url matching ^https?://  (DashboardApp#validate_content, minItems 1).
```

### Chatwoot facts used above (quoted)
- `ConversationPolicy#show?`: `administrator? || agent_bot? || agent_can_view_conversation?` with `agent_can_view_conversation?` = `inbox_access? || team_access?` [VERIFIED: chatwoot@v4.18.0 app/policies/conversation_policy.rb]. (The `-ce` image carries no `Enterprise::ConversationPolicy` custom-role filtering [ASSUMED: -ce strips `enterprise/`]; if it did, it could only narrow access further.)
- Not authorized -> `render_unauthorized('You are not authorized to do this action')` = 401; `RecordNotFound` -> 404 [VERIFIED: app/controllers/concerns/request_exception_handler.rb].
- `AccessTokenAuthHelper#validate_bot_access_token!`: `return if Current.user.is_a?(User)`; bot only on `BOT_ACCESSIBLE_ENDPOINTS` (conversations `show` is listed, profiles are not) [VERIFIED].
- Conversation `show` JSON: `json.meta.sender` -> contact partial (`email`, `phone_number`, `id`, `identifier`, `custom_attributes`, `blocked`), `json.id conversation.display_id`, `json.account_id`, `json.messages [last_message...]` (message bodies - never forward) and `meta.hmac_verified` [VERIFIED: app/views/api/v1/conversations/partials/_conversation.json.jbuilder, models/_contact.json.jbuilder].
- Existing live use of `/api/v1/profile` with the hyphenated header: `infra/chatwoot/inspect.mjs:256-257` (`const profile = await client.request('GET', '/api/v1/profile')`) and `sync.mjs` `ownerId()`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Research ARCHITECTURE.md: trust `contact.email` from postMessage | D-03: conversation id only; server re-fetches with operator token | Phase 84 discuss | API cannot enumerate bookings by email |
| PITFALLS: "confirm CVE patched, upgrade if not" | No upstream fix exists; scope + compensating control | this research | gate reworded (Open Question 1) |
| Chatwoot Dashboard App docs: payload `{conversation, contact, currentAgent}` | v4.18.0 also sends `customAttributes` and `theme` | by v4.18.0 | use `theme` for light/dark |
| Next.js `middleware.ts` | Next 16 prefers `proxy.ts` (middleware deprecated, still runs) | Next 16 | repo still uses `middleware.ts`; do not migrate in this phase |

**Deprecated/outdated:** `window.parent.postMessage('...', '*')` in the Chatwoot docs example - use the exact origin; ARCHITECTURE.md request flow lines 222-234 (superseded by D-01..D-04).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Payment-state derivation: `paid_at` => Paid; `status` unpaid => Awaiting payment; pending => Quote; confirmed...completed without `paid_at` => Paid (card) | Code Examples, Pitfall 11 | Operator sees "Paid" for an invoiced-but-unpaid corporate booking; need user to confirm there is no confirmed-but-unpaid state |
| A2 | `navigator.clipboard.writeText` throws in Chatwoot's cross-origin iframe (no `allow` attribute) | Pitfall 6 | If it works, the fallback is just dead code; low risk, verify in UAT |
| A3 | Chrome/Firefox/Safari let CSP `frame-ancestors` supersede `X-Frame-Options` | Pattern 4 | Mitigated by excluding `/embed` from XFO; only matters if the exclusion regex misbehaves |
| A4 | `-ce` image has no enterprise custom-role policy; `show?` is exactly admin/inbox/team | Chatwoot facts | Custom roles could narrow access (safe direction); recheck with the live second-agent UAT |
| A5 | The Chatwoot iframe's `localStorage` for `https://rideprestigo.com` is shared with marketing-page `localStorage` (same origin, same site, no partition) | Pitfall 4 | If a browser did partition it, token exposure is smaller than stated; the recommendation still stands as a conservative default. Verify in Chrome DevTools -> Application -> Storage during UAT |
| A6 | Chatwoot access tokens are printable ASCII (site `TOKEN_RE = /^[\x21-\x7e]+$/` already assumes it); length cap 128 is generous | Route | Over-strict regex would reject valid tokens; keep the repo's existing regex |
| A7 | `jsdom` MessageEvent accepts `origin`/`source` and `window.parent` can be redefined for tests | Validation | Test harness work only; fallback is `Object.defineProperty(window,'parent',...)` |
| A8 | A past-booking cap of 200 rows in the RPC is sufficient for any single customer | Pattern 5 | An agency with >200 bookings would see a truncated list; counters should then come from SQL aggregates, not the capped list |
| A9 | Conversation id in `appContext.conversation.id` equals the `display_id` used by the REST path | Pattern 2 | [VERIFIED in jbuilder: `json.id conversation.display_id`] - residual risk only that the Vuex store reshapes it; confirm in live UAT |
| A10 | Chatwoot Application API allows `PATCH /dashboard_apps/:id` (route `resources :dashboard_apps, only: [:index,:show,:create,:update,:destroy]`) | sync.mjs | PUT is also routed; PATCH is what the Vue store uses |

## Open Questions

1. **CVE-2025-12245 gate cannot be met literally (needs user decision).**
   - What we know: GHSA-hgg8-54gw-8v33 (published 2025-10-27, CVSS 5.3, no patched version), OSV "last affected 4.7.0, fixed: none"; widget SDK only; `IFrameHelper.js` unchanged through v4.19.1/develop; hckwr.com disclosure (2025-10-06) says the vendor never responded; Dashboard App `Frame.vue` is a different file and gates on `event.source`. All repo-published Chatwoot advisories (CVE-2026-72719 >= 4.9.0, CVE-2026-44707 4.13.0, CVE-2026-44706 4.11.2, CVE-2025-21628 3.16.0) are fixed at or below 4.18.0.
   - What's unclear: whether the owner accepts re-wording PANEL-02/ROADMAP criterion 2 from "runs on a Chatwoot version confirmed patched" to "CVE scoped (widget SDK, not Dashboard Apps), no upstream fix exists as of v4.19.1, pinned version is above all published fixes, compensating control shipped".
   - Recommendation: Ask the user (checkpoint:decision). Ship a small compensating control in this phase: before the widget SDK is loaded, `components/chat/load-chat-widget.ts` registers a capturing `window` `message` listener that calls `stopImmediatePropagation()` for string messages starting `chatwoot-widget:` whose `e.origin` is not the widget origin (registered earlier than the SDK's `window.onmessage`, so it runs first). Add a unit test around it; keep the listener host-free (the loader already receives the base URL at click time and keeps `chat-widget-contract.ts` for URL checks). Do NOT upgrade to v4.19.1 for this reason (it does not change the CVE state).

2. **Where may the operator token live? (D-02 premise is wrong for same-site embeds.)**
   - What we know: see Pitfall 4. Exposure is any script on `https://rideprestigo.com`; token = full agent API power.
   - Options: (a) keep `localStorage` as decided and accept the risk (cheapest, weakest); (b) `sessionStorage` (per tab, not shared with marketing tabs, re-paste each Chatwoot session; recommended default); (c) serve the embed from a dedicated origin such as `panel.rideprestigo.com` (Vercel alias + Hostinger DNS CNAME; `frame-ancestors` unchanged; storage isolated by origin; the strongest, adds infra and a second host to the CSP/guard/matcher logic); (d) exchange the token for an encrypted `HttpOnly` cookie scoped to `/api/chatwoot/dashboard-app` (contradicts "no cookie / server never persists" spirit).
   - Recommendation: take (b) unless the owner wants to pay for (c); record the choice in the runbook. Add a "Forget token" button either way and treat a 401 as "clear stored token + re-prompt".

3. **Past-trip "more" behaviour.** D-05 allows "a 'more' control or a link to /admin". Recommended: the RPC returns up to 200 rows; the client shows the first 10 and a "Show N more" button expanding in place (no second request); beyond 200, link to `/admin/bookings`.

4. **Phone-only contacts and email/phone disagreement.** If the contact's email belongs to identity A and its phone to identity B, the recommendation is email wins, never union. Confirm this is acceptable (it hides B's bookings when an agent typed a stray phone, which is the safe direction).

5. **EspoCRM Lead link source (D-08).** `chat_conversations(conversation_id -> espo_lead_id)` (migration 078) is the only per-conversation Lead pointer; `ESPOCRM_BASE_URL` builds the URL (`<base>/#Lead/view/<id>`, same shape as `crm_contact_url`). Confirm the Lead link should use the conversation's Lead and fall back to the person's open `chat_leads` row; if neither exists, render only "Create booking in admin".

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, `sync.mjs` | yes | v24.14.1 | - |
| vitest | tests | yes | 4.1.5 | - |
| Python 3 | `csp_regression.py` | yes | 3.14.3 | - |
| gh CLI | CVE/advisory re-check | yes | 2.88.1 | WebFetch on the advisory URLs |
| Supabase MCP | live schema check, applying migration 080, smoke SQL | not callable from this research session (no MCP tool exposed to the researcher) | - | Orchestrator applies/verifies (executors have no Supabase MCP, per project memory); schema read from `82-LIVE-SCHEMA.md` (2026-10-19 snapshot) plus migrations 069/072/077/078; re-run an `information_schema.columns` check for `bookings`, `driver_assignments` before finalising the RPC |
| Live Chatwoot (admin token + second restricted agent) | registration, handshake, no-access UAT | owner-provided at execution (`~/.config/prestigo/chatwoot-api.env`) | v4.18.0-ce | UAT as a `checkpoint:human-verify`; unit tests use `fetch` stubs |
| VPS SSH | not needed (no Chatwoot upgrade in this phase) | auto mode blocks | - | - |

**Missing dependencies with no fallback:** none for planning. Live UAT needs the owner's Chatwoot session and a second agent account (created in Chatwoot, member of a different inbox only).
**Missing dependencies with fallback:** Supabase MCP (orchestrator).

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` -> treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (`environment: 'jsdom'`, `globals: true`, setup `tests/setup.ts`); add `// @vitest-environment node` to server-side tests (as `tests/webhook-isolation-guard.test.ts` does) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/chatwoot-operator.test.ts tests/panel-bookings.test.ts tests/chatwoot-dashboard-route.test.ts tests/dashboard-app-isolation-guard.test.ts tests/middleware-embed.test.ts tests/embed-panel.test.tsx` |
| Full suite command | `npx vitest run` (~90 s) plus `npx tsc --noEmit` and `npx eslint --quiet <changed files>` (the `verify` skill) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANEL-01 | RPC projection returns only allowlisted columns; booker-only via `booking_identity`; excludes abandoned/anonymised/erasing; shared phone ignored; email beats phone | migration-text test + live smoke SQL | `npx vitest run tests/panel-bookings-migration.test.ts` | Wave 0 |
| PANEL-01 | DTO mapping, payment-state rule, upcoming/past split (null `pickup_utc`, cancelled, 10-cap), counters equal sync rule, EUR amount via `bookingLeadAmountEur` | unit | `npx vitest run tests/panel-bookings.test.ts` | Wave 0 |
| PANEL-01 | Cards render all D-06 fields; empty state D-08; no-email hint D-12; Copy button only for unpaid + https Stripe link; light/dark attribute; 320 px does not overflow (class/markup assertions) | component (jsdom) | `npx vitest run tests/embed-panel.test.tsx` | Wave 0 |
| PANEL-01 | Past "more" expands in place | component | same file | Wave 0 |
| PANEL-02 | Handshake: accepts only `e.origin === chatwootOrigin` and `e.source === window.parent`; ignores non-string/invalid JSON/wrong event/non-integer id; explicit target origin on `fetch-info`; inert when not framed or origin unconfigured; retry stops after context | component | `npx vitest run tests/embed-panel.test.tsx` | Wave 0 |
| PANEL-02 | Operator verification: AgentBot token rejected; 401 profile -> invalid_token; conv 401 -> no_access (after uncached re-check); 404; network/timeout -> unavailable; hyphenated `api-access-token` header, never `api_access_token`; `redirect:'error'`; timeout; token never in error text; profile cache keyed by sha256, TTL, no negative caching | unit with `fetch` stubs | `npx vitest run tests/chatwoot-operator.test.ts` | Wave 0 |
| PANEL-02 | Route: order (size -> rate limit -> token -> zod 400 -> verify -> data); `Cache-Control: no-store`; response keys allowlist; token/cookie never echoed or logged; 429 on limiter deny (fail-closed on degraded); no oracle between no_access and not_found | route unit (mock chatwoot-operator + store) | `npx vitest run tests/chatwoot-dashboard-route.test.ts` | Wave 0 |
| PANEL-02 | Structural read-only + cookie-less guard: closure of route + page + lib modules imports only `createSupabaseServiceClient`; no `.from('bookings'|'customer_profiles')` writes or escaped handles; no `auth.admin`; RPC literals only from an allowlist (`panel_bookings`, plus Lead lookup RPC); forbids `@/lib/supabase/server`, `next/headers`, `cookies`, `getAdminUser`, Stripe/Resend/Espo/Chatwoot-write helpers; Chatwoot calls are GET-only (no `post/put/del` use) | source-reading guard (modelled on `tests/webhook-isolation-guard.test.ts`: reuse its `findIsolationViolations` helpers, add fixtures, scope floor) | `npx vitest run tests/dashboard-app-isolation-guard.test.ts` | Wave 0 |
| PANEL-02 | Middleware: `/embed/chatwoot-dashboard` bypasses next-intl (no `/en/embed` rewrite), emits the exact embed CSP incl. `frame-ancestors https://chat.rideprestigo.com`, nonce present, `x-nonce` set, no `updateSession`, `cookie` header absent downstream, no `Set-Cookie`; `/api/chatwoot/dashboard-app` same cookie strip; `/admin` and public CSP strings unchanged | middleware unit (reuse `makeRequest`/mocks from `tests/middleware-i18n.test.ts`) | `npx vitest run tests/middleware-embed.test.ts tests/middleware-i18n.test.ts` | Wave 0 |
| PANEL-02 | Matcher keeps `/embed/x.xml` inside middleware; static files still excluded | unit | `npx vitest run tests/middleware-matcher.test.ts` | extend |
| PANEL-02 | `X-Frame-Options` not set for `/embed/*`, still `DENY` elsewhere | config test (read `next.config.ts` headers) or live `curl -sI` | `npx vitest run tests/next-config-headers.test.ts` | Wave 0 (verify importability first) |
| PANEL-02 | VPS isolation guard still green with new allowlist entries + `frame-ancestors` directive name | existing guard (edited) | `npx vitest run tests/infra-vps-isolation-guard.test.ts` | extend |
| PANEL-02 | Compensating widget message-origin guard drops foreign-origin `chatwoot-widget:` messages before the SDK handler | unit (jsdom) | `npx vitest run tests/chat-launcher.test.tsx tests/chat-widget-origin-guard.test.ts` | Wave 0 (if user approves Open Q1) |
| PANEL-01/02 | `dashboardApps` sync resource: create then rerun `create=0 update=0`; drifted URL updates; operator-made apps untouched; `--dry-run` GET-only; POST body wrapped in `dashboard_app` | unit (existing sync fake) | `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-dashboard-apps-config.test.ts` | extend + Wave 0 |
| PANEL-02 | Runbook asserts: token how-to, revocation, CVE evidence block (GHSA URL, version diff result, date), storage decision | content test (pattern of `tests/inbound-webhooks-runbook.test.ts`) | `npx vitest run tests/dashboard-app-runbook.test.ts` | Wave 0 |
| PANEL-02 | Rate limit entry exists (`LIMITS['/api/chatwoot/dashboard-app']`) | unit | `npx vitest run tests/rate-limit.test.ts` | extend |

### Live / manual-only (justify: needs real Chatwoot, real browser)
1. Register the app (`node infra/chatwoot/sync.mjs --dry-run` then apply with the admin token) and see the "Bookings" tab appear.
2. Open conversations of (a) a known customer, (b) a stranger email, (c) a Telegram name-only contact: counters, empty state, D-12 hint.
3. Second agent who is NOT a member of the conversation's inbox/team pastes their own token: expect "no access" (proves D-04 + 401 mapping live). Remove an agent -> panel access disappears on next refresh (D-01).
4. Light and dark Chatwoot themes; 320-400 px sidebar; Copy button inside the real iframe (Pitfall 6).
5. `curl -sI https://rideprestigo.com/embed/chatwoot-dashboard` -> CSP with `frame-ancestors https://chat.rideprestigo.com`, no `x-frame-options`; opening the URL in a plain tab shows the inert state; framing it from any other origin is blocked.
6. Admin cookie present in the same browser: network tab shows the cookie is not used (route works identically logged in/out of `/admin`).
7. CVE evidence re-check recipe executed and pasted into the runbook (commands under Sources).
8. `csp_regression.py --compare` clean pre-merge; post-deploy `--capture` adds exactly one route class.

### Sampling Rate
- **Per task commit:** the quick run command above scoped to the files touched.
- **Per wave merge:** quick run + `tests/middleware-*.test.ts`, `tests/infra-vps-isolation-guard.test.ts`, `tests/webhook-isolation-guard.test.ts`, `tests/chatwoot-sync.test.ts`, `tests/rate-limit.test.ts`, `tests/crm-sync-migrations.test.ts`, `npx tsc --noEmit`.
- **Phase gate:** full `npx vitest run` green (only the known baseline tsc errors), `verify` skill PASS, live checklist signed off by the owner before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/chatwoot-operator.test.ts`, `tests/panel-bookings.test.ts`, `tests/panel-bookings-migration.test.ts`, `tests/chatwoot-dashboard-route.test.ts`, `tests/dashboard-app-isolation-guard.test.ts`, `tests/middleware-embed.test.ts`, `tests/embed-panel.test.tsx`, `tests/next-config-headers.test.ts`, `tests/chatwoot-dashboard-apps-config.test.ts`, `tests/dashboard-app-runbook.test.ts`, optionally `tests/chat-widget-origin-guard.test.ts`.
- [ ] A fetch-stub helper for the operator client (the existing `tests/helpers/fake-chatwoot.ts` roots all paths under `/api/v1/accounts/<id>` and cannot serve `/api/v1/profile`; extend it only via its documented hooks or write a small local stub).
- [ ] Edits to existing tests: `infra-vps-isolation-guard` (allowlist + `frame-ancestors`), `middleware-matcher`, `chatwoot-sync` (new resource), `rate-limit`.

## Security Domain

> `security_enforcement` is not set in config -> enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Chatwoot-issued token validated server-side per request (`/profile` + conversation GET); AgentBot tokens rejected; no panel-local credentials |
| V3 Session Management | yes (by absence) | No session, no cookie; token in browser storage (Open Q2); 401 clears it; server cache is in-memory, hashed, <= 5 min, positive only |
| V4 Access Control | yes | Mirrors `ConversationPolicy#show?` (admin / inbox member / team member); booker-only data; D-03 conversation-id-only; no booking search surface |
| V5 Input Validation | yes | zod on body; conversation id `int > 0`; token charset/length; RPC parameters are bound arguments; React escaping for customer-supplied text; URL allowlist for links |
| V6 Cryptography | minimal | sha256 (node:crypto) for the cache key only; no custom crypto; TLS to Chatwoot enforced (https-only base URL, `redirect:'error'`) |
| V8 Data Protection | yes | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, allowlisted DTO (no phone/email of booker beyond what the operator already sees, no operator notes), no PII in logs |
| V13 API | yes | POST-only, Bearer header, rate limit (fail-closed), CSRF Origin check (defence in depth), 502/503 mapping without upstream detail |
| V14 Config | yes | Embed-only CSP with `frame-ancestors`, XFO exclusion, CSP baseline, noindex (`robots` metadata + `Disallow: /embed/` in `public/robots.txt`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Page embedded by an attacker site (clickjacking / data lure) | Spoofing / Info disclosure | CSP `frame-ancestors https://chat.rideprestigo.com`; inert when `window.parent === window`; no data without a valid operator token anyway |
| Forged `postMessage` supplies a conversation id | Spoofing / Tampering | Exact `e.origin` + `e.source === window.parent`; server re-verifies the id against Chatwoot with the operator's own token (a forged id still needs access to that conversation) |
| Booking enumeration by arbitrary email/phone | Info disclosure | D-03: lookup keys come only from the Chatwoot conversation response; no search endpoint |
| Stolen operator token | Elevation / Info disclosure | Token never stored server-side; storage choice (Open Q2); revocation = reset token in Chatwoot profile or remove agent; runbook instructs |
| Admin cookie used implicitly (same-site iframe) | Elevation | Middleware strips `cookie`; guard test bans cookie APIs and `@/lib/supabase/server` |
| Auth-oracle abuse (our API as a Chatwoot token brute-forcer / DoS amplifier) | Denial / Spoofing | Per-IP fail-closed limiter, `enforceMaxBody`, 5-min positive cache only, bounded cache size |
| Unverified contact email shows another person's history | Info disclosure (to operator) | Verification hint from `hmac_verified` / `identifier`; operator training in runbook |
| Widget SDK origin bug (CVE-2025-12245) on the public site | Tampering / Info disclosure | Compensating capture-phase message-origin guard in the widget loader (Open Q1); evidence + re-check recipe in runbook |
| SSRF via attacker-controlled Chatwoot base URL | SSRF | Base URL only from Vercel env (https only); token and conversation id are the only request inputs; id validated as a positive integer before path interpolation |
| Secrets in logs/commits | Info disclosure | No header/body logging; pre-commit secret scan; token never in URLs |
| Stored XSS via customer-supplied `special_requests` / addresses | Tampering | React text rendering only; no `dangerouslySetInnerHTML`; CSP `script-src` nonce + `strict-dynamic`, `default-src 'none'` |

## Sources

### Primary (HIGH confidence)
- chatwoot/chatwoot@v4.18.0 source, read this session via raw.githubusercontent.com: `app/javascript/dashboard/components/widgets/DashboardApp/Frame.vue`, `.../conversation/ConversationBox.vue` (key at line 140), `app/controllers/api/v1/accounts/dashboard_apps_controller.rb`, `app/models/dashboard_app.rb`, `app/policies/dashboard_app_policy.rb`, `app/policies/conversation_policy.rb`, `app/controllers/api/v1/accounts/conversations_controller.rb`, `app/controllers/concerns/access_token_auth_helper.rb`, `.../request_exception_handler.rb`, `.../ensure_current_account_helper.rb`, `app/controllers/api/v1/profiles_controller.rb`, `app/views/api/v1/models/_user.json.jbuilder`, `app/views/api/v1/conversations/partials/_conversation.json.jbuilder`, `app/views/api/v1/models/_contact.json.jbuilder`, `app/javascript/sdk/IFrameHelper.js` (v4.7.0, v4.18.0, v4.19.1, develop), `config/initializers/content_security_policy.rb` (all commented out)
- GitHub Advisory GHSA-hgg8-54gw-8v33 (CVE-2025-12245) via `gh api /advisories/GHSA-hgg8-54gw-8v33`: CVSS 5.3, `vulnerabilities: []`, published 2025-10-27
- `gh api repos/chatwoot/chatwoot/security-advisories` (4 published advisories and their patched versions) and `gh api repos/chatwoot/chatwoot/releases` (v4.19.1 2026-10-24, v4.19.0 2026-10-20, v4.18.0 2026-09-18)
- Repo files read this session: `middleware.ts`, `next.config.ts`, `lib/chatwoot-client.ts`, `lib/rate-limit.ts`, `lib/identity-store.ts`, `lib/chatwoot-mapping.ts`, `lib/lead-mapping.ts`, `supabase/migrations/069`, `072`, `077`, `078`, `079`, `051`, `infra/chatwoot/sync.mjs`, `README.md`, `infra/vps/caddy/Caddyfile`, `infra/vps/runbooks/upgrade.md`, `tests/infra-vps-isolation-guard.test.ts`, `tests/webhook-isolation-guard.test.ts`, `tests/webhook-isolation-runtime.test.ts` (head), `tests/middleware-i18n.test.ts`, `tests/middleware-matcher.test.ts`, `scripts/qa/csp_regression.py`, `scripts/qa/baselines/csp_baseline.json`, `components/admin/BookingsTable.tsx`, `StatusBadge.tsx`, `DriverAssignmentSection.tsx`, `.husky/pre-commit`, `.planning/phases/82-*/82-LIVE-SCHEMA.md`

### Secondary (MEDIUM confidence)
- [CITED] OSV entry https://osv.dev/vulnerability/CVE-2025-12245 (affected through 4.7.0, no fixed version)
- [CITED] hckwr.com "multiple-vulnerabilities-in-chatwoot" (2025-10-06 disclosure; vendor never responded; also describes an unpatched-status DOM-XSS in the help-center `IframeLoader` path)
- [CITED] Chatwoot docs https://www.chatwoot.com/docs/product/others/dashboard-apps/ (create via Settings -> Integrations -> Dashboard apps; `fetch-info` request; payload example)
- [CITED] MDN State Partitioning https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/State_Partitioning (partition key = top-level site = scheme + registrable domain)

### Tertiary (LOW confidence)
- Clipboard behaviour in a cross-origin iframe, XFO vs `frame-ancestors` precedence, `next.config` header merge order - training knowledge, flagged [ASSUMED], verify in UAT/curl

### Re-check recipe (paste outputs into the runbook as dated evidence)
```bash
gh api /advisories/GHSA-hgg8-54gw-8v33 --jq '{cve:.cve_id,vulns:.vulnerabilities,updated:.updated_at}'
gh api repos/chatwoot/chatwoot/security-advisories --jq '.[] | [.ghsa_id,.cve_id,.vulnerabilities[0].patched_versions]|@tsv'
for v in v4.18.0 <candidate>; do curl -sSL https://raw.githubusercontent.com/chatwoot/chatwoot/$v/app/javascript/sdk/IFrameHelper.js | grep -n "initPostMessageCommunication" -A8; done
```

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; versions read from `package.json`
- Chatwoot protocol and permission model: HIGH - read from the pinned tag's source; live second-agent UAT still required for the 401 mapping
- CVE finding: HIGH on "no upstream fix / widget-scoped / code unchanged"; the remedy is a user decision
- Architecture (middleware, CSP, guards, RPC): HIGH on repo seams, MEDIUM on `next.config` header merge and browser quirks (verify live)
- Payment-state rule and identity-conflict policy: MEDIUM - assumptions A1/Open Q4 need the owner's confirmation
- Pitfalls: HIGH for 1-5, 7, 10, 13; MEDIUM for 6, 14

**Research date:** 2026-10-26
**Valid until:** 2026-11-09 (14 days: Chatwoot ships roughly weekly; re-run the re-check recipe before executing Wave 3 and before any Chatwoot bump)
