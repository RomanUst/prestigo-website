# Phase 64: Admin-Created Bookings with Payment Link - Research

**Researched:** 2026-08-21
**Domain:** Stripe Payment Links + webhook reconciliation on top of an existing admin-booking CRUD surface
**Confidence:** HIGH

## Summary

Phase 64 adds two genuinely new capabilities on top of an already-working admin-booking-creation
surface: (1) generating a **Stripe Payment Link** for an admin-created (or later-flagged) booking
and emailing/copying it, and (2) reconciling that link's payment into the **same existing `unpaid`
row** with no duplicate, via a **new webhook branch** for Stripe's `checkout.session.completed`
event. ANEW-01 and ANEW-05 are already implemented by `app/api/admin/bookings/route.ts` POST +
`ManualBookingForm.tsx`; this research focuses entirely on ANEW-02/03/04 — the payment-link
mechanism, its metadata-based keying, and the webhook side of reconciliation.

The core technical finding (resolving CONTEXT.md D-09): use the **Payment Link object**
(`stripe.paymentLinks.create`), not a server-created Checkout Session. A Checkout Session is
inherently a single, expiring, one-shot resource (default 24h, no built-in "reusable forever, resend
whenever" semantics) — using one would force exactly the expiry/regenerate machinery D-04
explicitly excludes. A Payment Link is a **stable, non-expiring URL** that can be opened and paid
any number of times (Stripe creates a fresh internal Checkout Session per visit, but the outward
URL never changes) — this is precisely "no expiry, one link per booking, reusable, re-sendable."
Metadata set on the Payment Link is copied to every Checkout Session it spawns, but **not**
automatically to the resulting PaymentIntent — this is the load-bearing fact for keying (see
Common Pitfalls). The webhook must listen for `checkout.session.completed`, resolve the booking
from `session.metadata.bookingId` (the bookings row UUID, not `booking_reference`), reconcile
`unpaid → confirmed`, persist the now-known `payment_intent_id`, and re-run the exact side-effect
suite Phase 62 already established (client email, manager alert, GA4 purchase, QStash reminder) —
sourced from the reconciled DB row, not from thin Payment Link metadata.

A new migration (**056**) is required: the `bookings` table has no column today to persist the
Payment Link's URL or its Stripe object id, and D-03/D-04/D-05 all require displaying, re-sending,
and later-attaching the **same** URL — which is only possible if it is persisted, since re-calling
`paymentLinks.create` would mint a second, different URL.

**Primary recommendation:** Use `stripe.paymentLinks.create()` with `metadata: { bookingId, leg,
linkedBookingId? }` (booking UUID keying, not `booking_reference`), add migration 056
(`payment_link_url`, `payment_link_id` on `bookings`), and add a `checkout.session.completed`
branch to the existing `app/api/webhooks/stripe/route.ts` that reuses
`reconcileBookingToConfirmed`'s pattern (new function keyed on `id`, not `payment_intent_id`) and
reuses the existing side-effect functions with data sourced from the reconciled row.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Booking creation form (trip/vehicle/client entry, "collect payment?" toggle) | Browser/Client | API/Backend | React form (`ManualBookingForm.tsx`) posts to the admin API; all pricing/state authority lives server-side |
| Price computation & tolerance gate | API/Backend | Database/Storage | Already server-authoritative (`getPricingConfig` + `computeOutboundLegTotal`) — Payment Link amount MUST reuse the same authoritative `amount_eur`, never a client-submitted figure |
| Payment Link generation (Stripe API call) | API/Backend | — | Server-side only — `STRIPE_SECRET_KEY` never touches the browser; mirrors `create-payment-intent`'s lazy-init pattern |
| Payment-link email send | API/Backend | — | `lib/email.ts` + `logEmail` dedup, same tier as all existing transactional email |
| Payment reconciliation (webhook) | API/Backend | Database/Storage | `app/api/webhooks/stripe/route.ts` — Stripe → server, never client-observable |
| Booking row persistence / status transitions | Database/Storage | API/Backend | Postgres `bookings` table via Supabase service client; `status` CHECK constraint + `VALID_TRANSITIONS` map enforce the state machine |
| Link URL display / copy / resend control | Browser/Client | API/Backend | Read-only render of the persisted `payment_link_url`; resend re-triggers the same server email path |

## Package Legitimacy Audit

No new package is required. Payment Links is a REST endpoint already exposed by the `stripe`
Node SDK already installed in this repo.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `stripe` | npm | 10+ yrs (official) | very high | github.com/stripe/stripe-node | OK | Already installed (`^21.0.1`); `paymentLinks` and `checkout.sessions` namespaces have existed in the SDK for years — no version bump needed for this phase |

`npm view stripe version` [VERIFIED: npm registry] → latest published is `22.5.0`; this repo's
pinned `^21.0.1` [VERIFIED: package.json:42] already exposes `stripe.paymentLinks.create()`.
`npm view stripe scripts.postinstall` [VERIFIED: npm registry] → empty (no postinstall script).

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Node SDK) | `^21.0.1` (installed) [VERIFIED: package.json:42] | Payment Link creation, webhook event parsing | Already the project's sole payment integration; no alternative library exists for this task |

### Supporting
No new supporting libraries. Reuses in-repo: `zod` (request validation), `@supabase/supabase-js`
(via `createSupabaseServiceClient`), `resend` (via `getResend()` in `lib/email.ts`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Payment Link object | Server-created Checkout Session (`stripe.checkout.sessions.create`) | Sessions expire (default 24h, max configurable up to 30 days via `expires_at`) and are meant to be single-use per customer visit — satisfying D-04's "no expiry, reusable, re-sendable forever" would require regenerate-on-expiry logic that D-04 explicitly rules out of scope. Rejected. |
| Payment Link `metadata` only | `payment_intent_data.metadata` only (skip session metadata) | `payment_intent_data.metadata` is NOT copied automatically to the Checkout Session, but session `metadata` (from the Payment Link) IS what `checkout.session.completed` exposes directly — session metadata is the only reliably-present key at the moment the webhook fires. Set BOTH (belt & suspenders) rather than PI-only. |
| Inline `price_data` per Payment Link | Pre-created `Price`/`Product` catalog objects | Each admin booking has a unique, dynamically-computed amount — a static Price catalog would require creating (and never reusing) one Price object per booking, adding API calls with no benefit. `price_data` inline (currency + `unit_amount` + `product_data.name`) is the documented pattern for one-off dynamic amounts. [CITED: docs.stripe.com/api/payment-link/create] |

**Installation:** none — `stripe` already a dependency.

**Version verification:** `npm view stripe version` → `22.5.0` published [VERIFIED: npm registry,
2026-08-21]. Repo pin `^21.0.1` is current and sufficient; no upgrade required for Payment Links
support (available since 2022 in the Stripe API).

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────┐
                     │  Admin UI (ManualBookingForm │
                     │  / BookingsTable row action) │
                     └───────────────┬─────────────┘
                                     │ POST /api/admin/bookings
                                     │   { ...trip, collect_payment: true }
                                     │ OR
                                     │ POST /api/admin/bookings/[id]/payment-link
                                     │   (D-05 attach-later)
                                     ▼
              ┌──────────────────────────────────────────────┐
              │  Admin API route (server, getAdminUser guard) │
              │  1. Recompute price server-side (existing)    │
              │  2. INSERT/verify booking row, status='unpaid'│
              │  3. stripe.paymentLinks.create({               │
              │       line_items:[{price_data:{...}}],         │
              │       metadata:{bookingId, leg, linkedBookingId?}│
              │       payment_intent_data:{metadata:{...}} })   │
              │  4. UPDATE bookings SET payment_link_url,      │
              │     payment_link_id                             │
              │  5. logEmail() dedup gate → sendPaymentRequestEmail │
              └───────────────────────┬────────────────────────┘
                                      │ returns { paymentLinkUrl }
                                      ▼
                         Operator copies URL / client receives email
                                      │
                                      ▼
                     ┌────────────────────────────────┐
                     │ Client opens Payment Link, pays  │
                     │ (Stripe-hosted Checkout Session)  │
                     └───────────────┬────────────────┘
                                     │ Stripe fires webhook
                                     ▼
        ┌───────────────────────────────────────────────────────┐
        │ POST /api/webhooks/stripe (existing endpoint, new branch)│
        │ event.type === 'checkout.session.completed'              │
        │  1. dedup-check stripe_processed_events (event.id)        │
        │  2. session = event.data.object                           │
        │  3. bookingId = session.metadata.bookingId                │
        │  4. reconcile: UPDATE bookings                            │
        │     SET status='confirmed', payment_intent_id=$pi          │
        │     WHERE id=$bookingId AND status='unpaid' RETURNING *   │
        │  5. if linkedBookingId present → reconcile that row too   │
        │     (same payment_intent_id, shared purchase)              │
        │  6. if newly reconciled (not already confirmed):          │
        │     sendClientConfirmation / sendManagerAlert /            │
        │     sendGa4Purchase / scheduleQStashReminder                │
        │     — data sourced from the reconciled DB row              │
        │  7. claim stripe_processed_events AFTER side effects       │
        └───────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/api/admin/bookings/
├── route.ts                     # extend POST: collect_payment + status choice (D-01/D-02)
├── [id]/payment-link/route.ts   # NEW — D-05 attach-later action (mirrors [id]/assign/route.ts)
app/api/webhooks/stripe/
└── route.ts                     # add `checkout.session.completed` branch (new function)
lib/
├── supabase.ts                  # add reconcileBookingByIdToConfirmed(id, paymentIntentId)
├── email.ts                     # add sendPaymentRequestEmail(booking, paymentLinkUrl)
├── stripe-payment-links.ts      # NEW — small helper: createBookingPaymentLink(booking)
supabase/migrations/
└── 056_bookings_payment_link.sql  # payment_link_url, payment_link_id nullable columns
components/admin/
├── ManualBookingForm.tsx        # add collect-payment toggle + status radio + link display
└── BookingsTable.tsx            # add row-level "Generate payment link" action (expanded row)
```

### Pattern 1: Payment Link creation with metadata keying (server-side)
**What:** Create a Payment Link with an inline dynamic price and booking-identifying metadata on
both the link and the resulting PaymentIntent.
**When to use:** On admin-booking save with "collect payment" checked (D-01/D-03), and on the
D-05 "Generate payment link" row action for an already-saved unpaid/pending booking.
**Example:**
```typescript
// Source: pattern derived from docs.stripe.com/api/payment-link/create (Context7,
// /websites/stripe) + this repo's existing lazy-init convention
// (app/api/create-payment-intent/route.ts:26-37, app/api/webhooks/stripe/route.ts:35-41)
const paymentLink = await getStripe().paymentLinks.create({
  line_items: [{
    price_data: {
      currency: 'eur',
      unit_amount: Math.round(booking.amount_eur * 100),
      product_data: { name: `PRESTIGO Transfer — ${booking.booking_reference}` },
    },
    quantity: 1,
  }],
  // Restrict to card only — avoids the delayed/async payment-method complexity
  // (checkout.session.async_payment_succeeded) that "auto" payment methods can trigger.
  payment_method_types: ['card'],
  // Auto-deactivate after the first successful payment — defense in depth on top of
  // webhook idempotency, not a substitute for it.
  restrictions: { completed_sessions: { limit: 1 } },
  metadata: {
    bookingId: booking.id,
    leg: booking.leg,
    ...(linkedBookingId ? { linkedBookingId } : {}),
  },
  // Session metadata is NOT copied to the resulting PaymentIntent automatically
  // (docs.stripe.com/metadata "Copy metadata to another object > Exceptions") —
  // set it explicitly here too so the PI/Charge also carry the booking id.
  payment_intent_data: {
    metadata: {
      bookingId: booking.id,
      leg: booking.leg,
      ...(linkedBookingId ? { linkedBookingId } : {}),
    },
  },
})
// paymentLink.url  — the stable, reusable URL (persist to bookings.payment_link_url)
// paymentLink.id   — 'plink_...' (persist to bookings.payment_link_id)
```

### Pattern 2: Webhook reconciliation by booking id, not payment_intent_id
**What:** A new `checkout.session.completed` branch, added to the existing webhook POST handler
(same file, same signature-verification code, same `stripe_processed_events` idempotency table —
`event_id` is generic across event types).
**When to use:** Only path that can flip an `unpaid` payment-link booking to `confirmed`.
**Example:**
```typescript
// Source: pattern extends app/api/webhooks/stripe/route.ts:95-157 (payment_intent.succeeded
// branch) — same file, same idempotency table, same side-effect-first/claim-after ordering
// (D-09 point 3). New branch, not a rewrite of the existing one.
if (event.type === 'checkout.session.completed') {
  const supabase = createSupabaseServiceClient()
  const { data: existing } = await supabase
    .from('stripe_processed_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true, duplicate: true })

  const session = event.data.object as Stripe.Checkout.Session
  const meta = (session.metadata ?? {}) as Record<string, string>
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

  // Stripe recommends this guard even on checkout.session.completed — delayed payment
  // methods can complete the SESSION before the PAYMENT clears. payment_method_types
  // restricted to ['card'] at creation time (Pattern 1) makes this effectively always
  // true, but keep the check as defense in depth.
  if (session.payment_status === 'paid' && meta.bookingId && paymentIntentId) {
    await handlePaymentLinkSucceeded(meta.bookingId, meta.linkedBookingId ?? null, paymentIntentId)
  }

  const { error: claimErr } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: event.id, event_type: event.type })
  if (claimErr && (claimErr as { code?: string }).code !== '23505') {
    console.error('[webhook] post-payment-link stripe_processed_events insert failed:', claimErr.message)
  }
  return NextResponse.json({ received: true })
}
```

### Pattern 3: Reconcile-by-id helper (parallels `reconcileBookingToConfirmed`)
**What:** New `lib/supabase.ts` function, same shape/contract as the existing `payment_intent_id`
-keyed reconciler, but keyed on the row's own primary key (the only value known at Payment
Link creation time — see Pitfall 1).
**Example:**
```typescript
// Source: mirrors reconcileBookingToConfirmed exactly (lib/supabase.ts:150-164) —
// same "empty array = already handled" contract, same withRetry() call-site pattern.
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
    .select('*') // full row — feeds BookingEmailData construction, avoids a 2nd SELECT
  if (error) throw new Error(`Supabase payment-link reconcile failed: ${error.message}`)
  return data ?? []
}
```

### Anti-Patterns to Avoid
- **Keying reconciliation on `payment_intent_id`:** it does not exist yet at Payment Link
  creation time — only after the client pays. Key on the bookings row `id` instead (available
  immediately, never null).
- **Re-calling `paymentLinks.create()` on "resend":** mints a second, different URL, violating
  D-04's "one link per booking, reusable." Resend must re-send the **persisted**
  `payment_link_url`, not regenerate.
- **Building the confirmation email from Payment Link metadata:** metadata is deliberately thin
  (`bookingId`/`leg` only — Stripe's 500-char/50-key metadata limits and the fact PII shouldn't
  round-trip through Stripe unnecessarily). Build `BookingEmailData` from the **reconciled DB
  row** (already a full `bookings` row after `.select('*')` in Pattern 3), exactly as
  `handleOneWaySucceeded` already builds it from PaymentIntent metadata — just a different source.
- **Trusting a client-submitted amount for the Payment Link:** the link amount must be
  `booking.amount_eur`, the server-recomputed/tolerance-checked value already established by the
  existing POST handler (`app/api/admin/bookings/route.ts:786-880`) — never a raw form value.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reusable, non-expiring, payable-many-times checkout URL | A custom "quote link" token system + a hand-rolled expiry/renewal flow | Stripe Payment Link object | Stripe already solved exactly this (static URL, dynamic internal sessions per open); reinventing it duplicates PCI-scope-sensitive logic for no benefit |
| Detecting a delayed/async payment method completing later | A polling job against Stripe | `payment_method_types: ['card']` restriction (v1 scope) + optional future `checkout.session.async_payment_succeeded` handler | Restricting to card sidesteps the async-completion state machine entirely for this phase; do not build a poller |
| Webhook idempotency | A new dedup table/scheme for this event type | Existing `stripe_processed_events` (event_id, event_type) — already generic across event types | Reuse: `charge.refunded` and `payment_intent.succeeded` already share this table; a third event type needs zero schema change |

**Key insight:** Every piece of "new" infrastructure this phase needs (idempotency claim table,
booking-status state machine, branded email shell, dedup-before-send gate) already exists from
Phases 27/40/62/63 — the entire job is wiring, not invention. The only genuinely new code is the
Payment Link creation call and one new webhook branch.

## Common Pitfalls

### Pitfall 1: Assuming session/PaymentIntent metadata is interchangeable
**What goes wrong:** Code reads `paymentIntent.metadata.bookingId` inside the new webhook branch
(copy-pasting the `payment_intent.succeeded` pattern) and gets `undefined`, because Payment Link
metadata is copied to the **Checkout Session** as a one-time snapshot, not automatically to the
PaymentIntent. [CITED: docs.stripe.com/metadata — "Copy metadata to another object > Exceptions":
"A PaymentIntent copies metadata to a Charge, and a Payment Link copies metadata to a Checkout
Session as one-time snapshots."]
**Why it happens:** The existing `payment_intent.succeeded` handler reads `event.data.object.metadata`
where `data.object` IS the PaymentIntent — habit carries over incorrectly to the new event type
where `data.object` is the **Checkout Session**.
**How to avoid:** In the `checkout.session.completed` branch, always read
`(event.data.object as Stripe.Checkout.Session).metadata`, and set `payment_intent_data.metadata`
explicitly at link-creation time only as a secondary convenience (Stripe Dashboard visibility),
never as the reconciliation source of truth.
**Warning signs:** `meta.bookingId` is `undefined` in production logs; reconciliation silently
no-ops (falls into "already handled" branch) even on a fresh payment.

### Pitfall 2: `pending → unpaid` is not a valid status transition today
**What goes wrong:** D-05 lets an operator attach a payment link to an existing **`pending`**
cash booking (one saved via D-02 with no link). If the plan flips that row's `status` to `unpaid`
so it lands in the Phase 62 recovery queue, the existing transition guard rejects it — `pending`'s
allowed targets are `['confirmed', 'cancelled']` only.
[VERIFIED: lib/booking-transitions.ts:11-20] — quoted verbatim:
```
export const VALID_TRANSITIONS: Record<string, string[]> = {
  unpaid:      ['confirmed', 'cancelled'],
  pending:     ['confirmed', 'cancelled'],
  confirmed:   ['assigned', 'completed', 'cancelled'],
  assigned:    ['en_route', 'cancelled', 'completed'],
  en_route:    ['on_location', 'cancelled', 'completed'],
  on_location: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
}
```
The identical map is duplicated (double-gated, by design — Phase 62's own established pattern)
in `app/api/admin/bookings/route.ts` via `import { VALID_TRANSITIONS } from '@/lib/booking-transitions'`
[VERIFIED: app/api/admin/bookings/route.ts:16].
**Why it happens:** The map was designed before D-05 existed; `pending` was only ever meant to
resolve forward to `confirmed`/`cancelled`.
**How to avoid:** This is an open design point for the planner (see Open Questions) — either (a)
add `pending: ['confirmed', 'cancelled', 'unpaid']` to **both** copies of the map (the
`[id]/payment-link` route does not need to go through the generic status-PATCH branch at all — it
can set status directly, bypassing `VALID_TRANSITIONS`, since it's a distinct dedicated endpoint,
same as `[id]/assign/route.ts` does not consult `VALID_TRANSITIONS` for its own state changes), or
(b) leave `status` as `pending`/`unpaid` unchanged when merely attaching a link, and instead make
the Phase 62 recovery queue filter on `payment_link_url IS NOT NULL AND status NOT IN
('confirmed','cancelled')` for these rows. Recommendation: (a) is simpler and keeps one queue
definition; if the payment-link route sets status directly (not via the generic PATCH), the
`VALID_TRANSITIONS` map does not even need touching for the API to function — only the **UI**
dropdown (`UI_TRANSITIONS`, same file) needs to visually reflect it if the operator manually flips
status later.
**Warning signs:** A 422 from the generic PATCH branch when a plan naively routes the D-05 action
through it instead of a dedicated endpoint.

### Pitfall 3: Round-trip is not reachable from the CREATE flow — only from D-05 attach-later
**What goes wrong:** A plan implements full round-trip payment-link support inside
`ManualBookingForm.tsx` / the POST handler, but `trip_type` there is constrained to
`['transfer', 'hourly', 'daily']` — round-trip is impossible to create through this form today.
[VERIFIED: app/api/admin/bookings/route.ts:719] — quoted verbatim:
```
const manualBookingSchema = z.object({
  trip_type:           z.enum(['transfer', 'hourly', 'daily']),
```
Round-trip bookings only exist in this codebase via the **public** booking flow's
`buildBookingRows` (two legs, one shared `payment_intent_id`) [VERIFIED: lib/supabase.ts:323-395],
captured `unpaid` by Phase 62 when a client abandons checkout before paying
[per 62-CONTEXT.md, cited].
**Why it happens:** D-09 point 4 ("handle both one-way and round-trip") reads as if it applies to
the create flow; it only actually applies to D-05 — an operator attaching a fresh payment link to
an **already-existing, Phase-62-captured** round-trip `unpaid` pair whose original PaymentIntent
was abandoned.
**How to avoid:** Scope round-trip handling to the D-05 `[id]/payment-link` route only: when
generating a link for a booking whose `leg` is `outbound` or `return`, query for a sibling row
sharing the SAME (stale, abandoned) `payment_intent_id` with `leg != <this row's leg> AND
status = 'unpaid'`; if found, include `linkedBookingId` in the new Payment Link's metadata so one
`checkout.session.completed` event can reconcile both legs. `linked_booking_id`
(the dedicated FK column) is never populated by any insert path in this codebase today
[VERIFIED via `grep -rn "linked_booking_id"` — only read-sites exist in `BookingsTable.tsx`, no
write-sites in `lib/supabase.ts` or any route] — do not rely on it; the real link between
round-trip legs is shared `payment_intent_id`.
**Warning signs:** A round-trip code path in `ManualBookingForm.tsx` that never activates because
the trip-type selector never offers `round_trip`.

### Pitfall 4: Forgetting the Stripe Dashboard webhook subscription
**What goes wrong:** Code is correct, but the live Stripe webhook endpoint's **event
subscription list** (configured in the Stripe Dashboard, not in code) was never updated to include
`checkout.session.completed` — the endpoint only forwards `payment_intent.succeeded` and
`charge.refunded` today (inferred from the two branches present in
`app/api/webhooks/stripe/route.ts`). Payments succeed in Stripe but the booking never reconciles,
silently, with no error anywhere in this codebase (the webhook is simply never invoked).
**Why it happens:** This configuration lives outside git — a classic "runtime state not visible
in a grep" trap.
**How to avoid:** Add `checkout.session.completed` to the endpoint's subscribed events in the
Stripe Dashboard (or via the Stripe CLI/API) as an explicit, called-out deployment step — this is
an operational task, not a code change, and must not be silently assumed.
**Warning signs:** A live test payment via a generated link never flips the booking to
`confirmed`, but `stripe_processed_events` shows no new rows and no errors are logged (because the
handler was simply never called).

### Pitfall 5: `logEmail` dedup window blocking a legitimate "resend"
**What goes wrong:** D-07 requires the "send again" control to bypass dedup by design (unlike the
initial send, which IS gated by `logEmail`'s 10-minute same-`booking_id`+`email_type`+`recipient`
window [VERIFIED: lib/email-log.ts:27-35]). If the resend code path is wired through the same
`logEmail()` call as the initial send, an operator clicking "resend" twice within 10 minutes of
the original creation gets silently swallowed with no error shown.
**Why it happens:** Copy-pasting the initial-send code path for the resend button without
noticing D-07's explicit carve-out.
**How to avoid:** Give the resend action its **own** code path that calls
`sendPaymentRequestEmail()` directly, skipping `logEmail()` entirely (or logging without gating on
its return value) — exactly as D-07 specifies.
**Warning signs:** Operator reports "I clicked resend and nothing happened" within minutes of
creating the booking.

## Code Examples

### Migration 056 — persist the Payment Link URL/id
```sql
-- Migration 056: bookings_payment_link
-- Phase 64 — Admin-Created Bookings with Payment Link (D-03/D-04/D-05/D-09)
--
-- Payment Links are STATIC, reusable URLs — re-calling paymentLinks.create() would mint a
-- second, different URL, violating D-04 ("one link per booking, reusable, re-sendable").
-- These columns are therefore required, not optional (D-09's "planner to decide" is resolved
-- here: yes, a column is needed).
--
-- Nullable — most bookings (cash/invoice, D-05/ANEW-05) never get a payment link.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_url text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_link_id text;
```
Source pattern: `ADD COLUMN IF NOT EXISTS` mirrors
`supabase/migrations/053_unpaid_booking_status.sql:32-33` [VERIFIED: file read this session].

### Branded payment-request email — CTA button pattern to reuse
```typescript
// Source: lib/email.ts:1336-1337 (buildDriverAssignmentHtml, verbatim) — the only
// existing single-CTA-button pattern in this codebase; sendPaymentRequestEmail's
// "Pay Now" button should follow this exact style (gold border, uppercase, letter-spacing).
<a href="${escapeHtml(data.acceptUrl)}" style="display: inline-block; border: 1px solid #BFA06A; color: #BFA06A; padding: 14px 28px; text-decoration: none; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; font-family: 'Inter', Arial, sans-serif; margin-right: 12px;">ACCEPT TRIP</a>
```
For the payment-request email, D-06 wants a single "Pay now" button (not an accept/decline pair)
linking to `booking.payment_link_url`, plus the existing booking-reference box + trip-summary
pattern already used by `buildStatusEmailHtml` [VERIFIED: lib/email.ts:1008] and the "TRIP
DETAILS" section pattern in `buildDriverAssignmentHtml` [VERIFIED: lib/email.ts:1298-1299,
quoted]: `<div style="font-size: 9px; ... color: #BFA06A; margin-bottom: 12px;">TRIP DETAILS</div>`.

### New admin route — `[id]/payment-link/route.ts` scaffold
```typescript
// Source: mirrors app/api/admin/bookings/[id]/assign/route.ts:1-44 (verbatim structure —
// enforceMaxBody -> getAdminUser guard -> await params -> zod parse -> service client)
import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { enforceMaxBody } from '@/lib/request-guards'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bodyCheck = enforceMaxBody(request, 5_000)
  if (bodyCheck) return bodyCheck

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: bookingId } = await params
  // ... fetch booking, guard status in ('unpaid','pending'), find sibling round-trip leg,
  // call createBookingPaymentLink(), persist url/id, logEmail + sendPaymentRequestEmail
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Checkout Session created per attempt (client_secret returned to a Stripe Elements form) | Payment Link (hosted, no client integration needed) | N/A — this repo already uses BOTH patterns for different flows: PaymentIntent+Elements for the public checkout (`create-payment-intent/route.ts`), Payment Link for this new admin-initiated flow | Payment Link requires zero new frontend payment code — Stripe hosts the entire pay page; only the admin panel needs new UI (display/copy/resend the URL) |

**Deprecated/outdated:** none — Payment Links and `checkout.session.completed` are current,
actively-documented Stripe API surface as of this research (Context7 `/websites/stripe`,
`docs.stripe.com/api/payment-link/create`, `docs.stripe.com/payment-links/create`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | EUR is the correct currency for the Payment Link's `unit_amount` (matching `bookings.amount_eur`, consistent with `create-payment-intent`'s EUR-first convention) rather than CZK | Pattern 1 / Code Examples | If the business actually wants CZK-denominated links for cash-paying operator flows, the amount source flips to `amount_czk` and currency to `'czk'` — low risk, single-line change, but should be confirmed with the user/planner since neither CONTEXT.md nor the codebase pins one currency for admin-created bookings specifically |
| A2 | The live Stripe webhook endpoint is NOT yet subscribed to `checkout.session.completed` (Pitfall 4) | Common Pitfalls | If it turns out the endpoint already subscribes to "all events" or was pre-configured broadly, this is a non-issue; if under-subscribed and unaddressed, payments silently never reconcile — cannot be verified without Stripe Dashboard access, flagged for a `checkpoint:human-verify` task |
| A3 | `restrictions.completed_sessions.limit: 1` (auto-deactivate link after first payment) is desirable and low-risk | Pattern 1 | This is Claude's Discretion territory (not in CONTEXT.md's locked decisions) — if the business wants a single Payment Link to be reusable by multiple different clients (unlikely for a per-booking link, but not explicitly forbidden), this setting would block that; recommend confirming with planner/user before locking in |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Should attaching a payment link to a `pending` booking flip its status to `unpaid`?**
   - What we know: D-01 fixes `status='unpaid'` for a link generated at CREATE time; D-05 is
     silent on whether attach-later changes status, and the current `VALID_TRANSITIONS` map has
     no `pending → unpaid` edge (Pitfall 2).
   - What's unclear: whether the Phase 62 recovery queue (filters on `status='unpaid'`) is
     expected to surface these late-attached-link bookings, or whether a `payment_link_url IS NOT
     NULL` filter should be added alongside it.
   - Recommendation: flip status to `unpaid` directly inside the dedicated `[id]/payment-link`
     route (bypassing the generic `VALID_TRANSITIONS`-gated PATCH branch entirely, same as
     `[id]/assign/route.ts` already does for its own state changes) — simplest, reuses the
     existing queue definition with zero UI changes. Confirm with the planner/user before locking.

2. **Currency for the Payment Link amount (EUR vs CZK)** — see Assumption A1. Recommend
   confirming with the user during planning; defaulting to EUR (matching the public checkout's
   primary currency) is the lower-risk default.

3. **Should the Payment Link auto-deactivate after one payment (`restrictions.completed_sessions.limit: 1`)?**
   — see Assumption A3. Not locked by CONTEXT.md; recommend the planner decide, defaulting to
   "yes" (defense in depth, does not conflict with any locked decision).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` npm package | Payment Link creation + webhook parsing | ✓ | `^21.0.1` [VERIFIED: package.json:42] | — |
| `STRIPE_SECRET_KEY` (live) | All Stripe API calls | Unknown in this sandbox — `.env.local`'s key is a dead test placeholder per project convention [per project memory: `project_stripe_local_key`] | — | Live Stripe actions (creating a real Payment Link end-to-end, verifying webhook delivery) must be run via a script the user executes locally with the live key, consistent with prior phases |
| Stripe Dashboard webhook event subscription | `checkout.session.completed` delivery | Cannot verify from this sandbox (Dashboard config, not code) — see Pitfall 4 / Assumption A2 | — | Flag as a `checkpoint:human-verify` task: confirm the endpoint subscribes to `checkout.session.completed` before considering ANEW-04 done |

**Missing dependencies with no fallback:** none — the code-side work is fully buildable and
testable with the Stripe test-mode SDK/mocks (as the existing `tests/webhooks-stripe.test.ts` and
`tests/admin-bookings.test.ts` already do for the neighboring flows).

**Missing dependencies with fallback:** live end-to-end Stripe verification (real Payment Link,
real webhook delivery) requires the user to run it locally with the live key, per established
project convention.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1` [VERIFIED: package.json:73] |
| Config file | `vitest.config.ts` [VERIFIED: file exists at repo root] |
| Quick run command | `npx vitest run tests/webhooks-stripe.test.ts tests/admin-bookings.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANEW-01 | Operator creates a booking manually | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (existing `describe('/api/admin/bookings')`) — extend with the collect-payment/status-choice cases |
| ANEW-02 | Save-time Payment Link generation | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — new `describe` block, mock `stripe.paymentLinks.create` |
| ANEW-03 | Payment-link email sent | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — assert `logEmail` + `sendPaymentRequestEmail` call, mirroring existing `sendBookingChangedEmail` assertion pattern [VERIFIED: tests/admin-bookings.test.ts:695-731 pattern, "Test 4/5/6"] |
| ANEW-04 | `checkout.session.completed` reconciles to paid, no duplicate | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ❌ Wave 0 — new `describe('checkout.session.completed webhook')` mirroring `describe('ABND-06/D-11: unpaid→confirmed reconciliation')` [VERIFIED: tests/webhooks-stripe.test.ts:385] |
| ANEW-05 | Save without a payment link (cash/invoice) | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ (existing coverage for `payment_intent_id: null` path) — extend with operator status-choice (D-02) cases |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/admin-bookings.test.ts tests/webhooks-stripe.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/admin-bookings.test.ts` — add `describe` block(s) covering: `collect_payment: true` →
      `status='unpaid'` + Payment Link mock called + `payment_link_url` persisted; operator status
      choice for no-link saves (D-02); the new `[id]/payment-link` route (D-05, new test file
      `tests/admin-bookings-payment-link.test.ts` likely cleaner than extending the existing file
      given its 900+ line size)
- [ ] `tests/webhooks-stripe.test.ts` — add `describe('checkout.session.completed')` covering:
      fresh reconciliation (unpaid → confirmed, `payment_intent_id` persisted, side effects fire
      once), duplicate delivery (already-confirmed row → no-op, no double email), round-trip
      `linkedBookingId` present → both legs reconcile, `payment_status !== 'paid'` → no-op
- [ ] Framework install: none — Vitest already configured and used by the exact two files this
      phase extends.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | `getAdminUser()` guard on every new/extended route, same as all existing admin routes [VERIFIED: app/api/admin/bookings/[id]/assign/route.ts:24-26, app/api/admin/bookings/route.ts:771-773] |
| V3 Session Management | no | Unchanged — admin auth session model is explicitly untouched per CONTEXT.md domain boundary |
| V4 Access Control | yes | Admin-only routes; no client-facing endpoint is added by this phase (the Payment Link itself is Stripe-hosted, not a route in this app) |
| V5 Input Validation | yes | `zod` schemas for all new request bodies (payment-link route params), server-side amount recompute reused unchanged, `NO_CRLF`-style guards on any new string fields touching email |
| V6 Cryptography | n/a | No new crypto — Stripe webhook signature verification (`stripe.webhooks.constructEvent`) is reused unchanged from the existing endpoint |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Forged webhook event (attacker POSTs a fake `checkout.session.completed` to flip a booking to confirmed without paying) | Spoofing / Tampering | Already mitigated — `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` verifies the signature before ANY branch executes [VERIFIED: app/api/webhooks/stripe/route.ts:51-58]; the new branch is inside the same guarded block, inherits the mitigation automatically |
| IDOR — operator A generates a payment link for a booking, arbitrary caller guesses the `[id]` and re-triggers link generation / resend | Tampering / Information Disclosure | `getAdminUser()` 401/403 guard on the new route (V2/V4 above) — no anonymous or cross-tenant access exists in this codebase's admin surface; consistent with `[id]/assign/route.ts`'s identical guard |
| Amount tampering (a compromised/hijacked admin session requests a Payment Link for less than the true fare) | Tampering | Reuse the EXISTING server-side recompute + `ADMIN_PRICE_TOLERANCE_CZK` divergence gate [VERIFIED: app/api/admin/bookings/route.ts:786-865] — the Payment Link amount must be built from `booking.amount_eur` (the already-authoritative, already-tolerance-checked value), never a fresh client-submitted figure at link-generation time |
| Double-reconciliation / duplicate booking row on webhook retry | Repudiation | `stripe_processed_events` claim table (event_id unique), status-gated `UPDATE ... WHERE status = 'unpaid'` (only flips once — a retry finds `status='confirmed'` already and the `WHERE` clause matches zero rows) — same pattern as `reconcileBookingToConfirmed`, reused verbatim in the new `reconcileBookingByIdToConfirmed` |

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/stripe` — `docs.stripe.com/api/payment-link/create` (Payment Link create
  params: `line_items`, `metadata`, `payment_intent_data`, `restrictions`, `payment_method_types`)
- Context7 `/websites/stripe` — `docs.stripe.com/metadata` ("Copy metadata to another object >
  Exceptions" — Payment Link → Checkout Session metadata copy semantics, PI → Charge copy)
- Context7 `/websites/stripe` — `docs.stripe.com/payments/momo/save-during-payment`
  (`checkout.session.completed` event shape, `payment_intent` field)
- Context7 `/websites/stripe` — `docs.stripe.com/payment-links/customize`
  (`restrictions.completed_sessions.limit`), `docs.stripe.com/no-code/payment-links`
  (`payment_method_types` restriction, delayed-method webhook dependency)
- `npm view stripe version` / `npm view stripe scripts.postinstall` — direct registry queries this session
- This repo, read in full this session: `app/api/webhooks/stripe/route.ts`, `lib/supabase.ts`,
  `app/api/admin/bookings/route.ts`, `lib/booking-transitions.ts`, `lib/email-log.ts`,
  `app/api/create-payment-intent/route.ts`, `supabase/migrations/053_unpaid_booking_status.sql`,
  `components/admin/StatusBadge.tsx`, `app/api/admin/bookings/[id]/assign/route.ts`,
  `types/database.types.ts` (bookings Row shape), `lib/email.ts` (StatusEmailBooking,
  buildStatusEmailHtml, buildChangeEmailHtml, buildDriverAssignmentHtml CTA pattern)

### Secondary (MEDIUM confidence)
- `.planning/phases/62-abandoned-unpaid-booking-capture/62-CONTEXT.md` — cited for round-trip
  capture background (not re-read in full this session; referenced via STATE.md's summary and
  CONTEXT.md's canonical_refs pointer)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single-library, already-installed, version-verified against the live npm registry
- Architecture: HIGH — every reused pattern (idempotency table, reconcile-in-place, side-effect-first-claim-after, dedup-before-send, admin route auth guard) was read directly from this repo's source this session, not inferred
- Pitfalls: HIGH for Pitfalls 1/2/3/5 (each grounded in a file read + verbatim quote this session); MEDIUM for Pitfall 4 (Stripe Dashboard config cannot be verified from this sandbox — correctly flagged as an assumption/checkpoint, not asserted as fact)

**Research date:** 2026-08-21
**Valid until:** 2026-09-20 (30 days — Stripe Payment Links API is stable; re-verify if Stripe
ships a metadata-propagation or Payment Link expiry behavior change before then)
