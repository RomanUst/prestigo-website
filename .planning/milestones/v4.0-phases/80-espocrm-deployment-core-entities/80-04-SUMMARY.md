---
phase: 80-espocrm-deployment-core-entities
plan: 04
subsystem: infra
tags: [espocrm, config-as-code, entity-manager, field-manager, layouts, cbooking]
status: complete
requirements: [CRM-03]
requires: ["80-01", "80-03"]
provides:
  - "Live entity CBooking (Booking/Bookings, stream off) with the 15 D-09 field specs"
  - "Live links CBooking.contact -> Contact.cBookings and CBooking.account -> Account.cBookings"
  - "infra/espocrm/sync.mjs resources entities, links, fields, layouts; exports finalFieldName, customEntityName, mergeLayout, UNIVERSAL_FIELD_PARAMS"
  - "infra/espocrm/entities.json, fields.json, layouts.json (shapes later plans extend)"
  - "tests/helpers/fake-espocrm.ts: EntityManager, FieldManager and layout routes plus stockEspoMetadata()"
affects: [80-05, 80-06, 80-07, 80-08, 80-09]
tech-stack:
  added: []
  patterns: [validate-all-then-write field sync, create-only entities/links/labels, append-only stock-scope layout merge]
key-files:
  created:
    - infra/espocrm/entities.json
    - infra/espocrm/fields.json
    - infra/espocrm/layouts.json
    - tests/espocrm-model.test.ts
  modified:
    - infra/espocrm/sync.mjs
    - tests/helpers/fake-espocrm.ts
    - tests/espocrm-sync.test.ts
decisions:
  - "Relationship panels on Contact/Account are driven by the bottomPanelsDetail layout (keyed object), not the relationships list; layouts.json appends cBookings there"
  - "entities and links are create-only; label, translatedOptions and tooltipText are create-only on fields (owner may relabel in the UI)"
  - "Replace-mode layouts (CBooking) are ours and are restored on drift; stock-scope layouts are append-only"
metrics:
  duration: ~1h
  completed: 2026-10-13
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
plan_head_before: e87b7aa33e64732d57a12a6012a8aef717c4a279
plan_head_after: 92c236be220256e15efbbcd7a8775e6dce2dee08
---

# Phase 80 Plan 04: Booking mirror data model Summary

The live CRM now has a CBooking entity with all 15 D-09 fields, manyToOne links to Contact and Account, and layouts that put a Bookings panel on both detail pages. All of it is applied from git and a repeat full sync is a no-op.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | entities, links, fields resources; CBooking + contact link + supabaseBookingId live | 6c565c21 |
| 2 | 14 remaining D-09 fields, account link, invariants pinned to booking-map | 08b9db18 |
| 3 | layouts resource, CBooking layouts, Contact/Account Bookings panel | 92c236be |

The tracer gate was satisfied without a human checkpoint (`human_verify_mode` default end-of-phase, automated `<verify>` only): vitest plus a repeat live run were re-run after the tracer commit and passed, then Tasks 2 and 3 expanded.

## Confirmed universal FieldManager params (10.0.8)

Read from `application/Espo/Tools/FieldManager/FieldManager.php` at tag 10.0.8:

- `prepareFieldDefs` always permits: `type`, `isCustom`, `isPersonalData`, `tooltip`, `inlineEditDisabled`, `defaultAttributes` (plus `notLockable` on lockable scopes).
- `write()` handles outside entityDefs: `label`, `tooltipText`, `translatedOptions` (only when the type metadata has `translatedOptions`; live: enum yes), and the dynamic logic keys `dynamicLogicVisible`, `Required`, `ReadOnly`, `Options`, `Invalid`, `ReadOnlySaved`, `Cascading`.
- Everything else must be in the live `fields.{type}.params` list or in a `fieldManagerAdditionalParamList` (which the server reads from the request body; the sync copies it from the existing field or the type metadata).
- `update()` drops `type`; `create()` adds `maxLength: 100` to enums by default; `isCustom: true` is set automatically.

Live per-type params (read-only probe): varchar `required, default, maxLength, options, pattern, copyToClipboard, audited, readOnly, readOnlyAfterCreate, noSpellCheck, optionsPath`; enum `required, options, default, optionsReference, isSorted, translation, optionsPath, style, displayAsLabel, labelType, audited, readOnly, readOnlyAfterCreate`; currency `required, default, min, max, onlyDefaultCurrency, conversionDisabled, decimal, audited, readOnly, readOnlyAfterCreate, precision, scale`; datetime `required, default, after, before, afterOrEqual, useNumericFormat, hasSeconds, minuteStep, audited, readOnly, readOnlyAfterCreate`; url `required, default, maxLength, strip, protocolRequired, copyToClipboard, audited, readOnly, readOnlyAfterCreate`.

## Live sync output (admin identity, one request at a time, no 401s)

Tracer (Task 1): dry-run `create=1` for each of entities/links/fields (GET only); apply created CBooking, `CBooking.contact` and `CBooking.supabaseBookingId`; repeat `unchanged=1` for all three.

Task 2: apply created `CBooking.account` and 14 fields; repeat run:

```
entities: create=0 update=0 unchanged=1 skipped=0 removed=0
links: create=0 update=0 unchanged=2 skipped=0 removed=0
fields: create=0 update=0 unchanged=15 skipped=0 removed=0
```

Task 3: apply updated the five layouts; final repeat full run (exit 0):

```
settings: create=0 update=0 unchanged=1 skipped=0 removed=0
entities: create=0 update=0 unchanged=1 skipped=0 removed=0
links: create=0 update=0 unchanged=2 skipped=0 removed=0
fields: create=0 update=0 unchanged=15 skipped=0 removed=0
layouts: create=0 update=0 unchanged=5 skipped=0 removed=0
summary: create=0 update=0 removed=0
```

Read-only checks after apply: `GET /CBooking?maxSize=1` gives `total 0` (no CBooking record was created, 80-08 needs an empty table); `/I18n` shows the seeded enum labels (vehicleClass E-Class/S-Class/V-Class, status Title Case, source Website/Admin-created/GNet), field labels and scope names Booking/Bookings; `Contact.cBookings` and `Account.cBookings` links exist.

## Verification

- `npx vitest run tests/espocrm-model.test.ts tests/espocrm-sync.test.ts` plus booking-map, candidates and isolation-guard tests: 5 files, 191 tests pass (model test file alone: 42 tests).
- `npx tsc --noEmit`: no new errors (baseline 8 in unrelated tests ignored); `npx eslint --quiet infra/espocrm tests/espocrm-*.test.ts tests/helpers/fake-espocrm.ts`: clean.
- verify skill: PASS (no app/ or components/ changes, no secrets, no i18n keys).

## Deviations from Plan

**1. [Rule 1 - Bug] Contact/Account panels use `bottomPanelsDetail`, not `relationships`**
- **Found during:** Task 3 (live read-only probe before writing layouts)
- **Issue:** The plan appends `['cBookings']` to the `relationships` layout. On 10.0.8 the detail view builds relationship panels from the `bottomPanelsDetail` layout (keyed object, `disabled` when absent; see `views/record/detail-bottom.js` and the layout manager's `bottom-panels-detail.js`). Contact's `relationships` list is a legacy mirror, and Account's is `[]` (no stock file), so appending there would not show a panel and, for Account, could hide nothing but also show nothing.
- **Fix:** layouts.json entries are `Contact/bottomPanelsDetail` (`cBookings` index 5.003) and `Account/bottomPanelsDetail` (`cBookings` index 5.5, inside the Account tab after documents). `mergeLayout` supports list-of-names, list-of-panels and keyed-object shapes, all append-only. Entry count (5) and append mode match the acceptance criteria.
- **Files:** infra/espocrm/layouts.json, infra/espocrm/sync.mjs
- **Commit:** 92c236be

**2. [Rule 3 - Blocking] Existing 80-01 dry-run test needed seeded field metadata**
- **Found during:** Task 1
- **Issue:** `tests/espocrm-sync.test.ts` runs the full resource list dry-run against a bare fake; the new fields resource needs `fields.{type}` metadata.
- **Fix:** that one fake is created with `metadata: stockEspoMetadata()`. No assertion changed.
- **Files:** tests/espocrm-sync.test.ts
- **Commit:** 6c565c21

**3. [Scope note] Task 2 config was written before its tests**
Fields/links config was committed together with the invariant tests (the tests are pins on the shipped files, so they pass on first run). The tracer and layouts tasks followed RED then GREEN.

## Notes for later plans

- Field diff excludes `label`, `translatedOptions`, `tooltipText`, `commercial` and all `dynamicLogic*` keys; dynamic logic is sent on create (and on updates triggered by other drift) but never compared. Plan 80-06 should diff it against clientDefs if it needs drift repair.
- A declared `false` equals an absent server value, so specs should not need to list defaults.
- Pitfall 14: the UI needs a hard refresh to show the new Bookings panels; I did not open the CRM UI (no interactive login).
- Replace-mode layouts (CBooking list/listSmall/detail) are restored on every sync; owner tweaks there will be overwritten by design.

## Known Stubs

None.

## Threat Flags

None. The only new surface is admin-only schema writes through the already-planned client. T-80-10 (no field-level readOnly), T-80-12 (isPersonalData) and T-80-13 (append-only stock layouts) are covered by tests.

## Self-Check: PASSED

- 6c565c21, 08b9db18, 92c236be present in `git log`.
- infra/espocrm/entities.json, fields.json, layouts.json and tests/espocrm-model.test.ts present.
