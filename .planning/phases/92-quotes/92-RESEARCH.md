# Phase 92: Quotes - Research

**Researched:** 2026-11-14
**Domain:** operator-built multi-trip quotes, secret-link public page, Stripe deposit that saves the card, quote-to-bookings conversion on the existing payment engine, PDF, Czech VAT on advance payments
**Confidence:** HIGH on repo facts and Stripe mechanics; MEDIUM on the PDF render path (needs a Wave 0 spike); LOW on legal / tax items (accountant and counsel must confirm)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (roadmap / prior phases, not re-asked)**
- Quote tokens are hashed 256-bit secrets with immutable versions; the public GET is side-effect free; the quote page sends no-referrer, no-store and noindex. Security work: tests, `security:` commit prefix.
- Editing a sent quote creates a new version and voids the old links (QUOTE-06).
- Quote bookings carry `payment_mode='quote'` (already allowed by migration 085), so the hold engine ignores them until the operator's remainder method applies.
- The deposit is a client-facing payment on the quote page and also saves the card (QUOTE-03).
- The server is the price authority: the client never sends an amount; the amounts are the ones stored in the quote version.
- No hard-coded prices in `app/` or `components/`; all 7 locales get real translations for client-facing strings; all times are Prague time, DST-safe.
- No new runtime dependency for the PDF unless research shows there is no other workable path (v5.0 stance).
- Stops and waiting on a quote line follow Phase 91: distance through all stops, first 15 minutes free, per-class waiting rate, and the client sees one total per line without a separate waiting amount (owner decision 2026-11-12).
- Migration numbering: 085–089 exist (two files share 089) and 090 is the zh-hant consent hotfix (`090_consent_locale_zh_hant.sql`, applied live); the quote migration is 091; the roadmap's "088" is out of date.

**Owner decisions (2026-11-14)**
- **D-01:** A quote of several days or trips is paid as a deposit plus a remainder. There is never one long hold over the whole quote and no per-day hold as the quote's own payment model. The remainder method per quote is one of: saved card (hold / capture per trip, the existing engine), payment link, cash to the driver, invoice. — **Reversibility:** costly — the booking payment state of every quote booking follows from it.
- **D-02:** A quote link has no automatic expiry by default. It stays valid until the operator cancels (voids) it. Owner's words: "до отмены оператором". The operator may set an expiry date on a quote when they want one; then the link expires at that date. — Deviates from the roadmap wording "expiring": `expired` is reached only through an operator-set date, `voided` through the operator's cancel or a new version.
- **D-03:** When the client cancels an accepted quote, the standard cancellation policy applies to the deposit (Phase 89: free cancellation up to the threshold, then the fee). The operator can set other cancellation terms on a quote ("должна быть возможность настроить другие сроки оператором"); the quote page and the PDF show the terms that apply to this quote before the client pays. — **Reversibility:** costly — the terms shown at acceptance are part of the logged acceptance.
- **D-04:** The admin suggests the price of each line from the live tariffs (route, vehicle class, stops, waiting) and the operator can overwrite any line amount by hand.

**Decided by Claude (owner may override)**
- **D-05:** A quote cannot be accepted or paid after the pickup time of its first line has passed, even without an expiry date; the page then says the quote is no longer available and shows no price data. Reason: D-02 leaves links open forever and a deposit for a trip in the past must not be taken.
- **D-06:** Custom cancellation terms on a quote are the same shape as the global policy (free-cancellation hours before the first trip and a fee percent); empty fields mean the global policy. No free-text legal terms in this phase.
- **D-07:** The deposit has no default typed into code: the operator enters a percent or a fixed amount on every quote; 0 is not allowed (a quote without a deposit is a normal booking with a payment link).
- **D-08:** Acceptance is one explicit step on the quote page (a checkbox for the terms plus the pay button); it is logged with time, IP, user agent and the quote version, and the deposit payment is tied to that version.
- **D-09:** The quote page, the PDF and the quote email use the language the operator picks for the quote (default: the client's known language, else English).
- **D-10:** Lifecycle states: draft, sent, viewed, accepted, paid, expired, voided. `viewed` is recorded by a separate POST from the page (the GET stays side-effect free).

### Claude's Discretion
- Table shapes (quotes, quote versions, quote lines, acceptance log), the token format and where the hash lives.
- How a line becomes a booking (reuse of the manual-booking insert and of `attachStops`).
- The admin UI layout of the quote builder and of the quote list.
- The PDF render path, within the no-new-runtime-dependency stance.
- Rate limiting and brute-force protection of the public quote endpoints.

### Deferred Ideas (OUT OF SCOPE)
- Automatic reminders for unanswered quotes.
- Client-side edits or counter-offers on the quote page.
- Free-text legal terms per quote.

Also out of scope (CONTEXT.md domain): the day-trip catalogue and the custom-tour request form (Phase 93; its answer reuses this phase's quote), the driver cabinet (Phase 94), automatic price refresh of an open quote, client self-editing of a quote, GNet bookings.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUOTE-01 | Operator builds a quote of several trips or days (route, date, time, vehicle, price per line) in admin | Schema (`quotes`, `quote_versions`, `quote_version_lines`, line stops), admin routes under `/api/admin/quotes`, price suggestion through the existing `/api/calculate-price` call the manual booking form already makes; see Q7 and Pattern 1 |
| QUOTE-02 | Client opens the quote by a secret link (unguessable, expiring, not indexed) and sees an itemised summary | `/[locale]/quote/[token]` modelled on the shipped `/manage/[token]` page; hash-only `quote_links`; headers, analytics exclusion, CSP-report redaction; see Q6 |
| QUOTE-03 | Deposit as percent or fixed amount; client pays on the quote page, which also saves the card | On-page PaymentElement + PaymentIntent with `setup_future_usage: 'off_session'`, new metadata kind `card_quote_deposit`, webhook route; see Q1 |
| QUOTE-04 | Remainder per quote: saved card (hold/capture per trip), payment link, cash to driver, invoice | Remainder method decides the booking's payment mode at conversion; link and invoice minimal forms; see Q1, Q2, Q3 |
| QUOTE-05 | Logged acceptance; on deposit payment each line becomes a booking linked to the quote | `quote_acceptances` (append-only), one SQL conversion function, `UNIQUE (quote_line_id)` on bookings as the exactly-once guard; see Q8 |
| QUOTE-06 | Lifecycle visible in admin; editing a sent quote creates a new version and voids the old links | `quotes.status` + `current_version_id`; links are void by derivation (link version is not the current version); see Q6, Q7 |
| QUOTE-07 | Client downloads the quote as a PDF; the quote email includes the PDF | No zero-dependency path can attach a correct PDF in all 7 languages; see Q5 for the honest matrix and the recommended path |
</phase_requirements>

## Summary

Four facts shape the plan.

(1) **The deposit happens before any booking exists**, so it cannot use the booking-keyed machinery as it is: `booking_payment_events.booking_id` and `booking_payment_consents.booking_id` are `NOT NULL`, the Stripe Customer helper is keyed on a booking id, and every card object carries `cofBookingId`. The quote therefore needs its own small money record (columns on `quotes` plus an append-only `quote_events` ledger with a unique event key), and a new Stripe metadata kind. That kind **must start with `card_`**: any `payment_intent.succeeded` without a `card_` kind falls into the legacy chain, which builds a booking from the PaymentIntent metadata.

(2) **The existing engine recognises a booking only by `payment_mode`.** `claim_due_payment_work` claims `payment_mode = 'card_hold'` only, the driver's cash step exists only for `cash_guarantee`, and about 40 code sites in 17 files branch on those two values. D-01 says the saved-card remainder runs "hold / capture per trip, the existing engine". The low-risk way to get exactly that is to create the booking in the mode the engine already knows: saved card -> `card_hold` (state `card_saved`, amount = the line's remainder), cash -> `cash_guarantee`, payment link and invoice -> `quote` (the engine ignores them). `bookings.quote_id` marks the origin in every case. This is a reading of the carried-forward line "quote bookings carry `payment_mode='quote'` ... until the operator's remainder method applies"; the literal alternative (the mode stays `quote`, every engine check is widened) is inventoried in Q1 and is much riskier. **The planner needs this confirmed first** (Owner Question 1).

(3) **Conversion must be one database transaction.** Inserting a `confirmed` booking fires the calendar, CRM and lead triggers on INSERT, and the calendar webhook reads the stops at sync time; stops written in a later request would be missed. One `SECURITY DEFINER` function that locks the quote row, inserts every booking with its stops, writes the ledger rows and flips the quote to `paid` gives atomicity, and a unique index on `bookings.quote_line_id` gives exactly-once under webhook retries.

(4) **The PDF is the one place where the zero-new-dependency stance and the requirement collide.** A print-styled page gives a perfect browser-made PDF in all 7 languages at no cost, but nothing dependency-free can produce a PDF file on the server to attach to an email with correct Arabic and Hindi shaping. The email attachment needs either headless Chromium (two packages) or an owner decision to send a link instead of a file.

**Primary recommendation:** Build `/quote/[token]` as a copy of the shipped `/manage/[token]` security posture; take the deposit with an on-page PaymentIntent (`setup_future_usage: 'off_session'`, kind `card_quote_deposit`) tied to the quote version and the acceptance row; convert in one SQL function that creates each booking in the mode matching the remainder method; keep all quote-level money in `quotes` + `quote_events`; put the PDF behind one function `renderQuotePdf()` and decide its engine in a Wave 0 spike.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Quote builder (lines, stops, deposit, terms, language) | Browser (admin UI) | API / Backend | Operator input; the server validates and stores, the version is the price authority |
| Price suggestion per line (D-04) | API / Backend (`/api/calculate-price`) | Browser (admin) | The manual booking form already calls it; the operator's typed amount is what is stored |
| Freezing a version, link minting, voiding | API / Backend | Database (immutability trigger) | Token is generated on the server, only its hash is stored |
| Public quote page | Frontend Server (SSR, `force-dynamic`) | Browser (acceptance island, PaymentElement) | GET reads only; every change is a POST |
| Deposit payment | API / Backend (PaymentIntent) | Stripe, Browser (confirm) | Amount from the version row, never from the body |
| Deposit confirmation, conversion to bookings | API / Backend (Stripe webhook + tick reconcile) | Database (one SQL function) | Exactly-once, atomic, survives a lost browser |
| Remainder: saved card / cash | Existing payment engine (`lib/payments/*`) | — | Bookings are created in modes the engine already handles |
| Remainder: payment link / invoice | API / Backend (quote module) | Stripe (link), Email | Outside the hold engine by design |
| Cancellation of an accepted quote | API / Backend (`lib/quotes/cancel.ts` over `cancelBooking`) | Stripe (refund) | One policy evaluation per quote, then per-booking release |
| PDF | API / Backend | — | Server render so the email and the download are the same document |
| Erasure of quote data | Database (erasure functions) | API (`lib/erasure-store.ts` Stripe customers) | New PII tables must be covered |

## Standard Stack

No new runtime dependency is needed for anything except the server-made PDF (Q5). [VERIFIED: package.json:15-52] `next ^16.2.3`, `stripe ^21.0.1`, `@stripe/react-stripe-js ^6.0.0`, `@stripe/stripe-js ^9.0.0`, `resend ^6.9.4`, `zod ^4.3.6`, `next-intl 4.14.2`, `vitest ^4.1.1`. There is no PDF package in `dependencies` or `devDependencies`.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe (node) | ^21.0.1 (installed) | Deposit PaymentIntent, refunds, optional remainder link | Same client, keys and classifiers as the card engine (`lib/payments/stripe.ts`) |
| @stripe/react-stripe-js + @stripe/stripe-js | ^6.0.0 / ^9.0.0 (installed) | PaymentElement on the quote page | Same deferred-intent pattern as `Step6CardOnFile.tsx` (`elements.submit()` -> POST -> `confirmPayment`) |
| zod | ^4.3.6 | Strict request schemas, 400 vs 422 two-step parse | Project pattern |
| next-intl | 4.14.2 | Quote page, consent text and emails in the quote's language | `createTranslator` + `loadMessages` already render server-side text for consents and payment emails |
| resend | ^6.9.4 | Quote email with attachment | `attachments: [{ filename, content }]` is already used for the `.ics` file [VERIFIED: lib/email.ts:1056-1061] |
| node:crypto | built-in | `randomBytes(32)`, SHA-256 of the token | Same primitives as `lib/manage-link.ts` and `lib/payments/consent.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/prague-date.ts`, `lib/payments/timing.ts` | existing | First-pickup cutoff (D-05), `computeHoldAt` for saved-card bookings | All time math on instants |
| `tests/helpers/fake-payments-db.ts`, `fake-stripe.ts` | existing | Money-path tests | Extend `TABLES` with the quote tables and the new RPC |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PaymentIntent + PaymentElement on our page | Stripe Checkout Session (hosted) | Has `customer` and `payment_intent_data.setup_future_usage`, but `expires_at` is "anywhere from 30 minutes to 24 hours after Checkout Session creation" and the hosted `locale` list has no `ar` and no `hi` [CITED: docs.stripe.com/api/checkout/sessions/create]; it also moves acceptance and payment onto two pages |
| PaymentIntent + PaymentElement | Stripe Payment Link | No `customer` parameter and no expiry parameter; a static reusable URL for one amount [CITED: docs.stripe.com/api/payment-link/create]. Not suitable for a versioned deposit |
| Own tables | Stripe Quotes / Invoicing | Rejected in the milestone research (`.planning/research/SUMMARY.md:62`: "Use our own `/quote/[token]` page and Supabase tables, not Stripe Quotes or Invoicing") |
| New `booking_source = 'quote'` | Keep `'manual'` + `lead_channel` + `quote_id` | A new source needs the CHECK, `stats_conversion` buckets and CRM mapping changed. `'manual'` works with no RPC change (see Q7) |

**Installation:** none for the core. The PDF option that needs packages is gated (see Package Legitimacy Audit and Q5).

**Version verification:** `npm view` run this session: `puppeteer-core 25.17.0` (published 2026-11-10), `@sparticuz/chromium-min 153.0.0` and `@sparticuz/chromium 153.0.0` (2026-09-11), `@react-pdf/renderer 4.9.0` (2026-08-27), `pdfkit 0.20.2` (2026-08-30), `pdf-lib 1.17.1` (2021-11-06).

## Package Legitimacy Audit

Only relevant if the owner approves the headless-Chromium PDF path (Q5). `gsd-tools query package-legitimacy check` was run this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `puppeteer-core` [WARNING: flagged as suspicious — verify before using.] | npm | latest release 4 days old (2026-11-10) | 32.6M/wk | github.com/puppeteer/puppeteer | [SUS] reason `too-new` | Flagged — planner adds `checkpoint:human-verify`; pin a release at least two weeks old |
| `@sparticuz/chromium-min` | npm | 2 months (2026-09-11) | 676k/wk | github.com/Sparticuz/chromium | [OK] | Approved, named by Vercel's guide [CITED: vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel] |
| `@sparticuz/chromium` [ASSUMED] | npm | 2 months (2026-09-11) | 4.1M/wk | github.com/Sparticuz/chromium | [OK] | Not named by an official source read this session; gate behind `checkpoint:human-verify` |
| `@react-pdf/renderer`, `pdfkit`, `pdf-lib` [ASSUMED] | npm | — | 9.4M / 17.1M / 31.7M per week | github | [OK] | Not recommended (Q5); listed because they were evaluated |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `puppeteer-core` (fresh release only; the package itself is long established). No `postinstall` script on any of the six.

## Current State (verified by reading the code this session)

### Payment modes and what recognises a booking

- The mode list: [VERIFIED: supabase/migrations/085_payment_state_card_on_file.sql:58-64] `CHECK (payment_mode IN ( 'pay_now', 'card_hold', 'cash_guarantee', 'quote', 'partner' ))`; mirrored in [VERIFIED: lib/payments/state.ts:34] `export const PAYMENT_MODES = ['pay_now', 'card_hold', 'cash_guarantee', 'quote', 'partner'] as const`.
- The hold claim: [VERIFIED: 085:476] `WHERE b.payment_mode = 'card_hold'`. Migration 087 states the filter is deliberately unchanged because it is the database guarantee that no hold is placed on a cash booking.
- `placeHold`: [VERIFIED: lib/payments/hold.ts:467] `if (booking.payment_mode !== 'card_hold') return { outcome: 'skipped', code: 'not_card_hold' }`.
- Operator actions: [VERIFIED: lib/payments/actions.ts:101] `if (mode !== 'card_hold' && mode !== 'cash_guarantee' && mode !== 'pay_now') return []` — a `quote` booking gets no payment action at all today.
- Cancel orchestrator: [VERIFIED: lib/payments/cancel.ts:343-344] `const mode = str(booking.payment_mode)` / `const isHold = mode === 'card_hold' || mode === 'cash_guarantee'`.
- Driver cash step: [VERIFIED: lib/driver-trip-step.ts:291] `if (booking.payment_mode !== 'cash_guarantee') return notAllowed`; `buildDriverCash` returns `null` for any other mode (line 348).
- `payment_state` has one writer: `lib/payments/state.ts`, enforced by `tests/payment-state-writers-gate.test.ts` (it scans `app/` and `lib/` for the three RPC names and for a `payment_state` key in a payload). The transition matrix lives in TypeScript only: [VERIFIED: lib/payments/state.ts:119] `none: ['checkout_pending'],`. The SQL function checks the target state and the compare-and-set, not the matrix.
- `bookings.payment_intent_id` means "the PaymentIntent that collected the money" and is accepted by the transition only for `captured` / `balance_due` (085:304-306). `saveBooking` upserts on [VERIFIED: lib/supabase.ts:172] `{ onConflict: 'payment_intent_id,leg', ignoreDuplicates: true }`, so several bookings cannot share one PaymentIntent id on the same leg.

### Webhook routing

- [VERIFIED: lib/stripe-webhook/dispatch.ts:107] `const isCard = kind !== null && kind.startsWith('card_')`. For `payment_intent.succeeded`: `if (!isCard) return null` (line 131), and null means the legacy chain runs.
- The legacy chain: [VERIFIED: app/api/webhooks/stripe/route.ts:180-188] `if (meta.groupBookingIds) { ... } else if (meta.bookingId) { ... } else if (isRoundTrip) { ... } else { await handleOneWaySucceeded(paymentIntent, meta) }`. `handleOneWaySucceeded` builds a booking row from the metadata (`const bookingReference = meta.bookingReference || 'UNKNOWN'`, line 663) and inserts it when no unpaid row matches.
- A `card_` kind that is not listed is acknowledged without a write: `return make('unrouted')` (line 143). A failed PaymentIntent of an unlisted kind goes to `handleHoldFailed`, which returns at once: [VERIFIED: lib/stripe-webhook/hold-events.ts:169] `if (pi.metadata?.kind !== 'card_hold') return`.
- The current kinds: [VERIFIED: lib/payments/stripe.ts:72-80] `'card_setup' | 'card_hold_now' | 'card_hold' | 'card_charge' | 'card_difference' | 'card_recovery' | 'card_fee' | 'card_extra'`.
- Event types already on the endpoint: [VERIFIED: infra/stripe/webhook-events.mjs:36-46] REQUIRED `'setup_intent.succeeded', 'setup_intent.setup_failed', 'payment_intent.amount_capturable_updated', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.dispute.created'`, KEPT `'payment_intent.succeeded', 'charge.refunded', 'checkout.session.completed'`. The deposit needs no new event type.

### The closest shipped pattern for the deposit

`createHoldNowIntent` is an on-session PaymentIntent that also saves the card: [VERIFIED: lib/payments/checkout.ts:357-373]
```typescript
const pi = await stripe.paymentIntents.create(
  {
    amount: amountMinor,
    currency,
    customer: customerId,
    payment_method_types: ['card'],
    capture_method: 'manual',
    setup_future_usage: 'off_session',
    metadata: cardMetadata('card_hold_now', { ... }),
  },
  { idempotencyKey: stripeKeys.holdNow(booking.id, consentId) },
)
```
The deposit is this call without `capture_method: 'manual'`. On the client, `Step6CardOnFile.tsx:804-809` mounts Elements with `mode: 'payment'`, `captureMethod: 'manual'`, `setupFutureUsage: 'off_session'`, `paymentMethodTypes: ['card']`, then `confirmPayment` with `redirect: 'if_required'` (lines 427-436).

### Secret-link infrastructure that already exists (Phase 89)

- Token format: [VERIFIED: lib/manage-link.ts:26] `export const MANAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/` and [VERIFIED: lib/manage-link.ts:32-34] `return randomBytes(32).toString('base64url')`. The manage token is stored raw because it is re-embedded in later emails; quote tokens must be hash-only, so a new link is minted each time one is sent.
- Page: `app/[locale]/manage/[token]/page.tsx` — localized route, `export const dynamic = 'force-dynamic'`, `robots: { index: false, follow: false }`, `referrer: 'no-referrer'`, token resolved before anything is read, one invalid view for every failure.
- Headers: [VERIFIED: next.config.ts:183-196] `source: "/manage/:path*"` and `source: "/:locale(ru|es|fr|ar|hi|zh)/manage/:path*"`, each with `{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }`. There is no `X-Robots-Tag` entry yet anywhere in `next.config.ts`.
- Analytics, cookie banner and chat are switched off on secret paths by one predicate: [VERIFIED: lib/private-link-path.ts:17] `const PRIVATE_SEGMENTS = ['admin', 'driver', 'manage'] as const`, used by seven components.
- CSP reports are redacted: [VERIFIED: lib/csp-report-redact.ts:8] `const SECRET_PATH_RE = /\/(manage|driver\/trip)\/[^/?#\s"'<>]+/gi`.
- Middleware: `/manage` is not in `isDynamicPath` ([VERIFIED: middleware.ts:224-234] `/book`, `/admin`, `/api`, `/driver`, `/login`, `/account`, `/auth`), so it gets `buildCspStatic()` and no Supabase session round trip. The nonce CSP is used only when the raw path starts with `/admin` or `/driver` (lines 351-353). `buildCspStatic()` already allows Stripe: `frame-src https://js.stripe.com https://hooks.stripe.com ...` and `connect-src 'self' https://api.stripe.com ...` (lines 128, 132).
- CSRF: [VERIFIED: middleware.ts:9-28] `CSRF_PROTECTED_PREFIXES` ends with `'/api/card-checkout'` and `'/api/manage'`; both are also in `CSRF_STRICT_ORIGIN_REQUIRED` (lines 36-44).
- Rate limits are keyed by exact pathname: [VERIFIED: lib/rate-limit.ts:21-40] for example `'/api/card-checkout/intent':   10` and `'/api/manage/cancel':          10`. A path with no entry is not limited (`if (!limit) return { allowed: true, ... }`, line 190).
- `robots.txt` has no `/manage/` rule (`public/robots.txt` lists `/api/`, `/admin/`, `/embed/`).

### Cancellation policy

- [VERIFIED: lib/cancellation-policy.ts:41-45] `km: { min: 1, max: 1000 }, hours: { min: 0, max: 72 }, percent: { min: 1, max: 100 }`. `policyFromSnapshot` returns `LEGACY_POLICY` (free up to 1 hour) for any snapshot outside these bounds (lines 89-120). The same 0..72 bound is a CHECK on `pricing_globals` (087:237-245).
- `evaluateCancellation` anchors on the booking's own pickup: `const freeUntilMs = b.pickupMs - Math.round(freeHoursFor(p, b) * HOUR_MS)` (line 76).
- `cancelBooking` sends the client email on every path through `scheduleCancelRouteEmail` (lib/payments/cancel.ts:454, 536, 565, 590, 609, 614, 632, 647) and opens a per-booking fee case on a late cancel (lines 522-566). `booking_fee_cases` is one per booking: [VERIFIED: supabase/migrations/087_cancellation_cash_fee.sql:305-306] `booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,` / `kind text NOT NULL CHECK (kind IN ('late_cancel', 'no_show')),`.

### Manual booking, pricing and stops

- [VERIFIED: app/api/admin/bookings/route.ts:905] `trip_type: z.enum(['transfer', 'hourly', 'daily']),` and [VERIFIED: route.ts:959] `channel: z.enum(['whatsapp', 'phone', 'email', 'partner', 'other']),`. The manual POST has no stops, takes `distance_km` from the admin with a haversine sanity check, and writes `booking_source: 'manual'` (line 1134).
- [VERIFIED: supabase/migrations/039_gnet_bookings.sql:17] `CHECK (booking_source IN ('online', 'manual', 'gnet'));` and [VERIFIED: 066_bookings_lead_channel.sql:29] `CHECK (lead_channel IS NULL OR lead_channel IN ('whatsapp', 'phone', 'email', 'partner', 'other'));`.
- `components/admin/ManualBookingForm.tsx:157` already fetches `/api/calculate-price` for the suggestion. The price logic of that route is inside the handler (not exported); `priceCheckout` in `lib/checkout/compute.ts` is the exported server pricing but takes the wizard's string-typed body and requires a phone.
- Stops: `saveBookingStops(bookingId, stops)` replaces all stops of a booking (lib/booking-stops.ts:38-60); `attachStops` adds them to rows for display. `booking_stops` shape: 089:28-42.
- A price edit of a card booking recomputes the amount to charge from the full booking amount: [VERIFIED: lib/payments/edit-hook.ts:66-71] `const major = num(currency === 'czk' ? row.amount_czk : row.amount_eur)` ... `const minor = Math.round(major * 100)`.

### Triggers that fire when a booking is inserted

- Calendar: [VERIFIED: 063_bookings_gcal_sync_trigger.sql:89-90] `CREATE TRIGGER bookings_gcal_sync AFTER INSERT OR UPDATE OF ...`; the function syncs when [VERIFIED: 084:310] `active constant text[] := ARRAY['confirmed','assigned','en_route','on_location','on_board','completed','no_show'];`. 089 notes that the stops are read at sync time.
- Lead outbox: [VERIFIED: 067_bookings_lead_outbox.sql:163-164] `CREATE TRIGGER bookings_lead_outbox AFTER INSERT OR UPDATE OF status ON public.bookings`; one Lead per booking id (`v_key := 'lead.booking:' || NEW.id::text || ':' || v_new`), skipped only for `NEW.leg = 'return'`.
- CRM sync: `bookings_crm_sync AFTER INSERT OR UPDATE OF ...` (069:685-691).
- Status log: `AFTER UPDATE OF status` only (084:121-125), so an insert writes no status-log row.

### Erasure

- [VERIFIED: 089_stops_landing_extra_charges.sql:195] `CREATE OR REPLACE FUNCTION public.erasure_payment_open(p_booking_ids uuid[])` and [VERIFIED: 089:224] `CREATE OR REPLACE FUNCTION public.erasure_anonymise_person(p_request_id uuid)` are the latest definitions; both are full copies of the 088 bodies with additions, and `tests/migration-089.test.ts` compares them statement by statement.
- Unconverted inbound requests are deleted by email: `DELETE FROM public.quote_leads q WHERE public.identity_normalize_email(q.email) = ANY (v_emails);` (089:404-405).
- `erasure_scope` (088:436) counts bookings, inquiries and `quote_leads`; the Stripe step reads customer ids from bookings only (`lib/erasure-store.ts:202-224`).

### Invoices

`bookings.paid_at` and `bookings.invoice_number` exist (051). They are shown on the account page and written only by the group-payment webhook (`.update({ status: 'confirmed', paid_at: paidAt })`, route.ts:519). There is no invoice template, numbering or issuing flow in the repo; invoices are made by hand outside it.

### Scheduling

[VERIFIED: vercel.json] five daily crons, including `"path": "/api/cron/payment-tick", "schedule": "0 3 * * *"`. The tick has catch-up semantics and is also driven externally. No new cron is needed if `expired` is derived at read time.

## Research Answers (the nine roadmap questions)

### Q1. Deposit that also saves the card

**Use a PaymentIntent confirmed by a PaymentElement on the quote page.** Confidence HIGH.

| Option | Ties to the version | Saves the card to our Customer | 7 locales | Verdict |
|--------|--------------------|-------------------------------|-----------|---------|
| PaymentIntent + PaymentElement | metadata on the PI itself, server-created per acceptance | yes, `customer` + `setup_future_usage` | Elements has `ar`, `ru`, `es`, `fr`, `zh`; no `hi` [CITED: docs.stripe.com/js/appendix/supported_locales] (the repo maps `hi: 'auto'`, lib/booking-locale.ts:19-27) | **Recommended** |
| Checkout Session | `client_reference_id` / metadata | yes, with `customer` | hosted Checkout has neither `ar` nor `hi` | Works, more moving parts |
| Payment Link | metadata only, static amount | attaches to a customer Checkout creates, not ours | same as Checkout | No |

Stripe documents this exact use: DATA_k7Qm2xVd_START "Charge a deposit and store the details to charge the full amount later." DATA_k7Qm2xVd_END [CITED: docs.stripe.com/payments/advanced/save-during-payment].

**Parameters** (all except the kind and the keys are the shipped hold-now call): `amount` = `quote_versions.deposit_minor`, `currency` = the version's currency, `customer`, `payment_method_types: ['card']`, `setup_future_usage: 'off_session'`, no `capture_method` (automatic capture), metadata `{ kind: 'card_quote_deposit', quoteId, versionId, acceptanceId, quoteReference }` and never `cofBookingId`, `bookingId` or `groupBookingIds`.

**Tie to the version (D-08).** The accept route inserts the `quote_acceptances` row first (version id, IP, user agent, rendered terms text and its SHA-256), then creates the PaymentIntent with that acceptance id in the metadata and stores the PaymentIntent id on the acceptance row and on `quotes.deposit_payment_intent_id`. The webhook converts only when `pi.id` equals the quote's stored deposit PaymentIntent and the metadata version is the quote's current version.

**Idempotency.**
- Stripe Customer: key `cus:quote:<quoteId>` (pattern of `stripeKeys.customer`, lib/payments/stripe.ts:48). `ensureStripeCustomer` takes a row with `id` and the contact fields, so it can be reused with the quote row, but its key and metadata name a booking; add a quote variant rather than passing a quote id as a booking id.
- PaymentIntent: key `qdep:<versionId>:<acceptanceId>`. One live deposit PaymentIntent per quote: before creating, read `quotes.deposit_payment_intent_id`; if it exists, retrieve it and reuse its client secret while it is `requires_payment_method` / `requires_confirmation` / `requires_action`, answer "already paid" for `processing` / `succeeded`, and create a new one only after `canceled`. A second tab that loses the compare-and-set on the quote row cancels its own PaymentIntent.
- Webhook: SEC-10 order through `once()` (dispatch.ts:157-183) plus the unique `quote_events (quote_id, event_key)` row `deposit_paid:<pi>`.

**Webhook handling (new, in `lib/stripe-webhook/`).** Add `card_quote_deposit` to `CardKind` and route it explicitly:
- `payment_intent.succeeded` -> new route `quote_deposit_paid` -> `applyQuoteDepositPaid(pi, actor)` (also callable by the tick with actor `system`).
- `payment_intent.payment_failed` -> a quote event with the decline code, no state change (the client retries on the page). Branch before the `handleHoldFailed` fallback, like `card_extra`.
- `payment_intent.canceled` -> quote event only.
- `charge.refunded` -> extend `observeRefund` to match `quotes.deposit_payment_intent_id` and record `deposit_refund_observed:<charge>:<amount_refunded>`; the legacy `handleChargeRefunded` finds no booking for the deposit PaymentIntent and returns (route.ts:1018-1021), which is correct as long as the deposit PaymentIntent id is never written to `bookings.payment_intent_id`.
- `charge.dispute.created` -> `handleDispute` skips bookings that are not card or cash mode; add a quote lookup for an operator alert.
- A succeeded deposit that the quote does not own (voided, superseded version, wrong PaymentIntent) is refunded automatically with key `refund:quote:<quoteId>:orphan:<pi>` and alerts the operator. Same idea as `voidUnownedHoldNow` (card-confirm.ts:298-321).

**How the remainder runs through the existing engine.** Two ways to honour "the hold engine ignores quote bookings until the remainder method applies":

*Recommended — the mode is the method.* The conversion function creates each booking directly in the mode the engine knows:

| Remainder method | `payment_mode` | `payment_state` at creation | Other columns | Engine behaviour |
|------------------|----------------|-----------------------------|---------------|------------------|
| saved card | `card_hold` | `card_saved` | `payment_amount_minor` = line remainder, `payment_currency`, `stripe_customer_id`, `stripe_payment_method_id`, `hold_at` = `computeHoldAt(pickup, leadHours)` | Unchanged: tick claims at `hold_at`, capture on completion, retry, recovery link, alerts, fee case, extras |
| cash | `cash_guarantee` | `card_saved` | `payment_amount_minor` = line remainder (what the driver collects), Stripe ids, `hold_at` NULL | Unchanged: driver cash step, operator can charge the card, no-show fee |
| payment link | `quote` | `none` | no Stripe ids on the booking | Engine ignores it; quote module collects |
| invoice | `quote` | `none` | — | Engine ignores it; operator marks paid |

What must change for this: nothing in `lib/payments/hold.ts`, `tick.ts`, `settle.ts`, `fee.ts`, `cancel.ts`, `recovery.ts` or the claim function. Needed: (a) the conversion function (Q8); (b) `TRANSITIONS` is not involved because the row is inserted in its state inside SQL, but the gate test must list the new RPC name and the TypeScript wrapper belongs in `lib/payments/state.ts`; (c) `deriveAmountMinor` in `lib/payments/edit-hook.ts` must subtract the deposit share for a quote booking (Pitfall 4); (d) a consent row per booking so the extras gate works (Q8); (e) UI: a quote chip and a link to the quote in `BookingDetailPanel`.

*Literal alternative — the mode stays `quote` on every quote booking, plus a discriminator column.* Every engine check must then accept "`card_hold` or (`quote` with remainder method saved card)". Sites found by grep this session: `claim_due_payment_work` (085:476) and its two partial indexes (085:516-523); `lib/payments/tick.ts:142, 227, 290, 358, 374, 457, 685`; `hold.ts:467, 628`; `settle.ts:104-107, 735`; `fee.ts:123-127, 146-147, 169, 603, 853`; `cancel.ts:343-344`; `edit-hook.ts:57, 170`; `recovery.ts:157`; `extra.ts:174`; `actions.ts:100-101`; `emails/policy-block.ts:36-37`; `lib/manage-view.ts:161, 202`; `lib/stripe-webhook/dispatch.ts:213`, `recovery-events.ts:415`; `app/api/webhooks/stripe/route.ts:1039`; `app/api/admin/bookings/route.ts:386, 647`; `app/api/admin/bookings/[id]/payment-link/route.ts:94`; admin components `bookingMoves.ts:39, 55`, `CancelBookingDialog.tsx:97`, `PaymentPanel.tsx:734, 792`, `TripEditPanel.tsx:359, 676`. That is about 40 sites in 17 files and one SQL function; a missed site is a silent money bug (for example a cancel that does not release the hold). The cash method would need the same treatment for every `cash_guarantee` check. Not recommended.

The original milestone architecture assumed a different saved-card model (`.planning/research/ARCHITECTURE.md:158`: materialized bookings with `payment_state='none'`, money tracked on a quote payments table, a quote-level remainder charge at a due date). D-01 replaced that with per-trip holds on the existing engine, which is why the mode question is new.

### Q2. Payment link remainder: Payment Link vs Checkout Session vs our own page

How the repo creates links today: [VERIFIED: lib/stripe-payment-links.ts:66-69] `payment_method_types: ['card'], restrictions: { completed_sessions: { limit: 1 } }, metadata, payment_intent_data: { metadata },`. The recovery link adds an idempotency key `stripeKeys.link(bookingId, tag)` and card-flow metadata (lines 118-142). The admin route refuses a legacy link for a card booking (payment-link/route.ts:94-99).

The group link cannot be reused for a quote remainder: `handleGroupPaymentSucceeded` flips only rows with `.eq('status', 'unpaid')` (route.ts:517-522) and returns when none flipped; quote bookings are already `confirmed`.

Restriction parameters, from the current API reference:

| | Payment Link | Checkout Session |
|---|---|---|
| Bind to an existing Customer | no `customer` parameter; only `customer_creation` (`always` / `if_required`) | `customer` (also prefills the saved card) |
| Expiry | none; `active: false` on update deactivates it | `expires_at`: "It can be anywhere from 30 minutes to 24 hours after Checkout Session creation. By default, this value is 24 hours from creation." |
| One payment only | `restrictions.completed_sessions.limit`: "The maximum number of checkout sessions that can be completed for the `completed_sessions` restriction to be met." | a session completes once |
| Message when dead | `inactive_message` ("The maximum length is 500 characters.") | — |
| Metadata reaches the PaymentIntent | only through `payment_intent_data.metadata` | `payment_intent_data.metadata` |
| Language | hosted Checkout list, no `ar`, no `hi` | same list |
| Amount | fixed when the link is created | fixed when the session is created |

[CITED: docs.stripe.com/api/payment-link/create, docs.stripe.com/api/checkout/sessions/create]

**Recommendation:** make "payment link" mean **the quote's own link**: the remainder email carries a freshly minted quote link, and the quote page (state `paid`) shows the outstanding remainder with the same PaymentElement flow, kind `card_quote_remainder`, amount computed on the server from the quote's bookings that are not cancelled. Reasons: nothing static to deactivate when the quote is cancelled or a trip drops out (the stale-link problem the repo has already hit, CR-02), the same page, languages and webhook family as the deposit, and the 24-hour limit of a Checkout Session does not fit "pay before the trip in two weeks".

**Fallback that matches existing code:** a Stripe Payment Link created like `createRecoveryPaymentLink` with metadata `{ kind: 'card_quote_remainder', quoteId, attempt }` on both the link and `payment_intent_data`, `restrictions: { completed_sessions: { limit: 1 } }`, `payment_method_types: ['card']`, an `inactive_message`, idempotency key `link:quote:<quoteId>:<tag>`, and `paymentLinks.update(id, { active: false })` on cancel or re-issue. Both `checkout.session.completed` and `payment_intent.succeeded` then arrive and must share one quote event key.

In both variants a paid remainder stamps `paid_at` on the quote's `quote`-mode bookings and writes a quote event; it never writes `bookings.payment_intent_id`.

### Q3. Invoice remainder, minimal form

What exists: `bookings.paid_at`, `bookings.invoice_number`, nothing else. Minimal form that is honest about that:
1. **A record:** the version stores `remainder_method = 'invoice'` plus billing details the invoice needs (company or person name, billing address, company id and VAT id when given, a free "invoice note" for a PO number), and the quote stores `invoice_requested_at`, later `invoice_number` and `invoice_paid_at`.
2. **An email** when the deposit is paid: to the operator / accounting mailbox with everything needed to issue the invoice by hand (quote reference, billing details, per-line amounts, deposit received with date, remainder), and one sentence in the client's confirmation email that the remainder will be invoiced.
3. **An admin action** "Mark invoice paid" (invoice number required) that writes `paid_at` and `invoice_number` on the quote's bookings and a quote event.

No invoice document is generated in this phase. Due date and wording of the invoice terms are owner decisions (Owner Question 6).

### Q4. VAT documents for deposits (Czech law)

**What the statute says** (consolidated text valid 2026-01-01 to 2026-12-31, read on zakonyprolidi.cz this session) [CITED: zakonyprolidi.cz/cs/2004-235]:

- § 20a(1): DATA_p3Wn8tLc_START "Povinnost přiznat daň při dodání zboží nebo poskytnutí služby vzniká ke dni uskutečnění zdanitelného plnění." DATA_p3Wn8tLc_END
- § 20a(2): DATA_h6Rz1bYq_START "Je-li před uskutečněním zdanitelného plnění přijata úplata, vzniká povinnost přiznat daň z této úplaty" DATA_h6Rz1bYq_END (the sentence continues "ke dni jejího přijetí") and DATA_v9Kd4sMe_START "To neplatí, není-li zdanitelné plnění ke dni přijetí úplaty známo dostatečně určitě." DATA_v9Kd4sMe_END
- § 28(1)(d): a tax document is issued on DATA_c2Tf7uGa_START "přijetí úplaty, pokud před uskutečněním plnění podle písmene a) nebo b) vznikla povinnost přiznat daň" DATA_c2Tf7uGa_END
- § 28(8): DATA_m5Xj0wPh_START "Daňový doklad musí být vystaven do 15 dnů ode dne, kdy vznikla povinnost přiznat daň, nebo přiznat plnění." DATA_m5Xj0wPh_END
- § 29(1)(h): the document states DATA_e8Bn3qZr_START "den uskutečnění plnění nebo den přijetí úplaty, pokud před uskutečněním plnění vznikla povinnost" DATA_e8Bn3qZr_END
- § 37a: at the supply, the tax base is the base less the bases of the payments already taxed.
- § 10a: DATA_y1Lc6vNs_START "Místem plnění při poskytnutí služby přepravy osob je místo, kde se příslušný úsek přepravy uskutečňuje." DATA_y1Lc6vNs_END
- § 70 and § 63(1)(g): passenger transport between member states and between member states and third countries is exempt with the right to deduct; DATA_g4Hp9aXt_START "Zpáteční přeprava se považuje za samostatnou přepravu." DATA_g4Hp9aXt_END

**What follows for the design (reasoning, not legal advice)** [ASSUMED]: a quote lists specific trips, so the supply is probably "known sufficiently specifically" when the deposit arrives; if the company is a VAT payer, a tax document for the received payment would be due within 15 days of the deposit, and the final document per trip would deduct it. A quote can mix domestic trips and cross-border trips, whose VAT treatment differs by section of the route, so how one deposit is split over lines matters for the document.

**Not verified, must come from the accountant** (see the owner section at the end): whether the company is a VAT payer at all (project memory records the VAT id only as assumed); the VAT rate for chauffeur transport (secondary sources say the basic rate applies to taxi-like transport in vehicles for up to 9 persons after the 2024 rate change; § 47 was not read); treatment of the foreign sections of a cross-border trip; whether the deposit document must be issued per quote or per trip; numbering series and template; what happens to the document when a deposit is refunded (corrective document); B2B reverse-charge cases.

**What the system should do in this phase:** record the deposit receipt date, amount, currency and the per-line allocation on the quote; send the accounting email of Q3 on every paid deposit (not only for the invoice method); generate no tax document automatically. The earlier milestone research reached the same conclusion (`.planning/research/PITFALLS.md:111`).

Also flagged there (PITFALLS.md:110) and still open: a quote that bundles transport with other tourist services (guides, tickets, accommodation) can fall under package-travel rules. Keep quote lines to chauffeur-driven transport only [ASSUMED; counsel].

### Q5. Quote PDF

Checked: `package.json` has no PDF library and no browser automation package. `next/og` ships inside `next` (`node_modules/next/dist/compiled/@vercel/og`, version 0.11.1) and renders JSX to PNG, not PDF.

| Path | New runtime packages | Client download | PDF file in the email | Arabic / Hindi / Chinese | Notes |
|------|---------------------|-----------------|----------------------|--------------------------|-------|
| A. Print-styled quote page, browser "Save as PDF" | 0 | yes, through the print dialog (clumsy on phones) | **no** — a server cannot run the browser; the email can only link | correct (the browser shapes text with the site's fonts) | Fully inside the stance; QUOTE-07 only half met |
| B. Headless Chromium in a Vercel function | 2 (`puppeteer-core` + `@sparticuz/chromium-min`, the pair in Vercel's guide) | yes, a real file | yes | correct when the fonts are embedded in the document | Fits the platform: Hobby has 300 s max duration, 2 GB memory, 250 MB uncompressed bundle [CITED: vercel.com/docs/functions/limitations, last updated 2026-08-24]. Cold start of a few seconds [ASSUMED] |
| C. Pure-JS PDF library (`@react-pdf/renderer`, `pdfkit`, `pdf-lib`) | 1 (plus transitive) | yes | yes | **unproven**: the official react-pdf fonts page documents TTF/WOFF registration and says nothing about right-to-left or Indic shaping [CITED: react-pdf.org/fonts]; community reports describe manual work for Arabic [ASSUMED] | A broken Arabic or Hindi PDF is worse than none. Would need a spike with real strings before it could be chosen |
| D. `next/og` image wrapped in a hand-written PDF | 0 | image-only PDF | image-only PDF | the bundled Satori build shows no HarfBuzz shaping (searched the bundle for "harfbuzz": no match) [ASSUMED] | Hand-rolled PDF container, text not selectable. Not recommended |
| E. Render service on the VPS (for example Gotenberg) or a hosted HTML-to-PDF API | 0 npm | yes | yes | correct | Couples quote sending to the VPS or sends client data to a third party; conflicts with the Phase 76 isolation guard. Not recommended |

**Honest conclusion:** no path with zero new runtime dependencies can put a PDF file with correct Arabic and Hindi into the email. Path A is the only zero-dependency path and it delivers the download half of QUOTE-07 only.

**Recommendation:** one document source and one function.
- `renderQuoteDocumentHtml(version, quote)`: a pure function that returns a self-contained HTML document in the version's language (inline CSS, `dir`, fonts as embedded `@font-face` data, every value HTML-escaped).
- `renderQuotePdf(versionId): Promise<Buffer>`: path B. JavaScript disabled in the page, all network requests blocked, `page.setContent(html)`, `page.pdf({ format: 'A4' })`.
- Render once when the version is sent and store the bytes with their SHA-256 in a deny-all table keyed by version (the version is immutable, so the email attachment, the later download and what was accepted are the same file, and erasure is a plain SQL delete). Serve the download through `POST /api/quote/pdf` with the token in the body.
- Local development and tests use the Chrome already installed on the machine through an env-configured executable path; tests mock `renderQuotePdf` and assert the HTML.
- **Wave 0 spike, with pass criteria, before any plan depends on it:** all 7 languages render with correct shaping on production behind an admin-only route (Preview deploys fail in this project, so the proof is local Chrome plus one production check); function bundle under 250 MB; cold render under about 15 s; `outputFileTracingIncludes` / `serverExternalPackages` settings recorded. If the spike fails or the owner declines the two packages, fall back to path A plus a "Download PDF" link in the email and record that QUOTE-07's "email includes the PDF" is met by a link (Owner Question 9).

Font files for the document (Inter, Fraunces, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans SC) are assets in the repo, not runtime dependencies. The site loads the same families through `next/font/google` (components/SiteChrome.tsx:1), whose hashed files cannot be referenced from a standalone document. The Simplified Chinese file is large (several MB) [ASSUMED]; load only the family the version's language needs.

### Q6. Secret link design

- **Token:** `randomBytes(32).toString('base64url')`, 43 characters, validated with the same expression as `MANAGE_TOKEN_RE` before any database call.
- **Storage:** `quote_links.token_hash` = lowercase hex SHA-256 of the token string, unique. No pepper or slow hash is needed for a 256-bit random secret; lookup is by equality on the hash. The raw token exists only in the response of the mint action and in the outgoing email.
- **Consequence of hash-only storage:** a link cannot be shown again. "Resend" and "Copy link" mint a new link row for the current version. Several live links per version are fine.
- **Immutable versions:** a version is editable while `frozen_at IS NULL` (draft) and frozen when sent. A trigger rejects UPDATE and DELETE of a frozen version and its lines; the erasure function is the one exception (transaction-local setting). Nothing ever needs to update a frozen version, because voiding is derived.
- **Voiding on edit:** "Edit sent quote" runs one function that creates draft version n+1 as a copy, sets `quotes.current_version_id` to it and the status to `draft`. Every link of version n is now dead because a link is valid only when `link.version_id = quote.current_version_id`, the quote is `sent` or `viewed` or `accepted` or `paid`, the link is not revoked, the expiry date has not passed and (for accept and pay) the first pickup is in the future (D-05). Operator cancel sets `voided`.
- **GET is read-only:** the page resolves the hash, reads, renders. No `last_used_at` write (the manage page does one; do not copy that line). Mail scanners that prefetch the link change nothing.
- **`viewed`:** `POST /api/quote/view` with `{ token }`, fired by a small client effect when the document is visible. A compare-and-set `sent -> viewed` plus a `viewed` quote event; a repeat is a no-op. Some scanners run scripts, so `viewed` stays informational and never gates money.
- **Uniform invalid answer:** malformed, unknown, revoked, voided, expired, superseded and past-first-pickup tokens all render one "no longer available" view with no price or personal data, and the API answers the same 404 body, as `/api/manage/cancel` does.
- **Headers:** add to `next.config.ts`, after the global entry, for `/quote/:path*` and `/:locale(ru|es|fr|ar|hi|zh)/quote/:path*`: `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. Keep `robots: { index: false, follow: false }` and `referrer: 'no-referrer'` in `generateMetadata`. Do **not** add `/quote/` to `robots.txt`: DATA_s0Vu5eJk_START "For the noindex rule to be effective, the page or resource must not be blocked by a robots.txt file." DATA_s0Vu5eJk_END [CITED: developers.google.com/search/docs/crawling-indexing/block-indexing]. API answers set `Cache-Control: no-store` themselves.
- **Routing:** `app/[locale]/quote/[token]/page.tsx` (so `ar`, `hi`, `zh` keep `dir` and fonts from the locale layout), `export const dynamic = 'force-dynamic'`, `params.locale` + `setRequestLocale`, service client created inside the request. The link is built with `getPathname({ locale: version.locale, href: '/quote/<token>' })` like `buildManageUrl` (lib/manage-link.ts:139-143). When the URL locale differs from the version's language, redirect to the right prefix (D-09); the invalid view renders in the URL locale.
- **Middleware:** no matcher change (no new static extension). `/quote` is a public localized route: next-intl runs, then the static CSP branch, with no Supabase session call. Stripe hosts are already in that CSP. Do not add `/quote` to the nonce branch: it is decided on the raw path, and the comment at middleware.ts:341-350 explains why locale-stripped paths must not get the nonce CSP. Add `'/api/quote'` to `CSRF_PROTECTED_PREFIXES` and `CSRF_STRICT_ORIGIN_REQUIRED`.
- **Third parties:** add `'quote'` to `PRIVATE_SEGMENTS` and to `SECRET_PATH_RE`. Use a return URL without the token for `confirmPayment` (a plain `/quote/done` page), so the token is never sent to Stripe on a redirect.
- **Rate limits** (new `LIMITS` keys, per IP per minute): `'/quote'` 30 (checked inside the page; on deny render the invalid view), `'/api/quote/view'` 20, `'/api/quote/accept'` 10 (it creates Stripe objects, same value as `/api/card-checkout/intent`), `'/api/quote/state'` 60 (polling after payment), `'/api/quote/pdf'` 10. Body caps of 2 KB like the manage routes. Guessing a 256-bit token is not a practical attack; the limits protect the database and Stripe.
- **Residual risk to record:** the token is in the URL path, so it appears in platform access logs, as the manage token does today.

### Q7. Schema proposal (migration 091)

All new tables: `ENABLE ROW LEVEL SECURITY`, `USING (false)` select policy, `WITH CHECK (false)` insert policy, `REVOKE ALL ... FROM anon, authenticated` (the 089 pattern, lines 44-55). All new functions: `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role`.

1. **`quotes`** (header, mutable): `id`, `reference` (unique, `Q-YYYYMMDD-XXXXXX`), `status` CHECK in the seven D-10 values, `current_version_id`, client first name / last name / email / phone, `lead_channel` (same CHECK as bookings), `user_id` NULL, `source_inquiry_id` NULL (Phase 93 answers a custom-tour request with a quote), `expires_at` NULL (D-02), `stripe_customer_id`, `stripe_payment_method_id`, `deposit_payment_intent_id` (unique where not null), `accepted_version_id`, `accepted_at`, `paid_at`, `voided_at`, `voided_by`, `cancelled_at`, `cancel_initiator`, `cancel_outcome`, `deposit_refunded_minor` default 0, invoice fields (`invoice_requested_at`, `invoice_number`, `invoice_paid_at`), `remainder_paid_at`, `anonymised_at`, `created_by`, timestamps.
   - D-10 has no state for "paid, then cancelled". Keep the seven-value CHECK and record cancellation in `cancelled_at`; the admin badge shows "Cancelled" when it is set.
   - `expired` is derived at read time from `expires_at` (one pure function `effectiveQuoteStatus`), so no cron is needed.
2. **`quote_versions`**: `id`, `quote_id`, `version_no`, UNIQUE (`quote_id`, `version_no`), `frozen_at`, `locale` (7 values, D-09), `currency` (`eur` / `czk`), `total_minor`, `deposit_kind` (`percent` / `fixed`), `deposit_value`, `deposit_minor` (> 0, <= total), `remainder_method` CHECK (`saved_card`, `payment_link`, `cash`, `invoice`), `cancel_free_hours` NULL, `cancel_fee_percent` NULL (D-06 inputs), `cancel_policy` jsonb + `cancel_policy_version` (the resolved terms frozen at send, so the page, the PDF and the acceptance always agree), `terms_version`, billing fields for the invoice method, `created_by`, `created_at`.
3. **`quote_version_lines`**: `id`, `version_id` (cascade), `position`, UNIQUE (`version_id`, `position`), trip fields with the same names and CHECKs as `bookings` (`trip_type` in `transfer` / `hourly` / `daily`, `pickup_date`, `pickup_time`, landing triple, addresses and coordinates, `vehicle_class`, `passengers`, `luggage`, `hours`, `return_date`, `distance_km`, `flight_number`, extras), `suggested_amount_minor`, `amount_minor` (> 0), `price_overridden`, `deposit_share_minor`, `remainder_minor`.
4. **`quote_version_line_stops`**: the `booking_stops` columns (089:28-42) with `line_id` instead of `booking_id`.
5. **`quote_links`**: `id`, `quote_id`, `version_id`, `token_hash` (unique, `^[0-9a-f]{64}$`), `created_at`, `created_by`, `revoked_at`.
6. **`quote_acceptances`** (append-only, D-08): `id`, `quote_id`, `version_id`, `link_id`, `accepted_at`, `ip` (<= 64), `user_agent` (<= 300), `locale`, `terms_version`, `terms_sha256`, `terms_rendered` (<= 4000), `deposit_minor`, `currency`, `payment_intent_id`, `confirmed_at`.
7. **`quote_events`** (append-only money and lifecycle ledger): `id`, `quote_id`, `event_key`, UNIQUE (`quote_id`, `event_key`), `kind` (named CHECK: for example `sent`, `viewed`, `accepted`, `deposit_started`, `deposit_paid`, `deposit_failed`, `deposit_refunded`, `deposit_refund_observed`, `remainder_paid`, `converted`, `voided`, `revised`, `cancelled`, `email_sent`, `alert_sent`, `admin_action`), `version_id`, `stripe_object_id`, `amount_minor`, `currency`, `actor_type`, `actor_id`, `error_code`, `created_at`. Ids, amounts and codes only, no personal data, like `booking_payment_events`.
8. **`quote_documents`** (only with PDF path B): `version_id` primary key, `pdf` bytea, `sha256`, `created_at`.
9. **`bookings`**: `quote_id uuid NULL REFERENCES quotes(id) ON DELETE RESTRICT`, `quote_line_id uuid NULL`, unique index on `quote_line_id` where not null (the exactly-once guard), `quote_deposit_minor bigint NULL` (the line's share, needed by the edit hook).
10. **Ledger kinds:** add one kind (for example `quote_deposit`) to `booking_payment_events_kind_check` (full list of 089:157-187 plus the new value) and to `LEDGER_KINDS`; `tests/payments-state.test.ts` compares the two. **Consent mode:** widen [VERIFIED: 087:271] `CHECK (mode IN ('setup', 'hold_now', 'cash_setup'))` with a quote value.
11. **Functions:** `quote_freeze_version`, `quote_start_revision`, `quote_void`, `quote_mark_viewed`, `quote_accept` (compare-and-set + acceptance row), `quote_convert_to_bookings` (Q8), immutability trigger function.
12. **Erasure** (full copies of the 089 bodies, as 089 did with 088):
    - `erasure_scope`: count the person's quotes by normalised email (and by `user_id`).
    - `erasure_payment_open`: a quote in `accepted` (a deposit may be in flight) or `paid` with a remainder still open counts as open.
    - `erasure_anonymise_person`: quotes with no bookings and no money are deleted with their versions, lines, links and events (like `quote_leads`); converted quotes are anonymised in place (client fields emptied, line addresses and stop addresses and coordinates nulled, acceptance `ip` / `user_agent` nulled, links deleted, stored PDF deleted) and keep amounts, dates and the ledger. New counters in the result.
    - `lib/erasure-store.ts` `stripeCustomerIds`: also read `quotes.stripe_customer_id`, so a customer whose bookings carry no Stripe id (link, invoice) is still deleted.
13. **Stats and dispatch RPCs:** with `booking_source = 'manual'` and the quote's `lead_channel`, quote bookings fall into the existing `stats_conversion` buckets (`'manual_' || COALESCE(t.lead_channel, 'unknown')`, 083:128-129), count as trips and revenue by `amount_eur` in `stats_trips`, and reach the board and list through `admin_search_bookings` (`SELECT b.*`). No RPC needs to change. The new columns arrive on the client for a quote chip. A new `booking_source` value would require the CHECK, the stats bucket and CRM mapping to change; not recommended.

### Q8. How a line becomes a booking

**One function, one transaction: `quote_convert_to_bookings`.** Called by `applyQuoteDepositPaid` through a wrapper in `lib/payments/state.ts`.

Inputs: quote id, version id, deposit PaymentIntent id, Stripe customer and payment method ids, and a JSON array with one entry per line position carrying only what SQL cannot compute: the booking reference (generated in TypeScript like `generateBookingReference`) and `hold_at` (from `computeHoldAt`, so the 23:30 Prague rule stays in one place). Everything else is read from the frozen version inside the function, so a caller cannot inject trip data or amounts.

Steps inside the function:
1. `SELECT ... FROM quotes WHERE id = p_quote_id FOR UPDATE`.
2. If the status is already `paid`: return the existing booking ids and `first_time = false`.
3. Require status `accepted`, `current_version_id = p_version_id`, `deposit_payment_intent_id = p_payment_intent_id`; otherwise return `{ converted: false, reason }` (the caller refunds and alerts).
4. For each line: insert the booking (`status 'confirmed'`, `booking_source 'manual'`, `lead_channel`, `booking_type 'confirmed'`, trip fields, `amount_eur` / `amount_czk` from the line amount, `locale`, `cancel_policy` / `cancel_policy_version` from the version, `quote_id`, `quote_line_id`, `quote_deposit_minor`, and the payment columns from the mode table in Q1), then its stops from `quote_version_line_stops`, then the booking ledger rows (deposit share; `hold_scheduled` for `card_hold`) and one consent row copied from the acceptance.
5. Set the quote to `paid`, `paid_at`, Stripe ids; write `deposit_paid` and `converted` quote events.
6. Return the booking ids and `first_time = true`.

**Exactly-once:** the row lock serialises concurrent deliveries; the unique index on `bookings.quote_line_id` makes a second insert impossible even if the status check were bypassed; the quote event keys make a replay a no-op.

**Side effects of the insert, with no extra code:** the calendar trigger fires per booking at commit and finds the stops (same transaction); the lead and CRM triggers fire per booking; the dispatch board and calendar show the bookings on their next read.

**After the commit, in TypeScript** (the `firstTimeEffects` / `ledgerGuardedEffects` split of card-confirm.ts:126-231): QStash reminders per booking (`scheduleQStashReminder`), one client email for the whole quote, one operator alert, the accounting email of Q3/Q4. Each is claimed by a quote event key before or after sending (the `deliverOnce` idea), so a redelivery finishes what a crash cut short and never doubles a message.

**Partial failure:**
- Handler fails before the function commits: answer 500, Stripe retries, nothing was written.
- Function commits, a later step fails: answer 500; the retry finds `first_time = false` and runs only the guarded effects.
- Webhook never arrives: a tick step reconciles quotes in `accepted` whose deposit PaymentIntent is older than about 10 minutes by retrieving it and running the same `applyQuoteDepositPaid` (the pattern of tick Step E for stale checkouts, tick.ts:129-142). The page polls `POST /api/quote/state` after `confirmPayment` and shows "confirming" until the status is `paid`.
- The insert violates a constraint (for example the landing triple): the transaction rolls back and every retry fails. Prevent it by validating a version against the same rules when it is frozen, and alert the operator when a paid deposit cannot be converted (money taken, no bookings).
- A deposit succeeds for a quote that moved on: blocked at the source by refusing "edit" and "void" while the status is `accepted` unless the PaymentIntent was cancelled first; if it still happens, the function answers `converted: false` and the handler refunds.

**Notes on reuse:** the manual booking POST cannot be called as is (no stops, own price recompute, one row). `saveBookingStops` and `attachStops` stay the TypeScript API for display and later edits; the conversion writes stops in SQL so they are in the same transaction. Bookings created this way have no `attempt_id`, no `payment_intent_id` and `leg` NULL.

**Deposit allocation:** `deposit_share_minor` per line is fixed when the version is frozen, by a pure function: proportional to the line amounts with largest-remainder rounding so the shares sum to the deposit exactly. The line remainder is `amount_minor - deposit_share_minor`; a `card_hold` or `cash_guarantee` booking needs a remainder > 0 (`payment_amount_minor > 0` CHECK), so a line with nothing left becomes a `quote`-mode booking. The allocation rule is an owner decision (Owner Question 3).

### Q9. Cancellation of an accepted quote (D-03, D-06)

**Where the terms live.** At freeze time the version stores the resolved terms: custom hours and percent when the operator set them (D-06), else the numbers of `getCancellationPolicy()` at that moment. The page, the PDF, the consent text and the acceptance row all read that snapshot. Each booking gets the snapshot in `cancel_policy` / `cancel_policy_version`, in the standard shape (`version`, `kmThreshold`, `freeHoursShort`, `freeHoursLong`, `freeHoursHourly`, `feePercent`), with the three hour fields equal when the terms are custom.

**The 72-hour trap.** `policyFromSnapshot` silently turns any snapshot with hours above 72 into the legacy policy. Tour quotes are likely to want days, not hours. Either cap custom quote hours at 72 in the builder (matches today's bounds, no code change) or give quote snapshots their own upper bound in `policyFromSnapshot` and in the admin input (a small, contained change in `lib/cancellation-policy.ts`, with tests). The second needs the owner's number (Owner Question 4).

**Quote-level cancel (new, `lib/quotes/cancel.ts`).** `cancelQuote({ quoteId, initiator, actor })`, operator-only in this phase, with the same two initiators as the booking dialog (the client asked / Prestigo cancels):
1. Evaluate once for the quote: free-until = first line's pickup instant minus the snapshot hours (D-06: "before the first trip"); under the global policy use the first line's own trip type and distance for the hours. `admin_prestigo` is always free, as today.
2. Compare-and-set on the quote (`cancelled_at`, outcome), quote event.
3. For every linked booking that is not terminal, call `cancelBooking` with a new input that suppresses the per-booking client email and the per-booking fee case, so the saved card or hold of each trip is released at no cost and the client gets one quote email instead of one per trip.
4. Deposit: **free** -> refund in full, `refunds.create({ payment_intent }, { idempotencyKey: 'refund:quote:<quoteId>:deposit' })`. **Late** -> no automatic refund; the operator sees the proposed fee (`proposedFeeMinor(depositMinor, feePercent)`, the existing helper) and confirms how much of the deposit to return through a "Refund deposit" action with an amount bounded by deposit minus already refunded. Partial refunds are supported: DATA_n7Fq2yUb_START "You can optionally refund only part of a charge. You can do so multiple times, until the entire charge has been refunded." DATA_n7Fq2yUb_END [CITED: docs.stripe.com/api/refunds/create]. Put the amount in that idempotency key, as the fee refund key does (lib/payments/stripe.ts:61-63).
5. A failed refund keeps the cancel and leaves a `refund_failed` quote event and an operator alert, the rule of D-20 in `cancel.ts`.

**Single booking of a quote cancelled through the existing dialog.** No change to `cancelBooking`: the remainder side follows the booking's mode (a `card_hold` trip releases its card or opens a fee case on the remainder; a `quote`-mode trip changes status only). The deposit is not touched; the panel says so and links to the quote, where the operator can refund part of the deposit by hand. With the recommended snapshot, a single-trip cancel measures the free window from that trip's own pickup, which differs from the quote-level rule; state this in the admin copy.

**Client self-cancel.** D-03 speaks of the client cancelling; there is no client cancel button in scope, and manage links for quote bookings would let a client cancel single trips of a quote. Recommended default: no manage token for a booking with `quote_id` in this phase (one extra condition in `isEligibleBooking`, lib/manage-link.ts:40-45), and the quote page tells the client how to cancel (contact line). Owner Question 10.

**What the fee is a percent of** is not settled by D-03 ("applies to the deposit"). The design above reads it as: after the free window the deposit is what is at stake. Owner Question 2.

## Architecture Patterns

### System Architecture Diagram

```
 OPERATOR (admin, authenticated)                         CLIENT (secret link)
 ─────────────────────────────                           ────────────────────
 Quote builder ──POST/PATCH──▶ /api/admin/quotes         email link /quote/<token>
   │  price suggestion ◀── /api/calculate-price                │ GET (reads only)
   ▼                                                           ▼
 "Send" ──▶ quote_freeze_version ──▶ mint link ──▶ render PDF ──▶ Resend email (+PDF)
              (version frozen)       (hash stored)   (stored per version)
                                                               │
                                             page visible ──POST /api/quote/view──▶ sent→viewed
                                                               │
                                tick terms + Pay ──POST /api/quote/accept──▶ acceptance row
                                                               │              + Stripe Customer
                                                               │              + PaymentIntent (deposit,
                                                               ▼                setup_future_usage)
                                                     stripe.confirmPayment (3DS in page)
                                                               │
                         Stripe ──payment_intent.succeeded (kind card_quote_deposit)──▶ webhook
                                                               │      (or tick reconcile)
                                                               ▼
                                        applyQuoteDepositPaid ──▶ quote_convert_to_bookings (1 tx)
                                           │ not owned / voided        │ per line: booking + stops
                                           ▼                           │ + ledger + consent
                                     refund + alert                    ▼
                                                    ┌──────────────────┴──────────────────┐
                                    remainder = saved card / cash          remainder = link / invoice
                                    booking is card_hold / cash_guarantee   booking is quote mode
                                                    │                                     │
                                    existing engine (tick, hold,            quote page "pay remainder"
                                    capture, cash step, fees)               or invoice record + email
                                                    │                                     │
                                                    └────────────▶ dispatch board, calendar,
                                                                   CRM lead, reminders (triggers)

 "Edit sent quote" ──▶ quote_start_revision ──▶ version n+1 draft; links of n dead by derivation
 "Cancel quote"    ──▶ void (before payment)  |  cancelQuote (after payment): policy → release
                                                 each booking → refund deposit or keep (operator)
```

### Recommended Project Structure
```
lib/quotes/
├── token.ts          # newQuoteToken, hashQuoteToken, QUOTE_TOKEN_RE, buildQuoteUrl
├── status.ts         # effectiveQuoteStatus, availability (D-05), pure
├── money.ts          # depositMinor, allocateDeposit, line remainders, pure
├── terms.ts          # resolved cancellation snapshot, consent text + sha256
├── store.ts          # reads and writes (service client created per call)
├── view.ts           # client-safe QuoteView for the page (no internal fields)
├── accept.ts         # acceptance + deposit PaymentIntent
├── convert.ts        # applyQuoteDepositPaid: guards, RPC, after-commit effects
├── remainder.ts      # link / invoice / paid marks
├── cancel.ts         # cancelQuote, refundDeposit
├── document.ts       # renderQuoteDocumentHtml (pure)
├── pdf.ts            # renderQuotePdf (engine behind one function)
└── emails.ts         # quote sent, quote confirmed, remainder due, cancelled, accounting
lib/stripe-webhook/quote-events.ts        # card_quote_deposit / card_quote_remainder handlers
app/[locale]/quote/[token]/               # page, invalid view, acceptance island
app/[locale]/quote/done/                  # tokenless return page
app/api/quote/{view,accept,state,pdf}/route.ts
app/api/admin/quotes/...                  # list, create, patch draft, send, revise, void, link,
                                          # cancel, refund-deposit, mark-invoice-paid
app/(internal)/admin/(dashboard)/quotes/  # list + builder
components/admin/quotes/                  # QuoteBuilder, QuoteList, QuoteStatusBadge, dialogs
supabase/migrations/091_quotes.sql
```

### Pattern 1: The version is the price authority
**What:** the builder may show a suggestion from `/api/calculate-price`, but the stored `amount_minor` per line is what the operator saved, and every later amount (deposit, shares, remainders, PaymentIntent, booking amounts) is computed on the server from the frozen version.
**When to use:** every money path of this phase. The accept route takes a token and cross-check values only (`displayedVersionNo`, `displayedDepositMinor`) and answers 409 when they differ from the server's.

### Pattern 2: Derived validity instead of stored revocation
**What:** a link is live when its version is the quote's current version and the quote is in a live state. Editing or cancelling changes one row (`quotes`) and every old link dies at once.
**When to use:** resolve function used by the page and by all four public routes; one function, one invalid result.

### Pattern 3: Quote-level money ledger, booking-level engine
**What:** deposit, remainder link payments and deposit refunds live in `quotes` + `quote_events`; per-trip holds and captures live where they always did. The booking ledger gets one informational row for the deposit share.
**When to use:** never write the deposit PaymentIntent id into `bookings.payment_intent_id`.

### Pattern 4: Same code for webhook and reconcile
**What:** `applyQuoteDepositPaid(pi, actor)` is called by the webhook (`WEBHOOK_ACTOR`) and by the tick (`system`), like `applySetupSucceeded`.

### Anti-Patterns to Avoid
- **A Stripe object without a `card_` kind:** the legacy chain turns it into a booking.
- **Writing bookings from the browser return:** conversion belongs to the webhook and the reconcile only.
- **A GET that records anything** (view, last used, acceptance).
- **Storing the raw token**, or logging it; putting it in a Stripe `return_url`.
- **Stops written after the booking insert in another request:** the calendar event misses them.
- **Widening the engine's mode checks one by one** (the literal alternative of Q1).
- **A static Stripe Payment Link for the deposit:** stale after an edit.
- **Reusing `booking_type = 'quote'`** (the old inbound quote request rows, `lib/supabase.ts:109`) or the `quote_leads` table for this feature: three different things already carry the word "quote".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-trip hold, capture, retry, recovery link, alerts | A quote-specific charge scheduler | Existing engine through `card_hold` bookings | Leases, idempotency keys, review fixes already in place |
| Cash to the driver with a card behind it | New driver step | `cash_guarantee` booking | Driver step, operator charge and fees exist |
| Token generation and URL building | Custom alphabet / encoding | `randomBytes(32).toString('base64url')`, `getPathname` | Same as manage links |
| Secret-path hygiene | Per-component checks | `isPrivateLinkPath`, `redactCspReport`, `next.config.ts` headers | One predicate already used by seven components |
| Consent text and hash | A new renderer | `createTranslator` + `loadMessages` + `consentSha256` (lib/payments/consent.ts) | Same text for the client and the stored record |
| Fee proposal | New percent math | `proposedFeeMinor` | Bounds 1..base already handled |
| Prague time, DST | Offsets | `pickupInstantMs`, `computeHoldAt`, `formatLocaleDateTime` | Tested on the 2027 DST dates |
| Money formatting | String templates | `formatMinor` | No typed currency symbol in `app/` or `components/` |
| Rate limiting | New limiter | `checkRateLimit` + `LIMITS` keys | Upstash sliding window exists |
| PDF container | A hand-written PDF writer | A real engine behind `renderQuotePdf`, or the print page | Fonts, shaping and pagination are not a weekend job |
| Exactly-once | In-memory flags | Unique index + row lock + event keys | Survives retries and parallel deliveries |

**Key insight:** almost everything the quote needs after the deposit already exists per booking. The phase is mostly a parent record, a public page and one careful conversion step; the more it bends the engine, the more it costs.

## Common Pitfalls

### Pitfall 1: Deposit PaymentIntent lands in the legacy chain
**What goes wrong:** a booking "UNKNOWN" is created, or an emergency alert fires, for every deposit.
**Why:** metadata without a `card_` kind (dispatch.ts:131, route.ts:186-188).
**How to avoid:** kind `card_quote_deposit`, explicit routes for succeeded / failed / canceled, a test that feeds the event through `classifyPaymentEvent`.
**Warning signs:** `payment_intent.succeeded` for a quote answered by the legacy branch in the logs.

### Pitfall 2: Deposit PaymentIntent id on a booking
**What goes wrong:** unique index conflict for the second line (`payment_intent_id, leg`), and a later deposit refund cancels trips through `handleChargeRefunded`.
**How to avoid:** the id lives on `quotes` and `quote_acceptances` only.

### Pitfall 3: Engine never picks the booking up
**What goes wrong:** a saved-card booking is created as `card_hold` but with state `none`, or without `hold_at`, Stripe ids or `payment_amount_minor`; the claim never selects it and nobody is charged.
**How to avoid:** the conversion function sets all five; a test asserts a converted saved-card line is returned by the fake `claim_due_payment_work` once `hold_at` passes. Warning sign for production: tick Step D alerts (no valid hold inside 24 h).

### Pitfall 4: Price edit charges the deposit twice
**What goes wrong:** an operator edits the price of a converted booking; `deriveAmountMinor` sets the amount to charge to the full booking amount.
**How to avoid:** subtract `quote_deposit_minor` in `deriveAmountMinor` (and the cash counterpart), or refuse price-affecting edits on bookings with `quote_id` in this phase. Pickup edits are safe (they only move `hold_at`).

### Pitfall 5: Custom cancellation hours above 72 become "free until 1 hour before"
**Why:** `POLICY_BOUNDS.hours.max` is 72 and out-of-range snapshots become the legacy policy.
**How to avoid:** Q9, decide the bound before the builder field is planned; test with 73.

### Pitfall 6: One client email and one fee case per trip on a quote cancel
**How to avoid:** the suppress inputs of Q9; test that cancelling a three-line quote sends one client email.

### Pitfall 7: Version changes between page load and payment
**What goes wrong:** the client pays an old deposit.
**How to avoid:** cross-check values in the accept body (409), edit and void refused while a deposit is in flight unless the PaymentIntent was cancelled, webhook ownership check, automatic refund of an orphan payment.

### Pitfall 8: Two payments for one deposit
**How to avoid:** one live PaymentIntent per quote (Q1), the loser of the compare-and-set cancels its own.

### Pitfall 9: Token leaks
Analytics, chat, cookie banner, CSP reports, Referer, Stripe return URL, logs. Add `quote` to the two lists, set the three headers, use a tokenless return page, never log the token. `tests/private-link-paths.test.tsx`, `tests/csp-report-redact.test.ts` and `tests/next-config-headers.test.ts` exist to extend.

### Pitfall 10: "viewed" set by a mail scanner
The GET must write nothing; the POST is informational only.

### Pitfall 11: Remainder amounts too small or zero
A line whose remainder is 0 cannot be `card_hold` (CHECK > 0); very small amounts are refused by Stripe's minimum charge [ASSUMED]. Validate at freeze: deposit and every non-zero line remainder at or above a floor.

### Pitfall 12: The saved card has no stated purpose
Stripe's guidance: DATA_w3Zt8hQo_START "Use a saved payment method for only the purpose stated in your terms." DATA_w3Zt8hQo_END and the terms must state the agreement, DATA_r6Cy1nDf_START "The anticipated timing and frequency of payments" DATA_r6Cy1nDf_END and DATA_j9Ms4kEx_START "How you determine the payment amount." DATA_j9Ms4kEx_END [CITED: docs.stripe.com/payments/advanced/save-during-payment]. The acceptance text needs one variant per remainder method, a version constant, and the extras sentence if extras are to be charged on quote trips (the extras gate reads the booking's consent version, lib/payments/consent-text.ts:38).

### Pitfall 13: Erasure misses quotes that never became bookings
`erasure_booking_ids` finds bookings only. Unconverted quotes hold names, emails, phones and addresses. Extend the three functions and the Stripe customer lookup (Q7 item 12).

### Pitfall 14: One CRM Lead per trip
A five-line quote inserts five bookings and enqueues five Leads. Decide: accept, or skip all but the first line in `enqueue_booking_lead` (one condition on a line-position column). Owner Question 11.

### Pitfall 15: Hindi on Stripe surfaces
Elements has no Hindi; the repo passes `'auto'`. Hosted Checkout has neither Arabic nor Hindi, another reason to stay on the page.

### Pitfall 16: Test and gate drift
`tests/payment-state-writers-gate.test.ts` (RPC names), `tests/payments-state.test.ts` (ledger kinds vs the latest CHECK), `tests/migration-089.test.ts`-style statement comparison for the erasure copies, `tests/i18n-completeness.test.ts` and `tests/payments-copy-i18n.test.ts` (7 locales) all need updating in the plan that touches them.

## Code Examples

### Token and hash (server only)
```typescript
// lib/quotes/token.ts — same primitives as lib/manage-link.ts:26-34 and lib/payments/consent.ts:63-65
import { createHash, randomBytes } from 'node:crypto'

export const QUOTE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
export function newQuoteToken(): string {
  return randomBytes(32).toString('base64url')
}
/** Lowercase hex SHA-256; the only form that is stored. */
export function hashQuoteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
```

### Deposit PaymentIntent (the hold-now call without manual capture)
```typescript
// lib/quotes/accept.ts — parameters as in lib/payments/checkout.ts:357-373
// 'card_quote_deposit' and the 'qdep:' key are new in this phase.
const pi = await getPaymentsStripe().paymentIntents.create(
  {
    amount: version.deposit_minor,          // from the frozen version, never from the body
    currency: version.currency,             // 'eur' | 'czk'
    customer: customerId,
    payment_method_types: ['card'],
    setup_future_usage: 'off_session',
    metadata: {
      kind: 'card_quote_deposit',
      quoteId: quote.id,
      versionId: version.id,
      acceptanceId,
      quoteReference: quote.reference,
    },
  },
  { idempotencyKey: `qdep:${version.id}:${acceptanceId}` },
)
```

### Webhook classification additions
```typescript
// lib/stripe-webhook/dispatch.ts — before the existing card kinds
case 'payment_intent.succeeded':
  if (!isCard) return null
  if (kind === 'card_quote_deposit') return make('quote_deposit_paid')      // new route
  if (kind === 'card_quote_remainder') return make('quote_remainder_paid')  // new route
  // ...existing branches unchanged

// handlePaymentFailed: quote kinds must not reach the hold handler
if (kind === 'card_quote_deposit' || kind === 'card_quote_remainder') return handleQuotePaymentFailed(event)
```

### Deposit allocation (pure)
```typescript
// lib/quotes/money.ts — shares sum to the deposit exactly; each share <= its line amount
export function allocateDeposit(lineAmounts: readonly number[], depositMinor: number): number[] {
  const total = lineAmounts.reduce((a, b) => a + b, 0)
  const exact = lineAmounts.map((amount) => (amount * depositMinor) / total)
  const shares = exact.map(Math.floor)
  let left = depositMinor - shares.reduce((a, b) => a + b, 0)
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (left === 0) break
    if (shares[index] < lineAmounts[index]) { shares[index] += 1; left -= 1 }
  }
  return shares
}
```

### Headers
```typescript
// next.config.ts — after the global entry, next to the /manage entries (lines 183-196)
const quoteHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
]
{ source: '/quote/:path*', headers: quoteHeaders },
{ source: '/:locale(ru|es|fr|ar|hi|zh)/quote/:path*', headers: quoteHeaders },
```

### Conversion function, skeleton
```sql
-- 091: one transaction; the caller passes references and hold instants only
CREATE OR REPLACE FUNCTION public.quote_convert_to_bookings(
  p_quote_id uuid, p_version_id uuid, p_payment_intent_id text,
  p_customer_id text, p_payment_method_id text, p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- 1. SELECT ... FROM public.quotes q WHERE q.id = p_quote_id FOR UPDATE
  -- 2. status 'paid'     -> return existing booking ids, first_time false
  -- 3. status 'accepted' AND current_version_id = p_version_id
  --    AND deposit_payment_intent_id = p_payment_intent_id, else converted false
  -- 4. per line: INSERT bookings (...), INSERT booking_stops (...),
  --    INSERT booking_payment_events (...), INSERT booking_payment_consents (...)
  --    payment_mode: saved_card -> 'card_hold', cash -> 'cash_guarantee', else 'quote'
  -- 5. UPDATE quotes SET status = 'paid', ...; INSERT quote_events (...)
  RETURN jsonb_build_object('converted', true, 'first_time', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_convert_to_bookings(uuid, uuid, text, text, text, jsonb)
  TO service_role;
```

## Migration plan (next free number is 091)

[VERIFIED: `ls supabase/migrations` — last files `089_admin_search_bookings_hide_cancelled.sql` and `089_stops_landing_extra_charges.sql`; no `09x` migration exists on any local or remote ref or worktree, checked with `git ls-tree` this session.] Re-check at write time. The migration is applied live by the orchestrator through the Supabase MCP before code that reads the new columns ships; executors have no database access.

`091_quotes.sql`, all additive: the eight tables of Q7, three `bookings` columns and the unique index, the widened ledger-kind and consent-mode CHECKs, the quote functions and the immutability trigger, full-copy replacements of `erasure_scope`, `erasure_payment_open` and `erasure_anonymise_person`, grants. Additive for old code: new tables are deny-all, new columns are nullable, widened CHECKs only add values.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Milestone sketch: quote bookings in `payment_state='none'`, remainder charged at quote level | Per-trip hold / capture on the existing engine for the saved-card method | D-01, 2026-11-14 | Bookings must be recognisable by the engine (Q1) |
| Milestone sketch: fresh Checkout Session per deposit attempt | PaymentIntent + PaymentElement on the quote page | this research | Reuses the Phase 88 hold-now pattern; Arabic supported; acceptance and payment in one step |
| Roadmap: link "expiring" | Valid until voided; optional operator expiry; hard stop at first pickup | D-02, D-05 | `expired` is derived, no cron |
| Raw manage token in a table | Hash-only quote links, new link per send | roadmap | No "show link again" |
| Invoice PDFs made by hand with local Chrome | Same engine idea on the server for the quote PDF, if approved | this research | Two packages or a link instead of a file |

**Deprecated / outdated:** roadmap "Expected migration 088" (it is 091); `.planning/research/ARCHITECTURE.md` quote schema (`public_token` stored raw, `quote_items`, `quote_payments`) is superseded by the hashed-link, versioned shape here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Creating saved-card quote bookings as `card_hold` (and cash as `cash_guarantee`) satisfies the carried-forward "`payment_mode='quote'`" line | Summary, Q1 | If the lock is meant literally, the engine needs about 40 edits; plan scope changes a lot |
| A2 | After the free window the fee is taken from the deposit (base = deposit), and nothing beyond it is charged automatically | Q9 | Wrong money outcome on late cancels; consent wording wrong |
| A3 | Proportional allocation of the deposit over lines | Q8 | Per-trip hold amounts and tax document split differ from what the owner wants |
| A4 | The deposit makes the supply "known sufficiently specifically", so a tax document is due within 15 days if the company is a VAT payer | Q4 | Missing or unnecessary documents; accountant decides |
| A5 | Headless Chromium on Vercel renders the 7 languages correctly with embedded fonts and starts in a few seconds | Q5 | PDF plan fails late; mitigated by the Wave 0 spike |
| A6 | Pure-JS PDF libraries and the bundled `next/og` cannot be trusted for Arabic and Hindi | Q5 | A cheaper path was dismissed; a spike could reopen it |
| A7 | One Lead per trip in the CRM is acceptable, or a one-line trigger change is wanted | Pitfall 14 | CRM noise |
| A8 | Operator-only cancellation of an accepted quote and no manage links for quote bookings | Q9 | Client expects a self-service cancel |
| A9 | `booking_source = 'manual'` with the quote's `lead_channel` is the right classification for stats | Q7 | Stats show quotes inside manual channels; a separate bucket would need RPC changes |
| A10 | Stripe refuses very small charges, so a floor on deposit and remainders is needed | Pitfall 11 | Harmless if wrong (a stricter validation than necessary) |
| A11 | Next.js already sends a no-store cache header for a `force-dynamic` page, and the `next.config.ts` entry is kept for parity with `/manage` | Q6 | If not, the config entry is the only source; the header test must cover it |
| A12 | Extra charges after a trip should be possible on quote trips, so the quote consent includes the extras sentence | Pitfall 12 | Operator cannot bill waiting on a quote trip |
| A13 | Font file sizes and licences (Noto families, Inter, Fraunces under OFL) allow bundling for the PDF | Q5 | Bundle size or licence check needed |

## Open Questions (technical, for the planner)

1. **Where the suggestion comes from on the server.** The price logic of `/api/calculate-price` is inside the route handler. Recommendation: keep the builder calling the route (as `ManualBookingForm` does), store the returned suggestion as display data only, and treat the operator's amount as the authority. Extracting a shared function is optional and a refactor risk. — **Resolved: D-04** (server suggestion per line, operator override; plan 92-08).
2. **Remainder link form.** Quote page payment (recommended) or a Stripe Payment Link (fallback); the choice changes one plan, not the schema. — **Resolved: D-16** (quote page; plan 92-23).
3. **Paid confirmation email.** One localized email for the whole quote through the `lib/payments/emails/render.ts` shell, or the English `lib/email.ts` builders. Recommendation: localized, new `QuoteEmails` namespace, the shell pieces that module exports. — **Resolved: D-09** (quote language) with the plan check's W1: 92-13 exports the per-locale pieces of render.ts and the quote shell reuses them; copy in 92-29.
4. **PDF storage.** bytea in a deny-all table (recommended) or re-render on demand. — **Resolved: D-14** (stored per frozen version in quote_documents; plans 92-01, 92-20).
5. **Reconcile placement.** A new step in `runPaymentTick` (recommended, same schedule) or a separate cron route. — **Resolved: D-18** (a reconcile covers a lost webhook: tick step Q, plan 92-31).
6. **Admin UI contract.** The phase has a UI hint; a UI-SPEC pass before planning the builder and the public page is advisable (the manage page still uses the old anthracite / copper variables, while the brand is navy). — **Resolved: Claude's Discretion** in 92-CONTEXT.md (admin UI layout); no UI-SPEC pass, plans 92-14 / 92-15 / 92-19 / 92-25 / 92-26 follow the admin theme variables.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | v24.14.1 | — |
| Vitest | tests | yes | ^4.1.1 | — |
| Google Chrome (local) | PDF spike and local render | yes | installed in /Applications | — |
| Stripe live key | deposit proof | no (the local test key is a dead placeholder; no Stripe access in this session) | — | `fake-stripe` in tests; live proof by a script the owner runs |
| Supabase MCP | apply migration 091 | orchestrator only | — | orchestrator applies and smokes |
| Vercel Preview | PDF spike on the platform | no (Preview deploys fail in this project) | — | local Chrome plus one production check behind an admin-only route |
| Context7 | library docs | no (needs authorization) | — | official docs fetched directly |
| Upstash Redis | rate limits | assumed present in production (existing limiter) | — | in-memory fallback, fail-open |

**Missing dependencies with no fallback:** none for planning.
**Missing dependencies with fallback:** live Stripe proof (owner-run), platform PDF proof (production check).

## Validation Architecture

(`workflow.nyquist_validation` is not set to false in `.planning/config.json`, so this section is included.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 (jsdom default, `// @vitest-environment node` for server tests), `globals: true`, setup `./tests/setup.ts` [VERIFIED: vitest.config.ts] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npx vitest run` (~90 s, about 430 entries in `tests/`) |
| Conventions | `vi.hoisted` before `vi.mock`; money tests on `tests/helpers/fake-payments-db.ts` + `fake-stripe.ts`; migration text tests on `tests/helpers/latest-migration.ts`; `vitest related` crashes here, grep `tests/` instead |
| Baseline | `npx tsc --noEmit`: 8 old errors in `tests/` only; `npx eslint --quiet <files>`: `<a>` -> `<Link>` in both `not-found.tsx` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUOTE-01 | Builder routes: guard order 401/403, 400 vs 422, body cap; draft create / patch; line and stop validation (max stops, wait steps, landing triple); deposit percent / fixed, 0 refused | route | `npx vitest run tests/admin-quotes.test.ts` | no, Wave 0 |
| QUOTE-01 | `depositMinor`, `allocateDeposit` (sums exactly, never above a line, ties by position), floors | unit | `npx vitest run tests/quotes-money.test.ts` | no, Wave 0 |
| QUOTE-02 | Token format, hash, resolve: malformed (no DB call), unknown, revoked, superseded version, voided, expired, past first pickup all give the same null; valid gives the view | unit | `npx vitest run tests/quotes-token.test.ts tests/quotes-status.test.ts` | no, Wave 0 |
| QUOTE-02 | Page: GET performs no write (fake DB write counter 0), invalid view has no price or name, locale redirect, `robots` and `referrer` metadata | component | `npx vitest run tests/quote-page.test.tsx` | no, Wave 0 |
| QUOTE-02 | Headers for `/quote` and the six locale prefixes; `isPrivateLinkPath('/ru/quote/x')`; CSP report redaction; CSRF prefix; rate-limit keys | unit | `npx vitest run tests/next-config-headers.test.ts tests/private-link-paths.test.tsx tests/csp-report-redact.test.ts tests/middleware-csrf-forms.test.ts tests/rate-limit.test.ts` | yes (extend) |
| QUOTE-03 | Accept: amount from the version (a body amount is ignored / 400 by strict schema), 409 on version or amount mismatch, acceptance row before Stripe, one live PaymentIntent, kind and metadata, no `cofBookingId`, past first pickup refused (D-05), DST dates | route + engine | `npx vitest run tests/quote-accept.test.ts` | no, Wave 0 |
| QUOTE-03 | Webhook: `card_quote_deposit` classified and never reaches the legacy chain; failed is not `handleHoldFailed`; replay is a no-op; unowned payment is refunded | unit | `npx vitest run tests/quote-webhook.test.ts` | no, Wave 0 |
| QUOTE-04 | Mode table: saved card -> `card_hold` + `card_saved` + `hold_at` + amount = remainder and is claimed by the fake claim; cash -> `cash_guarantee`; link / invoice -> `quote`, never claimed | engine | `npx vitest run tests/quote-convert.test.ts` | no, Wave 0 |
| QUOTE-04 | Remainder paid on the page / by link stamps `paid_at`, one event for two Stripe events; invoice mark-paid action | route | `npx vitest run tests/quote-remainder.test.ts` | no, Wave 0 |
| QUOTE-05 | Conversion exactly once under a double delivery; stops copied; consent row per booking; deposit PaymentIntent never on a booking; partial failure after commit finishes on retry without a second email | engine | `npx vitest run tests/quote-convert.test.ts` | no, Wave 0 |
| QUOTE-05 | Migration text: tables deny-all, REVOKEs, function grants, unique index on `quote_line_id`, erasure bodies keep every 089 statement | text | `npx vitest run tests/migration-091.test.ts` | no, Wave 0 |
| QUOTE-06 | Freeze makes the version immutable; revise creates n+1 and old links resolve to null; void; edit refused while a deposit is in flight; lifecycle badge function | unit + route | `npx vitest run tests/quotes-versions.test.ts` | no, Wave 0 |
| QUOTE-07 | Document HTML per locale: `dir` for Arabic, every user value escaped, one total per line and no waiting amount, terms shown; the email carries the attachment when the renderer returns bytes and a link when it is unavailable | unit | `npx vitest run tests/quote-document.test.ts tests/quote-emails.test.ts` | no, Wave 0 |
| D-03 / D-06 | `cancelQuote`: free -> full refund with the fixed key; late -> no refund, proposed fee from the deposit; `admin_prestigo` always free; one client email for N bookings; hours 72 / 73 boundary; refund failure keeps the cancel | engine | `npx vitest run tests/quote-cancel.test.ts` | no, Wave 0 |
| Engine safety | Edit hook subtracts the deposit share; ledger kinds parity; single-writer gate with the new RPC name | unit / text | `npx vitest run tests/admin-bookings-edit-payment.test.ts tests/payments-engine-gates.test.ts tests/payments-state.test.ts tests/payment-state-writers-gate.test.ts` | yes (extend) |
| Erasure | Unconverted quote deleted, converted quote anonymised, Stripe customer of a quote included | unit / text | `npx vitest run tests/erasure-payment-pii.test.ts tests/erasure.test.ts` | yes (extend) |
| i18n | New `Quote`, `QuoteEmails`, `QuotePdf` keys in all 7 locales, no stubs | text | `npx vitest run tests/i18n-completeness.test.ts tests/payments-copy-i18n.test.ts` | yes |

### Sampling Rate
- **Per task commit:** the new or updated test files of that task plus `npx tsc --noEmit` filtered to changed files.
- **Per wave merge:** the wave's grouped commands plus `tests/payment-state-writers-gate.test.ts`, `tests/payments-state.test.ts`, `tests/i18n-completeness.test.ts`.
- **Phase gate:** full `npx vitest run` and the `verify` skill in `pre-pr` mode green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/helpers/fake-payments-db.ts`: add the quote tables to `TABLES` (lines 95-107) and emulate `quote_convert_to_bookings`, the freeze / revise / void functions and the `quote_line_id` unique rule in `rpc()` (line 522).
- [ ] Pure-module tests written RED first: `tests/quotes-money.test.ts`, `tests/quotes-token.test.ts`, `tests/quotes-status.test.ts`.
- [ ] `tests/migration-091.test.ts` on `latest-migration.ts`.
- [ ] A `renderQuotePdf` mock helper so no test launches a browser.
- [ ] PDF spike result recorded (pass criteria of Q5) before the PDF plan is written.
- [ ] Framework install: none.

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section is included. The roadmap marks the phase security-relevant: tests first, then commits with the `security:` prefix for token, public-route, payment and validation work.

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Admin routes: `getAdminUser()` first (401 / 403). Public routes: the 256-bit token is the only credential, sent in the body for POSTs |
| V3 Session Management | no change | No session on the quote page; the public branch makes no Supabase session call |
| V4 Access Control | yes | Deny-all RLS and REVOKEs on every new table; SECURITY DEFINER functions revoked from PUBLIC, anon, authenticated; the client view is built field by field (no operator note, no internal id beyond what the page needs) |
| V5 Input Validation | yes | zod strict objects; token regex before any DB call; 400 vs 422 two-step parse; body caps; line count cap; stop rules of Phase 91; amounts as positive integers of minor units with an upper bound; `NO_LINE_BREAKS` on single-line fields that reach email headers |
| V6 Cryptography | yes | `randomBytes(32)`; SHA-256 for the stored hash and for the terms text; no home-made scheme |
| V7 / V8 Errors, logging, data protection | yes | No token, name, email or address in logs; ids and codes only; erasure covers the new tables; `no-store` on page and API |
| V13 API | yes | CSRF Origin check for `/api/quote` (strict) and `/api/admin`; rate-limit keys per public route; uniform 404 for every invalid token |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Guessing or enumerating quote links | Information disclosure | 256-bit token, hash-only storage, one invalid answer for every failure, rate limits |
| Token leak through analytics, chat, Referer, CSP reports, Stripe return URL | Information disclosure | `PRIVATE_SEGMENTS`, `SECRET_PATH_RE`, `Referrer-Policy: no-referrer`, tokenless return page |
| Database leak exposes working links | Information disclosure | Only the hash is stored |
| Mail scanner accepts or "views" a quote | Tampering | GET writes nothing; `viewed` is informational; acceptance needs a POST with Origin, a tick and a card payment |
| Client alters the amount or the version | Tampering | Amount from the frozen version; cross-check values answer 409; strict schema refuses unknown keys |
| Paying an edited or voided quote | Tampering | Derived link validity, edit / void refused while a deposit is in flight, webhook ownership check, automatic refund of an orphan payment |
| Double payment or double conversion | Tampering | One live PaymentIntent per quote, idempotency keys, row lock, unique `quote_line_id`, event keys |
| Deposit PaymentIntent mistaken for a booking payment | Tampering / Repudiation | `card_` kind with explicit routes; the id never stored on a booking |
| Deposit for a trip in the past | Tampering | D-05 cutoff in the resolve function, the accept route and the builder's send action |
| Operator session abuse: arbitrary refunds or amounts | Elevation of privilege | Admin guard, refund bounded by deposit minus refunded, `admin_action` event before any Stripe call, idempotency key with the amount |
| Off-session charge not covered by consent | Repudiation (dispute) | Per-method acceptance text, version, SHA-256 and rendered text stored with IP and user agent (D-08); per-booking consent row |
| HTML injection into the page, email or PDF | Tampering | Escape every user value; PDF render with JavaScript disabled and all network blocked |
| Server-side request forgery through the PDF renderer | Elevation of privilege | `setContent` with a self-contained document, request interception that aborts everything |
| Quote data kept after erasure | Information disclosure | Erasure functions and the Stripe customer lookup extended; stored PDF deleted |
| Card testing through the accept route | Abuse / cost | A valid token is required, 10 per minute per IP, card-only, 3DS as Stripe decides |
| Search engines indexing a quote | Information disclosure | `X-Robots-Tag` and meta `noindex`, no robots.txt block (so the rule can be read), not in the sitemap |

## Sources

### Primary (HIGH confidence)
- Repository files read this session (paths and lines cited inline): `CLAUDE.md`, `92-CONTEXT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `91-RESEARCH.md`, `package.json`, `middleware.ts`, `next.config.ts`, `vercel.json`, `vitest.config.ts`, migrations 039, 051, 063, 066, 067, 069, 075, 084, 085, 087, 088, 089 (both), `lib/payments/{state,stripe,checkout,customer,config,timing,money,consent,consent-text,actions,cancel,edit-hook,hold,settle,tick,extra}.ts`, `lib/payments/emails/{render,send,policy-block}.ts`, `lib/stripe-webhook/{dispatch,card-confirm,hold-events,recovery-events}.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/admin/bookings/route.ts`, `app/api/admin/bookings/[id]/payment-link/route.ts`, `app/api/manage/cancel/route.ts`, `app/api/card-checkout/intent/route.ts`, `app/[locale]/manage/[token]/page.tsx`, `app/[locale]/layout.tsx`, `lib/{manage-link,private-link-path,csp-report-redact,rate-limit,cancellation-policy,cancellation-settings,booking-stops,stops,route-distance,supabase,stripe-payment-links,booking-locale,booking-reference,driver-trip-step,erasure,erasure-store,erasure-hash}.ts`, `lib/checkout/compute.ts`, `components/booking/steps/Step6CardOnFile.tsx`, `components/SiteChrome.tsx`, `components/admin/AdminSidebar.tsx`, `tests/payment-state-writers-gate.test.ts`, `tests/helpers/fake-payments-db.ts`, `infra/stripe/webhook-events.mjs`, `.planning/research/{SUMMARY,ARCHITECTURE,PITFALLS}.md`.
- Stripe, fetched 2026-11-14: https://docs.stripe.com/payments/advanced/save-during-payment , https://docs.stripe.com/api/payment-link/create (incl. `?query=restrictions`, `?query=payment_intent_data`), https://docs.stripe.com/api/checkout/sessions/create , https://docs.stripe.com/api/refunds/create , https://docs.stripe.com/js/appendix/supported_locales
- Vercel: https://vercel.com/docs/functions/limitations (last updated 2026-08-24), https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel
- Google: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Resend: https://resend.com/docs/dashboard/emails/attachments (40 MB limit after Base64; Node SDK accepts a Buffer)
- npm registry and `gsd-tools query package-legitimacy check`, run this session.
- Context7 was not used (the MCP needs authorization this session); official pages were fetched directly.

### Secondary (MEDIUM confidence)
- Czech VAT Act 235/2004 Sb., consolidated text valid 2026-01-01 to 2026-12-31, read on https://www.zakonyprolidi.cz/cs/2004-235 (§ 20a, § 28, § 29, § 37a, § 10a, § 63, § 70). The site is a commercial mirror of the Collection of Laws; quotes were extracted in slices and § 47 was not reached.
- https://react-pdf.org/fonts (font registration; silent on right-to-left and Indic text).

### Tertiary (LOW confidence)
- Web search summaries on VAT rates for passenger transport after 2024 (Forvis Mazars newsletter on the tax authority's information 916/24/7100-30116-050822; dauc.cz articles) and on react-pdf with Arabic (DEV Community posts). Used only to frame questions for the accountant and the spike.
- Everything in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new except the gated PDF packages; every reused module was read.
- Architecture: HIGH for the deposit, webhook routing, conversion and link design (all grounded in shipped patterns); MEDIUM for the mode mapping until the owner confirms the reading of the carried-forward line.
- PDF: MEDIUM — platform limits verified, rendering quality in 7 languages not proven until the spike.
- Cancellation money rules: MEDIUM — mechanics are clear, the business rule (fee base, allocation) needs the owner.
- Legal / tax: LOW — statute quoted, application to this business not verified.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 for repo facts (re-check `ls supabase/migrations` and the mode checks before execution); Stripe and Vercel references should be re-read if execution starts after that date; the VAT text is the 2026 consolidated version.

## Project Constraints (from CLAUDE.md)

- Brand spelling Prestigo / rideprestigo.com. Stack: Next.js App Router + next-intl (en, ru, es, fr, ar, hi, zh), Supabase, Stripe, Resend, Vercel project `prestigo-site`; merge to `main` is a production deploy.
- Type check `npx tsc --noEmit` (baseline 8 old errors in `tests/` only); lint `npx eslint --quiet <files>` (baseline: `<a>` -> `<Link>` in both `not-found.tsx`); tests `npx vitest run [files]`; `vitest related` crashes, grep `tests/` instead; full gate is the `verify` skill; dev server through `preview_start` name `prestigo`, never `npm run dev` in Bash.
- No hard-coded `€` prices in `app/` or `components/` (pre-commit enforces). Quote amounts are rendered with `formatMinor` from stored minor units; the builder shows API-returned suggestions.
- No secrets or `.env*` files in commits; never read `.env.local`.
- Marketing content has no prices (not touched by this phase; the quote page is not marketing content, it shows the client their own quote).
- `middleware.ts` matcher must exclude every static / metadata extension. This phase adds no static extension; do not serve the PDF from a path ending in `.pdf` under a localized route (use `POST /api/quote/pdf`).
- next-intl sets `NEXT_LOCALE` on every response; its presence is not a user choice. The quote's language comes from the version, not from that cookie.
- New EN strings in `messages/en.json` need real translations in all other locales; never run `scripts/i18n-translate.mjs --dry-run` on the repo tree. Translate in-session.
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil` (no structured data on the quote page).
- Security work (auth, CSRF, validation, rate limits): run tests, commit with the `security:` prefix.
- Vercel Preview deploys always fail (missing Supabase env); non-blocking.
- From project memory, relevant here: executors have no Supabase MCP (the orchestrator applies migrations and smokes); re-REVOKE `FROM PUBLIC, anon, authenticated` after every `CREATE OR REPLACE` of a SECURITY DEFINER function; never create a Supabase client at module load or during a static render; pages use `params.locale` + `setRequestLocale`; UTF-8 or numeric entities only in emails; brand palette is navy with champagne gold.

## Suggested Plan / Wave Breakdown

**Before planning:** the owner answers Questions 1, 2, 3, 4 and 9 below (they change schema, consent wording and the PDF plan).

**Wave 0 (foundation and proof)**
- 92-01: migration `091_quotes.sql` written; pure modules `lib/quotes/{token,status,money,terms}.ts`; fake-DB tables and RPC emulation; RED tests for money, token, status, migration text. Orchestrator applies 091 live and smokes.
- 92-02: PDF spike (path B) with the pass criteria of Q5; outcome recorded; owner checkpoint for the two packages.

**Wave 1 (operator side)**
- 92-03: admin API (list, draft create / patch, freeze + send, revise, void, mint link) with guard order, 400 / 422, body caps; `quote_events`.
- 92-04: quote builder and list UI (lines, stops, landing, deposit, remainder method, terms, language, expiry), status badge, "Cancel quote"; sidebar entry.

**Wave 2 (public page; `security:` commits)**
- 92-05: resolve function, `/[locale]/quote/[token]` page and invalid view, headers, `PRIVATE_SEGMENTS`, CSP redaction, CSRF prefix, rate-limit keys, `/api/quote/view`.
- 92-06: acceptance + deposit: consent text per method, `/api/quote/accept`, PaymentElement island, tokenless return page, `/api/quote/state`; 7-locale strings.

**Wave 3 (money)**
- 92-07: webhook kind and routes, `applyQuoteDepositPaid`, conversion wrapper in `lib/payments/state.ts`, gate and ledger parity tests, orphan refund, tick reconcile step.
- 92-08: after-commit effects (reminders, client and operator emails, accounting email), edit-hook deposit share, booking panel quote chip and link.
- 92-09: remainder methods: link (quote page payment or Stripe link), invoice record and mark-paid, cash and saved card verified end to end on the fake engine.

**Wave 4 (cancellation, documents, erasure)**
- 92-10: `cancelQuote`, refund deposit action, suppress inputs on `cancelBooking`, manage-token rule for quote bookings, admin dialog.
- 92-11: quote document HTML, PDF storage and download route, quote email with the attachment (or the link fallback).
- 92-12: erasure functions and Stripe customer lookup, erasure preview counts.

**Wave 5:** security review tests (token matrix, tampering, double delivery, GNet untouched), full suite, `verify pre-pr`, owner-run live proofs (one small deposit with a saved-card remainder and one with a link, one free cancel with refund), UAT of the page in `en`, `ru` and `ar` on desktop and mobile.

## Open Questions for the Owner (and for the accountant / counsel)

**Owner — needed before planning** (resolution status added 2026-11-14 after the plan check, W5)
1. **Booking mode for the remainder.** May a quote booking whose remainder is "saved card" be stored as a normal card-hold booking (and "cash" as a normal cash-with-guarantee booking), linked to the quote, so the existing engine runs it unchanged? The alternative keeps the label `quote` on every quote booking and rewrites about 40 checks in the payment code. — **Resolved: D-15** (with D-01).
2. **Late cancellation money.** After the free window, is the fee a percent of the deposit (the deposit is what is at stake, nothing more is charged), or a percent of the whole quote (which may mean charging the saved card beyond the deposit)? — **Resolved: D-11.**
3. **Deposit across trips.** Spread the deposit over the trips in proportion to their prices (recommended), or count it against the first or the last trip? And when one trip of a paid quote is cancelled, is its share refunded, kept, or decided by the operator each time? — **Resolved: D-12** (the operator decides; proportional shares are the planner's allocation in 92-02, A3).
4. **Custom cancellation window.** How long may the free-cancellation period of a quote be? The current limit in the system is 72 hours before the trip; tours may need days or weeks. — **Resolved: D-13** (up to 30 days).
5. **Payment-link remainder.** One payment for the whole remainder or one per trip, and by when must it be paid? Is paying on the quote page (same link, all languages) acceptable instead of a Stripe-hosted link? — **Resolved: D-16** (paid on the quote page; one payment for what is due, plan 92-23).
6. **Invoice remainder.** Which billing details are required, what payment term is stated, and who issues the invoice and from which numbering? — **Resolved: D-17** (record, accounting email, "mark invoice paid"; no invoice document in this phase).
7. **Cash remainder.** Is the saved card a guarantee as in the existing cash flow (no-show or late-cancel fee, and the operator may charge it if the cash was not paid)? — **OPEN: asked at the owner gate of plan 92-03 (Task 1) before any consent copy is written; recorded as D-21.**
8. **Purpose of the saved card for link and invoice quotes.** What may it be charged for: fees and extras only, or also an unpaid remainder? — **OPEN: asked at the same owner gate of plan 92-03; recorded as D-22.**
9. **PDF.** Accept two new server packages (headless Chromium) so the email carries a real PDF in all site languages, or keep zero new packages and send a link to a print-ready page instead of a file? — **Resolved: D-14** (production proof in plan 92-32).
10. **Who can cancel an accepted quote.** Operator only in this phase (the client writes or calls), or a cancel button for the client on the quote page? — **Resolved: D-03** with the planner's A8 (operator-only cancel in this phase, plans 92-11 / 92-22).

**Owner — can be decided during planning**
11. One CRM lead per quote or one per trip. — Planner default (A7): the existing insert triggers run unchanged, one Lead per trip; no D-decision.
12. Whether clients get the per-trip "manage booking" link for quote trips (off by default). — Planner default: off (plan 92-11, A8); no D-decision.
13. Quote currency: EUR only, or CZK as well; rounding of a percent deposit (to cents or to whole units). — Planner: EUR or CZK per version (091 schema), percent deposit rounded to the cent (92-02); no D-decision.
14. Whether post-trip extras (waiting beyond the booked time) may be charged on quote trips. — Planner (A12) for saved-card trips; for cash, link and invoice quotes it is part of D-21 / D-22.
15. Whether price edits of a single trip are allowed after the deposit is paid, or blocked in this phase. — **Resolved: D-20.**

**Accountant** (open; routed to plan 92-28 step 8, not blocking the build)
16. Is the company a VAT payer, and is the recorded VAT id correct?
17. Must a tax document be issued for each deposit within 15 days of receipt, per quote or per trip, in which numbering series and with what wording?
18. VAT rate for chauffeur transport, and the treatment of cross-border trips (Czech section and foreign sections) when one deposit covers several trips.
19. What document is needed when a deposit is refunded in full or in part.
20. B2B clients in other EU states: reverse charge and what the deposit document must say.

**Counsel** (open; routed to plan 92-28 step 8, before quotes go to real clients)
21. Wording of the acceptance and card-authorisation text for each remainder method, and whether the cancellation fee on a deposit is fair-terms safe for consumers.
22. Whether any planned quote content (guides, tickets, accommodation) would make a quote a travel package.
