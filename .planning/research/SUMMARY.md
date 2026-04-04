# Project Research Summary

**Project:** Prestigo v1.4 — Return Transfer Booking
**Domain:** Round-trip booking added to an existing Next.js / Supabase / Stripe chauffeur service
**Researched:** 2026-04-04
**Confidence:** HIGH

## Executive Summary

Prestigo v1.4 adds a single-session round-trip booking to a mature, production booking system. All four research areas confirm this milestone is purely additive: no new npm packages, no new external services, and no breaking changes to existing one-way bookings. The implementation is constrained by four architectural facts that shape the entire phase order: (1) the existing UNIQUE constraint on `payment_intent_id` must be replaced with a composite `(payment_intent_id, leg)` constraint before any webhook code changes; (2) both booking rows must be created atomically via a Postgres RPC because Supabase's JS client provides no multi-statement transactions; (3) the return leg distance is symmetric (same km as outbound, no second Google API call); and (4) all pricing recomputation stays server-side at PaymentIntent creation time, consistent with the established anti-tamper pattern.

The build is well de-risked because the codebase already contains the patterns this feature needs: a working RPC (`claim_promo_code`), an ICS generator, a Zustand store with sessionStorage `partialize`, and a Stripe webhook that is the sole writer to Supabase. The main engineering risk is not complexity but sequencing — five of the ten critical pitfalls occur when developers write webhook or payment code before the DB schema is correct. The recommended phase order enforces schema-first to eliminate that class of error entirely.

Three product decisions require operator input before or during implementation. These are not blockers for early phases but must be resolved before pricing and payment phases: (1) whether extras (child seat, meet & greet) charge on the outbound leg only or on both legs — research recommends outbound only; (2) whether the symmetric-distance assumption is acceptable or requires a second Google Routes API call; (3) how `quoteMode` interacts with the combined price in Step 3 when the user switches vehicle class after a round-trip price has already been fetched. These three questions are captured in the Open Questions section below.

---

## Key Findings

### Stack: No New Dependencies

The existing `package.json` covers all v1.4 needs. The four workstreams map onto existing infrastructure: the FK/RPC pattern for linked Supabase records, the metadata expansion for Stripe (35 keys total, well under the 50-key limit), RFC 5545 multi-VEVENT for two ICS events using the existing hand-written generator, and a single new numeric column on `pricing_globals` for the return discount. The only item requiring careful budgeting is Stripe metadata: with 35 keys and long Czech address strings, the 500-character-per-value limit needs a truncation guard on address fields before shipping.

**Core packages and their v1.4 roles:**
- `@supabase/supabase-js` ^2.101.0 — RPC call for atomic two-row insert; self-referential FK pattern; no upgrade
- `stripe` ^21.0.1 — combined amount in `paymentIntents.create()`; 35 metadata keys; partial refund via `amount` parameter
- `zustand` ^5.0.12 — 4 new return-leg state fields, additive; `partialize` updated to persist `returnPickupDate`/`returnPickupTime` only
- `react-day-picker` ^9.14.0 — second date/time block in Step 2; existing picker component reused
- `resend` ^6.9.4 — email template extended with a second leg section; two Google Calendar links generated

### Features: All P1 Items Are in Scope

Every must-have feature is achievable with the existing stack and architecture. The differentiator Blacklane does not offer — single-session round-trip in one payment — is the headline of this milestone, and the implementation avoids the anti-patterns that degrade premium UX: no re-entry of passenger details, no two Stripe charges, no joint-cancellation-only model.

**Must have (table stakes):**
- Round Trip as 6th trip type — entry point, Step 1 selector
- Return date and time collected in the same wizard session, with validation (return must be at least 1 hour after outbound)
- Return route auto-reversed from Step 1 inputs — no re-entry required
- Return leg priced server-side by the same pricing engine; night/holiday coefficients applied independently based on return datetime
- Return discount applied automatically from `return_discount_pct` in `pricing_globals`
- Combined price breakdown shown in Step 3: outbound + discounted return + extras
- Single Stripe PaymentIntent for the combined amount
- Webhook atomically creates two linked Supabase rows, each storing its own per-leg amount
- Confirmation email listing both legs with datetime, pickup, dropoff, and per-leg price
- Two ICS calendar events (one per leg) in the confirmation email
- Admin bookings list shows the return row with a "RETURN" badge linked to the outbound row
- Per-leg independent cancellation with Stripe partial refund of that leg's stored amount

**Should have (competitive differentiators — ship in v1.4 at low cost):**
- Transparent price split in Step 3: "Outbound: 1,200 CZK + Return: 1,080 CZK (10% off) = 2,280 CZK"
- Single booking reference with leg suffix: "PRST-2847-A / PRST-2847-B"
- Promo code applies to the combined total (no changes to the promo system needed)

**Defer to v1.x or v2+:**
- Return-leg datetime reschedule in admin — add if operators request it post-launch
- Per-leg extras selection — HIGH complexity, under 5% of real use cases
- Open-return / book-later flow — requires auth, deferred payment trigger, reminder flows

### Architecture: Three Structural Decisions Are Resolved

Research resolved three design questions with clear recommendations backed by direct codebase inspection. These are not open questions — treat them as implementation constraints.

**Decision 1 — Composite UNIQUE constraint, not suffix and not relaxed:**
Replace `UNIQUE (payment_intent_id)` with `UNIQUE (payment_intent_id, leg)` and add `leg TEXT NOT NULL DEFAULT 'outbound'`. The suffix approach (`pi_xxx_return`) destroys the semantic integrity of the column and breaks the `charge.refunded` handler's `.eq('payment_intent_id', realStripeId)` lookup. Relaxing the constraint entirely removes the idempotency guard against webhook replays. The composite unique is the only option that preserves all existing behavior while enabling two rows per PaymentIntent.

**Decision 2 — Atomic RPC for two-row insert:**
The webhook calls `supabase.rpc('create_round_trip_bookings', { p_outbound, p_return })` — a Postgres function that wraps both inserts in an implicit transaction. Two sequential JS `insert()` calls are not atomic: if the second fails after the first succeeds, an orphan outbound row exists with no return row and no automatic rollback. The `claim_promo_code` RPC validates this pattern is reliable in production.

**Decision 3 — Symmetric distance assumption:**
Return `distanceKm` equals outbound `distanceKm` — same road reversed, one Google Routes API call. The price difference from a second API call would be negligible for Prestigo's route types; the extra latency and quota cost are not justified. This assumption requires operator confirmation (see Open Questions).

**Components modified across 7 phases:**
1. `supabase/migrations/023_return_booking_fk.sql` — `leg` column, composite UNIQUE, `linked_booking_id`, `return_discount_pct` on `pricing_globals`, `create_round_trip_bookings()` RPC
2. `lib/booking-store.ts` + `types/booking.ts` — 4 new return-leg fields, 4 setters, `partialize` and `resetBooking` updated
3. `Step1TripType.tsx`, `Step2DateTime.tsx` — Round Trip tab, return date/time pickers with cross-field validation
4. `lib/pricing-config.ts`, `/api/calculate-price`, `Step3Vehicle.tsx` — return pricing with `returnDiscountPct`
5. `/api/create-payment-intent` — combined amount, 35 metadata keys, `returnBookingReference` generation
6. `/api/webhooks/stripe`, `lib/email.ts`, confirmation page — RPC call, two-leg email, two ICS events
7. Admin pricing editor + bookings list — `return_discount_pct` field, "RETURN" badge, per-leg cancel with partial refund

### Critical Pitfalls

The ten pitfalls cluster into three root causes. Addressing the root causes is more effective than patching pitfalls individually.

**Root cause A — Schema last instead of first:** The UNIQUE constraint silently swallows the second insert (`ignoreDuplicates: true` produces a no-op, not an error). If the webhook is written before the composite UNIQUE and `leg` column exist, return rows disappear with no log error. Fix: schema is Phase 1; no webhook code merges until the migration is confirmed on staging.

**Root cause B — Promo discount applied to partial totals:** The operator return discount (`returnDiscountPct`) is applied to the return base price before summing. The promo discount is applied once to `outboundTotal + returnBase`. Applying the promo per-leg double-discounts; computing `outboundTotal` alone before adding `returnBase` causes the client to pay more than the displayed price. Fix: document the computation order in a code comment in `create-payment-intent` and test with a known promo code before shipping.

**Root cause C — Refund logic assumes one row per PaymentIntent:** The cancel endpoint must pass `amount` (in cents, equal to the cancelled leg's stored `amount_eur`) to `stripe.refunds.create`. Without `amount`, Stripe refunds the full combined charge. The `charge.refunded` webhook handler must distinguish full refund (cancel both legs) from partial refund (cancel only the matching leg). Fix: the cancel endpoint and `charge.refunded` handler are updated in the same phase as admin UI — never deferred.

**Top 5 pitfalls by severity:**
1. **UNIQUE constraint swallows second insert silently** — Phase 1; composite UNIQUE with `leg` column
2. **Non-atomic sequential inserts leave orphan rows** — Phase 1; Postgres RPC
3. **Promo applied to wrong total** — Phase 5; document computation order, test before shipping
4. **Cancel endpoint issues full refund on partial cancel** — Phase 7; always pass `amount` to `stripe.refunds.create`
5. **`charge.refunded` bulk-cancels all rows on partial refund** — Phase 6; check `charge.amount_refunded < charge.amount` before cancelling

---

## Implications for Roadmap

### Phase 1: Database Schema
**Rationale:** The UNIQUE constraint and missing `leg` column are silent blocking constraints — other phases produce data loss, not errors, if this is missing. Must be verified on staging before any other phase begins.
**Delivers:** Migration `023_return_booking_fk.sql` with `leg` column, composite UNIQUE `(payment_intent_id, leg)`, `linked_booking_id` FK on `bookings`, `return_discount_pct` on `pricing_globals`, `create_round_trip_bookings()` RPC.
**Avoids:** Pitfalls 1 (UNIQUE conflict silent no-op), 2 (non-atomic inserts), 10 (missing FK for return row linkage)

### Phase 2: Types and Zustand Store
**Rationale:** Types and store are the interface contract between all wizard steps and API routes. Building UI or API code before the types compile produces cascading refactors. Fixing store fields and `partialize` before UI prevents stale state on page refresh.
**Delivers:** `TripType` union gains `'round_trip'`; `BookingStore` gains 4 return-leg fields and setters; `partialize` persists `returnPickupDate` and `returnPickupTime` only; `setTripType` clears return fields on trip-type switch; `resetBooking` resets all new fields.
**Avoids:** Pitfalls 5 (stale `returnDate` collision between Daily Hire and Round Trip), 6 (`partialize` missing new fields loses state on page refresh)

### Phase 3: Wizard UX — Step 1 and Step 2
**Rationale:** Step 1 (trip type selector) and Step 2 (return date/time with validation) have no server-side pricing dependencies. They can be built and visually reviewed before any API changes. Isolating wizard UX allows UX sign-off before pricing complexity is introduced.
**Delivers:** "Round Trip" tab in Step 1; conditional return date/time block in Step 2 with reversed-route display (read-only); cross-field validation — return datetime must be at least 1 hour after outbound datetime; inline error on violation.
**Avoids:** UX pitfall of return date field appearing for non-round-trip trip types; return datetime earlier than outbound being accepted silently

### Phase 4: Pricing Engine — Return Leg
**Rationale:** Pricing must be correct and independently verifiable before it is connected to real Stripe charges. The pricing extension and Step 3 combined price display are co-located because Step 3 is the sole consumer of the pricing API response.
**Delivers:** `returnDiscountPct` in `PricingGlobals` and `getPricingConfig()`; `/api/calculate-price` returns `returnPrices` alongside `outboundPrices` when `tripType === 'round_trip'`; night/holiday coefficients applied independently to the return leg based on its own datetime; Step 3 shows combined price breakdown per vehicle class.
**Uses:** Single `getPricingConfig()` call (not two); symmetric `distanceKm` for both legs; coefficient order: base × night_or_holiday → airport fee → (extras on outbound only) → × (1 − returnDiscountPct/100)

### Phase 5: Payment — PaymentIntent and Step 6
**Rationale:** Gated on verified pricing (Phase 4). The combined amount passed to Stripe derives directly from the pricing engine. This phase also generates the second booking reference and embeds all return metadata in the single PaymentIntent.
**Delivers:** Combined amount computation in `create-payment-intent`; all 35 metadata keys including return-leg fields with address truncation guard; `returnBookingReference` generation; Step 6 updated to display combined price summary; promo discount applied once to the combined total.
**Avoids:** Pitfall 2 (promo discount applied to wrong total), Pitfall 7 (metadata key or character limit exceeded)

### Phase 6: Webhook and Notifications
**Rationale:** The webhook is the sole writer to Supabase and the sole sender of confirmation emails. It must be built after schema (Phase 1), RPC, and PaymentIntent metadata (Phase 5) are all in place.
**Delivers:** `payment_intent.succeeded` detects `isRoundTrip === 'true'`, calls `create_round_trip_bookings` RPC, includes both references in emergency alert on RPC failure; `BookingEmailData` extended with `isRoundTrip`, `returnPickupDate`, `returnPickupTime`, `returnAmountCzk`; confirmation email shows Leg 1 + Leg 2 sections with two Google Calendar links; two VEVENT blocks in single `.ics` file; `charge.refunded` handler updated to distinguish partial from full refund before cancelling rows.
**Avoids:** Pitfalls 3 (non-atomic sequential inserts), 4 (partial refund fires `charge.refunded`, bulk-cancels all rows), 8 (email missing return leg)

### Phase 7: Admin — Pricing Editor and Bookings List
**Rationale:** Admin is a read/config layer with no upstream blocking dependencies beyond schema (Phase 1) and the `return_discount_pct` field (Phase 4). Can be built in parallel with Phase 5 in a team context. Must ship in the same release — operators need the "RETURN" badge before any round-trip bookings appear in production.
**Delivers:** `return_discount_pct` input in admin pricing editor (react-hook-form + Zod, same pattern as existing fields); "RETURN LEG" badge on return booking rows in the bookings list; linked outbound booking reference shown in expandable row; per-leg cancel modal showing leg-specific refund amount with sibling-leg warning; cancel endpoint updated to issue Stripe partial refund for the cancelled leg's stored `amount_eur` only.
**Avoids:** Pitfall 3 (full refund on partial cancel — pass `amount` to `stripe.refunds.create`), Pitfall 9 (admin shows orphan rows with no linkage indication)

### Phase Ordering Rationale

The order is enforced by three hard dependency chains:
- **Schema before webhook:** Composite UNIQUE and RPC must exist before the webhook is modified — silent data loss otherwise, no error signal.
- **Types before UI:** Wizard steps read from the Zustand store; the store must be typed correctly before component props are defined to avoid cascading refactors.
- **Pricing before payment:** The combined Stripe charge amount derives from the pricing engine; pricing must be verified independently before any real charges are created.

Phase 7 (Admin) has no strict dependency on Phases 5 or 6 beyond the schema and `return_discount_pct`, making it a candidate for parallelism in a team build. In a solo build, sequential after Phase 6 is the safe path.

### Research Flags

**Phases with well-documented patterns — no additional research needed:**
- Phase 1 — PostgreSQL composite UNIQUE and self-referential FK are standard; migration SQL is fully written in STACK.md and ARCHITECTURE.md
- Phase 2 — Additive Zustand store changes following a documented pattern; `partialize` checklist fully specified in PITFALLS.md
- Phase 3 — Extending existing step components; react-day-picker reuse; conditional rendering
- Phase 5 — Metadata keys counted and verified (35 of 50 limit); combined amount formula documented in STACK.md and ARCHITECTURE.md
- Phase 6 — ICS multi-VEVENT is 30 lines; RPC call pattern validated by `claim_promo_code` in production

**Phases warranting a targeted code check before implementation:**
- Phase 4 — Inspect `Step3Vehicle.tsx` and the current `quoteMode` fetch behavior before implementing the combined price display. If `quoteMode` triggers a re-fetch on vehicle-class change, both outbound and return prices must be re-fetched together. The exact behavior is not described in the research files.
- Phase 7 — Verify Stripe's behavior when `stripe.refunds.create` is called with an `amount` that exceeds the remaining refundable balance on a PaymentIntent (e.g. if a prior refund was already issued). Confirm in Stripe docs before building the partial-cancel endpoint.

---

## Open Questions Requiring Operator Decision

Must be resolved before Phases 4-5 begin.

| # | Question | Research default | Impact if changed |
|---|----------|-----------------|-------------------|
| 1 | Do extras (child seat, meet & greet, extra luggage) charge on the outbound leg only, or on both legs? | Outbound only — a child seat is rented once; airport meet & greet applies to the arrival leg | If "both legs": extras are doubled in the combined amount; pricing formula changes; email and price breakdown must list extras per leg |
| 2 | Is symmetric distance (return km = outbound km) acceptable, or is a second Google Routes API call required for accuracy? | Symmetric — negligible price difference for Prestigo's routes; saves quota and latency | If "second API call": `calculate-price` makes two Google requests; response latency increases; `returnDistanceKm` becomes a distinct value from `distanceKm` |
| 3 | How should `quoteMode` behave when the user switches vehicle class in Step 3 on a round-trip booking? | Re-fetch both outbound and return prices together on vehicle-class switch | If "return price fixed on first fetch": stale return price shown after class change; visible inconsistency in the price breakdown |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against official Stripe docs (key limits, partial refund API), official Supabase docs (FK, RPC, cascade behavior), RFC 5545, and live codebase. No training-data inference. |
| Features | HIGH / MEDIUM | Must-have features confirmed against Blacklane official documentation and live codebase. Transfeero return-toggle pattern is MEDIUM — direct fetch returned 403; verified via search result summaries only. |
| Architecture | HIGH | All integration points verified against live source files. The UNIQUE constraint issue, `ignoreDuplicates: true` no-op behavior, `charge.refunded` semantics, and `partialize` opt-in list all confirmed in actual code. |
| Pitfalls | HIGH | All 10 pitfalls derived from direct codebase inspection. Recovery cost estimates are based on actual system behavior, not generic patterns. |

**Overall confidence: HIGH**

### Gaps to Address

- **`quoteMode` interaction in Step 3** — inspect `Step3Vehicle.tsx` before implementing Phase 4 to confirm re-fetch behavior on vehicle-class switch.
- **Extras-per-leg policy** — confirm with operator before Phase 4; pricing formula and email template both depend on this decision.
- **Symmetric distance acceptability** — confirm with operator before Phase 4; if a second Google API call is required, the `calculate-price` response shape gains a distinct `returnDistanceKm` field.
- **PostgREST self-referential FK query behavior** — medium confidence from a GitHub issue thread; keep admin queries flat (two separate `select()` calls, not nested joins) until validated on staging.

---

## Sources

### Primary (HIGH confidence)
- Stripe Metadata docs — 50-key / 500-char / 40-char-key limits
- Stripe Create PaymentIntent API — `amount`, `currency`, `metadata` parameters
- Stripe Refunds API — `stripe.refunds.create({ payment_intent, amount })` for partial refunds
- Stripe charge object reference — `charge.refunded` vs `charge.amount_refunded` for partial refund detection
- Supabase Tables and Data docs — FK relationships, self-referential FK setup
- Supabase Cascade Deletes docs — `ON DELETE SET NULL` behavior
- RFC 5545 iCalendar Specification — multiple VEVENT blocks in a single VCALENDAR confirmed valid
- Blacklane Help Center — official confirmation that Blacklane requires two separate transactions for round-trip
- Live codebase inspection (2026-04-04) — `lib/supabase.ts`, `lib/booking-store.ts`, `types/booking.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/create-payment-intent/route.ts`, `app/api/calculate-price/route.ts`, `app/api/admin/bookings/cancel/route.ts`, `lib/email.ts`, `lib/pricing-config.ts`, `components/booking/steps/Step2DateTime.tsx`

### Secondary (MEDIUM confidence)
- Transfeero booking guide — return toggle pattern inferred from search summaries (direct fetch returned 403)
- QuanticaLabs Chauffeur Booking System docs — return-leg pricing rule industry patterns
- WordPress.org community thread (QuanticaLabs plugin) — return discount not standard out-of-box in existing chauffeur platforms
- PostgREST self-referential FK ambiguity — GitHub issue supabase/supabase#6329

---

*Research completed: 2026-04-04*
*Ready for roadmap: yes*
