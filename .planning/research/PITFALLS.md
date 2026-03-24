# Pitfalls Research — Prestigo Booking Form

## Critical Pitfalls

### 1. Stripe: Confirming payment before saving booking
**Risk:** User pays → server crashes before saving to Notion/DB → booking lost, client charged.
**Prevention:** Use Stripe webhooks as the source of truth. Never rely on client-side redirect for booking persistence. The webhook (`payment_intent.succeeded`) triggers the save. Implement idempotency (Stripe's `idempotency_key`).
**Phase:** Stripe + backend integration phase.

### 2. Google Maps API key exposed client-side
**Risk:** Bots scrape key → thousands in unexpected charges.
**Prevention:** Routes API (distance calculation) must be called server-side only (Next.js API route). Only Places Autocomplete runs client-side — restrict key by HTTP referrer AND enabled APIs in Google Cloud Console.
**Phase:** Step 1 (address input) phase — set up from day 1.

### 3. Wizard state lost on navigation
**Risk:** User fills 4 steps, navigates away or refreshes → all data gone → user abandons.
**Prevention:** Zustand + `persist` middleware writing to `sessionStorage`. Test refresh at every step. Clear sessionStorage only after confirmed payment.
**Phase:** Architecture setup phase.

### 4. Price shown doesn't match what's charged
**Risk:** Price calculated client-side with stale rates → discrepancy with PaymentIntent amount.
**Prevention:** Price is calculated server-side in `/api/calculate-price`. The same pricing function is used when creating the PaymentIntent. Never trust client-sent amounts.
**Phase:** Pricing engine phase.

### 5. Notion rate limiting silently failing
**Risk:** Notion API returns 429 → booking not saved → manager doesn't know about ride.
**Prevention:** Wrap Notion calls in retry logic (exponential backoff, 3 retries). Log failures to console/monitoring. Email notification should not depend on Notion succeeding — send email first, Notion second.
**Phase:** Backend integration phase.

### 6. Mobile keyboard pushing form out of view
**Risk:** On mobile, address input focus opens keyboard → Next button disappears below fold → users get stuck.
**Prevention:** Use `scroll-into-view` on step change. Keep CTA buttons fixed at bottom on mobile (`position: sticky`). Test on real devices (375px, 390px) at every step.
**Phase:** Every frontend phase — test mobile from the start.

### 7. Google Places Autocomplete not returning flight-relevant results
**Risk:** User types "Václav Havel Airport" — Places API returns it but the address format is wrong for route calculation.
**Prevention:** For airport pickup/dropoff, use a fixed airport coordinate (hardcoded lat/lng for PRG) instead of Places result. Only use Places for non-airport addresses.
**Phase:** Step 1 development.

### 8. Multiple PaymentIntents created
**Risk:** User clicks "Pay" button multiple times (slow connection) → multiple charges.
**Prevention:** Disable the Pay button immediately on click. Store `paymentIntentId` in Zustand — if one exists, reuse it (update amount) rather than creating a new one.
**Phase:** Step 6 (payment) phase.

### 9. Hourly pricing not shown for hourly hire type
**Risk:** For hourly hire, distance-based pricing doesn't apply. Using the same formula returns wrong price.
**Prevention:** Pricing logic branches on `tripType`. Hourly = `hours × hourlyRate[vehicleClass]`. Daily = `days × dailyRate[vehicleClass]`. Transfer = `distanceKm × ratePerKm[vehicleClass]`.
**Phase:** Pricing engine phase.

### 10. Email confirmation sent before payment confirmed
**Risk:** Send email on PaymentIntent creation → user never completes payment → false confirmation sent.
**Prevention:** Send emails only from Stripe webhook (`payment_intent.succeeded`), never from client-side success callback alone.
**Phase:** Email integration phase.

## Lower-Risk Pitfalls

- **Forgetting `robot.txt` / `noindex` on `/book`** — usually fine to index, but don't accidentally block it
- **Date/time timezone handling** — store in UTC, display in Europe/Prague timezone
- **react-hook-form `mode: 'onBlur'`** — set this from the start for inline validation UX
- **Tailwind purge** — ensure booking component classes aren't purged in production build
- **Stripe test/live key confusion** — use env vars `STRIPE_SECRET_KEY` with `pk_test_`/`pk_live_` prefix check
