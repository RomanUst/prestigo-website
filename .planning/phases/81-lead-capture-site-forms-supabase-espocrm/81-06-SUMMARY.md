---
phase: 81-lead-capture-site-forms-supabase-espocrm
plan: 06
subsystem: infra
tags: [espocrm, lead, enums, links, layouts, config-as-code, smoke]
requires: [81-03]
provides:
  - Lead.source live enum with the 7 site values merged into the stock list
  - Lead -> Contact existing-contact link live as Lead.cExistingContact (attribute cExistingContactId) / Contact.cExistingLeads
  - Lead detail "Website" panel and Lead list cExistingCustomer column (append-only)
  - sync.mjs syncLinks final-name (c-prefixed) existence check for stock scopes
  - infra/espocrm/lead-smoke.mjs (show / delete by site reference, PII-free)
affects: [81-02, 81-07, 81-09, 81-10, 81-11]
tech-stack:
  added: []
  patterns:
    - "link existence is checked under the final (c-prefixed) name for stock scopes, raw name for custom scopes"
key-files:
  created:
    - infra/espocrm/lead-smoke.mjs
    - tests/espocrm-lead-smoke.test.ts
  modified:
    - infra/espocrm/enums.json
    - infra/espocrm/entities.json
    - infra/espocrm/layouts.json
    - infra/espocrm/sync.mjs
    - tests/espocrm-enums.test.ts
    - tests/espocrm-model.test.ts
key-decisions:
  - "Link/layout tests live in tests/espocrm-model.test.ts (where the links and layouts tests already are); tests/espocrm-sync.test.ts needed no change"
  - "lead-smoke show prints one summary line per matching Lead, each carrying count=N; the single-Lead case is exactly the line in the plan"
requirements-completed: [LEAD-01, LEAD-02, LEAD-03, LEAD-06]
completed: 2026-10-18
status: complete
commits: 3
plan_head_before: fbab3cb5
plan_head_after: 6ae1657f739765e1cda9307f9a46f775a53b6b86
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase 81 Plan 06: Lead model completion Summary

The live Lead now accepts every source the site sends, can point to an existing Contact, and shows the site references in a Website panel; a PII-free smoke tool exists for the go-live checks in 81-11.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (tracer) | Lead.source merge entry (10 values, empty retire) + tests, applied live | dd6f8066 |
| 2 | Lead.existingContact link, syncLinks final-name fix, Lead detail/list layout appends, applied live | 87fbb058 |
| 3 | lead-smoke.mjs show/delete + tests | 6ae1657f |

Tracer gate passed (unit tests plus live dry-run `enums` all zero after apply): Tracer verified end-to-end, expanding.

## Live results (PII-free)

- RESEARCH A9 confirmed: the live API accepted the merged stock `Lead.source` (no `customizationOptionsReferenceDisabled`).
  - `sync.mjs --only enums`: `enums: create=0 update=1 unchanged=2`; second run `update=0 unchanged=3`.
- RESEARCH A4 confirmed: the link names are as predicted.
  - `sync.mjs --only links,layouts`: `links: create=1 unchanged=3`, `layouts: update=2 unchanged=9` (Lead/detail, Lead/list).
  - `node infra/espocrm/inspect.mjs links Lead` after apply: `links=assignedUser,cExistingContact,calls,callsChildren,campaign,campaignLogRecords,cases,createdAccount,createdBy,createdContact,createdOpportunity,documents,emails,meetings,meetingsChildren,modifiedBy,targetLists,tasks,teams`
  - So `lib/lead-mapping.ts` LEAD_ATTR.existingContactId = `cExistingContactId` matches the live link `cExistingContact`.
- Full `sync.mjs --dry-run` afterwards: every resource `create=0 update=0` (settings 1, entities 2, links 4, fields 36, enums 3, layouts 11, roles 3, mail 5 unchanged).
- `lead-smoke.mjs show inquiry:00000000-0000-4000-8000-000000000000` against the live CRM (apikey identity): `count=0`, exit 0. `show foo`: config error, exit 1. No live Lead was created, so nothing to clean up. The full show/delete round trip is exercised in plan 81-11.

## Verification

`npx vitest run tests/espocrm-*.test.ts`: 13 files, 483 tests pass. eslint clean on the touched files; `tsc --noEmit` shows no errors outside the known `tests/` baseline.

## Deviations from Plan

None - plan executed as written. Notes:
- Tests for the link and layout behaviour went into tests/espocrm-model.test.ts (the existing home of links and layouts tests); two existing counts there changed from `links create=3 / unchanged=3` to `4 / 4` for the new Lead link.
- tests/helpers/fake-espocrm.ts was not edited (the stock Lead scope and own-side `c` prefix from 81-03 were enough).

## Known Stubs

None.

## Threat Flags

None. T-81-13 mitigated (empty retire, append-only layouts, second-run zero counts proven live); T-81-14 mitigated (final-name check, second-run create=0 in fake and live); T-81-38 mitigated (refs validated as exact `inquiry:<uuid>` / `booking:<uuid>` before any request; test asserts a bad ref sends zero requests).

## Self-Check: PASSED

Commits dd6f8066, 87fbb058, 6ae1657f present; infra/espocrm/lead-smoke.mjs and tests/espocrm-lead-smoke.test.ts exist; all live steps completed (no ORCHESTRATOR_LIVE_REQUIRED items).
