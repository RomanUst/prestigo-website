# Requirements: Prestigo Booking Form

**Defined:** 2026-03-24
**Core Value:** A client can go from "I need a ride" to confirmed & paid booking in under 2 minutes, without leaving the site.

## v1 Requirements

### Foundation & Architecture

- [x] **ARCH-01**: Zustand store holds all wizard state with TypeScript types (BookingData, TripType, VehicleClass)
- [x] **ARCH-02**: Wizard state persists to sessionStorage — survives page refresh at any step
- [x] **ARCH-03**: Booking data types defined: TripType, VehicleClass, PassengerDetails, PriceBreakdown, Extras

### Wizard Shell

- [x] **WIZD-01**: BookingWizard component orchestrates 6-step flow with step routing
- [x] **WIZD-02**: ProgressBar shows current step number and completed steps
- [x] **WIZD-03**: "Next" button disabled until all required fields in current step are valid
- [x] **WIZD-04**: "Back" button navigates to previous step without losing data
- [x] **WIZD-05**: Step transitions animated (CSS stepFadeUp 0.3s, no framer-motion)
- [x] **WIZD-06**: Full wizard lives at /book page

### Step 1 — Trip Type & Route

- [x] **STEP1-01**: User can select trip type: One-way Transfer, Airport Pickup, Airport Dropoff, Hourly Hire, Daily Hire
- [x] **STEP1-02**: User can enter origin address with Google Places Autocomplete
- [x] **STEP1-03**: User can enter destination address with Google Places Autocomplete
- [x] **STEP1-04**: For Airport Pickup/Dropoff, origin/destination auto-set to PRG airport coordinates (not Places result)
- [x] **STEP1-05**: User can select passenger count (1–8)
- [x] **STEP1-06**: User can select luggage count (0–8)
- [x] **STEP1-07**: For Hourly Hire, user selects duration in hours (1–12) instead of destination

### Step 2 — Date & Time

- [x] **STEP2-01**: User can select pickup date (calendar picker, no past dates)
- [x] **STEP2-02**: User can select pickup time (15-min increments)
- [x] **STEP2-03**: For Daily Hire, user selects return date

### Step 3 — Vehicle Selection

- [x] **STEP3-01**: User sees 3 vehicle classes: Business, First Class, Business Van
- [x] **STEP3-02**: Each class shows: photo, class name, max passengers, luggage capacity, price
- [x] **STEP3-03**: Price is calculated and displayed live based on route + trip type
- [x] **STEP3-04**: PriceSummary panel updates in real-time when user changes vehicle class
- [x] **STEP3-05**: If route cannot be calculated, "Request a quote" fallback shown instead of price

### Step 4 — Extras

- [x] **STEP4-01**: User can add extras: Child Seat, Meet & Greet (sign with name), Extra Luggage
- [x] **STEP4-02**: Each extra shows its price increment
- [x] **STEP4-03**: PriceSummary updates to include selected extras

### Step 5 — Passenger Details

- [x] **STEP5-01**: User fills: First Name, Last Name, Email, Phone (required)
- [x] **STEP5-02**: For airport rides: Flight Number field (required), Terminal (optional)
- [x] **STEP5-03**: Special Requests / Notes field (optional, max 500 chars)
- [x] **STEP5-04**: All fields validated inline on blur (not on submit)

### Step 6 — Payment

- [x] **STEP6-01**: Full booking summary shown before card input (route, vehicle, date, total)
- [x] **STEP6-02**: Stripe Elements card input rendered (card number, expiry, CVC)
- [x] **STEP6-03**: "Pay" button creates Stripe PaymentIntent and confirms payment
- [x] **STEP6-04**: Pay button disabled immediately on click (no double-charge)
- [x] **STEP6-05**: Payment error displayed inline with retry option (no data loss)
- [x] **STEP6-06**: On successful payment, user redirected to /book/confirmation

### Pricing Engine

- [x] **PRICE-01**: Next.js API route `/api/calculate-price` proxies Google Routes API server-side
- [x] **PRICE-02**: Transfer price = distance_km × rate_per_km[vehicleClass]
- [x] **PRICE-03**: Hourly price = hours × hourly_rate[vehicleClass]
- [x] **PRICE-04**: Daily price = days × daily_rate[vehicleClass]
- [x] **PRICE-05**: Rate tables defined in server-side config (not hardcoded in UI)
- [x] **PRICE-06**: Google Maps API key never exposed to client

### Payment Integration

- [x] **PAY-01**: Stripe PaymentIntent created server-side with calculated amount
- [x] **PAY-02**: Stripe secret key never sent to client (only publishable key)
- [x] **PAY-03**: Stripe webhook `/api/webhooks/stripe` handles `payment_intent.succeeded`
- [x] **PAY-04**: Booking saved (Notion + log) only after webhook confirmation

### Backend & Notifications

- [x] **BACK-01**: Booking data saved to Notion database after payment confirmation
- [x] **BACK-02**: Confirmation email sent to client (booking summary, ride details)
- [x] **BACK-03**: Notification email sent to manager (new booking alert with all details)
- [x] **BACK-04**: Notion API calls wrapped in retry logic (3 retries, exponential backoff)
- [x] **BACK-05**: Confirmation page at /book/confirmation shows booking reference

### Homepage Widget

- [x] **HOME-01**: Mini booking widget embedded on homepage
- [x] **HOME-02**: Widget contains: trip type selector + origin/destination (or hours for hourly) + date/time + CTA button
- [x] **HOME-03**: CTA "Get a Quote" / "Book Now" carries filled data to /book wizard (Step 2 or Step 3)

### UX & Accessibility

- [ ] **UX-01**: Fully responsive — mobile-first, tested at 375px and 390px
- [ ] **UX-02**: PriceSummary sticky on desktop (right column), fixed bottom bar on mobile
- [ ] **UX-03**: CTA buttons sticky/fixed on mobile so they're always visible above keyboard
- [ ] **UX-04**: aria-label, role attributes on interactive elements
- [ ] **UX-05**: Keyboard navigation works through all steps (tab order correct)

## v2 Requirements

### Authentication
- **AUTH-01**: User can create account and view booking history
- **AUTH-02**: Returning users have details pre-filled

### Localization
- **L10N-01**: Czech language (CS) support
- **L10N-02**: Russian language (RU) support
- **L10N-03**: German language (DE) support

### Advanced Features
- **ADV-01**: Flight tracking API integration (real arrival time lookup)
- **ADV-02**: Promo / discount codes
- **ADV-03**: Multi-stop routes
- **ADV-04**: Corporate invoicing (B2B flow)
- **ADV-05**: SMS confirmation (Twilio)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time availability | No fleet management system in v1 |
| User accounts | Adds auth complexity, not needed for one-off bookings |
| Multi-language | EN sufficient for launch |
| Promo codes | Revenue optimization, defer |
| Multi-stop routes | Edge case, v2 |
| LimoAnywhere iframe | Replaced by custom form |
| SMS notifications | Email sufficient for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01–03 | Phase 1: Foundation & Trip Entry | Pending |
| WIZD-01–06 | Phase 1: Foundation & Trip Entry | Pending |
| STEP1-01–07 | Phase 1: Foundation & Trip Entry | Pending |
| STEP2-01–03 | Phase 2: Pricing & Vehicle Selection | Pending |
| STEP3-01–05 | Phase 2: Pricing & Vehicle Selection | Pending |
| PRICE-01–06 | Phase 2: Pricing & Vehicle Selection | Pending |
| STEP4-01–03 | Phase 3: Booking Details | Pending |
| STEP5-01–04 | Phase 3: Booking Details | Pending |
| STEP6-01–06 | Phase 4: Payment | Pending |
| PAY-01–04 | Phase 4: Payment | Pending |
| BACK-01–05 | Phase 5: Backend & Notifications | Pending |
| HOME-01–03 | Phase 6: Homepage Widget & Polish | Pending |
| UX-01–05 | Phase 6: Homepage Widget & Polish | Pending |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 53
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 — traceability confirmed after roadmap creation*
