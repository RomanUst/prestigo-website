---
phase: 64-admin-created-bookings-with-payment-link
fixed_at: 2026-08-25T17:59:35Z
review_path: .planning/phases/64-admin-created-bookings-with-payment-link/64-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 64: Code Review Fix Report

**Fixed at:** 2026-08-25T17:59:35Z
**Source review:** .planning/phases/64-admin-created-bookings-with-payment-link/64-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (2 BLOCKER/CR, 3 WARNING — the 3 INFO findings were out of scope for this pass per `fix_scope: critical_warning`)
- Fixed: 5
- Skipped: 0

All fixes were applied inside an isolated git worktree
(`gsd-reviewfix/64-84540`) and committed atomically per finding, then
fast-forwarded onto `main`. All required test files pass:
`tests/admin-bookings-payment-link.test.ts`,
`tests/webhooks-stripe-checkout-session.test.ts`,
`tests/payment-links.test.ts`, `tests/email-payment-request.test.ts`,
`tests/admin-bookings.test.ts` — 121/121 passing. `tests/BookingsTable.test.tsx`
(15/15) was also run since WR-03 touched that component. No existing test was
weakened; new tests were added for every finding whose fix changes observable
behavior.

## Fixed Issues

### CR-01: Round-trip sibling payment link can be duplicated

**Files modified:** `app/api/admin/bookings/[id]/payment-link/route.ts`, `tests/admin-bookings-payment-link.test.ts`
**Commit:** `2036c2f`
**Applied fix:** The sibling-detection query now also selects the sibling's
own `payment_link_url`. If the sibling already has a live link, the route
short-circuits and returns that existing link (no second Stripe mint, no
duplicate email) instead of falling through to the "no link on my own row"
guard, which never accounted for the sibling. When a fresh link IS minted for
a linked pair, it is now persisted onto **both** rows in a single
`.in('id', [...])` update, so the sibling's own `payment_link_url` correctly
reflects "already linked" the next time its `PaymentLinkSection` renders —
closing the UI-layer loophole entirely. Added Test 7c (sibling-already-linked
reuse) and an assertion in Test 7 that the persist call targets both booking
ids.

### CR-02: Editing price / manually confirming an unpaid booking with a live payment link never invalidates it

**Files modified:** `app/api/admin/bookings/route.ts`, `app/api/webhooks/stripe/route.ts`, `tests/admin-bookings.test.ts`, `tests/webhooks-stripe-checkout-session.test.ts`
**Commit:** `67e0cd1`
**Applied fix:** Two defenses, per the task's guidance to prefer an
application-level guard over a speculative Stripe API call:
1. **Application-level guard (prevents the bad state):** the PATCH
   price-affecting sub-branch now returns `409` when editing the price of a
   booking that still carries a `payment_link_url`, unless `override_price`
   is explicitly passed (same escape hatch/audit trail as the existing
   price-tolerance override). This directly addresses the review's "at
   minimum" fix bullet for the price-edit half of CR-02.
2. **Webhook alert (closes the silent-money-capture gap):**
   `handlePaymentLinkSucceeded` no longer treats an empty reconcile union as
   unconditionally "harmless Stripe retry." It now fetches the current
   status/`payment_intent_id` of the booking (and sibling, if linked) and
   distinguishes a genuine retry (already `confirmed` under the SAME
   `payment_intent_id` that just fired) from any other reason the booking
   left `unpaid` — the latter (e.g. a manual cash confirm, or a price edit
   that predates this fix, followed by the client paying the stale link)
   now triggers a loud `console.error` with the booking id(s),
   `payment_intent_id`, and current row state, for manual investigation.
   This covers BOTH the "manual confirm" and "price edit" halves of CR-02's
   money-capture concern without a live Stripe API call.

**Follow-up NOT included in this pass** (per the task's conservative-fix
guidance — a Stripe API call whose end-to-end behavior in production could
not be verified from the codebase/tests alone): actually deactivating the
Stripe Payment Link (`stripe.paymentLinks.update(id, { active: false })`,
which does not currently exist as an export in `lib/stripe-payment-links.ts`)
whenever a booking leaves `unpaid` via a non-webhook path, and/or
auto-regenerating a fresh link with the corrected amount. The two defenses
above stop the money from moving untracked; they do not yet prevent the
stale link from remaining *technically payable* at Stripe until the
`completed_sessions.limit: 1` restriction consumes it on first use. This
should be scoped as its own follow-up phase/plan with a live-Stripe
verification step (mirroring how `send-invoice-tltgo.mjs`-style scripts are
run manually against the live key in this project, per
`project_stripe_local_key` memory).

### WR-01: TOCTOU race lets two concurrent "Generate Payment Link" requests both succeed

**Files modified:** `app/api/admin/bookings/[id]/payment-link/route.ts`, `tests/admin-bookings-payment-link.test.ts`
**Commit:** `4f7fa77`
**Applied fix:** The persist step is now conditional on
`.is('payment_link_url', null)` and checks the returned row count against
the booking's own id — the same status-gated-UPDATE pattern already used by
`reconcileBookingToConfirmed`/`reconcileBookingByIdToConfirmed` elsewhere in
this codebase. If the own row isn't among the updated rows (another
concurrent request already claimed it), the handler logs a warning and
returns the just-minted link URL without sending a duplicate
payment-request email. Added Test 8b covering the lost-race path.

### WR-02: `distance_km` is a fully client-controlled price input with no server-side sanity check

**Files modified:** `lib/geo-distance.ts` (new), `app/api/admin/bookings/route.ts`, `tests/admin-bookings.test.ts`
**Commit:** `395ad60`
**Applied fix:** Added a new `lib/geo-distance.ts` with a pure
`haversineDistanceKm()` helper and a `DISTANCE_SANITY_MULTIPLIER` constant
(2x). Both the manual-booking `POST` and the PATCH price-affecting
sub-branch now run this check alongside the existing price recompute: when
both endpoints' `origin_lat/lng`/`destination_lat/lng` are known (submitted
or, for PATCH, falling back to the current row), a `distance_km` smaller
than `haversine / 2` is rejected with `422` unless `override_price` is set.
The check is skipped entirely when coordinates are unknown (free-text
addresses without a Google Places selection) — no regression versus prior
behavior in that case, and no second paid Google Routes call was
introduced, per the review's own fix suggestion. Added Test 4b/4c/4d (PATCH)
and Test 5b/5c (POST) covering the reject, override-bypass, and
no-coordinates-skip paths.

### WR-03: Duplicate URL-truncation and clipboard-copy logic between the two payment-link UI surfaces

**Files modified:** `lib/ui/payment-link-display.ts` (new), `components/admin/BookingsTable.tsx`, `components/admin/ManualBookingForm.tsx`
**Commit:** `cf12bd8`
**Applied fix:** Extracted `truncatePaymentLinkUrl` and a new
`copyPaymentLinkToClipboard(url, fallbackElementId)` helper into
`lib/ui/payment-link-display.ts` exactly as the review suggested. Both
`BookingsTable.tsx`'s `PaymentLinkSection` and `ManualBookingForm.tsx`'s
result panel now import and use these instead of their own duplicated
`truncatePaymentLinkUrl`/`truncateMiddle` and `handleCopyLink`
implementations. `copyPaymentLinkToClipboard` takes the DOM fallback-element
id as a parameter so each component's own "unsupported clipboard ->
auto-select text" fallback still targets its own element id
(`payment-link-url-text-${bookingId}` vs. `payment-link-url-text`),
preserving existing behavior exactly. No test file directly referenced the
old private function names, and `tests/BookingsTable.test.tsx` (15/15) still
passes unchanged.

## Skipped Issues

None — all 5 in-scope findings were fixed.

---

_Fixed: 2026-08-25T17:59:35Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
