# Project Research Summary

**Project:** Prestigo v1.3 — Pricing & Booking Management
**Domain:** Premium chauffeur booking platform — additive feature expansion on existing Next.js 16 / Supabase / Stripe production system
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

Prestigo v1.3 extends a mature, production-grade chauffeur booking system rather than building from scratch. The existing stack (Next.js 16 App Router, Supabase, Stripe, TanStack Table, Tailwind CSS 4) already covers every v1.3 requirement — no new npm packages are needed. The four feature areas (booking management with status workflow, promo codes, pricing enhancements, and mobile admin) are all implementable with patterns already proven in the codebase.

The recommended approach is to prioritize the `bookings` table schema migration first, since the `status` column is a hard prerequisite for three of the four booking management features (status workflow, cancellation/refund, and manual booking creation). After that foundation, the pricing enhancements (zone OR-logic fix, holiday dates, minimum fare) can be built in any order as they are self-contained. The promo code system is the most complex feature, spanning three surfaces (admin CRUD, client wizard, server payment flow), and must be built as an integrated unit rather than incrementally.

The critical risks are all well-documented and preventable: a promo code race condition (two users simultaneously exhausting a single-use code) must be solved with an atomic Postgres UPDATE rather than a read-then-write pattern; manual bookings with no `payment_intent_id` must be guarded against the refund flow; and the zone OR-logic fix requires explicit unit tests for all four pickup/dropoff combinations before deploying, as a naming confusion in the existing helper function (`isOutsideAllZones`) makes the correct boolean logic non-obvious.

## Key Findings

### Recommended Stack

The existing stack is the complete v1.3 stack. No new dependencies are warranted. The Stripe SDK (`stripe` ^21.0.1) supports `stripe.refunds.create()` as-is; `react-day-picker` already supports multi-select mode for the holiday date picker admin UI; `@tanstack/react-table` supports responsive column hiding via `meta.className`; and Zod + react-hook-form cover all new form validation needs. The only notable external event is the release of `stripe` v22.0.0 on 2026-04-03 with breaking changes — the project must stay pinned to `^21.0.1` for the duration of v1.3 and schedule the upgrade separately.

**Core technologies (v1.3 delta only):**

- `stripe` ^21.0.1: `stripe.refunds.create({ payment_intent })` — already installed, no upgrade needed
- `@supabase/supabase-js` ^2.101.0: new `promo_codes` table, atomic `UPDATE ... RETURNING` pattern for race-safe usage increment
- `@tanstack/react-table` ^8.21.3: `meta.className` + Tailwind responsive classes for mobile admin tables
- `react-day-picker` ^9.14.0: `mode="multiple"` for holiday date multi-select in admin
- `zod` + `react-hook-form`: promo code admin CRUD forms and manual booking creation form

**What not to add:** No promo code npm libraries (custom Supabase table is simpler and gives full control), no headless UI library for mobile sidebar (two lines of `useState` + Tailwind transitions), no `date-fns` as a direct dependency (already available via `react-day-picker` peer dep), no `ag-grid` (TanStack Table with pagination is sufficient for this operator's booking volume).

### Expected Features

**Must have (v1.3 Core — table stakes for a production booking management system):**
- ZONES-06: Zone OR-logic fix — price shown if pickup OR dropoff is in any active zone (current AND-logic suppresses valid bookings)
- BOOKINGS-07: Booking status workflow (pending → confirmed → completed → cancelled) with server-side transition guard
- BOOKINGS-08: Cancellation with optional full Stripe refund from admin panel, confirmation modal required
- BOOKINGS-06: Manual booking creation for phone orders (no Stripe payment, `payment_intent_id` nullable)
- BOOKINGS-09: Operator notes textarea on booking detail, auto-saves on blur
- PRICING-07: Holiday dates configuration — calendar admin UI + auto-apply `holiday_coefficient` at price calculation
- PRICING-08: Minimum fare per vehicle class — extend `pricing_config` + enforce in `lib/pricing.ts`
- UX-01: Mobile-responsive admin panel (single 768px breakpoint; card layout below; hamburger sidebar)

**Should have (v1.3 Secondary — differentiators worth shipping in this milestone):**
- PROMO-01/02: Admin CRUD for promo codes (create with code string, discount %, expiry, usage limit; deactivate/delete)
- PROMO-03/04: Client promo entry in wizard (progressive disclosure "Have a promo code?" link) + server-side atomic validation before Stripe charge

**Defer to v2+:**
- Client self-service cancellation (requires client accounts — large scope change)
- SMS notifications on status change (Twilio integration cost/complexity; email is sufficient for Prague luxury market)
- Partial refund with custom amount (accounting ambiguity; operators use Stripe Dashboard for exceptional cases)
- Bulk booking status updates (single-booking review is the right premium-service norm)
- Promo code analytics and auto-expiry background jobs

### Architecture Approach

The v1.3 architecture follows the established v1.2 admin pattern: new API routes live under `/api/admin/[feature]/`, protected by the existing `getAdminUser()` guard. New admin pages extend `/app/admin/`. Database changes are additive migrations — a new `promo_codes` table, new columns (`status`, `operator_notes`, `booking_source`, `payment_intent_id` made nullable) on `bookings`, and new fields in the `pricing_config` JSONB. Holiday dates are best stored as a new key in `pricing_config` JSONB for v1.3 scope (no per-date metadata needed). The `bookings` table schema migration (adding `status`) is the single most dependency-heavy change and must land first.

**Major components (new or modified for v1.3):**

1. `/api/admin/bookings/[id]/refund` (POST) — server-side Stripe refund endpoint with status guard and typed error handling
2. `/api/admin/bookings/[id]` (PATCH) — status update with server-enforced transition state machine
3. `/api/admin/bookings/new` + `/api/promo/validate` — manual booking creation and promo validation endpoints
4. `promo_codes` Supabase table — with atomic `UPDATE ... WHERE current_uses < max_uses RETURNING id` pattern
5. `BookingsTable` (modified) — TanStack Table with responsive `meta.className` column collapse and status badge + action UI
6. Admin sidebar — hamburger toggle on mobile via `useState` + Tailwind `translate-x` transitions

### Critical Pitfalls

1. **Promo code race condition (over-redemption)** — Two concurrent users with a single-use code both pass a read-check before either increments; solution is a single atomic `UPDATE promo_codes SET current_uses = current_uses + 1 WHERE ... AND current_uses < max_uses RETURNING id`; perform this increment at PaymentIntent creation, not at client-side validation. Phase: PROMO-04.

2. **Refunding a manual booking with null payment_intent_id** — Manual bookings (phone orders) have no Stripe payment; passing `payment_intent: null` to Stripe throws. Guard the refund route: if `payment_intent_id IS NULL`, skip Stripe entirely and only update status. The admin UI must hide "Cancel + Refund" for manual bookings and show "Cancel" only. Phase: BOOKINGS-06 + BOOKINGS-08 must coordinate.

3. **Zone logic regression when fixing ZONES-06** — The existing helper is named `isOutsideAllZones` (returns `true` when outside). Applying OR-logic with a double-negated name causes developers to invert the condition incorrectly. Rename to `isInAnyZone`, write four explicit unit tests (pickup-in/dropoff-out, pickup-out/dropoff-in, both-in, both-out) before touching production. Phase: ZONES-06.

4. **Holiday date timezone midnight bug** — Comparing `new Date(pickupDate).toISOString().slice(0,10)` converts local Prague time to UTC, causing midnight bookings (00:00–01:00 CET) to compare against the previous UTC date. Solution: compare `pickupDate` string (local date as entered by user) directly against the holiday list — never UTC-convert a date-only string. Follow the existing `dateDiffDays` pattern in `lib/pricing.ts`. Phase: PRICING-07.

5. **Price mismatch — client sees discounted price, server charges full** — If the applied promo code is not passed in `bookingData` to `/api/create-payment-intent`, the server creates the PaymentIntent at full price. Server must independently re-validate the promo code and recompute the total; never trust a client-provided amount. Phases: PROMO-03 and PROMO-04 must ship as a single coordinated change.

## Implications for Roadmap

Based on combined research, the recommended phase structure is five phases ordered by schema dependencies, then feature complexity, then surface area.

### Phase 1: Schema Foundation + Zone Logic Fix

**Rationale:** The `bookings.status` column is a hard prerequisite for Phases 2 and 3 — it must land before any status UI, cancellation flow, or manual booking creation. The zone OR-logic fix (ZONES-06) is zero-dependency, zero-schema, and highest operator value per unit of effort — it belongs in Phase 1 to unblock correct pricing for the most common trip patterns. Landing both together means Phase 2 can begin immediately.
**Delivers:** Production-correct zone pricing; `status`, `operator_notes`, `booking_source` columns on `bookings`; `promo_codes` table created (empty); `payment_intent_id` made nullable; `holiday_dates` added to `pricing_config` JSONB schema.
**Addresses:** ZONES-06, schema prerequisites for BOOKINGS-06/07/08/09, PROMO-01 through PROMO-04, PRICING-07.
**Avoids:** Zone logic regression (write 4-case unit test suite before deploying ZONES-06 fix).

### Phase 2: Booking Status Workflow + Operator Notes

**Rationale:** With the `status` column in place, this phase adds the complete status management surface: status badge in the bookings table, transition dropdown (showing only valid next states), status-change emails via Resend, and the operator notes inline textarea. These are the table stakes every premium operator expects before considering the system production-ready.
**Delivers:** Admin can move bookings through the full lifecycle; clients receive confirmation and cancellation emails; operators can annotate every job.
**Addresses:** BOOKINGS-07, BOOKINGS-09.
**Avoids:** Invalid status transitions (enforce state machine in PATCH endpoint: `pending → confirmed|cancelled`, `confirmed → completed|cancelled`, terminal states for `completed` and `cancelled`).

### Phase 3: Manual Booking + Cancellation with Refund

**Rationale:** Both features depend on the `status` column (Phase 1) and share the same critical null-`payment_intent_id` edge case — they must be designed together even if built sequentially. Manual booking creation must decide the `booking_source` column value; the refund route must check that column. Building them in the same phase prevents the null-PI pitfall from falling through the cracks.
**Delivers:** Phone orders captured in the system at `/admin/bookings/new`; operator can cancel any booking with one-click Stripe refund from admin; refund modal prevents accidental double-click with confirmation step.
**Addresses:** BOOKINGS-06, BOOKINGS-08.
**Avoids:** Refunding null `payment_intent_id` (coordinate guard logic in both routes); refunding already-refunded PI (status guard: only `confirmed|pending` are eligible); add `charge.refunded` webhook handler for Stripe Dashboard refund sync.

### Phase 4: Pricing Enhancements (Holiday Dates + Minimum Fare)

**Rationale:** Both pricing features are independent of booking management changes. Holiday dates extend the existing pricing engine with a date-matching lookup; minimum fare adds floor logic after distance calculation. Both are isolated to `lib/pricing.ts` and `pricing_config`. Grouping them together minimises context switches and keeps the pricing engine stable for Phase 5 (promo codes, which also modify the price calculation path).
**Delivers:** Holiday coefficient auto-applied based on configured calendar dates; short trips priced at minimum fare floor; operator controls both from the admin pricing editor.
**Addresses:** PRICING-07, PRICING-08.
**Avoids:** Holiday timezone midnight bug (compare `pickupDate` string directly, never UTC-convert; follow existing `dateDiffDays` pattern).

### Phase 5: Mobile-Responsive Admin + Promo Code System

**Rationale:** Mobile admin (UX-01) is purely presentational — no API or schema changes — and is least likely to introduce regressions. Promo codes are the highest-complexity feature (three surfaces, atomic DB pattern, wizard integration, PaymentIntent amount adjustment) and should be last to benefit from stable foundational code. Both are grouped here because mobile testing naturally accompanies all other UI work completed in Phases 2–4.
**Delivers:** Admin usable at 375px (hamburger sidebar, card-layout bookings table below 768px, 44px touch targets); full promo code system end-to-end (admin CRUD, client wizard entry, server-side atomic validation, PaymentIntent amount adjustment).
**Addresses:** UX-01, PROMO-01, PROMO-02, PROMO-03, PROMO-04.
**Avoids:** Promo race condition (atomic UPDATE pattern in PROMO-04); price mismatch (promo code wired through Zustand store to create-payment-intent, server re-validates independently); mobile horizontal overflow (test at 375px in Chrome DevTools before sign-off).

### Phase Ordering Rationale

- Schema migrations must precede all feature work that reads or writes new columns; `status` is the most-depended-on change (affects 4 features).
- ZONES-06 is placed in Phase 1 because it is a zero-risk, high-value change that operators will notice immediately and that validates the pricing engine before riskier changes touch it.
- Manual booking and refund are paired (Phase 3) because the null-`payment_intent_id` edge case spans both; designing them separately risks the pitfall.
- Pricing enhancements (Phase 4) are isolated before promo codes (Phase 5) because promo codes also modify the price calculation path — a stable pricing engine reduces integration risk.
- Mobile admin is deferred to the final phase because it is additive and non-breaking; it also benefits from testing against all admin UI surfaces completed in earlier phases.

### Research Flags

Phases needing deeper research or careful design before implementation:
- **Phase 3 (Refund flow):** The interaction between admin-initiated refunds and Stripe-initiated refunds (via Dashboard) requires adding a `charge.refunded` webhook handler. The exact deduplication logic (idempotent UPSERT) warrants a brief design step before coding.
- **Phase 5 (Promo codes — PROMO-04):** The atomic PostgreSQL UPDATE pattern is well-understood, but wiring the promo code through the Zustand store, PaymentIntent creation, and webhook handler (for usage count sync) is a multi-step integration that benefits from a written data-flow plan before coding begins.

Phases with standard, well-documented patterns (can skip research-phase):
- **Phase 1 (Schema migrations):** Standard Supabase `ALTER TABLE` migrations following existing `supabase/migrations/` conventions.
- **Phase 2 (Status workflow UI):** TanStack Table badge + dropdown pattern; Resend email trigger on status change — both follow established codebase patterns.
- **Phase 4 (Pricing enhancements):** Extend existing `pricing_config` JSONB and `lib/pricing.ts`; patterns fully established in v1.2.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against official docs and GitHub releases on 2026-04-03; no new dependencies required |
| Features | HIGH | Existing system codebase analyzed directly; competitor feature set verified against QuanticaLabs, Moovs, LimoAnywhere; race condition risk backed by HackerOne disclosures |
| Architecture | HIGH | v1.2 architecture is production-confirmed; v1.3 additions follow established patterns from official Supabase SSR, Next.js App Router, and Stripe docs |
| Pitfalls | HIGH | Critical pitfalls (race condition, null PI, zone naming confusion, timezone bug) all verified against first-party sources (codebase analysis + official API docs) |

**Overall confidence:** HIGH

### Gaps to Address

- **`charge.refunded` webhook handler:** PITFALLS.md flags that admin-initiated refunds must be mirrored by a webhook handler so Stripe Dashboard refunds also update local status. The exact deduplication implementation is not specified — design this before Phase 3.
- **Stripe v22.0.0 upgrade path:** Documented in STACK.md; not blocking v1.3 but must be scheduled as a follow-on task immediately after v1.3 ships to avoid accumulating technical debt.
- **`date-fns` import risk:** `date-fns` is available as a `react-day-picker` peer dep, not a direct dependency. If `react-day-picker` ever changes its peer dep relationship, direct `date-fns` imports break silently. Use native `Date.toISOString().slice(0, 10)` for the holiday date comparison to eliminate this latent risk entirely.

## Sources

### Primary (HIGH confidence)
- Stripe Refunds API (official docs) — `stripe.refunds.create()` signature, `charge_already_refunded` error, `charge.refunded` webhook event
- stripe-node v22.0.0 Release Notes (GitHub) — breaking changes; async/await pattern unaffected
- Supabase `@supabase/ssr` official docs — `createServerClient`, `updateSession` middleware pattern
- Next.js App Router official docs — middleware, Server Components, Route Handlers
- TanStack Table v8 official docs — `meta.className` column visibility, manual pagination
- react-day-picker v9 official docs — `mode="multiple"` multi-select
- PostgreSQL JSON Types docs — JSONB for holiday dates storage
- Prestigo codebase (first-party) — `calculate-price/route.ts` zone logic, `lib/pricing.ts` `dateDiffDays` pattern, `lib/pricing-config.ts` cache pattern

### Secondary (MEDIUM confidence)
- QuanticaLabs Chauffeur Booking System — competitor feature set reference (status workflow, manual booking, holiday pricing)
- Moovs / LimoAnywhere — competitor feature set reference
- TanStack Table GitHub discussions #3259 — responsive column collapse community pattern
- DEV Community — TanStack Table responsive collapse implementation walkthrough
- Voucherify / Econsultancy — promo code UX best practices (progressive disclosure, inline validation)

### Tertiary (LOW confidence)
- Gitnux — chauffeur software market context (aggregator; used for market framing only)

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*
