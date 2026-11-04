---
phase: 88-card-on-file-scheduled-holds
plan: 04
subsystem: infra
tags: [stripe, qstash, webhooks, owner-scripts, test-mode, runbook]

requires:
  - phase: 81-lead-capture
    provides: QStash account (EU region) and the infra/*.mjs owner-script pattern (infra/chatwoot/webhook.mjs)
provides:
  - infra/stripe/webhook-events.mjs (REQUIRED_EVENTS, KEPT_EVENTS, runWebhookEvents)
  - infra/qstash/payment-tick-schedule.mjs (SCHEDULE_ID, TICK_DESTINATION, TICK_CRON, FREE_PLAN_SCHEDULE_LIMIT, runPaymentTickSchedule)
  - infra/stripe/card-flow-smoke.mjs (runCardFlowSmoke, isTestKey)
  - infra/stripe/README.md owner runbook (script order, canary A/B/C, Dashboard checks, rollback, Phase 89 blockers)
  - infra/lib/secret-io.mjs shared secret input, argv refusal and scrubber
affects: [88-09 webhook routing test (imports REQUIRED_EVENTS), 88 canary rollout, Phase 89 go-live]

actuals:
  tokens: 18000
  tasks: 3
  commits: 3
plan_head_before: d7f9f6c1b9baac52e28c8333893ae4fbfb362c5d
plan_head_after: f47fa45daed8b3fb8a4d3c4f1fc35f7498a61d9e
commits: 3

tech-stack:
  added: []
  patterns:
    - "Owner-run script: injectable client, scrubber on every line, key from env or hidden prompt, pathToFileURL main guard"
    - "Union-only webhook update with host and path guard and ambiguity refusal"

key-files:
  created:
    - infra/lib/secret-io.mjs
    - infra/stripe/webhook-events.mjs
    - infra/stripe/card-flow-smoke.mjs
    - infra/stripe/README.md
    - infra/qstash/payment-tick-schedule.mjs
    - tests/infra-stripe-webhook-events.test.ts
    - tests/infra-qstash-schedule.test.ts
    - tests/infra-stripe-card-flow-smoke.test.ts
  modified: []

key-decisions:
  - "Shared infra/lib/secret-io.mjs instead of three copies of the scrubber, hidden prompt and argv refusal"
  - "Webhook endpoint match requires https on the exact host rideprestigo.com (www redirects drop POSTs) and the exact path /api/webhooks/stripe"
  - "runCardFlowSmoke takes the key as an explicit parameter and fails closed (refuses) when it is absent or not sk_test_"
  - "Smoke S8 polls the search up to 6 times 5 s apart because Stripe search is eventually consistent"

requirements-completed: [PAYF-04]

coverage:
  - id: D1
    description: "webhook-events.mjs adds only the six missing card events to the one live endpoint (union, never removes), idempotent, dry-run sorted, refuses zero or ambiguous endpoints, exit 2 on API error"
    requirement: PAYF-04
    verification:
      - kind: unit
        ref: "tests/infra-stripe-webhook-events.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "payment-tick-schedule.mjs creates or updates prestigo-payment-tick in place (cron every 15 min, retries 1), prints the count against the Free-plan limit of 10 and refuses an 11th"
    requirement: PAYF-04
    verification:
      - kind: unit
        ref: "tests/infra-qstash-schedule.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "card-flow-smoke.mjs refuses non-test keys and reports PASS/FAIL per scenario S1-S8 with the exact engine call shapes"
    requirement: PAYF-04
    verification:
      - kind: unit
        ref: "tests/infra-stripe-card-flow-smoke.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Scripts behave correctly against the real Stripe and QStash APIs (live endpoint list shape, schedule create semantics, test-mode SCA card behaviour)"
    verification: []
    human_judgment: true
    rationale: "Only fake clients were exercised here; the live runs are owner-only (dead local key, no QStash token in the executor) and are the first real proof"
  - id: D5
    description: "infra/stripe/README.md owner runbook covers script order, canary A/B/C, Dashboard checks, rollback and Phase 89 go-live blockers"
    verification: []
    human_judgment: true
    rationale: "Prose runbook; accuracy of the owner steps can only be judged by following it"

duration: 12min
completed: 2026-11-04
status: complete
---

# Phase 88 Plan 04: Owner scripts, test-mode smoke and runbook Summary

**Three owner-run, fake-client-tested scripts (union-only Stripe webhook subscription, QStash 15-minute payment-tick schedule with a Free-plan count guard, sk_test_-only card-flow smoke) plus the canary runbook, all with keys only from env or a hidden prompt.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-11-04T11:44:00Z (approx.)
- **Completed:** 2026-11-04T11:56:00Z
- **Tasks:** 3
- **Files created:** 8 (5 source/doc, 3 test), 0 modified

## Accomplishments

- `webhook-events.mjs ensure` finds the one https `rideprestigo.com/api/webhooks/stripe` endpoint, sends the sorted union of existing and the six new events, prints `OK added: ...`, and `OK unchanged` on a second run or for a `*` endpoint. `--dry-run` prints the sorted `+ event` diff and writes nothing; zero or two matching endpoints exit 1 with no write; API errors exit 2.
- `payment-tick-schedule.mjs ensure` creates or updates (same `scheduleId`) `prestigo-payment-tick` as `POST https://rideprestigo.com/api/cron/payment-tick`, cron `*/15 * * * *`, retries 1, prints `schedules: N of 10`, and refuses an 11th schedule with `FAIL schedule limit`.
- `card-flow-smoke.mjs` refuses anything but an `sk_test_` key before a client exists and prints one `PASS` or `FAIL <name> expected=<x> observed=<y>` line for each of S1-S8 (hold, partial capture, release, authentication_required, insufficient_funds after setup, charge failure after attach, idempotency replay, metadata search); a scenario test mode does not reproduce is a FAIL, never skipped.
- `infra/stripe/README.md` is the owner runbook: order of the scripts, Admin setting (Card on file = Owner test only plus own email), Dashboard checks (Radar for saved payment methods, pricing plan, MCC 4121), canary A/B/C, rollback, and the Phase 89 blockers (Radar, D-23 erasure of consent IP and user agent and Stripe Customers, counsel review, abandoned-checkout parity).
- Tracer gate: the webhook script was verified end to end against the fake client (add six, then unchanged) before the other tasks started.

## Task Commits

1. **Task 1 (tracer): webhook-events script** - `3a75a489` (security)
2. **Task 2: QStash payment-tick schedule script** - `b27f2e4a` (security)
3. **Task 3: card-flow smoke and runbook** - `f47fa45d` (security)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified

- `infra/lib/secret-io.mjs` - shared scrubber, argv-secret refusal, hidden prompt and env/prompt secret resolution
- `infra/stripe/webhook-events.mjs` - union-only webhook subscription script
- `infra/qstash/payment-tick-schedule.mjs` - schedule create/update-in-place with the Free-plan guard
- `infra/stripe/card-flow-smoke.mjs` - test-mode Stripe semantics smoke
- `infra/stripe/README.md` - owner runbook
- `tests/infra-stripe-webhook-events.test.ts` (21 tests), `tests/infra-qstash-schedule.test.ts` (17), `tests/infra-stripe-card-flow-smoke.test.ts` (15)

## Decisions Made

- A shared helper module was preferred over three copies of the scrubber and prompt code, so the secret rules (T-88-09) live in one tested place.
- The endpoint match is strict (https, exact apex host, exact path); an `http://localhost` or `www` endpoint is never touched.
- `runCardFlowSmoke` fails closed: with no `key` it refuses, because a Stripe client does not expose its key for a safe prefix check.

## Deviations from Plan

### Auto-fixed / additions

**1. [Rule 2 - Missing critical] Shared `infra/lib/secret-io.mjs` added outside the plan's `files_modified`**
- **Found during:** Task 1
- **Issue:** the plan asks for env-or-hidden-prompt key input, argv refusal and a scrubber in all three scripts; three copies would drift
- **Fix:** one shared module imported by all three scripts
- **Files modified:** infra/lib/secret-io.mjs (new)
- **Committed in:** 3a75a489

**2. [Rule 1 - Bug] S3 dependency guard**
- **Found during:** Task 3 (own test run)
- **Issue:** S3 only required the customer, so with S1's attach failing it would still attempt a hold with no payment method
- **Fix:** S3 requires the S1 payment method
- **Committed in:** f47fa45d

**3. [Interface clarification] `runCardFlowSmoke` has extra injectable parameters**
- The plan interface lists `{ client, out, err }`; the implementation adds `key` (required for the guard), `argv`, `now` and `sleep` (for deterministic tests). Behaviour with the listed parameters plus `key` matches the plan.

---

**Total deviations:** 3 (1 missing-critical addition, 1 bug fix, 1 interface clarification)
**Impact on plan:** no scope creep; all additions serve the T-88-09 mitigation or testability.

## Issues Encountered

- `node_modules` is absent in the worktree; vitest, eslint and node resolution all work through the parent checkout's `node_modules`, so no install was needed (zero new dependencies).
- Verification: `npx vitest run tests/infra-stripe-webhook-events.test.ts tests/infra-qstash-schedule.test.ts tests/infra-stripe-card-flow-smoke.test.ts` is green (3 files, 53 tests). `npx eslint --quiet` on the new files is clean and `tsc --noEmit` reports nothing for them. Acceptance greps pass: `REQUIRED_EVENTS` has 6 entries, `prestigo-payment-tick` and the cron appear in the schedule script, `sk_test_` appears in the smoke guard, README mentions radar/erasure/D-23 and canary, and no `sk_(live|test)_` key shape appears in any new non-test file.
- Not run: any script against live Stripe or QStash (owner-only by design). The non-interactive run without a key was checked: it exits 2 with a `FAIL` line and touches no network.

## User Setup Required

Owner action after the Phase 88 code is merged and migration 085 is live: follow `infra/stripe/README.md` (webhook-events, then payment-tick-schedule, optional card-flow-smoke, then the canary). No USER-SETUP.md was generated.

## Known Stubs

None.

## Threat Flags

None. The scripts add no network endpoints or trust boundaries beyond the planned owner-terminal to Stripe/QStash calls (T-88-09, T-88-10, T-88-11 mitigated as planned).

## Next Phase Readiness

- Plan 88-09 can import `REQUIRED_EVENTS` from `infra/stripe/webhook-events.mjs` to prove every routed card event is subscribed.
- The live runs and canary remain owner steps after merge and migration 085.

## Self-Check: PASSED

- Created files exist: infra/lib/secret-io.mjs, infra/stripe/webhook-events.mjs, infra/stripe/card-flow-smoke.mjs, infra/stripe/README.md, infra/qstash/payment-tick-schedule.mjs and the three test files (all FOUND).
- Commits `3a75a489`, `b27f2e4a`, `f47fa45d` exist on branch worktree-agent-a717c99d18ca4ae84.
- All task acceptance criteria and the plan-level verification re-run green.

---
*Phase: 88-card-on-file-scheduled-holds*
*Completed: 2026-11-04*
