# Phase 5: Backend & Notifications - Research

**Researched:** 2026-03-30
**Domain:** Supabase (Postgres), Resend email API, Stripe webhook idempotency, retry logic, .ics calendar events
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Database (replaces Notion)**
- Supabase replaces Notion entirely — BACK-01 is now "save to Supabase" not Notion
- New Supabase project needs to be created (plan should include setup instructions)
- `bookings` table to be created — plan defines the SQL schema based on all booking fields
- Use `@supabase/supabase-js` client, server-side only (env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (not anon key) — webhook handler is server-side, needs write access without RLS restriction

**Email Service**
- Provider: Resend (`@resend/node`)
- From address: `bookings@rideprestige.com` (domain must be verified in Resend dashboard before go-live)
- Reply-To: `roman@rideprestige.com`
- Manager alert recipient: `roman@rideprestige.com`
- Env vars: `RESEND_API_KEY`, `MANAGER_EMAIL=roman@rideprestige.com`

**Client Confirmation Email**
- Format: branded HTML — dark background (`#1C1C1E`), copper accents (`#B87333`), Montserrat font (or safe web equivalent), matches site aesthetic
- Subject line: `Your PRESTIGO booking is confirmed — [bookingReference]`
- Content: booking reference prominently, full trip summary, contact/support info, add to calendar link

**Manager Alert Email**
- Format: plain-text functional email
- Subject line: `New booking: [bookingReference] — [clientName]`
- Content: all booking data fields in plain text

**Failure Handling**
- Supabase: 3 retries with exponential backoff (BACK-04) → if all fail, send emergency email to `roman@rideprestige.com` with full booking data as JSON
- Resend email: log failure and continue — email failure does NOT block the webhook
- Webhook idempotency: return 200 even on partial failure to prevent Stripe retrying

**Quote Flow Parity**
- `submit-quote` route also gets Supabase save + manager alert email in Phase 5
- Quote bookings get `QR-YYYYMMDD-NNNN` reference (already generated in stub)
- No client confirmation email for quote mode

### Claude's Discretion

- Exact Supabase `bookings` table schema (base on all fields in `BookingStore` type)
- HTML email template implementation approach (inline styles vs React Email vs simple template string)
- `.ics` calendar event format and whether to use a link or attachment
- Exact retry backoff timing (e.g. 1s, 2s, 4s)
- Whether to deduplicate by `paymentIntentId` in Supabase to guard against Stripe webhook retries

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BACK-01 | Booking data saved to Supabase after payment confirmation | Supabase insert pattern, schema design from BookingStore fields |
| BACK-02 | Confirmation email sent to client (booking summary, ride details) | Resend send API, HTML template approach, calendar link |
| BACK-03 | Notification email sent to manager (new booking alert with all details) | Resend send API, plain-text format |
| BACK-04 | Supabase API calls wrapped in retry logic (3 retries, exponential backoff) | Retry utility pattern, backoff timing |
| BACK-05 | Confirmation page at /book/confirmation shows booking reference | Already implemented in Phase 4 — BACK-05 is satisfied, no work needed |
</phase_requirements>

---

## Summary

Phase 5 is a pure server-side phase. It fills in two API route stubs (`/api/webhooks/stripe` and `/api/submit-quote`) with three side effects: (1) save booking to Supabase, (2) send client confirmation email via Resend, (3) send manager alert email via Resend. No new React components, no new page routes. The confirmation page (BACK-05) was already delivered in Phase 4.

The critical design constraint is webhook idempotency: the Stripe webhook must return 200 regardless of partial failure to prevent duplicate-fire retries. Supabase failures are handled with 3-retry exponential backoff plus an emergency fallback email. Email failures are logged and silently continue. Deduplication by `paymentIntentId` guards against duplicate Supabase rows if Stripe does retry.

The HTML email template uses inline styles throughout (mandatory for email client compatibility). The recommended approach is a TypeScript template-string function — simpler than React Email for a single email, zero extra dependencies, fully compatible with all email clients. The `.ics` calendar link is best delivered as a Google Calendar URL (zero dependencies, works in all email clients, no attachment handling needed).

**Primary recommendation:** Two new lib files (`lib/supabase.ts` and `lib/email.ts`) contain all business logic. Both webhook and submit-quote routes import from these libs. Keep routes thin.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.101.0 | Postgres client for Supabase | Official SDK, server-side insert with service role |
| `resend` | 6.9.4 | Transactional email delivery | Official Node SDK, simple API, reliable deliverability |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-email/components` | 1.0.10 | React-based email template builder | Only if complex templating needed — NOT recommended here (overkill for one email) |
| `@react-email/render` | 2.0.4 | Renders React Email to HTML string | Only if React Email approach chosen |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Template string HTML | React Email | React Email is better for many templates; for a single email, template string is simpler and has zero extra deps |
| Google Calendar URL | `.ics` attachment | `.ics` requires generating binary attachment + base64 encoding; Google Calendar URL is one-liner and covers 90% of use cases |
| Inline retry utility | `p-retry` npm package | `p-retry` adds a dependency for trivial logic; manual async loop is 10 lines and fully transparent |

**Installation:**
```bash
npm install @supabase/supabase-js resend
```

**Version verification (performed 2026-03-30):**
```
@supabase/supabase-js: 2.101.0  (npm view, 2026-03-30)
resend: 6.9.4                   (npm view, 2026-03-30)
```

---

## Architecture Patterns

### Recommended Project Structure

New files this phase:
```
prestigo/
├── lib/
│   ├── supabase.ts          # Supabase client factory + saveBooking()
│   └── email.ts             # sendClientConfirmation() + sendManagerAlert() + sendEmergencyAlert()
├── app/api/
│   ├── webhooks/stripe/
│   │   └── route.ts         # Fill in Phase 5 hook point
│   └── submit-quote/
│       └── route.ts         # Fill in Phase 5 stub
```

No new directories required.

### Pattern 1: Supabase Server-Side Client (Service Role)

**What:** Create a fresh Supabase client per request using service role key. Disable auth session persistence (server context, no browser).
**When to use:** All server-side Supabase operations (Route Handlers, webhooks).

```typescript
// lib/supabase.ts
// Source: https://github.com/orgs/supabase/discussions/30739
import { createClient } from '@supabase/supabase-js'

export function createSupabaseServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}
```

Key point: `SUPABASE_URL` does NOT need `NEXT_PUBLIC_` prefix here — webhook handler is server-only. Service role key must NEVER have `NEXT_PUBLIC_` prefix.

### Pattern 2: Supabase Insert with Error Handling

```typescript
// Source: @supabase/supabase-js v2 insert pattern
const supabase = createSupabaseServiceClient()
const { error } = await supabase.from('bookings').insert([rowData])
if (error) throw new Error(error.message)
```

The insert returns `{ data, error }`. Check `error` — if non-null, throw so the retry wrapper catches it.

For idempotency against Stripe retries, add a unique constraint on `payment_intent_id` in the SQL schema and use `upsert` instead of `insert`:

```typescript
const { error } = await supabase
  .from('bookings')
  .upsert([rowData], { onConflict: 'payment_intent_id', ignoreDuplicates: true })
```

`ignoreDuplicates: true` means a duplicate webhook is silently ignored (no error thrown, returns 200 to Stripe).

### Pattern 3: Retry with Exponential Backoff

**What:** Async wrapper that retries a function up to N times with exponential delay.
**When to use:** Any call that can transiently fail (Supabase insert).

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)))
      }
    }
  }
  throw lastError
}
```

Backoff sequence: 1s, 2s, 4s (attempt 1 retries after 1s, attempt 2 retries after 2s, attempt 3 throws).

### Pattern 4: Resend Email Send

**What:** Send email via Resend Node SDK.
**When to use:** All outbound email sends.

```typescript
// Source: https://resend.com/docs/api-reference/emails/send-email
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

const { data, error } = await resend.emails.send({
  from: 'PRESTIGO Bookings <bookings@rideprestige.com>',
  to: [recipientEmail],
  replyTo: 'roman@rideprestige.com',
  subject: `Your PRESTIGO booking is confirmed — ${bookingReference}`,
  html: htmlBody,
})

if (error) {
  console.error('Resend error:', error)
  // Do NOT throw — email failure must not block webhook
}
```

The Resend SDK returns `{ data: { id }, error }`. On success, `error` is null and `data.id` is the sent email ID. On failure, `error` contains the message. Treat email failure as non-fatal: log and continue.

### Pattern 5: Webhook Handler Structure

**What:** The correct order of operations inside the `payment_intent.succeeded` handler.
**When to use:** Filling in the Phase 5 hook point in `/api/webhooks/stripe/route.ts`.

```
1. Deserialize paymentIntent.metadata → booking row object
2. Attempt Supabase upsert with retry (withRetry, 3 attempts)
   - On success: continue
   - On all-fail: send emergency email to manager with raw JSON, continue
3. Send client confirmation email (non-fatal: log error, continue)
4. Send manager alert email (non-fatal: log error, continue)
5. Return NextResponse.json({ received: true }) — always 200
```

The `submit-quote` route follows the same order but skips step 3 (no client confirmation email for unconfirmed quotes).

### Pattern 6: Google Calendar URL (Add to Calendar)

**What:** A `href` link that opens Google Calendar pre-filled with the booking event.
**When to use:** "Add to Calendar" CTA in the client confirmation email.

```typescript
function buildGoogleCalendarUrl(params: {
  title: string
  startDatetime: string   // 'YYYYMMDDTHHMMSS' local time
  endDatetime: string     // startDatetime + 1 hour
  details: string
  location: string
}): string {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  return `${base}&text=${encodeURIComponent(params.title)}&dates=${params.startDatetime}/${params.endDatetime}&details=${encodeURIComponent(params.details)}&location=${encodeURIComponent(params.location)}`
}
```

Format the ghost button anchor in the email HTML: `<a href="${calendarUrl}" style="...">Add to Calendar</a>`.

### Anti-Patterns to Avoid

- **Throwing on email failure inside the webhook:** Email failure must be non-fatal. Never `throw` from a Resend call inside the webhook handler — Stripe would retry and cause duplicate DB rows.
- **Using `.json()` on the webhook request:** Already established in Phase 4 — `request.text()` is required for Stripe signature verification. Do not change this.
- **Initializing Supabase client at module level:** Avoids edge-case issues with env vars at import time in Next.js. Use the factory function per request.
- **Storing PII in Stripe metadata:** Per Stripe docs, PII should not be stored in metadata. However, this is already done in Phase 4 (name, email, phone in metadata). Phase 5 just reads existing metadata — do not add more PII fields.
- **Using `NEXT_PUBLIC_` prefix for SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY:** Server-only env vars. The webhook handler never runs in the browser.

---

## Recommended Supabase Schema

Based on all fields in `BookingStore` (from `prestigo/types/booking.ts` and `prestigo/lib/booking-store.ts`):

```sql
-- Run in Supabase SQL editor
CREATE TABLE bookings (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz DEFAULT now() NOT NULL,

  -- Reference
  booking_reference   text NOT NULL,
  payment_intent_id   text UNIQUE,            -- NULL for quote mode; UNIQUE for idempotency
  booking_type        text NOT NULL,          -- 'confirmed' | 'quote'

  -- Trip (Step 1)
  trip_type           text NOT NULL,          -- 'transfer' | 'hourly' | 'daily'
  origin_address      text,
  origin_lat          float8,
  origin_lng          float8,
  destination_address text,
  destination_lat     float8,
  destination_lng     float8,
  hours               integer,               -- hourly hire only
  passengers          integer NOT NULL,
  luggage             integer NOT NULL,

  -- Date & Time (Step 2)
  pickup_date         text NOT NULL,          -- 'YYYY-MM-DD'
  pickup_time         text NOT NULL,          -- 'HH:MM'
  return_date         text,                  -- daily hire only

  -- Vehicle (Step 3)
  vehicle_class       text NOT NULL,          -- 'business' | 'first_class' | 'business_van'
  distance_km         float8,

  -- Pricing
  amount_czk          integer NOT NULL,       -- total in CZK (from PaymentIntent amount / 100)
  amount_eur          integer,               -- czkToEur() result

  -- Extras (Step 4)
  extra_child_seat    boolean DEFAULT false NOT NULL,
  extra_meet_greet    boolean DEFAULT false NOT NULL,
  extra_luggage       boolean DEFAULT false NOT NULL,

  -- Passenger (Step 5)
  client_first_name   text NOT NULL,
  client_last_name    text NOT NULL,
  client_email        text NOT NULL,
  client_phone        text NOT NULL,
  flight_number       text,
  terminal            text,
  special_requests    text
);
```

Notes on schema decisions:
- `payment_intent_id` has `UNIQUE` constraint — this is the deduplication key for Stripe webhook retries
- `payment_intent_id` is nullable because quote mode has no PaymentIntent
- Prices stored as integers (CZK hellers → CZK, then EUR whole units)
- All metadata fields are `text` because Stripe metadata values are strings — no coercion needed at read time
- No RLS policies needed because only the service role key writes to this table

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP server or nodemailer | Resend (`resend` SDK) | DNS setup, deliverability, SPF/DKIM handled by Resend |
| Postgres client | `pg` or `postgres.js` directly | `@supabase/supabase-js` | Supabase manages auth, connection pooling, and the insert/upsert API |
| Retry logic | External `p-retry` package | Inline `withRetry` utility | 10-line function; adding a package for this is overkill |
| Calendar attachment | `.ics` file generation | Google Calendar URL | `.ics` requires encoding, MIME type handling; URL is one line |
| HTML email builder | Custom class-based template engine | Template string function | One email; no dynamic loop/conditional complexity that needs a full engine |

**Key insight:** All three side-effect libraries (Supabase, Resend) have official Node/TypeScript SDKs with minimal API surface. The integration work is wiring, not building.

---

## Common Pitfalls

### Pitfall 1: Stripe Webhook Retries Cause Duplicate Bookings
**What goes wrong:** Stripe retries the webhook if it doesn't receive a 200 within 30s, or if it receives a non-2xx. If the handler throws (e.g., on Supabase failure), Stripe retries and creates a duplicate row.
**Why it happens:** Any unhandled exception in the route will result in a 500, triggering Stripe's retry mechanism.
**How to avoid:** Always catch all errors and return `{ received: true }` with 200. Use `upsert` with `onConflict: 'payment_intent_id'` to make duplicate inserts a no-op.
**Warning signs:** Multiple rows with the same `payment_intent_id` in the database.

### Pitfall 2: Raw Body Already Consumed Before Supabase/Email Logic
**What goes wrong:** The webhook reads `request.text()` for Stripe signature verification. If any code tries to read the body again afterward, it gets empty string.
**Why it happens:** Request body streams can only be consumed once in Node.js.
**How to avoid:** Parse all needed data from `paymentIntent.metadata` (already available as a parsed object after `constructEvent`). Never call `request.text()` or `request.json()` a second time.
**Warning signs:** Empty or undefined booking fields in the Supabase row.

### Pitfall 3: Stripe Metadata 500-Character Value Limit
**What goes wrong:** Values in `paymentIntent.metadata` are truncated at 500 characters. `specialRequests` or long address strings may be cut off.
**Why it happens:** Stripe enforces a 500-char limit per metadata value (verified from official docs).
**How to avoid:** In `create-payment-intent`, truncate metadata values that might exceed 500 chars before storing. For `specialRequests`, truncate at 490 chars with a note. Read truncated values and store them truncated in Supabase — this is a known limitation.
**Warning signs:** `special_requests` or address fields silently truncated in Supabase.

### Pitfall 4: `SUPABASE_URL` Env Var Name Mismatch
**What goes wrong:** Supabase's own quickstart uses `NEXT_PUBLIC_SUPABASE_URL` (for SSR auth flows). This phase uses server-only access — the variable should NOT have `NEXT_PUBLIC_` prefix.
**Why it happens:** Copy-pasting from Supabase quickstart docs that assume client-side access.
**How to avoid:** Use `SUPABASE_URL` (no prefix) and `SUPABASE_SERVICE_ROLE_KEY` as defined in CONTEXT.md.
**Warning signs:** Build fails because `process.env.SUPABASE_URL` is undefined at runtime.

### Pitfall 5: Resend `from` Domain Not Verified
**What goes wrong:** Sending from `bookings@rideprestige.com` before the domain is verified in Resend returns a 422 error.
**Why it happens:** Resend requires DNS verification (SPF/DKIM records) before custom domain sends are allowed.
**How to avoid:** During development, use the Resend test address `onboarding@resend.dev`. Add a TODO comment in `lib/email.ts` and a note in the plan about pre-deployment domain verification.
**Warning signs:** Resend returns `{ error: { message: 'The domain is not verified...' } }`.

### Pitfall 6: Email HTML Inline Styles — No Class Attributes
**What goes wrong:** Email clients (Gmail, Outlook) strip `<style>` blocks and class attributes. CSS classes have no effect.
**Why it happens:** Email clients apply their own CSS sandboxing.
**How to avoid:** All styles in the confirmation email HTML must use `style="..."` inline attributes. No Tailwind classes, no `className`, no `<style>` tags (except a `<link>` for Google Fonts as a progressive enhancement).
**Warning signs:** Email renders without styling in Gmail or Outlook preview.

---

## Code Examples

### Verified: Supabase upsert with idempotency guard
```typescript
// Source: @supabase/supabase-js v2, official insert/upsert pattern
const supabase = createSupabaseServiceClient()
const { error } = await supabase
  .from('bookings')
  .upsert([bookingRow], { onConflict: 'payment_intent_id', ignoreDuplicates: true })
if (error) {
  throw new Error(`Supabase insert failed: ${error.message}`)
}
```

### Verified: Resend send with HTML and replyTo
```typescript
// Source: https://resend.com/docs/api-reference/emails/send-email
const resend = new Resend(process.env.RESEND_API_KEY!)
const { data, error } = await resend.emails.send({
  from: 'PRESTIGO Bookings <bookings@rideprestige.com>',
  to: [clientEmail],
  replyTo: 'roman@rideprestige.com',
  subject: `Your PRESTIGO booking is confirmed — ${bookingReference}`,
  html: htmlBody,
})
```

### Verified: createClient with service role (no NEXT_PUBLIC_ prefix)
```typescript
// Source: https://github.com/orgs/supabase/discussions/30739
import { createClient } from '@supabase/supabase-js'

export function createSupabaseServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}
```

### Verified: Reading booking fields from Stripe metadata
```typescript
// Source: create-payment-intent/route.ts — existing metadata structure
const meta = paymentIntent.metadata
const bookingRow = {
  booking_reference:   meta.bookingReference,
  payment_intent_id:   paymentIntent.id,
  booking_type:        'confirmed',
  trip_type:           meta.tripType,
  origin_address:      meta.originAddress,
  origin_lat:          meta.originLat ? parseFloat(meta.originLat) : null,
  origin_lng:          meta.originLng ? parseFloat(meta.originLng) : null,
  destination_address: meta.destinationAddress,
  destination_lat:     meta.destinationLat ? parseFloat(meta.destinationLat) : null,
  destination_lng:     meta.destinationLng ? parseFloat(meta.destinationLng) : null,
  pickup_date:         meta.pickupDate,
  pickup_time:         meta.pickupTime,
  vehicle_class:       meta.vehicleClass,
  amount_czk:          Math.round(paymentIntent.amount / 100),
  // ...etc
}
```

Note: All metadata values are strings. Numbers and booleans must be parsed. Boolean extras are stored as `'true'`/`'false'` strings in metadata — parse with `meta.extraChildSeat === 'true'`.

### Pattern: Emergency fallback email on Supabase failure
```typescript
// When all 3 Supabase retries fail:
await resend.emails.send({
  from: 'PRESTIGO System <bookings@rideprestige.com>',
  to: [process.env.MANAGER_EMAIL!],
  replyTo: process.env.MANAGER_EMAIL!,
  subject: `ALERT: Supabase save failed — ${bookingReference}`,
  text: [
    'Supabase save failed after 3 retries.',
    'Full booking data as JSON follows.',
    'Client confirmation email has been sent.',
    '',
    JSON.stringify(bookingRow, null, 2),
  ].join('\n'),
})
```

Use `text` (not `html`) for the emergency alert — plain text is faster to compose and always renders.

---

## BACK-05 Status

**BACK-05 is already complete.** The confirmation page at `/book/confirmation` was delivered in Phase 4 and already displays the booking reference. The `bookingReference` on the page comes from the Zustand store snapshot captured before `resetBooking()`. Phase 5 does NOT need to touch the confirmation page.

The only remaining connection: the booking reference displayed on the page matches the `paymentIntentClientSecret`→`bookingReference` returned from `create-payment-intent`. This reference is also stored in `paymentIntent.metadata.bookingReference` and will be saved as `booking_reference` in Supabase — satisfying the requirement that they match.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nodemailer + custom SMTP | Resend / Postmark / SendGrid SDK | ~2022–2024 | Managed deliverability, DNS setup automated |
| Notion as booking DB | Supabase (Postgres) | This project (Phase 5 context) | SQL schema, proper indexing, no rate limits |
| `.ics` attachment | Google Calendar URL | Ongoing best practice | Simpler, works in all email clients, no MIME handling |
| `@supabase/auth-helpers` for server | `@supabase/supabase-js` createClient with service role | supabase-js v2+ | Auth helpers deprecated for server admin use cases |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: deprecated in favor of `@supabase/ssr` (for auth flows) or plain `@supabase/supabase-js` (for service role admin). Use plain `@supabase/supabase-js` for this phase.
- `createRouteHandlerClient()` from auth-helpers: does not support service role bypass of RLS. Use `createClient()` directly.

---

## Open Questions

1. **What fields does `create-payment-intent` actually serialize into metadata?**
   - What we know: `{ bookingReference, ...bookingData }` where `bookingData` is `Record<string, string>` from the client
   - What's unclear: the exact key names the client sends (depends on Step 6 Payment component implementation)
   - Recommendation: Read `prestigo/app/(booking)/book/step6-payment.tsx` before implementing `saveBooking()` to confirm exact metadata keys. The planner should include this as a read step in the implementation wave.

2. **Stripe metadata value limits — are any booking fields at risk of truncation?**
   - What we know: Stripe limits metadata values to 500 characters
   - What's unclear: whether `originAddress`, `destinationAddress`, or `specialRequests` can exceed 500 chars in practice
   - Recommendation: Truncate all string metadata fields to 490 chars in `create-payment-intent` as a defensive measure (or in the webhook when reading back). The planner should add a truncation guard.

3. **Is `submit-quote` body structure identical to PaymentIntent metadata?**
   - What we know: `submit-quote` receives `req.json()` — the full booking object from client
   - What's unclear: exact shape of the JSON body (depends on BookingWizard's quote submission code)
   - Recommendation: Read `prestigo/app/(booking)/book/booking-wizard.tsx` before implementing the quote save. The planner should include this read step.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts tests/submit-quote.test.ts` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-01 | Supabase insert called with correct row data after payment_intent.succeeded | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists, needs BACK-01 cases |
| BACK-01 | Supabase upsert is idempotent (duplicate paymentIntentId is no-op) | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists |
| BACK-02 | Client confirmation email sent via Resend with correct fields | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists |
| BACK-03 | Manager alert email sent via Resend with all booking fields | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists |
| BACK-03 | Manager alert email sent from submit-quote route | unit | `npx vitest run tests/submit-quote.test.ts` | ❌ Wave 0 |
| BACK-04 | Supabase insert retried up to 3 times on failure | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists |
| BACK-04 | Emergency fallback email sent when all 3 retries fail | unit | `npx vitest run tests/webhooks-stripe.test.ts` | Partial — stub exists |
| BACK-05 | Confirmation page shows booking reference (already tested in Phase 4) | — | existing confirmation-page.test.tsx | ✅ Already exists |

The existing `tests/webhooks-stripe.test.ts` is a stub with `.todo` items — all BACK-01 through BACK-04 tests need to be written, not just the stubs promoted to real tests.

### Mock Strategy for Tests

Both Supabase and Resend are external services — mock them in tests:

```typescript
// In test file or setup.ts
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
    },
  })),
}))
```

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run tests/webhooks-stripe.test.ts`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `prestigo/tests/submit-quote.test.ts` — covers BACK-03 (manager alert from quote flow) and Supabase save from quote route
- Supabase and Resend mock setup in `tests/setup.ts` (extend existing setup.ts)
- Existing `tests/webhooks-stripe.test.ts` todos need to be converted to real tests — this is implementation work, not Wave 0 infrastructure

---

## Sources

### Primary (HIGH confidence)
- `@supabase/supabase-js` v2 — createClient with service role pattern confirmed via GitHub discussion https://github.com/orgs/supabase/discussions/30739
- Resend Node SDK — send email API confirmed via https://resend.com/docs/api-reference/emails/send-email
- Stripe metadata limits — confirmed via https://docs.stripe.com/metadata (50 keys, 40 char keys, 500 char values)
- npm registry — package versions confirmed via `npm view` 2026-03-30

### Secondary (MEDIUM confidence)
- Google Calendar URL format — well-documented community pattern, widely implemented, no official single-source doc
- `.ics` vs Google Calendar tradeoff — based on common email development practice

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm versions verified 2026-03-30, APIs verified from official docs
- Architecture: HIGH — patterns derived from existing project code + official SDK docs
- Schema: HIGH — derived directly from `BookingStore` TypeScript types (source read)
- Pitfalls: HIGH for webhook idempotency (Stripe official docs), HIGH for metadata limits (Stripe official docs), MEDIUM for email inline styles (industry standard practice)

**Research date:** 2026-03-30
**Valid until:** 2026-05-30 (stable libraries)
