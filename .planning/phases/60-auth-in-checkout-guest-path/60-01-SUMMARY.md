---
phase: 60-auth-in-checkout-guest-path
plan: 60-01
one_liner: "Wired user_id to booking rows, pre-filled passenger details for logged-in customers, and ensured guest checkout is always available"
requirements_completed: [ACCT-04, BOOK-07, BOOK-08, TRACK-04]
commit: 921a15b
completed: 2026-06-17T23:00:16+02:00
---

## What Was Built

Phase 60 was delivered as a single focused commit (`921a15b`) rather than a multi-plan GSD phase. Key changes:

- **`app/api/create-payment-intent/route.ts`**: Server-side lookup of authenticated user ID; passes `userId` in Stripe payment intent metadata (never trusted from client)
- **`lib/supabase.ts`**: `buildBookingRow` now reads `meta.userId` to populate the nullable `user_id` FK — bookings created by signed-in customers are now linked to their account
- **`supabase/migrations/049_bookings_customer_rls.sql`**: RLS policy added — customers can only read their own bookings
- **`components/booking/steps/Step5Passenger.tsx`**: Pre-fills contact fields (first name, last name, email, phone) from `customer_profiles` when user is authenticated
- **`components/booking/steps/Step3Auth.tsx`**: "Continue as guest" always visible — sign-in is optional, guest path never blocked
- **`app/account/trips/page.tsx`**: "My trips" page now queries and displays real booking history linked to `user_id`
- **`types/booking.ts`** + **`lib/booking-store.ts`**: Added `userId` field to booking state

## Notes

BOOK-06 (corporate "book for a guest" booking-method step) is deferred to v2.1. The "Continue as guest" in Step3Auth satisfies BOOK-08 (guest checkout always available). TRACK-04 (GA4 login/sign_up events) fires in Step3Auth.tsx:181 — live verification blocked by third-party OTP delivery requirement.
