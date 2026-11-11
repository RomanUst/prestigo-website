# Phase 91: Multi-Stop Transfers, Airport Pickup & Waiting Fees - Pattern Map

**Mapped:** 2026-11-11
**Files analyzed:** 27 (new + modified)
**Analogs found:** 25 / 27 (all analog paths verified git-tracked)

Migration number: next free is **089** (`supabase/migrations/` ends at `088_erasure_payment_pii.sql`). Re-run `ls supabase/migrations` at write time.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/089_*.sql` (booking_stops, booking_extra_charges, landing cols, waiting rate, ledger kinds, erasure fn) | migration | CRUD | `supabase/migrations/087_cancellation_cash_fee.sql` (+ 088 for erasure) | exact |
| `lib/stops.ts` | utility (pure) | transform | `lib/no-show-wait.ts` (pure helpers + constants) | role-match |
| `lib/airport-pickup.ts` | utility (pure) | transform | `lib/prague-date.ts` `pickupInstantMs` + `lib/prague-calendar.ts` | role-match |
| `lib/route-distance.ts` | service | request-response (Google Routes) | `app/api/calculate-price/route.ts` L222-290 | exact (extract) |
| `lib/booking-stops.ts` | service | CRUD | `lib/payments/fee.ts` `loadFeeCase`/`openFeeCase` (service-client table access) | role-match |
| `lib/payments/extra.ts` | service | request-response (Stripe off-session) | `lib/payments/fee.ts` + `lib/payments/settle.ts` `chargeSavedCard` | role-match |
| `app/api/admin/bookings/[id]/extra/route.ts` | route | request-response | `app/api/admin/bookings/[id]/fee/route.ts` | exact |
| `lib/payments/actions.ts` (add `charge_extra`) | service | request-response | itself, `charge_fee` branch | exact |
| `lib/payments/stripe.ts` (`card_extra`, `stripeKeys.extra`) | config | n/a | itself, `feeCharge`/`card_fee` | exact |
| `lib/stripe-webhook/dispatch.ts` (route `card_extra`) | middleware/dispatcher | event-driven | itself, `card_fee` | exact |
| `lib/stripe-webhook/charge-events.ts` (kind gate) | service | event-driven | itself | exact |
| `lib/payments/state.ts` `LEDGER_KINDS` (+`extra_charged`, `extra_failed`) | config | n/a | itself + `tests/helpers/latest-migration.ts` | exact |
| `lib/payments/consent-text.ts` (version bump) + 7 `messages/*.json` consent keys | config/i18n | n/a | itself (`CARD_CONSENT_VERSION`) | exact |
| `lib/payments/emails/*` (`extra_charged` email) + `PaymentEmails` catalog | service | request-response | `fee_charged` receipt via `sendReceipt` in `lib/payments/fee.ts` L492-500 | exact |
| `lib/checkout/compute.ts` (`priceCheckout`, schema, `buildCheckoutMeta`) | service | request-response | itself | exact |
| `app/api/calculate-price/route.ts` | route | request-response | itself | exact |
| `lib/pricing-helpers.ts` (drop `EXTRA_STOP_PRICE`) | utility | n/a | itself | exact |
| `lib/pricing-config.ts` (`waitingRate`) | service | CRUD (read) | itself (`hourlyRate` mapping) | exact |
| `app/api/admin/pricing/route.ts` + `components/admin/PricingForm.tsx` | route / component | CRUD | itself (`hourly_rate`) | exact |
| `lib/booking-store.ts`, `types/booking.ts` | store | event-driven | itself (`addStop`/`updateStop`) | exact |
| `components/booking/StopItem.tsx` (+ `StopList.tsx`) | component | event-driven | itself | exact |
| `components/booking/steps/cardCheckoutApi.ts` + `Step6Payment.tsx` body literal | utility/component | request-response | itself (`buildCardCheckoutBody`) | exact |
| `components/booking/RouteMap.tsx` (waypoints, sum legs) | component | streaming (Maps JS) | itself | exact |
| `components/admin/ExtraChargeModal.tsx` (+ hook into `BookingDetailPanel`/`PaymentPanel`) | component | request-response | `components/admin/FeeChargeModal.tsx` + `paymentParts.tsx` `useDecisionRequest` | exact |
| `lib/landing-change.ts` `applyLandingChange` + admin button | service | request-response | `app/api/admin/bookings/route.ts` L700-722 (PATCH + `reevaluateAfterEdit`) | role-match |
| `app/api/admin/flight-refresh/route.ts` (move-pickup action) | route | request-response | itself | exact |
| tests: `tests/helpers/fake-payments-db.ts` + new tests | test | n/a | `fake-payments-db.ts` `booking_fee_cases` emulation | exact |

## Pattern Assignments

### `supabase/migrations/089_*.sql` (migration, CRUD)

**Analog:** `supabase/migrations/087_cancellation_cash_fee.sql`

**New deny-all table** (087 L303-336; copy the whole shape for `booking_stops` and `booking_extra_charges`, but NO `UNIQUE` on `booking_id` for extras; `booking_stops` uses `UNIQUE (booking_id, position)`):
```sql
CREATE TABLE IF NOT EXISTS public.booking_fee_cases (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('late_cancel', 'no_show')),
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'charged', 'waived')),
  currency   text        NOT NULL CHECK (currency IN ('eur', 'czk')),
  reason     text        CHECK (reason IS NULL OR char_length(reason) <= 500),
  ...
);
REVOKE ALL ON public.booking_fee_cases FROM anon, authenticated;
ALTER TABLE public.booking_fee_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_fee_cases_no_public_read ON public.booking_fee_cases;
CREATE POLICY booking_fee_cases_no_public_read ON public.booking_fee_cases FOR SELECT USING (false);
DROP POLICY IF EXISTS booking_fee_cases_no_public_insert ON public.booking_fee_cases;
CREATE POLICY booking_fee_cases_no_public_insert ON public.booking_fee_cases FOR INSERT WITH CHECK (false);
```

**Ledger kind CHECK replacement** (087 L33-36): `ALTER TABLE public.booking_payment_events DROP CONSTRAINT IF EXISTS booking_payment_events_kind_check; ... ADD CONSTRAINT booking_payment_events_kind_check CHECK (kind IN (<full 087 list>, 'extra_charged', 'extra_failed'))`. Copy the full 087 list; the TS mirror `LEDGER_KINDS` is pinned by `tests/payments-state.test.ts`.

**Erasure:** `CREATE OR REPLACE` the function from `088_erasure_payment_pii.sql` (full copy + delete `booking_stops` rows + clear `booking_extra_charges.description`), then repeat `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.

Other items: `pricing_config.waiting_rate_per_15min numeric NULL CHECK (... > 0)` (no default, D-05); `bookings.landing_date/landing_time text NULL`, `pickup_offset_min smallint NULL CHECK (IN (0,15,30,45,60,90))`; recreate `bookings_gcal_sync` trigger (063) only if landing shown in calendar. Executors have no Supabase MCP: orchestrator applies and smokes.

---

### `lib/route-distance.ts` (service, request-response)

**Analog:** `app/api/calculate-price/route.ts` L222-290 (extract, then have both `calculate-price` and `priceCheckout` call it).

**Core pattern** (L222-262; keep verbatim: key trailing-`\n` defence, plain `latLng`, intermediates in order, no optimize, no `routingPreference`/`departureTime`/`via`):
```typescript
const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/\\n$/, '').trim()
const googleBody: Record<string, unknown> = {
  origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
  destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
  travelMode: 'DRIVE',
}
// NEVER set optimizeWaypointOrder
if (intermediates && intermediates.length > 0) {
  googleBody.intermediates = intermediates.map((stop) => ({
    location: { latLng: { latitude: stop.lat, longitude: stop.lng } },
  }))
}
const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
             'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration', 'Referer': 'https://rideprestigo.com' },
  body: JSON.stringify(googleBody),
})
```
**Duration parse** (L277-281): `durationRaw.replace(/[^0-9]/g,'')` -> `Math.round(sec/60)`.
**Deviation:** return typed `{ok:true, distanceKm, durationMin} | {ok:false}`, add `AbortSignal.timeout(8000)`. In checkout, `ok:false` -> `fail(503, 'ROUTING_UNAVAILABLE', ...)` (fail closed, D-17); in calculate-price keep today's `quoteMode: true` JSON.

---

### `app/api/calculate-price/route.ts` (modify)

**Zod fields to change** (L33-45): `intermediates` object gains `waitMinutes: z.number().int().min(0).max(120).refine(n => n % 15 === 0)`; `.max(5)` stays; delete `extraStops` and `applyExtrasAndRound`'s `extraStops * EXTRA_STOP_PRICE` term (L~55-60; keep `childSeats`).
**D-01:** skip the intercity fixed-price branch (L153-203) when `intermediates.length > 0`.
**Pricing chain to keep** (L264-266): `buildPriceMap('transfer', distanceKm, 0, 0, rates)` -> `applyGlobals(...)` -> extras; add waiting fee AFTER `applyGlobals` (no coefficient/min fare, D-14), returned as its own line, `null`/unavailable per class when `rates.waitingRate?.[vc]` is absent (D-05). Update `tests/calculate-price-intercity.test.ts:207` and `tests/pricing-helpers.test.ts:34`.

---

### `lib/checkout/compute.ts` (modify: single server price authority)

**Trust points to replace** (verbatim today):
- L49 `distanceKm: z.string().max(20).optional(),` keep accepting, ignore.
- L146 `const distanceKm = bookingData.distanceKm ? parseFloat(bookingData.distanceKm) : null` -> server `computeRouteDistance` from `originLat/originLng/destinationLat/destinationLng` + stops.
- L220 `const isAirport = bookingData.isAirport === 'true'` -> coordinate-based shared `isAirportTrip(origin, destination)`.
- L358 `distanceKm: bookingData.distanceKm ?? '',` in `buildCheckoutMeta` -> `String(priced.distanceKm)`.
- Return `distanceKm`, `durationMin`, `waitingFeeEur`, `stops` in `PricedCheckout`; pass `priced.distanceKm` to `evaluateCancellation` at `app/api/card-checkout/init/route.ts:73`, `intent/route.ts:151,183`.

**Extras sum seam** (L200-236, 251): waiting joins `extrasEur`/`totalEur = outboundLegEur + extrasTotalEur + returnLegEur` so promo applies once on the sum (D-14). Declare typed `stops` and `landing*` fields in the schema (not via `.catchall(BOUNDED_STRING)`). Landing -> pickup derived server-side with `pickupFromLanding`; 422 on mismatch or on landing for a non-airport origin.
**Error style:** reuse `fail(status, CODE, message)` (`PRICING_UNAVAILABLE`, `INVALID_REQUEST`); new codes `ROUTING_UNAVAILABLE` (503), `WAITING_NOT_AVAILABLE` (422).

---

### `lib/stops.ts` and `lib/airport-pickup.ts` (pure utilities)

**Analog:** `lib/no-show-wait.ts` L12-13 (exported constants `DEFAULT_CITY_MIN = 30`, `DEFAULT_AIRPORT_MIN = 60`) and `lib/prague-date.ts` L61-80 (`pickupInstantMs`, never throws, returns null).

Copy: constants-first module, no I/O, null on bad input. `waitingBlocks`/`pickupFromLanding` bodies are given in 91-RESEARCH.md "Pattern 1" and "Code Examples" (use those; they are written against the helpers above). Use `pickupInstantMs({pickup_utc:null, pickup_date, pickup_time})` + `offset*60_000`, then `pragueDateOf(ms)` and `formatPragueTime(ms)` (`lib/prague-calendar.ts:35,57`). Do not edit time strings (23:50 + 30 rolls the date). DST fixtures: 2027-03-28, 2027-10-31.
Airport on server: `isAirportPickup({origin_lat, origin_lng, origin_address})` (`lib/no-show-wait.ts:16-26`).

---

### `lib/payments/extra.ts` (service, Stripe off-session)

**Analogs:** `lib/payments/fee.ts` (discipline), `lib/payments/settle.ts` L283-311 (Stripe call). Do NOT call `settleBooking` (drives `payment_state`; `tests/payment-state-writers-gate.test.ts` fails on any other writer).

**Imports** (fee.ts L40-49):
```typescript
import { assertMoneyEligible, PartnerBookingMoneyError } from '@/lib/booking-status'
import { LEASE_SECONDS } from '@/lib/payments/config'
import { appendPaymentEvent, type LedgerActor } from '@/lib/payments/state'
import { classifyStripeError, getPaymentsStripe, isNotTheClientsFault, stripeErrorCode, stripeKeys } from '@/lib/payments/stripe'
```
**Audit row first, before anything can fail** (fee.ts L428-436):
```typescript
await appendPaymentEvent(bookingId, {
  key: `admin:fee_charge:${caseId}:${Date.now()}:${randomUUID().slice(0, 8)}`,
  kind: 'admin_action', errorCode: 'fee_charge',
  ...(isMinor(amountMinor) ? { amountMinor } : {}), currency: caseRow.currency, actor,
})
```
**Amount lock via CAS** (fee.ts L265-285): `.update(patch).eq('id', id).eq('status','pending').is('charge_requested_at', null).select('id')`, two passes, return `'locked' | 'amount_locked' | 'action_not_allowed'`. Stale-lock release by `LEASE_SECONDS` (L311-324).
**Off-session charge** (settle.ts L284-310):
```typescript
const pi = (await stripe.paymentIntents.create({
  amount: amountMinor, currency: ctx.currency, customer, payment_method: paymentMethod,
  payment_method_types: ['card'], off_session: true, confirm: true,
  metadata: cardMetadata(kind, { bookingId, attempt, bookingReference }),
}, { idempotencyKey: key })) as Stripe.PaymentIntent
if (pi.status === 'succeeded') return { kind: 'ok', pi, capturedMinor: pi.amount_received || amountMinor }
const code = pi.status === 'requires_action' ? 'authentication_required' : 'unexpected_status'
// catch: classifyStripeError(err); isNotTheClientsFault(kind) => busy (keep lock, same key replays); else definitive failure
```
**Outcome mapping** (fee.ts L447-480): succeeded -> status `charged` + ledger `extra_charged` + receipt; decline -> unlock, attempt+1, `{outcome:'declined'}`; transient -> keep lock, `{error:'payment_busy'}`; never auto-retry.
**Keys:** add `extra: (chargeId, n) => \`extra:${chargeId}:${n}\`` to `stripeKeys` (never the amount). Add `'card_extra'` to `CardKind`.
**Receipt:** copy `closeCharged` -> `sendReceipt({kind:'extra_charged', booking:{...fresh, payment_currency}, eventKey:\`email:extra_charged:${chargeId}\`, ...})`. Operator free text (description) lives only on the deny-all row, never in the ledger or client email.
**Waiting amount:** `ceil(minutes/15) * waitingRate[class]` (D-16), converted to row currency with `eurToCzk` for CZK rows.

---

### `app/api/admin/bookings/[id]/extra/route.ts` (route, request-response)

**Analog:** `app/api/admin/bookings/[id]/fee/route.ts` (copy the skeleton wholesale).

**Imports** L1-20 (`NextResponse`, `z`, `getAdminUser` from `@/lib/supabase/server`, `createSupabaseServiceClient`, `enforceMaxBody`, `allowedPaymentActions`, `appendPaymentEvent`, `LedgerActor`).
**Schema** (L52-65 pattern; shape in 91-RESEARCH.md "Operator extra charge request"): `z.discriminatedUnion('kind', [strictObject waiting {minutes int 1..480}, strictObject other {description trim 3..200, amount_minor int positive}])`. Strict: a currency in the body is a 400. Currency comes from the booking row; no business cap on "other" (D-13).
**Guard order** (L217-261; keep exactly): `enforceMaxBody` -> `getAdminUser()` (401/403) -> `await params` -> uuid (400) -> `request.text()` + `JSON.parse` (400) -> `safeParse` (400) -> `loadBooking` (404) -> `allowedPaymentActions(booking).includes('charge_extra')` else `notAllowed()` 422 `action_not_allowed` -> engine; `catch` logs ids only, 500 `Payment action failed`. 409 `payment_busy` mapped via a `respond()` like L80-93.

---

### `lib/payments/actions.ts` (modify)

**Analog:** itself. Add `'charge_extra'` to `FeeRouteAction` (L31-38; display name executed by the extra route). In `allowedPaymentActions` (L95): partner guard at L96 already returns `[]` for GNet (keep above the new branch). New branch (D-15): `status === 'completed'`, `card_hold` with `payment_state === 'captured'` or `cash_guarantee` with saved `stripe_customer_id` + `stripe_payment_method_id`, no extra charge in flight, and consent `text_version` >= new `CARD_CONSENT_VERSION` (D-12, server-enforced). Do not take an amount here (file header rule).

---

### `lib/stripe-webhook/dispatch.ts` (modify)

**Analog:** itself. Three edits, all adjacent to `card_fee`:
```typescript
// L65 handlePaymentFailed: BEFORE the hold fallback
if (kind === 'card_charge' || kind === 'card_difference' || kind === 'card_fee' || kind === 'card_extra') return handleCardChargeFailed(event)
// L130-136 classifyPaymentEvent, payment_intent.succeeded list: add `|| kind === 'card_extra'`
```
Also add `card_extra` to `SUCCEEDED_KINDS` and the kind gate in `lib/stripe-webhook/charge-events.ts`. Never write the extra PI id to `bookings.payment_intent_id`; store on `booking_extra_charges.stripe_payment_intent_id` and ledger `stripe_object_id`.

---

### `lib/pricing-config.ts`, `app/api/admin/pricing/route.ts`, `PricingForm.tsx` (waiting rate)

**Analog:** itself, the `hourly_rate` path.
- `getPricingConfig` select (L66-67) add `waiting_rate_per_15min`; map only positive values: `waitingRate: Object.fromEntries(data.filter(r => Number(r.waiting_rate_per_15min) > 0).map(r => [r.vehicle_class, Number(r.waiting_rate_per_15min)]))` (Supabase NUMERIC arrives as string: `Number()` cast, L84). Add `waitingRate?: Record<string, number>` to `PricingRates` as OPTIONAL and read `rates.waitingRate?.[vc]` (existing tests build partial rates; `PRICING_FALLBACK` L33-47 gets `waitingRate: {}`).
- Admin PUT schema (route L17-23): `waiting_rate_per_15min: z.number().positive().nullable().optional()`; `upsert` only writes provided columns, so omitting it does not clobber. Existing guard order there: `enforceMaxBody` -> `getAdminUser` -> `safeParse` (400) -> range check (422).
- No default amount in code or migration (D-05).

---

### `lib/booking-store.ts`, `components/booking/StopItem.tsx`, `types/booking.ts`

**Analog:** themselves.
- `StopItem.tsx` L14-19: `WAIT_TIME_OPTIONS` + local `useState` with comment "display-only ... NEVER sent" is the thing to replace: read/write `stop.waitMinutes` through a new store setter (`setStopWait(id, minutes)`), options from 0..120 in 15 steps (`Stop.waitMinutes?: number` already exists in `types/booking.ts`). Disable paid options when the selected class has no rate (D-05) using the price response, never a typed amount.
- Store setter pattern (L69-85): every stop mutation clears price state: `set((s) => ({ stops: ..., priceBreakdown: null, promoCode: null, promoDiscount: 0 }))`. Cap stays `if (s.stops.length >= 5) return s`.
- Add landing/offset state (`landingTime`, `pickupOffsetMin` default 30) next to `pickupDate/Time`; `stops` is already persisted, price/distance deliberately not (L161-172).

---

### `components/booking/steps/cardCheckoutApi.ts` + `Step6Payment.tsx` (~L365-390)

**Analog:** `buildCardCheckoutBody` L100-135 (shape above). Both builders must add: `stops` (array of `{address, lat, lng, waitMinutes}`), `landingDate/landingTime/pickupOffsetMin` (airport origin only). Stop sending `distanceKm` and `isAirport` as authority (leave harmless or remove). Existing `displayedAmountMinor` cross-check -> 409 `PRICE_CHANGED` handles drift.

---

### `components/booking/RouteMap.tsx`

**Analog:** itself. Add `waypoints: stops.map(s => ({ location, stopover: true }))` to the client `DirectionsService.route`; replace `legs?.[0]` reads (~L230) with a sum over `legs[].distance.value` / `duration.value`; add per-stop markers. Max 5 waypoints.

---

### `components/admin/ExtraChargeModal.tsx` (component, request-response)

**Analog:** `components/admin/FeeChargeModal.tsx` (full file read) + `paymentParts.tsx` `useDecisionRequest` (L133-175).

**Imports** (FeeChargeModal L1-24): `Modal`, `adminFieldStyles` helpers, `DecisionButtons, DialogError, useDecisionRequest, useFocusOnOpen`, `parseAmountToMinor`, `minorToInput`, `money`, `CURRENCY_DECIMALS`, `toCurrency` from `./paymentShared`.
**Money-action pattern:** typed text -> integer minor units by string handling (`parseAmountToMinor`); primary button label states the amount (`Charge ${money(typedMinor, currency)}`); POST sent only from the primary button; in-flight `useRef` blocks double submit; `interpret(charged)` maps `{status, body}` to `{kind:'done'|'stay'|'gone'}` (L93-107); modal not dismissible while `submitting`. Dialog states amount + currency + "charged to the saved card now" (D-10). Two modes: waiting (operator enters minutes; amount shown read-only from the API/rate) and other (description + amount).
**Deviation:** `useDecisionRequest` posts via `postFeeAction` (fee route). Generalize it (accept a post function/URL) or add a sibling `postExtraAction`; do not point the extra modal at the fee route. Wire the button from `allowed_actions` (`charge_extra`) in `PaymentPanel.tsx`, which is the one place that renders buttons from the server matrix, and surface it in `BookingDetailPanel.tsx`.
**Hard rule:** no typed EUR amounts in `components/`; rate/amount strings come from the API response.

---

### `lib/landing-change.ts` + move-pickup button (D-08, D-11)

**Analog:** `app/api/admin/bookings/route.ts` L700-722 (PATCH edit -> `reevaluateAfterEdit`):
```typescript
const paymentEffect = await reevaluateAfterEdit({
  bookingId: parsed.data.id, before: current, priceChanged, pickupChanged,
  actor: { type: 'admin', id: user?.id ?? null },
})
```
One function `applyLandingChange(bookingId, newLanding, actor)`: update `landing_*`, `pickup_*` = `pickupFromLanding(...)`, call `reevaluateAfterEdit`, then the same driver/client notification as a manual edit. Trigger: operator button in the booking panel, via an extended `app/api/admin/bookings/flight-refresh` route. That route's skeleton (L22-53): `enforceMaxBody` -> admin guard -> zod parse -> service-client read of `flight_iata, pickup_date`; extend the select with `landing_*`, `pickup_offset_min` and add a separate explicit move action. Do not move automatically (D-11); cron stays out of scope.

---

### Display surfaces (STOP-04)

| File | Analog / change |
|---|---|
| `lib/booking-stops.ts` + `attachStops` | one loader `.from('booking_stops').select(...).in('booking_id', ids)`; used by `app/api/admin/bookings/route.ts`, `app/api/admin/bookings/dispatch/route.ts`, driver trip page, email senders. `admin_search_bookings` returns `b.*`, so landing columns flow automatically; stops do not |
| `app/(internal)/driver/trip/[token]/page.tsx` | explicit `TRIP_SELECT` string: add `landing_date, landing_time, pickup_offset_min` + stops query |
| `lib/payments/emails/send.ts` `bookingEmailDataFromRow` (L37-50) | copy the `str()/num()` mapping style; add optional `stops`, `landing` to `BookingEmailData` in `lib/email.ts` (`buildConfirmationHtml`, `buildStatusEmailHtml`, `driverTripDetailsRows`) |
| `lib/supabase.ts` `buildBookingRow` / `captureUnpaidBooking` | add landing columns to the row; `saveBookingStops` replace-all (delete by `booking_id`, insert) right after a non-empty capture; never touch stops once the booking left `unpaid` |
| `components/admin/TripEditPanel.tsx` (~L284) + PATCH | return 422 `stops_edit_unsupported` for bookings with stops (Pitfall 10) |

---

### Tests

**Analog:** `tests/helpers/fake-payments-db.ts`: add `'booking_stops'` and `'booking_extra_charges'` to `TABLES` (L92-102), row typing (L111), defaults (L182 pattern) and CHECK emulation (L200-202 pattern `if (!['pending','charged','waived'].includes(row.status)) return '<table>_status_check'`). `tests/helpers/latest-migration.ts` for the ledger-kind parity and `tests/migration-089.test.ts`. Conventions: `vi.hoisted` before `vi.mock`, `// @vitest-environment node` for server tests, `fake-stripe.ts` for the off-session charge, a shared route-distance mock for the ~8 tests that pass a client `distanceKm`. Normalize `priceValidUntil` in any golden JSON-LD test.

## Shared Patterns

### Admin route guard order
**Source:** `app/api/admin/bookings/[id]/fee/route.ts` L217-261
**Apply to:** the new `/extra` route, the move-pickup action. `enforceMaxBody` -> `getAdminUser` -> id/JSON/strict-schema 400 -> 404 -> 422 business rules -> 409 busy; `catch` logs ids only.

### Money safety (ledger first, deterministic key, no amount in key)
**Source:** `lib/payments/fee.ts` L428-440, `lib/payments/stripe.ts` L56-77 (`stripeKeys`), L82-105 (`cardMetadata`)
**Apply to:** `lib/payments/extra.ts`. `admin_action` ledger row first, locked amount, key from row id + attempt, `cardMetadata('card_extra', ...)` (never the legacy booking-id key), no automatic retry, ids and codes only in logs.

### GNet exclusion
**Source:** `lib/payments/actions.ts` L96 (`isPartnerBooking` -> `[]`), `lib/payments/fee.ts` L102 (`assertMoneyEligible`)
**Apply to:** extra engine and route, so "never for GNet" holds by construction. Keep `computeOutboundLegTotal`'s signature unchanged (GNet `app/api/gnet/farmin/route.ts` imports it; leave its own Routes fetch alone).

### Server is price authority
**Source:** `lib/checkout/compute.ts` (`priceCheckout`), `fail()` helper
**Apply to:** every checkout flow (`/api/card-checkout/init|intent`, `/api/create-payment-intent`). Ignore client `distanceKm`, `isAirport`, amount; client amount is only a cross-check (409 `PRICE_CHANGED`).

### Zod two-step parse
**Source:** `app/api/admin/pricing/route.ts` L58-76 (schema 400, range 422), `fee/route.ts` strictObject
**Apply to:** `/api/calculate-price` (stops), checkout schema, `/extra`.

### Prague time
**Source:** `lib/prague-date.ts` `pickupInstantMs`, `lib/prague-calendar.ts` `pragueDateOf`/`formatPragueTime`
**Apply to:** `airport-pickup.ts`, `applyLandingChange`, driver "free waiting until" (pickup + `getNoShowThresholds().airportMin`). `pickup_*` stays the pickup instant (D-18); `pickup_utc` is generated, never inserted.

### i18n and consent
**Source:** `lib/payments/consent-text.ts` L1-26 (`CARD_CONSENT_VERSION = '2026-11-2'`)
**Apply to:** D-12: one sentence in `consentSetup/consentHoldNow/consentCash` (+ NoFree variants) in all 7 locales, bump the version, update `tests/payments-consent.test.ts` EN pins and `tests/payments-copy-i18n.test.ts`. New `Booking.stopItem`/`entryBar`/`priceSummary` keys need real translations in all 7 locales (never `--dry-run`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Airport landing + offset UI in `EntryBar.tsx` / Step 2 | component | event-driven | No existing "derived time from another time" control; build on `EntryBar` flight field (`isAirportPlace(origin)` gate, L~85) and Step2 time grid; show landing, offset select, derived pickup |
| Admin "Move pickup to HH:MM" confirm dialog | component | request-response | Closest is `useBookingMoves.tsx` confirm dialogs (in-flight `useRef<Set<string>>` L69, confirm-before-PATCH, e.g. the complete-trip dialog); reuse its pattern, no exact analog for flight-delay move |

## Metadata

**Analog search scope:** `app/api/admin`, `app/api/calculate-price`, `lib/checkout`, `lib/payments`, `lib/stripe-webhook`, `components/admin`, `components/booking`, `lib/*.ts`, `supabase/migrations`, `tests/helpers`
**Tracked-source check:** `git ls-files` returned all 10 sampled analog paths (no `.gsd/` mirror paths used)
**Pattern extraction date:** 2026-11-11
