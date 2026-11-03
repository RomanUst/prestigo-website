---
phase: 83-crm-chatwoot-site-webhooks
plan: 10
subsystem: api
tags: [chatwoot, espocrm, outbox, dispatcher, identity, echo-loop, fingerprint]

requires:
  - phase: 83-07
    provides: buildIntakeContext / guarded clients, chat-io helpers, hook-dispatch router, chat-world test world
  - phase: 83-08
    provides: hook-dispatch resolve branch (pattern), registry conversation record
  - phase: 83-16
    provides: receiver echo drop (isSiteEcho) and the site_sync_fp contract
provides:
  - hook.chat_contact handler (lib/chat-contact.ts deliverChatContact, D-12)
  - hook.chat_label handler (deliverChatLabel, D-07)
  - postWriteFingerprint in lib/sync-origin.ts (single helper for every site_sync_fp stamp; reused by 83-11)
  - site_sync_fp stamped on every site write to a Chatwoot contact (lib/chatwoot-sync.ts)
affects: [83-11, 83-12, 83-14]

requirements-completed: [HOOK-01, HOOK-04]

actuals:
  tokens: 75000
  tasks: 3
  commits: 3
plan_head_before: 3c7efcc61890fe37dfb02f45450670351274d869
plan_head_after: acf2db33643e578a7a4b3ec470e4542b3c3635b8

tech-stack:
  added: []
  patterns:
    - "state-convergent contact handler: key says 'contact N changed', every run re-reads Chatwoot, every write is preceded by a lookup"
    - "origin tag only on writes that happen anyway: stamped(body, live) re-computed on every 422 retry, empty diff still sends nothing"

key-files:
  created:
    - lib/chat-contact.ts
    - tests/chat-contact.test.ts
  modified:
    - lib/hook-dispatch.ts
    - lib/chat-io.ts
    - lib/chatwoot-sync.ts
    - lib/sync-origin.ts
    - lib/outbox-labels.ts
    - tests/chatwoot-contact-sync.test.ts
    - tests/sync-origin.test.ts
    - tests/infra-vps-isolation-guard.test.ts

key-decisions:
  - "The person's open chat Lead is found through the identity (after linkIdentity), the phone (registry) and the contact's own Chatwoot conversations (GET /contacts/<id>/conversations -> chat.conversation(id).chatLead); the registry has no 'lead by chatwoot contact' RPC and migrations 076-078 are already live"
  - "A linked identity's email is checked with chatLookup BEFORE attachChatContact, so an operator email that belongs to another identity changes nothing at all (not even a phone attach)"
  - "The phone-keyed Contact that the intake creates for a phone-only person (D-04) gains its email instead of getting a twin (findEmaillessContactIdByPhone; a Contact that already has an email is never reused through the phone)"
  - "Label handler follows the plan literally: any conversation whose registry chat Lead is open is killed, including a lead_appended conversation that appended to another conversation's Lead"

patterns-established:
  - "skip codes: hooks_off, contact_missing, echo, no_contact_data, cw_ambiguous, identity_erasing, email_owned_elsewhere, conversation_missing, no_label, no_chat_lead, lead_not_open; reschedule lead_pending"

status: complete
completed: 2026-10-26
---

# Phase 83 Plan 10: Chatwoot contact edits, no-lead label and origin fingerprint Summary

**An email or phone typed into a Chatwoot contact now finds or creates the EspoCRM Contact under the identity rules and links the open chat Lead to it, the `no-lead` label kills a chat Lead, and every site write to a Chatwoot contact carries the `site_sync_fp` origin tag so it is recognised when it comes back.**

## Accomplishments

- `deliverChatContact` (lib/chat-contact.ts, `hook.chat_contact`, behind both config gates): hooks gate, contact re-read, echo skip (fingerprint matches current fields), usable email/phone, then
  - contact linked to one identity: operator email/phone attached without a merge; an email owned by ANOTHER identity -> skipped `email_owned_elsewhere` (nothing written, hint on /admin/outbox); two linked identities -> `cw_ambiguous`; erasing -> `identity_erasing`;
  - no link + email: owning identity (gets the Chatwoot contact id only when it has none), else a known CRM Contact (linked, no identity registered), else `resolveChat` registers a chat identity;
  - no email: phone-only (exactly one Contact with the phone -> linked, none -> created keyed on the phone, several -> no Contact);
  - Contact fill-empty only (no name, account, title, description written), then `linkIdentity` moves the `c:` Lead to `i:<identity>` and each open chat Lead gets `cExistingContactId` (owner's choice kept) and the email only when it had none; registry `espo_contact_id` set.
- `deliverChatLabel` (`hook.chat_label`): only a registry chat Lead is ever touched. Open in CRM -> `Dead` + registry `dead`; Converted/Recycled/deleted -> registry `closed_in_crm`, skip `lead_not_open`; adopted D-20 Phase 81 Lead / customer conversation -> `no_chat_lead`; label removed -> `no_label`; Lead id never stored and not yet visible -> retry `lead_pending` (never closed).
- HOOK-04: `postWriteFingerprint(live, body)` in lib/sync-origin.ts; `lib/chatwoot-sync.ts` stamps `custom_attributes.site_sync_fp` on the create body, the update body and every 422 retry (recomputed without a dropped phone); an empty diff still sends nothing; `CHATWOOT_SYNCED_ATTRIBUTE_KEYS` unchanged (7 keys, `tests/chatwoot-mapping.test.ts` untouched and green).
- `lib/outbox-labels.ts`: hint for `email_owned_elsewhere` pointing at /admin/identities.

## Task Commits

1. Task 1 (tracer): `8bb9e487` feat(83-10): operator-added email links the chat Lead to a Contact (tracer)
2. Task 2: `45207e31` feat(83-10): contact-data branches and no-lead label handler
3. Task 3: `acf2db33` security(83-10): origin fingerprint on every site write to a Chatwoot contact

## Verification

- `npx vitest run` on chat-contact (35), hook-dispatch, chatwoot-contact-sync (53), chatwoot-mapping, sync-origin, chat-payload, chat-intake, chat-resolve, infra-vps-isolation-guard, webhook-isolation-guard, outbox-admin, erasure, webhooks-chatwoot-route: 13 files, 416 tests green.
- Full suite: 6828 passed; 5 files fail to LOAD (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) only because `next-intl/dist/esm/development/server.react-server.js` does not resolve through the symlinked main-checkout `node_modules`. Unrelated to this plan; the orchestrator should re-run them on the main checkout.
- `npx tsc --noEmit`: 8 errors, the known baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none new, none in a test double of an extended interface (`LeadBrief` gained a field; no literal of it exists outside lib/chat-io.ts).
- `npx eslint --quiet` clean on every touched file. No price, secret, i18n or middleware change (admin/outbox hint is an English literal like the other hints).

## Deviations from Plan

**1. [Rule 2 - missing capability] `GET /contacts/<id>/conversations` read added (lib/chat-io.ts `readContactConversationIds`).** The plan says to link "the `c:<contactId>` lead", but ChatStore has no lookup of a lead by Chatwoot contact and the registry migrations are live. A Telegram person without identity or phone has a lead no existing RPC can reach (`openLeadsForPerson` matches identity or phone only). The handler therefore lists the contact's conversations (max 25) and reads `chat.conversation(id).chatLead`. A 404 or unexpected shape yields no conversations; the identity and phone lookups still work. The built-in fake-chatwoot has no such route, so tests answer it through the `intercept` option (no edit to the shared helpers). Needs live confirmation in 83-14 (endpoint shape `{ payload: [{ id }] }`).

**2. [Rule 2 - correctness] `findEmaillessContactIdByPhone` (lib/chat-io.ts).** Without it a phone-only person (whose Contact the intake created keyed on the phone) who then gets an email would receive a duplicate Contact. Reuse happens only for a single phone match that has no email.

**3. [Scope note] `LeadBrief.emailAddress`** added (and `emailAddress` to the Lead select) so the handler can write the Lead email only while empty.

**4. [Process] Task 1 and Task 2 code were written in steps matching their tests** (tracer code first, branches after); the RED state was observed for each (tracer 3 of 4 failing; Task 2 9 of 23; label handler 9 of 32; Task 3 chatwoot-sync tests 9 failing before the stamp). Task 3's `postWriteFingerprint` was implemented just before its unit tests, which therefore passed on first run.

No STATE.md / ROADMAP.md edits (orchestrator owns them).

## Known limitations / notes for the orchestrator

- Label handler kills the person's open chat Lead for ANY conversation of that person whose registry `chatLead` is open, including a `lead_appended` conversation (its chat Lead was created by an earlier conversation). Plan-literal; restricting to the conversation that created the Lead (compare `leadRef` with `chatLeadRef(aggregateUuid('conversation', id))`) is a one-line change if the owner prefers it.
- A customer identity that the operator links by typing the customer's email into a Telegram contact gets that Chatwoot contact id only when it had none; its own existing id is never overwritten (tested).
- RESEARCH A4 (an undefined custom attribute `site_sync_fp` is accepted by Chatwoot and not shown in the sidebar) and the `/contacts/<id>/conversations` shape are verified only against the fakes; first live proof is plan 83-14.
- Plan 83-11 reuses `postWriteFingerprint` for `lib/espo-contact-hook.ts`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New surface: one read-only Chatwoot request (`GET /contacts/<id>/conversations`) from the QStash-invoked dispatcher through the existing token client (T-83-35..T-83-37 mitigations covered by tests: `email_owned_elsewhere` with zero writes, echo drop at handler layer, adopted Lead never killed).

## Self-Check: PASSED

- Files present: lib/chat-contact.ts, tests/chat-contact.test.ts, lib/hook-dispatch.ts (contact + label branches), lib/chatwoot-sync.ts (`SITE_SYNC_FP_ATTRIBUTE`), lib/sync-origin.ts (`postWriteFingerprint`), tests/infra-vps-isolation-guard.test.ts (allowlist entry).
- Commits 8bb9e487, 45207e31, acf2db33 exist on branch `worktree-agent-af5d4f2947ae60496`.
- Acceptance greps: `deliverChatContact` / `deliverChatLabel` exported once each and referenced in hook-dispatch; `site_sync_fp` count in lib/chatwoot-mapping.ts is 0.
