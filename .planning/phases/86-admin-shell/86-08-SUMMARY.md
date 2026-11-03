---
phase: 86-admin-shell
plan: 08
subsystem: ui
tags: [admin, theme, css, light-theme, safety-net, colour-guard, vitest]
status: complete

requires:
  - phase: 86-01
    provides: admin-theme.css tokens and the ADM-03 colour guard
  - phase: 86-02..86-07
    provides: converted admin components (each deleted its own pending-ledger file)
provides:
  - light-only safety net neutralising inline uppercase and weight-300 styles in both style serialisations
  - light headings, wizard .btn-* buttons, shared .label, flat tables
  - sticky modal action rows in both themes
  - colour guard with an empty LEGACY_PENDING (D-04 closeout)
affects: [86-09, 86-10, 86-12, 86-13]

plan_head_before: 9bf6cf45e1dbb6f56925e6a1d8d5a9f36d191018
plan_head_after: 14b693668e5fc836f215fd425f9a6b057655c3ca

actuals:
  tokens: 6500   # chars/4 over the 5 files changed (CSS rules + test code)
  tasks: 3
  commits: 4     # measured: git rev-list --count 9bf6cf45..HEAD (before this SUMMARY commit); 3 tasks + 1 orchestrator-requested Firefox fix

tech-stack:
  added: []
  patterns:
    - "Inline-style overrides via [style*=...] attribute selectors listed in twin spellings (React SSR no-space, DOM with-space), proven by a render test"
    - "One selector per rule when a pseudo-element is browser-specific (Firefox drops a whole selector list on an unknown pseudo)"

key-files:
  created:
    - tests/admin-light-safety-net.test.tsx
  modified:
    - "app/(internal)/admin/admin-theme.css"
    - tests/admin-theme-css.test.ts
    - tests/admin-no-hardcoded-colors.test.ts
  deleted: []

key-decisions:
  - "Split html:has(...)::-webkit-scrollbar-track into its own rule: Firefox drops the whole list otherwise (navy overscroll). Exactly two edge rules now, both gated on the light wrapper."
  - "Modal sticky selector uses :last-child:not(:only-child) plus :only-child > :last-child:not(:only-child) so single-wrapper forms (AccountForm, DriverForm, MarkSharedForm) get a sticky action row instead of a sticky wrapper."
  - "Guard has no ledger fallback: LEGACY_PENDING is a typed empty constant, and a test asserts tests/fixtures/admin-color-pending stays absent."

patterns-established:
  - "Light-only structural overrides live in admin-theme.css under .admin-shell[data-admin-theme=light]; dark gets none"

requirements-completed: [ADM-02, ADM-03]

duration: 25min
completed: 2026-11-02
---

# Phase 86 Plan 08: Light structure and colour guard closeout Summary

Light theme gets its Notion-like structure in CSS (sentence-case safety net for both inline-style serialisations, calm headings, flat tables, sentence-case wizard buttons, sticky modal actions), and the colour guard now runs with zero allowed literals.

## What was built

1. **Tracer (f6bc8de6).** `tests/admin-light-safety-net.test.tsx` renders `labelStyle` / `inputBaseStyle` through `renderToString` (yields `text-transform:uppercase`, `font-weight:300`) and a jsdom element (yields the spaced forms), then asserts `admin-theme.css` has a light-scoped `[style*=...]` selector for each exact substring, in twins, never on dark. CSS: `text-transform: none !important; letter-spacing: normal !important` and `font-weight: 400 !important`.
2. **Firefox fix (fe30918e, orchestrator note 2).** The OQ2 edge rule is now two rules (html/body, and `html:has(...)::-webkit-scrollbar-track`), both gated on `:has(.admin-shell[data-admin-theme="light"])`. `tests/admin-theme-css.test.ts` asserts exactly two edge rules and that the pseudo-element selector is alone in its rule.
3. **Light structure (a63e8267).** Light h1/h2/h3 in `.admin-main` and `#modal-title`: normal tracking, weight 500. `.btn-primary/.btn-ghost/.btn-secondary` inside the light admin: sentence case, no tracking, `--admin-radius-md`, weight 500. Shared public `.label` neutralised in light (orchestrator note 3, from 86-04's AddressInput). Flat tables: collapse, 12px/500 muted headers with a 1px `--admin-border` underline, 1px row separators, `--admin-hover` row hover, borderless/unradiused `div:has(> table)` wrapper. Modal action rows sticky in both themes.
4. **Guard closeout (14b69366).** Ledger loading, `PendingEntry`, stale-entry and cross-ledger tests removed. `LEGACY_PENDING` is `readonly string[] = []` asserted `toHaveLength(0)`; a test asserts `tests/fixtures/admin-color-pending` does not exist (the directory was already gone: 86-02..86-07 each deleted their own file, so there was nothing left to delete). Fail-first probe re-run: a `#123456` literal in `components/admin/GuardProbe.tsx` made the suite exit 1; probe removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, orchestrator-directed] Modal sticky selector extended for single-wrapper forms**
- **Found during:** Task 2 (read-only check of the five Modal consumer forms)
- **Issue:** AccountForm, DriverForm and MarkSharedForm wrap all content in one `<div>`, so `form > :last-child` is the whole wrapper, not the action row. Sticky on the wrapper does nothing useful and adds a stray 16px top padding.
- **Fix:** Rule selector list is `form > :last-child:not(:only-child)` plus `form > :only-child > :last-child:not(:only-child)`. ErasureConfirmForm and SplitContactForm (action row is the direct last child) match the first; the three wrapper forms match the second. No consumer file edited.
- **Files modified:** `app/(internal)/admin/admin-theme.css`, `tests/admin-theme-css.test.ts`
- **Commit:** a63e8267

**2. [Orchestrator note] Firefox edge-rule split and `.label` neutraliser** added as described above (commits fe30918e, a63e8267). The edge-rule test changed from "exactly one" to exactly two, as directed.

Otherwise the plan executed as written.

## Notes for other plans

- Consumer forms whose last child is NOT the action row: AccountForm, DriverForm, MarkSharedForm (handled by the second selector, above). ErasureConfirmForm ends with the action row but an error alert sits just before it; this is fine.
- `scripts/qa/admin-caps-scan.mjs` residual hits belong to 86-09/86-10/86-12, not this plan.

## Verification

- `npx vitest run tests/admin-theme-css.test.ts tests/admin-light-safety-net.test.tsx tests/admin-no-hardcoded-colors.test.ts` plus the six golden snapshot tests (book, fleet, route, routes-hub, multi-day, nav-locale-render-parity): all green, no snapshot written or obsolete.
- `app/globals.css` and `tests/__snapshots__` untouched.
- Probe literal in `components/admin` fails the guard (exit 1); `tests/fixtures/admin-color-pending` absent; `eslint --quiet` clean on the three test files.

## Known Stubs

None.

## Threat Flags

None. T-86-16 (scoping) held: every new selector starts with `.admin-shell`, 86-01 scoping assertion still passes. T-86-17 (guard weakening): LEGACY_PENDING empty, ledger dir asserted absent, probe re-run.

## Self-Check: PASSED

- tests/admin-light-safety-net.test.tsx: FOUND
- commits f6bc8de6, fe30918e, a63e8267, 14b69366: FOUND
