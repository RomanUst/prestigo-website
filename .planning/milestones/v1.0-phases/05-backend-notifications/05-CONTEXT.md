# Phase 5: Backend & Notifications - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Every confirmed Stripe payment and every submitted quote reliably triggers three side effects:
1. Booking record saved to Supabase
2. Client confirmation email sent via Resend
3. Manager alert email sent via Resend

The Stripe webhook handler (`/api/webhooks/stripe`) and the submit-quote route (`/api/submit-quote`) both have Phase 4 stubs — Phase 5 fills them in.

Confirmation page and booking reference are already implemented in Phase 4 (no frontend work in Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Database (replaces Notion)
- **Supabase replaces Notion entirely** — BACK-01 is now "save to Supabase" not Notion
- New Supabase project needs to be created (plan should include setup instructions)
- `bookings` table to be created — plan defines the SQL schema based on all booking fields
- Use `@supabase/supabase-js` client, server-side only (env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (not anon key) — webhook handler is server-side, needs write access without RLS restriction

### Email Service
- Provider: **Resend** (`@resend/node`)
- From address: `bookings@rideprestige.com` (domain must be verified in Resend dashboard before go-live)
- Reply-To: `roman@rideprestige.com`
- Manager alert recipient: `roman@rideprestige.com`
- Env vars: `RESEND_API_KEY`, `MANAGER_EMAIL=roman@rideprestige.com`

### Client Confirmation Email
- Format: **branded HTML** — dark background (`#1C1C1E`), copper accents (`#B87333`), Montserrat font (or safe web equivalent), matches site aesthetic
- Subject line: `Your PRESTIGO booking is confirmed — [bookingReference]`
- Content:
  1. Booking reference (PRG-YYYYMMDD-NNNN) — prominently displayed
  2. Full trip summary: origin → destination, pickup date + time, vehicle class, passenger count, extras list, total paid (CZK + EUR equivalent)
  3. Contact/support info: manager email + phone (use placeholder, Roman fills in before go-live)
  4. Add to calendar: `.ics` file download link or Google Calendar URL for pickup date/time

### Manager Alert Email
- Format: plain-text functional email — fast to read, no styling overhead
- Subject line: `New booking: [bookingReference] — [clientName]`
- Content: all booking data — client name, email, phone, route, vehicle class, date/time, flight number (if airport ride), extras, total amount in CZK

### Failure Handling
- **Supabase**: 3 retries with exponential backoff (BACK-04) → if all fail, send emergency email to `roman@rideprestige.com` with full booking data as JSON so no booking is truly lost. Client still receives their confirmation email.
- **Resend email**: log failure and continue — email failure does NOT block the webhook. Return `{ received: true }` to Stripe regardless.
- **Webhook idempotency**: webhook should return 200 even on partial failure to prevent Stripe retrying (which could cause duplicate DB rows)

### Quote Flow Parity
- `submit-quote` route also gets Supabase save + manager alert email in Phase 5
- Quote bookings get `QR-YYYYMMDD-NNNN` reference (already generated in stub)
- No client confirmation email for quote mode (quote isn't confirmed yet — manager follows up manually)

### Claude's Discretion
- Exact Supabase `bookings` table schema (base on all fields in `BookingStore` type)
- HTML email template implementation approach (inline styles vs React Email vs simple template string)
- `.ics` calendar event format and whether to use a link or attachment
- Exact retry backoff timing (e.g. 1s, 2s, 4s)
- Whether to deduplicate by `paymentIntentId` in Supabase to guard against Stripe webhook retries

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Core value, constraints, tech stack
- `.planning/REQUIREMENTS.md` — BACK-01–05 (Phase 5 requirements); note BACK-01 is now Supabase not Notion

### Prior Phase Context
- `.planning/phases/04-payment/04-CONTEXT.md` — Payment flow, booking reference format, confirmation page decisions, quote mode flow
- `.planning/phases/04-payment/04-00-PLAN.md` — Stripe webhook stub, submit-quote stub (Phase 5 fills these in)

### Existing Code (must read before planning)
- `prestigo/app/api/webhooks/stripe/route.ts` — Webhook stub to fill in (has `// Phase 5 hook point` comment)
- `prestigo/app/api/submit-quote/route.ts` — Quote stub to fill in (has `// Phase 5 will add` comment)
- `prestigo/app/api/create-payment-intent/route.ts` — Shows which booking fields are stored in `paymentIntent.metadata`
- `prestigo/lib/booking-store.ts` — All BookingStore fields (maps to Supabase table columns)
- `prestigo/types/booking.ts` — All TypeScript types (BookingStore, PassengerDetails, Extras, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prestigo/lib/currency.ts` — `czkToEur()` utility — reuse for EUR display in confirmation email
- `prestigo/lib/extras.ts` — `EXTRAS_CONFIG` — use for human-readable extras labels in email
- `prestigo/lib/pricing.ts` — Rate tables (server-side) — not needed in Phase 5 (amount already in PaymentIntent)

### Established Patterns
- API routes use `NextResponse.json()` pattern — follow same error handling as `calculate-price`
- Env vars without `NEXT_PUBLIC_` prefix for server-side secrets — same pattern as `STRIPE_SECRET_KEY`
- Webhook uses `request.text()` (not `.json()`) for raw body — already correct, do not change

### Integration Points
- `prestigo/app/api/webhooks/stripe/route.ts` — Primary integration point; `paymentIntent.metadata` contains all serialized booking data
- `prestigo/app/api/submit-quote/route.ts` — Secondary integration point; `body` contains booking data from client
- New lib files to create: `prestigo/lib/supabase.ts` (Supabase client), `prestigo/lib/email.ts` (Resend send functions)

### Data Flow
- Stripe PaymentIntent metadata → deserialize → save to Supabase + send emails
- `paymentIntent.metadata.bookingReference` is the booking reference to match confirmation page

</code_context>

<specifics>
## Specific Ideas

- Emergency fallback email on Supabase failure: send raw booking JSON to manager so no booking is ever truly lost
- Quote flow: manager gets alert but client does NOT get a "confirmed" email (quote isn't paid yet — Roman follows up)
- From address `bookings@rideprestige.com` must be verified in Resend dashboard — plan should include a note about this pre-deployment step

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-backend-notifications*
*Context gathered: 2026-03-30*
