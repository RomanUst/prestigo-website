---
phase: 80-espocrm-deployment-core-entities
plan: 05
subsystem: infra
tags: [espocrm, config-as-code, enum, pipeline, kanban, account-types]
status: complete
requirements: [CRM-02, CRM-01]
requires: ["80-04"]
provides:
  - "Live Opportunity.stage: New, First Contact, Meeting, Rate Sent, Trial Ride, Closed Won, Closed Lost (labels per D-01), default New"
  - "Live Account.type: Hotel, Agency, Corporate, Embassy, Other (labels per D-02)"
  - "infra/espocrm/lib/enum-merge.mjs: mergeEnumOptions, mergeValueMap, mergeDefault (pure)"
  - "infra/espocrm/sync.mjs resource enums (between fields and layouts) with admin in-use guard"
  - "infra/espocrm/enums.json shape: { enums: [ { scope, field, values, retire, default?, probabilityMap?, style? } ] }"
  - "tests/helpers/fake-espocrm.ts: GET /I18n, stock Opportunity.stage / Account.type / lastStage fields, isNull where type"
affects: [80-06, 80-07, 80-08, 80-09]
tech-stack:
  added: []
  patterns: [merge-safe enum PUT (whole merged options + labels map), seed-not-enforce per-value maps, retire-only-when-unused]
key-files:
  created:
    - infra/espocrm/lib/enum-merge.mjs
    - infra/espocrm/enums.json
    - tests/espocrm-enums.test.ts
  modified:
    - infra/espocrm/sync.mjs
    - tests/helpers/fake-espocrm.ts
decisions:
  - "Stage default is replaced only when the live default is absent or a retire-listed stock value (Prospecting); an owner-chosen default survives"
  - "probabilityMap and style are seeded per value (added when the live map has no key for it), never overwritten, so owner edits survive; they are not part of the diff for existing keys"
  - "The empty Account type option is checked as isNull plus equals '' (EspoCRM rejects a where type isEmpty on a plain column with 400)"
  - "The PUT body carries type, merged options, the full merged translatedOptions map, default, probabilityMap, style and the field's own fieldManagerAdditionalParamList"
metrics:
  duration: ~25min
  completed: 2026-10-13
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
plan_head_before: 6f2929f7c97ecaf54f3bc2a6f334869195aa2550
plan_head_after: 185c621473ef17a9fbe95539d3df37eeb1dbb010
---

# Phase 80 Plan 05: B2B pipeline stages and account types Summary

The CRM now runs Prestigo's seven-stage B2B pipeline on the Opportunity Kanban and offers the five D-02 Account types. Both are applied from git by a merge-safe `enums` resource, and a repeat full live sync is a no-op (`create=0 update=0 removed=0` on every resource).

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | mergeEnumOptions, enums resource, Opportunity.stage live | 975cc632 |
| 2 | Account.type, in-use guard (isNull + empty string), survival and retire-boundary tests, live | 185c6214 |

The tracer gate needed no human checkpoint (default `end-of-phase` mode, automated `<verify>` only): vitest and a repeat live run were re-run after the tracer commit and passed before Task 2.

## Live outcome (counts only)

- Opportunity.stage options now: New, First Contact, Meeting, Rate Sent, Trial Ride, Closed Won, Closed Lost; labels New, First contact, Meeting / call, Rate sent, Trial ride, Partner (Won), Lost; default New.
- Account.type options now: Hotel, Agency, Corporate, Embassy, Other, and an empty option (see below); labels Hotel, Travel agency / DMC, Corporate, Embassy / event agency, Other.
- Stock values removed (no record used them): Opportunity Prospecting, Qualification, Proposal, Negotiation (4 of 4, 0 Opportunity records exist); Account Customer, Investor, Partner, Reseller (4 of 5, 0 records each).
- Stock value kept because it is in use: Account empty option `''`, used by 1 Account (the existing Account has no type; this is the canary, only read, never modified). It sits last in the list. It disappears on its own run once every Account has a type.
- `lastStage` finding: `entityDefs.Opportunity.fields.lastStage` has no options list of its own (`customizationOptionsDisabled`, derived from `stage` by its view). No second enums entry was needed.
- Kanban: `clientDefs.Opportunity.kanbanViewMode` = `true`; `scopes.Opportunity.kanbanStatusIgnoreList` = `["Closed Lost"]`. Both were already stock and unchanged, so the board shows the six open-or-won columns.
- Second live run: `enums: create=0 update=0 unchanged=2 skipped=0 removed=0`. Full run: settings 1, entities 1, links 2, fields 15, enums 2, layouts 5 unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EspoCRM has no `isEmpty` where type for a plain column**
- **Found during:** Task 2 live dry run (`400 Unknown where item type 'isEmpty'`)
- **Issue:** the plan's interface says to use type `isEmpty` for the `''` option; the live API rejects it.
- **Fix:** `''` is in use when either `isNull` or `equals ''` returns a record (two probes). The fake gained `isNull`.
- **Files modified:** infra/espocrm/sync.mjs, tests/helpers/fake-espocrm.ts
- **Commit:** 185c6214

**2. [Design choice within Rule 2] probabilityMap and style are seeded, not enforced**
- The plan said to PUT when probabilityMap or style differ. Because the plan itself marks the probabilities as owner-editable and the plan prohibition forbids overwriting owner changes, only missing keys are added (and keys of removed values are dropped from the PUT). A test pins that an owner-edited probability and style survive a re-run.

### Observation (no action)

- The stock Opportunity metadata layer still contributes probabilityMap and style keys for the retired stock stages (Prospecting 10, Qualification 20, Proposal 50, Negotiation 80, and Proposal/Negotiation styles) because EspoCRM merges custom metadata over the stock files. They are inert (no matching option) and the sync converges on them, so the repeat run stays a no-op.
- Stock i18n labels for the retired stages remain in `GET /I18n` for the same reason; the full merged label map is still sent on every PUT.

## Known Stubs

None.

## Threat Flags

None. The only new request surface is read GETs of record counts and `/I18n` plus the existing `PUT /Admin/fieldManager/{scope}/{field}` with the admin identity. T-80-14 (owner values and labels survive) and T-80-15 (retire only when zero records use it) are covered by tests in tests/espocrm-enums.test.ts, including the 0 versus 1 record boundary.

## Self-Check: PASSED

- infra/espocrm/lib/enum-merge.mjs, infra/espocrm/enums.json, tests/espocrm-enums.test.ts exist
- commits 975cc632 and 185c6214 exist
- `npx vitest run tests/espocrm-enums.test.ts tests/espocrm-model.test.ts tests/espocrm-sync.test.ts`: 85 passed; eslint clean on the changed files; no new tsc errors in espocrm files
