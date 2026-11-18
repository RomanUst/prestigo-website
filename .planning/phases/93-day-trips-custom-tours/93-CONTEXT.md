# Phase 93: Day Trips & Custom Tours - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the existing day-trip landing pages into a bookable day-trip catalogue managed from admin, with a separate tour booking flow modelled on the GetYourGuide tour page, and add a custom-tour request that becomes a lead and is answered with a Phase 92 quote. Requirements TRIP-01..TRIP-07.

Not in this phase: guides, tickets, multi-day tours, stops added inside a catalogue booking, tour-specific reviews collection, availability/capacity engine.

</domain>

<decisions>
## Implementation Decisions

### Carried forward (roadmap / prior phases, not re-asked)
- PR #102 (merged 2026-11-14) already ships five day-trip landing pages in all 8 locales: hub `/services/day-trips-from-prague` and `/services/{cesky-krumlov,kutna-hora,karlovy-vary,dresden}-day-trip`, content in `content/pages/<locale>/services/*.json`, config in `lib/landing-pages.ts`, live fare tokens `{day<Dest>E|V|S}` from `getLandingPrices()` (round-trip formula). Copy: chauffeur waits on site, is not a guide, tickets and guides not included, child seats free. Phase 93 builds on these pages, it does not create parallel ones.
- Marketing rules: no typed prices anywhere (prices come live from admin data, ISR-revalidated, no stale JSON-LD prices), no Uber / ride-hailing comparisons, no fake scarcity ("booked 6 times yesterday", "likely to sell out"), no fabricated reviews or ratings.
- Every client-facing string gets real translations in all site locales (8: en, ru, es, fr, ar, hi, zh by hand, zh-hant generated from zh by `scripts/zh-hant-sync.mjs`). AI translation credits are empty: translate in-session. A locale is published for a tour only when its content is complete (no English leaking).
- Payments reuse the Phase 88/89 engine; the server is the price authority, the client never sends an amount. All times Prague time, DST-safe.
- Extra charges after the trip are operator-approved, never automatic (Phase 91 extra-charge action on the saved card).
- Custom-tour answer is a Phase 92 quote (deposit + remainder method, secret link, PDF).
- Next migration number is 092. The `trip_type` value set is checked in many places (bookings, `091_quotes.sql` quote lines `CHECK (trip_type IN ('transfer','hourly','daily'))`, `lib/pricing.ts`, `BookingWizard` VALID_TRIP_TYPES, lead/chatwoot/calendar mappings): every use must be audited before adding a tour type.

### Price (owner, 2026-11-18)
- **D-01:** Each tour has a fixed price per car by class E / S / V, edited in admin per tour. Initial values are computed once from today's formula (route fare + return leg with the return discount) and then edited by hand; the formula no longer drives tour prices. — **Reversibility:** costly — tour pages, booking, JSON-LD and the existing `{day<Dest>*}` tokens switch to the stored price.
- **D-02:** Each tour has an admin field "hours included at the destination" (shown on the page). The client can add extra hours while booking; extra hours are priced by ONE per-class hourly price (E / S / V) set once in the tour settings in admin, for all tours.
- **D-03:** No upper limit on extra hours added at booking (owner: "Без ограничения").
- **D-04:** If the client overruns the booked time on the day, the operator may charge the overrun at the same per-class extra-hour price through the existing operator extra-charge action; never automatic.
- **D-05:** The price is the same for any pickup address within Prague, and the car returns to the same place. Pickup from the airport, from outside Prague or any route change goes through the custom-tour request.

### Catalogue and URLs (owner, 2026-11-18)
- **D-06:** Launch catalogue = 6 tours: Český Krumlov, Kutná Hora, Karlovy Vary, Dresden (existing pages) + Karlštejn and Bohemian Switzerland (new). More tours are added later by the operator in admin.
- **D-07:** Keep the existing URLs: `/services/day-trips-from-prague` is the catalogue, `/services/<slug>-day-trip` is a tour page; new tours follow the same pattern (`/services/karlstejn-day-trip`, `/services/bohemian-switzerland-day-trip`). No redirects. — **Reversibility:** costly — URLs are indexed in Google.
- **D-08:** Tour content (title, short description, itinerary, highlights, includes / excludes, pickup info, FAQ, SEO title/description) is edited in admin per locale. A locale of a tour is shown on the site only when that locale is fully filled. Claude writes and translates the launch content for all 6 tours in all locales (existing page copy is migrated into the admin data). Publish / unpublish per tour in admin; a change appears on the site without a redeploy. — **Reversibility:** one-way — needs a migration (tour tables) and moves content from JSON files to the DB.

### Booking flow (owner, 2026-11-18)
- **D-09:** A NEW tour booking flow, not connected to the existing `/book` wizard. Reference given by the owner: GetYourGuide tour page https://www.getyourguide.com/cesky-krumlov-l1189/from-prague-excursion-to-cesky-krumlov-and-hluboka-castle-t1400596/ — gallery (one large photo + small ones, "+N" opens all), title, short description, key facts (free cancellation, reserve now pay later, duration), highlights, full description, includes / excludes, booking box on the right on desktop and a sticky bottom bar "from … / Book" on mobile, meeting/pickup point, important info, "you might also like" other tours, reviews.
- **D-10:** Booking box on the tour page: date, start time, passengers → shows the car classes that fit the passenger count with their price → extra hours → "Book". The next page (tour checkout) collects pickup address in Prague, contact details, wishes, and payment. Price shown "per car", never "per person".
- **D-11:** Payment modes are the same as transfers: saved card with hold before the trip ("reserve now, pay later") or cash to the driver with the card as guarantee. Same Stripe / consent / hold engine.
- **D-12:** Tours get their OWN free-cancellation threshold: an admin setting, default 24 hours before pickup, after that 100%. Shown on the tour page and in the checkout. Needs new cancellation-terms copy in all locales. — **Reversibility:** costly — the terms shown at booking are part of the logged consent.
- **D-13:** No stops or route changes inside a catalogue booking. Wishes go into a free-text field. A visible block "Didn't find what you were looking for? Request a custom tour" leads to the custom-tour request.
- **D-14:** Reviews block: show our real existing service reviews (the same source the site already uses). No tour-specific ratings or reviews until real ones exist; nothing invented.

### Photos and custom tour (owner, 2026-11-18)
- **D-15:** Gallery photos at launch: freely licensed photos (Wikimedia Commons, Unsplash) with attribution where the licence needs it, plus our own car photos. Admin can upload and reorder photos per tour to replace them.
- **D-16:** The custom-tour block appears on the catalogue page and on every tour page (under the booking box). The request form lives on its own page; when opened from a tour page, that tour is prefilled as the starting point.
- **D-17:** Short request form: where you want to go (free text), date, number of people, wishes, name, email, phone / WhatsApp. The operator clarifies the rest.
- **D-18:** The request becomes a lead in Supabase, EspoCRM and Chatwoot through the existing lead pipeline (Phase 81/83), without depending on the VPS. In admin the request has a "Create quote" button that opens the Phase 92 quote builder prefilled with client, language and date; the request and the quote are linked.

### Decisions after research (owner, 2026-11-18)
- **D-19:** "Lead in Chatwoot" = a private note in the operators' ops conversation ("new custom-tour request" + admin link, ids only, no PII), same mechanism as the no-show alert. The client is answered by the quote email, not from Chatwoot.
- **D-20:** Extra hours at booking are capped at 12 (technical guard; more goes through the custom-tour request). Supersedes the "no limit" wording of D-03.
- **D-21:** Initial prices (E/S/V per tour, hours included, extra-hour price per class) are proposed by Claude from current tariffs and shown to the owner as a table; tours stay unpublished until the owner approves the table (human checkpoint before go-live).
- **D-22:** "Within Prague" (D-05) is enforced by an admin-configurable pickup radius from the Old Town Square (default 15 km); the airport and addresses beyond the radius are refused politely with a link to the custom-tour request.
- Correction to the carried-forward note: the `{day<Dest>*}` tokens and `DAY_TRIP_FALLBACK` were removed in 55b5a179; the current day-trip copy describes a waiting-time price model that contradicts D-01/D-02, so launch copy is rewritten in all locales, not just moved.

### Decided by Claude after research
- **D-23:** A tour locale that is not complete redirects (307) to the EN tour URL; English is never shown under another locale prefix.
- **D-24:** zh-hant tour content is generated from zh with the same opencc-js converter (seed and an admin "regenerate zh-hant" action).
- **D-25:** The hub page `/services/day-trips-from-prague` keeps its static JSON copy; its tour cards come from the DB (published tours).
- **D-26:** Two PRs: PR 1 = TRIP-01..05 (catalogue, admin, booking); PR 2 = TRIP-06/07 (custom tour + quote). EspoCRM enum values (`Custom tour` lead source, `tour` trip type) are synced by the owner via `infra/espocrm/sync.mjs` before each go-live.

### Claude's Discretion
- Data model (tour tables, translations, photos storage), the booking/trip_type representation, how tour bookings reuse the bookings table and payment engine, and ISR/revalidation strategy.
- Exact UI of the booking box and checkout, following the reference and the site's navy/champagne design system.
- JSON-LD type for tour pages (TouristTrip vs Product/Offer) — research decides; prices in JSON-LD come from live data with normalized `priceValidUntil` in snapshot tests.
- Initial included-hours and extra-hour prices are proposed by Claude from current tariffs and shown to the owner before go-live.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §Phase 93 — goal, success criteria, research-before-planning list (JSON-LD type, package-travel classification, GSC keyword map vs `/routes/*`)
- `.planning/REQUIREMENTS.md` — TRIP-01..TRIP-07

### Existing day-trip pages (PR #102)
- `lib/landing-pages.ts` — landing page config incl. the five day-trip slugs
- `content/pages/<locale>/services/day-trips-from-prague.json`, `content/pages/<locale>/services/*-day-trip.json` — current copy in 8 locales
- `getLandingPrices()` and the `{day<Dest>E|V|S}` tokens, `DAY_TRIP_FALLBACK` — current live price path to replace

### Payments, cancellation, quotes
- `.planning/phases/89-*/89-CONTEXT.md` — payment modes, cancellation policy, consent
- `.planning/phases/91-multi-stop-transfers-airport-pickup-waiting-fees/91-CONTEXT.md` — operator extra charge on the saved card
- `.planning/phases/92-quotes/92-CONTEXT.md` — quote model used to answer custom tours
- `lib/cancellation-policy.ts` — policy evaluation to extend with the tour threshold

### Leads
- `lib/lead-mapping.ts`, `lib/lead-sync.ts` — inquiry kinds (`contact`, `corporate`, `multiday_quote`) and CRM mapping; add a custom-tour kind
- `app/api/submit-multiday-quote/route.ts`, `components/booking/MultiDayForm.tsx` — closest existing request form

### Owner reference
- GetYourGuide tour page (layout reference only, do not copy content or claims): https://www.getyourguide.com/cesky-krumlov-l1189/from-prague-excursion-to-cesky-krumlov-and-hluboka-castle-t1400596/

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Landing page renderer + `content/pages` JSON for the current day-trip copy (source for the admin data migration).
- Phase 88/89 payment engine (saved card hold, cash guarantee, consent logging) and Phase 91 extra-charge action.
- Phase 92 quote builder (`components/admin/quotes/QuoteBuilder.tsx`) and `lib/quotes/*` for answering custom tours.
- Lead pipeline (`lib/lead-sync.ts`, EspoCRM, Chatwoot mapping) for custom-tour requests.
- Real reviews block already used on the site; vehicle photos under `public/vehicles/`.

### Established Patterns
- Admin pricing data lives in Supabase (`route_prices`, `pricing_globals`) and is read live; no prices in code.
- `trip_type` values are enumerated in many files and in SQL CHECK constraints.
- Public pages must use `params.locale` + `setRequestLocale` (never bare `getLocale()`), and middleware matcher must exclude static extensions (new photo formats).
- Supabase clients are never created during render (Vercel Preview).

### Integration Points
- `/services/<slug>-day-trip` pages switch from JSON content to admin tour data.
- New tour checkout page and API reuse the booking + payment-intent path.
- Admin: tours list/editor, tour settings (extra-hour price per class, free-cancellation hours), custom-tour requests with "Create quote".
- Sitemap and hreflang must list only published locales per tour.

</code_context>

<specifics>
## Specific Ideas

- Layout follows the GetYourGuide tour page, adapted: private car per group, price per car, no guide language selector, no "booked N times" or scarcity badges.
- The "Didn't find what you were looking for? Request a custom tour" block is a first-class element on catalogue and tour pages.

</specifics>

<deferred>
## Deferred Ideas

- Stops / route changes inside a catalogue booking (handled via custom tour for now).
- Tour-specific reviews and ratings once real ones exist.
- Guides, entrance tickets, multi-day tours.

</deferred>
