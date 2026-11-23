---
phase: 93-day-trips-custom-tours
plan: 30
subsystem: outbox
tags: [custom-tour, chatwoot, outbox, alert, qstash]
requires:
  - phase: 93-day-trips-custom-tours
    provides: 93-29 (inquiries.kind custom_tour, migration 093 live)
provides:
  - alert.custom_tour outbox event and key (customTourAlertKey)
  - private ops-conversation Chatwoot note with the admin link only
  - request-path enqueueCustomTourAlert (lib/custom-tour-enqueue.ts)
affects: [93-32]
tech-stack:
  added: []
  patterns: [noshow-alert pattern; request-path enqueue split from the dispatcher handler to satisfy the VPS isolation guard]
key-files:
  created: [lib/custom-tour-alert.ts, lib/custom-tour-enqueue.ts, tests/custom-tour-chatwoot.test.ts]
  modified: [lib/outbox.ts, lib/outbox-labels.ts, lib/lead-sync.ts, tests/outbox.test.ts, tests/infra-vps-isolation-guard.test.ts]
key-decisions:
  - "enqueueCustomTourAlert lives in lib/custom-tour-enqueue.ts (no Chatwoot import) and is re-exported from lib/custom-tour-alert.ts; the route in 93-32 must import it from lib/custom-tour-enqueue.ts, because lib/custom-tour-alert.ts is a VPS-guard-allowlisted dispatcher-only module"
requirements-completed: [TRIP-06]
status: complete
completed: 2026-11-23
commits: 1
plan_head_before: 6a345351921fa9f0f0b04702c21cb37c1b3cbd8f
plan_head_after: 303af8d0
---

# Phase 93 Plan 30: Chatwoot leg of the custom-tour lead Summary

**A custom-tour request becomes an outbox row alert.custom_tour:<inquiryId>; the QStash dispatcher posts a private note "New custom-tour request: <site>/admin/custom-tours/<id>" to the ops conversation, with no PII and no dependency on the VPS at request time.**

## Commits

- 303af8d0 security(93-30): alert.custom_tour outbox event delivers an ids-only private ops note in Chatwoot (tasks 1 and 2 together: the label is a one-line case sharing the test file)

## What was built

- lib/outbox.ts: `alert.custom_tour` event type, strict key regex `^alert\.custom_tour:<uuid>$`, `customTourAlertKey`, parse branch.
- lib/custom-tour-alert.ts: `buildCustomTourNote`, `createCustomTourAlertStore` (service client created inside the call), `deliverCustomTourAlert` (inquiry_gone / no_conversation skips, private POST, log of key, outcome, code only).
- lib/custom-tour-enqueue.ts: `enqueueCustomTourAlert` (never throws, logs the id only).
- lib/lead-sync.ts: dispatcher branch after alert.no_show (Chatwoot gate then `chatwootConfig` breaker), `customTourAlert` dep, passed through `resolveDeps`.
- lib/outbox-labels.ts: "Custom tour alert".

## Deviations from Plan

**1. [Rule 3 - Blocking] VPS isolation guard**
- **Found during:** Task 1 verification (tests/infra-vps-isolation-guard.test.ts failed on the real tree)
- **Issue:** a module that imports lib/chatwoot-client.ts must be allowlisted and may not be imported by a request route; the plan put `enqueueCustomTourAlert` in the same module, which would have blocked the 93-32 route.
- **Fix:** moved `enqueueCustomTourAlert` to lib/custom-tour-enqueue.ts (re-exported from lib/custom-tour-alert.ts for the artifact contract) and added an allowlist entry for lib/custom-tour-alert.ts in tests/infra-vps-isolation-guard.test.ts (mirrors lib/noshow-alert.ts). Also reworded a comment that named the ops env var (the guard flags that literal).
- **Files:** lib/custom-tour-enqueue.ts, lib/custom-tour-alert.ts, tests/infra-vps-isolation-guard.test.ts (the last is outside the plan's file list)

**2. [Rule 1 - Bug] resolveDeps dropped the new dep** (caught by the tests before commit): `customTourAlert` was not copied by `resolveDeps`; fixed in the same commit.

Task 2 needed no delivery-path change: Chatwoot 500 reschedules and a 404 conversation fails terminally through the existing handleFailure.

## Verification

- `npx vitest run --exclude '.claude/**'` on custom-tour-chatwoot, outbox, lead-sync, outbox-admin, outbox-backoff, noshow-alert, infra-vps-isolation-guard: 7 files, 183/183 passed.
- eslint --quiet on all changed files: clean. tsc --noEmit: 8 errors (baseline, tests/ only).
- Acceptance greps: `alert.custom_tour` in lib/lead-sync.ts and lib/outbox-labels.ts; `private: true` in lib/custom-tour-alert.ts.

## Notes for 93-32 (request route)

Import `enqueueCustomTourAlert` from `@/lib/custom-tour-enqueue`, not from `@/lib/custom-tour-alert` (the latter would trip the VPS isolation guard). Call it after the inquiry insert succeeds; it enqueues the row with aggregateType `inquiry` and arms dispatch after the response.

## ORCHESTRATOR_REQUIRED

None for this plan (no migration, no live access needed). Before go-live (93-35): `CHATWOOT_OPS_CONVERSATION_ID` must be set in Vercel, otherwise alerts are skipped with code no_conversation (visible on the admin Outbox page; the quote email and the CRM Lead are unaffected).

## Known Stubs

None.

## Threat Flags

None. T-93-68 (note, outbox row and logs PII-free) and T-93-69 (delivery after the response via outbox + QStash, retries and breaker) mitigated and tested.

## Self-Check: PASSED

Files exist (lib/custom-tour-alert.ts, lib/custom-tour-enqueue.ts, tests/custom-tour-chatwoot.test.ts); commit 303af8d0 present.
