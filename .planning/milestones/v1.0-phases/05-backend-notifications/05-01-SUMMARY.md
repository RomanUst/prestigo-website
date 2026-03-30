---
phase: 05-backend-notifications
plan: 01
subsystem: database
tags: [supabase, postgres, stripe, typescript, booking]

# Dependency graph
requires:
  - phase: 04-payment
    provides: create-payment-intent route, PaymentIntent metadata, Step6Payment component
provides:
  - Supabase service client factory (server-side only, no session persistence)
  - withRetry() exponential backoff wrapper (1s/2s/4s, 3 attempts)
  - buildBookingRow() mapping Stripe metadata to bookings table columns
  - saveBooking() upsert with payment_intent_id dedup (ignoreDuplicates)
  - Full bookings table SQL schema in lib/supabase.ts header comment
  - Step6Payment sends 24 complete booking fields to create-payment-intent
affects: [05-02-webhook, 05-03-email-notifications]

# Tech tracking
tech-stack:
  added: ["@supabase/supabase-js ^2.101.0", "resend ^6.9.4"]
  patterns:
    - "Supabase service client created per-request (createSupabaseServiceClient factory)"
    - "Retry wrapper with exponential backoff: baseDelayMs * Math.pow(2, attempt - 1)"
    - "Upsert with onConflict + ignoreDuplicates for Stripe webhook idempotency"
    - "All Stripe metadata values as strings (Record<string, string>) with numeric parsing in buildBookingRow"

key-files:
  created:
    - "prestigo/lib/supabase.ts"
  modified:
    - "prestigo/components/booking/steps/Step6Payment.tsx"
    - "prestigo/package.json"
    - "prestigo/package-lock.json"

key-decisions:
  - "Supabase client factory per-request (not singleton) — avoids cross-request auth state leakage"
  - "payment_intent_id UNIQUE constraint + ignoreDuplicates: true — Stripe retry dedup at DB level"
  - "buildBookingRow handles both originAddress and origin key names for forward/backward compat"
  - "specialRequests truncated to 490 chars in Step6Payment — Stripe metadata value limit is 500"

patterns-established:
  - "withRetry pattern: generic Promise<T> wrapper, configurable attempts and base delay"
  - "Booking row builder: isolated from save function for testability and quote reuse"

requirements-completed: [BACK-01, BACK-04]

# Metrics
duration: 7min
completed: 2026-03-30
---

# Phase 05 Plan 01: Supabase Persistence Layer Summary

**Supabase client with upsert dedup, exponential retry, and full 24-field booking metadata from Stripe PaymentIntent**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-30T16:14:28Z
- **Completed:** 2026-03-30T16:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `lib/supabase.ts` with 4 exports: service client factory, withRetry, buildBookingRow, saveBooking
- Full bookings table SQL schema documented in file header for Supabase SQL Editor
- Fixed Step6Payment to send all 24 booking fields (was sending only 8), enabling complete webhook data
- Installed `@supabase/supabase-js` and `resend` dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps and create lib/supabase.ts** - `36c949b` (feat)
2. **Task 2: Fix Step6Payment bookingData to include all booking fields** - `611ffe3` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `prestigo/lib/supabase.ts` - Supabase service client, withRetry, buildBookingRow, saveBooking with upsert dedup
- `prestigo/components/booking/steps/Step6Payment.tsx` - Expanded bookingData from 8 to 24 fields, added store destructuring for hours/luggage/returnDate/distanceKm
- `prestigo/package.json` - Added @supabase/supabase-js and resend dependencies
- `prestigo/package-lock.json` - Lock file updated

## Decisions Made
- Supabase client created per-request via factory function (not singleton) to avoid cross-request state
- `ignoreDuplicates: true` with `onConflict: 'payment_intent_id'` — Stripe retries same PaymentIntent, dedup at DB level
- `buildBookingRow` handles both `originAddress` and `origin` key names for forward compatibility with any callers
- `specialRequests` truncated to 490 chars in Step6Payment to stay within Stripe's 500-char metadata limit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**External service requires manual configuration before webhook handler can save bookings:**

1. Create Supabase project at https://supabase.com/dashboard
2. Run the SQL in the `prestigo/lib/supabase.ts` header comment in Supabase Dashboard > SQL Editor to create the `bookings` table
3. Add to `.env.local`:
   - `SUPABASE_URL` — from Project Settings > API > Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings > API > service_role (secret)

## Next Phase Readiness
- Supabase persistence layer complete — webhook handler (05-02) can import `saveBooking` and `buildBookingRow`
- Step6Payment now sends complete metadata — webhook will receive all fields needed to populate bookings table
- `resend` package installed and ready for email notification implementation (05-03)
- No blockers

---
*Phase: 05-backend-notifications*
*Completed: 2026-03-30*
