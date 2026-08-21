# Phase 64: Admin-Created Bookings with Payment Link - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Operator originates a booking on behalf of a client from the admin panel — with or without collecting payment at that moment — and gets paid without the client ever visiting the public booking flow. When the operator chooses to collect payment, the system generates a Stripe payment link for that booking, emails it to the client (and exposes the URL for manual/WhatsApp sending), and — when the client pays via that link — automatically reconciles the payment into the **same existing booking row** (no duplicate), flipping it to paid/confirmed. The operator can also save the booking with no payment link at all (cash/invoice), and can attach a payment link **later** to an already-saved booking from the bookings list.

Covers ANEW-01 … ANEW-05.

**Important — much of the create/save surface already exists (built in earlier phases):**
- `ManualBookingForm.tsx` + the **POST `/api/admin/bookings`** handler already let an operator create a booking (trip, vehicle, client details) with server-side price recompute + override → **ANEW-01 substantially done.**
- The same POST already saves a booking with **no Stripe interaction** (`booking_source: 'manual'`, `payment_intent_id: null`) → **ANEW-05 substantially done** (this phase only changes the default status handling — see D-02).

**The genuinely NEW work in Phase 64:** generate a Stripe payment link (ANEW-02), email it to the client (ANEW-03), and auto-reconcile payment-via-link into the existing row with no duplicate (ANEW-04).

Does NOT include: a payment link for the **price difference / top-up** on an already-paid edited booking (explicitly deferred — see Deferred Ideas); automatic charging; editing pricing rules. Guest checkout and admin auth session model remain untouched.

</domain>

<decisions>
## Implementation Decisions

### Booking status & admin queue
- **D-01:** A booking created **with a payment link** is persisted with status **`unpaid`** — reuse the Phase 62 status value, so it lands in the existing amber "Unpaid" recovery queue and the existing `unpaid → confirmed` reconciliation-in-place + `StatusBadge` machinery apply unchanged. No new status value. (Chosen over `pending` — semantically vague, not in the queue — and over a new `awaiting_payment` status — duplicates what `unpaid` already does and needs a fresh enum migration + badge + transitions.) — **Reversibility:** reversible — status is a per-row value already in the enum; no schema change.
- **D-02:** A booking saved **without a payment link** (cash/invoice) lets the **operator choose the status in the form** — `confirmed` (paid offline, operationally done, not in the unpaid queue) or `pending`. Today the POST hardcodes `status: 'pending'`; this phase replaces that with an operator choice (default `confirmed`, since cash/invoice bookings are real confirmed jobs). — **Reversibility:** reversible — small change to the POST payload + form.

### Payment-link delivery & control (ANEW-02, ANEW-03)
- **D-03:** On saving a booking **with payment**, the system generates the payment link AND **auto-emails it to the client in the same action** (satisfies success criterion 2), AND surfaces the **link URL for copy** (so the operator can send it via WhatsApp/other channels) plus a **"send again"/resend** control. Not email-only, and not a two-step "generate then separately send". — **Reversibility:** reversible.
- **D-04:** The payment link has **no expiry** and is **one link per booking**, reusable — the same URL can be re-sent multiple times until the booking is paid. No expiry-handling / regenerate-on-expiry logic in this phase. — **Reversibility:** reversible.
- **D-05:** The operator can **attach a payment link later** to an already-saved booking (e.g. a cash booking whose payment never arrived) via a **"Generate payment link" action in the expanded booking row** of `BookingsTable.tsx` — not only at creation time. Same link + email + reconciliation machinery. Applies to bookings not yet paid (`unpaid` / `pending`). — **Reversibility:** reversible.

### Payment-request email (ANEW-03)
- **D-06:** New **branded email template** ("complete your payment") in the style of the existing templates in `lib/email.ts` (e.g. `sendStatusConfirmedEmail` / `sendBookingChangedEmail` as pattern): shows a **trip summary** (route, date/time, vehicle class), the **amount due**, and a prominent **"Pay now"** button linking to the Stripe payment link.
- **D-07:** The payment-link email is **transactional** — it is the operator's explicit action, not a marketing notification. It is **NOT gated by a global `notification_flags` suppress flag** (unlike the Phase 63 change email). The only gate is **`logEmail` dedup** (write the email-log row before Resend, same pattern as elsewhere) to prevent accidental double-sends; the "send again"/resend control is an explicit re-send that bypasses dedup by design. — **Reversibility:** reversible.

### Reconciliation — no-duplicate landmine (ANEW-04) — MANDATORY for researcher/planner
- **D-08:** Payment via the link must reconcile into the **existing booking row** (the `unpaid` row from D-01) and flip it to `confirmed`/paid — **never create a duplicate**. The Phase 62 reconciliation helpers (`reconcileBookingToConfirmed`, `reconcileRoundTripToConfirmed` in `lib/supabase.ts`) and the `unpaid → confirmed` webhook side-effect handling (`handleOneWaySucceeded` / `handleRoundTripSucceeded`) are the reuse target. — **Reversibility:** costly — this is the core payment contract; getting the keying wrong risks duplicate rows or lost reconciliation.
- **D-09 (KEYING — researcher to resolve):** Today reconciliation keys on **`payment_intent_id`** (matched to the booking row) + round-trip metadata, and that id is known at capture time inside `create-payment-intent`. A Stripe **Payment Link / Checkout Session** does NOT expose the final PaymentIntent id at booking-creation time and fires **`checkout.session.completed`** (carrying `metadata` + the resulting `payment_intent`), not the metadata-rich `payment_intent.succeeded` our current handler parses. **Therefore the plan MUST:**
  1. Choose the reconciliation key that IS known at link-creation time — recommended: put the **booking id / `booking_reference`** (and `leg` for round-trip) into the payment link's **`metadata`**, and match the existing `unpaid` row on that.
  2. Add/extend a webhook handler for **`checkout.session.completed`** (or Payment Link's completion event) that: resolves the booking from metadata, reconciles `unpaid → confirmed`, **stores the resolved `payment_intent_id`** on the row, and fires the same confirmation side-effects (client confirmation email, manager alert, GA4 purchase, reminder) that Phase 62 preserved on the unpaid→confirmed transition — **without** double-sending if the row is already `confirmed`.
  3. Keep idempotency intact via the existing `stripe_processed_events` claim (side-effect FIRST, claim AFTER — the established ordering in the webhook).
  4. Handle both one-way and round-trip. (Round-trip is two `unpaid` legs sharing the attempt/booking — the payment link must carry enough metadata to reconcile both.)
  - A **new migration (next number = `056`)** may be needed only if a column is required to store the link URL / checkout-session id — planner to decide; reconciliation itself can key on existing `booking_reference`.

### Claude's Discretion
- Exact payment-mechanism choice inside Stripe (Payment Link object vs. a hosted Checkout Session created server-side) — researcher/planner picks based on Stripe capabilities and the D-09 keying needs. Behavior locked by D-03/D-04/D-08; mechanism is open.
- Exact email micro-copy and layout of the payment-request template (D-06).
- Whether a column is added to persist the link/session id vs. keying purely on `booking_reference` metadata (D-09).
- UI placement/labels of the "copy URL" / "send again" controls and the row-level "Generate payment link" action.
- The `notification_flags` key name **only if** the team later decides they DO want a global suppress (default per D-07 is: no global gate).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Admin create surface & API (core — already built, extend here)
- `app/api/admin/bookings/route.ts` — the **POST** handler (lines ~767–end): manual booking creation with `getPricingConfig` → `computeOutboundLegTotal` + `computeExtrasTotal` recompute, `ADMIN_PRICE_TOLERANCE_CZK` divergence gate, `override_price`, authoritative-amount selection, `generateBookingReference`, insert with `booking_source: 'manual'`, `payment_intent_id: null`, `status: 'pending'` (→ change per D-01/D-02). This is where "generate link + set unpaid" and "operator status choice" hook in. Also the PATCH handler's `notification_flags` + `logEmail` pattern (lines ~110, ~320–330, ~650) is the email-gating reference.
- `components/admin/ManualBookingForm.tsx` — the wired admin create UI (742 lines): price calc via `/api/calculate-price`, submit via POST `/api/admin/bookings` (line ~232). Add the "collect payment?" choice, status choice (D-02), and post-save link display/copy/resend (D-03).
- `components/admin/AdminStep6Create.tsx` — alternative create summary/submit surface (also POSTs to `/api/admin/bookings`); confirm which surface is canonical before wiring.
- `components/admin/BookingsTable.tsx` — expandable booking row; add the row-level **"Generate payment link"** action (D-05) alongside the existing inline-edit controls; the `StatusBadge` cast sites + `VALID_TRANSITIONS` client map.
- `app/admin/(dashboard)/bookings/page.tsx` — mounts `ManualBookingForm` (line ~123); the create entry point.

### Reconciliation & webhook (Phase 62 reuse — core landmine D-08/D-09)
- `app/api/webhooks/stripe/route.ts` — `payment_intent.succeeded` handler + `handleOneWaySucceeded` / `handleRoundTripSucceeded`; `unpaid → confirmed` reconciliation; `stripe_processed_events` idempotency ordering (side-effect FIRST, claim AFTER, lines ~95–138, ~166, ~299). **Add the `checkout.session.completed` (Payment Link) handling here.**
- `lib/supabase.ts` — `reconcileBookingToConfirmed` (line ~150), `reconcileRoundTripToConfirmed` (line ~273); `buildBookingRow`; the `(payment_intent_id, leg)` idempotency model. Reconciliation helpers to reuse/extend for metadata-keyed matching.

### Email + dedup (ANEW-03)
- `lib/email.ts` — branded templates `sendStatusConfirmedEmail` (line ~1101), `sendBookingChangedEmail` (line ~1231), `sendClientConfirmation` (line ~287) as the pattern for the new payment-request template (D-06).
- `lib/email-log.ts` — `logEmail` (line ~20), the dedup gate to call before Resend (D-07).
- `app/api/admin/settings/route.ts` + `pricing_globals.notification_flags` — the global-flag surface (NOT used to gate this email per D-07; referenced for consistency only).

### Prior context & status vocabulary
- `.planning/phases/62-abandoned-unpaid-booking-capture/62-CONTEXT.md` — `unpaid` status, the reconciliation-in-place / no-duplicate landmine (Phase 62 D-11), the recovery queue, `stripe_processed_events`, side-effect gating. **The most important prior context for this phase.**
- `.planning/phases/63-admin-booking-editing-change-notification/63-CONTEXT.md` — the manual-booking POST recompute+override blueprint, `logEmail`/`notification_flags` conventions, branded change-email pattern; the top-up idea deferred INTO this phase (now re-deferred — see below).
- `.planning/milestones/v2.0-phases/52-extended-booking-statuses/52-CONTEXT.md` — status enum + `StatusBadge` + double-gate `VALID_TRANSITIONS`.

### Project constraints & requirements
- `.planning/PROJECT.md` — server-authoritative pricing/`user_id`; admin auth model untouched; Tailwind v4 design tokens.
- `.planning/REQUIREMENTS.md` — ANEW-01…05 (this phase, lines ~31–35).

### Migrations
- `supabase/migrations/` — highest existing is `055_booking_edit_audit_log.sql`; if a column is needed to persist the link/checkout-session id, next number is **`056`** (D-09). Reconciliation can otherwise key on existing `booking_reference`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Manual-booking POST** (`app/api/admin/bookings/route.ts`) — full server-authoritative recompute + override + insert already implemented; this phase adds "optionally create a payment link + set `unpaid`" and "operator status choice for no-link saves".
- **Reconciliation helpers** (`reconcileBookingToConfirmed`, `reconcileRoundTripToConfirmed`, `lib/supabase.ts`) — reuse for metadata-keyed reconciliation from the Payment Link completion event.
- **Webhook idempotency** (`stripe_processed_events` claim + side-effect-first ordering) — reuse for the new completion event.
- **Branded email templates** (`lib/email.ts`) + **`logEmail`** dedup — pattern + gate for the payment-request email.
- **`unpaid` StatusBadge + recovery queue + `VALID_TRANSITIONS`** (Phase 62) — a payment-link booking reuses all of it for free by choosing `unpaid` (D-01).

### Established Patterns
- **Server-authoritative pricing** — never trust client amounts; recompute from `pricing_config`, accept override only via explicit `override_price`.
- **Reconcile-in-place, never duplicate** — an existing `unpaid` row is UPDATED to `confirmed` on payment; side-effects fire on that transition, idempotently.
- **Side-effect FIRST, `stripe_processed_events` claim AFTER** — crash-safe webhook ordering.
- **`logEmail`-before-Resend dedup** — write the email-log row first as the dedup gate.
- **`after()` for post-response side-effects** — Vercel serverless keeps the promise alive past response return.

### Integration Points
- **Create/POST:** extend to optionally create a Stripe payment link, set status `unpaid` (with link) or operator-chosen (no link), and return the link URL to the UI.
- **Payment link generation:** server-side, carrying booking id / `booking_reference` (+ `leg`) in metadata (D-09).
- **Webhook:** add `checkout.session.completed` (Payment Link) handling → resolve booking from metadata → reconcile `unpaid → confirmed` → store `payment_intent_id` → fire confirmation side-effects idempotently (D-08/D-09).
- **Email:** new branded payment-request template, sent on link creation and re-send.
- **BookingsTable:** row-level "Generate payment link" action for existing unpaid/pending bookings (D-05), plus link display / copy / resend in the create flow (D-03).

</code_context>

<specifics>
## Specific Ideas

- Operator mental model: create a booking for a client, then either (a) collect cash/invoice offline and mark it confirmed, or (b) send a pay-link and let Stripe + the webhook do the rest — landing the paid booking in the exact same row with no duplicate.
- The pay-link URL must be **copyable** (not email-only) because operators often send it over WhatsApp; and **re-sendable** because clients lose emails.
- A cash booking that never pays should be rescuable: the operator attaches a pay-link to it later from the list (D-05).

</specifics>

<deferred>
## Deferred Ideas

- **Top-up payment link for a price difference on an already-paid, edited booking** (surfaced in Phase 63 as "sequenced into Phase 64") — **explicitly re-deferred to a separate phase.** Rationale: Phase 64's four success criteria are all about full-amount admin-created bookings; a top-up needs *partial* reconciliation against an *already-paid* row (a different contract from `unpaid → confirmed`), which would enlarge scope and risk the core no-duplicate reconciliation. The link/email machinery built here is the foundation a future top-up phase reuses.
- **Automatic charging / re-charge of amounts** — out of scope; the operator always initiates collection.
- **Payment-link expiry + regenerate-on-expiry** — not in this phase (D-04: no expiry).
- **Automatic reminder for unpaid pay-link bookings** — same bucket as FOLLOW-01 (already deferred to v2); the Phase 62 reminder machinery already partially covers unpaid rows.

</deferred>

---

*Phase: 64-admin-created-bookings-with-payment-link*
*Context gathered: 2026-08-21*
