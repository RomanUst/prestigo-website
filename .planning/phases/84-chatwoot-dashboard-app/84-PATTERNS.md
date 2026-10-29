# Phase 84: Chatwoot Dashboard App - Pattern Map

**Mapped:** 2026-10-29
**Files analyzed:** 20 new/modified
**Analogs found:** 17 / 20 (all analog paths verified git-tracked; no `.gsd/` mirror paths used)

CONTEXT.md wins over RESEARCH.md: D-02 = `sessionStorage` (not localStorage); D-13 = capture-phase message-origin guard in `components/chat/load-chat-widget.ts`, no Chatwoot upgrade.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/api/chatwoot/dashboard-app/route.ts` | route handler | request-response | `app/api/webhooks/chatwoot/route.ts` (+ `app/api/chatwoot/identity/route.ts`) | role-match |
| `lib/chatwoot-operator.ts` | service (HTTP client + token cache) | request-response | `lib/chatwoot-client.ts` | exact (port) |
| `lib/panel-bookings.ts` | service (RPC call + DTO mapping) | CRUD (read-only) | `lib/chatwoot-mapping.ts` + `lib/webhook-store.ts` | role-match |
| `lib/panel-links.ts` | utility (pure) | transform | `lib/chatwoot-mapping.ts` (`admin_bookings_url`) | role-match |
| `supabase/migrations/080_panel_bookings.sql` | migration (RPC) | request-response | `069_identity_core_sync_triggers.sql` (`identity_person`, `crm_booking`), `079_webhook_security_fixes.sql` (REVOKE/GRANT) | exact |
| `app/embed/layout.tsx` | layout | n/a | no embed analog; root layout in `app/` | partial |
| `app/embed/chatwoot-dashboard/page.tsx` | page (server shell) | request-response | `app/(internal)/admin/(dashboard)/` pages | partial |
| `app/embed/chatwoot-dashboard/PanelClient.tsx` | component (client) | event-driven (postMessage) + fetch | `components/chat/load-chat-widget.ts` (listener pattern); `components/admin/BookingsTable.tsx` (vocab) | partial |
| `app/embed/chatwoot-dashboard/panel.css` | style | n/a | `app/globals.css:55-62` palette tokens | partial |
| `middleware.ts` (modify) | middleware | request-response | itself (`NON_LOCALIZED_PREFIXES`, `buildCsp`, `runCspAndAuthChain`) | exact |
| `next.config.ts` (modify) | config | n/a | itself lines ~112-118 (XFO header) | exact |
| `lib/rate-limit.ts` (modify) | utility | request-response | itself `LIMITS` | exact |
| `components/chat/load-chat-widget.ts` (modify, D-13) | utility (client loader) | event-driven | itself (`awaitReady`/`loadAndRun` listener style) | exact |
| `infra/chatwoot/dashboard-apps.json` | config | batch | `infra/chatwoot/labels.json` | exact |
| `infra/chatwoot/sync.mjs` (modify) | tooling | batch | itself `syncLabels` | exact |
| `infra/vps/runbooks/chatwoot-dashboard-app.md` | docs | n/a | existing runbooks in `infra/vps/runbooks/` | role-match |
| `tests/dashboard-app-isolation-guard.test.ts` | test (structural) | n/a | `tests/webhook-isolation-guard.test.ts` | exact |
| `tests/infra-vps-isolation-guard.test.ts` (modify) | test | n/a | itself (`VPS_ASYNC_ALLOWLIST`, `CSP_DIRECTIVE_NAMES`) | exact |
| `tests/middleware-embed.test.ts`, `tests/middleware-matcher.test.ts` (modify) | test | n/a | `tests/middleware-matcher.test.ts`, `tests/middleware-i18n.test.ts` | exact |
| `tests/chatwoot-operator.test.ts`, `tests/panel-bookings.test.ts`, `tests/chatwoot-dashboard-route.test.ts`, `tests/embed-panel.test.tsx`, widget-guard test | test | n/a | `tests/chatwoot-site-client.test.ts`, `tests/chatwoot-config.test.ts` | role-match |

## Pattern Assignments

### `lib/chatwoot-operator.ts` (service, request-response)

**Analog:** `lib/chatwoot-client.ts` (port; do NOT import from it, see Pitfall 7 in RESEARCH: its VPS allowlist reason says "QStash-only", so re-declare the constant and a small error class here).

**Hardened request core to copy** (lines 111-168): hyphenated header, `redirect: 'error'`, timeout raced explicitly, error text = method + path-without-query + status only.
```typescript
export const CHATWOOT_AUTH_HEADER = 'api-access-token'
const TOKEN_RE = /^[\x21-\x7e]+$/   // printable ASCII; add length cap <=128

const headers: Record<string, string> = { Accept: 'application/json', [CHATWOOT_AUTH_HEADER]: token }
const signal = AbortSignal.timeout(timeoutMs)
// ...Promise.race([fetchImpl(url, { method, headers, redirect: 'error', signal }), timedOut])
if (status < 200 || status >= 300) throw new SiteChatwootError(method, path, status)
```
**Config loader to adapt** (lines 32-52): same shape but read ONLY `CHATWOOT_BASE_URL` + `CHATWOOT_ACCOUNT_ID` (https-only, `ACCOUNT_ID_RE = /^\d+$/`). Never read `CHATWOOT_API_TOKEN` (panel must not hold site privileges). Use `readEnv` from `lib/env.ts`.
**Panel difference:** root is `${base}/api/v1/profile` (not account-scoped) and `${base}/api/v1/accounts/${id}/conversations/${displayId}`; send ONLY operator token. Outcome union: `invalid_token | no_access | not_found | unavailable | not_configured`. Cache profile by `createHash('sha256')` (as in `app/api/webhooks/chatwoot/route.ts:1` `import { createHash } from 'node:crypto'`), positive-only, TTL <=5 min, max ~500 entries. Conversation GET never cached. Map only `meta.sender.{email,phone_number,identifier}` and `meta.hmac_verified`; never forward message bodies.
**Error classification:** copy `classifyChatwootError` (lines 77-86) mapping: 401/403 -> auth, 404 -> not_found, 0/429/>=500 -> transient.

---

### `app/api/chatwoot/dashboard-app/route.ts` (route handler, request-response)

**Analog:** `app/api/webhooks/chatwoot/route.ts` (token-authenticated, no cookie session, fail-closed, PII-safe logs) and `app/api/chatwoot/identity/route.ts` (`dynamic`, `no-store`).

**Imports/header pattern** (webhook route lines 1-24):
```typescript
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { enforceMaxBody } from '@/lib/request-guards'
export const runtime = 'nodejs'
export const maxDuration = 10
function log(event: string, outcome: string, code: string, extra = ''): void {
  console.log(`[webhook] source=chatwoot event=${event} outcome=${outcome} code=${code}${extra}`)
}
```
Adapt log to `[panel] outcome=<> code=<>` (never headers/body/token).
**Fail-closed + early guards order** (lines 30-48): config check first, `enforceMaxBody(request, N)` returns a Response to return directly.
**Response headers** (`identity/route.ts` 46-48): `{ headers: { 'Cache-Control': 'no-store' } }` + add `Referrer-Policy: no-referrer`. `export const dynamic = 'force-dynamic'`.
**Rate limit** (`lib/rate-limit.ts`): add `'/api/chatwoot/dashboard-app': <N>` to `LIMITS` (lines 21-34) and call `checkRateLimit('/api/chatwoot/dashboard-app', getClientIp(request), { failClosed: true })`; 429 on `!allowed`.
**Order:** enforceMaxBody -> rate limit -> Bearer parse (401) -> zod `{conversationId}` (400 malformed) -> `verifyOperator` (401 invalid_token; no_access and not_found both 403 same body, no oracle; unavailable 502; not_configured 503) -> RPC -> DTO.
**Forbidden here:** `createClient` from `@/lib/supabase/server` (identity route uses it; do NOT copy that part), `cookies()`, `getAdminUser`. Only `createSupabaseServiceClient` from `@/lib/supabase`.

---

### `lib/panel-bookings.ts` (service, read-only RPC + mapping)

**Analog:** `lib/chatwoot-mapping.ts` (booking summary, EUR rule, VALUE_STATUSES/trip counters, `admin_bookings_url`) and `lib/lead-mapping.ts` `bookingLeadAmountEur`. Reuse the same counter rule so header equals `trip_count`/`lifetime_value` attributes (trips = leg !== 'return' && status !== 'cancelled'; spent over VALUE_STATUSES). Do not drop rows with NULL `pickup_utc` (mapping drops them; panel must not). Payment-state derivation and upcoming/past split: see RESEARCH Code Examples (lines 407-429). Call only `.rpc('panel_bookings', {...})` via `createSupabaseServiceClient`; no `.from('bookings')` writes.

---

### `lib/panel-links.ts` (utility, pure)

**Analog:** `lib/chatwoot-mapping.ts` `admin_bookings_url`. Use `/admin/bookings?search=<booking_reference>` (valid per `readBookingDeepLink` regex `^[A-Za-z0-9-]{1,40}$`, BookingsTable.tsx ~1054-1062); email search is a no-op, do not promise it. Validate payment link `https:` + host allowlist (`buy.stripe.com`) before rendering href. Espo Lead: `<ESPOCRM_BASE_URL>/#Lead/view/<id>`. Note `ESPOCRM_*` env name trips the VPS guard -> allowlist entry.

---

### `supabase/migrations/080_panel_bookings.sql` (migration, read-only RPC)

**Analog:** `supabase/migrations/069_identity_core_sync_triggers.sql` `identity_person` / `crm_booking` (lines 376-455).
```sql
CREATE OR REPLACE FUNCTION public.identity_person(p_identity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ ... $$;
```
**Grant block to copy** (069:665-679 and 079:64-65):
```sql
REVOKE EXECUTE ON FUNCTION public.panel_bookings(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.panel_bookings(text, text) TO service_role;
```
Rules from memory: re-REVOKE after any DROP+CREATE. Resolution: `identity_normalize_email`, `identity_normalize_phone`, `phone_flags.shared`, `booking_identity`, `NOT identity_is_abandoned(...)`, `erasing_at IS NULL`, `anonymised_at IS NULL`; email wins, never union two identities; explicit column list, `LIMIT 200`; no client_phone/client_email/operator_notes. Next number 080 (latest tracked is `079_webhook_security_fixes.sql`). Orchestrator applies via Supabase MCP (executors have none). Also add `crm-sync-migrations.test.ts`-style test asserting REVOKE.

---

### `middleware.ts` (modify)

**Analog:** itself.
- `NON_LOCALIZED_PREFIXES` (line 195): add `'/embed'`.
- `CSRF_PROTECTED_PREFIXES` (lines 9-19): add `'/api/chatwoot/dashboard-app'` (non-strict).
- New `buildCspEmbed(nonce)` next to `buildCsp` (lines 47-72); follow the one-directive-per-line array + `.join('; ')` style and the dev-only `'unsafe-eval'` ternary (lines 56-58). Directive text per RESEARCH Pattern 3. Do NOT change `buildCsp`/`buildCspStatic` output (pinned by `tests/middleware-i18n.test.ts`).
- Embed branch before `runCspAndAuthChain` in `middleware()` (lines 288-312). Nonce handling to copy (lines 255-262):
```typescript
const nonce = btoa(crypto.randomUUID())
const reqHeaders = new Headers(request.headers)
reqHeaders.set('Content-Security-Policy', csp)
reqHeaders.set('x-nonce', nonce)
```
plus `reqHeaders.delete('cookie')`, `NextResponse.next({ request: { headers: reqHeaders } })`, set CSP, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` on response; never call `updateSession`. Same cookie-strip + skip-updateSession for `/api/chatwoot/dashboard-app`.
- Matcher (line 330): add `embed` to protected group: `(?!(?:api|admin|driver|auth|embed)/|(?:[a-z]{2}/)?account/)`.

---

### `next.config.ts` (modify)

**Analog:** itself, lines ~112-118 (`source: "/(.*)"` with `X-Frame-Options: DENY`). Switch to `source: "/((?!embed(?:/|$)).*)"` and add a separate `/embed/:path*` entry carrying the other security headers without XFO. Prove with `curl -sI` after deploy (Pitfall 14).

---

### `components/chat/load-chat-widget.ts` (modify, D-13)

**Analog:** itself. Listener-registration style (lines 103, 193-194, 219): `window.addEventListener(...)`/`removeEventListener`. Insert a capture-phase `window.addEventListener('message', guard, true)` registered in `loadAndRun` BEFORE the `script.src = .../packs/js/sdk.js` injection (line ~236-243) and once only (idempotent flag, since `window.chatwootSDK` re-run path at 232-237 skips injection). Guard: `typeof e.data === 'string' && e.data.indexOf('chatwoot-widget:') === 0 && e.origin !== new URL(config.baseUrl).origin` -> `e.stopImmediatePropagation()`. Keep host-free (use `config.baseUrl`; the VPS guard forbids host literals outside CSP lines). Unit test with jsdom `MessageEvent({origin, data})`.

---

### `app/embed/chatwoot-dashboard/PanelClient.tsx` (component, event-driven)

No tracked analog for the handshake; use RESEARCH Pattern 1 verbatim (strict `e.origin === chatwootOrigin && e.source === window.parent`, `postMessage(FETCH_INFO, chatwootOrigin)` never `'*'`, retry x5). D-02: store token in `sessionStorage` (not localStorage), 401 -> clear + re-prompt, "Forget token" button; token only in `Authorization: Bearer` header. Status vocabulary: copy `STATUS_LABELS`/`vehicleClassMap` verbatim from `components/admin/BookingsTable.tsx:80-95` (do not import the component; theme via `data-theme` CSS vars). Trip-progress labels from `components/admin/DriverAssignmentSection.tsx:43-49`. Clipboard: try `navigator.clipboard.writeText`, fallback `execCommand('copy')`, final selectable input. No `€` literals (pre-commit): render via `Intl.NumberFormat('en', { style:'currency', currency:'EUR' })`.

### `app/embed/layout.tsx`, `page.tsx`, `panel.css`
Own `<html><body>`, system font stack, `robots: noindex`, `export const dynamic = 'force-dynamic'`; page reads `CHATWOOT_BASE_URL` origin and passes it as prop (needs VPS allowlist entry). Palette tokens `--anthracite #0F1D2C`, `--copper #BFA06A`, `--offwhite #F3EEE3`, `--warmgrey #A9AEB0` from `app/globals.css:55-62`. No Supabase client creation during render.

---

### `infra/chatwoot/dashboard-apps.json` + `infra/chatwoot/sync.mjs` (config-as-code)

**Analog:** `infra/chatwoot/labels.json` (`{ "labels": [ {...} ] }` wrapper) and `syncLabels` (sync.mjs 381-407):
```javascript
async function syncLabels(ctx) {
  const counts = emptyCounts()
  const desired = ctx.read('labels.json').labels
  const existing = await ctx.list('/labels', 'labels')
  const plan = planCollection({ desired, existing, keyOf: (l) => l.title, differs: (want, have) => ... })
  for (const want of plan.create) { ctx.log(`  [create] label ${want.title}`); await ctx.mutate('POST', '/labels', want); counts.create++ }
  for (const { desired: want, existing: have } of plan.update) { await ctx.mutate('PATCH', `/labels/${have.id}`, want); counts.update++ }
  counts.unchanged = plan.unchanged.length
  return counts
}
```
Add `'dashboardApps'` to `RESOURCE_ORDER` (line 41) and `HANDLERS` (line 815). Create/PATCH body wrapped `{ dashboard_app: { title, content } }`; GET returns a bare array (check what `ctx.list` second arg expects; labels uses a key, dashboard_apps does not); never DELETE. Extend `tests/chatwoot-sync.test.ts` / `chatwoot-config.test.ts` accordingly.

---

### `tests/dashboard-app-isolation-guard.test.ts` (structural read-only guard)

**Analog:** `tests/webhook-isolation-guard.test.ts` (copy helpers `listScanFiles`, `resolveSpecifier`, `stripComments`, `stripTypeOnlyStatements`, lines 25-119; header `// @vitest-environment node`). Rules to keep: only `createSupabaseServiceClient` out of `@/lib/supabase`; no `.from('bookings'|'customer_profiles')` chained into insert/update/upsert/delete; no `auth.admin`; RPC allowlist (`panel_bookings` only). Add rules: closure must not include `@/lib/supabase/server`, `next/headers`, `getAdminUser`, `cookies(`. ENTRY list: `app/api/chatwoot/dashboard-app/route.ts`, `lib/chatwoot-operator.ts`, `lib/panel-bookings.ts`, `lib/panel-links.ts`, `app/embed/**`; add a SCOPE_FLOOR like lines 43-54.

### `tests/infra-vps-isolation-guard.test.ts` (modify)
Add `VPS_ASYNC_ALLOWLIST` entries (shape `{ path, reason }`, line ~88+) for route, `lib/chatwoot-operator.ts`, `lib/panel-bookings.ts` (if it names `ESPOCRM_*`), embed `page.tsx`, and document the new "operator-only request path behind a Chatwoot operator token" category in the header comment. Add `'frame-ancestors'` (and `base-uri`, `object-src` if on their own line) to `CSP_DIRECTIVE_NAMES` (line 52) so `CSP_DIRECTIVE_LINE_RE` (line 69) accepts the embed CSP lines.

### Other tests
- `tests/middleware-matcher.test.ts`: add `/embed/x.xml` enters middleware cases.
- New `tests/middleware-embed.test.ts` modeled on `tests/middleware-i18n.test.ts` / `middleware-customer.test.ts`: CSP contains `frame-ancestors https://chat.rideprestigo.com`, cookie stripped, no `updateSession`.
- `tests/chatwoot-operator.test.ts`: model on `tests/chatwoot-site-client.test.ts` (`fetch` stubs, no token/body in error text).
- Node tests: `// @vitest-environment node`; component test jsdom with redefined `window.parent` (A7).

## Shared Patterns

### No admin session / read-only
**Source:** `app/api/webhooks/chatwoot/route.ts` (no Supabase cookie client) and guard `tests/webhook-isolation-guard.test.ts`. **Apply to:** route, operator lib, panel libs, embed.

### PII-safe logging
**Source:** webhook route `log(...)` lines 22-24. **Apply to:** route, operator lib: outcome + code only.

### Env reading
**Source:** `lib/env.ts:8` `readEnv(name)` (strips trailing `\n`). **Apply to:** all CHATWOOT_*/ESPOCRM_* reads.

### Rate limiting
**Source:** `lib/rate-limit.ts` `LIMITS` + `checkRateLimit(..., { failClosed: true })` + `getClientIp`. **Apply to:** panel route.

### Security commits
`security:` prefix for route, middleware, guard, CSP work (CLAUDE.md).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `app/embed/layout.tsx` | layout | No existing standalone-root-layout / cookie-less embed route; follow RESEARCH Pattern 3 |
| `PanelClient.tsx` postMessage handshake | component | No postMessage-consuming iframe page exists; use RESEARCH Pattern 1 |
| `buildCspEmbed` | middleware helper | No `frame-ancestors` CSP exists yet; model structure on `buildCsp` |

## Metadata

**Analog search scope:** `lib/`, `app/api/`, `middleware.ts`, `next.config.ts`, `components/chat/`, `infra/chatwoot/`, `supabase/migrations/`, `tests/`
**Tracked-source check:** `git ls-files` confirmed for chatwoot-client, chatwoot-mapping, rate-limit, request-guards, env, middleware, next.config, load-chat-widget, sync.mjs, 069 migration, webhook route, guard tests.
**Pattern extraction date:** 2026-10-29
