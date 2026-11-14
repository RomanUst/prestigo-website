# Phase 92: Quotes - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 31 (new + modified; new file names are proposals, the planner may rename)
**Analogs found:** 28 / 31 (every analog path below verified with `git ls-files`)

Migration number: next free is **090** (`supabase/migrations/` ends with two 089 files: `089_admin_search_bookings_hide_cancelled.sql` and `089_stops_landing_extra_charges.sql`). Re-run `ls supabase/migrations` at write time.

Three facts the planner must design around (not found as ready patterns in the repo):

1. **No hashed-token table exists.** `booking_manage_tokens` stores the token in plain text on purpose (`lib/manage-link.ts` L3-6: the link must be re-embedded in later emails). Quote tokens are hashed (roadmap), so the quote link can be shown / sent only at creation or send time, and "resend" means a new token.
2. **The ledger and the email delivery helper are keyed by a booking id.** `appendPaymentEvent(bookingId, ...)` and `deliverOnce({ bookingId, ... })` need a booking row. A quote has no booking until the deposit is paid, so the deposit's exactly-once keys before conversion must live on the quote tables.
3. **A deposit PaymentIntent without `metadata.kind` starting with `card_` falls into the legacy webhook chain, which creates a booking from `payment_intent.succeeded`** (`lib/stripe-webhook/dispatch.ts` L5-8). The deposit needs its own `card_*` kind, and `cardMetadata` requires a booking id it does not have yet.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/090_quotes.sql` (quotes, versions, lines, tokens, acceptance log, ledger kinds, erasure fns, RPC grants) | migration | CRUD | `supabase/migrations/089_stops_landing_extra_charges.sql` (+ 087 L336-358 token table, 085 L413-540 RPC) | exact |
| `lib/quote-token.ts` | service | request-response | `lib/manage-link.ts` | role-match (hash differs) |
| `lib/quote-pricing.ts` (suggested price of one line) | service | transform | `app/api/admin/bookings/route.ts` L985-1104 + `lib/checkout/compute.ts` `priceCheckout` | role-match |
| `lib/quotes.ts` (lifecycle: create, new version, send, void, viewed, accept) | service | CRUD | `lib/payments/extra.ts` (row is the lock, CAS on status) + `lib/manage-link.ts` | role-match |
| `lib/quote-view.ts` (client-safe DTO of a quote) | service | transform | `lib/manage-view.ts` | exact |
| `lib/quote-convert.ts` (lines -> bookings) | service | CRUD | `app/api/admin/bookings/route.ts` L1091-1168 + `lib/booking-stops.ts` `saveBookingStops` | role-match |
| `lib/payments/quote-deposit.ts` | service | request-response (Stripe on-session) | `lib/payments/checkout.ts` `createHoldNowIntent` L315-413 + `recordConsent` L55-89 | role-match |
| `lib/payments/stripe.ts` (`stripeKeys.quoteDeposit`, new `CardKind`, metadata) | config | n/a | itself (`extra`, `card_extra`) | exact |
| `lib/payments/state.ts` `LEDGER_KINDS` (if new kinds) | config | n/a | itself + `tests/payments-state.test.ts` | exact |
| `lib/stripe-webhook/dispatch.ts` + new `lib/stripe-webhook/quote-events.ts` | dispatcher / service | event-driven | itself + `lib/stripe-webhook/charge-events.ts` + `lib/payments/extra.ts` `finalizeExtraFromWebhook` | exact |
| `app/api/admin/quotes/route.ts` (GET list, POST create) | route | CRUD | `app/api/admin/bookings/route.ts` GET L207-332 / POST L966-1240, skeleton of `[id]/extra/route.ts` | role-match |
| `app/api/admin/quotes/[id]/route.ts` (PATCH = new version) | route | CRUD | `app/api/admin/bookings/[id]/extra/route.ts` POST L147-209 | role-match |
| `app/api/admin/quotes/[id]/send/route.ts` | route | request-response | `app/api/admin/bookings/[id]/payment-link/route.ts` | exact |
| `app/api/admin/quotes/[id]/void/route.ts` | route | request-response | `app/api/admin/bookings/[id]/extra/route.ts` | role-match |
| `app/api/admin/quotes/price/route.ts` (suggest a line price) | route | request-response | `app/api/admin/bookings/[id]/extra/route.ts` GET L102-145 | role-match |
| `app/api/quote/view/route.ts` (POST mark viewed) | route | request-response | `app/api/manage/cancel/route.ts` | exact |
| `app/api/quote/accept/route.ts` (POST accept + deposit intent) | route | request-response | `app/api/manage/cancel/route.ts` (guards) + `app/api/card-checkout/intent/route.ts` (cross-checks, consent) | exact (composite) |
| `app/api/quote/pdf/route.ts` (token-gated download) | route | file-I/O | none | none |
| `app/[locale]/quote/[token]/page.tsx` + `InvalidQuoteLinkView.tsx` + `QuoteHeader.tsx` | component (server) | request-response | `app/[locale]/manage/[token]/page.tsx`, `InvalidManageLinkView.tsx` | exact |
| `app/[locale]/quote/[token]/QuoteActions.tsx` (accept tick, Stripe Elements, viewed POST) | component (client) | event-driven | `app/[locale]/manage/[token]/ManageActions.tsx` + `components/booking/steps/Step6CardOnFile.tsx` | role-match |
| `next.config.ts`, `middleware.ts`, `lib/rate-limit.ts`, `lib/private-link-path.ts` | config | n/a | themselves (`/manage` entries) | exact |
| `messages/{en,ru,es,fr,ar,hi,zh}.json` (`Quote`, `PaymentEmails.quote*`) | i18n | n/a | `Manage` and `PaymentEmails` namespaces | exact |
| `app/(internal)/admin/(dashboard)/quotes/page.tsx` | component | CRUD | `app/(internal)/admin/(dashboard)/promo-codes/page.tsx` | exact |
| `components/admin/QuotesTable.tsx` + state badge | component | CRUD | `components/admin/PromoCodesTable.tsx` + `components/admin/StatusBadge.tsx` `BadgeShell` | exact |
| `components/admin/QuoteBuilder.tsx` (lines, deposit, remainder method, terms, language) | component | request-response | `components/admin/ManualBookingForm.tsx` | role-match |
| `components/admin/QuoteVoidDialog.tsx` ("Cancel quote") | component | request-response | `components/admin/ExtraChargeModal.tsx` + `paymentParts.tsx` | role-match |
| `components/admin/AdminSidebar.tsx` (nav item) | component | n/a | itself L34-46 | exact |
| `lib/payments/emails/render.ts` + `send.ts` (quote email kinds) | service | request-response | themselves (`TEMPLATES`, `renderPaymentEmail`) | exact |
| quote PDF render | service | file-I/O | none | none |
| remainder method "invoice" (record + email) | service | request-response | none | none |
| tests (`tests/migration-090.test.ts`, `quote-token`, `quote-routes`, `quote-page`, `quote-deposit-webhook`, `phase92-e2e`, i18n parity) + `tests/helpers/fake-payments-db.ts` | test | n/a | `tests/migration-089.test.ts`, `manage-link.test.ts`, `manage-booking.test.ts`, `manage-page.test.tsx`, `extra-webhook.test.ts`, `phase91-e2e.test.ts`, `payments-copy-i18n.test.ts` | exact |

## Pattern Assignments

### `supabase/migrations/090_quotes.sql` (migration, CRUD)

**Analog:** `supabase/migrations/089_stops_landing_extra_charges.sql`

**File layout** (089): numbered `-- == N. title ===` sections, `CREATE TABLE IF NOT EXISTS`, constraints via `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`, grants in the last section.

**Deny-all table with the row as the lock** (089 L111-149; copy for every quote table):
```sql
CREATE TABLE IF NOT EXISTS public.booking_extra_charges (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  kind         text        NOT NULL CHECK (kind IN ('waiting', 'other')),
  status       text        NOT NULL DEFAULT 'charging' CHECK (status IN ('charging', 'charged', 'failed')),
  currency     text        NOT NULL CHECK (currency IN ('eur', 'czk')),
  amount_minor bigint      NOT NULL CHECK (amount_minor > 0),
  description  text        CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 200),
  attempt      integer     NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  stripe_payment_intent_id text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_extra_charges_one_charging
  ON public.booking_extra_charges (booking_id) WHERE status = 'charging';
REVOKE ALL ON public.booking_extra_charges FROM anon, authenticated;
ALTER TABLE public.booking_extra_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_extra_charges_no_public_read ON public.booking_extra_charges;
CREATE POLICY booking_extra_charges_no_public_read ON public.booking_extra_charges FOR SELECT USING (false);
DROP POLICY IF EXISTS booking_extra_charges_no_public_insert ON public.booking_extra_charges;
CREATE POLICY booking_extra_charges_no_public_insert ON public.booking_extra_charges FOR INSERT WITH CHECK (false);
```
Use the partial unique index idea for "one live version per quote" and "one deposit in flight per quote version". `ON DELETE RESTRICT` for anything with a money record (089 L110: "anonymised, never deleted").

**Token table** (087 L339-357; the only token table in the repo):
```sql
CREATE TABLE IF NOT EXISTS public.booking_manage_tokens (
  booking_id   uuid        PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  token        text        NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
```
**Deviation:** store `token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$')` instead of `token`, keyed to the quote version (immutable versions; a new version gets a new token row and the old rows get `revoked_at`). Do not copy `last_used_at` as a write done by the GET (the public GET is side-effect free).

**Ledger kind CHECK** (089 L151-187): only if new ledger kinds are added. Drop and re-add `booking_payment_events_kind_check` with the full 089 list verbatim plus the new kinds at the end; `LEDGER_KINDS` in `lib/payments/state.ts` L37-67 must keep the same order (`tests/payments-state.test.ts`, `tests/migration-089.test.ts` compare them).

**Erasure** (089 L189-451): `CREATE OR REPLACE` full copies of `erasure_payment_open(uuid[])` and `erasure_anonymise_person(uuid)` from 089, add the quote data, keep every existing statement (`tests/erasure-payment-pii.test.ts` and `tests/migration-089.test.ts` prove nothing was edited out, statement by statement). Existing shape to extend (089 L350-353, L404, L423):
```sql
  -- The manage-booking link dies with the person.
  DELETE FROM public.booking_manage_tokens mt
   WHERE mt.booking_id = ANY (v_ids);
  GET DIAGNOSTICS n_token = ROW_COUNT;
```
Add counters (`n_quote...`) to `DECLARE` and to the `v_counts` `jsonb_build_object`; `lib/erasure-store.ts` L45, L170 list the count keys by name (add the new keys there). Quote rows are matched by client email / phone (`v_emails`, `v_phones` exist in the function) as well as by booking id, because a draft or sent quote has no booking. Acceptance log `ip` and `user_agent` are nulled like `booking_payment_consents` (089 L343-347); an unpaid deposit in flight counts as open in `erasure_payment_open` (089 L217-220 pattern).

**RPC + grants** (085 L415-424, L532-540; 089 L453-460). Any new SECURITY DEFINER function (for example an atomic "accept version" or "convert quote to bookings"):
```sql
CREATE OR REPLACE FUNCTION public.append_payment_event(p_booking_id uuid, p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$ ... $$;

REVOKE EXECUTE ON FUNCTION public.append_payment_event(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_payment_event(uuid, jsonb) TO service_role;
```
Fully qualified `public.` names inside the body (`search_path = ''`). Repeat the REVOKE / GRANT lines for the two erasure functions even though the signature is unchanged (089 L453-460; `erasure_payment_open` is also revoked from `service_role`).

Executors have no Supabase MCP: the orchestrator applies the migration and runs the smoke.

---

### `lib/quote-token.ts` (service, request-response)

**Analog:** `lib/manage-link.ts`

**Imports and token shape** (L18-34):
```typescript
import { randomBytes } from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getPathname } from '@/i18n/routing'
import { normalizeSiteLocale } from '@/i18n/locales'

export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function newManageToken(): string {
  return randomBytes(32).toString('base64url')
}
```
**Resolver: one null for every reason, no throw, no token in a log** (L91-131):
```typescript
export async function resolveManageToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !MANAGE_TOKEN_RE.test(token)) return null   // no database call
  try {
    const supabase = createSupabaseServiceClient()
    const { data: tokenRow, error: tokenError } = await supabase
      .from('booking_manage_tokens').select('booking_id, revoked_at').eq('token', token).maybeSingle()
    if (tokenError || !tokenRow) return null
    ...
  } catch {
    console.error('[manage-link] resolve failed')
    return null
  }
}
```
**URL builder** (L133-143): `siteBaseUrl()` trims and strips trailing slashes (a trailing newline in the env broke links once), `getPathname({ locale, href: '/manage/<token>' })`, throws on a malformed token.

**Deviations for quotes:**
- Look up by hash: `.eq('token_sha256', sha256hex(token))`. Hash helper style from `lib/payments/consent.ts` L62-64: `crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')`.
- Drop the `last_used_at` update (L121-125): the resolver is called by the GET page, which must write nothing. `viewed` is a separate POST.
- The resolver must tell the page nothing more than "valid version" or null; voided, expired (D-02 operator date), superseded version, and first pickup passed (D-05) all give the same null. D-05 uses `pickupInstantMs` from `lib/prague-date.ts` as L114-119 does.
- No `ensure...` function that re-reads a stored token: the raw token exists only in the return value of the create / send call.

---

### `lib/quote-pricing.ts` (service, transform)

**Analog:** `app/api/admin/bookings/route.ts` POST L985-1104 (suggested price plus operator override), with the stop and waiting maths of `lib/checkout/compute.ts` `priceCheckout` (L292) and `lib/route-distance.ts` `computeRouteDistance`.

**Suggested price** (route L992-998, L1045-1077):
```typescript
let rates
try {
  rates = await getPricingConfig()
} catch (err) {
  console.error('[admin/bookings.POST] failed to load pricing config:', err)
  return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
}
const outboundLegEur = computeOutboundLegTotal(
  d.vehicle_class, d.distance_km ?? null, d.hours ?? 2, days, d.trip_type,
  d.pickup_date, d.pickup_time, d.is_airport ?? false, rates,
)
const computedTotalEur = outboundLegEur + extrasEur
```
**Override is explicit and audited** (L1080-1104, L1144-1146): the stored amount is the server figure unless the operator opted in; the override is logged with the admin id and both amounts (no client data) and written to an operator note. For D-04 store both the suggested amount and the final line amount on the quote line, with a flag when they differ.

**Deviations:** distance must come from the server (`computeRouteDistance` through all stops, Phase 91), never from the form (the manual-booking POST still accepts a client `distance_km`; do not copy that). Waiting: first 15 minutes free, per-class rate from `rates.waitingRate?.[vc]`, no amount when the class has no rate. One total per line; no separate waiting amount in anything client-facing. Keep `computeOutboundLegTotal`'s signature unchanged (GNet imports it).

---

### `lib/quotes.ts` (service, CRUD lifecycle) and `lib/quote-view.ts`

**Analogs:** `lib/payments/extra.ts` (state changes by compare-and-set on a status column), `lib/manage-view.ts` (client-safe view), `lib/booking-stops.ts` (service-client table module).

**Table module conventions** (`lib/booking-stops.ts` L28-58): one column-list constant, `Number()` casts for numeric columns, `throw new Error('booking stops save failed')` with a fixed message that never carries an address.

**Compare-and-set state change** (same shape as `app/api/admin/bookings/[id]/payment-link/route.ts` L227-251):
```typescript
const { data: updatedRows, error: updateError } = await supabase
  .from('bookings')
  .update({ payment_link_url: link.url, payment_link_id: link.id, status: 'unpaid' })
  .in('id', idsToUpdate)
  .is('payment_link_url', null)
  .select('id')
const ownRowUpdated = (updatedRows ?? []).some((row) => (row as { id: string }).id === booking.id)
if (!ownRowUpdated) { /* lost the race: do not send a second email */ }
```
Use it for sent -> viewed, sent/viewed -> accepted, accepted -> paid, and any -> voided; a lost race is a normal answer, never an error.

**Client-safe view:** `lib/manage-view.ts` builds a `ManageView` that holds no email, phone, name, operator note or reason (`app/[locale]/manage/[token]/page.tsx` L25). `quote-view.ts` returns only what the quote page prints: lines (route, date, time, vehicle class, one total per line), totals, deposit, remainder method, cancellation terms (D-03, D-06: custom hours / percent or the global policy from `lib/cancellation-settings.ts` `getCancellationPolicy` + `buildPolicySnapshot`), state and currency.

---

### `lib/quote-convert.ts` (service, CRUD: lines -> bookings)

**Analog:** `app/api/admin/bookings/route.ts` L1091-1168 (the manual-booking row) + `lib/booking-stops.ts` L38-58 (`saveBookingStops`).

**Row shape to reuse** (L1106-1147), with the policy columns of L1149-1159:
```typescript
const row = {
  trip_type: d.trip_type, pickup_date: d.pickup_date, pickup_time: d.pickup_time,
  origin_address: d.origin_address, destination_address: d.destination_address ?? null,
  vehicle_class: d.vehicle_class, passengers: d.passengers, luggage: d.luggage,
  amount_czk: authoritativeAmountCzk, ...
  booking_reference: bookingReference,        // generateBookingReference() from '@/lib/booking-reference'
  booking_source: 'manual', lead_channel: d.channel, booking_type: 'confirmed',
  payment_intent_id: null, status: ..., amount_eur, user_id: d.user_id ?? null,
}
const { version, snapshot } = buildPolicySnapshot(await getCancellationPolicy())
policyColumns = { cancel_policy_version: version, cancel_policy: snapshot }
```
**Deviations:** `payment_mode: 'quote'` on every row (allowed since 085 L55-63; `lib/payments/state.ts` L34 `PAYMENT_MODES`; the tick selects only `card_hold` / `cash_guarantee`, `lib/payments/tick.ts` L142-707, so the hold engine ignores these rows). A link column to the quote and the quote line. `pickup_utc` is generated, never inserted. After the insert call `saveBookingStops(bookingId, stops)` per line. The conversion must be exactly-once per quote version (unique index on the quote-line reference, or one RPC), because the webhook and the page's return can both trigger it. `payment_intent_id` must not carry the deposit PaymentIntent on more than one row without checking `lib/payments/pay-now.ts` (rows that share a PaymentIntent are treated as round-trip legs there).

Custom terms (D-03, D-06) go into `cancel_policy` as a snapshot of the same shape (`lib/cancellation-policy.ts` `policyFromSnapshot` L89 reads it back).

---

### `lib/payments/quote-deposit.ts` (service, Stripe on-session)

**Analog:** `lib/payments/checkout.ts` `createHoldNowIntent` L315-413 (an on-session PaymentIntent that also saves the card) and `recordConsent` L55-89.

**Imports** (L18-29): `ensureStripeCustomer` from `@/lib/payments/customer`, `cardMetadata, classifyStripeError, getPaymentsStripe, stripeKeys` from `@/lib/payments/stripe`, `buildConsentText, consentSha256` from `@/lib/payments/consent`, `normalizeSiteLocale`.

**Acceptance record first, before the client secret leaves** (L68-88): version, full server-rendered text, its sha256, locale, amount, currency, `accepted_at`, `ip.slice(0, 64)`, `user_agent.slice(0, 300)`. For D-08 the row also carries the quote version id.

**On-session PaymentIntent that saves the card** (L359-374):
```typescript
const pi = await stripe.paymentIntents.create(
  {
    amount: amountMinor,
    currency,
    customer: customerId,
    payment_method_types: ['card'],
    capture_method: 'manual',            // deposit: drop this line (the deposit is charged, not held)
    setup_future_usage: 'off_session',
    metadata: cardMetadata('card_hold_now', { bookingId: booking.id, attempt: 1, bookingReference, promoCode }),
  },
  { idempotencyKey: stripeKeys.holdNow(booking.id, consentId) },
)
if (!pi.client_secret) throw new Error('hold payment intent has no client secret')
```
**Store the PaymentIntent id on the acceptance row before returning** (L377-382), so the webhook can find it.

**Deviations:**
- Key: add `quoteDeposit: (versionId: string, acceptanceId: string) => \`qdep:${versionId}:${acceptanceId}\`` to `stripeKeys` (`lib/payments/stripe.ts` L47-70). Never the amount in the key (L57-58, L65-66).
- Kind: add a `card_*` value to `CardKind` (L72-80), for example `card_quote_deposit`. `cardMetadata` (L86-108) requires `bookingId` and `bookingReference`; a quote has neither before conversion. Either extend `cardMetadata` with optional `quoteId` / `quoteVersionId` and allow an empty `cofBookingId`, or add a sibling `quoteMetadata(...)` next to it. Ids only in metadata.
- `ensureStripeCustomer` (`lib/payments/customer.ts` L28) takes a booking; the quote needs its own customer id column (key `stripeKeys.customer` uses a booking id, add a quote variant).
- The amount is read from the stored quote version only. The request never carries an amount (CONTEXT: server is the price authority); a displayed-amount cross-check answering 409 like `PRICE_CHANGED` (intent route L134-137) is allowed.
- Remainder by saved card (D-01): after conversion the bookings need `stripe_customer_id` and `stripe_payment_method_id` from the deposit's payment method; check `lib/payments/actions.ts` `allowedPaymentActions` (L95-) and the consent `text_version` gate before promising that the existing engine can charge them.

---

### `lib/stripe-webhook/dispatch.ts` (modify) + `lib/stripe-webhook/quote-events.ts` (new)

**Analog:** itself, plus `lib/stripe-webhook/charge-events.ts` L75-100 and `lib/payments/extra.ts` L700-745.

**Three places to edit in dispatch.ts:**
```typescript
// L41-52: add a route name to PaymentRoute, e.g. | 'quote_deposit_paid'
// L78-90 ROUTES: quote_deposit_paid: handleQuoteDepositPaid,
// L130-143 classifyPaymentEvent, payment_intent.succeeded:
if (kind === 'card_recovery') return make('recovery_paid')
if (kind === 'card_charge' || kind === 'card_hold' || ... || kind === 'card_extra') return make('charge_succeeded')
return make('unrouted')
// L126-127 payment_intent.payment_failed -> 'pi_failed' -> handlePaymentFailed (L63-70): branch the new kind BEFORE
// the handleHoldFailed fallback, as card_extra does.
```
`classifyPaymentEvent` reads `meta.cofBookingId` into `bookingId` (L106); for a deposit it is null, so the handler resolves the quote from its own metadata key. `once()` (L157-183) gives the `stripe_processed_events` read-check -> handler -> claim order; the handler must still be idempotent on its own.

**Handler shape** (`extra.ts` L706-745): validate the id from metadata with a uuid regex, `console.warn` with ids only and return when nothing can be acted on, `throw` when a retry can fix it (Stripe redelivers), compare-and-set on the status so the synchronous path and the webhook cannot both win, and an operator alert through `sendPaymentOperatorAlert` (`lib/payments/alerts.ts` L377) when money moved on a quote that is voided or expired meanwhile.

**Rules that tests enforce:** this folder must stay free of payment RPC names and of the card-flow canary setting (`tests/payment-state-writers-gate.test.ts`, header L18-20); do not write `payment_state` from here. `payment_intent.succeeded` is already delivered to the endpoint (`infra/stripe/webhook-events.mjs` `KEPT_EVENTS`), so no new event type is needed for a PaymentIntent deposit. `charge.refunded` on the deposit: `observeRefund` (L190-223) matches bookings by `payment_intent_id` and only for `card_hold` / `cash_guarantee`; decide where a deposit refund is recorded.

---

### Admin API routes `app/api/admin/quotes/**` (route)

**Analog for the skeleton:** `app/api/admin/bookings/[id]/extra/route.ts` (the newest and strictest route). Use the shared `getAdminUser` from `@/lib/supabase/server`; `app/api/admin/promo-codes/route.ts` L7-13 defines its own local copy, do not copy that.

**Imports** (L1-5, L18):
```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import type { LedgerActor } from '@/lib/payments/state'
```
**Guard order** (L147-209; keep exactly):
```typescript
const bodyCheck = enforceMaxBody(request, MAX_BODY_BYTES)          // 1. body size
if (bodyCheck) return bodyCheck
const { user, error } = await getAdminUser()                       // 2. admin, before the body is parsed
if (error === '401') return unauthorized()
if (error === '403') return forbidden()
if (!user) return unauthorized()
const { id } = await params                                        // 3. id is a uuid (400)
if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 })
let raw: string
try { raw = await request.text() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
let json: unknown
try { json = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
const parsed = bodySchema.safeParse(json)                          // 4. strict schema (400)
if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
// 5. row (404)   6. business rules (422), busy / lost race (409)   7. engine in try / catch
```
**400 vs 422:** shape errors are 400 (`z.strictObject`, unknown keys rejected, L49-61); a well-formed request the state does not allow is 422 `{ error: 'action_not_allowed', reason }` (L199-202); an in-flight or lost-race answer is 409. Deposit of 0, a deposit above the total, an empty line list, an expiry date in the past: 422 after the schema passes.

**Body caps in use:** 8_192 (extra), 5_000 (payment-link, PATCH), 20_000 (manual booking POST), 50_000 (promo). A quote with many lines and stops fits the 20_000 class.

**Single-line text fields:** `isSingleLine` (L43-47) or `NO_LINE_BREAKS` / `safeString(max)` / `safeEmail()` from `lib/request-guards.ts` L120-130 for names, emails and anything that reaches an email subject.

**Error logging without PII** (L205-207):
```typescript
} catch {
  console.error('[admin/bookings/[id]/extra] action failed', { bookingId, kind: body.kind })
  return NextResponse.json({ error: 'Payment action failed' }, { status: 500 })
}
```
Ids and codes only; never a name, address, description or provider message.

**List (GET)** `app/api/admin/bookings/route.ts` L207-232, L295-318: guard first, `page` / `limit` clamped (`Math.min(100, Math.max(1, ...))`), filters mapped onto a closed set (`KNOWN_STATUSES.has(raw) ? raw : null`), search bounded to 100 characters and passed as an RPC parameter, never concatenated into a PostgREST `.or()` filter. Response `{ bookings, total, page, limit }`.

**Create (POST)** same file L966-981 + price logic above. **Edit a sent quote = new version (QUOTE-06):** never update a sent version's rows; insert version N+1 with its lines, revoke the old version's token rows, in one compare-and-set or one RPC.

**Send** `app/api/admin/bookings/[id]/payment-link/route.ts`: optional body tolerated (L60-67), a separate `resend` path that bypasses the dedup window on purpose (L142-168), Stripe / external failure leaves the row untouched and answers 502 (L204-209), lost race skips the duplicate email (L244-251), `logEmail` before the first send (L253-258; `lib/email-log.ts` allows `bookingId: null`). **Deviation:** a hashed token cannot be re-read, so "resend" creates a new token for the same version (and revokes the previous one) and returns the URL once in the response.

**Actor:** `const actor: LedgerActor = { type: 'admin', id: user.id }` (L191).

---

### Public API routes `app/api/quote/**` (route, token-gated)

**Analog:** `app/api/manage/cancel/route.ts` (whole file, 111 lines).

**Schema, token in the body, strict** (L23-28):
```typescript
const bodySchema = z
  .object({
    token: z.string().regex(MANAGE_TOKEN_RE),
    acknowledge: z.enum(['free', 'late']),
  })
  .strict()
```
**no-store on every answer and one uniform 404** (L30-39):
```typescript
const NO_STORE = { 'Cache-Control': 'no-store' } as const
function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}
function invalidLink(): NextResponse {
  return json({ error: 'invalid_link' }, 404)
}
```
**Guard order** (L79-111): `enforceMaxBody(request, 2_000)` -> `checkRateLimit('/api/manage/cancel', getClientIp(request))` (429) -> `request.json()` in try (400) -> `safeParse` (400) -> resolve token (uniform 404) -> engine in try / catch, log `{ bookingId }` only -> `respond(result)` switch that maps every engine outcome to HTTP and never passes a Stripe or database detail through (L42-77).

**Accept + pay** adds the cross-check style of `app/api/card-checkout/intent/route.ts`: `consent === true` only (L116-119, 422 `CONSENT_REQUIRED`), the stored text is the server rendering, a `fail(status, CODE, message, extra)` helper (L57-59), `ip: getClientIp(req)` and `userAgent: req.headers.get('user-agent') ?? ''` passed to the record (L204-205), 409 codes for a stale page (`PRICE_CHANGED` L134-137, `POLICY_CHANGED` L165-180). For quotes the stale-page case is "this version was replaced or voided": answer with the uniform invalid link, not with the new price.

**Mark viewed:** a POST with the token only; idempotent compare-and-set sent -> viewed; always 200 for a valid token, uniform 404 otherwise.

**Deviations / wiring (all four are needed or the route is unprotected):**
- `middleware.ts` L9-28 `CSRF_PROTECTED_PREFIXES` and L36-44 `CSRF_STRICT_ORIGIN_REQUIRED`: add `'/api/quote'` next to `'/api/manage'`. Note `/api/submit-quote` and `/api/submit-multiday-quote` already exist (inbound quote requests); `'/api/quote'` as a prefix does not match them, but check how `checkCsrf` compares prefixes before choosing the path.
- `lib/rate-limit.ts` L22-39 `LIMITS`: add one entry per quote route. A path that is not in `LIMITS` is never limited (L188-189: `if (!limit) return { allowed: true, ... }`). Brute-force note for the plan: `checkRateLimit(path, ip, { failClosed: true })` exists (L50-62) for paths where an Upstash outage must not open a guessing window.
- GET of the PDF, if it is a route: the token would be in the URL; same headers as the page, no logging of the URL.

---

### `app/[locale]/quote/[token]/page.tsx` + `InvalidQuoteLinkView.tsx` (server component)

**Analog:** `app/[locale]/manage/[token]/page.tsx`. The localized tree is the right home: D-09 picks a language per quote and ar / hi / zh need their fonts and `dir` (L19). `app/(internal)/driver/trip/[token]/page.tsx` is the non-localized variant (English only, `metadata.robots` L20-22, `z.string().uuid().safeParse(token)` before any read L108-113, one explicit select string L86-94); use it only as the anti-enumeration reference.

**Module header and metadata** (L26-41):
```typescript
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ locale: string; token: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params
  const locale = normalizeSiteLocale(rawLocale)
  const t = await getTranslations({ locale, namespace: 'Manage.meta' })
  return {
    title: t('title'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}
```
**Page function: token first, then the view, every failure is the one invalid view** (L492-508):
```typescript
export default async function ManageBookingPage({ params }: PageProps) {
  const { locale: rawLocale, token } = await params
  const locale = normalizeSiteLocale(rawLocale)
  setRequestLocale(locale)

  let view: ManageView | null = null
  try {
    const bookingId = await resolveManageToken(token)
    if (bookingId) view = await loadManageView(bookingId)
  } catch {
    view = null
  }

  if (!view) return InvalidManageLinkView({ locale })
  return ManageBookingView({ view, locale, token })
}
```
`params.locale` + `setRequestLocale`, never `getLocale()`; the service client is created inside the request, never at module load or build time.

**Rendering conventions:** translations with `getTranslations({ locale, namespace })` (L108-110); money through `formatMinor(amountMinor, currency)` from `@/lib/payments/money` and dates through `formatLocaleDate` / `formatLocaleDateTime` from `@/lib/locale-date` (L112-113), so no amount is ever typed in JSX; amounts, times and references wrapped in `<bdi dir="ltr">`, addresses in `<bdi dir="auto">` (L43, L395, L403); vehicle label from `Booking.vehicleClasses` via `VEHICLE_CLASS_KEY` (L142-143); the "Prague time" note under a pickup time (L417); inline style objects with CSS variables (`cardStyle`, `panelStyle`, `headingStyle`, `bodyStyle` L45-76) and the `btn-primary` / `btn-secondary` / `label` classes; `data-testid` on the main blocks (`manage-page`, `manage-details`).

**Invalid view** (`InvalidManageLinkView.tsx`): takes the locale and nothing else, so the markup is identical for every reason (L10-12). For quotes this is the "voided or expired link shows a clear message and no price data" criterion; D-05 (first pickup passed) uses the same view.

**Client island gets ready-made strings** (page L151-214, `ManageActions.tsx` L1-12): the layout has no client message provider, so the server page builds every string and node in the quote's language and passes them as a `copy` prop; the island translates nothing.

**Headers and private-path wiring (required, the page metadata alone is not enough):**
- `next.config.ts` L180-196: add the two entries for `/quote/:path*` and `/:locale(ru|es|fr|ar|hi|zh)/quote/:path*` with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, after the global entry.
- `lib/private-link-path.ts` L16: add `'quote'` to `PRIVATE_SEGMENTS`. Seven components (`CookieBanner`, `AnalyticsPageView`, `EngagementTracker`, `MetaPixel`, `GoogleAnalytics`, `ChatLauncher`, `Clarity`) use `isPrivateLinkPath` to keep trackers and chat off token pages.
- `middleware.ts` matcher: no change needed for a page path, but do not add a file extension to the quote URL (a `.pdf` path under a locale would hit the static-extension exclusion; `pdf` is not in the list today, keep the PDF behind an `/api/` path or add nothing to the matcher).
- Language: the link is built with the quote's language (`buildManageUrl(token, locale)` pattern); the page renders in `params.locale`. Decide whether a mismatch redirects or simply renders the URL's locale.

---

### `app/[locale]/quote/[token]/QuoteActions.tsx` (client component)

**Analogs:** `app/[locale]/manage/[token]/ManageActions.tsx` (island with copy props, explicit POST, required tick) and `components/booking/steps/Step6CardOnFile.tsx` (Stripe Elements).

From `ManageActions.tsx`: `'use client'`, typed `copy` props exported for the page to `import type` (L19-58), `useRouter` from `@/i18n/routing`, a tick that belongs to one variant and is cleared when the server answers that the terms changed (L10-11), one request at a time.

From `Step6CardOnFile.tsx`: `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)` at module scope (L65), `<Elements>` with `locale: STRIPE_ELEMENTS_LOCALE[locale]` from `@/lib/booking-locale` (L811-818, L1000), order `elements.submit()` -> POST to the server for the client secret -> `stripe.confirmPayment` with `confirmParams.return_url` built from `getPathname` (L383-447), consent kept in a ref so a stale closure cannot send an unticked consent (L211).

**Deviation:** the viewed POST fires once from an effect after mount (never from the server render). `return_url` contains the quote token, which is acceptable only because the page sends no Referer; do not add the token to any analytics or to `sessionStorage` snapshots (`writePurchaseSnapshot` at L31 is checkout-only, do not copy it).

---

### `messages/*.json` (i18n)

**Analog:** the `Manage` namespace (page copy) and `PaymentEmails` (email copy).

Top-level namespaces today: `Booking, Nav, Hero, ..., PaymentEmails, Manage`. Add a top-level `Quote` namespace with the same sub-structure as `Manage`: `meta.title`, `header`, `eyebrow`, `title`, `status`, `details`, `panel`, `invalid.{title,body}`, `actions.{...}`, `contact`. Email copy goes under `PaymentEmails` as new sub-keys (existing: `common, cardSaved, ..., extraCharged, feeWaived, contactOr`). Vehicle labels are reused from `Booking.vehicleClasses`.

Rules pinned by tests: every non-EN locale has exactly the EN key set and the same ICU parameters, no `[XX]` stub, differs from EN, types no amount, Latin digits only (`tests/payments-copy-i18n.test.ts` L112-213); amounts, dates and percents are ICU parameters (`{amount}`, `{freeUntil}`, `{percent}`), never typed. Real translations for all 7 locales in the same plan as the EN keys; never run `scripts/i18n-translate.mjs --dry-run`. Admin UI strings stay English literals in the components (the admin is not localized).

---

### Admin UI

**Page** `app/(internal)/admin/(dashboard)/quotes/page.tsx`. Analog: `app/(internal)/admin/(dashboard)/promo-codes/page.tsx` (whole file): `'use client'`, `useState` list + `loading`, `fetch('/api/admin/...')` in an effect, an H1 in `var(--font-cormorant)` 26px / 300 with `var(--admin-text)`, a muted 13px intro line, a form card (`var(--admin-surface)`, `1px solid var(--admin-border)`, radius 8, padding 24), then the table with an `onUpdate` refetch. The `(dashboard)` layout runs the admin gate. (`bookings/page.tsx` is the server-page variant that reads cookies and `searchParams`; use it only if the quote list needs a deep link such as `?quote=<id>`.)

**Nav** `components/admin/AdminSidebar.tsx` L34-46: add `{ href: '/admin/quotes', label: 'Quotes', icon: <lucide icon> }` to `navItems`.

**List** `components/admin/QuotesTable.tsx`. Analog: `components/admin/PromoCodesTable.tsx` L1-110: exported row interface, `thStyle` (11px, uppercase, letter-spacing 0.3em, `var(--admin-text-muted)`), local copy of the rows synced from props, optimistic update with revert on error, two-step delete confirm with a 3 s timeout. State badge: `BadgeShell({ family, label })` from `components/admin/StatusBadge.tsx` L44 with a `Record<state, { label, family }>` table like `PAYMENT_STATE_BADGE` (`components/admin/PaymentStateBadge.tsx` L9). The owner asked for an obvious "Cancel quote" action and a clear state badge on every row.

**Builder** `components/admin/QuoteBuilder.tsx`. Analog: `components/admin/ManualBookingForm.tsx`: `AddressInput` from `@/components/booking/AddressInput` for Places addresses (L4), a `Field({ label, children })` wrapper (L74), a "calculate" action that asks the server for the price (L157 posts to `/api/calculate-price`), an `override_price` flag sent with the save (L302), the payment-link result block with copy (`truncatePaymentLinkUrl`, `copyPaymentLinkToClipboard` from `@/lib/ui/payment-link-display`, L8) which fits "copy the quote link once". Field styles from `components/admin/adminFieldStyles.ts` (`inputBaseStyle`, `labelStyle`, `errorStyle`, `focusRingHandlers`). Money typed by the operator: `parseAmountToMinor` / `minorToInput` / `money` / `CURRENCY_DECIMALS` from `components/admin/paymentShared.ts` L98-140 (string handling to integer minor units, no float maths).
**Deviation:** `ManualBookingForm` is 1118 lines for one trip; a quote is a list of such trips. Extract one line editor component and repeat it rather than copying the form whole. The suggested amount per line comes from the new admin price route, never from a number in the component (pre-commit blocks hard-coded prices in `components/`).

**Void dialog and other confirm dialogs.** Analog: `components/admin/ExtraChargeModal.tsx` L1-17 imports (`Modal`, `DecisionButtons`, `DialogError`, `useFocusOnOpen` from `./paymentParts`), its rules L19-29 (the dialog states what will happen before anything is sent, the request goes only from the primary button, an in-flight ref blocks a second click, the dialog cannot be dismissed while the request runs), the `Outcome` union `{ kind: 'done' | 'stay' ... }` (L128-130), and a `NOT_ALLOWED_TEXT: Record<string, string>` map from the route's `reason` codes to plain sentences (L97-105).

**Quote bookings in the existing panels:** created bookings appear in the list, dispatch board and calendar through `admin_search_bookings` (`b.*`). `components/admin/PaymentStateBadge.tsx` and `lib/payments/actions.ts` L100-160 read `payment_mode`; check what they render for `'quote'` before adding a link from `BookingDetailPanel` back to the quote.

---

### Quote email (`lib/payments/emails/render.ts`, `send.ts`)

**Analog:** `lib/payments/emails/render.ts`; its header says "Phases 89 and 92 add kinds by adding an entry to TEMPLATES and catalog keys, nothing else" (L6-8).

**Renderer entry** (L816-843): `normalizeSiteLocale(localeInput)`, `loadMessages(locale)` (L157-160, dynamic import of `messages/<l>.json`), English fallback when the namespace is missing, `makeTranslator(locale, messages, 'PaymentEmails')` (L173-175), amounts via `formatMinor`, dates via `formatLocaleDate`, one shell `buildShell(...)`. Rules in the header (L10-27): every user-supplied string through `escapeHtml`, UTF-8 only and no named entities, amounts / references in `<bdi dir="ltr">`, `rtlLocales` for `dir`, a missing required variable makes the render throw, no operator note or reason reaches a client.

**Brand shell values** (from `lib/email.ts` L1680-1700, same in the localized shell): background `#0F1D2C`, gold line `linear-gradient(90deg, #BFA06A 0%, #E6D6B0 50%, transparent 100%)`, text `#F3EEE3`, `emailLogoImg(28)`, max width 600. `lib/email.ts` templates are English-only legacy; do not build the quote email there.

**Send** (`send.ts` L232-291):
```typescript
getResend().emails.send(
  { from: 'PRESTIGO Bookings <bookings@rideprestigo.com>', to: [to], replyTo: CUSTOMER_REPLY_TO, subject, html },
  { idempotencyKey },
)
```
**Attachment precedent** (`lib/email.ts` L1050-1062, the round-trip `.ics`): `attachments: [{ filename, content }]` on the same `emails.send` call. The quote PDF is attached the same way.

**Deviations:** `sendPaymentEmail` and `deliverOnce` (`lib/payments/notify.ts` L27-57) need a booking row and record delivery in the booking ledger; a quote email is sent before any booking exists. Either a sibling sender that dedups through `logEmail({ bookingId: null, emailType, recipient })` (`lib/email-log.ts` L20, 10-minute window) plus a Resend idempotency key derived from the quote version, or a delivery record on the quote tables. Content rule: the quote email and PDF state the quote's own amounts (they are the stored version's figures, formatted with `formatMinor`), which is allowed; they must show the cancellation terms that apply to this quote (D-03) and no waiting breakdown.

---

### Tests

| New test | Analog | What to copy |
|---|---|---|
| `tests/migration-090.test.ts` | `tests/migration-089.test.ts` L1-60 | `loadMigration(name)` (comments stripped), whitespace-flattened text, `statementFrom(needle)`, per-table `toContain` of each column / CHECK, the deny-all block (REVOKE, RLS, both policies, no GRANT), ledger list parity with `LEDGER_KINDS`, erasure superset check (`tests/erasure-payment-pii.test.ts` L19-30 `bodyIn` / superset helper) |
| `tests/quote-token.test.ts` | `tests/manage-link.test.ts` | cases L64-217: token shape, malformed value makes no database call, unknown / revoked / expired all return the same null, a database problem gives null and never throws, the token is never logged (spy on `console`), URL unprefixed for en and prefixed for the others |
| `tests/quote-routes.test.ts` (public) | `tests/manage-booking.test.ts` L11-60 | `vi.hoisted` mocks for the resolver, the engine and `checkRateLimit`; `vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockRate, getClientIp: () => '203.0.113.9' }))`; a `post(url, body, raw?)` Request helper; `beforeEach` resets with `mockRate.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 })`; the route's contract only (guards, uniform 404, every engine outcome mapped, nothing client-written in a log) |
| `tests/admin-quotes-route.test.ts` | `tests/admin-extra-route.test.ts` L1-75 | `world.auth: 'admin' | '401' | '403'` switch inside the `getAdminUser` mock, service client mocked to the in-memory db, `getPaymentsStripe: () => world.stripe`, route imported AFTER the mocks, a `seed(over)` helper |
| `tests/quote-page.test.tsx` | `tests/manage-page.test.tsx` L11-50 | all seven catalogs imported, `next-intl/server` pointed at its react-server build via `vi.importActual(reactServerBuild.path)`, server components awaited as functions then rendered, the invalid view identical for every reason, a leak guard (no email / phone / price data in the invalid markup), 7-locale key parity |
| `tests/quote-deposit-webhook.test.ts` | `tests/extra-webhook.test.ts` L1-110 | `// @vitest-environment node`; `vi.hoisted` world with `processed: new Set<string>()`; the `stripe_processed_events` fake table (select / insert with 23505 on a repeat); `vi.mock('@/lib/supabase', ...)` including the legacy exports (`saveBooking`, `buildBookingRow`, ...) so a test can prove the legacy chain was NOT reached; hold-failure handler as a spy that must not be called; Resend and `@/lib/ics` doubles |
| `tests/phase92-e2e.test.ts` | `tests/phase91-e2e.test.ts` L1-95 | real route handlers end to end, only the outside world faked: `createFakePaymentsDb`, `createFakeStripe`, `@/lib/route-distance`, `@/lib/pricing-config`, auth, mail; holders created in `vi.hoisted`; `vi.mock('@supabase/supabase-js', ...)` wrapping the fake client |
| quote email | `tests/payments-emails.test.ts` L1-40 | per-locale cases over `locales`, `rtlLocales`; only Resend is a double |

**Shared conventions:** `// @vitest-environment node` on server tests; `vi.hoisted` before any `vi.mock`; imports of the code under test after the mocks; `vi.mock(path, async (importActual) => ({ ...(await importActual<typeof import(path)>()), one: override }))` for partial mocks. `tests/helpers/fake-payments-db.ts`: add the quote tables to `TABLES` (L95-107) and to `FakePaymentsState` (L110-122), with defaults and CHECK emulation in the style of the 089 tables. `tests/helpers/fake-stripe.ts` covers `paymentIntents.create / retrieve / cancel`. Run targeted files (`npx vitest run tests/<file>`); `vitest related` crashes in this repo. Snapshot tests of HTML or JSON-LD must normalize `priceValidUntil`.

## Shared Patterns

### Admin route guard order
**Source:** `app/api/admin/bookings/[id]/extra/route.ts` L147-209
**Apply to:** every `app/api/admin/quotes/**` handler. `enforceMaxBody` -> `getAdminUser` (401 / 403) -> `await params` -> uuid (400) -> text + `JSON.parse` (400, 413) -> strict zod (400) -> row (404) -> state rules (422) -> busy / lost race (409) -> engine; `catch` logs ids only and answers 500. GET handlers: guard first, `Cache-Control: no-store` on answers that carry money (L103, L128-140).

### Public token route guard order
**Source:** `app/api/manage/cancel/route.ts` L79-111
**Apply to:** `app/api/quote/**`. `enforceMaxBody(…, 2_000)` -> `checkRateLimit(path, getClientIp(request))` (429) -> JSON (400) -> strict schema with the token regex (400) -> resolver (uniform 404 `invalid_link`) -> engine -> `respond()`. Token in the body, never in a URL or a log; `no-store` on every answer; CSRF prefix and rate-limit entry registered (see the public routes section).

### Token secrecy
**Source:** `lib/manage-link.ts` L13-14, L88-131; `next.config.ts` L180-196; `lib/private-link-path.ts`; page metadata L32-41
**Apply to:** the quote token lib, page, routes, email. 256-bit base64url token, format check before any database call, one null / one invalid view for every reason, never logged, `Referrer-Policy: no-referrer` + `Cache-Control: no-store` + `robots noindex`, no analytics / chat / cookie banner on the path. Quote-specific: only the sha256 is stored.

### Server is the price authority
**Source:** `app/api/admin/bookings/route.ts` L985-1104; `app/api/card-checkout/intent/route.ts` L131-137
**Apply to:** quote line pricing, the deposit, conversion. Amounts are computed or confirmed on the server and stored in the quote version; the public page never sends an amount; an operator override is explicit and logged with ids and amounts only.

### Money safety (deterministic key, no amount in the key, record before Stripe)
**Source:** `lib/payments/stripe.ts` L43-70 (`stripeKeys`), L86-108 (`cardMetadata`); `lib/payments/extra.ts` L479-495 (`recordClick`: the click is on record before anything can fail); `lib/payments/checkout.ts` L377-382
**Apply to:** `lib/payments/quote-deposit.ts`. Every `create` carries an idempotency key built from row ids and an attempt / acceptance id; metadata holds ids only; the acceptance row and the PaymentIntent id are stored before the client secret leaves the server; no automatic retry of a charge; logs carry ids and Stripe codes (`classifyStripeError`, `stripeErrorCode`), never messages.

### Ledger writes
**Source:** `lib/payments/state.ts` L72-83 (`LedgerEvent`), L225-239 (`appendPaymentEvent`)
**Apply to:** money events of the bookings a quote created (after conversion).
```typescript
await appendPaymentEvent(bookingId, {
  key: `charge_succeeded:${pi.id}`,          // exactly-once per (booking, key)
  kind: 'charge_succeeded',
  stripeObjectId: pi.id,
  amountMinor: pi.amount_received || pi.amount,
  currency: currencyOf(pi),
  actor: WEBHOOK_ACTOR,                       // { type: 'webhook' | 'system' | 'admin', id }
})
```
`lib/payments/state.ts` is the only module that calls the payment RPCs (`tests/payment-state-writers-gate.test.ts`). `errorCode` is a short code, at most 60 characters, never free text. Before conversion there is no booking id: the deposit's own record lives on the quote tables.

### Webhook dispatch
**Source:** `lib/stripe-webhook/dispatch.ts` L103-150 (classify by `metadata.kind`), L157-183 (`once`), L225-266
**Apply to:** the deposit. A `card_*` kind keeps the event out of the legacy chain; unknown kinds are acknowledged 200 without a write; a handler that throws returns 500 so Stripe retries; handlers are idempotent through their own keys.

### Service client and render safety
**Source:** `lib/supabase.ts` L5 `createSupabaseServiceClient`; `app/[locale]/manage/[token]/page.tsx` L26, L492-496
**Apply to:** all server libs, routes and the page. All quote tables are deny-all and reached only through the service client, created inside the request (never during static render or at module load). `export const dynamic = 'force-dynamic'`, `params.locale` + `setRequestLocale`.

### GNet / partner exclusion
**Source:** `lib/manage-link.ts` L44, L112 (`isPartnerBooking`); `lib/stripe-webhook/card-confirm.ts` L107-115 (`assertMoneyEligible`)
**Apply to:** conversion and the deposit. Quote bookings are `booking_source: 'manual'`, never partner rows; keep the guards in any shared money path.

### Prague time
**Source:** `lib/prague-date.ts` `pickupInstantMs`; `lib/locale-date.ts` L33, L73
**Apply to:** D-05 (first line's pickup passed), the operator's expiry date (D-02), the free-cancellation moment (D-03), every date on the page, PDF and email. Never compare date strings with the server clock; `pickup_utc` is generated by the database.

### Security commits
**Source:** `CLAUDE.md` hard rules
**Apply to:** token, public routes, headers, rate limits, RLS and erasure plans: run the tests, commit with the `security:` prefix.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Quote PDF render + `app/api/quote/pdf/route.ts` | service / route | file-I/O | No PDF code is tracked in the repo. The only precedent for an invoice PDF is a local, untracked script (HTML rendered by headless Chrome on the owner's machine), which cannot run on Vercel and must not be named as an analog. The tracked precedent is only the attachment call (`lib/email.ts` L1050-1062). Render path is a research decision (CONTEXT: no new runtime dependency unless nothing else works) |
| Hashed token store | service / migration | CRUD | `booking_manage_tokens` and `driver_assignments.trip_token` store the token itself. Only the hash helper style exists (`lib/payments/consent.ts` L62-64) |
| Remainder method "invoice" (record + email) | service | request-response | No invoice record or invoice email exists in tracked code; the roadmap asks for the minimal form (a record plus an email). Use RESEARCH.md |
| Deposit state before any booking exists | service | event-driven | The ledger (`appendPaymentEvent`), `deliverOnce`, `cardMetadata` and `ensureStripeCustomer` are all keyed by a booking id. The quote needs its own exactly-once keys and customer id until conversion |

## Metadata

**Analog search scope:** `app/api/admin`, `app/api/manage`, `app/api/card-checkout`, `app/api/webhooks`, `app/[locale]/manage`, `app/(internal)/driver`, `app/(internal)/admin/(dashboard)`, `components/admin`, `components/booking/steps`, `lib/*.ts`, `lib/payments`, `lib/payments/emails`, `lib/stripe-webhook`, `supabase/migrations` (085, 087, 088, 089), `tests`, `tests/helpers`, `middleware.ts`, `next.config.ts`, `messages/en.json`
**Files read for excerpts:** 34
**Tracked-source check:** `git ls-files --error-unmatch` passed for all 63 analog paths named here; no `.gsd/` mirror path and no untracked root script is used as an analog
**Pattern extraction date:** 2026-11-14
