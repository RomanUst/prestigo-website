---
phase: 83-crm-chatwoot-site-webhooks
plan: 16
subsystem: api
tags: [webhooks, hmac, chatwoot, echo-drop, loop-fuse, outbox]

requires:
  - phase: 83-crm-chatwoot-site-webhooks
    provides: plan 83-01 receiver (verify, classify, webhook_ingest RPC, hook.* key grammar)
provides:
  - classifyChatwootEvent for all four subscribed events (message_created, conversation_status_changed, conversation_updated, contact_updated)
  - HOOK-04 receiver layer - site fingerprint echo drop and contact fuse limit 20 with one ALERT webhook_loop_fused line
  - HOOK-03 verification matrix, secret rotation, delivery-id fallback and log-hygiene tests
affects: [83-10, 83-11, 83-12, 83-14]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3
plan_head_before: cc9ad8c7adea4f02617af325e3e08dd42d095ea8
plan_head_after: 3f666399d96be93b85baa0debb52442f904723fb

tech-stack:
  added: []
  patterns:
    - "echo drop before any ingest plan: isSiteEcho(contact) runs first, then the change-set filter"
    - "fail-open change-set filter: unreadable changed_attributes counts as relevant (handler converges on current state)"
    - "resolve moment only from payload updated_at or the signed header timestamp, never changed_attributes"

key-files:
  created:
    - tests/chat-payload.test.ts
    - tests/webhook-verify.test.ts
  modified:
    - lib/chat-payload.ts
    - app/api/webhooks/chatwoot/route.ts
    - tests/sync-origin.test.ts
    - tests/webhooks-chatwoot-route.test.ts

key-decisions:
  - "lib/sync-origin.ts and lib/webhook-verify.ts needed no change: the new fingerprint and verification tests passed against 83-01's code, so signatures and output format stay a stable contract for plan 83-10"
  - "Fuse limit 20 is set only on hook.chat_contact plans; message and conversation plans keep fuseLimit null"
  - "The ALERT line fires on any fused outcome, carries only source and entityKey (cw:contact:<id>), and is one console.error call"
  - "Non-resolved status and missing no-lead label are ignored before any id-based key is built; a missing or non-positive id is invalid for every event (200, key names only)"

patterns-established:
  - "ignore reasons: not_incoming, private, not_resolved, no_label, irrelevant_change, unsubscribed_event (replaces 83-01's not_handled)"

requirements-completed: [HOOK-03, HOOK-04]

duration: 25min
completed: 2026-10-26
status: complete
---

# Phase 83 Plan 16: Complete the Chatwoot receiver Summary

**All four subscribed Chatwoot events now map to exactly one outcome; the site's own fingerprinted contact writes are dropped before the RPC, contact events carry fuse limit 20 with an ids-only ALERT line, and the HMAC window, rotation and log-hygiene edges are pinned by tests.**

## Accomplishments

- `classifyChatwootEvent` (lib/chat-payload.ts):
  - `contact_updated`: `isSiteEcho` first, then the email/phone change-set filter (array-of-single-key and single-object shapes, unreadable shape = relevant), then `hookContactKey` (30 s bucket, availableAt at bucket end), `fuseLimit` 20, entityKey `cw:contact:<id>`.
  - `conversation_status_changed`: status `resolved` -> `hook.chat_resolve` via `hookResolveKey(conv, epoch)`; epoch from payload `updated_at` (float seconds, numeric string or ISO), falling back to the signed header timestamp; `changed_attributes` is never read for time. Other statuses -> `not_resolved`.
  - `conversation_updated`: only labels containing `no-lead` -> `hook.chat_label` (`c<conv>`), else `no_label`.
  - `message_created` unchanged from 83-01 (string 'incoming' or int 0, not private); every other event -> `unsubscribed_event`.
- Route: `fused` outcome writes exactly one `console.error("[webhook] ALERT webhook_loop_fused source=chatwoot entity=cw:contact:<id>")`, publishes nothing, answers 200. The echo kind was already routed to 200/ignored by 83-01.
- Tests: new `tests/chat-payload.test.ts` (event filter, echo, irrelevant, fuse limit, resolve moment, labels, unsubscribed) and `tests/webhook-verify.test.ts` (300 s ok, 301 s stale both directions, secret list, malformed, short/long/non-ASCII signature never throws); extended `tests/sync-origin.test.ts` and `tests/webhooks-chatwoot-route.test.ts` (contact tracer, echo, fused ALERT, resolve/label rows, previous-secret rotation, delivery-id fallback, log-spy hygiene across intake, contact, invalid and fused requests).

## Task Commits

1. **Task 1 (tracer): contact_updated filter, echo drop, fuse alert** - `557d100d`
2. **Task 2: resolve, no-lead label, message variants, unsubscribed events** - `007678ee`
3. **Task 3: verification matrix, rotation, delivery id, log hygiene** - `3f666399`

(`commits: 3` counts the task commits; the SUMMARY commit follows `plan_head_after`.)

## Verification

- `npx vitest run tests/chat-payload.test.ts tests/sync-origin.test.ts tests/webhook-verify.test.ts tests/webhooks-chatwoot-route.test.ts`: 145 passed. With `tests/infra-vps-isolation-guard.test.ts`, `tests/webhook-ingest-migration.test.ts`, `tests/webhook-store.test.ts`, `tests/outbox.test.ts`: 92 passed, no isolation-guard violation.
- `npx eslint --quiet` clean on the four lib/route files and the four test files; `npx tsc --noEmit` prints no error for lib/, app/ or the touched tests.
- `grep -cE "CHATWOOT_|ESPOCRM_"` is 0 for webhook-verify, sync-origin, chat-payload; receiver still imports no CRM client, dispatcher or handler.
- Tests ran through the symlinked main-checkout `node_modules`; no symlink-only failures. The full `verify` skill gate was not run beyond the listed vitest/eslint/tsc checks; the changes touch no prices, messages or middleware.

## Deviations from Plan

None - plan executed as written. The plan's "change only where a test exposes a defect" clauses for lib/sync-origin.ts and lib/webhook-verify.ts resulted in no changes to those files (all new cases passed against 83-01's implementation). Task 3's route changes were likewise test-only. The RED step was observed for Tasks 1 and 2 (new tests failed before the classifier change); Task 3 tests passed immediately because the behavior already existed.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the ALERT log line (ids only, covered by T-83-55 test).

## Notes for dependants

- Plan 83-10 must write `custom_attributes.site_sync_fp = contactFingerprint({name, email, phone_number, identifier})` of the values it sends, otherwise the receiver echo drop never fires (the 20-per-10-min fuse remains the backstop).
- Real payload shapes (message_type, updated_at, changed_attributes) are confirmed by the 83-14 live probe; the classifier tolerates both documented variants.

## Self-Check: PASSED

- Files present: lib/chat-payload.ts, app/api/webhooks/chatwoot/route.ts, tests/chat-payload.test.ts, tests/webhook-verify.test.ts, tests/sync-origin.test.ts, tests/webhooks-chatwoot-route.test.ts.
- Commits `557d100d`, `007678ee`, `3f666399` exist on branch `worktree-agent-a81bd0b35c4cfe52e`.
- STATE.md and ROADMAP.md untouched.
