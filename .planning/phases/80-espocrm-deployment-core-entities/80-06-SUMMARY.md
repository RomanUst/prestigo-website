---
phase: 80-espocrm-deployment-core-entities
plan: 06
subsystem: infra
tags: [espocrm, config-as-code, account, partner-rates, commercial-fields, dynamic-logic]
status: complete
requirements: [CRM-01]
requires: ["80-04", "80-05"]
provides:
  - "Live custom entity CPartnerRate (name=Route, vehicleClass, price EUR, validFrom, validTo, note, required account) linked to Account as cPartnerRates"
  - "Live Account fields cOtherTypeNote, cCommissionPercent, cPaymentTerms, cInvoiceDueDays, cVatId, cReverseCharge, cContractDate, cContractValidUntil, cContractFile, cExpectedRidesPerMonth"
  - "fields.json Account section: 9 of 10 entries tagged commercial:true (list consumed by plan 80-07 for the Dispatcher field ACL)"
  - "Account detail 'Partner terms' panel (append) and Account 'Partner rates' bottom panel"
  - "tests/helpers/fake-espocrm.ts: date, float, int, bool, file, text, link field types"
affects: [80-07, 80-08, 80-09]
tech-stack:
  added: []
  patterns: ["custom label via layout customLabel when the built-in field label cannot be seeded (create-only labels)", "link field required flag applied through the field-manager PUT on the link-created field"]
key-files:
  created: []
  modified:
    - infra/espocrm/entities.json
    - infra/espocrm/fields.json
    - infra/espocrm/layouts.json
    - tests/espocrm-model.test.ts
    - tests/helpers/fake-espocrm.ts
decisions:
  - "sync.mjs needed no change: it already strips the local-only commercial key (LOCAL_FIELD_KEYS), passes dynamicLogicVisible on create and accepts date.afterOrEqual"
  - "validTo carries afterOrEqual: validFrom; the live date type lists afterOrEqual among its params, so the plan fallback (drop the param) was not needed"
  - "Route label for the built-in name field is carried by layout customLabel (list, listSmall, detail); field labels are create-only in the sync and name is never created, so a fields.json label could not be applied"
  - "Partner rates panel is a bottomPanelsDetail key (cPartnerRates, index 5.6, right after cBookings 5.5), not a relationships layout entry (80-05 finding)"
metrics:
  duration: ~30min
  completed: 2026-10-13
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
plan_head_before: b19e17503d9c81268c8457bbcbe63d8c4244e1da
plan_head_after: 7d634bbf43722e8021bc29d36077c95507cb5336
---

# Phase 80 Plan 06: Account commercial terms and partner rates Summary

Accounts now carry the D-03 commercial terms and the D-04 negotiated per-client rates, both applied from git by the existing sync resources; a repeat full live sync is a no-op on every resource (`fields unchanged=31`, `layouts unchanged=9`, summary `create=0 update=0 removed=0`).

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (tracer) | CPartnerRate entity, link, fields, layouts, Account Partner rates panel, live | aef50b01 |
| 2 | Account D-03 commercial fields, dynamic logic, Partner terms panel, live | 7d634bbf |

Tracer gate: no human checkpoint needed (automated-only verify, default end-of-phase mode). Vitest and a repeat live run both passed after the tracer commit and before Task 2.

## Live outcome (counts and structure only)

- Entity CPartnerRate created; link CPartnerRate.account -> Account (Account side `cPartnerRates`, hasMany, foreign `account`).
- CPartnerRate fields created: vehicleClass (enum, stored business / first_class / business_van = CBooking values, required), price (currency, onlyDefaultCurrency, required), validFrom, validTo (afterOrEqual validFrom), note (text). The link field `account` was updated to required (1 update).
- Account fields created (10): all as `c`-prefixed custom fields of the types in the plan table. Verified live: cOtherTypeNote is `logicDefs...visible = type equals Other`; cInvoiceDueDays is `visible = cPaymentTerms equals Invoice`.
- Layouts: CPartnerRate list, listSmall, detail (replace); Account `bottomPanelsDetail` gained `cPartnerRates` next to `cBookings` (Overview/Details panels and all stock bottom panels untouched); Account `detail` gained the "Partner terms" panel after "Overview" and "Details".
- Runs: first real run (task 1) `create=7 update=5`, task 2 run `create=10 update=1`, repeat full run `create=0 update=0 removed=0` on settings, entities (2), links (3), fields (31), enums (2), layouts (9).
- The "Restore Drill Canary" Account was not touched (no record reads or writes by this plan).

## Owner note (RESEARCH Pitfall 14)

Hard-refresh the CRM tab (Ctrl/Cmd+Shift+R) after this sync; the new Account fields, dynamic logic and panels are cached client-side until the metadata cache reloads. Open an Account: "Partner terms" is the third panel, "Partner rates" is in the Account tab of the bottom panels next to "Bookings". The Route column of Partner rates is the built-in Name field relabelled in the layouts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relationship panel goes into bottomPanelsDetail, not `relationships`**
- **Found during:** Task 1 (inherited note from 80-04/80-05)
- **Issue:** the plan says to append to the Account `relationships` layout; relationship panels live in `bottomPanelsDetail`.
- **Fix:** added `cPartnerRates: { index: 5.6 }` to the existing Account `bottomPanelsDetail` append entry. The 80-04 test "five entries" was rewritten to a content-based check, and the 80-04 count assertions were updated (entities 2, links 3, fields 30 created + 1 update).
- **Files modified:** infra/espocrm/layouts.json, tests/espocrm-model.test.ts
- **Commit:** aef50b01

**2. [Rule 2 - Missing critical] Route label via layout customLabel**
- **Issue:** plan says "name (built-in; label 'Route')", but field labels are create-only in the sync and built-in `name` is never created, so no fields.json entry can deliver the label.
- **Fix:** `customLabel: "Route"` on the name cell in the three CPartnerRate layouts (replace mode, fully ours). The field's own label stays "Name" in filters and search.
- **Commit:** aef50b01

**3. [Rule 3 - Blocking] Fake EspoCRM lacked the field types needed**
- Added date, float, int, bool, file, text and link to `stockEspoMetadata()` using params read from the live instance (read-only probe). Wave 4 follows the last wave that edited the helper (80-05, wave 3).
- **Commit:** aef50b01

No change to sync.mjs was necessary.

## Known Stubs

None.

## Threat Flags

None. No new network surface: only the existing admin-identity field-manager, entity-manager and layout calls. T-80-16 stays accepted (admin plus two service users only until 80-07). T-80-17 mitigated: a test scans app/, components/ and lib/ and fails if any file mentions PartnerRate/partnerRates; PartnerRate is CRM reference data only.

## Self-Check: PASSED

- infra/espocrm/entities.json, fields.json, layouts.json, tests/espocrm-model.test.ts, tests/helpers/fake-espocrm.ts modified and committed; commits aef50b01 and 7d634bbf exist
- `npx vitest run tests/espocrm-model.test.ts tests/espocrm-enums.test.ts tests/espocrm-sync.test.ts`: 110 passed; eslint clean on changed files; no tsc errors in espocrm files
- acceptance check (10 Account entries, 9 commercial:true) exits 0; repeat live full sync create=0 update=0 everywhere
