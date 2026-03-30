# Phase 4: Payment - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Stripe integration + Step 6 (full booking summary + payment form) + `/book/confirmation` page + quote mode skip flow.

After Step 5 (passenger details), a user either pays via Stripe (normal flow) or skips to a quote confirmation page (quote mode). On successful payment, they land on `/book/confirmation` with a booking reference.

No Notion save, no emails — those are Phase 5 (triggered by Stripe webhook).

</domain>

<decisions>
## Implementation Decisions

### Step 6 Layout
- Full booking summary replaces PriceSummary at Step 6 — PriceSummary panel is hidden on Step 6 entirely
- Narrow centered column (`max-w-[560px] mx-auto`) on desktop — checkout modal feel, not the wide 2-col layout of Steps 2-3
- Layout: booking summary block → divider → payment form → Pay button — all stacked vertically in one column
- Mobile: same stacked layout, full-width, no bottom bar at Step 6 (Pay button is inline in the form)
- Booking summary content: origin → destination, pickup date + time, vehicle class + pax count, extras list, total (CZK + EUR equivalent)
- Currency display: CZK primary, EUR secondary — e.g. "CZK 2,450 (€98)" — fixed exchange rate stored in server-side config (not hardcoded in UI components)
- Pay button label includes the amount: "Pay CZK 2,450"

### Quote Mode Flow
- When `quoteMode: true` in Zustand store, Step 6 is skipped entirely
- BookingWizard's Next button in Step 5 routes directly to `/book/confirmation?type=quote` instead of advancing to Step 6
- On submit: call `/api/submit-quote` — a Next.js API route that saves the booking request directly to Notion and sends a manager alert email
- Quote confirmation page differs from paid booking confirmation page (separate content, same `/book/confirmation` route with `?type=quote` query param or different path `/book/confirmation/quote`)
- Quote confirmation message: "Quote request sent — we'll be in touch within 2 hours" + booking reference (QR- prefix)

### Stripe Integration — Payment Element
- Use **Payment Element** (modern all-in-one), not the classic Card Element
- Payment Element renders card + Apple Pay / Google Pay wallet buttons automatically when the browser supports them — wallet buttons enabled (no restriction to card-only)
- Stripe Appearance API used to match brand: dark background (`#1C1C1E`), copper labels and focus rings (`#B87333`), off-white input text (`#F5F2EE`), warm-grey borders (`#9A958F`)
- PaymentIntent created server-side via `/api/create-payment-intent` — Stripe secret key never sent to client
- Client receives only the `clientSecret` to mount the Payment Element
- On click Pay: `stripe.confirmPayment()` with `return_url` pointing to `/book/confirmation?payment_intent_client_secret=...`
- Pay button disabled immediately on click (STEP6-04) — re-enabled only if `confirmPayment` returns an error
- Payment error displayed inline below the Payment Element with a retry message (STEP6-05) — booking data in Zustand is never cleared on error

### Confirmation Page
- Route: `/book/confirmation` (handles both paid and quote flows via query params)
- Booking reference format: date-based short code — `PRG-YYYYMMDD-NNNN` (e.g. `PRG-20260327-0042`), generated server-side when creating the PaymentIntent and passed to the confirmation page via URL param
- Static confirmation — no polling for webhook completion; show booking reference and summary immediately from Stripe PaymentIntent data passed in the URL
- Content shown: booking reference (prominent), route summary, date/time, vehicle class, total paid (or "Quote request sent" for quote mode)
- Actions available on confirmation page:
  1. **Print / save as PDF** — `window.print()` browser print dialog
  2. **Add to calendar** — `.ics` file download with ride date/time, pickup address, booking reference
  3. **Contact button** — "Questions? Contact us" link (manager WhatsApp/email — exact contact TBD, Claude uses placeholder)
- Confirmation page is a Next.js App Router page component (server or client — client for interactivity of print/calendar buttons)
- After landing on confirmation page, Zustand store is reset (clear booking data) so a new booking can start cleanly

### Claude's Discretion
- Exact Stripe Appearance API token values (base them on the CSS custom properties from globals.css)
- Whether `/book/confirmation` is one page with conditional rendering or two separate routes (`/book/confirmation` and `/book/confirmation/quote`)
- Booking reference counter implementation (could use timestamp + random suffix instead of sequential NNNN)
- Exact `.ics` calendar event format and event title
- Step 6 back button behavior (returns to Step 5, does not re-trigger PaymentIntent creation)
- Whether to show a Stripe-hosted "processing..." state overlay or use the built-in Payment Element loading state

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Core value, constraints, tech stack, key decisions
- `.planning/REQUIREMENTS.md` — STEP6-01–06, PAY-01–04 (Phase 4 requirements)

### Prior Phase Context
- `.planning/phases/01-foundation-trip-entry/01-CONTEXT.md` — CSS tokens, component conventions, button styles
- `.planning/phases/02-pricing-vehicle-selection/02-CONTEXT.md` — PriceSummary pattern, quoteMode decision origin
- `.planning/phases/03-booking-details/03-CONTEXT.md` — (if exists) Step 5 validation patterns

### Existing Codebase
- `prestigo/app/globals.css` — ALL CSS utilities and brand tokens (must use, not ad-hoc Tailwind)
- `prestigo/lib/booking-store.ts` — Zustand store (add Step 6 / payment fields here)
- `prestigo/types/booking.ts` — Extend with payment-related types
- `prestigo/components/booking/BookingWizard.tsx` — Wire Step 6 + quote skip logic
- `prestigo/components/booking/steps/Step5Passenger.tsx` — Integration point for quoteMode skip
- `prestigo/app/api/calculate-price/route.ts` — Pattern to follow for `/api/create-payment-intent`

### Stripe Docs
- Stripe Payment Element: https://stripe.com/docs/payments/payment-element
- Stripe Appearance API: https://stripe.com/docs/elements/appearance-api
- `@stripe/stripe-js` + `@stripe/react-stripe-js` — packages to install

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Patterns
- `canProceed` switch in BookingWizard — case 6 needs to be wired; quote skip is in case 5 (check `quoteMode`)
- `.btn-primary` — Pay button style
- `.btn-ghost` — Back button style
- `var(--copper)` / `var(--anthracite)` / `var(--offwhite)` / `var(--warmgrey)` — use these in Stripe Appearance config
- `stepFadeUp` CSS keyframe — use for Step 6 entry animation (already in globals.css)
- PriceSummary's `selectedPrice` + `extrasTotal` pattern — reuse this logic to build the full summary block in Step 6

### Store Fields to Add
- `paymentIntentClientSecret: string | null` — received from `/api/create-payment-intent`, stored temporarily
- `bookingReference: string | null` — set on confirmation page from URL param
- No persistent payment data in sessionStorage (strip from `partialize`)

### Integration Points
- BookingWizard: add `quoteMode` check in Step 5's `nextStep` handler to skip to confirmation
- New API route: `prestigo/app/api/create-payment-intent/route.ts`
- New API route: `prestigo/app/api/submit-quote/route.ts`
- New page: `prestigo/app/book/confirmation/page.tsx`
- New step component: `prestigo/components/booking/steps/Step6Payment.tsx`

### Currency Config
- Add `CZK_TO_EUR_RATE` to a server-side config (e.g. `lib/currency.ts`) — not in any client component
- EUR display only — Stripe charges in CZK (single currency for v1)

</code_context>

<deferred>
## Deferred Ideas

- Multi-currency Stripe charges — v2
- Live FX rate via external API — v2 (fixed rate sufficient for v1)
- 3D Secure / SCA handling — Stripe Payment Element handles this automatically
- Saved cards / returning customer — v2 (requires auth)
- Booking amendment / cancellation flow — v2

</deferred>

---

*Phase: 04-payment*
*Context gathered: 2026-03-28*
