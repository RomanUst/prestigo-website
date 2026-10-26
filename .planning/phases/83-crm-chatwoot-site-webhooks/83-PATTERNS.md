# Phase 83: CRM/Chatwoot to Site Webhooks - Pattern Map

**Mapped:** 2026-10-26
**Files analyzed:** 41 (new + modified; see classification)
**Analogs found:** 38 / 41 (3 partial, no true exact analog for pure HMAC verification)

All analog paths below were verified git-tracked (`git ls-files`). No gitignored mirror paths are cited.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `app/api/webhooks/chatwoot/route.ts` | route (receiver) | request-response, enqueue | `app/api/integrations/dispatch/route.ts` (+ `app/api/webhooks/stripe/route.ts` for raw-body/dedup discipline) | exact (shape) |
| `app/api/webhooks/espocrm/route.ts` | route (receiver) | request-response, batch array | `app/api/integrations/dispatch/route.ts` | role-match |
| `lib/webhook-verify.ts` | utility (pure crypto) | transform | `createReceiver` use in dispatch route + RESEARCH Pattern 1 code | partial (no in-repo HMAC helper) |
| `lib/webhook-store.ts` | service (Supabase RPC wrapper) | CRUD via RPC | `lib/identity-store.ts` | exact |
| `lib/chat-store.ts` | service (Supabase RPC wrapper) | CRUD via RPC | `lib/identity-store.ts` | exact |
| `lib/sync-origin.ts` | utility (pure) | transform | `lib/outbox.ts` (`syncBucketKey`, pure key helpers) | role-match |
| `lib/chat-payload.ts` | utility (zod loose schemas) | transform | `app/api/integrations/dispatch/route.ts` (zod `safeParse`) | role-match |
| `lib/chat-classify.ts` | utility (pure) | transform | `lib/lead-mapping.ts` (pure mappers) | role-match |
| `lib/chat-intake.ts` | service (dispatcher handler) | event-driven, CRUD | `lib/lead-sync.ts` (`upsertLead`, 409 converge) + `lib/crm-sync.ts` | exact |
| `lib/chat-resolve.ts` | service (dispatcher handler) | event-driven | `lib/chatwoot-sync.ts` (`deliverChatwootSync`) | role-match |
| `lib/chat-contact.ts` | service (dispatcher handler) | event-driven | `lib/crm-sync.ts` (`deliverEspoSync`, contact 409 converge) | role-match |
| `lib/espo-contact-hook.ts` | service (dispatcher handler) | event-driven (Espo to Chatwoot) | `lib/chatwoot-sync.ts` | exact |
| `lib/outbox.ts` (modify) | utility | key grammar | itself (`SYNC_KEY`, `parseOutboxKey`) | exact |
| `lib/lead-sync.ts` (modify) | service | dispatch routing | itself (`handleClaimed` branches) | exact |
| `lib/outbox-labels.ts` (modify) | utility | label map | itself | exact |
| `lib/chatwoot-sync.ts` (modify: stamp `site_sync_fp`) | service | event-driven | itself | exact |
| `lib/crm-sync.ts` (modify: D-05 conversion hook) | service | event-driven | itself | exact |
| `lib/erasure.ts` (modify: chat Leads/Notes) | service | saga | itself (`findEspoLeads`) | exact |
| `app/api/cron/outbox-sweep/route.ts` (modify: purge step) | route (cron) | batch | itself (`step()` calls) | exact |
| `supabase/migrations/076_inbound_webhooks.sql` | migration | CRUD / RPC | `064_integration_outbox.sql`, `069_identity_core_sync_triggers.sql` | exact |
| `infra/chatwoot/labels.json` (+`no-lead`) | config | config-as-code | itself | exact |
| `infra/chatwoot/sync.mjs` (+webhooks resource), `inspect.mjs`, `webhook-probe.mjs` | script | config-as-code | `infra/chatwoot/sync.mjs`, `infra/chatwoot/probe-filter.mjs` | exact |
| `infra/espocrm/enums.json` (+Lead source), `roles.json` (+`Webhook`) | config | config-as-code | itself | exact |
| `infra/espocrm/webhook.mjs` | script | config-as-code | `infra/espocrm/lead-smoke.mjs` + `infra/espocrm/lib/client.mjs` | role-match |
| `infra/vps/runbooks/inbound-webhooks.md` | doc | n/a | `infra/vps/runbooks/lead-capture.md` | role-match |
| `infra/vps/env/chatwoot-integration.env.example` (modify) | config | n/a | itself | exact |
| `tests/webhook-verify.test.ts` | test | unit | `tests/webhooks-stripe.test.ts` (header style) + RESEARCH Pattern 1 | partial |
| `tests/webhooks-chatwoot-route.test.ts`, `tests/webhooks-espocrm-route.test.ts` | test | route | `tests/webhooks-stripe.test.ts` | role-match |
| `tests/webhook-ingest-migration.test.ts` | test | migration text | `tests/crm-sync-migrations.test.ts` | exact |
| `tests/webhook-isolation-guard.test.ts` | test | import-graph guard | `tests/infra-vps-isolation-guard.test.ts` | exact |
| `tests/infra-vps-isolation-guard.test.ts` (modify: allowlist) | test | guard | itself | exact |
| `tests/chat-intake|chat-resolve|chat-contact|espo-contact-hook|chat-classify.test.ts` | test | unit w/ fakes | `tests/chatwoot-sync.test.ts`, `tests/espocrm-sync.test.ts` | role-match |
| `tests/webhook-echo-loop.test.ts` | test | simulation | `tests/helpers/fake-chatwoot.ts` + `fake-espocrm.ts` | no analog (harness is new) |
| `tests/sync-origin.test.ts`, `tests/espocrm-webhook-script.test.ts` | test | unit | `tests/espocrm-lead-smoke.test.ts` | role-match |
| `tests/helpers/fake-chatwoot.ts`, `fake-espocrm.ts` (extend) | test helper | in-memory fake | themselves | exact |
| `tests/espocrm-roles.test.ts`, `espocrm-enums.test.ts`, `chatwoot-config.test.ts`, `outbox.test.ts` (extend) | test | config pins | themselves | exact |

## Pattern Assignments

### `app/api/webhooks/chatwoot/route.ts` and `app/api/webhooks/espocrm/route.ts` (route, request-response)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/app/api/integrations/dispatch/route.ts` (signature-first, size cap, raw read, 200 for business outcomes, 500 only when the store is down). Stripe route (`app/api/webhooks/stripe/route.ts:54-64`) is the in-repo precedent for "read raw body before parsing".

**Imports + size guard + raw-body-first** (dispatch/route.ts 1-50):
```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

export const maxDuration = 60
const MAX_BODY_BYTES = 1024

export async function POST(request: Request) {
  const sizeError = enforceMaxBody(request, MAX_BODY_BYTES)
  if (sizeError) return sizeError

  // The body must be read as text BEFORE verification: the signature covers the raw bytes.
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const signature = request.headers.get('Upstash-Signature')
  if (!signature) return new Response('Unauthorized', { status: 401 })
  ...
  let json: unknown
  try { json = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  try {
    const result = await dispatchOutboxKey(parsed.data.key)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 })
  }
}
```
Deviations for Phase 83: cap 1 MiB (`enforceMaxBody(request, 1_048_576)`), read bytes with `Buffer.from(await request.arrayBuffer())` and re-check `.length`; fail closed (401) when no secret env is configured; Espo route never answers 410, answers 503 if the store is down, 401 only for bad signature.

**Post-response publish** (lib/outbox.ts 136-142, reuse as is; for webhooks use `publishOutboxDispatch(key, { delaySeconds, dedupSuffix: 'w' })` inside `after()`):
```typescript
export function dispatchAfterResponse(key: string): void {
  try { after(() => publishOutboxDispatch(key, { dedupSuffix: 'p' })) }
  catch { console.warn('[outbox] after() unavailable, sweep will re-arm') }
}
```
**Logging:** payload-free lines only (`[outbox] ... code=...`), never name/email/phone/body.

---

### `lib/webhook-verify.ts` (utility, transform)

**Analog:** none in-repo for HMAC (Stripe/QStash use vendor SDK verifiers). Use RESEARCH.md "Pattern 1" code verbatim (`83-RESEARCH.md` lines 264-292): `safeEqual` with length check before `timingSafeEqual`, `verifyChatwoot` (signed string `"<ts>.<rawBody>"`, `sha256=` prefix, 300 s window, two-secret rotation), `verifyEspo` (header `Signature` = base64(`<webhookId>:<hex>`)). Keep the file free of env var names (VPS guard `VPS_ENV_RE` flags `CHATWOOT_*`/`ESPOCRM_*`); secrets are passed in by the route.

---

### `lib/webhook-store.ts` and `lib/chat-store.ts` (service, RPC wrapper)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/lib/identity-store.ts`

**Imports + error convention** (1-8):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { OutboxStoreError } from '@/lib/outbox-store'
// Deliberately has no CRM import (not allowlisted by the VPS isolation guard).
```
**Core wrapper** (111-123, copy exactly; `createSupabaseServiceClient` must be the ONLY symbol imported from `@/lib/supabase`, required by the HOOK-03 guard):
```typescript
export function createIdentityStore(client?: SupabaseClient): IdentityStore {
  const db = (): SupabaseClient => client ?? createSupabaseServiceClient()
  async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw new Error('rpc')
      return data
    } catch { throw new OutboxStoreError('db_error') }
  }
  return {
    async setChatwootContact(identityId, contactId) {
      const data = await rpc('identity_set_chatwoot_contact', { p_identity_id: identityId, p_contact_id: contactId })
      return data === true
    },
    ...
```
New RPCs (`webhook_ingest`, `identity_resolve_chat`, `identity_by_chatwoot_contact`, `identity_by_espo_contact`, `chat_lead_reserve`, attach-email) are wrapped the same way; validate the returned shape with `isRecord`/`asString` helpers (91-97).

---

### `lib/sync-origin.ts` (utility, pure)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/lib/outbox.ts` lines 60-76 (`syncBucketKey`) for bucket math, and the pure-helper style. Use RESEARCH lines 441-456 for `contactFingerprint` and `aggregateUuid` (v5-style uuid via `node:crypto`, only used as the `outbox_claim` mutex key).

---

### `lib/outbox.ts` (modify: key grammar for `hook.*`)

**Self-analog** (lines 9-58). Add five event types to `OutboxEventType`, and regexes next to `SYNC_KEY`:
```typescript
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SYNC_KEY = new RegExp(`^(sync\\.(?:booking|signup|espo|chatwoot)):(${UUID}):([a-z0-9]{1,24})$`)
...
m = SYNC_KEY.exec(key)
if (m) return { eventType: m[1] as OutboxEventType, aggregateId: m[2], leadStatus: null, tag: m[3] }
```
Add `HOOK_KEY = ^(hook\.(?:chat_intake|chat_resolve|chat_label|chat_contact|espo_contact)):(UUID):([a-z0-9]{1,24})$` returning `{ eventType, aggregateId, leadStatus: null, tag }`. Total key length <= 120 (RPC CHECK, 064:28). Extend `tests/outbox.test.ts` for round-trip. Also extend `lib/outbox-labels.ts` (`outboxEventLabel` + error hints), which is the admin retry route's gate.

---

### `lib/lead-sync.ts` (modify: dispatch branches)

**Self-analog** `handleClaimed` (approx. lines 150-200, see `if (row.event_type === 'sync.chatwoot')` block). Copy the branch shape:
```typescript
if (row.event_type === 'sync.chatwoot') {
  if (!d.chatwootConfig || !d.chatwoot) return breaker(row, 'chatwoot_unconfigured', d)
  try {
    return await deliverChatwootSync(row, d, d.chatwoot, d.chatwootAdmin)
  } catch (err) {
    return handleFailure(row, err, d)
  }
}
```
New `hook.chat_*` branches need BOTH `d.crm`+`d.config` and `d.chatwoot` (breaker codes `crm_unconfigured` / `chatwoot_unconfigured`); `hook.espo_contact` same. Place them before the generic "every other branch needs the CRM" fallthrough. `run()` already gates on `parseOutboxKey` (line ~101 `unknown_key`), so the grammar must land first. Use `skip`, `breaker`, `retryLater` from `lib/dispatch-outcomes.ts` (lines 21-46).

---

### `lib/chat-intake.ts`, `lib/chat-resolve.ts`, `lib/chat-contact.ts`, `lib/espo-contact-hook.ts` (dispatcher handlers)

**Primary analogs:** `/Users/romanustyugov/Desktop/Prestigo/lib/chatwoot-sync.ts` (handler skeleton, deadline guard, DispatchDeps, state-convergent re-read) and `/Users/romanustyugov/Desktop/Prestigo/lib/lead-sync.ts` (Lead upsert with 409 converge).

**Handler skeleton** (chatwoot-sync.ts 1-70):
```typescript
import type { OutboxRow } from '@/lib/outbox-store'
import { skip, type DispatchResult } from '@/lib/dispatch-outcomes'
import { SiteChatwootError, type SiteChatwootClient } from '@/lib/chatwoot-client'
import type { DispatchDeps } from '@/lib/lead-sync'

const DEADLINE_MS = 45_000
const DEADLINE_RESCHEDULE_SECONDS = 5
class DeadlineError extends Error { constructor() { super('deadline'); this.name = 'DeadlineError' } }

export async function deliverChatwootSync(row, d, client, admin): Promise<DispatchResult> {
  const startMs = d.now().getTime()
  const guard = () => { if (d.now().getTime() - startMs >= DEADLINE_MS) throw new DeadlineError() }
```
Docblock convention to copy: "State-convergent: the row's key only says X changed. Every run re-reads CURRENT state ... Logs carry the key (ids only), outcome and code; never a name, email, phone or body."

**Lead upsert with race convergence** (lead-sync.ts 407-433):
```typescript
async function upsertLead(crm, config, draft) {
  const live = await findLeadByRef(crm, draft)
  if (live) { await updateLead(crm, draft, live); return }
  const body = { ...draft.create }
  if (config.leadAssigneeId) body.assignedUserId = config.leadAssigneeId   // D-13: assignee on create only
  ...
  try { await createLead(crm, body) } catch (err) {
    if (!(err instanceof SiteEspoError) || err.status !== 409) throw err
    const raced = await findLeadByRef(crm, draft)
    if (!raced) throw err
    await updateLead(crm, draft, raced)
  }
}
```
Chat Leads use a unique per-Lead `cSupabaseRef` (`chat:<firstConversationUuid>`), same 409-converge. Contact creation 409-converge: `lib/crm-sync.ts` ~263-295 and ~478. Reuse `createSiteEspoClient`/`createSiteChatwootClient` (hardened clients), `splitName`/`sanitizeText` from `lib/customer-mapping.ts`, `normalizePhone` from `lib/phone.ts`. Errors classify through `classifyEspoError` / `classifyChatwootError` and flow to `handleFailure` in lead-sync.

**Note write (HOOK-02):** `POST /Note` with camelCase `type/parentType/parentId/post` (RESEARCH 492-501, assumption A5; live smoke required).

**Never import** `saveBooking`, `buildBookingRow*`, `reconcile*`, `captureUnpaidBooking`, `saveRoundTripBookings`, or write `.from('bookings')` / `.from('customer_profiles')` / `auth.admin` (HOOK-03 guard).

---

### `lib/chatwoot-sync.ts` (modify: `site_sync_fp`)

**Self-analog.** Stamp `custom_attributes.site_sync_fp = contactFingerprint(<post-write name,email,phone,identifier>)` in the same PUT/POST as every site write. `tests/chatwoot-mapping.test.ts` pins the 7 owned attribute keys (`CHATWOOT_SYNCED_ATTRIBUTE_KEYS` in `lib/chatwoot-mapping.ts`): keep `site_sync_fp` out of that list or update the pin deliberately.

### `lib/crm-sync.ts` (modify: D-05 conversion)
**Self-analog.** Hook the paid-booking path in `deliverEspoSync` to set the person's open chat Lead to Converted once, linking booking reference + admin link; idempotent via a Lead lookup by `cSupabaseRef`.

### `lib/erasure.ts` (modify)
**Self-analog:** `findEspoLeads(ctx)` at ~329-340 (iterates request emails, `ctx.req.inquiryIds.map(leadRefForInquiry)`, `bookingIds.map(leadRefForBooking)`). Add chat Lead refs from `chat_leads`; scrub Notes parented on Contact/Lead; extend `tests/erasure.test.ts`.

---

### `supabase/migrations/076_inbound_webhooks.sql` (migration)

**Analogs:** `064_integration_outbox.sql` (table + outbox_enqueue), `069_identity_core_sync_triggers.sql` (deny-all RLS, REVOKE/GRANT). Next free number is 076.

**Deny-all RLS table** (069:104-123):
```sql
REVOKE ALL ON public.contact_identities FROM anon, authenticated;
ALTER TABLE public.contact_identities ENABLE ROW LEVEL SECURITY;
-- loop: EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (false)', t || '_no_public_read', t);
```
**SECURITY DEFINER RPC shape + grants** (064:101-125, 236-244):
```sql
CREATE OR REPLACE FUNCTION public.outbox_enqueue(...) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ ... ON CONFLICT (idempotency_key) DO NOTHING; ... $$;
REVOKE EXECUTE ON FUNCTION public.outbox_enqueue(text, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.outbox_enqueue(text, text, uuid, text, timestamptz) TO service_role;
```
Use RESEARCH lines 461-488 for `webhook_deliveries` + `webhook_ingest`. Relax `identity_emails.basis` CHECK to add `'chat'` (069:65; live constraint name unconfirmed, A6: orchestrator must verify). Identity resolve for chat must take the same global advisory lock `pg_advisory_xact_lock(hashtextextended('identity', 0))` and call `identity_resolve_core(email, phone, 'chat', NULL)`. Re-run REVOKE after every DROP+CREATE (project memory: function PUBLIC EXECUTE gotcha). Gate on new `integration_config` key `chat_hooks_start`, fail-closed (mirrors `lead_capture_start` / `crm_sync_start`). Executors have no Supabase MCP: orchestrator applies and smokes.

---

### `tests/webhook-ingest-migration.test.ts` (test, migration text)

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/tests/crm-sync-migrations.test.ts` (1-45):
```typescript
// @vitest-environment node
function load(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
    .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
}
function fnBody(name: string): string {
  const start = m069.indexOf(`FUNCTION public.${name}(`)
  expect(start, `function ${name} not found`).toBeGreaterThan(-1)
  const rest = m069.slice(start + 10)
  const next = rest.search(/CREATE OR REPLACE FUNCTION|REVOKE EXECUTE/)
  return m069.slice(start, next === -1 ? undefined : start + 10 + next)
}
const FUNCTION_SIGNATURES = ['identity_normalize_email(text)', ...]
```
Assert per new function: REVOKE line + GRANT service_role; body has no INSERT/UPDATE/DELETE on `bookings`, `customer_profiles`, `auth.users`; tables have RLS + deny-all policy.

---

### `tests/webhook-isolation-guard.test.ts` and VPS guard allowlist

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/tests/infra-vps-isolation-guard.test.ts` — reuse `extractImportSpecifiers` (172-189), `resolveSpecifier` (196-215), reverse-graph BFS in `findVpsViolations` (228+), file walker (scan dirs `app, components, lib, i18n`). Copy those pure helpers (or extract to `tests/helpers/`) and assert the transitive closure of both receivers + every `hook.*` handler excludes the booking-writer imports and `.from('bookings'|'customer_profiles')`; only `createSupabaseServiceClient` may be imported from `@/lib/supabase`.

**VPS allowlist entry format to add** (88-130; every new file naming `CHATWOOT_*`/`ESPOCRM_*` or importing a flagged file):
```typescript
{
  path: 'lib/chat-intake.ts',
  reason: 'QStash-invoked outbox dispatcher handler (hook.chat_intake): runs only when Upstash calls /api/integrations/dispatch with a signed message, never on a page render or a booking/payment/contact request path; reachable only from lib/lead-sync.ts',
},
```
Receivers need entries too (reason: server-to-server inbound webhook route that only verifies and enqueues, makes no VPS call, never on a visitor request path). Reason >= 20 chars; paths must exist. Do NOT rename env vars to dodge `VPS_ENV_RE`.

---

### `tests/webhooks-chatwoot-route.test.ts` / `webhooks-espocrm-route.test.ts`

**Analog:** `/Users/romanustyugov/Desktop/Prestigo/tests/webhooks-stripe.test.ts` (1-40): `vi.hoisted` stubs, `next/server` `after` mock, `vi.mock('@/lib/supabase', ...)` returning a stub `createSupabaseServiceClient`. Add `// @vitest-environment node`, build signed fixtures with fake secrets via `createHmac` in the test (never real secrets).

---

### `infra/chatwoot/*`, `infra/espocrm/*` (config-as-code)

- `infra/chatwoot/labels.json`: append in the exact entry shape `{ "title": "no-lead", "description": "...", "color": "#BFA06A", "show_on_sidebar": true }` (price-free; `tests/chatwoot-config.test.ts` pins).
- `infra/chatwoot/sync.mjs` (+`webhooks` resource), `inspect.mjs` (+`--print webhook-secret`), new `webhook-probe.mjs`: follow `infra/chatwoot/sync.mjs` + `lib/client.mjs` + `probe-filter.mjs` (tested by `tests/chatwoot-probe-filter.test.ts`, `chatwoot-inspect.test.ts`).
- `infra/espocrm/roles.json` "Sync writer" (lines 33-44): add `"Webhook": true` (and extend `tests/espocrm-roles.test.ts` + `verify-acl.mjs`). Webhook must be created AS `prestigo-sync` so `skipOwn` sticks.
- `infra/espocrm/enums.json` Lead.source: add `"Website chat"`, `"Telegram"` (`retire: []`); `tests/espocrm-enums.test.ts`.
- `infra/espocrm/webhook.mjs`: model on `infra/espocrm/lead-smoke.mjs` + `lib/client.mjs`; test like `tests/espocrm-lead-smoke.test.ts` using `tests/helpers/fake-espocrm.ts` (extend with Webhook CRUD incl. `skipOwn` rule, Note, Lead lookup).

### `app/api/cron/outbox-sweep/route.ts` (modify)
Add an isolated purge step in the existing style (lines 51-72):
```typescript
const expired = await step('expired_failed', errors, () => enqueueExpiredUnpaid())
```
New: `await step('webhook_purge_failed', errors, () => purgeWebhookDeliveries())` (Chatwoot rows > 7 d, EspoCRM > 30 d). Extend `tests/outbox-sweep.test.ts`.

### `middleware.ts` (no change)
Add a test (extend `tests/middleware-csrf-forms.test.ts`) pinning that `/api/webhooks/*` is not in `CSRF_PROTECTED_PREFIXES`.

---

## Shared Patterns

### Fail-closed, signature-first, payload-free logging
**Source:** `app/api/integrations/dispatch/route.ts` 30-67 and `lib/outbox.ts` 121-127 (`[outbox] ... code=...` lines, status/error class only).
**Apply to:** both receivers, all handlers.

### Ids-only outbox + payload is a hint (re-read source)
**Source:** `lib/chatwoot-sync.ts` docblock (state-convergent re-read), `lib/outbox.ts` (keys carry ids only; `aggregate_id` is `uuid NOT NULL`, Chatwoot integer ids go in the key tag via `aggregateUuid`).
**Apply to:** all `hook.*` handlers and the receivers' enqueue.

### Dispatcher outcomes and retries
**Source:** `lib/dispatch-outcomes.ts` 21-46 (`skip`, `breaker`, `retryLater`).
**Apply to:** every new handler branch; configuration missing -> `breaker`, never a quick retry.

### Supabase RPC wrapper (deny-all tables, service role only)
**Source:** `lib/identity-store.ts` 111-123; migrations 064/069 grant/RLS blocks.
**Apply to:** `webhook-store.ts`, `chat-store.ts`, migration 076.

### Hardened upstream clients
**Source:** `lib/espocrm-client.ts` (`createSiteEspoClient`, `classifyEspoError`), `lib/chatwoot-client.ts` (`createSiteChatwootClient`, `classifyChatwootError`). Handlers must never use raw `fetch`.

### Structural barrier (HOOK-03)
**Source:** `tests/infra-vps-isolation-guard.test.ts` helpers; `tests/crm-sync-migrations.test.ts` text-contract style.
**Apply to:** `tests/webhook-isolation-guard.test.ts`, `tests/webhook-ingest-migration.test.ts`, plus a runtime tripwire client double that throws on `bookings` / `customer_profiles` / non-allowlisted RPC.

### Commit and test conventions (CLAUDE.md)
`security:` commit prefix for verification/echo-prevention work; each new test file starts `// @vitest-environment node`; no secrets in commits; secret names only (empty values) in `infra/vps/env/chatwoot-integration.env.example`; `npx vitest run <files>`, `npx tsc --noEmit` (8 baseline errors in tests/), `npx eslint --quiet <files>`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/webhook-verify.ts` | utility | HMAC verify | No in-repo hand-written HMAC verifier (Stripe/QStash use vendor SDKs); use RESEARCH Pattern 1 code. The Stripe route's raw-body discipline is the closest behavioural precedent. |
| `tests/webhook-echo-loop.test.ts` | test | simulation | No existing multi-system loop harness; compose `tests/helpers/fake-chatwoot.ts` + `fake-espocrm.ts` extended to emit signed webhooks on writes (per RESEARCH Pattern 4 proof). |
| Chatwoot messages/conversations API in `fake-chatwoot.ts` | test helper | fake | Fake currently models contacts only (`FakeChatwootState = { contacts, nextId }`); conversations, message paging, labels, inboxes are new. Keep the fake's conventions: `intercept` hook, lower-cased headers, `api-access-token` header check, 422 on unique violations. |

## Metadata

**Analog search scope:** `app/api`, `lib`, `supabase/migrations`, `infra/chatwoot`, `infra/espocrm`, `tests`, `tests/helpers`
**Files scanned/read:** ~14 read in part or whole; ~60 listed via git
**Pattern extraction date:** 2026-10-26
