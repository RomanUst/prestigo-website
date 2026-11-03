---
phase: 80-espocrm-deployment-core-entities
plan: 07
subsystem: infra
tags: [espocrm, acl, roles, config-as-code, security, least-privilege]
status: complete
requirements: [CRM-05, CRM-03]
requires: ["80-04", "80-05", "80-06"]
provides:
  - "Live roles Dispatcher, Sales manager, Sync writer, managed from infra/espocrm/roles.json (git wins for these three names only)"
  - "sync.mjs resource `roles` (after layouts) with buildRoleSpecs export, `@commercialHidden` expansion from the commercial:true Account fields, permission-value validation against live Role metadata, and `assignTo` role merge into users"
  - "Sync writer assigned to prestigo-sync (merge, nothing removed)"
  - "infra/espocrm/verify-acl.mjs: repeatable live ACL probe with temporary API users, exports buildAclExpectations, scanForSecrets, runAclProbe"
  - "tests/espocrm-roles.test.ts (34 tests); fake-espocrm gains API-user creation with apiKey and a default prestigo-sync user"
affects: [80-08, 80-09, 80-11]
tech-stack:
  added: []
  patterns: ["expectations derived from the role specs (one source of truth)", "probe keys in memory only, output scanned for keys before printing", "forbidden means exactly 403 (404 only for the attachment), so a 5xx can never pass"]
key-files:
  created:
    - infra/espocrm/roles.json
    - infra/espocrm/verify-acl.mjs
    - tests/espocrm-roles.test.ts
  modified:
    - infra/espocrm/sync.mjs
    - infra/espocrm/lib/client.mjs
    - tests/helpers/fake-espocrm.ts
decisions:
  - "Roles are diffed with subsetEqual plus key-set equality on data and fieldData, so a scope or field rule removed from git is also removed live (git wins for managed roles)"
  - "Absent scopes are not treated as 'allowed' in the live CRM: the Sync writer (Account, Contact, CBooking only) gets 403 on Opportunity, CPartnerRate, Email, Lead, Case, Document and Task, so roles.json lists no extra explicit `false` for the Sync writer"
  - "The probe also asserts, admin-side, that prestigo-sync holds the Sync writer role, so assignment is proven independently of the key file"
  - "Probe checks run per role in the order reads, field rules, attachment, PUT, POST, DELETE (an unexpected delete cannot hide later checks)"
metrics:
  duration: ~75min
  completed: 2026-10-13
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
plan_head_before: acba3104ec72cd8f2c5b3d6f78a581c446d58729
plan_head_after: 0ddf7511f3424671e554524fa9e1b25fa2df677b
---

# Phase 80 Plan 07: Operator roles and Sync writer, proven by a live ACL probe Summary

Dispatcher, Sales manager and Sync writer exist live as code, and every D-15 / D-16 / D-17 / D-22 rule plus the read-only Booking rule is proven against the live CRM by `node infra/espocrm/verify-acl.mjs`: `acl: pass=78 fail=0`, exit 0, no probe objects left behind, no key printed.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | roles resource + Dispatcher live, temporary Dispatcher API user (Opportunity 403, commercial fields hidden) | c5ba782c |
| 2 | Sales manager and Sync writer roles, Sync writer assigned to prestigo-sync, role invariants | 960985ba |
| 3 | full live ACL matrix, contract attachment (A6), self-check, clean teardown | 0ddf7511 |

Tracer gate: automated-only verify (default end-of-phase mode), so no human checkpoint; vitest and the live Dispatcher probe (pass=12 fail=0) both passed before Task 2 started.

## Live outcome (counts only)

- `sync.mjs --only roles`: first run `create=1` (Dispatcher), then `create=2 update=1` (Sales manager, Sync writer, role assigned to prestigo-sync); repeat runs `create=0 update=0 unchanged=3`.
- Full repeat `sync.mjs`: settings 1, entities 2, links 3, fields 31, enums 2, layouts 9, roles 3, all `unchanged`, summary `create=0 update=0 removed=0`.
- The `Restore drill canary` role and user and the `Restore Drill Canary` Account were never read for update or modified (asserted in a unit test for the role; the probe only touches its own fixtures).

## ACL probe result (no data, no keys)

`acl: pass=78 fail=0`, exit 0.

| Role | Checks | Result |
| ---- | ------ | ------ |
| Dispatcher | 26 | all PASS: GET Contact, Account, CBooking, Task allowed; GET Opportunity, CPartnerRate, Email forbidden (403); all 9 commercial Account fields hidden; contract attachment download forbidden; PUT/POST/DELETE forbidden on Account, Contact, CBooking |
| Sales manager | 26 | all PASS: GET Opportunity, CPartnerRate, Email, CBooking allowed; all 9 commercial fields shown; contract attachment download allowed (positive control for A6); PUT Account/Contact allowed, POST Account/Contact allowed; POST/PUT/DELETE CBooking forbidden; DELETE Account/Contact forbidden |
| Sync writer | 26 | all PASS: assigned to prestigo-sync; GET Account, Contact, CBooking allowed; GET Opportunity, CPartnerRate, Email forbidden; PUT/POST CBooking allowed; DELETE Account/Contact/CBooking forbidden |

- **A6 result:** a Dispatcher cannot download the Account contract file (`GET /Attachment/file/{id}` rejected with 403/404), while the Sales manager can fetch the same attachment, so the denial is real and not a broken fixture. No owner decision needed; the field-level `read: no` on `cContractFile` also blocks the attachment.
- **Teardown:** after the run, users named `acl-probe*` = 0, Accounts named `ACL Probe*` = 0, CBooking with `supabaseBookingId` starting `acl-probe` = 0, attachments `acl-probe*` = 0 (EspoCRM soft-deletes, so the two CBooking probe rows are retained as deleted rows; their ids are unique per run, `acl-probe-{timestamp}-{random}`, so the unique index of plan 80-08 meets no duplicates).
- Output self-check: the runner collects every printed line and scans for the in-memory probe keys and the prestigo-sync key; a hit suppresses the output and exits 3 (unit tested with a fake key).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The live prestigo-sync key file has a stray non-ASCII character**
- **Found during:** Task 2 live confirmation that prestigo-sync can read /CBooking
- **Issue:** `ESPOCRM_API_KEY` in `~/.config/prestigo/espocrm-sync.env` is 33 characters: a Cyrillic character at index 0 followed by a valid 32-hex key. `fetch` fails with a cryptic ByteString error. I did not edit the file (owner credential).
- **Fix:** `loadEspoConfig` now rejects a key outside printable ASCII with a clear `EspoConfigError` that never echoes the key (client.mjs, 2 unit tests). With the first character stripped in memory only, prestigo-sync authenticated, read /CBooking (total 0) and got 403 on Opportunity, CPartnerRate, Email, Lead, Case, Document and Task. verify-acl uses the real key when it loads and otherwise prints one `WARN` line and probes the Sync writer role through a temporary user (the assignment itself is still proven admin-side).
- **Owner action required before plan 80-09:** remove the first character of the `ESPOCRM_API_KEY` value in `~/.config/prestigo/espocrm-sync.env` (a Cyrillic letter typed with the Russian keyboard layout). Until then `acl:` output carries the WARN line and the backfill cannot authenticate.
- **Files modified:** infra/espocrm/lib/client.mjs, tests/espocrm-roles.test.ts
- **Commit:** 960985ba

**2. [Rule 3 - Blocking] Existing full-sync tests broke once `roles` joined RESOURCE_ORDER**
- **Issue:** full-config tests in espocrm-model.test.ts ran the roles resource against a fake without a prestigo-sync user.
- **Fix:** the shared fake now seeds a default `prestigo-sync` API user (same shape as the live instance), unless a test passes its own User records.
- **Files modified:** tests/helpers/fake-espocrm.ts
- **Commit:** 960985ba

### Other notes

- The probe covers a few checks beyond the plan list (PUT/POST on Account and Contact, DELETE on Account and Contact, Task read, the admin-side assignment proof, a contract-download positive control). All derive from roles.json; none weaken a planned check.
- Leads and other stock scopes are intentionally unset (Phase 81 decides lead access), as planned.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the probe's temporary API users, deleted in `finally` and verified gone (T-80-20).

## Threat model status

| Threat | Result |
| ------ | ------ |
| T-80-18 commercial disclosure to Dispatcher | mitigated: scope false for CPartnerRate/Opportunity/Email, generated fieldData for all 9 commercial fields, invariant test + live probe pass |
| T-80-19 contract file by attachment id (A6) | mitigated: live download probe, Dispatcher denied, Sales manager allowed |
| T-80-20 probe users/keys left or printed | mitigated: keys in memory, deleted in finally, teardown count 0, output self-check |
| T-80-21 over-privileged sync identity | mitigated: three scopes, no delete, 403 on everything else, live probe |
| T-80-22 Booking history edited by operators | mitigated: CBooking create/edit/delete `no` for both human roles, live 403 on POST/PUT/DELETE; the owner's admin stays the documented exception for the 80-11 runbook |
| T-80-SC package installs | none performed |

## Verification

- `npx vitest run` on tests/espocrm-*.test.ts (6 files): 246 passed.
- `npx tsc --noEmit`: 8 errors, all the known baseline in unrelated tests (none in espocrm files). `npx eslint --quiet` clean on changed files.
- Live: repeat full sync no-op, verify-acl `pass=78 fail=0`, teardown counts 0.

## Self-Check: PASSED

- infra/espocrm/roles.json, infra/espocrm/verify-acl.mjs, tests/espocrm-roles.test.ts: present.
- Commits c5ba782c, 960985ba, 0ddf7511: present on branch worktree-agent-a627c25e815568149.
