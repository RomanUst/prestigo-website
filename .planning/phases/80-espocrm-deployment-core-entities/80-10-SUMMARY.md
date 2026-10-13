---
phase: 80-espocrm-deployment-core-entities
plan: 10
subsystem: espocrm-mail-reminders
tags: [espocrm, mailbox, reminders, inspect, config-as-code]
status: blocked
requires: [80-07]
provides:
  - "mail sync resource (owner email, personal filter, reminder defaults, scheduler check)"
  - "infra/espocrm/inspect.mjs PII-free live checks"
affects: [80-11, 80-12, 80-13]
key-files:
  created:
    - infra/espocrm/mail.json
    - infra/espocrm/inspect.mjs
    - tests/espocrm-mail.test.ts
  modified:
    - infra/espocrm/sync.mjs
    - tests/espocrm-model.test.ts
    - tests/espocrm-sync.test.ts
key-decisions:
  - "EmailFolder cannot be created for another user through the API: the sync verifies the owner's folder and the owner creates it in the UI"
  - "Reminder mail is moved into a Reminders folder, never Skip (D-05)"
actuals:
  tokens: 40000
  tasks: 1
  commits: 1
commits: 1
plan_head_before: 6f89a434d64c30c27290bba84d8b3b2ca98a8bc9
plan_head_after: 7df910b5cf102476deff97355b6007238163e58f
---

# Phase 80 Plan 10: Mailbox and reminders (PARTIAL - stopped at the owner checkpoint) Summary

The `mail` config resource and a PII-free `inspect.mjs` are built, tested and applied live (owner email, reminder defaults, scheduler confirmed); the plan is paused at Task 2, where the owner creates the Reminders folder and connects roman@ in the EspoCRM UI.

Status: blocked at Task 2 (owner action). `commits:` above counts the task commit only; this SUMMARY is committed after it.

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | mail resource + inspect tool, live (tracer) | done, with one live finding (below) | 7df910b5 |
| 2 | owner connects roman@ (checkpoint:human-action) | awaiting owner | - |
| 3 | guided UAT (checkpoint:human-verify) | not started | - |

## What was built

- `infra/espocrm/mail.json`: owner user email, Reminders folder, filter `notifications@` -> Move to Folder, Task reminder defaults (Popup at due time, Email 1 hour before), required jobs. No `"Skip"` anywhere (`grep -c '"Skip"'` = 0).
- `sync.mjs` resource `mail` (after `roles`): checks the two jobs first (a stopped one fails the run before any write and names the job), checks metadata capabilities, sets the owner email (case-insensitive compare), verifies the owner's folder, creates/repairs the personal filter, sets `defaultRemindersTask` (payload shape A5 confirmed against `entityDefs.Preferences.fields.defaultRemindersTask`, a `jsonArray` using the same crm reminders view as Task).
- `infra/espocrm/inspect.mjs` (admin identity, GET only): `count`, `jobs`, `mailbox [--expect-active]`, `email-parent --since`; `parseInspectArgs` and `runInspect` exported. Output is counts, statuses and booleans only. The Chatwoot check is one read-only GET of the inbox list that prints only a count.
- Tests: `tests/espocrm-mail.test.ts` (new). Two existing tests were adjusted so that "full run" means the model resources (`mail` needs a live user, scheduler and folders): `espocrm-model.test.ts` helper excludes `mail` when `only` is absent; `espocrm-sync.test.ts` dry-run test seeds the two jobs. `npx vitest run tests/espocrm-` is green (266 tests), `tsc` shows no new errors, eslint clean.

## Live results

- Metadata checks (read-only, before any write): `EmailFilter.action` options = Skip, Move to Folder, Move to Group Folder, None; `EmailFolder` has an `assignedUser` link; `Preferences.defaultRemindersTask` is a jsonArray.
- prestigo-admin previous email: **was empty** (rollback: clear it again).
- Jobs: `CheckEmailAccounts=Active`, `SendEmailReminders=Active` (`inspect.mjs jobs`, exit 0).
- prestigo-admin email now roman@; `defaultRemindersTask` = Popup 0 s, Email 3600 s (verified by read).
- `inspect.mjs mailbox` today: `email_account=missing imap=off smtp=off store_sent=off chatwoot_inboxes_with_roman=0` (Chatwoot has no inbox mentioning roman@, D-11 half proven live).
- Baseline counts: Contact=0, Lead=0.
- Latest live run of the final code: `mail: create=0 update=0 unchanged=2 skipped=2` (the 2 skipped are the folder and its filter, waiting for the owner folder). The acceptance wording "create=0 update=0" holds; `skipped=2` clears when the owner creates the folder and the sync is run once more.
- Filter path chosen: **filter by sync, folder by owner** (see deviation 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] An API-created EmailFolder belongs to the calling admin, not the owner**
- **Found during:** Task 1 live run (second run created a duplicate, because the folder lookup by owner found nothing).
- **Issue:** `POST /EmailFolder` with `assignedUserId=<prestigo-admin>` is stored with `assignedUserId=<prestigo-config>`. A folder the owner cannot see is useless as a filter target, and the plan's own fallback applies ("if an admin cannot create a folder for another user ... add the item to the owner's steps").
- **Fix:** the `mail` resource no longer creates folders. It verifies the owner's folder (name AND owner) and, once it exists, creates or re-points the owner's filter at it. Until then the folder and filter count as `skipped` with a log line naming the owner step. Tests pin this (never POSTs a folder; ignores a same-named folder owned by someone else; re-points a filter that targets it).
- **Files modified:** infra/espocrm/sync.mjs, tests/espocrm-mail.test.ts
- **Commit:** 7df910b5

**2. [Rule 3 - Blocking] Existing full-run tests broke when `mail` joined RESOURCE_ORDER**
- **Fix:** see "What was built" (test helper and one dry-run seed). No behaviour change to other resources.
- **Commit:** 7df910b5

### Live residue that needs a decision (NOT cleaned up)

The two live runs of the first version of the code left these objects (created by the prestigo-config identity):
- 2 EmailFolder records named "Reminders" (ids 6ace472129bb11376 and 6ace472796dc18f29), both owned by prestigo-config, so invisible to the owner.
- 1 EmailFilter "System notifications to Reminders" for prestigo-admin (id 6ace47214260968db), currently pointing at folder 6ace472796dc18f29 (a folder the owner cannot see).

I tried to reassign one folder to prestigo-admin with a one-off script; the auto-mode classifier denied that ad-hoc live write, and I did not work around it. Consequences and handling:
- No mailbox is connected yet, so nothing is being filed anywhere. The filter is harmless today.
- The final code self-heals the filter: after the owner creates the real "Reminders" folder, `node infra/espocrm/sync.mjs --only mail` re-points the filter (update=1). **That sync run must happen before the owner's mailbox starts fetching or any test Task reminder is sent.**
- The stray folders are cosmetic clutter. Removal needs an explicit go-ahead (3 DELETEs by id, listed above) or the owner removing them in the UI while logged in as prestigo-config.

## Known Stubs

None.

## Threat Flags

None. No new network surface; the Chatwoot read is an existing authenticated GET used only for a count.

## Self-Check: PASSED

- infra/espocrm/mail.json, infra/espocrm/inspect.mjs, tests/espocrm-mail.test.ts present; commit 7df910b5 present.
