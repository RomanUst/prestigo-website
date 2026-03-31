# External Integrations

**Analysis Date:** 2026-03-31

## APIs & External Services

**Maps & Routing:**
- Google Maps Places API - Address autocomplete and validation
  - SDK/Client: `@googlemaps/js-api-loader`, `use-places-autocomplete`
  - Auth: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-side, HTTP referrer restricted)
  - Usage: `prestigo/components/booking/AddressInput.tsx` for place selection

- Google Routes API - Distance calculations for price quotes
  - Auth: `GOOGLE_MAPS_API_KEY` (server-side, no HTTP referrer restriction)
  - Endpoint: `https://routes.googleapis.com/directions/v2:computeRoutes`
  - Usage: `prestigo/app/api/calculate-price/route.ts` POST endpoint
  - Returns: Route distance in meters for trip pricing

**Payment Processing:**
- Stripe - Live payment processing for confirmed bookings
  - SDK/Client: `stripe` (21.0.1), `@stripe/stripe-js` (9.0.0), `@stripe/react-stripe-js` (6.0.0)
  - Auth: `STRIPE_SECRET_KEY` (server-side only)
  - Webhook Secret: `STRIPE_WEBHOOK_SECRET`
  - Webhook Endpoint: `POST /api/webhooks/stripe`
  - Currency: CZK (Czech Koruna)
  - Payment Intent Metadata: Booking data stored in `metadata` field
  - Usage:
    - `prestigo/app/api/create-payment-intent/route.ts` - Creates payment intent for checkout
    - `prestigo/app/api/webhooks/stripe/route.ts` - Handles `payment_intent.succeeded` event
    - Stripe signature verification required on webhook endpoint

**Email & Notifications:**
- Resend - Transactional email service for booking confirmations and alerts
  - SDK/Client: `resend` (6.9.4)
  - Auth: `RESEND_API_KEY`
  - Domain: rideprestige.com (requires verification before production)
  - Fallback: Development testing available via onboarding@resend.dev
  - Usage: `prestigo/lib/email.ts` provides:
    - `sendClientConfirmation(emailData)` - Confirmation sent to passenger
    - `sendManagerAlert(emailData)` - Alert sent to manager with booking details
    - `sendEmergencyAlert(bookingReference, bookingRow)` - Fallback if Supabase save fails
  - Includes: Booking details, pickup/drop-off info, pricing, Google Calendar link

## Data Storage

**Databases:**
- Supabase (PostgreSQL) - Primary booking and quote storage
  - Connection: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Client: `@supabase/supabase-js`
  - Implementation: `prestigo/lib/supabase.ts`
  - Table: `bookings` - Stores confirmed bookings and quote submissions
  - Schema: `supabase/migrations/0001_create_bookings.sql`
  - Operations:
    - Upsert on `payment_intent_id` (unique constraint prevents duplicates)
    - Retry mechanism: 3 attempts with exponential backoff (1s → 2s → 4s)
    - Fallback: Emergency email to manager if save fails after retries

**File Storage:**
- None configured - Image optimization via Unsplash only

**Caching:**
- None configured at runtime
- Build-time: Next.js image optimization caching via Vercel

## Authentication & Identity

**Auth Provider:**
- None - Application is public-facing booking form
- No user authentication required
- Manager authentication handled outside system (email-based access)

## Monitoring & Observability

**Error Tracking:**
- None detected - Logs via `console.error()` only

**Logs:**
- Console logging in API routes (`prestigo/app/api/*/route.ts`)
- Health check endpoint: `GET /api/health` for service status verification
- Logs generated at:
  - `prestigo/app/api/calculate-price/route.ts` - Google Routes API errors
  - `prestigo/app/api/create-payment-intent/route.ts` - Stripe errors
  - `prestigo/app/api/webhooks/stripe/route.ts` - Webhook signature and Supabase errors
  - `prestigo/lib/supabase.ts` - Database retry failures
  - `prestigo/lib/email.ts` - Resend send errors

## CI/CD & Deployment

**Hosting:**
- Vercel - Production deployment
  - Configuration: `prestigo/vercel.json`
  - Connected to git repository for automatic deployments
  - Environment variables configured via Vercel project settings

**CI Pipeline:**
- None detected - Relies on Vercel deployment workflow

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps client key (public, referenced in browser)
- `GOOGLE_MAPS_API_KEY` - Google Routes API server key (private)
- `SUPABASE_URL` - Database connection URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key for server-side operations
- `STRIPE_SECRET_KEY` - Stripe live secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `RESEND_API_KEY` - Resend transactional email API key
- `MANAGER_EMAIL` - Manager's email for booking alerts

**Secrets location:**
- Development: `.env.local` (git-ignored)
- Production: Vercel Environment Variables dashboard
- Template: `prestigo/.env.example` with full documentation

## Webhooks & Callbacks

**Incoming:**
- Stripe webhook receiver: `POST /api/webhooks/stripe`
  - Event type: `payment_intent.succeeded`
  - Signature verification required via `STRIPE_WEBHOOK_SECRET`
  - Flow:
    1. Stripe payment succeeds → calls webhook
    2. Webhook verifies signature and constructs event
    3. Extracts metadata from PaymentIntent
    4. Saves booking to Supabase with retry logic
    5. Sends client confirmation email
    6. Sends manager alert email
    7. Emergency email fallback if Supabase fails

**Outgoing:**
- Stripe payment intent callback - Implicit via checkout flow
  - Client receives `clientSecret` from `POST /api/create-payment-intent`
  - Client uses `@stripe/stripe-js` to complete payment
  - Stripe calls webhook when payment succeeds

---

*Integration audit: 2026-03-31*
