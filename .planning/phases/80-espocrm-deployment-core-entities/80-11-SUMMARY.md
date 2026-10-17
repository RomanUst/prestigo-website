---
phase: 80-espocrm-deployment-core-entities
plan: 11
subsystem: infra
tags: [espocrm, chatwoot, runbook, roles, operators, documentation]
status: complete
requirements: [CRM-05, CRM-04]
requires: ["80-07", "80-08", "80-10", "80-12"]
provides:
  - "infra/vps/runbooks/crm-operators.md: 13-section CRM operator runbook (342 lines)"
  - "tests/crm-runbook.test.ts: 65 guard tests (structure, role table pinned to roles.json, hidden-field table pinned to buildRoleSpecs, team names from teams.json, needles, mailbox negatives, secret/PII shapes)"
affects: [80-13, 81, 82]
tech-stack:
  added: []
  patterns: ["documentation table generated-equivalent to config via test (roles.json -> runbook cells)", "line-level negative tests for safety rules (roman@ / Chatwoot / Group Email Account)"]
key-files:
  created:
    - infra/vps/runbooks/crm-operators.md
    - tests/crm-runbook.test.ts
  modified: []
key-decisions:
  - "Role table cells follow the plan rule (false -> no access, missing -> -, true -> yes, object -> create/read/edit/delete); the test derives every cell from roles.json and the hidden-field list from buildRoleSpecs, so the documented permissions cannot drift"
  - "Chatwoot mirror documented as team + inbox membership only (D-23); the runbook states honestly that Chatwoot cannot hide data inside an inbox and that Chatwoot sync.mjs only adds the owner and never removes members"
  - "System mail account is described without the capitalised phrase for a group mail account on the roman@ rules, so the guard line-test (Group Email Account must be near never/not) applies only to the roman@ rule"
metrics:
  duration: ~35min
  completed: 2026-10-17
actuals:
  tokens: 9800
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 2de2b5033033a5f9aaa7449ad40d1475010165b4
plan_head_after: dbccfeb5d0a2e260d95ff1e3b02ecf2b2076a75a
---

# Phase 80 Plan 11: CRM operator runbook Summary

A single tested runbook now covers roles in EspoCRM and Chatwoot, adding and removing an operator in both systems, the roman@ mailbox rule, reminders and system mail, the booking mirror (admin exception, phone rules), the unique-index overlay, partner seeding, verification and recovery; its role table cannot drift from `roles.json`.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | skeleton + role table and hidden-field table pinned to roles.json / buildRoleSpecs | f123a20a |
| 2 | full content (all 13 sections) + needle, mailbox, secret and PII guards | dbccfeb5 |

Tracer gate: automated-only verify (default end-of-phase mode), so no human checkpoint. The test failed first (RED, 42 failures with no runbook), passed once the table existed, and a mutation check (one cell changed to a wrong rule) made exactly the matching scope test fail before the file was restored.

## What the runbook contains

- **Systems and identities:** prestigo-admin (TOTP, browser only), prestigo-config (no 2FA, deactivate when idle), prestigo-sync (API key, Sync writer), system mail env file; file modes, never retry after a 401, printable-ASCII key rule, the Restore Drill Canary stays untouched.
- **Config as code:** resource order, `--dry-run`, `--only`, `create=0 update=0` on a second run, enum/layout merge rules, roles = git wins for the three managed names, change roles in `roles.json` only.
- **Roles table** (test-pinned) + Dispatcher's nine hidden Account fields (test-pinned), Admin = owner only, Booking read-only for operators with the admin exception (next backfill overwrites), Leads unset until Phase 81.
- **Chatwoot role mirror (D-23):** CE has only agent/administrator; Dispatcher = agent in Bookings, Sales manager = agent in B2B, owner = administrator; inbox membership decides visibility; no agents exist yet.
- **Adding / removing an operator:** step lists for both systems. EspoCRM user needs an email address and default Task reminders (only prestigo-admin gets them from `mail.json`), and email reminders work only while the system mail account is Active (`inspect.mjs system-mail --expect-active`). Chatwoot agent email is never info@, bookings@ or roman@ (loop prevention, cites `chatwoot-channels.md`). Ends with `verify-acl.mjs`.
- **Sales mailbox (roman@):** Personal Email Account for prestigo-admin, Fetch Since 2026-10-16, never a Group Email Account, never Chatwoot, no forwarder or phone IMAP, unknown senders create nothing, send partner mail from the Opportunity (D-24), Reminders folder (Move to Folder, never Skip).
- **Booking mirror:** run order (`--dry-run`, `--limit 1`, full, repeat, `--audit`, `--relink`), live result CBooking=56 / Contact=29, field ownership, phone normalisation rules for operators (Contact E.164, booking keeps the original, one Contact has no phone so a repeat run shows `contacts update=1`).
- **Overlay, seeding, verification, recovery:** S1-S4 and rollback commands, candidates -> owner confirmation -> seed -> relink, verification command list, restic restore pointers, IP-ban handling, `authApiUserLogDisabled` via `bin/command config:set`.

## Verification

- `npx vitest run tests/crm-runbook.test.ts tests/whatsapp-runbook.test.ts tests/infra-vps-isolation-guard.test.ts`: 3 files, 141 tests pass (65 new).
- `grep -c '^## '` = 13; `wc -l` = 342 (>= 150).
- `npx tsc --noEmit`: 8 errors, the known baseline in `tests/` (one new error in this test was fixed before commit). `npx eslint --quiet tests/crm-runbook.test.ts`: clean.
- Pre-commit hook (secret scan, price guard) passed on both commits. The project `verify` skill was not run as a separate step; its checks (tsc, eslint, related tests, secret/price scans) were run directly as listed. No live calls were made.

## Deviations from Plan

None - plan executed as written, with these notes:

- `seed-accounts.mjs` does not exist yet (it is the deliverable of plan 80-13). The runbook names it as the plan requires and says it is added by plan 80-13; its flags are taken from the 80-13 plan (`--dry-run`, expected `accounts: create=0` on re-run) and must be re-checked once 80-13 lands.
- The runbook mentions an operator's own Personal Email Account for the Sales manager role (the role has `EmailAccountScope` true); this is described, not exercised live.

## Items to confirm at first hire (flagged edge assumption CRM-05-unclassified)

That a new operator can follow the add/remove steps unaided is confirmed only at the first hire. Specific points written from documentation rather than a live run: the exact Chatwoot UI menu path for agents/teams/collaborators, EspoCRM's per-user Preferences screen for default Task reminders, and the wording of the ban-lift period (deliberately left unquantified).

## Known Stubs

None.

## Threat Flags

None. T-80-35 (secrets/PII): negative tests on secret shapes, phone shapes and any email other than the four rideprestigo.com role addresses. T-80-36 (mailbox address as agent email): explicit rule in "Adding an operator" plus a line-level negative test. T-80-37 (permission drift): role table and hidden-field table pinned by test, `verify-acl.mjs` listed after every operator change. T-80-SC: no package installs.

## Self-Check: PASSED

- FOUND: infra/vps/runbooks/crm-operators.md, tests/crm-runbook.test.ts
- FOUND commits: f123a20a, dbccfeb5
