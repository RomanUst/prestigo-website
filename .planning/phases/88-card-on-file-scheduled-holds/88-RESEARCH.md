# Phase 88: Card on File & Scheduled Holds - Research

**Researched:** 2026-11-04
**Domain:** Stripe SetupIntent + off-session manual-capture holds on Next.js 16 / Supabase / QStash + Vercel cron (single-merchant chauffeur booking, EU/CZ, 7 locales)
**Confidence:** HIGH on Stripe mechanics (official docs fetched this session) and on codebase seams (files read this session); MEDIUM on Dashboard-only items (pricing plan, MCC, Radar setting) and on legal wording (out of scope until Phase 89 counsel review)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried forward (decided before this discussion — do not re-ask)
- **D-01:** Hold lead time is configurable in admin, default 72 h; never ~5 days / 120 h (Visa merchant-initiated holds last 4 d 18 h). Decided 2026-11-02.
- **D-02:** Partner (GNet, `booking_source` partner) bookings are never held, captured or charged by this engine (`emitBookingCompleted` already carries `partner`).
- **D-03:** Multi-day trips are quotes (Phase 92: deposit + remainder); one long hold is never used.
- **D-04:** The feature flag stays closed to all clients until Phase 89 completes. Before then, cancelling a canary card booking = the operator's release action; the automatic policy cancel is Phase 89.
- **D-05:** Only `lib/payments/state.ts` writes `payment_state`; `payment_intent_id` is set only at capture. Expected migration 085 (payment_state, payment_mode, hold fields, ledger, consent record, settings) — next migration number per memory is 085.
- **D-06:** Capture is triggered by the single Phase 87 completion event (`lib/booking-events.ts` / `emitBookingCompleted` from `lib/booking-status-service.ts`), never by a second status writer.
- **D-07:** Stripe SDK stays 21.0.1, zero new runtime dependencies. The `.env.local` Stripe test key is a dead placeholder → owner-run scripts + canary; hold expiry cannot be simulated with test cards, so the `canceled`/expired branch is mocked in tests.
- **D-08:** QStash schedule quota is unverified; the daily Vercel cron must remain a backstop that still places overdue holds (missed run caught up next run).

#### Checkout mode
- **D-09:** When the flag is on for a client, checkout offers **only** "save card, pay after the trip" — the pay-now PaymentIntent path is not shown alongside it (one path, Blacklane-style). With the flag off, today's pay-now flow is unchanged. — **Reversibility:** reversible — adding a pay-now choice later is a UI branch over the existing flow.
- **D-09a:** The admin flag is an owner-controlled switch that can be turned on and off at any time. Turning it off only changes what **new** checkouts see (back to pay-now); card bookings already made keep their full lifecycle (scheduled hold, capture, fallback charge, failure recovery) — the scheduler and capture never read the flag. Until Phase 89 the "on" state is limited to the owner's canary (allowlist); "on for everyone" opens after Phase 89.
- **D-10:** Card-on-file applies to **both transfers and hourly bookings** (every online-paid booking from `/book`). Multi-day stays a quote request.

#### Hold timing at checkout
- **D-11:** An on-session hold at checkout is placed **only when pickup is ≤ the hold lead (72 h) away**. Bookings further out only save the card; the hold is placed automatically at pickup − lead. The ~6-day on-session cutoff from research is **rejected** — the client's money is never frozen longer than the lead time.
- **D-12:** The payment step shows the **exact date** of the hold in the booking locale and pickup timezone, e.g. "Nothing is charged now. On 12 November we'll hold the amount; it's charged after your trip." For bookings inside the window it says the amount is held now and charged after the trip. Copy is draft pending the Phase 89 legal review; the consent text version is stored per booking so wording can change.

#### Failure recovery
- **D-13:** When a scheduled (off-session) hold or a charge is declined: immediately email the client a payment link and alert the operator; then **one automatic retry ~12 h later**, only if the client has not paid via the link in the meantime. No further automatic retries — after that, the admin "retry" action.
- **D-14:** Operator alert = **email via Resend** (from Vercel, no VPS dependency) plus a visible red badge/state in admin. No Telegram bot in this phase.
- **D-15:** An unpaid booking stays active; the operator decides. A second alert fires **24 h before pickup** if the booking still has no valid hold or payment. No automatic cancellation in Phase 88 (automatic cancel of unpaid bookings is a Phase 89 question, see Deferred).

#### Price / time changes after a hold
- **D-16:** Operator **raises the price** after the hold: the hold stays as is; at completion the held amount is captured in full and the **difference is charged separately to the saved card off-session**. If that charge is declined → payment link for the difference + operator alert (same D-13 path, no auto retry needed beyond D-13's one). This is the same extra-charge mechanism Phase 91 will reuse for waiting fees.
- **D-17:** Operator **lowers the price**: capture the new amount with `amount_to_capture`; the rest of the hold is released by Stripe. (No user decision needed; recorded for completeness.)
- **D-18:** Pickup **moved later** so the current hold would expire before the trip (or the new pickup is outside the lead window): **release the old hold immediately** and let the scheduler place a new one at new pickup − lead. Pickup moved earlier into the window with no hold yet: the next scheduler run places it (catch-up). Timing is always computed from the pickup instant (Europe/Prague, DST-safe: 2027-03-28, 2027-10-31).

### Claude's Discretion
- Exact retry delay (≈12 h, clamped so it lands before pickup), scheduler cadence, and how the QStash schedule and daily cron share work.
- Stripe Customer handling for guest checkouts, `confirmSetup` inside the existing PaymentElement, ledger schema, webhook routing by metadata purpose.
- Admin payment panel layout inside the current booking detail UI (Phase 90 extracts `BookingDetailPanel` later — keep the panel self-contained).
- Email template design, as long as all 4 card-lifecycle emails exist in all 7 locales via one language-aware mechanism Phase 89/92 can extend.
- Draft consent/mandate wording (EN + 6 real translations), flagged for counsel review in Phase 89.

### Deferred Ideas (OUT OF SCOPE)
- **Automatic cancellation of a booking whose hold/payment still failed close to pickup** — consider in Phase 89 alongside the cancellation policy (owner chose operator decision for Phase 88).
- **Telegram bot alerts** for payment failures — not now; email + admin badge only.
- **Pay-now option next to card-on-file** — rejected for now; revisit if corporate clients ask for immediate payment.
- Open Phase 87 review items: WR-01 (cancel refund before CAS) should be fixed in this phase's planning since holds make it live; WR-02/WR-04/WR-06 stay in the review disposition.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAYF-01 | Every booking carries a payment mode and a payment state separate from trip status; append-only ledger visible in admin | Migration 085 spec (`payment_mode`, `payment_state`, `booking_payment_events` with append-only trigger), `lib/payments/state.ts` single writer, `apply_payment_transition` RPC, writer-gate test, admin `PaymentPanel` |
| PAYF-03 | Webhook routes each event by purpose with no duplicate bookings / false alerts; partial refund never cancels a completed trip | `metadata.kind` router placed BEFORE the legacy `groupBookingIds`/`bookingId`/`isRoundTrip` chain; unknown kind is swallowed, never falls into `handleOneWaySucceeded`; the `charge.refunded` terminal guard already shipped in Phase 87 (commit `570d5ded`) — add regression + ledger observation only |
| PAYF-04 | Owner script subscribes the live webhook to the new events; a working test-mode path exists | `infra/stripe/webhook-events.mjs` (fake-client tested, pattern of `infra/chatwoot/webhook.mjs`), `infra/stripe/card-flow-smoke.mjs` (owner-run with `sk_test`, SCA test cards), `infra/qstash/payment-tick-schedule.mjs` |
| PAYF-05 | Feature flag + owner canary before anyone else | `pricing_globals.card_flow_mode` CHECK `('off','canary')` (no `'on'` until Phase 89 widens it) + `card_flow_canary_emails`; admin settings route/UI; canary runbook |
| HOLD-01 | Save card with 3DS, nothing charged, unticked consent, consent record (version, locale, time, IP) | Deferred-intent `mode:'setup'` + server SetupIntent (`usage:'off_session'`, `request_three_d_secure:'any'`), `confirmSetup`, `booking_payment_consents` table, server-rendered consent text + SHA-256 |
| HOLD-02 | Automatic hold a configurable time before pickup (default 72 h) | `hold_at = pickupInstant − lead` (absolute ms, DST-safe via `pickupInstantMs`), `payment-tick` (QStash 15-min schedule + Vercel daily backstop), `claim_due_payment_work` SKIP LOCKED claim |
| HOLD-03 | Hold at checkout when booking is inside the window | `mode:'payment'` deferred Elements, server PaymentIntent `capture_method:'manual'` + `setup_future_usage:'off_session'` (customer-initiated, 7-day window); `payment_intent.amount_capturable_updated` confirms the booking |
| HOLD-04 | Capture on completion; charge saved card if hold expired; never twice | `settleBooking()` behind CAS claim `→ capturing`, deterministic attempt-numbered idempotency keys, completion sweep on `completed_at IS NOT NULL`, `emitBookingCompleted` becomes the async consumer entry |
| HOLD-05 | On failure: payment link to client + operator alert not dependent on VPS | Recovery Payment Link (`kind:'card_recovery'`), Resend operator alert (`MANAGER_EMAIL`), one auto-retry ~12 h, 24 h-before-pickup alert, red `failed`/`balance_due` badge |
| HOLD-07 | Admin shows payment state, hold expiry, actions capture / release / retry / send link | `GET/POST /api/admin/bookings/[id]/payment`, self-contained `PaymentPanel`, `PaymentStateBadge` on `--status-*` tokens |
| MAIL-01 | Payment emails in booking language (7 locales) | `lib/payments/emails/*` renderer using `createTranslator` (exported by `next-intl` in RSC/route-handler env) + new `PaymentEmails` catalog namespace; 4 client templates; extension point for Phase 89/92 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Brand spelling **Prestigo** / **rideprestigo.com** (never "Prestigio").
- Commands: `npx tsc --noEmit` (baseline 8 old errors in `tests/` only); `npx eslint --quiet <files>`; tests `npx vitest run [files]` (full suite ~90 s; `vitest related` crashes — grep `tests/` instead); full gate = the `verify` skill; dev server via `preview_start` name `prestigo`, never `npm run dev` in Bash.
- **No hard-coded `€` prices in `app/` or `components/`** (pre-commit enforces `€[0-9]{2,}`); amounts come from helpers / ICU parameters. `messages/*.json` and `lib/` are not scanned by that hook — review catalogs manually: amounts in consent/email copy must be ICU parameters.
- No secrets or `.env*` in commits; **never read `.env.local`**. Owner scripts take keys from env/hidden prompt and print OK/FAIL only.
- `middleware.ts` matcher must exclude static extensions — Phase 88 adds no static files, so no matcher change; but `CSRF_PROTECTED_PREFIXES` must gain the new public prefix (see Pitfall 10).
- New EN strings in `messages/en.json` need **real translations in all 6 other locales** (translate in-session; the GH translate workflow is disabled). Never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil` (not touched here).
- **Security work (auth, CSRF, validation, rate limits, money): run tests, commit with `security:` prefix.** Phase 88 is flagged security-relevant.
- Marketing content rules (no prices, no Uber comparison) apply to nothing in this phase except email copy: payment emails state the client's own booked amount (transactional), not marketing prices.
- Vercel Preview deploys always fail (missing Supabase env) — non-blocking; production builds fine. Merge to `main` = production deploy.
- Project skills: `.claude/skills/verify` (quality gate: tsc, eslint, related tests by grep, price/secret/i18n checks, pre-pr mode runs the full suite). Plans should end with a `verify` run.
- Memory-derived rules that bind this phase: executors have **no Supabase MCP** (orchestrator applies migration 085 and runs smoke); admin API guard order, 400-vs-422 two-step parse, CSRF; SECURITY DEFINER RPCs must be re-`REVOKE`d from `PUBLIC, anon, authenticated` after DROP+CREATE; never create a Supabase client during render; service client inside `after()`; Stripe live actions only via owner-run scripts; owner-secret script workflow; Vercel secret writes need the owner.

## Summary

Phase 88 adds a second state machine (`payment_state`) next to `bookings.status` and a thin Stripe engine around it. A client with the flag on saves a card with 3DS (nothing charged) via a **deferred-intent PaymentElement** and a server-created SetupIntent; the booking is created (unpaid → confirmed) exactly once from the existing attempt-keyed unpaid row. A single idempotent tick endpoint places the full-amount manual-capture hold at `pickup − lead` (default 72 h) off-session; bookings already inside the window get a customer-present manual-capture PaymentIntent at checkout instead. The Phase 87 completion event (made async) settles the booking: capture the hold with `amount_to_capture`, or — if the hold is gone — a fresh off-session charge on the saved card, plus a separate off-session charge for any price increase. Any decline produces a Payment Link to the client, a Resend alert to the operator, one retry ~12 h later and a 24 h-before-pickup alert. Everything is behind `card_flow_mode` (`off` | `canary`) and is proven by the owner's own canary booking.

Research against the codebase surfaced several facts that differ from the milestone-level notes and must reach the planner:

1. **The `charge.refunded` terminal-status guard is already shipped** (Phase 87, commit `570d5ded`; `app/api/webhooks/stripe/route.ts:924-950` and the `.not('status','in','(completed,no_show)')` filters). STATE.md's "fixed in Phase 88" line is stale — Phase 88 only adds a regression test and a ledger observation for card bookings.
2. The webhook idempotency table is **`stripe_processed_events`** (route.ts:81, 94), not `stripe_events`.
3. `bookings.pickup_utc` is **not defined in any repo migration** (Phase 87 research A10 flagged it too) and the admin trip-edit PATCH does not write it. All hold timing must use `pickupInstantMs()` (`lib/prague-date.ts:60-83`) and store its own `hold_at`; do not run SQL on `pickup_utc`. Wave 0 must verify the live column definition via Supabase MCP.
4. `emitBookingCompleted` is **synchronous** and called inside `after()` (booking-status-service.ts:197-209). To honour "Phase 88 extends this module" it must become `async` and await the settle consumer (one existing test asserts the sync return — update it).
5. QStash Free plan facts are now **documented** (see Environment Availability): 1,000 msgs/day, 7-day max delay, 10 active schedules.
6. Stripe documents that **Radar does not act on SetupIntents by default** — a public SetupIntent endpoint is a card-testing vector; acceptable while canary-only, a hard prerequisite for Phase 89 go-live.
7. The PaymentIntent object type lists `cancellation_reason` values `'abandoned' | 'automatic' | 'duplicate' | 'expired' | 'failed_invoice' | 'fraudulent' | 'requested_by_customer' | 'void_invoice'` [VERIFIED: node_modules/stripe/types/PaymentIntents.d.ts:349-357], while our own `cancel` call can only send `'abandoned' | 'duplicate' | 'fraudulent' | 'requested_by_customer'` [VERIFIED: PaymentIntentsResource.d.ts:7118-7122]. Which of `'automatic'`/`'expired'` Stripe sets on a lapsed hold is not documented → treat both (and any reason when our row still points at that PI) as expiry. The branch is detectable and mockable.
8. Stripe API v1 **replays the saved response of an idempotency key including 500s** and prunes keys after 24 h. Idempotency keys therefore must carry an *attempt number* that only advances after a definitive failure; a network-ambiguous retry reuses the key.
9. **No localized email mechanism exists** — every client email in `lib/email.ts` is English-only inline HTML (`en-GB` date formatting). MAIL-01 needs a new renderer + catalog namespace.
10. **D-10 gap — `round_trip`:** `/book` also sells `round_trip` (two booking rows sharing one PaymentIntent, return leg `amount_eur: null`, per-leg pre-promo CZK amounts — `lib/supabase.ts:351-433`). Card-on-file for it needs per-leg holds. Recommendation: flag applies to `transfer` and `hourly` in Phase 88; `round_trip` (and `daily`) fall back to pay-now when the flag is on, until the owner decides (Open Question 1).

**Primary recommendation:** Build a tracer first — migration 085 + `lib/payments/state.ts` + canary flag + deferred-intent `Step6CardOnFile` + `setup_intent.succeeded` handler + localized "card saved" email — so the owner can complete a real far-out card booking end to end; then add the tick/hold engine, settle engine, failure path, on-session hold, edit hook and admin panel in that order, with the Stripe-facing logic tested against an in-memory fake Stripe and proven live only by owner-run scripts and the canary.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Show card-flow vs pay-now, hold date copy, consent checkbox | Browser / Client | API / Backend | UI renders; **eligibility, mode (setup vs hold-now) and hold date are decided server-side** (flag/allowlist must not be client-trusted) |
| Collect card + 3DS (`confirmSetup` / `confirmPayment`) | Browser / Client (Stripe.js iframe) | — | PCI scope stays in Stripe Elements; server never sees PAN |
| Price recompute, amount, hold_at, consent text/hash | API / Backend | Database | Server-authoritative (Pattern 4 of ARCHITECTURE.md); client sends only a displayed-amount cross-check |
| Customer / SetupIntent / PaymentIntent creation | API / Backend | — | Secret key + idempotency keys |
| `payment_state` transitions + ledger | Database (RPC, atomic CAS + ledger insert) | API / Backend (`lib/payments/state.ts` is the only caller) | CAS must be atomic with the ledger row; single writer module enforced by a gate test |
| Scheduled hold placement, completion sweep, retries, alerts | API / Backend (`/api/cron/payment-tick`) | Database (claim function), QStash + Vercel cron (triggers) | Trigger is external; all logic is DB-driven catch-up, never per-booking timers |
| Capture / fallback charge / difference charge | API / Backend (`settleBooking`, called from the completion consumer, tick, admin action) | Stripe | One function, three entry points, one CAS claim |
| Webhook routing by purpose | API / Backend (`/api/webhooks/stripe` + `lib/stripe-webhook/*`) | Database (ledger `event_key` uniqueness) | Signature check + `stripe_processed_events` idempotency, ledger key as second guard |
| Operator alert, client payment emails | API / Backend (Resend) | — | No VPS dependency (D-14) |
| Payment panel, badges, settings UI | Browser / Client (admin) | API / Backend | Self-contained component fetching its own data |
| Flag, hold lead, canary allowlist | Database (`pricing_globals`) | API / Backend (reader) | Owner-controlled via existing admin settings route |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (node) | 21.0.1 installed, pins API `2026-03-25.dahlia` [VERIFIED: node_modules/stripe/cjs/apiVersion.js:5 — `exports.ApiVersion = '2026-03-25.dahlia';`] | Customers, SetupIntents, PaymentIntents (manual capture, off-session), Payment Links | Locked by D-07; do not bump |
| `@stripe/stripe-js` | 9.1.0 installed [VERIFIED: node_modules/@stripe/stripe-js/package.json] | `loadStripe`; deferred-intent Elements types: `StripeElementsOptionsModeSetup` `mode: 'setup'` (elements-group.d.ts:894-903), `captureMethod`, `setupFutureUsage`, `paymentMethodTypes` (elements-group.d.ts:760-802) | Already used by Step6Payment |
| `@stripe/react-stripe-js` | 6.1.0 installed | `<Elements>`, `<PaymentElement>`, `useStripe`, `useElements` | Already used |
| `@upstash/qstash` | 2.10.1 installed [VERIFIED: node_modules/@upstash/qstash/package.json] | `Receiver` signature check for the tick (POST); `Client.schedules.create({ destination, cron, scheduleId, retries })`/`list()` for the owner schedule script (client-CsM1dTnz.d.ts:1204-1352) | Already used by reminders / outbox |
| `resend` | ^6.9.4 | Client payment emails + operator alert | Already used (`lib/email.ts`) |
| `next-intl` | 4.14.2 | `createTranslator` is re-exported by both the react-server and react-client entries (`export * from 'use-intl/core'` — [VERIFIED: node_modules/next-intl/dist/types/react-server/index.d.ts, react-client/index.d.ts]; `createTranslator.d.ts` in `use-intl/core`) → server-side localized emails and consent text without a request context, importable in route handlers and in vitest | Already used |
| `zod` | ^4.3.6 | Two-step parse on every new route (400 shape, 422 business) | Existing rule |
| `vitest` | ^4.1.1 | Tests (jsdom default, `// @vitest-environment node` for server) | Existing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/prague-date.ts` (`pickupInstantMs`, `getPragueTodayISO`) | in-repo | DST-safe pickup instant, Prague calendar date of the hold instant | All hold timing |
| `lib/locale-date.ts` (`formatLocaleDate`) | in-repo | Locale-formatted long date with Latin digits (D-12 copy, emails) | Hold-date wording, 7 locales |
| `lib/currency.ts` (`formatEUR`, `formatCZK`, `eurToCzk`) | in-repo | Amount formatting shared by client text and the server-rendered consent text | Consent hash determinism |
| `lib/booking-status.ts` (`assertMoneyEligible`, `isPartnerBooking`) | in-repo | Mandatory first call of every money entry point (booking-events.ts:20-29) | Hold, settle, charge, release |
| `lib/server-pricing.ts` (`computeCombinedTotalMinor`) | in-repo | Single call site for total + promo rounding + Stripe minor unit | Amount at checkout |
| `lib/email-log.ts` (`logEmail`) | in-repo | 10-minute dedupe only (email-log.ts) — **not sufficient for lifecycle emails**; use ledger `event_key` for exactly-once | Existing flows only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deferred-intent Elements (`mode:'setup'`/`'payment'`) | Mount-time SetupIntent with `clientSecret` (today's PaymentIntent pattern) | Mount-time creates a Customer + SetupIntent on every promo/currency/trip change and leaves orphans; deferred creates them only at submit, right when consent is recorded. Cost: the Phase 62 abandoned-checkout unpaid row is captured at submit, not mount (acceptable for canary; revisit at Phase 89 go-live) |
| Per-booking Stripe Customer (row-first, idempotent) | Dedupe by email (`customers.list({email})`) | Dedupe saves Dashboard clutter but adds a lookup race and merges strangers using the same email into one Customer; per-booking keeps erasure and reuse trivial. Phase 91/92 can add dedupe later |
| `apply_payment_transition` RPC (CAS + ledger in one transaction) | supabase-js `.update().eq('payment_state', from)` then a second ledger insert | Two statements are not atomic: a crash between them yields a state change with no ledger row (violates "every money event") |
| QStash schedule (15 min) + Vercel daily backstop | Per-booking delayed QStash messages | Free plan max delay 7 days; messages can't be edited when pickup moves (STACK.md) |
| `createTranslator` + catalog namespace for emails | Inline per-locale HTML templates | 7 × 4 templates of HTML is unmaintainable; one structure + ICU strings matches how Phase 89/92 will add templates |
| Hosted Checkout `mode:'setup'` | PaymentElement + SetupIntent | Hosted UI loses server-authoritative recompute and the consent record at click time (kept only for a possible admin "add your card" link in Phase 89) |

**Installation:**
```bash
# none — zero new runtime dependencies (D-07). infra scripts import the already-installed `stripe` and `@upstash/qstash`.
```

**Version verification:** versions above read from `node_modules/*/package.json` and `apiVersion.js` this session. No `npm view` needed because nothing is installed or bumped; the milestone STACK.md recorded latest npm versions (stripe 23.1.0, stripe-js 10.2.0, react-stripe-js 7.0.1) and rejected mid-milestone bumps [CITED: .planning/research/STACK.md].

## Package Legitimacy Audit

No external package is installed or added by this phase, so the Package Legitimacy Gate is not triggered. All libraries listed above are already in `package.json` / `node_modules` from earlier phases.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 CHECKOUT (browser, 7 locales)                                   OPERATOR (admin, EN)
 ──────────────────────────────                                  ───────────────────
 BookingWizard step 6                                             Settings: hold lead, flag, canary emails
   └─ Step6Checkout (NEW gate)                                    BookingsTable row ─ PaymentPanel (NEW)
        │ POST /api/card-checkout/init  ── flag/allowlist/trip type/pickup ──┐        │ GET/POST /api/admin/bookings/[id]/payment
        │   eligible=false ───────────► legacy Step6Payment (unchanged)       │        │  actions: capture | release | retry | send_link
        │   eligible=true  {mode: setup | hold_now, holdAt}                   ▼        ▼
        ▼                                                          ┌──────────────────────────────┐
   Step6CardOnFile  (Elements mode:'setup' | mode:'payment' manual)│        lib/payments/*        │
        │ elements.submit()                                        │ state.ts (ONLY payment_state │
        │ POST /api/card-checkout/intent {bookingData, consent}    │   writer) → RPC              │
        ▼                                                          │ apply_payment_transition     │
   server: recompute price → captureUnpaidBooking(attempt) ───────►│ settle.ts hold.ts recovery.ts│
        → Customer (row-first, idempotent) → SetupIntent │ PI     │ edit-hook.ts alerts.ts       │
        → consent row (text sha256, IP, UA, locale)               └───────┬───────────┬──────────┘
        ▼                                                                  │           │
   stripe.confirmSetup / confirmPayment  (3DS in browser)                  ▼           ▼
        │                                                         Stripe API      Supabase
        ▼                                                         (idempotent)    bookings (+payment_*)
 STRIPE ── webhook ──► /api/webhooks/stripe                                        booking_payment_events (ledger)
   setup_intent.succeeded            ┐ lib/stripe-webhook/dispatch                 booking_payment_consents
   payment_intent.amount_capturable_updated │ by metadata.kind FIRST               pricing_globals (+3 cols)
   payment_intent.payment_failed / .canceled│ then legacy chain untouched          stripe_processed_events
   payment_intent.succeeded / checkout.session.completed (kind=card_*)
        │  confirm booking once · schedule hold_at · email "card saved" · GA4 · 2h reminder

 TRIGGERS ───────────────────────────────────────────────────────────────────────────────────────
 QStash Schedule */15 (POST, signed) ┐
 Vercel cron 03:00 UTC (GET, Bearer CRON_SECRET) ┴► /api/cron/payment-tick (idempotent catch-up)
      A place due holds (claim_due_payment_work, SKIP LOCKED)   B one 12 h retry of failed holds
      C settle sweep: completed_at IS NOT NULL ∧ not captured   D 24 h-before-pickup + expiring-hold alerts
      E reconcile stuck checkout_pending / leases (retrieve SI/PI)

 COMPLETION: advanceBookingStatus(to=completed) ─ after() ─► emitBookingCompleted (now async)
      └► assertMoneyEligible ► settleBooking: CAS authorized|expired|card_saved|failed → capturing
           ├ hold alive → capture(amount_to_capture=min(due, held)) ─ difference? → off-session charge (D-16)
           ├ hold gone  → off-session automatic-capture charge (fallback)
           └ decline / authentication_required → failed|balance_due → recovery Payment Link + Resend alert
```

### Recommended Project Structure
```
lib/payments/
├── state.ts        # PAYMENT_STATES, PAYMENT_MODES, TRANSITIONS, applyTransition() → RPC. ONLY writer of payment_state
├── stripe.ts       # getPaymentsStripe(): lazy client (fetch http client, maxNetworkRetries 2 — safe only because every call has a key)
├── config.ts       # getPaymentSettings() (service client, uncached), isCardFlowEligible(); constants RETRY_DELAY_H=12 etc.
├── timing.ts       # PURE: computeHoldAt, decideHoldMode, retryAt, needsReplace, holdDisplayDate
├── idempotency.ts  # key builders hold:/cap:/chg:/diff:/si:/pi:/cus: + attempt rules
├── customer.ts     # ensureStripeCustomer(bookingRow) (row-first)
├── checkout.ts     # createCardCheckoutIntent(): SetupIntent | manual-capture PI + consent row
├── hold.ts         # placeHold(), releaseHold()
├── settle.ts       # settleBooking(): capture | fallback charge | difference charge
├── recovery.ts     # createRecoveryLink(), handleChargeFailure(), refreshRecoveryLink()
├── edit-hook.ts    # assertEditablePrecheck(), reevaluateAfterEdit() (D-16..D-18)
├── consent.ts      # CARD_CONSENT_VERSION, buildConsentText(locale, vars), sha256
├── alerts.ts       # sendPaymentOperatorAlert() (Resend → MANAGER_EMAIL), ledger-keyed dedupe
├── tick.ts         # runPaymentTick() (steps A-E, each try/catch-isolated like outbox-sweep)
└── emails/{render.ts,templates.ts,messages.ts}   # createTranslator + PaymentEmails namespace
lib/stripe-webhook/{dispatch.ts,once.ts,setup-succeeded.ts,hold-events.ts,recovery.ts}
lib/checkout/compute.ts          # extracted from create-payment-intent (behaviour-preserving; shared price/validation path)
app/api/card-checkout/{init,intent}/route.ts
app/api/cron/payment-tick/route.ts
app/api/admin/bookings/[id]/payment/route.ts       # GET (state + ledger) + POST (actions)
components/booking/steps/{Step6Checkout,Step6CardOnFile}.tsx
components/admin/{PaymentPanel,PaymentStateBadge,CardFlowSettings}.tsx
infra/stripe/{webhook-events.mjs,card-flow-smoke.mjs}  infra/qstash/payment-tick-schedule.mjs
supabase/migrations/085_payment_state_card_on_file.sql
tests/helpers/{fake-stripe.ts,fake-payments-db.ts}
```

### Pattern 1: Data model — migration 085 (additive; apply live BEFORE the code deploys)

All columns additive. Every existing trigger on `bookings` is `UPDATE OF <named columns>` (063, 067, 069, 084 — [VERIFIED: grep of `CREATE TRIGGER … AFTER … UPDATE OF` in those migrations]), none names a payment column, so writing payment columns fires no gcal/CRM/lead/status-log trigger, and a backfill `UPDATE` of `payment_mode` is trigger-safe.

**`bookings` columns**

| Column | Type / default / CHECK | Notes |
|--------|------------------------|-------|
| `payment_mode` | `text NOT NULL DEFAULT 'pay_now' CHECK IN ('pay_now','card_hold','cash_guarantee','quote','partner')` | `cash_guarantee` (Phase 89) and `quote` (Phase 92) reserved now to avoid CHECK churn; the hold engine acts only on `card_hold`. Backfill: `UPDATE … SET payment_mode='partner' WHERE booking_source='gnet'` (PAYF-01 "partner"); `assertMoneyEligible` remains the runtime guard |
| `payment_state` | `text NOT NULL DEFAULT 'none' CHECK IN ('none','checkout_pending','card_saved','placing_hold','authorized','capturing','captured','balance_due','failed','expired','released')` | `refunded` / no-show states are added by Phase 89's migration (parity test reads the latest CHECK) |
| `payment_currency` | `text CHECK IN ('eur','czk')` | Currency the client chose; hold/charge use it |
| `payment_amount_minor` | `bigint CHECK (> 0)` | Current authoritative amount in minor units (checkout: `computeCombinedTotalMinor().stripeAmountMinor`); admin price edits re-derive it (`payment_currency='eur' ? amount_eur*100 : amount_czk*100`) |
| `stripe_customer_id`, `stripe_payment_method_id`, `setup_intent_id` | `text` | `UNIQUE (setup_intent_id, leg) WHERE setup_intent_id IS NOT NULL` |
| `hold_at` | `timestamptz` | Computed in TS from `pickupInstantMs` and the lead at setup / edit time (never SQL on `pickup_utc`) |
| `hold_payment_intent_id`, `hold_amount_minor`, `hold_placed_at`, `capture_before` | `text` / `bigint` / `timestamptz` | `capture_before` = `charge.payment_method_details.card.capture_before` × 1000 (Charges.d.ts:869-872 `capture_before?: number`) |
| `hold_attempts`, `charge_attempts` | `smallint NOT NULL DEFAULT 0` | Idempotency-key attempt numbers; advance **only** on a definitive failure (Pitfall 3) |
| `payment_lease_until` | `timestamptz` | Lease on `placing_hold` / `capturing` claims |
| `captured_amount_minor` | `bigint NOT NULL DEFAULT 0` | `balance = payment_amount_minor − captured_amount_minor` |
| `captured_at`, `payment_failed_at`, `payment_retry_at` | `timestamptz` | |
| `payment_retry_count` | `smallint NOT NULL DEFAULT 0` | D-13: at most 1 automatic retry |
| `last_payment_error` | `text CHECK (char_length <= 60)` | Stripe error/decline **code only** (no message, no PII) |
| `recovery_link_id`, `recovery_link_url` | `text` | **Separate from `payment_link_id/url`** so the CR-02 stale-link logic in `booking-status-service.ts:134-147` and `PaymentLinkSection` never touch it |

Indexes: `bookings_hold_due_idx ON (hold_at) WHERE payment_mode='card_hold' AND payment_state='card_saved'`; `bookings_payment_attention_idx ON (payment_state) WHERE payment_mode='card_hold' AND payment_state IN ('checkout_pending','placing_hold','authorized','capturing','failed','balance_due','expired')`; `UNIQUE (hold_payment_intent_id) WHERE hold_payment_intent_id IS NOT NULL`.

**`booking_payment_events` (ledger, append-only)**: `id bigint identity PK`, `booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT` (bookings with money history are anonymised by erasure, never deleted — `supabase/migrations/075_erasure.sql` anonymises in place), `event_key text NOT NULL` with `UNIQUE (booking_id, event_key)` (exactly-once guard for webhook replays and re-driven sweeps), `kind text CHECK IN (…)` (`setup_started, setup_succeeded, hold_scheduled, hold_started, hold_authorized, hold_failed, hold_released, hold_expired, capture_started, captured, charge_succeeded, charge_failed, difference_charged, difference_failed, recovery_link_created, recovery_paid, alert_sent, email_sent, admin_action, refund_observed, edit_reevaluated, waived`), `stripe_object_id text`, `amount_minor bigint`, `currency text`, `from_state text`, `to_state text`, `actor_type text CHECK IN ('system','webhook','admin')`, `actor_id text CHECK (length <= 64)`, `error_code text CHECK (length <= 60)`, `created_at timestamptz DEFAULT now()`. Append-only: `BEFORE UPDATE OR DELETE` trigger raising an exception + `REVOKE ALL FROM anon, authenticated` + RLS deny-all policies (pattern: migration 084 `booking_status_log`). **No PII in rows** (ids, amounts, codes only).

**`booking_payment_consents`**: `id uuid PK`, `booking_id uuid NOT NULL REFERENCES bookings ON DELETE RESTRICT`, `setup_intent_id`/`payment_intent_id text`, `text_version text NOT NULL`, `text_sha256 text NOT NULL`, `locale text NOT NULL`, `amount_minor bigint`, `currency text`, `planned_hold_at timestamptz`, `accepted_at timestamptz DEFAULT now()`, `ip text`, `user_agent text (≤300)`, `confirmed_at timestamptz` (set when the SetupIntent / hold succeeds). Satisfies SC1 "consent text version, locale, time and IP stored with it". IP/UA are new PII: not covered by the 075 erasure function — see Open Question 4.

**`pricing_globals` (settings; follow the `noshow_wait_*` precedent in `app/api/admin/settings/route.ts` + migration 084 CHECKs)**: `payment_hold_lead_hours int NOT NULL DEFAULT 72 CHECK (BETWEEN 6 AND 96)` (hard ceiling < Visa MIT 114 h so 120 h is impossible by construction, D-01), `card_flow_mode text NOT NULL DEFAULT 'off' CHECK (IN ('off','canary'))` (**no `'on'` value until Phase 89's migration widens the CHECK** — makes "closed to all clients until Phase 89" a database invariant, D-04), `card_flow_canary_emails text[] NOT NULL DEFAULT '{}'`.

**RPCs (SECURITY DEFINER, `SET search_path=''`, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`, `GRANT … TO service_role` — memory: DROP+CREATE re-grants PUBLIC)**:
- `apply_payment_transition(p_booking_id uuid, p_from text[], p_to text, p_patch jsonb, p_event jsonb) RETURNS jsonb` — one transaction: `UPDATE bookings SET payment_state=p_to, <allow-listed patch keys via ? operator, never jsonb_populate_record> WHERE id=p_booking_id AND payment_state = ANY(p_from)`; on 0 rows → `{applied:false,current_state}`; on 1 row → `INSERT INTO booking_payment_events … ON CONFLICT (booking_id,event_key) DO NOTHING`; if the ledger insert conflicts the whole call returns `{applied:false,duplicate:true}` and rolls the UPDATE back (replay of an already-recorded event is a no-op). Pattern: `advance_booking_status` in migration 084 [VERIFIED: 084_booking_statuses_status_log.sql §5].
- `claim_due_payment_work(p_limit int, p_lease_seconds int) RETURNS SETOF bookings` — `UPDATE … SET payment_state='placing_hold', payment_lease_until=now()+lease WHERE id IN (SELECT id … WHERE payment_mode='card_hold' AND payment_state='card_saved' AND hold_at<=now() AND status IN ('confirmed','assigned','en_route','on_location') ORDER BY hold_at LIMIT p_limit FOR UPDATE SKIP LOCKED) RETURNING *` and a `hold_started` ledger row per id. Pattern: `outbox_claim` (064) [VERIFIED: 064_integration_outbox.sql §outbox_claim].

### Pattern 2: State machine (D-05; `lib/payments/state.ts` is the only module that calls `apply_payment_transition`)

| From | To | Trigger | Actor |
|------|----|---------|-------|
| `none` | `checkout_pending` | `/api/card-checkout/intent` created SetupIntent / hold-now PI | route |
| `checkout_pending` | `card_saved` | `setup_intent.succeeded` (sets customer/PM, `hold_at`) | webhook / tick reconcile |
| `checkout_pending` | `authorized` | `payment_intent.amount_capturable_updated` (kind `card_hold_now`) | webhook / reconcile |
| `card_saved` / `expired` / `failed` | `placing_hold` | tick claim or admin retry (pickup still in the future) | tick / admin |
| `placing_hold` | `authorized` | PI `requires_capture` | tick / webhook |
| `placing_hold` | `card_saved` | transient Stripe/network error (same attempt number kept) | tick |
| `placing_hold` | `failed` | definitive decline / `authentication_required` (attempt number +1) | tick |
| `authorized` | `card_saved` | D-18: hold released because pickup moved (new `hold_at`) | edit hook |
| `authorized` | `expired` | `payment_intent.canceled` with `cancellation_reason ∈ {automatic, expired}` while our row still points at that PI; or tick sees PI `canceled` | webhook / tick |
| `authorized` / `expired` / `card_saved` / `failed` | `capturing` | completion consumer, completion sweep, admin capture | consumer / tick / admin |
| `capturing` | `captured` | capture (and difference, if any) succeeded | settle |
| `capturing` | `balance_due` | hold captured but the D-16 difference charge declined | settle |
| `capturing` | `failed` | fallback charge declined (attempt number +1) | settle |
| `failed` / `balance_due` | `captured` | recovery link paid (`checkout.session.completed` / `payment_intent.succeeded` kind `card_recovery`) or admin retry succeeded | webhook / admin |
| `failed` | `placing_hold` | D-13 single auto-retry (pre-completion) | tick |
| `failed` | `capturing` | auto-retry / admin retry after completion | tick / admin |
| `card_saved` / `authorized` / `failed` / `expired` / `checkout_pending` | `released` | operator release / canary cancel (D-04); `authorized` also cancels the PI | admin / cancel route |
| `balance_due` | `released` | operator waives the balance (ledger `waived`) | admin |

`captured` and `released` are terminal in Phase 88. A parity test pins `TRANSITIONS`, `PAYMENT_STATES` and the migration CHECK together (pattern: `tests/booking-status-parity.test.ts` + `tests/helpers/latest-migration.ts`), and a source-reading gate (pattern: `tests/status-writers-gate.test.ts`) fails if any file under `app/` or `lib/` writes a `payment_state` key outside `lib/payments/state.ts`. `payment_intent_id` is written only by `settle`/`recovery` at the moment money is collected (D-05) — the cancel route (`payment_intent_id` ⇒ refund) and `charge.refunded` handler stay truthful.

### Pattern 3: Timing — all math on instants (D-18, SC2)

- `holdAtMs = pickupInstantMs(row) − leadHours × 3 600 000` — absolute hours, so across a DST change the Prague wall-clock of the hold shifts by an hour (intended; "72 h" is elapsed time). `pickupInstantMs` (`lib/prague-date.ts:60-83`) is the only wall-clock→instant converter; the lead-time guard in `create-payment-intent/route.ts:198-208` uses a crude `month >= 4 && month <= 10` offset that is wrong in the last week of March/October — **do not copy it** into the new endpoint.
- Verified by running a copy of the `pickupInstantMs` algorithm in Node 24.14.1 this session: `2027-03-28 12:00` → `10:00Z`, hold `2027-03-25 10:00Z` = **11:00** Prague time; non-existent `2027-03-28 02:30` → `01:30Z` (= 03:30 CEST, resolves forward); ambiguous `2027-10-31 02:30` → `01:30Z` (second occurrence, CET); `2027-10-31 12:00` → `11:00Z`, hold `2027-10-28 11:00Z` = 13:00 CEST. These are the DST fixtures for `tests/payments-timing.test.ts`.
- Mode at checkout (D-11): `inWindow = holdAtMs <= nowMs` → `hold_now` (on-session manual-capture PaymentIntent), else `setup` (SetupIntent). The server is authoritative; the client sends the mode it initialised Elements with and gets `409 MODE_CHANGED` if the boundary was crossed between render and submit.
- Display date (D-12): `formatLocaleDate(getPragueTodayISO(new Date(holdAtMs)), locale)`; copy should say the hold is placed *on or shortly after* that date (the daily backstop can place it up to ~24 h late, 15-min schedule ≤ 15 min) — wording for counsel (Open Question 5).
- Auto-retry (D-13): `retryAtMs = min(failedAtMs + 12 h, pickupMs − 2 h)`; skip the auto-retry when `retryAtMs < failedAtMs + 1 h` (pickup too close — operator handles). Constants live in `lib/payments/config.ts`, not in admin.
- Replace-on-edit (D-18): release when `capture_before_ms < newPickupMs + 6 h` **or** `newHoldAtMs > nowMs` (new pickup outside the lead window). Pickup earlier ⇒ nothing (tick catch-up places it if needed).

### Pattern 4: Scheduler (D-08) — one idempotent endpoint, two triggers

`app/api/cron/payment-tick/route.ts`: `export const maxDuration = 300`; `GET` = Vercel cron (`Authorization: Bearer ${CRON_SECRET}`, timing-safe compare copied from `outbox-sweep` — fail-closed when the env var is missing [VERIFIED: app/api/cron/outbox-sweep/route.ts GET]); `POST` = QStash (`Receiver.verify({signature, body})` with `QSTASH_CURRENT_SIGNING_KEY/NEXT`, pattern of `app/api/cron/reminder-2h/route.ts`, body read as text first). Both call `runPaymentTick()`; always HTTP 200 with a counts/errors body once authenticated (QStash counts every retry as a message — Environment Availability), 401 otherwise. Steps (each `step(code, errors, fn)`-isolated like outbox-sweep):

- **A place due holds** — `claim_due_payment_work(20, 300)` then `placeHold()` per row sequentially. Overdue by days (missed runs) is simply "due"; pickup already passed ⇒ skip the hold (settle will charge on completion). Hold amount = the row's **current** `payment_amount_minor` (admin edits are authoritative).
- **B auto-retry** — `payment_state='failed' AND payment_retry_count=0 AND payment_retry_at<=now() AND status active` → `placeHold` (pre-completion) or `settle` (post-completion); skipped when the client already paid via the link (state would be `captured`).
- **C settle sweep** — `completed_at IS NOT NULL AND payment_mode='card_hold' AND payment_state IN ('authorized','expired','card_saved','failed')` plus stale `capturing` rows whose lease expired. This is the durable backstop the Phase 87 hand-off requires ("a lost after() never loses a capture", booking-events.ts:25-27). A `NULL completed_at` on a historic row means *unknown*, so never select on `status='completed'` alone for old rows.
- **D alerts** — (i) `authorized` with `capture_before − now < 12 h` and not completed; (ii) D-15: pickup within 24 h and state ∈ (`card_saved`,`failed`,`expired`,`placing_hold`,`checkout_pending` older than 30 min) — each once, deduped by ledger `event_key` (`alert:no_valid_hold_24h:<bookingId>`), never by `logEmail` (10-minute window).
- **E reconcile** — `checkout_pending` older than 10 min with a `setup_intent_id`/PI: retrieve from Stripe and run the same handler as the webhook (covers a missed webhook and the window before the owner subscribes the new events).

Cadence: QStash schedule `*/15 * * * *` (≈96 msgs/day of the 1,000/day free quota, shared with outbox/reminders); Vercel cron `0 3 * * *` added to `vercel.json` (daily is the Hobby maximum; existing entries run 04:00–07:00 UTC [VERIFIED: vercel.json]). With only the daily trigger, a hold lands ≤ ~24 h late — still before pickup for default 72 h and well inside Visa's 4 d 18 h.

### Pattern 5: Webhook routing by purpose (PAYF-03) — new code in front, legacy chain byte-identical

`app/api/webhooks/stripe/route.ts` keeps signature verification. Immediately after it, call `dispatchPaymentEvent(event)` (`lib/stripe-webhook/dispatch.ts`) which returns `{handled:true,response}` when **either** the event type is one of the new types **or** the object's `metadata.kind` starts with `card_`; otherwise the legacy `if (event.type === …)` chain runs untouched. Rules:

1. **Unknown or unmapped `card_*` kind ⇒ log + 200, never fall through** to `handleOneWaySucceeded`/`saveBooking` (that would create a duplicate booking — Pitfall 1).
2. Every PaymentIntent / SetupIntent / Session we create carries `metadata = { kind, cofBookingId, attempt, bookingReference }` — **no `bookingId` key** (the legacy router sends any `meta.bookingId` to `handlePaymentLinkSucceeded`, route.ts:153) and no PII (the legacy PI copies the whole booking into metadata so the webhook can recreate it; the card flow never needs that because the unpaid row exists before Stripe is called).
3. Idempotency: same SEC-10 order as the legacy branches (read-check `stripe_processed_events` → side effect → claim after, ignore `23505`) via a shared `once(event, handler)` helper, **plus** the ledger `event_key` guard inside `apply_payment_transition` so a re-driven sweep and a webhook can never both apply.
4. Handlers (kind → effect): `setup_intent.succeeded` (`card_setup`) → `checkout_pending→card_saved`, store customer/PM, `hold_at`, reconcile booking `unpaid→confirmed` (status-gated, existing helper pattern), claim promo (`claim_promo_code` RPC, as `handleOneWaySucceeded` does), localized "card saved" email + English `sendManagerAlert`, GA4 purchase, 2 h QStash reminder, consent `confirmed_at`; `setup_intent.setup_failed` → ledger only; `payment_intent.amount_capturable_updated` (`card_hold_now` → confirm booking + `authorized`; `card_hold` → reconcile `placing_hold→authorized`, store `capture_before`); `payment_intent.payment_failed` (`card_hold|card_charge|card_difference`) → backup for a missed synchronous error; `payment_intent.canceled` → expiry vs our own release (see state table); `payment_intent.succeeded` (`card_charge|card_difference|card_recovery`) → ledger/state reconcile, never a booking insert; `checkout.session.completed` with `session.metadata.kind='card_recovery'` and `payment_status==='paid'` → `failed|balance_due → captured`; `charge.refunded` on `payment_mode='card_hold'` → append `refund_observed` (legacy cancel logic and its completed/no_show guard stay as shipped); `charge.dispute.created` → operator alert only.
5. Events to subscribe (owner script): `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.dispute.created` (+ existing `payment_intent.succeeded`, `charge.refunded`, `checkout.session.completed`). `charge.expired` and `payment_method.detached` are optional (expiry is already covered by `payment_intent.canceled` and the tick).

### Pattern 6: Settle — capture, fallback charge, difference — "never twice" (HOLD-04, D-06, D-16, D-17)

Entry points: `emitBookingCompleted` (made `async`, awaits the consumer; try/catch — never throws into `after()`), tick step C, admin "capture". All call `settleBooking(bookingId, actor)`:

1. `assertMoneyEligible(booking)` (partner ⇒ return), `payment_mode==='card_hold'` else return.
2. **Claim**: `apply_payment_transition(from:[authorized,expired,card_saved,failed], to:capturing, patch:{payment_lease_until})`. 0 rows ⇒ someone else holds it or it is already `captured` ⇒ return (idempotent). Only the winner may call Stripe.
3. `due = payment_amount_minor` (current), `held = hold_amount_minor`.
4. If `hold_payment_intent_id`: `retrieve` it. `requires_capture` → `capture(id, { amount_to_capture: min(due, amount_capturable) }, { idempotencyKey: cap:<id>:<charge_attempts> })` (one capture only; the unused remainder is released by Stripe — D-17). `succeeded` ⇒ already captured (crash recovery) ⇒ reconcile. `canceled` / anything else ⇒ **fallback**.
5. **Fallback** (hold gone, or never placed): `paymentIntents.create({ amount: due, currency, customer, payment_method, off_session:true, confirm:true, payment_method_types:['card'], metadata:{kind:'card_charge',…} }, { idempotencyKey: chg:<id>:<charge_attempts> })`.
6. **Difference (D-16)**: `diff = due − captured`; `> 0` ⇒ second off-session charge `kind:'card_difference'`, key `diff:<id>:<charge_attempts>`.
7. Success ⇒ set `payment_intent_id` (the captured/charged PI — first time ever, D-05), `captured_amount_minor`, `captured_at`, state `captured` (or `balance_due` if only the difference failed), ledger rows, client "charged" email (ledger-keyed once).
8. Definitive failure (`StripeCardError`, `authentication_required`, `requires_action`) ⇒ `charge_attempts += 1` in the same transition into `failed` / `balance_due`, then `handleChargeFailure()` (Pattern 8). A connection/5xx error with no response ⇒ leave `capturing` (lease expires, sweep re-drives with the **same** key ⇒ Stripe replays the original result). If the lease is older than ~20 h (keys prune at 24 h) search first: `paymentIntents.search({ query: "metadata['cofBookingId']:'<id>' AND metadata['attempt']:'<n>'" })`.

Why never twice: CAS claim (one winner) × deterministic attempt-numbered keys (a replay returns the saved result) × ledger `event_key` (a replayed webhook cannot re-apply) × persistence of the attempt number **before** the Stripe call (the attempt number is part of the claim transition, not derived after).

### Pattern 7: Edit hook — D-16 / D-17 / D-18 on `PATCH /api/admin/bookings` trip-edit

Insert around `app/api/admin/bookings/route.ts:609-614` (the `.update(tripUpdatePayload)`): **before** the update call `assertEditablePrecheck(current)` — for `payment_mode='card_hold'` in `checkout_pending | placing_hold | capturing` return `409 payment_in_progress` and persist nothing; **after** a successful update call `reevaluateAfterEdit(bookingId, {old, new})` (inside `after()`-safe try/catch; the edit itself never fails because of a Stripe error). It recomputes `payment_amount_minor` and `hold_at` from the saved row, and: `card_saved|failed|expired` ⇒ just update `hold_at`/amount (tick places it; D-18 earlier-pickup catch-up); `authorized` ⇒ amount only (D-16 raise / D-17 lower are settled at completion, nothing is released or re-held) **unless** the replace-on-edit rule fires ⇒ `releaseHold()` (`paymentIntents.cancel` with `cancellation_reason:'requested_by_customer'`, key `rel:<id>:<hold_attempts>`) ⇒ `authorized→card_saved` with new `hold_at`, ledger `hold_released(reason=pickup_moved)` + `edit_reevaluated`. The existing `completed|cancelled` terminal gate (route.ts:370) already blocks edits after completion, so amounts are frozen before `capturing`. A stale recovery link whose amount no longer matches is deactivated and re-created (`refreshRecoveryLink`) — the same CR-02 class of bug the booking `payment_link_*` code already fought.

### Pattern 8: Failure path (HOLD-05, D-13, D-14, D-15)

`handleChargeFailure(booking, errorCode, amountMinor)`: (1) state → `failed`/`balance_due`, `payment_failed_at`, `last_payment_error=code`, `payment_retry_at` per Pattern 3; (2) `createRecoveryLink()` — extend `lib/stripe-payment-links.ts` (currently EUR-only: `currency: 'eur'`, `unit_amount: Math.round(params.amountEur * 100)`, stripe-payment-links.ts:55-58) with `currency` + `amountMinor` + `kind:'card_recovery'` metadata (`cofBookingId`, **no `bookingId`**), keep `payment_method_types:['card']` and `restrictions.completed_sessions.limit: 1`; persist in `recovery_link_*`; (3) localized "payment failed" email with the link (booking locale); (4) operator email via Resend to `MANAGER_EMAIL` + red badge; (5) retry/alerts by tick steps B and D. All four side effects are ledger-keyed (`event_key` per attempt) so a re-driven failure cannot email twice. An unpaid booking stays active (D-15); nothing cancels automatically.

### Pattern 9: Checkout UI (HOLD-01, HOLD-03, D-09, D-12)

- `BookingWizard.tsx:244` renders `<Step6Payment />`; replace with `<Step6Checkout />` (new gate). The gate calls `POST /api/card-checkout/init` once (side-effect-free, returns instantly for `card_flow_mode='off'`) and renders legacy `Step6Payment` (file and `tests/Step6Payment.test.tsx` untouched) when `eligible:false`, else `Step6CardOnFile`. Gating *before* mount matters: legacy Step6Payment creates a PaymentIntent and an unpaid row on mount (Step6Payment.tsx:331-419).
- `Step6CardOnFile`: `<Elements options={{ mode:'setup', currency, paymentMethodTypes:['card'], appearance, locale: STRIPE_ELEMENTS_LOCALE[locale] }}>` for far-out bookings; `{ mode:'payment', amount, currency, captureMethod:'manual', setupFutureUsage:'off_session', paymentMethodTypes:['card'], … }` for `hold_now` — option names and types [VERIFIED: stripe-js elements-group.d.ts:760-802, 894-903]; Stripe: "Make sure the Elements options you provide (such as `captureMethod`, `setupFutureUsage`…) match the equivalent parameters you pass when creating and confirming the Intent" [CITED: docs.stripe.com/payments/accept-a-payment-deferred]. Key `<Elements>` by `mode+currency` to remount on change.
- Submit: `elements.submit()` → `POST /api/card-checkout/intent` → `stripe.confirmSetup({ elements, clientSecret, confirmParams:{ return_url }, redirect:'if_required' })` (or `confirmPayment` for hold-now) → on success navigate to `/book/confirmation?ref=…` (same `getPathname({locale, href})` bridge and `writePurchaseSnapshot` call as Step6Payment.tsx:121-138).
- Unticked consent checkbox directly above the button; button disabled until ticked **and** server rejects `consent !== true` with 422 `CONSENT_REQUIRED`. Label = the consent text (ICU params `{amount}`, `{holdDate}`) + link to terms. Currency selector (EUR/CZK) is kept; the amount shown is the server-confirmed one.
- Keep the existing PaymentElement `appearance` constant and `STRIPE_ELEMENTS_LOCALE` map (`lib/booking-locale.ts`). Public-side hex colours are allowed (the hex ban test scans admin roots only: `tests/admin-no-hardcoded-colors.test.ts` SCAN_ROOTS).

### Pattern 10: Consent record (HOLD-01)

`lib/payments/consent.ts`: `CARD_CONSENT_VERSION` constant; `buildConsentText(locale, { amountMinor, currency, holdAtMs, mode })` renders the catalog key `Booking.step6.cardOnFile.consentText*` server-side with `createTranslator` using the **same** pure formatters the client uses (`formatEUR/formatCZK`, `formatLocaleDate`), so server text == client text (test asserts equality for all 7 locales). Store `text_version`, `text_sha256`, `locale`, amount, planned `hold_at`, IP (`getClientIp(req)`), UA (clamped), `accepted_at`; set `confirmed_at` on `setup_intent.succeeded` / hold authorization. Content must cover (Stripe's off-session terms checklist) [CITED: docs.stripe.com/payments/save-and-reuse]: agreement to Prestigo initiating payments, timing/frequency (hold date; charge after the trip; adjustments), how the amount is determined (booked price, as changed by agreement), cancellation policy reference. Draft only — counsel review is the Phase 89 legal gate.

### Pattern 11: Customer handling for guest checkouts

SetupIntent/PM reuse requires a Customer [CITED: docs.stripe.com/payments/accept-a-payment-deferred §Create a customer]. Row-first: after `captureUnpaidBooking` returns the booking id, read `stripe_customer_id`; if null `customers.create({ email, name, phone, metadata:{ prestigoBookingId } }, { idempotencyKey: cus:<bookingId> })` and persist; if present and the email/name changed in step 5 use `customers.update` (never re-create with different params under the same key — Stripe errors on a param mismatch, idempotent_requests docs). Stay on Customers v1 (docs describe customer-configured Accounts v2 as public preview for non-Connect users [CITED: docs.stripe.com/payments/accept-a-payment-deferred]). Authenticated users: `userId` already travels in booking metadata; no cross-booking Customer reuse in Phase 88.

### Pattern 12: Admin surface (HOLD-07, D-14)

`GET /api/admin/bookings/[id]/payment` → `{ payment: {state, mode, amounts, hold_at, capture_before, last_error, recovery link present}, events: [≤100 ledger rows] }`; `POST` body `z.discriminatedUnion('action', [capture, release, retry, send_link])`. Guard order (memory `project_api_patterns`): `enforceMaxBody` → `getAdminUser` (401/403) → `await params` → zod parse (400) → load booking (404) → state/business rule (409 busy, 422 not allowed) → engine call with `actor {type:'admin', id}` recorded on the ledger. Action matrix: `capture` only when `status='completed'` and state ∈ `authorized|expired|failed|card_saved`; `release` pre-capture states (+ `waive` for `balance_due`); `retry` = place hold now (pre-completion) or re-run settle (post-completion); `send_link` re-creates the recovery link for the outstanding amount and emails the client. `PaymentPanel` is mounted next to `PaymentLinkSection`/`TripEditPanel` (BookingsTable.tsx ~2169 and ~2623) and fetches its own data so Phase 90's `BookingDetailPanel` extraction just moves it. Colours only from `var(--status-*)` / `var(--admin-*)` tokens (hex ban test). Settings: extend `settingsPatchSchema`/`GET` in `app/api/admin/settings/route.ts` and add `CardFlowSettings` beside `NoShowWaitSettings` in the settings page.

### Pattern 13: Emails (MAIL-01) — one language-aware mechanism

`lib/payments/emails/render.ts`: `renderPaymentEmail(kind, localeInput, vars)` → `{ subject, html }`; locale = `normalizeSiteLocale(booking.locale)` (null for admin-created ⇒ `en`); messages loaded lazily per locale (`import('@/messages/<locale>.json')` from a fixed map); `createTranslator({ locale, messages, namespace:'PaymentEmails' })`; HTML shell with `dir="rtl"` for `ar` (`rtlLocales`), Latin digits (`formatLocaleDate`, `Intl.NumberFormat` with `-u-nu-latn`), no non-standard named entities (memory: use UTF-8). Kinds now: `card_saved` (replaces the English `sendClientConfirmation` for card bookings — carries the trip summary + hold date), `hold_placed`, `charged`, `payment_failed` (with link). Phase 89 adds `no_show_charged`, Phase 92 quote kinds, by adding templates + catalog keys only. Operator alerts stay English (`sendPaymentOperatorAlert`). Exactly-once via ledger `email_sent` `event_key` (`email:<kind>:<bookingId>:<attempt>`).

### Pattern 14: Owner scripts, test-mode path, canary (PAYF-04, PAYF-05)

- `infra/stripe/webhook-events.mjs`: injectable Stripe client (real run: `new Stripe(process.env.STRIPE_SECRET_KEY)`, key from env or hidden prompt, never printed); lists endpoints, filters `rideprestigo.com` + `/api/webhooks/stripe`, **adds** the new events keeping existing ones, `--dry-run` prints the diff, idempotent, OK/FAIL output (precedent: root `enable-checkout-webhook-event.mjs`, `infra/chatwoot/webhook.mjs` + `tests/chatwoot-webhook-script.test.ts` fake-client test).
- `infra/qstash/payment-tick-schedule.mjs`: `new Client({ token, baseUrl: process.env.QSTASH_URL })`, `schedules.list()` (prints count vs the 10-schedule free limit), `schedules.create({ destination: '<site>/api/cron/payment-tick', cron:'*/15 * * * *', scheduleId:'prestigo-payment-tick', retries: 1 })` (re-run updates in place — `scheduleId` "can be used to update the settings of an existing schedule", client-CsM1dTnz.d.ts).
- `infra/stripe/card-flow-smoke.mjs` (**the test-mode path**): owner runs with an `sk_test_…` key; against Stripe test mode it creates a Customer, attaches `pm_card_authenticationRequiredSetupForOffSession` (off-session OK), `pm_card_authenticationRequired` / card `4000002760003184` (always authenticate ⇒ off-session hold must fail with `authentication_required`), `pm_card_authenticationRequiredChargeDeclinedInsufficientFunds` / `4000008260003178` (declines even when set up), `pm_card_chargeCustomerFail` / `4000000000000341` (attach OK, charge fails) [CITED: docs.stripe.com/testing], then runs the exact Stripe call shapes `lib/payments/*` uses (manual-capture off-session hold with idempotency key, partial `amount_to_capture`, cancel, fallback charge) and prints PASS/FAIL per scenario. It proves Stripe-side semantics without the dead `.env.local` key; the app-level end-to-end proof is the live canary.
- **Canary runbook** (owner): (1) apply migration 085 (orchestrator), merge; (2) run `webhook-events.mjs`; (3) run `payment-tick-schedule.mjs` (verify schedule count ≤ 10); (4) Admin → Settings: set `card_flow_mode='canary'`, add own email to the allowlist; (5) in the Stripe Dashboard confirm pricing plan (blended vs IC+) and MCC and, before any public use, enable Radar "Use Radar on payment methods saved for future use" [CITED: docs.stripe.com/payments/save-and-reuse]; (6) **canary A (far-out):** book a cheap route ≥ 5 days out with own real card → booking confirmed, "card saved" email, nothing charged; use the admin `retry` action to place the hold now (exercises the off-session MIT path on demand — no need to wait for `hold_at`); (7) **canary B (in-window):** book a pickup < 72 h → hold at checkout; (8) complete via driver link/admin → capture; verify ledger, email, `payment_intent_id`; (9) a second booking cancelled via the release action → no charge.

### Anti-Patterns to Avoid
- **Setting `payment_intent_id` at hold time** or reusing it for the hold: the cancel route refunds whenever it is set (cancel/route.ts:75) and a refund on an uncaptured PI fails; stats/erasure treat it as "paid". Use `hold_payment_intent_id`; set `payment_intent_id` only when money is collected.
- **`bookingId` (or `linkedBookingId`/`groupBookingIds`) in any new Stripe metadata** — routes the event into the legacy payment-link handler (route.ts:151-154).
- **Writing `payment_state` anywhere but `lib/payments/state.ts`**, or doing CAS and ledger insert as two statements.
- **Reading the feature flag in scheduler / settle / webhook code** (D-09a): the flag decides only what *new* checkouts see.
- **Per-booking delayed QStash messages for holds** (7-day cap; unrelated to pickup edits) and **putting payment work in the CRM outbox** (VPS-isolation guard).
- **Trusting any client amount** — the client sends `displayedAmountMinor` only as a cross-check (`409 PRICE_CHANGED` on mismatch); the server recomputes with the extracted compute module.
- **Copying create-payment-intent's month-based Prague offset** for the 12 h lead check or hold timing.
- **Auto-charging on a driver signal** — settle is triggered only by the completion CAS (admin or driver actor), never by driver steps before `completed`; no-show money is Phase 89.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card UI / 3DS / wallets | Custom card inputs | Stripe PaymentElement deferred intent + `confirmSetup`/`confirmPayment` | PCI scope, SCA flows, Apple/Google Pay |
| "Never charge twice" | Home-made lock table | CAS RPC claim + Stripe idempotency keys + ledger `event_key` unique | Three independent guards; each is a few lines |
| Atomic state change + audit | Two Supabase calls | `apply_payment_transition` RPC (pattern of `advance_booking_status`) | Crash between statements loses a money event |
| Claiming due work | `SELECT` then `UPDATE` | `FOR UPDATE SKIP LOCKED` function (pattern of `outbox_claim`) | Overlapping ticks (QStash + Vercel) are guaranteed |
| Scheduler | pg_cron / per-booking timers | QStash Schedule + Vercel daily cron → one endpoint | Rejected in STACK.md; DB-driven catch-up survives missed runs and pickup edits |
| Wall-clock → instant, DST | Offset arithmetic | `pickupInstantMs` (`lib/prague-date.ts`) + absolute-ms subtraction | The repo's own converter is DST-tested; create-payment-intent's month rule is wrong in transition weeks |
| Localized dates / amounts | Template strings | `formatLocaleDate`, `formatEUR/formatCZK`, `Intl` with `-u-nu-latn` | Latin-digit convention across ar/hi/zh |
| Server-side i18n | Per-locale HTML files | `createTranslator` + `PaymentEmails` namespace | One structure for Phases 88/89/92 |
| Recovery payment page | Custom 3DS recovery page | Payment Link (`restrictions.completed_sessions.limit:1`) — existing helper | Already shipped and reconciled by webhook; the hosted page handles 3DS on-session |
| Webhook signature / replay | Own HMAC | `stripe.webhooks.constructEvent` + `stripe_processed_events` | Existing |
| Cron auth | Shared-secret string compare | `timingSafeEqual` pattern from `outbox-sweep`; `Receiver` for QStash | Existing |
| Owner Stripe scripts | Ad-hoc curl | `infra/<system>/*.mjs` with injectable client + fake-client tests | Established convention |

**Key insight:** every hard part of this phase (exactly-once money, DST, scheduler catch-up, webhook replay) already has a proven in-repo pattern; the risk is in the *seams* (legacy webhook fall-through, metadata keys, idempotency semantics, edit-while-in-flight), not in new technology.

## Common Pitfalls

### Pitfall 1: Duplicate bookings / false alerts from the legacy webhook branches
**What goes wrong:** `payment_intent.succeeded` for a fallback charge, difference charge or recovery link falls into `handleOneWaySucceeded` → `saveBooking` (a second booking) or `handlePaymentLinkSucceeded` → the CR-02 "untracked capture" alert on every capture.
**Why:** the legacy chain keys on metadata presence (`groupBookingIds` → `bookingId` → round-trip → one-way, route.ts:151-159); any PI without the expected keys becomes a new booking.
**How to avoid:** dispatch by `metadata.kind` first; `card_*` events never reach the legacy chain; unknown `card_*` kinds are logged and acknowledged; never put `bookingId` in card metadata. Test: `payment_intent.succeeded` with each `card_*` kind ⇒ `saveBooking`, `reconcileBookingToConfirmed`, `sendClientConfirmation` not called; a legacy event with no `kind` still creates exactly one booking (existing `tests/webhooks-stripe.test.ts` stays green untouched).
**Warning signs:** two rows with the same `booking_reference`; `[webhook] … possible stale/duplicate payment link` in logs after a capture.

### Pitfall 2: Idempotency keys replay *errors*; keys expire at 24 h
**What goes wrong:** reusing `hold:<id>:1` after a card decline returns the same decline forever; a network-ambiguous retry with a *new* key double-holds.
**Why:** Stripe API v1 "saves the status code and body of the first request … Retries with the same key return the saved response, including 500 errors"; keys are prunable after 24 h; mismatching params under a key error [CITED: docs.stripe.com/api/idempotent_requests].
**How to avoid:** attempt numbers (`hold_attempts`, `charge_attempts`) advance only in the transition that records a definitive failure; an ambiguous failure leaves the claim in place and the sweep retries with the same key; lease older than ~20 h ⇒ search before create. Never put PII in keys (docs advice) — keys are booking UUID + purpose + integer.

### Pitfall 3: Elements options must match the server intent
**What goes wrong:** Elements initialised with `mode:'setup'` while the server decides `hold_now` (or `captureMethod` / `setupFutureUsage` mismatch) ⇒ confirm errors or wallets without the right mandate.
**How to avoid:** server returns the authoritative `mode`; `409 MODE_CHANGED` ⇒ client remounts Elements. Test both modes and the boundary.

### Pitfall 4: Cancel route ordering (WR-01) is live money once holds exist
**What goes wrong:** `cancel/route.ts:74-142` issues `refunds.create` **before** the status compare-and-set; a driver completing the trip in that window leaves a refund + a 409 (and, for a card booking, a released hold followed by a capture trigger).
**How to avoid:** CAS-first (`advanceBookingStatus … expectedFrom`) then the money action. Card bookings: after the CAS wins, `releaseHold()` (cancel PI / mark `released`, deactivate recovery link) — `authorized`→`released`, idempotent; refund only if `payment_intent_id` is set. Legacy pay-now: refund after the CAS with key `refund:<bookingId>:<leg>`; if the refund then fails return 502 `refund_failed` with `cancelled:true`, write an operator alert (Resend) and leave the booking `cancelled` (terminal) — the operator refunds in the Stripe Dashboard (Phase 89 owns a proper refund action). `tests/admin-bookings-cancel.test.ts` encodes the old order and must be rewritten, not deleted.

### Pitfall 5: A lost `after()` loses a capture
**What goes wrong:** `after()` can die on a cold function (booking-events.ts: "the event itself is best effort"). **How to avoid:** tick step C selects on the durable `completed_at IS NOT NULL` fact (migration 084 column; unique `completed` row in `booking_status_log`). Make `emitBookingCompleted` `async` (consumer awaited inside `after`), and give the routes that complete trips (`app/api/admin/bookings/route.ts`, driver progress route) a generous `export const maxDuration` if Fluid defaults prove short [ASSUMED].

### Pitfall 6: `pickup_utc` is undefined in the repo
**What goes wrong:** timing code or SQL that reads `bookings.pickup_utc` silently skips rows where it is NULL or stale after an admin pickup edit (the trip-edit payload writes `pickup_date`/`pickup_time` only, route.ts:395-399, 524-533).
**How to avoid:** compute via `pickupInstantMs({pickup_utc, pickup_date, pickup_time})`, persist `hold_at`, index on it. Wave 0: Supabase-MCP query of the live column (generated? trigger-maintained? plain?) and record the answer in the plan.

### Pitfall 7: Public SetupIntent endpoint = card-testing vector
**What goes wrong:** SetupIntents validate cards for free; Stripe notes Radar "doesn't act on the SetupIntent by default" [CITED: docs.stripe.com/payments/save-and-reuse]. **How to avoid:** canary-only now; before Phase 89 go-live enable the Radar setting, keep `/api/card-checkout/intent` at ≤ 10 req/min/IP (`LIMITS` entry), require a fully captured unpaid row (valid phone/email, future pickup), and cap unpaid card rows per IP/day. Owner checklist item.

### Pitfall 8: New public routes silently unprotected
**What goes wrong:** `checkRateLimit` returns `allowed:true, limit: Infinity` for any pathname missing from `LIMITS` (rate-limit.ts `if (!limit) return …`), and `middleware.ts` only Origin-checks listed prefixes (CSRF_PROTECTED_PREFIXES / CSRF_STRICT_ORIGIN_REQUIRED, middleware.ts:9-34). **How to avoid:** add `/api/card-checkout` to both CSRF lists (strict) and `'/api/card-checkout/intent': 10`, `'/api/card-checkout/init': 30` to `LIMITS`; a test iterates the new routes against both lists. The tick and webhook are server-to-server and must stay out of the strict list.

### Pitfall 9: Consent text drift between what the client saw and what was stored
**How to avoid:** server renders the text from the same catalog key + formatters; hash the rendered string; reject `PRICE_CHANGED`; version constant bumps whenever copy changes; test equality client-vs-server for all 7 locales (incl. `ar` RTL, Latin digits).

### Pitfall 10: `logEmail` is a 10-minute dedupe, not exactly-once
Lifecycle emails (hold placed days later, charged, failed) need ledger-keyed exactly-once (`email:<kind>:<bookingId>:<attempt>`); `logEmail`'s window (`email-log.ts`: `gte('sent_at', now − 10 min)`) would resend on a re-driven sweep an hour later.

### Pitfall 11: Round trip, daily and currency
`round_trip` creates two rows sharing one PI with per-leg pre-promo CZK amounts and `amount_eur: null` on the return leg (lib/supabase.ts:351-433, payment-link route comments); `daily` is multi-day (D-03 quote). Gate by trip type in `/init` (`transfer`, `hourly` only) until Open Question 1 is answered. CZK clients: hold/charge in `payment_currency`; admin edits must re-derive `payment_amount_minor` from the matching column.

### Pitfall 12: Edit while payment is in flight; stale recovery link
Reject trip-edit with 409 for `checkout_pending|placing_hold|capturing`; after an amount change re-create the recovery link (a Payment Link's `unit_amount` cannot change — stripe-payment-links.ts comment on CR-02).

### Pitfall 13: Webhook-before-DB races
Persist `setup_intent_id`/`hold_payment_intent_id` **before** returning the client secret / after the Stripe response and **before** any code that could emit the event; handlers locate the booking via `metadata.cofBookingId` (not by SI/PI id) so an event that beats the persist still finds its row; tick step E reconciles stalled `checkout_pending`.

### Pitfall 14: GA4/Meta purchase timing
The card flow fires the server GA4 `purchase` at setup success (booking confirmed, nothing charged yet) with the booked value; the confirmation page's client event reads the same snapshot. Decide with the owner that "purchase" = booking (consistent with today); stats treat `confirmed…completed` as revenue regardless of `payment_state` (`REVENUE_STATUSES`, booking-status.ts) — a failed hold still counts until Phase 89/90 revisits "collected vs booked".

## Code Examples

### Atomic transition wrapper (the only writer)
```typescript
// lib/payments/state.ts — shape, not final code
export async function applyTransition(args: {
  bookingId: string
  from: PaymentState[]
  to: PaymentState
  patch?: PaymentPatch                 // allow-listed keys only (zod-checked, mirrored in the RPC)
  event: { key: string; kind: LedgerKind; stripeObjectId?: string; amountMinor?: number; currency?: string; errorCode?: string; actor: LedgerActor }
}): Promise<{ applied: boolean; duplicate?: boolean; currentState?: PaymentState }> {
  if (!isLegalTransition(args.from, args.to)) throw new Error('illegal payment transition')   // TRANSITIONS table
  const { data, error } = await createSupabaseServiceClient().rpc('apply_payment_transition', {
    p_booking_id: args.bookingId, p_from: args.from, p_to: args.to,
    p_patch: args.patch ?? {}, p_event: args.event,
  })
  if (error || typeof data?.applied !== 'boolean') throw new Error('payment transition failed')
  return data
}
```

### Off-session hold (Stripe call shape; keys per Pitfall 2)
```typescript
// Source: docs.stripe.com/payments/save-and-reuse (off-session) + place-a-hold-on-a-payment-method
const pi = await stripe.paymentIntents.create({
  amount: booking.payment_amount_minor, currency: booking.payment_currency,
  customer: booking.stripe_customer_id, payment_method: booking.stripe_payment_method_id,
  payment_method_types: ['card'], capture_method: 'manual',
  off_session: true, confirm: true,
  metadata: { kind: 'card_hold', cofBookingId: booking.id, attempt: String(booking.hold_attempts), bookingReference },
  expand: ['latest_charge'],
}, { idempotencyKey: `hold:${booking.id}:${booking.hold_attempts}` })
const captureBeforeS = (pi.latest_charge as Stripe.Charge | null)?.payment_method_details?.card?.capture_before // seconds
```

### Capture with partial amount (D-17) and the difference (D-16)
```typescript
const toCapture = Math.min(due, pi.amount_capturable)
await stripe.paymentIntents.capture(pi.id, { amount_to_capture: toCapture }, { idempotencyKey: `cap:${id}:${n}` })
const diff = due - toCapture      // > 0 ⇒ separate off-session PaymentIntent kind 'card_difference', key diff:${id}:${n}
```

### Webhook dispatch gate (legacy untouched)
```typescript
// app/api/webhooks/stripe/route.ts — right after constructEvent succeeds
const handled = await dispatchPaymentEvent(event)        // lib/stripe-webhook/dispatch.ts
if (handled) return NextResponse.json({ received: true })
// …existing charge.refunded / payment_intent.succeeded / checkout.session.completed branches, unchanged…
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Create PaymentIntent on mount, `confirmPayment` | Deferred-intent Elements (`mode:'setup'|'payment'`), intent created on submit | Stripe deferred-intent flow (docs: "Collect payment details before creating an Intent") | Customer/SetupIntent only when the client commits; consent recorded at click |
| Hold ~5 days before | Lead ≤ 96 h (default 72 h) + on-session hold inside the window + capture-time fallback | Milestone research 2026-11-02 | Avoids the Visa MIT 4 d 18 h expiry |
| Extended / incremental authorization | Second off-session charge for increases | — | Extended auth is IC+/CIT-only and excludes limousines on Discover (STACK.md CF-2) |
| Stripe `automatic_delayed` capture | Not used | Private preview [CITED: place-a-hold doc] | Do not plan on it |
| Overcapture | Not used | EEA Visa excluded / IC+ (PITFALLS C4) | Difference = separate charge |

**Deprecated/outdated for this phase:** STATE.md/ROADMAP "~6-day on-session cutoff" (rejected by D-11); STATE.md "`charge.refunded` guard fixed in Phase 88" (already done in Phase 87).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MCC for the account should be 4121 (Taxicabs and Limousines) | Environment / owner checklist | Low — only affects optional extended-auth eligibility, unused here |
| A2 | `request_three_d_secure: 'any'` on the SetupIntent maximises later off-session acceptance and satisfies SC1's literal "3DS completed at checkout" (type verified, benefit not) | Pattern 9/11 | Medium — some cards then challenge unnecessarily; `'automatic'` is the safe fallback (planner may flip) |
| A3 | Hold-date wording "on or shortly after <date>" is acceptable to the owner/counsel vs D-12's "exact date" | Pattern 3 | Medium — daily-only trigger can place the hold ≤ 24 h after the shown date |
| A4 | The localized `card_saved` email replaces the English `sendClientConfirmation` for card bookings (operator alert stays English) | Pattern 13 | Medium — owner may want both; no ICS attachment exists today so nothing is lost |
| A5 | Per-booking Stripe Customer (no email dedupe) is acceptable until quotes/extras need reuse | Pattern 11 | Low — dedupe can be added later |
| A6 | Fluid-compute `after()` has enough time for settle (2–3 Stripe calls + email) on the completion routes | Pitfall 5 | Low — tick step C is the durable backstop |
| A7 | `paymentIntents.search` query syntax `metadata['cofBookingId']:'…'` works as written | Pattern 6 | Low — only used for >20 h stuck leases; `card-flow-smoke.mjs` should exercise it |
| A8 | Lead bounds 6–96 h, retry clamp (`pickup − 2 h`, skip if < 1 h after failure), replace-on-edit margin 6 h, hold sweep batch 20 are sensible defaults | Pattern 3/4 | Low — constants, not schema, except the CHECK bounds |
| A9 | Apple Pay / Google Pay work with `mode:'setup'` + `paymentMethodTypes:['card']` | Pattern 9 | Low–Medium — verify in canary on a phone; fallback is card entry |
| A10 | `card_flow_mode` CHECK `('off','canary')` (no `'on'`) is the right way to encode D-04 | Pattern 1 | Low — Claude's-discretion design; Phase 89 widens it |

## Open Questions

1. **`round_trip` (and `daily`) under D-10 / D-09**
   - Known: D-10 says "every online-paid booking from /book" but `round_trip` is two rows with one shared PI and per-leg pre-promo CZK amounts; per-leg holds need per-leg promo-adjusted amounts that do not exist today.
   - Unclear: owner intent.
   - Recommendation: Phase 88 flag covers `transfer` + `hourly`; the others stay pay-now while the flag is on (documented fallback in `/init`); add per-leg card-on-file as a follow-up plan if the owner wants it before Phase 89.

2. **Live definition of `bookings.pickup_utc`** — generated column, trigger, or plain column (not in any repo migration)? Resolve in Wave 0 via Supabase MCP (`information_schema.columns` + `pg_trigger`). Plans already avoid depending on it; the answer decides whether the edit hook must also write it.

3. **WR-01 refund-failure policy** after CAS-first (Pitfall 4): confirm "cancelled + 502 + operator alert + manual Dashboard refund" is acceptable for legacy pay-now until Phase 89's refund action.

4. **Erasure of new PII** (consent IP/UA, Stripe Customer name/email/phone): the 075 erasure function anonymises bookings in place and does not know the new tables or Stripe. Canary-only data is the owner's own, so defer to the Phase 89 legal gate — but list it as a blocking go-live item.

5. **Consent/hold-date wording and "exact date"** — daily-backstop lateness vs D-12; counsel review (Phase 89).

6. **Dashboard items only the owner can confirm**: pricing plan (blended vs IC+), MCC, Radar "payment methods saved for future use", Apple Pay domain (already live for pay-now).

7. **UI contract**: ROADMAP flags `UI hint: yes` (checkout step, payment panel, settings card). Recommend running `/gsd-ui-phase 88` before planning if a UI-SPEC is wanted; otherwise the plans should inherit the Step6Payment visual language and admin token system.

8. **Abandoned-checkout parity** — card flow captures the unpaid row at submit, not at mount; acceptable for canary, decide before public go-live.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests, `infra/*.mjs` | ✓ | v24.14.1 [VERIFIED: `node --version`] | — |
| Stripe live key | live canary, owner scripts | owner only | — | Owner-run scripts + canary (D-07); `.env.local` key is a dead placeholder and must not be read |
| Stripe test key (`sk_test`) | `card-flow-smoke.mjs` | owner provides at run time | — | Fake-Stripe unit tests cover logic; smoke covers Stripe semantics |
| Supabase MCP | applying migration 085 + live smoke | orchestrator only | — | Executors cannot apply migrations (memory) — plan an explicit `[BLOCKING]` orchestrator task |
| Upstash QStash | tick trigger (accelerator) | ✓ (token + signing keys set in Phase 81) | `@upstash/qstash` 2.10.1 | Daily Vercel cron backstop (D-08) |
| QStash Free-plan quota | 15-min schedule | documented: **1,000 messages/day, 7-day max delay, 10 active schedules**; "each retry is counted as an additional message"; schedules billed per trigger [CITED: upstash.com/docs/qstash/overall/pricing, fetched 2026-11-04] | — | Owner confirms in the Upstash console (EU region); script prints `schedules.list().length` |
| Vercel cron | backstop | ✓ (4 daily crons today) | Hobby: once/day | — |
| Resend | client emails + operator alert | ✓ (`RESEND_API_KEY`, `MANAGER_EMAIL` used by existing code) | ^6.9.4 | — |
| `CRON_SECRET` | `GET /api/cron/payment-tick` | ✓ [ASSUMED — existing crons authenticate with it] | — | Fail-closed 401 |
| Vercel CLI | owner scripts that write env | owner machine | — | — |

**Missing dependencies with no fallback:** none (all gaps have an owner-run path).
**Missing dependencies with fallback:** Stripe test key (owner supplies at script run), Supabase MCP for executors (orchestrator applies).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 (jsdom default; `// @vitest-environment node` for server/SQL-text tests), RTL for components |
| Config file | `vitest.config.ts` (alias `@`, `tests/setup.ts`, `next-intl` inlined) |
| Quick run command | `npx vitest run tests/payments-*.test.ts tests/webhooks-stripe*.test.ts` |
| Full suite command | `npx vitest run` (~90 s) + `npx tsc --noEmit` (baseline 8 errors in `tests/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAYF-01 | Migration 085 columns/CHECKs/RPCs/append-only trigger/REVOKE; `TRANSITIONS` ⇔ CHECK parity; only `state.ts` writes `payment_state` | text-level contract + gate | `npx vitest run tests/payments-migration-085.test.ts tests/payments-state.test.ts tests/payment-state-writers-gate.test.ts` | ❌ Wave 0 |
| PAYF-01 | Ledger rows idempotent by `event_key`; no PII fields | unit (fake db) | `npx vitest run tests/payments-state.test.ts` | ❌ Wave 0 |
| PAYF-03 | `card_*` kinds never create/alert via legacy chain; legacy PI still creates exactly one booking; replayed event is a no-op; unknown kind acked | route unit | `npx vitest run tests/webhooks-stripe-payments.test.ts tests/webhooks-stripe.test.ts` | ❌ new / ✅ existing |
| PAYF-03 | Refund on a completed card booking keeps status and appends `refund_observed` | route unit | same | ❌ Wave 0 (guard itself ✅ `tests/webhooks-stripe.test.ts:800-824`) |
| PAYF-04 | Webhook-events script adds only missing events, idempotent, dry-run, never prints the key; QStash schedule script create/update, prints schedule count | script + fake client | `npx vitest run tests/infra-stripe-webhook-events.test.ts tests/infra-qstash-schedule.test.ts` | ❌ Wave 0 |
| PAYF-05 | `/init` eligibility: off ⇒ false; canary ⇒ only allowlisted (case/space-normalised) email; unsupported trip types ⇒ false; settings route rejects `'on'`, lead outside 6–96, >N emails, malformed emails; settings UI | route + component | `npx vitest run tests/card-checkout-init.test.ts tests/admin-settings.test.ts tests/CardFlowSettings.test.tsx` | ❌ / ✅(extend) |
| HOLD-01 | Intent route: zod 400 vs 422 two-step, consent required, price recomputed, one unpaid row per attempt across repeated POSTs, Customer created once, consent row (version, sha256, locale, IP, UA), `PRICE_CHANGED`/`MODE_CHANGED` 409, rate limit + CSRF registration | route unit | `npx vitest run tests/card-checkout-intent.test.ts tests/middleware-csrf-forms.test.ts` | ❌ / ✅(extend) |
| HOLD-01 | Server consent text == client text for 7 locales | unit | `npx vitest run tests/payments-consent.test.ts` | ❌ Wave 0 |
| HOLD-01 | Step6CardOnFile: unticked checkbox, disabled button until ticked, exact hold date shown, `confirmSetup` called with `redirect:'if_required'`, mode remount on 409 | component | `npx vitest run tests/Step6CardOnFile.test.tsx tests/Step6Payment.test.tsx` | ❌ / ✅ untouched |
| HOLD-02 | `computeHoldAt`/`decideHoldMode`/`retryAt` incl. DST fixtures 2027-03-28 & 2027-10-31 (nonexistent 02:30, ambiguous 02:30, lead = exactly N elapsed hours) | pure unit | `npx vitest run tests/payments-timing.test.ts` | ❌ Wave 0 |
| HOLD-02 | Tick: overdue/missed runs placed once; second tick no-ops; partner never held; auth (Bearer GET / QStash POST / 401); per-step failure isolation; pickup edit moves `hold_at` | route + fake db/stripe | `npx vitest run tests/payments-tick.test.ts` | ❌ Wave 0 |
| HOLD-03 | Hold-now PI params (`capture_method:'manual'`, `setup_future_usage:'off_session'`, metadata kind); `amount_capturable_updated` confirms booking once | route + webhook | `npx vitest run tests/card-checkout-intent.test.ts tests/webhooks-stripe-payments.test.ts` | ❌ Wave 0 |
| HOLD-04 | Settle: capture amount = min(due, capturable) (D-17); hold `canceled`/`expired` (**mocked** — cannot be simulated with test cards) ⇒ fallback charge; difference charge (D-16); concurrent settle ⇒ one Stripe create; replay with same attempt ⇒ same key; completion consumer called once from `emitBookingCompleted`; sweep picks `completed_at` rows | unit (fake Stripe) | `npx vitest run tests/payments-settle.test.ts tests/booking-status-service.test.ts` | ❌ / ✅(update) |
| HOLD-05 | Decline / `authentication_required` / insufficient funds ⇒ `failed`, recovery link (kind `card_recovery`, no `bookingId`), client email in booking locale, operator email, one retry only, 24 h alert once; link paid ⇒ `captured` | unit + webhook | `npx vitest run tests/payments-failure.test.ts tests/webhooks-stripe-payments.test.ts` | ❌ Wave 0 |
| HOLD-07 | Admin payment GET/POST: guard order 401/403/400/404/409/422, action matrix per state, actor on ledger; edit hook D-16/17/18 (raise, lower, move later ⇒ release, move earlier ⇒ catch-up, busy ⇒ 409); cancel route CAS-first + card release (WR-01) | route unit | `npx vitest run tests/admin-payment-api.test.ts tests/admin-bookings-edit-payment.test.ts tests/admin-bookings-cancel.test.ts` | ❌ / ✅(rewrite) |
| HOLD-07 | PaymentPanel / badge render per state; no hard-coded colour | component + guard | `npx vitest run tests/PaymentPanel.test.tsx tests/admin-no-hardcoded-colors.test.ts` | ❌ / ✅ |
| MAIL-01 | 4 templates × 7 locales: subject/body non-empty, no unresolved `{…}`, `dir="rtl"` for `ar`, unknown/NULL locale ⇒ `en`, amounts/dates via formatters, catalog key parity across locales | unit | `npx vitest run tests/payments-emails.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/payments-*.test.ts` (+ the touched route's test file)
- **Per wave merge:** `npx vitest run tests/payments-*.test.ts tests/webhooks-stripe*.test.ts tests/admin-*.test.ts tests/booking-status*.test.ts tests/Step6*.test.tsx` + `npx tsc --noEmit` + the `verify` skill
- **Phase gate:** full `npx vitest run` green + `verify pre-pr` before `/gsd-verify-work`; live proof = owner canary (cannot be automated) and `card-flow-smoke.mjs`

### Wave 0 Gaps
- [ ] `tests/helpers/fake-stripe.ts` — in-memory Stripe: customers, setupIntents, paymentIntents with a status machine (`requires_capture`, `succeeded`, `canceled`, `requires_payment_method`), `capture` with `amount_to_capture`, `cancel`, idempotency-key store that **replays errors** and rejects param mismatch, scripted decline/`authentication_required`, `search`
- [ ] `tests/helpers/fake-payments-db.ts` — in-memory `apply_payment_transition` / `claim_due_payment_work` / ledger uniqueness semantics + minimal `from('bookings')` chain
- [ ] the 15 new test files named in the table (each created as failing stubs at plan start)
- [ ] `tests/booking-status-service.test.ts` — update the `emitBookingCompleted` assertions (`:841-856`) for the async signature
- [ ] `tests/admin-bookings-cancel.test.ts` — rewrite for CAS-first order
- [ ] Framework install: none

**Mocking the expiry branch (D-07):** `fake-stripe` exposes `expireHold(piId)` which flips a `requires_capture` PI to `canceled` with `cancellation_reason:'expired'` (and a variant `'automatic'`) and emits the `payment_intent.canceled` payload; settle/tick/webhook tests drive it. Real expiry is only observable in live mode and is covered operationally by the `capture_before` watchdog alert.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin actions, cron, QStash) | `getAdminUser()` first on every admin route; cron `Bearer CRON_SECRET` with `timingSafeEqual`, fail-closed; QStash `Receiver.verify` over the raw body |
| V3 Session Management | no new sessions | existing |
| V4 Access Control | yes | Admin-only payment actions; flag/allowlist evaluated server-side; `assertMoneyEligible` on every money entry; partner bookings never charged |
| V5 Input Validation | yes | zod two-step parse (400 shape / 422 business) on `/init`, `/intent`, admin payment POST, settings PATCH (email array bounds, lead range); `enforceMaxBody`; no client amounts trusted |
| V6 Cryptography | yes | SHA-256 consent hash via `node:crypto`; Stripe/QStash signature verification; no hand-rolled crypto; secrets only from env / hidden prompts |
| V7 Error handling & logging | yes | Ledger and logs carry ids, amounts and Stripe error codes only — no names/emails/phones/IP in logs; `last_payment_error` capped at 60 chars |
| V8 Data protection | yes | IP/UA stored only in `booking_payment_consents` (RLS deny-all, service role); retention/erasure listed as go-live blocker (Open Question 4) |
| V13 API & web service | yes | CSRF Origin check (strict) on `/api/card-checkout`, `/api/admin`; rate limits; Stripe webhook replay protection (`stripe_processed_events` + ledger `event_key`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double charge via concurrent settle / replayed webhook / overlapping ticks | Tampering | CAS claim RPC + attempt-numbered idempotency keys + ledger unique `event_key` + SKIP LOCKED claim |
| Forged webhook or tick call | Spoofing | `constructEvent` signature; QStash signature; `CRON_SECRET` timing-safe |
| Amount tampering (client price, admin edit) | Tampering | Server recompute (extracted compute module), `PRICE_CHANGED` cross-check; admin charge amounts derived from booking row, never from request body; actions have no amount field |
| Consent bypass / missing mandate | Repudiation | Server rejects `consent !== true`; hashed rendered text + version + IP/UA/time stored before Stripe confirm; `confirmed_at` set from webhook |
| Flag/allowlist probing and bypass | Information disclosure / EoP | Eligibility decided server-side; `'on'` unrepresentable in DB until Phase 89; response identical shape; rate limit; allowlist grants only the card flow (no privilege) |
| Card testing via public SetupIntent endpoint | Abuse | Radar for saved-method flows (owner Dashboard setting), tight rate limit, canary-only until go-live |
| Mass assignment on admin PATCH/RPC patch | Tampering | RPC patch allow-list read with `?` operator (pattern 084); zod strict objects |
| IDOR via client-held `attemptId` | EoP | Used only to find the caller's own unpaid row; state-gated (`unpaid` / `checkout_pending`), never mutates a confirmed booking (existing T-62-01 rule) |
| Unauthorised off-session charge by compromised admin session | EoP | Actions only capture/retry the booking's own recorded amount; every action ledger-logged with actor; operator alert email on charge failure |
| Stripe key exposure in owner scripts | Information disclosure | Env/hidden prompt only, never printed; scripts not committed with keys; pre-commit secret scan |
| PII in Stripe metadata / idempotency keys | Information disclosure | `metadata` = ids + reference only; keys = UUID + purpose + integer |

Commit prefix for security-relevant plans (card mandate, off-session charges, webhook routing, tick auth, capture trigger): `security:`.

## Recommended Plan Decomposition (tracer-first)

Owner/orchestrator-only steps are marked **[BLOCKING]** (executors have no Supabase MCP; migration must be live before dependent code deploys — 085 is additive so applying early is safe).

**Wave 0 — foundation (parallel)**
- 88-01 Test scaffolding + fake Stripe/DB helpers + failing stubs; **Wave-0 Supabase check of live `pickup_utc`** (orchestrator).
- 88-02 Migration 085 file + text-contract test + `lib/payments/state.ts` (types, `TRANSITIONS`, RPC wrapper, parity + writer-gate tests) + `lib/payments/{timing,idempotency,config}.ts` pure modules with DST fixtures. **[BLOCKING] orchestrator applies 085 + rolled-back smoke.**
- 88-03 WR-01: cancel route CAS-first (legacy pay-now) + rewritten `admin-bookings-cancel` test (card branch is added in 88-11).

**Wave 1 — tracer: owner can complete a far-out card booking (flag `canary`)**
- 88-04 Extract `lib/checkout/compute.ts` from `create-payment-intent` (behaviour-preserving, existing `tests/create-payment-intent.test.ts` is the safety net).
- 88-05 Settings: admin settings route/UI fields (lead, `card_flow_mode`, allowlist), `/api/card-checkout/init`, CSRF + rate-limit registration.
- 88-06 `/api/card-checkout/intent` (setup mode): unpaid row, Customer, SetupIntent (`usage:'off_session'`, `request_three_d_secure`), consent row, 409 guards.
- 88-07 Webhook dispatcher + `setup_intent.succeeded` handler (confirm once, `hold_at`, localized `card_saved` email, operator alert, GA4, reminder, promo claim) + `once()` helper + legacy regression.
- 88-08 `Step6Checkout` gate + `Step6CardOnFile` (setup mode) + `messages/*.json` consent/step copy in 7 locales + `PaymentEmails.card_saved` ×7 + renderer.
  *Tracer outcome:* booking confirmed, card saved, nothing charged, email in booking language, consent stored.

**Wave 2 — money engine**
- 88-09 `payment-tick` (auth, steps A/E), `placeHold`, `claim_due_payment_work`, `vercel.json` entry, `PaymentEmails.hold_placed`.
- 88-10 `settleBooking` (capture, fallback, difference), async `emitBookingCompleted` consumer, tick step C, `PaymentEmails.charged`.
- 88-11 Failure path: `handleChargeFailure`, recovery link (extend `stripe-payment-links.ts`), operator alert, retry + 24 h alerts (steps B/D), webhook events `payment_failed|canceled|amount_capturable_updated`, recovery `checkout.session.completed`, `PaymentEmails.payment_failed`.
- 88-12 On-session hold-now (`mode:'payment'`) in `/intent` + `Step6CardOnFile` + webhook confirm.
- 88-13 Edit hook (D-16/17/18) in admin PATCH + cancel-route card branch + release.

**Wave 3 — operator surface, rollout, proof**
- 88-14 Admin `GET/POST …/[id]/payment`, `PaymentPanel`, `PaymentStateBadge`, ledger view; list badge.
- 88-15 Owner scripts (`webhook-events`, `payment-tick-schedule`, `card-flow-smoke`) with fake-client tests + runbook/canary checklist (docs).
- 88-16 Security pass (`security:` commit), `verify pre-pr`, full suite, **[BLOCKING] owner runs scripts + canary A/B**, verification.

Dependencies: 02 → everything; 04 → 06; 05 → 06/08; 06 → 07/08/12; 07 → 09/10/11; 10 → 11 (shared failure helper may be created in 10 and completed in 11); 09/10/11 → 14; 12 independent of 11 after 06/07.

## Sources

### Primary (HIGH confidence)
- Stripe docs (fetched 2026-11-04): "Place a hold on a payment method" (authorization windows table, `capture_before`, expiry ⇒ `canceled`, partial capture releases the remainder, one capture only, `automatic_delayed` private preview); "Save a customer's payment method without making a payment" (SCA up-front; off-session terms checklist; `authentication_required` ⇒ on-session `confirmPayment`; Radar not applied to SetupIntents by default); "Collect payment details before creating an Intent" (deferred `mode:'setup'`, Elements-option/intent match rule, Customer required, `confirmSetup … redirect:'if_required'`); "Idempotent requests" (replay incl. 500s, 24 h prune, param-mismatch error, ≤255 chars); "Testing" (SCA/off-session cards listed in Pattern 14).
- Upstash QStash pricing page (fetched 2026-11-04): Free = 1,000 msgs/day, 7-day max delay, 10 active schedules; retries count as messages.
- Repo files read this session: `88-CONTEXT.md`, `.planning/research/{SUMMARY,ARCHITECTURE,STACK,PITFALLS}.md`, ROADMAP §88/§89, `app/api/create-payment-intent/route.ts`, `components/booking/steps/Step6Payment.tsx`, `app/api/webhooks/stripe/route.ts`, `lib/booking-status-service.ts`, `lib/booking-events.ts`, `lib/booking-status.ts`, `lib/booking-transitions.ts`, `lib/stripe-payment-links.ts`, `lib/qstash.ts`, `lib/email-log.ts`, `lib/rate-limit.ts`, `middleware.ts`, `vercel.json`, `app/api/admin/bookings/route.ts` (PATCH), `app/api/admin/bookings/cancel/route.ts`, `app/api/admin/settings/route.ts`, `app/api/cron/{outbox-sweep,reminder-2h}/route.ts`, `lib/prague-date.ts`, `lib/supabase.ts`, `lib/server-pricing.ts`, migrations 062/064/075/084, tests listed under Validation.
- SDK types read: `node_modules/stripe/types/{Charges,PaymentIntents,PaymentIntentsResource,SetupIntentsResource,Events}.d.ts`, `node_modules/@stripe/stripe-js/dist/stripe-js/elements-group.d.ts`, `node_modules/@upstash/qstash/client-*.d.ts`, `node_modules/use-intl` / `next-intl` type entries.

### Secondary (MEDIUM confidence)
- Milestone research (2026-11-02) conclusions on extended/incremental authorization, hold windows, scheduler choice [CITED: STACK.md CF-1/CF-2, PITFALLS.md C1-C4].

### Tertiary (LOW confidence / ASSUMED — see Assumptions Log)
- MCC 4121; Dashboard UI locations of pricing plan and Radar toggle; Apple Pay in setup mode; `paymentIntents.search` syntax; Fluid `after()` duration.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new; versions read from `node_modules`.
- Architecture: HIGH — every seam (webhook chain, completion event, cancel order, edit route, cron/QStash auth, settings route) read at file/line level; state machine and RPC design follow two proven in-repo patterns.
- Stripe mechanics: HIGH — official docs fetched this session; one live-only unknown (real expiry) mitigated by mock + watchdog.
- Pitfalls: HIGH for code-derived ones (1, 4, 6, 8, 10, 11); MEDIUM for legal/Dashboard items.
- Legal wording: LOW by design (Phase 89 counsel gate).

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable stack; re-check Stripe docs if the SDK is bumped or Stripe changes MIT windows)

