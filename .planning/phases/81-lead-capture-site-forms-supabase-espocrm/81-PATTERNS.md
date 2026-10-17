# Phase 81: Lead Capture - Pattern Map

**Mapped:** 2026-10-18
**Files analyzed:** 27 new/modified
**Analogs found:** 25 / 27 (all analog paths verified git-tracked)

Decisions D-19..D-22 applied: round trip = ONE Lead keyed by outbound leg (return leg never enqueues; Lead mentions both refs); purge only `booking_source='online'`; forward-only via `lead_capture_start`; Lead ACL: Dispatcher none, Sales manager full, Sync writer full incl. delete.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/064_integration_outbox.sql` | migration | queue | `038_quote_leads.sql` (table+RLS) + `063_..._gcal_sync_trigger.sql` (SECURITY DEFINER/REVOKE) | role-match |
| `supabase/migrations/065_inquiries.sql` | migration | CRUD + trigger | `038_quote_leads.sql` | exact |
| `supabase/migrations/066_bookings_lead_channel_trigger.sql` | migration | event-driven | `063_bookings_gcal_sync_trigger.sql` | exact |
| `lib/outbox.ts` | service | event-driven | `lib/qstash.ts` | role-match |
| `lib/outbox-backoff.ts` | utility | transform | none (pure fn) | no analog |
| `lib/inquiries.ts` | service | CRUD (best-effort) | `lib/qstash.ts` (never-throws) | partial |
| `lib/lead-mapping.ts` | utility | transform | `infra/espocrm/lib/booking-map.mjs` | role-match |
| `lib/espocrm-client.ts` | service | request-response | `infra/espocrm/lib/client.mjs` | exact (port to TS) |
| `lib/lead-sync.ts` | service | event-driven | `app/api/cron/reminder-2h/route.ts` (re-read, skip, 200) | partial |
| `app/api/integrations/dispatch/route.ts` | route | event-driven | `app/api/cron/reminder-2h/route.ts` | exact |
| `app/api/integrations/kick/route.ts` | route | request-response | `reminder-24h` Bearer guard | role-match |
| `app/api/cron/outbox-sweep/route.ts` | route | batch | `app/api/cron/reminder-24h/route.ts` | exact |
| `app/api/contact/route.ts` (mod) | route | request-response | itself | n/a |
| `app/api/corporate-contact/route.ts` (mod) | route | request-response | itself | n/a |
| `app/api/submit-multiday-quote/route.ts` (mod) | route | request-response | itself | n/a |
| `app/api/admin/bookings/route.ts` (mod: `channel` -> `lead_channel`) | route | CRUD | itself (`manualBookingSchema` L871, insert L1098) | n/a |
| `components/admin/ManualBookingForm.tsx` (mod) | component | form | itself | n/a |
| `components/ContactForm.tsx`, `app/[locale]/corporate/CorporateForm.tsx`, `components/booking/MultiDayForm.tsx` (mod: D-16 notice) | component | form | itself | n/a |
| `messages/{en,ru,es,fr,ar,hi,zh}.json` (mod) | config | i18n | `ChatLauncher` namespace (commit 084b18a0) | exact |
| `vercel.json` (mod) | config | cron | existing 3 cron entries | exact |
| `infra/espocrm/{fields,enums,roles,entities}.json` (mod) | config | config-as-code | same files (CBooking fields, Opportunity enum, roles) | exact |
| `infra/espocrm/overlay.mjs` (+overlay/Lead.entityDefs.json) | config | config-as-code | itself (hard-coded CBooking) | exact |
| `tests/infra-vps-isolation-guard.test.ts` (mod allowlist) | test | static scan | itself, `VPS_ASYNC_ALLOWLIST` | exact |
| `tests/inquiry-routes.test.ts` | test | request-response | `tests/corporate-contact.test.ts` | exact |
| `tests/inquiry-notice-i18n.test.ts` | test | fs parity | `tests/chat-launcher-i18n.test.ts` | exact |
| `tests/lead-sync.test.ts`, `espocrm-site-client.test.ts` | test | fake-server | `tests/helpers/fake-espocrm.ts` | role-match |
| `tests/integrations-dispatch.test.ts` | test | signature | existing reminder-2h test (grep `tests/`) | role-match |

## Pattern Assignments

### `supabase/migrations/065_inquiries.sql` (migration, CRUD)
**Analog:** `supabase/migrations/038_quote_leads.sql` (L6-34)
```sql
CREATE TABLE IF NOT EXISTS public.quote_leads ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ... created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.quote_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quote_leads_no_public_read ON public.quote_leads;
CREATE POLICY quote_leads_no_public_read ON public.quote_leads FOR SELECT USING (false);
DROP POLICY IF EXISTS quote_leads_no_public_insert ON public.quote_leads;
CREATE POLICY quote_leads_no_public_insert ON public.quote_leads FOR INSERT WITH CHECK (false);
```
Copy structure, but: NO `ip`/`user_agent` columns (D-17), no purge, add `kind`, `payload jsonb`, `email_normalized` + index (Phase 82 erasure). Never reuse `quote_leads`.

### `supabase/migrations/064` and `066` (migrations, event-driven)
**Analog:** `063_bookings_gcal_sync_trigger.sql`

Vault read + pg_net kick (L21-50):
```sql
CREATE OR REPLACE FUNCTION public.gcal_sync_post(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sync_url text; sync_secret text;
BEGIN
  SELECT decrypted_secret INTO sync_url FROM vault.decrypted_secrets WHERE name = 'gcal_sync_url';
  ...
  IF sync_url IS NULL OR sync_secret IS NULL OR p_booking_id IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := sync_url, body := jsonb_build_object('booking_id', p_booking_id),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || sync_secret),
    timeout_milliseconds := 10000);
END; $$;
```
Revoke (L84-86) and trigger (L88-98):
```sql
REVOKE EXECUTE ON FUNCTION public.gcal_sync_post(uuid) FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS bookings_gcal_sync ON public.bookings;
CREATE TRIGGER bookings_gcal_sync AFTER INSERT OR UPDATE OF status, ... ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_gcal_sync();
```
Deviations required: wrap bodies in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` (063 has none; a raise would abort the booking write). Use `outbox_enqueue()` + the research sketch (81-RESEARCH L343-401). Trigger: `AFTER INSERT OR UPDATE OF status`, skip `leg='return'` bookings (D-19), skip `created_at < lead_capture_start` (D-21). Vault names `outbox_kick_url`, `outbox_kick_secret`. Re-REVOKE `FROM PUBLIC, anon, authenticated` then GRANT to `service_role` on claim/complete RPCs (memory: DROP+CREATE re-grants PUBLIC). Add `bookings.lead_channel` (CHECK whatsapp/phone/email/partner/other) here or in 064. Use migration filenames exactly as listed.

### `app/api/integrations/dispatch/route.ts` (route, event-driven; allowlisted)
**Analog:** `app/api/cron/reminder-2h/route.ts` (L1-47)
```ts
import { Receiver } from '@upstash/qstash'
import { enforceMaxBody } from '@/lib/request-guards'
let _receiver: Receiver | null = null
function getReceiver(): Receiver { if (!_receiver) { _receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? '', nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? '' }) } return _receiver }
export async function POST(request: Request) {
  const sizeError = enforceMaxBody(request, 1024); if (sizeError) return sizeError
  const rawBody = await request.text()          // text BEFORE verify
  const signature = request.headers.get('Upstash-Signature') ?? ''
  const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false)
  if (!isValid) return new Response('Unauthorized', { status: 401 })
  const parsed = bodySchema.safeParse(JSON.parse(rawBody))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
```
Missing-source handling copies L65-68: `return NextResponse.json({ ok: true, skipped: true, reason: 'not_found' })` (200 so QStash does not retry). Body schema `z.object({ key: z.string().min(1).max(120) }).strict()`. JSON.parse should be inside try (400 on malformed). Always 200 for business outcomes.

### `app/api/cron/outbox-sweep/route.ts` (route, batch)
**Analog:** `app/api/cron/reminder-24h/route.ts` (L1-21)
```ts
import { timingSafeEqual } from 'crypto'
export const maxDuration = 300
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || !authHeader) return new Response('Unauthorized', { status: 401 })
  const expected = Buffer.from(`Bearer ${cronSecret}`); const got = Buffer.from(authHeader)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return new Response('Unauthorized', { status: 401 })
  const supabase = createSupabaseServiceClient()
```
Reuse the same guard for `integrations/kick` (with `OUTBOX_KICK_SECRET`). Sweep imports only `lib/outbox` (never the client/lead-sync). `vercel.json`: add `{ "path": "/api/cron/outbox-sweep", "schedule": "<daily>" }` alongside the 3 existing (flight-refresh 0 5, reminder-24h 0 6, indexnow 0 7).

### `lib/outbox.ts` (service, event-driven) and `lib/inquiries.ts` (service, best-effort)
**Analog:** `lib/qstash.ts` L1-53 (lazy client, fire-and-forget, never throws)
```ts
let _qstash: Client | null = null
function getQStash(): Client { if (!_qstash) { _qstash = new Client({ token: process.env.QSTASH_TOKEN ?? '' }) } return _qstash }
...
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) { console.error('[qstash] NEXT_PUBLIC_SITE_URL not set ...'); return }
  try { await getQStash().publishJSON({ url: `${siteUrl}/api/cron/reminder-2h`, delay: delaySeconds, body: {...} }) }
  catch (err) { console.error('[qstash] schedule failed ...', err) }   // D-03: log, never throw
```
`publishOutboxDispatch(key)` mirrors this: `publishJSON({ url: .../api/integrations/dispatch, body: { key }, deduplicationId, delay })`. Call from routes via `try { after(() => publishOutboxDispatch(key)) } catch {}` (`after` used at `app/api/admin/bookings/route.ts:393,431`; tests mock `next/server` after, see `tests/webhooks-stripe.test.ts:19`). `lib/inquiries.ts` `storeInquiry` follows RESEARCH L404-421 (Supabase client constructed INSIDE the try, 3 s race, log code only, no payload/IP/UA). Neither file may import `espocrm-client`/`lead-sync` or mention `ESPOCRM_`.

### `lib/espocrm-client.ts` (service, request-response; allowlisted, only file with `ESPOCRM_*`)
**Analog:** `infra/espocrm/lib/client.mjs` (apikey identity only)
Copy: header `X-Api-Key`, `fetchImpl(`${root}/api/v1${apiPath}`, { method, headers: { Accept: 'application/json', ...headers }, body, redirect: 'error', signal: AbortSignal.timeout(ms) })` (L195-205); status-0 `EspoApiError` for timeout/network; `makeRedactor()` (L146-158) and 300-char body truncation; printable-ASCII key check (L152-157); https-only base URL check; first 401 poisons the client (no retry, IP-ban risk). Drop file reads and token exchange (env only); add passthrough of extra headers (`X-Skip-Duplicate-Check: true`). Error class exposes `status` so dispatch can classify (0/5xx/429 transient, 401/403 breaker, other 4xx permanent). Log status + code only.

### `lib/lead-mapping.ts` (utility, transform)
**Analog:** `infra/espocrm/lib/booking-map.mjs` (name rule L277-279 `lastName = last || first || emailLocalPart`; `buildAdminLink` L215-217 `https://rideprestigo.com/admin/bookings?search=<ref>`). Reuse `normalizePhone` from `lib/phone.ts:67` (strict E.164, returns null). Pure functions only; status table must equal SQL `booking_lead_status()` (parity test parses migration). No hard-coded EUR strings (CLAUDE.md); amount from `bookings.amount_eur`. Drop `@gnet.local` emails and unnormalizable phones (`'unknown'`).

### `lib/lead-sync.ts` (service, event-driven; allowlisted)
**Analog (control flow):** reminder-2h route L50-73: re-read source row via `createSupabaseServiceClient()`, skip with reason when absent/irrelevant, return JSON not throw. Sequence per RESEARCH Patterns 2-4: claim RPC -> re-read -> map -> GET Lead by `cSupabaseRef` -> POST (with skip-duplicate header) or PUT sync-owned fields only -> complete. Round trip (D-19): re-read outbound row plus `linked_booking_id` return row to mention both refs; if aggregate is a return leg, mark `skipped`. Purge (D-20): delete only if still `unpaid`, `booking_source='online'`, pickup > 90 d, 404 = success.

### Form routes (modify)
**contact** (`app/api/contact/route.ts` L40-56): keep guard order (enforceMaxBody L22, checkRateLimit L25, zod L42, then `await sendContactInquiry(parsed.data)` L50, `return NextResponse.json({ ok: true })`). Insert one never-throwing `storeInquiry('contact', parsed.data)` (parallel with email via `Promise.all`) plus guarded `after(publish)`; do not change error/500 behaviour.
**corporate** (`corporate-contact/route.ts` L30): honeypot `if (parsed.data.website) return NextResponse.json({ ok: true })` stays BEFORE any store. Payload built L32-39 (`company, name, email, trips, notes`); store after honeypot; email failure path (L42-46 returns 502) unchanged. Company -> Lead `accountName` text only (D-12).
**multiday** (`submit-multiday-quote/route.ts` L159-166): `quoteReference` generated L159; store after reference generation, alongside `Promise.all([sendMultidayOperatorAlert, sendMultidayClientAck])`; response L169-178 unchanged. Store payload jsonb (days + quoteReference).
Existing tests (`tests/corporate-contact.test.ts` mocks only rate-limit + email) must stay green: storeInquiry must tolerate missing env.

### Booking hook points (no code change expected; trigger covers)
`app/api/create-payment-intent/route.ts:391` (unpaid row: `captureUnpaidBooking`/`saveBooking`), `webhooks/stripe`, `admin/bookings`, `gnet/farmin/route.ts:426-427,455-500` (placeholders + insert-then-delete duplicates), `submit-quote`. Do NOT add call-site hooks.

### `app/api/admin/bookings/route.ts` + `ManualBookingForm.tsx` (D-08)
In `manualBookingSchema` (L871, `z.object({...})`) add `channel: z.enum(['whatsapp','phone','email','partner','other'])` (required for new). Insert object (L1098 area `booking_source: 'manual', booking_type: 'confirmed'`): add `lead_channel: d.channel`. Update fixtures in `tests/admin-bookings*.test.ts`. Admin UI is English-only (no i18n). Add select field to the form following its existing field markup (read the component at plan time; admin select CSS rule: memory `project_css_patterns`).

### i18n notice (D-16)
**Analog:** `tests/chat-launcher-i18n.test.ts` L1-40 (LOCALES array of 7, `flatten()`, key-tree parity, non-EN differs from EN). Clone as `tests/inquiry-notice-i18n.test.ts`; add a namespace to all 7 `messages/*.json` with real translations (in-session), link to Privacy Policy. Never run `i18n-translate.mjs --dry-run`.

### EspoCRM config-as-code
- `roles.json` (L34-42): Sync writer data currently Account/Contact/CBooking; add `"Lead": { "create": "yes", "read": "all", "edit": "all", "delete": "all" }`. Sales manager: add same full Lead entry (L21-30 style). Dispatcher: add `"Lead": false` (L10-13 style uses `false` for hidden scopes). Test: extend `tests/espocrm-roles.test.ts`.
- `fields.json`: add `"Lead": [...]` array using CBooking entries as the shape (`name/type/maxLength/required/label`); fields `supabaseRef` (name resolves to `cSupabaseRef`; confirm via dry-run, stock scope gets `c` prefix), `bookingReference`, `adminLink` (url), `existingCustomer` (bool), plus Lead->Contact link in `entities.json`.
- `enums.json`: new entry `{ "scope": "Lead", "field": "source", "values": [...], "retire": [] }` in the Opportunity entry's shape (L3-30), values: Website booking, GNet, Contact form, Corporate form, Multi-day quote, WhatsApp, Phone (stock Email/Partner/Other kept).
- `overlay.mjs`: generalise hard-coded `CBooking`/`KEY_FIELD` to also handle `Lead` + `overlay/Lead.entityDefs.json` (unique `cSupabaseRef`+`deleteId`); owner-approved VPS step.

### Isolation guard (`tests/infra-vps-isolation-guard.test.ts` L88)
Existing entry shape:
```ts
const VPS_ASYNC_ALLOWLIST: AllowlistEntry[] = [
  { path: 'app/api/chatwoot/identity/route.ts', reason: '... (>= 20 chars, names the async mechanism)' },
]
```
Add three entries: `lib/espocrm-client.ts`, `lib/lead-sync.ts`, `app/api/integrations/dispatch/route.ts`, reasons naming "QStash-invoked outbox dispatcher, never on a synchronous request path". Guard flags files containing `ESPOCRM_*` or `crm.rideprestigo.com` and every importer; keep importers limited to the allowlisted trio.

### Tests
`tests/inquiry-routes.test.ts`: follow `tests/corporate-contact.test.ts` (L1-25): `vi.hoisted` mocks, `vi.mock('@/lib/rate-limit', () => ({ checkRateLimit, getClientIp: () => '1.2.3.4' }))`, mock email module, import `POST`; add mock of `@/lib/inquiries` and a failure case where store throws -> still 200 + email called once. Dispatcher/client tests: use `tests/helpers/fake-espocrm.ts` (extend via `extraRoutes`: Lead where-equals on `cSupabaseRef`, 409 unless `X-Skip-Duplicate-Check`). Add `// @vitest-environment node` for API/infra tests.

## Shared Patterns

- **Never-throw best-effort side effects:** `lib/qstash.ts` try/catch + console.error, no rethrow. Apply to `storeInquiry`, `publishOutboxDispatch`, trigger bodies (SQL EXCEPTION block).
- **Auth on machine routes:** QStash `Receiver` (dispatch), timing-safe Bearer (`reminder-24h` L11-21) for sweep/kick.
- **Service-role-only tables:** RLS enabled, deny-all policies (038) + REVOKE EXECUTE on SECURITY DEFINER fns (063).
- **Input guards:** `enforceMaxBody`, `safeString`, `safeEmail` from `lib/request-guards.ts`; zod `.strict()`.
- **PII hygiene:** outbox rows ids-only; `last_error` codes only; logs status+code; no IP/UA.
- **Commits:** `security:` prefix for auth/validation/outbox integrity work.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `lib/outbox-backoff.ts` | utility | Pure backoff table (60,300,900,3600,10800,21600,43200,86400 s); no existing retry helper |
| Lease-claim / enqueue RPCs in 064 | migration | No existing queue/claim SQL in repo; follow RESEARCH Pattern 3 sketch |

## Metadata

**Analog search scope:** `app/api/{contact,corporate-contact,submit-multiday-quote,cron,admin/bookings}`, `lib/`, `supabase/migrations/038,063`, `infra/espocrm/`, `tests/`
**Tracked-source check:** `git ls-files` confirmed `lib/qstash.ts`, `reminder-24h/route.ts`, `infra/espocrm/roles.json`, `tests/chat-launcher-i18n.test.ts`, `tests/helpers/fake-espocrm.ts`, `overlay.mjs`, `lib/phone.ts`; no gitignored mirrors referenced
**Pattern extraction date:** 2026-10-18
