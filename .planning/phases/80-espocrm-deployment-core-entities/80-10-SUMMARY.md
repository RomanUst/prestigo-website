---
phase: 80-espocrm-deployment-core-entities
plan: 10
subsystem: espocrm-mail-reminders
tags: [espocrm, mailbox, reminders, inspect, config-as-code, system-smtp]
status: complete
requires: [80-07]
provides:
  - "mail sync resource (owner email, personal filter, reminder defaults, scheduler check, system SMTP group account)"
  - "infra/espocrm/inspect.mjs PII-free live checks (count, jobs, mailbox, email-parent, system-mail)"
affects: [80-11, 80-12, 80-13, 82]
key-files:
  created:
    - infra/espocrm/mail.json
    - infra/espocrm/inspect.mjs
    - tests/espocrm-mail.test.ts
  modified:
    - infra/espocrm/sync.mjs
    - infra/espocrm/lib/client.mjs
    - infra/espocrm/README.md
    - tests/espocrm-model.test.ts
    - tests/espocrm-sync.test.ts
key-decisions:
  - "EmailFolder cannot be created for another user through the API: the sync verifies the owner's folder and the owner creates it in the UI"
  - "Reminder mail is moved into a Reminders folder, never Skip (D-05)"
  - "EspoCRM 10.0.8 system SMTP is an active group email account (InboundEmail, useSmtp, address = Settings.outboundEmailFromAddress), not the legacy Settings smtp* fields; declared in mail.json systemSmtp"
  - "The SMTP password lives only in ~/.config/prestigo/espocrm-smtp.env and is sent on create or with --set-smtp-password, never logged, never read in dry-run"
actuals:
  tokens: 16000
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 6f89a434d64c30c27290bba84d8b3b2ca98a8bc9
plan_head_after: fb2d795f6659570b45ae0ebefa9e549a94d3c4b5
---

# Phase 80 Plan 10: Mailbox and reminders Summary

Owner mailbox (roman@ as a Personal Email Account), task reminders filed into the owner's Reminders folder, and the system mail sender are all live and declared as code; a PII-free `inspect.mjs` proves each of them without printing an address, subject or secret.

`commits:` counts the commits owned by this plan (7df910b5 task 1, 94f2f8fc partial summary, fb2d795f system SMTP, and this SUMMARY commit). A raw `rev-list ${plan_head_before}..HEAD` is larger because parallel plans (80-08, 80-09, 80-12) and merge commits share the branch; `plan_head_after` is the last code commit (fb2d795f); this SUMMARY commit follows it.

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | mail resource + inspect tool, live (tracer) | done, one live finding (deviation 1) | 7df910b5 |
| 2 | owner connects roman@ (checkpoint:human-action) | done by owner 2026-10-16 | - |
| 3 | guided UAT (checkpoint:human-verify) | done, 6/6 pass (step 4 after a fix, deviation 3) | fb2d795f (the fix as code) |

## What was built

- `infra/espocrm/mail.json`: owner user email, Reminders folder, filter `notifications@` -> Move to Folder, Task reminder defaults (Popup at due time, Email 1 hour before), the system SMTP group account (`systemSmtp`), required jobs. No `"Skip"` anywhere; no password key.
- `sync.mjs` resource `mail` (after `roles`): checks the two jobs first (a stopped one fails the run before any write and names the job), ensures the system SMTP group account, sets the owner email (case-insensitive compare), verifies the owner's folder, creates/repairs the personal filter, sets `defaultRemindersTask`.
- System SMTP group account (`syncSystemSmtp`): looks up `InboundEmail` by the declared address, creates it when missing, updates only drifted non-secret fields, refuses to run when two accounts share the address. `validateMailConfig` is a whitelist of 15 non-secret keys, so `smtpPassword` can never be committed. The password is read lazily by `loadSmtpPassword` (`lib/client.mjs`) from `~/.config/prestigo/espocrm-smtp.env` key `RESEND_SMTP_PASSWORD`, and goes into a request body only on create or with `--set-smtp-password` (the API never returns it, so it cannot be diffed). Dry-run never reads it; log lines carry the resource key and field names only.
- `infra/espocrm/inspect.mjs` (admin identity, GET only): `count`, `jobs`, `mailbox [--expect-active]`, `email-parent --since`, and new `system-mail [--expect-active]` -> `system_smtp=present|missing active=on|off use_smtp=on|off from_matches_settings=on|off`. Output is counts, statuses and booleans only.
- README: new "System mail" section (the EspoCRM 10.0.8 mechanism, the env file name, the flag, the inspect check) and the new credential file row.
- Tests: `tests/espocrm-mail.test.ts` (33 tests): resource behaviour, systemSmtp create/idempotent/drift/flag/dry-run/duplicate/missing-password, `loadSmtpPassword`, `parseArgs --set-smtp-password`, inspect `system-mail`, PII-free output. `npx vitest run tests/espocrm` is green (9 files, 327 tests), `tsc` shows only the 8 baseline errors in `tests/`, eslint clean.

## Live results

- Metadata checks (read-only, before any write): `EmailFilter.action` options = Skip, Move to Folder, Move to Group Folder, None; `EmailFolder` has an `assignedUser` link; `Preferences.defaultRemindersTask` is a jsonArray.
- prestigo-admin previous email: was empty (rollback: clear it again). Now roman@; `defaultRemindersTask` = Popup 0 s, Email 3600 s.
- Jobs: `CheckEmailAccounts=Active`, `SendEmailReminders=Active`.
- Task 2 (owner, 2026-10-16): Personal Email Account for roman@ Active, IMAP on (INBOX), SMTP on, store sent emails on (sent folder INBOX.Sent), fetch since 2026-10-16; owner created the "Reminders" folder. Then `sync.mjs --only mail` -> update=1 (filter re-pointed to the owner's folder), second run `create=0 update=0 unchanged=4`. `inspect.mjs mailbox --expect-active` -> `email_account=active imap=on smtp=on store_sent=on chatwoot_inboxes_with_roman=0`, exit 0. The 2 stray prestigo-config "Reminders" folders were deleted with the owner's approval; the filter was unaffected.
- System SMTP account (live, created by the orchestrator, id `6ad3be0d445c1ab85`): `sync.mjs --only mail` run twice after the code landed -> both `mail: create=0 update=0 unchanged=5 skipped=0` (the live record matches the declared fields). `inspect.mjs system-mail --expect-active` -> `system_smtp=present active=on use_smtp=on from_matches_settings=on`, exit 0.

## Guided UAT results (no addresses, subjects or names recorded)

| Step | Check | Result |
|------|-------|--------|
| 1 | known Contact mail attaches to its Account | pass |
| 2 | unknown sender: email parent none, Contact/Lead counts unchanged | pass |
| 3 | compose from an Opportunity: sent from roman@, reply attached to the Opportunity | pass (email-parent Account=1 Opportunity=3 none=0, including a draft) |
| 4 | Task reminder lands in the Reminders folder | pass after the fix (deviation 3); the original reminder fired before the fix |
| 5 | Kanban view | pass (owner) |
| 6 | SPF / DKIM / DMARC | pass (owner) |

Note: the first test mail landed in Gmail spam (tiny test content). DNS checked: SPF `include:_spf.mail.hostinger.com`, DKIM `hostingermail-a` and `resend._domainkey` present, DMARC `p=none`. UAT records were deleted afterwards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] An API-created EmailFolder belongs to the calling admin, not the owner**
- **Found during:** Task 1 live run (second run created a duplicate, because the folder lookup by owner found nothing).
- **Issue:** `POST /EmailFolder` with `assignedUserId=<prestigo-admin>` is stored with `assignedUserId=<prestigo-config>`. A folder the owner cannot see is useless as a filter target.
- **Fix:** the `mail` resource no longer creates folders. It verifies the owner's folder (name AND owner) and creates or re-points the owner's filter at it. Until the folder exists, the folder and filter count as `skipped` with a log line naming the owner step.
- **Files modified:** infra/espocrm/sync.mjs, tests/espocrm-mail.test.ts
- **Commit:** 7df910b5

**2. [Rule 3 - Blocking] Existing full-run tests broke when `mail` joined RESOURCE_ORDER**
- **Fix:** `espocrm-model.test.ts` helper excludes `mail` when `only` is absent; `espocrm-sync.test.ts` dry-run test seeds the two jobs. No behaviour change to other resources.
- **Commit:** 7df910b5

**3. [Rule 2 - Missing critical functionality] The system SMTP sender is a group email account, not Settings smtp\* (RESEARCH correction, Phase 82 relevant)**
- **Found during:** Task 3 step 4 (the Task reminder never arrived).
- **Root cause:** in EspoCRM 10.0.8 `application/Espo/Core/Mail/Sender.php` `applyGlobal` asks `SendingAccountProvider::getSystem()`, which returns an ACTIVE group email account (entity `InboundEmail`) with `useSmtp` whose `emailAddress` equals `Settings.outboundEmailFromAddress`. The legacy `Settings.smtp*` fields are not used for sending, so every system mail threw "No system SMTP settings." (none had been sent since Phase 76).
- **Fix (live, by the orchestrator):** created InboundEmail `Prestigo system mail (Resend)` for `notifications@` (Active, useImap false, useSmtp true, shared, smtp.resend.com:587 TLS, user `resend`, login, fromName Prestigo, excludeFromReply); password from the owner-entered env file. A test mail from notifications@ to roman@ was Sent, fetched back, and landed in the Reminders folder (owner confirmed).
- **Fix (as code):** `mail.json` `systemSmtp` + `syncSystemSmtp`, secret handling as above, `inspect.mjs system-mail`, README section, tests. Commit fb2d795f (`security:` prefix, credential handling).
- **RESEARCH correction:** the research/plan assumption that the Phase 76 outbound SMTP settings in Settings cover system mail is wrong for 10.0.8. `settings.json` still must not declare `smtp*`/`outboundEmail*` keys (Phase 76 owns `outboundEmailFromAddress`); the sender account is the group account.
- **Phase 82 note:** anything that relies on EspoCRM sending mail (reminders, notifications, password resets, mass email) needs this account Active with `useSmtp`; `smtpIsForMassEmail` is false today, so bulk mail from the CRM would need a decision. After rotating the Resend key run `sync.mjs --only mail --set-smtp-password`. Run `inspect.mjs system-mail --expect-active` as a smoke check.

### Live residue

None. The stray folders were deleted with the owner's approval and the UAT records were removed.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: credential-handling | infra/espocrm/lib/client.mjs, infra/espocrm/sync.mjs | New read of `~/.config/prestigo/espocrm-smtp.env` (RESEND_SMTP_PASSWORD). Mitigated: file-only source, printable-ASCII check, lazy read, never read in dry-run, never logged or placed in an error message, `mail.json` is a key whitelist that refuses `smtpPassword`, `infra/espocrm/**/*.env` is git-ignored. |

## Self-Check: PASSED

- infra/espocrm/mail.json, infra/espocrm/inspect.mjs, tests/espocrm-mail.test.ts present; commits 7df910b5 and fb2d795f present.
- Live: `sync.mjs --only mail` twice -> `create=0 update=0`; `inspect.mjs system-mail --expect-active` exit 0.
