---
phase: 83-crm-chatwoot-site-webhooks
plan: 01
subsystem: api
tags: [webhooks, hmac, chatwoot, supabase-rpc, outbox, qstash]

requires:
  - phase: 81-lead-capture
    provides: integration_outbox, outbox_enqueue, QStash dispatcher, integration_config gate pattern
  - phase: 82-site-crm-chatwoot-sync-foundation
    provides: contact_identities (espo_contact_id, erasing_at), OutboxStoreError, identity-store RPC wrapper shape
provides:
  - signed Chatwoot receiver POST /api/webhooks/chatwoot (verify -> classify -> one RPC -> after() publish)
  - migration 076 (webhook_deliveries, webhook_ingest, webhook_ingest_espo, webhook_purge) - written, NOT yet applied live
  - hook.* outbox key grammar (HOOK_KEY, parseHookTag) that handler plans 83-07..83-11 parse
  - pure helpers lib/webhook-verify.ts, lib/sync-origin.ts, lib/chat-payload.ts, lib/webhook-store.ts
affects: [83-02, 83-07, 83-08, 83-09, 83-10, 83-11, 83-13, 83-14, 83-16]

actuals:
  tokens: 19000
  tasks: 2
  commits: 3
plan_head_before: 1bec9e554f02791f2c2acfe8835b2d3035536922
plan_head_after: e4848ccc6f10d9cd93aa962651cbf8a1d8921082

tech-stack:
  added: []
  patterns:
    - "signature-first receiver: secrets -> size cap -> raw bytes -> HMAC -> only then JSON.parse"
    - "single atomic ingest RPC (gate, dedup, fuse, enqueue) with the event-type allowlist inside the SQL"
    - "deterministic v5-style uuid aggregate ids for integer Chatwoot ids (no mapping table)"

key-files:
  created:
    - supabase/migrations/076_inbound_webhooks.sql
    - app/api/webhooks/chatwoot/route.ts
    - lib/webhook-verify.ts
    - lib/sync-origin.ts
    - lib/chat-payload.ts
    - lib/webhook-store.ts
    - tests/sync-origin.test.ts
    - tests/webhooks-chatwoot-route.test.ts
    - tests/webhook-ingest-migration.test.ts
    - tests/webhook-store.test.ts
    - .planning/phases/83-crm-chatwoot-site-webhooks/83-01-smoke.sql
  modified:
    - lib/outbox.ts
    - tests/outbox.test.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "Receiver env names (CHATWOOT_WEBHOOK_SECRET, CHATWOOT_WEBHOOK_SECRET_PREVIOUS) live only in the route, which is allowlisted in the VPS isolation guard; every lib stays env-name free"
  - "Order in the route is secrets -> Content-Length cap -> byte read + re-check -> HMAC -> parse, so unconfigured always answers 401 and nothing is parsed before verification"
  - "Invalid-shape payloads answer 200 (Chatwoot never retries) and log key names only, filtered to [A-Za-z0-9_]{1,32}"
  - "Fuse ALERT line deliberately not added here: it belongs to plan 83-16"

patterns-established:
  - "hook.* keys: hook.<type>:<uuid>:<tag>, tag shapes c<n> | c<n>r<epoch> | c<n>b<bucket> | b<bucket>m<1-7>"
  - "Store wrappers import only createSupabaseServiceClient and OutboxStoreError (no CRM client)"

requirements-completed: [HOOK-03, HOOK-04]

duration: 40min
completed: 2026-10-26
status: partial
---

# Phase 83 Plan 01: Inbound Chatwoot webhook receiver Summary

**HMAC-verified Chatwoot receiver that turns one incoming message into one ids-only `hook.chat_intake` outbox row through a single atomic `webhook_ingest` RPC (migration 076 written, live apply pending).**

## Status

Tasks 1 and 2 are done and committed. **Task 3 is PENDING (orchestrator):** apply migration 076 live, run the rolled-back smoke, run advisors. `status: partial` until the orchestrator records those results below and flips it to `complete`.

## Accomplishments

- Receiver `POST /api/webhooks/chatwoot` (`runtime = 'nodejs'`, `maxDuration = 10`): fail-closed without a secret, 1 MiB cap (header and byte check, 413), raw-bytes HMAC-SHA256 over `<timestamp>.<body>` with the current and previous secret, two-sided 300 s window, constant-time compare after a length check; 401 before any JSON parsing or database call.
- One RPC per request. `webhook_ingest` allowlists the four Chatwoot hook types inside SQL (RAISE otherwise), honours the forward-only `chat_hooks_start` gate, dedups on `(source, delivery id)`, applies the loop fuse and enqueues through `outbox_enqueue`. The route then calls `publishAfterResponse(key, { delaySeconds, dedupSuffix: 'w' })` on `queued`.
- Delivery id = `X-Chatwoot-Delivery` when it matches `^[A-Za-z0-9-]{8,64}$`, else `b` + sha256 hex of the raw bytes.
- `message_created` classified per D-03: incoming (string or int 0) and not private -> intake; outgoing, private and every other event -> 200 ignored without a database call.
- `lib/outbox.ts`: five `hook.*` event types, `HOOK_KEY`, `parseHookTag` (four tag shapes), `publishAfterResponse`; all pre-existing key cases unchanged.
- D-19 groundwork: `webhook_ingest_espo` (content-hash dedup, person resolved inside the RPC, unlinked / erasing / fused / queued / exists, bucketed `hook.espo_contact` row on the person aggregate) and `webhook_purge` (per-source retention clamped to 1..365 days), plus `ingestEspo` / `purge` in the store.
- Receiver added to `VPS_ASYNC_ALLOWLIST` with a mechanism-naming reason; no env var was renamed to dodge the guard.

## Task Commits

1. **Task 1 (tracer): signed incoming Chatwoot message -> hook.chat_intake** - `9d55d4cc` (security)
2. **Task 2: D-19 EspoCRM ingest and purge groundwork** - `cbfa5a21` (security)
3. **Task 3 smoke SQL (orchestrator runs it)** - `e4848ccc` (test)

## Verification

- `npx vitest run tests/sync-origin.test.ts tests/webhooks-chatwoot-route.test.ts tests/webhook-ingest-migration.test.ts tests/outbox.test.ts tests/infra-vps-isolation-guard.test.ts` green; with `tests/webhook-store.test.ts` and the lead-sync / dispatch / crm-sync / chatwoot / identity / erasure suites: 36 files, 1087 tests green.
- `npx tsc --noEmit` shows no error in any lib/, app/ or new test file; `npx eslint --quiet` clean on all touched lib/route/test files.
- Acceptance greps: no `CHATWOOT_|ESPOCRM_` in the four pure libs; route imports no CRM client, dispatcher or handler.
- Tests ran through the symlinked main-checkout `node_modules`; nothing needed a next-intl server module, no symlink-only failures.

## Task 3: ORCHESTRATOR (PENDING)

Files: `/Users/romanustyugov/Desktop/Prestigo/.claude/worktrees/agent-a8369f6d1c80a5364/supabase/migrations/076_inbound_webhooks.sql` and `.planning/phases/83-crm-chatwoot-site-webhooks/83-01-smoke.sql` (also on the worktree branch).

1. MCP `list_migrations`: 075 newest, no 076. `apply_migration` name `076_inbound_webhooks` with the file text.
2. `execute_sql` the whole of `83-01-smoke.sql` (7.9 KB, one DO block). Success is exactly `SMOKE_OK_83_01`; any `SMOKE_FAIL_<step>` names the failed assertion. It covers: (a) gate off / unparseable gate value writes nothing, (b) queued, duplicate, exists, one outbox row, (c) `sync.espo` raises, (d) 21st delivery fused, (e) EspoCRM unlinked / queued with `hook.espo_contact:%:b%m5` key / duplicate / exists / erasing / bad input raises, (f) purge of a 31-day-old espocrm row, (g) anon and authenticated have no EXECUTE and no table SELECT.
3. `get_advisors` (security): no new ERROR naming `webhook_deliveries`, `webhook_ingest`, `webhook_ingest_espo`, `webhook_purge`.
4. `select count(*) from public.integration_config where key = 'chat_hooks_start'` must be 0.

Results (orchestrator to fill): apply = ___ ; smoke message = ___ ; advisor ERROR count for 076 objects = ___ ; chat_hooks_start count = ___ .

## Deviations from Plan

### Auto-fixed / additions

**1. [Rule 2 - Missing critical functionality] Added `tests/webhook-store.test.ts`**
- **Issue:** the store wrapper (RPC argument mapping, unexpected-shape -> `db_error`, espo row mapping) was only exercised through mocks in the route test, so its error handling had no direct test.
- **Fix:** small unit test file covering `ingest`, `ingestEspo` and `purge`.
- **Files modified:** `tests/webhook-store.test.ts` (not in the plan's `files_modified`)
- **Commit:** `cbfa5a21`

**2. [Rule 1 - Bug in my own test] QStash dedup id separator**
- **Found during:** Task 1 GREEN run. `publishOutboxDispatch` sanitises `:` to `_` in `deduplicationId`, so the tracer assertion checks the `_w` suffix, not `:w`. No production change.

### Notes

- TDD ordering: Task 1 code was written alongside its tests and the tests were run once together (one assertion fixed, see above), so a separate committed RED state does not exist for Task 1. Task 2 followed RED (migration test failed at collection) then GREEN.
- `lib/webhook-store.ts` was committed in Task 1 with `ingest` only and extended in Task 2, matching the plan's task split.

## Known Stubs

None. `classifyChatwootEvent` intentionally returns `ignore: not_handled` for `conversation_status_changed`, `conversation_updated` and `contact_updated`, and `isSiteEcho` / the `echo` result kind are not yet wired; plan 83-16 completes both (per the plan text, gate stays off until 83-14).

## Threat Flags

None. All new surface (the receiver, the three RPCs, `webhook_deliveries`) is in the plan's threat model (T-83-01..T-83-08).

## Next Phase Readiness

Wave-1 sibling plans do not depend on live 076. After the orchestrator applies 076 and the smoke passes, handler plans (83-07..83-11) can parse `hook.*` keys with `parseOutboxKey` and `parseHookTag`; 83-11 calls `ingestEspo`; 83-13 calls `purge`; 83-16 extends the classifier and the verification matrix.

## Self-Check: PASSED

- Files present: route, 5 libs touched/created, migration 076, smoke SQL, 4 new test files (checked via git commits `9d55d4cc`, `cbfa5a21`, `e4848ccc`).
- Commits exist on branch `worktree-agent-a8369f6d1c80a5364`.
