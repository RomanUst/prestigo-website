# Codebase Concerns

**Analysis Date:** 2026-03-31

## Tech Debt

### Placeholder Pricing Configuration

**Issue:** Production pricing rates are hardcoded placeholders in multiple files.

**Files:**
- `prestigo/lib/pricing.ts` (lines 3-19, 21)
- `prestigo/lib/extras.ts` (lines 4-8, 3)

**Impact:** All bookings are currently priced with test values. Actual revenue will be incorrect. Business critical for go-live.

**Current values:**
- RATE_PER_KM: 2.80, 4.20, 3.50 EUR per vehicle class
- HOURLY_RATE: 55, 85, 70 EUR per vehicle class
- DAILY_RATE: 320, 480, 400 EUR per vehicle class
- EXTRAS: childSeat 15, meetAndGreet 25, extraLuggage 20 EUR

**Fix approach:** Replace hardcoded rates with dynamic configuration from environment variables or database. Create rate tables in Supabase with versioning for audit trail. Validate rates on API startup via health check.

---

### Unverified Email Domain

**Issue:** Email delivery is using domain `rideprestige.com` that has not been verified in Resend.

**Files:** `prestigo/lib/email.ts` (line 5)

**Impact:** Emails may be rejected or delivered to spam folder. Client confirmations and manager alerts could be lost without visible error (non-fatal error handling). No booking confirmation reaches customer.

**Current status:** Code points to development email `onboarding@resend.dev` for testing.

**Fix approach:** Before production launch, verify `rideprestige.com` domain in Resend dashboard. Update sender addresses from `bookings@rideprestige.com`. Monitor DKIM/SPF/DMARC alignment. Add email delivery monitoring to health check.

---

### Placeholder Contact Information

**Issue:** Support contact in confirmation emails contains placeholder phone number.

**Files:** `prestigo/lib/email.ts` (line 231)

**Impact:** Customers cannot reach support. Shows unprofessional hardcoded placeholder "+420 XXX XXX XXX".

**Fix approach:** Replace with actual manager phone from environment variable. Validate non-empty on startup.

---

### Undocumented Supabase Service Role Usage

**Issue:** Service role key is instantiated at module level with no comments about security implications.

**Files:** `prestigo/lib/supabase.ts` (lines 4-16)

**Impact:** Service role bypasses Supabase RLS policies entirely. If leaked, attacker has unrestricted database access. Risk amplified because key is server-side only but instantiated globally.

**Current mitigation:** None documented. Key stored in `.env.local` (not committed) but could be exposed in error logs.

**Fix approach:** Add security comment explaining service role usage. Rotate keys monthly. Add Supabase audit logging. Consider separate read-only role for queries. Implement rate limiting on Supabase side.

---

## Known Issues

### Manual Booking Reference/Quote Reference Generation

**Issue:** Booking and quote references are generated with weak randomization.

**Files:**
- `prestigo/app/api/create-payment-intent/route.ts` (lines 6-11)
- `prestigo/app/api/submit-quote/route.ts` (lines 6-11)

**Problem:** References use pattern `PRG-YYYYMMDD-XXXX` where XXXX is `Math.random() * 9000 + 1000` — only 9000 possible values per day. Collision risk increases significantly under load. Not cryptographically secure.

**Trigger:** Generating multiple references in same second under concurrent requests.

**Impact:** Potential for duplicate references, undermining uniqueness guarantee.

**Workaround:** Current system catches duplicates via `ignoreDuplicates: true` in upsert, but this masks the underlying issue.

**Fix approach:** Use `crypto.randomUUID()` or `nanoid()` library. Ensure database constraint enforces uniqueness with error handling.

---

### Stripe Payment Metadata Vulnerability

**Issue:** Payment intent metadata is constructed entirely from client request body without validation.

**Files:** `prestigo/app/api/create-payment-intent/route.ts` (line 31)

**Problem:** Booking data (addresses, passenger names, amounts) passed directly to Stripe metadata from `bookingData` parameter. No schema validation. Stripe metadata has size limits (~500 chars per key).

**Impact:**
- Oversized data silently truncated
- Malformed data passed through (e.g., HTML, special chars)
- Later webhook processing assumes metadata integrity

**Fix approach:** Validate request with Zod schema before creating intent. Limit string lengths. Test truncation scenarios.

---

## Security Considerations

### Hardcoded Placeholder Phone Number in Email Template

**Issue:** Backup contact phone is hardcoded placeholder in email HTML.

**Files:** `prestigo/lib/email.ts` (line 231)

**Risk:** Customer follows instructions to call hardcoded number. Shows "not production ready" signal to users.

**Current mitigation:** None.

**Recommendations:**
- Replace with environment variable `MANAGER_PHONE`
- Validate phone format on startup
- Add tests to prevent regressions

---

### Google Maps API Key Exposure

**Issue:** Two different Google Maps API keys are used (client and server), but client key could be exposed in frontend code.

**Files:**
- `prestigo/components/booking/AddressInput.tsx` (line 14)
- `prestigo/app/api/calculate-price/route.ts` (line 38)

**Risk:** Client key is in `NEXT_PUBLIC_` and visible in browser. Could be misused if restrictions insufficient.

**Current mitigation:** Client key restricted to Places API + HTTP referrer. Server key restricted to Routes API.

**Recommendations:**
- Document key restriction strategy in README
- Monitor Google Cloud Console for unusual activity
- Consider using backend route for Places Autocomplete if Places API usage grows

---

### Missing Content Security Policy

**Issue:** No CSP headers configured. `dangerouslySetInnerHTML` used for schema markup.

**Files:**
- `prestigo/app/page.tsx` (lines with schema markup)
- `prestigo/app/faq/page.tsx` (lines with schema markup)

**Risk:** While current usage is for JSON-LD (safe), absence of CSP headers leaves application vulnerable to XSS if other unsafe HTML injection is introduced. No protection against third-party script injection.

**Recommendations:**
- Add CSP headers in Next.js middleware or headers config
- Specifically allow `application/ld+json` script types
- Audit all `dangerouslySetInnerHTML` usage
- Document security policy

---

### Unencrypted Payment Data in Database

**Issue:** Payment amounts stored in plaintext CZK/EUR without encryption. Stripe secret key not versioned in code (good), but payment intent IDs stored with booking reference.

**Files:** `prestigo/lib/supabase.ts` (lines 44-64)

**Risk:** Database breach exposes customer payment history and amounts. Payment intent IDs could be used to retrieve from Stripe.

**Current mitigation:** Supabase encryption at rest (default).

**Recommendations:**
- Add field-level encryption for `amount_czk`, `amount_eur`
- Implement audit logging for database access
- Use Stripe's Restricted API Keys for webhook processing (current approach does not)
- PII data (email, phone) also stored unencrypted

---

## Performance Bottlenecks

### Google Maps Routes API Called Synchronously on Each Price Calculate

**Issue:** Every trip type change triggers HTTP request to Google Routes API in `calculate-price` endpoint.

**Files:** `prestigo/app/api/calculate-price/route.ts` (lines 44-71)

**Problem:**
- Network latency (typically 300-800ms) blocks response
- No caching of route results for same origin/destination pair
- No request deduplication for concurrent identical requests

**Impact:** Slow UX on Step 2/3 when changing vehicle or reviewing prices. User perceives stuttering.

**Cause:** Step 2DateTime component calls API on every duration/date change.

**Improvement path:**
- Add route distance cache with 1-hour TTL (same day routes don't change)
- Implement request deduplication during calculation
- Consider client-side distance matrix caching
- Add response time monitoring

---

### AddressInput Component Loads Google Maps on Every Instance

**Issue:** While module-level singleton prevents multiple loads, initial load blocks component rendering.

**Files:** `prestigo/components/booking/AddressInput.tsx` (lines 10-20, 68-74)

**Problem:**
- `ensureMapsLoaded()` returns promise that must resolve before address input is usable
- Two address inputs (origin/destination) on Step 1 — both wait for Maps to load
- Maps initialization happens on mount, not on server

**Impact:** Delay before autocomplete is available. User can focus input but no suggestions appear until Maps loads.

**Improvement path:**
- Preload Google Maps library at app initialization (layout level)
- Cache loader promise globally
- Show loading state while Maps initializes
- Consider service worker for offline capability

---

### No Query Result Caching in Supabase Calls

**Issue:** Every booking retrieval is a fresh database query with no caching.

**Files:** `prestigo/lib/supabase.ts` (entire file)

**Impact:** Negligible for current scale. Becomes issue if confirmation page needs to fetch booking details frequently or at scale.

**Improvement path:** Not urgent for MVP, but consider adding Redis/vercel KV for booking confirmations within 30 minutes of creation.

---

## Fragile Areas

### Booking Wizard State Management Across Multi-Step Form

**Files:**
- `prestigo/components/booking/BookingWizard.tsx`
- `prestigo/lib/booking-store.ts`
- Multiple step components

**Why fragile:**
- State spread across Zustand store + local component state
- No schema validation between steps (user can submit invalid data)
- Step completion logic relies on state presence checks
- Back button behavior not fully documented
- Hydration issues handled with useEffect checks (fragile)

**Safe modification:**
- Test all navigation paths (forward, back, skip)
- Validate at each step before allowing progression
- Document expected state shape

**Test coverage gaps:**
- No tests for back navigation re-rendering
- Missing tests for invalid state progression
- No tests for concurrent step updates

---

### Email Template Building with String Concatenation

**Files:** `prestigo/lib/email.ts` (lines 95-247)

**Why fragile:**
- HTML email template built with string concatenation
- No HTML escaping for dynamic content (names, addresses)
- XSS vulnerable if user submits HTML in name field: `<script>alert('xss')</script>` would execute in email client

**Safe modification:**
- Consider email template library (React Email, Mjml) instead of string concat
- Always escape user input: `firstName.replace(/</g, '&lt;')`
- Test with special characters (quotes, ampersands, angle brackets)

**Test coverage gaps:**
- No tests with special characters in customer names
- Missing tests for very long addresses

---

### Webhook Processing Without Idempotency Keys

**Files:** `prestigo/app/api/webhooks/stripe/route.ts`

**Why fragile:**
- Stripe can retry webhooks multiple times
- No idempotency guarantee — same webhook processed twice = duplicate booking
- Upsert on `payment_intent_id` prevents duplicates BUT email sent twice
- Non-fatal error handling swallows email failures

**Safe modification:**
- Implement idempotency key tracking
- Deduplicate based on `payment_intent_id` before any processing
- Make email sending idempotent (use deduplication table)

**Test coverage gaps:**
- No tests for duplicate webhook delivery
- Missing tests for partial webhook failure (email fails, DB succeeds)

---

### Retry Logic with Silent Failure Fallback

**Files:** `prestigo/app/api/webhooks/stripe/route.ts` (lines 40-46)

**Issue:** After 3 retries fail, sends emergency email instead of throwing error. Email itself is non-fatal.

**Problem:** If both Supabase AND email fail, booking data is lost completely. No alerting mechanism, no dead letter queue.

**Improvement path:**
- Add structured logging to identify root cause of failures
- Implement message queue (job processing) instead of immediate execution
- Add monitoring/alerting on emergency email sends
- Store failed booking data in separate recovery table

---

## Test Coverage Gaps

### Stripe Webhook Signature Verification

**Files:** `prestigo/app/api/webhooks/stripe/route.ts` (lines 9-29)

**What's not tested:**
- Invalid signature rejection
- Missing signature header
- Malformed event data
- Different Stripe event types (only `payment_intent.succeeded` implemented)

**Files:** `prestigo/tests/webhooks-stripe.test.ts` shows test exists but gaps remain

**Risk:** Critical payment path. Unverified webhook could process attacker-supplied event.

**Priority:** High

---

### Google Routes API Error Handling

**Files:** `prestigo/app/api/calculate-price/route.ts` (lines 58-61)

**What's not tested:**
- API returns error status (handled with fallback to quote mode)
- Malformed response JSON
- Network timeout
- Partial/incomplete response

**Current behavior:** Returns `{ prices: null, distanceKm: null, quoteMode: true }` on any error

**Risk:** Silent failure — user sees "Enter destination to calculate" but doesn't know why. API error not logged comprehensively.

**Priority:** Medium — affects UX but graceful fallback exists

---

### Email Sending Failure Scenarios

**Files:** `prestigo/lib/email.ts` (lines 249-264, 266-307, 309-328)

**What's not tested:**
- Resend API key invalid
- Email address invalid format
- Domain verification not complete
- Rate limiting from Resend

**Current behavior:** Non-fatal error handling — exception caught, logged, not thrown. Client never knows email failed.

**Risk:** Customer thinks booking is confirmed but never receives email.

**Priority:** High — data loss risk

---

### Metadata Truncation in Payment Intent

**Files:** `prestigo/app/api/create-payment-intent/route.ts`

**What's not tested:**
- Very long passenger names (100+ chars)
- Very long address strings
- Special characters (quotes, newlines, unicode)
- Stripe metadata size limits enforced

**Current behavior:** Data passed through without validation

**Risk:** Webhook receives truncated metadata, booking reconstructed incompletely.

**Priority:** Medium — edge case but data integrity impact

---

## Scaling Limits

### Concurrent Address Geocoding Requests

**Current capacity:** Google Maps Places API quota (depends on billing tier)

**Limit:** When reached, `handleSelect` geocoding fails silently (caught exception, logged).

**Scaling path:**
- Monitor Google Maps API quotas
- Implement client-side geocoding caching
- Add rate limiting on frontend
- Consider transitioning to self-hosted geocoder (OpenStreetMap)

---

### Supabase Connection Pooling

**Current capacity:** Default Supabase connection pool (typically 10 connections for free tier)

**Limit:** Under high concurrent booking load, connections exhaust, subsequent requests queue/timeout.

**Scaling path:**
- Monitor Supabase metrics for connection pool saturation
- Upgrade to Pro tier with higher pool limits
- Implement connection retry with exponential backoff (already done via `withRetry`)
- Consider separate read replica for booking confirmation queries

---

### Stripe Test Mode Limitations

**Current capacity:** Stripe test mode supports unlimited test transactions

**Limit:** Upon switching to live mode, payment processing becomes real-money. Test mode behavior may differ (latency, webhook delivery timing).

**Scaling path:**
- Thoroughly test production credentials before launch
- Implement feature flags to toggle test/live mode
- Add monitoring on webhook processing latency

---

## Dependencies at Risk

### Zustand State Management Library

**Risk:** Zustand is lightweight and stable, but chosen for this project without formal state management strategy. If requirements grow (undo/redo, time-travel debugging), Zustand may be insufficient.

**Impact:** Rewriting booking state logic if pivoting to Redux/Jotai/Atom.

**Migration plan:** Document state structure. If switching needed, extract store into separate package first.

---

### `use-places-autocomplete` Library

**Risk:** Maintained by open source contributor, not officially by Google. Could become unmaintained.

**Impact:** If unmaintained and Google Maps API changes, address input breaks.

**Migration plan:** Keep Google Maps API abstraction separate. Could migrate to direct API usage if needed.

---

### Stripe React SDK (`@stripe/react-stripe-js`)

**Risk:** Vendor lock-in. Stripe updates could introduce breaking changes. Browser compatibility issues.

**Impact:** Payment step breaks. Major refactoring needed.

**Migration plan:** Not feasible to switch payment processors mid-project. Mitigate by pinning versions in package.json, comprehensive testing on Stripe updates.

---

## Missing Critical Features

### No Booking Confirmation Fetching

**Problem:** Confirmation page at `/book/confirmation` hardcodes booking reference in URL but doesn't fetch full booking data from database.

**Files:** `prestigo/app/book/confirmation/page.tsx`

**Blocks:** Users cannot retrieve past booking details. No way to resend confirmation email. No admin dashboard to view bookings.

**Priority:** High — affects customer support.

---

### No Rate Limiting on APIs

**Problem:** Create payment intent and submit quote endpoints have no rate limiting.

**Files:**
- `prestigo/app/api/create-payment-intent/route.ts`
- `prestigo/app/api/submit-quote/route.ts`

**Blocks:** Abuse risk. Attacker could spam booking creation. Quota exhaustion on external APIs (Google Maps, Stripe, Resend).

**Priority:** High — before production.

---

### No Booking Modification/Cancellation

**Problem:** Once booking is confirmed and saved, no way to modify or cancel. Stripe refunds require manual intervention.

**Blocks:** Customer service cannot process changes. Violates consumer protection laws in many jurisdictions.

**Priority:** Critical — legal requirement for most markets.

---

### No Analytics or Monitoring

**Problem:** No tracking of booking funnel dropoff, API error rates, email delivery status.

**Files:** All API routes lack structured logging/monitoring

**Blocks:** Cannot identify UX bottlenecks. Cannot debug production issues.

**Priority:** High — essential for operations.

---

*Concerns audit: 2026-03-31*
