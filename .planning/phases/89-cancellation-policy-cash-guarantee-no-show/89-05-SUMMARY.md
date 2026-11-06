---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 05
subsystem: payments
tags: [migration, erasure, gdpr, stripe, security-definer, saga, payment-pii]
requires:
  - phase: 89-cancellation-policy-cash-guarantee-no-show
    provides: migration 087 (booking_fee_cases, booking_manage_tokens, booking_payment_notes, cash_settled, fee_case_status)
  - phase: 88-card-on-file-scheduled-holds
    provides: booking_payment_consents (ip, user_agent), Stripe ids on bookings, payment_state vocabulary
provides:
  - migration 088 with erasure_anonymise_person covering the payment PII, erasure_payment_open guard, erasure_confirm refusal payment_open, erasure_scope counts.payment_open, erasure_record_step accepting 'stripe'
  - saga step 'stripe' (customers.del once per distinct customer) between verify and supabase
  - admin preview warning and confirm-form message for a refused erasure
affects: [89-06, 89-17, go-live of the card flow]
tech-stack:
  added: []
  patterns:
    - "a re-created SECURITY DEFINER function keeps the 075 body as a statement superset (text test splits on ';') and repeats the REVOKE / GRANT block"
    - "saga step with an injectable Stripe slice (DispatchDeps.erasureStripe); no customer = no Stripe key needed"
key-files:
  created:
    - supabase/migrations/088_erasure_payment_pii.sql
    - tests/erasure-payment-pii.test.ts
    - .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-05-smoke.sql
  modified:
    - lib/erasure.ts
    - lib/erasure-store.ts
    - lib/lead-sync.ts
    - components/admin/ErasurePreview.tsx
    - components/admin/ErasureConfirmForm.tsx
    - components/admin/ErasureSearch.tsx
    - tests/erasure.test.ts
    - tests/erasure-page.test.tsx
    - tests/admin-erasure.test.ts
key-decisions:
  - "The request gate is erasure_confirm (answers 'payment_open', the confirm route already returns any non-confirmed outcome as a 422 code) plus erasure_scope (counts.payment_open for the preview); both call the internal helper erasure_payment_open"
  - "'A future pickup' blocks only when the booking is not cancelled and its payment_state is neither 'none' nor terminal (card flow still open). A future pickup with payment_state none keeps the existing Phase 82 behaviour (acknowledge, then anonymise); refusing every future pickup would have removed that capability"
  - "erasure_anonymise_person also refuses to run until the 'stripe' step is recorded, mirroring the CRM-step rule, so the Customer can never be orphaned by an out-of-order call"
  - "The stripe step is skipped when the supabase step is already recorded (the ids are gone), so an in-flight request that finished its Supabase half before 088 resumes cleanly"
  - "Customer ids are read straight from bookings with the service client (store.stripeCustomerIds), not through a new RPC; a customer that also sits on a live hold (placing_hold, authorized, capturing) or a pending fee case is left out"
  - "Stripe errors: resource_missing / 404 counts as done; auth or key errors open the breaker (stripe_auth); a missing STRIPE_SECRET_KEY opens the breaker (stripe_unconfigured) only when there is a customer to delete; everything else is retried by the dispatcher (internal_error) with the step unrecorded"
status: complete
completed: 2026-11-06
duration: ~45 min
commits: 3
plan_head_before: 6ab3ca5b768495670ca81ee2f8bcb0962dbeec1b
plan_head_after: e93d2b76884d8552f13dc9cc89ba985efbeb567f
actuals:
  tokens: 22800
  tasks: 2
  commits: 3
---

# Phase 89 Plan 05: Erasure covers the payment PII (migration 088 + Stripe step) Summary

**Migration 088 replaces `erasure_anonymise_person` (consent ip and user agent, manage tokens, operator notes, fee case free text and evidence, Stripe ids on finished payments), refuses an erasure while a payment is in play, and the saga now deletes the person's Stripe Customer before the Supabase step.**

Status: tasks 1 and 2 DONE and committed. Task 3 ([BLOCKING] apply 088 and run the live smoke) is PENDING for the orchestrator: the executor has no Supabase MCP. Hand-back signal: `ORCHESTRATOR_MCP_REQUIRED`.

## Tasks

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | 088 replaces erasure_anonymise_person with consents, tokens, fee cases and notes covered, pinned by a text test | done | 220140ff |
| 2 | saga deletes the Stripe Customer and surfaces the refusal; 89-05-smoke.sql | done | c9cfc212, e93d2b76 |
| 3 | [BLOCKING] apply 088 via Supabase MCP and run the live smoke | PENDING (orchestrator) | none |

Tracer verified end to end before expansion: `tests/erasure-payment-pii.test.ts` pins `latestFunctionBody('erasure_anonymise_person')` to the 088 definition, proves every `;`-terminated statement of the 075 body is still in it, and pins the consent ip / user_agent nulling.

## What changed

- `supabase/migrations/088_erasure_payment_pii.sql` (new, schema file only, apply after 087):
  - `erasure_payment_open(uuid[])` (new, internal, REVOKEd, not granted): counts bookings in `placing_hold` / `authorized` / `capturing`, with a pending fee case (mirror column or the case row), or with a future non-cancelled pickup whose `payment_state` is not `none`, `captured`, `released`, `cash_settled`.
  - `erasure_record_step`: full copy, `'stripe'` added to the step names.
  - `erasure_confirm`: full copy, returns `'payment_open'` before anything is written (after the scope refresh under the lock, before the `erasure_requests` UPDATE and the identity freeze).
  - `erasure_anonymise_person`: full copy of 075 plus: refuses without the `stripe` step; nulls `booking_payment_consents.ip` / `user_agent`; deletes `booking_manage_tokens` and `booking_payment_notes`; sets fee case `reason` / `contact_note` to NULL and `evidence` to `{}` (the case row, amounts, kind and status stay); clears `stripe_customer_id`, `stripe_payment_method_id`, `setup_intent_id`, `hold_payment_intent_id`, `recovery_link_url` only where `payment_state IN ('captured','released','cash_settled')`. New counts: `consents_scrubbed`, `manage_tokens_deleted`, `payment_notes_deleted`, `fee_cases_scrubbed`, `stripe_ids_cleared`.
  - `erasure_scope`: full copy, `counts.payment_open` added to the preview.
  - REVOKE FROM PUBLIC, anon, authenticated repeated for the five functions; GRANT to service_role for four (not the helper).
- `lib/erasure.ts`: step `stripe` after the verify pass and before the Supabase step (`customers.del` once per distinct customer, count-only result `stripe_customers_deleted` / `stripe_customers_missing`, log lines carry the step and a code only). `ErasureStripe` is the injectable slice; the default is the payments client when `STRIPE_SECRET_KEY` is set.
- `lib/erasure-store.ts`: `ErasureStepName` + `stripe`, `AnonymiseCounts` + 5 keys, `ConfirmOutcome` + `payment_open`, `ErasureStore.stripeCustomerIds`, `ErasureScopeOk.counts.paymentOpen` (read from the scope, written into the preview).
- `lib/lead-sync.ts`: `DispatchDeps.erasureStripe` passed to the saga.
- Admin: `ErasureConfirmForm` shows why on a `payment_open` 422; `ErasurePreview` warns (danger note) and disables "Erase this person..." while `paymentOpen > 0`, and has a Stripe row; the "Not covered" line no longer lists Stripe.
- `89-05-smoke.sql`: statement A lists grants of the five functions, body markers, and two counts-only dry selects of the terminal-state condition (one for a test person's booking ids, one over all bookings). Statement B is a rolled-back DO block on the most recent real booking: payment_open per state, pending case, scope count, `erasure_confirm` refusal writes nothing, `erasure_record_step` accepts `stripe` and refuses an unknown step, `erasure_anonymise_person` refuses without the stripe step, then runs for real: PII gone, row kept, Stripe ids kept on a live hold and cleared once terminal; ends in `SMOKE_OK`.

## Deviations from Plan

**1. [Rule 3 - Blocking] The saga step needs more than lib/erasure.ts and the listed tests**
- **Found during:** Task 2
- **Issue:** `erasure_record_step` (075) refuses unknown step names, `ErasureStepName` / `AnonymiseCounts` / `ErasureStore` live in `lib/erasure-store.ts`, and the injected Stripe slice has to travel through `DispatchDeps` in `lib/lead-sync.ts`. The plan lists none of these.
- **Fix:** 088 also replaces `erasure_record_step`; `lib/erasure-store.ts` and `lib/lead-sync.ts` carry the new step, counts, store method and dependency.
- **Commit:** 220140ff, c9cfc212

**2. [Rule 2 - Missing critical] The admin must see why**
- **Found during:** Task 1/2 (must-have "the admin sees why")
- **Issue:** the confirm route already returns any non-confirmed outcome as a 422 code, but the form showed a generic error and the preview said nothing.
- **Fix:** confirm-form message for `payment_open`; preview note and disabled button from `counts.payment_open`; `paymentOpen` is optional in `ErasurePreviewData` so older mocks still type-check. Tests added in `tests/erasure-page.test.tsx` and `tests/admin-erasure.test.ts`.
- **Commit:** c9cfc212, e93d2b76

**3. [Interpretation] "future pickup" in the guard**
- Plan text: refuse while the person has an open hold, a pending fee case or a future pickup. Refusing every future pickup would remove the Phase 82 flow (preview shows upcoming trips, admin acknowledges, bookings are anonymised). The guard therefore refuses a future pickup only when the card flow is still open (see key-decisions). Easy to widen: drop the `payment_state NOT IN (...)` line in `erasure_payment_open` if the owner wants every future pickup refused.

**4. [Scope] Stricter ordering in SQL**
- `erasure_anonymise_person` also requires the `stripe` step (not in the plan's bullet list). Without it an out-of-order call would orphan the Stripe Customer. Pinned by the text test and the smoke.

Otherwise the plan was executed as written.

## Orchestrator task (PENDING) - ORCHESTRATOR_MCP_REQUIRED

1. Apply `supabase/migrations/088_erasure_payment_pii.sql` to project `enakcryrtxlnjvjutfpv` with `apply_migration` (087 is live). Apply BEFORE deploying the code from this plan: the 075 `erasure_record_step` refuses the `stripe` step name.
2. Run statement A of `89-05-smoke.sql`. Expect `public_exec=false anon_exec=false authenticated_exec=false` for all five functions, `service_role_exec=true` for four and `false` for `erasure_payment_open`; all body markers `true`; the dry selects show `cleared_by_088=true` only for captured / released / cash_settled.
3. Run statement B. It must FAIL with `SMOKE_OK all checks passed` (rolled back). A `SMOKE_FAIL ...` message is a failure of 088; any other SQL error is a fixture problem to read (for example a CHECK on the Stripe id columns).
4. Record the migration name and the grants output here. The acceptance line "the SUMMARY quotes the grants output" is satisfied only after that.

Live smoke output: not run (executor has no Supabase MCP).

## Verification run (worktree)

- `npx vitest run tests/erasure-payment-pii.test.ts tests/erasure.test.ts tests/admin-erasure.test.ts tests/erasure-page.test.tsx tests/erasure-migration.test.ts tests/lead-sync.test.ts`: 211 passed. Also green: `tests/payment-state-writers-gate.test.ts`, `tests/payments-migration-087.test.ts`, `tests/payments-state.test.ts`, `tests/webhook-isolation-runtime.test.ts`.
- `npx tsc --noEmit`: no errors in lib/, components/ or the erasure tests (only the baseline errors in unrelated tests/ files).
- `npx eslint --quiet` on every changed source and test file: clean.
- Full suite not run in this plan.
- The 088 SQL itself was not executed (no database in the worktree); its behaviour is covered by the text contract tests and by the rolled-back smoke that the orchestrator runs.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-89-15 (PII left after erasure): full function copy with the additions, text test, live smoke. T-89-16 (Stripe ids wiped on a live hold): terminal-only clearing, request refused while a hold / case / open card flow exists, live customers left out of the Stripe step. T-89-17 (re-created definer function): REVOKE block repeated and read by the smoke. New surface is internal: a service-role read of `bookings` in `stripeCustomerIds` and an outbound Stripe `customers.del` inside the QStash-invoked dispatcher; no endpoint added.

Not covered by 088 (unchanged from the plan): `booking_payment_events` ledger payloads and `booking_payment_consents.text_rendered` / intent ids stay (accounting evidence; no network identifier remains in them as far as the 085 and 087 schemas show).

## Self-Check: PASSED

- supabase/migrations/088_erasure_payment_pii.sql, tests/erasure-payment-pii.test.ts, 89-05-smoke.sql: FOUND
- commits 220140ff, c9cfc212, e93d2b76: FOUND on branch worktree-agent-ae0a6e0222bf56557
