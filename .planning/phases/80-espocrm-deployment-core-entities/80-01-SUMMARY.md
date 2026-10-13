---
phase: 80-espocrm-deployment-core-entities
plan: 01
subsystem: infra
tags: [espocrm, config-as-code, rest-client]
status: blocked
requirements: [CRM-02, CRM-03]
key-files:
  created:
    - infra/espocrm/lib/client.mjs
    - infra/espocrm/sync.mjs
    - infra/espocrm/settings.json
    - tests/helpers/fake-espocrm.ts
    - tests/espocrm-sync.test.ts
actuals:
  tasks: 1
  commits: 1
---

# Phase 80 Plan 01: EspoCRM sync foundation Summary (PARTIAL - BLOCKED at live apply)

Plan is NOT complete. Task 2 code and tests are committed and green, but the live
`PUT /Settings` was refused with 403, so the tracer gate failed and Task 3 was not started.

## Task status

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 | Owner creates prestigo-config / prestigo-sync (D-17) | completed by owner (verified by orchestrator) | n/a |
| 2 | Client + sync engine + settings resource (tracer) | code + 21 tests done; LIVE APPLY BLOCKED | 95c53aa7 |
| 3 | README, .gitignore, PII rules | NOT STARTED (held back by the tracer gate) | - |

## Confirmed token-header semantics (espocrm 10.0.8 sources)

`Authentication::login` reads `HeaderKey::AUTHORIZATION_BY_TOKEN = 'Espo-Authorization-By-Token'` and
treats the value `'true'` as "the password slot is an auth token". Client follows this: first call
`GET /api/v1/App/user` with `Espo-Authorization: base64(user:password)`, then
`Espo-Authorization: base64(user:token)` + `Espo-Authorization-By-Token: true`. API key: `X-Api-Key`.

## Live runs (one attempt each, no retries)

1. `node infra/espocrm/sync.mjs --dry-run --only settings` -> exit 0:
   `[dry-run] [update] settings settings` / `settings: create=0 update=1 unchanged=0 skipped=0 removed=0` /
   `summary: create=0 update=1 removed=0`. Proves the password exchange (prestigo-config login) and GET /Settings work.
2. `node infra/espocrm/sync.mjs --only settings` -> exit 2: `API error: PUT /Settings -> 403`.
   Login succeeded in the same run (GET /Settings passed); only the write was refused. No further live calls were made.
3. Third (idempotency) run: not performed.

## Diagnosis (from reading 10.0.8 source, no extra live calls)

`Controllers/Settings::putActionUpdate` and `SettingsService::setConfigData` both throw Forbidden only when
`!$user->isAdmin()`. GET /Settings is allowed for any user. So the most likely cause is that the CRM user
`prestigo-config` is not of Type "Admin" (e.g. created as Regular/API) or is not Active as an admin.
Owner action: in Administration -> Users, open prestigo-config, confirm Type = Admin, then re-run
`node infra/espocrm/sync.mjs --only settings` (then once more for the `unchanged=1` line).

## Deviations

- Tracer gate failed (Rule 1 surface, not auto-fixable: needs a CRM-side fix by the owner). Task 3 held back per the gate.

## Remaining work for the continuation

1. Owner fixes prestigo-config type; run live apply twice; record the two output lines here.
2. Task 3: `.gitignore` rules (`infra/espocrm/.work/`, `infra/espocrm/**/*.env`), `infra/espocrm/README.md`, README/check-ignore tests, commit with `security:` prefix.
3. Flip `status: blocked` to `status: complete` and finish the SUMMARY.

## Self-Check

Files and commit 95c53aa7 verified present. Vitest `tests/espocrm-sync.test.ts`: 21/21 pass; eslint clean; no tsc errors in new files.
