# Phase 62: Abandoned & Unpaid Booking Capture - Research

**Researched:** 2026-08-19
**Domain:** Payment-capture DB write + Stripe webhook reconciliation + admin filtering (Next.js App Router / Supabase / Stripe)
**Confidence:** HIGH (all core surfaces read directly this session; two gaps flagged MEDIUM/LOW below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Introduce a NEW dedicated status value `unpaid` (not reusing dead `pending`, not a separate `payment_status` column). One-way reversible — requires migration to remove later.
- **D-02:** Migration follows the DROP+RECREATE CHECK-constraint pattern from `supabase/migrations/040_extended_booking_statuses.sql`. Full enum becomes `unpaid | pending | confirmed | completed | cancelled | assigned | en_route | on_location`. Migration number is next sequential (verify highest existing before writing).
- **D-03:** Admin badge: label **"Unpaid"**, amber/red warning color, added to `StatusBadge` variant union (distinct hex from the other 7 variants).
- **D-04:** Transition graph (double-gated): `unpaid → confirmed` (automatic, webhook) and `unpaid → cancelled` (manual). Extend the Zod status enum in the admin PATCH route to accept `unpaid`.
- **D-05:** Create the unpaid row server-side inside `app/api/create-payment-intent/route.ts` — same place the PaymentIntent is created. No separate `/api/capture-booking` endpoint. Costly to reverse — this route becomes the single server entry point for the reconciliation contract.
- **D-06:** One unpaid row **per checkout attempt**, not per PaymentIntent. A stable `attempt_id` (client-generated, held in the booking Zustand store / sessionStorage) is passed to `create-payment-intent`. On retry/currency-toggle (fresh PaymentIntent + fresh `bookingReference`), UPDATE the existing unpaid row in place — including its `payment_intent_id` — instead of inserting a new row.
- **D-07:** Round-trip attempts still produce 2 unpaid rows (outbound + return), keyed per leg, sharing the attempt.
- **D-08:** Filter: add an "Unpaid" chip alongside trip-type chips in `BookingsTable.tsx`. Requires extending the bookings-list RPC to accept a status filter (`p_status`) threaded through the RPC + GET handler.
- **D-09:** Default "All" view SHOWS unpaid bookings mixed with confirmed, visually distinguished (amber badge + light row tint). Not hidden-until-chip.
- **D-10:** Manual disposition only. No auto-expire/cron (FOLLOW-01 territory, deferred to v2).
- **D-11 (RECONCILIATION LANDMINE):** The webhook's client email / manager alert / GA4 server purchase / QStash 2h reminder side-effects are currently gated on `inserted.length > 0` (fresh INSERT only). With pre-capture, the row already exists as `unpaid`, so a naive `upsert(..., { ignoreDuplicates: true })` would silently skip the flip AND all side-effects. The plan MUST: (1) UPDATE the existing `unpaid` row to `confirmed` on `payment_intent.succeeded` (not ignore it), (2) preserve/trigger all four side-effects on that transition, (3) keep Stripe-retry idempotency intact (`stripe_processed_events` claim; an already-`confirmed` row must not re-send), (4) handle both one-way and round-trip paths.

### Claude's Discretion

- Exact `unpaid` badge hex color and micro-copy — must clearly read "not paid" and differ from the other 7 status variants.
- Exact `attempt_id` generation/storage mechanics and the column/index used to key the update-in-place dedup.
- Row-tint styling specifics for the "All" view distinction.
- Whether the unpaid row is written via `buildBookingRow` (extended) or a dedicated builder.

### Deferred Ideas (OUT OF SCOPE)

- Automatic reminder email to unpaid clients after N hours (FOLLOW-01, v2). Auto-expire/cron cleanup of stale unpaid rows falls in the same bucket (D-10).
- Audit log of admin edits per booking (FOLLOW-02, v2).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ABND-01 | A booking is persisted as soon as the client reaches the payment step, before payment completes | §"Capture insertion point" — write inside `create-payment-intent/route.ts` after amount computation, before/with `paymentIntents.create()` |
| ABND-02 | A booking that reaches the payment step but is never paid carries an "unconfirmed/unpaid" status | §"Migration" — new `unpaid` CHECK value; §"buildBookingRow extension" |
| ABND-03 | Unconfirmed/unpaid bookings appear in the admin bookings list, visually distinguished | §"StatusBadge" + §"BookingsTable cast sites" — 3 variant cast sites at known line numbers |
| ABND-04 | Operator can filter the admin list to unconfirmed/unpaid only | §"Admin list RPC" — `p_status` param through `admin_search_bookings` RPC + GET handler + `filterChips` |
| ABND-05 | Each captured booking stores client contact details (name, email, phone) | §"Contact info guarantee" — Step5Passenger Zod validation confirmed |
| ABND-06 | A captured unpaid booking reconciles to confirmed/paid when payment completes (no duplicate) | §"Reconciliation" — replace `ignoreDuplicates` upsert with a conditional `UPDATE ... WHERE status='unpaid' RETURNING id` pattern |

</phase_requirements>

## Summary

The codebase already has almost every mechanical piece this phase needs — a proven DROP+RECREATE CHECK migration pattern (migration 040), a double-gated `VALID_TRANSITIONS` convention, a `StatusBadge` variant system, and a `p_query`/`p_trip_type` admin RPC that's a straightforward template for adding `p_status`. The genuine risk in this phase is **not** any of the locked decisions individually — it's that the codebase's local `supabase/migrations/` directory is **not** the authoritative source of the live schema. The `admin_search_bookings` RPC function that D-08 must modify has **no migration file in this repo** (confirmed by exhaustive grep across all 16 local `.sql` files) — Phase 52's own retrospective context notes migration 039 was "deleted from filesystem by a worktree merge but exists in git history," and the live DB was updated via `supabase db push`/Supabase MCP directly. The planner must budget a task to pull the *live* function definition (via Supabase MCP `execute_sql` — `SELECT pg_get_functiondef('admin_search_bookings'::regproc)`) before writing the migration that adds `p_status`, not just extend a local file that may not reflect production. Similarly, `types/database.types.ts` is already stale — it lacks `driver_price_czk`, `paid_at`, and `invoice_number` (added by migrations 052 and 051, confirmed by direct comparison) — yet nothing in the `bookings`-related code path imports the `Database` generic (`createSupabaseServiceClient()` returns an untyped client), so regenerating types is good hygiene but not load-bearing for this phase.

The second real risk is D-11's reconciliation landmine, and the fix is architecturally clean: replace the `ignoreDuplicates`-based idempotency gate (`inserted.length > 0`) with an atomic `UPDATE bookings SET status='confirmed', ... WHERE payment_intent_id=$1 AND leg=$2 AND status='unpaid' RETURNING id` — a single statement that is naturally idempotent (a Stripe retry hitting an already-`confirmed` row matches zero rows and correctly skips all side-effects) and requires no new locking or select-then-write race. This same pattern extends cleanly to round-trip's two-leg case, ideally via a small RPC mirroring `create_round_trip_bookings`'s atomicity guarantee.

The third risk is D-06's dedup mechanics: `Step6Payment.tsx`'s `useEffect` (deps: `[totalEur, selectedCurrency, promoCode, tripType, returnTime, roundTripPriceBreakdown]`) already re-fires `create-payment-intent` on currency toggle and promo apply, each time generating a **brand-new Stripe PaymentIntent AND a brand-new `bookingReference`** (both server-generated, non-deterministic). The retry-side UPDATE must therefore overwrite not just `payment_intent_id` but the row's entire mutable field set (amounts, `booking_reference`, promo) — otherwise the DB row silently diverges from the metadata on the currently-active PaymentIntent, and the eventual webhook reconciliation (which reads `meta.bookingReference` from Stripe, not the DB) will write a `booking_reference` that doesn't match whatever the admin UI displayed while the row was `unpaid`.

**Primary recommendation:** Add `attempt_id uuid` + index to `bookings` (D-06 discretion), generate it once per checkout entry in the Zustand store (persisted via existing `sessionStorage` middleware), pass it to `create-payment-intent`; in that route, `UPSERT ... ON CONFLICT (attempt_id, leg) DO UPDATE SET <all mutable fields>` gated to only touch rows where `status='unpaid'` (never touch an already-`confirmed` row); reconcile in the webhook via a status-gated `UPDATE ... WHERE status='unpaid' RETURNING id` keyed on `payment_intent_id` (already updated to the winning PI by the last retry), using the boolean "row count > 0" as the new side-effect gate in place of `inserted.length > 0`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attempt-id generation & persistence | Browser/Client (Zustand store) | — | Must survive currency-toggle re-renders and same-tab reload; sessionStorage-backed store already does this for other checkout fields |
| Unpaid row capture (INSERT/UPSERT) | API/Backend (`create-payment-intent` route) | Database (CHECK constraint, unique index) | Server resolves authoritative amounts/user_id here already (D-05); DB enforces the dedup key |
| Reconciliation (unpaid→confirmed) | API/Backend (Stripe webhook route) | Database (atomic UPDATE...WHERE...RETURNING) | Webhook is the only trusted source of "payment actually succeeded"; DB statement provides exactly-once semantics without app-level locking |
| Admin visibility/filter | Frontend Server + API/Backend | Database (RPC `admin_search_bookings`) | List rendering is a client component (`BookingsTable.tsx`) fed by a server RPC; filter param must round-trip through both |
| Status badge / transition graph | Browser/Client (`StatusBadge`, `BookingsTable`) | API/Backend (Zod enum + local `VALID_TRANSITIONS`) | Double-gated by existing convention (Phase 52) — UI and server maps must stay in sync manually, no shared import today |

## Standard Stack

No new libraries are introduced by this phase — it extends an existing Stripe + Supabase + Zod + Zustand stack already in `package.json`. All versions below are the currently-installed versions, confirmed by reading `package.json` directly (not re-verified against the npm registry since no new install is proposed).

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | ^21.0.1 [VERIFIED: package.json:42] | PaymentIntent creation, webhook signature verification | Already the payment provider; unchanged in this phase |
| `@supabase/supabase-js` | ^2.101.0 [VERIFIED: package.json:24] | DB writes via service-role client | Already the DB client; unchanged |
| `zod` | ^4.3.6 [VERIFIED: package.json:46] | Request validation, status enum | Already used for `createPaymentIntentSchema` and `bookingPatchSchema` |
| `zustand` (persist middleware) | in use, version not independently checked | Client-side booking state incl. `attempt_id` | Already the booking wizard's state store (`lib/booking-store.ts`) |
| `vitest` | ^4.1.1 [VERIFIED: package.json:73] | Test runner | Existing test suite convention (`vi.hoisted` pattern) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Status-gated `UPDATE...WHERE status='unpaid' RETURNING id` for reconciliation idempotency | A new `stripe_processed_events`-style claim table keyed on `(payment_intent_id, leg)` for the reconciliation step specifically | Rejected — the existing `stripe_processed_events` table already claims by `event.id` before `handle*Succeeded` runs; the additional risk window (crash between booking-save and event-claim, per the SEC-10 comment in the webhook) is exactly what the status-gated UPDATE closes for free, without a second table |
| A dedicated `/api/capture-booking` endpoint (rejected by D-05) | — | Not researched further — explicitly locked out by D-05 |
| Reusing `pending` status for unpaid (rejected by D-01) | — | Not researched further — explicitly locked out by D-01 |

**Installation:** None — no new packages.

## Package Legitimacy Audit

**N/A for this phase.** No external packages are introduced; this phase only extends existing routes, components, and DB migrations using the already-installed stack (`stripe`, `@supabase/supabase-js`, `zod`, `zustand`, all confirmed present in `package.json`). Skip the legitimacy gate.

## Architecture Patterns

### System Architecture Diagram

```
CLIENT (Step5Passenger → Step6Payment)
  │  Zod-validated firstName/lastName/email/phone already in Zustand store (persisted)
  │  attempt_id generated once, held in Zustand store (sessionStorage-backed)
  ▼
POST /api/create-payment-intent  (D-05 capture point)
  │  1. Zod-validate body, resolve authenticatedUserId (server-side)
  │  2. Compute authoritative amounts (outboundLegEur, returnLegEur, promo)
  │  3. stripe.paymentIntents.create({ amount, metadata: {...} })
  │  4. UPSERT bookings row(s): status='unpaid', keyed on (attempt_id, leg)
  │     — on 2nd+ call (retry/currency toggle): UPDATE existing unpaid row,
  │       overwrite payment_intent_id, booking_reference, amounts, promo
  │  5. Return { clientSecret, bookingReference, returnBookingReference }
  ▼
CLIENT confirms payment via Stripe Elements (Step6Payment PaymentForm)
  │  redirect (or same-tab) to /book/confirmation
  ▼
STRIPE → POST /api/webhooks/stripe   (payment_intent.succeeded)
  │  1. Dedup check: SELECT stripe_processed_events WHERE event_id=... (existing)
  │  2. handleOneWaySucceeded / handleRoundTripSucceeded:
  │     UPDATE bookings SET status='confirmed', ...
  │       WHERE payment_intent_id=$PI AND leg=$LEG AND status='unpaid'
  │       RETURNING id
  │     — rows returned > 0  → fresh reconciliation → fire side-effects
  │     — rows returned = 0  → already confirmed (Stripe retry) → skip
  │  3. Side-effects (only on fresh reconciliation, unchanged logic):
  │     sendClientConfirmation/sendRoundTripClientConfirmation
  │     sendManagerAlert/sendRoundTripManagerAlert
  │     scheduleQStashReminder (2h before pickup_utc)
  │     sendGa4Purchase (server-side, transaction_id = bookingReference)
  │  4. INSERT stripe_processed_events (event.id) — marks event handled
  ▼
ADMIN (BookingsTable.tsx via GET /api/admin/bookings)
  │  RPC admin_search_bookings(p_query, p_start_date, p_end_date, p_trip_type, p_status, p_offset, p_limit)
  │  — p_status='unpaid' → chip filter (D-08)
  │  — default "All" → unpaid rows shown inline, amber badge + row tint (D-09)
  │  PATCH /api/admin/bookings: unpaid→cancelled manual disposition (D-10)
```

### Recommended Project Structure

No new files/directories — this phase modifies existing files in place:

```
supabase/migrations/
└── 053_unpaid_booking_status.sql        # NEW — DROP+RECREATE CHECK + attempt_id column/index
app/api/create-payment-intent/route.ts   # MODIFIED — capture write after amount computation
app/api/webhooks/stripe/route.ts         # MODIFIED — reconciliation UPDATE replaces INSERT-only path
app/api/admin/bookings/route.ts          # MODIFIED — p_status param, VALID_TRANSITIONS + Zod enum
lib/supabase.ts                          # MODIFIED — buildBookingRow (unpaid status), new reconcile helper
lib/booking-transitions.ts               # MODIFIED — VALID_TRANSITIONS + UI_TRANSITIONS: unpaid entry
lib/booking-store.ts                     # MODIFIED — attemptId field + setter + reset + persist
components/booking/steps/Step6Payment.tsx # MODIFIED — attemptId generation + pass-through
components/admin/StatusBadge.tsx         # MODIFIED — unpaid variant + hex
components/admin/BookingsTable.tsx       # MODIFIED — filterChips, STATUS_LABELS, 3 cast sites, row tint
```

### Pattern 1: DROP+RECREATE CHECK constraint (verified pattern, migration 040)

**What:** Postgres CHECK constraints can't be altered in place to add an enum value; drop and recreate with the full value list.
**When to use:** Any time `bookings.status` gains a new allowed value.
**Example:**
```sql
-- Source: supabase/migrations/040_extended_booking_statuses.sql (read in full this session)
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'unpaid',
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'assigned',
    'en_route',
    'on_location'
  ));
```
`[VERIFIED: supabase/migrations/040_extended_booking_statuses.sql:11-24]` — exact statement quoted above is the migration this phase's constraint change must mirror; only the value list changes.

### Pattern 2: Status-gated atomic UPDATE for exactly-once reconciliation (new pattern for this phase)

**What:** Replace the "insert, check `inserted.length`" idempotency gate with an UPDATE whose WHERE clause encodes the idempotency condition directly.
**When to use:** Reconciling a pre-existing `unpaid` row to `confirmed` inside the webhook.
**Example (one-way leg):**
```typescript
// NEW pattern — replaces buildBookingRow + saveBooking(ignoreDuplicates) for the
// reconciliation path. The existing INSERT path (buildBookingRow/saveBooking)
// stays as a defensive fallback for the (should-not-happen) case where no
// unpaid row exists yet.
const { data, error } = await supabase
  .from('bookings')
  .update({
    status: 'confirmed',
    booking_type: 'confirmed',
    // any fields authoritative only at payment-confirmation time, if any
  })
  .eq('payment_intent_id', paymentIntent.id)
  .eq('leg', 'outbound')
  .eq('status', 'unpaid')
  .select('id')

const wasFreshReconciliation = !error && (data?.length ?? 0) > 0
// wasFreshReconciliation replaces `inserted.length > 0` as the side-effect gate
```
This is analogous to the existing `saveBooking`'s "empty array = duplicate, non-empty = fresh" contract `[VERIFIED: lib/supabase.ts:106-124]` (`saveBooking`'s own doc comment: *"Returns the inserted rows (one element) if the row was new, or an empty array if the row was a duplicate... which is the idempotency signal for the webhook to skip sending emails on Stripe retries"*), just applied to an UPDATE instead of an upsert-INSERT.

### Pattern 3: Double-gated status transitions (existing convention, THREE maps not two — verified this session)

**What:** Status transitions are enforced independently in more places than CONTEXT.md's canonical_refs implies. Reading the actual files this session found **three** separate transition maps, not two:

1. `app/api/admin/bookings/route.ts:17-25` — a **local, inline** `VALID_TRANSITIONS` const (server-authoritative, actually enforced against PATCH requests):
   ```typescript
   const VALID_TRANSITIONS: Record<string, string[]> = {
     pending:     ['confirmed', 'cancelled'],
     confirmed:   ['completed', 'cancelled', 'assigned'],
     assigned:    ['en_route', 'cancelled'],
     en_route:    ['on_location', 'cancelled'],
     on_location: ['completed', 'cancelled'],
     completed:   [],
     cancelled:   [],
   }
   ```
   `[VERIFIED: app/api/admin/bookings/route.ts:17-25]`

2. `lib/booking-transitions.ts:11-19` — a **separate, unused-by-the-API** `VALID_TRANSITIONS` export whose own docstring claims "API uses VALID_TRANSITIONS directly" — that claim is **stale**; the API route does not import from this file at all. Its values also **differ** (`confirmed: ['assigned', 'completed', 'cancelled']` vs. the API's `['completed', 'cancelled', 'assigned']` — same set, different order, cosmetically fine, but `assigned`/`en_route` additionally allow `'completed'` here and NOT in the API route's map — a genuine, pre-existing divergence):
   ```typescript
   export const VALID_TRANSITIONS: Record<string, string[]> = {
     pending:     ['confirmed', 'cancelled'],
     confirmed:   ['assigned', 'completed', 'cancelled'],
     assigned:    ['en_route', 'cancelled', 'completed'],
     en_route:    ['on_location', 'cancelled', 'completed'],
     on_location: ['completed', 'cancelled'],
     completed:   [],
     cancelled:   [],
   }
   ```
   `[VERIFIED: lib/booking-transitions.ts:11-19]`

3. `lib/booking-transitions.ts:23-27` — `UI_TRANSITIONS` (spreads map #2, overrides `confirmed`/`assigned`), which **is** what `BookingsTable.tsx` actually imports and renders in the status-change `<select>` (`import { UI_TRANSITIONS } from '@/lib/booking-transitions'` `[VERIFIED: components/admin/BookingsTable.tsx:16]`).

**Pitfall for this phase:** D-04 says add `unpaid: ['confirmed','cancelled']` to "`VALID_TRANSITIONS` (double-gated: both `app/api/admin/bookings/route.ts` server + `components/admin/BookingsTable.tsx` client)". Given the finding above, the plan must add the `unpaid` entry to **map #1** (the API's local const, for actual server enforcement) **and** to **map #2** in `lib/booking-transitions.ts` (source of `UI_TRANSITIONS`, which is what the UI dropdown actually reads) — not to a `VALID_TRANSITIONS` inside `BookingsTable.tsx` itself, because no such local map exists there; the client-side gate is `UI_TRANSITIONS`, imported. Two files, three places to edit map-wise (but only 2 files touched): `app/api/admin/bookings/route.ts` (map #1) and `lib/booking-transitions.ts` (map #2, which auto-flows into `UI_TRANSITIONS` via the spread unless `unpaid` also needs an override there — it doesn't, since D-04's transitions are the same for both admin-dropdown and API).

### Anti-Patterns to Avoid

- **Reusing `ignoreDuplicates: true` semantics for reconciliation:** `ignoreDuplicates` makes Postgres silently skip the conflicting row entirely — it cannot "flip" `unpaid → confirmed`, only skip-or-insert. Any code path that calls the existing `saveBooking()` unmodified against an already-existing `unpaid` row will silently no-op and lose the confirmation. Do not attempt to reconcile by tweaking `saveBooking`'s upsert options; use a genuine `UPDATE ... WHERE status='unpaid'`.
- **Trusting `types/database.types.ts` as the schema source of truth:** it is already stale by two migrations (051, 052) and none of the `bookings`-related code imports the `Database` generic type — do not assume regenerating it is required for correctness, and do not assume it reflects the live schema without independently checking migrations/live DB.
- **Assuming local `supabase/migrations/*.sql` files are the full migration history:** confirmed gaps exist (migration 039 was deleted by a worktree merge per Phase 52's own retrospective `52-CONTEXT.md:91`; `admin_search_bookings`'s creating migration is absent entirely). Before writing a migration that `ALTER`s a function or constraint whose defining SQL isn't in this repo, fetch the live definition first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exactly-once side-effects across webhook retries | A new in-memory or Redis lock, or a second claim table | The status-gated `UPDATE ... WHERE status='unpaid' RETURNING id` pattern (Pattern 2 above), layered on the existing `stripe_processed_events` event-id claim | Postgres row-level atomicity already gives exactly-once semantics for free; a second claim table duplicates existing protection and adds a new failure mode |
| Client-side unique attempt identity | A composite key derived from trip fields (origin+destination+pickupDate...) | A single `crypto.randomUUID()` generated once and persisted in the Zustand store | Trip fields can legitimately repeat across genuinely distinct attempts (same person books the same route twice); a random UUID is unambiguous and matches the existing `crypto.randomUUID()` usage already in this codebase for stop IDs (`lib/booking-store.ts:75`) `[VERIFIED: lib/booking-store.ts:75]` |

**Key insight:** The dedup and idempotency primitives this phase needs (atomic conditional UPDATE, UUID-keyed attempts) are standard Postgres/Stripe patterns already partially present in this codebase (the `(payment_intent_id, leg)` unique constraint + `ignoreDuplicates` upsert for the *original* insert-time idempotency). The phase's novelty is applying the same atomicity discipline to an UPDATE instead of an INSERT — no new abstraction is needed.

## Runtime State Inventory

> Trigger check: this phase is a status-vocabulary EXTENSION + capture-timing INVERSION, not a rename/refactor/migration of an existing string. The rename/refactor Runtime State Inventory protocol is scoped to renaming/refactoring an *existing* identifier across systems (DB keys, service configs, OS-registered names) — that does not apply here; this phase adds a new enum value and moves *when* a write happens, it does not rename anything. Documenting explicitly per protocol requirement:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | N/A — no existing data is being renamed; `unpaid` is a wholly new status value, no backfill of existing rows needed | None |
| Live service config | N/A — no external service (GNet, Datadog, Tailscale, etc.) references booking status strings by name outside this codebase, confirmed by `prestigoToGnetStatus()` in `lib/gnet-client.ts` which explicitly maps only `assigned/en_route/on_location` (Phase 52) — `unpaid` needs no GNet mapping since GNet-sourced bookings never go through the online checkout capture path | None |
| OS-registered state | None — this phase touches only DB rows, Next.js routes, and React components | None |
| Secrets/env vars | None — no new secret or env var is introduced | None |
| Build artifacts | None — no package rename, no build config change | None |

## Common Pitfalls

### Pitfall 1: `admin_search_bookings` RPC has no local migration file — editing "the migration" is a guess without live-schema verification

**What goes wrong:** A planner/executor searches `supabase/migrations/*.sql` for `CREATE OR REPLACE FUNCTION admin_search_bookings`, finds nothing (confirmed — exhaustive grep across all 16 files in this session returned zero matches), and either (a) writes a brand-new migration that recreates the function from a guessed definition (risking dropping columns/behavior the live function has that isn't visible from the call site), or (b) discovers `types/database.types.ts:1133-1146` which only documents the function's `Args`/`Returns` shape, not its SQL body.
**Why it happens:** Per Phase 52's own retrospective (`52-CONTEXT.md:91,93`): "Migration 039 (`gnet_bookings`) was deleted from filesystem by a worktree merge but exists in git history" and "Live DB applied via `supabase db push` — migration version `20260427130819` confirmed in Supabase MCP." This confirms the local `supabase/migrations/` directory has known, precedented gaps relative to the live schema.
**How to avoid:** Before writing the migration/RPC change for D-08, use the Supabase MCP tools (`list_tables`, and a raw `execute_sql` call: `SELECT pg_get_functiondef('admin_search_bookings'::regproc)`) to pull the live function body, then write a migration that starts from that verbatim definition and adds only the `p_status` parameter + WHERE clause. Do not guess the body from the TS `Args`/`Returns` shape alone.
**Warning signs:** If the executor cannot access Supabase MCP or a live DB connection, flag this as a blocking gap rather than guessing — a wrong `CREATE OR REPLACE FUNCTION` could silently drop search/pagination behavior currently relied on by the whole admin bookings list, not just the new filter.

### Pitfall 2: Duplicate migration number `044` already exists in this repo

**What goes wrong:** Both `044_content_media_bucket.sql` and `044_customer_profiles.sql` exist simultaneously `[VERIFIED: ls output, supabase/migrations/]`. This confirms migration numbering in this project is not strictly enforced/CI-checked (there is no `supabase/config.toml`, no linked local Supabase CLI project — confirmed by `find supabase -type d` returning only `migrations/`, and no `supabase` CLI installed in PATH). Sequential numbering is convention-only, not tooling-enforced.
**Why it happens:** Migrations are hand-named and applied ad hoc (via `supabase db push` against the remote project per Phase 52's note, or via Supabase MCP), not through a CLI-managed local Supabase project.
**How to avoid:** Confirmed via direct `ls` this session: the highest existing number is `052` (`052_bookings_driver_price.sql`), so this phase's migration should be named `053_...` regardless of the pre-existing `044` collision — do not attempt to "fix" the historical collision as part of this phase (out of scope).
**Warning signs:** None specific to this phase — just don't let the `044` collision cause confusion about which number is actually "next."

### Pitfall 3: Retry/currency-toggle regenerates BOTH `payment_intent_id` AND `booking_reference` — D-06's "update in place" must cover both

**What goes wrong:** `Step6Payment.tsx`'s `useEffect` (dependency array `[totalEur, selectedCurrency, promoCode, tripType, returnTime, roundTripPriceBreakdown]` `[VERIFIED: components/booking/steps/Step6Payment.tsx:347-348]`) re-POSTs to `create-payment-intent` on currency toggle or promo apply. Server-side, `bookingReference = generateBookingReference()` is called unconditionally on every POST `[VERIFIED: app/api/create-payment-intent/route.ts:268]` — there is no mechanism today to reuse a prior reference. If the retry-side UPDATE only overwrites `payment_intent_id` (as D-06's literal wording might be read) and leaves the row's `booking_reference` stale, the admin-visible unpaid row's reference will not match the Stripe metadata `bookingReference` on the currently-active PaymentIntent, and the eventual webhook reconciliation (which reads `meta.bookingReference` from Stripe, independent of the DB row) will silently overwrite it back to the correct value — but only at confirmation time, leaving the *unpaid* admin view showing a wrong/stale reference for however long the client is retrying.
**Why it happens:** `bookingReference` and `payment_intent_id` are generated together but are logically two separate values; D-06's phrasing ("UPDATE the existing unpaid row in place — including its `payment_intent_id`") calls out `payment_intent_id` explicitly but doesn't enumerate every other field that also changes per attempt (amounts, promo, `booking_reference`).
**How to avoid:** The retry-path UPDATE should overwrite the row's full mutable field set — everything `buildBookingRow` would compute for this metadata, not just `payment_intent_id`. Recommend the same builder function used for the original capture write be reused for the retry-update, keeping `status: 'unpaid'` pinned regardless of what `buildBookingRow`'s existing `bookingType` param would otherwise set.
**Warning signs:** Admin sees an unpaid row's booking reference visually "jump" only after payment succeeds, not during retries — sign the retry-update path is incomplete.

### Pitfall 4: `bookings.passengers` and `bookings.luggage` are NOT NULL with no DEFAULT — must be supplied at capture time even if the client hasn't fully filled them

**What goes wrong:** `types/database.types.ts`'s `Insert` type for `bookings` marks `passengers: number` and `luggage: number` as **required** (no `?`), unlike most other columns which are optional in the Insert shape `[VERIFIED: types/database.types.ts:100,106]` (`luggage: number` at line 100, `passengers: number` at line 106, both without `?`, contrasted with e.g. `hours?: number | null` at line 96 which does have `?`). If a capture write reaches `create-payment-intent` before these are populated in the wizard flow, the INSERT will violate NOT NULL.
**Why it happens:** These columns have no DB default, unlike e.g. `status` (implied default from historical schema) or `pickup_utc` (computed via `prestigo_text_to_utc`, confirmed by grep finding zero application-code writes to `pickup_utc` anywhere — it must be a generated column or trigger).
**How to avoid:** Not actually a risk in practice — `create-payment-intent`'s existing Zod schema already requires the client to send `passengers`/`luggage` as part of `bookingData` before this route runs at all (Step6Payment always sends `passengers: String(passengers)` / `luggage: String(luggage)` from the store, which default to `1`/`0` respectively `[VERIFIED: lib/booking-store.ts:12-13]`), and `buildBookingRow` already applies `parseInt(meta.passengers) || 1` / `parseInt(meta.luggage) || 0` fallbacks `[VERIFIED: lib/supabase.ts:83-84]`. Documented here as a confirmed non-issue, not a new gap — the existing fallback logic is sufficient for the unpaid capture write as long as it reuses `buildBookingRow`.
**Warning signs:** N/A — mitigated by existing code.

### Pitfall 5: `pending` status is not the same as `unpaid` — do not confuse the manual-booking (`ANEW`, Phase 64) `status: 'pending'` convention

**What goes wrong:** `app/api/admin/bookings/route.ts`'s manual-booking POST handler (Phase 64's foundation, already implemented) sets `status: 'pending'` for admin-created bookings without a payment link `[VERIFIED: app/api/admin/bookings/route.ts:478]`. A future engineer (or Phase 64's implementer) could mistakenly treat `pending` and `unpaid` as interchangeable "not yet paid" states, since both describe "no payment received." D-01 explicitly rejects this equivalence: `pending` means "admin-created, no payment link generated yet" (an operator-initiated booking), `unpaid` means "client reached checkout and abandoned/hasn't paid" (a client-initiated attempt). They have different origin, different transition graphs, and different admin filtering semantics.
**Why it happens:** Both are semantically "not paid" from a revenue-recovery perspective, inviting conflation.
**How to avoid:** Keep the two statuses' transition graphs and filter chips fully separate; do not let Phase 64 (`ANEW`) reuse the `unpaid` badge/filter for manually-created `pending` bookings, and do not let this phase's `unpaid → confirmed` transition accidentally also apply to `pending` rows.
**Warning signs:** A single "not paid" filter chip that silently mixes `pending` and `unpaid` rows in a future admin iteration.

## Code Examples

### buildBookingRow extension for unpaid capture (discretion item — extend vs. dedicated builder)

```typescript
// Source: existing lib/supabase.ts:62-104 (buildBookingRow), extended
// buildBookingRow already parameterizes status via a `bookingType` union;
// widening that union to include 'unpaid' is the minimal-diff approach
// consistent with D-06's discretion note ("extended to accept a status arg —
// it already takes bookingType").
export function buildBookingRow(
  meta: Record<string, string>,
  paymentIntentId: string | null,
  bookingType: 'confirmed' | 'quote' | 'unpaid'   // widened union
) {
  return {
    // ...unchanged fields...
    status: bookingType === 'confirmed' ? 'confirmed'
          : bookingType === 'unpaid'    ? 'unpaid'
          : 'pending',
    // ...
  }
}
```
`[VERIFIED: lib/supabase.ts:62-74]` — exact current signature and status-derivation ternary quoted/extended above; only the new `'unpaid'` branch is proposed, all other lines are the verbatim existing implementation.

### admin_search_bookings call site — exact params to extend (client call site verified)

```typescript
// Source: app/api/admin/bookings/route.ts:73-81 (verbatim, current)
const { data, error: dbError } = await supabase
  .rpc('admin_search_bookings', {
    p_query:      boundedSearch,
    p_start_date: startDate ?? null,
    p_end_date:   endDate ?? null,
    p_trip_type:  tripType ?? null,
    p_offset:     page * limit,
    p_limit:      limit,
  })
```
`[VERIFIED: app/api/admin/bookings/route.ts:73-81]` — add `p_status: statusFilter ?? null` here once the live RPC (Pitfall 1) is confirmed and extended to accept it. Corresponding `Args` type update also needed at `types/database.types.ts:1133-1146` (best-effort — not load-bearing per the earlier staleness finding, but keeps the type honest).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Booking row created only in the Stripe webhook, on `payment_intent.succeeded` | Booking row created in `create-payment-intent`, at the moment the client reaches the payment step; webhook reconciles in place | This phase (62) | Every checkout attempt becomes visible/followable, not just paid ones — the entire "does a booking exist" invariant shifts earlier in the funnel |
| `saveBooking()`'s `ignoreDuplicates: true` upsert is the ONLY idempotency mechanism for booking persistence | A second, complementary mechanism is added: status-gated `UPDATE ... WHERE status='unpaid'` for the reconciliation step specifically | This phase (62) | The original insert-time idempotency (`(payment_intent_id, leg)` unique constraint) is preserved unchanged for the (rare, defensive) case a row doesn't already exist; the new mechanism only applies to the "flip an existing unpaid row" case |

**Deprecated/outdated:** None — this phase does not remove or replace any existing pattern, it adds a new capture point earlier in the flow while preserving the existing webhook-insert path as a fallback.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `booking_type` column has no CHECK constraint (no migration file found locally defining one) and can safely take the value `'confirmed'` for an unpaid capture row (distinguishing "real booking attempt" from `'quote'`) | Code Examples / Migration | If a CHECK constraint on `booking_type` exists in the live DB restricting values, the capture INSERT would fail at runtime; verify via Supabase MCP alongside Pitfall 1's live-schema check |
| A2 | `pickup_utc` is populated by a DB-side trigger or generated column (never written by application code, confirmed by exhaustive grep of `lib/*.ts` and `app/api/**/*.ts`), so the unpaid capture insert does not need to explicitly compute it | Runtime State Inventory / Pitfall 4 | If `pickup_utc` actually requires an explicit application-level write that happens to always succeed today only because it's set in a migration-level trigger not yet located, an unpaid row could insert with `pickup_utc IS NULL`, breaking the QStash reminder scheduling logic that reads it post-reconciliation |
| A3 | The retry-path UPDATE should overwrite the full mutable field set (amounts, promo, `booking_reference`), not just `payment_intent_id` | Pitfall 3 | If the planner instead narrowly interprets D-06 as "update only `payment_intent_id`," the admin-visible unpaid row will show a stale `booking_reference`/amount during retries until webhook reconciliation corrects it — a UX/data-integrity gap, not a functional break |
| A4 | No CHECK constraint or NOT NULL default currently prevents `attempt_id` from being added as a new nullable `uuid` column with a supporting (non-unique or partial-unique) index, without requiring a backfill of existing rows | Dedup key design | If `attempt_id` needs a stricter uniqueness guarantee (e.g., a partial unique index scoped `WHERE status='unpaid'`) to safely support `ON CONFLICT`, the exact index definition needs to be worked out at implementation time — the mechanism (add nullable column + index) is sound regardless |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **What is the live SQL body of `admin_search_bookings`?**
   - What we know: its `Args`/`Returns` TypeScript shape (`types/database.types.ts:1133-1146`), and its call site (`app/api/admin/bookings/route.ts:73-81`).
   - What's unclear: the actual `SELECT`/pagination/search SQL inside the function body — no migration file defines it locally.
   - Recommendation: planner should insert an explicit task (before the migration-writing task) to pull the live definition via Supabase MCP `execute_sql` (`SELECT pg_get_functiondef('admin_search_bookings'::regproc)`), then write the `053_...sql` migration starting from that verbatim body plus the `p_status` addition.

2. **Does `bookings.booking_type` have a live CHECK constraint restricting its values?**
   - What we know: only `'confirmed'` and `'quote'` values are ever written by current application code (`lib/supabase.ts`, `app/api/admin/bookings/route.ts`).
   - What's unclear: whether a constraint exists (not found in any local migration) that would reject a third distinct value if one were chosen instead of reusing `'confirmed'` for capture rows.
   - Recommendation: reuse `'confirmed'` for `booking_type` on unpaid capture rows (this phase's `status` column, not `booking_type`, is what encodes "unpaid" — consistent with D-01's rationale for a dedicated status value over conflating dimensions); confirm no constraint blocks this via the same live-schema check as Open Question 1.

3. **Exact index/uniqueness strategy for `attempt_id`.**
   - What we know: `(payment_intent_id, leg)` has an existing unique constraint used for insert-time idempotency; `attempt_id` needs an analogous mechanism for update-in-place across retries where `payment_intent_id` itself changes.
   - What's unclear: whether the update should be a true `ON CONFLICT (attempt_id, leg) DO UPDATE` (requiring a unique index on `(attempt_id, leg)`, which raises the question of what happens to that uniqueness once the row transitions to `confirmed` and is no longer subject to further attempt-based updates) or a plain `SELECT` (by `attempt_id`+`leg`) followed by conditional `INSERT`/`UPDATE` (simpler, acceptable given this is a single-tab, low-concurrency client flow with no realistic double-submit race).
   - Recommendation: given the low concurrency (one client tab, sequential retries, not parallel), a `SELECT-then-INSERT-or-UPDATE` pattern gated by `WHERE status='unpaid'` on the UPDATE branch is simpler and sufficient — reserve the stricter `ON CONFLICT` unique-index approach only if the planner wants belt-and-suspenders protection against a genuine double-submit (e.g., double-click).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase project (remote) | All DB writes/reads | Not independently connectable from this research session (no `supabase` CLI, no `.env.local` readable per sandbox restriction) | — | Executor must use Supabase MCP tools (per the MCP server guidance available in this environment) to run live-schema checks (Pitfalls 1, Open Questions 1–2) |
| `supabase` CLI | Local migration linking | ✗ — not installed, no `supabase/config.toml` present | — | All migration application in this project already goes through Supabase MCP / `supabase db push` against the remote project directly, per Phase 52 precedent; no local CLI setup is required for this phase either |
| Stripe test/live keys | PaymentIntent creation in dev/test | Per project memory, `.env.local`'s Stripe key is a dead placeholder — live Stripe actions require a user-run script with the live key | Any Wave-0 tests must mock `stripe.paymentIntents.create` (existing pattern in `tests/create-payment-intent.test.ts`, `tests/webhooks-stripe.test.ts`) rather than hit a real Stripe sandbox |

**Missing dependencies with no fallback:** None — all gaps above have a documented fallback (Supabase MCP for live-schema checks, existing mock patterns for Stripe in tests).

**Missing dependencies with fallback:** Supabase CLI (fallback: MCP/`db push` as already practiced), live Stripe key (fallback: mocked tests, matches existing convention).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.1 `[VERIFIED: package.json:73]` |
| Config file | `vitest.config.ts` (jsdom environment, `tests/setup.ts`, `@` alias to repo root) `[VERIFIED: vitest.config.ts:1-16]` |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npx vitest run` |

Note: `package.json` has **no** `"test"` npm script defined `[VERIFIED: package.json scripts block, lines 8-14 — only dev/build/start/lint/prepare present]` — invoke `vitest` directly via `npx`, not `npm test`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ABND-01 | Unpaid row inserted on first `create-payment-intent` POST (one-way) | unit/integration | `npx vitest run tests/create-payment-intent.test.ts` | ✅ file exists — needs new test cases, mocks `lib/supabase` |
| ABND-01 | Unpaid rows (2) inserted for round-trip attempt | unit/integration | `npx vitest run tests/create-payment-intent.test.ts` | ✅ existing file, extend |
| ABND-02 | Row carries `status='unpaid'`; DB CHECK accepts the value | migration/manual (needs live DB) | Supabase MCP `execute_sql` verification post-migration | ❌ Wave 0 — no automated migration test harness in this repo |
| ABND-06 (dedup) | Retry with same `attempt_id` UPDATEs in place, does not create a 2nd row | unit | `npx vitest run tests/create-payment-intent.test.ts` | ✅ existing file, extend — mock the UPSERT/UPDATE call and assert single row targeted |
| ABND-06 (reconciliation) | `payment_intent.succeeded` on an `unpaid` row flips it to `confirmed` and fires exactly the 4 side-effects once | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ existing file — needs new test replacing/extending the `inserted.length > 0` mock assumption with the new UPDATE-based mock |
| ABND-06 (idempotency) | A duplicate Stripe webhook delivery for an already-`confirmed` row fires zero side-effects | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ existing file, extend |
| ABND-06 (round-trip) | Both legs reconcile atomically; side-effects fire once for the pair | unit | `npx vitest run tests/webhooks-stripe.test.ts` | ✅ existing file, extend |
| ABND-03 | `StatusBadge` renders `unpaid` variant with distinct styling | unit | `npx vitest run tests/` (find/extend a StatusBadge or BookingsTable test) | ❓ — grep did not confirm a dedicated `StatusBadge.test.ts`; check `tests/` at plan time |
| ABND-04 | GET `/api/admin/bookings?status=unpaid` threads `p_status` through to the RPC call | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ existing file (already has RPC-param assertion tests per Test 7 at line 244) — extend |
| ABND-04 | Admin PATCH accepts `unpaid → confirmed` / `unpaid → cancelled`, rejects other transitions | unit | `npx vitest run tests/admin-bookings.test.ts` | ✅ existing file, extend |
| ABND-05 | Passenger form (Step5) blocks progression without valid name/email/phone | existing coverage | (already covered by existing Step5Passenger Zod validation — confirm test exists, or add) | ❓ — check `tests/` for a Step5Passenger test at plan time |

### Sampling Rate

- **Per task commit:** `npx vitest run <changed-test-file>.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Confirm whether `tests/` has a `StatusBadge`-specific or `BookingsTable`-specific test file covering variant rendering — extend or create.
- [ ] Confirm whether `tests/` has Step5Passenger validation coverage for ABND-05 — likely exists given the Zod schema's maturity, but not independently located this session.
- [ ] No automated harness exists in this repo for verifying a live DB migration applied correctly (CHECK constraint accepts `unpaid`, `attempt_id` column/index present) — this is inherently a Supabase MCP / manual verification step, not a Vitest test. Document as a manual verification step in VALIDATION.md, not a missing test file.
- [ ] `create-payment-intent.test.ts` and `webhooks-stripe.test.ts` both use the `vi.hoisted` mock pattern for `@/lib/supabase` `[VERIFIED: tests/webhooks-stripe.test.ts:1-33]` — new mocks needed for whatever reconciliation helper is introduced (e.g., a new exported function replacing the `saveBooking`-based reconciliation call), following this exact pattern.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No change | `getAdminUser()` guard already in place on admin routes, unaffected by this phase |
| V3 Session Management | No change | Guest checkout / admin session model explicitly untouched per CONTEXT.md domain boundary |
| V4 Access Control | Yes | New `p_status` RPC param and PATCH transitions must remain behind the existing `getAdminUser()` guard (already the pattern for all admin bookings endpoints) `[VERIFIED: app/api/admin/bookings/route.ts:47-49, 100-102]` |
| V5 Input Validation | Yes | `attempt_id` (if sent as a request body field) must be validated as a well-formed UUID string in the existing `createPaymentIntentSchema` Zod object (`app/api/create-payment-intent/route.ts:47-67`) before use in a query — same pattern already applied to every other client-supplied field in that schema |
| V6 Cryptography | No change | `attempt_id` should use `crypto.randomUUID()` (already the codebase's convention for client-side ID generation, e.g. `lib/booking-store.ts:75`) — not a security-sensitive value (not a secret, not used for auth), so no additional cryptographic requirement beyond uniqueness |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-supplied `attempt_id` used to UPDATE an arbitrary existing booking row (IDOR-style) | Tampering / Elevation of Privilege | The UPDATE must be scoped `WHERE attempt_id=$1 AND leg=$2 AND status='unpaid'` — a client cannot use a guessed/stolen `attempt_id` to mutate a `confirmed` booking (status guard blocks it), and cannot exfiltrate another user's booking data through this path since the route only returns `{clientSecret, bookingReference, returnBookingReference}`, never the full row `[VERIFIED: app/api/create-payment-intent/route.ts:327-331]` |
| Attacker floods `create-payment-intent` with distinct `attempt_id`s to create many `unpaid` rows (queue-pollution DoS on the admin follow-up list) | Denial of Service | Existing rate limiting already applies to this route (`checkRateLimit('/api/create-payment-intent', getClientIp(req))` `[VERIFIED: app/api/create-payment-intent/route.ts:75-88]`) — no new mitigation required, but note this phase increases the "cost" of an unmitigated flood (each request now always writes a DB row, whereas previously only a successful payment did) |
| Stripe webhook signature bypass leading to fraudulent `unpaid → confirmed` flips | Spoofing | Unaffected — existing `getStripe().webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` signature verification `[VERIFIED: app/api/webhooks/stripe/route.ts:51]` gates all reconciliation logic, unchanged by this phase |

## Sources

### Primary (HIGH confidence — read directly this session)
- `app/api/create-payment-intent/route.ts` (full file, 339 lines) — capture insertion point, amount computation, Zod schema, metadata construction
- `app/api/webhooks/stripe/route.ts` (full file, 521 lines) — reconciliation surface, `handleOneWaySucceeded`/`handleRoundTripSucceeded`, `stripe_processed_events` idempotency, SEC-10 comment
- `lib/supabase.ts` (full file, 272 lines) — `buildBookingRow`, `saveBooking`, `buildBookingRows`, `saveRoundTripBookings`
- `app/api/admin/bookings/route.ts` (full file, 496 lines) — `VALID_TRANSITIONS`, Zod status enum, `admin_search_bookings` call, manual booking POST
- `components/admin/BookingsTable.tsx` (full file, 1702 lines) — `filterChips`, `STATUS_LABELS`, `UI_TRANSITIONS` import, 3 `StatusBadge` variant cast sites
- `components/admin/StatusBadge.tsx` (full file, 35 lines) — variant union + hex map
- `lib/booking-transitions.ts` (full file, 27 lines) — the divergence between server `VALID_TRANSITIONS` (route.ts) and this file's `VALID_TRANSITIONS`/`UI_TRANSITIONS`
- `components/booking/steps/Step6Payment.tsx` (full file, 556 lines) — `useEffect` retry trigger, dependency array, `bookingRef`/`returnBookingRef` local state
- `lib/booking-store.ts` (lines 1-187) — Zustand store shape, `partialize`, `sessionStorage` persistence, `crypto.randomUUID()` precedent
- `components/booking/steps/Step5Passenger.tsx` (grep + targeted reads) — Zod validation confirming ABND-05
- `types/database.types.ts` (lines 1-175, 1120-1200) — `bookings` Row/Insert/Update shapes, `admin_search_bookings` Args/Returns, staleness vs. migrations 051/052
- `supabase/migrations/040_extended_booking_statuses.sql` (full file) — DROP+RECREATE CHECK pattern source
- `supabase/migrations/045_bookings_user_id.sql`, `051_bookings_invoice_paid.sql`, `052_bookings_driver_price.sql`, `049_bookings_customer_rls.sql` (full files) — column history, RLS scope
- `.planning/milestones/v2.0-phases/52-extended-booking-statuses/52-CONTEXT.md` (full file) — migration-file-gap precedent, double-gate pattern precedent
- `.planning/phases/62-abandoned-unpaid-booking-capture/62-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (full files) — locked decisions, requirement IDs, project history
- `lib/analytics-server.ts` (lines 1-40) — GA4 server-side purchase dedup contract via `transaction_id`
- `components/booking/StickyBookingPanel.tsx` (grep) — confirms `begin_checkout` fires elsewhere, unaffected by this phase
- `lib/email-log.ts` (lines 1-40) — existing email-dedup pattern (not reused for webhook reconciliation, but confirms the codebase convention)
- `tests/webhooks-stripe.test.ts` (lines 1-60) — `vi.hoisted` mock pattern for `lib/supabase`/`lib/email`/`lib/qstash`
- `package.json`, `vitest.config.ts` — installed versions, test framework config, absence of `"test"` npm script
- Bash: `ls supabase/migrations/`, exhaustive `grep` across all migration files for `admin_search_bookings`/`search_bookings`/`payment_intent_id_leg_key` — confirmed absence/presence claims above

### Secondary (MEDIUM confidence)
- None — no external web sources were needed; this phase is entirely an extension of existing in-repo patterns, not a new external library integration.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all versions read directly from `package.json`
- Architecture: HIGH — every file this phase touches was read in full this session; the double-gate transition-map divergence and the missing `admin_search_bookings` migration were discovered by direct inspection, not assumed
- Pitfalls: HIGH for Pitfalls 1-2, 4-5 (directly verified); MEDIUM for Pitfall 3 (verified the useEffect dependency array and reference-regeneration behavior, but the "how it should be fixed" recommendation is a design proposal, not a verified existing pattern)

**Research date:** 2026-08-19
**Valid until:** 2026-09-18 (30 days — this is an internal-codebase research pass, not dependent on external library release cycles; re-verify the live-schema open questions (RPC body, `booking_type` constraint) at plan time regardless of date, since they depend on live DB state that could change independently)
