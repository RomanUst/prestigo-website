---
phase: 91-multi-stop-transfers-airport-pickup-waiting-fees
plan: 16
subsystem: phase-closure
tags: [integration-test, quality-gate, tracer, STOP-01, STOP-02, STOP-03, STOP-04, STOP-05, EXTRA-01]
requires:
  - phase: 91-04
    provides: checkout prices a trip with stops from the server distance
  - phase: 91-06
    provides: booking_stops stored with the captured unpaid booking
  - phase: 91-08
    provides: POST and GET /api/admin/bookings/[id]/extra and the extra-charge engine
  - phase: 91-10
    provides: waiting rate per class and the quote waiting fields
provides:
  - tests/phase91-e2e.test.ts, one test from a quote with a stop to a charged waiting extra through the real route handlers
  - the full gate report for the phase (suite, types, lint, invariants, i18n, build)
affects: [phase 91 verification, ship gate]
tech-stack:
  added: []
  patterns: [real route handlers over the in-memory payments DB and the fake Stripe; only Google Routes, auth, mail and the admin list RPC are faked]
key-files:
  created:
    - tests/phase91-e2e.test.ts
  modified: []
key-decisions:
  - "The integration test is run twice from one describe.each: once with the real browser distance and once with a tampered distanceKm of 1; both must store 130 km and the same amount."
  - "coverage_zones (a public-read table the payments fake does not model) is answered by one zone covering Czechia, so the quote's zone check runs for real and passes."
  - "admin_search_bookings (a Postgres function) is answered with the stored booking rows; attachStops, the stop loader and the route itself run for real."
requirements-completed: [STOP-01, STOP-02, STOP-03, STOP-04, STOP-05, EXTRA-01]
status: complete-pending-owner-checkpoint
commits: 1
plan_head_before: 3cb8e5ffe4e6145abc989ce387e2f87d7a91604e
plan_head_after: a1a6e39de5ccc308290eea6a27f614c29f81ac5c
actuals:
  tokens: 4500
  tasks: 2
  commits: 1
---

# Phase 91 Plan 16: Phase closure Summary

**One integration test now carries a trip from the quote (one stop, 45 minutes of waiting) through checkout, storage, the admin list and a charged waiting extra; the full gate is green apart from seven worktree-only import failures. Task 3 (owner live proofs) is pending after the production deploy.**

Note on `commits`: the count above is the code commits measured from the ledger at the time this file was written (the test commit). The SUMMARY's own docs commit follows it.

## What was built

`tests/phase91-e2e.test.ts` imports the real `app/api/calculate-price/route`, `app/api/card-checkout/intent/route`, `app/api/admin/bookings/route` and `app/api/admin/bookings/[id]/extra/route` and runs, in one describe block (twice, see key-decisions):

1. Quote: 130 km (mocked Google Routes) through one stop waiting 45 minutes, business class at a rate of 12 EUR per block. The route distance call receives the stop as an intermediate. `prices.business.waitingEur` is 24, first_class and business_van are listed in `waitingUnavailable` with `waitingEur` null (no rate, D-05).
2. Checkout with `displayedAmountMinor` equal to the quoted base times 100: 200. The unpaid `card_hold` booking stores `distance_km` 130 (the browser value, 130 or 1, never matters) and `payment_amount_minor` equal to the quote.
3. One `booking_stops` row: position 1, Karlovy Vary, wait 45, free 15, blocks 2, fee per block 12, fee 24. The checkout also stored the consent row `text_version` `2026-11-3`.
4. `GET /api/admin/bookings`: `bookings[0].stops` carries that stop in the camelCase shape of `BookingStop`.
5. The booking is set completed and captured with a saved card. `GET /extra?minutes=30` answers `{ amount_minor: 2400, currency: 'eur', blocks: 2, rate_per_block_eur: 12 }`. `POST { kind: 'waiting', minutes: 30, expected_amount_minor: 2400 }` charges once: one off-session `card_extra` PaymentIntent (customer, saved card, confirm), ledger `admin_action` then `extra_charged`, one `booking_extra_charges` row (status charged, minutes 30, blocks 2, rate 12), `payment_intent_id` and `hold_payment_intent_id` unchanged, status still completed, one receipt email of kind `extra_charged` for 2400.

A third test pins the "class without a rate" quote contract.

No production code was changed. Every step passed on the first run, so no earlier plan's contract was found broken.

## Task commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | one integration test from a quote with a stop to a charged waiting extra | a1a6e39d |
| 2 | full suite, type check, lint, verify pre-pr | no file change (gate run only, nothing to fix) |
| 3 | owner live proofs | PENDING, see below |

## Task 2: quality gate results

Run in the executor worktree at `a1a6e39d` (symlinked `node_modules`), changed files measured against `git merge-base HEAD origin/main` = `ca860cd5` (128 ts/tsx files, plus 7 `messages/*.json` and migration 089).

- Full suite: `npx vitest run --exclude '.claude/**' --exclude '**/node_modules/**'`
  `Test Files  7 failed | 417 passed | 2 skipped (426)` and `Tests  13296 passed | 10 skipped | 138 todo (13444)`.
  The 7 failed files are exactly the known worktree artefacts, each `ERR_MODULE_NOT_FOUND` at import (next-intl server modules through the symlink): `account-trips`, `auth-customer`, `login-actions`, `manage-actions`, `manage-page`, `passenger-actions`, `profile-actions`. No assertion failure anywhere. `seo-volume-pages` did not time out this run. The orchestrator re-runs the full suite on the main checkout after merge (last run there: 420 files / 13 395 tests before plan 91-15).
- Types: `npx tsc --noEmit` prints 8 errors, all baseline (`i18n-translate-dnt` 2, `nav-auth` 5, `passenger-actions` 1). The plan's automated check (zero errors outside the baseline files) holds.
- Lint: `npx eslint --quiet` on all 128 changed ts/tsx files: exit 0, no output (the not-found.tsx baseline errors are not in the phase diff).
- Invariants: the pre-commit EUR rule (`grep -rEl '€[0-9]{2,}'` over `app` and `components`, same exclusions) matches nothing; the secret regex of `.husky/pre-commit` over the added lines of the whole phase diff matches nothing; every commit also passed the real pre-commit hook. `grep -rn "EXTRA_STOP_PRICE" app lib components` prints nothing.
- i18n: 24 keys were added to `messages/en.json` by the phase; ar, es, fr, hi, ru and zh have all keys (0 missing), 0 `[XX]` stubs, 0 added keys identical to the English text.
- Build: `npm run build` exit 0, "Compiled successfully", route table printed (the worktree has no `.env`, the build still passes).
- Browser check: skipped (executor worktree has no preview server; localhost admin login is blocked by the fail-closed limiter anyway). STOP-01 / STOP-05 UI on desktop and mobile stays the backstop item for the owner's live check and `/gsd-verify-work 91`.

verify: PASS (pre-pr mode, 128 changed ts/tsx files; browser step skipped, stated above)

## Deviations from Plan

None - plan executed exactly as written. Test-support additions inside the new test file only: a one-zone answer for `coverage_zones` and an answer for the `admin_search_bookings` RPC, because the shared payments fake models neither (it throws "table coverage_zones is not modelled").

## Task 3 (checkpoint:human-action, blocking-human): PENDING — owner + orchestrator after production deploy

Not executed by this agent: it needs the merged and deployed production code, the owner's own card, Stripe and the live database. Precondition: migration 089 is live (91-01 SUMMARY says "089 live") and the owner has merged the phase PR so production runs this code.

Exact steps from the plan:

1. Owner: Admin > Pricing: enter the waiting rate per extra 15 minutes for each class that should offer paid waiting; leave the others empty (D-04, D-05).
2. Owner: on rideprestigo.com book a canary transfer with the card flow on the owner's own card: one stop with 45 minutes of waiting and, if practical, the airport as pickup with landing time + 30 minutes. Check that the summary shows the "Waiting at stops" line and, for the airport, "Your driver meets you at ...".
3. Orchestrator: with the Supabase MCP read the canary booking: `distance_km` is the server value, one `booking_stops` row with wait 45 and its blocks and fee, `landing_date` / `landing_time` / `pickup_offset_min` when the airport was used; the consent row `text_version` is '2026-11-3'.
4. Owner: in admin open the canary in the booking panel, check the Route section, complete the trip (capture), then "Add extra charge…" > Other, item "Canary test", amount 1.00, confirm.
5. Orchestrator: with the Supabase MCP check `booking_extra_charges` (status charged, `stripe_payment_intent_id` set), the ledger rows (`booking_payment_events`) `admin_action` then `extra_charged`, and that `bookings.payment_intent_id` did not change. Owner: in the Stripe dashboard see a separate PaymentIntent with metadata kind `card_extra`, check the receipt email, then refund the 1 EUR; orchestrator confirms the booking stays completed.

Checks the orchestrator runs through the Supabase MCP (read-only), for the canary booking id `<ID>`:

```sql
select id, status, payment_state, distance_km, payment_intent_id, hold_payment_intent_id,
       landing_date, landing_time, pickup_offset_min
  from bookings where id = '<ID>';
select position, address, wait_minutes, free_minutes, blocks, fee_per_block_eur, fee_eur
  from booking_stops where booking_id = '<ID>' order by position;
select text_version, accepted_at from booking_payment_consents where booking_id = '<ID>';
select id, kind, status, amount_minor, currency, description, stripe_payment_intent_id, charged_at
  from booking_extra_charges where booking_id = '<ID>';
select kind, event_key, stripe_object_id, amount_minor, created_at
  from booking_payment_events where booking_id = '<ID>' and kind in ('admin_action','extra_charged') order by created_at;
```

Expected: `distance_km` equals the Google route value (not the browser's); one stop row with `wait_minutes` 45, `blocks` 2, `fee_eur` equal to 2 blocks at the admin rate; consent `2026-11-3`; after the extra: one `booking_extra_charges` row `status = 'charged'` with `stripe_payment_intent_id` set, ledger rows `admin_action` then `extra_charged`, `payment_intent_id` unchanged from before the extra, and after the owner's refund `bookings.status` still `completed`. The SUMMARY addendum must record the rates set (classes only, not amounts), the canary reference, these query results and the owner's "live proofs done".

Prohibition (T-91-46): the live extra charge runs only on the owner's own canary booking, 1 EUR, refunded at once.

Backstop item (not automatable): STOP-01 / STOP-05 UI on desktop and mobile (stop list, reorder, wait select, landing + offset, derived pickup line) reads clearly in the live wizard.

## Threat Flags

None. The new file is a test; no new network endpoint, auth path or schema surface.

## Known Stubs

None.

## Self-Check: PASSED

- `tests/phase91-e2e.test.ts` exists and passes (3 tests).
- Commit `a1a6e39d` exists on the worktree branch.
