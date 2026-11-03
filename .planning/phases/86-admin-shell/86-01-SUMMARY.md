---
phase: 86-admin-shell
plan: 01
subsystem: ui
tags: [admin, theme, css-custom-properties, cookies, next-app-router, vitest, wcag]
status: complete

requires:
  - phase: 85
    provides: existing admin screens that carry ~900 var(--anthracite*) references and 271 colour literals
provides:
  - cookie-driven themed wrapper div.admin-shell around every /admin route (login included)
  - lib/admin-shell-prefs.ts cookie contract (parsers, serialisers, defaults)
  - AdminShell client wrapper and useAdminShell() context (toggleTheme, toggleSidebar) with a provider-less default
  - admin-theme.css with every --admin-* / --status-* token for light and dark, light legacy remap, OQ2 edge rule
  - ADM-03 colour guard test with a per-plan pending ledger (34 files)
  - D-10 capital-label scanner scripts/qa/admin-caps-scan.mjs
affects: [86-02, 86-03, 86-04, 86-05, 86-06, 86-07, 86-08, 86-09, 86-10, 86-11, 86-12, 86-13]

plan_head_before: d88e2e5d9e3cdd1311ad82f4f8492e9a573210f3
plan_head_after: 943a54079f6e8400948ac608703c5a16a6acb26d

actuals:
  tokens: 12500   # chars/4 over the 18 files changed (50074 bytes)
  tasks: 3
  commits: 3      # measured: git rev-list --count d88e2e5d..HEAD

tech-stack:
  added: []
  patterns:
    - "Theme state as data attributes on one scoped wrapper (.admin-shell), never on html/body"
    - "Strict-equality cookie parsers that map user input onto a two-value union"
    - "Ratcheting guard test: per-plan JSON ledger that each conversion plan empties"

key-files:
  created:
    - lib/admin-shell-prefs.ts
    - components/admin/AdminShell.tsx
    - "app/(internal)/admin/layout.tsx"
    - "app/(internal)/admin/admin-theme.css"
    - tests/admin-shell-prefs.test.ts
    - tests/admin-shell-layout.test.tsx
    - tests/admin-theme-css.test.ts
    - tests/admin-no-hardcoded-colors.test.ts
    - tests/fixtures/admin-color-pending/86-02.json
    - tests/fixtures/admin-color-pending/86-03.json
    - tests/fixtures/admin-color-pending/86-04.json
    - tests/fixtures/admin-color-pending/86-05.json
    - tests/fixtures/admin-color-pending/86-06.json
    - tests/fixtures/admin-color-pending/86-07.json
    - scripts/qa/admin-caps-scan.mjs
  modified: []

key-decisions:
  - "Followed the plan's single OQ2 rule literally (html:has, body:has and the root scrollbar track in one selector list); see Known Limitations for the Firefox consequence"
  - "--admin-sidebar-w and the rail/main CSS were left to plan 86-02, which owns the sidebar; this plan declares only the token vocabulary the plan listed"
  - "Ledger lives in tests/fixtures/admin-color-pending/86-0N.json, one file per owning plan, so Wave 2 plans never edit the same file"

patterns-established:
  - "Every admin CSS selector starts with .admin-shell; tests/admin-theme-css.test.ts enforces it"
  - "New admin code references only var(--admin-*) / var(--status-*); tests/admin-no-hardcoded-colors.test.ts enforces it"

requirements-completed: [ADM-01, ADM-02, ADM-03]

coverage:
  - id: D1
    description: "Cookie admin_theme / admin_sidebar drives data-admin-theme / data-admin-sidebar on a single div.admin-shell rendered by app/(internal)/admin/layout.tsx; invalid or hostile values fall back to light / expanded"
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/admin-shell-prefs.test.ts"
        status: pass
      - kind: unit
        ref: "tests/admin-shell-layout.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "/admin/login renders inside the same wrapper and follows admin_theme"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/admin-shell-layout.test.tsx#renders the real login page inside the dark wrapper (D-18)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Complete token sheet for both themes with identical name sets, light legacy remap, OQ2 edge rule and WCAG contrast of the documented pairs"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-theme-css.test.ts"
        status: pass
      - kind: integration
        ref: "tests/book-page-render.test.tsx, fleet-page-render, route-page-render, routes-hub-render, multi-day-page-render, nav-locale-render-parity (golden snapshots, no writes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Colour guard fails on any literal outside the ledger; probe file proved it bites; capital-label scanner lists typed capitals"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts"
        status: pass
      - kind: other
        ref: "node scripts/qa/admin-caps-scan.mjs components/admin/KPICard.tsx (exit 0); OutboxTable.tsx (LAST ERROR, exit 1); stats/OverviewTab.tsx (MONTHLY REVENUE)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual result of the light and dark themes in a real browser (cream/ink/gold look, first paint without flash)"
    verification: []
    human_judgment: true
    rationale: "Admin sign-in is impossible on localhost (fail-closed Upstash limiter); only /admin/login is reachable locally and nothing in this plan restyles authenticated screens yet. Owner UAT on production at phase closeout."

duration: 9min
completed: 2026-11-02
---

# Phase 86 Plan 01: Theme foundation, token sheet and colour guard Summary

**Cookie-driven `div.admin-shell` wrapper around every /admin route, a two-theme `--admin-*` / `--status-*` token sheet with WCAG-checked contrast, and an ADM-03 colour guard whose 34-file pending ledger each Wave 2 plan shrinks to empty.**

## Performance

- **Duration:** about 9 minutes
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 15 created, 0 modified (3 production files, 1 stylesheet, 4 tests, 6 ledger files, 1 script)

## Accomplishments

- Tracer proven end to end: `admin_theme` cookie to `parseAdminTheme` to `AdminRootLayout` to `AdminShell` to CSS tokens, with the real `AdminLoginPage` rendering inside the wrapper (light by default, dark with the cookie). Tracer verify re-run green before expansion.
- `lib/admin-shell-prefs.ts` gives later plans a fixed contract: `ADMIN_THEME_COOKIE`, `ADMIN_SIDEBAR_COOKIE`, `AdminTheme`, `AdminSidebarState`, `DEFAULT_*`, `parseAdminTheme`, `parseAdminSidebar`, `serializeThemeCookie`, `serializeSidebarCookie`. Parsers use strict equality only, so `"DARK"`, `" dark"`, `dark; Path=/` and `"><img src=x>` all fall back (T-86-01).
- `AdminShell` seeds state once from the server props (a `router.refresh()` cannot reset a toggle), writes the cookie inside a swallowed try/catch (a blocked write loses persistence only), renders no inline style (containing-block pitfall) and has a provider-less default so a bare `AdminSidebar` in tests keeps working.
- `admin-theme.css` declares 64 `--admin-*` / `--status-*` tokens per theme with identical name sets, 8 status families x fg/bg/border, the light legacy remap (8 bare vars, 8 `--color-*` twins, `--font-cormorant`) and the single OQ2 html/body rule. `.theme-light` and `app/globals.css` are untouched.
- `tests/admin-theme-css.test.ts` (21 tests): scoping, parity, completeness against TSX var references, legacy remap, status families, adjacency, containing-block properties, no gm-style selectors, `.theme-light` unchanged, and WCAG contrast for every listed pair in both themes with an assertion that no pair is skipped. A mutation check (muted text set to `#999999`, one status token removed) made three tests fail, then the file was restored.
- `tests/admin-no-hardcoded-colors.test.ts` (28 tests) with `SCOPE_FLOOR`, regex self-tests, sorted `file:line literal -> token` reports, stale-entry detection and a ledger of exactly the 34 files / 271 literals the research measured. A throwaway `GuardProbe.tsx` containing `'#123456'` failed the suite, then was deleted.
- `scripts/qa/admin-caps-scan.mjs` lists capital-typed labels (152 hits on today's tree, exit 1 as expected); `KPICard.tsx` exits 0, `OutboxTable.tsx` lists `LAST ERROR`, `stats/OverviewTab.tsx` lists `MONTHLY REVENUE`.

## Task Commits

1. **Task 1 (tracer): cookie-driven admin theme wrapper** - `7a1bfdec` (feat)
2. **Task 2: admin token sheet for both themes** - `0654630d` (feat)
3. **Task 3: colour guard, pending ledger, capital-label scanner** - `943a5407` (test)

## Verification Results

- `npx vitest run tests/admin-shell-prefs.test.ts tests/admin-shell-layout.test.tsx tests/admin-theme-css.test.ts tests/admin-no-hardcoded-colors.test.ts tests/AdminSidebar.test.tsx`: 5 files, 84 tests passed.
- Six golden snapshot tests plus `admin-theme-css`: 7 files, 81 tests passed, zero snapshot writes; `git diff` of `tests/__snapshots__` and `app/globals.css` against the merge base is empty.
- `git diff` of `app/(internal)/layout.tsx`, `components/SiteChrome.tsx`, `middleware.ts`, `app/globals.css`, `login/actions.ts` against the merge base is empty (D-02, T-86-03).
- Scoped `tsc --noEmit` has no errors in the new files; `eslint --quiet` is clean on all new TS/TSX/mjs files.
- Acceptance greps: `import './admin-theme.css'` x1, `await cookies()` x1, auth/redirect grep on layout + AdminShell = 0, ledger = `6 34`, `--status-violet-border` x2, `--font-cormorant: var(--admin-font-heading)` x1.

## Deviations from Plan

None - plan executed exactly as written.

Environment notes (not plan deviations):
- The per-plan commit ledger (`plan_head_before`) normally lives in the worktree git dir. The sandbox refused a shell command naming that path, so the base SHA `d88e2e5d9e3cdd1311ad82f4f8492e9a573210f3` (the spawn-time HEAD, asserted at start) was kept in the session scratchpad instead. `commits: 3` above is measured from that base.
- `node_modules` is a symlink to the main checkout's and is ignored by `.gitignore`; it was not committed.

## Known Limitations

- **OQ2 rule and Firefox.** The plan requires one rule whose selector list includes `html:has(...)::-webkit-scrollbar-track`. Firefox does not know that pseudo-element, and an unknown pseudo-element invalidates the whole selector list, so in Firefox the cream html/body background and the scrollbar track would stay navy (overscroll area only; in-page colours come from `.admin-shell`). Chromium and Safari are unaffected. If Firefox matters to the owner, split the scrollbar selector into its own rule and relax the "exactly one edge rule" assertion to "two".
- The light safety-net rules (`[style*="text-transform:uppercase"]` and the weight-300 twin) are not part of this plan; plan 86-08 owns them.

## Known Stubs

None. No placeholder text or empty data sources were introduced.

## Threat Flags

None. The only new trust-boundary input is the two preference cookies, already covered by T-86-01; the layout and wrapper contain no auth, Supabase or redirect code.

## Next Phase Readiness

Wave 2 can start. Plans 86-02 through 86-07 each delete their own `tests/fixtures/admin-color-pending/86-0N.json` entries as they convert files; plan 86-02 additionally owns `--admin-sidebar-w`, the rail and main-offset CSS, and the toggle UI that consumes `useAdminShell()`. The completeness test already scans `components/admin` and `app/(internal)/admin`, so any `var(--admin-*)` a later plan references must be added to both theme rules.

## Self-Check: PASSED

- All 15 created files present on disk (checked with `ls`/`git status`).
- Commits `7a1bfdec`, `0654630d`, `943a5407` exist in `git log d88e2e5d..HEAD`.
- STATE.md and ROADMAP.md not modified.
