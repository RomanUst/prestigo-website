# Phase 93: Day Trips & Custom Tours - Research

**Researched:** 2026-11-18
**Domain:** DB-backed tour catalogue (Next.js 16 ISR + next-intl, 8 locales), tour checkout on the Phase 88/89 payment engine, custom-tour lead loop (inquiries -> outbox -> EspoCRM / Chatwoot -> Phase 92 quote)
**Confidence:** HIGH on codebase facts (read this session), MEDIUM on SEO / legal / licensing external claims

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carried forward (roadmap / prior phases, not re-asked)**
- PR #102 (merged 2026-11-14) already ships five day-trip landing pages in all 8 locales: hub `/services/day-trips-from-prague` and `/services/{cesky-krumlov,kutna-hora,karlovy-vary,dresden}-day-trip`, content in `content/pages/<locale>/services/*.json`, config in `lib/landing-pages.ts`, live fare tokens `{day<Dest>E|V|S}` from `getLandingPrices()` (round-trip formula). Copy: chauffeur waits on site, is not a guide, tickets and guides not included, child seats free. Phase 93 builds on these pages, it does not create parallel ones.
- Marketing rules: no typed prices anywhere (prices come live from admin data, ISR-revalidated, no stale JSON-LD prices), no Uber / ride-hailing comparisons, no fake scarcity ("booked 6 times yesterday", "likely to sell out"), no fabricated reviews or ratings.
- Every client-facing string gets real translations in all site locales (8: en, ru, es, fr, ar, hi, zh by hand, zh-hant generated from zh by `scripts/zh-hant-sync.mjs`). AI translation credits are empty: translate in-session. A locale is published for a tour only when its content is complete (no English leaking).
- Payments reuse the Phase 88/89 engine; the server is the price authority, the client never sends an amount. All times Prague time, DST-safe.
- Extra charges after the trip are operator-approved, never automatic (Phase 91 extra-charge action on the saved card).
- Custom-tour answer is a Phase 92 quote (deposit + remainder method, secret link, PDF).
- Next migration number is 092. The `trip_type` value set is checked in many places (bookings, `091_quotes.sql` quote lines `CHECK (trip_type IN ('transfer','hourly','daily'))`, `lib/pricing.ts`, `BookingWizard` VALID_TRIP_TYPES, lead/chatwoot/calendar mappings): every use must be audited before adding a tour type.

**Price (owner, 2026-11-18)**
- **D-01:** Each tour has a fixed price per car by class E / S / V, edited in admin per tour. Initial values are computed once from today's formula (route fare + return leg with the return discount) and then edited by hand; the formula no longer drives tour prices. — Reversibility: costly — tour pages, booking, JSON-LD and the existing `{day<Dest>*}` tokens switch to the stored price.
- **D-02:** Each tour has an admin field "hours included at the destination" (shown on the page). The client can add extra hours while booking; extra hours are priced by ONE per-class hourly price (E / S / V) set once in the tour settings in admin, for all tours.
- **D-03:** No upper limit on extra hours added at booking (owner: "Без ограничения").
- **D-04:** If the client overruns the booked time on the day, the operator may charge the overrun at the same per-class extra-hour price through the existing operator extra-charge action; never automatic.
- **D-05:** The price is the same for any pickup address within Prague, and the car returns to the same place. Pickup from the airport, from outside Prague or any route change goes through the custom-tour request.

**Catalogue and URLs (owner, 2026-11-18)**
- **D-06:** Launch catalogue = 6 tours: Český Krumlov, Kutná Hora, Karlovy Vary, Dresden (existing pages) + Karlštejn and Bohemian Switzerland (new). More tours are added later by the operator in admin.
- **D-07:** Keep the existing URLs: `/services/day-trips-from-prague` is the catalogue, `/services/<slug>-day-trip` is a tour page; new tours follow the same pattern (`/services/karlstejn-day-trip`, `/services/bohemian-switzerland-day-trip`). No redirects. — Reversibility: costly — URLs are indexed in Google.
- **D-08:** Tour content (title, short description, itinerary, highlights, includes / excludes, pickup info, FAQ, SEO title/description) is edited in admin per locale. A locale of a tour is shown on the site only when that locale is fully filled. Claude writes and translates the launch content for all 6 tours in all locales (existing page copy is migrated into the admin data). Publish / unpublish per tour in admin; a change appears on the site without a redeploy. — Reversibility: one-way — needs a migration (tour tables) and moves content from JSON files to the DB.

**Booking flow (owner, 2026-11-18)**
- **D-09:** A NEW tour booking flow, not connected to the existing `/book` wizard. Reference given by the owner: GetYourGuide tour page https://www.getyourguide.com/cesky-krumlov-l1189/from-prague-excursion-to-cesky-krumlov-and-hluboka-castle-t1400596/ — gallery (one large photo + small ones, "+N" opens all), title, short description, key facts (free cancellation, reserve now pay later, duration), highlights, full description, includes / excludes, booking box on the right on desktop and a sticky bottom bar "from … / Book" on mobile, meeting/pickup point, important info, "you might also like" other tours, reviews.
- **D-10:** Booking box on the tour page: date, start time, passengers -> shows the car classes that fit the passenger count with their price -> extra hours -> "Book". The next page (tour checkout) collects pickup address in Prague, contact details, wishes, and payment. Price shown "per car", never "per person".
- **D-11:** Payment modes are the same as transfers: saved card with hold before the trip ("reserve now, pay later") or cash to the driver with the card as guarantee. Same Stripe / consent / hold engine.
- **D-12:** Tours get their OWN free-cancellation threshold: an admin setting, default 24 hours before pickup, after that 100%. Shown on the tour page and in the checkout. Needs new cancellation-terms copy in all locales. — Reversibility: costly — the terms shown at booking are part of the logged consent.
- **D-13:** No stops or route changes inside a catalogue booking. Wishes go into a free-text field. A visible block "Didn't find what you were looking for? Request a custom tour" leads to the custom-tour request.
- **D-14:** Reviews block: show our real existing service reviews (the same source the site already uses). No tour-specific ratings or reviews until real ones exist; nothing invented.

**Photos and custom tour (owner, 2026-11-18)**
- **D-15:** Gallery photos at launch: freely licensed photos (Wikimedia Commons, Unsplash) with attribution where the licence needs it, plus our own car photos. Admin can upload and reorder photos per tour to replace them.
- **D-16:** The custom-tour block appears on the catalogue page and on every tour page (under the booking box). The request form lives on its own page; when opened from a tour page, that tour is prefilled as the starting point.
- **D-17:** Short request form: where you want to go (free text), date, number of people, wishes, name, email, phone / WhatsApp. The operator clarifies the rest.
- **D-18:** The request becomes a lead in Supabase, EspoCRM and Chatwoot through the existing lead pipeline (Phase 81/83), without depending on the VPS. In admin the request has a "Create quote" button that opens the Phase 92 quote builder prefilled with client, language and date; the request and the quote are linked.

### Claude's Discretion
- Data model (tour tables, translations, photos storage), the booking/trip_type representation, how tour bookings reuse the bookings table and payment engine, and ISR/revalidation strategy.
- Exact UI of the booking box and checkout, following the reference and the site's navy/champagne design system.
- JSON-LD type for tour pages (TouristTrip vs Product/Offer) — research decides; prices in JSON-LD come from live data with normalized `priceValidUntil` in snapshot tests.
- Initial included-hours and extra-hour prices are proposed by Claude from current tariffs and shown to the owner before go-live.

### Deferred Ideas (OUT OF SCOPE)
- Stops / route changes inside a catalogue booking (handled via custom tour for now).
- Tour-specific reviews and ratings once real ones exist.
- Guides, entrance tickets, multi-day tours.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIP-01 | Browse a day-trip catalogue (6 tours) in all locales | Sections "Catalogue and tour pages", "Locale publishing", "Sitemap / hreflang"; `/services/[slug]` route becomes DB-backed with `dynamicParams = true` |
| TRIP-02 | Tour page: gallery, duration, itinerary, includes/excludes, pickup, FAQ, cancellation terms, structured data, live prices only | Data model, JSON-LD recommendation (TouristTrip + Offers), photo licensing, `safeJsonLd` pitfall |
| TRIP-03 | Per-car price by class E/S/V edited in admin | `tours.price_*_eur` + `tour_settings`; initial price derivation from `route_prices` + return discount; Karlstejn / Bohemian Switzerland have no route fare (Open Question 2) |
| TRIP-04 | Book online (date, time, vehicle, pax) with transfer payment modes | "Tour checkout on the Phase 88/89 engine" - extend `/api/card-checkout/*` with a `tour` branch; trip_type audit; per-tour 24 h threshold via policy snapshot |
| TRIP-05 | Operator adds / edits / publishes / unpublishes tours in admin | Admin structure, signed-upload photo flow, `revalidatePath` pattern |
| TRIP-06 | Custom-tour request becomes a lead in Supabase / EspoCRM / Chatwoot | New inquiry kind `custom_tour`; Chatwoot leg does not exist for inquiries today (Open Question 1) |
| TRIP-07 | Operator answers a custom-tour request with a quote from admin | `quotes.source_inquiry_id` already exists (unused); needs an admin inquiries list (none exists) + prefilled quote create |
</phase_requirements>

## Summary

The phase is mostly **wiring existing engines to a new data model**, not new infrastructure. Tours become 4 tables (`tours`, `tour_translations`, `tour_photos`, `tour_settings`) plus new columns on `bookings`; the public `/services/[slug]` route stops reading `content/pages/**/services/*-day-trip.json` and reads the DB under ISR (`dynamicParams = true`, `revalidatePath('/[locale]','layout')` on every admin write, the project's established pattern). Tour bookings go through the **existing** `/api/card-checkout/init|intent` routes and `createCardCheckoutIntent` with a new `tripType: 'tour'` branch in `validateCheckoutBooking` / `priceCheckout`, so consent, hold, cash-guarantee, webhook, cancel, no-show and extra-charge paths are reused unchanged; only the price source, the cancellation snapshot and the UI are new. The custom-tour request follows the `submit-multiday-quote` precedent (new inquiry kind -> outbox `lead.inquiry` -> EspoCRM Lead) and uses the already-present, never-written `quotes.source_inquiry_id` column to link a Phase 92 quote.

**Five findings contradict or extend the CONTEXT.md assumptions and the planner must act on them:**
1. **The `{day<Dest>E|V|S}` tokens, `DAY_TRIP_FALLBACK` and the day-trip price test do not exist on this branch.** Commit `55b5a179` ("Day trip pages: no prices in copy") removed them. `getLandingPrices()` returns only airport/hourly tokens. The current pages describe a *waiting-time* price model ("first 15 minutes free, charged per started 15 minutes") that **contradicts D-01/D-02** (fixed price + hours included + extra hour). The migrated copy must be rewritten, not just moved, in 8 locales.
2. **No admin surface for `inquiries` exists** (`app/(internal)/admin/(dashboard)/` has accounts, bookings, drivers, erasure, identities, outbox, pricing, promo-codes, quotes, settings, stats, zones). D-18's "Create quote button on the request" needs a new admin page.
3. **Inquiries never reach Chatwoot today.** `lead.inquiry` only upserts an EspoCRM Lead; Chatwoot contacts come from the identity resolver (bookings/signups only). TRIP-06's "Chatwoot" leg is new work with three possible designs (Open Question 1).
4. **EspoCRM live metadata is a hard dependency of two new enum values** (Lead source `Custom tour`; CBooking `tripType` `tour`). A Lead POST with an unknown `source` is a 400 that the relax-attempts do not fix -> terminal `failed`. Both need an owner-run `infra/espocrm/sync.mjs` apply **before** the code path goes live.
5. **`bookings.trip_type` has no CHECK in any repo migration (038+), but the table predates the repo's migrations** and `buildBookingRow` already documents a live `booking_type` constraint "not verified". The live constraint must be read (`pg_constraint`) in Wave 0 before choosing `tour` as a value.

**Primary recommendation:** Add `trip_type = 'tour'` (not a reuse of `hourly`), add `tour_id/tour_title/tour_extra_hours` columns, extend the existing card-checkout routes with a tour branch, snapshot the 24 h threshold as a `tour-` versioned cancellation policy (precedent: `quote-` prefix), ship TRIP-01..05 as PR 1 and TRIP-06/07 as PR 2, and treat the Chatwoot leg as an owner decision before planning that plan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tour catalogue + tour page render | Frontend Server (SSR/ISR) | Database | Public pages under `app/[locale]/services/[slug]`, data read with the service client at render (no client created during render at module level), revalidated on admin write |
| Booking box (date/time/pax/car/extra hours) | Browser / Client | API | Pure UI state; prices are props from the server render; the server recomputes at init/intent (409 `PRICE_CHANGED` cross-check) |
| Tour price + extra-hour authority | API / Backend | Database | `priceCheckout` tour branch reads `tours` + `tour_settings`; client amount only cross-checked |
| Pickup-area check (D-05), airport refusal | API / Backend | — | Must be server-side (`isAirportPickup` + radius/zone check); client check is UX only |
| Payment (card hold / cash guarantee) | API / Backend (existing engine) | Browser (Stripe Elements) | Reuse `createCardCheckoutIntent`, consent, webhook, tick |
| Cancellation threshold (24 h) | API / Backend | Database (policy snapshot on booking) | Stored snapshot on the booking row = the terms shown (D-12/D-18) |
| Locale-completeness / publish gate | API / Backend (admin write) | Database | Computed at save time, stored; public render only reads published locales |
| Photo upload / storage | API (signed-URL mint) | Storage (public bucket) / CDN | Vercel function body limit 4.5 MB forces browser -> Storage direct upload |
| Custom-tour inquiry capture | API / Backend | Database (`inquiries`) | Best-effort `storeInquiry` + `dispatchAfterResponse`; trigger enqueues outbox row |
| Lead delivery (EspoCRM / Chatwoot) | API (QStash dispatcher) | External (VPS) | Outbox + QStash; VPS down -> retry, never blocks the visitor |
| Quote from inquiry | API / Backend (admin) | Browser (builder) | `createQuoteDraft` extended with `source_inquiry_id` + locale override |
| Sitemap / hreflang per published locale | Frontend Server | Database | `app/sitemap.ts` becomes async; `getAlternates` gains an explicit-locales option |

## Standard Stack

### Core (all already in the repo — no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.2.3 [VERIFIED: package.json] | App Router, ISR, `revalidatePath`, async sitemap | Project framework |
| next-intl | 4.14.2 [VERIFIED: package.json] | Locale routing, `setRequestLocale`, `getPathname` | Project i18n |
| zod | 4.3.6 [VERIFIED: package.json] | Strict request/admin payload schemas (`z.strictObject`) | Used by every route |
| @supabase/supabase-js | ^2.101.0 [VERIFIED: package.json] | Service client, Storage (`createSignedUploadUrl`) | Project data layer |
| stripe / @stripe/react-stripe-js / @stripe/stripe-js | ^21.0.1 / ^6.0.0 / ^9.0.0 [VERIFIED: package.json] | SetupIntent / hold PaymentIntent Elements | Phase 88/89 engine |
| opencc-js | ^1.0.5 [VERIFIED: package.json] | zh -> zh-hant conversion (reuse in a seed script and an admin "convert from zh" action) | Already used by `scripts/zh-hant-sync.mjs` |
| vitest | ^4.1.1 [VERIFIED: package.json] | Tests | Project test runner |

### Supporting (existing project modules to reuse, not libraries)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/checkout/compute.ts` | validate + price + meta for card checkout | Add the `tour` branch here, do not fork |
| `lib/payments/checkout.ts` `createCardCheckoutIntent` | booking capture + consent + SetupIntent / hold | Unchanged; tour passes a `PricedCheckout`-shaped object |
| `lib/cancellation-policy.ts` + `lib/cancellation-settings.ts` | policy evaluation + snapshot | Add `tour` trip-type handling + `buildTourPolicySnapshot` |
| `lib/payments/extra.ts` | operator extra charge | D-04: use `kind: 'other'` with a suggested amount, no engine change |
| `lib/inquiries.ts`, `lib/outbox.ts`, `lib/lead-mapping.ts`, `lib/lead-sync.ts` | custom-tour lead | New kind `custom_tour` |
| `lib/quotes/store.ts` `createQuoteDraft` | quote from request | Add optional `source_inquiry_id` + `locale` |
| `lib/seo.ts` `getAlternates` | hreflang | Add explicit `availableLocales` option |
| `components/Testimonials.tsx` + `lib/google-reviews.ts` | D-14 reviews | `<Testimonials />` server component as is |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `/api/card-checkout/*` with a tour branch | Separate `/api/tour-checkout/*` routes | Separate routes duplicate ~420 lines of init/intent logic and the middleware CSRF + rate-limit lists; the shared engine is already generic (`bookingData` + `PricedCheckout`). Recommend extending. |
| New `trip_type = 'tour'` | Reuse `'hourly'` + `tour_id` | `hourly` re-uses CARD_FLOW and `freeHoursHourly` but lies in emails, calendar, CRM, stats, admin edit (re-prices from hourly rates) and driver views. Recommend `'tour'` and pay the audit cost once. |
| Launch photos in Supabase Storage (uniform) | Commit launch photos to `public/tours/` | `public/` needs no CSP/remotePatterns change for launch but two sources to render. Admin upload needs Storage + CSP anyway, so go uniform. |
| Up/down buttons to reorder photos | `@dnd-kit/sortable` | `@dnd-kit/core` is present but `sortable` is not; no new dependency needed for a 6-12 photo list. |

**Installation:** none. **Package Legitimacy Audit:** no external package is added by this phase, so the `package-legitimacy` seam was not run. Any addition proposed later (e.g. an image-resize lib) must go through the gate first.

## Architecture Patterns

### System Architecture Diagram

```
Visitor (any of 8 locales)
   |
   v
/services/day-trips-from-prague  (catalogue)      /services/<slug>-day-trip  (tour page)
   |   reads published tours + translation       |   reads tour + photos + tour_settings
   |   for [locale] (ISR, revalidate=3600)        |   locale not complete? -> redirect to EN URL (307)
   |                                              |   JSON-LD from live prices (safeJsonLd)
   |                                              v
   |                                   Booking box (client state: date, time, pax, car, extra h)
   |                                              |  "Book" -> /book/tour?tour=<slug>&date=&time=&pax=&car=&xh=
   v                                              v
"Request a custom tour" -> /book/custom-tour[?tour=<slug>]     /book/tour  (tour checkout, NO wizard store)
        |                                                       |  pickup (Places), contact, wishes
        | POST /api/custom-tour                                 |  POST /api/card-checkout/init   (tripType 'tour')
        | (maxBody -> rate limit -> zod -> honeypot)            |  POST /api/card-checkout/intent
        v                                                       v
   storeInquiry('custom_tour')                      validateCheckoutBooking -> tour branch:
   + emails (operator alert, client ack)               tour published? pickup in area? not airport? pax<=class max?
   + trigger -> outbox lead.inquiry                  priceCheckout -> tour branch: price_<class> + extraHours * extra_hour_<class>
        |  (QStash dispatcher, no VPS needed to accept)  policy snapshot 'tour-...' (24 h, 100 %)
        v                                              -> createCardCheckoutIntent (booking row trip_type 'tour',
   EspoCRM Lead (source 'Custom tour')                     consent, SetupIntent | hold_now | cash_setup)
   Chatwoot (design TBD: ops private note | contact)        -> Stripe webhook -> card-confirm (existing)
        |                                                       -> /book/confirmation?ref=... (tour variant)
        v
Admin: /admin/custom-tours (NEW list) -> "Create quote"
   -> POST /api/admin/quotes {client, lead_channel, currency, source_inquiry_id, locale}
   -> /admin/quotes/<id> builder (client + locale + date + pax prefilled; operator adds the priced line)

Admin: /admin/tours (list) /admin/tours/<id> (editor: locale tabs, photos, price, hours, publish)
   -> PATCH /api/admin/tours/<id>  -> completeness check -> revalidatePath('/[locale]','layout')
   -> photo: POST .../photos/sign -> browser PUT to Storage signed URL -> POST .../photos (register)
```

### Recommended Project Structure
```
lib/tours/
├── types.ts            # TourRow, TourTranslation, TourPhoto, TourSettings, TourView (client-safe)
├── store.ts            # guarded readers (return [] / null without Supabase env, never throw at build)
├── pricing.ts          # tourFare(tour, settings, car, extraHours) -> EUR number (pure)
├── completeness.ts     # isLocaleComplete(translation) + leak guard (pure)
├── jsonld.ts           # buildTourJsonLd(...) + safeJsonLd()
├── policy.ts           # buildTourPolicySnapshot(hours) (pure)
└── admin-schemas.ts    # zod strict schemas for admin PATCH/POST
app/[locale]/services/[slug]/page.tsx        # resolves LANDING vs tour slug
app/[locale]/book/tour/page.tsx              # tour checkout (client, own state)
app/[locale]/book/custom-tour/page.tsx       # request form (precedent: /book/multi-day)
app/api/custom-tour/route.ts
app/api/admin/tours/** , app/api/admin/tour-settings/route.ts, app/api/admin/custom-tours/**
app/(internal)/admin/(dashboard)/tours/** , custom-tours/page.tsx
components/tours/                           # TourGallery, BookingBox, StickyBookBar, TourCard, TourCheckout...
supabase/migrations/092_tours.sql           # (+ 093 if the inquiries / stats pieces are split)
scripts/seed-tours.mjs                      # content/tours-seed/<locale>/<slug>.json -> DB (insert-only unless --force)
```

### Pattern 1: Slug resolution in the existing `[slug]` route
**What:** keep `app/[locale]/services/[slug]/page.tsx`; day-trip slugs leave `LANDING_PAGES`; resolve `findLandingPage('services', slug)` first, else `getPublishedTour(slug)`, else `notFound()`. Switch `dynamicParams` to `true`; `generateStaticParams` returns landing slugs + published tour slugs (empty array when Supabase env is absent, never throw).
**Why:** URLs stay identical (D-07); admin-created tours work without redeploy (success criterion 3). Current file has `export const dynamicParams = false` and `generateStaticParams` over `landingPagesFor('services')` [VERIFIED: app/[locale]/services/[slug]/page.tsx:10-18].
**Locale not complete for the requested tour:** `redirect()` (307) to the EN URL, **not** `notFound()` and **not** the current "render EN under /ru" behaviour (`getPageContent` falls back to EN, which is exactly the leak D-08 forbids). Exclude the locale from hreflang and the sitemap.

### Pattern 2: Tour branch inside the shared checkout (no fork)
`checkoutBookingSchema.bookingData.tripType` is `z.enum(['transfer', 'hourly', 'daily', 'round_trip'])` [VERIFIED: lib/checkout/compute.ts:60] and `.catchall(BOUNDED_STRING)` allows extra string fields [VERIFIED: compute.ts:103]. Add `'tour'` to the enum and `TRIP_TYPES` (compute.ts:44 `const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily', 'round_trip']`) and carry `tourSlug`, `extraHours` as catch-all strings (or declared optional fields). In `validateCheckoutBooking` add a tour block that: (a) loads the tour by slug and refuses unpublished / unknown (`TOUR_UNAVAILABLE`), (b) refuses `stops`, landing, promo, returnDate for tours, (c) requires origin coords, refuses `isAirportPickup`, refuses outside the pickup area (`PICKUP_OUT_OF_AREA` -> UI links to custom tour), (d) enforces `passengers <= VEHICLE_CONFIG maxPassengers` (existing check at compute.ts:195-201 already does this), (e) `extraHours` integer within the technical bounds. In `priceCheckout` return a `PricedCheckout` with `outboundLegEur = tourFare(...)`, `returnLegEur = 0`, `extrasTotalEur = 0`, `waitingFeeEur = 0`, `stops = []`, `distanceKm = null`, `returnDiscountPercent = 0`, `appliedPromoPct = 0`.
**Cancellation:** init/intent routes call `getCancellationPolicy()` then `evaluateCancellation(policy, {tripType, distanceKm, pickupMs})`. Replace by `policy = validated.tripType === 'tour' ? tourPolicy : await getCancellationPolicy()` in `buildPolicyPreview` (init:72) and the intent route (`getCancellationPolicy` call at intent:112 and `buildPolicySnapshot(policy)` at intent:113); `freeHoursFor` gets `if (b.tripType === 'tour') return p.freeHoursLong` and the tour snapshot sets `freeHoursShort = freeHoursLong = freeHoursHourly = tourHours`, `feePercent = 100`, `version = 'tour-' + CANCELLATION_POLICY_VERSION`.
**Eligibility:** `CARD_FLOW_TRIP_TYPES = ['transfer', 'hourly'] as const` [VERIFIED: lib/payments/config.ts:30]; add `'tour'`.

### Pattern 3: Policy snapshot with a per-booking hour count (precedent)
`policyFromSnapshot` bounds hours to `POLICY_BOUNDS.hours` (0..72) for every snapshot except versions starting with `QUOTE_POLICY_VERSION_PREFIX = 'quote-'` (0..720) [VERIFIED: lib/cancellation-policy.ts:41-50, 100-111]. Default tour threshold (24) is inside 0..72, so `tour-` snapshots need **no bound change**; cap the admin setting at `POLICY_BOUNDS.hours.max` (72) in the settings schema. A snapshot that fails validation silently becomes `LEGACY_POLICY` (free until 1 h) — the exact failure mode to test (see Pitfall 3).

### Pattern 4: Admin write -> revalidate
Established pattern: validate admin, zod parse, write, `revalidatePath('/[locale]', 'layout')` [VERIFIED: app/api/admin/route-prices/[slug]/route.ts]. Use it for every tour / tour-settings / photo write. Pages additionally keep `export const revalidate = 3600` as a safety net.

### Anti-Patterns to Avoid
- **A second payment/booking engine.** Everything money-related goes through `createCardCheckoutIntent`; `tests/payment-state-writers-gate.test.ts` forbids writing `payment_state` elsewhere.
- **`getLocale()` in tour pages** (forces SSR per request; fixed in PR #59). Use `params.locale` + `setRequestLocale`.
- **Creating a Supabase client during render at module level** (Vercel Preview). Readers wrap client construction in try/catch and return empty (pattern: `getRoutePrice`, `getPricingConfig`).
- **Rendering EN content under a non-EN URL** for an incomplete locale.
- **Typed prices anywhere** in `app/`, `components/`, content seed JSON, SEO strings (`tests/seo-snippets-no-prices.test.ts`, pre-commit grep). Seed content must not contain digits followed by a currency; prices are rendered from props.
- **Letting the client choose the amount** — extra hours are an integer input, the amount is always recomputed.

## Data Model (proposal for migration 092)

```sql
-- tours: structural, locale-invariant
tours(
  id uuid pk default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-day-trip$'),  -- D-07 URL pattern; also segment-safe
  status text not null default 'draft' check (status in ('draft','published')),
  sort_order integer not null default 0,
  hours_included smallint not null check (hours_included between 1 and 12),
  drive_minutes_each_way integer,            -- shown as duration facts
  price_e_eur numeric(10,2) not null check (price_e_eur > 0),
  price_s_eur numeric(10,2) not null check (price_s_eur > 0),
  price_v_eur numeric(10,2) not null check (price_v_eur > 0),
  start_time_min text default '07:00', start_time_max text default '11:00',   -- booking-box time options
  destination_label text not null,           -- English label stored on bookings.destination_address
  created_at timestamptz default now(), updated_at timestamptz default now()
)
tour_translations(
  tour_id uuid references tours on delete cascade, locale text check (locale in ('en','ru','es','fr','ar','hi','zh','zh-hant')),
  title, short_description, pickup_info, important_info, seo_title, seo_description text,
  highlights jsonb, itinerary jsonb, includes jsonb, excludes jsonb, faq jsonb,   -- arrays of strings / {title,body} / {q,a}
  is_complete boolean not null default false,   -- set by the server on every write (completeness.ts), never by the client
  primary key (tour_id, locale)
)
tour_photos(id uuid pk, tour_id uuid references tours on delete cascade, storage_path text not null, position smallint not null,
  credit_text text, credit_url text check (credit_url is null or credit_url ~ '^https://'), license text, is_cover boolean)
tour_settings(id smallint primary key check (id = 1), extra_hour_e_eur numeric(10,2), extra_hour_s_eur numeric(10,2),
  extra_hour_v_eur numeric(10,2), free_cancel_hours smallint not null default 24 check (free_cancel_hours between 0 and 72),
  pickup_radius_km numeric(5,1))        -- D-05, see Open Question 4
bookings: + tour_id uuid null references tours(id) on delete set null, + tour_title text null, + tour_extra_hours smallint null
inquiries.kind CHECK -> ('contact','corporate','multiday_quote','custom_tour')   -- the CHECK is currently: CHECK (kind IN ('contact', 'corporate', 'multiday_quote')) [VERIFIED: 065_inquiries.sql:17]
storage: insert into storage.buckets 'tour-photos' (public, file_size_limit ~ 8 MB, allowed_mime_types jpeg/png/webp/avif)  -- precedent: 044_content_media_bucket.sql
```
RLS: enable + `REVOKE ALL ... FROM anon, authenticated` + deny-all policies, exactly like `inquiries` / `quote_versions` (service-role only). Public pages read with the service client (like `route_prices`).
**Locale completeness (`completeness.ts`):** complete = all of title, short_description, pickup_info, seo_title, seo_description non-empty after trim, and `highlights`, `itinerary`, `includes`, `excludes`, `faq` each with >= 1 non-empty entry. **Leak guard** (cheap, recommended): for `ru` require Cyrillic, `ar` Arabic, `hi` Devanagari, `zh` / `zh-hant` CJK characters in title + short description; for `es` / `fr` refuse a title or short description byte-identical to EN. A tour is shown in a locale only when `tours.status = 'published' AND translation.is_complete`. EN must be complete before a tour can be published at all (it is the hreflang x-default).
**zh-hant:** `scripts/zh-hant-sync.mjs` converts files under `content/{blog,pages,routes}/zh` only [VERIFIED: scripts/zh-hant-sync.mjs:49-51]; DB content is not covered. Provide (a) the seed script converting `content/tours-seed/zh/*.json` with `opencc-js` `Converter({from:'cn', to:'twp'})` (same converter the script uses) and (b) an admin "Fill zh-Hant from zh" action using the same converter, so an operator editing zh gets zh-hant for free.

### Initial prices (D-01)
Formula to reproduce once, outside runtime code: route fare (`getAllRoutes()` -> `applyDistanceFares`) + return leg `Math.round(returnAdjusted.base * (1 - discountPct/100))` per `computeReturnLegTotal` [VERIFIED: lib/server-pricing.ts:100-123], discount from `pricing_globals.return_discount_percent` (fallback 10 [VERIFIED: lib/pricing-config.ts:80]). Routes that exist: `prague-kutna-hora`, `prague-karlovy-vary`, `prague-dresden`, `prague-cesky-krumlov` [VERIFIED: lib/routes.ts slugs via grep]. **No route exists for Karlštejn or Bohemian Switzerland** -> their initial prices need the owner or a one-off `distance_km x ratePerKm` estimate (Open Question 2). Do this in an owner-reviewed script that prints a table; never import it into runtime code.

## Existing day-trip pages -> DB (answers the codebase question)

| Fact | Evidence |
|------|----------|
| Landing config: `LANDING_PAGES` entries for the hub + 4 day-trip slugs, `ctaHref: '/book'`, hero images (`/hero-intercity-routes.png`, `/multi-day-hero.png`, `/vehicles/van-int-1.jpg`, `/vehicles/business-int-1.jpg`, `/hero-group-transfers.png`) | lib/landing-pages.ts:56-60 [VERIFIED] |
| Content: `content/pages/<locale>/services/{day-trips-from-prague,cesky-krumlov-day-trip,kutna-hora-day-trip,karlovy-vary-day-trip,dresden-day-trip}.json` x 8 locales; shape `LandingContent` (hero, glance, intro, features, steps, editorial, faqs, related, cta) | lib/landing-pages.ts:122-157; `ls content/pages/en/services` [VERIFIED] |
| Tokens / fallback | `getLandingPrices()` returns only `businessPrice, vClassAirport, sClassAirport, hourlyFrom, hourlyV, hourlyS` [VERIFIED: lib/landing-pages.ts:159-169]. `DAY_TRIP_FALLBACK` and `tests/day-trip-prices.test.ts` were deleted in `55b5a179` [VERIFIED: git show --stat]. **CONTEXT.md is wrong on this point.** |
| Rendering | `LandingView` builds FAQPage + BreadcrumbList + Service JSON-LD from the same copy; `JSON.stringify` into `dangerouslySetInnerHTML` **without `<` escaping** [VERIFIED: components/LandingView.tsx:108] |
| Other consumers of `landingPagesFor('services')` | `app/[locale]/services/page.tsx:272` lists landing pages as cards using `getPageContent('services/<slug>')`; `app/sitemap.ts` `landingEntries`; tests `tests/seo-volume-pages.test.ts`, `tests/fleet-vehicle-pages.test.ts` |

**Plan implications**
1. Remove the 5 day-trip slugs from `LANDING_PAGES` (keep airport-meet-and-greet etc.). The hub `day-trips-from-prague` stays a *static JSON* page (its copy is page-level, not tour-level) but its tour cards come from the DB; rewrite its JSON in 8 locales to drop hard-coded destination lists / "four" counts (it currently says "Český Krumlov, Kutná Hora, Karlovy Vary or Dresden" and "Four day trips").
2. `services/page.tsx` "also popular" block must list DB tours (hub + published tours), not `getPageContent` for removed slugs.
3. Migrate copy via a reviewed seed file set, not by transforming `LandingContent` mechanically: the GetYourGuide-style structure (highlights, full description, itinerary, includes/excludes, pickup, important info) differs from `features/steps/editorial`. Rewrite the price-model sentences (first-15-minutes-free waiting) to the D-01/D-02 model. Keep the "chauffeur is not a guide / tickets not included / child seats free" statements (they are the package-travel posture, see Legal).
4. Route pages `content/routes/<locale>/prague-{dresden,cesky-krumlov,kutna-hora,karlovy-vary}.json` carry `dayTripLabel` + `dayTrip` sections ("Popular day-trip configurations") — add an internal link to the tour page there (see SEO map).

## trip_type audit (every place the value set is enumerated)

Decision: a new value `tour`. The `TripType` UI union stays unchanged (wizard-only); tours never enter the wizard store.

| # | Place | Current value (verbatim) | Needs change? |
|---|-------|--------------------------|---------------|
| 1 | `types/booking.ts:3` | `export type TripType = 'transfer' \| 'hourly' \| 'daily' \| 'round_trip'` | **No** (wizard). Introduce `BookingTripType = TripType \| 'tour'` only where rows are read |
| 2 | `lib/checkout/compute.ts:44,60` | `const TRIP_TYPES: TripType[] = ['transfer', 'hourly', 'daily', 'round_trip']`, `tripType: z.enum(['transfer', 'hourly', 'daily', 'round_trip'])` | **Yes** add `'tour'` + tour branch (Pattern 2) |
| 3 | `lib/payments/config.ts:30` | `export const CARD_FLOW_TRIP_TYPES = ['transfer', 'hourly'] as const` | **Yes** add `'tour'` |
| 4 | `lib/cancellation-policy.ts:73-77` | `freeHoursFor`: hourly -> `freeHoursHourly`; km threshold; else long | **Yes** tour branch |
| 5 | `lib/customer-mapping.ts:66` | `const TRIP_TYPE_VALUES = ['transfer', 'hourly', 'daily', 'round_trip']`; `buildCBookingDraft` returns `booking_unmapped` otherwise (line 202) | **Yes** (else the CBooking sync fails loudly) |
| 6 | `infra/espocrm/lib/booking-map.mjs:31` | `export const TRIP_TYPE_VALUES = ['transfer', 'hourly', 'daily', 'round_trip']` (throws `unknown_trip_type`) | **Yes** (parity test `tests/customer-mapping-parity.test.ts`) |
| 7 | `infra/espocrm/fields.json` CBooking `tripType` | `"options": ["transfer", "hourly", "daily", "round_trip"]` + `translatedOptions` | **Yes** + owner-run `infra/espocrm/sync.mjs`; pinned by `tests/espocrm-model.test.ts:535` |
| 8 | `app/api/admin/bookings/dispatch/route.ts:18` | `const KNOWN_TRIP_TYPES = new Set(['transfer', 'hourly', 'daily', 'round_trip'])` | **Yes** (else filtering the dispatch board by `tour` = 400) |
| 9 | `app/api/admin/bookings/route.ts:559, 913` | PATCH recompute casts `current.trip_type as 'transfer' \| 'hourly' \| 'daily'` and calls `computeOutboundLegTotal`; POST schema `trip_type: z.enum(['transfer', 'hourly', 'daily'])` | **Yes (guard)**: a price-affecting PATCH of a `tour` booking must refuse recompute (require `override_price`) — otherwise the engine prices an unknown type. POST (manual booking) stays without tour |
| 10 | `components/booking/BookingWizard.tsx:15` | `const VALID_TRIP_TYPES = new Set(['transfer', 'hourly', 'daily', 'round_trip'])` | No (wizard) |
| 11 | `components/admin/BookingsTable.tsx:405`, `BookingsWorkspace.tsx:54` | trip-type filter chips (`Hourly`, `Daily`, ...) | **Yes** add a `Tour` chip |
| 12 | `lib/email.ts:280,289` | confirmation HTML branches on `hourly` / `daily` | **Yes** tour rows (destination + hours) |
| 13 | `lib/google-calendar.ts:97,187` | calendar summary from booking fields | Check output for tour (uses destination/hours) |
| 14 | `lib/payments/pay-now.ts:111`, SQL `080/081/084` | only `= 'round_trip'` comparisons | No |
| 15 | `supabase/migrations/091_quotes.sql:180` | `trip_type text NOT NULL CHECK (trip_type IN ('transfer', 'hourly', 'daily'))` | **No** — quote lines stay transfer/hourly/daily; a custom-tour quote is a normal quote |
| 16 | `bookings.trip_type` live column | no CHECK found in `supabase/migrations/038+` (grep for `'transfer'` hits only 091). Table predates the migrations | **Wave 0**: read live `pg_constraint` for `public.bookings`; if a CHECK exists, widen it in 092 |
| 17 | `types/database.types.ts:66,118,170` | `trip_type: string` | No (plain string) |
| 18 | Admin stats / `admin_search_bookings` | `p_trip_type` free text filter; stats map by value | No (generic) |
| 19 | Chatwoot / chat | `book_trip_type` is wizard visit context only | No |
| 20 | messages catalogs (8 locales) | trip-type display labels where used on manage/confirmation/emails | **Yes** only for strings rendered for a tour booking (new `Tours.*` namespace; do not reuse `hourly` labels) |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card hold / cash guarantee / consent / SetupIntent | A tour payment flow | `createCardCheckoutIntent` via the tour branch | consent text hashing, ledger, idempotency, 3DS, webhook confirmation are subtle (Phase 88/89) |
| Cancellation window logic | New date math | `evaluateCancellation` + a `tour-` snapshot | DST-safe integer-ms logic, shared by manage page, emails, admin dialogs |
| Operator overrun charge (D-04) | New charge endpoint | `lib/payments/extra.ts` kind `'other'` (operator types the amount; modal can show suggested `hours x extra_hour_<class>`) | extra-charge lock, ledger, consent gate (`consentCoversExtras('2026-11-3')` true [VERIFIED: consent-text.ts:41-44]) already exist |
| Lead delivery | Direct EspoCRM / Chatwoot calls from the route | `storeInquiry` + `dispatchAfterResponse(inquiryOutboxKey(id))` | outbox retry, breaker, idempotency, no PII in queue |
| Quote | A separate answer mechanism | Phase 92 quote builder | deposit, secret link, PDF, remainder |
| hreflang | Hand-built alternates | `getAlternates` (extended) | single source for sitemap + page tags |
| zh-hant | Manual translation | `opencc-js` converter already in repo | project rule |
| File upload through the function | multipart to a route | Supabase Storage `createSignedUploadUrl` | Vercel request body limit is **4.5 MB** [CITED: vercel.com/docs/functions/limitations]; phone photos exceed it |
| JSON-LD embedding | raw `JSON.stringify` | `safeJsonLd()` escaping `<`, U+2028/9 | tour text is admin-authored, `</script>` would break out |

**Key insight:** every hard part (money, consent, retries, locale routing) already exists; the risk in this phase is *integration drift* — a hard-coded value list (`trip_type`, inquiry `kind`, EspoCRM enums, CSP, CSRF prefixes) that nobody updated.

## Runtime State Inventory

Not a rename/refactor phase, but it **moves content out of files** and adds enum values to external systems.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `bookings` (new columns); `inquiries.kind` CHECK; no existing booking has `trip_type='tour'`. Existing day-trip JSON files hold the only copy of the current copy | Migration 092; seed script (insert-only) so admin edits are never overwritten; keep JSON in git history, delete from `content/pages/**/services/*-day-trip.json` only after the seed is verified |
| Live service config | EspoCRM (VPS): Lead `source` enum lacks `Custom tour`; CBooking `tripType` lacks `tour` [VERIFIED: infra/espocrm/enums.json:47-59, fields.json] | Add to `infra/espocrm/{enums,fields}.json`, owner runs `infra/espocrm/sync.mjs` **before** go-live (code is outbox-retried, but `failed` is terminal for a 400) |
| OS-registered state | None | None - verified: no cron/task references day-trip slugs |
| Secrets / env vars | `CHATWOOT_OPS_CONVERSATION_ID` (exists; used by no-show alert) if Chatwoot design A is chosen; `NEXT_PUBLIC_SUPABASE_URL` already used for the Storage host | None new unless Open Question 1 picks a new Chatwoot inbox |
| Build artifacts | Google index: `/services/*-day-trip` URLs are live (D-07 forbids redirects) | Keep slugs and canonical behaviour identical; do not 404 a locale that is currently served with EN content without the 307 to EN |

## Common Pitfalls

### Pitfall 1: Unpublished-locale URLs keep serving English
**What goes wrong:** `getPageContent` falls back to EN; a DB-backed page copying that behaviour leaks English under `/ru/...` (D-08 violation) and Google sees a duplicate.
**How to avoid:** published-locale check in the page; `redirect()` to the EN URL for others; hreflang + sitemap list only published locales; test with a tour that has only `en`.
**Warning signs:** `/ru/services/x-day-trip` returns 200 with Latin text.

### Pitfall 2: Enum drift in external systems (EspoCRM)
**What goes wrong:** `source: 'Custom tour'` or `tripType: 'tour'` rejected by EspoCRM -> Lead terminal `failed` / CBooking `booking_unmapped`.
**How to avoid:** add to `infra/espocrm/*.json`, pin in `tests/espocrm-enums.test.ts` (line 271 list) and `tests/espocrm-model.test.ts`, owner applies sync before deploy; until applied `leadSourceForInquiry` may return `Contact form` behind a constant (one-line switch).

### Pitfall 3: Tour policy snapshot silently becomes LEGACY
**What goes wrong:** a snapshot missing a field or out of range makes `policyFromSnapshot` return `LEGACY_POLICY` (free until 1 h) -> the client was shown 24 h, the system enforces 1 h.
**How to avoid:** `buildTourPolicySnapshot` unit test round-trips through `policyFromSnapshot` and asserts `policy !== LEGACY_POLICY` and `freeHoursFor(policy, {tripType:'tour', distanceKm:null}) === tourHours`; `parseCancelPolicyMeta` keeps the 500-char metadata limit (snapshot is ~150 chars).

### Pitfall 4: Admin PATCH re-prices a tour booking
**What goes wrong:** `app/api/admin/bookings/route.ts:559` casts the type and calls `computeOutboundLegTotal` -> wrong/NaN amount when the operator edits date/vehicle on a tour booking.
**How to avoid:** guard `effectiveTripType === 'tour'` (require `override_price`, never recompute) + test.

### Pitfall 5: `ISR` price staleness
**What goes wrong:** page shows an old price for up to `revalidate` seconds after an admin edit.
**How to avoid:** `revalidatePath('/[locale]','layout')` on every tour write; server `PRICE_CHANGED` (409) cross-check handles the residue; JSON-LD `priceValidUntil` uses `futureIsoDate(365)` and is normalized in snapshot tests (CLAUDE.md).

### Pitfall 6: Wizard-store coupling of the card UI
**What goes wrong:** `Step6CardOnFile`'s `CardForm` calls `useBookingStore.getState()` for the request body and `goToStep(5)` [VERIFIED: components/booking/steps/Step6CardOnFile.tsx:349,374,387]; `app/[locale]/book/confirmation/page.tsx` reads the wizard store for origin/destination/ICS [VERIFIED: it imports `useBookingStore`, lines 5, 267-270].
**How to avoid:** extract a store-agnostic `CardForm` (props: `buildBody(attemptId)`, endpoints, `onInvalidPhone`) and keep `Step6CardOnFile` as a thin wrapper; give the confirmation page a tour variant fed by a `writeConfirmationNotice`-style snapshot (ref, tour title, pickup instant). This is the largest UI refactor of the phase — budget it as its own plan with regression tests (`tests/Step6CardOnFile.test.tsx`).

### Pitfall 7: CSRF / rate-limit / CSP lists are hard-coded
**What goes wrong:** `/api/custom-tour` missing from `CSRF_PROTECTED_PREFIXES` (middleware.ts:10-33) and `LIMITS` (lib/rate-limit.ts) ships unprotected; Supabase Storage images blocked by CSP.
**How to avoid:** add `/api/custom-tour` to `CSRF_PROTECTED_PREFIXES` (precedent `/api/submit-multiday-quote`) and `LIMITS` (5/min, same as multi-day); extend `img-src` with the Supabase project host in `buildCsp`, `buildCspStatic` and `buildCspDriverHelp`-equivalents only where pages render tour photos (public pages + admin editor); add the host to `next.config.ts` `images.remotePatterns` (currently only `images.unsplash.com` [VERIFIED: next.config.ts]). `tests/middleware-i18n.test.ts` and `tests/middleware-csrf-forms.test.ts` pin these strings and must be updated deliberately. The card-checkout routes are already covered (`/api/card-checkout`).

### Pitfall 8: Existing copy states a price model that no longer exists
**What goes wrong:** migrated FAQ says "first 15 minutes of waiting are free ... charged for each started 15 minutes" and "Plan about nine hours in total" [VERIFIED: content/pages/en/services/dresden-day-trip.json]. Under D-01/D-02 the page must say: one price per car, N hours at the destination included, extra hours at the extra-hour price, overrun on the day charged only after operator approval.
**How to avoid:** author new launch content; test that no seed string matches `/15 min|started 15/` and none contains a currency amount.

### Pitfall 9: Unbounded "no limit" extra hours
**What goes wrong:** D-03 says no business limit; a crafted `extraHours = 100000` overflows `bookings.hours smallint`, the Stripe amount ceiling or the Prague day.
**How to avoid:** technical cap only (recommend `extraHours` integer 0..24, total `hours` <= 24 which already matches the quote-line `CHECK (hours BETWEEN 1 AND 24)`), not shown as a business limit; confirm with the owner (Open Question 5).

### Pitfall 10: Sitemap sync -> async
`app/sitemap.ts` is a synchronous default export and `tests/sitemap.test.ts` calls `sitemap()` without `await` [VERIFIED: tests/sitemap.test.ts:5-6]. Next supports an `async` default export (`export default async function sitemap(props)` appears in the official generateSitemaps example [CITED: nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap]). Update the tests to `await`.

### Pitfall 11: Photo licence compliance
See Legal / Licensing. Per-photo `license` + `credit_text` + `credit_url` are mandatory fields in `tour_photos` for non-own photos; render a localized "Photo credits" line; refuse publishing a tour whose non-own photo lacks them.

## Code Examples

### Tour fare (pure, no typed prices)
```ts
// lib/tours/pricing.ts — client-safe, the server calls the same function (single source)
export type CarKey = 'business' | 'first_class' | 'business_van'
export function tourFare(
  tour: { price_e_eur: number; price_s_eur: number; price_v_eur: number },
  settings: { extra_hour_e_eur: number; extra_hour_s_eur: number; extra_hour_v_eur: number },
  car: CarKey,
  extraHours: number,
): number {
  const base = car === 'business' ? tour.price_e_eur : car === 'first_class' ? tour.price_s_eur : tour.price_v_eur
  const hourly = car === 'business' ? settings.extra_hour_e_eur : car === 'first_class' ? settings.extra_hour_s_eur : settings.extra_hour_v_eur
  return base + Math.max(0, Math.floor(extraHours)) * hourly
}
```
(`business`/`first_class`/`business_van` = class keys of `VEHICLE_CONFIG` [VERIFIED: types/booking.ts:63-65]; E/S/V in admin copy.)

### Tour policy snapshot
```ts
// lib/tours/policy.ts
import { CANCELLATION_POLICY_VERSION, DEFAULT_POLICY, type CancellationPolicy } from '@/lib/cancellation-policy'
export const TOUR_POLICY_VERSION_PREFIX = 'tour-'
export function tourPolicy(freeHours: number): CancellationPolicy {
  return { ...DEFAULT_POLICY, version: `${TOUR_POLICY_VERSION_PREFIX}${CANCELLATION_POLICY_VERSION}`,
    freeHoursShort: freeHours, freeHoursLong: freeHours, freeHoursHourly: freeHours, feePercent: 100 }
}
// then buildPolicySnapshot(tourPolicy(h)) from lib/cancellation-settings.ts gives { version, snapshot } for meta.cancelPolicy
```

### safeJsonLd
```ts
export const safeJsonLd = (doc: unknown) =>
  JSON.stringify(doc).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
// <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(doc) }} />
```

### Custom-tour route skeleton (guard order of `submit-multiday-quote`)
```ts
// enforceMaxBody(req, 10_000) -> checkRateLimit('/api/custom-tour', ip) -> zod strict parse (400)
// -> honeypot -> normalizePhone (422 INVALID_PHONE) -> storeInquiry('custom_tour', {...payload, locale, tourSlug})
// -> operator alert + client ack (localized, locale from the form) -> dispatchAfterResponse(inquiryOutboxKey(id))
```

## JSON-LD decision (roadmap research item 1)

- Google's structured-data gallery has **no** `TouristTrip`, `Trip` or `Service` rich result; `Product` is the only commerce type listed [CITED: developers.google.com/search/docs/appearance/structured-data/search-gallery].
- Product snippets require `name` plus one of `review` / `aggregateRating` / `offers`; `offers` alone is eligible but the Rich Results Test warns without reviews; the doc only supports "single product" pages and does not address services; a past `priceValidUntil` can suppress display [CITED: developers.google.com/search/docs/appearance/structured-data/product-snippet].
- `TouristTrip` (schema.org: Thing > Intangible > Trip > TouristTrip) has `itinerary`, `touristType`, `offers`, `provider` [CITED: schema.org/TouristTrip]; Google eligibility is **not confirmed** (only informal 2020 mailing-list evidence).
- D-14 forbids tour-specific ratings, which removes the main Product benefit (stars).

**Recommendation (prescriptive):** emit one `@graph` per tour page: existing `#business` node (`businessNode`), a **`TouristTrip`** node (`@id` `.../services/<slug>#trip`, `inLanguage`, `name`, `description`, `provider -> #business`, `itinerary` ItemList of the itinerary titles, `touristType`, `offers` = 3 `Offer`s per car class with `price` from live DB values, `priceCurrency: 'EUR'`, `availability: 'https://schema.org/InStock'`, `priceValidUntil: futureIsoDate(365)`), plus `FAQPage` and `BreadcrumbList` (same pattern as `LandingView`). This keeps the project's Offer pattern (`buildRouteJsonLd` uses `Offer` with `price: String(route.eClassEur)`, `priceValidUntil` [VERIFIED: lib/jsonld.ts:100-130]) and costs nothing in rich-result eligibility because none exists for these types. **Do not** add `Product` or `aggregateRating` now; revisit when real tour reviews exist. Add the tour page to `tests/jsonld.test.ts`-style golden tests with `priceValidUntil` normalized (CLAUDE.md hard rule).

## Legal: package-travel classification (roadmap research item 2) — risk report only
Owner decided no counsel review (phase 89 D-16); this is a risk note, not advice.
- Directive (EU) 2015/2302 art. 3(2): a *package* is "a combination of at least two different types of travel services for the purpose of the same trip or holiday"; art. 3(1) types: carriage of passengers, accommodation, car/motor-vehicle rental, "any other tourist service not intrinsically part of" those [CITED: legislation.gov.uk/eudr/2015/2302/chapter/I].
- A private chauffeured day trip (drive there, wait, drive back) is **one** service type (carriage of passengers) -> not a package, and a "linked travel arrangement" also needs two different types.
- Art. 2(2)(a) additionally excludes "packages and linked travel arrangements covering a period of less than 24 hours unless overnight accommodation is included" [CITED: same page]. A same-day trip is outside the Directive even if it were a package.
- **Risk triggers (keep them out of scope/copy):** selling or arranging guides, entrance tickets or accommodation alongside the ride (a second service type); facilitating a separate booking of such services; multi-day trips. CONTEXT already excludes guides/tickets/multi-day; keep "not a guide, tickets not included" wording (it is the posture, not decoration). A 2024-25 amendment proposal changes the package definition for linked online bookings [CITED: search result summary, consilium.europa.eu] — unconfirmed for this use.
- **Czech transposition** (act 159/1999 Sb. on tourism business; Civil Code §2521ff "zájezd") was **not** verified: searches returned the NOZ definition pointer only. Tag `[ASSUMED]` that the Czech rules mirror the Directive's two-service-type and 24 h scope. Residual risk: Czech trade-licence category for what is effectively a tour sale (the operator holds a passenger-transport business already; unverified whether tour *marketing* needs a travel-agency licence). Report to the owner as accepted risk, do not block.

## SEO keyword map vs `/routes/*` (roadmap research item 3) — reasoned from code, no GSC data
GSC data is owner-run (`~/Desktop/founder prestigo/gsc_now.py`); not available here. Reasoning from titles in code:

| Intent | Owner URL | Title pattern (existing / new) |
|--------|-----------|--------------------------------|
| "prague to dresden transfer / taxi / private driver" (A->B, one way) | `/routes/prague-dresden` | "Prague to Dresden Transfer — Premium Chauffeur" [VERIFIED: content/routes/en/prague-dresden.json metadata] |
| "dresden to prague transfer" | `/routes/dresden-prague` (mirror) | existing |
| "dresden day trip from prague (private)", "prague dresden day trip with driver" | `/services/dresden-day-trip` | "Dresden Day Trip from Prague — Private Car & Chauffeur" [VERIFIED: content/pages/en/services/dresden-day-trip.json] |
| "day trips from prague private car/driver" | `/services/day-trips-from-prague` | existing hub title |
| Karlštejn / Bohemian Switzerland day trip | new tour pages (no route page exists: `ls content/routes/en` has none) | pattern "<Dest> Day Trip from Prague — Private Car & Chauffeur" |
| "Karlštejn castle day trip" informational | blog `karlstejn-konopiste-castle-day-trip-from-prague` (exists, 8 locales) | link blog -> tour page (commercial) and tour -> blog |

Rules: (1) tour titles say "Day Trip", never "Transfer"; route titles say "Transfer", never "Day Trip"; (2) every tour page links to its one-way route page ("Travelling on to Berlin? book the one-way transfer") and every route page's existing `dayTrip` section links to the tour page — the current route copy already targets "day trip" long-tail ("Popular day-trip configurations" in `prague-{dresden,cesky-krumlov,kutna-hora,karlovy-vary}`), which is the real cannibalization surface: change that section's anchor to point at the tour page and avoid an H1/H2 repeating the tour title; (3) tour pages keep self-referencing canonical per published locale; (4) hub canonical unchanged. After launch the owner runs the GSC script and checks query->URL pairs for `/routes/prague-*` vs `/services/*-day-trip`; if a route page ranks for "<dest> day trip", tighten that route section, do not noindex the tour.

## Photo licensing and storage (D-15)
- **Unsplash:** free for commercial use, no permission needed, attribution "not required" but appreciated; may not be sold unmodified or compiled into a competing service; says nothing about people / property / trademark rights [CITED: unsplash.com/license]. Download once and self-host; do not hotlink.
- **Wikimedia Commons:** each file has its own licence; CC BY / BY-SA require author credit, licence identification (name + link), share-alike for adaptations; PD / CC0 need none but crediting is recommended; the Foundation does not warrant licence accuracy; people / trademark rights are separate [CITED: commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia]. Machine check works: the Commons API returns `extmetadata` (author, licence) per file [VERIFIED: ran `action=query&prop=imageinfo&iiprop=extmetadata|url` against commons.wikimedia.org this session, response contained `ObjectName`, `DateTime`, `extmetadata`].
- **Process:** a manifest `content/tours-seed/photos.json` (file title, author, licence short name, licence URL, source URL, local file) filled from `extmetadata`; reject files with `NonFree`, "restrictions", or identifiable people close-up; prefer landscapes/architecture; for BY-SA never crop-and-relicense unmodified-claims. Our own car photos (`public/vehicles/*.avif`) need no credit.
- **Storage vs remote:** host in the `tour-photos` public bucket (Storage). `next/image` needs `remotePatterns` for the project host (only `images.unsplash.com` today) and CSP `img-src` (currently lists `images.unsplash.com` but not `*.supabase.co`; `connect-src` already allows `https://*.supabase.co` [VERIFIED: middleware.ts CSP lines]). Derive the hostname from `NEXT_PUBLIC_SUPABASE_URL` in `next.config.ts`, guarded for Preview builds without env.
- **Upload validation (admin):** mint a signed upload URL server-side (admin-gated, path `tours/<tourId>/<uuid>.<ext>` generated by the server, ext from an allow-list), bucket `allowed_mime_types` jpeg/png/webp/avif (no SVG), size limit in the bucket; register the row only after verifying the object exists. `public/` static files also need the middleware matcher extension list kept in sync (CLAUDE.md) if any new extension is shipped (none planned).

## Reviews (D-14)
Source: `getReviews()` in `lib/google-reviews.ts` returns Google reviews with `HARDCODED_TESTIMONIALS` (3 entries labelled "Verified booking ...") as fallback; `getStaticAggregateRating()` feeds `HeroRating` + the business JSON-LD only [VERIFIED: lib/google-reviews.ts:32-60,159,231]. `components/Testimonials.tsx` is an async server component that renders `TestimonialsCarousel` with localized `Testimonials.*` messages. Use `<Testimonials />` unchanged on the tour page; do not put `aggregateRating` on the `TouristTrip` node (D-14).

## Sitemap / hreflang
- `getAlternates` derives available locales from the filesystem (`hasLocaleContent`, `fs.existsSync`) [VERIFIED: lib/seo.ts:84-95]. Add an option `availableLocales?: readonly string[]` that, when present, replaces the `opts.content` probe (keep `en` always, `x-default` = EN URL). Tour `generateMetadata` passes the published-complete locales; canonical self-references only for those (CR-01 logic already does this for members of the cluster).
- `app/sitemap.ts`: make the default export `async`; replace the 5 `landingEntries` day-trip rows with `getPublishedTourLocales()` rows (`entry(...)` takes `opts`; extend it for `availableLocales`). `lastModFor` is git-based for files; for DB tours use `tours.updated_at`.
- Fallback without Supabase env: return no tour entries (never throw at build).
- Hub URL stays in the sitemap through the static JSON content ref.

## Admin structure
- Nav: add `Tours` and `Custom tours` entries to `navItems` in `components/admin/AdminSidebar.tsx` [VERIFIED: navItems list lines 35-47]. Admin UI strings are English only (no admin i18n).
- Routes follow `app/api/admin/*`: `getAdminUser()` -> `enforceMaxBody` -> JSON -> `z.strictObject` -> write -> `revalidatePath`. Page guard is the `(dashboard)/layout.tsx` (redirect to `/admin/login`, non-admin to `/`) and each API re-checks.
- Editor: locale tabs (8) with a completeness badge per tab, "Fill zh-Hant from zh", photo list with up/down + cover + credit fields, price E/S/V, hours included, start window, publish toggle (disabled until EN complete). Tour settings card (extra-hour E/S/V, free-cancel hours, pickup radius) on `/admin/tours` or `/admin/settings` next to `CancellationPolicySettings`.
- Custom tours page: list `inquiries where kind='custom_tour'` newest first with status derived from `quotes.source_inquiry_id` (open / quoted), "Create quote" button.

## Custom-tour lead pipeline (D-17/D-18)
**Touchpoints to extend for kind `custom_tour`** (all verified by reading):
1. `supabase/migrations/065_inquiries.sql:17` CHECK `(kind IN ('contact', 'corporate', 'multiday_quote'))` -> widen in 092 (pinned by `tests/outbox-migrations.test.ts:117`, update that assertion).
2. `lib/inquiries.ts:9` `export type InquiryKind = 'contact' | 'corporate' | 'multiday_quote'`.
3. `lib/lead-mapping.ts`: `InquiryRow.kind`, `leadSourceForInquiry`, `buildLeadFromInquiry` (new description builder: destination, date, people, wishes, tour slug), `LEAD_SOURCE` (new `'Custom tour'`).
4. `infra/espocrm/enums.json` Lead `source` values (+ `tests/espocrm-enums.test.ts:271` list) and a live apply.
5. Stats: `form_<kind>` sources in `supabase/migrations/083...sql` VALUES list and `lib/admin-stats.ts:113-128` — a new kind is silently absent from the stats until a migration re-creates the function and the TS label map is extended (optional but tests `stats-migration`/`admin-stats-period` pin the list).
6. `lib/email.ts`: operator alert + client ack (follow `sendMultidayOperatorAlert` / `sendMultidayClientAck`); **client ack must be localized** (use the catalog pattern of `lib/payments/emails`).
7. Erasure: `inquiries` rows are handled by Phase 82 erasure; the payload may hold phone/email — keep PII out of logs and outbox (ids only).
8. Guards: `enforceMaxBody(10_000)`, `checkRateLimit('/api/custom-tour')` (add to `LIMITS`), `z.strictObject`, honeypot (`website`) like `/api/contact`, `NO_LINE_BREAKS` on single-line fields, `normalizePhone` -> 422 `INVALID_PHONE`.

**Chatwoot leg (Open Question 1).** Today only `alert.no_show` writes to Chatwoot from an outbox row, as a **private** note in `CHATWOOT_OPS_CONVERSATION_ID` [VERIFIED: lib/noshow-alert.ts header; lib/chatwoot-client.ts:59-63 `loadChatwootOpsConversationId`]. Options: (A, recommended) new outbox event `alert.custom_tour:<inquiryId>` -> private note with reference + admin link, no PII, no VPS needed to *accept* the request, retried by the outbox; (B) create a Chatwoot contact + conversation (needs an API-channel inbox identifier that is not in the repo); (C) extend the Phase 82 identity resolver to inquiries (new SQL + trigger, largest). A needs: `OutboxEventType` + key regex in `lib/outbox.ts`, a handler gated on `chatwootConfig` in `lib/lead-sync.ts` `handleClaimed`, the SQL `outbox_enqueue` call (the table `event_type` is free text [VERIFIED: 064 line 25 `event_type text NOT NULL`], enqueue from the same inquiry trigger or from the route).

**"Create quote" (D-18):** `quotes.source_inquiry_id uuid` exists, nullable, no FK, cleared on erasure, never written by code [VERIFIED: 091_quotes.sql:42; grep]. `quoteCreateSchema` is `z.strictObject({ client, lead_channel, currency })` [VERIFIED: lib/quotes/schemas.ts:156-160] and `createQuoteDraft` picks the locale from the client's latest booking (`latestBookingLocale`) [VERIFIED: lib/quotes/store.ts:341-351]. Extend: optional `source_inquiry_id` (uuid; server verifies it exists and `kind='custom_tour'`) and optional `locale`; write `source_inquiry_id` on insert; `lead_channel` for a website request: `'other'` (the CHECK allows whatsapp/phone/email/partner/other). The builder prefill (date, pax, wishes) is client-side draft state only: a priced line needs Places coordinates, which a free-text destination cannot provide, so prefill client + locale + first-line `pickup_date`, `passengers`, `special_requests` and show the request text in a side panel. Link back: list view reads `quotes` by `source_inquiry_id`.

## Tour checkout details
- **Entry:** `/book/tour?tour=<slug>&date=&time=&pax=&car=&xh=` (query only holds UI choices; server re-validates everything). Sticky mobile bar + desktop box live on the tour page and navigate there.
- **Eligibility fallbacks:** `/api/card-checkout/init` returns `{ eligible: false }` opaquely (flag off, unknown tour, lead time < 12 h, pickup out of area). For tours show "Contact us / request a custom tour" instead of the pay-now wizard fallback (no tour pay-now path is built; D-11 lists only card-hold and cash).
- **Lead time:** `meetsBookingLeadTime` = 12 h [VERIFIED: intent route message "at least 12 hours"]; with a 24 h tour threshold a booking inside 24 h uses the existing `NoFree` consent wording (`freeUntilPassed`).
- **Booking row mapping** (`buildBookingRow` via `buildCheckoutMeta`): `trip_type='tour'`, `origin_address/lat/lng` = Prague pickup, `destination_address` = tour `destination_label`, `hours` = `hours_included + extraHours`, `passengers`, `vehicle_class`, `amount_eur/czk` from the priced total, `special_requests` = wishes, `tour_id`, `tour_title` (EN snapshot), `tour_extra_hours`. `distance_km` null. `buildCheckoutMeta` needs three new string keys (Stripe metadata is not used by the card flow; keys only feed `buildBookingRow`).
- **Emails/manage/admin:** confirmation, reminders (`reminder-24h/2h` select `trip_type`), manage page, `BookingDetailPanel`, driver/dispatch views must display the tour (title + "N h at destination") — audit rows 12, 13, 20 above; `bookingEmailDataFromRow` passes `destinationAddress` already.
- **Partner/GNet bookings** skip all money paths (milestone guardrail) — unaffected, tours are `booking_source='online'`.
- **Hold timing:** unchanged (`computeHoldAt`, default 72 h lead, Prague time, DST tests of 2027-03-28 / 2027-10-31 per milestone guardrail apply to tour pickup instants).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Day-trip copy in JSON + waiting-time price model | DB tours, fixed per-car price + included hours | this phase (D-01/D-08) | content and tests move; JSON deleted after seed |
| `landingEntries` static sitemap rows | async sitemap from DB | this phase | tests updated to `await` |
| Wizard-only card UI | store-agnostic card form | this phase | refactor of `Step6CardOnFile` |

**Deprecated/outdated:** CONTEXT's "`{day<Dest>E|V|S}` tokens ... to replace" (already removed); roadmap note "Expected migrations 089-090" (next is 092).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bookings.trip_type` has no live CHECK constraint (none in repo migrations, table predates them) | trip_type audit #16 | Inserts of `tour` rows fail in prod; Wave 0 must read `pg_constraint` |
| A2 | Czech transposition mirrors Directive 2015/2302 (two service types; <24 h excluded) | Legal | Tour sale could need a travel-agency licence / package rules |
| A3 | EspoCRM rejects unknown enum values with 400 on Lead POST (so `source: 'Custom tour'` fails until synced) | Pitfall 2 | If lenient, sync step is merely nice-to-have |
| A4 | Chatwoot design A (private note in the ops conversation) satisfies "lead in Chatwoot" for the owner | Lead pipeline | Owner may expect a contact/conversation (B/C) |
| A5 | No night/holiday surcharge applies to tours (price is fixed, D-01) | Pricing | Owner may want early-start surcharge |
| A6 | Technical cap of 24 h total / 24 extra hours is acceptable to the owner given D-03 "no limit" | Pitfall 9 | Owner wants literally unbounded |
| A7 | `coverage_zones` is not "Prague" (it gates transfer quote-mode), so D-05 needs its own radius setting | Open Question 4 | If zones == Prague, reuse and drop the radius setting |
| A8 | Tour bookings need no promo codes | Pattern 2 | Owner may want promo on tours |
| A9 | Product/aggregateRating can wait until real tour reviews exist (no SERP star loss today) | JSON-LD | None until reviews exist |
| A10 | Launch photos can be found with acceptable licences for all 6 tours (esp. Bohemian Switzerland / Karlštejn interiors) | Photo licensing | May need own photos or fewer images |

## Open Questions (RESOLVED)

All seven are answered in 93-CONTEXT.md (owner 2026-11-18 and Claude after research).

1. **What does "lead in Chatwoot" mean for a custom-tour request?** — RESOLVED: D-19
   - Known: no inquiry reaches Chatwoot today; only no-show alerts write private notes to the ops conversation.
   - Unclear: owner expectation (note vs contact vs conversation).
   - Recommendation: design A (private ops note, ids only) for PR 2; schedule B/C only if the owner asks. Decide before planning the TRIP-06 plan.
2. **Initial prices for Karlštejn and Bohemian Switzerland** — no route fare exists; owner or a distance-based estimate must supply E/S/V and hours-included for all 6 + the extra-hour price per class (D-02 says Claude proposes, owner confirms before go-live). — RESOLVED: D-21
3. **Does the owner want the 307-to-EN behaviour** for an unpublished locale of a tour (vs 404)? Recommendation: 307 to EN (keeps users, keeps the page recoverable). — RESOLVED: D-23
4. **How is "within Prague" (D-05) enforced?** Recommendation: admin-set `pickup_radius_km` around the Prague centre + airport refusal via `isAirportPickup` [VERIFIED: used in compute.ts:240]. Needs a default value from the owner (e.g. city + immediate suburbs). — RESOLVED: D-22
5. **Technical cap on extra hours** (D-03 conflict) — see A6/Pitfall 9. — RESOLVED: D-20
6. **Does the `zh-hant` content of tours get generated or hand-edited?** Recommendation: generated from zh on save via the converter, editable. — RESOLVED: D-24
7. **Hub copy**: confirm the hub stays a static JSON page with DB cards (recommended) rather than moving to the DB. — RESOLVED: D-25

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build / scripts | yes | v24.14.1 [VERIFIED: `node --version`] | — |
| Supabase (prod) + Storage | tables, bucket, photos | yes (live project) | — | Preview builds have no env: readers return empty |
| Supabase MCP | applying migration 092, reading `pg_constraint` | orchestrator only (executors have none, per project memory) | — | orchestrator applies + smokes |
| Stripe live keys | go-live proofs | local `.env.local` key is a dead placeholder (project memory) | — | owner-run scripts |
| EspoCRM / Chatwoot (VPS) | enum sync, Chatwoot note | owner-run `infra/espocrm/sync.mjs`; VPS SSH needs owner allow-rules | — | outbox retries; Supabase capture works without VPS |
| Wikimedia Commons API | licence metadata for photos | yes (queried this session) | — | manual licence page check |

**Missing with no fallback:** none blocking planning. **Owner-run steps at go-live:** EspoCRM enum sync, live card/cash proof bookings (precedent: 92-28), price/hours confirmation.

## Validation Architecture

Framework: vitest ^4.1.1, jsdom, `tests/setup.ts` [VERIFIED: vitest.config.ts]. Full suite ~90 s; quick: `npx vitest run <files>`; `vitest related` is broken here (grep `tests/`). Type check `npx tsc --noEmit` (baseline 8 errors in `tests/` only); lint `npx eslint --quiet <files>`; final gate = `verify` skill. `workflow.nyquist_validation` is absent in `.planning/config.json` -> enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.1 + @testing-library (jsdom) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/<file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRIP-01 | Slug resolves to landing or published tour; unknown -> 404; incomplete locale -> redirect EN; catalogue lists only published tours with complete locale | unit/render | `npx vitest run tests/tour-pages.test.tsx` | Wave 0 |
| TRIP-01 | Sitemap async: tour entries only for published-complete locales, hreflang cluster = those locales + x-default; no tour rows without env | unit | `npx vitest run tests/sitemap.test.ts tests/tour-sitemap.test.ts` | sitemap.test.ts exists (needs `await`); new file Wave 0 |
| TRIP-01 | `getAlternates` `availableLocales` option, EN always present, self-canonical only for members | unit | `npx vitest run tests/seo.test.ts` | exists (extend) |
| TRIP-02 | JSON-LD TouristTrip: prices equal DB values, `priceValidUntil` normalized, `safeJsonLd` escapes `</script>`, no aggregateRating | golden/unit | `npx vitest run tests/tour-jsonld.test.ts` | Wave 0 |
| TRIP-02 | No typed prices / "15 minutes" model text in seed content and components | unit | `npx vitest run tests/tour-seed-content.test.ts tests/seo-snippets-no-prices.test.ts` | seo-snippets exists; seed test Wave 0 |
| TRIP-02 | Each seeded tour x locale passes `isLocaleComplete` + leak guard; all 6 tours x 8 locales present | unit | `npx vitest run tests/tour-seed-content.test.ts` | Wave 0 |
| TRIP-03 | `tourFare` per class + extra hours (pure); admin schema rejects <=0, non-numeric | unit | `npx vitest run tests/tour-pricing.test.ts tests/admin-tours-route.test.ts` | Wave 0 |
| TRIP-04 | `validateCheckoutBooking` tour branch: unknown/unpublished tour, airport pickup, out-of-area, stops, promo, pax > class max, extraHours bounds | unit | `npx vitest run tests/checkout-compute-tour.test.ts` | Wave 0 (extend `checkout-compute.test.ts`) |
| TRIP-04 | `priceCheckout` tour returns server amount; client `displayedAmountMinor` mismatch -> 409 `PRICE_CHANGED` | unit | `npx vitest run tests/card-checkout-tour.test.ts` | Wave 0 (pattern: `card-checkout-intent.test.ts`) |
| TRIP-04 | Tour policy snapshot round-trips (`!== LEGACY_POLICY`, 24 h, 100 %), `evaluateCancellation` free/late/too_late across DST (2027-03-28, 2027-10-31) | unit | `npx vitest run tests/tour-policy.test.ts tests/cancellation-policy.test.ts` | cancellation-policy exists |
| TRIP-04 | `CARD_FLOW_TRIP_TYPES` includes tour; cash and card modes both create rows with `trip_type='tour'`, `tour_id`, `tour_extra_hours`, snapshot stored | integration (fake db) | `npx vitest run tests/card-checkout-tour.test.ts tests/helpers/fake-payments-db.ts` | Wave 0 |
| TRIP-04 | Admin PATCH on a tour booking never recomputes price | unit | `npx vitest run tests/admin-bookings-tour.test.ts` | Wave 0 (extend `admin-bookings.test.ts`) |
| TRIP-04 | trip_type enumerations: customer-mapping, EspoCRM map parity, dispatch KNOWN_TRIP_TYPES, fields.json options | unit | `npx vitest run tests/customer-mapping-parity.test.ts tests/espocrm-model.test.ts tests/admin-bookings-dispatch.test.ts` | exist (extend) |
| TRIP-04 | D-04 extra charge: `charge_extra` eligible for a completed tour booking (consent covers extras) | unit | `npx vitest run tests/payments-extra.test.ts` | check existing extra test name (Wave 0) |
| TRIP-05 | Admin tours API: auth order 401/403, strict schema, completeness set server-side, publish refused until EN complete, `revalidatePath` called, photo sign path server-generated + mime allow-list | unit | `npx vitest run tests/admin-tours-route.test.ts tests/admin-tour-photos.test.ts` | Wave 0 |
| TRIP-05 | Migration 092 text: RLS deny-all, REVOKE, CHECKs, bucket row | static | `npx vitest run tests/migration-092.test.ts` | Wave 0 (pattern `migration-091.test.ts`) |
| TRIP-06 | `/api/custom-tour`: maxBody -> rate limit -> zod 400 -> honeypot -> phone 422 -> `storeInquiry('custom_tour')` -> dispatch; no PII in logs | unit | `npx vitest run tests/custom-tour-route.test.ts` | Wave 0 (pattern `inquiry-routes.test.ts`) |
| TRIP-06 | `buildLeadFromInquiry` custom_tour description + source; outbox migration CHECK widened; lead-sync delivers; Chatwoot note handler (if A) | unit | `npx vitest run tests/lead-mapping.test.ts tests/lead-sync.test.ts tests/outbox-migrations.test.ts tests/custom-tour-chatwoot.test.ts` | exist (extend) + 1 new |
| TRIP-06 | Middleware: `/api/custom-tour` in CSRF list; limiter entry exists; CSP img-src host | unit | `npx vitest run tests/middleware-csrf-forms.test.ts tests/middleware-i18n.test.ts` | exist (extend) |
| TRIP-07 | `createQuoteDraft` writes `source_inquiry_id` + locale override, rejects non-custom_tour / unknown inquiry; list shows quoted status | unit | `npx vitest run tests/admin-quotes-route.test.ts tests/admin-custom-tours-route.test.ts` | exist (extend) + new |
| i18n | `Tours.*` namespace complete in all 8 catalogs, no EN leak, consent/terms copy present | unit | `npx vitest run tests/i18n-completeness.test.ts tests/tours-copy-i18n.test.ts` | completeness exists; new Wave 0 (pattern `quote-copy-i18n.test.ts`) |
| UI | Booking box car filtering by pax (E/S max 3, V max 6), sticky bar, gallery "+N" | component | `npx vitest run tests/tour-booking-box.test.tsx tests/tour-gallery.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** the task's own test file(s) + `npx tsc --noEmit`
- **Per wave merge:** `npx vitest run` for touched areas (`tests/*tour*`, checkout, payments, lead, middleware, sitemap, seo)
- **Phase gate:** full suite green, `verify` skill `pre-pr`, then owner live proofs (card hold, cash guarantee, quote from request) before the production go-live

### Wave 0 Gaps
- [ ] Live `pg_constraint` read for `public.bookings` (orchestrator, Supabase MCP)
- [ ] New test files listed above (tour pages, jsonld, pricing, policy, seed content, checkout compute/card, admin routes, migration 092, custom-tour route/chatwoot, tour copy i18n, UI components)
- [ ] `tests/sitemap.test.ts` rewritten to `await sitemap()`
- [ ] Fixture extension in `tests/helpers/fake-payments-db.ts` for tour columns (it already models `source_inquiry_id`)
- [ ] Seed source content (`content/tours-seed/**`) so seed/leak/price tests have data

## Security Domain

`security_enforcement` is absent in config -> enabled. Commit security-relevant work with the `security:` prefix (CLAUDE.md): public booking + payment surface, public inquiry form, admin photo upload, CSP/CSRF changes.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin) | `getAdminUser()` + layout gate; app_metadata.is_admin |
| V3 Session Management | no new surface | existing Supabase session cookies |
| V4 Access Control | yes | admin routes 401/403; tables RLS deny-all + REVOKE; draft/unpublished tours not bookable or readable publicly |
| V5 Input Validation | yes | zod `strictObject`, `NO_LINE_BREAKS`, slug regex, `SEGMENT_PATTERN`, server-side extraHours / pax / date checks, credit_url `https://` only |
| V6 Cryptography | no new | Stripe / consent hash reuse; no custom crypto |
| V8 Data Protection | yes | inquiry PII only in `inquiries`; outbox ids-only; logs carry ids/codes only |
| V12 Files | yes | signed upload URL, server-generated path, bucket MIME allow-list (no SVG), size limit, register-after-verify |
| V13 API | yes | CSRF Origin list + strict list, rate limits, `enforceMaxBody`, guard order (maxBody -> limit -> parse) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client tampers price / extra hours | Tampering | Server recompute only (`priceCheckout`), 409 `PRICE_CHANGED`, integer bounds on extraHours |
| Booking a draft / unpublished / deleted tour by slug | Elevation / Tampering | Tour load in `validateCheckoutBooking` requires `status='published'` and a complete EN or booking-locale translation |
| Pickup outside Prague / airport to get the fixed price (D-05) | Tampering | Server radius check + `isAirportPickup` refusal; coordinates parsed server-side, never trust client flags |
| Stored XSS via tour content in JSON-LD / HTML | Tampering / Info disclosure | `safeJsonLd`, React text rendering only, no `dangerouslySetInnerHTML` for tour text, `credit_url` https allow-list |
| Malicious image upload (SVG/script, huge, wrong type) | Tampering / DoS | Bucket MIME allow-list, size limit, server-generated path, no SVG, images served from a separate public-bucket origin |
| Public inquiry spam / mail abuse | DoS | Rate limit 5/min, honeypot, body cap, NO_LINE_BREAKS (SMTP header injection), operator alert contains no raw HTML |
| CSRF on checkout / inquiry | Tampering | Origin check lists in `middleware.ts` (add `/api/custom-tour`; `/api/card-checkout` already strict) |
| IDOR: quote created from any inquiry id | Elevation | Admin-only route; server validates the inquiry exists and `kind='custom_tour'`; `source_inquiry_id` never client-readable |
| Open redirect via tour/slug query | Spoofing | Slug regex + DB lookup before any redirect; redirect target built with `getPathname` |
| PII in Stripe metadata / logs | Info disclosure | Card flow does not use `buildCheckoutMeta` as Stripe metadata (only as row input) — keep it so for tour keys |
| Policy mismatch (shown 24 h, enforced legacy) | Repudiation | Snapshot round-trip test (Pitfall 3); consent text stores the server-rendered free-until moment |

## Project Constraints (from CLAUDE.md)
- Brand spelling **Prestigo** / **rideprestigo.com**. No hard-coded `€` prices in `app/` or `components/`; prices from `lib/route-prices.ts`, `lib/pricing-config.ts`, `lib/airport-promo.ts` (pre-commit enforced) — the tour price comes from the new DB tables via `lib/tours/*` (outside the grep scope like `lib/price-fallbacks.ts`) and **seed/content JSON must carry no amounts**.
- No secrets / `.env*` in commits; never read `.env.local`.
- Marketing content: no prices, no Uber/ride-hailing comparisons; live prices only (`<Price>` / `getFares()` patterns for blog; tours use their own tables).
- `middleware.ts` matcher must exclude every static/metadata extension; next-intl sets `NEXT_LOCALE` on every response (never treat as a user choice).
- New EN strings in `messages/en.json` need real translations in all other locales; never run `scripts/i18n-translate.mjs --dry-run` on the repo tree.
- Golden-HTML / JSON-LD snapshot tests must normalize `priceValidUntil`.
- Security work: run tests, commit with `security:` prefix. Vercel Preview deploys always fail (missing Supabase env) — non-blocking; but readers must degrade without env.
- Public pages: `params.locale` + `setRequestLocale`, never bare `getLocale()`; never create Supabase clients during render at module scope.
- Commands: `npx tsc --noEmit`, `npx eslint --quiet <files>`, `npx vitest run [files]`, `verify` skill; dev server only via `preview_start prestigo`.
- Project memory worth carrying into plans: migrations are applied and smoked by the orchestrator (executors have no Supabase MCP, npm install blocked in subagents); stage explicit paths (another session edits the main checkout); Stripe local key is invalid (owner-run live scripts); messages has 8 locale files.

## Plan Slicing Recommendation (for the planner)
- **PR 1 (TRIP-01..05):** W0 migration 092 + live constraint check; tours data layer + admin API/UI + photos; public catalogue/tour pages + JSON-LD + sitemap/hreflang; checkout tour branch + card-form extraction + confirmation variant + emails; content authoring (6 x 8) + seed + photos.
- **PR 2 (TRIP-06/07):** inquiry kind + form page + route + emails; EspoCRM enum changes (owner sync); Chatwoot leg per Open Question 1; admin custom-tours list + quote prefill/link.
- Highest-risk plans (give them their own verification): card-form extraction (Pitfall 6), trip_type audit rows 2-9, locale publishing + hreflang, EspoCRM enum sync.

## Sources

### Primary (HIGH confidence)
- Codebase files read this session (paths cited inline): `lib/checkout/compute.ts`, `app/api/card-checkout/{init,intent}/route.ts`, `lib/payments/{checkout,config,consent-text,extra}.ts`, `lib/cancellation-policy.ts`, `lib/cancellation-settings.ts`, `lib/supabase.ts`, `lib/landing-pages.ts`, `app/[locale]/services/[slug]/page.tsx`, `components/LandingView.tsx`, `lib/seo.ts`, `app/sitemap.ts`, `lib/jsonld.ts`, `lib/live-prices.ts`, `lib/inquiries.ts`, `lib/lead-mapping.ts`, `lib/lead-sync.ts`, `lib/outbox.ts`, `app/api/submit-multiday-quote/route.ts`, `app/api/contact/route.ts`, `supabase/migrations/065_inquiries.sql`, `091_quotes.sql`, `lib/quotes/{types,schemas,store}.ts`, `middleware.ts`, `next.config.ts`, `lib/rate-limit.ts`, `infra/espocrm/{enums,fields}.json`, `types/booking.ts`, `package.json`, `vitest.config.ts`
- [Next.js sitemap docs](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap) and [generateStaticParams docs](https://nextjs.org/docs/app/api-reference/functions/generate-static-params) — async sitemap; `dynamicParams`; empty array for runtime ISR
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations) — 4.5 MB request body
- [Directive (EU) 2015/2302 text, Chapter I](https://www.legislation.gov.uk/eudr/2015/2302/chapter/I) — arts. 2(2), 3(1), 3(2), 3(5)
- [Google structured data gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) and [Product snippet docs](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- [schema.org TouristTrip](https://schema.org/TouristTrip)

### Secondary (MEDIUM confidence)
- [Unsplash License](https://unsplash.com/license); [Wikimedia Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia); Commons API call executed this session (works)
- Web search on TouristTrip vs Product (vendor guides, 2020 schema mailing list) — only used to confirm absence of an official Google TouristTrip rule

### Tertiary (LOW confidence)
- Czech act 159/1999 Sb. / Civil Code §2521ff scope — search returned only the NOZ pointer; not verified (A2)
- Pending amendment of the Package Travel Directive (consilium.europa.eu search snippets) — unverified applicability

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every reused module read.
- Architecture: HIGH — extension points verified in code; two items need live checks (A1 bookings constraint, A3 EspoCRM behaviour).
- Pitfalls: HIGH for code-derived ones (1-4, 6-10); MEDIUM for legal / licensing.
- SEO map: MEDIUM — reasoned from titles, no GSC data.

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (codebase moves fast: another session edits the main checkout; re-grep the trip_type list and `LANDING_PAGES` before planning if more than a week passes)
