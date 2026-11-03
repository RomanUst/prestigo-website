# Architecture Patterns

**Domain:** Premium chauffeur booking platform (Next.js App Router + Supabase + Stripe), milestone v5.0 "Payments, Quotes & Day Trips" added to the shipped v4.0 codebase
**Researched:** 2026-11-02
**Mode:** Integration architecture for a SUBSEQUENT milestone (what is new vs modified, not a greenfield design)
**Overall confidence:** HIGH on codebase integration points (read from source); MEDIUM on Stripe/QStash/Vercel limits (official docs, a few conflicting third-party numbers); LOW only where flagged (GNet no-show semantics).

> `.planning/codebase/ARCHITECTURE.md` is stale (dated 2026-03-20, describes a pre-booking marketing site). Everything below is derived from the current source tree, not from that file.

---

## Executive Position (read this first)

1. **Payment lifecycle is a second state machine next to `bookings.status`, never folded into it.** `status` stays the operational vocabulary (dispatch, driver, GNet, CRM, calendar). A new `payment_state` column family carries money. Seven downstream systems hard-code the status list; adding payment meaning to it multiplies that fan-out.
2. **The "hold ~5 days before" requirement is unsafe as stated.** Stripe documents that a Visa merchant-initiated (off-session) authorization lives **4 days 18 hours** (5 days nominal); Mastercard/Amex/Discover 7. A hold placed at T-5d on a Visa card expires before pickup. Default the lead to **72 h** (configurable in `pricing_globals`), place the hold immediately when the booking is already inside the lead window, and add a capture-before watchdog. (HIGH, official Stripe doc: docs.stripe.com/payments/place-a-hold-on-a-payment-method)
3. **The scheduler is a DB-as-queue plus a signed tick endpoint, not per-booking delayed messages.** Existing QStash per-booking delay is capped at 7 days (`MAX_DELAY_SECONDS` in `lib/outbox.ts`, free plan), and Vercel Hobby crons run at most once a day with +/-59 min precision (all 4 existing crons are daily). Use a QStash Schedule (every 15-30 min) hitting `/api/cron/payment-tick` as primary, with the existing Vercel daily cron as a backstop calling the same endpoint. Do NOT put payment jobs into the CRM integration outbox (its key regexes, dispatcher and "imports no CRM code" guard are CRM-specific).
4. **Reverse DTRIP-04 by extracting the status mutation logic that today lives inline in `app/api/admin/bookings/route.ts` PATCH (~200 lines: transition check, payment-link deactivation, emails, QStash reminder, GNet push) into one service, `advanceBookingStatus()`.** Admin PATCH, the driver progress route, cancel, and the payment engine all call it. Without this extraction the driver sync would be a third copy of that logic.
5. **Admin theming is cheaper than it looks** because `.theme-light` already exists in `app/globals.css` and remaps the token vars (`--anthracite`, `--offwhite`, `--copper`, ...) that admin components use ~800 times via `var()`. The real work is ~234 hard-coded hex literals in 33 admin files (many are the *retired* old palette `#28282B/#4E4E56/#B87333`) plus status-badge colors.
6. **Build order:** admin shell (theme + sidebar) -> status vocabulary + driver sync -> payments -> dispatch views (board/calendar) -> multi-stop/airport/waiting -> quotes -> day trips. Rationale in the Build Order section.

---

## Recommended Architecture

### Layered view (what exists, what v5.0 adds)

```
                       PUBLIC (app/[locale]/…, next-intl, 7 locales)
 /book wizard ──────────────────────────  /day-trips (NEW)  /quote/[token] (NEW, noindex)
   Step6Payment: pay now | card hold | cash (MOD)           custom-tour form (NEW)
        │                                        │                    │
        ▼                                        ▼                    ▼
 /api/create-payment-intent (MOD)    /api/submit-custom-tour (NEW)   /api/quote/[token]/checkout (NEW)
 /api/create-setup-intent   (NEW)    → storeInquiry('custom_tour')   → Stripe Checkout Session (deposit)
        │  both call ▼                       │ (existing trigger → outbox → EspoCRM Lead)
 lib/checkout/compute.ts (NEW, extracted from create-payment-intent)
        │
        ▼
 ┌────────────────────────── SUPABASE (source of truth) ──────────────────────────┐
 │ bookings (+payment_*, +stripe_*, +quote_id, +day_trip_id, +free_wait_min …)    │
 │ booking_stops (NEW)  booking_status_log (NEW)  booking_payment_events (NEW)    │
 │ quotes (NEW) quote_items (NEW) quote_payments (NEW)                            │
 │ day_trips (NEW; 3 price columns like route_prices)                             │
 │ pricing_globals (+hold lead, waiting fee, airport offset, deposit defaults)    │
 │ inquiries (kind CHECK += 'custom_tour')                                        │
 └────────────────────────────────────────────────────────────────────────────────┘
        ▲                       ▲                              ▲
        │                       │                              │
 lib/booking-status-service.ts   lib/payments/* (NEW engine)    lib/quotes/* (NEW)
  advanceBookingStatus()         setup/hold/capture/noshow/      materialize quote → bookings
  (NEW, extracted from PATCH)    recover/release + events log
        ▲        ▲        ▲               ▲            ▲
        │        │        │               │            │
  admin PATCH  driver   cancel     /api/webhooks/stripe (MOD: thin dispatcher     /api/cron/payment-tick (NEW)
  (MOD)        progress (MOD)      → lib/stripe-webhook/* handlers, by metadata.kind)   QStash Schedule + Vercel daily backstop
               (MOD)
```

### Component Boundaries

| Component | Responsibility | Status | Communicates With |
|-----------|---------------|--------|-------------------|
| `lib/stripe.ts` | ONE lazy Stripe client (today 3-4 divergent copies: create-payment-intent, stripe-payment-links, webhook route, cancel route) | NEW (consolidation) | every payments module |
| `lib/booking-status.ts` | Single TS source for status vocabulary: `BOOKING_STATUSES`, `TERMINAL`, `VALUE_STATUSES`, driver-step map | NEW | transitions, trip-token, mappings, StatusBadge; SQL parity tests |
| `lib/booking-status-service.ts` | `advanceBookingStatus(id, to, {actor})`: compare-and-set UPDATE, status log row, emails, GNet push, reminders, link deactivation, payment hooks (capture / no-show / release) | NEW (extracted from `app/api/admin/bookings/route.ts` PATCH) | admin PATCH, driver progress, cancel, payments engine, GNet client |
| `lib/payments/*` | Payment state machine: `setup`, `scheduleHold`, `placeHold`, `capture`, `release`, `chargeNoShow`, `recoverViaLink`, `chargeExtras`; writes `booking_payment_events` | NEW | Stripe, Supabase, email, status service |
| `lib/stripe-webhook/*` | One file per event family; `app/api/webhooks/stripe/route.ts` shrinks to signature check + idempotency + dispatch | NEW (split of a 1034-line file) | payments engine, existing handlers |
| `lib/checkout/compute.ts` | Validation + server pricing + metadata building extracted from `create-payment-intent` (~300 lines) so setup-intent, admin create, day-trip and quote paths share ONE pricing authority | NEW (extracted) | server-pricing, route-prices, pricing-config |
| `lib/route-distance.ts` | Google Routes call with intermediates, extracted from `calculate-price`; also used to *verify* client `distanceKm` | NEW (extracted) | calculate-price, create-*-intent, admin create |
| `lib/stops.ts` | Waiting-time + fee math (free minutes, per-15-min fee) from status/stop timestamps | NEW | driver stop route, admin extras-due |
| `lib/quotes/*` | Token generation, deposit math, item pricing, `materializeQuote()` → bookings | NEW | payments engine, server-pricing |
| `lib/day-trips.ts`, `lib/day-trip-prices.ts` | DB structural data + live prices (clone of `lib/route-prices.ts`, same ISR/fallback behavior) | NEW | pages, calculate-price, create-*-intent |
| `app/api/cron/payment-tick` | Claims due work: place holds, retry transient failures, capture-after-complete retries, expiring-hold watchdog, no-show charge reminders | NEW | `lib/payments/*` |
| Admin shell (layout + `AdminSidebar` + theme) | Collapsible sidebar, light theme via cookie → `data-admin-theme` | MODIFIED | all admin pages |
| `BookingDetailPanel` (extracted from `BookingsTable`) | Reusable booking drawer for list, board, calendar | NEW (extracted from 2886-line file) | list/board/calendar |
| Board + Calendar views | Read-mostly dispatch views on a slim range endpoint | NEW | `GET /api/admin/bookings/board` (NEW) |
| Driver trip page + progress route | Single next-step flow, writes through status service | MODIFIED | status service |

### Data Flow

**Card-hold booking (Feature 1):**
1. Wizard Step 6 → `POST /api/create-setup-intent` (CSRF-strict, same guards as create-payment-intent). Server recomputes price via `lib/checkout/compute.ts`, creates/reuses a Stripe **Customer**, creates a **SetupIntent** (`usage:'off_session'`, `payment_method_types:['card']` — a hold needs a card; do not allow SEPA/iDEAL on this path), and captures an `unpaid` booking row exactly like today (`captureUnpaidBooking`, **attemptId made mandatory** here because `payment_intent_id` is NULL and the `(payment_intent_id, leg)` upsert key cannot dedupe NULLs).
2. Client `stripe.confirmSetup()` with the existing `PaymentElement` (3DS happens here — this is the SCA anchor for later off-session use). Redirect to the existing confirmation page (it is sessionStorage + `ref`-driven, no server dependency on `payment_intent`).
3. Webhook `setup_intent.succeeded` → `handleSetupSucceeded`: reconcile `unpaid → confirmed` (same status-gated pattern as `reconcileBookingToConfirmed`), store `stripe_customer_id`, `stripe_payment_method_id`, set `payment_mode`, compute `hold_at = pickup_utc - hold_lead`, set `payment_state = hold_scheduled` (or place the hold immediately when `hold_at <= now`), send the confirmation email suite + GA4/CAPI + QStash 2h reminder.
4. `payment-tick` claims due rows (`payment_state='hold_scheduled' AND hold_at <= now()`), creates an off-session manual-capture PaymentIntent (`off_session:true, confirm:true, capture_method:'manual'`, idempotency key `hold:<bookingId>:<attempt>`), sets `authorized` + stores `hold_payment_intent_id` and `capture_before`.
5. Driver/admin marks `completed` → `advanceBookingStatus` → `capturePayment()` (best-effort in `after()`; the tick retries any `completed ∧ authorized` row). `payment_intent_id` is set to the hold PI **only at capture**, so every existing consumer that treats `payment_intent_id IS NOT NULL` as "money moved" (cancel→refund, stats, invoices, erasure) stays truthful.
6. Failure at step 4 (`authentication_required`, decline) → `payment_state='failed'`, create a payment link (existing `createBookingPaymentLink` with new `purpose:'hold_recovery'` metadata), email client, alert operator (`sendManagerAlert`), surface in admin. Payment of the link → webhook marks `captured` (see Pitfall: stale-link CR-02 branch).

**Cash with card guarantee (Feature 2):** same steps 1-3, `payment_mode='cash_guarantee'`, state `card_saved`, no hold ever scheduled. On `completed`: state → `cash_settled` (operator confirms cash received). On `no_show`: alert + **operator-confirmed** one-click 100% off-session charge (`chargeNoShow`, idempotency key `noshow:<bookingId>`); an `auto_charge_noshow` flag in `pricing_globals` (default false) exists for later. Reason: one driver mis-tap must not silently charge a customer 100%.

**Driver status sync (Feature 5):** driver taps the single next step → `POST /api/driver/trip/[token]/progress {step}` → token + `isTripLinkValid` check (kept) → `advanceBookingStatus(bookingId, mapped, {actor:'driver'})` → `UPDATE … WHERE id=$1 AND status=$prev` (compare-and-set; lost race returns 409 + current state) → `booking_status_log` row → side effects in `after()`. `driver_assignments.trip_progress` stays written (admin display back-compat) but is no longer the source of truth.

**Quote (Feature 3):** operator builds quote (items priced server-side, optional override) → `sent` → client opens `/[locale]/quote/[token]` (noindex, private cache) → "Pay deposit" → `POST /api/quote/[token]/checkout` creates a **fresh Checkout Session** (`setup_future_usage:'off_session'`, `customer_creation:'always'`, metadata `quoteId`, `purpose:'deposit'`) → `checkout.session.completed` → `handleQuoteDeposit`: mark deposit paid, store customer/PM, **materialize each `quote_item` into a `bookings` row** (+`booking_stops`), confirm, one client email. Remainder per `remainder_method`: saved card (tick or operator button), payment link (same Checkout mechanism, `purpose:'remainder'`), cash, invoice.

**Day trip (Feature 7):** `/day-trips/[slug]` (static, ISR 120 s, prices live from DB) → `/book?dayTrip=<slug>` → `calculate-price` returns fixed class prices for the slug → `create-payment-intent` / `create-setup-intent` branch `tripType:'day_trip'` (server loads price from `day_trips`; unknown/inactive slug rejected). Custom tour form → `storeInquiry('custom_tour')` → existing inquiries trigger → outbox → EspoCRM Lead (zero new plumbing) → operator opens `/admin/quotes/new?inquiry=<id>`.

---

## Data Model Changes (migrations from 084)

All new tables follow the repo convention: RLS enabled with deny-all policies, `REVOKE ALL … FROM anon, authenticated`, service-role access only; any `DROP+CREATE` of a SECURITY DEFINER function must re-`REVOKE … FROM PUBLIC, anon, authenticated` (documented gotcha). Migrations are applied live by the operator/orchestrator (executors have no Supabase MCP).

| # | Migration | Contents |
|---|-----------|----------|
| 084 | `084_booking_statuses_status_log.sql` | `bookings_status_check` DROP+RECREATE adding `on_board`, `no_show` (pattern of 040/053); `booking_status_log`; `completed_at`; `CREATE OR REPLACE booking_lead_status()` (067) with new statuses; gcal trigger accepted-status list (063); panel (080) and stats (081-083) status lists |
| 085 | `085_payment_state.sql` | `bookings` payment columns, `booking_payment_events`, `claim_due_payment_work()` (FOR UPDATE SKIP LOCKED + lease, modeled on `outbox_claim` in 064), partial index `bookings_hold_due_idx`, `pricing_globals` payment settings |
| 086 | `086_stops_airport_wait.sql` | `booking_stops`, bookings `landing_time`/`pickup_offset_min`/`free_wait_min`/`extras_due_eur`, `pricing_globals` waiting + airport settings |
| 087 | `087_quotes.sql` | `quotes`, `quote_items`, `quote_payments`, `bookings.quote_id/quote_item_id` |
| 088 | `088_day_trips.sql` | `day_trips`, `bookings.day_trip_id`, `trip_type` CHECK += `day_trip` (verify live constraint first — name unverified) |
| 089 | `089_inquiries_custom_tour.sql` | `inquiries.kind` CHECK += `custom_tour`; `lead-mapping` kind label |

### bookings payment state machine (new columns, orthogonal to `status`)

```
payment_mode   text  CHECK IN ('pay_now','card_hold','cash_guarantee','link','invoice','cash','partner','quote')
                     -- backfill: payment_intent_id NOT NULL → 'pay_now'; booking_source='gnet' → 'partner';
                     -- manual w/o PI → 'cash'/'invoice'/'link' by existing flags. NULL = legacy, treated as pay_now.
payment_state  text  CHECK IN ('none','setup_pending','card_saved','hold_scheduled','hold_processing',
                               'authorized','captured','released','failed','cash_settled',
                               'noshow_pending','noshow_charged','refunded')
stripe_customer_id text, stripe_payment_method_id text, setup_intent_id text (partial UNIQUE with leg),
hold_payment_intent_id text, hold_at timestamptz, hold_attempts smallint DEFAULT 0, hold_lease_until timestamptz,
capture_before timestamptz, captured_amount_eur numeric, captured_at timestamptz, last_payment_error text
```

Transition table (only `lib/payments/state.ts` may write `payment_state`; UI and routes call engine functions):

| From | To | Trigger | Actor |
|------|----|---------|-------|
| `none` | `setup_pending` | create-setup-intent captures unpaid row | route |
| `setup_pending` | `card_saved` / `hold_scheduled` | `setup_intent.succeeded` (hold mode → scheduled; cash mode → card_saved) | webhook |
| `hold_scheduled` | `hold_processing` | tick claims row (lease) | tick |
| `hold_processing` | `authorized` | PI `requires_capture` (API response; `amount_capturable_updated` reconciles) | tick/webhook |
| `hold_processing` | `hold_scheduled` | transient Stripe error, `hold_attempts < 3` | tick |
| `hold_processing` | `failed` | card error / `authentication_required` | tick → link + alert |
| `authorized` | `captured` | status → `completed` | status service / tick |
| `authorized` | `released` | booking cancelled (PI `cancel`, 0 fee) or hold expired (`payment_intent.canceled`) | cancel / webhook |
| `failed` | `captured` | recovery link paid (`purpose:'hold_recovery'`) | webhook |
| `card_saved` | `noshow_pending` → `noshow_charged` | status `no_show` → operator confirms | status service / admin |
| `card_saved` | `cash_settled` | status `completed` + operator "cash received" | admin |
| `hold_scheduled`/`card_saved` | `released` | booking cancelled before any money moved | cancel |
| `captured` | `refunded` | existing refund flow (`charge.refunded`) | admin/webhook |

`booking_payment_events` (append-only): `booking_id, kind, stripe_object_id, amount_minor, status, error_code, actor, created_at`. This is the admin payment timeline and the dispute evidence; it also makes tick runs idempotent to reason about.

### Stops, airport, waiting

- `booking_stops(id, booking_id → bookings ON DELETE CASCADE, position smallint, address, lat, lng, place_id, planned_wait_min, arrived_at, departed_at, actual_wait_min, wait_fee_eur)`, `UNIQUE(booking_id, position)`. Stops are **per leg**. Quote items carry a `stops jsonb` snapshot, materialized into `booking_stops` on acceptance.
- Today wizard stops only influence `distanceKm` (Step3Vehicle passes `intermediates` to `calculate-price`); **they are not sent to `create-payment-intent`, not persisted, and the server trusts the client `distanceKm`** (`StopItem` has a local-only `waitMinutes` stub). v5 makes `create-*-intent` and admin create re-derive distance server-side through `lib/route-distance.ts` (tolerance check or always-recompute when stops exist). The flat `EXTRA_STOP_PRICE = 20` in `lib/pricing-helpers.ts` conflicts with "price by km through all stops" and must be removed from the wizard path (keep only for the calculator widget if still wanted).
- Waiting policy lives in `pricing_globals` (follow migration 058 + `PricingGlobals` type + `getPricingConfig` select list + `/api/admin/pricing` + `PricingForm`): `stop_free_wait_min` (15), `stop_wait_fee_eur_per_15min`, `airport_pickup_offset_min` (30), `airport_free_wait_min` (60), `payment_hold_lead_hours` (72), `auto_charge_noshow`, `deposit_default_*`.
- Airport offset: store `landing_time` + `pickup_offset_min` + snapshot `free_wait_min` on the booking; `pickup_time/pickup_utc` stay the *final* pickup time, so reminders (24h cron, QStash 2h), Google Calendar sync, driver sheet and lead-time (12 h) validation are unchanged. Free waiting is counted from `pickup_utc`; actual wait = `on_board` log timestamp minus `max(arrival, pickup_utc)`.
- Waiting fee is a **post-trip extra**, computed from `booking_status_log` and `booking_stops` timestamps, stored as `extras_due_eur`, and collected only by operator action (charge saved card / send payment link / add to invoice). Overcapture beyond the authorized amount is not generally available for cards, and pay-now bookings have no saved card unless `setup_future_usage` was set at checkout — so the waiting fee couples Feature 6 to Feature 1 and must not auto-charge.

### Quotes

`quotes(id, quote_number, public_token UNIQUE (>=128-bit random, base64url), status [draft|sent|viewed|accepted|deposit_paid|paid|declined|expired|cancelled], revision, client_name/email/phone/company, locale, user_id?, inquiry_id?, valid_until, total_eur, deposit_type [none|percent|fixed], deposit_value, deposit_amount_eur (frozen at send), remainder_method [saved_card|payment_link|cash|invoice], remainder_due_at, stripe_customer_id, stripe_payment_method_id, sent_at, accepted_at, created_by)`; `quote_items(id, quote_id, position, kind [transfer|hourly|daily|day_trip|custom], title, trip fields…, vehicle_class, price_eur, price_override bool, stops jsonb, day_trip_id?, booking_id?)`; `quote_payments(id, quote_id, kind [deposit|remainder|adjustment], amount_eur, method, stripe_object_id, status, paid_at)`.

- Bookings are **materialized at deposit payment (or at acceptance when deposit_type=none), not at send**, so unaccepted quotes never pollute dispatch, calendar or stats. Materialized bookings get `payment_mode='quote'`, `payment_state='none'` so the per-booking hold/capture engine ignores them; money is tracked on `quote_payments`.
- Editing after `sent` bumps `revision` and expires any open Checkout Session (`checkout.sessions.expire`); editing is locked once a deposit is paid.
- The "deposit link" given to the client is **our own URL** (`/quote/<token>` or `/quote/<token>/pay` → 302 to a freshly minted Checkout Session), not a static Stripe Payment Link — static links go stale when the quote changes (the CR-02 problem already documented for booking links).

### Day trips

`day_trips(id, slug UNIQUE, active, display_order, duration_hours, distance_km, hero_image, place coordinates, e_class_eur, s_class_eur, v_class_eur, created_at, updated_at)` — same three-price-column shape as `route_prices` so the admin table/form, the `Price` MDX component pattern and `lib/live-prices.ts` pattern are cloned, not reinvented. Prose (title, summary, itinerary, FAQ, SEO meta) lives in `content/day-trips/<locale>/<slug>.json` (v3.0 decision: long-form → content files, structure/prices → DB/admin). Prices render via `lib/day-trip-prices.ts` (never typed; CLAUDE.md hard rule and pre-commit). `bookings.trip_type='day_trip'` + `day_trip_id` is recommended over reusing `transfer`, because board filters, stats-by-product, emails and GA need to tell them apart; the cost is a fan-out check of every `trip_type` switch (server-pricing, email labels, lead/panel/stats mappings) — grep before the phase.

---

## Status Vocabulary Changes

Current DB values: `unpaid, pending, confirmed, assigned, en_route, on_location, completed, cancelled`. Driver `trip_progress` values: `en_route, arrived, on_board, completed, no_show` (migration 061). `StatusBadge` already declares `arrived | on_board | no_show` variants.

**Recommendation:** add `on_board` and `no_show` to `bookings.status`; do not add `arrived` (it maps to the existing `on_location`).

| Driver step (UI label) | `trip_progress` | `bookings.status` | GNet push |
|---|---|---|---|
| Start driving to pickup | `en_route` | `en_route` | `EN_ROUTE` |
| I have arrived | `arrived` | `on_location` | `ON_LOCATION` |
| Passenger on board | `on_board` | `on_board` (NEW) | none (no GNet equivalent in `GnetStatus`) |
| Stop reached / continue (Feature 6) | stop stamps | `on_board` (no change; stamps in `booking_stops`) | none |
| Complete trip | `completed` | `completed` | `COMPLETE` |
| Passenger no-show (only from `on_location`, after grace) | `no_show` | `no_show` (NEW, terminal) | LOW confidence: check GNet API before deciding; default skip |

Transitions to add to `VALID_TRANSITIONS`: `on_location → on_board | no_show | cancelled`; `on_board → completed | cancelled`; `assigned → en_route | cancelled` unchanged. Admin keeps its override shortcuts (`en_route/on_location → completed`); the **driver route enforces strict order server-side** (`step === nextStepFor(currentStatus)`; replay of the already-applied step returns 200, a stale step returns 409). Add `no_show` to `TERMINAL_STATUSES` in `lib/trip-token.ts` (the trip link must die at no-show/complete).

**Fan-out checklist (every place a status list is hard-coded) — update in ONE phase, guard with parity tests:**
`lib/booking-transitions.ts`, `lib/trip-token.ts` (TERMINAL), DB CHECK (084), SQL `booking_lead_status()` (067) vs `lib/lead-mapping.ts` (`no_show` → `converted`, because a real booking existed; confirm with owner), `lib/customer-mapping.ts`, `lib/chatwoot-mapping.ts` (`VALUE_STATUSES`), `lib/panel-bookings.ts` + migration 080 SQL, `lib/google-calendar.ts` + 063 trigger, stats RPCs 081-083 (`status IN (…)`), `lib/gnet-client.ts` map, `components/admin/StatusBadge.tsx` + `BookingsTable` action maps, admin `KNOWN_STATUSES` + `admin_search_bookings p_status`, `statusToFlagKey` notification flags. `tests/customer-mapping-parity.test.ts` shows the established parity-test pattern; extend it to cover SQL-vs-TS lists from `lib/booking-status.ts`.

**Revenue semantics caution:** stats and panel treat `confirmed…completed` as value-bearing. After v5 a `confirmed` card-hold or cash-guarantee booking has no money yet, and a `failed` hold has none at risk. Decide explicitly whether `/admin/stats` means "booked" or "collected" revenue, and filter on `payment_state` in the RPCs (081-083) accordingly. No-show counts as revenue only when `noshow_charged`.

**GNet bookings (`booking_source='gnet'`):** `payment_mode='partner'`, `payment_state='none'`; capture / hold / no-show branches must early-return. Driver-sync makes GNet pushes automatic (today only admin PATCH and first-assign push). Make the push idempotent against `gnet_bookings.last_push_status` (skip repeats) because driver retries on bad mobile networks are expected. The push logic exists twice today (PATCH, assign route) — fold both into the status service.

---

## Webhook Additions (`/api/webhooks/stripe`)

The endpoint currently handles `charge.refunded`, `payment_intent.succeeded`, `checkout.session.completed`, all with the same pattern: duplicate read-check on `stripe_processed_events` → side effect → claim after (SEC-10). Keep that pattern for every new event. Split the 1034-line file: the route keeps signature verification, idempotency and dispatch; handlers move to `lib/stripe-webhook/`.

| Event | New/Mod | Handler | Notes |
|-------|---------|---------|-------|
| `setup_intent.succeeded` | NEW | `handleSetupSucceeded` | confirm booking, store customer/PM, schedule or place hold, confirmations |
| `setup_intent.setup_failed` | NEW | log event | no booking change; row stays `unpaid` for the abandoned queue |
| `payment_intent.amount_capturable_updated` | NEW | `handleHoldAuthorized` | reconcile `authorized` + `capture_before` (API response already set it; webhook is the truth on retries) |
| `payment_intent.payment_failed` | NEW | `handleOffSessionFailed` | only when `metadata.kind ∈ {hold,noshow,remainder,extras}` |
| `payment_intent.canceled` | NEW | `handleHoldCanceled` | expiry or our own cancel; if booking still live → alert "hold expired" |
| `payment_intent.succeeded` | MOD | route by `metadata.kind` **first** | see pitfall below |
| `checkout.session.completed` | MOD | add `mode==='setup'` branch (payment_status is `no_payment_required`, today's guard requires `'paid'`), `purpose` router: `booking` / `hold_recovery` / `deposit` / `remainder` | admin "card guarantee link" for manual bookings uses Checkout `mode:'setup'` |
| `charge.refunded` | MOD (light) | refund of a captured hold PI must set `payment_state='refunded'` | existing cancel logic stays |
| `charge.dispute.created` | NEW (recommended) | operator alert | off-session/MIT charges carry higher dispute exposure |

**Owner action required:** every new event type must be subscribed on the live Stripe webhook endpoint. This already bit the project once (`enable-checkout-webhook-event.mjs` exists in the repo root for exactly that). Ship an equivalent owner-run script (never commit keys) and put "subscribe events" in the phase's go-live checklist.

---

## Scheduler (where it lives)

- **Endpoint:** `app/api/cron/payment-tick/route.ts`. Auth accepts EITHER the existing `CRON_SECRET` bearer check (timing-safe, copy from `reminder-24h`) OR a verified QStash signature (`Receiver`, already used in `app/api/integrations/dispatch/route.ts` and `reminder-2h`).
- **Triggers:** (1) QStash **Schedule** every 15-30 min (primary; free plan documents 7-day max delay and a schedule allowance of 10 on most sources — one conflicting source says otherwise, verify in the Upstash console), (2) `vercel.json` daily entry as backstop (Hobby: once/day, hour-level precision). Schedule creation is an owner-run script like `setup-phase81-qstash.mjs`.
- **Work per tick** (each step try/catch-isolated, pattern from `outbox-sweep`): (a) claim due holds via `claim_due_payment_work()` (SKIP LOCKED + lease so overlapping ticks never double-hold; Stripe idempotency key as second guard); (b) retry `completed ∧ authorized` captures; (c) watchdog: `authorized` rows with `capture_before` within 24 h → alert, and `pickup passed + 24 h ∧ not completed` → alert (an uncaptured hold silently expires and the revenue is lost); (d) `noshow_pending` reminders; (e) quote reminders / expiry (later phase); (f) `remainder_due_at` saved-card charges (later phase).
- **Why not per-booking QStash messages:** delay cap 7 days vs bookings made months ahead; messages cannot be edited when the pickup is rescheduled (admin edits are a first-class feature, AEDIT) — a DB column `hold_at` recomputed on edit is trivially correct. **Admin edit hook:** changing pickup date/time must recompute `hold_at` (and release/replace an existing authorization if the new pickup is beyond its window).
- **Why not the CRM outbox:** it is CRM-sync-only by design (strict key regexes, "imports no CRM code" VPS-isolation guard, PII-free ids). Payments must not depend on it, and its health page/digest would mix concerns.

---

## Admin Layout Changes

- **Shell:** `app/(internal)/admin/(dashboard)/layout.tsx` hard-codes `md:ml-[280px]` and `AdminSidebar` is a fixed 280 px aside with inline hex colors. Change to a CSS variable `--admin-sidebar-w` (280 / 72 px) on the wrapper with a margin transition; collapsed state and theme persisted in **cookies** read by the server layout (`admin_sidebar`, `admin_theme`) so there is no flash or layout shift. Collapsed mode = icon rail (lucide-react is already a dependency) + tooltip labels; mobile keeps the existing hamburger overlay.
- **Theme:** apply `theme-light` (existing class) or a `data-admin-theme` attribute **on the admin wrapper only** — `app/(internal)/layout.tsx` renders `<html>` via shared `SiteChrome`, so never toggle the root. Add semantic admin tokens (`--status-ok/warn/danger/info` + badge bg/fg) defined for both themes, replace the 234 hex literals (top offenders: `#f87171` x52, `#CFC9C2` x35, `#F5F2EE` x25, `#4E4E56` x21, `#4ade80` x14) with tokens, and add a test that bans new hex literals in `components/admin` and `app/(internal)/admin`. Recheck `StatsChart`, `ZoneMapInner`, Modal overlays and `StatusBadge` (dark-tuned rgba backgrounds) in light.
- **Nav items to add:** Quotes, Day trips (Bookings gets view tabs List | Board | Calendar via `?view=`, not new top-level items).
- **Board/Calendar data:** the list endpoint is the `admin_search_bookings` RPC capped at 100/page; do not stretch it. Add `GET /api/admin/bookings/board?from&to` returning slim rows (id, ref, pickup_utc, status, payment_state, vehicle, short route, driver name, amount, flags) for a window (default −1 d … +14 d; calendar month = month range). Calendar is built in-house (CSS grid; month grid, week/day time-grid) — FullCalendar's CSS/theming weight is not worth it for three views. Use `lib/prague-date.ts` for all day boundaries; `app/(internal)/admin/(dashboard)/bookings/page.tsx` currently derives week bounds with local `Date` + `toISOString()` (UTC shift) — do not copy that into the calendar.
- **Kanban v1:** columns `unpaid/pending | confirmed | assigned | en_route+on_location+on_board | completed (last 48 h) `; `cancelled/no_show` behind a toggle. No drag-and-drop in v1: per-card "next step" button + existing assign-driver modal, all through `advanceBookingStatus`. Dragging into `completed` would trigger a capture and into `cancelled` a release/refund — too destructive for a gesture. Add `@dnd-kit` later only for safe forward moves (new dependency, verify React 19 support first).
- **Prerequisite refactor:** extract `BookingDetailPanel` (TripEditPanel, PaymentLinkSection, DriverAssignmentSection wiring, audit log) from `components/admin/BookingsTable.tsx` (2886 lines) so list, board and calendar share one drawer. This is the single riskiest UI refactor of the milestone; do it with its own tests before building the views.

---

## i18n Impact

| Surface | Locales | Work |
|---------|---------|------|
| Wizard Step 6 payment-mode chooser, consent copy ("a hold of €X will be placed on …", "no-show is charged in full"), error codes | 7 | new `booking.payment.*` keys in `messages/en.json` + real translations in all 6 others (CLAUDE.md rule) |
| Terms / privacy / cancellation policy / FAQ | 7 | legal copy for off-session consent, hold, no-show charge, saved card, quote deposit — `content/pages/<locale>/…`; privacy policy must name Stripe card-on-file |
| `/[locale]/quote/[token]` | 7 | `quote.*` namespace; locale chosen by operator and stored on the quote; `robots noindex`, no alternates, excluded from sitemap |
| `/[locale]/day-trips`, `[slug]`, custom-tour form | 7 | `dayTrips.*` + `customTour.*` catalogs; `content/day-trips/<locale>/<slug>.json` per trip (N trips x 7 locales is the largest translation volume of the milestone); `getAlternates()` for hreflang, sitemap cluster, JSON-LD with `priceValidUntil` normalized in snapshot tests, `llms-data` entries |
| Emails | EN today | all client emails are English-only (v3.0 debt, Backlog 999.x). Recommend localizing only the three payment-critical ones from day one (hold-failed + pay link, quote link, no-show charge notice) via an `emails.*` catalog namespace keyed on `bookings.locale`/`quotes.locale`; the rest stays EN |
| Admin (board, calendar, quotes, day-trips admin) | EN only | `app/(internal)` is hard-coded `lang="en"`; no i18n work |
| Driver page (single-step flow) | EN only | same; if drivers are non-English speakers this is an owner question |

Translation pipeline note: the GH translate workflow is disabled while API credit is empty — batch new strings and translate in-session at the end of each phase; never run `scripts/i18n-translate.mjs --dry-run` on the repo tree. Price tokens on new public pages come from the DB helpers (no typed `€`), and `middleware.ts` matcher needs **no change** (no new static extensions) but `CSRF_PROTECTED_PREFIXES` must gain `/api/create-setup-intent` (also in `CSRF_STRICT_ORIGIN_REQUIRED`), `/api/submit-custom-tour`, `/api/quote`.

---

## New vs Modified (explicit)

**NEW:** `lib/stripe.ts`, `lib/booking-status.ts`, `lib/booking-status-service.ts`, `lib/payments/*`, `lib/stripe-webhook/*`, `lib/checkout/compute.ts`, `lib/route-distance.ts`, `lib/stops.ts`, `lib/quotes/*`, `lib/day-trips.ts`, `lib/day-trip-prices.ts`; API: `create-setup-intent`, `cron/payment-tick`, `admin/bookings/[id]/payment/{retry-hold,send-link,charge-noshow,capture,charge-extras}`, `admin/bookings/board`, `admin/quotes` (+`[id]`, `send`), `quote/[token]/checkout`, `admin/day-trips`, `submit-custom-tour`, `driver/trip/[token]/stop`; pages: `/admin/quotes*`, `/admin/day-trips`, `/[locale]/quote/[token]`, `/[locale]/day-trips*`; components: `BookingDetailPanel`, `BookingsBoard`, `BookingsCalendar`, `PaymentPanel`, `QuoteBuilder`, `DayTripForm`, wizard `PaymentModeChooser`; tables listed above; owner scripts (webhook events, QStash schedule).

**MODIFIED:** `app/api/create-payment-intent/route.ts` (delegates to compute module, `payment_mode`, mandatory-attempt semantics, `day_trip`, `setup_future_usage` when waiting-fee exposure), `app/api/webhooks/stripe/route.ts` (dispatcher + routing by `metadata.kind` BEFORE the `groupBookingIds`/`bookingId` branches), `app/api/admin/bookings/route.ts` (PATCH → service; GET status whitelist; POST accepts payment mode / card-guarantee link), `app/api/admin/bookings/cancel/route.ts` (**branch by `payment_state`**: no-money states → release only; `authorized` → `paymentIntents.cancel`; `captured` → existing refund. Today it refunds whenever `payment_intent_id` exists), `[id]/assign/route.ts` (shared GNet push), `[id]/payment-link/route.ts` (`purpose` metadata), `lib/stripe-payment-links.ts` (purpose, setup mode), `app/api/driver/trip/[token]/progress/route.ts` + `TripProgressClient.tsx` + trip page (single next step, stops, strict order), `lib/trip-token.ts`, `lib/booking-transitions.ts`, `components/admin/BookingsTable.tsx` (extraction, payment badges), `ManualBookingForm.tsx` / `AdminBookingWizard.tsx` (payment mode, stops), `Step6Payment.tsx` (+ `confirmSetup` path), `Step2DateTime`/`Step5Passenger` (landing time/offset), `lib/booking-store.ts` (zustand: `paymentMode`, `dayTripSlug`; stops persisted with coordinates and `waitMinutes` wired for real), `app/api/calculate-price/route.ts` (day trips, shared distance module), `lib/pricing-config.ts` + `PricingForm` + `/api/admin/pricing` (new globals), `AdminSidebar`, admin layout, `app/globals.css`, `StatusBadge`, SQL/TS status mappings (fan-out list), `lib/inquiries.ts` / `lead-mapping.ts`, `middleware.ts` (CSRF prefixes), `vercel.json`, `app/sitemap.ts`, `lib/llms-data.ts`, email templates.

---

## Patterns to Follow

### Pattern 1: Status-gated compare-and-set for every money-moving transition
**What:** `UPDATE … SET payment_state=$to WHERE id=$id AND payment_state=$from RETURNING *`; zero rows = another actor already moved it. Same idea the repo already uses in `reconcileBookingByIdToConfirmed` (`WHERE status='unpaid'`).
**When:** hold claim, capture, release, no-show charge, recovery.
**Example:**
```typescript
// lib/payments/state.ts
export async function transition(id: string, from: PaymentState[], to: PaymentState, patch: Partial<Row> = {}) {
  const { data } = await supabase.from('bookings')
    .update({ payment_state: to, ...patch })
    .eq('id', id).in('payment_state', from).select('id').maybeSingle()
  return Boolean(data) // false → someone else won; caller must NOT call Stripe
}
// Stripe call only after winning the claim, always with an idempotency key:
// stripe.paymentIntents.create({...}, { idempotencyKey: `hold:${id}:${attempt}` })
```

### Pattern 2: Side effect first, claim after (existing SEC-10 ordering)
Keep it for every new webhook branch; handlers must be idempotent because a crash between effect and claim causes a Stripe retry.

### Pattern 3: Metadata `kind` routing
Every PaymentIntent/Session we create carries `kind` (`booking|hold|hold_recovery|noshow|deposit|remainder|extras`) and a *distinct* id key per kind (`holdBookingId`, `quoteId`, …). The webhook routes on `kind` before any legacy key.

### Pattern 4: Server-authoritative money
Prices, deposits, hold amounts, no-show amounts, waiting fees are computed on the server from DB values at the moment of use (like `computeCombinedTotalMinor` today). Quote deposit is frozen at `sent`; client-supplied amounts are never read.

### Pattern 5: One extracted service for status mutation
`advanceBookingStatus()` owns validation, CAS, log, notification flags (`pricing_globals.notification_flags`), email dedupe (`logEmail`), GNet push with `last_push_status` guard, QStash reminder, payment hooks. Routes are thin adapters (auth/CSRF/zod → service).

### Pattern 6: Config in `pricing_globals`, content in files, structure in DB
Hold lead, waiting fee, offsets, deposit defaults → `pricing_globals` (migration 058 pattern + `PricingGlobals` type). Day-trip prose → `content/day-trips/<locale>/`. Day-trip price/active/order → admin DB. Matches the v3.0 content/UI/data split.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Payment meaning inside `bookings.status`
**Why bad:** status is mirrored in 7+ SQL/TS lists, GNet, CRM leads, Google Calendar and stats; each new value requires a coordinated edit and silent `ELSE NULL` in `booking_lead_status()` stops lead sync for that status.
**Instead:** orthogonal `payment_state`; `status` gains only the two driver-facing values that are genuinely operational.

### Anti-Pattern 2: Hold PaymentIntent metadata containing `bookingId`
**Why bad:** the webhook routes any PI with `meta.bookingId` to `handlePaymentLinkSucceeded`, which reconciles `unpaid → confirmed` and, finding a `confirmed` row, fires the CR-02 "untracked capture" alert on every capture.
**Instead:** `kind` + `holdBookingId`, routed first; recovery links carry `purpose:'hold_recovery'` and flip `failed → captured`.

### Anti-Pattern 3: Setting `payment_intent_id` at hold time
**Why bad:** cancel route would try `refunds.create` on an uncaptured PI (Stripe error → 502); stats/panel/erasure treat it as paid.
**Instead:** `hold_payment_intent_id` until capture; cancel branches on `payment_state`.

### Anti-Pattern 4: Driver route touching `bookings` directly
**Why bad:** skips emails, GNet, capture, audit; races with admin edits.
**Instead:** only through `advanceBookingStatus`; rewrite the DTRIP-04 structural grep gates in `tests/driver-trip-progress.test.ts` / `tests/driver-trip.test.ts` to assert the *new* invariant (driver route imports the service, never `supabase.from('bookings').update`).

### Anti-Pattern 5: Auto-charging the customer on a driver signal
**Why bad:** a mis-tapped `no_show` or `completed` becomes an irreversible 100% charge or capture.
**Instead:** confirmation dialog on the final driver step, server-side grace time for `no_show` (config, default 30 min after pickup), operator-confirmed no-show charge, capture retried by tick not by hand.

### Anti-Pattern 6: Payments or quotes in the CRM outbox
See Scheduler. Also: EspoCRM/Chatwoot never write bookings (v4.0 import-closure guard tests); quote status may later be mirrored *to* CRM through a new `sync.quote` outbox key, but v5 should not depend on it.

### Anti-Pattern 7: Trusting client `distanceKm` once stops exist
Re-derive server-side; otherwise stops become a free price-tamper vector.

---

## Scalability Considerations

| Concern | Today (~dozens bookings/day) | 10x | Note |
|---------|------------------------------|-----|------|
| Hold tick | one indexed scan, handful of rows | still one scan; `claim … LIMIT 50` per tick | partial index on `hold_at` where state='hold_scheduled' |
| Stripe API rate | negligible | negligible | sequential per tick; idempotency keys make retries safe |
| Webhook volume | ~3 events/booking | ~6-8 events/booking | already idempotent via `stripe_processed_events` |
| Board/calendar | window-bounded slim query | same | never load unbounded; index on `pickup_utc` exists via RPC usage — confirm for the new query |
| Vercel Hobby CPU | daily crons only | tick endpoint must be cheap (no-op when nothing is due) | 15-30 min tick = 48-96 invocations/day; keep the no-work path to one query |
| QStash free budget | 1,000 msg/day | schedule uses ~96/day | shared with outbox + reminders; watch combined use |

---

## Suggested Build Order (with dependencies)

| # | Phase (proposed number) | Features | Depends on | Why here |
|---|-------------------------|----------|------------|----------|
| 1 | **86 Admin shell** — collapsible sidebar, light theme, hex→token codemod + lint ban | 4 (part) | none | Touches 33 admin files mechanically; doing it first avoids merge conflicts with every later admin change and stops new screens (quotes, day-trips, board, calendar) from adding hex debt. Small, shippable, low risk. |
| 2 | **87 Status vocabulary + status service + driver sync** | 5 | 1 not required, but BookingsTable edits are cleaner after 1 | Foundation for capture/no-show triggers. Do the fan-out edits (SQL fns, mappings, parity tests) once. Behavior-preserving extraction of PATCH first (tests), then statuses, then driver single-step flow, GNet idempotent push, rewrite DTRIP-04 gates, update PROJECT.md Key Decisions. Migration 084. |
| 3 | **88 Payments: card-on-file, hold, capture, cash guarantee** | 1, 2 | 2 (completed/no_show hooks, status log) | Highest value and highest risk; everything after reuses its customer/PM/off-session machinery. Includes `lib/stripe.ts` consolidation, compute-module extraction, setup-intent route, webhook split + new events, tick endpoint + QStash schedule, cancel route branching, admin payment panel + actions, alerts, localized payment emails + legal copy (7 locales). Migration 085. Owner scripts: webhook events, QStash schedule. **Test-mode verification caveat:** `.env.local` Stripe key is a dead placeholder — verification of live Stripe flows must be done through owner-run scripts / a real test key, plan for it. |
| 4 | **89 Dispatch views** — extract `BookingDetailPanel`, board, calendar, payment badges | 4 (rest) | 2, 3 (new statuses, payment_state to display), 1 (tokens) | Cards need the final vocabulary and payment badges; extraction refactor is isolated here. |
| 5 | **90 Multi-stop + airport offset + waiting fees** | 6 | 2 (status log timestamps), 3 (saved card for extras charge), 4 optional | Needs `booking_status_log`, driver stop steps, server distance verification; migration 086. Also fixes the pre-existing "client-trusted distanceKm" gap. |
| 6 | **91 Quotes** | 3 | 3 (customer/PM, off-session, purposes), 5 (stops semantics in items), 1 (admin tokens) | Bundles trips; deposit + remainder reuse the payment engine; `quote_items.kind='day_trip'` is added once day trips exist (nullable FK later). Migration 087. |
| 7 | **92 Day trips + custom tour** | 7 | 3 (payment modes), 6 (quote link reply), i18n | Last because it carries the biggest 7-locale translation batch, benefits from every payment mode, and the custom-tour → quote loop needs quotes. Public catalogue/pages/booking can ship before the quote loop if schedule slips (catalogue+booking have no quote dependency). Migrations 088-089. |

Parallelism: phases 4 and 5 can swap or overlap (different files) once 3 is done. Phase 1 can overlap phase 2's *design/research* but not its code (BookingsTable conflicts).

**Research flags for phases:**
- Phase 3 (payments): needs deeper research and Stripe test-mode access — hold window per card brand, 3DS/off-session decline recovery UX, Customer dedupe for guests, consent wording (legal), SetupIntent + Elements `confirmSetup` behavior in the existing PaymentElement, Link/wallet payment methods interaction with `payment_method_types:['card']`.
- Phase 2: GNet no-show/on-board mapping (LOW) — read the GNet provider API doc/ask partner before deciding.
- Phase 5: Google Routes behavior with many intermediates + airport detection (`isNearAirport` uses a 0.027° box) for the offset rule; waiting-fee collection policy (owner).
- Phase 6: invoice remainder method flow (today invoices are manual HTML→Chrome→PDF scripts) — decide minimal viable "invoice" (record + email) vs automation.
- Phase 7: JSON-LD type for day trips (TouristTrip vs Product+Offer), sitemap/llms integration, image assets (modern Mercedes-only rule for any generated visuals).
- Phases 1, 4: standard patterns, unlikely to need research (theme remap, in-house calendar grid).

---

## Open Decisions for the Owner (surface in requirements)

1. Hold lead default 72 h instead of "~5 days" (Visa MIT window) — confirm.
2. No-show charge: operator-confirmed (recommended) vs automatic.
3. `no_show` lead status (`converted` vs `dead`) and whether stats count it as revenue only when charged.
4. Stats meaning: booked vs collected revenue once unpaid-but-confirmed holds exist.
5. Whether to localize payment-critical client emails now.
6. Driver UI language (EN only today).
7. Kanban drag-and-drop: defer (recommended).
8. Waiting fee collection: operator-approved charge (recommended) vs automatic.

---

## Sources

- Repo source read for this document (HIGH): `app/api/create-payment-intent/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/stripe-payment-links.ts`, `app/api/admin/bookings/route.ts` (PATCH/GET), `app/api/admin/bookings/cancel/route.ts`, `app/api/admin/bookings/[id]/assign/route.ts`, `app/api/driver/trip/[token]/progress/route.ts`, `lib/trip-token.ts`, `lib/booking-transitions.ts`, `lib/gnet-client.ts`, `lib/outbox.ts`, `app/api/cron/*`, `lib/qstash.ts`, `lib/supabase.ts`, `lib/pricing-config.ts`, `lib/server-pricing.ts`, `app/api/calculate-price/route.ts`, `lib/booking-store.ts`, `components/admin/{AdminSidebar,BookingsTable,StatusBadge}.tsx`, admin layout, `app/globals.css` (`.theme-light`), `middleware.ts`, migrations 039/040/053/056/058/061/063/064/065/067/069/080/081, `vercel.json`, `.planning/PROJECT.md`, `CLAUDE.md`.
- Stripe: "Place a hold on a payment method" — https://docs.stripe.com/payments/place-a-hold-on-a-payment-method (HIGH; authorization windows table: Visa MIT 5 days / exact 4 d 18 h, others 7 days; capture-before-expiry; partial capture; cancel to release; `amount_capturable_updated`).
- Stripe: "Save a customer's payment method without making a payment" (Setup Intents API) — https://docs.stripe.com/payments/save-and-reuse?payment-ui=elements (HIGH; SCA up-front authentication, `off_session:true`, `authentication_required` recovery by bringing the customer back on-session).
- Vercel cron limits — https://vercel.com/docs/cron-jobs/usage-and-pricing (MEDIUM; Hobby once per day, hourly precision; third-party pages conflict on job-count limit).
- Upstash QStash pricing/delay — https://upstash.com/qstash/pricing and https://upstash.com/docs/qstash/features/delay (MEDIUM; free plan 7-day max delay corroborated by in-repo `MAX_DELAY_SECONDS`; active-schedule count conflicting across sources — verify in console).
