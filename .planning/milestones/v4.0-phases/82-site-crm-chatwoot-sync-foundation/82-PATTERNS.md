# Phase 82: Site <-> CRM/Chatwoot Sync Foundation - Pattern Map

**Mapped:** 2026-10-18
**Files analyzed:** 41 new/modified (grouped below)
**Analogs found:** 38 / 41 (3 partial or none: Chatwoot fake, identity resolver SQL, erasure saga)
**All analog paths verified git-tracked** (lib/, app/, supabase/migrations/, infra/, tests/). No `.gsd/` mirror paths are used.

Phase 81 (outbox + Lead dispatcher) is the primary analog family. Rule for the planner: EXTEND, do not fork (`lib/outbox.ts`, `lib/lead-sync.ts`, `lib/outbox-store.ts`, 064/067/068).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/069_identity_and_sync_triggers.sql` | migration (tables, SECURITY DEFINER RPCs, triggers) | event-driven + CRUD | `067_bookings_lead_outbox.sql` (trigger) + `064_integration_outbox.sql` (tables/RLS/RPC/REVOKE) | exact |
| `supabase/migrations/070_outbox_admin.sql` (health/retry RPCs) | migration | request-response | `068_outbox_sweep.sql` | exact |
| `supabase/migrations/071_erasure.sql` | migration | batch/transform | `068_outbox_sweep.sql` + `064` RLS block | role-match |
| `lib/outbox.ts` (modify: `OutboxEventType`, `parseOutboxKey`) | utility | transform | itself (lines 9-36) | exact |
| `app/api/integrations/kick/route.ts` (modify: accept `sync.*`) | route | request-response | itself (line 49) | exact |
| `lib/outbox-store.ts` (modify/extend: health, retry, identity reads) | service (store) | CRUD | itself (`sweepRpc` lines 58-105, `createOutboxStore`) | exact |
| `lib/lead-sync.ts` (modify: router branches only) | service (dispatcher) | event-driven | itself (`deliver` lines 121-135, failure handling 224-265) | exact |
| `lib/crm-sync.ts` (`sync.espo` handler) | service | event-driven | `lib/lead-sync.ts` `upsertLead` / `createLead` / `deliverPurge` | exact |
| `lib/chatwoot-sync.ts` (`sync.chatwoot` handler) | service | event-driven | `lib/lead-sync.ts` + 82 fake | role-match |
| `lib/erasure.ts` (`erase.person` saga) | service | batch/event-driven | `lib/lead-sync.ts` `deliverPurge` (delete-with-404-ok loop) | partial |
| `lib/chatwoot-client.ts` | client (allowlisted) | request-response | `lib/espocrm-client.ts` (shape) + `infra/chatwoot/lib/client.mjs` (headers/redactor) | exact |
| `lib/customer-mapping.ts` | utility (pure) | transform | `infra/espocrm/lib/booking-map.mjs` (`rowToBooking`, `rowToContact`) + `lib/lead-mapping.ts` | exact |
| `lib/chatwoot-mapping.ts` | utility (pure) | transform | `lib/lead-mapping.ts` (`buildLeadFromBooking`, `diffSyncOwned`) | role-match |
| `lib/identity.ts`, `lib/identity-store.ts` | service | CRUD (RPC wrappers) | `lib/outbox-store.ts` | role-match |
| `lib/outbox-digest.ts` | service | request-response (email) | `lib/email.ts` Resend pattern + `app/api/cron/outbox-sweep/route.ts` `step()` | role-match |
| `app/api/cron/outbox-sweep/route.ts` (modify: digest step) | route (cron) | batch | itself (lines 25-78) | exact |
| `app/api/admin/outbox/**/route.ts` (health, retry, retry-all) | route | request-response | `app/api/admin/accounts/route.ts` GET | exact |
| `app/api/admin/identities/**/route.ts` (list, mark-shared, split) | route | CRUD | `app/api/admin/accounts/route.ts` POST | exact |
| `app/api/admin/erasure/**/route.ts` (preview, confirm, log) | route | request-response | `app/api/admin/accounts/route.ts` POST + `kick` route (timing-safe) | role-match |
| `app/(internal)/admin/(dashboard)/{outbox,identities,erasure}/page.tsx` | component (client page) | request-response | `.../accounts/page.tsx` | exact |
| `components/admin/{HealthBanner,OutboxTable,MergedByPhoneTable,SharedNumbersTable,SplitContactForm,MarkSharedForm,ErasureSearch,ErasurePreview,ErasureConfirmForm,ErasureAuditTable,adminFieldStyles}` | component | request-response | `KPICard`, `Modal`, `StatusBadge`, `AccountForm`, `DriversTable` | exact |
| `components/admin/AdminSidebar.tsx` (modify: 3 navItems) | component | - | itself lines 9-18 | exact |
| `infra/chatwoot/custom-attributes.json` (+ contact attrs) | config | - | existing file | exact |
| `infra/espocrm/roles.json` (Contact delete yes) | config | - | existing file line 40 | exact |
| `content/pages/{en,ru,es,fr,ar,hi,zh}/privacy.json` (+ `data-deletion.json` check) | content | - | `content/pages/en/privacy.json` | exact |
| `tests/helpers/fake-chatwoot.ts` | test helper | request-response | `tests/helpers/fake-espocrm.ts` | role-match |
| `tests/helpers/fake-espocrm.ts` (extend via `extraRoutes`) | test helper | - | itself | exact |
| `tests/crm-sync-migrations.test.ts`, `identity*.test.ts` | test (SQL-text) | - | `tests/outbox-migrations.test.ts` | exact |
| `tests/crm-sync.test.ts`, `chatwoot-sync.test.ts`, `erasure.test.ts` | test | event-driven | `tests/lead-sync.test.ts` | exact |
| `tests/outbox-admin.test.ts`, `admin-erasure.test.ts` | test | request-response | `tests/outbox-sweep.test.ts` (vi.hoisted) + admin route tests | role-match |
| `tests/infra-vps-isolation-guard.test.ts` (modify allowlist) | test | - | itself lines 29-50 | exact |
| `tests/customer-mapping-parity.test.ts` | test (parity) | transform | `tests/espocrm-booking-map.test.ts` | exact |
| `tests/chatwoot-config.test.ts` (modify: contact keys) | test | - | itself ~361-368 | exact |
| Backfill SQL (identity pass + enqueue fn) in 069 | migration fn | batch | `068` `outbox_enqueue_abandoned_purge` (INSERT..SELECT..ON CONFLICT DO NOTHING) | role-match |

## Pattern Assignments

### Migration `069_identity_and_sync_triggers.sql` (migration, event-driven + CRUD)

**Analog A (trigger):** `supabase/migrations/067_bookings_lead_outbox.sql` lines 90-166. Copy exactly: SECURITY DEFINER, `SET search_path = ''`, outer `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING`, nested block for the kick, gate via `integration_config`, REVOKE/GRANT tail, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.

```sql
CREATE OR REPLACE FUNCTION public.enqueue_booking_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_start timestamptz; v_key text;
BEGIN
  BEGIN
    ...
    v_start := (SELECT c.value FROM public.integration_config c WHERE c.key = 'lead_capture_start')::timestamptz;
    IF v_start IS NULL THEN RETURN NEW; END IF;
    v_key := 'lead.booking:' || NEW.id::text || ':' || v_new;
    PERFORM public.outbox_enqueue('lead.booking','booking',NEW.id,v_key, now() + interval '90 seconds');
    BEGIN
      PERFORM public.outbox_kick(v_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'enqueue_booking_lead kick failed: %', SQLERRM;
    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_booking_lead failed: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_booking_lead() FROM PUBLIC, anon, authenticated;
...
CREATE TRIGGER bookings_lead_outbox AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_lead();
```

Phase 82 deltas (from RESEARCH, not in analog): key `'sync.booking:' || NEW.id || ':' || (extract(epoch FROM now())::bigint / 90)`; gate key `crm_sync_start`; `UPDATE OF <column list from 063_bookings_gcal_sync_trigger.sql:90-97>` plus an `IS DISTINCT FROM OLD` body guard; early return when `NEW.anonymised_at IS NOT NULL`; leave `bookings_lead_outbox` untouched. A second trigger on `customer_profiles` (`sync.signup:<user_id>:<bucket>`, aggregate type `user`). `outbox_kick` already exists (067) and is reused; do not redefine it.

**Analog B (tables + RLS + RPC tail):** `064_integration_outbox.sql` lines 74-98, 233-244.

```sql
REVOKE ALL ON public.integration_outbox, public.integration_config FROM anon, authenticated;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_outbox_no_public_read ON public.integration_outbox FOR SELECT USING (false);
CREATE POLICY integration_outbox_no_public_insert ON public.integration_outbox FOR INSERT WITH CHECK (false);
...
REVOKE EXECUTE ON FUNCTION public.outbox_claim(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbox_claim(text, integer) TO service_role;
```

Apply to every new table (`contact_identities`, `identity_emails`, `identity_phones`, `phone_flags`, `booking_identity`) and every new function. Resolver lock: `PERFORM pg_advisory_xact_lock(hashtextextended('identity', 0))` (same primitive as 064:148). Rule: one REVOKE line per function (asserted by `tests/outbox-migrations.test.ts`), `fnCount == pinned search_path count`.

### Migration `070_outbox_admin.sql` (health / retry RPCs)

**Analog:** `068_outbox_sweep.sql` lines 60-122 (set-returning/aggregate SECURITY DEFINER functions + REVOKE/GRANT tail).

```sql
CREATE OR REPLACE FUNCTION public.outbox_due_keys(p_limit integer)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY SELECT o.idempotency_key FROM public.integration_outbox o
   WHERE (o.status = 'pending' AND o.available_at <= now())
      OR (o.status = 'processing' AND o.lease_until < now())
   ORDER BY o.available_at LIMIT least(greatest(p_limit, 1), 500);
END; $$;
```

New: `outbox_retry(p_key)` must update `status IN ('failed','pending')` (064 `outbox_reschedule` accepts only `processing`, so it cannot be reused), reset `attempts=0`, `available_at=now()`, KEEP `last_error`. `outbox_retry_failed(p_limit)` mirrors `outbox_due_keys` (cap 500) returning keys. Pitfall: DROP+CREATE re-grants PUBLIC EXECUTE, always re-run REVOKE.

### `lib/outbox.ts` (modify)

**Analog:** itself, lines 9-36. Add event types and key regexes beside the lead ones; keep `lead.*` parsing untouched.

```ts
export type OutboxEventType = 'lead.inquiry' | 'lead.booking' | 'lead.purge'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PURGE_KEY = new RegExp(`^lead\\.purge:(${UUID})$`)
export function parseOutboxKey(key: string): { eventType: OutboxEventType; aggregateId: string; leadStatus: OutboxLeadStatus | null } | null {
  if (typeof key !== 'string') return null
  let m = PURGE_KEY.exec(key)
  if (m) return { eventType: 'lead.purge', aggregateId: m[1], leadStatus: null }
```

Add: `sync.booking|signup|espo|chatwoot:<uuid>:<bucket|bf|split<n>|retry>` and `erase.person:<uuid>`; total key length <= 120 (064 CHECK). The `leadStatus` field is Lead-specific, return `null` for new types. `publishOutboxDispatch(key, {delaySeconds, dedupSuffix})` and `enqueueOutboxEvent` are reused unchanged by the resolver hop and the retry routes.

### `app/api/integrations/kick/route.ts` (modify)

**Analog:** itself line 49. Replace the single-type check:

```ts
if (parseOutboxKey(parsed.data.key)?.eventType !== 'lead.booking') {
  return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
}
```
with an allow-set `{'lead.booking','sync.booking','sync.signup'}`. Auth (`timingSafeEqual` Bearer, lines 19-26), `enforceMaxBody`, zod `.strict()` body are unchanged. Extend `tests/integrations-kick.test.ts` (referenced in RESEARCH; verify file exists, `tests/outbox.test.ts` exists).

### `lib/lead-sync.ts` (modify: router only)

**Analog:** itself. Keep `dispatchOutboxKey` as the single entry (tests import it). Add branches in `deliver()` (lines 127-135) delegating to allowlisted modules; the unknown fallthrough stays:

```ts
if (row.event_type === 'lead.inquiry') return deliverInquiry(row, d, crm, config)
if (row.event_type === 'lead.purge') return deliverPurge(row, d, crm)
await d.store.complete(key, 'failed', 'unsupported_event')
```

Reuse as-is (export the helpers rather than copy): `skip()`, `breaker()` (AUTH_BREAKER_SECONDS), `retryLater()` (backoff + `_exhausted`), `handleFailure()` classification, `deferOrFinish()`/`deferDedupSuffix`. `handleClaimed` returns `crm_unconfigured` breaker when EspoCRM is missing: for `sync.chatwoot` use a `chatwoot_unconfigured` breaker instead (do not gate Chatwoot on Espo config). Add the overall ~50 s deadline (route `maxDuration = 60`).

### `lib/crm-sync.ts` (`sync.espo` handler)

**Analog:** `lib/lead-sync.ts` lines 267-383 (lookup-by-ref, diff-PUT, POST with duplicate-check bypass, 400 relaxation ladder, 409 re-lookup).

```ts
const SKIP_DUPLICATE_CHECK = { 'X-Skip-Duplicate-Check': 'true' }
async function createLead(crm, body) {
  const attempts = [body]                       // 1 full, 2 without phone, 3 email->description, 4 minimal
  ...
  for (let i = 0; i < attempts.length; i++) {
    try { await crm.post('/Lead', attempts[i], SKIP_DUPLICATE_CHECK); return }
    catch (err) {
      const isLast = i === attempts.length - 1
      if (isLast || !(err instanceof SiteEspoError) || err.status !== 400) throw err
    }
  }
}
// upsert: find by ref -> if live updateLead (diffSyncOwned -> crm.put) else POST; on 409 re-find and converge
```

Lookup query style (copy, always `encodeURIComponent`):
`/Contact?select=id&maxSize=1&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${q(email)}`.

Imports to mirror: `classifyEspoError, createSiteEspoClient, loadSiteEspoConfig, SiteEspoError` from `@/lib/espocrm-client`; `diffSyncOwned, normalizeLeadEmail, leadPhone, splitName, adminLink, bookingLeadAmountEur` from `@/lib/lead-mapping`. State-convergent rule (lead-sync.ts:156-159): build from the CURRENT Supabase state of the person, never from the event key. Contact phone written only when empty. CBooking idempotency key `supabaseBookingId`; Contact key = normalised email. `SiteEspoClient.put/del` take no headers (Pitfall 11); 404 on DELETE is success (lead-sync.ts:212-219).

### `lib/chatwoot-client.ts` (new, allowlisted)

**Analog:** `lib/espocrm-client.ts` for the TS shape (config loader that never throws, error class with path sans query, `classify*Error`, poisoned-on-401/403, `AbortSignal.timeout` + `Promise.race`, `redirect: 'error'`, no message retained) and `infra/chatwoot/lib/client.mjs` for Chatwoot specifics. **Port, do not import** (`infra/**` is not importable from `lib/`).

```ts
// espocrm-client.ts 96-143 (copy structure)
const signal = AbortSignal.timeout(timeoutMs)
const timedOut = new Promise<never>((_r, reject) => { signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }) })
const res = await Promise.race([fetchImpl(url, { method, headers, body: payload, redirect: 'error', signal }), timedOut])
if (status < 200 || status >= 300) { if (status === 401 || status === 403) poisoned = true; throw new SiteEspoError(method, path, status) }
```
```js
// client.mjs 25, 141-142, 149: Chatwoot-specific
export const AUTH_HEADER = 'api-access-token'      // hyphen: the proxy drops underscore headers (live finding)
const resolveUrl = (apiPath) => `${root}${apiPath.startsWith('/api/') ? apiPath : `/api/v1/accounts/${accountId}${apiPath}`}`
headers: { [AUTH_HEADER]: token, Accept: 'application/json', ...headers }
```
Env: `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN` (loaded from `process.env` only, https required, account id `^\d+$`; client.mjs 68-106 validation). Add `classifyChatwootError`: 0/429/5xx transient; 401/403 auth; 404 not_found; 422 permanent EXCEPT 422 on DELETE = transient (contact online). Error text must carry method, path without query, status only (a filter query holds an email). Do not copy the file-reading `~/.config` fallback or `makeRedactor` body echo to the server (status-only errors are stricter).

### `lib/customer-mapping.ts` / `lib/chatwoot-mapping.ts` (pure mappers)

**Analog:** `infra/espocrm/lib/booking-map.mjs` (pinned enums lines 20-45, `SYNCED_BOOKING_FIELDS`, `rowToBooking` 287, `rowToContact` 274, `isAbandonedCheckout` 122, `amountEur` 103, `normalizeContactPhone` 247 is BACKFILL-ONLY: never port its +420 guessing) and `lib/lead-mapping.ts` (`diffSyncOwned` 454-463, `normalizeLeadEmail` 173-179, `bookingLeadAmountEur` 379).

```ts
export function normalizeLeadEmail(raw) { // lead-mapping.ts:173
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email === '' || !email.includes('@')) return null
  if (email.endsWith('@gnet.local')) return null
  return email
}
```
Identity normaliser = this + reject `@erased.invalid`; phone = `normalizePhone` from `lib/phone.ts` only. Parity test: `buildCBookingDraft(row)` equals `rowToBooking(row)` (minus contactId/accountId), as in RESEARCH Code Examples. Chatwoot attribute values: strings only; no currency token in any `infra/chatwoot/*.json|md`.

### `lib/outbox-store.ts` (extend)

**Analog:** itself. Two shapes. Interface-member reads via `createOutboxStore(client?)` with the per-method `try { ... if (error) throw new Error('select') } catch { throw new OutboxStoreError('db_error') }` (lines 123-135, 175-183), and standalone RPC wrappers for admin/sweep via `sweepRpc` (58-66):

```ts
async function sweepRpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  try { const { data, error } = await createSupabaseServiceClient().rpc(fn, args); if (error) throw new Error('rpc'); return data }
  catch { throw new OutboxStoreError('db_error') }
}
export async function dueKeys(limit: number): Promise<string[]> { ... }
```
Add `outboxHealth()`, `retryOutboxEvent(key)`, `retryFailedOutbox(limit)` the same way. Keep the dispatcher's `OutboxStore` interface growth minimal (tests build in-memory doubles; see `makeStore` in `tests/lead-sync.test.ts`). No CRM import in this file.

### `app/api/admin/outbox/**`, `identities/**`, `erasure/**` (admin routes)

**Analog:** `app/api/admin/accounts/route.ts`. Guard order, body parse and zod pattern:

```ts
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody, safeString, safeEmail } from '@/lib/request-guards'

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 20_000); if (tooBig) return tooBig
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
```
Project 400-vs-422 two-step rule (memory "API route patterns"): 400 malformed JSON/shape, 422 semantic failure (e.g. invalid phone, number already shared). Note accounts route currently returns 400 for zod issues; follow the project rule for new routes. Errors: `console.error('[admin/x.METHOD] ...:', err.message)` with codes only, never PII; `/api/admin` is Origin-strict CSRF in `middleware.ts:9-29` (no code needed). Routes must NOT import `lib/crm-sync`, `chatwoot-*`, `erasure` or `espocrm-client` (isolation guard transitive check): they write Supabase RPCs and call `publishOutboxDispatch`/`enqueueOutboxEvent` only. Retry route publish batching: `PUBLISH_BATCH = 10` + `Promise.all(... .catch(() => false))` from the sweep (outbox-sweep lines 53-64) with `dedupSuffix: 'r' + epoch`.

Erasure confirm: timing-safe compare copied from `kick/route.ts:19-26` (`Buffer.from(...)` equal length + `timingSafeEqual`), HMAC via `createHmac('sha256', key)` as in `lib/chatwoot-identity.ts:9-11`:
```ts
export function computeIdentifierHash(secret: string, identifier: string): string {
  return createHmac('sha256', secret).update(identifier).digest('hex')
}
```
User deletion precedent: `supabase.auth.admin.deleteUser(userId)` (accounts route line 186).

### `app/api/cron/outbox-sweep/route.ts` (modify: digest step)

**Analog:** itself. Add a `step('digest_failed', errors, ...)` BEFORE the re-publish (RESEARCH: count before re-publish) and never let it block publishing:

```ts
async function step<T>(code: string, errors: string[], run: () => Promise<T>): Promise<T | null> {
  try { return await run() } catch { errors.push(code); return null }
}
const failed = await step('failed_count_failed', errors, () => recentFailedCount(FAILED_WINDOW_HOURS))
if (failed) console.error(`[outbox-sweep] ALERT failed_last_${FAILED_WINDOW_HOURS}h=${failed}`)
```
The route must import no CRM code. Digest module imports Resend per `lib/email.ts` (`MANAGER_EMAIL`); counts + one link only. Extend `tests/outbox-sweep.test.ts` (vi.hoisted + `vi.mock('@/lib/outbox-store', async (importOriginal)=>({...actual, ...}))`).

### `app/(internal)/admin/(dashboard)/{outbox,identities,erasure}/page.tsx` and `components/admin/*`

**Analog:** `app/(internal)/admin/(dashboard)/accounts/page.tsx` + `components/admin/{KPICard,Modal,StatusBadge,AccountForm,DriversTable}`. Client page, fetch in `useEffect`, h1 style, bordered table wrapper:

```tsx
'use client'
useEffect(() => {
  fetch('/api/admin/accounts').then(res => (res.ok ? res.json() : null)).then(data => { if (data?.accounts) setAccounts(data.accounts) }).catch(() => {}).finally(() => setLoading(false))
}, [])
<h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '28px', fontWeight: 400, color: 'var(--offwhite)', letterSpacing: '0.08em', margin: 0 }}>
<div style={{ width: '100%', border: '1px solid var(--anthracite-light)', borderRadius: '4px', overflow: 'hidden' }}>
<th style={{ padding: '0 12px', fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.4em', color: 'var(--warmgrey)' }}>
```
**Deviations required by 82-UI-SPEC (override the analog):** header/body rows 48px, cell padding 16px (accounts uses 40px header/12px padding, do not copy); wrapper `overflow-x: auto` with table `min-width: 720px` (accounts uses `overflow:hidden`); primary button `background: var(--copper); color: var(--anthracite)` (accounts hard-codes `#B87333`/`#F5F2EE`, do not copy); weights 400/500 only; Modal reused unchanged (`<Modal isOpen onClose title>`); `StatusBadge` variants map per UI-SPEC Color table (`variant` is a closed union, do not add); `KPICard({label,value,subLabel})` unchanged. Copy `AccountForm` `inputBaseStyle/labelStyle/errorStyle` verbatim into new `components/admin/adminFieldStyles.ts`. `submittingRef` double-submit guard from `AccountForm`. English literals, no i18n. Sidebar: append `{ href: '/admin/outbox', label: 'Outbox' }`, `/admin/identities`, `/admin/erasure` after `Stats` in `navItems` (AdminSidebar.tsx lines 9-18).

### `infra/espocrm/roles.json`, `infra/chatwoot/custom-attributes.json` (config)

**Analog:** the files themselves. `roles.json:40` currently `"Contact": { "create": "yes", "read": "all", "edit": "all", "delete": "no" }` -> `delete: yes`; apply via `node infra/espocrm/sync.mjs --only roles`, prove with `verify-acl.mjs`; extend `tests/espocrm-roles.test.ts`. Chatwoot: add `contact` attribute definitions (keys `next_trip`, `trip_count`, `last_trip_date`, `repeat_customer`, `lifetime_value`, `crm_contact_url`, `admin_bookings_url`); update `tests/chatwoot-config.test.ts:361-368` (asserts contact keys equal exactly `["site_locale"]`, `display_type` text|link). Pre-commit `scripts/qa/chatwoot_price_gate.mjs` rejects currency words/symbols in `infra/chatwoot/*.json|md` (no "EUR"/"CZK" display names or README lines).

### `content/pages/<locale>/privacy.json` (7 locales)

**Analog:** `content/pages/en/privacy.json` (sections 2-8 shape `sectionN.*`, `items[]`, `providers[]`); page `app/[locale]/privacy/page.tsx` via `getPageContent('privacy', locale)`. Follow the key-by-key contract in 82-UI-SPEC "Public Privacy Policy". Before editing: read `.planning/phases/77-chatwoot-deployment-core-channels/freeze/77-05.freeze` and update deliberately. Translate in-session (Translate workflow disabled; never `scripts/i18n-translate.mjs --dry-run`). Owner must confirm the "10 years" legal claim (RESEARCH Open Question 2) before shipping. Check `ar` RTL. Commit with the project i18n rule (real translations in all locales).

### Tests

- **SQL-text tests** (`tests/crm-sync-migrations.test.ts`): copy `tests/outbox-migrations.test.ts` lines 1-58 verbatim helper `load()` (strips `--` comments), per-function `REVOKE ... FROM PUBLIC, anon, authenticated` `it.each`, `search_path` pinned count == function count, `ON CONFLICT`, RLS checks, `last_error` regex.
- **Dispatcher tests** (`tests/crm-sync.test.ts`, `chatwoot-sync.test.ts`, `erasure.test.ts`): copy `tests/lead-sync.test.ts` scaffolding: `// @vitest-environment node`, `createFakeEspoCRM`, `makeStore()` in-memory store with 064 claim semantics, `createSiteEspoClient({config, fetchImpl: fake.fetch})`, `dispatchOutboxKey(key, deps)` with fixed `NOW`.
- **Fake Chatwoot:** model on `tests/helpers/fake-espocrm.ts` (`FakeEspoOptions` with `extraRoutes`, `stallPaths`, state object). Header rule in that file: extend only across waves. Needs contacts CRUD with 422 uniqueness (email case-insensitive, phone, identifier), `POST /contacts/filter`, merge, DELETE (+ "online" 422), shallow `custom_attributes` merge. Filter payload shape is ASSUMED: probe live in Wave 0.
- **Isolation guard** (`tests/infra-vps-isolation-guard.test.ts` lines 29-50): add `{ path, reason }` entries for `lib/chatwoot-client.ts`, `lib/crm-sync.ts`, `lib/chatwoot-sync.ts`, `lib/erasure.ts`; reason must name the async mechanism ("QStash-invoked outbox dispatcher ... never on a page render or a booking/payment/contact request path"). Guard flags any file matching `CHATWOOT_*`/`ESPOCRM_*`, `chat|crm.rideprestigo.com`, or importing a file that does. Build the CRM link from `ESPOCRM_BASE_URL`, never from a host literal.
- **Sweep test:** extend `tests/outbox-sweep.test.ts` (shape above).

## Shared Patterns

### Admin auth + CSRF + input
**Source:** `app/api/admin/accounts/route.ts` lines 22-26, 124-144; `lib/supabase/server.ts` `getAdminUser()`; `middleware.ts:9-29`.
**Apply to:** every `app/api/admin/{outbox,identities,erasure}/**` route. Order: `enforceMaxBody` -> `getAdminUser` (401, 403) -> JSON parse (400) -> zod (400/422).

### Ids-only outbox rows, payload-free logs
**Source:** `lib/outbox.ts` (header), `lead-sync.ts:62-68`, `064` header.
**Apply to:** all new event types, handlers, digest. `last_error` codes match `^[a-z0-9_]{1,40}$`. Log shape: `[x] key=<key> outcome=<o> code=<c>`. Never log email/phone/name/response bodies.

### Failure classification + retry
**Source:** `lib/lead-sync.ts` 224-265, `lib/outbox-backoff.ts` (`AUTH_BREAKER_SECONDS`, `isTerminalAttempt`, `nextAttemptDelaySeconds`), `espocrm-client.ts` `classifyEspoError`.
**Apply to:** `crm-sync`, `chatwoot-sync`, `erasure`: transient -> `retryLater`; auth -> `breaker`; permanent -> `complete('failed')` + `ALERT` line; `OutboxStoreError` -> `db_error` retry.

### SECURITY DEFINER hygiene
**Source:** `064:233-244`, `067:154-160`, `068:114-122`.
**Apply to:** 069/070/071. `SET search_path = ''`, fully qualified `public.` names, REVOKE FROM PUBLIC, anon, authenticated then GRANT TO service_role (not for trigger functions), RLS deny-all on tables.

### Visitor-path independence
**Source:** 067 exception-safe trigger; `kick/route.ts` header; isolation guard test.
**Apply to:** triggers (never abort a booking write), admin routes (no CRM imports), signup flow.

### Timing-safe secret compare
**Source:** `app/api/integrations/kick/route.ts:19-26`, `outbox-sweep/route.ts:36-44`.
**Apply to:** erasure typed-email HMAC compare (dedicated Vercel secret, owner-run script).

### Commit rule
`CLAUDE.md`: identity-matching and erasure commits use the `security:` prefix; no `€NN` literals in `app/` or `components/` (render amounts from numbers; none are needed on admin pages).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Identity resolver RPCs (`identity_resolve_booking/user`, `identity_split`) in 069 | SQL function | transactional CRUD under global advisory lock | No existing identity/dedup SQL. Use RESEARCH "Resolution algorithm" + reference TS model parity-tested against the SQL; only the lock primitive (`064:148`) and RLS/REVOKE tail are reusable |
| `lib/erasure.ts` saga + `erasure_requests` audit table + anonymise tx (071) | service + migration | multi-system ordered saga | Closest is `deliverPurge` (find -> delete loop with 404 = success). Ordering (freeze, Chatwoot, Espo scrub-then-delete, Supabase last, verify) and PII inventory come from RESEARCH. Live schema/constraints for `bookings.client_*` must be queried first (A6/A7) |
| `tests/helpers/fake-chatwoot.ts` | test helper | request-response | Only the structural analog `fake-espocrm.ts`; Chatwoot API shapes partly ASSUMED (A3) |

## Metadata

**Analog search scope:** `lib/`, `app/api/{admin,integrations,cron}`, `app/(internal)/admin/(dashboard)/accounts`, `components/admin`, `supabase/migrations/06x`, `infra/{chatwoot,espocrm}`, `tests/` and `tests/helpers`.
**Files read:** ~20 (outbox.ts, lead-sync.ts, outbox-store.ts, espocrm-client.ts, 064/067/068, kick/dispatch/sweep routes, accounts route+page, chatwoot client.mjs, tests, isolation guard allowlist, AdminSidebar, KPICard, Modal).
**Next free migration number:** 069 (latest on disk is 068).
**Pattern extraction date:** 2026-10-18
