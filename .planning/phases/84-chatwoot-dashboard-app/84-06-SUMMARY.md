---
phase: 84-chatwoot-dashboard-app
plan: 06
subsystem: infra
tags: [chatwoot, dashboard-app, config-as-code, sync, runbook]
requires: [84-03]
provides:
  - infra/chatwoot/dashboard-apps.json (desired Bookings Dashboard App)
  - dashboardApps resource in infra/chatwoot/sync.mjs (syncDashboardApps, --only dashboardApps)
  - operator runbook sections in infra/vps/runbooks/chatwoot-dashboard-app.md
affects: [84-07 (frame URL target), 84-09 (live registration and UAT use this runbook)]
tech-stack:
  added: []
  patterns: [title-matched idempotent resource, runbook content-guard test]
key-files:
  created:
    - infra/chatwoot/dashboard-apps.json
    - tests/chatwoot-dashboard-apps-config.test.ts
  modified:
    - infra/chatwoot/sync.mjs
    - infra/chatwoot/README.md
    - infra/vps/runbooks/chatwoot-dashboard-app.md
    - tests/chatwoot-sync.test.ts
    - tests/dashboard-app-runbook.test.ts
key-decisions:
  - "Dashboard App drift is compared with subsetEqual on content (key-order independent, length exact) instead of JSON.stringify, so a server that reorders keys does not cause a perpetual update"
  - "Sync matches by title and only creates or updates; there is no DELETE path for Dashboard Apps"
requirements-completed: [PANEL-01, PANEL-02]
status: complete
duration: 20min
completed: 2026-10-29
commits: 2
plan_head_before: 4c8e7a872954a2870959ff094054ec0f5c7f5810
plan_head_after: 215f35da93c534af6c189c016417812632cbf9dc
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Phase 84 Plan 06: Dashboard App registration and operator runbook Summary

The Bookings Dashboard App is now registered from git with one idempotent command (`node infra/chatwoot/sync.mjs --only dashboardApps`), and the runbook covers operator setup, revocation, troubleshooting and the go-live checklist.

## What was built

**Task 1 (tracer, `161aceb7`):** `infra/chatwoot/dashboard-apps.json` declares one app, "Bookings", with one frame item `https://rideprestigo.com/embed/chatwoot-dashboard` (no query, fragment or secret, D-01). `sync.mjs` gained `dashboardApps` as the last entry of `RESOURCE_ORDER` and `syncDashboardApps`: it lists `GET /dashboard_apps` (bare array), matches by title, creates with `POST` and updates drifted content with `PATCH /dashboard_apps/<id>`, both bodies wrapped in `dashboard_app`. It never deletes, and `--dry-run` issues GET requests only. The in-memory fake Chatwoot serves the new routes; tests cover create, an unchanged re-run, drift, an operator-made "Maps" app left untouched, no DELETE request, dry-run, `parseArgs`, and a full run twice.

**Task 2 (`215f35da`):** The runbook gained How it works, Operator setup (sessionStorage token, why persistent same-site storage was rejected, D-02), Permissions and revocation (D-01, D-04), What the panel shows, a Troubleshooting table (one row per UI-SPEC error message, with cause and fix), Registration, and a Go-live and UAT checklist (curl for `frame-ancestors` and no `x-frame-options`, `csp_regression.py --compare` then `--capture`, the manual checks from 84-VALIDATION.md). `infra/chatwoot/README.md` has a Dashboard Apps section. `tests/dashboard-app-runbook.test.ts` now pins section order, the required names, and every UI-SPEC error string, and keeps the no-secret, no-price and no-real-address checks.

## Verification

- `npx vitest run tests/chatwoot-sync.test.ts tests/chatwoot-dashboard-apps-config.test.ts tests/chatwoot-config.test.ts tests/dashboard-app-runbook.test.ts`: 176 passed.
- `RESOURCE_ORDER.at(-1) === 'dashboardApps'` import check exits 0 (no Chatwoot call).
- `npx tsc --noEmit`: no new errors outside the known baseline; eslint clean on changed test files.
- Acceptance greps: `'dashboardApps'` appears twice in sync.mjs, one `mutate('DELETE'` (pre-existing), 1 "## Operator setup", 1 "## Troubleshooting", README references `dashboard-apps.json`.
- Sync was NOT run against live Chatwoot; registration is for plan 84-09.

## Deviations from Plan

None. The plan was executed as written. The HANDLERS key is quoted (`'dashboardApps'`) so the plan's grep acceptance criterion counts it.

## Threat model

T-84-26 (secret in URL): config test asserts https, exact host and path, empty query, hash, credentials and port. T-84-27 (rewriting operator apps): title match, no DELETE, tested with an extra operator app. T-84-28 (runbook leak): content test for secret-shaped strings, non-example emails and currency amounts. No new threat surface.

## Known Stubs

None.

## Notes for the orchestrator

Tests ran through the node_modules symlink and passed here; no next-intl server module was involved. STATE.md and ROADMAP.md were not touched.

## Self-Check: PASSED

Files exist: dashboard-apps.json, sync.mjs, README.md, runbook, the three test files. Commits `161aceb7` and `215f35da` exist.
