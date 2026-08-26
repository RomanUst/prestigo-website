# Phase 64: Admin-Created Bookings with Payment Link - Pattern Map

**Mapped:** 2026-08-22
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/migrations/056_bookings_payment_link.sql` | migration | CRUD | `supabase/migrations/053_unpaid_booking_status.sql` | exact |
| `lib/stripe-payment-links.ts` | service | request-response | `app/api/create-payment-intent/route.ts` (lazy Stripe init block) | role-match |
| `app/api/admin/bookings/route.ts` (POST, extend) | route/controller | CRUD | itself (existing POST, lines ~767-930) | exact (self-extend) |
| `app/api/admin/bookings/[id]/payment-link/route.ts` | route/controller | request-response | `app/api/admin/bookings/[id]/assign/route.ts` | exact |
| `app/api/webhooks/stripe/route.ts` (new branch, extend) | route/controller | event-driven | itself, `payment_intent.succeeded` branch (lines ~95-157) | exact (self-extend) |
| `lib/supabase.ts` — `reconcileBookingByIdToConfirmed` | service | CRUD | `reconcileBookingToConfirmed` (lines 150-164) | exact |
| `lib/email.ts` — `sendPaymentRequestEmail` + `buildPaymentRequestHtml` | service/template | request-response | `sendBookingChangedEmail` / `buildChangeEmailHtml` (~1231+) and `buildDriverAssignmentHtml` CTA (~1298-1340) | exact |
| `components/admin/ManualBookingForm.tsx` (extend) | component | request-response | itself (existing submit at line ~232) | exact (self-extend) |
| `components/admin/BookingsTable.tsx` (extend, "Generate payment link" row action) | component | request-response | existing expanded-row action blocks (e.g. driver assignment controls near line ~1998-2041) | role-match |

## Pattern Assignments

### `supabase/migrations/056_bookings_payment_link.sql` (migration, CRUD)

**Analog:** `supabase/migrations/053_unpaid_booking_status.sql` (and `055_booking_edit_audit_log.sql` for header-comment style)

**Header comment + additive-column pattern** (053, lines 1-16, 32-33):
```sql
-- Migration 053: unpaid_booking_status
-- Phase 62 — Abandoned & Unpaid Booking Capture (D-01/D-02/D-06)
--
-- Schema FILE only — live application against the remote Supabase project is
-- the [BLOCKING] task in Plan 62-04.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS attempt_id uuid;
```

**Apply directly** — new migration adds two nullable columns, no status-enum change needed (reuses `unpaid` from 053):
```sql
-- Migration 056: bookings_payment_link
-- Phase 64 — Admin-Created Bookings with Payment Link (D-03/D-04/D-05/D-09)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_url text;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_id text;
```
Follow the same "Schema FILE only — live application is a [BLOCKING] human-action task" comment convention used in every prior migration in this repo.

---

### `lib/stripe-payment-links.ts` (service, request-response)

**Analog:** lazy Stripe init in `app/api/create-payment-intent/route.ts` (lines 26-35) and `app/api/webhooks/stripe/route.ts` (lines 30-38)

**Lazy-init pattern** (create-payment-intent/route.ts, lines 26-35):
```typescript
// Lazy init — STRIPE_SECRET_KEY is Production-only; avoid module-load crash in Preview
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 0,
    })
  }
  return _stripe
}
```

**Core pattern — `createBookingPaymentLink`** (per RESEARCH.md Pattern 1, to implement in the new file):
```typescript
export async function createBookingPaymentLink(params: {
  bookingId: string
  bookingReference: string
  amountEur: number
  leg: 'outbound' | 'return' | null
  linkedBookingId?: string
}): Promise<{ url: string; id: string }> {
  const paymentLink = await getStripe().paymentLinks.create({
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(params.amountEur * 100),
        product_data: { name: `PRESTIGO Transfer — ${params.bookingReference}` },
      },
      quantity: 1,
    }],
    payment_method_types: ['card'],
    restrictions: { completed_sessions: { limit: 1 } },
    metadata: {
      bookingId: params.bookingId,
      leg: params.leg ?? '',
      ...(params.linkedBookingId ? { linkedBookingId: params.linkedBookingId } : {}),
    },
    payment_intent_data: {
      metadata: {
        bookingId: params.bookingId,
        leg: params.leg ?? '',
        ...(params.linkedBookingId ? { linkedBookingId: params.linkedBookingId } : {}),
      },
    },
  })
  return { url: paymentLink.url, id: paymentLink.id }
}
```
**Critical:** the amount MUST come from the already server-recomputed `booking.amount_eur` (see POST handler pattern below) — never a client-submitted figure.

---

### `app/api/admin/bookings/route.ts` — POST handler (controller, CRUD)

**Analog:** itself — existing recompute/insert flow (lines 767-930)

**Server-authoritative price recompute pattern to preserve unchanged** (lines ~786-865):
```typescript
let rates
try {
  rates = await getPricingConfig()
} catch (err) {
  console.error('[admin/bookings.POST] failed to load pricing config:', err)
  return NextResponse.json({ error: 'Pricing configuration unavailable' }, { status: 503 })
}
// ... trip-type guards ...
const computedTotalEur = outboundLegEur + extrasEur
const computedTotalCzk = eurToCzk(computedTotalEur)
const priceDiverges = Math.abs(computedTotalCzk - d.amount_czk) > ADMIN_PRICE_TOLERANCE_CZK
if (priceDiverges && !d.override_price) {
  return NextResponse.json({ error: 'Price mismatch — server recompute diverges from submitted amount', ... }, { status: 422 })
}
const authoritativeAmountCzk = priceDiverges ? d.amount_czk : computedTotalCzk
const amount_eur = priceDiverges ? czkToEur(d.amount_czk) : computedTotalEur
```

**Row-build + insert pattern to extend (D-01/D-02)** (lines 900-928, verbatim today):
```typescript
const row = {
  // ...existing fields...
  booking_reference:   bookingReference,
  booking_source:      'manual',
  booking_type:        'confirmed',
  payment_intent_id:   null,
  status:              'pending',      // ← replace: 'unpaid' if collect_payment, else d.status ?? 'confirmed' (D-01/D-02)
  amount_eur,
  user_id:             d.user_id ?? null,
  operator_notes:      priceDiverges ? `Price manually overridden by admin: ...` : null,
}

const supabase = createSupabaseServiceClient()
const { data, error: dbError } = await supabase
  .from('bookings')
  .insert([row])
  .select()
  .single()

if (dbError) return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })

return NextResponse.json({ booking: data }, { status: 201 })
```
Extend: after insert, if `d.collect_payment === true`, call `createBookingPaymentLink({ bookingId: data.id, bookingReference, amountEur: amount_eur, leg: null })`, `UPDATE bookings SET payment_link_url, payment_link_id WHERE id = data.id`, then `logEmail` + `sendPaymentRequestEmail` (see email pattern below), and return `{ booking, paymentLinkUrl }`.

---

### `app/api/admin/bookings/[id]/payment-link/route.ts` (controller, request-response)

**Analog:** `app/api/admin/bookings/[id]/assign/route.ts` (full file, 1-50+)

**Full scaffold to copy** (assign/route.ts, lines 1-44, verbatim structure):
```typescript
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'
import { logEmail } from '@/lib/email-log'
import { sendDriverAssignmentEmail } from '@/lib/email'   // → replace with sendPaymentRequestEmail
import { VALID_TRANSITIONS } from '@/lib/booking-transitions'  // not needed if status set directly (see Pitfall 2)

const assignSchema = z.object({ driver_id: z.string().uuid() })  // → replace with empty/void body schema or { resend?: boolean }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bodyCheck = enforceMaxBody(request, 50_000)
  if (bodyCheck) return bodyCheck

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: bookingId } = await params
  // ... fetch booking, guard status in ('unpaid','pending'), find sibling round-trip leg
  // by shared (stale) payment_intent_id, call createBookingPaymentLink(), persist
  // payment_link_url/payment_link_id + set status='unpaid' directly (bypass VALID_TRANSITIONS,
  // same as this file does not consult it for driver_id updates), logEmail + send.
}
```
**Note:** per RESEARCH.md Pitfall 2, this dedicated route sets `status` directly (like `assign/route.ts` sets driver fields directly) — it does NOT need to touch `VALID_TRANSITIONS` for the API to function.

---

### `app/api/webhooks/stripe/route.ts` — new `checkout.session.completed` branch (controller, event-driven)

**Analog:** itself — `payment_intent.succeeded` branch (lines 95-157) for idempotency + ordering; `handleOneWaySucceeded`/`handleRoundTripSucceeded` for side-effect suite

**Idempotency + side-effect-first-claim-after pattern to replicate exactly** (lines 95-119, verbatim):
```typescript
if (event.type === 'payment_intent.succeeded') {
  // SEC-10: booking is saved FIRST, stripe_processed_events is written AFTER.
  {
    const supabase = createSupabaseServiceClient()
    const { data: existing } = await supabase
      .from('stripe_processed_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle()
    if (existing) return NextResponse.json({ received: true, duplicate: true })
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent
  const meta = (paymentIntent.metadata ?? {}) as Record<string, string>
  // ... branch to one-way/round-trip handler ...

  // Mark event processed AFTER booking confirmed saved (SEC-10).
  {
    const supabase = createSupabaseServiceClient()
    const { error: claimErr } = await supabase
      .from('stripe_processed_events')
      .insert({ event_id: event.id, event_type: event.type })
    if (claimErr) {
      const code = (claimErr as { code?: string }).code
      if (code !== '23505') console.error('[webhook] post-save stripe_processed_events insert failed:', claimErr.message)
    }
  }
  return NextResponse.json({ received: true })
}
```

**New branch to add (per RESEARCH.md Pattern 2)** — same file, new `if (event.type === 'checkout.session.completed')` block reading `session.metadata.bookingId` (NOT `paymentIntent.metadata` — see Pitfall 1), calling `reconcileBookingByIdToConfirmed`, then firing the SAME confirmation side-effect suite (`sendClientConfirmation`, `sendManagerAlert`, `sendGa4Purchase`, `scheduleQStashReminder`) sourced from the reconciled DB row — mirroring how `handleOneWaySucceeded` builds `BookingEmailData` today, just with the DB row as the data source instead of PaymentIntent metadata.

**Existing imports block to extend** (lines 1-23):
```typescript
import { NextResponse, after } from 'next/server'
import Stripe from 'stripe'
import {
  saveBooking, withRetry, buildBookingRow, buildBookingRows, saveRoundTripBookings,
  reconcileBookingToConfirmed, reconcileRoundTripToConfirmed,
  createSupabaseServiceClient,               // add: reconcileBookingByIdToConfirmed
} from '@/lib/supabase'
import {
  sendClientConfirmation, sendManagerAlert, sendEmergencyAlert,
  sendRoundTripClientConfirmation, sendRoundTripManagerAlert,
} from '@/lib/email'
```

---

### `lib/supabase.ts` — `reconcileBookingByIdToConfirmed` (service, CRUD)

**Analog:** `reconcileBookingToConfirmed` (lines 150-164, verbatim below) — mirror exactly but key on `id` + return the full row

```typescript
export async function reconcileBookingToConfirmed(
  paymentIntentId: string,
  leg: 'outbound' | 'return'
): Promise<{ id: string }[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('payment_intent_id', paymentIntentId)
    .eq('leg', leg)
    .eq('status', 'unpaid')
    .select('id')
  if (error) throw new Error(`Supabase reconcile failed: ${error.message}`)
  return data ?? []
}
```

**New function to add** (per RESEARCH.md Pattern 3 — the exact planned implementation, matches this repo's contract):
```typescript
export async function reconcileBookingByIdToConfirmed(
  bookingId: string,
  paymentIntentId: string
): Promise<Record<string, unknown>[]> {
  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', payment_intent_id: paymentIntentId })
    .eq('id', bookingId)
    .eq('status', 'unpaid')
    .select('*')
  if (error) throw new Error(`Supabase payment-link reconcile failed: ${error.message}`)
  return data ?? []
}
```
Same "empty array = already handled" contract as `reconcileBookingToConfirmed`/`reconcileRoundTripToConfirmed` (lines 273-287).

---

### `lib/email.ts` — `sendPaymentRequestEmail` (service/template, request-response)

**Analog:** `sendBookingChangedEmail` (send wrapper) + `buildDriverAssignmentHtml` (CTA button + TRIP DETAILS section)

**Send-wrapper pattern to copy** (`sendBookingChangedEmail`, verbatim):
```typescript
export async function sendBookingChangedEmail(booking: StatusEmailBooking, changes: BookingChangeEntry[]): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'PRESTIGO Bookings <bookings@rideprestigo.com>',
      to: [booking.client_email],
      subject: `Your booking ${escapeHtml(booking.booking_reference)} was updated — Prestigo`,
      html: buildChangeEmailHtml(booking, changes),
    })
    if (error) console.error('[booking-notify] changed email error:', error)
  } catch (err) {
    console.error('[booking-notify] changed email failed:', err)
  }
}
```
For `sendPaymentRequestEmail`, follow the identical try/catch + `getResend().emails.send()` shape, subject e.g. `` `Complete your payment for ${bookingReference} — Prestigo` ``.

**Single-CTA button pattern to reuse** (`buildDriverAssignmentHtml`, "ACCEPT TRIP" button, verbatim):
```typescript
<a href="${escapeHtml(data.acceptUrl)}" style="display: inline-block; border: 1px solid #BFA06A; color: #BFA06A; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Inter', Arial, sans-serif; margin-right: 12px;">ACCEPT TRIP</a>
```
Use this exact style (gold border, uppercase, letter-spacing) for a single "PAY NOW" button linking to `payment_link_url` — no decline/second button (unlike the driver-assignment accept/decline pair).

**TRIP DETAILS section header pattern** (verbatim, reuse for trip summary + amount due):
```typescript
<div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #BFA06A; margin-bottom: 12px;">TRIP DETAILS</div>
```

**Booking reference box pattern** (verbatim, reuse):
```typescript
<div style="background-color: #17293B; border-left: 3px solid #BFA06A; padding: 24px; margin: 0 32px 24px;">
  <div style="font-size: 9px; font-weight: 400; letter-spacing: 3px; text-transform: uppercase; color: #BFA06A; margin-bottom: 8px;">BOOKING REFERENCE</div>
  <div style="font-size: 22px; font-weight: 600; color: #BFA06A;">${escapeHtml(data.bookingReference)}</div>
</div>
```

**Dedup gate to call before Resend** (`lib/email-log.ts`, `logEmail`, lines 20-40, verbatim):
```typescript
export async function logEmail(params: {
  bookingId: string | null
  emailType: string
  recipient: string
}): Promise<boolean> {
  const supabase = createSupabaseServiceClient()
  const { data: existing } = await supabase
    .from('email_log')
    .select('id')
    .eq('booking_id', params.bookingId)
    .eq('email_type', params.emailType)
    .eq('recipient', params.recipient)
    .gte('sent_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(1)
  if (existing && existing.length > 0) return false
  // ... write row BEFORE Resend call ...
}
```
Per D-07: gate the **initial** send with `logEmail({ emailType: 'payment_request', ... })`; the "send again"/resend action must call `sendPaymentRequestEmail()` directly, bypassing `logEmail` (own code path — do not reuse the initial-send branch, per RESEARCH.md Pitfall 5).

---

### `components/admin/ManualBookingForm.tsx` (component, request-response)

**Analog:** itself — existing submit call (line ~232)

Add: a "Collect payment now?" toggle (drives `collect_payment: boolean` in the POST body) and, when off, a status radio (`confirmed` default / `pending`, per D-02). On success, if `paymentLinkUrl` is returned, render it with copy-to-clipboard + a "Send again" button that POSTs to a resend action (reuse the same `[id]/payment-link` route or a dedicated resend flag).

---

### `components/admin/BookingsTable.tsx` (component, request-response)

**Analog:** existing expanded-row action controls (driver assignment fields, e.g. lines ~1998-2041) and `StatusBadge` usage (lines 1126-1127, 1455-1456, 1942-1943)

Add a "Generate payment link" button in the expanded row for bookings with `status IN ('unpaid','pending')` and no existing `payment_link_url`; when a link exists, show URL + copy + resend instead of the generate button. POST to `/api/admin/bookings/[id]/payment-link`. Reuse the existing `StatusBadge` variant casting pattern (`variant={booking.status as 'unpaid' | 'pending' | 'confirmed' | ...}`) unchanged — no new status values are introduced.

---

## Shared Patterns

### Admin auth guard
**Source:** `app/api/admin/bookings/[id]/assign/route.ts` lines 24-26 (and every other admin route)
**Apply to:** `[id]/payment-link/route.ts`, extended POST in `app/api/admin/bookings/route.ts`
```typescript
const { error } = await getAdminUser()
if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

### Webhook idempotency (side-effect FIRST, claim AFTER)
**Source:** `app/api/webhooks/stripe/route.ts` lines 95-157
**Apply to:** new `checkout.session.completed` branch — reuse `stripe_processed_events` table verbatim (generic across event types, already shared by `charge.refunded` and `payment_intent.succeeded`).

### Reconcile-in-place, never duplicate
**Source:** `lib/supabase.ts` `reconcileBookingToConfirmed`/`reconcileRoundTripToConfirmed` — `UPDATE ... WHERE status = 'unpaid'`, empty result array = already handled.
**Apply to:** new `reconcileBookingByIdToConfirmed`.

### Email dedup-before-send
**Source:** `lib/email-log.ts` `logEmail` (10-minute window keyed on booking_id + email_type + recipient)
**Apply to:** `sendPaymentRequestEmail` initial send only — NOT the explicit resend action (D-07).

### Server-authoritative amount
**Source:** `app/api/admin/bookings/route.ts` lines 786-880 (`ADMIN_PRICE_TOLERANCE_CZK` gate, `override_price`)
**Apply to:** Payment Link `unit_amount` MUST derive from `booking.amount_eur` (the already-recomputed/tolerance-checked value) — never a fresh client-submitted figure at link-generation time.

## No Analog Found

None — every new file has a direct or role-match analog already in the codebase (this phase is described in RESEARCH.md as "wiring, not invention").

## Metadata

**Analog search scope:** `app/api/admin/bookings/`, `app/api/webhooks/stripe/`, `app/api/create-payment-intent/`, `lib/supabase.ts`, `lib/email.ts`, `lib/email-log.ts`, `components/admin/ManualBookingForm.tsx`, `components/admin/BookingsTable.tsx`, `supabase/migrations/`
**Files scanned:** 9 (read directly this session)
**Pattern extraction date:** 2026-08-22
