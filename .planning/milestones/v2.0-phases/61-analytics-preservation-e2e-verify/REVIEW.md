---
phase: 61-analytics-preservation-e2e-verify
reviewed: 2026-06-17T00:00:00Z
depth: deep
files_reviewed: 11
files_reviewed_list:
  - components/booking/BookingWizard.tsx
  - components/booking/steps/Step3Auth.tsx
  - components/booking/steps/Step5Passenger.tsx
  - components/booking/steps/Step6Payment.tsx
  - components/booking/StickyBookingPanel.tsx
  - components/auth/OAuthButtons.tsx
  - app/account/trips/page.tsx
  - app/api/create-payment-intent/route.ts
  - lib/supabase.ts
  - types/booking.ts
  - lib/booking-store.ts
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** deep
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Changes implement in-checkout auth (OTP, password, OAuth), guest path, `user_id` threading from browser session into Stripe metadata and the `bookings` table, and analytics event preservation across the Stripe redirect. The auth flow mechanics are broadly correct but four defects range from critical to high-impact:

1. The trips page performs an unauthenticated DB query — RLS is supposed to enforce row-level isolation, but the `getUser()` result is explicitly thrown away, so a missing or misconfigured policy silently leaks every booking to any logged-in user and crashes the page with no redirect for unauthenticated visitors.
2. `userId` is accepted from the client body and written verbatim into Stripe metadata and the `bookings` table without any server-side verification against the Stripe payment intent's authenticated session — an attacker can link any booking to any user id.
3. The Zustand `nextStep` action is capped at step 5, making step 6 (Payment) unreachable by the action itself; authenticated auto-advance and guest-mode flow both call `nextStep()` but the wizard renders up to step 6.
4. `guestMode` is never persisted through sessionStorage rehydration, so a 3DS redirect wipes the flag and re-lands the user at step 3 (auth) rather than returning to payment.

---

## Critical Issues

### CR-01: `nextStep()` is hard-capped at step 5 — step 6 (Payment) is unreachable

**File:** `lib/booking-store.ts:65`

**Issue:** The `nextStep` action contains `Math.min(5, s.currentStep + 1)`. The wizard renders six steps (cases 1–6 in `renderStepContent`). When the user is on step 5 (Passenger Details) and clicks Continue, `nextStep()` clamps the result to 5 and the wizard never moves to step 6 (Payment). The booking is impossible to complete for any user.

**Fix:**
```ts
nextStep: () =>
  set((s) => ({
    completedSteps: new Set([...s.completedSteps, s.currentStep]),
    currentStep: Math.min(6, s.currentStep + 1),  // was 5
  })),
```

---

### CR-02: `userId` accepted from untrusted client body — authorization bypass

**File:** `app/api/create-payment-intent/route.ts:65` and `app/api/create-payment-intent/route.ts:304`

**Issue:** The Zod schema accepts `userId: z.string().uuid().optional()` as part of `bookingData` (the client POST body). The value is written directly into the Stripe PaymentIntent metadata (`userId: bookingData.userId || ''`) and, via `buildBookingRow`, into the `bookings.user_id` column. Because the server trusts the client-supplied UUID, any unauthenticated caller (or a guest who knows another user's UUID) can forge a `userId` and link that booking row to the victim's account. The victim's `/account/trips` page then shows a booking they never made, and RLS SELECT policies would grant them read access to those rows.

**Fix:** The API route already has access to the Supabase browser client pattern; use the server client to resolve the real session instead:

```ts
// At the top of the POST handler, after parsing bookingData:
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
const authenticatedUserId = user?.id ?? null
// Ignore bookingData.userId entirely — never trust client-supplied identity
```

Then replace the metadata write:
```ts
userId: authenticatedUserId ?? '',
```

And remove `userId` from the Zod schema so it is never accepted from the client.

---

### CR-03: `app/account/trips/page.tsx` — `getUser()` result discarded; unauthenticated access not blocked

**File:** `app/account/trips/page.tsx:28-34`

**Issue:** The page calls `supabase.auth.getUser()` but immediately discards the result with `void user` (line 29). There is no redirect or error response when `user` is `null`. An unauthenticated visitor hits this page and the subsequent `.from('bookings').select(...)` either:
- Returns an empty array if RLS is configured correctly (silent failure, no redirect to login), or
- Returns all rows if the RLS `SELECT` policy on `bookings` is misconfigured — leaking every customer's trip data.

Neither branch is acceptable. The page also renders with `Nav` and a "No trips yet" message for an unauthenticated visitor, which is confusing UX and a potential data-leak vector.

**Fix:**
```ts
import { redirect } from 'next/navigation'

export default async function AccountTripsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?next=/account/trips')
  }
  // rest of page...
}
```

---

### CR-04: `guestMode` not persisted — 3DS redirect resets auth step for guests

**File:** `lib/booking-store.ts:147-178` (partialize block)

**Issue:** `guestMode` is set to `true` when the user clicks "Continue as guest" in Step3Auth, but it is absent from the `partialize` object. Zustand's `persist` middleware only serialises the keys returned by `partialize`. When a guest reaches Step 6 and completes a 3DS challenge (full-page redirect back to `return_url`), sessionStorage is re-read, `guestMode` defaults back to `false`, and `currentStep` is restored. But Step3Auth's `useEffect` `getSession()` check sees no session and calls `nextStep()` — returning to step 4 instead of step 6 — OR the booking lands at the confirmation page with `guestMode=false` which may gate features incorrectly.

Additionally, even without 3DS, a hard refresh at Step 6 would reset `guestMode` and could re-route the user.

**Fix:** Add `guestMode` to the partialize block:
```ts
partialize: (state) => ({
  // ... existing fields ...
  guestMode: state.guestMode,
}),
```

---

## Warnings

### WR-01: Step6Payment `useEffect` creates a new Supabase client on every invocation

**File:** `components/booking/steps/Step6Payment.tsx:291-293`

**Issue:** Inside the `fetchPaymentIntent` async function (itself inside a `useEffect`), a new `createBrowserClient` instance is created on every effect execution:
```ts
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```
The effect re-fires whenever `totalEur`, `selectedCurrency`, `promoCode`, `tripType`, `returnTime`, or `roundTripPriceBreakdown` changes. Each invocation constructs a brand-new client with its own internal WebSocket/realtime channel and auth state listener, none of which are cleaned up. Over the lifetime of Step 6 this creates multiple dangling connections and redundant network calls.

**Fix:** Hoist the client construction to `useMemo` at the component level (same pattern used in Step3Auth and Step5Passenger):
```ts
const supabase = useMemo(
  () => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ),
  []
)
```

---

### WR-02: Step3Auth OAuth return: `nextStep()` fires without clearing `guestMode`

**File:** `components/booking/steps/Step3Auth.tsx:134-143`

**Issue:** On mount, if a session already exists (OAuth return case), `nextStep()` is called immediately. If, on a previous visit, the user had set `guestMode=true` (and it was persisted — or if `guestMode` is added per CR-04), calling `nextStep()` here does NOT call `setGuestMode(false)`. A subsequent authenticated user could inherit `guestMode=true` from a prior guest session, which may suppress user-id linking or show "guest" UI in payment.

**Fix:** Explicitly clear guestMode when advancing an authenticated user:
```ts
if (session) {
  sessionStorage.removeItem('booking_deeplink')
  if (sessionStorage.getItem('oauth_login_pending') === '1') {
    sessionStorage.removeItem('oauth_login_pending')
    window.gtag?.('event', 'login', { method: 'oauth' })
  }
  setGuestMode(false)  // ensure guest flag is cleared for authenticated users
  nextStep()
}
```

Same guard should be applied in `handleVerifyOtp`, `handlePassword`, and `handleRegister`.

---

### WR-03: Airport mismatch warning logic is inverted

**File:** `components/booking/steps/Step5Passenger.tsx:455-459`

**Issue:** The condition that shows the airport mismatch warning is:
```tsx
{flightCheckResult.flight_arrival_airport !== 'PRG' &&
  flightCheckResult.flight_departure_airport !== 'PRG' && (
```

This fires the warning only when *neither* airport is PRG — i.e., a completely unrelated flight. The intended check is to warn when the *arrival* airport is not PRG (flight is not arriving in Prague), regardless of where it departs. A flight PRG→LHR has `flight_arrival_airport = 'LHR'` and `flight_departure_airport = 'PRG'`, so the current logic (AND) suppresses the warning. A flight MAD→LHR triggers it but is not a Prague-airport booking scenario.

**Fix:**
```tsx
{flightCheckResult.flight_arrival_airport !== 'PRG' && (
  <div style={{ color: '#E67E22', fontSize: 14, fontWeight: 400, marginTop: 4 }}>
    &#9888; Airport mismatch: flight arrives at {flightCheckResult.flight_arrival_airport}, not PRG
  </div>
)}
```

---

### WR-04: `estDropoff` in StickyBookingPanel returns `null!` — typed lie crashes callers

**File:** `components/booking/StickyBookingPanel.tsx:47`

**Issue:**
```ts
function estDropoff(pickupTime: string, distanceKm: number | null): string {
  if (!distanceKm) return null!
  ...
}
```
The return type is declared `string` but `null!` is returned when `distanceKm` is falsy. The non-null assertion silences TypeScript; at runtime the value is `null`. The call site checks `{estDropoff(pickupTime, distanceKm) && ...}` so it won't crash visibly, but any other caller that trusts the `string` return type would receive a `null` and could crash or produce `"null"` in string concatenation.

**Fix:** Change the return type to `string | null`:
```ts
function estDropoff(pickupTime: string, distanceKm: number | null): string | null {
  if (!distanceKm) return null
  ...
}
```

---

### WR-05: `BookingWizard` import order — `import` after statements violates module spec

**File:** `components/booking/BookingWizard.tsx:12-14`

**Issue:** Lines 1–11 contain `'use client'`, import statements, and `const` declarations. Lines 12–14 then introduce three more `import` statements after top-level `const` declarations:
```ts
const VALID_TRIP_TYPES = new Set(...)  // line 8
const VALID_CLASSES = new Set(...)     // line 9
const DATE_RE = /^.../                 // line 10
const TIME_RE = /^.../                 // line 11
import { computeExtrasTotal } ...      // line 12  ← after consts
import { trackMetaEvent } ...          // line 13
import { useRouter } ...               // line 14
```

ES modules require all `import` declarations to appear before executable statements. Bundlers (Next.js/webpack/turbopack) hoist imports at build time so this does not cause a runtime crash, but it violates the spec, confuses static analysis tools, and is flagged as an error by `eslint/import-first`. Any future linting enforcement would break the build.

**Fix:** Move all imports to the top of the file before the `const` declarations.

---

## Info

### IN-01: `dataLayer.push(['event', eventName, params])` is not a valid GTM/GA4 format

**File:** `components/booking/BookingWizard.tsx:118-119`

**Issue:** The `gtag`-absent fallback in the GA4 push helper pushes two separate entries:
```ts
w.dataLayer.push(['event', eventName, params])   // array format — not standard
w.dataLayer.push({ event: eventName, ...params }) // object format — correct GTM
```
The array form `['event', ...]` is not a recognized GTM dataLayer message format. It will be silently ignored by GTM. Only the second push (object) is consumed. The same pattern is duplicated in `StickyBookingPanel.tsx:28-31`. The first `push` is dead code.

**Fix:** Remove the array-format push:
```ts
w.dataLayer = w.dataLayer || []
w.dataLayer.push({ event: eventName, ...params })
```

---

### IN-02: `promoCode` persisted in sessionStorage enables promo code reuse across bookings

**File:** `lib/booking-store.ts:175-177`

**Issue:** `promoCode` and `promoDiscount` are persisted across sessions in the intent of surviving a 3DS redirect. However, after a successful payment the `resetBooking()` action clears them, but `resetBooking` is called only on confirmation page load. If the user closes the tab before reaching confirmation (e.g., payment fails or browser crashes) the applied promo code remains in sessionStorage. On the *next* visit the promo code is re-hydrated into the store and shown as applied in Step 6 UI — even though the server's `claim_promo_code` already consumed it. The next POST will fail with "Promo code is invalid, expired, or has reached its usage limit" and the user sees an error without explanation. This is a UX issue, not a security issue (server-side claim is correct).

**Fix:** On Step 6 mount, when building a fresh payment intent, compare the hydrated `promoCode` against the result from `/api/validate-promo` before showing it as applied, or clear it on payment failure.

---

### IN-03: `buildBookingRows` return-leg row skips `user_id` field

**File:** `lib/supabase.ts:174-220` (the `returnRow` object)

**Issue:** `buildBookingRow` (single row) includes `user_id: meta.userId || null` (line 102). The `returnRow` in `buildBookingRows` is built manually and does not include the `user_id` field. For round-trip bookings the return leg row will have `user_id = NULL` even when the customer was authenticated. This means the RLS `SELECT` policy that filters by `user_id` will hide the return leg from the customer's trips page.

**Fix:** Add `user_id` to the `returnRow` object:
```ts
const returnRow = {
  ...
  user_id: meta.userId || null,
  ...
} as unknown as ReturnType<typeof buildBookingRow>
```

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (adversarial review)_
_Depth: deep_
