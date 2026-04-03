# Phase 20: Manual Booking + Cancellation with Refund - Research

**Researched:** 2026-04-03
**Domain:** Next.js API routes, Supabase, Stripe Refunds API, Admin UI (React, TanStack Table)
**Confidence:** HIGH

---

## Summary

Phase 20 adds two capabilities to the admin: (1) creating a manual booking for phone orders, and (2) cancelling any booking with a conditional Stripe refund. Both capabilities touch the existing `/api/admin/bookings` route and `BookingsTable` component.

The database schema is already fully prepared by Phase 18: `payment_intent_id` is nullable (manual bookings have no Stripe ref), `booking_source` has a CHECK constraint for `'online'|'manual'`, and `status` supports `'cancelled'`. No new migrations are needed. The Stripe SDK (`stripe@^21.0.1`) already installed supports `stripe.refunds.create({ payment_intent: id })` for a full refund. The existing webhook handler in `/api/webhooks/stripe/route.ts` handles `payment_intent.succeeded` but does NOT currently handle `charge.refunded` — that gap must be addressed so Stripe-Dashboard-initiated refunds also update local status.

The plan has two natural work packages: (A) new `POST /api/admin/bookings` route + ManualBookingForm UI, and (B) new `DELETE /api/admin/bookings` (or `POST /api/admin/bookings/cancel`) route + confirmation modal in BookingsTable.

**Primary recommendation:** Add a POST handler to the existing `/api/admin/bookings` route file for manual booking creation, a separate cancel endpoint (e.g., `/api/admin/bookings/cancel`), and extend BookingsTable with a "New Booking" button and a cancel-with-optional-refund confirmation modal. Add `charge.refunded` webhook handling to the existing Stripe webhook route.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BOOKINGS-06 | Operator can create a manual booking via an admin form (trip type, date/time, pickup/dropoff, vehicle class, passenger details, price); saved with `booking_source: 'manual'` and no Stripe payment reference | POST endpoint + ManualBookingForm. Schema already supports it (nullable `payment_intent_id`, `booking_source` CHECK constraint). |
| BOOKINGS-08 | Operator can cancel a booking with optional full Stripe refund; Stripe-paid bookings show confirmation modal before refund; manual bookings show "Cancel" only; already-cancelled/completed bookings blocked by server | Cancel endpoint calling `stripe.refunds.create({ payment_intent })`, conditioned on `booking.payment_intent_id`. Server-side FSM blocks terminal states. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | `^21.0.1` (installed, pin per STATE.md blocker) | Full Stripe refund via `stripe.refunds.create()` | Already in use; v22 breaking changes — stay on v21 |
| `@supabase/supabase-js` | `^2.101.0` (installed) | DB read/write for booking creation and status update | Already in use throughout project |
| `zod` | `^4.3.6` (installed) | Input validation for POST/cancel payloads | Already in use for all API route schemas |
| `react-hook-form` | `^7.72.0` (installed) | Manual booking form state management | Already in use in booking wizard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | `^1.6.0` (installed) | Modal close/confirm icons | For confirmation modal UI |

### No New Installations Required
All required libraries are already installed. This phase introduces no new npm dependencies.

---

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
prestigo/
├── app/api/admin/bookings/
│   └── route.ts               # Add POST handler here (existing file)
├── app/api/admin/bookings/cancel/
│   └── route.ts               # New: POST cancel + optional refund
├── app/api/webhooks/stripe/
│   └── route.ts               # Extend: add charge.refunded handler
└── components/admin/
    ├── BookingsTable.tsx       # Extend: cancel button + confirmation modal
    └── ManualBookingForm.tsx   # New: manual booking creation form modal
```

### Pattern 1: POST /api/admin/bookings — Manual Booking Creation

**What:** New POST handler on the existing route file. Validates required fields with Zod, generates a booking reference (`PRG-YYYYMMDD-XXXX` pattern matches existing `generateBookingReference` in create-payment-intent), inserts with `booking_source: 'manual'`, `payment_intent_id: null`, `status: 'pending'`.

**Key constraint:** All existing columns in the bookings table have NOT NULL constraints except nullable ones. The POST handler must supply all required fields. Fields specific to Stripe-paid bookings (`payment_intent_id`) are simply omitted (null).

**Booking reference generation:** Reuse the same `PRG-YYYYMMDD-XXXX` pattern from `app/api/create-payment-intent/route.ts`. Extract into `lib/booking-reference.ts` or duplicate inline.

```typescript
// Source: existing app/api/admin/bookings/route.ts pattern + lib/supabase.ts
export async function POST(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = manualBookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  const bookingReference = generateBookingReference()
  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('bookings')
    .insert([{
      booking_reference: bookingReference,
      booking_source: 'manual',
      payment_intent_id: null,
      status: 'pending',
      booking_type: 'confirmed',  // manual bookings are confirmed by operator
      ...parsed.data,
    }])
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  return NextResponse.json({ booking: data }, { status: 201 })
}
```

### Pattern 2: POST /api/admin/bookings/cancel — Cancel with Optional Refund

**What:** Dedicated cancel endpoint. Reads the booking, checks it's not already cancelled/completed (FSM enforcement), sets status to `'cancelled'`, and if `payment_intent_id` is present, calls `stripe.refunds.create({ payment_intent: booking.payment_intent_id })`.

**Why a separate route (not extending PATCH):** The cancel+refund action is a side-effectful operation (Stripe API call). Keeping it separate makes the existing PATCH route (pure DB) simpler to reason about and test independently.

```typescript
// Source: Stripe API reference docs.stripe.com/api/refunds/create
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  const { error } = await getAdminUser()
  // ... auth checks

  const { id } = await request.json()
  // Zod: z.object({ id: z.string().uuid() })

  const supabase = createSupabaseServiceClient()

  // Fetch booking
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, payment_intent_id')
    .eq('id', id)
    .single()

  if (fetchErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // FSM guard: only pending/confirmed can be cancelled
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return NextResponse.json(
      { error: `Cannot cancel a booking with status '${booking.status}'` },
      { status: 422 }
    )
  }

  // Stripe refund if Stripe-paid
  let refundId: string | null = null
  if (booking.payment_intent_id) {
    try {
      const refund = await stripe.refunds.create({ payment_intent: booking.payment_intent_id })
      refundId = refund.id
    } catch (stripeErr) {
      const msg = stripeErr instanceof Error ? stripeErr.message : 'Stripe refund failed'
      return NextResponse.json({ error: `Stripe refund failed: ${msg}` }, { status: 502 })
    }
  }

  // Update DB status
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true, refund_id: refundId })
}
```

### Pattern 3: charge.refunded Webhook Handler (STATE.md blocker)

**What:** When an operator refunds via the Stripe Dashboard (not via admin), the `charge.refunded` event fires. Without a handler, the local booking status stays incorrect. Per STATE.md: "Design deduplication logic (idempotent UPSERT) before coding Phase 20."

**Implementation:** Extend the existing `app/api/webhooks/stripe/route.ts` with a second `if` branch for `charge.refunded`. Use `payment_intent` from the charge object to look up and update the local booking. This is idempotent: updating `status = 'cancelled'` on an already-cancelled row is a no-op.

```typescript
// Source: Stripe event types docs.stripe.com/api/events/types
if (event.type === 'charge.refunded') {
  const charge = event.data.object as Stripe.Charge
  if (charge.payment_intent && charge.refunded) {
    // Full refund detected — update local status
    const supabase = createSupabaseServiceClient()
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('payment_intent_id', charge.payment_intent as string)
    // Non-fatal: log error but don't fail webhook response
  }
}
```

**Idempotency note:** No deduplication table needed here. The Stripe event has a unique `event.id`. The status update is idempotent (updating `'cancelled'` to `'cancelled'` is safe). If deduplication is needed in the future, a processed_stripe_events table can be added, but it is not needed for this case.

### Pattern 4: ManualBookingForm UI Component

**What:** A modal form rendered as an overlay (no routing). Triggered by a "New Booking" button on the bookings page. On submit, calls `POST /api/admin/bookings`, then calls `fetchBookings()` to refresh the table.

**Form fields required by the bookings table schema:**
- `trip_type` (select: transfer/hourly/daily)
- `pickup_date` (date input)
- `pickup_time` (time input)
- `origin_address` (text)
- `destination_address` (text, optional for hourly/daily)
- `vehicle_class` (select: business/first_class/business_van)
- `passengers` (number)
- `luggage` (number)
- `amount_czk` (number — operator enters manually for phone orders)
- `client_first_name` (text)
- `client_last_name` (text)
- `client_email` (text)
- `client_phone` (text)
- Optional: `hours`, `return_date`, `flight_number`, `terminal`, `special_requests`

**UI conventions (from STYLEGUIDE + existing admin components):**
- Inline styles with CSS custom properties (`var(--anthracite)`, `var(--copper)`, etc.)
- Montserrat body font, Cormorant Garamond for headings
- Same input style as BookingsTable date filters: `background: var(--anthracite)`, `border: 1px solid var(--anthracite-light)`, `borderRadius: 2px`
- Modal overlay: `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.6)`, centered card

### Pattern 5: Cancel Confirmation Modal

**What:** Inline modal shown when operator clicks "Cancel" in the expanded booking row. Two variants:
- **Stripe-paid booking** (`payment_intent_id` not null): Shows warning about refund, two buttons: "Confirm Cancel + Refund" and "Keep Booking"
- **Manual booking** (`payment_intent_id` null): Shows "Cancel Booking" only, no refund language

**Placement:** Modal state managed inside BookingsTable (or as a separate CancellationModal component). A `pendingCancel: Booking | null` state variable triggers the modal.

```typescript
// Source: existing BookingsTable.tsx pattern for alert() for status errors
const [pendingCancel, setPendingCancel] = useState<Booking | null>(null)

const handleCancel = useCallback(async (booking: Booking) => {
  const res = await fetch('/api/admin/bookings/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: booking.id }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Unknown error' }))
    alert(data.error ?? 'Cancel failed')
    return
  }
  // Optimistic update: same pattern as handleStatusChange
  setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
  setPendingCancel(null)
}, [])
```

### Anti-Patterns to Avoid

- **Reusing PATCH for cancel+refund:** The existing PATCH route is pure DB. Side-effectful Stripe calls belong in a dedicated endpoint where error handling and rollback semantics are explicit.
- **Trusting client-sent `booking_source` or `payment_intent_id`:** The cancel endpoint must read these from DB, not from request body, to prevent spoofing.
- **Calling stripe.refunds.create without checking payment_intent_id first:** Server must gate on DB-read `payment_intent_id`, not on client-sent field.
- **Not handling Stripe errors before updating DB:** If the refund fails, the booking must NOT be marked cancelled. Stripe call must succeed first.
- **Skipping the `charge.refunded` webhook:** Without it, Stripe-Dashboard refunds leave local status stale. STATE.md explicitly flagged this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full Stripe refund | Custom charge query + refund logic | `stripe.refunds.create({ payment_intent })` | Stripe SDK handles idempotency keys, network retries, partial vs full detection |
| Booking reference generation | New UUID/random logic | Reuse `generateBookingReference()` from `create-payment-intent/route.ts` | Ensures consistent `PRG-YYYYMMDD-XXXX` format; extract to shared lib |
| Form validation | Manual field checks | `zod` schema on server, `react-hook-form` on client | Already used throughout; catches edge cases (empty strings, invalid dates) |
| FSM enforcement | UI-only guards | Server-side FSM check in cancel endpoint | UI can be bypassed; server is the single source of truth (same pattern as PATCH route) |

---

## Common Pitfalls

### Pitfall 1: Stripe Refund Before DB Update — Partial Failure
**What goes wrong:** Stripe refund succeeds but DB update fails. Customer gets money back but booking shows "confirmed" in admin.
**Why it happens:** Two independent I/O calls with no transaction.
**How to avoid:** Call Stripe first, then update DB. If DB fails after successful Stripe refund, log the orphaned refund ID prominently (return error to UI but also log `refundId`). Phase 20 scope is full refund only — partial rollback (un-refunding) is not possible, so logging is the correct recovery path.
**Warning signs:** 502 in cancel endpoint followed by booking still showing "confirmed".

### Pitfall 2: Cancelling Already-Refunded Stripe Payment Intent
**What goes wrong:** Calling `stripe.refunds.create` on a PI that was already fully refunded throws a Stripe error (`charge_already_refunded`).
**Why it happens:** Operator may have manually refunded via Stripe Dashboard before Phase 20's webhook handler was added, or a race condition.
**How to avoid:** Server-side FSM already blocks cancel on `status='cancelled'` bookings. The webhook handler for `charge.refunded` updates local status when Stripe Dashboard refund occurs. After Phase 20 ships with the webhook handler, the two systems stay in sync. Wrap `stripe.refunds.create` in try/catch and return 502 with Stripe's error message.
**Warning signs:** Stripe error code `charge_already_refunded`.

### Pitfall 3: Manual Booking Missing NOT NULL Fields
**What goes wrong:** Supabase insert fails with constraint violation because the POST handler omits a NOT NULL column.
**Why it happens:** The bookings table has many NOT NULL columns (see `0001_create_bookings.sql`). Manual bookings lack Stripe metadata like `amount_eur`.
**How to avoid:** The Zod schema for POST must require all NOT NULL fields. The `amount_eur` field can be derived from `amount_czk` using the existing `czkToEur()` function in `lib/currency.ts`. `booking_type` must be set (use `'confirmed'`).
**Warning signs:** Supabase error "null value in column X violates not-null constraint".

### Pitfall 4: `booking_source` Not Included in Booking Interface
**What goes wrong:** BookingsTable's `Booking` TypeScript interface doesn't include `booking_source`, so the cancel modal can't conditionally show/hide refund language.
**Why it happens:** `booking_source` was added in Phase 18 migration but may not be in the frontend interface.
**How to avoid:** Add `booking_source: 'online' | 'manual'` to the `Booking` interface in `BookingsTable.tsx`. The GET endpoint already returns `select('*')` so the field is already in the response.
**Warning signs:** TypeScript error on `booking.booking_source` access.

### Pitfall 5: Stripe SDK v22 Breaking Changes
**What goes wrong:** Installing or upgrading to Stripe v22 breaks the existing API.
**Why it happens:** STATE.md explicitly notes "Stripe v22.0.0: Released 2026-04-03 with breaking changes."
**How to avoid:** Stay pinned to `stripe@^21.0.1` as documented in STATE.md. Do not run `npm update stripe` during this phase.
**Warning signs:** `stripe` in package.json shows `^22` after npm install.

---

## Code Examples

### Creating a Full Stripe Refund
```typescript
// Source: https://docs.stripe.com/api/refunds/create?lang=node
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const refund = await stripe.refunds.create({
  payment_intent: 'pi_xxxxx',
  // No amount = full refund
})
// refund.id is the refund reference for logging
```

### Zod Schema for Manual Booking POST
```typescript
// Source: existing pattern from bookingPatchSchema in app/api/admin/bookings/route.ts
import { z } from 'zod'
import { czkToEur } from '@/lib/currency'

const manualBookingSchema = z.object({
  trip_type:           z.enum(['transfer', 'hourly', 'daily']),
  pickup_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_time:         z.string().regex(/^\d{2}:\d{2}$/),
  origin_address:      z.string().min(1).max(500),
  destination_address: z.string().max(500).optional(),
  vehicle_class:       z.enum(['business', 'first_class', 'business_van']),
  passengers:          z.number().int().min(1).max(20),
  luggage:             z.number().int().min(0).max(20),
  amount_czk:          z.number().int().positive(),
  client_first_name:   z.string().min(1).max(100),
  client_last_name:    z.string().min(1).max(100),
  client_email:        z.string().email(),
  client_phone:        z.string().min(1).max(50),
  // Optional
  hours:               z.number().int().min(1).max(24).optional(),
  return_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flight_number:       z.string().max(20).optional(),
  terminal:            z.string().max(20).optional(),
  special_requests:    z.string().max(1000).optional(),
})
```

### Booking Reference Generator (extract to shared lib)
```typescript
// Source: existing app/api/create-payment-intent/route.ts
function generateBookingReference(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(Math.floor(Math.random() * 9000) + 1000)
  return `PRG-${datePart}-${suffix}`
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `charge.id` for refunds | `payment_intent` for refunds | Stripe ~2020 | Use PI ID, not charge ID — PI is the canonical identifier in this codebase |
| Stripe v22 | Stay on v21.0.1 | 2026-04-03 | Breaking changes in v22 — do not upgrade during v1.3 |

**Deprecated/outdated:**
- Refunding via `charge_id`: Old pattern. This project uses `payment_intent_id` as the canonical reference. Use `stripe.refunds.create({ payment_intent: id })`.

---

## Open Questions

1. **`charge.refunded` webhook: does it fire for admin-initiated refunds too?**
   - What we know: Stripe fires `charge.refunded` for any refund, including those made via API.
   - What's unclear: If the admin calls `stripe.refunds.create` AND the webhook fires, the DB could receive two "set cancelled" updates. This is idempotent so safe, but worth confirming.
   - Recommendation: Accept the duplicate (idempotent no-op). No deduplication table needed.

2. **Should the manual booking form use `react-hook-form` or plain controlled inputs?**
   - What we know: `react-hook-form` is installed and used in the booking wizard. The admin components (BookingsTable notes textarea, status select) currently use plain controlled state.
   - What's unclear: No established admin form pattern exists yet.
   - Recommendation: Plain controlled state consistent with existing admin component patterns, validated server-side with Zod. `react-hook-form` adds complexity without clear benefit for a single-page admin modal form.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.1 |
| Config file | `prestigo/vitest.config.ts` |
| Quick run command | `cd prestigo && npx vitest run tests/admin-bookings.test.ts` |
| Full suite command | `cd prestigo && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOKINGS-06 | POST /api/admin/bookings creates row with `booking_source: 'manual'`, no `payment_intent_id` | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend existing file) |
| BOOKINGS-06 | POST returns 400 for missing required fields | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend) |
| BOOKINGS-06 | POST returns 401/403 for unauthenticated/non-admin | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (extend) |
| BOOKINGS-08 | Cancel endpoint sets status='cancelled' for manual booking (no Stripe call) | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — new test file or extend |
| BOOKINGS-08 | Cancel endpoint calls `stripe.refunds.create` for Stripe-paid booking | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 |
| BOOKINGS-08 | Cancel endpoint returns 422 for already-cancelled/completed booking | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 |
| BOOKINGS-08 | Cancel endpoint returns 502 if Stripe refund throws | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 |
| BOOKINGS-08 | `charge.refunded` webhook handler updates booking status to 'cancelled' | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ❌ Wave 0 — extend existing |

### Sampling Rate
- **Per task commit:** `cd prestigo && npx vitest run tests/admin-bookings.test.ts`
- **Per wave merge:** `cd prestigo && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/admin-bookings-cancel.test.ts` — covers BOOKINGS-08 cancel endpoint (or extend `admin-bookings.test.ts`)
- [ ] Stripe mock for `stripe.refunds.create` in test setup — needed for cancel tests
- [ ] Extend `tests/webhooks-stripe.test.ts` — add `charge.refunded` test case

---

## Sources

### Primary (HIGH confidence)
- Stripe API reference — `https://docs.stripe.com/api/refunds/create?lang=node` — verified `stripe.refunds.create({ payment_intent })` signature and behavior
- Existing codebase — `app/api/admin/bookings/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/supabase.ts`, `supabase/migrations/018_v13_schema_foundation.sql` — authoritative ground truth for current patterns

### Secondary (MEDIUM confidence)
- `https://docs.stripe.com/api/events/types` — `charge.refunded` event type confirmed in Stripe docs
- Stripe changelog `https://docs.stripe.com/changelog/acacia/2024-10-28/refund-webhook-update` — refund webhook consistency update (Oct 2024)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified as installed in package.json; no new deps needed
- Architecture: HIGH — grounded entirely in existing codebase patterns
- Pitfalls: HIGH — derived from actual code examination (nullable fields, FSM, Stripe version pin) and official Stripe error documentation
- Validation: HIGH — existing test framework confirmed with vitest.config.ts; test file exists

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable — Stripe v21 API is stable; only risk is Stripe v22 upgrade which is deferred)
