---
phase: 83-crm-chatwoot-site-webhooks
plan: 13
subsystem: infra
tags: [webhooks, retention, outbox, runbook, operations]
status: complete

requires:
  - phase: 83-01
    provides: createWebhookStore().purge and the webhook_purge RPC (migration 076, live)
  - phase: 83-05
    provides: infra/espocrm/webhook.mjs commands
  - phase: 83-06
    provides: infra/chatwoot/webhook.mjs commands
  - phase: 83-11
    provides: the EspoCRM receiver and the hook.espo_contact handler
provides:
  - "daily sweep step webhook_purge_failed (Chatwoot rows 7 days, EspoCRM rows 30 days), response field webhook_purged"
  - "outbox labels for the five hook.* event types and hints for hooks_off, contact_pending, cw_unprocessable"
  - "infra/vps/runbooks/inbound-webhooks.md: operator runbook (11 sections)"
  - "tests/inbound-webhooks-runbook.test.ts pin test"
  - "ROADMAP backlog item 999.10 (Chatwoot webhook reconcile job, D-21)"
affects: [83-14, 83-15]

actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: f158be3fc3c921531ce16ab6fbc8decf75e8c088
plan_head_after: a97939b6b7bf1be94001ae7f330100a437f77c12

tech-stack:
  added: []
  patterns:
    - "isolated sweep step: purge failure is recorded by code only and never stops the digest or the re-publish"
    - "runbook pin test: names, commands and every handler code pinned, secret/address/price scan"

key-files:
  created:
    - infra/vps/runbooks/inbound-webhooks.md
    - tests/inbound-webhooks-runbook.test.ts
  modified:
    - app/api/cron/outbox-sweep/route.ts
    - tests/outbox-sweep.test.ts
    - lib/outbox-labels.ts
    - tests/outbox-admin.test.ts
    - .planning/ROADMAP.md

key-decisions:
  - "The purge step sits right after the existing purge step and before the digest, so a purge problem is reported in the same response and never blocks anything after it"
  - "Runbook go-live pipes three values (ESPOCRM_WEBHOOK_ID, ESPOCRM_WEBHOOK_SECRET, CHATWOOT_WEBHOOK_SECRET); the two _PREVIOUS names are used only in rotation"

requirements-completed: [HOOK-03]
---

# Phase 83 Plan 13: Webhook operability Summary

**The webhook dedup table is purged daily in an isolated sweep step (7 days Chatwoot, 30 days EspoCRM), hook rows read like the others on /admin/outbox, and one runbook covers go-live, switch-off, rotation, lost events, the loop fuse and every outbox code.**

## Accomplishments

- **Task 1 (tracer)** `app/api/cron/outbox-sweep/route.ts`: `step('webhook_purge_failed', ...)` calls `createWebhookStore().purge({ chatwootDays: 7, espoDays: 30 })`; the count is returned as `webhook_purged` (null on failure). The route still imports no CRM code (the existing static guard stays green, the VPS isolation guard passes). Tracer gate: the `<verify>` set was re-run and passed (46 tests) before expanding.
- **Task 2** `lib/outbox-labels.ts`: labels `Chat intake`, `Chat resolved`, `Chat no-lead label`, `Chatwoot contact edit`, `EspoCRM contact edit`; hints for `hooks_off` (mentions `chat_hooks_start`), `contact_pending` (retries automatically), `cw_unprocessable` (Chatwoot refused the change). The `email_owned_elsewhere` hint (pointing at /admin/identities) already existed from 83-10 and is now also pinned. Still no imports.
- **Task 3** runbook with sections in the required order: what it does, when a chat becomes a Lead (with the D-18 and D-20 deviations in plain words), summary note convention (`Итог:` / `Summary:`), go-live, switch off, secret rotation (both systems), lost events (at-most-once, per-event recovery table), loop fuse ALERT, same-value re-edit limitation (D-19), outbox codes (every handler code and receiver outcome), erasure checklist addition (`notes_skipped`). The pin test also checks the runbook against the code base (codes still exist in lib/) and scans for secret-looking values, non-example addresses, phone numbers and prices. Backlog item 999.10 added after the 999.9 line (999.9 unchanged).
- Runbook notes folded in from earlier plans: 83-11 X to Y to X dedup trade-off, 83-06 residual 401 window during Chatwoot rotation, 83-05 `?v=2` EspoCRM rotation URL, Vercel env names.

## Task Commits

1. `1872aeb1` feat(83-13): daily purge of webhook delivery records (tracer)
2. `5b4fcc2c` feat(83-13): outbox labels and hints for chat and CRM webhook events
3. `a97939b6` docs(83-13): inbound webhooks runbook and reconcile backlog item

## Verification

- `npx vitest run tests/outbox-sweep.test.ts tests/outbox-admin.test.ts tests/outbox-digest.test.ts tests/inbound-webhooks-runbook.test.ts tests/crm-sync-runbook.test.ts tests/infra-vps-isolation-guard.test.ts`: 6 files, 200 tests pass.
- `npx eslint --quiet` clean on every touched lib, route and test file.
- `npx tsc --noEmit`: 8 errors, the documented baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none new.
- Acceptance greps: `webhook_purge_failed` count 1 in the route; `hook.chat_intake` 1 and `email_owned_elsewhere` 1 in outbox-labels; `^import` count 0 in outbox-labels; 11 `## ` headings in the runbook; `999.10 Chatwoot webhook reconcile job` count 1 in ROADMAP.md.
- The full `verify` skill gate was not run beyond the checks above (no price, i18n, middleware or secret change; the pre-commit hook ran on all three commits and passed).

## Deviations from Plan

**1. [Rule 1 - test update] Two exact-shape assertions in tests/outbox-sweep.test.ts changed.** The plan says the existing tests pass unchanged, but two of them (`toEqual` on the whole sweep response, in the normal and the all-steps-failing case) pin the exact response keys and error list, so adding `webhook_purged` and the `webhook_purge_failed` step necessarily changes them. Only the expected values were extended; the auth, order and every other assertion are untouched. The test file also mocks `@/lib/webhook-store` (default purge result 0) so the other sweep tests do not need a database.

**2. [Process] Tasks 1 and 2 were test-and-code in one pass.** Task 1's RED state was observed (4 failures before the code). Task 2's new test cases were written together with the three small label branches and passed on first run; no separate RED run was recorded.

**3. [Plan wording] Go-live pipes.** The plan says "four secret pipes". Only three values exist at go-live (Chatwoot secret, EspoCRM secret, EspoCRM webhook id); the two `_PREVIOUS` names are set only during rotation. The runbook documents the three, and says the `_PREVIOUS` pair stays unset until a rotation.

**4. [Scope note] `email_owned_elsewhere` hint** was already added by plan 83-10; this plan only pinned it in tests (the plan listed it as new).

## Known Stubs

None.

## Threat Flags

None. T-83-45 (secrets or customer data in the tracked runbook) is mitigated by the pin test; T-83-46 (unbounded growth of webhook_deliveries) is mitigated by the isolated daily purge. No package installs.

## Notes for the orchestrator / owner

- Nothing live was touched; the purge RPC (migration 076) is already applied. The first real purge runs at the next daily sweep after deploy.
- The runbook's go-live section is the checklist 83-14 and 83-15 follow. Facts still to confirm live (recorded by earlier plans, not new): the Chatwoot webhook list/create response shape, the `GET /contacts/<id>/conversations` shape, EspoCRM Note API and stream read, and whether EspoCRM sends only changed attributes.
- `.planning/ROADMAP.md`: only the one backlog line 999.10 added after 999.9; no progress or checkbox changes. STATE.md untouched.
- node_modules was symlinked into the worktree (not committed).

## Self-Check: PASSED

- Files present: infra/vps/runbooks/inbound-webhooks.md, tests/inbound-webhooks-runbook.test.ts, app/api/cron/outbox-sweep/route.ts, lib/outbox-labels.ts.
- Commits 1872aeb1, 5b4fcc2c, a97939b6 exist on branch worktree-agent-aee67038c975c9143.
