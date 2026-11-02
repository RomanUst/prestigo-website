# Technology Stack — v5.0 Payments, Quotes & Day Trips

**Project:** Prestigo (rideprestigo.com)
**Milestone:** v5.0 (subsequent milestone; additions/changes only)
**Researched:** 2026-11-02
**Overall confidence:** HIGH for Stripe / Vercel / QStash / Google Routes (read from official docs on 2026-11-02); MEDIUM for build-vs-buy UI judgements (opinion, backed by the repo's actual styling code).

## Headline

v5.0 needs **zero new runtime npm dependencies**. Everything required is already installed (`stripe` 21.0.1, `@stripe/stripe-js` 9, `@stripe/react-stripe-js` 6, `@upstash/qstash` 2.10, Routes API via plain `fetch`, `.theme-light` CSS in `app/globals.css`). The work is new Stripe *flows*, one new cron route, a theme toggle, and hand-built kanban/calendar views. Every "add a library" instinct below is rejected with a reason.

## Critical Findings (read before roadmapping)

### CF-1 — The "hold ~5 days before the trip" plan breaks on Visa (HIGH, Stripe docs)

Authorization validity for **online card payments** (source: docs.stripe.com/payments/place-a-hold-on-a-payment-method):

| Brand | Merchant-initiated (off_session, our scheduled hold) | Customer-initiated (customer present, 3DS) |
|-------|------|------|
| Visa | **5 days (really 4 d 18 h)** | 7 days |
| Mastercard / Amex / Discover | 7 days | 7 days |

A hold placed off-session at T-5d on a Visa card **expires before pickup**; capture-on-completion then fails (PaymentIntent goes `canceled`, funds released). Stripe also states MIT/CIT classification is by network signals, not just `off_session`, so you cannot rely on getting the 7-day CIT window.

**Do instead (roadmap-level decisions):**
1. Make the hold lead time a **config value (`hold_lead_hours`), default 72 h** (T-3d). 72 h + trip day stays inside 4 d 18 h for same-day trips. Never default to 120 h.
2. **Capture must never assume the hold survived.** Capture job: `retrieve PI` → if `requires_capture` → `capture`; else (canceled/expired) → create a **new off_session, `confirm: true`, automatic-capture PaymentIntent** with the saved card for the same amount (the SetupIntent mandate covers this); if that fails → payment link + operator alert. Listen for `charge.expired` / `payment_intent.canceled` and flag the booking.
3. **Hybrid shortcut (recommended):** if pickup is ≤ ~6 days away at checkout, skip the SetupIntent-then-hold dance and place a **customer-present manual-capture PaymentIntent immediately** (`capture_method: 'manual'`, 3DS now, 7-day CIT window, liability shift). Use SetupIntent + scheduled hold only for far-out bookings. Same DB state machine, fewer failed off-session holds.
4. **Multi-day quotes must not hold the full amount for the whole stay.** A hold cannot outlive 4d18h/7d. Quotes use deposit (charged) + per-day or remainder charge, not one long hold.

### CF-2 — Extended and incremental authorization: do NOT plan around them (HIGH, Stripe docs)

- **Extended authorization (up to 30 days):** `payment_method_options[card][request_extended_authorization]=if_available` + `capture_method: manual`. No regional restriction, so it is "available in CZ/EU", **but**: Visa/MC/Amex/Discover only; **IC+ pricing only** (blended pricing must contact Stripe support); for Visa in non-lodging/rental categories (taxi/limo is "all other") it carries **+0.08 % fee** and applies **only to customer-initiated transactions, not MIT**; Discover removed taxicabs/limousines in Sept 2023; Stripe notes many networks intend extended windows for *unknown final amounts* (our amount is known, compliance grey zone). Verdict: it cannot fix CF-1 for the off-session hold. Optionally pass `if_available` on the CIT path and read `charge.payment_method_details.card.capture_before` — never assume.
- **Incremental authorization:** also **IC+ only**; Discover limited; irrelevant because amounts are fixed at booking time (extras/waiting fees are charged at capture via `amount_to_capture` ≤ authorized, or by a second off-session charge). Do not integrate.
- **Overcapture** (capturing more than authorized) is a separate Stripe feature with its own eligibility; waiting-time fees above the hold should be a **second off-session charge**, not overcapture.
- Always read `latest_charge.payment_method_details.card.capture_before` after placing a hold and store it (`hold_capture_before` column) — Stripe says rules "can change without prior notice".

### CF-3 — Existing webhook creates the booking from `payment_intent.succeeded` (HIGH, repo read)

`app/api/webhooks/stripe/route.ts` saves the booking from PaymentIntent metadata on `payment_intent.succeeded`. With card-on-file there is no PI at checkout, and later hold/capture/no-show PIs also emit `payment_intent.succeeded`. Required changes:
- New booking-creation trigger: **`setup_intent.succeeded`** (SetupIntent carries the same metadata the PI carries today).
- The existing `payment_intent.succeeded` branch must **route by `metadata.kind`** (`booking_hold`, `booking_noshow`, `quote_deposit`, `quote_remainder`) and update the *existing* booking instead of creating one (the file already does this for payment-link PIs via `bookingId` metadata — extend that pattern). Otherwise capture-on-completion creates a duplicate booking.
- New events to enable on the Stripe webhook endpoint (owner-run script, same pattern as `enable-checkout-webhook-event.mjs`): `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.expired`, `payment_method.detached`. Keep `stripe_processed_events` claim-after-side-effect ordering.

## Recommended Stack

### Core Framework (unchanged)

| Technology | Version (installed → latest) | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | ^16.2 | App Router, route handlers for cron/quote/day-trip pages | Already in use; no change |
| React | 19.2.3 | UI | Already in use |
| TypeScript / Zod 4 | ^5 / ^4.3 | Validation of every new route body | Existing two-step 400/422 parse rule applies to quote, hold, day-trip request routes |

### Payments (Stripe) — no new packages, new flows

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `stripe` (node) | **keep 21.0.1** (pins API `2026-03-25.dahlia`; latest on npm is 23.1.0) | SetupIntent, off-session PaymentIntent, capture, cancel, Customers | Do **not** bump majors mid-milestone: each Stripe SDK major moves the pinned API version and the webhook payload shape that `app/api/webhooks/stripe/route.ts` parses. Schedule the bump as its own chore after v5.0 ships. Do not pass `apiVersion` explicitly (SDK default is the tested pairing). |
| `@stripe/stripe-js` | keep ^9.0.0 (latest 10.2.0) | Client | Deferred-intent `Elements` (`mode: 'setup'`) and `confirmSetup` exist in v9; no reason to bump |
| `@stripe/react-stripe-js` | keep ^6.0.0 (latest 7.0.1) | `<Elements>`, `<PaymentElement>` | Same |
| Stripe Customers | n/a | Required to reuse a PaymentMethod | **New:** create one Customer per payer (dedupe by email, same identity key as customer-mapping) and persist `stripe_customer_id`. A SetupIntent without a Customer cannot be charged later. |

**SetupIntent at checkout (card-on-file and cash guarantee):**
- Client: `<Elements options={{ mode: 'setup', currency: 'eur', setupFutureUsage: 'off_session', paymentMethodTypes: ['card'] }}>` + `<PaymentElement options={{ terms: { card: 'always' } }}>`; on submit `elements.submit()` → `POST /api/create-setup-intent` → `stripe.confirmSetup({ elements, clientSecret, confirmParams: { return_url }, redirect: 'if_required' })`. (Deferred creation keeps the server-authoritative price recompute pattern from `create-payment-intent`.)
- Server: `stripe.setupIntents.create({ customer, usage: 'off_session', payment_method_types: ['card'], metadata: {...same booking metadata as today, kind:'card_hold'|'cash_guarantee'} }, { idempotencyKey })`. Leave `request_three_d_secure` at `automatic`; Stripe runs 3DS where SCA applies and stores the mandate so later MITs can be exempt.
- **Payment method types: restrict to `card`** (this includes Apple Pay and Google Pay, which are card-backed and support SetupIntent + manual capture). Stripe's matrix: SEPA Direct Debit supports setup but **not** manual capture; iDEAL/Bancontact/ACH do not give a reusable, holdable instrument for a hold; Link and PayPal support manual capture but not the extended-auth path and add reconciliation surface. Do not enable `automatic_payment_methods` on SetupIntents or holds (the current PI checkout uses it — keep that for pay-now only).
- Consent record: store terms-text version + timestamp + IP on the booking when the SetupIntent succeeds. Terms shown must state: agreement to off-session charges, when (≈72 h before trip / on no-show), how the amount is determined, cancellation policy. Required by Stripe for off-session use and is your chargeback evidence.

**Scheduled hold (off-session, manual capture):**
```ts
stripe.paymentIntents.create({
  amount, currency: 'eur', customer, payment_method,
  capture_method: 'manual', confirm: true, off_session: true,
  metadata: { kind: 'booking_hold', bookingId },
  expand: ['latest_charge'],
}, { idempotencyKey: `hold:${bookingId}:${attempt}` })
```
- Catch `StripeCardError` with `code === 'authentication_required'` or `payment_intent.status === 'requires_action'` → mark `hold_status='failed'`, create payment link (existing `lib/stripe-payment-links.ts`), email client, alert operator. Never retry blindly: one retry only on `processing_error`/network.
- **Cancel = free:** `stripe.paymentIntents.cancel(id)` on an uncaptured PI releases the hold with no fee (this is the point of the milestone). A *captured* payment refunded still loses the Stripe fee — so never capture before completion.
- **Capture:** `stripe.paymentIntents.capture(id, { amount_to_capture })` — one capture only; partial capture releases the rest.
- **No-show (cash or card):** new off-session PI, `confirm: true`, automatic capture, `metadata.kind='booking_noshow'`, 100 % amount.
- Set `maxNetworkRetries: 2` for these server paths (existing helpers use 0) — safe **only because** every call carries an idempotency key. Persist state in Supabase with an atomic claim (`UPDATE … SET hold_status='placing' WHERE hold_status='pending' RETURNING`) before calling Stripe.

**Quote deposit + remainder:**
- Do **not** use Stripe's Quotes or Invoicing APIs (extra objects, Stripe-hosted UI, no multi-day bundle semantics) — quote data lives in Supabase.
- Public quote link = **our own page** `/quote/[unguessable-token]` (same pattern as the driver `trip_token`; noindex; token invalid on expiry/accept/cancel). Deposit uses an on-page `<PaymentElement>` with a PaymentIntent `{ amount: deposit, customer, setup_future_usage: 'off_session', metadata.kind='quote_deposit' }` — this pays the deposit **and** saves the card for the remainder in one 3DS step, with no Stripe-hosted 24 h session expiry. Reuse the existing checkout Elements component.
- Remainder methods: saved card → off-session PI (`quote_remainder`); link → existing payment link (single-booking or `groupBookingIds` for several days); cash / invoice → recorded in DB only, with admin "mark paid".
- Quote with several trips: reuse the group-link machinery (`metadata.groupBookingIds`) for reconcile; Stripe metadata is limited to 50 keys / 500 chars per value, so store the trip list in the DB and put only `quoteId` in metadata.

### Scheduler (hold-placing, capture fallback, no-show sweep)

**Decision: a `/api/cron/place-holds` route, invoked by a Vercel Cron entry (guaranteed baseline) and optionally a QStash hourly schedule (accelerator). Do NOT use Supabase pg_cron. Do NOT use per-booking delayed QStash messages.**

| Mechanism | Verdict | Facts (official docs, 2026-11-02) |
|-----------|---------|------|
| **Vercel Cron (Hobby)** | **Use — baseline.** | 100 cron jobs/project on every plan (repo already runs 4); Hobby = **once per day**, timing ±59 min (cron expressions more frequent than daily **fail the deploy**); max function duration **300 s** on Hobby (fluid compute). Declared in `vercel.json` ⇒ versioned and deploys with the code, so it cannot be "forgotten at go-live" the way QStash was in Phase 81. |
| **QStash schedule** | **Use — optional hourly accelerator.** | Free plan: 1,000 msgs/day, **10 active schedules**, cron supports `CRON_TZ=`, `scheduleId` overwrite. Already wired (`lib/qstash.ts`, `Receiver` signature check in `app/api/cron/reminder-2h`). Needs an owner-run setup script (pattern: `setup-phase81-qstash.mjs`). Gives sub-daily retry for failed holds. |
| **QStash per-booking delayed message** | **Reject for holds.** | Free-plan **max delay = 7 days**; a booking made 30 days ahead needs a ~27-day delay → rejected. (Note: the existing `scheduleQStashReminder` 2 h reminder has the same ceiling — bookings >7 d out silently skip the delayed reminder; worth a backlog item, not a v5.0 blocker.) Also cancellations/edits would require message deletion bookkeeping. |
| **Supabase pg_cron + pg_net** | **Reject.** | Works technically (pg_net already in use for gcal/outbox kicks), but puts payment logic scheduling inside the DB where it is invisible to Vercel logs/alerts, needs the endpoint secret stored in the DB (Vault or plaintext in `cron.job`), and adds a third scheduling system. No capability gain over the two above. |

**Design rules for the cron route:**
- **Catch-up semantics, not exact timing:** select `payment_mode='card_hold' AND hold_status='pending' AND status IN (confirmed, assigned) AND pickup_at <= now() + hold_lead AND pickup_at > now()`. A ±59 min Hobby jitter and a missed day are then harmless. With default 72 h lead and daily runs, worst-case hold lands ≈ T-48 h, still ≥ the Visa MIT window headroom for same-day trips.
- Process in batches (e.g. 20/run, sequential), `export const maxDuration = 300`, one atomic claim per row, idempotency key per attempt.
- Auth: accept **either** Vercel's `Authorization: Bearer ${CRON_SECRET}` (constant-time compare, as `outbox-sweep` does) **or** a valid QStash signature. Vercel cron sends GET; QStash sends POST — export both handlers calling one function.
- Same route (or sibling) also runs: (a) capture-fallback sweep for `completed` bookings whose hold is not captured, (b) hold-expiry watchdog using `hold_capture_before < now() + 12h`, (c) operator digest email of failed holds (reuse `outbox-digest` style), (d) no-show sweep is **operator-triggered**, not automatic.
- Capture itself is **event-driven, not scheduled**: driver "completed" → server route → capture. The cron only mops up.

### Admin UX (kanban, calendar, sidebar, light theme) — build, don't buy

| Need | Recommendation | Why |
|------|----------------|-----|
| **Light/dark theme** | **Reuse existing `.theme-light` class** (`app/globals.css` ~L198-226) which already remaps both the Tailwind `--color-*` tokens and the bare `--anthracite/--offwhite/--copper/--warmgrey` vars to an AA-checked cream/navy-ink palette. Apply it to the admin `<div>` in `app/(internal)/admin/(dashboard)/layout.tsx`, driven by a **cookie** (`admin_theme=light|dark`) read via `cookies()` in that already-dynamic server layout; a tiny client toggle writes `document.cookie` and flips the class. | ~920 `var(--…)` references in admin already flip for free. No FOUC, no script injection ⇒ **no CSP nonce problem**. The remaining work is the **~234 hard-coded hex values** in `app/(internal)/admin` + `components/admin` (status reds/greens `#f87171`/`#4ade80`, `#CFC9C2`, `#F5F2EE`, `#4E4E56`, `#B87333`, `#2a1a1a`, `#1a3a2a`, rgba tints): introduce `--admin-danger/-success/-info/-surface-*` vars (defined in dark and `.theme-light`) and codemod them. Budget this as the real cost of the feature. |
| `next-themes` | **Do NOT add.** | Injects an inline script (needs CSP nonce plumbing, project has nonce CSP), solves a problem a 10-line cookie toggle solves, and is whole-app-scoped while only admin needs it. |
| shadcn / Tailwind admin kits | **Do NOT add.** | PROJECT.md: admin is custom inline-styled; mixing systems doubles theming work. |
| **Collapsible sidebar** | Plain state in `AdminSidebar.tsx` (expanded 280 px ↔ 64 px rail), persisted in a cookie like the theme; change `md:ml-[280px]` in the layout to a CSS var `--admin-sidebar-w`. | No dependency; one layout constant. |
| **Kanban by status** | Hand-built: server component loads bookings, groups by the 8 statuses already in `lib/booking-transitions.ts`, client island renders columns. **No drag-and-drop in v5.0**: status moves have side effects (cancel ⇒ release hold, completed ⇒ capture) and the transition map is strict (`UI_TRANSITIONS`), so arbitrary column-to-column drops are mostly invalid. Each card gets a "Move to ▾" menu limited to `UI_TRANSITIONS[status]`, confirm dialog for cancel/complete. | Safer and 1/5 the work. If DnD is later demanded: `@dnd-kit/core` **6.3.1** (headless, React ≥16.8 peer, works with inline styles). Avoid `@dnd-kit/react` (0.5.3, pre-1.0 rewrite) and `@hello-pangea/dnd` (no release since Feb 2025). |
| **Day/week/month calendar** | Hand-built grid (CSS grid + `Intl.DateTimeFormat` with `timeZone:'Europe/Prague'`), using `lib/prague-date.ts` (`getPragueTodayISO`, `shiftIsoDate`). One Supabase range query per visible window (needs an index on pickup timestamp — check migrations). Month = counts + chips, week/day = hour rows; click ⇒ existing booking detail. | Needs are read-only display + click-through. FullCalendar 7.1.3 / react-big-calendar 1.20.0 / Schedule-X 4.1.0 each ship their own CSS and DOM that fight inline styles and the `.theme-light` var system, add 80-300 KB, and still need custom event rendering for booking cards. `react-day-picker` 9 is already installed for the date jump control. Do **not** add `date-fns`/`dayjs`/Temporal polyfill. |
| **Live updates** | `router.refresh()` on a 30-60 s interval while `document.visibilityState==='visible'` (kanban + driver-status column). | Closes DTRIP-05 tech debt with no new infra. Supabase Realtime would need admin-session RLS policies on `bookings` — defer. |
| Charts | Existing `recharts` 3.8 only if needed | — |

### Driver status → booking status

No library. Constraints from the stack:
- Reverses the v2.2 isolation: the trip-progress write route (`/api/driver/trip/[token]/progress`) must now call the **same transition function** the admin API uses (`VALID_TRANSITIONS` in `lib/booking-transitions.ts`) — one code path, not a second status writer. The existing grep-gate tests ("import no GNet/status module") must be consciously rewritten, not deleted.
- Strict next-step-only: derive the single allowed next step server-side from current state; reject out-of-order posts (409), keep CSRF + rate limit + `isTripLinkValid()`.
- `completed` ⇒ enqueue capture (inline `await` with idempotency key, fall back to cron sweep). Capture failure must not block the driver's UI.

### Multi-stop transfers & airport offset

**Google Routes API v2 `computeRoutes` already supports this and is already called with waypoints.** `app/api/calculate-price/route.ts` builds `intermediates` (STOP-01) and never sets `optimizeWaypointOrder` (correct — chauffeur order is client-specified). Changes needed:
- Add `routes.legs.distanceMeters,routes.legs.duration` to the `X-Goog-FieldMask` if per-leg breakdown is shown; total `routes.distanceMeters` already prices the whole path.
- Keep **≤ 10 intermediates** (hard cap in Zod) — up to 10 stays on the cheaper Essentials SKU; max allowed by Google is 25 and >10 is billed higher. Business cap of ~5 stops is saner anyway.
- **Do not set `routingPreference` / `departureTime`**: the request currently has no traffic model ⇒ Essentials pricing. Adding `TRAFFIC_AWARE` moves every call to the Pro SKU for no pricing benefit (price is per km). (`duration` returned is then static duration; acceptable.)
- Requests with intermediates return no alternative routes — fine.
- Client map (`components/booking/RouteMap.tsx`) still uses the legacy `google.maps.DirectionsService` JS class; for stops pass `waypoints` there with `stopover: true`, `optimizeWaypoints: false`. No new package; `@vis.gl/react-google-maps` and `@googlemaps/js-api-loader` stay as-is.
- Waiting fee (15 min free, then fee per started 15 min) and airport offset (landing 14:00 → pickup 14:30, 60 min free from pickup time) are **pure pricing logic**: put fee constants in `pricing_globals` / `lib/pricing-config.ts` (admin-editable, per project rule: no hard-coded `€` in `app/`/`components/`). Waiting time accrues at runtime (driver "on location" timestamp → "passenger on board" timestamp) and is billed at capture (`amount_to_capture` cannot exceed the hold — surplus goes in a second off-session charge, see CF-2). Flight data for the offset: existing `lib/flight-status.ts` / `check-flight`, no new provider.
- Server must recompute km and waiting rules (never trust client amounts), same as today.

### Day trips catalogue & custom-tour request

No new packages. Reuse patterns:
- Catalogue data in Supabase tables (trips + per-vehicle-class prices, **admin-editable, modelled on `route_prices` / `lib/live-prices.ts`** — CLAUDE.md forbids typed prices in `app/`/`components/`/marketing). Pages as `app/[locale]/day-trips/[slug]` with `setRequestLocale` + `generateStaticParams` (never bare `getLocale()` — see getlocale-dynamic-rendering note). Images AVIF in `/public`, matcher already excludes `.avif`.
- JSON-LD from `lib/jsonld.ts` (`TouristTrip` + `Offer`; **normalize `priceValidUntil` in snapshot tests**). Sitemap/hreflang through `getAlternates()`.
- Booking: a day trip is `trip_type='daily'`-like with fixed price from the catalogue; payment-mode choice (pay now / card hold / cash) reuses the new flows. Custom-tour request: same lead pipeline as `submit-multiday-quote` (Supabase → outbox → EspoCRM/Chatwoot), operator turns the lead into a quote (`/quote/[token]`).
- i18n: all new EN strings need real translations in 6 other locales (translate in-session; AI pipeline credits are empty).

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dnd-kit/core` | 6.3.1 | Drag-and-drop | **Only** if the owner insists on drag between kanban columns after v5.0; restrict to valid transitions |
| (none) | — | Calendar | Hand-built |
| (none) | — | Theme | `.theme-light` + cookie |
| (none) | — | Scheduler | Vercel Cron (+ existing `@upstash/qstash` ^2.10.1; latest 2.12.1, bump optional) |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Card on file | SetupIntent + Customer, `usage: off_session` | Stripe Checkout `mode: 'setup'` | Hosted UI, harder to keep server-authoritative recompute and booking metadata; fine as the *admin-sent "please add your card"* link only |
| Hold validity | 72 h lead + capture fallback + CIT shortcut for near-term trips | Extended authorization | IC+ only, +0.08 % Visa fee outside lodging/rental, CIT-only for Visa, not available for the off-session hold |
| Order changes after auth | Second off-session charge | Incremental authorization / overcapture | IC+ only / eligibility-limited; amounts known up front |
| Scheduler | Vercel daily cron + optional QStash hourly | pg_cron | Hidden from app logs, secret-in-DB, third scheduler |
| Scheduler | Catch-up sweep | QStash delayed message per booking | Free plan max delay 7 days |
| Quotes | Own `/quote/[token]` + Supabase tables | Stripe Quotes / Invoicing | No multi-day bundle semantics, hosted UI off-brand, still needs our DB |
| Quote deposit UI | On-page PaymentElement + PI with `setup_future_usage` | Payment Link / hosted Checkout Session | Payment Links can't attach an existing Customer; hosted sessions expire ≤ 24 h; on-page reuses existing component |
| Calendar | Hand-built | FullCalendar 7 / react-big-calendar / Schedule-X | CSS/theming conflict with inline styles + `.theme-light`; bundle weight; needs custom rendering anyway |
| Kanban DnD | None (menu moves) | @dnd-kit/react 0.5.3, @hello-pangea/dnd | Pre-1.0 / stale; transitions are strict and have payment side effects |
| Theme | CSS vars + cookie | next-themes, Tailwind `dark:` | CSP-nonce inline script; admin isn't Tailwind-class-styled |
| Live refresh | Polling `router.refresh()` | Supabase Realtime | Needs RLS design for admin; defer |
| Payment methods for hold | `card` (+ Apple/Google Pay via card) | SEPA DD, iDEAL, PayPal, Klarna, Link | SEPA no manual capture; others unsuitable for reusable hold/no-show charge or add reconciliation surface |

## Installation

```bash
# Nothing required for v5.0.
# Optional, only if drag-and-drop between kanban columns is later required:
# npm install @dnd-kit/core@6.3.1
```

Config changes instead of installs:
```jsonc
// vercel.json — add (Hobby: once/day, ±59 min)
{ "path": "/api/cron/place-holds", "schedule": "0 5 * * *" }
```
Env: reuse `CRON_SECRET` (Vercel-generated), `QSTASH_*` already set. Stripe Dashboard: enable the webhook events listed in CF-3; confirm account pricing plan (blended vs IC+) before promising any extended-auth behaviour; enable Apple Pay domain verification if not already done.

## Test Matrix (Stripe test mode)

| Scenario | Card |
|----------|------|
| 3DS on setup, off-session OK after | `4000002500003155` |
| Always requires authentication (hold must fall back to payment link) | `4000002760003184` |
| Setup OK, every charge declined `insufficient_funds` (failed-hold path) | `4000008260003178` |
| Already set up for off-session (happy path) | `pm_card_authenticationRequiredSetupForOffSession` (`4000003800000446`) |
| Hold expiry | Cannot be simulated reliably with test cards; unit-test the capture-fallback branch by mocking `status:'canceled'` and verify `capture_before` is persisted. |

## Confidence & Sources

| Claim | Confidence | Source |
|-------|-----------|--------|
| Visa MIT hold 4d18h vs 7d CIT; MC/Amex/Discover 7d | HIGH | docs.stripe.com/payments/place-a-hold-on-a-payment-method |
| Extended auth: IC+ only, Visa CIT-only, +0.08 % outside lodging/rental, 30 d, no regional limit, `request_extended_authorization` | HIGH | docs.stripe.com/payments/extended-authorization (advanced integration variant) |
| Incremental auth: IC+ only, 10 attempts, Visa/MC/Amex global | HIGH | docs.stripe.com/payments/incremental-authorization |
| Cards support SetupIntent + manual capture; SEPA DD no manual capture | HIGH | docs.stripe.com/payments/payment-methods/payment-method-support |
| SetupIntent + Payment Element flow, `off_session: true` charge, `authentication_required` handling, terms requirements | HIGH | docs.stripe.com/payments/save-and-reuse (Setup Intents API) |
| Test card behaviours | HIGH | docs.stripe.com/testing |
| Vercel Cron: 100/project, Hobby daily, ±59 min, deploy fails if more frequent | HIGH | vercel.com/docs/cron-jobs/usage-and-pricing (updated 2026-07-15) |
| Hobby function max 300 s | HIGH | vercel.com/docs/functions/configuring-functions/duration (updated 2026-08-24) |
| QStash free: 1,000 msgs/day, 7-day max delay, 10 schedules, `CRON_TZ`, `scheduleId` | HIGH | upstash.com/docs/qstash/overall/pricing, /features/schedules |
| Routes API: ≤10 intermediates Essentials, ≤25 max, TRAFFIC_AWARE ⇒ Pro, no alternatives with intermediates | HIGH | developers.google.com/maps/documentation/routes (usage-and-billing, computeRoutes reference) |
| Repo facts (webhook creates booking on `payment_intent.succeeded`, waypoints already implemented, `.theme-light` exists, 4 crons in vercel.json, ~920 var refs / ~234 hex in admin) | HIGH | direct file reads/greps 2026-11-02 |
| Library versions (stripe 23.1.0, stripe-js 10.2.0, react-stripe-js 7.0.1, qstash 2.12.1, dnd-kit core 6.3.1 / react 0.5.3, hello-pangea 18.0.1, FullCalendar 7.1.3, react-big-calendar 1.20.0, schedule-x 4.1.0) | HIGH | `npm view` 2026-11-02 |
| Build-vs-buy for calendar/kanban/theme | MEDIUM | Judgement from repo styling approach, not a benchmark |

## Open Items for Phase-Level Research

- Confirm Stripe account pricing plan (blended vs IC+) and merchant category code (taxi/limousine 4121) in the Dashboard; affects only the optional CIT extended-auth path.
- Legal/consumer-terms wording for a 100 % no-show charge and off-session mandate (CZ/EU consumer law, chelautotrans s.r.o. terms, 7 locales) — needs owner/legal sign-off before launch, not a stack matter.
- Decide whether to adopt the hybrid CIT shortcut (CF-1 #3); it changes the checkout branching and test matrix but materially reduces failed holds.
- Index on `bookings` pickup timestamp for calendar range queries (verify existing migrations; next migration number is 084).
