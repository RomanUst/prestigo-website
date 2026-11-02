---
phase: 83-crm-chatwoot-site-webhooks
plan: 09
subsystem: api
tags: [espocrm, chatwoot, gdpr, erasure, leads, outbox, sync]

requires:
  - phase: 83-03
    provides: ChatStore registry (openLeadsForPerson, closeLead, erasureScope, erase)
  - phase: 83-04
    provides: formatConversionNote, isOpenLeadStatus
  - phase: 83-07
    provides: chat-io helpers (readLeadStatus, updateLead, postNote, listStreamNotes), chat-world test doubles
provides:
  - D-05 conversion of the open chat Lead inside the sync.espo person run (convertChatLeads)
  - D-16 erasure coverage for chat Leads, chat-created Contacts, history Notes and registry rows
affects: [83-13, 83-14, 83-16, phase-85]

actuals:
  tokens: 10800
  tasks: 2
  commits: 2
plan_head_before: c7d03160599454d92488c32e19db6271e7c8b759
plan_head_after: 67712672e690425fb6ae3dec4a30350df08fdc05

tech-stack:
  added: []
  patterns:
    - "state-convergent conversion: a re-run of sync.espo finds no open registry row once the Lead was converted, so nothing is written twice"
    - "erasure scope computed once per run (memoised) and shared by the Contact and Lead finders; scope ids are existence-checked so the verify pass converges"
    - "Note scrub-then-delete: blank the post, delete the Note, then scrub-then-delete the parent"

key-files:
  created: []
  modified:
    - lib/crm-sync.ts
    - lib/erasure.ts
    - lib/espocrm-client.ts
    - tests/crm-sync.test.ts
    - tests/erasure.test.ts
    - tests/espocrm-site-client.test.ts

key-decisions:
  - "A 403 on a single /Note/<id> PUT or DELETE no longer poisons the EspoCRM site client (every other 401/403 still does); without it one owner-written Note would turn the next call into a crm_auth breaker and stall the erasure forever"
  - "Registry-scope Lead and Contact ids are existence-checked with a GET (404 = gone) so the verify pass sees nothing remaining after the delete"
  - "A booking only converts a chat Lead when it is non-abandoned, non-return, non-anonymised, mapped Converted by BOOKING_LEAD_STATUS, has a reference, and was created at or after the Lead"
  - "A Lead that is missing (404) or no longer open in EspoCRM is only closed in the registry as closed_in_crm"
  - "A 400 on the blank Note PUT retries once with the neutral post 'Erased'"

requirements-completed: [HOOK-01]

duration: 40min
completed: 2026-10-26
status: complete
---

# Phase 83 Plan 09: Chat Lead lifecycle ends (D-05 conversion, D-16 erasure) Summary

**A chat that turns into a paid site booking now ends as a Converted chat Lead pointing at the booking, and a GDPR erasure also removes the person's chat Leads, chat-created Contacts, history Notes and registry rows.**

## Accomplishments

- **Task 1 (tracer), `lib/crm-sync.ts`:** `convertChatLeads` runs inside `syncPerson` after the CBooking upsert. For each open registry Lead of the person (identity, or a phone-only row whose E.164 number is one of the person's non-shared phones) it finds the earliest paid booking created at or after the Lead, re-reads the Lead status, then PUTs `status: Converted`, `cBookingReference`, `cAdminLink`, posts one conversion Note and closes the registry row `converted` with the booking id. A Lead the owner already closed or deleted in EspoCRM is only closed in the registry (`closed_in_crm`). The booking's own Phase 81 Lead is never written. Errors propagate and the dispatcher reschedules the row.
- **Task 2, `lib/erasure.ts`:** the registry scope (identity, cached Chatwoot contact id, request phones; one RPC per run) joins `findEspoLeads` (stored Lead ids plus `cSupabaseRef` lookup of the scope's `chat:` refs) and `findEspoContacts` (stored Contact ids). Every Contact and Lead deleted by the espo or verify step first has its `Post` Notes blanked and deleted (`scrubNotes`; 404 = done, 403 = `notes_skipped`). The espocrm step result gains `notes_deleted` and `notes_skipped`; the supabase step calls `chat.erase(scope)` right before `anonymisePerson` and records `chat_rows_deleted`. Counts only, no ids or addresses in results or logs.

## Task Commits

1. `c63b0246` feat(83-09): paid booking converts the open chat Lead (tracer)
2. `67712672` security(83-09): erasure removes chat Leads, chat Contacts, history Notes and registry rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A 403 on a Note write poisoned the EspoCRM client and stalled the saga**
- **Found during:** Task 2 (the `notes_skipped` test returned `breaker crm_auth`)
- **Issue:** `createSiteEspoClient` sets `poisoned = true` on the first 401/403 and fails every later call with 401. The plan's "403 on an owner-written Note -> notes_skipped, never blocks the erasure" therefore could not hold: the next request (the parent scrub or delete) threw `crm_auth`, and a retry would meet the same Note again.
- **Fix:** `lib/espocrm-client.ts` no longer poisons on a 403 whose request is a PUT or DELETE of `/Note/<id>`. The call still throws `crm_auth` for that request. Every other 401/403 behaves as before. Two client tests added (Note write does not poison; Note read and other writes still do).
- **Files modified:** `lib/espocrm-client.ts`, `tests/espocrm-site-client.test.ts`
- **Commit:** 67712672

**2. [Rule 1 - Bug] Registry-scope ids would have failed the verify pass**
- **Found during:** Task 2 design
- **Issue:** the verify pass re-runs `findEspoContacts` / `findEspoLeads` and counts what remains. Stored registry ids come back every time from the memoised scope, so deleted records would count as remaining and fail the erasure.
- **Fix:** scope ids are only returned when a GET shows the record still exists (404 = gone).
- **Files modified:** `lib/erasure.ts`
- **Commit:** 67712672

**3. [Rule 2 - Missing critical] Blank Note PUT fallback**
- A 400 on `PUT /Note/<id> { post: '' }` (required post) retries once with `post: 'Erased'` so a validation rule cannot leave text behind.

## Known limitations

- Partial failure in `convertChatLeads` (Lead PUT succeeded, Note POST failed): the retry finds the Lead already `Converted`, so the registry row is closed as `closed_in_crm` and the conversion Note is not posted. The Lead itself still carries the booking reference and link. A marker-based re-post would need the Lead's `cBookingReference` in `readLeadStatus` (a `chat-io` change outside this plan).
- Registry `espoContactId` values in the erasure scope are deleted as-is (spec). If the chat path ever stores a pre-existing Contact of a different person there, erasing the chat person would delete it; chat-intake (83-07) stores only the Contact it created or linked for that person's own registry row.
- `components/admin/ErasureAuditTable.tsx` does not yet show `notes_deleted`, `notes_skipped` or `chat_rows_deleted` (counts are in the audit row; UI not in this plan).
- Full `npx vitest run`: 5 files fail to load (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) with `next-intl/server.react-server.js` not found through the symlinked `node_modules` of the worktree. They import nothing from this plan; the other 259 files pass.

## Verification

- `npx vitest run tests/erasure.test.ts tests/crm-sync.test.ts tests/admin-erasure.test.ts tests/chat-intake.test.ts tests/webhook-isolation-guard.test.ts tests/espocrm-site-client.test.ts tests/infra-vps-isolation-guard.test.ts`: 231 passed.
- `npx tsc --noEmit`: 8 errors, all the baseline (i18n-translate-dnt 2, nav-auth 5, passenger-actions 1); none new.
- `npx eslint --quiet` on the six touched files: clean.
- Acceptance greps: `async function convertChatLeads` 1, `convertChatLeads(` 2; `erasureScope` and `notes_deleted` present in `lib/erasure.ts`.

## Threat Flags

None. Mitigations T-83-32 (conversion only from registry-scoped Leads, paid and newer booking, status re-read before write) and T-83-33 (registry scope, Note scrub-then-delete, registry erase, counts-only results) are implemented; T-83-34 accepted as planned.

## Known Stubs

None.

## Self-Check: PASSED

- lib/crm-sync.ts, lib/erasure.ts, lib/espocrm-client.ts, tests/crm-sync.test.ts, tests/erasure.test.ts, tests/espocrm-site-client.test.ts exist and are committed.
- Commits c63b0246 and 67712672 exist on the branch.
