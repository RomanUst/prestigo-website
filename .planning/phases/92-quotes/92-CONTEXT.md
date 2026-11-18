# Phase 92: Quotes - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The operator builds a multi-trip quote in admin, the client opens it by a secret link, accepts it and pays a deposit, and the accepted quote becomes linked bookings whose remainder is collected the way the operator chose. Covers QUOTE-01..QUOTE-07.

Not in scope: the day-trip catalogue and the custom-tour request form (Phase 93; the custom-tour answer reuses this phase's quote), the driver cabinet (Phase 94), automatic price refresh of an open quote, client self-editing of a quote, GNet bookings.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap / prior phases, not re-asked)
- Quote tokens are hashed 256-bit secrets with immutable versions; the public GET is side-effect free; the quote page sends no-referrer, no-store and noindex. Security work: tests, `security:` commit prefix.
- Editing a sent quote creates a new version and voids the old links (QUOTE-06).
- Quote bookings carry `payment_mode='quote'` (already allowed by migration 085), so the hold engine ignores them until the operator's remainder method applies.
- The deposit is a client-facing payment on the quote page and also saves the card (QUOTE-03).
- The server is the price authority: the client never sends an amount; the amounts are the ones stored in the quote version.
- No hard-coded prices in `app/` or `components/`; every site locale gets real translations for client-facing strings (8 since zh-hant was added: en, ru, es, fr, ar, hi, zh written by hand, zh-hant generated from zh by `scripts/zh-hant-sync.mjs`); all times are Prague time, DST-safe.
- No new runtime dependency for the PDF unless research shows there is no other workable path (v5.0 stance).
- Stops and waiting on a quote line follow Phase 91: distance through all stops, first 15 minutes free, per-class waiting rate, and the client sees one total per line without a separate waiting amount (owner decision 2026-11-12).
- Migration numbering: 085–089 exist (two files share 089), and 090 is taken by the production hotfix `090_consent_locale_zh_hant.sql` (booking_payment_consents.locale accepts zh-hant; applied live, reaches main in its own PR). The quote migration is 091 (`091_quotes.sql`); the roadmap's "088" and the earlier "090" are out of date.

### Owner decisions (2026-11-14)
- **D-01:** A quote of several days or trips is paid as a deposit plus a remainder. There is never one long hold over the whole quote and no per-day hold as the quote's own payment model. The remainder method per quote is one of: saved card (hold / capture per trip, the existing engine), payment link, cash to the driver, invoice. — **Reversibility:** costly — the booking payment state of every quote booking follows from it.
- **D-02:** A quote link has no automatic expiry by default. It stays valid until the operator cancels (voids) it. Owner's words: "до отмены оператором". The operator may set an expiry date on a quote when they want one; then the link expires at that date. — Deviates from the roadmap wording "expiring": `expired` is reached only through an operator-set date, `voided` through the operator's cancel or a new version.
- **D-03:** When the client cancels an accepted quote, the standard cancellation policy applies to the deposit (Phase 89: free cancellation up to the threshold, then the fee). The operator can set other cancellation terms on a quote ("должна быть возможность настроить другие сроки оператором"); the quote page and the PDF show the terms that apply to this quote before the client pays. — **Reversibility:** costly — the terms shown at acceptance are part of the logged acceptance.
- **D-04:** The admin suggests the price of each line from the live tariffs (route, vehicle class, stops, waiting) and the operator can overwrite any line amount by hand.

### Decisions after research (owner, 2026-11-14)
- **D-11:** Late cancellation of an accepted quote keeps the deposit (a percent of the deposit, default all of it). The client is never charged more than the deposit for cancelling. — **Reversibility:** costly — it is part of the terms the client accepts.
- **D-12:** The deposit belongs to the whole quote. Cancelling one trip of several does not move it automatically: the operator refunds a part by hand or lowers the remainder.
- **D-13:** Custom free-cancellation terms on a quote may be up to 30 days before the first trip (the existing 72-hour cap in `policyFromSnapshot` must not silently turn a longer window into the legacy policy).
- **D-14:** The quote email carries a real PDF attachment in the client's language, and the client can download the PDF from the quote page. Two new server packages are accepted for it (`puppeteer-core` + `@sparticuz/chromium-min`), behind one `renderQuotePdf()` function, proven by a spike first; when the render fails on the host the email carries the link instead. Pin a release at least two weeks old and add a human-verify checkpoint for the install.

### Open owner questions (asked at the owner gate of plan 92-03, before any consent copy is written)
- Cash remainder: what may the card saved with the deposit be charged for (research Owner Question 7)?
- Payment-link and invoice remainders: what may the saved card be charged for (research Owner Question 8)?
- The answers are recorded above as D-21 and D-22 by 92-03 Task 1.

- **D-21:** Cash remainder — the saved card is a guarantee: it may be charged for a trip not paid in cash, for waiting beyond the booked time and for extras agreed during the trip (the same as today's cash bookings). Owner, 2026-11-14: "1 ок" to the planned scope (option a of 92-03 Task 1).
- **D-22:** Payment-link and invoice remainders — the saved card is used only for payments the client makes on the quote page (link) or approves (invoice). An unpaid remainder or post-trip waiting on those quotes is collected by the operator by hand. Owner, 2026-11-14: "1 ок" (option a).
- **D-14 packages approved:** the owner approved `puppeteer-core` 25.16.0 and `@sparticuz/chromium-min` 153.0.0 on 2026-11-14 ("2 ок"); this is the approval of 92-05 Task 1.

### Decided by Claude after research (owner may override)
- **D-15:** A booking created from a quote gets the payment mode that matches the quote's remainder method, linked by `bookings.quote_id` / `quote_line_id`: saved card → `card_hold`, cash → `cash_guarantee`, payment link and invoice → `quote`. This replaces the literal reading of "quote bookings carry `payment_mode='quote'`": the existing hold engine, the driver cash step and about 40 checks recognise only `card_hold` and `cash_guarantee`.
- **D-16:** The "payment link" remainder is paid on the quote page itself (not a Stripe Payment Link or hosted Checkout: no customer binding, 24-hour session life, no Arabic or Hindi).
- **D-17:** The "invoice" remainder is a record plus an email to the operator's accounting address plus a "mark invoice paid" action; no invoice document is generated in this phase.
- **D-18:** The deposit PaymentIntent uses a `card_*` metadata kind (`card_quote_deposit`) and is never written to `bookings.payment_intent_id`; conversion to bookings is one SQL function in one transaction with a unique index on `bookings.quote_line_id` as the exactly-once guard, and a reconcile step covers a lost webhook.
- **D-19:** Unconverted quotes hold client PII, so the erasure functions and the Stripe customer lookup are extended to cover quotes.
- **D-20:** A price edit on a booking created from a quote must not charge the deposit a second time (`deriveAmountMinor` is fixed or the edit is refused for quote bookings).

### Decided by Claude (owner may override)
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

</decisions>

<canonical_refs>
## Canonical References

### Scope and requirements
- `.planning/ROADMAP.md` § Phase 92 (goal, success criteria, research and planning notes)
- `.planning/phases/92-quotes/92-RESEARCH.md` and `92-PATTERNS.md`
- `.planning/REQUIREMENTS.md` QUOTE-01..QUOTE-07

### Prior phase decisions this phase builds on
- `.planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-CONTEXT.md` (stops, waiting, server distance) and `91-UAT.md` § Owner changes (one total, no waiting breakdown for the client)
- Phase 88 / 89 payment engine: `supabase/migrations/085_payment_state_card_on_file.sql`, `lib/payments/`, `lib/cancellation-policy.ts`, `lib/cancellation-settings.ts`, `lib/cancellation-wording.ts`
- Phase 90 shared booking panel: `components/admin/BookingDetailPanel` and `useBookingMoves`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/admin/bookings/route.ts` POST (manual booking, server price recompute with `override_price`, admin guard order)
- `lib/checkout/compute.ts`, `app/api/calculate-price/route.ts`, `lib/route-distance.ts`, `lib/stops.ts`, `lib/booking-stops.ts` (pricing of a line with stops)
- `lib/payments/` (PaymentIntents, saved card, ledger `append_payment_event`, alerts), `lib/payments/consent-text.ts` (consent versions)
- `lib/email.ts` (navy email layout), invoice PDF path noted in project memory (HTML → headless Chrome, no PDF library in the repo)
- Existing `quote_leads` table and `app/api/submit-quote`, `submit-multiday-quote` (inbound quote requests, not this phase's quotes)

### Established Patterns
- Admin API: `getAdminUser()` first, 400 vs 422 two-step parse, body size cap, CSRF; SECURITY DEFINER RPCs need REVOKE from PUBLIC, anon, authenticated.
- Public step 1 of the wizard is `EntryBar`, step 2 is `Step3Vehicle`; verify what a page really renders before wiring UI.
- Never create a Supabase client during render; pages use `params.locale` + `setRequestLocale`.

### Integration Points
- `bookings.payment_mode='quote'` and the hold cron, the dispatch board and calendar (quote bookings must appear there once created), the erasure functions (new tables with client PII must be covered), EspoCRM / lead outbox if a quote creates bookings.

</code_context>

<specifics>
## Specific Ideas

- The owner wants links valid until cancelled, so the admin quote list needs an obvious "Cancel quote" action and a clear state badge.
- The client must see the cancellation terms that apply to this quote before paying the deposit.

</specifics>

<deferred>
## Deferred Ideas

- Automatic reminders for unanswered quotes.
- Client-side edits or counter-offers on the quote page.
- Free-text legal terms per quote.

</deferred>
