---
phase: 64-admin-created-bookings-with-payment-link
plan: 02
subsystem: payments
tags: [stripe, payment-links, webhooks, round-trip, resend, admin-bookings, email]

requires:
  - phase: 64-admin-created-bookings-with-payment-link
    provides: "createBookingPaymentLink, reconcileBookingByIdToConfirmed, sendPaymentRequestEmail, handlePaymentLinkSucceeded (linkedBookingId param accepted-but-unused tracer) — Plan 01"
provides:
  - "POST /api/admin/bookings/[id]/payment-link — D-05 attach-later route (generate + resend)"
  - "Round-trip sibling detection keyed on shared payment_intent_id, with combined-amount + covers-both-legs email framing"
  - "handlePaymentLinkSucceeded round-trip branch — reconciles BOTH legs of a payment-link pair with one combined confirmation"
affects: [64-03-admin-ui, 64-04-live-schema-and-webhook-subscription]

actuals:
  tokens: 10400
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Dedicated [id]/payment-link route sets status directly (bypasses VALID_TRANSITIONS) — same convention as [id]/assign/route.ts"
    - "Round-trip sibling detection keys on shared payment_intent_id, never linked_booking_id (no insert path populates that column)"
    - "Webhook round-trip reconciliation: two independently status-gated reconcileBookingByIdToConfirmed calls, union determines newly-reconciled, ONE combined client confirmation, QStash reminder per leg with its own pickup_utc"

key-files:
  created:
    - app/api/admin/bookings/[id]/payment-link/route.ts
    - tests/admin-bookings-payment-link.test.ts
  modified:
    - app/api/webhooks/stripe/route.ts
    - lib/email.ts
    - tests/webhooks-stripe-checkout-session.test.ts

key-decisions:
  - "D-05 attach-later: pending bookings flip status='unpaid' directly inside the dedicated route, bypassing VALID_TRANSITIONS (no pending->unpaid edge exists) — same pattern [id]/assign/route.ts already uses for its own state changes (RESEARCH Pitfall 2, planner_decision resolved (a))"
  - "Round-trip sibling detection queries by shared (stale) payment_intent_id + opposite leg + status='unpaid' — linked_booking_id is never written by any insert path in this codebase, so it cannot be relied on"
  - "[Deviation, Rule 1] The return leg's amount_eur is always persisted NULL (lib/supabase.ts buildBookingRows); generating a link directly on the return leg would otherwise send Stripe unit_amount: NaN. Fixed by falling back to the sibling outbound leg's amount_eur (which already holds the combined round-trip total) — computed once up front and shared by both the generate and resend paths"
  - "Resend is its own code path (D-07/Pitfall 5) — calls sendPaymentRequestEmail directly, never routes through logEmail, so a resend within the 10-minute dedup window is never silently swallowed"
  - "Webhook round-trip reconciliation fires the confirmation side-effect suite (client confirmation, manager alert, GA4 purchase) exactly ONCE for the pair, sourced from whichever row(s) newly reconciled — never two client emails, matching handleRoundTripSucceeded's existing one-confirmation convention. QStash reminder is the one exception: it fires PER reconciled leg since outbound/return have different pickup times"

patterns-established:
  - "PaymentRequestEmailData.coversBothLegs — a round-trip payment-link email shows the combined EUR amount and a 'covers both legs' notice instead of implying a per-leg charge (UI-SPEC E4 zero-one-many)"

requirements-completed: [ANEW-02, ANEW-03, ANEW-04]

coverage:
  - id: D1
    description: "D-05 attach-later route: operator generates a payment link for an existing unpaid/pending booking; pending flips to unpaid directly (bypassing VALID_TRANSITIONS); rejects confirmed/cancelled bookings and bookings that already have a link; leaves the row untouched on a Stripe failure"
    requirement: ANEW-02
    verification:
      - kind: unit
        ref: "tests/admin-bookings-payment-link.test.ts (14 tests: auth guard, generate unpaid/pending, reject confirmed/existing-link, Stripe-failure no-half-state, 404)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Round-trip sibling detection (shared payment_intent_id) carries linkedBookingId into the payment link's metadata; combined EUR amount (with return-leg amount_eur NULL fallback to the sibling's) and a 'covers both legs' notice in the payment-request email — for both the initial generate and the explicit resend, which bypasses the logEmail dedup window by design"
    requirement: ANEW-03
    verification:
      - kind: unit
        ref: "tests/admin-bookings-payment-link.test.ts (round-trip sibling found/not-found, return-leg amount fallback, resend bypasses logEmail)"
        status: pass
    human_judgment: false
  - id: D3
    description: "checkout.session.completed with metadata.linkedBookingId reconciles BOTH legs to confirmed with the shared payment_intent_id, fires the confirmation side-effect suite exactly once for the pair (never two client emails), schedules a QStash reminder per reconciled leg with its own pickup_utc, and no-ops when both legs are already confirmed; duplicate event delivery still short-circuits before any reconcile call; one-way payment_intent.succeeded path unaffected"
    requirement: ANEW-04
    verification:
      - kind: unit
        ref: "tests/webhooks-stripe-checkout-session.test.ts (9 tests, TDD RED->GREEN c61f714->fb08842)"
        status: pass
      - kind: unit
        ref: "tests/webhooks-stripe.test.ts (31 tests, regression guard — payment_intent.succeeded path unaffected)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-24
status: complete
---

# Phase 64 Plan 02: Admin-Created Bookings with Payment Link — Attach-Later + Round-Trip Summary

**D-05 attach-later `[id]/payment-link` route (generate + resend, status set directly) plus round-trip payment-link support: shared-`payment_intent_id` sibling detection with combined-amount email framing, and a webhook branch that reconciles both legs of a round-trip pair with one combined confirmation.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-24T16:36:42Z (approx., following Plan 01)
- **Completed:** 2026-08-24T16:54:02Z
- **Tasks:** 2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `POST /api/admin/bookings/[id]/payment-link` (new route, mirrors `[id]/assign/route.ts`): generates a payment link for an already-saved `unpaid`/`pending` booking, setting `status='unpaid'` directly (bypasses `VALID_TRANSITIONS`, which has no `pending→unpaid` edge); rejects `confirmed`/`cancelled` bookings and bookings that already carry a `payment_link_url` (never mints a second URL); a Stripe failure returns an error without touching the booking row (retry-safe).
- Round-trip sibling detection: when generating a link for a `leg='outbound'|'return'` booking with a (stale) `payment_intent_id`, the route looks up the opposite-leg sibling sharing that same `payment_intent_id` and status `unpaid`, carrying its id as `linkedBookingId` into `createBookingPaymentLink`'s metadata.
- Deviation fix: the return leg's `amount_eur` is always persisted `NULL` (a pre-existing data-model fact in `buildBookingRows`) — generating a link directly on the return leg would have sent Stripe `unit_amount: NaN`. Fixed by computing the sibling lookup once, up front, and falling back to the sibling's `amount_eur` (the outbound leg's combined total) whenever the current leg's own is null. Both the generate and resend paths share this computed value, and `sendPaymentRequestEmail` now renders a "covers both legs" notice with the combined EUR figure (`PaymentRequestEmailData.coversBothLegs`), never a many-item list (UI-SPEC E4 zero-one-many).
- Resend action (`POST .../payment-link { resend: true }`) is its own code path — calls `sendPaymentRequestEmail` directly, never through `logEmail`, so an operator resending within the 10-minute dedup window is never silently swallowed (D-07).
- `handlePaymentLinkSucceeded` (webhook, `app/api/webhooks/stripe/route.ts`) now reconciles BOTH the primary and the `linkedBookingId` sibling to `confirmed` with the same `payment_intent_id` — two independently status-gated `reconcileBookingByIdToConfirmed` calls, so a retry is a no-op per leg. The confirmation side-effect suite (client confirmation, manager alert, GA4 purchase with the combined amount across whichever leg(s) newly reconciled) fires exactly ONCE for the pair; a QStash reminder is scheduled per reconciled leg since outbound/return have different pickup times. An already-confirmed pair (both reconcile calls return `[]`) fires zero side-effects.

## Task Commits

1. **Task 1: D-05 attach-later route + resend + round-trip sibling metadata** - `5ea87da` (feat)
2. **Deviation fix: round-trip combined amount + covers-both-legs email framing** - `6a8ed81` (fix)
3. **Task 2 RED: failing test for round-trip linkedBookingId reconciliation** - `c61f714` (test)
4. **Task 2 GREEN: round-trip linkedBookingId reconciliation implementation** - `fb08842` (feat)

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: Task 2 carried `tdd="true"` — the RED (`c61f714`) and GREEN (`fb08842`) commits are the required gate pair; no REFACTOR commit was needed (the GREEN implementation was already clean)._

## Files Created/Modified

- `app/api/admin/bookings/[id]/payment-link/route.ts` - POST: generate/resend, status guard, round-trip sibling detection + amount fallback, direct status set
- `app/api/webhooks/stripe/route.ts` - `handlePaymentLinkSucceeded` extended to reconcile the `linkedBookingId` sibling and fire one combined side-effect suite
- `lib/email.ts` - `PaymentRequestEmailData.coversBothLegs` + "covers both legs" notice block in `buildPaymentRequestHtml`
- `tests/admin-bookings-payment-link.test.ts` (new) - 14 tests: auth guard, generate/resend, round-trip sibling + amount fallback, Stripe-failure safety, ANEW-05 no-link invariant (via the main POST route)
- `tests/webhooks-stripe-checkout-session.test.ts` - 4 new tests (round-trip reconcile both legs, already-confirmed pair, sibling-only-reconciles, duplicate-delivery short-circuit) — 9 tests total, all green

## Decisions Made

- Planner decision (RESEARCH Open Question 1, resolved (a), plan-locked): the `[id]/payment-link` route sets `status='unpaid'` directly for a `pending` source booking, bypassing `VALID_TRANSITIONS` — no edit to either transition map was needed.
- [Rule 1 - Bug, found during Task 1 while cross-checking UI-SPEC.md's E4 must-have] The return leg's `amount_eur` is always `NULL` in this codebase's data model — fixed via a sibling-amount fallback, shared by generate and resend.
- Round-trip webhook reconciliation: ONE combined client confirmation/manager alert/GA4 purchase for the pair (never two), but QStash reminders fire per-leg (each leg has its own `pickup_utc`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Round-trip payment link on the RETURN leg would send Stripe `unit_amount: NaN`**
- **Found during:** Task 1, cross-checking `64-UI-SPEC.md`'s "Copywriting Contract" / E4 zero-one-many row (listed in the task's `<read_first>` but not fully internalized before the first implementation pass) against the already-committed route
- **Issue:** `lib/supabase.ts`'s `buildBookingRows` always persists the RETURN leg's `amount_eur` as `NULL` (only the OUTBOUND leg carries the combined round-trip total, from `meta.amountEur` at original checkout time). The route's first pass used `booking.amount_eur` directly for `createBookingPaymentLink`'s `amountEur` param — correct for the outbound leg, but `Math.round(null * 100)` → `NaN` for a link generated directly on the return leg, which would have failed the Stripe API call. Separately, the UI-SPEC's E4 row requires the payment-request email to show a combined amount and "covers both legs" framing, which the first pass didn't implement at all.
- **Fix:** Round-trip sibling detection was hoisted to run once, before the resend/generate branch split, and now also selects `amount_eur`. A fallback chain (`booking.amount_eur ?? sibling.amount_eur ?? 0`) computes `effectiveAmountEur`, used by both `createBookingPaymentLink` and `sendPaymentRequestEmail` on both paths. `PaymentRequestEmailData` gained `coversBothLegs`, rendered as a notice in `buildPaymentRequestHtml`.
- **Files modified:** `app/api/admin/bookings/[id]/payment-link/route.ts`, `lib/email.ts`, `tests/admin-bookings-payment-link.test.ts`
- **Verification:** New test "generating from the RETURN leg (amount_eur NULL) falls back to the sibling outbound leg amount — never NaN" plus updated round-trip generate test asserting `amountEur: 150` (combined) and `coversBothLegs: true`. `npx vitest run tests/admin-bookings-payment-link.test.ts` — 14/14 pass.
- **Committed in:** `6a8ed81` (separate deviation-fix commit, following the original `5ea87da` Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug).
**Impact:** Necessary for correctness of round-trip link generation (a NaN Stripe amount would have hard-failed the API call) and to satisfy the plan's own must-have truth about combined-amount / covers-both-legs email framing (UI-SPEC E4). No scope creep — the fix only touched the round-trip branch of Task 1's own route and its own email data shape.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for this plan. (Live Stripe Dashboard webhook subscription to `checkout.session.completed` and live migration 056 application remain explicitly deferred to Plan 64-04's `[BLOCKING]` human-action tasks, per Plan 01.)

## Known Stubs

None — every deliverable in this plan is fully wired (no hardcoded empty values, no placeholder UI text, no unimplemented branches). The admin UI surfaces (row-level "Generate payment link" button, result panel, resend control) that will call this route are Plan 03's declared scope, not a stub here.

## Next Phase Readiness

Ready for Plan 03 (admin UI: `BookingsTable.tsx` row-level "Generate payment link" action, `ManualBookingForm.tsx` collect-payment toggle + result panel), which calls `POST /api/admin/bookings/[id]/payment-link` built in this plan, and Plan 04 (live migration 056 application + Stripe Dashboard `checkout.session.completed` webhook subscription — both `[BLOCKING]` human-action tasks).

No blockers.

---
*Phase: 64-admin-created-bookings-with-payment-link*
*Completed: 2026-08-24*

## Self-Check: PASSED

- All created/modified files verified present on disk with `[ -f ]`.
- All 4 task commits (`5ea87da`, `6a8ed81`, `c61f714`, `fb08842`) verified present via `git log --oneline --all`.
- Targeted verification suite green: `npx vitest run tests/admin-bookings-payment-link.test.ts tests/webhooks-stripe-checkout-session.test.ts tests/webhooks-stripe.test.ts` — 54/54 tests pass (14 + 9 + 31).
- `npx tsc --noEmit` clean (no new errors; the same 4 pre-existing unrelated errors from Plan 01 — `tests/account-trips.test.tsx`, `tests/gnet-farmin.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts` — confirmed present before this plan).
- Full suite (`npx vitest run`) shows the identical 66 pre-existing failures across the identical 12 unrelated test files documented in Plan 01's `deferred-items.md` — no new failures introduced by this plan.
- Route does not import `VALID_TRANSITIONS` — verified via `grep -n "VALID_TRANSITIONS" app/api/admin/bookings/[id]/payment-link/route.ts` (only comment references, no import).
- TDD gate sequence verified: `test(64-02)` commit (`c61f714`) precedes `feat(64-02)` commit (`fb08842`) for Task 2.
