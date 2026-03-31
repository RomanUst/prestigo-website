# Architecture

**Analysis Date:** 2026-03-31

## Pattern Overview

**Overall:** Next.js 16 full-stack application with client-side state management, server-side API routes, and third-party service integration (Stripe, Supabase, Google Maps, Resend).

**Key Characteristics:**
- App Router (Next.js 16) with co-located API routes
- Zustand for client-side booking state with localStorage persistence
- Separation of concerns: pages (UI), components (reusable), lib (utilities), api (routes)
- Type-safe data contracts via TypeScript interfaces in `types/`
- Error recovery patterns with retry logic and fallback mechanisms (especially in payment/webhook handling)
- Multi-step wizard pattern for booking flow with step validation

## Layers

**Presentation Layer (Client-side):**
- Purpose: Render interactive UI, manage form inputs, display pricing, handle user interactions
- Location: `prestigo/app/` (pages), `prestigo/components/` (reusable components)
- Contains: React components, page definitions, styling via Tailwind CSS, client-side validation
- Depends on: Zustand store (`lib/booking-store.ts`), API routes, external libraries (Google Maps, Stripe)
- Used by: End users via browser

**State Management Layer:**
- Purpose: Centralized booking wizard state with persistence to localStorage
- Location: `lib/booking-store.ts`
- Contains: Zustand store definition with 6-step booking state, actions for all mutations
- Depends on: zustand/persist middleware, zustand/storage adapters
- Used by: All booking components (`components/booking/*`), BookingWizard orchestrator

**API Layer (Server-side):**
- Purpose: Handle business logic, external API calls, payment processing, data persistence
- Location: `prestigo/app/api/`
- Contains: Route handlers using Next.js `Route` pattern
- Routes:
  - `/api/calculate-price` - Compute pricing based on trip type and distance (Google Routes API)
  - `/api/create-payment-intent` - Create Stripe payment intent with booking metadata
  - `/api/submit-quote` - Handle quote requests (non-payment bookings)
  - `/api/webhooks/stripe` - Process payment.intent.succeeded events
  - `/api/health` - Health check endpoint
- Depends on: Stripe SDK, Supabase client, Google Maps API, Resend email service
- Used by: Frontend (fetch calls), Stripe webhooks, external health checks

**Data Persistence Layer:**
- Purpose: Store booking records and handle retry logic for Supabase operations
- Location: `lib/supabase.ts`
- Contains: Supabase client factory, retry wrapper, booking row builder
- Provides: `withRetry<T>()` for exponential backoff on failures
- Used by: Stripe webhook handler (`app/api/webhooks/stripe/route.ts`)

**Email/Notification Layer:**
- Purpose: Send booking confirmations and alerts via Resend email service
- Location: `lib/email.ts`
- Contains: Email template builders, HTML generation, Google Calendar integration
- Provides: `sendClientConfirmation()`, `sendManagerAlert()`, `sendEmergencyAlert()` functions
- Used by: Stripe webhook handler on payment success and failure cases

**Business Logic Layer:**
- Purpose: Pricing calculations, currency conversion, data formatting
- Location: `lib/pricing.ts`, `lib/currency.ts`, `lib/extras.ts`
- Contains: Rate tables (per km, hourly, daily), vehicle class configurations, trip type definitions
- Used by: `/api/calculate-price`, email templates, booking store

**Type Definitions:**
- Purpose: Centralized type contracts for TypeScript safety across client and server
- Location: `types/booking.ts`
- Contains: `TripType`, `VehicleClass`, `PlaceResult`, `PassengerDetails`, `PriceBreakdown`, `BookingStore` interface, `VEHICLE_CONFIG` constants, `PRG_CONFIG` (Prague airport config)
- Used by: All client and server code

## Data Flow

**Booking Initiation Flow:**

1. User lands on homepage or `/book` page
2. User interacts with `BookingWidget` (embedded on homepage) or `BookingWizard` (on `/book`)
3. `BookingWidget` collects: trip type, origin, destination, pickup date/time
4. On "Book Now": validates, writes to Zustand store, navigates to `/book` at Step 3 (vehicle selection)

**Pricing Calculation Flow:**

1. Step 3 (Vehicle) component renders available vehicles
2. Component calls `/api/calculate-price` with: `origin`, `destination`, `tripType`, `pickupDate`, `returnDate`
3. Server determines flow:
   - **Hourly trips:** No distance needed → return pre-computed hourly rates
   - **Daily trips:** No distance needed → calculate from pickup/return date difference → return daily rates
   - **Transfer trips:** Call Google Routes API with origin/destination coordinates
     - If successful: get distance → compute per-km rates for all vehicle classes
     - If failed or origin/destination missing: set `quoteMode: true` → disable pricing
4. Prices stored in store: `priceBreakdown[vehicleClass]`
5. Component renders price for selected vehicle and shows alternatives

**Payment Processing Flow:**

1. User completes all 6 steps: trip details, date/time, vehicle, extras, passenger details, payment
2. Step 6 (Payment) component calls `/api/create-payment-intent` with:
   - `amountCZK`: total price in Czech Koruna
   - `bookingData`: flattened metadata (all booking details)
3. Server creates Stripe PaymentIntent with `automatic_payment_methods: true` and embeds metadata
4. Server generates unique `bookingReference` (format: `PRG-YYYYMMDD-RRRR`)
5. Returns `clientSecret` to frontend
6. Stripe Elements renders payment form (`PaymentElement`)
7. User submits payment via Stripe hosted UI or embedded form
8. Stripe processes, on success: calls webhook `/api/webhooks/stripe`

**Webhook Processing Flow (on payment.intent.succeeded):**

1. Stripe sends signed POST request to `/api/webhooks/stripe`
2. Server verifies signature using `STRIPE_WEBHOOK_SECRET`
3. If valid:
   - Extract payment intent metadata (all booking details)
   - Build booking row using `buildBookingRow()` → maps metadata to database schema
   - **Save to Supabase** with retry logic (3 attempts, exponential backoff):
     - On success: Row inserted into `bookings` table
     - On failure (after 3 retries): Send emergency alert email to manager with booking data
   - Build `BookingEmailData` from metadata
   - **Send client confirmation email** (non-fatal failure)
   - **Send manager alert email** (non-fatal failure)
4. Return `{ received: true }` to Stripe

**Quote Submission Flow (Fallback):**

1. If pricing unavailable (`quoteMode: true`), "Continue" button triggers quote submission
2. Calls `/api/submit-quote` with booking details
3. Server sends quote request to manager via email
4. Returns confirmation to user

**State Management Strategy:**

- **Zustand store** (`useBookingStore`) is single source of truth for booking state
- Persists to localStorage via `persist` middleware
- State includes: trip details (step 1), date/time (step 2), vehicle (step 3), extras (step 4), passenger (step 5), payment (step 6)
- Each step component uses selectors to subscribe to specific state slices
- Navigation: `currentStep` + `completedSteps` Set for stepper UI
- Complete reset via `resetBooking()` after confirmation

## Key Abstractions

**BookingStore (Zustand):**
- Purpose: Centralized mutable booking state with localStorage sync
- Files: `lib/booking-store.ts`
- Pattern: Zustand with `persist` middleware for automatic hydration
- Operations: 20+ setter methods for each state field, `nextStep()`, `prevStep()`, `swapOriginDestination()`, `resetBooking()`
- Subscribers: Components use `useBookingStore((s) => s.field)` to extract state

**PriceBreakdown:**
- Purpose: Computed pricing for all vehicle classes at a given origin/destination
- Files: `lib/pricing.ts`, `types/booking.ts`
- Pattern: Pre-computed record keyed by `VehicleClass` with `{ base, extras, total, currency }`
- Computed in: `/api/calculate-price` server route
- Consumed by: Step 3 vehicle selector, Step 6 payment summary, email templates

**PassengerDetails:**
- Purpose: Form data structure for step 5 (passenger info)
- Files: `types/booking.ts`
- Pattern: Typed interface with required fields (firstName, lastName, email, phone) and optional fields (flightNumber, terminal, specialRequests)
- Validation: Done in Step5Passenger component before advancing

**PlaceResult:**
- Purpose: Location data from Google Places API
- Files: `types/booking.ts`
- Pattern: `{ address, placeId, lat, lng }` — returned by `use-places-autocomplete` hook
- Used for: Origin/destination selection, distance calculation, email/booking metadata

**Booking Row (Database):**
- Purpose: Flat structure for Supabase `bookings` table
- Files: `lib/supabase.ts`
- Pattern: Built by `buildBookingRow()` function that maps Stripe metadata to snake_case DB columns
- Schema includes: booking_reference, payment_intent_id, trip details, passenger info, extras flags

## Entry Points

**Web Pages:**
- Location: `prestigo/app/*.tsx`
- Purpose: Server-side rendered pages with metadata
- Examples:
  - `app/page.tsx` - Homepage with booking widget hero, info sections
  - `app/book/page.tsx` - Booking wizard page with full 6-step flow
  - `app/book/confirmation/page.tsx` - Post-payment confirmation screen

**API Routes:**
- Location: `prestigo/app/api/*/route.ts`
- Triggers: Client-side fetch requests or Stripe webhooks
- Responsibilities: Business logic, external API calls, payment processing, data persistence

**Root Layout:**
- Location: `app/layout.tsx`
- Responsibilities: Font setup, Google Analytics integration, skip-to-content link for a11y, metadata

**Root Page:**
- Location: `app/page.tsx`
- Responsibilities: Compose marketing homepage from reusable components, embed structured data for SEO

## Error Handling

**Strategy:** Graceful degradation with fallback mechanisms and user-facing messaging.

**Patterns:**

1. **Form Validation:** Each step validates before allowing next button
   - Pattern: Collect errors in state, render inline error messages
   - Example: Step 1 validates origin/destination required, Step 5 validates passenger details

2. **API Failures with Fallback:**
   - **Pricing failures:** If Google Routes API fails or origin/destination missing → `quoteMode: true` → disable pricing → show "Get Quote" option
   - **Supabase save failures:** Retry 3 times with exponential backoff (1s, 2s, 4s) → if all fail → send emergency alert email to manager with booking data
   - **Email send failures:** Non-fatal; logged but doesn't block webhook response to Stripe

3. **Webhook Signature Verification:**
   - Missing signature → return 400 "Missing stripe-signature header"
   - Invalid signature → return 400 "Webhook Error: [message]"
   - Valid signature → process event

4. **Type Safety:**
   - All external data parsed via TypeScript or validated before use
   - API requests use typed request/response interfaces

## Cross-Cutting Concerns

**Logging:** `console.error()` for failures in API routes and webhook handlers (e.g., Google Routes API errors, Supabase failures, email send errors)

**Validation:**
- Client-side: React components validate before enabling continue button
- Server-side: Type guards and null checks on API routes

**Authentication:**
- **Client-side routes:** Public (no auth required)
- **Supabase:** Uses `SUPABASE_SERVICE_ROLE_KEY` (service account) for server-side writes
- **Stripe:** Webhook signature verification using `STRIPE_WEBHOOK_SECRET`
- **Google Maps API:** `GOOGLE_MAPS_API_KEY` for Routes API calls
- **Resend:** `RESEND_API_KEY` for email sending

**Internationalization:** Not implemented; all copy hardcoded in English; pricing in CZK/EUR

**Error Tracking:** Not implemented; relies on console logging and email alerts for critical failures

---

*Architecture analysis: 2026-03-31*
