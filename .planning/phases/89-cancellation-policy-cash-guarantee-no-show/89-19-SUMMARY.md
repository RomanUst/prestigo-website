---
phase: 89-cancellation-policy-cash-guarantee-no-show
plan: 19
subsystem: payments
tags: [stripe, lifecycle-tests, partner-gate, validation, dark-deploy]
requires:
  - phase: 89 plans 01-18, 25-28
    provides: cancel orchestrator, fee engine, cash engine, manage link, no-show confirm, driver cash step
provides:
  - three end-to-end money lifecycles over the real route handlers on the fakes
  - partner-booking refusal proven at runtime and pinned by source gates
  - signed 89-VALIDATION.md (nyquist_compliant true, wave_0_complete true)
affects: [89-20, 89-21, 89-22, 89-23, 89-24]
tech-stack:
  added: []
  patterns: [lifecycle world with extra stubs for set_no_show_request, booking_status_log, driver_assignments]
key-files:
  created:
    - tests/payments-policy-lifecycle.test.ts
  modified:
    - tests/payments-engine-gates.test.ts
    - .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-VALIDATION.md
decisions:
  - "The runtime partner table lives in the lifecycle file (it needs the mock world); the engine-gates file holds only source-reading gates"
  - "89-VALIDATION.md keeps the CANC-02 checkout/terms row as pending by design: plans 89-20, 89-21, 89-24 add the public wording after the dark deploy"
metrics:
  duration: "about 1 h"
  completed: "2026-11-07"
status: complete
commits: 1
plan_head_before: 075f9ee305ccfc864c7fd6bbde0f9fde95c0d8c0
plan_head_after: ba73b49a
actuals:
  tokens: 30000
  tasks: 1
  commits: 1
---

# Phase 89 Plan 19: Lifecycles, partner gates and validation sign-off Summary

Task 1 is done and committed. Task 2 (production merge with the flag closed, curl checks, count check, step 6 briefing) is PENDING: it belongs to the orchestrator and nothing of it was touched. This SUMMARY is the Task 1 record; the orchestrator completes it after "dark deploy ok".

## Task 1 (tracer): done

Commit `ba73b49a` test(89-19): three policy lifecycles over the real routes, partner gates, validation sign-off.

### What the tests drive

`tests/payments-policy-lifecycle.test.ts` (12 tests) uses the Phase 88 world: real route handlers and engine modules, in-memory payments database, fake Stripe, virtual clock. Extra stubs added for tables and RPCs the payments fake does not model: `set_no_show_request`, `booking_status_log`, `driver_assignments` (reads the live booking row), `drivers`, the outbox. No engine function is replaced.

- **LC1 (tracer), late self-cancel.** init -> intent -> card saved -> tick places the hold -> `ensureManageToken` -> `POST /api/manage/cancel`. A stale `free` acknowledgement answers 409 POLICY_CHANGED and moves nothing. `late` cancels: status cancelled, hold still `requires_capture`, no cancel/refund/capture call, one pending case, operator alert. A repeat is `alreadyCancelled`. The sweep never touches it. The operator charges half: exactly one capture with `amount_to_capture` equal to the chosen amount, the PaymentIntent ends `succeeded` with `amount_received` equal to it and nothing capturable (the rest released), case charged, one `fee_charged` email, `fee_case_status` charged. A second charge, a different amount, waive and charge_saved_card all answer 422; the tick adds no capture, no PaymentIntent, no mail. A second test: an in-time self-cancel voids the hold, opens no case, and the fee route answers 422.
- **LC2, no-show.** Driver request too early: 409 `too_early` with the unlock instant (airport pickup, 60 min). Operator confirm without a request: 422 `no_request`. After the wait the request is accepted (no status change, no money, one alert). Confirm: `no_show`, one pending case for the full fare, hold untouched. Hold lapses (webhook -> `expired`). Charge without a contact note: 422 `note_required`; above the cap: 422 `amount_above_cap`. Saved card declines: `{outcome:'declined'}`, state failed, case pending and unlocked, one recovery link carrying `card_recovery` metadata, operator mail. The link is paid through the webhook: captured, case charged by `webhook` with the paid amount, one `fee_charged`, link deactivated. Replays, a further charge and a waive change nothing. A second test covers "client found" (dismiss, driver asks again) and a waive that moves no money.
- **LC3, cash.** Cash intent through the real routes: `cash_guarantee`, no `hold_at`, ledger `setup_started, setup_succeeded` (no `hold_scheduled`). Three ticks (before and after the hold lead, after pickup) place and capture nothing. Completion captures nothing. Driver `confirm_cash` settles, a repeat is a replay. Operator `reopen_cash` (note mandatory, 400 without) then `mark_cash_settled`: ledger kinds `cash_settled, cash_reopened, cash_settled` with three distinct keys, the two clicks on record before their effect, no Stripe call at all. In-trip: a declined `charge_saved_card` sends the client nothing, creates no link, keeps the note out of the ledger; after completion the driver confirms cash from state `failed`. A succeeded card charge closes the cash path (driver 422, operator 422).
- **LC4, criterion 5.** A partner booking made as eligible as possible (stored policy version, a manage token row, a pending case): `ensureManageToken` writes no token, `resolveManageToken` returns null and the route answers the invalid-link 404; `cancelBooking` by the client link is `not_cancellable`, an admin cancel changes status only; all five fee-route actions on both card and cash modes answer 422 `action_not_allowed`; `runFeeCharge`, `chargeFromCollected`, `waiveFee`, `runCashCardCharge`, `settleCash`, `reopenCash` refuse by themselves and write nothing (not even a ledger click, no amount lock, no note); `driverConfirmCash` and the driver route answer 422. In every case there is no Stripe call, no link, no mail.

`tests/payments-engine-gates.test.ts` (+132 lines, 69 tests in file): for runFeeCharge, runCashCardCharge, chargeFromCollected, waiveFee, settleCash, reopenCash, ensureManageToken, driverConfirmCash the partner check precedes the first money-touching call; `isEligibleBooking` and `resolveManageToken` consult the booking source; `runCancel` computes the partner flag before the first status write and every Stripe and case step sits behind the partner early return; the fee route re-checks the action matrix before each engine call; the manage cancel route resolves the token before `cancelBooking`. Plus a no-typed-euro gate over the 20 files Phase 89 added under `app/` and `components/`, with a floor and a "no unlisted file under manage" check.

### Mutation proof that the tests bite

Five single-line mutations of the shipped code were applied one at a time and reverted: partner branch removed from `driverConfirmCash`, `isEligibleBooking` made always true, the client partner refusal in `runCancel` removed, the partner check removed from `runFeeCharge`, from `settleCash`. Each makes at least one lifecycle test and one gate fail. Two mutations first survived because a second guard downstream caught them; the engine test was tightened (strict empty ledger, no lock, cash row on a live trip) until each single guard is individually pinned.

### Verification

- `npx vitest run tests/payments-policy-lifecycle.test.ts tests/payments-engine-gates.test.ts tests/payment-state-writers-gate.test.ts tests/status-writers-gate.test.ts`: 4 files, 118 passed.
- `npx vitest run` (full, in the worktree): 374 files passed, 11297 tests passed. 7 files fail at collection, all with the same cause (next-intl/server module resolution through the `node_modules` symlink): `account-trips`, `auth-customer`, `login-actions`, `manage-actions`, `manage-page`, `passenger-actions`, `profile-actions`. They import `next-intl/server`, are not touched by this plan, and must be re-run by the orchestrator on the main checkout.
- `npx tsc --noEmit`: 8 errors, all in `tests/` (`i18n-translate-dnt`, `nav-auth`, `passenger-actions`), the baseline; none in the two files of this plan.
- `npx eslint --quiet` on both test files: clean.
- `npm run build` in the worktree: compiled successfully (no app code changed by this plan).
- Hard-coded `€NN` scan of `app/` and `components/`: none.

```
VERIFY: PASS (pre-pr, 3 changed files)
Types:      OK (8 baseline, 0 new)
Lint:       OK (0 new errors)
Tests:      374 files / 11297 tests passed; 7 files could not load in the worktree (next-intl/server via symlink), re-run on main checkout
Invariants: OK (no typed euro in app/ components/, no secrets)
i18n:       OK (no message keys touched)
Browser:    skipped (no UI change)
Build:      OK
```

The final verify line is PASS with the seven-file worktree caveat above; the orchestrator's main-checkout run is what closes it.

### Validation

`89-VALIDATION.md` rewritten: per-requirement rows with real commands, Wave 0 ticked, sign-off ticked, `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true`. The CANC-02 row for the public checkout and terms wording is marked pending by design (plans 89-20, 89-21, 89-24).

## Task 2: done (orchestrator, 2026-11-07)

| Item | Value |
|------|-------|
| 087 and 088 live (Supabase MCP) | 087 live since 2026-11-06. 088 applied 2026-11-07 right before the merge, plus `088b` (REVOKE `erasure_payment_open` FROM service_role: Supabase default privileges had granted it). Smoke A as expected, smoke B `SMOKE_OK all checks passed` |
| `card_flow_mode` / canary list before | `canary`, `["ustyugov.roman.payment@gmail.com"]`; 0 active erasures |
| PR (`security:` title) and merge commit | PR #93 `security(89): cancellation policy, cash guarantee, no-show (flag closed)`, merge `452e3ad6` |
| Deployment id | `dpl_CsvWV6xJAugKMEoT771UhUAGUrGS` (production, READY) |
| `card_flow_mode` after (must equal before) | `canary`, `["ustyugov.roman.payment@gmail.com"]` (unchanged) |
| curl checks | `/manage/not-a-token` 200 invalid view with `noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: private, no-store`; `/ru/manage/not-a-token` 200; POST `/api/manage/cancel` and `/api/manage/change-request` without Origin: 403; home and robots.txt 200 |
| Foreign stored policies count (must be 0), again after 24 h | 0 right after the deploy; 24 h re-check PENDING |
| Smoke leftovers | 0 erasure requests from the smoke (rolled back) |
| Production error logs (CLI, 15 min after deploy) | none |
| Step 6 a/b/c briefing told to the owner in Russian, owner's acknowledgement of 6a (D-07, D-20) | Briefed 2026-11-07 (admin cancel asks client or Prestigo; late client cancel of a paid booking keeps the money and opens a case; legacy 1 h rule; round trips leg by leg; Stripe refund no longer cancels card/cash bookings; translated confirmation page, cancelled email in the booking language, driver cancel email; erasure removes payment data). Owner answered "Да, выкладывай" to "Подтверждаешь, что понял изменения в админке, и можно выкладывать?" |

Fixes made during Task 2:
- `89-05-smoke.sql` set `pickup_utc`, a generated column; the fixture now sets `pickup_date` / `pickup_time`.
- `088_erasure_payment_pii.sql` gains the `FROM service_role` revoke for the internal helper (commit `9603b986`).

## Deviations from Plan

None - plan executed exactly as written for Task 1. No real defect was found by the lifecycles, so no `security:` fix was made and no engine or route code was changed. The plan prohibition held: nothing writes `card_flow_mode` or the canary list.

Observations, not changed (out of scope):
- `POST .../fee` `mark_cash_settled` answers 200 `ok` for a row that is already `cash_guarantee` + `cash_settled` before the action-matrix check. A partner booking can not reach that state, so there is no money or token consequence; noted only because the partner table in LC4 deliberately does not seed that combination.
- The `useDb` helper name of the Phase 88 lifecycle file trips `react-hooks/rules-of-hooks` when called from a nested helper; the new file calls it `bindDb`.

## Known Stubs

None.

## Threat Flags

None. Test-only change; no new network endpoint, auth path or schema.

## Self-Check: PASSED

- FOUND: tests/payments-policy-lifecycle.test.ts
- FOUND: tests/payments-engine-gates.test.ts (extended)
- FOUND: .planning/phases/89-cancellation-policy-cash-guarantee-no-show/89-VALIDATION.md (`nyquist_compliant: true` appears once)
- FOUND: commit ba73b49a
