# Phase 63: Admin Booking Editing + Change Notification - Research

**Researched:** 2026-08-20
**Domain:** Next.js 16 App Router admin CRUD (server-authoritative pricing recompute) + transactional email diffing + Postgres audit log, on top of an existing Prestigo admin bookings surface (`BookingsTable.tsx` / `app/api/admin/bookings/route.ts`).
**Confidence:** HIGH — every canonical file/symbol named in 63-CONTEXT.md was opened and read this session; all code excerpts below are `[VERIFIED: <path>:<lines>]` with verbatim quotes. No new external library is introduced; this phase composes existing in-repo patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Edit **inline in the existing expandable row** of `components/admin/BookingsTable.tsx` — the same surface that already inline-edits operator notes and driver price. No separate edit page, no wizard modal. All trip fields (pickup date/time, vehicle class, route origin/destination, passenger/contact, flight number) become editable **simultaneously** in one edit mode. — Reversibility: costly.
- **D-02:** **Per-field save granularity.** Each editable field has its own save control, rather than one global "Save all" or silent autosave. Cheap fields (name, email, phone, flight number, pickup date/time) commit directly. **Price-affecting fields (vehicle class, route) — their save control opens a price-review step (D-06) before the change is persisted; the fare is never changed silently.**
- **D-03:** On a vehicle or route change, the server **recomputes** the fare from `pricing_config` — reuse the exact recompute path already built for the manual-booking POST in `app/api/admin/bookings/route.ts`: `computeOutboundLegTotal` (`lib/server-pricing.ts`) + `computeExtrasTotal` (`lib/extras.ts`) + `getPricingConfig` (`lib/pricing-config.ts`) + `dateDiffDays` (`lib/pricing.ts`). Never trust a client-supplied amount.
- **D-04:** Operator can **override** the recomputed amount with an arbitrary value — reuse the `override_price` + `ADMIN_PRICE_TOLERANCE_CZK` tolerance pattern already in the POST handler. Authoritative amount = recompute unless override.
- **D-05:** **The admin always decides about any additional collection.** Phase 63 only **records** the new amount — no automatic top-up, no auto-charge, no payment link. Price differences on paid bookings are collected manually / out of system.
- **D-06:** Price-review step (triggered by saving a price-affecting field): show `old → new` amount, a field to adjust/override the amount, the "notify client" toggle, and a confirm action. Applies uniformly regardless of booking status. — Reversibility: reversible.
- **D-07:** Email shows **only the changed fields, old → new** (not all trip details). A price change appears as `old → new` amount in the same email.
- **D-08:** **Two-level send control:** (1) a per-save **"notify client" toggle**, AND (2) a **global flag** in `pricing_globals.notification_flags` (e.g. `booking_changed`) — if the global flag is off, no change email is sent even when the toggle is on. Dedup via `logEmail` before Resend.
- **D-09:** New branded email template ("your booking was updated") built in the style of the existing status emails in `lib/email.ts` (`sendStatusConfirmedEmail` etc. as the pattern). Sending unpaid-booking change emails is allowed and governed by the same toggle+flag.
- **D-10:** **Persist an audit record for every edit** — per changed field: `old → new` value, which operator, timestamp, whether a notification email was sent. This audit store is the single source of truth for both the change email (D-07) and the history UI (D-11). — Reversibility: one-way, requires a new migration (next sequential number — verified below as **055**).
- **D-11:** **Change-history UI is in scope** ("Variant B"). Assumed placement: a "История изменений / Change history" block inside the same expanded booking row. Planner may refine placement/layout. This is the previously-deferred FOLLOW-02 — REQUIREMENTS.md must move FOLLOW-02 from v2-deferred into Phase 63.
- **D-12:** **Every edit — including passenger/contact fields — applies strictly to the current leg's row only.** No propagation to the linked leg. Legs are separate `bookings` rows sharing `payment_intent_id`, keyed by `leg` ('outbound' | 'return'); editing operates per-row by `id`, so leg isolation is architecturally free.

### Claude's Discretion

- **Editability by status:** editing `cancelled` / `completed` bookings is likely read-only or restricted; active statuses (`unpaid`, `pending`, `confirmed`, `assigned`, `en_route`, `on_location`) are the edit targets. Planner to decide the exact editable-status set. **Resolved below — see "Editable-Status Set."**
- **GNet-sourced bookings:** whether trip-detail edits push to GNet — guard by `booking_source === 'gnet'`, mirroring the existing status-push pattern. Planner to decide whether a push is needed or edits are local-only. **Resolved below — see "GNet Push Decision."**
- **Route → distance recompute:** a route edit changes `distance_km`, which `computeOutboundLegTotal` needs. The edit UI must recompute distance from the new addresses before recomputing the fare. **Resolved below — see "Distance/Geocode Helper" (the single highest-value finding).**
- Exact email micro-copy, history-block styling, `notification_flags` key name — left to planner/discuss-phase.

### Deferred Ideas (OUT OF SCOPE)

- **Top-up payment link for a price difference** — when an edit raises the price of a paid booking, generate + email a Stripe payment link for the difference and auto-reconcile it. Belongs with **Phase 64**.
- **Automatic collection / re-charge of price differences** — out of scope for both 63 and 64 (auto); admin collects manually.
- Editing bookings by the client themselves (self-service).
- Payment methods beyond Stripe; saved cards.
- Changing the guest-checkout or admin-auth session model.
- Refunds / partial refunds through the admin.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AEDIT-01 | Operator can edit a booking's pickup date and time from the admin booking detail view | `BookingsTable.tsx` expanded row + extend `bookingPatchSchema` in `app/api/admin/bookings/route.ts`; cheap-field direct-commit pattern already exists for `operator_notes`/`driver_price_czk`. |
| AEDIT-02 | Operator can change a booking's vehicle class from the admin | Vehicle class is price-affecting → routes through the D-06 price-review step; recompute via `computeOutboundLegTotal` with existing `distance_km` (or newly recomputed one if route also changed). |
| AEDIT-03 | Operator can edit a booking's route (origin/destination addresses) from the admin | Route is price-affecting AND distance-affecting → client-side `AddressInput` (Google Places) + `/api/calculate-price` round-trip to get fresh `distanceKm`, then price-review step. See "Distance/Geocode Helper" below. |
| AEDIT-04 | Operator can edit passenger/contact details and flight number from the admin | Cheap fields — direct per-field commit, same UX as `operator_notes`. Reuse `NO_CRLF` regex + email/phone validation from `manualBookingSchema`. |
| AEDIT-05 | On saving an edit, operator can choose (via "notify client" toggle) to send a branded old→new email | New `sendBookingChangedEmail()` in `lib/email.ts`, gated by `notification_flags.booking_changed` + per-save toggle, `logEmail` dedup, `after()` fire-and-forget — mirrors the PATCH handler's existing status-email block verbatim. |
| AEDIT-06 | Editing one leg of a round-trip booking updates only that leg; the linked leg is unaffected | Architecturally free — all operations are scoped by `bookings.id` (a single row), never by `payment_intent_id`. Verified in `lib/supabase.ts`. |
| AEDIT-07 | When a route or vehicle change affects the price, operator can review and adjust the amount before saving | D-06 price-review step + D-04 override pattern, directly modeled on the POST handler's `override_price` / `ADMIN_PRICE_TOLERANCE_CZK` block. |
</phase_requirements>

## Summary

Phase 63 is a **pure composition phase** — every mechanism it needs (server-side price recompute with override, `notification_flags` + `logEmail` + `after()` notification gating, branded-email HTML pattern, per-leg row model, admin auth guard, zod input validation) already exists in the codebase and is exercised today by the POST (manual-booking-create) and PATCH (status-change) handlers in `app/api/admin/bookings/route.ts`, and by the inline-edit UX already shipped in `components/admin/BookingsTable.tsx` for `operator_notes` and `driver_price_czk`. No new npm package is required.

The one piece that does **not** pre-exist as a reusable function is a distance/geocode helper — there is no `computeDistance()`-style library call. Distance is obtained by a **client-side round trip**: the admin UI collects lat/lng via the `AddressInput` Google Places Autocomplete component, then `POST`s to `/api/calculate-price`, which computes `distanceKm` server-side via a **Google Routes API** call (`https://routes.googleapis.com/directions/v2:computeRoutes`) and returns it in the JSON response. The existing `ManualBookingForm.tsx` already does exactly this (`handleCalculatePrice` → sets `distanceKm` in local state → includes it as `distance_km` in the booking payload). The edit flow for AEDIT-03 must replicate this exact round trip, not a synchronous library call.

**Primary recommendation:** Extend the existing `PATCH /api/admin/bookings` handler (not a new route) with an expanded zod schema covering all trip/passenger fields plus `notify_client`, `override_price`, and an operator-supplied `amount_czk`. For price-affecting fields, the client first calls `/api/calculate-price` (exactly as `ManualBookingForm` does) to get a fresh `distanceKm` + preview price, then submits the edit through the same recompute+tolerance+override logic already proven in the POST handler. Every accepted field change writes one row to a new `booking_edit_audit_log` table (migration **055**, DROP+RECREATE convention) and, if the toggle+flag both allow it, fires a new `sendBookingChangedEmail()` built on the `StatusEmailBooking`/`buildStatusEmailHtml` pattern in `lib/email.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inline edit UI (fields, save buttons, price-review step, history block) | Browser / Client (`BookingsTable.tsx`, React state) | — | D-01 locks this to the existing client component; no SSR concern. |
| Address autocomplete + place → lat/lng | Browser / Client (`AddressInput.tsx`, Google Maps JS `places` library) | — | Already client-only; loads `@googlemaps/js-api-loader` lazily, billed per session token. |
| Distance calculation (Google Routes API) | API / Backend (`/api/calculate-price`) | — | Google Maps server key (`GOOGLE_MAPS_API_KEY`) is never exposed to the client; only `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Places, restricted) is client-side. |
| Price recompute + override decision | API / Backend (`PATCH /api/admin/bookings`) | — | Server-authoritative pricing is a project-wide constraint (PROJECT.md) — never trust a client amount. |
| Audit log write | API / Backend → Database | Database / Storage | Written inside the same PATCH request that applies the field change (transactional intent, not a queued job). |
| Change-history read (history UI) | API / Backend (new GET, or embed in existing GET) | Browser / Client (render) | Simplest: extend `admin_search_bookings` response or add a small dedicated `GET /api/admin/bookings/[id]/audit-log`. |
| Change-notification email | API / Backend (`after()` fire-and-forget, `lib/email.ts` + Resend) | — | Matches existing status-email dispatch tier exactly. |
| GNet sync of trip-detail edits | None (out of scope this phase) | — | No GNet API exists in `lib/gnet-client.ts` for anything but status pushes — see "GNet Push Decision." |

## Standard Stack

### Core (already installed — no new packages)

| Library | Version (from `package.json`) | Purpose | Why Standard (in this repo) |
|---------|---------|---------|--------------|
| `zod` | `^4.3.6` `[VERIFIED: package.json:46]` | Validate/whitelist the expanded PATCH payload | Already the schema library for `bookingPatchSchema` and `manualBookingSchema` in `app/api/admin/bookings/route.ts:38-56,302-345`. |
| `@supabase/supabase-js` | `^2.101.0` `[VERIFIED: package.json:24]` | DB reads/writes (bookings, new audit table, `pricing_globals`) | Existing service-role client `createSupabaseServiceClient()` (`lib/supabase.ts:4-16`). |
| `resend` | `^6.9.4` `[VERIFIED: package.json:41]` | Send the new change-notification email | Existing `getResend()` wrapper in `lib/email.ts:18-29`. |
| `@tanstack/react-table` | `^8.21.3` `[VERIFIED: package.json:25]` | Expandable-row table (`BookingsTable.tsx`) | Already powers the row/expand model this phase edits into. |
| `@googlemaps/js-api-loader` | `^2.0.2` `[VERIFIED: package.json:16]` | Places Autocomplete for route-address editing | Already used by `AddressInput.tsx:5,15-21`; the edit form should reuse this component directly, not the `AddressInputNew` variant (see Pitfall 6). |
| `next` | `^16.2.3` `[VERIFIED: package.json:33]` | App Router `after()` for fire-and-forget email/log side-effects | Already imported as `import { NextResponse, after } from 'next/server'` (`route.ts:3`). |

### Alternatives Considered

None — every capability needed already has a proven in-repo implementation; introducing an alternative library (e.g. a dedicated geocoding SDK, a diffing library) would duplicate existing, working logic and violate the project's "reuse the exact recompute path" locked decision (D-03).

**Installation:** None required — this phase adds zero new dependencies.

## Package Legitimacy Audit

**Not applicable — this phase installs no new external packages.** All libraries used are already present in `package.json` and already exercised by the exact code paths this phase extends (`app/api/admin/bookings/route.ts`, `lib/email.ts`, `lib/server-pricing.ts`). No `npm view` / registry check is needed because nothing new is added to `node_modules`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Browser (BookingsTable.tsx expanded row) ───────────────────────────┐
│                                                                                                   │
│  Cheap field edit (name/email/phone/flight/date/time)                                            │
│    input onChange → local state → onBlur/Save → PATCH /api/admin/bookings { id, field }  ─────┐  │
│                                                                                                 │  │
│  Price-affecting field edit (vehicle_class / origin / destination)                             │  │
│    AddressInput (Google Places JS) → PlaceResult{address,placeId,lat,lng}                      │  │
│         │                                                                                       │  │
│         ▼                                                                                       │  │
│    POST /api/calculate-price {origin,destination,tripType,...} ──────► [Google Routes API]      │  │
│         │  ◄── { prices, distanceKm } ─────────────────────────────────────────────────────────┘  │
│         ▼                                                                                          │
│    Price-review modal/step (D-06): shows old→new amount, override input, notify-client toggle      │
│         │ Confirm                                                                                   │
│         ▼                                                                                           │
│    PATCH /api/admin/bookings { id, vehicle_class?, origin_address?, distance_km?, amount_czk?,      │
│                                  override_price?, notify_client }                                   │
└────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌───────────────────────── PATCH /api/admin/bookings (app/api/admin/bookings/route.ts) ───────────┐
│ 1. getAdminUser() — 401/403 guard (existing)                                                     │
│ 2. zod-parse expanded bookingPatchSchema (existing pattern, extended fields)                     │
│ 3. Fetch current row: supabase.from('bookings').select('*').eq('id', id).single()   (existing)   │
│ 4. If status change requested → VALID_TRANSITIONS gate (existing, unchanged)                     │
│ 5. If a price-affecting field is present:                                                        │
│      rates = getPricingConfig()                                                                  │
│      computedTotalEur = computeOutboundLegTotal(...) + computeExtrasTotal(...)   (existing fns)  │
│      computedTotalCzk = eurToCzk(computedTotalEur)                                               │
│      diverges = |computedTotalCzk - submittedAmountCzk| > ADMIN_PRICE_TOLERANCE_CZK              │
│      if diverges && !override_price → 422 (forces the price-review round trip)                   │
│ 6. Diff current row vs incoming fields → build audit rows (one per changed field)                │
│ 7. supabase.from('bookings').update(payload).eq('id', id)                                        │
│ 8. supabase.from('booking_edit_audit_log').insert(auditRows)         (NEW — migration 055)       │
│ 9. If notify_client && notification_flags.booking_changed !== false:                             │
│      shouldSend = await logEmail({ bookingId, emailType:'booking_changed', recipient })          │
│      if shouldSend: after(() => sendBookingChangedEmail(current, auditRows).catch(...))   (NEW)  │
│10. If booking_source === 'gnet' → NO push for trip-detail fields (local-only, see below)         │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (files touched/added — no new directories)

```
app/api/admin/bookings/route.ts        # extend PATCH schema + handler (primary work surface)
components/admin/BookingsTable.tsx     # extend expanded row: field edit mode, price-review step, history block
components/admin/BookingChangeHistory.tsx   # NEW — small component, reads audit rows for a booking (D-11)
lib/email.ts                            # add sendBookingChangedEmail() + buildChangeEmailHtml()
supabase/migrations/055_booking_edit_audit_log.sql   # NEW migration (verified next number)
```

### Pattern 1: Cheap-field per-row commit (already shipped — reuse verbatim)

**What:** Local state map keyed by `booking.id`, debounced or blur-flushed PATCH call, three-state save indicator (`idle | saving | saved | error`).
**When to use:** AEDIT-01 (pickup date/time) and AEDIT-04 (passenger/contact/flight) — none of these affect price.
**Example (existing, to be mirrored for new fields):**
```typescript
// Source: components/admin/BookingsTable.tsx:185-220 [VERIFIED]
const flushNotes = useCallback(async (bookingId: string, value: string) => {
  setNotesSaving(prev => ({ ...prev, [bookingId]: 'saving' }))
  try {
    await patchBooking({ id: bookingId, operator_notes: value })
    setNotesSaving(prev => ({ ...prev, [bookingId]: 'saved' }))
    setTimeout(() => {
      setNotesSaving(prev => prev[bookingId] === 'saved' ? { ...prev, [bookingId]: 'idle' } : prev)
    }, 2000)
  } catch {
    setNotesSaving(prev => ({ ...prev, [bookingId]: 'error' }))
  }
}, [patchBooking])
```

### Pattern 2: Price-affecting field → recompute + tolerance + override (existing POST handler — port to PATCH)

**What:** Server never trusts a submitted amount. It recomputes from `pricing_config`, and only accepts the client amount if the operator explicitly opted into `override_price`.
**When to use:** AEDIT-02 (vehicle class), AEDIT-03 (route), AEDIT-07 (review/adjust).
**Example:**
```typescript
// Source: app/api/admin/bookings/route.ts:404-463 (POST handler) [VERIFIED]
const days = d.return_date ? dateDiffDays(d.pickup_date, d.return_date) : 1
const outboundLegEur = computeOutboundLegTotal(
  d.vehicle_class, d.distance_km ?? null, d.hours ?? 2, days, d.trip_type,
  d.pickup_date, d.pickup_time, d.is_airport ?? false, rates,
)
const extrasEur = computeExtrasTotal({ /* ... */ }, { /* ... */ })
const computedTotalEur = outboundLegEur + extrasEur
const computedTotalCzk = eurToCzk(computedTotalEur)
const priceDiverges = Math.abs(computedTotalCzk - d.amount_czk) > ADMIN_PRICE_TOLERANCE_CZK
if (priceDiverges && !d.override_price) {
  return NextResponse.json(
    { error: 'Price mismatch — server recompute diverges from submitted amount',
      submittedCzk: d.amount_czk, computedCzk: computedTotalCzk },
    { status: 422 }
  )
}
const authoritativeAmountCzk = priceDiverges ? d.amount_czk : computedTotalCzk
```
`ADMIN_PRICE_TOLERANCE_CZK = 2` `[VERIFIED: app/api/admin/bookings/route.ts:348]`. Reuse this constant unchanged — do not redefine a second tolerance for the edit path.

### Pattern 3: Distance/geocode round trip (the highest-value finding — see below)

Documented in its own section because it is not a single function call.

### Pattern 4: Status-email gating → mirror for change-notification email

**What:** `notification_flags` (JSONB on `pricing_globals`) read, `logEmail` dedup-before-send, `after()` fire-and-forget.
**Example:**
```typescript
// Source: app/api/admin/bookings/route.ts:166-211 (PATCH handler, existing status-email block) [VERIFIED]
const { data: flagsRow } = await supabase
  .from('pricing_globals')
  .select('notification_flags')
  .eq('id', 1)
  .single()
const flags = flagsRow?.notification_flags as Record<string, boolean> | null
const isEnabled = !flags || flags[flagKey] !== false   // null/missing flags row = all-enabled
if (flagKey && isEnabled) {
  const shouldSend = await logEmail({
    bookingId: current.id,
    emailType: `booking_${parsed.data.status}`,
    recipient: current.client_email,
  })
  if (shouldSend) {
    after(() => sendStatusConfirmedEmail(current).catch(err =>
      console.error('[booking-notify] confirmed:', err)
    ))
  }
}
```
For D-08/D-09, the mirrored key is `notification_flags.booking_changed` (or whatever exact key the planner picks — CONTEXT.md explicitly defers the key name to planner), `emailType: 'booking_changed'`, and the send is additionally gated by the per-save `notify_client` boolean from the request body (the toggle), which this existing status-email flow does **not** have (status emails have no per-save toggle) — that AND-gate (`toggle && flag`) is the one new piece of logic, not present verbatim anywhere else in the codebase.

### Pattern 5: Branded email HTML — `StatusEmailBooking` shape to extend, not the confirmation-email shape

**What:** `lib/email.ts` has a smaller, purpose-built `StatusEmailBooking` interface (not the full `BookingEmailData`) used by the three status emails.
```typescript
// Source: lib/email.ts:993-1006 [VERIFIED]
interface StatusEmailBooking {
  id: string
  booking_reference: string
  origin_address: string
  destination_address: string | null
  pickup_date: string
  pickup_time: string
  vehicle_class: string
  client_first_name: string
  client_last_name: string
  client_email: string
  amount_czk: number
  special_requests?: string | null
}
```
`buildStatusEmailHtml(booking: StatusEmailBooking, heading: string, closingLine: string): string` (`lib/email.ts:1008`) builds the shared shell (logo, booking-reference box, journey table, closing line, support footer). **This function cannot be reused directly for D-07** because D-07 requires an **old→new diff table**, not a journey snapshot — the journey table in `buildStatusEmailHtml` shows only current values. Build a **new** `buildChangeEmailHtml(booking, changes: { field: string; label: string; oldValue: string; newValue: string }[])` that reuses the same shell chrome (logo, colors `#0F1D2C`/`#BFA06A`/`#F3EEE3`, `escapeHtml`, `formatPickupDate`, `formatCZK`/`formatEUR`) but renders a diff table instead of a snapshot table — same visual language, different content shape.

### Anti-Patterns to Avoid

- **Trusting client-supplied `distance_km` without a price-level check:** the codebase's existing pattern (POST handler) does not independently re-verify `distance_km` server-side — it only tolerance-checks the resulting *price*. Replicate this exactly (per D-03's "reuse the exact recompute path") rather than inventing new server-side geocoding validation, which would be scope creep beyond AEDIT-07.
- **Reusing `AddressInputNew` instead of `AddressInput`:** the admin `ManualBookingForm.tsx` imports the legacy `AddressInput` directly with no feature flag `[VERIFIED: components/admin/ManualBookingForm.tsx:4]`, while the public booking widget selects between `AddressInputNew`/`AddressInputLegacy` via `NEXT_PUBLIC_USE_NEW_PLACES_API` `[VERIFIED: components/booking/BookingWidget.tsx:106]`. The admin edit surface should follow the admin precedent (`AddressInput`), not introduce the flag-toggle machinery that only the public booking flow uses.
- **Building a second price-tolerance constant:** reuse `ADMIN_PRICE_TOLERANCE_CZK` from the POST handler (import it, or promote it to a shared constants file if PATCH and POST need to both reference it — do not redefine `= 2` a second time).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Driving distance between two addresses | A custom haversine/as-the-crow-flies estimate, or a new geocoding SDK integration | The existing `/api/calculate-price` → Google Routes API round trip | This is the actual pricing-grade distance already used for every other price calculation in the app (bookings, quotes, manual bookings) — a different distance source would silently disagree with the confirmed booking's original price basis. |
| Price computation for a new vehicle/route | Inline arithmetic in the PATCH handler | `computeOutboundLegTotal` + `computeExtrasTotal` + `getPricingConfig` + `dateDiffDays` (all in `lib/server-pricing.ts` / `lib/pricing-config.ts` / `lib/pricing.ts`) | These functions already encode night/holiday coefficients, airport fee, min-fare clamping (`applyGlobals`) — reimplementing any of this risks drifting from `/api/calculate-price`'s behavior, which is a documented regression class in this codebase (see `server-pricing.ts:108-111` comments about byte-for-byte parity requirements). |
| Email dedup / idempotency | A new "have I sent this" check | `logEmail()` (`lib/email-log.ts`) — 10-minute dedup window keyed on `(bookingId, emailType, recipient)` | Already the project's single notification-dedup mechanism; a bespoke check would fragment dedup logic across two implementations. |
| Admin auth guard | A new session/role check | `getAdminUser()` (`lib/supabase/server.ts:4-10`) — checks `user.app_metadata.is_admin` | Single source of truth for "is this an admin" across every admin route. |

**Key insight:** This phase has almost no genuinely new logic to write — the risk is not "what library to pick" but "faithfully porting three already-correct code blocks (recompute+override, notification gating, email-shell pattern) from the POST/PATCH-status paths into the new PATCH-trip-fields path without silently diverging from them."

## Editable-Status Set (resolved — was Claude's Discretion)

`[VERIFIED: lib/booking-transitions.ts:11-20]` — the canonical `VALID_TRANSITIONS` map:
```typescript
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
`completed` and `cancelled` are the only two statuses with an **empty** outgoing-transition array — they are terminal states in the existing status-transition model. `BookingsTable.tsx` already treats `completed`/`cancelled` as final in its own UI (`STATUS_LABELS[row.original.status]} (final)`, `route.ts:1274-1277`) whenever `UI_TRANSITIONS[status]` is empty.

**Recommendation:** Trip-field edits (AEDIT-01..04, AEDIT-07) should be allowed for `unpaid`, `pending`, `confirmed`, `assigned`, `en_route`, `on_location`, and **disallowed** (read-only trip fields) for `completed` and `cancelled`. This reuses the exact same terminal/non-terminal boundary the status system already enforces — no new status concept is needed. Enforce this server-side in the PATCH handler (reject trip-field edits when `current.status` is `completed` or `cancelled`, e.g. 422) in addition to hiding the edit controls client-side.

## GNet Push Decision (resolved — was Claude's Discretion)

`[VERIFIED: lib/gnet-client.ts:8-14,72-111,118-129]` — `pushGnetStatus()` only accepts a `GnetStatus` enum (`'CONFIRMED' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_LOCATION' | 'COMPLETE' | 'CANCEL'`) and calls a single GNet endpoint, `POST providerUpdateStatusByResNo/{griddID}/{resNo}/{version}`, whose body is `{ status, totalAmount, resNo, griddID }` — a **status-only** push. There is no other exported function in `lib/gnet-client.ts`, and no reservation-detail-update endpoint (date/vehicle/route/passenger) is called anywhere in the codebase (`grep` across `app/`/`lib/` for GNet outbound calls returns only this one function and `getGnetToken`).

**Recommendation:** Trip-detail edits (AEDIT-01..04, AEDIT-07) on `booking_source === 'gnet'` bookings should be **local-only in Phase 63** — persist the change, write the audit log, optionally email the client — but do **not** attempt a GNet push, because no GNet API for pushing trip-detail changes exists in this codebase (and per the surrounding GRDD integration convention, GNet is the reservation system of record for its own bookings — a partner-initiated change would arrive via GNet's own webhook/API, not be pushed outward). Surface a passive warning in the edit UI for GNet-sourced bookings (e.g. "This booking originated from a GNet partner — edits are recorded locally but not synced back to GNet") so the operator understands the one-way boundary; do not block the edit. This mirrors the existing GNet-cancellation UX in `BookingsTable.tsx:1621-1631`, which already explains partner-billing boundaries in plain language for `booking_source === 'gnet'`.

## Distance/Geocode Helper (resolved — the highest-value research item)

There is **no standalone reusable `computeDistance()` / `geocodeAddress()` function** anywhere in `lib/`. Distance is obtained through a **two-hop, client-orchestrated flow** that the existing admin manual-booking form already performs in full:

**Hop 1 — client-side place selection (Google Maps JS "places" library):**
`[VERIFIED: components/booking/AddressInput.tsx:5,9-22,150-177]` — `AddressInput` lazy-loads `@googlemaps/js-api-loader`'s `importLibrary('places')` using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, drives `google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions`, and on selection calls `prediction.toPlace()` + `place.fetchFields({ fields: ['location'] })` to resolve lat/lng, then invokes the caller's `onSelect(place: PlaceResult)` where:
```typescript
// Source: types/booking.ts:3-8 [VERIFIED]
export interface PlaceResult {
  address: string
  placeId: string
  lat: number
  lng: number
}
```

**Hop 2 — server-side distance via Google Routes API, fronted by `/api/calculate-price`:**
`[VERIFIED: app/api/calculate-price/route.ts:236-284]`
```typescript
const apiKey = process.env.GOOGLE_MAPS_API_KEY?.replace(/\\n$/, '').trim()
const googleBody = {
  origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
  destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
  travelMode: 'DRIVE',
}
const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': 'routes.distanceMeters',
    'Referer': 'https://rideprestigo.com',
  },
  body: JSON.stringify(googleBody),
})
const distanceMeters = data?.routes?.[0]?.distanceMeters
const distanceKm = distanceMeters / 1000
```
This endpoint returns `{ prices, returnLegPrices, returnDiscountPercent, distanceKm, quoteMode, matchedRouteSlug }` for `POST /api/calculate-price`.

**Hop 3 — the admin form captures and forwards the result:**
`[VERIFIED: components/admin/ManualBookingForm.tsx:103-149,196-224]`
```typescript
const res = await fetch('/api/calculate-price', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origin: originPlace ? { lat: originPlace.lat, lng: originPlace.lng } : null,
    destination: destinationPlace ? { lat: destinationPlace.lat, lng: destinationPlace.lng } : null,
    tripType, hours: hours ? Number(hours) : 2,
    pickupDate: pickupDate || null, returnDate: returnDate || null, pickupTime: pickupTime || null,
    isAirport: false,
  }),
})
const data = await res.json()
// ...
if (data.distanceKm) setDistanceKm(data.distanceKm)
// later, on submit:
if (distanceKm) payload.distance_km = distanceKm
```

**Recommendation for the edit flow (AEDIT-03/AEDIT-07):** replicate hops 1–3 exactly. When the operator edits origin/destination in the expanded row's price-review step (D-06), (a) collect new `PlaceResult`s via `AddressInput`, (b) call `POST /api/calculate-price` with the new origin/destination + the booking's existing `tripType`/`pickupDate`/`pickupTime` to get a fresh `distanceKm` and preview price, (c) surface that preview in the price-review UI, (d) submit `distance_km` (the freshly computed value) alongside `origin_address`/`destination_address`/`vehicle_class` in the `PATCH /api/admin/bookings` payload, where the server recomputes the authoritative price from that `distance_km` using `computeOutboundLegTotal` (Pattern 2 above). Do **not** call the raw Google Routes API directly from the admin route — always go through `/api/calculate-price`, which already handles the intercity flat-rate short-circuit (`route_prices` table match), zone checks, and the missing-API-key fallback (`quoteMode: true`).

## Runtime State Inventory

Not applicable — this is a greenfield feature addition (new PATCH fields + new table), not a rename/refactor/migration phase.

## Common Pitfalls

### Pitfall 1: `types/database.types.ts` is stale — do not trust it for new columns
**What goes wrong:** The generated Supabase types file is missing `driver_price_czk` (added by migration `052_bookings_driver_price.sql`) and `attempt_id` (added by migration `053_unpaid_booking_status.sql`) — `[VERIFIED: types/database.types.ts]` grep for `driver_price_czk` across the file returns zero matches, despite the column being actively read/written by the PATCH handler (`route.ts:52,156,288`) and `BookingsTable.tsx` (`interface Booking { driver_price_czk: number | null }`, line 31).
**Why it happens:** The types file was not regenerated after migrations 052/053/054 were applied.
**How to avoid:** Do not add the new trip-edit fields or the audit-log table to `types/database.types.ts` by hand-guessing shape from migration SQL alone — either regenerate via the Supabase CLI (`supabase gen types typescript`) against the live schema after applying migration 055, or keep using local `interface` declarations (as `BookingsTable.tsx` and the zod schemas already do) rather than importing from the stale generated file.
**Warning signs:** A TypeScript error referencing a column that clearly exists in the DB (per a migration file) but not in `Database['public']['Tables']['bookings']['Row']`.

### Pitfall 2: `distance_km` is client-trusted, not server-reverified
**What goes wrong:** Assuming the PATCH handler independently re-geocodes/re-verifies `distance_km` server-side (it doesn't, and neither does the existing POST handler).
**Why it happens:** The mental model "server-authoritative pricing" (a real, locked project constraint) can be over-applied to imply every input is re-derived server-side; in practice only the *price* is tolerance-checked, not the distance that feeds it.
**How to avoid:** Accept this as the existing, deliberate trust boundary (D-03 explicitly says reuse the exact pattern). The price-level tolerance check (`ADMIN_PRICE_TOLERANCE_CZK`) is the actual safety net — a wrong distance produces a wrong price, which then either gets caught by the tolerance check (422, forces the operator to re-review) or requires an explicit `override_price` opt-in (audited via `operator_notes` in the POST pattern — replicate an equivalent audit note for the edit path).
**Warning signs:** A plan task that tries to add a second, independent Google Maps call inside the PATCH handler to "verify" the submitted distance — this duplicates Hop 2 above and will double the Google Maps API cost per edit.

### Pitfall 3: `email_log` table has no migration file in this repo
**What goes wrong:** Searching `supabase/migrations/*.sql` for `email_log` returns zero results `[VERIFIED: grep across supabase/migrations/]`, even though `lib/email-log.ts` actively reads/writes it.
**Why it happens:** The table was created directly against the live Supabase project outside the migrations directory (predates this project's migration-file convention, or was created via the Supabase dashboard).
**How to avoid:** Do not assume every live table has a corresponding migration file to consult for its exact column types — for `email_log`, `lib/email-log.ts:20-56`'s own `.insert({ booking_id, email_type, recipient })` and `.select('id')` calls are the source of truth for its shape (columns: `id`, `booking_id`, `email_type`, `recipient`, `sent_at`). For the **new** `booking_edit_audit_log` table this phase adds, follow the DROP+RECREATE-pattern migration convention seen in 053/054 so it *does* have a tracked migration file (unlike `email_log`).

### Pitfall 4: `admin_search_bookings` RPC returns raw `bookings.*` — audit history is a separate fetch
**What goes wrong:** Assuming the existing bookings-list GET endpoint can simply include audit-log rows nested per booking without a schema/RPC change.
**Why it happens:** `admin_search_bookings` (`[VERIFIED: supabase/migrations/054_admin_search_bookings_status_filter.sql:80-83]`) does `jsonb_agg(to_jsonb(paged.*) ...)` — it serializes the `bookings` row shape only; there's no join to a hypothetical audit table.
**How to avoid:** Plan the change-history UI (D-11) as either (a) a small dedicated `GET /api/admin/bookings/[id]/audit-log` fetched lazily when a row is expanded (matches the existing `FlightStatusBlock` pattern of a per-row lazy sub-fetch), or (b) a second `p_status`-style parameter added to the RPC via a new migration if server-side joining is preferred. Option (a) is lower-risk since it doesn't touch the RPC's SECURITY DEFINER function signature.

### Pitfall 5: Round-trip legs share `payment_intent_id` but NOT `booking_reference` uniqueness assumptions
**What goes wrong:** Building the audit log or change email keyed by something other than `bookings.id` risks bleeding a "change" onto the wrong leg.
**Why it happens:** Round-trip legs share `payment_intent_id` (`[VERIFIED: types/database.types.ts:56]` `payment_intent_id: string | null`) and are linked via `linked_booking_id` (`types/database.types.ts:48`), which could tempt a query like "update all bookings with this `payment_intent_id`."
**How to avoid:** Every PATCH, audit-log write, and change email must be scoped by the single `bookings.id` primary key, exactly as the existing PATCH handler already does (`'.eq('id', parsed.data.id)'`, `route.ts:161,293`). This is the mechanism that makes D-12 "architecturally free" — do not introduce any leg-pair-aware query.

### Pitfall 6: Two `AddressInput` implementations exist — pick the one the admin surface already uses
**What goes wrong:** Wiring the edit form to `AddressInputNew` (the newer Places API implementation) "because it's newer," diverging from the admin's existing pattern.
**Why it happens:** `AddressInputNew.tsx` exists and is used by the public booking flow behind `NEXT_PUBLIC_USE_NEW_PLACES_API` `[VERIFIED: components/booking/BookingWidget.tsx:106]`.
**How to avoid:** `ManualBookingForm.tsx` (the admin precedent) imports `AddressInput` directly with no flag `[VERIFIED: components/admin/ManualBookingForm.tsx:4]` — follow that precedent for the edit surface too, for UI/behavior consistency within the admin panel.

## Code Examples

### Extending the PATCH schema (illustrative — exact field list is a planning decision)
```typescript
// Extends the existing schema at app/api/admin/bookings/route.ts:38-56
const bookingPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([/* existing 8 statuses */]).optional(),
  operator_notes: z.string().max(2000).optional(),
  driver_price_czk: z.number().int().min(0).max(1_000_000).nullable().optional(),
  // NEW — cheap fields (AEDIT-01, AEDIT-04)
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  client_first_name: z.string().min(1).max(100).regex(NO_CRLF).optional(),
  client_last_name:  z.string().min(1).max(100).regex(NO_CRLF).optional(),
  client_email:      z.string().email().max(200).regex(NO_CRLF).optional(),
  client_phone:      z.string().min(1).max(50).regex(NO_CRLF).optional(),
  flight_number:     z.string().max(20).regex(NO_CRLF).optional(),
  // NEW — price-affecting fields (AEDIT-02, AEDIT-03, AEDIT-07)
  vehicle_class:       z.enum(['business', 'first_class', 'business_van']).optional(),
  origin_address:      z.string().min(1).max(500).optional(),
  destination_address: z.string().max(500).optional(),
  origin_lat: z.number().optional(), origin_lng: z.number().optional(),
  destination_lat: z.number().optional(), destination_lng: z.number().optional(),
  distance_km: z.number().nullable().optional(),
  amount_czk:  z.number().int().positive().optional(),  // operator's reviewed/overridden amount
  override_price: z.boolean().optional(),
  // NEW — notification control (AEDIT-05, D-08)
  notify_client: z.boolean().optional(),
}).refine(/* at-least-one-field check, same shape as existing .refine() */)
```
`NO_CRLF` regex is already defined at `app/api/admin/bookings/route.ts:300` — import it for the same PII single-line guarantee used in `manualBookingSchema`.

## State of the Art

Not applicable — no external library/API version drift is relevant here; this phase reuses in-repo, currently-working patterns exactly as they exist today. No deprecated approach is being replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `notification_flags` key for the new email should be named `booking_changed` (mirroring `booking_${status}` naming for status emails) | Pattern 4 / D-08 | Low — CONTEXT.md explicitly defers the exact key name to the planner; any key works as long as it's consistent between the read and the seed/admin-config UI that sets it. |
| A2 | The audit-log table name `booking_edit_audit_log` and its column shape (`booking_id, field, old_value, new_value, operator_id, changed_at, notified`) | "Audit-log table shape" (below) | Low-Medium — this is a new table with no prior art in the codebase to verify against; the planner should confirm the exact column set before writing the migration, but the shape follows D-10's explicit requirements (old→new, operator, timestamp, notified flag) closely. |
| A3 | Change-history UI should be a lazily-fetched per-row sub-component (mirroring `FlightStatusBlock`) rather than bundled into the main `GET /api/admin/bookings` list response | Pitfall 4 | Low — either approach satisfies D-11; the lazy-fetch approach only affects implementation shape, not user-visible behavior. |
| A4 | `getAdminUser()`'s returned `user.id` (a Supabase Auth UUID) is the correct "operator" identity to store in the audit log, rather than `user.email` | Audit-log table shape | Low — `user?.id` is already used for the identical purpose (audit trail on price override) at `route.ts:459` (`console.warn(..., { adminUserId: user?.id, ... })`), so this is consistent, not a new assumption about auth shape — kept as `[ASSUMED]` only because no *existing* audit table's actual column was read to confirm the naming convention (there is no prior audit table in this codebase to check against). |

## Audit-Log Table Shape (recommendation for migration 055)

Following the DROP+RECREATE / sequential-migration convention seen in `053_unpaid_booking_status.sql` and `054_admin_search_bookings_status_filter.sql` (both add/modify schema idempotently with `IF NOT EXISTS` / `DROP ... IF EXISTS` guards):

```sql
-- Migration 055: booking_edit_audit_log
-- Phase 63 — Admin Booking Editing + Change Notification (D-10, D-11, FOLLOW-02)
--
-- Per-field audit trail for admin trip-field edits. One row per changed field
-- per PATCH request (a single edit that changes 3 fields writes 3 rows,
-- sharing changed_at so the history UI can group them visually).

CREATE TABLE IF NOT EXISTS public.booking_edit_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  field        text NOT NULL,
  old_value    text,
  new_value    text,
  operator_id  uuid,               -- getAdminUser().user.id — nullable defensively
  changed_at   timestamptz NOT NULL DEFAULT now(),
  notified     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS booking_edit_audit_log_booking_id_idx
  ON public.booking_edit_audit_log (booking_id, changed_at DESC);
```
Store `old_value`/`new_value` as `text` (not typed columns) since the field set spans dates, strings, enums, and numeric amounts — matching the "field, old→new value" shape D-10 asks for without needing a column-per-field-type schema. The planner should confirm whether RLS is needed (existing `bookings` table has RLS deferred per STATE.md note "Migration 045 adds no RLS to bookings — deferred to Phase 60"; this service-role-only table likely needs no RLS since only the service-role PATCH handler writes/reads it, mirroring `email_log`'s apparent lack of a tracked RLS policy).

## Open Questions

1. **Exact `notification_flags` key name for the change email**
   - What we know: the pattern (`flags[key] !== false` = enabled-by-default) is fully verified.
   - What's unclear: whether the operator-facing pricing-globals admin UI (if one exists for editing `notification_flags`) needs a matching label/toggle added.
   - Recommendation: planner picks a key (`booking_changed` suggested) and checks whether `pricing_globals.notification_flags` is edited anywhere in the admin UI today — if not, this is a DB-only flag (defaults to enabled via the `!flags` fallback) and needs no UI work this phase.

2. **Whether the price-review step (D-06) needs a distinct "preview" endpoint or reuses `/api/calculate-price` directly**
   - What we know: `/api/calculate-price` already returns exactly the preview data needed (`prices`, `distanceKm`).
   - What's unclear: whether the admin-specific vehicle-class selection and existing-booking context (e.g. matched intercity route by `route_prices`) needs any admin-specific parameter not in `calculatePriceSchema`.
   - Recommendation: reuse `/api/calculate-price` as-is (same as `ManualBookingForm`) — it already accepts `originPlaceId`/`destinationPlaceId` for intercity route matching, which the edit flow should also pass through when available.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `GOOGLE_MAPS_API_KEY` (server) | `/api/calculate-price` distance recompute | ✓ (already required by existing, working code — `route.ts:239`) | — | `/api/calculate-price` already degrades to `quoteMode: true` if unset `[VERIFIED: app/api/calculate-price/route.ts:240-243]` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client, Places-restricted) | `AddressInput` autocomplete | ✓ (already required by `ManualBookingForm`, in production use) | — | None needed — feature is not usable without it, matching existing admin behavior. |
| `RESEND_API_KEY` | New change-notification email | ✓ (already required by all existing status emails) | — | `getResend()` throws lazily only at send time if unset `[VERIFIED: lib/email.ts:21-29]` — non-fatal per existing try/catch convention. |
| Supabase service-role env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | All DB reads/writes incl. new audit table | ✓ (already required by every admin route) | — | None. |

**Missing dependencies with no fallback:** None — all required env vars are already load-bearing for existing, shipped admin functionality.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.1` `[VERIFIED: package.json:73]` |
| Config file | `vitest.config.ts` (jsdom environment, `tests/setup.ts`, `@` alias to repo root) |
| Quick run command | `npx vitest run tests/admin-bookings.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AEDIT-01 | PATCH accepts `pickup_date`/`pickup_time` and persists them | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ file exists (`tests/admin-bookings.test.ts`), ❌ new test cases needed |
| AEDIT-02 | PATCH with `vehicle_class` recomputes price and 422s on unacknowledged divergence | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — mirror POST's existing price-tolerance tests (`Test 4: returns 400 when amount_czk is zero or negative` and similar, at line 497+) |
| AEDIT-03 | Route edit recomputes `distance_km` via `/api/calculate-price` before price recompute | integration (mocked Google Routes fetch) | `npx vitest run tests/admin-bookings.test.ts tests/calculate-price*.test.ts` | ❌ Wave 0 — no existing `calculate-price` test file found by name in the `tests/` listing; confirm before assuming coverage |
| AEDIT-04 | PATCH accepts passenger/contact/flight fields, rejects CRLF via `NO_CRLF` | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 |
| AEDIT-05 | `notify_client` toggle + `notification_flags` AND-gate controls email send; `logEmail` dedup honored | unit (mocked Resend + Supabase) | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — mirror existing status-email test pattern in the same file (search for `sendStatusConfirmedEmail` mock usage) |
| AEDIT-06 | Editing one leg does not touch `linked_booking_id` row | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — assert the Supabase `.update().eq('id', ...)` call args don't reference the linked id |
| AEDIT-07 | Override flow: divergence → 422 without `override_price`, 200 with it, audit row records the override | unit | `npx vitest run tests/admin-bookings.test.ts` | ❌ Wave 0 — mirror POST's `priceDiverges`/`override_price` tests |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/admin-bookings.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Extend `tests/admin-bookings.test.ts` PATCH `describe` block with cases for every new field (trip fields, price recompute+override, notify toggle, audit-log write) — the file and `describe('PATCH /api/admin/bookings', ...)` block already exist (`tests/admin-bookings.test.ts:314`), so this is additive, not new infrastructure.
- [ ] Confirm whether a dedicated `tests/calculate-price.test.ts` exists to cover the distance round-trip mock, or whether that coverage needs to be added fresh.
- [ ] New audit-log-focused test cases (row inserted per changed field, correct old/new values, correct `operator_id`) — no existing test file covers an audit table since none existed before this phase.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged) | Existing Supabase Auth admin session — untouched per CONTEXT.md constraint. |
| V3 Session Management | No (unchanged) | Same. |
| V4 Access Control | Yes | `getAdminUser()` 401/403 guard, already applied to PATCH — extend to cover the new fields without adding a separate code path. |
| V5 Input Validation | Yes | `zod` schema whitelist (`bookingPatchSchema` extension) + `NO_CRLF` regex on all single-line PII fields — same pattern as `manualBookingSchema`. |
| V6 Cryptography | No | Not applicable — no new crypto surface. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client submits an arbitrary `amount_czk` to under/overpay | Tampering | Server recompute + `ADMIN_PRICE_TOLERANCE_CZK` + explicit `override_price` opt-in, logged (existing pattern, Pattern 2 above). |
| CRLF/header injection via `client_email`/`flight_number` etc. reaching an email `subject` or header | Tampering / Injection | `NO_CRLF` regex (`app/api/admin/bookings/route.ts:300`) on every single-line PII field — apply to all new editable string fields. |
| Mass-assignment — a field not intended to be admin-editable (e.g. `payment_intent_id`, `booking_source`) sneaking into the PATCH payload | Tampering | zod `.object({...})` **whitelist** (zod strips/rejects unknown keys by default under `safeParse` with a plain object schema) — never spread `request.json()` directly into the Supabase `.update()` call; always build `updatePayload` field-by-field as the existing code already does (`route.ts:153-156,286-288`). |
| A GNet-sourced booking's trip details silently drift from the GNet system of record after a local-only edit | Tampering (data integrity, not security exploit) | Passive UI warning (see "GNet Push Decision") — not a security control, but a data-integrity guard the planner should include. |
| Cross-leg edit bleed (editing outbound accidentally touches return) | Tampering | Every DB write scoped by `bookings.id` (primary key), never by `payment_intent_id` (Pitfall 5). |

## Sources

### Primary (HIGH confidence — all `[VERIFIED]`, read this session)
- `app/api/admin/bookings/route.ts` (full file, 515 lines) — GET/PATCH/POST handlers, zod schemas, recompute+override, status-email gating, GNet status-push guard.
- `components/admin/BookingsTable.tsx` (full file, 1729 lines) — expandable row, per-field commit pattern, `UI_TRANSITIONS`, cancellation-modal GNet/manual/Stripe copy.
- `components/admin/ManualBookingForm.tsx` (full file) — the exact distance/price round trip this phase must replicate.
- `components/booking/AddressInput.tsx` (full file) — Google Places Autocomplete client implementation.
- `app/api/calculate-price/route.ts` (full file) — Google Routes API server call, intercity flat-rate short-circuit, zone check.
- `lib/booking-transitions.ts`, `lib/server-pricing.ts`, `lib/pricing-config.ts`, `lib/extras.ts`, `lib/pricing.ts` (dateDiffDays), `lib/currency.ts`, `lib/email.ts` (status-email + StatusEmailBooking sections), `lib/email-log.ts`, `lib/gnet-client.ts`, `lib/supabase.ts` (leg/round-trip model), `lib/supabase/server.ts` (`getAdminUser`) — all read in full or in the relevant section.
- `types/database.types.ts` (bookings + gnet_bookings Row shapes) and `types/booking.ts` (`PlaceResult`, `VehicleClass`, `BookingSource`).
- `supabase/migrations/052_bookings_driver_price.sql`, `053_unpaid_booking_status.sql`, `054_admin_search_bookings_status_filter.sql` — migration-convention precedent + confirmed next number.
- `tests/admin-bookings.test.ts` (describe-block/test-name listing) — existing test coverage baseline.
- `package.json` — installed dependency versions.
- `vitest.config.ts` — test framework config.
- `.planning/phases/63-admin-booking-editing-change-notification/63-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — upstream decisions/requirements.

### Secondary (MEDIUM confidence)
None — no external documentation lookups were needed; this phase introduces no new library or API surface beyond what is already proven working in this codebase.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; every library cited is already installed and already used for an equivalent purpose.
- Architecture: HIGH — every pattern (recompute+override, notification gating, per-field commit, leg isolation) was read directly from the exact files CONTEXT.md named, with line numbers and verbatim quotes.
- Distance/geocode helper: HIGH — traced end-to-end from `AddressInput` through `/api/calculate-price` to `ManualBookingForm`'s payload construction; no ambiguity remains about how distance is obtained.
- Editable-status set / GNet push decision: HIGH — both derived directly from reading the cited source files, not inferred.
- Audit-log table shape: MEDIUM — this is new schema with no prior in-repo art to verify against; shape follows D-10's stated requirements closely but is a design proposal, not a verified existing pattern (flagged in Assumptions Log).
- Pitfalls: HIGH — each pitfall was discovered via direct grep/read verification (stale types file, missing `email_log` migration, RPC shape), not speculation.

**Research date:** 2026-08-20
**Valid until:** 30 days (stable, in-repo patterns; no fast-moving external dependency)
