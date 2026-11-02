---
phase: 83-crm-chatwoot-site-webhooks
plan: 05
subsystem: infra
tags: [espocrm, webhook, skipOwn, hmac, roles, acl]
status: complete

requires:
  - phase: 80-espocrm-as-code
    provides: infra/espocrm client, roles.json, sync.mjs, verify-acl.mjs, fake-espocrm test helper
provides:
  - "Sync writer role may own a webhook (Webhook scope) and post/read history Notes (stream all on Contact and Lead)"
  - "infra/espocrm/webhook.mjs: create / list / delete / --print secret|id / probe"
  - "espoSignature() mirroring EspoCRM 10.0.8 Sender, exported for the site-verifier cross-check (plan 83-11)"
  - "README section Inbound webhook (Phase 83): owner + skipOwn, secret custody, probe, gapless rotation"
affects: [83-06, 83-11, 83-14]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: 8ceef2f89a2354fcfbd1c54dc1a3b2043249b3fb

tech-stack:
  added: []
  patterns:
    - "Secret-bearing CLI: fixed key=value output, 0600 file, --print refused on a TTY (mirrors infra/chatwoot/inspect.mjs)"
    - "Webhook ACL probe: boolean scope with a list endpoint (PROBED_BOOLEAN_SCOPES) in verify-acl"

key-files:
  created:
    - infra/espocrm/webhook.mjs
    - tests/espocrm-webhook-script.test.ts
  modified:
    - infra/espocrm/roles.json
    - infra/espocrm/verify-acl.mjs
    - infra/espocrm/README.md
    - tests/espocrm-roles.test.ts

key-decisions:
  - "create runs only as prestigo-sync (apikey identity): EspoCRM forces skipOwn off for admin-created webhooks"
  - "A webhook whose re-read shows skipOwn false (or no owner, or no secret) is deleted again, so a broken one never lingers and a later run cannot report it as exists"
  - "verify-acl handles Webhook as a probed boolean scope: GET /Webhook allowed for the role holding true, exactly 403 for every other managed role"
  - "Rotation uses a marked URL (?v=2) for the new webhook because create is idempotent per event+url; no gap, receiver ignores the query"

requirements-completed: [HOOK-04, HOOK-03]

coverage:
  - id: D1
    description: "Sync writer gains Webhook scope and stream all on Contact and Lead; no other role changes"
    requirement: HOOK-04
    verification:
      - kind: unit
        ref: "tests/espocrm-roles.test.ts#Webhook scope (plan 83-05, HOOK-04)"
        status: pass
  - id: D2
    description: "create registers Contact.update as prestigo-sync with skipOwn, proves skipOwn stuck, is idempotent"
    requirement: HOOK-04
    verification:
      - kind: unit
        ref: "tests/espocrm-webhook-script.test.ts#webhook create"
        status: pass
  - id: D3
    description: "Secret custody: 0600 env file, never printed, --print refused on a TTY"
    requirement: HOOK-03
    verification:
      - kind: unit
        ref: "tests/espocrm-webhook-script.test.ts#webhook --print custody (TTY refusal)"
        status: pass
  - id: D4
    description: "probe signs like EspoCRM and reports verdict=ok only for 200 then 401"
    requirement: HOOK-03
    verification:
      - kind: unit
        ref: "tests/espocrm-webhook-script.test.ts#webhook probe (D-19 live check)"
        status: pass
---

# Phase 83 Plan 05: EspoCRM webhook as prestigo-sync Summary

**One owner-run script registers the Contact.update webhook as the API user prestigo-sync with skipOwn (echo guard at the source), keeps the secret in a 0600 file, hands it to Vercel only through a pipe, and can prove the live HMAC round trip.**

## Accomplishments

- Sync writer role: `"Webhook": true` and `"stream": "all"` on Contact and Lead; nothing else widened. Pinned by new assertions in `tests/espocrm-roles.test.ts` (only the Sync writer holds Webhook; stream only on Sync writer Contact/Lead).
- `verify-acl.mjs`: `Webhook` is a probed boolean scope, so the live ACL probe expects `GET /Webhook` allowed for the Sync writer and exactly 403 for Dispatcher and Sales manager (the canary role is unmanaged and never touched). The test fake `aclFake` learned boolean scopes.
- `infra/espocrm/webhook.mjs` (`parseWebhookArgs`, `runWebhook`, `espoSignature`, `WEBHOOK_EVENT`, `DEFAULT_WEBHOOK_URL`, `WEBHOOK_ENV_FILE`):
  - `create`: lists existing webhooks (event + url) and prints `webhook=exists` when found (exit 1 if skipOwn false); otherwise POSTs, re-reads, requires skipOwn true and an owner, writes the env file (0600, dir 0700) and prints `webhook=created id=<id> skipOwn=true`.
  - `list`, `delete <17-hex id>` (removes the env file when it holds that id), `--print secret|id` (refused on a TTY), `probe`.
  - URL guard: https and host rideprestigo.com only, unless `--allow-host`.
- README section "Inbound webhook (Phase 83)": event, owner and skipOwn rationale, custody pipes into `vercel env add ... --sensitive`, probe, rotation, and the warning that the receiver must never answer HTTP gone.

## Task Commits

1. Task 1 (tracer): `91ea23bd` security(83-05): EspoCRM webhook as prestigo-sync with skipOwn (tracer)
2. Task 2: `8ceef2f8` security(83-05): EspoCRM webhook custody, delete and signed probe

Tracer gate: the `<verify>` command was re-run after Task 1 and passed (55 tests) before expanding.

## Verification

- `npx vitest run tests/espocrm-roles.test.ts tests/espocrm-webhook-script.test.ts`: 66 passed.
- `npx vitest run tests/espocrm- tests/infra-`: 16 files, 580 tests passed.
- `node --check infra/espocrm/webhook.mjs` ok; acceptance greps: `identity: 'admin'` count 0 in webhook.mjs, no `secretKey=` / `ESPOCRM_WEBHOOK_SECRET=<value>` in README or script; roles.json node check exits 0.
- `npx tsc --noEmit`: 8 errors, the documented baseline (tests/ only). `npx eslint --quiet` on both test files: clean.

## Deviations from Plan

### Auto-fixed / judgement calls

**1. [Rule 2 - Critical] Broken webhook is removed on failed create**
- **Found during:** Task 1
- **Issue:** The plan only said to exit non-zero with `skipown_not_effective`. Leaving the admin-style webhook in place would make the next `create` report `exists` and keep echoing sync writes.
- **Fix:** On skipOwn-not-stuck, missing owner or missing secret the script DELETEs the webhook it just created and prints `cleanup=deleted|failed` on stderr; no env file is written.
- **Files modified:** infra/espocrm/webhook.mjs (test: "exits non-zero with skipown_not_effective ...")

**2. [Ordering] probe implemented in Task 1 commit**
- The probe code landed together with the rest of the CLI in Task 1 (one file, one contract); Task 2 added its tests, the print/delete/probe tests and the README. Those Task 2 tests therefore passed on first run (no separate RED), they were not written against missing code.

**3. [Docs] Rotation procedure uses a marked URL**
- `create` is idempotent per event+url, so the plan's "create a new one" would answer `exists` for the same URL. README documents registering the new webhook with `?v=2` on the receiver URL (receiver ignores the query), which keeps the rotation gap-free.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-83-18, T-83-19, T-83-20 mitigated or accepted as planned; no package installs).

## Not applied live (owner / orchestrator)

Nothing here touches EspoCRM, Chatwoot or the VPS. For plan 83-14 the owner still has to: run `node infra/espocrm/sync.mjs --only roles` (applies Webhook + stream), `node infra/espocrm/verify-acl.mjs`, `node infra/espocrm/webhook.mjs create`, pipe id/secret into Vercel, and after the receiver deploy run `webhook.mjs probe`. Assumptions A5 (stream all is enough to post Notes) and A12 (webhook queue about 5 min) remain to be proven live.

## Notes for the orchestrator

- node_modules was symlinked into the worktree (git-ignored, not committed). All tests ran through the symlink without next-intl issues.
- The plan commit ledger file could not be written from this subagent (path outside the worktree is blocked); `commits: 2` was measured with `git rev-list --count 1bec9e55..HEAD` before this SUMMARY commit.

## Self-Check: PASSED

- infra/espocrm/webhook.mjs, tests/espocrm-webhook-script.test.ts: present; commits 91ea23bd and 8ceef2f8 exist.
