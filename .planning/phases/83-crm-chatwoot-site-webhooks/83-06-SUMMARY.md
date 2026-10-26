---
phase: 83-crm-chatwoot-site-webhooks
plan: 06
subsystem: infra
tags: [chatwoot, webhook, hmac, secret-custody, config-as-code, fake-api]
requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: infra/chatwoot/lib/client.mjs, inspect.mjs (TTY_REFUSAL, unwrapList), pre-commit infra secret gate
  - phase: 82-site-chatwoot-sync
    provides: tests/helpers/fake-chatwoot.ts (contacts only)
provides:
  - infra/chatwoot/webhooks.json (desired account webhook, four subscriptions)
  - infra/chatwoot/webhook.mjs (ensure / list / delete / rotate / --print secret / probe)
  - infra/vps/env/inbound-webhooks.env.example (five inbound-webhook names, arms the pre-commit gate)
  - extended tests/helpers/fake-chatwoot.ts (conversations, message paging, inboxes, additional_attributes, webhook CRUD, onWrite)
affects: [83-handler-plans, 83-14]
tech-stack:
  added: []
  patterns:
    - "owner-run config-as-code script with injectable client/fetch/out/err; secret emitted only via a no-newline write channel into a non-TTY pipe; every other output line scrubbed of seen secrets"
key-files:
  created:
    - infra/chatwoot/webhooks.json
    - infra/chatwoot/webhook.mjs
    - infra/vps/env/inbound-webhooks.env.example
    - tests/chatwoot-webhook-script.test.ts
    - tests/chatwoot-fake-conversations.test.ts
  modified:
    - infra/chatwoot/README.md
    - tests/helpers/fake-chatwoot.ts
key-decisions:
  - "webhook.mjs does not call inspect.mjs printSecret: that function rejects any kind outside its closed SECRET_KINDS list and inspect.mjs must not be modified, so webhook.mjs imports TTY_REFUSAL and unwrapList and implements the same TTY-first, fetch-nothing-on-a-terminal behaviour itself"
  - "print writes through a separate write channel (falls back to out) so a trailing newline never lands in the stored Vercel value"
  - "probe uses redirect: manual so a redirecting receiver shows as a non-200 first status instead of being followed or throwing"
  - "fake chatwoot refuses a second webhook with the same url (422) like Chatwoot, so rotate is proven as delete then create"
patterns-established:
  - "Phase 83 plans use fake-chatwoot seed options (inboxes, conversations, webhooks) plus intercept/onWrite; none edits the helper again"
requirements-completed: [HOOK-03]
status: complete
commits: 2
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: dc557f143ed605d768b2cb6c7e321035d13d1059
actuals:
  tokens: 17700
  tasks: 2
  commits: 2
duration: ~20 min
completed: 2026-10-26
---

# Phase 83 Plan 06: Chatwoot account webhook as config-as-code Summary

**One owner command (`webhook.mjs ensure`) makes Chatwoot's account webhook match the repo (four subscriptions, canonical apex URL), the generated secret reaches Vercel only through a pipe, rotation is `rotate`, and `probe` proves the production signature round trip (verdict=ok only for 200,401,401).**

## Performance

- Duration: ~20 min
- Tasks: 2 of 2 (Task 1 tracer, Task 2 auto), 2 task commits
- Nothing was run against a live system: no Chatwoot, Vercel or production request was made.

## Accomplishments

- `infra/chatwoot/webhooks.json` declares exactly one account webhook to `https://rideprestigo.com/api/webhooks/chatwoot` with `message_created`, `conversation_status_changed`, `conversation_updated` (D-20, no-lead label) and `contact_updated`.
- `webhook.mjs` commands: `ensure` (create / PATCH subscriptions as sets / unchanged; two webhooks with the url -> exit 1 `error=duplicate_webhooks`), `list` (never the secret), `delete <positive int>`, `rotate` (DELETE then POST, prints next steps and no secret), `--print secret` (refuses a TTY before fetching anything; writes the bare value), `probe` (three requests with `X-Chatwoot-Timestamp`, `X-Chatwoot-Delivery`, `X-Chatwoot-Signature`; correct, changed body, 600 s stale).
- Receiver URL must be https on `rideprestigo.com` (RESEARCH A13, T-83-23) unless `--allow-host`; credentials in the URL are refused.
- `inbound-webhooks.env.example` lists the five names with empty values; the four `*SECRET*` names are picked up by the `.husky/pre-commit` derivation (asserted in a test).
- `tests/helpers/fake-chatwoot.ts` extended per contract (conversations by display id with `meta.channel`/`meta.sender`, message paging `after=<id>` ascending 100/page with integer `message_type`, inboxes, `additional_attributes` shallow merge, administrator-only webhook CRUD with generated secret, `onWrite` after every contact create/update). All pre-existing fake behaviour unchanged.
- README section "Inbound webhook (Phase 83)": subscriptions and why, at-most-once delivery (recovery in the runbook, D-21), custody table rows, exact pipe commands, rotation order, probe.

## Task Commits

1. Task 1 (tracer): `c7b54e28` security(83-06): Chatwoot account webhook as config-as-code (tracer)
2. Task 2: `dc557f14` security(83-06): Chatwoot webhook rotation and signed live probe

## Verification

- `npx vitest run tests/chatwoot-webhook-script.test.ts tests/chatwoot-fake-conversations.test.ts tests/chatwoot-inspect.test.ts tests/chatwoot-contact-sync.test.ts tests/chatwoot-sync.test.ts tests/erasure.test.ts`: 6 files, 216 tests pass (erasure.test.ts also uses the fake).
- `node --check infra/chatwoot/webhook.mjs` ok; eslint clean on the three test files; `tsc --noEmit` shows no errors in the touched files.
- All acceptance greps pass (json check exit 0, five empty names, README heading count 1, PREVIOUS mentioned, no `CHATWOOT_WEBHOOK_SECRET=<value>` pattern).
- Pre-commit hook (secret gate, infra gate, price gate) ran on both commits and passed.
- CLI smoke without network: unknown command and `delete abc` exit 2 before any request.
- The tests run through the symlinked `node_modules`; nothing failed because of it.

## Deviations from Plan

### Auto-fixed / judgment calls

**1. [Rule 3 - Blocking] printSecret not reused**
- **Issue:** the plan says to reuse `inspect.mjs` `printSecret('webhook-secret', ...)`, but that function returns exit 2 for any kind outside `SECRET_KINDS = ['website-token', 'hmac-token']`, and inspect.mjs must not be modified (its header states the list is deliberately closed).
- **Fix:** `webhook.mjs` imports `TTY_REFUSAL` and `unwrapList` from inspect.mjs and implements the same behaviour (TTY refusal first, nothing fetched on a terminal, one value written). Tests cover it (test names contain "TTY").
- **Files:** infra/chatwoot/webhook.mjs. **Commit:** c7b54e28

**2. [Plan wording] "Rotation has no gap" is not literally achievable**
- Chatwoot generates the new secret at `rotate` time and Vercel only reads env on redeploy, so deliveries signed with the new secret between `rotate` and the redeploy are rejected (and never retried: at-most-once). The README keeps the plan's order (current -> `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` first) and states this residual window and the recovery route (runbook, D-21) instead of claiming zero loss. A later plan or the owner may want to decide whether that is acceptable.

No other deviations.

## Authentication Gates

None (nothing live was touched).

## Known Stubs

None.

## Threat Flags

None. T-83-21 (no secret in output/README/args), T-83-22 (account-level webhook only) and T-83-23 (URL pinned to the apex, probe proves 200) are mitigated and covered by tests.

## For the orchestrator / owner (83-14)

- Live steps are NOT done here: `webhook.mjs ensure`, `--print secret | vercel env add CHATWOOT_WEBHOOK_SECRET ...`, `probe` run against production in 83-14.
- Assumed and still to confirm live: the Chatwoot webhook list/create response shape (tolerated as `payload.webhooks`, `payload` array or top-level array; create id read from `payload.webhook.id`, `payload.id`, `webhook.id` or `id`), and that the apex serves POSTs without a redirect (a redirect would show as a non-200 first probe status).
- The probe's first request needs the receiver (a later Phase 83 plan) to return 200 for a private outgoing `message_created`.

## Self-Check: PASSED

- FOUND: infra/chatwoot/webhooks.json, infra/chatwoot/webhook.mjs, infra/vps/env/inbound-webhooks.env.example, tests/chatwoot-webhook-script.test.ts, tests/chatwoot-fake-conversations.test.ts
- FOUND commits: c7b54e28, dc557f14
