---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 07
subsystem: lead-capture
tags: [espocrm, outbox, qstash, dispatcher, resilience, security]
status: complete
requires: ["81-01", "81-02"]
provides:
  - "lib/espocrm-client.ts: hardened API-key EspoCRM client for the site (only file naming ESPOCRM_* env)"
  - "lib/outbox-store.ts: Supabase access for the outbox (RPC wrappers + inquiry read)"
  - "lib/outbox-backoff.ts: pure retry schedule"
  - "lib/lead-sync.ts: dispatchOutboxKey (claim -> read -> map -> upsert -> complete)"
  - "POST /api/integrations/dispatch: QStash-signed dispatcher"
affects: [81-08, 81-09, 81-10, 81-11]
tech-stack:
  added: []
  patterns:
    - "state-convergent upsert keyed on cSupabaseRef, never on email"
    - "claim-then-converge outbox dispatch with always-200 business outcomes"
    - "auth/unconfigured breaker (6 h), growing backoff for transient errors"
key-files:
  created:
    - lib/espocrm-client.ts
    - lib/outbox-store.ts
    - lib/outbox-backoff.ts
    - lib/lead-sync.ts
    - app/api/integrations/dispatch/route.ts
    - tests/lead-sync.test.ts
    - tests/integrations-dispatch.test.ts
    - tests/espocrm-site-client.test.ts
    - tests/outbox-backoff.test.ts
  modified:
    - tests/infra-vps-isolation-guard.test.ts
key-decisions:
  - "Non-JSON 2xx from the CRM is treated as unreachable (status 0), i.e. transient"
  - "A 403 poisons the client like a 401 (both mean crm_auth, one request per invocation)"
  - "Transient failures at attempt 30 end as failed <code>_exhausted; db_error/internal_error follow the same backoff/exhaustion path"
  - "Dispatcher is one file per concern; only lead.inquiry is handled, other event types complete failed unsupported_event until 81-09/81-10"
requirements: [LEAD-01, LEAD-02, LEAD-03, LEAD-05]
commits: 3
plan_head_before: fbab3cb5c9a2e095ddd31b0c87db338b1dba2640
plan_head_after: 6a006f013816b954d24771bd936d1f0db416c0d5
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
completed: 2026-10-18
---

# Phase 81 Plan 07: Outbox dispatcher -> EspoCRM Lead Summary

A QStash-signed `POST /api/integrations/dispatch {key}` claims the outbox row, reads the stored inquiry, and creates exactly one EspoCRM Lead (looked up by `cSupabaseRef` first), tolerating a down or misbehaving VPS with backoff and a 6 h auth breaker, and never reachable from a visitor request path.

## Task status

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: signed dispatch of one inquiry key -> one Lead -> row sent | 3cf50de2 |
| 2 | VPS-down resilience: client hardening, backoff, auth/unconfigured breakers | 3fb5afe1 |
| 3 | Existing-customer mark, assignee, idempotent update, phone retry, duplicate delivery | 6a006f01 |

## What was built

- **lib/espocrm-client.ts**: `loadSiteEspoConfig` (https-only, printable-ASCII key, 17-hex assignee, never throws), `createSiteEspoClient` (X-Api-Key, `redirect: 'error'`, `AbortSignal.timeout` raced explicitly so a fetch ignoring the signal cannot hang, first 401/403 poisons the client, empty body -> null), `SiteEspoError` (message holds method, path without query, status only), `classifyEspoError`.
- **lib/outbox-store.ts**: select reads of `integration_outbox`/`inquiries`, writes only through `outbox_claim/complete/reschedule`; client built lazily inside each try; any Supabase error -> `OutboxStoreError('db_error')`.
- **lib/outbox-backoff.ts**: 60, 300, 900, 3600, 10800, 21600, 43200, 86400 then 86400; 30 attempts max; 6 h breaker.
- **lib/lead-sync.ts**: deferral branches (not-due pending -> remaining delay, busy -> 30 s, dedup `d<attempts>`), unconfigured breaker (zero requests), upsert (D-10 `X-Skip-Duplicate-Check`, D-11 Contact match on create and on update when the mark is missing, D-13 assignee on create only, 400 phone retry, 409 re-GET), error mapping (transient -> backoff + delayed publish `a<attempts>`, auth -> breaker, other 4xx -> failed `crm_<status>`, store error -> `db_error`, other -> `internal_error`), one PII-free log line per call. No `/Account`, `/CBooking`, Contact write or convert call anywhere.
- **app/api/integrations/dispatch/route.ts**: 1 KB cap (header and measured), signature over the raw body with expected URL, 401/400/413, zod strict `{key}`, 200 JSON for outcomes, 500 `dispatch_failed` only if the dispatcher throws.
- **Isolation guard**: three `VPS_ASYNC_ALLOWLIST` entries; real tree reports zero violations.

## Verification

- `npx vitest run tests/lead-sync.test.ts tests/integrations-dispatch.test.ts tests/espocrm-site-client.test.ts tests/outbox-backoff.test.ts tests/infra-vps-isolation-guard.test.ts`: 104 passed.
- eslint clean on all five source files and four new test files; no tsc errors in any touched file.
- Acceptance greps: `ESPOCRM_*` only in `lib/espocrm-client.ts`; `X-Skip-Duplicate-Check` in lead-sync; 0 matches for `/Account|/CBooking|action/convert`; `cExistingContactId` and `assignedUserId` present; `redirect: 'error'`, `AbortSignal.timeout`, `86400` present.
- Full suite: 5049 passed, 1 failed, 6 files failed to load. All unrelated to this plan and caused by the worktree environment: five files (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) cannot resolve `next-intl/.../server.react-server.js` through the symlinked `node_modules`; `seo-volume-pages` "lists every mirror route" timed out under full-suite load (79 s) and passed when re-run on its own. Orchestrator should re-run the full suite on the main checkout.
- `verify` skill steps run by hand (tsc scoped, eslint scoped, related tests, invariants); the new route is a QStash webhook (no admin session, no CSRF surface).

## Deviations from Plan

**1. [Process] Tests-first order.** RED runs were recorded for each task (missing-module failure for Task 1, 12 failing tests for Task 2, 8 failing for Task 3) before the implementation.

**2. [Process] Plan commit ledger not persisted.** Writing the `gsd-plan-head-before-81-07` file into the git dir is blocked by the sandbox compound-command guard (same as 81-01). `plan_head_before` is the worktree base SHA (HEAD before the first commit); `commits: 3` measured with `git rev-list --count` before this SUMMARY commit.

**3. [Process] `lib/outbox-backoff.ts` and the full client hardening were written during Task 1** and committed with Tasks 1 (client) and 2 (backoff) respectively; tests for them landed in Task 2.

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-81-15..21 mitigated: signature before parse, 1 KB cap and strict schema, one request on 401 plus 6 h breaker, code-only outbox errors and a PII-free log asserted by test, ref lookup before POST, ESPOCRM_* confined to the allowlisted client, `redirect: 'error'` and https-only).

## Notes for the verifier / follow-ups

- Edge LEAD-03 concurrency (parallel half) and LEAD-01 ordering are covered with an in-memory store whose claim mimics migration 064; the real advisory-lock claim is exercised only by the 81-01 live smoke.
- Live prerequisites for production delivery (not part of this plan): Vercel env `ESPOCRM_BASE_URL`, `ESPOCRM_API_KEY`, optional `ESPOCRM_LEAD_ASSIGNEE_ID`, `QSTASH_*` signing keys, `NEXT_PUBLIC_SITE_URL`. Until set, rows wait with `crm_unconfigured` (6 h cycles).
- `lead.booking` and `lead.purge` branches are added by 81-09/81-10 in `deliver()` of `lib/lead-sync.ts`.

## Self-Check: PASSED

- FOUND: lib/espocrm-client.ts, lib/outbox-store.ts, lib/outbox-backoff.ts, lib/lead-sync.ts, app/api/integrations/dispatch/route.ts, tests/lead-sync.test.ts, tests/integrations-dispatch.test.ts, tests/espocrm-site-client.test.ts, tests/outbox-backoff.test.ts
- FOUND commits: 3cf50de2, 3fb5afe1, 6a006f01
