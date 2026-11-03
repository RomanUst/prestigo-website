# Feature Research

**Domain:** Premium chauffeur service (Prague) adding card-on-file payments, multi-trip quotes, dispatcher UX, driver step flow, multi-stop/airport pricing and a day-trip catalogue
**Milestone:** v5.0 Payments, Quotes & Day Trips (subsequent milestone; only NEW features are covered)
**Researched:** 2026-11-02
**Confidence:** MEDIUM-HIGH (Stripe card-network rules HIGH from official docs; competitor policies MEDIUM from help-centre pages; dispatcher/kanban conventions and schema.org/Google behaviour MEDIUM, partly from domain knowledge)

Project rules applied: prices are never typed in `app/`/`components/` (they come from the admin via `lib/route-prices.ts`, `lib/pricing-config.ts`, `lib/live-prices.ts`); marketing content contains no prices and no ride-hailing comparisons. Every number below (15 min, 60 min, 24 h, %, EUR) is an example from research or from the owner brief. It must be an admin-configurable setting, not a constant.

---

## Critical Finding (read first): the "hold ~5 days before trip" rule collides with card-network windows

Source: Stripe "Place a hold on a payment method" (HIGH, official docs, fetched 2026-11-02).

| Card brand | Merchant-initiated (off-session, cron-created) hold | Customer-initiated (customer present) hold |
|---|---|---|
| Visa | **5 days (exactly 4 d 18 h)** | 7 days |
| Mastercard / Amex / Discover | 7 days | 7 days |

- Stripe states MIT vs CIT is decided by card-network signals, not just `off_session`. Do not rely on getting the longer CIT window for a cron-created hold.
- A Visa hold created exactly 5 days before pickup **expires about 6 hours BEFORE the trip starts**, so capture-after-completion would find a cancelled authorization. Visa is the majority of cards.
- Extended authorization (up to 30 days) is NOT a fix: it is IC+ pricing only, for Visa "other categories" applies to customer-initiated transactions only and costs +0.08%, and Discover excludes taxicabs/limousines.
- Stripe's `capture_before` field on the charge is the only source of truth for the real expiry. Persist it and alert on it.
- Partial capture is allowed (capture <= authorised amount, remainder released). Capturing MORE than the hold needs overcapture (restricted by category). So waiting-time and extras that raise the final price cannot ride on the hold and need a second off-session charge.

**Recommendation for the roadmap:**
1. Place the hold at about T-3 days (about 72 h before pickup), not T-5. This leaves a safe window for Visa (4 d 18 h) through pickup plus a long day trip. Make "hold lead time" an admin setting, and default it so that `lead + max_trip_duration < 4 d 18 h`.
2. If the booking is made inside the hold lead time, the customer is on-session at checkout. Authorise at checkout with the saved/entered card (customer-initiated, 7-day Visa window). Do not wait for the cron.
3. Capture-time fallback is mandatory: at "completed", if the PaymentIntent is no longer `requires_capture` (expired or cancelled), create a fresh off-session PaymentIntent on the saved card for the final amount. A hold is a convenience and a customer-trust signal; the saved card plus mandate is the real guarantee.
4. Multi-day quote trips: never hold the whole amount upfront. Hold per trip/day at its own T-3d, or charge the remainder with the operator's chosen method.

---

## Feature Landscape

### Table Stakes (Users Expect These)

#### A. Card-on-file, hold, capture (Features 1, 2)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Card saved at checkout without charge (SetupIntent, 3DS) | Hotel-style "card guarantees booking" is standard in premium transport. Blacklane shows a pending authorization that is reversed on cancellation. | MEDIUM | Checkout `mode: setup` (or Elements SetupIntent) plus an on-page mandate sentence ("You authorise Prestigo to charge this card for the fare ... and for a no-show/late-cancellation fee"). 3DS at setup is what makes later off-session charges succeed under SCA. Guest checkout must keep working (Stripe Customer created per booking/email). |
| Pre-booking cancellation policy statement, shown before pay and in the confirmation email | Industry norm: Blacklane free cancel until 1 h before pickup. GetYourGuide, Viator and Daytrip free cancel until 24 h before start. Disputes drop when the policy is visible pre-purchase. | LOW | One policy object per product type (transfer vs day trip vs airport) in admin: `free_cancel_hours`, `late_cancel_fee_pct`. EU consumer law: dated transport/leisure services are normally exempt from the 14-day withdrawal right, but the exemption must be disclosed. Confirm wording with the legal skill before shipping (MEDIUM, not legal advice). |
| Automatic hold before the trip (cron), idempotent per booking | The owner's core value: no Stripe fee lost on late cancellations. | MEDIUM-HIGH | Extend the existing cron pattern (`app/api/cron/reminder-24h`, `outbox-sweep`). Idempotency key = booking id + attempt. Store PI id, `capture_before`, `amount_capturable`, hold status on the booking. |
| Cancel before capture = release the authorization (0 EUR fee) | Stripe: cancelling an uncaptured PaymentIntent voids it; a refund after capture does not return processing fees. This is the whole point of the feature. | LOW | Admin "cancel" and customer-initiated cancel call `paymentIntents.cancel`. Pre-hold (SetupIntent only) cancellation = nothing to void. |
| Capture after completion | Hotel/rental pattern. | MEDIUM | Triggered by driver "completed" (Feature 5). Must be idempotent and never block the driver UI (failure = admin alert, not a driver error). Capture amount may be <= hold. |
| Failed hold -> payment link to the client + operator alert | The owner requirement; also the standard recovery for `authentication_required` / insufficient funds on off-session payments. | MEDIUM | Reuse existing payment-link machinery (Stripe Payment Links, group link, `unpaid` queue from v2.1). Email to client, alert to admin (+Chatwoot/Telegram if already wired). Mark booking `payment_attention`. Per Stripe SCA guidance the customer has to be brought back on-session when the bank demands authentication. |
| Payment state visible per booking in admin (card saved / hold placed / held until / captured / failed / released) | Dispatchers must see whether a trip is guaranteed. | LOW-MEDIUM | Badge on the list, kanban card and detail. Webhook-driven (`payment_intent.amount_capturable_updated`, `.canceled`, `.payment_failed`, `setup_intent.succeeded`). |
| Cash option: card saved only, no hold; cash paid to driver | Cash-on-delivery with a card guarantee is how Prague operators actually work. | MEDIUM | `payment_method = card_hold | cash_guaranteed | prepaid | invoice`. Operator marks "cash received" at completion. No cron hold for cash bookings. |
| No-show = 100% off-session charge | Owner requirement. Blacklane no-show is a driver-requested, ops-approved flow, paid only after a mandatory wait (30 min standard, 60 min airport) with Blacklane trying to contact the guest first. | MEDIUM | See "no-show workflow" below. Charge uses the saved card, off-session, with the mandate captured at setup. |

**No-show workflow (table stakes for defensibility):**
1. The driver can only tap "No-show" after "on site" plus the policy wait has elapsed (standard 30 min, airport 60 min from pickup time are the Blacklane benchmarks; owner config).
2. The system records on-site timestamp, wait elapsed, and the driver's note.
3. The operator confirms (after a call/message attempt, logged) and then clicks "Charge no-show". Not automatic.
4. Charge 100% on the saved card; failure -> payment link and alert; send an itemised email.

**No-show policy wording (copy requirements, from Blacklane/marketplace practice):** state (a) how long the chauffeur waits, (b) that the booking is then treated as a no-show and the full fare is charged, (c) that the card saved at booking is used. Put it in the checkout mandate, the confirmation email, T&Cs and each locale.

#### B. Quotes (Feature 3)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Public quote page at an unguessable link (`/quote/[token]`, noindex) | Standard proposal UX (HubSpot, Quoter, HoneyBook): client opens link, no login. | MEDIUM | Same token pattern as the driver `trip_token`. Token invalid if quote is withdrawn. Locale-aware (7 locales). |
| Itemised multi-trip/multi-day body | Core of the feature: each day shows date, time, route/stops, vehicle class, hours, line price; then total, currency, VAT line. | MEDIUM-HIGH | Quote = header + N trip lines (transfer, hourly, day trip). Totals computed server-side from the admin price sources. Operator may override line prices. |
| Explicit validity / expiry date, shown on the page; expired state with a "request a refresh" CTA | Proposal tools tie link validity to quote lifetime (HubSpot). Prices lock until expiry. | LOW-MEDIUM | `valid_until` required. Expired page: show the content greyed out and a "Request updated quote" button that creates a lead. Do NOT silently re-price. |
| Quote lifecycle statuses: draft / sent / viewed / accepted / deposit-paid / expired / declined / withdrawn | Operators need to follow up; "viewed" is the single most useful sales signal. | LOW-MEDIUM | `viewed_at` set on first load of the page. Surface in admin list and EspoCRM via outbox. |
| Accept button -> records acceptance | Quoter's "Accept Quote" pattern. Legal evidence = timestamp + terms version + IP/UA, not a drawn signature. | LOW-MEDIUM | Acceptance converts trip lines into bookings (one booking per trip, shared `quote_id`). |
| Deposit: operator sets % or fixed amount; client pays via a deposit link | Quoter / most invoicing tools offer fixed or %; deposit is taken from the quote total. | MEDIUM | Deposit link = Stripe Checkout. If the remainder method is "saved card", the deposit Checkout MUST save the card (`setup_future_usage=off_session`) so one 3DS does both. Deposit paid -> quote `deposit_paid` and bookings `confirmed`. |
| Remainder method chosen by operator: saved card / payment link / cash / invoice | Owner requirement; mirrors B2B practice. | MEDIUM | An enum on the quote, copied to each booking's payment model. Saved-card remainder reuses the hold/capture machinery (per trip). Invoice reuses the existing HTML->PDF invoice flow (no PDF lib in repo). |
| Operator can edit after sending; edits create a new version and void the old acceptance | Proposals change. Silent edits to an accepted quote are a dispute generator. | MEDIUM | `version` column. Client sees "this quote was updated". Audit log (v2.1 field-level audit pattern). |
| Quote email (branded) with the link and expiry | Sending mechanism. | LOW | Resend, existing templates. |

#### C. Admin UX (Feature 4)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Kanban columns = booking statuses, scoped by date horizon (today / tomorrow / next 7 days) | Dispatcher boards (Limo Anywhere-style) are always date-scoped. An all-time kanban is unusable. | MEDIUM | Reuse the v2.2 horizon setting (Future / Last N days / All). Columns follow `VALID_TRANSITIONS`; cancelled collapsed or hidden. |
| Cards show: pickup time, route, pax, vehicle class, driver, payment badge, flight status | The minimum a dispatcher scans. | MEDIUM | Reuse list row data. |
| Drag between columns limited to legal transitions (`lib/booking-transitions.ts`) | A kanban that allows illegal moves breaks the capture trigger and audit. | MEDIUM | Reject invalid drops with a toast. Every move goes through the same server route and audit log as the dropdown. |
| Calendar day / week / month | Standard dispatcher views. Day/week = time grid, month = per-day counts. | MEDIUM-HIGH | Colour by status (and optionally by driver). Click -> existing edit drawer. Multi-day quote trips appear on their own days. |
| Collapsible sidebar, persisted per operator | Small UX table stake. | LOW | localStorage; keyboard shortcut optional. |
| Light/dark theme toggle for admin | Owner requirement. | MEDIUM-HIGH | Cost is hidden: every admin component using hard-coded dark colours needs token conversion. Scope to `/admin` only (public site keeps its palette). Persist per user; respect `prefers-color-scheme` on first visit. |

#### D. Driver flow (Feature 5)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| One primary button with the label of the NEXT step only (en route -> on site -> passenger on board -> completed) | Limo Anywhere DriverAnywhere flow: On the Way -> On Location -> Customer in Car -> Dropped Off/Completed (No-Show optional); Blacklane driver app: button presses compute waiting time and cannot be edited later. | MEDIUM | Server enforces the order (not only the UI). Double-tap safe (idempotent per step). Big touch target, works on poor mobile networks. |
| Timestamp per step, immutable once written | Needed for waiting fees, no-show proof and disputes. | LOW | Dedicated columns already exist (v2.2). Add `on_board_at` if missing. |
| Final step needs a confirm ("Complete trip?") | Completion now triggers a payment capture. | LOW | Confirm modal with the amount NOT shown to the driver. |
| Time-gate on "en route" (do not allow hours before pickup) | Limo Anywhere warns drivers who change status too early (default 24 h before pickup). | LOW | Prevents accidental early status changes that would move cards on the kanban. |
| Driver status writes `booking.status`; admin sees it live | Owner requirement. Reverses the v2.2 isolation decision. | MEDIUM-HIGH | See dependency notes: `VALID_TRANSITIONS` has `en_route` and `on_location` but NO "on board" state, so decide: (a) add an `on_board` status, or (b) keep on-board as trip-progress only and map it to `on_location`. Recommendation: (a), because kanban and customer notifications benefit. The v2.2 grep-gate tests that forbid status writes from the driver route must be rewritten, not deleted. |
| No-show as a secondary, gated action (after on-site wait) | See no-show workflow. | LOW | Not part of the main button. |
| Admin sees status changes without reload | A dispatcher board that needs F5 is not a dispatcher board. | MEDIUM | DTRIP-05 tech debt (mount-only). Polling (30 s) is enough; Supabase Realtime is a differentiator. |

#### E. Multi-stop and waiting time, airport offset (Feature 6)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Add 1-N intermediate stops with autocomplete, reorder, remove | Blacklane lists extra stops and waiting time as billable extras. Clients expect to add a stop in the booking itself. | MEDIUM-HIGH | Google Directions with `waypoints` (the existing wizard already uses Maps + RouteMap). Cap stops (e.g. 5). Re-quote on every change; the price bar already recomputes. |
| Distance priced across all legs, transparent breakdown | Clients accept a price they can read. | MEDIUM | Line items: base route, additional km, waiting per stop. All rates from `pricing_globals` (admin), never hard-coded. |
| Per-stop waiting selector (client chooses), 15 min free, then a configurable fee per extra 15 min block | Owner design. Blacklane charges post-ride from driver-recorded time; pre-selected waiting = no post-ride surprise. | MEDIUM | Selector steps of 15 min. Convention: bill per started block. Show "15 min free at each stop" next to the control. |
| Overstay beyond the pre-selected wait handled by an explicit rule | Reality: clients run late at stops. | MEDIUM | Recommended: driver timestamps (on site/departed at stop) feed an "overage" suggestion that the OPERATOR approves, charged on the saved card as a separate off-session charge because the hold cannot grow. Mark as phase 2 of this feature if time is short. |
| Airport pickup: flight number, landing time, pickup offset after landing, free wait counted from the PICKUP time | Providers differ: Singapore operator 60 min free from landing; London one 45/60 min from actual landing; Blacklane 60 min included wait at airports; some start the clock at the booked pickup time unless Meet & Greet is requested. Owner design = clock starts at pickup time. | MEDIUM | Example given: landing 14:00, offset 30 -> pickup 14:30 -> free wait until 15:30. Offset options (0/15/30/45/60...) configurable. Show the three times on the confirmation and the driver sheet. |
| Flight tracking adjusts pickup automatically on delay (landing_new + offset) | Blacklane tracks flights and adjusts pickups; clients expect never to call. | MEDIUM | Reuse `lib/flight-status.ts`, `flight-cache.ts`, `app/api/cron/flight-refresh`. Notify driver and (optionally) client when the pickup moves; avoid moving the pickup more than once per N minutes (flapping). |
| Name sign / meet-and-greet note on driver sheet | Airport baseline. | LOW | Already part of the driver trip sheet; add the pickup-offset and free-wait-until time. |

#### F. Day trips catalogue (Feature 7)

Product page anatomy (GetYourGuide, Viator and Daytrip pattern; Daytrip is the closest model, being private-car day trips):

| Block | Content | Complexity | Notes |
|---|---|---|---|
| Hero + gallery | 4-8 images; first image doubles as OG | LOW | AVIF in `/public`, one gallery component. Only current Mercedes fleet images in generated visuals (project rule). |
| Key-facts bar | Duration (hours), pickup (hotel/address), max passengers per class, private vehicle, free cancellation up to X h, language of driver | LOW | Cancellation line is the single most clicked reassurance on GYG/Viator/Daytrip. |
| Highlights (3-6 bullets) | Why go | LOW | Per-locale content file. |
| Itinerary / stops timeline | Each stop with recommended duration (Daytrip: adjustable later in booking), drive time between stops, total | MEDIUM | Reuse the journey-timeline component from route pages. |
| Includes / excludes | Daytrip's list: two-way private car, air conditioning, English-speaking driver, bottled water; excludes tickets, meals, tips. | LOW | Decide fuel/tolls/parking inclusion explicitly (should be included). State that the driver is not a licensed guide unless that is true (owner to confirm). |
| Pickup / meeting point | Hotel or any Prague address, changeable until 24 h before (Daytrip) | LOW | Reuse the wizard pickup autocomplete. |
| Pricing and booking widget (sticky on mobile) | Date, start time, passengers, vehicle class (E/S/V) -> price per car (not per person) with passenger cap per class; "free cancellation" line | MEDIUM-HIGH | Price per class from admin (new `day_trip_prices` or reuse `route_prices`). Rendered through the live-price helpers, never typed. Include "included hours" and extra-hour fee if the trip runs long. |
| Availability / date picker | Chauffeur fleet has no per-slot inventory. Date + start time + minimum notice, blackout dates from admin. | MEDIUM | Do NOT build inventory. Conflicts surface at dispatch (calendar view in Feature 4). |
| Reviews | Real reviews only (existing `lib/google-reviews.ts`) | LOW | No fabricated ratings. |
| FAQ | 5-8 Q&A: pickup, duration, children seats, luggage, changing stops, weather, cancellation | LOW | Per locale. |
| Related trips + "Customise this trip" CTA | Cross-sell; the CTA opens the custom-tour form pre-filled | LOW | Feeds the lead path. |
| "Request a custom tour" form | Fields: destination(s)/interests, date or flexible window, passengers, vehicle preference, pickup place, duration, contact (name, email, phone/WhatsApp), notes, consent. | MEDIUM | Same intake as `submit-multiday-quote`/lead outbox -> Supabase -> EspoCRM/Chatwoot (v4.0 path). Confirmation page states a response window. Operator replies with a quote link (Feature 3). |
| Schema.org / SEO | See below | MEDIUM | Sitemap, hreflang, JSON-LD via existing `lib/jsonld.ts`/`getAlternates()`. |

**Structured data decision (MEDIUM; verify with Rich Results Test):**
- Google's rich-result gallery has no TouristTrip/Trip feature; Product (price, availability, review snippet), BreadcrumbList, Video and Event are the supported types. TouristTrip is still a pending schema.org type.
- Use `@type: ["Product", "TouristTrip"]` (schema.org itself recommends adding Product as a second type for offers). Put `offers` (price from the admin, `priceCurrency: EUR`, `availability`, `priceValidUntil`), `itinerary` (ItemList of stops) and `provider` (existing Organization). Add `aggregateRating` ONLY if real, third-party-verifiable reviews exist on that page. Per project rule, `priceValidUntil` must be normalised in golden-HTML tests.
- FAQPage: Google restricts FAQ rich results to authoritative government/health sites (MEDIUM, knowledge-based). Keep FAQPage for AI-answer/GEO value but do not expect SERP expansion.
- Intent overlap risk: `/routes/prague-karlovy-vary` (transfer) already exists. A day trip page targets "day trip / private tour" intent. Cross-link both ways, distinct titles/H1, and do not duplicate copy.

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Card hold with automatic fallback to a fresh off-session charge | Competitors (Blacklane) charge at booking or hold opaquely. This gives Prestigo "pay nothing now, never lose a fee" without relying on fragile authorization windows. | MEDIUM | Design once; reuse for transfers, day trips and quote remainders. |
| Cash booking with card guarantee | Rare among premium chauffeur sites. Converts clients who will not prepay online but removes no-show risk. | MEDIUM | Marketing copy: "Pay the driver; the card only guarantees your booking." No prices in marketing copy. |
| Pre-priced waiting per stop (no post-ride extras surprise) | Blacklane reconciles waiting/extra stops after the ride (driver review within 24 h). Fixed up-front is a trust differentiator. | MEDIUM | Overage only as an operator-approved add-on. |
| Pickup-offset picker with plain-language timeline ("Land 14:00 -> driver 14:30 -> free wait to 15:30") | Removes the commonest airport anxiety. | LOW-MEDIUM | Part of the airport booking step. |
| Quote "viewed" notification + expiry reminder email | Sales signal; recovers lapsing quotes. | LOW-MEDIUM | Use the existing cron + Resend. Optional Telegram alert. |
| Quote page with live "accept & pay deposit" in a single step | Fewer clicks than accept -> invoice -> pay. | MEDIUM | Single Checkout that both takes the deposit and saves the card. |
| Calendar resource view by driver (day view columns = drivers) | Spot double-booked drivers at a glance. | MEDIUM-HIGH | Needs `driver_assignments` join. Defer to a later phase if tight. |
| Day-trip "customise this trip" pre-fill into the lead form | Turns browsers into qualified leads with context. | LOW | Pass trip slug as lead source; EspoCRM Lead gets the trip name. |
| Day-trip price transparency: price per car with passenger cap per class (E/S/V) | GYG/Viator price per person; groups of 4-6 see a lower effective cost with a private car. | LOW | Show per-car price only (marketing no-comparison rule). A "per person" helper is optional UI only if the admin exposes it, via `<Price per={4}>` style helpers. |
| Realtime board (Supabase Realtime) instead of polling | Dispatcher sees driver steps instantly. | MEDIUM | Pairs with DTRIP-05 tech debt. Polling first. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Hold placed exactly "5 days before" and expected to survive until capture | Matches the brief | Visa merchant-initiated authorizations last 4 d 18 h; the hold expires before the trip | Hold at ~T-3 d (configurable), `capture_before` tracked, capture-time fallback charge |
| Extended authorizations to "hold for 30 days" | Looks like a clean fix | IC+ only, Visa 30-day window is customer-initiated only, +0.08%, Discover excludes limousines, network compliance burden | SetupIntent + late hold + fallback charge |
| Auto-charging no-show the moment the driver taps "no-show" | Zero admin work | Disputes and chargebacks; driver error or flight delay = wrongly charged client | Time-gated driver action + operator confirmation + logged contact attempt |
| Capturing more than the hold for waiting/extras | One transaction | Overcapture is restricted; fails silently for some cards | Capture the hold, then a separate off-session charge for approved extras |
| Draggable kanban with free moves between any columns | Feels "easy" | Skips the legal transition map, audit log and capture trigger | Drop only onto allowed columns; reuse `VALID_TRANSITIONS` |
| All-time kanban/calendar loading everything | Complete view | Slow and unusable at scale | Date horizon + virtualised columns |
| E-signature (drawn/typed signature) on quotes | Looks "legal" | Extra vendor/library, GDPR surface, no real gain; acceptance timestamp + terms version is sufficient | "I accept" button with logged evidence |
| PDF quote generation in-app | Clients ask for PDFs | No PDF lib in repo; Chrome-headless flow exists only for invoices | Printable HTML quote page; PDF only via the existing invoice flow if truly required |
| Real-time per-slot inventory for day trips | GYG-style "5 spots left" | Prestigo has a fleet, not tour seats. Fake scarcity is also a trust risk | Date + time request with minimum notice and admin blackouts |
| Per-person day-trip pricing | GYG/Viator default | Contradicts the per-car, E/S/V owner model; makes private-car value unclear | Per-car price with passenger cap per class |
| Third-party guide marketplace / tickets in day trips | Bigger catalogue | Operational and liability scope explosion | Driver-only trips; tickets excluded, guide add-on as a quote line later |
| Live GPS tracking for driver steps | Nice to have | DTRIP-FUT-01, out of scope; battery, privacy | Timestamped steps only |
| Counter-offer / negotiation chat inside the quote page | Sounds modern | Duplicates Chatwoot | CTA "Ask a question" opens the existing chat widget |
| Prices or Uber/ride-hailing comparisons in marketing copy for these features | Persuasive | Violates project content rules | Sell on guarantee/flexibility; prices only via live admin components |
| Fabricated ratings in Product JSON-LD | Rich-result bait | Policy violation and trust risk | Only real reviews |

---

## Feature Dependencies

```
SetupIntent / card saved (A1)
    ├──requires──> Stripe Customer per booking (guest checkout kept)
    ├──requires──> mandate wording + cancellation policy in 7 locales
    └──enables──> scheduled hold (A2) ──requires──> cron + payment-state columns + webhooks
                         └──enables──> capture on completion (A3) ──requires──> Driver status sync (D)
                                              └──fallback──> new off-session charge (A4)
Cash option (A5) ──requires──> SetupIntent (A1)
No-show charge (A6) ──requires──> SetupIntent (A1) + Driver "on site" timestamp (D) + operator confirm UI

Driver strict flow (D) ──requires──> booking.status model decision (add on_board?) + rewrite v2.2 isolation tests
Driver strict flow (D) ──feeds──> Kanban (C) + capture (A3) + waiting-time clock (E)

Multi-stop pricing (E1) ──requires──> pricing_globals extension (+ PricingGlobals type) + Maps waypoints
Per-stop waiting (E2) ──requires──> E1 + driver timestamps (D) for overage
Airport offset (E3) ──requires──> existing flight-status/flight-refresh + admin time-edit + driver notification

Quote (B) ──requires──> price sources (route_prices, pricing_globals, day trip prices) + token pattern
Quote deposit (B2) ──requires──> Stripe Checkout (+ setup_future_usage when remainder = saved card)
Quote remainder (B3) ──requires──> A1-A4 (saved card), payment link (exists), invoice flow (exists)
Quote acceptance ──creates──> N bookings (shared quote_id) ──uses──> group payment link (exists)

Day trips (F) ──requires──> admin price table by class + content per locale + sitemap/JSON-LD
Custom tour form (F) ──requires──> lead outbox (v4.0) ──enables──> Quote (B)

Kanban/Calendar (C) ──requires──> final status set from D (build AFTER D)
Light theme (C) ──independent──> but touches every admin component
```

### Dependency Notes

- **Capture requires the driver status sync.** Without D, there is no trigger for A3. Build D (and the status-model decision) before or together with the capture code.
- **Cash and no-show depend on A1 only.** They need the SetupIntent and mandate wording, not the hold cron.
- **Waiting fees affect the hold amount.** Decide first whether the booking total at hold time includes pre-selected waiting (yes, because it is known at booking) and whether overage is a separate charge (yes).
- **Quote remainder = saved card depends on A1 being solid.** Quote Phase must come after the payment foundation.
- **Kanban/calendar should follow D.** They display the final status set; building earlier means rework.
- **Day trips depend on the pricing admin and quotes only for custom tours.** Online booking of fixed trips can ship before quotes if the lead -> quote step is the last piece.
- **Existing `VALID_TRANSITIONS` conflict:** currently `confirmed -> completed` and `assigned -> completed` are API-legal. Once completion triggers capture, tighten or audit these shortcuts so a payment is never captured by an accidental admin click.

---

## Existing-Code Touchpoints (verified in repo 2026-11-02)

| Existing item | Relevance |
|---|---|
| `lib/booking-transitions.ts` (`VALID_TRANSITIONS`: unpaid/pending/confirmed/assigned/en_route/on_location/completed/cancelled; no on-board state) | Add the on-board decision here; drives kanban columns; guards capture. |
| `app/api/driver/trip/[token]/progress/route.ts` + `driver_assignments` trip-progress columns | Becomes the status writer; v2.2 isolation grep-gates must be rewritten. |
| `app/api/create-payment-intent/route.ts`, Stripe webhook, payment links, group payment link, unpaid queue | Foundation for A1-A4 and quote deposit/remainder links. |
| `app/api/cron/*` (`reminder-24h`, `reminder-2h`, `flight-refresh`, `outbox-sweep`) | Pattern and host for the hold cron and quote-expiry reminders; flight-refresh reused for the airport offset. |
| `lib/flight-status.ts`, `lib/flight-cache.ts`, `app/api/check-flight` | Airport offset + auto-adjust. |
| `lib/pricing-config.ts` (`hourlyRate`, `hourlyMinHours`), `pricing_globals`, `lib/route-prices.ts`, `lib/live-prices.ts` | Waiting fee/stop fee/day-trip prices must extend these; CLAUDE.md forbids hard-coded EUR. Migration 084 is next. |
| `app/api/submit-multiday-quote`, `submit-quote`, lead outbox + QStash (`lib/lead-sync.ts`, `crm-sync.ts`) | Custom-tour form -> lead path. |
| Admin bookings table with inline edit + per-field audit log, manual bookings, payment link emails | Reuse for kanban/calendar cards, quote -> booking conversion, and payment-state badges. |
| `lib/jsonld.ts`, `getAlternates()`, `lib/landing-pages.ts`, route-page workflow | Day-trip pages and sitemap. |
| `.env.local` Stripe test key is a dead placeholder | Payment features cannot be exercised locally; plan owner-run scripts with the live key or a fixed test key for UAT. |

---

## MVP Recommendation

Prioritise (table stakes, in dependency order):
1. **Payment foundation:** SetupIntent at checkout, mandate text, cancellation-policy object, payment-state columns/webhooks, hold cron at T-3 d (configurable), `capture_before` tracking, fallback charge, failed-hold payment link + alert.
2. **Driver strict flow + booking.status sync + capture on completion** (and the on-board status decision, rewritten isolation tests).
3. **Cash option + gated no-show charge (operator-confirmed).**
4. **Multi-stop pricing + per-stop waiting (pre-selected) + airport pickup offset** (with flight-refresh integration).
5. **Quotes:** token page, lifecycle, deposit link, remainder method, versions.
6. **Day trips:** admin price table, product pages, online booking, custom-tour form -> lead -> quote.
7. **Admin UX:** kanban (date-scoped), calendar, collapsible sidebar, light theme (can run parallel to 4-6 after step 2).

One differentiator to include in MVP: the **capture-time fallback charge** (it is required for correctness, not optional). Next best low-cost differentiators: the airport timeline wording and the "viewed" quote signal.

Defer:
- **Operator-approved overstay overage charge:** useful but needs driver timestamps and a second charge path; ship pre-selected waiting first.
- **Driver-resource calendar view and Supabase Realtime:** polling and a plain calendar are enough at launch.
- **Quote PDF/e-signature, counter-offers, live GPS, multi-currency:** see Anti-Features.
- **Customer self-service rebooking/cancel portal for held bookings:** admin-driven first; the customer account page can show policy and a cancel button later.

---

## Sources

- Stripe, "Place a hold on a payment method" (authorization validity windows, partial capture, `capture_before`): https://docs.stripe.com/payments/place-a-hold-on-a-payment-method (HIGH, fetched 2026-11-02)
- Stripe, "Place an extended hold on an online card payment" (IC+ only, CIT only for Visa other categories, +0.08%, Discover category exclusions): https://docs.stripe.com/payments/extended-authorization (HIGH)
- Stripe SCA/off-session guidance (authenticate at mandate setup, bring customer back on-session when auth is demanded): https://docs.stripe.com/strong-customer-authentication/migration (MEDIUM; aggregated via search)
- Blacklane help centre, cancellation policy (free until 1 h before pickup; pending authorizations reversed on cancel): https://help.blacklane.com/en/articles/3810157-what-is-the-cancellation-policy-and-how-can-i-cancel-my-ride (MEDIUM; customer-facing terms may differ)
- Blacklane partner help, no-show policy (30 min standard / 60 min airport wait; ops tries to contact guest; payout tiers 60-100%): https://partner-help.blacklane.com/en/articles/8420639-what-is-the-no-show-policy (MEDIUM; partner-facing)
- Blacklane partner help, recording extras (waiting calculated from driver button presses, not editable after ride; extras reviewed within 24 h): https://partner-help.blacklane.com/en/articles/8420375-how-do-i-record-extras-for-a-pickup (MEDIUM)
- Limo Anywhere knowledge base, status mapping and DriverAnywhere workflow (En Route -> On Location -> Customer in Car -> Dropped Off/Completed; optional No Show; early-status warning default 24 h): https://kb.limoanywhere.com/docs/Understanding-Status-Mapping-And-Workflow (MEDIUM; 2020-21 articles, labels configurable)
- Daytrip (daytrip.com), day-trip page content (two-way private car, a/c, English-speaking driver, water; excludes tickets/meals/tips; stop durations adjustable; free cancel 24 h): https://www.daytrip.com/en/day-trips (MEDIUM)
- GetYourGuide / Viator practices (24 h free cancellation standard; Reserve Now Pay Later on Viator): third-party summaries, MEDIUM-LOW; not verified from official pages
- Airport waiting-time conventions across providers (45/60 min from landing, 25 min from pickup time, Meet & Greet starts at gate): Transfeero help centre and operator listings via search, MEDIUM-LOW
- Quote UX patterns (Accept button, fixed/percent deposit, expiry tied to link): Quoter and HubSpot help docs via search, MEDIUM
- schema.org TouristTrip / Trip (Product as second type for offers, subTrip for days): https://schema.org/TouristTrip (HIGH for vocabulary); Google structured-data gallery has no Trip/TouristTrip feature (MEDIUM; confirm with Rich Results Test)
- Per-vehicle private-tour pricing in Prague market (Expedia whole-car listings, GoWithGuide per-group): search results, LOW-MEDIUM (price points not used)
- Repo files read for dependencies: `.planning/PROJECT.md`, `CLAUDE.md`, `lib/booking-transitions.ts`, directory listings of `lib/` and `app/api/`

## Confidence and Gaps

| Area | Confidence | Gap |
|---|---|---|
| Stripe hold/capture mechanics | HIGH | Confirm blended vs IC+ pricing on the Prestigo Stripe account (determines extended auth availability; recommendation does not depend on it). |
| Competitor cancellation / no-show / waiting policies | MEDIUM | Blacklane customer T&Cs not fetched (help centre only). Welcome Pickups and Sixt ride terms could not be retrieved. |
| Quote UX | MEDIUM | Domain tools, not chauffeur-specific; expiry-reminder UX is a design choice. |
| Dispatcher kanban/calendar conventions | MEDIUM | Limo Anywhere docs are old; no direct source for kanban vs calendar usage. |
| Day-trip page anatomy | MEDIUM | GetYourGuide/Viator official pages were not fetched; Daytrip page is the main primary source. |
| Google structured-data behaviour for tours | MEDIUM | Needs Rich Results Test on the real page. |
| EU consumer-law wording (withdrawal exemption, mandate wording) | LOW-MEDIUM | Not researched in depth; route through the legal skill or counsel before launch. |

Likely phase-level research flags: payment foundation (Stripe Checkout `setup` mode vs Elements, guest customer handling, 3DS failure recovery); multi-stop pricing (Directions API waypoint limits and cost); calendar component choice (build vs library) belongs to the STACK researcher.
