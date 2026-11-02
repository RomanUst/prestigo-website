---
phase: 83-crm-chatwoot-site-webhooks
plan: 08
subsystem: api
tags: [chatwoot, espocrm, outbox, dispatcher, history-note, qstash]

requires:
  - phase: 83-07
    provides: ensureIntake / buildIntakeContext, chat-io Note and stream helpers, hook-dispatch router, chat-world test world
  - phase: 83-04
    provides: formatResolveNote, summaryFromNotes, resolveMarker, topicLabels, conversationUrl
  - phase: 83-16
    provides: hook.chat_resolve key with the resolve epoch (receiver)
provides:
  - hook.chat_resolve handler (lib/chat-resolve.ts deliverChatResolve)
  - readMessagePages in lib/chat-io.ts (page-cap truncation flag)
affects: [83-14, 83-12]

requirements-completed: [HOOK-02]

actuals:
  tokens: 40000
  tasks: 2
  commits: 2
plan_head_before: c7d03160599454d92488c32e19db6271e7c8b759
plan_head_after: 8d68b3eb1518040419b240a020a31dd4de7f0f21

tech-stack:
  added: []
  patterns:
    - "one history Note per resolve moment: key c<id>r<epoch> + stream marker check before the POST"
    - "resolve runs ensureIntake first (same code path, same per-conversation outbox mutex)"

key-files:
  created:
    - lib/chat-resolve.ts
    - tests/chat-resolve.test.ts
  modified:
    - lib/hook-dispatch.ts
    - lib/chat-io.ts
    - lib/chat-classify.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "Target order: identity Contact, recorded Contact, chat-Lead Contact; a customer without a synced Contact retries (contact_pending); then chat/adopted Lead; else no_target"
  - "The message count is rendered as `N+` (N = counted messages of the first 2000 read) when the 20-page cap ended the read"

status: complete
completed: 2026-10-26
---

# Phase 83 Plan 08: Chat resolve history entry (HOOK-02) Summary

**A resolved Chatwoot conversation now leaves exactly one readable history Note (channel, UTC dates, message count, topics, first message, the operator's `Итог:` summary, Chatwoot link, `[cw:<id>:r<epoch>]` marker) on the person's EspoCRM Contact, or on the chat/adopted Lead when no Contact exists.**

## Accomplishments

- `deliverChatResolve` (`lib/chat-resolve.ts`) runs behind both config gates of `hook-dispatch`: key -> `ensureIntake` (Pitfall 12) -> target (D-11) -> `streamHasMarker` check (D-10 idempotency) -> re-read of conversation, messages (up to 20 pages), inbox -> `formatResolveNote` -> one `postNote`. Never a transcript, never a Chatwoot write.
- Outcomes/codes: `sent` (log codes `note_contact`, `note_lead`, `already_written`), skipped `bad_key`, `hooks_off`, `before_start`, `conversation_missing`, `identity_erasing`, `no_incoming_message`, `contact_missing`, `no_target`; rescheduled `contact_pending` (terminal `contact_pending_exhausted` after the attempt budget); `deadline` reschedule.
- D-06 handled: `customer` / `known_contact` conversations (which created nothing at start) still get their entry on the recorded Contact; `filtered` / `no-lead` conversations of unknown people have no target and write nothing.
- Message count: incoming + outgoing + template, excluding activity and private notes; 150 messages (10 activity, 5 private) count 135 over two pages; the 20-page cap renders `Messages: 2000+`.
- `lib/hook-dispatch.ts` routes `hook.chat_resolve`; VPS allowlist entry added for `lib/chat-resolve.ts`.
- Verification: `npx vitest run` on chat-resolve (30), chat-intake, hook-dispatch, chat-classify, infra-vps-isolation-guard, webhook-isolation-guard, lead-sync, lead-sync-booking, outbox, chatwoot-sync, sync-resolve: all green. eslint clean on all touched files. `npx tsc --noEmit`: 8 errors, the known baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1), none new.

## Task Commits

1. Task 1 (tracer): `7bacd6ed` feat(83-08): resolved conversation writes one history Note (tracer)
2. Task 2: `8d68b3eb` feat(83-08): resolve entry targets, episodes and ordering

## Deviations from Plan

**1. [Process] Code for Task 2 landed in the Task 1 commit.** `pickTarget` and the edge handling were written as one complete function with the tracer, so Task 2 is a test-only commit (target selection, episodes, ordering, paging, no-target, gates). All Task 2 tests passed on first run except one test bug (a rescheduled row is not due until its backoff elapses; the test now advances the world clock). No separate committed RED state exists for Task 2; the tracer's RED was observed (3 of 4 failing) before the code.

**2. [Rule 3 - blocking] Two small shared-module extensions.** The plan needs `Messages: 2000+` but `readMessages` could not report the cap and `formatResolveNote` only took a number. Added `readMessagePages` (returns `{ messages, truncated }`; `readMessages` now wraps it, behaviour unchanged) in `lib/chat-io.ts`, and an optional `messageCountCapped` flag on `formatResolveNote` in `lib/chat-classify.ts` (renders `N+`; existing callers and tests unchanged).

**3. Count when capped.** `N` is the number of counted messages in the 2000 read, so a capped conversation with some activity/private messages shows e.g. `1990+`; an all-public conversation shows `2000+`. A conversation with exactly 2000 messages is also reported as `2000+` (no extra peek request is made).

## Known limitations / notes for the orchestrator

- `postNote` to a parent deleted in EspoCRM after the registry recorded it is classified by the dispatcher's generic EspoCRM error handling (no special case); the stream read returns an empty list on 403/404 as in 83-07.
- RESEARCH A2/A5 (link shape, Note API, `/stream` read) are verified only against the fake; first live proof is plan 83-14.
- The tests ran through the symlinked main-checkout `node_modules` (not committed). The `verify` skill steps run: types, lint and the related-test set above; no UI, i18n, price or secret change.

## Known Stubs

None.

## Threat Flags

None. No new network surface: the handler runs only inside the QStash-invoked dispatcher, writes one EspoCRM Note, reads Chatwoot, logs key/outcome/code only (T-83-29..T-83-31 covered by tests: reply text absent from the Note, wrong-record guard via `contact_pending`/`no_target`, marker-based dedup).

## Self-Check: PASSED

- Files present: lib/chat-resolve.ts, tests/chat-resolve.test.ts, lib/hook-dispatch.ts (resolve branch), tests/infra-vps-isolation-guard.test.ts (allowlist entry).
- Commits 7bacd6ed and 8d68b3eb exist on branch `worktree-agent-a490b05a7e067730a`.
