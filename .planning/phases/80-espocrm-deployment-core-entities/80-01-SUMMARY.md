---
phase: 80-espocrm-deployment-core-entities
plan: 01
subsystem: infra
tags: [espocrm, config-as-code, rest-client, settings, gitignore]
status: complete
requirements: [CRM-02, CRM-03]
requires: []
provides:
  - "infra/espocrm/lib/client.mjs two-identity REST client (admin password->token, apikey)"
  - "infra/espocrm/sync.mjs read-then-diff engine with --dry-run/--only and the settings resource"
  - "tests/helpers/fake-espocrm.ts shared in-memory fake EspoCRM"
  - "Live CRM on EUR / Europe/Prague, applied from git and idempotent"
  - "infra/espocrm/README.md naming interface (C prefix) + ownership matrix + PII rules"
affects: [80-02, 80-04, 80-05, 80-06, 80-07, 80-08, 80-09, 80-10, 80-11, 80-12, 80-13]
tech-stack:
  added: []
  patterns: [read-then-diff sync mirroring infra/chatwoot, single-flight request chain, 401 poison (never retry), secret redactor]
key-files:
  created:
    - infra/espocrm/lib/client.mjs
    - infra/espocrm/sync.mjs
    - infra/espocrm/settings.json
    - infra/espocrm/README.md
    - tests/helpers/fake-espocrm.ts
    - tests/espocrm-sync.test.ts
  modified:
    - .gitignore
decisions:
  - "Token presentation confirmed from 10.0.8 source: Espo-Authorization base64(user:token) + Espo-Authorization-By-Token: true"
  - "prestigo-config must be Type Admin for PUT /Settings (403 otherwise); owner fixed it"
metrics:
  completed: 2026-10-13
actuals:
  tasks: 3
  commits: 4
plan_head_before: 5e8b249eef1185a7ee9dae10742f268fae73c02c
plan_head_after: e37f367f47b5c00c0a8def3367370dbc5cc9c539
---

# Phase 80 Plan 01: EspoCRM sync foundation Summary

Hardened two-identity EspoCRM REST client plus a read-then-diff sync engine applying the `settings` resource (EUR, Europe/Prague, b2cMode off) to the live CRM, idempotent on re-run, with git-ignore rules and a README fixing the C-prefix naming interface for later phases.

## Task status

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 | Owner creates prestigo-config / prestigo-sync (D-17) | completed by owner (verified by orchestrator: both env files mode 600, keys present) | n/a |
| 2 | Client + sync engine + settings resource (tracer) | done, live apply verified | 95c53aa7 |
| 3 | README, .gitignore, PII rules | done | e37f367f |

Additional commit: bf1b4824 (partial SUMMARY written while blocked; superseded by this file).

## Confirmed token-header semantics (espocrm 10.0.8 sources)

`Authentication::login` reads `HeaderKey::AUTHORIZATION_BY_TOKEN = 'Espo-Authorization-By-Token'` and
treats the value `'true'` as "the password slot is an auth token". The client follows this: first call
`GET /api/v1/App/user` with `Espo-Authorization: base64(user:password)`, then
`Espo-Authorization: base64(user:token)` + `Espo-Authorization-By-Token: true`. API key: `X-Api-Key`.

## Live runs (one attempt each, no retries after any 401)

1. `node infra/espocrm/sync.mjs --dry-run --only settings` (earlier session) -> exit 0:
   `settings: create=0 update=1 unchanged=0 skipped=0 removed=0`. Only GET requests.
2. First apply attempt (earlier session) -> exit 2: `API error: PUT /Settings -> 403`. Cause: `prestigo-config`
   was not Type Admin (`Settings` controller and `SettingsService::setConfigData` throw Forbidden for non-admins).
   Owner changed the user to Type = Admin, Is Active on, password unchanged.
3. Apply after the owner fix -> exit 0:
   `[update] settings settings` / `settings: create=0 update=1 unchanged=0 skipped=0 removed=0` / `summary: create=0 update=1 removed=0`
4. Idempotency run -> exit 0:
   `settings: create=0 update=0 unchanged=1 skipped=0 removed=0` / `summary: create=0 update=0 removed=0`

No diagnostic `GET /App/user` was needed: the first run after the owner fix succeeded.

## Verification

- `npx vitest run tests/espocrm-sync.test.ts tests/infra-vps-isolation-guard.test.ts`: 2 files, 47 tests pass
  (23 espocrm tests including the new check-ignore and README needle assertions).
- `npx eslint --quiet tests/espocrm-sync.test.ts infra/espocrm`: clean.
- `.gitignore` has `infra/espocrm/.work/` and `infra/espocrm/**/*.env`; `infra/espocrm/settings.json` stays tracked.

## Deviations from Plan

### Auto-fixed Issues

None in code. One CRM-side blocker (surface, not a code defect):

**[Rule 3 - Blocking] prestigo-config was not an Admin user**
- **Found during:** Task 2 live apply
- **Issue:** `PUT /Settings` returned 403 although login and GET worked
- **Fix:** owner set Type = Admin in Administration -> Users; no code change
- **Commit:** none (CRM configuration)

Note for later plans: Task 1 instructions say Type `Admin`; the owner's first creation did not match, so
`verify`-style preflight in later plans should surface a 403 on admin-only endpoints as "check prestigo-config Type".

## Known Stubs

None.

## Threat Flags

None. The client talks only to the already-planned crm.rideprestigo.com host over https with `redirect: 'error'`.

## Self-Check: PASSED

- 95c53aa7, bf1b4824, e37f367f present in `git log`.
- infra/espocrm/lib/client.mjs, sync.mjs, settings.json, README.md, tests/helpers/fake-espocrm.ts, tests/espocrm-sync.test.ts present.
- `commits: 4` counts plan-01 commits only (95c53aa7, bf1b4824, e37f367f, and this SUMMARY commit); the range from `plan_head_before` also contains merge commits and plans 80-02/80-03 work from other executors, so `git rev-list` over that range is larger.
