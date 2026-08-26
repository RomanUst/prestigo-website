# Phase 63: Admin Booking Editing + Change Notification - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator can correct or update any booking directly from the admin panel — pickup date/time, vehicle class, route (origin/destination), and passenger/contact details including flight number — with price changes recalculated and reviewed before saving, and the client optionally notified by a branded email showing exactly what changed (old → new). Editing happens inline in the existing expandable row of `BookingsTable.tsx`. Round-trip legs are edited independently (they are two separate rows sharing one `payment_intent_id`, keyed by `leg`).

Covers AEDIT-01 … AEDIT-07. **Also pulls in the previously-deferred FOLLOW-02 (audit log of admin edits) with a UI history view — explicit user decision to include it now (see D-10/D-11).**

Does NOT include: generating/sending a Stripe payment link to collect a price difference (top-up) — that machinery is Phase 64; automatic collection of any price difference; editing the underlying pricing rules. Guest checkout and admin auth session model remain untouched.

</domain>

<decisions>
## Implementation Decisions

### Edit Surface & Save Model
- **D-01:** Edit **inline in the existing expandable row** of `components/admin/BookingsTable.tsx` — the same surface that already inline-edits operator notes and driver price. No separate edit page, no wizard modal. All trip fields (pickup date/time, vehicle class, route origin/destination, passenger/contact, flight number) become editable **simultaneously** in one edit mode. — **Reversibility:** costly — the whole edit UX is built into this component; moving to a modal/page later re-does the surface.
- **D-02:** **Per-field save granularity.** Each editable field has its own save control (commit that field), rather than one global "Save all" button or silent autosave. Cheap fields (name, email, phone, flight number, pickup date/time) commit directly. **Price-affecting fields (vehicle class, route) — their save control opens a price-review step (D-06) before the change is persisted; the fare is never changed silently.** (User: "возможность исправлять все поля одним и сохранять каждое поле отдельно".)

### Price Recalculation & Override (AEDIT-07)
- **D-03:** On a vehicle or route change, the server **recomputes** the fare from `pricing_config` — reuse the exact recompute path already built for the manual-booking POST in `app/api/admin/bookings/route.ts`: `computeOutboundLegTotal` (`lib/server-pricing.ts`) + `computeExtrasTotal` (`lib/extras.ts`) + `getPricingConfig` (`lib/pricing-config.ts`) + `dateDiffDays` (`lib/pricing.ts`). Never trust a client-supplied amount.
- **D-04:** Operator can **override** the recomputed amount with an arbitrary value — reuse the `override_price` + `ADMIN_PRICE_TOLERANCE_CZK` tolerance pattern already in the POST handler (server recomputes, flags divergence, accepts the operator's amount only when they explicitly override). Authoritative amount = recompute unless override.
- **D-05:** **The admin always decides about any additional collection.** In Phase 63 the system only **records** the new amount (recompute or override) — no automatic top-up, no auto-charge, no payment link. Any price difference on an already-paid booking is collected manually / out of system by the operator. (User: "всегда решает админ о дополнительном сборе".)
- **D-06:** Price-review step (triggered by saving a price-affecting field): show `old → new` amount, a field to adjust/override the amount, the "notify client" toggle, and a confirm action. Applies uniformly regardless of booking status (no special-casing paid vs unpaid at this step). — **Reversibility:** reversible.

### Change-Notification Email (AEDIT-05)
- **D-07:** Email shows **only the changed fields, old → new** (locked by success criteria — not all trip details). A price change appears as `old → new` amount in the same email.
- **D-08:** **Two-level send control:** (1) a per-save **"notify client" toggle** the operator sets each time, AND (2) a **global flag** in `pricing_globals.notification_flags` (e.g. `booking_changed`) — if the global flag is off, no change email is sent even when the toggle is on (mirrors the status-email gating in the PATCH handler). Dedup via `logEmail` before Resend (same D-15 pattern as status emails). (User: "тумблер и флаг".)
- **D-09:** New branded email template ("your booking was updated") built in the style of the existing status emails in `lib/email.ts` (`sendStatusConfirmedEmail` etc. as the pattern). Sending unpaid-booking change emails is allowed and governed by the same toggle+flag.

### Change Audit Log + History UI (FOLLOW-02, now in-phase)
- **D-10:** **Persist an audit record for every edit** — per changed field: `old → new` value, which operator, timestamp, and whether a notification email was sent. This audit store is the single source of truth for both the change email (D-07) and the history UI (D-11). — **Reversibility:** one-way — requires a new migration (next sequential number; verify highest existing in `supabase/migrations/` before writing — memory notes next ≈ 055 after Phase 62's 053/054).
- **D-11:** **Change-history UI is in scope** (the fuller "Variant B" the user chose over a logs-only option). Assumed placement: a "История изменений / Change history" block inside the same expanded booking row, listing every recorded edit. Planner may refine exact placement/layout. This is the previously-deferred FOLLOW-02 — **REQUIREMENTS.md must be reconciled** (FOLLOW-02 moves from v2-deferred into Phase 63).

### Round-Trip Leg Isolation (AEDIT-06)
- **D-12:** **Every edit — including passenger/contact fields (name, email, phone, flight) — applies strictly to the current leg's row only.** No propagation to the linked leg. Legs are separate `bookings` rows sharing `payment_intent_id`, keyed by `leg` ('outbound' | 'return'); editing operates per-row by `id`, so leg isolation is architecturally free. (User: "строго только текущая нога".)

### Claude's Discretion (flagged for planner/researcher)
- **Editability by status:** editing `cancelled` / `completed` bookings is likely read-only or restricted; active statuses (`unpaid`, `pending`, `confirmed`, `assigned`, `en_route`, `on_location`) are the edit targets. Planner to decide the exact editable-status set.
- **GNet-sourced bookings:** whether trip-detail edits push to GNet — guard by `booking_source === 'gnet'`, mirroring the existing status-push pattern in the PATCH handler. Planner to decide whether a push is needed or edits are local-only in this phase.
- **Route → distance recompute:** a route (origin/destination) edit changes `distance_km`, which `computeOutboundLegTotal` needs for transfer fares. The edit UI must recompute distance from the new addresses (the same Google Maps path the public booking flow / manual-booking form uses) before recomputing the fare. Researcher to locate the reusable distance/geocode helper.
- Exact email micro-copy, history-block styling, `notification_flags` key name.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Admin edit surface & API (core)
- `components/admin/BookingsTable.tsx` — the expandable row + existing inline-edit pattern (operator notes, driver price); where the trip-field edit mode, per-field save controls, price-review step, and change-history block live (D-01, D-02, D-06, D-11). Booking type/columns defined here (lines ~22–64).
- `app/api/admin/bookings/route.ts` — **PATCH** handler to extend for trip-field edits (currently handles status + notes + driver_price only); **POST** handler is the recompute+override reference implementation (`override_price`, `ADMIN_PRICE_TOLERANCE_CZK`, server recompute); status-email gating via `notification_flags` + `logEmail` (the pattern to mirror for D-08).
- `lib/booking-transitions.ts` — `VALID_TRANSITIONS`; relevant if editability is gated by status.

### Pricing recompute (AEDIT-07)
- `lib/server-pricing.ts` — `computeOutboundLegTotal(vehicleClass, distanceKm, hours, days, tripType, pickupDate, pickupTime, isAirport, rates)`; needs `distanceKm` for transfer fares (route-edit distance recompute concern).
- `lib/extras.ts` — `computeExtrasTotal`.
- `lib/pricing-config.ts` — `getPricingConfig()` (loads `pricing_config`).
- `lib/pricing.ts` — `dateDiffDays`, `buildPriceMap`; `lib/pricing-helpers.ts` — extras constants, `roundUpToFive`; `lib/currency.ts` — `eurToCzk` / `czkToEur`.

### Email + notification gating (AEDIT-05)
- `lib/email.ts` — status-email templates (`sendStatusConfirmedEmail`, `sendStatusCancelledEmail`, `sendPostTripEmail`) as the branded-template pattern for the new change email (D-09).
- `lib/email-log.ts` — `logEmail` dedup gate (call BEFORE Resend, D-08).
- `pricing_globals.notification_flags` — global on/off per notification type; add the change key (D-08).

### Round-trip model (AEDIT-06)
- `lib/supabase.ts` — leg model: two rows share `payment_intent_id`, keyed by `leg`; per-row `id` operations; `(payment_intent_id, leg)` idempotency (informs D-12).

### Prior context & status vocabulary
- `.planning/phases/62-abandoned-unpaid-booking-capture/62-CONTEXT.md` — admin bookings surface, `unpaid` status, RPC/filter, `logEmail`/`notification_flags` conventions; edit UI must work across statuses incl. `unpaid`.
- `.planning/milestones/v2.0-phases/52-extended-booking-statuses/52-CONTEXT.md` — status enum + `StatusBadge` + double-gate `VALID_TRANSITIONS`.

### Project constraints & requirements
- `.planning/PROJECT.md` — server-authoritative pricing/`user_id`; admin auth model untouched; Tailwind v4 design tokens.
- `.planning/REQUIREMENTS.md` — AEDIT-01…07 (this phase). **FOLLOW-02 (audit log of admin edits) must be reconciled — moves from v2-deferred into Phase 63 per D-10/D-11.**

### Migrations
- `supabase/migrations/` — verify highest existing number (Phase 62 used 053/054; next ≈ 055) before writing the audit-log migration (D-10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Manual-booking POST recompute+override block** (`app/api/admin/bookings/route.ts`) — near-complete blueprint for AEDIT-07: server recompute, divergence check vs `ADMIN_PRICE_TOLERANCE_CZK`, `override_price` opt-in, authoritative-amount selection, override note. Reuse for the edit path.
- **Expandable-row inline edit** (`BookingsTable.tsx`) — already commits `operator_notes` and `driver_price_czk` per-field with save state; extend the same mechanics to trip fields (D-02).
- **Status-email gating** (PATCH handler) — `notification_flags` lookup + `logEmail`-before-Resend + `after()` fire-and-forget; mirror for the change email (D-08/D-09).
- **Status-email templates** (`lib/email.ts`) — branded HTML pattern for the new old→new change email.

### Established Patterns
- **Server-authoritative pricing** — never trust client amounts; recompute from `pricing_config`, accept operator override only via explicit flag.
- **`logEmail` dedup before send** — write the email-log row first as the dedup gate, then send.
- **`after()` for post-response side-effects** — Vercel serverless keeps the promise alive past response return.
- **Per-leg rows for round-trips** — leg isolation is free; operate by row `id`.
- **DROP+RECREATE / sequential migrations** — for the new audit-log table, follow the project migration conventions; verify next number.

### Integration Points
- **PATCH extension:** accept trip-field edits (pickup date/time, vehicle_class, route origin/destination + recomputed distance, passenger/contact, flight number), recompute+override amount, write the change to the row, write audit records, optionally send the change email.
- **Distance recompute:** on route change, recompute `distance_km` from new addresses (reuse the booking-flow Maps helper) before `computeOutboundLegTotal`.
- **Audit table:** new table (migration) written on every edit; read by the history UI and by the change-email builder.
- **BookingsTable:** edit mode + per-field save + price-review step + change-history block, all in the expanded row.

</code_context>

<specifics>
## Specific Ideas

- Operator mental model: fix a booking in place, decide field-by-field, and only email the client on purpose (toggle) — with a full trail of what changed and whether the client was told.
- Price difference on a paid booking is the operator's call to collect manually now; the "send a payment link for the difference" flow is explicitly the next phase's job.

</specifics>

<deferred>
## Deferred Ideas

- **Top-up payment link for a price difference** — when an edit raises the price of a paid booking, generate + email a Stripe payment link for the difference and auto-reconcile it. Depends on / belongs with **Phase 64** (Admin-Created Bookings with Payment Link). User explicitly wants this behavior, sequenced into Phase 64.
- **Automatic collection / re-charge of price differences** — out of scope for both 63 and (as auto) 64; admin collects manually.

Note: FOLLOW-02 (audit log of admin edits) is NOT deferred anymore — user chose to include it in Phase 63 (D-10/D-11).

</deferred>

---

*Phase: 63-admin-booking-editing-change-notification*
*Context gathered: 2026-08-20*
