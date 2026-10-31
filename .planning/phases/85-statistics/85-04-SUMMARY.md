---
phase: 85-statistics
plan: 04
subsystem: chat-intake
tags: [chatwoot, channel, funnel, backfill, supabase-rpc]
status: partial
requires:
  - phase: 85-01
    provides: "migration 081 (live): chat_leads.channel, chat_channel_bucket(text), 6-arg chat_lead_reserve"
provides:
  - "ChatStore.reserveLead input channel?: string | null, sent as p_channel"
  - "leadFor passes the raw Chatwoot class of the creating conversation"
  - "infra/chatwoot/channel-backfill.mjs: owner-run, GET-only backfill printing idempotent UPDATE SQL"
affects: [85-05, 85-06]
tech-stack:
  added: []
  patterns: ["bucketing only in SQL (chat_channel_bucket); app and script pass/emit the raw class"]
key-files:
  created:
    - infra/chatwoot/channel-backfill.mjs
    - tests/channel-backfill.test.ts
  modified:
    - lib/chat-store.ts
    - lib/chat-intake.ts
    - tests/chat-store.test.ts
    - tests/chat-intake.test.ts
    - tests/helpers/chat-world.ts
decisions:
  - "No TypeScript or script-side channel mapping: the raw Chatwoot class goes to SQL, the bucket is computed by public.chat_channel_bucket"
  - "Backfill script validates lead id (lowercase uuid) and class (^Channel::[A-Za-z]{1,40}$) before building SQL; API failures print the HTTP status only"
metrics:
  tasks_total: 3
  tasks_done: 2
  tasks_pending: 1
actuals:
  tasks: 2
  commits: 2
plan_head_before: 542f7733074efb070195f4b74bd7f45644cf912b
plan_head_after: f69e1ab07fcaac54c7ff57187535acc22ff9d6ec
---

# Phase 85 Plan 04: Chat channel capture and backfill Summary

New chat Leads now store the Chatwoot channel of their creating conversation, and an owner-run read-only script produces the idempotent SQL that backfills the existing Leads. Task 3 (run + apply the backfill live) is PENDING (owner/orchestrator).

## Status

| Task | Name | Status | Commit |
| ---- | ---- | ------ | ------ |
| 1 (tracer) | conversation channel -> leadFor -> reserveLead -> rpc p_channel | DONE | 9dc5646f |
| 2 | owner-run read-only channel backfill script | DONE | f69e1ab0 |
| 3 | run the backfill and apply it live (owner + orchestrator) | PENDING (owner/orchestrator) | n/a |

## What was built

- `lib/chat-store.ts`: `reserveLead` input gains `channel?: string | null`; the rpc call sends `p_channel: input.channel ?? null` as the sixth argument of the live 6-arg `chat_lead_reserve`.
- `lib/chat-intake.ts`: `leadFor`'s reserve closure passes `channel: s.conversation.channel` (the raw class, e.g. `Channel::Telegram`). No `Channel::` literal was added to either file.
- `tests/helpers/chat-world.ts`: `LeadRow.channel`, written on the new-row path only (mirrors the SQL: open-row and lead_ref paths never touch it).
- Tests: chat-store (six p_ args; omitted and null channel send `p_channel` null), chat-intake (Telegram stored raw, default web widget stores `Channel::WebWidget`, a later WhatsApp conversation appends and the Lead keeps `Channel::Telegram`, a reservation without a channel stays null).
- `infra/chatwoot/channel-backfill.mjs` exports `parseBackfillInput`, `channelOf`, `backfillStatement`, `runBackfill`, `BackfillInputError`; GET-only, token via `loadChatwootConfig`, no argv, output limited to SQL, ids, HTTP statuses and counts. `tests/channel-backfill.test.ts` covers the pure helpers, a fake-API run (404, null conversation, SQL-injection class, PII/token absence, all-GET) and static guarantees.

## Verification

- `npx vitest run` on chat-store, chat-intake, erasure, crm-sync, webhook-isolation-runtime, webhook-isolation-guard, channel-backfill, infra-vps-isolation-guard: 8 files, 225 tests passed.
- chatwoot-inspect test still green (66 tests with channel-backfill).
- Scoped `tsc` clean for `lib/chat-store.ts`, `lib/chat-intake.ts`, `tests/helpers/chat-world.ts`, `tests/chat-*`, `tests/channel-backfill.test.ts`; eslint `--quiet` clean on all touched files.
- Static acceptance: 0 `POST|PUT|PATCH|DELETE` requests, 0 argv reads, `loadChatwootConfig` used.
- Input-error path of the script smoke-tested with bad stdin (exit 2, message without secrets). The script was NOT run against the live Chatwoot API.

## Deviations from Plan

None in behavior. Notes:

- Acceptance line `grep -c "channel: s.conversation.channel" lib/chat-intake.ts prints 1` is inexact: the file already had two other pre-existing uses of the same expression (lines 555, 579, lead source/description); the new one is at line 477. No behavior impact.
- The "conversation whose channel is null stores null" case cannot be produced through the fake Chatwoot (it always defaults `meta.channel`), so it is covered at the store level (reserveLead without a channel stores null) instead of through the intake.

## Task 3: PENDING (owner/orchestrator)

Owner runs, from the repo root, with `~/.config/prestigo/chatwoot-api.env` in place (the token never reaches the agent):

```
node infra/chatwoot/channel-backfill.mjs < .planning/phases/85-statistics/85-04-backfill-input.json > .planning/phases/85-statistics/85-04-backfill.sql
```

Prints to stdout one `UPDATE public.chat_leads SET channel = public.chat_channel_bucket('Channel::X') WHERE id = '<uuid>' AND channel IS NULL;` per resolvable Lead plus a final `-- channel-backfill: leads=<n> statements=<m> skipped=<k>` line; stderr shows only `conversation <id>: HTTP <status>` lines. Exit code 2 means the config file or the input needs fixing.

Orchestrator before: build `85-04-backfill-input.json` via MCP `execute_sql` (JSON array of `{lead_id, conversation_id}` for each `chat_leads` row with `channel IS NULL`, conversation from `chat_conversations`, preferring outcome `lead_created`, else earliest `created_at`, NULL when none; ids only). After the owner replies "backfill done": check every non-comment line against `^UPDATE public\.chat_leads SET channel = public\.chat_channel_bucket\('Channel::[A-Za-z]{1,40}'\) WHERE id = '[0-9a-f-]{36}' AND channel IS NULL;$`, apply via MCP, run `select channel, count(*) from public.chat_leads group by channel order by channel`, record the per-channel counts and the number of leads left NULL (404 / no conversation) here, then delete both `85-04-backfill*` files (never committed).

Per-channel counts after backfill: PENDING.

## Known Stubs

None.

## Threat Flags

None. T-85-13 (injection), T-85-14 (token/PII), T-85-15 (GET-only) are mitigated and unit-tested; T-85-16 is bounded by the 081 CHECK and the SQL bucket.

## Self-Check: PASSED

- `infra/chatwoot/channel-backfill.mjs`, `tests/channel-backfill.test.ts` exist.
- Commits 9dc5646f and f69e1ab0 exist on the worktree branch.
