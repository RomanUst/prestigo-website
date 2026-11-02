---
phase: 86-admin-shell
plan: 10
subsystem: ui
tags: [admin, theme, sentence-case, d-10, identities, erasure, accounts, pricing, vitest]
status: complete

requires:
  - phase: 86-01
    provides: admin-caps-scan.mjs scanner and the light-theme text-transform safety net
  - phase: 86-07
    provides: colour conversion of erasure, accounts, pricing, routes and notification files (D-03 order)
provides:
  - sentence-case display labels in 12 admin source files (identities, erasure, accounts, pricing, routes, notification settings)
  - scanner exit 0 on all 13 files of the plan
affects: [86-08, 86-09, 86-12, 86-13]

plan_head_before: 9bf6cf45e1dbb6f56925e6a1d8d5a9f36d191018
plan_head_after: eca81ad723acd61add9923bb0c99211aee78f048

actuals:
  tokens: 1500   # chars/4 over the 8 files changed (case-only edits, 32 lines)
  tasks: 3
  commits: 3     # measured: git rev-list --count 9bf6cf45..HEAD (before this SUMMARY commit)

tech-stack:
  added: []
  patterns:
    - "D-10 source edit: label typed in sentence case; the element's own inline textTransform 'uppercase' keeps dark capitals, the 86-01 light safety net strips it in light"

key-files:
  created: []
  modified:
    - components/admin/SharedNumbersTable.tsx
    - components/admin/MergedByPhoneTable.tsx
    - tests/identities-page.test.tsx
    - components/admin/ErasureAuditTable.tsx
    - "app/(internal)/admin/(dashboard)/accounts/page.tsx"
    - "app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx"
    - tests/erasure-page.test.tsx
    - components/admin/PricingForm.tsx
    - components/admin/RoutesTable.tsx
    - components/admin/NotificationToggles.tsx

key-decisions:
  - "No new textTransform was needed: every converted label already sat on an element (or shared style object) with inline textTransform 'uppercase', so dark renders exactly the same capitals"
  - "SplitContactForm, MarkSharedForm, ErasureConfirmForm, ErasureSearch and AccountForm held no capital-typed display strings (scanner clean before and after); left untouched. VAT ID stays via the scanner allowlist"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "Identities, erasure, accounts, pricing, routes and notification-settings labels are typed in sentence case; inline uppercase keeps dark capitals"
    requirement: ADM-03
    verification:
      - kind: other
        ref: "node scripts/qa/admin-caps-scan.mjs <all 13 plan files> (exit 0)"
        status: pass
      - kind: unit
        ref: "tests/identities-page.test.tsx, tests/erasure-page.test.tsx, tests/admin-erasure.test.ts, tests/RoutesTable.test.tsx, tests/admin-settings.test.ts, tests/admin-pricing.test.ts, tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Light and dark rendering of the converted labels in a browser"
    human_judgment: true
    rationale: "Not exercised in this worktree (admin sign-in is not possible on localhost); the 86-08 light safety-net check and owner UAT cover the visual result"

duration: 6min
completed: 2026-11-02
---

# Phase 86 Plan 10: Sentence-case labels for records and settings screens Summary

**Case-only D-10 edits across identities, erasure, accounts, pricing, routes and notification settings: labels are typed in sentence case and rely on the elements' existing inline `textTransform: 'uppercase'` for dark capitals, with the scanner clean on all 13 plan files.**

## Accomplishments

- Tracer (identities): the two table column arrays converted; the identities page test updated.
- Erasure and accounts: audit table, accounts list and account-detail headers converted.
- Pricing, routes and settings: 15 PricingForm labels, the RoutesTable toggle and the NotificationToggles heading converted.
- No price, suffix, key or numeric value changed; no euro amount appears in the diff.

## Changes (before -> after)

| File | Before | After |
|------|--------|-------|
| SharedNumbersTable.tsx COLUMNS | PHONE, HOW, EMAILS, NOTE, MARKED | Phone, How, Emails, Note, Marked |
| MergedByPhoneTable.tsx COLUMNS | CONTACT, MERGED EMAIL, PHONE, BOOKINGS, MERGED | Contact, Merged email, Phone, Bookings, Merged |
| ErasureAuditTable.tsx COLUMNS | REQUESTED, REFERENCE, STATUS, SITE, CHATWOOT, ESPOCRM, VERIFIED, COMPLETED | Requested, Reference, Status, Site, Chatwoot, EspoCRM, Verified, Completed |
| accounts/page.tsx headers | ACCOUNT, TYPE, EMAIL, REG / IČO, TRIPS, REVENUE | Account, Type, Email, Reg / IČO, Trips, Revenue |
| accounts/[id]/page.tsx headers | REF, PICKUP, ROUTE, VEHICLE, AMOUNT, STATUS | Ref, Pickup, Route, Vehicle, Amount, Status |
| PricingForm.tsx GLOBALS_FIELDS | AIRPORT FEE, NIGHT COEFFICIENT, HOLIDAY COEFFICIENT, CHILD SEAT, EXTRA LUGGAGE, ROUND TRIP DISCOUNT | Airport fee, Night coefficient, Holiday coefficient, Child seat, Extra luggage, Round trip discount |
| PricingForm.tsx header labels | RATE / KM, HOURLY RATE, DAILY RATE, MIN FARE, HOURLY HIRE, HOLIDAY DATES | Rate / km, Hourly rate, Daily rate, Min fare, Hourly hire, Holiday dates |
| PricingForm.tsx other | MINIMUM HOURS, MAXIMUM HOURS, SAVE PRICING | Minimum hours, Maximum hours, Save pricing |
| RoutesTable.tsx toggle | INTERCITY ROUTES | Intercity routes |
| NotificationToggles.tsx heading | NOTIFICATION TYPES | Notification types |

Tests updated: `tests/identities-page.test.tsx` (column header list), `tests/erasure-page.test.tsx` (column header list; see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Erasure polling test became ambiguous after the header rename**
- **Found during:** Task 2
- **Issue:** `screen.getByText('Completed')` in the "polling" test matched both the new `Completed` column header and the status badge (case-sensitive match used to tell them apart).
- **Fix:** scoped the query to the first data row: `within(screen.getAllByRole('row')[1]).getByText('Completed')`. Test intent unchanged.
- **Files modified:** tests/erasure-page.test.tsx
- **Commit:** f417bc70

**Total deviations:** 1 auto-fixed (test query scope). **Impact:** none on product code.

Other notes: SplitContactForm, MarkSharedForm, ErasureConfirmForm, ErasureSearch and AccountForm had no capital-typed display strings, so they needed no edit. No `// caps-ok` markers were added. Colour-guard pending ledger is already gone (wave-2 plans emptied it), so that plan step did not apply.

## Verification

- `npx vitest run tests/identities-page.test.tsx tests/admin-no-hardcoded-colors.test.ts`: 52 passed
- `npx vitest run tests/erasure-page.test.tsx tests/admin-erasure.test.ts tests/admin-no-hardcoded-colors.test.ts`: 98 passed
- `npx vitest run tests/RoutesTable.test.tsx tests/admin-settings.test.ts tests/admin-pricing.test.ts tests/admin-no-hardcoded-colors.test.ts`: 64 passed
- `node scripts/qa/admin-caps-scan.mjs` over all 13 plan files: exit 0
- `npx tsc --noEmit` filtered to the plan's files: no errors
- Acceptance greps: `'Merged email'` count 1, `'EspoCRM'` count 1, `'Airport fee'` count 1
- No ERR_MODULE_NOT_FOUND through the node_modules symlink; no tests needed a main-checkout re-run.

## Known Stubs

None.

## Threat Flags

None. T-86-19 mitigated: edits are case-only (words unchanged, listed above); price values, suffixes and keys untouched; erasure, routes, pricing and settings tests green.

## Self-Check: PASSED

Modified files exist; commits 5abe2080, f417bc70, eca81ad7 present on the branch.
