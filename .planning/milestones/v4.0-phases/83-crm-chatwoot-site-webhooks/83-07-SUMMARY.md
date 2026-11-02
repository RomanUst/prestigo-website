---
phase: 83-crm-chatwoot-site-webhooks
plan: 07
subsystem: api
tags: [chatwoot, espocrm, outbox, dispatcher, leads, identity, qstash]

requires:
  - phase: 83-01
    provides: hook.* key grammar (parseHookTag), aggregateUuid, webhook store contract
  - phase: 83-02
    provides: IdentityStore chat methods (chatLookup, byChatwootContact, resolveChat, phoneUsable)
  - phase: 83-03
    provides: ChatStore registry (reserveLead, recordConversation, hooksStart) and the webhook isolation guard
  - phase: 83-04
    provides: chat-classify policy (filters, source, texts, markers)
provides:
  - hook.chat_intake handler (lib/chat-intake.ts) and the shared ensureIntake path for plan 83-08
  - lib/chat-io.ts Chatwoot reads and EspoCRM Contact/Lead/Note helpers
  - lib/hook-dispatch.ts hook.* router with both config gates
  - tests/helpers/chat-world.ts shared test world for every later hook plan
affects: [83-08, 83-09, 83-10, 83-11, 83-12, 83-14, 83-16]

actuals:
  tokens: 60000
  tasks: 3
  commits: 3
plan_head_before: cc9ad8c7adea4f02617af325e3e08dd42d095ea8
plan_head_after: 670d0a290c159e5adfb0a3861b5c4e5f741bda2a

tech-stack:
  added: []
  patterns:
    - "state-convergent hook handler: payload is a hint, every run re-reads Chatwoot, every write is preceded by a lookup"
    - "stream-marker idempotency for EspoCRM Notes ([cw:<id>:open])"
    - "per-person registry reservation (own flag) decides create vs append"

key-files:
  created:
    - lib/chat-io.ts
    - lib/chat-intake.ts
    - lib/hook-dispatch.ts
    - tests/helpers/chat-world.ts
    - tests/chat-intake.test.ts
    - tests/hook-dispatch.test.ts
  modified:
    - lib/lead-sync.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "A not-own registry row whose Lead is not yet visible in EspoCRM is retried (IntakeRetryError lead_pending), never closed: another conversation may still be creating it"
  - "buildIntakeContext, DeadlineError, IntakeRetryError, rescheduleForDeadline are exported from lib/chat-intake.ts so later hook handlers share the guard and clients wiring"
  - "Lead email goes on the Lead only when the person was registered as an identity"
  - "Recorded non-lead outcomes replay as skipped with the registry outcome as the code"

requirements-completed: [HOOK-01]

duration: 75min
completed: 2026-10-26
status: complete
---

# Phase 83 Plan 07: Chat intake (HOOK-01) Summary

**The first incoming message of a Chatwoot conversation now becomes an identity, an EspoCRM Contact and one chat Lead with the channel as source (or an append Note, or nothing), idempotently, through the QStash dispatcher only.**

## Accomplishments

- `hook.chat_intake` runs end to end behind both config gates (`chatwoot_unconfigured`, then `crm_unconfigured`): forward-only gate, replay check on the registry, re-read of conversation, contact and messages, `no-lead` label and D-18 filter, customer / known-contact classification, identity + Contact registration, D-20 adoption, per-person Lead reservation, create or append.
- Outcomes recorded per conversation: `lead_created`, `lead_appended`, `lead_adopted`, `customer`, `known_contact`, `filtered`, `no_lead_label`. Skip codes: `hooks_off`, `before_start`, `conversation_missing`, `no_incoming_message`, `contact_missing`, `identity_erasing`, `filtered_auto_reply|no_reply|own_domain`, `customer`, `known_contact`, `no_lead_label`, `bad_key`.
- D-04 handled: Telegram (no email/phone) gives a Lead with no Contact and person key `c:<contact id>`; phone-only links the single matching Contact or creates one keyed on the phone; shared phone or two matches give a Lead without a Contact; never a name-only Contact.
- Idempotency: Lead by `cSupabaseRef`, Contact by email/phone, Note by stream marker; 409 converges; crash after Lead/Contact POST converges on retry.
- `tests/helpers/chat-world.ts`: outbox, identity (069/072/077 rules), chat registry (078), webhook ingest (076) doubles, `makeWorld` wiring both network fakes and `DispatchDeps`, `signChatwoot` / `signEspo`. No double exposes a booking, profile or auth method.
- Verification: `npx vitest run` on chat-intake, hook-dispatch, lead-sync, lead-sync-booking, infra-vps-isolation-guard, webhook-isolation-guard, crm-sync, chatwoot-sync, erasure, outbox, dispatch route: 10 files, 310 tests green (chat-intake 45, hook-dispatch 5). eslint clean on all touched files; tsc reports nothing for any file of this plan.

## Task Commits

1. Task 1 (tracer): `0383f2ed` feat(83-07): chat intake creates identity, Contact and Lead for a stranger (tracer)
2. Task 2: `648935cc` feat(83-07): chat intake classification - customers, known contacts, spam, Telegram and phone-only
3. Task 3: `670d0a29` feat(83-07): one open chat Lead per person, append notes and D-20 adoption

## Deviations from Plan

**1. [Process] Code for steps 3-11 landed in the Task 1 commit.** `ensureIntake` was written as one complete function, so Tasks 2 and 3 are test-only commits (the classification, Telegram/phone-only, append/reopen, D-20, crash and race behaviour were already implemented). Tests were written after the code and passed on the first run (one test bug fixed: the fake EspoCRM replaces a record on PUT, so a stale reference was read). No separate committed RED state exists.

**2. [Rule 2 - race safety] `lead_pending` retry.** The plan said a not-own row with a missing Lead is closed and re-reserved. That would close a row whose owning conversation is still creating its Lead (the outbox mutex is per conversation, so two intakes of one person can run at once) and produce two Leads. Now: Lead id known and gone from the CRM (404) or not open -> close and re-reserve (as planned); Lead id unknown and not found by ref -> `IntakeRetryError('lead_pending')` -> `retryLater`. Covered by a test and by the concurrent-interleaving test.

**3. Added exports** beyond the plan's list: `parseChatContact`, `LeadBrief`, `StreamNote` (chat-io); `buildIntakeContext`, `HookClients`, `DeadlineError`, `IntakeRetryError`, `rescheduleForDeadline`, `IntakeResult` (chat-intake). `readLeadStatus` / `findLeadByRef` return a `LeadBrief` (id, status, existingContactId, createdAt) instead of a bare status.

## Known limitations / notes for the orchestrator

- **Duplicate Contact under truly simultaneous first conversations:** two conversations of one brand-new person processed in the same instants can both pass the Contact lookup and each create a Contact (the identity lock serializes identity creation, not Contact creation; the Lead stays unique). The Lead/Note guarantees hold. Rare; the owner would see two Contacts for one email.
- **Pre-existing, not from this plan:** `tests/sync-resolve.test.ts(101)` fails `tsc` because the `IdentityStore` double there lacks the chat methods added by plan 83-02. Plan 83-08 or the wave merge should add the five stub methods (or reuse `makeIdentityDouble`).
- **Plan 83-08** should call `ensureIntake(buildIntakeContext(row, d, clients), conversationId)`; it returns the registry record for the three Lead outcomes and `{ skipped }` otherwise, and may throw `IntakeRetryError` (map to `retryLater`) and `DeadlineError` (map to `rescheduleForDeadline`), as `deliverChatIntake` does. `hook-dispatch.ts` has a `default` case failing with `unsupported_event` where 83-08/10/11 add `case` branches.
- Live flags unchanged: RESEARCH A5 (POST /Note camelCase, GET `/<Entity>/<id>/stream`) is verified only against the fake; first live proof is plan 83-14. A role without stream read access makes `streamHasMarker` return false (403 -> empty list), which could allow a duplicate Note on retry.
- Tests ran through the symlinked main-checkout `node_modules`; nothing needed a next-intl server module. The `verify` skill steps run: types, lint and the related-test set above; no UI, i18n or build change.

## Known Stubs

None.

## Threat Flags

None. All new surface (QStash-invoked handlers calling EspoCRM and Chatwoot through the hardened site clients) is in the plan's threat model (T-83-24..T-83-28); the intake writes no Chatwoot data, no booking, profile or auth row, and logs only key, outcome and code.

## Self-Check: PASSED

- Files present: lib/chat-io.ts, lib/chat-intake.ts, lib/hook-dispatch.ts, tests/helpers/chat-world.ts, tests/chat-intake.test.ts, tests/hook-dispatch.test.ts.
- Commits 0383f2ed, 648935cc, 670d0a29 exist on branch `worktree-agent-aa451d2ba116ac860`.
