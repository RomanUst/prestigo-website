---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 03
subsystem: infra
tags: [espocrm, lead, acl, config-as-code, inspect]
requires: []
provides:
  - Lead custom fields live in EspoCRM (cSupabaseRef, cBookingReference, cReturnBookingReference, cAdminLink, cExistingCustomer)
  - Lead ACL for the three managed roles (D-22), proven live
  - PII-free inspect commands user-id, notify-settings, contact-match, links
  - fake EspoCRM stock Lead scope and own-side c prefix on stock-scope links
affects: [81-02, 81-06, 81-07, 81-09, 81-10, 81-11]
tech-stack:
  added: []
  patterns:
    - "allowed-DELETE ACL probe runs on a throw-away record created right before the check"
key-files:
  created: []
  modified:
    - infra/espocrm/fields.json
    - infra/espocrm/roles.json
    - infra/espocrm/verify-acl.mjs
    - infra/espocrm/inspect.mjs
    - infra/vps/runbooks/crm-operators.md
    - tests/helpers/fake-espocrm.ts
    - tests/espocrm-roles.test.ts
    - tests/espocrm-model.test.ts
    - tests/espocrm-mail.test.ts
key-decisions:
  - "Allowed DELETE on Lead is probed against a disposable record (check.disposable) so the shared lead fixture survives for the next role's PUT; cleanup tolerates 404 for these records only"
  - "settings.json unchanged: live assignment emails are off (D-04)"
requirements-completed: [LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-06]
duration: ~35 min
completed: 2026-10-18
status: complete
commits: 3
plan_head_before: e402616a5fe02ad76897effbe173c320ad8aad3e
plan_head_after: bd2aaecf04688f8d0539682a47b2e2c1c1f6d139
actuals:
  tokens: 9600
  tasks: 3
  commits: 3
---

# Phase 81 Plan 03: Lead fields, Lead ACL and inspect commands Summary

The live EspoCRM now accepts website Leads: five `c`-prefixed Lead fields exist, prestigo-sync can create, edit and delete Leads, the Dispatcher cannot see them, and the owner's assignee user id is known.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | cSupabaseRef + Lead ACL (Sync writer, Sales manager full, Dispatcher false) + verify-acl Lead probe + fake/runbook | 7ef4719a |
| 2 | bookingReference, returnBookingReference, adminLink, existingCustomer fields | 3b5b104e |
| 3 | inspect user-id / notify-settings / contact-match / links | bd2aaecf |

The tracer gate passed (unit tests plus live `sync` second run no-op plus `verify-acl` all pass) before tasks 2 and 3: Tracer verified end-to-end, expanding.

## Live results (PII-free)

- `node infra/espocrm/sync.mjs --only fields,roles`: first run `fields create=1`, `roles update=3`; second run `create=0 update=0` for both.
- `node infra/espocrm/sync.mjs --only fields` (task 2): `create=4 update=0 unchanged=32`. Full `sync.mjs` and `sync.mjs --dry-run` afterwards: every resource `create=0 update=0` (fields unchanged=36).
- `node infra/espocrm/verify-acl.mjs` (all roles): `acl: pass=87 fail=0`, exit 0. Includes `Dispatcher GET /Lead forbidden`, and `GET/POST/PUT/DELETE /Lead allowed` for Sales manager and Sync writer. `--role Dispatcher`: pass=27 fail=0.
- `inspect.mjs user-id prestigo-admin`: **`user_id=6ab9960b9beb3ae73`** (owner id for plan 81-11 Vercel env `ESPOCRM_LEAD_ASSIGNEE_ID`; not a secret).
- `inspect.mjs notify-settings`: `assignment_email=off lead_in_assignment_email_list=yes assignment_email_entities=Lead,Opportunity,Task,Case`. Assignment emails are off, so no Lead assignment email can reach the owner: assignment emails off, no change (D-04); settings.json untouched.
- `inspect.mjs contact-match`: `contact_match=ok` (RESEARCH A2 confirmed: the exact `equals` query on `emailAddress` finds an existing Contact; 0 "@" in output).
- `inspect.mjs links Lead` baseline: `assignedUser,calls,callsChildren,campaign,campaignLogRecords,cases,createdAccount,createdBy,createdContact,createdOpportunity,documents,emails,meetings,meetingsChildren,modifiedBy,targetLists,tasks,teams` (no existing-contact link yet; plan 81-06 adds it).

## Acceptance criteria

All pass: roles.json Lead check (exit 0), second live sync create=0 update=0, `verify-acl` exit 0, `grep -c "| Lead |"` = 1, fields.json Lead names match the five expected, user-id regex match, contact-match prints `ok` with zero "@", full espocrm + crm-runbook suites green (523 tests), tsc and eslint show no new errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Allowed Lead DELETE would break later probes**
- **Found during:** Task 1
- **Issue:** The plan asked for Lead DELETE allowed checks; the existing runner only generated delete checks for `delete: no`, and an allowed delete on the shared `lead` fixture would make the next role's PUT 404 and the admin cleanup fail.
- **Fix:** `buildAclExpectations` emits `DELETE /Lead/{id} allowed` with `fixture: 'disposable'`; the runner creates a throw-away Lead as admin right before the check and cleans up with a 404-tolerant step.
- **Files modified:** infra/espocrm/verify-acl.mjs, tests/espocrm-roles.test.ts
- **Commit:** 7ef4719a

**2. [Rule 3 - Blocking] Fake lacked the `isNotNull` where type**
- **Found during:** Task 3
- **Issue:** `contact-match` uses `isNotNull`; the fake's `matchesWhere` returned false for it.
- **Fix:** added the case to tests/helpers/fake-espocrm.ts (this plan is the only editor of the fake in the phase).
- **Commit:** bd2aaecf

**3. [Rule 1 - Bug] Existing test counts**
- Two existing espocrm-model assertions counted fields (`create=30`, `unchanged=31`); updated to 35 / 36 for the five new Lead specs. The existing "Sync writer ... no delete anywhere" invariant was updated to "delete only on Lead".

**Total deviations:** 3 (2 blocking, 1 test-count update). **Impact:** none on scope.

## Notes

- `node_modules` is not present in fresh worktrees; a gitignored symlink to the main checkout's `node_modules` was used to run tests (nothing installed).
- Runbook rule "Leads are deliberately unset" replaced with the D-22 Lead rule; Lead row added to the role table.
- RESEARCH A6 (bell notifications for followed Leads) is still to be checked at go-live (81-11).

## Known Stubs

None.

## Threat Flags

None. T-81-07 mitigated (Dispatcher `Lead: false`, live 403); T-81-09 mitigated (inspect output ids/flags only, tests assert no "@"); T-81-08 accepted as planned.

## Self-Check: PASSED

Files and commits (7ef4719a, 3b5b104e, bd2aaecf) verified present; all live steps completed (no ORCHESTRATOR_LIVE_REQUIRED items).
