# Domain Pitfalls

**Domain:** Adding card-on-file / manual-capture holds, quotes with deposits, driver-driven status sync, multi-stop pricing, admin UX overhaul and a day-trip catalogue to the existing Prestigo system (Next.js App Router, 7 locales, Supabase, Stripe EU/CZ, Vercel Hobby, GNet).
**Milestone:** v5.0 Payments, Quotes & Day Trips
**Researched:** 2026-11-02
**Overall confidence:** MEDIUM-HIGH. Stripe mechanics (auth windows, extended auth, overcapture, SCA/off-session) are verified against current Stripe docs (HIGH). Vercel Hobby cron limits verified (HIGH). Existing-code collisions were read directly from the repo (HIGH). Czech/EU consumer-law points come from training knowledge plus partial web checks and are MEDIUM/LOW: the statute text could not be fetched, so have a Czech lawyer or ČOI guidance confirm them before the terms go live.

## How to read this file

Phase labels below are **suggested buckets**, not final roadmap numbers. Map them onto real phase numbers when the roadmap is cut.

| Bucket | Scope |
|--------|-------|
| **P-FOUND** | Payment data model (ledger), webhook foundation, Stripe test environment, feature flag |
| **P-CARD** | Card-on-file checkout (SetupIntent), consent/terms, cash + card guarantee |
| **P-HOLD** | Scheduled hold engine, failure recovery, capture / cancel / refund / no-show charge |
| **P-DRIVER** | Driver next-step flow mutating `booking.status`, capture trigger |
| **P-QUOTE** | Admin quotes, quote link, deposit link, remainder method |
| **P-PRICE** | Multi-stop pricing, waiting fees, airport pickup offset |
| **P-ADMIN** | Kanban, calendar, collapsible sidebar, light theme |
| **P-TRIPS** | Day-trip catalogue, SEO, custom-tour lead |

Severity: **Critical** = silent money loss, wrong charge, or rewrite. **Moderate** = visible bug or operational pain. **Minor** = polish / cheap to fix.

---

## Critical Pitfalls

### C1: The "5 days before the trip" hold lands outside the Visa merchant-initiated authorization window
**What goes wrong:** The plan says "hold ~5 days before the trip, capture after completion". A hold created by the scheduled job with the customer absent is a merchant-initiated transaction (MIT). Stripe documents card-not-present authorization validity as: **Visa MIT 5 days (exact 4 days 18 hours), Visa CIT 7 days, Mastercard / Amex / Discover 7 days.** A Visa hold placed at T-5d expires about 6 hours before the pickup. The PaymentIntent flips to `canceled` on its own and the trip has no funded payment, while the booking still says "held".
**Why it happens:** "7 days" is the number everyone remembers. The MIT vs CIT split is on a separate row of the Stripe table. Stripe also says classification depends on cardholder-participation signals, not just `off_session: true`, so the actual window is only knowable per charge via `payment_method_details.card.capture_before`.
**Consequences:** Expired holds for exactly the customers who were promised "cancellation costs nothing". Silent revenue loss when the driver completes a trip with no capturable PaymentIntent. A guaranteed failure for Visa, which is most European cards.
**Prevention:**
- Hold lead time is a configurable value (`hold_lead_hours`), default about 72 h before `pickup_utc`, never 5 days. The scheduler's earliest-eligible rule must keep `lead + scheduler_slack + trip_duration + capture_delay` under 4 d 18 h. The Hobby daily cron adds up to 24 h slack on its own (see C9).
- Bookings made less than about 4 days before pickup skip the SetupIntent. Do an **on-session** manual-capture PaymentIntent at checkout. It is a CIT with 3DS done in front of the customer and gets the 7-day window.
- Persist `capture_before` (from the expanded `latest_charge`) on the payment row at hold time. Alert when `capture_before - now < 12 h` and the booking is not completed.
- Do **not** plan on extended authorization. It is only for CITs, is an IC+-pricing feature, and for Discover explicitly excludes taxicabs/limousines. Do **not** plan on Stripe's `automatic_delayed` capture either: it is private preview.
**Detection:** `payment_intent.canceled` with `cancellation_reason = automatic`; any `requires_capture` PI whose `capture_before` is already past; a nightly report of "completed booking, no captured payment".
**Phase:** P-HOLD (design), P-FOUND (store `capture_before`).
**Confidence:** HIGH (Stripe "Place a hold on a payment method" and "Extended authorization" docs).

### C2: Existing webhook handlers assume pay-now and will misbehave on holds and captures
**What goes wrong:** Concrete collisions in `app/api/webhooks/stripe/route.ts` and `app/api/admin/bookings/cancel/route.ts`:
1. **`charge.refunded` blindly cancels.** `handleChargeRefunded` sets `status: 'cancelled'` with no status guard, and for one-way bookings does so for *any* refund, even partial. After v5.0 a completed, captured trip that gets a goodwill partial refund (for example waiting fee waived) flips to `cancelled`.
2. **`payment_intent.succeeded` fires at capture time.** Today it means "booking just got paid, create/confirm it, send the confirmation email, fire GA4/Meta purchase". With holds it fires days later at capture, when the booking is already `completed`. The code's "unexpected capture" branch treats anything other than a `confirmed` row with the same PI as an alert. The result is alert noise, a duplicate confirmation email, and a purchase event reported at completion time instead of booking time (or never, for bookings with no capture).
3. **Booking identity is `(payment_intent_id, leg)`.** A SetupIntent booking has no PaymentIntent yet. Reusing the unique index forces fake ids or nulls. Round trips share one PI across two legs, which is impossible for holds, because the return leg may be days later and needs its own hold window.
4. **`create-payment-intent` creates an `unpaid` row before payment** (abandoned-checkout capture keyed by `attemptId`) and uses `automatic_payment_methods: { enabled: true }`. With manual capture, methods that cannot be held (iDEAL, SEPA debit, ACH and others) are offered and then fail or silently convert.
5. **Cancel route calls `refunds.create`.** On an uncaptured PI that fails. The correct call is `paymentIntents.cancel`. On a SetupIntent-only booking there is nothing to refund.
**Prevention:**
- Introduce a **payment ledger** (`booking_payments`: kind = `hold | capture | deposit | remainder | no_show_fee | refund`, amount_minor, currency, stripe ids, status, `capture_before`) and a separate `payment_state` on the booking. Do not overload `status` or a `paid` boolean. Bookings point at payments, never the reverse.
- Branch every handler on the **PaymentIntent's `metadata.kind`** (set on every PI v5.0 creates): `pay_now` keeps today's behavior untouched; `hold`, `no_show_fee`, `deposit`, `remainder` get their own paths. Never infer from absence of metadata.
- Add a status guard to `handleChargeRefunded` (only cancel `confirmed/assigned/...`; never `completed`), and make refund-driven cancellation opt-in via refund metadata (`cancel_booking=true`) set by the admin cancel route.
- Admin cancel route retrieves the PI live and branches: `requires_capture` → `cancel` (no fee, no `charge.refunded`); `succeeded` → refund (Stripe does not return processing fees on refunds, which is the whole motivation of this milestone); SetupIntent-only → no Stripe call; late-cancel fee → partial `capture`.
- Keep `pay_now` the default and ship hold/cash behind a `pricing_globals` feature flag with an owner-only canary booking (see M12).
**Detection:** Booking `completed` → `cancelled` after a partial refund; duplicate confirmation emails; GA4 purchase count diverging from paid bookings.
**Phase:** P-FOUND (ledger + handler refactor + regression tests of pay-now), then P-HOLD.
**Confidence:** HIGH (read from repo).

### C3: Failed holds, 3DS on off-session charges, and the double-hold race
**What goes wrong:** At hold time the customer is absent. Possible outcomes:
- `authentication_required` (the issuer insists on SCA even though the card was authenticated at setup). Stripe's guidance: the PI is left needing the customer to return and complete authentication with the PI's client secret.
- Hard declines: `insufficient_funds`, `expired_card`, `card_declined` / `do_not_honor`, `lost_card` / `stolen_card`. Only some are recoverable by the same card.
- Setup succeeded months ago, card expired or was replaced since.
- Network timeout on the create call. The Stripe client in `create-payment-intent` is built with `maxNetworkRetries: 0`, so an ambiguous failure leaves you not knowing whether a hold exists. The retry job can then create a **second hold**, which locks twice the funds on the customer's card.
- Customer pays the recovery payment link at the same moment the retry job fires: two live holds, double capture risk.
**Prevention:**
- A single `hold_attempt` row is written **before** calling Stripe, and its UUID is the Stripe idempotency key (`hold:{booking_id}:{attempt}`). Stripe idempotency keys only last about 24 h and error if parameters differ under the same key, so a changed amount must create a new attempt, not reuse the key.
- DB-level guard: partial unique index "at most one active hold per booking/leg" (`WHERE state IN ('creating','requires_action','held')`). All state moves use compare-and-swap (`UPDATE … WHERE state = $expected RETURNING`). The job and the webhook can both run; only one wins.
- Before creating a new PI, look up and `cancel` any stale PI from the previous attempt (`requires_action` / `requires_payment_method`). The recovery link must reuse or replace, never add.
- Use `off_session: true, confirm: true` with the saved `payment_method` + `customer`. Classify errors: `authentication_required` / `requires_action` → send a **hosted recovery page** (booking locale, unguessable token, uses the PI client secret with `confirmPayment`) and notify the operator; `expired_card` / `card_declined` → recovery link with "use another card"; unknown/network error → **do not retry blindly**, retrieve by stored id / search `metadata['booking_id']` first.
- The operator alert must **not depend on the VPS** (v4.0 constraint). Use Resend email / direct Telegram call from the site, not a Chatwoot conversation.
- Escalation timeline on the booking: T-3d hold fails → customer email + link immediately → T-48h reminder → T-24h operator escalation → T-12h manual decision (call customer, switch to cash). Define what happens if nothing is resolved (trip is not auto-cancelled silently).
**Detection:** `payment_intent.payment_failed` events; count of `held` states per booking >1; `payment_intent.requires_action` older than 12 h.
**Phase:** P-HOLD.
**Confidence:** HIGH on Stripe behavior (docs), MEDIUM on exact decline-code taxonomy (verify per code in Stripe's decline docs when implementing).

### C4: Capture is irreversible and amount-capped, but trip prices change before and after the hold
**What goes wrong:**
- **Admin edits after the hold** (v2.1 AEDIT price-change review, extras, multi-stop changes): the authorized amount is now wrong. Capture can be **less** than authorized (a partial capture releases the remainder), but never more. Overcapture exists but excludes Visa for EEA merchants and is IC+-only, so assume it is unavailable.
- **Waiting fees and extra stops are known only after the trip** (new in this milestone), yet the hold was sized beforehand. The capture cannot exceed it.
- **A partial capture is single-shot.** Stripe allows one capture per authorization for most payments; you cannot capture the rest later.
- **Price drift between booking and hold** (admin changes `route_prices` or the CZK/EUR rate in `pricing_globals`). If the hold job recomputes the price instead of reading the snapshot, the customer is held for a different amount than the one they agreed to. v4.0's open WR-03 (CZK→EUR rate differs by surface) shows the drift is already real.
- **Currency toggle:** the checkout allows `eur` / `czk`. A hold is bound to its currency forever; FX at capture is the bank's problem, but "price in CZK held, receipt in EUR" confuses customers.
**Prevention:**
- Snapshot at booking time: `agreed_amount_minor`, `currency`, rates, waiting-fee config. The hold job reads only the snapshot. Any later admin edit that changes price creates an explicit "payment adjustment" task: cancel + re-hold (MIT, no customer involvement unless the issuer demands SCA) when increasing; partial capture when decreasing.
- Size the hold = agreed price **+ a configured buffer for waiting/extra stops** (state the buffer in the consent text), or charge post-trip extras as a separate off-session `extra_fee` payment under the same mandate. Pick one rule and write it into the mandate wording (C5). Do not rely on overcapture.
- Capture exactly `min(final_amount, amount_capturable)`; if `final_amount > amount_capturable`, capture the cap and open an `extra_fee` task. Never silently drop the difference.
- Make capture a server job triggered by a state change, with the amount computed server-side from the ledger, never from the driver's request.
**Detection:** Ledger invariant check (sum of captures + extras = final trip price) in a nightly query; any `final_amount > amount_capturable` event.
**Phase:** P-FOUND (snapshot columns), P-HOLD, P-PRICE (waiting-fee policy).
**Confidence:** HIGH (Stripe capture/overcapture docs).

### C5: Consent and mandate wording is thin, so no-show charges lose disputes
**What goes wrong:** Saving a card for later off-session use requires explicit customer agreement. Stripe's documented minimum for terms: the customer's agreement to you initiating payments on their behalf for specified transactions; the anticipated timing and frequency; how the amount is determined; and the cancellation policy; and you must keep a record of the agreement. If the no-show clause is buried in generic Terms, a 100% off-session charge is a likely chargeback with weak evidence, and also an unfair-term risk.
**Prevention:**
- A dedicated, **unticked** checkbox next to the card field (EU rule on additional payments forbids pre-ticked boxes, see C6), text stating exactly: what is authorized and when ("we reserve the trip price on your card about 3 days before pickup"), when money is actually taken (after completion; or cancellation fee per tiered policy), the no-show rule (cash mode: 100% charged to this card), how waiting fees and extra stops are computed, and where to cancel free of charge.
- Per booking, store `consent_text_version`, **rendered locale**, SHA-256 of the exact rendered text, timestamp, IP, user-agent, and the setup intent id. The text must exist in all 7 locales including Arabic (RTL, bidi-isolated amounts). Hard-coding € in the text is banned by the repo rule: amounts are ICU parameters. Remember the pre-commit check only scans `app/` and `components/`, so numbers typed into `messages/*.json` pass unnoticed; review catalogs manually.
- Update `/terms` (all locales) with the cancellation tiers, hold and no-show clauses. Link it from the checkout checkbox, and send a booking confirmation email that restates the policy and the hold date.
- Use the same text in the quote flow (deposit, remainder via saved card).
**Detection:** Booking rows lacking consent fields; disputes on `no_show_fee` payments (C8).
**Phase:** P-CARD (checkout + terms), P-QUOTE (reuse).
**Confidence:** HIGH on the Stripe-required elements; MEDIUM on legal sufficiency.

### C6: Czech and EU consumer-law traps in cancellation, fees and checkout wording (verify with counsel)
**What goes wrong:** Prestigo sells to consumers (B2C) and companies. Points that commonly bite:
- **Right of withdrawal.** Passenger transport at a fixed date is largely outside the EU Consumer Rights Directive's withdrawal and information rules (Art. 3(3)(k)), and the Czech Civil Code (§ 1837, as I recall, the exemption for transport/leisure services at a fixed term) mirrors that. Do not state "14-day withdrawal" or "free cancellation always"; state *your own* tiered policy clearly. Day trips may be classed as leisure and are likewise date-bound. **Verify the exact paragraph and letter; I could not fetch the statute text.**
- **Remaining directive duties that still apply to transport:** the order button must make the payment obligation explicit (Art. 8(2): "order with obligation to pay", Czech equivalent), no surcharges for payment method beyond cost (Art. 19), and **no pre-ticked boxes for additional payments** (Art. 22). A SetupIntent booking changes what the button commits to ("book and guarantee with card"), so the CTA copy must be reviewed in all 7 locales.
- **Penalty vs unfair term.** A 100% no-show fee and steep late-cancel fees are contractual penalties/fees. Czech courts can moderate penalties (Civil Code § 2051) and unfair consumer terms are void (§ 1813 ff.). A flat 100% for cancelling 5 minutes after booking is a classic trap. Use a tiered schedule (for example free until 24 h, 50% inside 24 h, 100% inside 2 h or no-show) and show it before the customer pays.
- **Misleading claims.** "Free cancellation", "no charge until the trip" and "instant confirmation" on day-trip pages (GetYourGuide-style) must match actual terms exactly.
- **Package-travel risk for day trips.** Under the EU Package Travel Directive (and Czech Act 159/1999) a combination of transport and another tourist service can be a "package/zájezd". Trips under 24 h without overnight accommodation are generally excluded, but selling entrance tickets, guides or any accommodation in a quote bundle can pull a multi-day quote into scope (travel-agency licence, insolvency insurance). Keep the product "chauffeur-driven transfer with suggested itinerary" and avoid reselling third-party services without legal review.
- **VAT on deposits.** For VAT payers, an advance payment normally needs a tax document at receipt. The current invoice process is manual HTML→PDF. A quote deposit makes this recurring. Decide with the accountant whether deposit receipts need generated documents.
- **Retention vs erasure.** GDPR erasure (v4.0) must now include Stripe Customers/PaymentMethods, but accounting records (payments, invoices) have statutory retention in CZ. Erase PII, keep anonymized financial rows.
**Prevention:** One legal review pass on: tiered cancellation schedule, checkout CTA wording, no-show clause, day-trip classification, deposit VAT documents. Make all of them config + versioned text, not code constants.
**Phase:** P-CARD (terms + CTA), P-TRIPS (classification), P-QUOTE (deposit documents). Needs a legal checkpoint **before** P-CARD ships.
**Confidence:** MEDIUM for directive structure, LOW-MEDIUM for specific Czech paragraph numbers (flagged above).

### C7: Driver status sync turns a bearer-token link into a money trigger, with races and side effects
**What goes wrong:** v2.2 deliberately isolated trip progress (`driver_assignments.trip_progress`, route imports no status/GNet module) from `bookings.status`. v5.0 reverses that. Pitfalls:
- **Security stakes rise.** The permanent `trip_token` link (shared over WhatsApp, previewed by messengers) can now drive `completed` and therefore capture. A forwarded or leaked link, or a mis-tap, moves real money. Capture is irreversible.
- **Races.** Double tap, offline retry of a queued request, two open tabs, admin cancelling at the same moment, admin reassigning the driver mid-trip (`isTripLinkValid` self-invalidates on reassignment, so progress is lost), driver completing as the hold expires, the webhook arriving before the DB commit.
- **Two sources of truth.** `trip_progress` (en_route / arrived / on_board / completed / no_show) vs `bookings.status` (en_route / on_location / completed). `on_board` has no booking-status twin. In-flight bookings at deploy time have progress without matching status.
- **Strict next-step order enforced only in the UI** is trivially bypassed by replaying requests; the server must reject skips and repeats idempotently.
- **Side effects fan out per status write.** The Google Calendar `pg_net` trigger (migration 063) fires on updates, the outbox → QStash → EspoCRM sync fires per change, the post-trip review email keys off `completed`, stats count `completed`, and for `source = 'gnet'` bookings nobody decided whether intermediate statuses push to GNet (today only `assigned` does, via `pushGnetStatus`).
- **Driver page after completion.** `isTripLinkValid` returns false on terminal status, so the driver sees "invalid link" right after finishing. It needs a read-only "trip complete" state.
- **Driver-reported `no_show` must not auto-charge** (see C8).
**Prevention:**
- One function `transitionBooking(bookingId, expectedFrom, to, actor, reason)` is the **only** writer of `bookings.status`. It runs `UPDATE … WHERE status = $expectedFrom RETURNING`, records an audit row, and emits side effects (outbox, GNet, gcal) through one place. Admin routes, driver route, kanban, Stripe webhook and cron all call it. Grep-gate tests (the repo already uses import-closure guard tests) forbid direct `.update({ status })` elsewhere.
- Map driver steps explicitly (decide on a new `in_progress`/`on_board` status or keep `on_board` as progress-only and document it). Idempotency: repeating the current step returns 200 without effects; skipping returns 409 with the allowed next step.
- **Decouple completion from capture.** `completed` creates a capture task that runs after a short undo window (about 10 min, QStash delay) and is visible/cancellable by admin. The driver can never choose the amount. Add basic sanity gates (for example `completed` rejected earlier than N minutes after `on_board`).
- Throttle side effects: calendar/outbox only on meaningful transitions (assigned, completed, cancelled), not every driver tap.
- `security:` commit prefix, CSRF + rate limit retained, constant-time token compare, and a regression test that the route cannot change status backwards or out of order.
**Detection:** Audit rows with `actor = driver` and `completed` within minutes of assignment; GNet vs Prestigo status mismatches; calendar API 429s.
**Phase:** P-DRIVER, with `transitionBooking` introduced in P-FOUND so admin and kanban never bypass it.
**Confidence:** HIGH (repo + architecture reasoning).

### C8: No-show charge disputes and false no-shows
**What goes wrong:** A 100% off-session charge against a cash booking is the highest-dispute action in the system. Issuer reason families to expect: "service not provided / cancelled", "fraudulent" (cardholder claims they never authorized), "unrecognized". Stripe charges a dispute fee even when you win (third-party sources quote about 15 in local currency; the received fee is generally not returned); lost disputes also cost the amount.
**Prevention:**
- A no-show is an **operator decision**, never a driver tap alone. The driver marks `no_show` with a note; admin sees an evidence panel and confirms; only then does the charge run.
- Evidence bundle assembled automatically at charge time: consent record (C5), terms version, booking confirmation email timestamp, flight status snapshot, driver timestamps (`arrived`, wait duration), call/message log, notes. Stripe asks for the cancellation policy plus proof the customer agreed at booking.
- Wait rules must be explicit in terms (free wait before no-show: for example 60 min airport, 15-30 min city) and enforced (cannot mark no-show before the threshold elapses from pickup time, airport rule counted from the *pickup* time, not landing).
- Send a no-show notice email immediately with the evidence and refund-review contact. A friendly human path resolves many would-be chargebacks.
- Add a `charge.dispute.created` / `closed` handler (none exists today) that flags the booking, notifies the operator, and stores the dispute id on the ledger.
- Cap admin-initiated charges server-side at the outstanding balance, never accept an arbitrary amount from the client, write an audit-log row and alert on each charge. A compromised admin session must not be able to charge arbitrary amounts to any saved card.
**Detection:** `charge.dispute.created` on `no_show_fee`; ratio of no-show charges to bookings; same card charged twice.
**Phase:** P-HOLD (charge), P-DRIVER (no-show semantics).
**Confidence:** MEDIUM (Stripe evidence guidance verified in part; issuer-specific outcomes vary).

### C9: Vercel Hobby cannot run an hourly or minute-level scheduler
**What goes wrong:** Hobby cron is **once per day with ±59 min precision** (verified, Vercel docs). `vercel.json` already shows the symptom: `app/api/cron/reminder-2h` exists but is not scheduled. A design that says "a job runs every 15 minutes, finds bookings 72 h out, and creates holds" cannot ship on Hobby. Related: hold windows (C1) shrink by up to 24 h of slack, the failure-recovery timeline (C3) cannot rely on hourly retries, and a function that loops over many bookings can exceed `maxDuration`.
**Prevention:**
- Use the **QStash** already configured in v4.0 for per-booking timers: when a booking is confirmed, publish a delayed message (`not-before` = `pickup_utc - hold_lead`) to a signed internal endpoint; same for undo-window captures and recovery reminders. Verify QStash signatures; keep the daily cron as a **reconciliation sweep** (idempotent catch-up for anything missed), not the primary trigger.
- Every handler is idempotent and processes one booking per invocation.
- Re-schedule QStash messages when pickup time changes (AEDIT, airport offset, flight delay) or the booking is cancelled; otherwise stale timers fire against moved trips. Make the handler re-read the booking and no-op if the due time moved.
- Check QStash plan limits before relying on it (message quota not verified here, LOW confidence). Design the sweep so quota exhaustion degrades to "late by hours", not "never".
**Detection:** Bookings with `pickup_utc` within lead window and `payment_state = card_saved` and no hold attempt (sweep report).
**Phase:** P-FOUND (scheduler abstraction), P-HOLD.
**Confidence:** HIGH.

### C10: Time-zone and DST handling in scheduling, calendar and the airport offset
**What goes wrong:** Prague is CET/CEST and Vercel runs UTC. The repo stores `pickup_date` / `pickup_time` text plus `pickup_utc`, and has a correct `getPragueTodayISO()` helper. Failure modes:
- Hold lead computed as "5 days" in calendar days or via `new Date()` local arithmetic instead of from the `pickup_utc` instant.
- Wall-clock times that do not exist or repeat: **2027-03-28 02:00→03:00** (a 02:30 pickup does not exist) and **2027-10-31 03:00→02:00** (02:30 occurs twice). Converting Prague wall-clock to UTC with naive offset math picks the wrong hour.
- Calendar UI built from `new Date(utc)` in the browser's timezone: an admin or driver abroad sees bookings on the wrong day; a month grid built with `Date` math shifts events at midnight UTC. Day views have 23 or 25 hours on DST days.
- Airport offset: landing 14:00, pickup 14:30, free waiting 60 min **from pickup time**. If `pickup_utc` still means landing time, reminders, Google Calendar events, driver dispatch, GNet push and the hold lead all use the wrong instant. The daily flight-refresh cron (Hobby) cannot track same-day delays.
**Prevention:**
- Store two instants: `landing_at` (if flight) and `pickup_at` (the dispatch time); `pickup_utc` stays the single operational instant and equals `pickup_at`. Free-wait clock starts at `pickup_at`; document it in UI and terms.
- All schedule math on instants (UTC) with `Intl`/`Temporal`-style Prague conversion in one helper next to `lib/prague-date.ts`. Add fixture tests around both 2027 DST transitions (non-existent and ambiguous times, behavior documented: reject or shift forward).
- Calendar and kanban group by `pickup_date` strings (already Prague wall-clock), never by browser-local `Date`. Week starts Monday. Render times with an explicit `timeZone: 'Europe/Prague'`.
- Flight delay beyond threshold should notify the operator (not silently move pickup), and moving `pickup_at` must re-schedule QStash timers (C9).
**Detection:** Tests failing at DST fixtures; bookings appearing on the neighboring day in the calendar for a non-Prague browser (test with `TZ=America/Los_Angeles`).
**Phase:** P-PRICE (offset), P-ADMIN (calendar), P-HOLD (timers).
**Confidence:** HIGH.

### C11: Quote and recovery links as unguessable-token surfaces (leaks via analytics, referrers, scanners, reuse)
**What goes wrong:** Quote view, quote accept, deposit and card-recovery pages are public URLs that authorize money flows. Failure modes:
- Predictable or short tokens, or tokens stored in plaintext in the DB (a DB read leaks live links).
- **Token in the URL path leaks to third parties:** GA4 `page_location`, Meta Pixel, Google Maps/Stripe subresource `Referer`, Vercel logs, browser history, chat-previews. The repo's trip sheet already carries the same class of risk.
- **Email/messenger link scanners and previews issue GET** requests; if GET accepts or marks the quote "viewed/accepted", scanners accept quotes.
- **Stripe Payment Links are reusable**: one deposit link paid twice, or paid after the quote was edited or expired. v2.1 already shipped only a 409 guard for this class (CR-02: actual `paymentLinks.update active:false` still open).
- **Quote edited after sending**: the customer pays the old amount; the old link remains valid.
- Amounts or currency taken from URL/query instead of the quote row.
- Expiry only enforced client-side; expired quote still payable via a cached Checkout Session.
**Prevention:**
- 256-bit random token (`crypto.randomBytes(32)` base64url), store only a hash (SHA-256), compare timing-safe, separate tokens for view vs pay, `expires_at` + status (`draft/sent/accepted/expired/revoked`), uniform 404 for unknown/expired/revoked (no enumeration oracle), rate-limit by IP.
- Quotes are **immutable once sent**: edits create version n+1 and revoke version n's token and Stripe objects (deactivate the Payment Link, or expire the Checkout Session). Server recomputes the payable amount from the quote row.
- Prefer one **Checkout Session per attempt** (short `expires_at`, `client_reference_id`/metadata = quote id + version) over a long-lived Payment Link; if using Payment Links, set a one-completed-session restriction and deactivate on first success, plus idempotent webhook reconciliation that tolerates a second payment (alert + refund path).
- Accept / pay actions are `POST` with CSRF; `GET` is side-effect-free.
- Route-level headers: `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, excluded from sitemap and analytics page-view URL (redact the token segment in the GA4/Meta page location sent for those routes). Ensure `middleware.ts` CSP/CSRF treat the new route family correctly and that the static-extension matcher rule is not weakened.
- Pages use `params.locale` + `setRequestLocale` (never `getLocale()`), and the quote renders in the customer's locale including RTL bidi-isolated amounts. Mark the route `force-dynamic`.
- Commit with `security:` prefix; add tests for expired / revoked / edited / replayed-token cases.
**Detection:** Tokens present in analytics URLs; quote `accepted` rows created by GET; two succeeded payments for one deposit.
**Phase:** P-QUOTE.
**Confidence:** HIGH (standard practice plus repo precedent), MEDIUM on the exact Payment Link restriction parameter name (confirm in Stripe API reference).

---

## Moderate Pitfalls

### M1: Cards that cannot be saved or reliably charged later
**What goes wrong:** Not every payment method is reusable off-session or holdable. With `automatic_payment_methods: { enabled: true }` the Payment Element can offer methods that do not support manual capture or off-session reuse. Link is not eligible for extended authorization when integrated as a payment method. Single-use virtual cards (for example disposable numbers from fintech apps) and prepaid cards pass the SetupIntent and fail at hold time. Apple Pay / Google Pay work for card setups (device tokens), but Stripe recommends configuring Apple Pay merchant tokens for deferred payments.
**Prevention:** SetupIntent and hold PIs use `payment_method_types: ['card']` only. Inspect `payment_method.card.funding` and `wallet` after setup: warn on `prepaid`; for the cash+guarantee mode require a non-prepaid credit/debit card. Configure Apple Pay merchant token info for the hold date. Test with Stripe's cards that succeed at setup then fail on charge (confirm exact numbers in Stripe's testing page).
**Phase:** P-CARD. **Confidence:** HIGH (Stripe docs) / MEDIUM (virtual card behavior).

### M2: Card expires or changes between booking and hold; weeks-ahead bookings
**What goes wrong:** Booking 8 months out; the saved card expires before T-3d. The first real authorization only happens at hold time (a zero-amount setup validates the card exists, not funds).
**Prevention:** At setup, store `exp_month/exp_year`; if the card expires before `pickup_utc`, block or warn. A "card health" pre-check job 10-14 days out (retrieve PaymentMethod; Stripe's automatic card updater helps but is not guaranteed) emails "update your card" with a secure update link (SetupIntent on-session). Surface "card on file valid until" in admin.
**Phase:** P-HOLD. **Confidence:** MEDIUM.

### M3: Customer objects for guests (duplicates, leakage, erasure)
**What goes wrong:** Guest checkout must remain available. Options: a new Stripe Customer per guest booking (many duplicates, harmless) vs reuse by email (a stranger entering someone else's email could see or reuse saved cards; PaymentMethods attached to one Customer cannot be used with another). Logged-in users should map `user_id` → one Customer. GDPR erasure must reach Stripe.
**Prevention:** Guest: one Customer per booking attempt, created with an idempotency key from `attemptId`, metadata `{booking_id}`, never listing saved cards to guests. Logged-in: store `stripe_customer_id` on `customer_profiles` (server-resolved from the session, consistent with the existing "`user_id` never trusted from client" decision). Extend the erasure pipeline: detach PaymentMethods, delete or anonymize Customer, keep anonymized ledger rows for accounting retention. Never store PAN or card data (PCI scope stays SAQ A).
**Phase:** P-CARD, P-FOUND (erasure extension). **Confidence:** HIGH.

### M4: Webhook coverage, ordering and duplicate delivery for new event types
**What goes wrong:** New flows depend on `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.captured`, `charge.dispute.*`, `checkout.session.completed/expired`. The Stripe Dashboard endpoint must be subscribed to each; the repo already contains `enable-checkout-webhook-event.mjs`, evidence that a missing subscription has bitten before. Events can arrive out of order and more than once; the existing pattern (side effect first, claim in `stripe_processed_events` after) is correct for handlers that are themselves idempotent, but new handlers that charge money or send mail need idempotency at the effect level (ledger unique keys), not just event-id dedup. Test-mode and live-mode endpoints have separate secrets.
**Prevention:** An owner-run script (like the existing `.mjs` pattern) to subscribe the endpoint to the new events and verify; contract tests that replay each event twice and out of order; handlers re-fetch the object from Stripe rather than trusting event payload age. Return 2xx only after the durable write.
**Phase:** P-FOUND. **Confidence:** HIGH.

### M5: The Stripe test environment is not actually usable (local key is a dead placeholder, Preview deploys fail)
**What goes wrong:** Project memory notes the `.env.local` test key is invalid, and Vercel Preview always fails (missing Supabase env). The first realistic exercise of 3DS-required cards, off-session failures, holds and expiry will happen in production.
**Prevention:** First task of the milestone: a working Stripe **test-mode** setup (test key + `stripe listen`/test webhook secret) usable from a local script or a dedicated test deployment; `pricing_globals` feature flag with **owner-only canary** (for example bookings with a specific email/promo flag) before opening to customers; scripted E2E runs through Stripe's SCA test cards (always-authenticate, authenticate-unless-set-up, insufficient funds after authentication) and a Stripe test-clock-free simulation of expiry by calling `cancel`. Remember that keys must be run by the owner (agents do not read `.env.local`).
**Phase:** P-FOUND. **Confidence:** HIGH.

### M6: Pre-existing flows that silently change meaning
**What goes wrong:**
- `bookings.status = 'confirmed'` meant "paid". A guaranteed-but-unpaid booking (card on file or cash) is confirmed with zero money. Stats RPCs (migrations 081-083), the Chatwoot panel, `paid_at` semantics, reminders (`reminder-24h` filters `confirmed`) and the abandoned-checkout queue all assume paid-ness.
- GA4 server-side `purchase` and Meta CAPI `Purchase` fire from the webhook on payment. For holds and cash they must fire at booking confirmation (value = agreed price) with a flag, or revenue reporting will be off by weeks or entirely missing for cash.
- The `unpaid` status is the abandoned-checkout queue. A SetupIntent attempt that never completes must still land there, keyed by `setup_intent_id`/`attemptId`.
**Prevention:** Add explicit `payment_state` (`none|card_saved|held|captured|failed|refunded`) and `payment_mode` (`pay_now|hold|cash`) columns; update stats RPCs and panel DTOs in the same phase (add migration, next number 084); update reminders and revenue definitions consciously; define the analytics rule once.
**Phase:** P-FOUND, P-CARD. **Confidence:** HIGH.

### M7: Multiple trips, one card: round trips, quote bundles, group links
**What goes wrong:** Round trips store two legs under one PaymentIntent today. Quotes bundle several days. Legs have different pickup dates, so one hold cannot cover both. Cancelling one trip must release or reduce only its portion. The existing "group payment link" (one Stripe link for many bookings via metadata) overlaps with deposits.
**Prevention:** One payment row **per leg/trip**, each with its own hold timing; a quote is a parent with child bookings and a deposit allocation rule (which trips the deposit covers, what happens on single-trip cancellation: refund vs credit). Refund math for a deposit on a cancelled trip goes through the same cancel-vs-refund decision tree as C2.
**Phase:** P-FOUND (schema), P-QUOTE. **Confidence:** HIGH.

### M8: Multi-stop pricing and waiting fees
**What goes wrong:**
- Pricing must stay **server-authoritative** (existing pattern). Client-sent waypoints are untrusted: cap count, validate addresses, and recompute distance server-side.
- Google routing with waypoints: stop order (do not let the API reorder stops unless intended), per-request billing tier and waypoint limits, quota/cost growth, no caching of results keyed on raw address strings; the shared Maps API key already has a ToS risk note.
- Per-stop waiting needs per-stop timestamps. The new strict "single next step" driver flow has one global sequence; waiting per stop needs `arrived_at_stop_n` / `departed_stop_n` or admin-entered waiting, otherwise waiting fees are disputable.
- Definitions: "15 min free, then fee per extra 15 min" needs a rounding rule (each started block?) and a snapshot of the fee config on the booking (config edits must not change past bookings).
- Fee text in UI/emails/messages must come from `pricing_globals` as parameters, not typed numbers (C5 note about catalogs).
- Waiting fee exceeds hold (C4).
**Prevention:** Specify and test the fee function (pure, table-driven tests for 0/14/15/16/29/30/31 minutes); store per-stop times; show estimated waiting rules at booking; extras billed as `extra_fee` under the mandate wording; test price parity between quote preview, booking, hold and capture amounts.
**Phase:** P-PRICE. **Confidence:** MEDIUM-HIGH.

### M9: Kanban and calendar bypass the transition rules and money side effects
**What goes wrong:** Drag-and-drop makes `confirmed → completed` one gesture. `UI_TRANSITIONS` intentionally hides shortcut transitions; a kanban that uses `VALID_TRANSITIONS` re-exposes them, and now `completed` triggers capture. Optimistic UI without server rejection shows a card in the wrong column after a 409. Calendar drag-to-reschedule skips the AEDIT price-review / notification path and the QStash re-scheduling. The admin list is mount-only (no realtime, DTRIP-05 debt), so two operators see stale boards and act on stale states. Large boards (thousands of bookings) are slow if loaded unbounded.
**Prevention:** Kanban uses `UI_TRANSITIONS` only; dropping into `completed`/`cancelled` opens a confirm dialog that states the money effect ("will capture €…" / "will release hold" using live values, no hard-coded currency). All moves go through `transitionBooking` (C7) with `expectedFrom`; 409 triggers rollback + refetch. Reuse the Phase 65 horizon/RPC (`admin_search_bookings`) with per-column limits; add polling or `updated_at` conflict detection. Calendar is read-only plus "open booking" in v5.0; rescheduling stays in the edit modal.
**Phase:** P-ADMIN. **Confidence:** HIGH.

### M10: Light theme on a dark-first design system
**What goes wrong:** Tokens such as `bg-anthracite`, `copper`, `anthracite-light` are named and valued for the dark navy theme; hard-coded hex values and status chips in admin components will be unreadable on light. A client-side `localStorage` theme read causes a flash of wrong theme; with the CSP nonce, an unnonced inline script is blocked; a persisted collapsed-sidebar state read on the client causes hydration mismatches. The public site already has a "light section theme" class, so a global toggle can leak into marketing pages.
**Prevention:** Scope the toggle to the admin layout via `data-theme` on the admin root; remap CSS variables (not Tailwind classes) for light; grep and replace hard-coded colors in admin components; check contrast for status chips; store theme and sidebar state in a **cookie** read in the server layout (no flash, no mismatch); if an inline script is needed, pass the middleware nonce. Visual-check the admin in both themes with the preview tooling before merge.
**Phase:** P-ADMIN. **Confidence:** MEDIUM-HIGH.

### M11: New emails and customer-facing copy default to English only
**What goes wrong:** v3.0 left "localized client emails + confirmation page" as backlog 999.x. New v5.0 emails (hold notice, recovery link, no-show notice, quote, deposit receipt, receipts for captured payment) will ship EN-only unless planned, and the repo rule requires real translations in all locales for new `messages/en.json` strings. The Anthropic-credit-dependent translation workflow is disabled, so translations must be done in-session. Never use `--dry-run` on the repo tree. Legal text (C5) in machine translation risks meaning drift.
**Prevention:** Budget translation for each phase; localize emails using the booking's stored locale; legal clauses reviewed in at least EN + CS-aware reviewer for the base text; use plain ICU parameters for amounts and dates; `&ccaron;`-style entities are forbidden in emails (use UTF-8).
**Phase:** every phase that adds copy. **Confidence:** HIGH.

### M12: Stripe API usage hygiene
**What goes wrong:** `maxNetworkRetries: 0` plus no idempotency keys on the new calls; mixed API versions; `Stripe.createFetchHttpClient()` timeouts on Vercel; amounts computed with floating point; CZK vs EUR minor units mistakes; rounding of 15-minute blocks times fees.
**Prevention:** One Stripe client module for all v5.0 paths with explicit retries and an idempotency-key argument that is mandatory in the helper signature; amounts as integers in minor units end-to-end; unit tests for CZK and EUR; log Stripe request ids.
**Phase:** P-FOUND. **Confidence:** HIGH.

### M13: Admin as a card-charging console
**What goes wrong:** "Remainder via saved card" lets an operator charge a customer's card. Mistyped amount, double click, or stolen admin session equals real harm.
**Prevention:** Amount is derived server-side from outstanding balance (editable only downward with a reason), double-confirmation modal, idempotency key per (booking, intent-to-charge, version), audit-log row (FOLLOW-02 mechanism exists), email alert to the owner on every off-session charge, per-day cap. Follow the project's admin auth guard order and the 400-vs-422 two-step parse rule.
**Phase:** P-HOLD / P-QUOTE. **Confidence:** HIGH.

---

## Day-trip catalogue SEO pitfalls (P-TRIPS)

### S1: Templated, thin or near-duplicate pages multiplied by 7 locales
**What goes wrong:** N trips × 7 locales is a programmatic-SEO pattern. Pages that differ only by town name and a machine-translated paragraph can be treated as thin/duplicate and drag down the existing mirror-route and landing-page cluster. hreflang pointing to locales that are not indexable is ignored or flagged.
**Prevention:** Each trip needs genuinely unique content before indexing: distance and drive time, suggested timeline, stops, seasonal notes, FAQ specific to that trip, original photos. Use the existing index-aware `getAlternates()`; ship a locale for a trip only when its content is complete (otherwise `noindex` and omit from hreflang/sitemap). Start with a small number of strong trips rather than 20 thin ones.
**Confidence:** MEDIUM-HIGH.

### S2: Cannibalization with existing route pages
**What goes wrong:** `/routes/prague-karlovy-vary` (transfer intent, 30 indexable routes + mirror pages) and a new "Karlovy Vary day trip from Prague" page can compete for the same queries.
**Prevention:** Keyword map before building: transfer (one-way, point-to-point) vs day trip (return same day, itinerary, waiting included). Distinct titles/H1, reciprocal internal links, no cross-canonicals, FAQ answers that differentiate. Check GSC (existing `gsc_now.py` workflow) for current rankings of the routes before choosing slugs.
**Confidence:** MEDIUM-HIGH.

### S3: Structured data with live prices, rating claims, and static rendering
**What goes wrong:** JSON-LD `Offer.price` must equal the visible price and come from the admin (`route_prices`), but static generation bakes prices in at build, so an admin price change leaves stale JSON-LD and stale page text until the next deploy. Golden-HTML/JSON-LD snapshot tests drift daily unless `priceValidUntil` is normalized (repo rule). Google has no dedicated rich result for `TouristTrip`; use `Product`/`Service` with `Offer`/`AggregateOffer` (price per car class), and keep currency consistent between markup and visible page. Fabricated or self-serving `AggregateRating`/`Review` markup risks a manual action; only use real data (the repo has `lib/google-reviews.ts`).
**Prevention:** Prices via the live-prices helper and the `<Price />` component; ISR with on-demand revalidation (`revalidateTag`/path) triggered when the admin saves prices, so pages and JSON-LD update without a deploy; no price in `<title>`, meta description or OG text (marketing no-price rule), and no typed numbers in MDX/messages; tests for the snapshot normalization; ratings only from real review data and only where eligible.
**Confidence:** MEDIUM-HIGH.

### S4: i18n / rendering rules specific to this repo
**What goes wrong:** `getLocale()` forces dynamic rendering (burned Vercel Hobby CPU once, PR #59); the new pages must use `params.locale` + `setRequestLocale` and `generateStaticParams` for locale × trip. New hero AVIF images require the middleware matcher to already exclude `.avif` (it does, keep it that way when adding other asset types such as `webp` OG images or `.json`). Slug policy: keep ASCII EN slugs across locales (like routes) and never rename after launch without a 301 map; diacritics (Český Krumlov) live in names, not slugs. Sitemap, `llms.txt` and `llms-data` generators must not hard-code prices (the SEO audit already flagged llms.txt prices). H1 animation hurting LCP was a past audit finding; do not repeat it on new heroes.
**Prevention:** Copy the route-page workflow (sections, pricing source, fleet cards, timeline, sitemap steps); add the new family to the sitemap/hreflang tests; verify one RTL (ar) page visually.
**Confidence:** HIGH.

### S5: Custom-tour request and quote handoff must reuse the v4.0 lead pipeline
**What goes wrong:** Building a separate form path duplicates the Supabase → outbox → EspoCRM/Chatwoot logic, loses VPS-independence guarantees, or lets form failures block the page. Spam on a public form feeding the CRM.
**Prevention:** Reuse the existing lead storage + outbox (store-first, no regression if downstream is down), honeypot + rate limit + body-size guard, and the quote link flow of C11 for the operator's answer. Add `source = custom_tour` for stats.
**Confidence:** HIGH.

### S6: Booking-flow integration of a new trip type
**What goes wrong:** `TRIP_TYPES`, the Zod enum in `create-payment-intent`, `types/booking`, price calculation, GNet vehicle/trip mapping, analytics, emails and admin forms all enumerate trip types. A new `day_trip` type touches every one; a missed spot fails at payment time.
**Prevention:** Prefer reusing `daily`/`hourly` semantics with a `product_ref` pointing to the day-trip row if feasible; otherwise grep all enum sites and add tests that iterate every type through pricing → PI creation → webhook → email. Confirm with GNet how day trips appear (or that they do not sync).
**Confidence:** MEDIUM-HIGH.

---

## Minor Pitfalls

### m1: Customers confused by two bank entries
Authorization "pending" at T-3d, then captured after the trip, sometimes shown as two lines. Send an email at hold time stating amount, date and that it is not a charge; use a clear Stripe statement descriptor (also lowers "unrecognized" disputes).

### m2: Explicitly cancel unused holds
Letting a hold expire instead of cancelling keeps the customer's funds locked and may incur network misuse-of-authorization fees on some pricing plans (LOW confidence; verify with Stripe if on IC+). Cancel the PI the moment the booking is cancelled or replaced.

### m3: Stripe fee expectations
SetupIntent and cancelled authorizations incur no processing fee, but captured-then-refunded payments do not get fees returned, and disputes carry a fee. The milestone's "0 € on cancellation" holds only when cancellation happens **before capture**; the cancel route must prefer cancel over refund wherever possible and the UI should show which path was used.

### m4: Currency display in Arabic RTL
Hold, capture and quote amounts must keep bidi-isolated rendering (existing v3.0 rule) in new components and emails.

### m5: Calendar integration noise
The Google Calendar trigger fires on updates; adding fields to `bookings` that change often (payment state, trip progress) can generate webhook noise. Restrict trigger conditions to scheduling-relevant columns.

### m6: Backfill and defaults for new columns
New NOT NULL columns on a live `bookings` table need defaults and a backfill for old rows (`payment_mode = 'pay_now'`, `payment_state` derived from `paid_at`/status). Migration numbering continues at 084.

### m7: Function PUBLIC EXECUTE grants
New SECURITY DEFINER RPCs (capture claim, hold claim, stats updates) must re-REVOKE `FROM PUBLIC, anon, authenticated` after any DROP+CREATE (known gotcha).

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| P-FOUND: ledger, webhooks, test env | Existing handlers (C2), no working test mode (M5), missing event subscriptions (M4), paid-ness semantics (M6) | Ledger + `metadata.kind` routing; status-guard `charge.refunded`; subscribe script; feature flag + canary; `transitionBooking` single writer |
| P-CARD: SetupIntent checkout, terms | Methods that cannot be saved (M1), thin consent (C5), CTA/legal wording (C6), guest Customers (M3), translation gaps (M11) | `card` only; unticked consent with stored text hash; legal checkpoint before launch; all-locale terms; Customer-per-attempt for guests |
| P-HOLD: scheduler, hold, capture, cancel | Visa MIT 4d18h (C1), 3DS/declines + double hold (C3), amount drift (C4), Hobby cron (C9), disputes (C8) | ~72 h lead, on-session hold for near trips, `capture_before` tracking, QStash per-booking timers + daily sweep, idempotency/unique active hold, evidence bundle |
| P-DRIVER: next-step flow | Bearer link triggers capture (C7), races, dual truth, side-effect storms, GNet decision | CAS transitions, delayed capture with undo, server-enforced order, `security:` commits, selective side effects, explicit `on_board` mapping |
| P-QUOTE: quotes + deposits | Token leaks and reuse (C11), editable-after-send, Payment Link reuse, deposit allocation (M7), VAT docs (C6), admin charge risk (M13) | Hashed tokens, immutable versions, per-attempt Checkout Sessions, no-store/no-referrer/noindex, allocation rules, audit + caps |
| P-PRICE: multi-stop, waiting, airport offset | Client-trusted waypoints, rounding rules, per-stop timestamps, hold shortfall (C4), pickup semantics + DST (C10) | Server-only recompute, table-driven fee tests, snapshot config, `landing_at` vs `pickup_at`, DST fixtures |
| P-ADMIN: kanban, calendar, theme, sidebar | Drag bypasses transitions (M9), stale boards, timezone grouping (C10), dark-only tokens + FOUC (M10) | `UI_TRANSITIONS` + confirm dialogs, date-string grouping, cookie-based theme/sidebar, admin-scoped `data-theme` |
| P-TRIPS: catalogue + SEO | Thin duplicates ×7 (S1), cannibalization (S2), stale JSON-LD prices (S3), trip-type enum sites (S6), `getLocale()` (S4) | Unique content gate per locale, keyword map, ISR + tag revalidation, enum audit, `params.locale` |

## Suggested research flags for the roadmap

- **Needs deeper research / external check before planning:** P-CARD legal wording and consumer-law points (C6; get a Czech lawyer or ČOI guidance), P-HOLD decline-code handling and Stripe test cards (C3), QStash quota (C9), Payment Link restriction parameters (C11).
- **Standard patterns, unlikely to need research:** P-ADMIN theme/sidebar/kanban (apply M9/M10), P-TRIPS page templating (follow route-page workflow plus S1-S6).

## Sources

- Stripe, "Place a hold on a payment method" (authorization validity table: Visa MIT 5 days / exact 4 d 18 h, Visa CIT 7 d, MC/Amex/Discover 7 d; single capture; partial capture releases remainder; `capture_before`): https://docs.stripe.com/payments/capture-later (HIGH, fetched 2026-11-02)
- Stripe, "Extended authorization" (CIT only, IC+ feature, Discover excludes taxicabs/limousines, Link caveat): https://docs.stripe.com/payments/extended-authorization.md?platform=web&ui=elements (HIGH)
- Stripe, "Overcapture" (IC+; Visa excludes EEA merchants; SCA limits): https://docs.stripe.com/payments/overcapture.md?platform=web&ui=elements (HIGH)
- Stripe, "Save a customer's payment method without making a payment" (SetupIntent, off_session, `authentication_required` recovery, required terms content, keep written agreement record): https://docs.stripe.com/payments/save-and-reuse.md?payment-ui=elements (HIGH)
- Vercel, "Usage & Pricing for Cron Jobs" (Hobby: once per day, ±59 min): https://vercel.com/docs/cron-jobs/usage-and-pricing (HIGH, last updated 2026-07-15)
- Stripe dispute guidance (cancellation policy + proof of agreement; dispute fees per third-party summaries): https://docs.stripe.com/disputes/categories and https://docs.stripe.com/docs/disputes/withdrawing (MEDIUM; fee amounts from third-party summaries)
- Repo reading (HIGH): `app/api/webhooks/stripe/route.ts` (`handleChargeRefunded`, `payment_intent.succeeded` unexpected-capture branch, `stripe_processed_events`), `app/api/create-payment-intent/route.ts` (`automatic_payment_methods`, `maxNetworkRetries: 0`, `unpaid` capture), `app/api/admin/bookings/cancel/route.ts` (`refunds.create`), `app/api/driver/trip/[token]/progress/route.ts` (isolation by omission), `lib/booking-transitions.ts` (`VALID_TRANSITIONS` / `UI_TRANSITIONS`), `lib/prague-date.ts`, `vercel.json` (daily crons only, `reminder-2h` unscheduled), `lib/stripe-payment-links.ts` (deactivate helper, CR-02).
- Czech/EU consumer law (Consumer Rights Directive 2011/83/EU Art. 3(3)(k), 8(2), 16(l), 19, 22; Czech Civil Code §§ 1810-1837, 2051; Package Travel Directive 2015/2302; Act 159/1999): recalled from training knowledge, statute text could not be fetched (LOW-MEDIUM; legal review required).
- Mastercard/Visa authorization-misuse fee remark (m2): LOW, unverified.
