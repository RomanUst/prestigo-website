---
phase: 86-admin-shell
plan: 07
subsystem: ui
tags: [admin, theme, css-custom-properties, erasure, accounts, pricing, vitest]
status: complete

requires:
  - phase: 86-01
    provides: admin-theme.css tokens (--admin-*, --status-*) and the ADM-03 colour guard with per-plan pending ledger
provides:
  - erasure screen (preview callout, destructive confirm, audit table) on danger tokens
  - accounts list/detail, AccountForm and outbox page free of colour literals
  - PricingForm, RoutesTable and NotificationToggles free of colour literals
affects: [86-09, 86-10]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: 74f156d4e6f0a7d926cd13308619ee17f7c8a182

actuals:
  tokens: 2500   # chars/4 over the 13 files changed (small value-only edits)
  tasks: 3
  commits: 3     # measured: git rev-list --count 043b2d1b..HEAD (before this SUMMARY commit)

tech-stack:
  added: []
  patterns:
    - "Destructive actions: solid --admin-danger-solid fill with --admin-on-danger text; warnings on --status-danger-bg/-fg"

key-files:
  created: []
  modified:
    - components/admin/ErasurePreview.tsx
    - components/admin/ErasureConfirmForm.tsx
    - components/admin/ErasureAuditTable.tsx
    - tests/erasure-page.test.tsx
    - "app/(internal)/admin/(dashboard)/accounts/page.tsx"
    - "app/(internal)/admin/(dashboard)/accounts/[id]/page.tsx"
    - components/admin/AccountForm.tsx
    - "app/(internal)/admin/(dashboard)/outbox/page.tsx"
    - components/admin/PricingForm.tsx
    - components/admin/RoutesTable.tsx
    - components/admin/NotificationToggles.tsx
  deleted:
    - tests/fixtures/admin-color-pending/86-07.json

key-decisions:
  - "Legacy var(--copper*) / var(--anthracite*) / var(--warmgrey) references were left in place: 86-01 remaps them per theme and the plan scoped this work to literals"
  - "ErasurePreview 'destructiveOutlined' style also moved to --status-danger-fg (it carried the same red literal)"

requirements-completed: [ADM-03]

coverage:
  - id: D1
    description: "Erasure confirm button is a solid --admin-danger-solid with --admin-on-danger text; checkbox accent, warnings and Failed audit cell use danger tokens"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/erasure-page.test.tsx"
        status: pass
      - kind: unit
        ref: "tests/admin-theme-css.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Accounts, outbox, pricing, routes and notification settings hold no hex/rgba literal"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Screens are visually readable in both themes"
    requirement: ADM-03
    human_judgment: true
    rationale: "Contrast of the danger pair is machine-checked; overall visual adequacy in a browser was not exercised in this worktree"
---

# Phase 86 Plan 07: Erasure, accounts, outbox, pricing and settings on tokens Summary

The ten remaining literal-bearing admin files (erasure, accounts, outbox, pricing, routes, notification toggles) now use only `--admin-*` / `--status-*` tokens, with the GDPR erasure test switched from asserting a red literal to asserting the tokens.

## Accomplishments

- Tracer: erasure screen end to end. `DESTRUCTIVE` is now `var(--admin-danger-solid)` (feeds button background and checkbox accent), confirm text is `--admin-on-danger`, the preview callout uses `--status-danger-bg`/`-fg`, the Failed audit cell uses `--status-danger-fg`. `tests/erasure-page.test.tsx` asserts `toBe('var(--admin-danger-solid)')` and `toBe('var(--status-danger-fg)')`.
- Accounts list add button and AccountForm submit use `--admin-accent` with `--admin-on-accent`; AccountForm fields use `--admin-input-bg` / `--admin-border-strong` / `--admin-text`; the paid chip uses `--status-ok-*`; outbox alert uses `--status-danger-fg`.
- PricingForm saved/error/duplicate-date border, RoutesTable error and NotificationToggles feedback/panel/focus outline moved to tokens (hex fallback removed from the `var()`); no copy, prices or logic changed.
- Ledger `tests/fixtures/admin-color-pending/86-07.json` emptied progressively and deleted.

## Task Commits

1. Task 1 (tracer): `ca1d09fa` feat(86-07): erasure screen on danger tokens
2. Task 2: `58f55cc0` feat(86-07): accounts and outbox screens on theme tokens
3. Task 3: `74f156d4` feat(86-07): pricing and settings widgets on theme tokens

## Verification

- `npx vitest run tests/erasure-page.test.tsx tests/admin-erasure.test.ts tests/outbox-admin-page.test.tsx tests/RoutesTable.test.tsx tests/admin-settings.test.ts tests/admin-pricing.test.ts tests/admin-no-hardcoded-colors.test.ts tests/admin-theme-css.test.ts` all green.
- `npx tsc --noEmit` reports no errors in this plan's files.
- Literal grep over all ten files (comments excluded) prints 0.
- Tracer gate (auto, end-to-end verify re-run): passed before expansion.

## Deviations from Plan

None - plan executed exactly as written. (Minor: the plan's task 2 said AccountForm submit text uses `--admin-on-accent`; the file's initial replacement mapped it to `--admin-text`, corrected before commit.)

## Known Stubs

None.

## Threat Flags

None. T-86-15 mitigated: confirm button on `--admin-danger-solid` / `--admin-on-danger`, enable/disable logic untouched, token asserted by the page test.

## Self-Check: PASSED

Commits ca1d09fa, 58f55cc0, 74f156d4 exist; all ten files token-only; 86-07.json deleted.
