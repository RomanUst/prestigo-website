# Phase 62: Abandoned & Unpaid Booking Capture - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Every checkout attempt is captured for revenue recovery. A booking row is persisted in the DB the moment a client reaches the payment step — before payment completes — carrying a new `unpaid` status. Unpaid bookings are surfaced and filterable in the admin bookings list as a follow-up queue, visually distinguished from confirmed bookings. When the client later pays (same attempt), the existing row reconciles in place to `confirmed` — no duplicate row is ever created. Applies to both one-way and round-trip attempts.

Covers ABND-01 … ABND-06. Does NOT introduce automatic reminder emails (FOLLOW-01, deferred to v2), admin edit UI (Phase 63), or admin-created bookings (Phase 64). Guest checkout and admin auth session model remain untouched.

</domain>

<decisions>
## Implementation Decisions

### Status Vocabulary
- **D-01:** Introduce a NEW dedicated status value `unpaid` (chosen over reusing the dead `pending` value and over adding a separate `payment_status` column). Rationale: `pending` is semantically vague ("in processing" ≠ "not paid") and confuses the operator; a separate column doubles the status dimension and complicates UI/filters. — **Reversibility:** one-way — requires a DB migration (DROP+RECREATE of `bookings_status_check`); removing the value later means another migration + backfill of any `unpaid` rows.
- **D-02:** Migration follows the DROP+RECREATE CHECK-constraint pattern from `supabase/migrations/040_extended_booking_statuses.sql` (`DROP CONSTRAINT IF EXISTS bookings_status_check`, then `ADD CONSTRAINT` with the full value list + `unpaid`). Full enum becomes `unpaid | pending | confirmed | completed | cancelled | assigned | en_route | on_location`. Migration number is next sequential (verify highest existing before writing; project memory notes next migration ≈ 053 — confirm against `supabase/migrations/`).
- **D-03:** Admin badge: label **"Unpaid"**, amber/red warning color, added to the `StatusBadge` variant union (same hex-in-component style established in Phase 52; pick a distinct warning hex not yet used by the other 7 variants).
- **D-04:** Transition graph (double-gated in `VALID_TRANSITIONS` — both `app/api/admin/bookings/route.ts` server + `components/admin/BookingsTable.tsx` client): `unpaid → confirmed` (automatic, via Stripe webhook on payment) and `unpaid → cancelled` (manual — operator marks a dead/lost lead). Also extend the Zod status enum in the admin PATCH route to accept `unpaid` where relevant.

### Capture Trigger & Deduplication
- **D-05:** Create the unpaid booking row server-side inside `app/api/create-payment-intent/route.ts` — the same place the PaymentIntent is created, where all trip data, the server-resolved `user_id`, and the computed authoritative amounts already exist. No separate `/api/capture-booking` endpoint. — **Reversibility:** costly — this route is the single server entry point for checkout; changing where capture happens later touches the whole reconciliation contract.
- **D-06:** One unpaid row **per checkout attempt**, not per PaymentIntent. A stable `attempt_id` (generated client-side, held in the booking Zustand store / sessionStorage) is passed to `create-payment-intent`. On re-entry / currency toggle / retry (which currently spawns a fresh PaymentIntent + fresh `bookingReference`), UPDATE the existing unpaid row in place — including its `payment_intent_id` — instead of inserting a new row. Keeps the follow-up queue clean (no duplicate rows for one person).
- **D-07:** Round-trip attempts still produce 2 unpaid rows (outbound + return), keyed per leg, sharing the attempt — consistent with the existing `(payment_intent_id, leg)` model. (Locked by success criteria; not a discretion point.)

### Admin Queue Presentation
- **D-08:** Filter: add an **"Unpaid" chip** alongside the existing trip-type chips (`All / Transfer / Hourly / Daily`) in `BookingsTable.tsx`. Requires extending the bookings-list RPC to accept a status filter parameter (e.g., `p_status`) — the list is loaded via a Postgres RPC (`p_query`, `p_trip_type`), not a plain query, so the filter must be threaded through the RPC + the GET handler in `app/api/admin/bookings/route.ts`.
- **D-09:** Default "All" view SHOWS unpaid bookings mixed in with confirmed, visually distinguished (amber "Unpaid" badge + a light row tint). Operator must not miss them. (Not hidden-until-chip.)

### Unpaid Lifecycle
- **D-10:** Manual disposition only. An unpaid row lives in the queue until it is paid (→ `confirmed` via webhook) or the operator manually marks it `cancelled`. NO auto-expire / cron cleanup in this phase — that is FOLLOW-01 territory, already deferred to v2.

### RECONCILIATION LANDMINE (mandatory for planner — not optional)
- **D-11:** When the webhook flips an existing `unpaid` row to `confirmed`, the current success-path side-effects (client confirmation email, manager alert, GA4 server-side purchase, QStash 2h reminder) are all gated on `inserted.length > 0` — i.e., they fire ONLY on a fresh INSERT. With pre-capture, the row already exists, so a naive `upsert(..., { ignoreDuplicates: true })` (current behavior in `saveBooking`) would silently skip the flip AND skip every side-effect. The plan MUST:
  1. Change reconciliation so an existing `unpaid` row is UPDATED to `confirmed` (not ignored) on `payment_intent.succeeded`.
  2. Preserve/trigger the confirmation email, manager alert, GA4 purchase, and reminder scheduling on that unpaid→confirmed transition — the paying customer must still receive their confirmation.
  3. Keep idempotency intact (Stripe retries; `stripe_processed_events` claim; a row already `confirmed` must not re-send emails).
  4. Handle both one-way (`handleOneWaySucceeded`) and round-trip (`handleRoundTripSucceeded`) paths.

### Claude's Discretion
- Exact `unpaid` badge hex color and micro-copy (UI-SPEC / planner may refine, as long as it clearly reads "not paid" and differs from the other 7 status variants).
- Exact `attempt_id` generation/storage mechanics and the column/index used to key the update-in-place dedup.
- Row-tint styling specifics for the "All" view distinction.
- Whether the unpaid row is written via the existing `buildBookingRow` helper (extended to accept a status arg — it already takes `bookingType`) or a dedicated builder.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Payment capture & reconciliation (core surface)
- `app/api/create-payment-intent/route.ts` — where the PaymentIntent + `bookingReference` are created and all trip data / server `user_id` / authoritative amounts already exist; the capture insertion point (D-05).
- `app/api/webhooks/stripe/route.ts` — `payment_intent.succeeded` handler; `handleOneWaySucceeded` / `handleRoundTripSucceeded`; the reconciliation surface and the `inserted.length > 0` side-effect gate (D-11).
- `lib/supabase.ts` — `buildBookingRow` (status arg via `bookingType`, line ~62/74), `saveBooking` (`upsert` `onConflict: 'payment_intent_id,leg'`, `ignoreDuplicates: true`, line ~116), `buildBookingRows` / `saveRoundTripBookings` (round-trip); the `(payment_intent_id, leg)` idempotency model.

### Status vocabulary & admin surface
- `.planning/milestones/v2.0-phases/52-extended-booking-statuses/52-CONTEXT.md` — status-enum decisions, DROP+RECREATE CHECK pattern, double-gate `VALID_TRANSITIONS`, `StatusBadge` conventions.
- `supabase/migrations/040_extended_booking_statuses.sql` — pattern source for the status-value migration (D-02). (Verify highest existing migration number before choosing this phase's number.)
- `components/admin/BookingsTable.tsx` — `filterChips` (trip-type only today), status select driven by `VALID_TRANSITIONS`, status-badge cast sites.
- `components/admin/StatusBadge.tsx` — variant union + hex styles to extend with `unpaid` (D-03).
- `app/api/admin/bookings/route.ts` — GET list via RPC (`p_query`, `p_trip_type` → add `p_status`); PATCH Zod status enum + server `VALID_TRANSITIONS` + status-change email/GNet side-effects.
- `components/booking/steps/Step6Payment.tsx` — client payment step; the `useEffect` that calls `create-payment-intent` and re-fires on currency change (source of the multi-PI / dedup concern, D-06); holds where `attempt_id` would live.

### Project constraints
- `.planning/PROJECT.md` — guest checkout always available; admin auth session model untouched; Tailwind v4 design tokens; server-authoritative `user_id`.
- `.planning/REQUIREMENTS.md` — ABND-01…06 (this phase); FOLLOW-01 (auto-reminder) explicitly deferred to v2.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildBookingRow(meta, paymentIntentId, bookingType)` in `lib/supabase.ts` — already parameterizes status via `bookingType`; can be extended to emit `unpaid` for pre-capture.
- `StatusBadge` component — extend variant union with `unpaid` (same pattern Phase 52 used for `assigned`/`en_route`/`on_location`).
- `VALID_TRANSITIONS` (server in `app/api/admin/bookings/route.ts`, client in `BookingsTable.tsx`) — add the `unpaid` row (`unpaid: ['confirmed','cancelled']`); both maps MUST stay in sync (double-gate).
- Bookings-list RPC (behind GET `app/api/admin/bookings/route.ts`) — extend with a status parameter to power the "Unpaid" chip.
- `stripe_processed_events` idempotency table + claim logic — reused to keep reconciliation exactly-once.

### Established Patterns
- **Booking currently exists ONLY post-payment**: today the first `bookings` row is written in the webhook on `payment_intent.succeeded`; trip data lives in PaymentIntent metadata until then. Phase 62 inverts this — a row must exist pre-payment.
- **Double-gate status transitions**: server (Zod + `VALID_TRANSITIONS`) and client (`VALID_TRANSITIONS` in `BookingsTable`) — keep in sync.
- **Side-effects gated on fresh insert** (`inserted.length > 0`): emails / GA4 / reminders only fire on a new row today — see D-11 landmine.
- **Server-authoritative values**: `user_id` and pricing are resolved server-side in `create-payment-intent`; never trust client. Capture inherits this for free by living in that route.
- **DROP+RECREATE CHECK migration** for status enum changes (migration 040 → this phase's migration).

### Integration Points
- Capture write: inside `create-payment-intent` after amounts + `user_id` are resolved, before/after the `paymentIntents.create` call (planner to sequence so `payment_intent_id` is stored on the row).
- Reconciliation update: `handleOneWaySucceeded` / `handleRoundTripSucceeded` in the Stripe webhook — flip `unpaid → confirmed` and fire side-effects.
- Admin filter: RPC + GET handler + `filterChips` + row rendering in `BookingsTable.tsx`.
- Client: `attempt_id` generation/storage in the booking store / sessionStorage, passed into the `create-payment-intent` fetch in `Step6Payment.tsx`.

</code_context>

<specifics>
## Specific Ideas

- Operator mental model: the unpaid queue is a revenue-recovery follow-up list — it must be clean (one row per person/attempt, D-06) and impossible to miss (shown in "All" with a warning badge, D-09).
- `pending` remains in the enum but stays effectively unused; do NOT repurpose it for unpaid (explicitly rejected in D-01).

</specifics>

<deferred>
## Deferred Ideas

- **Automatic reminder email to unpaid clients after N hours** — FOLLOW-01, already deferred to v2 in REQUIREMENTS.md. Auto-expire / cron cleanup of stale unpaid rows falls in the same bucket (D-10).
- **Audit log of admin edits per booking** — FOLLOW-02, deferred to v2.

None of the above are in Phase 62 scope — discussion stayed within phase boundary.

</deferred>

---

*Phase: 62-abandoned-unpaid-booking-capture*
*Context gathered: 2026-08-19*
