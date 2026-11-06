---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 07
subsystem: payments
tags: [cancellation, policy-snapshot, go-live-gate, card-flow, stripe-metadata, vitest]
requires:
  - phase: 89-01
    provides: "bookings.cancel_policy_version / cancel_policy, card_flow_mode CHECK allowing on (migration 087, live)"
  - phase: 89-03
    provides: "lib/cancellation-policy.ts rules, lib/cancellation-settings.ts reader and buildPolicySnapshot"
provides:
  - "isPolicyPublic and mode on in lib/payments/config.ts (the single go-live gate)"
  - "Checkout metadata key cancelPolicy; cancel_policy_version and cancel_policy stored on pay-now, card and admin-create rows (both legs of a round trip)"
  - "card-checkout/init response field policy { version, freeUntilIso, freeUntilPassed, hours, percent, feeMinor, waitMin }"
affects: [89-04, 89-10, 89-11, 89-15, 89-23, 89-24]
tech-stack:
  added: []
  patterns:
    - "snapshot built server-side from one policy read, carried to the row through checkout metadata, parsed and re-validated in buildBookingRow"
    - "gate at the client-facing edge only (isPolicyPublic / isCardFlowEligible); engine modules never read the mode"
key-files:
  created:
    - tests/booking-policy-snapshot.test.ts
  modified:
    - lib/payments/config.ts
    - lib/checkout/compute.ts
    - lib/supabase.ts
    - app/api/create-payment-intent/route.ts
    - lib/payments/checkout.ts
    - app/api/card-checkout/init/route.ts
    - app/api/card-checkout/intent/route.ts
    - app/api/admin/bookings/route.ts
    - tests/payments-timing.test.ts
    - tests/card-checkout-init.test.ts
    - tests/card-checkout-intent.test.ts
    - tests/admin-bookings.test.ts
key-decisions:
  - "isCardFlowEligible = trip type is transfer or hourly AND a non-empty email AND isPolicyPublic; so card eligibility always implies the policy is public"
  - "buildBookingRow always emits both columns (null when the policy is not public), so a re-captured unpaid row can never keep a stale snapshot"
  - "parseCancelPolicyMeta re-validates the metadata JSON through policyFromSnapshot; anything invalid becomes null columns (legacy terms), never a guess"
  - "init for a public client prices the booking even when the card flow is closed to it (round trip, daily, lead rule) to compute feeMinor; a client with nothing public still gets the old opaque answer before any pricing"
  - "Round trip preview: deadline is the outbound pickup, fee base is the outbound leg's share of the combined amount (extras attributed to outbound)"
requirements-completed: [CANC-01, CANC-02]
status: complete
completed: 2026-11-06
commits: 3
plan_head_before: 6ab3ca5b768495670ca81ee2f8bcb0962dbeec1b
plan_head_after: 39c8e9277a59eedba09d559f2d1b00d1d15312a6
actuals:
  tokens: 33000
  tasks: 2
  commits: 3
---

# Phase 89 Plan 07: Policy snapshot on every booking and the go-live gate Summary

**A booking now stores the cancellation terms it was made under (version plus thresholds) on the pay-now, card and admin-create paths, only while `isPolicyPublic` holds for the client; the card-checkout init returns a policy preview to the same clients, and every other client sees exactly the old answers.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | canary email through create-payment-intent, metadata and buildBookingRow to the row columns; mode on and isPolicyPublic | c7090458 |
| 2 | card flow and admin create store the same snapshot; init returns the policy preview | dc3d2c20 |
| fix | admin no-link invariant counts bookings writes only (found by the full suite) | 39c8e927 |

Tracer verified end to end: `tests/booking-policy-snapshot.test.ts` posts to the real `create-payment-intent` route with a canary-listed email and asserts the row passed to `saveBooking`, the Stripe metadata key and (round trip) both captured leg rows. Closed flag, unlisted email and a failed settings read are all asserted as null columns with an unchanged metadata key set. Only then was the card/admin expansion done.

## What changed

- `lib/payments/config.ts`: `PaymentSettings.mode` is `off | canary | on`; `getPaymentSettings` reads `on` (any unknown value, including `ON`, stays `off`); new `isPolicyPublic(settings, email)`: on is true for any email, canary only for an exact normalised listed email, off never. `isCardFlowEligible` now delegates to it after the trip-type and non-empty-email checks. No stored value of `card_flow_mode` is changed here (the switch is plan 89-23).
- `lib/checkout/compute.ts`: `buildCheckoutMeta` takes an optional `cancelPolicy` (from `buildPolicySnapshot`) and adds `meta.cancelPolicy` (compact JSON, about 150 chars, never clamped because a cut JSON is useless) only when present.
- `lib/supabase.ts`: `parseCancelPolicyMeta` (validates through `policyFromSnapshot`, invalid means null) feeds `cancel_policy_version` and `cancel_policy` in `buildBookingRow` and in the return row of `buildBookingRows` (outbound inherits via the spread). The webhook fallback inserts use the same builders from the PaymentIntent metadata, so the snapshot survives a lost capture.
- `app/api/create-payment-intent/route.ts`: one `getPaymentSettings` plus one `getCancellationPolicy` read, snapshot only when `isPolicyPublic` for the booking email; a read failure logs and proceeds on legacy terms.
- `lib/payments/checkout.ts` and `app/api/card-checkout/intent/route.ts`: `CardCheckoutIntentInput.cancelPolicy`; the snapshot comes from the same settings object that decided eligibility.
- `app/api/admin/bookings/route.ts` (POST): adds the two columns to the insert row when the policy is public for `client_email`; a read failure leaves the row as before.
- `app/api/card-checkout/init/route.ts`: nothing public and not eligible: exactly `{ eligible: false }` before any pricing. Otherwise validate, price, build `policy` (`evaluateCancellation`, `freeHoursFor`, `proposedFeeMinor` on the priced amount, `waitMin` from `getNoShowThresholds` and `isAirportPickup`). Eligible answers gain `policy`; a public client who cannot use the card flow (round trip, daily, inside the 12 h lead rule) gets `{ eligible: false, policy }`; validation or pricing failures stay `{ eligible: false }`.

## Verification

- `npx vitest run` over the touched areas: booking-policy-snapshot (22), payments-timing, create-payment-intent, checkout-compute, payment-state-writers-gate (D-09a still green: no engine module reads the mode), webhooks-stripe-payments, card-checkout-init (38), card-checkout-intent (74), admin-bookings (107): all pass.
- `npx tsc --noEmit`: no errors outside `tests/` (baseline). `npx eslint --quiet` on the touched source files: clean.
- Full suite (after the test fix): 353 files passed, 10065 tests passed. 5 files (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) fail at load with `ERR_MODULE_NOT_FOUND` for `next-intl/dist/esm/development/server.react-server.js`: the node_modules symlink of this worktree, not code of this plan (none of them touch the changed files); expected to pass in the main checkout.

## Deviations from Plan

**1. [Rule 3 - Blocking] Existing tests encoded the old init contract and the old call order**
- **Found during:** Task 2 first run
- **Issue:** `tests/card-checkout-init.test.ts` asserted `{ eligible: false }` for a canary-listed client on round_trip, daily and the 11 h lead case, and treated `'on'` as an unknown mode; its eligible body assertion was exact. `tests/admin-bookings.test.ts` Test 7 queued `from.mockReturnValueOnce({ insert })`, which the new `pricing_globals` read consumed.
- **Fix:** updated those expectations to the plan's contract (public but card-closed means `{ eligible: false, policy }`; unknown-mode test uses `'bogus'`; unlisted-client cases keep the exact old answer and the "no pricing" assertion; Test 7 routes `from` by table). No production behaviour was relaxed.
- **Files modified:** tests/card-checkout-init.test.ts, tests/admin-bookings.test.ts, tests/admin-bookings-payment-link.test.ts (the ANEW-05 no-link invariant asserted `from` called once; it now counts bookings calls only)
- **Commits:** dc3d2c20, 39c8e927

**2. [Plan note] Card and admin snapshot tests live in their existing test files**
- The plan lists only `tests/booking-policy-snapshot.test.ts` for row columns, but the card path needs the in-memory payments DB harness and the admin POST needs that file's mocks. The card-intent cases were added to `tests/card-checkout-intent.test.ts` and the admin cases to `tests/admin-bookings.test.ts`; the new file covers config, the builders and the pay-now/round-trip routes.

**3. [Process] Plan-head ledger file not written**
- The sandbox refuses compound git-dir commands (same as plan 89-03), so `commits` is measured from the known base: `rev-list --count 6ab3ca5b..39c8e927` is 3 before this SUMMARY commit (two task commits and one test fix).

## Notes for the orchestrator

- **Round-trip RPC fallback (unverified):** when both unpaid leg rows were never captured, the webhook falls back to `saveRoundTripBookings`, i.e. the RPC `create_round_trip_bookings(p_outbound, p_return)`. Its SQL is not in the repo, so I could not confirm that it copies `cancel_policy_version` / `cancel_policy` from the jsonb rows (it does if it uses `jsonb_populate_record`, it does not if it lists columns). The primary path (captured unpaid rows reconciled to confirmed) keeps the snapshot. Worth a one-line check of the RPC definition via the Supabase MCP before go-live; a gap would only affect round trips whose capture was lost, and those would fall back to the legacy terms.
- **Unrun:** a live check that `bookings` accepts the two columns from `buildBookingRow` for quotes and pay-now (migration 087 is live, so it should); every row now sends both keys, null while closed.
- The flag stays closed: `card_flow_mode` was not touched, and with it `off` or `canary` and an unlisted email no public behaviour changed (verified by the deep-equal and metadata-key tests).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-89-23 (snapshot built server-side, client policy fields ignored; pinned for pay-now and card), T-89-24 (unlisted client gets the exact old answer, deep-equal test "init stays opaque") and T-89-25 (one policy read per request; consent text cross-check is plan 89-10) are mitigated as planned.

## Self-Check: PASSED

- tests/booking-policy-snapshot.test.ts, this SUMMARY: FOUND
- commits c7090458, dc3d2c20 and 39c8e927: FOUND on branch worktree-agent-a1b057de30589a905

## Orchestrator note (2026-11-06)

`create_round_trip_bookings` lists its columns and does not copy `cancel_policy_version` or `cancel_policy`. Only a round trip whose unpaid rows were lost before capture is affected: it falls back to the legacy one-hour rule, which is softer for the client. Accepted; listed for the go-live checklist.
