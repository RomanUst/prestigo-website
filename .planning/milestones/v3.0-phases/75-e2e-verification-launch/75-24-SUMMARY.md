---
phase: 75-e2e-verification-launch
plan: 24
subsystem: i18n-layout-qa
status: complete
tags: [gap-closure, overflow, fleet, css, qa-tooling, VER-01]
requires: []
provides:
  - "/fleet maintenance-card text wraps in every locale (GAP-3 / SC #5 / WINDOWS #23)"
  - "overflow_audit.py --pages / --locales filters (default full sweep unchanged)"
affects:
  - "75-30 (production overflow re-run can target /fleet quickly, full sweep default intact)"
tech-stack:
  added: []
  patterns:
    - "Locale-robust wrap: Tailwind v4 arbitrary property [overflow-wrap:anywhere] + hyphens-auto on narrow card text instead of copy edits"
key-files:
  created: []
  modified:
    - "app/[locale]/fleet/page.tsx"
    - "scripts/qa/overflow_audit.py"
    - "tests/fleet-page-render.test.tsx"
    - "tests/__snapshots__/fleet-page-render.test.tsx.snap"
decisions:
  - "GAP-3 fixed with CSS ([overflow-wrap:anywhere] hyphens-auto on the maintenance card h3/p only); ru copy untouched, grid/padding untouched"
  - "overflow_audit.py --pages entries are normalised to a leading '/' so '--pages fleet' and '--pages /fleet' are equivalent"
metrics:
  duration: "~20min (continuation of a rate-limited executor's WIP patch)"
  completed: 2026-09-27
actuals:
  tokens: 21800   # chars/4 over the realized diff (87,213 chars; ~81.9K of it is the single-line EN golden snapshot rewrite, non-snapshot diff = 5,299 chars ≈ 1,300 tokens)
  tasks: 2
  commits: 3
---

# Phase 75 Plan 24: /fleet maintenance-card wrap fix + filterable overflow audit Summary

The /ru/fleet 768px overflow (GAP-3) is fixed by adding `[overflow-wrap:anywhere] hyphens-auto` to the maintenance card `<h3>`/`<p>`. A render test now checks for those classes. `overflow_audit.py` gained opt-in `--pages`/`--locales` filters, and it still sweeps the full 7 x 21 set by default. A local run with a before/after check confirms the fix at every width and locale.

## What was done

### Task 1 (tracer): filterable audit + wrap fix — commit `4f1fc4a9`
- `app/[locale]/fleet/page.tsx`: the maintenance card `<h3>` and `<p>` get `[overflow-wrap:anywhere] hyphens-auto`. Nothing else changed: the grid (`md:grid-cols-3 gap-10`), the card padding (`p-8`), other sections and `content/pages/ru/fleet.json` are all the same (`git diff content/pages/ru/fleet.json` is empty).
- `scripts/qa/overflow_audit.py`: switched to argparse. The positional `base_url` (default `https://rideprestigo.com`) and `width` (default `375`) work exactly as before, and the output file name is still `overflow_<W>.json`. New optional comma lists `--pages` and `--locales` narrow the `PAGES`/`LOCS` loops. Leaving them out gives the same full 7-locale x 21-page sweep (T-75-G11 mitigated: the 75-30 gate cannot shrink by accident).
- Verify: `--help` lists both flags; `grep -c "\[overflow-wrap:anywhere\] hyphens-auto" "app/[locale]/fleet/page.tsx"` = **2**.

### Task 2: regression guard + EN snapshot — commit `6ea99ee3`
- New case `FleetPage — maintenance card text wraps in every locale (VER-01 GAP-3)`: it renders the page and checks that every maintenance `<h3>` (matched by the titles in `content/pages/en/fleet.json`) and its sibling `<p>` have both `[overflow-wrap:anywhere]` and `hyphens-auto` in `className`.
- EN golden snapshot regenerated. I checked the diff character by character (difflib over the one-line snapshot). It contains **only 6 insertions of ` [overflow-wrap:anywhere] hyphens-auto`**, on the 3 h3 + 3 p elements ("Manufacturer-schedule servicing", "Commercial insurance, fully comprehensive", "Daily pre-trip inspection"). Nothing else in the snapshot changed.
- `npx vitest run tests/fleet-page-render.test.tsx` → **12/12 passed**.

## Local overflow proof (pre-deploy; authoritative production re-run is plan 75-30)

- Port 3100 was already taken by another process that returned 500 (not this agent's), so I used `next dev -p 3124` from this worktree.
- Plain first attempt: `/ru/fleet` returned **500**: `@supabase/ssr: Your project's URL and API key are required to create a Supabase client!` (components/Nav.tsx:38). The worktree has no `.env.local`, which the plan expected as a possible environment limit.
- Workaround for the layout check only: restarted with placeholder **public** values `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key` (not secrets, never committed). After that `/ru/fleet` returned **200**.
- `overflow_audit.py http://localhost:3124 768 --pages /fleet --locales ru` → **pages with issues: 0**
- **Before/after check:** I removed the classes temporarily (dev HMR). The same command then showed exactly the reported regression: `p 'Каждый автомобиль обслуживается…' sw/cw 143 131` and `p 'Давление в шинах…' sw/cw 150 131` → pages with issues: 1. I restored the file with `git checkout -- "app/[locale]/fleet/page.tsx"`. So the audit really does detect the bug, and the fix removes it.
- Full /fleet sweep, `--locales en,ru,es,fr,ar,hi,zh`:

| Width | pages with issues |
|-------|-------------------|
| 320   | 0 |
| 375   | 0 |
| 768   | 0 |
| 1024  | 0 |
| 1280  | 0 |

- The dev server was stopped afterwards. I reverted `next-env.d.ts`, which the dev server had rewritten, and did not commit it.

## Full suite (`npx vitest run`)

- Run 1: 7 files failed / 150 passed (2 failed tests, both 5s timeouts). Run 2 (load from parallel agents): more failures, all timeouts or knock-on effects of them (e.g. "Found multiple elements" after a timed-out test's cleanup).
- **Known worktree-only artifact (not fixed, per instructions):** 5 files fail on import with `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'`. They are `tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts` and `tests/profile-actions.test.ts`. None of them touch /fleet.
- **Load-induced flakes, confirmed green in isolation:** running `locale-links-backstop`, `multi-day-page-render`, `routes-hub-render`, `shared-sections-i18n`, `BookingWizard`, `BookingsTable`, `Step5Passenger` and `fleet-page-render` together → **8 files passed, 112 tests passed, 27 todo**.
- So the "full suite exits 0" acceptance item cannot be shown inside this worktree. Every failure is either the known env artifact or a timeout that passes on its own, and none is caused by this plan's changes.

## Deviations from Plan

1. **[Rule 3 - Blocking] Dev-server port and env.** Port 3100 was in use by a foreign process, so I used 3124. The Supabase public env was missing in the worktree, so I set placeholder public env vars for the local layout check (no secrets, nothing committed). The plan's environment-limited fallback was not needed.
2. **[Rule 2 - Robustness] `--pages` normalisation.** Entries without a leading `/` get one added, so `--pages fleet` does not build a broken URL. Commit `4f1fc4a9`.
3. **Head start reused.** The rate-limited executor's WIP patch (page, audit script, test, snapshot) was applied, reviewed against every acceptance criterion (snapshot diff checked character by character) and committed after verification.

## Known Stubs

None.

## Threat Flags

None. The changes are presentation-only CSS classes plus opt-in QA-script flags, and the defaults are unchanged.

## Self-Check: PASSED

- FOUND: app/[locale]/fleet/page.tsx (2 matches of the wrap classes)
- FOUND: scripts/qa/overflow_audit.py (--pages/--locales in --help)
- FOUND: tests/fleet-page-render.test.tsx, tests/__snapshots__/fleet-page-render.test.tsx.snap
- FOUND commits: 4f1fc4a9, 6ea99ee3
