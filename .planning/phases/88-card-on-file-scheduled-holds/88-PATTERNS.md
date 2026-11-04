# Phase 88: Card on File & Scheduled Holds - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 41 new/modified (grouped where the pattern is identical)
**Analogs found:** 36 / 41 (all analog paths verified git-tracked: lib/email.ts, lib/qstash.ts, infra/chatwoot/webhook.mjs and the files below; no `.gsd` mirror paths used)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/085_payment_state_card_on_file.sql` | migration | CRUD + CAS RPC | `supabase/migrations/084_booking_statuses_status_log.sql` (+ `064_integration_outbox.sql` for claim) | exact |
| `lib/payments/state.ts` | service (sole writer) | request-response (RPC) | `lib/booking-status-service.ts` + `advance_booking_status` RPC | exact |
| `lib/payments/{timing,idempotency,config}.ts` | utility (pure) | transform | `lib/prague-date.ts` (`pickupInstantMs`) | role-match |
| `lib/payments/{hold,settle,recovery,customer,checkout,edit-hook,alerts,consent}.ts` | service | request-response (Stripe) | `lib/stripe-payment-links.ts` (lazy Stripe) + `lib/booking-status-service.ts` | role-match |
| `lib/payments/tick.ts` | service | batch | `app/api/cron/outbox-sweep/route.ts` (`step()` isolation) | exact |
| `lib/payments/emails/{render,templates,messages}.ts` | service | transform | `lib/email.ts` (Resend lazy client) ; no i18n analog | partial |
| `lib/stripe-webhook/{dispatch,once,*}.ts` | service | event-driven | `app/api/webhooks/stripe/route.ts` lines 69-127 | exact |
| `lib/checkout/compute.ts` (extract) | utility | transform | `app/api/create-payment-intent/route.ts` (source being extracted) | exact |
| `app/api/card-checkout/init/route.ts` | route | request-response | `app/api/create-payment-intent/route.ts` | role-match |
| `app/api/card-checkout/intent/route.ts` | route | request-response | `app/api/create-payment-intent/route.ts` | exact |
| `app/api/cron/payment-tick/route.ts` | route | batch (GET cron + POST QStash) | `app/api/cron/outbox-sweep/route.ts` (GET) + `app/api/cron/reminder-2h/route.ts` (POST) | exact |
| `app/api/admin/bookings/[id]/payment/route.ts` | route | request-response | `app/api/admin/bookings/[id]/payment-link/route.ts` | exact |
| `app/api/admin/settings/route.ts` (modify) | route | CRUD | itself (`noshow_wait_*` fields) | exact |
| `app/api/admin/bookings/route.ts` (modify PATCH, ~609) | route | CRUD | itself | exact |
| `app/api/admin/bookings/cancel/route.ts` (modify, WR-01) | route | request-response | itself (lines 60-110) | exact |
| `app/api/webhooks/stripe/route.ts` (modify: dispatch gate) | route | event-driven | itself | exact |
| `lib/booking-events.ts` (modify: async consumer) | service | event-driven | itself | exact |
| `lib/booking-status-service.ts` (modify `after()` call ~line 197) | service | event-driven | itself | exact |
| `lib/stripe-payment-links.ts` (modify: currency/amountMinor/kind) | service | request-response | itself | exact |
| `lib/rate-limit.ts`, `middleware.ts`, `vercel.json` (modify) | config | request-response | `LIMITS` map, `CSRF_*` arrays, `crons` | exact |
| `components/booking/steps/Step6Checkout.tsx` (gate) | component | request-response | `components/booking/steps/Step6Payment.tsx` | role-match |
| `components/booking/steps/Step6CardOnFile.tsx` | component | request-response | `components/booking/steps/Step6Payment.tsx` | exact |
| `components/admin/PaymentPanel.tsx`, `PaymentStateBadge.tsx` | component | CRUD | `components/admin/StatusBadge.tsx`, `PaymentLinkSection` in `BookingsTable.tsx:782` | role-match |
| `components/admin/CardFlowSettings.tsx` | component | CRUD | `components/admin/NoShowWaitSettings.tsx` | exact |
| `components/admin/BookingsTable.tsx` (modify, mount at ~2169 and ~2623) | component | CRUD | itself | exact |
| `infra/stripe/webhook-events.mjs` | script | batch | `infra/chatwoot/webhook.mjs` | role-match |
| `infra/qstash/payment-tick-schedule.mjs` | script | batch | `infra/chatwoot/webhook.mjs` (injectable client, runX + parse args) | role-match |
| `infra/stripe/card-flow-smoke.mjs` | script | batch | `infra/chatwoot/webhook.mjs` probe | partial |
| `tests/helpers/{fake-stripe,fake-payments-db}.ts` | test helper | transform | `tests/helpers/fake-chatwoot.ts`, `fake-espocrm.ts` | role-match |
| `tests/payments-migration-085.test.ts`, `payments-state.test.ts` | test | transform | `tests/booking-status-parity.test.ts` + `tests/helpers/latest-migration.ts` | exact |
| `tests/payment-state-writers-gate.test.ts` | test | transform | `tests/status-writers-gate.test.ts` | exact |
| `tests/infra-stripe-webhook-events.test.ts`, `infra-qstash-schedule.test.ts` | test | transform | `tests/chatwoot-webhook-script.test.ts` | exact |
| route tests (`card-checkout-*`, `payments-tick`, `admin-payment-api`, ...) | test | request-response | `tests/cron-reminder-2h.test.ts`, `tests/outbox-sweep.test.ts`, `tests/webhooks-stripe.test.ts`, `tests/admin-bookings-cancel.test.ts` | role-match |
| `messages/*.json` (7 locales: `Booking.step6.cardOnFile`, `PaymentEmails`) | config | transform | existing `Booking.step6.errors.*` keys | role-match |

## Pattern Assignments

### `supabase/migrations/085_payment_state_card_on_file.sql` (migration)

**Analog:** `supabase/migrations/084_booking_statuses_status_log.sql`. Next number is 085 (latest tracked is 084).

**Append-only/RLS ledger table** (084:52-85) to copy for `booking_payment_events` / `booking_payment_consents`:
```sql
CREATE TABLE IF NOT EXISTS public.booking_status_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('admin','driver','system')),
  actor_id text CHECK (actor_id IS NULL OR length(actor_id) <= 64), ...
REVOKE ALL ON public.booking_status_log FROM anon, authenticated;
ALTER TABLE public.booking_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_status_log_no_public_read ON public.booking_status_log FOR SELECT USING (false);
CREATE POLICY booking_status_log_no_public_insert ON public.booking_status_log FOR INSERT WITH CHECK (false);
```
Differences: use `ON DELETE RESTRICT` (research), add `UNIQUE (booking_id, event_key)`, and a `BEFORE UPDATE OR DELETE` trigger raising an exception (084 has no such trigger; write it new).

**CAS RPC shape** (084:133-198) for `apply_payment_transition`: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`; the UPDATE uses `WHERE b.id = p_booking_id AND b.status = p_from`, with the patch allow-list read via the `?` operator:
```sql
operator_notes = CASE WHEN p_patch ? 'operator_notes' THEN p_patch->>'operator_notes' ELSE b.operator_notes END
...
v_applied := FOUND;
IF NOT v_applied THEN RETURN jsonb_build_object('applied', false, 'current_status', (SELECT x.status ...)); END IF;
RETURN jsonb_build_object('applied', true, 'previous_status', p_from, 'booking', to_jsonb(v_row));
```
Adapt: `payment_state = ANY(p_from)`, return `current_state`, insert ledger row `ON CONFLICT (booking_id,event_key) DO NOTHING`, and treat a conflict as `{applied:false,duplicate:true}` with the UPDATE rolled back (use `RAISE`/subtransaction, since a plain DO NOTHING would leave the update applied).

**Grants block** (084:583-595), mandatory after any CREATE/REPLACE of SECURITY DEFINER:
```sql
REVOKE EXECUTE ON FUNCTION public.advance_booking_status(uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_booking_status(...) TO service_role;
```
**Claim function:** copy `outbox_claim` from `064_integration_outbox.sql:127` (lease claim; add `FOR UPDATE SKIP LOCKED` per research). Trigger-safety note: existing bookings triggers are all `UPDATE OF <named cols>`, so new payment columns fire none.

---

### `lib/payments/state.ts` (sole `payment_state` writer)

**Analog:** `lib/booking-status-service.ts` (the status-writer analog; RPC call + result handling) and the TS wrapper shape in 88-RESEARCH "Atomic transition wrapper". Service-client import pattern: `import { createSupabaseServiceClient } from '@/lib/supabase'` (used by every route here). Pair with `TRANSITIONS` table from research Pattern 2; parity test below.

### `lib/payments/{timing,idempotency,config}.ts` (pure)

**Analog:** `lib/prague-date.ts:60`:
```ts
export function pickupInstantMs(row: { pickup_utc: string | null; pickup_date: string; pickup_time: string }): number | null
```
Hold math must be `pickupInstantMs(row) - leadHours*3_600_000` (absolute ms). Do NOT copy the month-based Prague offset in `app/api/create-payment-intent/route.ts:198-208`. `pickup_utc` is live as a GENERATED column (D-22), so pass it through as is.

### `lib/payments/{hold,settle,recovery,customer,checkout}.ts` (Stripe service modules)

**Analog:** `lib/stripe-payment-links.ts:1-17` lazy client (copy, but set `maxNetworkRetries: 2` only because every call carries an idempotency key; research stripe.ts):
```ts
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0 })
  }
  return _stripe
}
```
Every money entry begins with `assertMoneyEligible(booking)` from `lib/booking-status.ts` (see booking-events.ts:20-29 contract). Stripe metadata must never contain a `bookingId` key (route.ts:151-154 would route it to the legacy handler); use `cofBookingId` plus `kind`.

### `lib/stripe-payment-links.ts` (modify for recovery links)

Current EUR-only seam to extend (lines 55-58): `currency: 'eur', unit_amount: Math.round(params.amountEur * 100)`; metadata block lines 43-47 sets `bookingId` (recovery must use `cofBookingId` + `kind:'card_recovery'` instead). Keep `payment_method_types: ['card']`, `restrictions: { completed_sessions: { limit: 1 } }`, and `metadata` on both link and `payment_intent_data`. `deactivateBookingPaymentLink` (lines 82-88) is reused for stale recovery links.

### `lib/payments/tick.ts` and `app/api/cron/payment-tick/route.ts`

**Analog (GET + step isolation):** `app/api/cron/outbox-sweep/route.ts`.
```ts
export const maxDuration = 300
async function step<T>(code: string, errors: string[], run: () => Promise<T>): Promise<T | null> {
  try { return await run() } catch { errors.push(code); return null }
}
// GET: fail-closed CRON_SECRET, timing-safe (lines 45-52)
const cronSecret = process.env.CRON_SECRET
const authHeader = request.headers.get('authorization')
if (!cronSecret || !authHeader) return new Response('Unauthorized', { status: 401 })
const expected = Buffer.from(`Bearer ${cronSecret}`); const got = Buffer.from(authHeader)
if (expected.length !== got.length || !timingSafeEqual(expected, got)) return new Response('Unauthorized', { status: 401 })
// response: NextResponse.json({ ok: true, ..., errors })  (counts and codes only)
```
**Analog (POST + QStash):** `app/api/cron/reminder-2h/route.ts:12-39`: lazy `Receiver` singleton from `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`; `enforceMaxBody(request, 1024)` first; read `await request.text()` BEFORE `receiver.verify({ signature: request.headers.get('Upstash-Signature') ?? '', body: rawBody }).catch(() => false)`; 401 on invalid. Both verbs call `runPaymentTick()`; always 200 once authenticated. Add to `vercel.json` `crons` (`{ "path": "/api/cron/payment-tick", "schedule": "0 3 * * *" }`, same shape as the existing entries at 05:00-07:00 UTC).

### `lib/stripe-webhook/dispatch.ts` + `app/api/webhooks/stripe/route.ts` (modify)

**Analog:** `app/api/webhooks/stripe/route.ts:60-127`. Insert `dispatchPaymentEvent(event)` immediately after `constructEvent` (line ~66), before the `charge.refunded` branch. Copy the SEC-10 ordering for `once()`:
```ts
const { data: existing } = await supabase.from('stripe_processed_events').select('event_id').eq('event_id', event.id).maybeSingle()
if (existing) return NextResponse.json({ received: true, duplicate: true })
// ... side effect FIRST ...
const { error: claimErr } = await supabase.from('stripe_processed_events').insert({ event_id: event.id, event_type: event.type })
if (claimErr && (claimErr as { code?: string }).code !== '23505') console.error(...)
```
Legacy chain that `card_*` kinds must never reach (lines 151-159): `if (meta.groupBookingIds) ... else if (meta.bookingId) ... else if (isRoundTrip) ... else handleOneWaySucceeded`. `charge.refunded` terminal guard already shipped (lines ~924-950: `.not('status','in','(completed,no_show)')`); only add a `refund_observed` ledger branch for `payment_mode='card_hold'`. Existing tests `tests/webhooks-stripe.test.ts` must stay untouched and green.

### `app/api/card-checkout/intent/route.ts` and `/init/route.ts`

**Analog:** `app/api/create-payment-intent/route.ts`. Imports (lines 1-29) to reuse: `z`, `normalizeSiteLocale`, `getPricingConfig`, `computeCombinedTotalMinor` (line 306), `captureUnpaidBooking` (lines 404-408: `await captureUnpaidBooking(unpaidRow, bookingData.attemptId, 'outbound')`), `checkRateLimit, getClientIp` (line 88: `checkRateLimit('/api/create-payment-intent', getClientIp(req))`), `enforceMaxBody`, `NO_LINE_BREAKS`. Zod schema pattern at lines ~55-80 (`BOUNDED_STRING`, `.catchall`), 400 for shape, 422 for business. Use `capture_method:'manual'` / SetupIntent in place of line 382 `automatic_payment_methods`. Pass the Stripe idempotencyKey on all creates. `/init` is side-effect-free and gates `tripType in (transfer, hourly)` (D-19). Register both paths in `LIMITS` (`lib/rate-limit.ts:21-26`, e.g. `'/api/card-checkout/intent': 10`) and add `/api/card-checkout` to `CSRF_PROTECTED_PREFIXES` and `CSRF_STRICT_ORIGIN_REQUIRED` (middleware.ts:9-34), because `checkRateLimit` is permissive for unlisted paths.

### `app/api/admin/bookings/[id]/payment/route.ts`

**Analog:** `app/api/admin/bookings/[id]/payment-link/route.ts`. Guard order: `enforceMaxBody` -> `getAdminUser` (401/403) -> `await params` -> JSON parse (400 "Invalid JSON") -> zod `safeParse` (400 `{error:'Invalid payload', details: parsed.error.flatten()}`) -> `createSupabaseServiceClient()` -> select booking (404) -> state check (409/422). Imports (lines 1-8): `NextResponse`, `z`, `getAdminUser` from `@/lib/supabase/server`, `createSupabaseServiceClient`, `enforceMaxBody`. Use `z.discriminatedUnion('action', [...])`. Never accept an amount in the body.

### `app/api/admin/settings/route.ts` (modify)

**Analog:** itself. Add `payment_hold_lead_hours` (int 6..96), `card_flow_mode` (`z.enum(['off','canary'])`), `card_flow_canary_emails` to `settingsPatchSchema` (lines 7-25), the `.refine` any-field check, the GET `.select(...)` list (line ~39) and response object, and the PATCH `if (parsed.data.X !== undefined) updates.X = ...` ladder (lines 66-77). Same bounds as the migration CHECK, as done for `noshow_wait_*`.

### `app/api/admin/bookings/route.ts` PATCH edit hook (modify)

Seam: around line 609-614 (`.update(tripUpdatePayload).eq('id', parsed.data.id)` then `if (dbError) return ... 'DB update failed'`). Add `assertEditablePrecheck(current)` (409 `payment_in_progress`) before it and `reevaluateAfterEdit()` after success (try/catch, in `after()`; edit never fails on a Stripe error). The stale link logic just above (lines 596-607) is the CR-02 precedent to mirror for the recovery link.

### `app/api/admin/bookings/cancel/route.ts` (modify, WR-01 CAS-first)

Current order: schema + `getAdminUser` (lines 22-40), `NON_CANCELLABLE_STATUSES` check (line 44-58), then `advanceBookingStatus(... expectedFrom: booking.status)` (lines ~60-72), but the refund path (lines 74-110: `stripe.refunds.create(refundParams)`, `Stripe.errors.StripeInvalidRequestError -> 422`) runs BEFORE the CAS is applied. Restructure: apply the CAS, then (card_hold) `releaseHold()`, (pay-now) refund with key `refund:<bookingId>:<leg>`; on refund failure return 502 `refund_failed` with `cancelled:true`, alert the operator, leave status cancelled (D-20). Rewrite `tests/admin-bookings-cancel.test.ts`; do not delete.

### `lib/booking-events.ts` + `lib/booking-status-service.ts` (modify)

`emitBookingCompleted` (booking-events.ts:44-52) is sync and returns the event; make it `async`, keep the log line, then `await settleBooking(...)` in try/catch (never throw into `after()`). Caller seam, `booking-status-service.ts:197-209`:
```ts
if (to === 'completed') {
  const completedAt = (booking.completed_at as string | null | undefined) ?? null
  const partner = isPartnerBooking(booking as { booking_source?: string | null })
  after(() => emitBookingCompleted({ bookingId, completedAt, partner, actorType: input.actor.type, source: input.source }))
}
```
Update the `tests/booking-status-service.test.ts` assertions (~:841-856) for the async signature. Header contract (booking-events.ts:20-29): call `assertMoneyEligible` first; add a durable `completed_at IS NOT NULL` sweep in tick step C.

### `components/booking/steps/Step6CardOnFile.tsx` and `Step6Checkout.tsx`

**Analog:** `components/booking/steps/Step6Payment.tsx`. Imports (lines 1-16) to reuse: `useTranslations, useLocale`, `loadStripe`, `Elements, PaymentElement, useStripe, useElements`, `useBookingStore`, `formatCZK, formatEUR`, `writePurchaseSnapshot`, `STRIPE_ELEMENTS_LOCALE`, `getPathname`, `BookingSummaryBlock`. Keep the module-level `stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)` (line 17) and the literal-hex `appearance` constant (line 42; hex allowed on the public side). Submit flow (lines 116-140): call `writePurchaseSnapshot(...)` BEFORE the confirm, compute `getPathname({ locale, href: confirmPath })`, then `stripe.confirmPayment(...)`; use `confirmSetup({ elements, clientSecret, confirmParams:{return_url}, redirect:'if_required' })` for setup mode. Error codes: add new machine codes (`CONSENT_REQUIRED`, `PRICE_CHANGED`, `MODE_CHANGED`) to a catalog-backed `KNOWN_*_ERROR_CODES` set like lines 22-34. Elements mount at line ~592 `<Elements stripe={stripePromise} options={options}>` with `appearance` and `locale: STRIPE_ELEMENTS_LOCALE[locale]` (lines 426-427). Do not touch `Step6Payment.tsx` or its test. Gate must run before mount because Step6Payment creates a PI and unpaid row on mount (lines ~331-419). Visual spec: `88-UI-SPEC.md` surface 1.

### `components/admin/CardFlowSettings.tsx`

**Analog:** `components/admin/NoShowWaitSettings.tsx` (211 lines): `'use client'`, `import { errorStyle, focusRingHandlers, inputBaseStyle } from './adminFieldStyles'`, a `SETTINGS_KEY` map, strict digit parsing (`/^\d+$/`), initial-value fallback, optimistic save with `Feedback` state, PATCH to `/api/admin/settings`. Test analog: `tests/no-show-wait-settings.test.tsx`.

### `components/admin/PaymentPanel.tsx` and `PaymentStateBadge.tsx`

**Analog:** `components/admin/StatusBadge.tsx:38-45` token usage:
```ts
const fg = `var(--status-${family}-fg)`
// backgroundColor: `var(--status-${family}-bg)`, border: `1px solid var(--status-${family}-border)`,
// borderRadius: 'var(--admin-radius-sm)', fontSize: 'var(--admin-fs-label)', fontWeight: 'var(--admin-fw-strong)'
```
Colours only via `var(--status-*)`/`var(--admin-*)` (`tests/admin-no-hardcoded-colors.test.ts` scans admin roots). Mount next to `PaymentLinkSection` (BookingsTable.tsx:782-808; mounts at ~2169 and ~2623, both adjacent to `TripEditPanel` at 2179/2633). The panel must fetch its own data (Phase 90 extracts `BookingDetailPanel` later).

### `lib/payments/emails/*` (MAIL-01) and operator alert

**Analog (partial):** `lib/email.ts` — lazy Resend client (`new Resend(process.env.RESEND_API_KEY)`, line 37), operator mail to `process.env.MANAGER_EMAIL!` (e.g. lines 346, 490), `sendManagerAlert(data)` at line 315, and the no-show operator email (~570-590 guards `MANAGER_EMAIL` missing). Existing client emails are English-only inline HTML. No `createTranslator` usage exists anywhere in the repo, so there is no codebase analog for the server-side i18n renderer; use RESEARCH Pattern 13. Dedupe via ledger `event_key`, not `logEmail`.

### `infra/stripe/webhook-events.mjs`, `infra/qstash/payment-tick-schedule.mjs`, `infra/stripe/card-flow-smoke.mjs`

**Analog:** `infra/chatwoot/webhook.mjs`: header doc comment with command list and exit codes (0 ok, 1 refused, 2 API/config error); named exports for testability (`parseXArgs`, `runX({ argv, client, out, err, isTTY })`); injectable client; secret scrubber on all output; `pathToFileURL` main guard; `export const CANONICAL_HOST = 'rideprestigo.com'` host guard. Test analog: `tests/chatwoot-webhook-script.test.ts` calls `runChatwootWebhook({ argv, client, configDir, isTTY:false, out, err })` against `tests/helpers/fake-chatwoot.ts` and asserts no secret in output. Build `fake-stripe`/fake QStash client the same way.

### Tests: parity, writer gate, helpers

- **Parity** (`tests/payments-state.test.ts`/migration test): `tests/booking-status-parity.test.ts` + `tests/helpers/latest-migration.ts` (`loadMigration`, `latestFunctionBody`, `latestStatusCheckValues`; reads the LAST definition in filename order). Header comment: "SQL-vs-TypeScript parity on the LATEST migration definitions".
- **Writer gate** (`tests/payment-state-writers-gate.test.ts`): `tests/status-writers-gate.test.ts` — `REPO_ROOT`, `SCAN_DIRS = ['app','lib']`, `SCAN_FLOOR = 150`, `SERVICE_FILE`/`RPC_NAME` constants, an allowlist of `{path, reason}` entries, source-reading scan; pin the RPC `apply_payment_transition` to exactly one caller file (`lib/payments/state.ts`). Use `// @vitest-environment node`.
- **Cron tests:** `tests/cron-reminder-2h.test.ts`, `tests/outbox-sweep.test.ts`. **Webhook tests:** `tests/webhooks-stripe.test.ts`.

## Shared Patterns

### Admin API guard order
**Source:** `app/api/admin/bookings/[id]/payment-link/route.ts`, `app/api/admin/settings/route.ts:43-58`
**Apply to:** admin payment route, settings changes
```ts
const tooBig = enforceMaxBody(request, 2_048); if (tooBig) return tooBig
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```
Then zod `safeParse` -> 400 `{ error: 'Invalid payload', ... }`; business-rule failures -> 422/409.

### Cron / QStash auth
**Source:** `app/api/cron/outbox-sweep/route.ts:42-52` (Bearer, timing-safe, fail-closed) and `app/api/cron/reminder-2h/route.ts:24-39` (QStash Receiver on raw text).
**Apply to:** `app/api/cron/payment-tick/route.ts`. The tick and webhook are server-to-server: keep out of `CSRF_STRICT_ORIGIN_REQUIRED`.

### Service client / no render-time clients
`createSupabaseServiceClient()` from `@/lib/supabase`, created inside handlers (and inside `after()`), never during render.

### Webhook idempotency (SEC-10 ordering)
**Source:** `app/api/webhooks/stripe/route.ts:75-100` (table `stripe_processed_events`, NOT `stripe_events`). Side effect first, claim after, ignore `23505`. Second guard: ledger `event_key`.

### Money-entry eligibility
`assertMoneyEligible` / `isPartnerBooking` from `lib/booking-status.ts`, first call of every hold, settle, charge and release path (D-02).

### Stripe client + idempotency
Lazy `getStripe()` per `lib/stripe-payment-links.ts:7-17`; deterministic attempt-numbered keys (`hold:<id>:<n>`, `cap:`, `chg:`, `diff:`, `rel:`), no PII in keys or metadata.

### SECURITY DEFINER hygiene
After any CREATE/REPLACE: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role` (084:583-595).

### Hard rules (CLAUDE.md)
No hard-coded `€[0-9]{2,}` in `app/`/`components/` (amounts via ICU params and `formatEUR/formatCZK`); all new EN strings translated for the 6 other locales in-session (never `i18n-translate --dry-run`); never read `.env.local`; commit security work with `security:` prefix.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/payments/emails/render.ts` (server `createTranslator` + `PaymentEmails` namespace) | service | transform | No server-side i18n email renderer exists; `createTranslator` is not used anywhere in `lib/` or `app/`. Use RESEARCH Pattern 13 |
| `lib/payments/consent.ts` (rendered-text SHA-256 + version) | utility | transform | No consent-record precedent; use RESEARCH Pattern 10 (`node:crypto`) |
| `tests/helpers/fake-stripe.ts` idempotency-replay semantics | test helper | transform | Only fake-chatwoot/fake-espocrm exist (structure reusable, Stripe semantics new; see RESEARCH Wave 0 gaps) |
| Append-only `BEFORE UPDATE OR DELETE` trigger on ledger | migration | CRUD | 084 uses RLS deny-all only, no immutability trigger; write new |
| `infra/stripe/card-flow-smoke.mjs` live Stripe scenarios | script | batch | Only `enable-checkout-webhook-event.mjs` (untracked, repo root) touches Stripe; do not copy it, use the chatwoot script structure |

## Metadata

**Analog search scope:** `supabase/migrations`, `app/api/{cron,admin,create-payment-intent,webhooks/stripe}`, `lib/`, `components/{admin,booking/steps}`, `infra/chatwoot`, `tests/`, `middleware.ts`, `vercel.json`
**Files scanned:** about 30 read or grepped
**Pattern extraction date:** 2026-11-04
