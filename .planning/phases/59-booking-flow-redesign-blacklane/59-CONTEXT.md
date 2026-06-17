# Phase 59: Booking Flow Redesign (Blacklane) - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase rebuilds the first two steps of the booking wizard in Blacklane style:

- **Entry bar (replaces Step1 + Step2):** a single-screen form — From / To / Date / 15-min time-slot — with trip-type tabs and optional "Add return" checkbox. For airport-transfer routes, an inline flight number field appears alongside the time-slot.
- **Vehicle selection screen (Step3 redesign):** vehicle class cards on the left, a sticky right panel (animated route map + booking summary + CTA). An additional block below the cards shows an animated slideshow of interior and luggage photos.

**Out of scope (boundary anchors):**
- Steps 4–6 (Extras, Passenger, Payment) are unchanged in logic and UI in this phase.
- "Book for myself / Book for a guest" auth-choice functionality → **Phase 60** (BOOK-06). The right panel CTA is a simple "Select [class]" with no auth branching.
- Pre-filling passenger data from customer profile → Phase 60 (BOOK-07/08).
- Auth screen between vehicle selection and passenger data → Phase 60.

</domain>

<decisions>
## Implementation Decisions

### Entry bar — structure

- **D-01:** The unified entry bar is a **single screen** showing From / To / Date / Time simultaneously (one consolidated form, not two separate steps). It replaces the current Step1TripType + Step2DateTime.
- **D-02:** Trip type (Transfer vs Hourly) is selected via **tabs above the bar** ("Transfer" active by default). When Hourly is selected, the "To" field is hidden and a duration/hours selector appears instead. Daily and round_trip remain available elsewhere but are not in the main bar tabs.
- **D-03:** Round trip is handled via a **checkbox "Add return" below the bar**. When checked, a return date/time field expands. No separate "Round Trip" tab.
- **D-04:** The CTA label on the entry bar is **"Посмотреть варианты"** (not "Продолжить" or "Search"). On submit it transitions to Step3 (vehicle selection).
- **D-05:** **No pax selector in the entry bar.** Passenger capacity is communicated on the vehicle cards.

### Entry bar — flight number (BOOK-03)

- **D-06:** When the **From** address is detected as an airport (using the existing `isAirportPlace` helper in `types/booking.ts`), the time-slot field **stays** and an additional **flight number** text field appears inline in the bar. The time-slot is still required (driver uses it as a fallback; flight tracking adjusts if flight is delayed). The flight number field does not appear for non-airport routes.

### Time-slot dropdown (BOOK-02)

- **D-07:** Time-slot granularity is **15 minutes** with **AM/PM format** (e.g., 12:00 AM, 12:15 AM … 11:45 PM). 96 options per day.
- **D-08:** The existing store field `pickupTime` (HH:MM, 24h) is preserved internally. The dropdown renders AM/PM labels but stores and sends the value in the existing 24h format to avoid breaking downstream API calls and analytics.

### Vehicle selection — layout

- **D-09:** Vehicle class cards are on the **left**. A **sticky right panel** contains: animated route map (top) + booking summary (selected class, price, "All fees included") + CTA "Select [Class]" (bottom). This mirrors the Blacklane layout seen at blacklane.com/en/booking/.
- **D-10:** **Mobile**: the right sticky panel is hidden. Cards are full-width. Map is hidden on mobile entirely.

### Vehicle selection — route map (BOOK-04)

- **D-11:** The map uses **Google Maps JS SDK** (not Static API) to render an interactive route polyline with pickup and drop-off markers, and **animates a moving point** along the polyline automatically when Step3 loads (no user interaction required). The animation loops or plays once — Claude's discretion on loop vs one-shot.
- **D-12:** Map markers show pickup time and drop-off time (estimated, from the API) in small labels directly on the map, as on Blacklane.
- **D-13:** The existing Google Maps API key (already used for Places Autocomplete in the booking wizard) is reused for the Maps JS SDK. No new API credentials needed.

### Vehicle cards — design (BOOK-05)

- **D-14:** Each vehicle card shows: **exterior photo** (Higgsfield-generated, neutral/studio background — no city backdrop, clean and informative like the Mercedes online configurator), class name, price, passenger capacity icon, luggage capacity icon.
- **D-15:** Below the three cards, a **separate expandable block** shows an **animated slideshow** of interior photos + luggage capacity photos — several slides, Higgsfield AI-generated, photorealistic. This block is shared/independent of the individual cards.
- **D-16:** The **"What's included" list** is identical across all vehicle classes:
  1. Фиксированная цена (Fixed price guaranteed)
  2. Зарядка для телефонов (Phone charging)
  3. 60 минут бесплатного ожидания (60 min free waiting)
  4. Wi-Fi
  5. Вода на борту (Water on board)
  6. Meet & greet (airport pickups)

  This list appears on each card (or in the block below — Claude's discretion on placement within the card).

### Image generation (scoped task in Phase 59)

- **D-17:** Higgsfield AI image generation is a **planned sub-task of Phase 59** (not deferred). The planner must include tasks for generating:
  - 3 exterior photos (E-Class W213, S-Class W223, V-Class W447) — neutral/studio background, 2025+ model year, photorealistic
  - Interior slideshow images per class (3–5 slides each): cabin interior + luggage capacity visual
  These images are committed to `/public/vehicles/` before the component tasks that reference them.

### Scope boundary — preserved assets

- **D-18:** The **Zustand booking store** (`lib/booking-store`), all pricing API calls (`/api/calculate-price`), the URL deeplink logic, and all six analytics systems (GA4, Meta Pixel/CAPI, Measurement Protocol, `analytics-snapshot.ts`, CSP nonce, Consent Mode v2) are **not refactored** — only the UI components that render Steps 1–3 change.
- **D-19:** Analytics events must fire at equivalent logical moments in the rebuilt flow: `form_start` on Entry bar mount, `checkout_progress` when advancing from entry bar to Step3, `view_item_list` / `view_item` on Step3 load, `begin_checkout` on vehicle select CTA. The researcher/planner maps exact event placements.

### Theme and colors

- **D-20:** The booking flow (entry bar + vehicle selection) uses the **light theme** — white/offwhite backgrounds, dark text — matching the existing booking widget already implemented on the site (`BookingWidget.tsx`). The dark anthracite theme used for marketing pages and the admin UI does NOT apply to the booking wizard. Colors must stay consistent with the existing light booking widget implementation.

### Claude's Discretion

- Whether the map animation loops or plays once when Step3 loads.
- Exact pixel dimensions and aspect ratio of the sticky right panel and the map section within it.
- Whether "What's included" is an expandable accordion or always visible on each card.
- Whether the exterior car photo is full-bleed card background or a contained image area.
- Form validation details in the Entry bar (required field highlighting, error states).
- Whether the animated slideshow (interior/luggage block) auto-plays or requires user interaction.
- Exact copy for button labels, "All fees included" note, and empty state for map if route cannot be computed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing booking wizard (the substrate being redesigned)

- `components/booking/BookingWizard.tsx` — current 6-step wizard; Entry bar replaces Step1+Step2 logic. URL deeplink and Zustand reset on mount must be preserved.
- `components/booking/steps/Step1TripType.tsx` — the component being replaced; understand what it sets on the store before removing.
- `components/booking/steps/Step2DateTime.tsx` — the component being replaced; understand current time picker behaviour and store writes.
- `components/booking/steps/Step3Vehicle.tsx` — the component being redesigned; read current VehicleCard usage and price API call.
- `components/booking/VehicleCard.tsx` — existing card; redesigned in this phase. Read props interface before changing.
- `components/booking/TripTypeTabs.tsx` — existing tab component; may be reused or replaced by new tab design.
- `lib/booking-store.ts` — Zustand store; `currentStep`, `tripType`, `pickupTime`, `origin`, `destination`, `vehicleClass` etc. Store shape must not change (downstream steps depend on it).
- `types/booking.ts` — `isAirportPlace()` helper used for D-06 flight number detection.

### Analytics (TRACK-01, TRACK-02, TRACK-03, TRACK-05 — must not regress)

- `lib/analytics-snapshot.ts` — sessionStorage price snapshot fired on vehicle selection. Preserve the trigger point in Step3.
- `components/MetaPixel.tsx` + `trackMetaEvent` — used in `BookingWizard.tsx`; `InitiateCheckout` / `AddPaymentInfo` / `Purchase` with `eventId`.
- `app/book/page.tsx` — renders the schema.org markup and `<BookingWizard />`; understand the full page structure before editing.
- `.planning/codebase/INTEGRATIONS.md` — GA4 event names, Meta CAPI deduplication, CSP nonce pattern.

### Phase 58 context (the auth substrate)

- `.planning/phases/58-sign-in-ui-account-dashboard/58-CONTEXT.md` — D-09 (Nav stays client-side, no dynamic rendering drag-in). The rebuilt booking pages must not accidentally force `/book` into dynamic rendering.

### Project conventions

- `.planning/codebase/CONVENTIONS.md` — PascalCase components, Tailwind utility-first, CSS vars (`--color-anthracite`, `--color-copper`, `--color-offwhite`), dark-theme design tokens.
- `.planning/codebase/STACK.md` — Next.js 16 App Router, React 19, Tailwind 4, Vercel. No new heavy dependencies without justification.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `lib/booking-store.ts` — Zustand store with `setTripType`, `setOrigin`, `setDestination`, `setPickupDate`, `setPickupTime`, `setVehicleClass`. Entry bar reads/writes these directly; no store shape changes needed.
- `isAirportPlace()` in `types/booking.ts` — already detects airport routes; reuse for D-06 conditional flight number field.
- `components/booking/ProgressBar.tsx` — step progress indicator; will need updating when Step1+Step2 merge into one.
- `components/booking/VehicleCard.tsx` — existing card with hover state, price display, CZK conversion, round-trip toggle. Keep the price logic; replace the visual shell.
- `trackMetaEvent` from `components/MetaPixel.tsx` — already imported in `BookingWizard.tsx`; keep all call sites.
- Google Maps API key already in env (`NEXT_PUBLIC_GOOGLE_MAPS_KEY` or equivalent) for Places Autocomplete — reuse for Maps JS SDK.

### Established Patterns

- Zustand state reads inside `useEffect` use `useBookingStore.getState()` (not the hook) to avoid stale closures — follow this pattern in the new Entry bar component.
- Client components use `'use client'` at the top; pages are Server Components. The Entry bar and vehicle selection components will be client components.
- URL deeplink pre-fill: `sessionStorage.getItem('booking_deeplink')` pattern in `BookingWizard.tsx` must survive the refactor.

### Integration Points

- `app/book/page.tsx` renders `<BookingWizard />` inside a section; the redesigned wizard plugs in at the same mount point.
- `ProgressBar` component is tied to `currentStep` — step numbering changes (Step1+Step2 → single step) must be reflected.
- `/api/calculate-price` is called in Step3 — the redesigned Step3 calls the same API with the same Zustand store values; no API changes.

</code_context>

<specifics>
## Specific Ideas

- **Blacklane reference:** blacklane.com/en/booking/ — the exact layout the redesign targets. Left: cards (3 per row). Right sticky: compact route map with pickup/drop-off time labels + selected class summary + CTA. The reference screenshot (2026-06-17) was shared during discussion.
- **Card exterior images:** Higgsfield AI, neutral/studio background (no city backdrop), like the Mercedes online configurator layout. Not abstract — photorealistic, clean, informative.
- **Interior + luggage slideshow:** Several animated slides per class, Higgsfield AI, maximum realism. Committed to `/public/vehicles/` before component work begins.
- **CTA copy:** "Посмотреть варианты" on the Entry bar submit button.
- **Time-slot format:** AM/PM display (12-hour), 15-minute granularity. Stored internally as 24h HH:MM.

</specifics>

<deferred>
## Deferred Ideas

- **"Book for myself / Book for a guest" auth branching** → Phase 60 (BOOK-06). The right sticky panel CTA in Phase 59 is a plain "Select [Class]" button; no auth-choice UI.
- **Auth screen between Step3 and Step5** → Phase 60.
- **Pre-filling passenger fields from customer profile** → Phase 60 (BOOK-07).
- **Consolidated Passenger + Payment step** (user's long-term vision) → Phase 60.
- **GA4 `login` / `sign_up` events (TRACK-04)** → Phase 60 (cross-cutting auth tracking).
- **Steps 4–6 visual redesign** → out of Phase 59 scope; only the logic of Step3 transition into Step4 must remain intact.

</deferred>

---

*Phase: 59-booking-flow-redesign-blacklane*
*Context gathered: 2026-06-17*
