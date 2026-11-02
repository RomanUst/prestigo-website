---
phase: 86-admin-shell
plan: 02
subsystem: ui
tags: [admin, sidebar, icon-rail, theme-toggle, keyboard-shortcut, tooltip, login, css-custom-properties, vitest]
status: complete

requires:
  - phase: 86-01
    provides: "AdminShell + useAdminShell(), admin_theme / admin_sidebar cookies, admin-theme.css token sheet, colour guard with per-plan ledger"
provides:
  - "Collapsible desktop sidebar: 280px expanded, 72px icon rail, single --admin-sidebar-w driving aside width and main margin"
  - "Rail tooltips (fixed, 300ms hover delay, immediate on focus), theme toggle, Ctrl/Cmd+backslash shortcut"
  - "main.admin-main in the (dashboard) layout; auth redirects unchanged"
  - "Light Notion-style sidebar and unchanged dark look, all from tokens"
  - "/admin/login on admin tokens only"
affects: [86-03, 86-04, 86-05, 86-06, 86-07, 86-08]

plan_head_before: 043b2d1bc9377767de2c8bc4c3c36e8077470d54
plan_head_after: ad407c1780358acbebe8900508eb363d1c49c2c0

actuals:
  tokens: 14000   # chars/4 over the files changed (about 56 KB)
  tasks: 3
  commits: 3      # measured: git rev-list --count 043b2d1b..HEAD before the SUMMARY commit

tech-stack:
  added: []
  patterns:
    - "Layout geometry in CSS keyed on data attributes; one custom property (--admin-sidebar-w) shared by aside and main"
    - "Every collapsed-state selector gated behind @media (min-width: 768px) so a cookie never produces a rail on a phone"
    - "Fixed-position rail tooltip rendered once from component state, checked at event time (no hydration mismatch)"

key-files:
  created:
    - tests/admin-dashboard-layout.test.tsx
  modified:
    - components/admin/AdminSidebar.tsx
    - "app/(internal)/admin/(dashboard)/layout.tsx"
    - "app/(internal)/admin/login/page.tsx"
    - "app/(internal)/admin/admin-theme.css"
    - tests/AdminSidebar.test.tsx
    - tests/admin-theme-css.test.ts
  deleted:
    - tests/fixtures/admin-color-pending/86-02.json

key-decisions:
  - "Aside is pinned top: 0 and bottom: 0 instead of min-height: 100vh, so the nav list really scrolls on short viewports while the footer stays in view (the plan's min-height alone would let the aside grow past the viewport)"
  - "No native title attribute on the collapse button (UI-SPEC forbids it); the shortcut hint appears only in the custom rail tooltip"
  - "Dark theme also gets the hover fill on nav items (UI-SPEC lists hover as a shared contract); the 3px left bar stays dark-only"

patterns-established:
  - "New shell classes: admin-main, admin-aside, admin-sidebar-header, admin-wordmark, admin-sublabel, admin-nav, admin-nav-item, admin-nav-icon, admin-nav-label, admin-sidebar-footer, admin-icon-btn, admin-collapse-btn, admin-signout-btn, admin-rail-tooltip(-hint), admin-hamburger, admin-backdrop"

requirements-completed: [ADM-01, ADM-02, ADM-03]

coverage:
  - id: D1
    description: "Operator collapses the sidebar to a 72px rail and expands it back; the choice is stored in admin_sidebar and reflected in data-admin-sidebar; width and main offset come from one --admin-sidebar-w"
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/AdminSidebar.test.tsx#AdminSidebar collapse toggle (ADM-01, D-13, tracer)"
        status: pass
      - kind: unit
        ref: "tests/admin-theme-css.test.ts#admin-theme.css sidebar rail contract (ADM-01, D-13, D-16)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mobile (below 768px) keeps the 280px labelled slide-over whatever the cookie says"
    requirement: ADM-01
    verification:
      - kind: unit
        ref: "tests/admin-theme-css.test.ts#every selector that mentions the collapsed state sits inside a (min-width: 768px) block"
        status: pass
    human_judgment: false
  - id: D3
    description: "Theme toggle flips data-admin-theme instantly, writes one admin_theme cookie, relabels with Moon/Sun, survives a shell re-render"
    requirement: ADM-02
    verification:
      - kind: unit
        ref: "tests/AdminSidebar.test.tsx#AdminSidebar theme toggle (ADM-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ctrl/Cmd+backslash toggles collapse with preventDefault and is ignored in input, textarea, select, contenteditable and while a modal is open"
    verification:
      - kind: unit
        ref: "tests/AdminSidebar.test.tsx#AdminSidebar Ctrl/Cmd+\\ shortcut (D-15, T-86-08)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Rail tooltips: hover after 300ms, immediate on focus, collapsed desktop only, label plus shortcut hint for the collapse button"
    verification:
      - kind: unit
        ref: "tests/AdminSidebar.test.tsx#AdminSidebar rail tooltips (UI-SPEC E1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Dashboard layout gate unchanged (no user to /admin/login, non-admin to /) and main uses admin-main"
    verification:
      - kind: unit
        ref: "tests/admin-dashboard-layout.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "Sidebar and login carry no colour literals; login sign-in contract unchanged"
    requirement: ADM-03
    verification:
      - kind: unit
        ref: "tests/admin-no-hardcoded-colors.test.ts (ledger 86-02 deleted)"
        status: pass
      - kind: unit
        ref: "tests/admin-login-next.test.ts, tests/admin-shell-layout.test.tsx"
        status: pass
    human_judgment: false
  - id: D8
    description: "Visual result in a real browser: light Notion-style sidebar, 72px rail look, tooltip placement, smooth 200ms collapse, login in both themes"
    verification: []
    human_judgment: true
    rationale: "Admin sign-in is impossible on localhost (fail-closed Upstash limiter); only /admin/login is reachable and no preview was run. Owner UAT on production at phase closeout."

duration: 25min
completed: 2026-11-02
---

# Phase 86 Plan 02: Collapsible sidebar, theme toggle and themed login Summary

**Collapsible 280px / 72px admin sidebar driven by one `--admin-sidebar-w` token (button or Ctrl/Cmd+backslash, persisted in `admin_sidebar`), light/dark toggle in the sidebar footer, fixed rail tooltips, and a token-only login page.**

## Performance

- **Duration:** about 25 minutes
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 1 created, 6 modified, 1 deleted

## Accomplishments

- **Tracer (Task 1):** the header button calls `useAdminShell().toggleSidebar()`, which flips `data-admin-sidebar` and writes `admin_sidebar`; `.admin-aside` width and `.admin-main` margin both resolve from `--admin-sidebar-w` (280px base, 72px only under `.admin-shell[data-admin-sidebar="collapsed"]` inside `@media (min-width: 768px)`), with a 200ms transition removed under `prefers-reduced-motion`. Tracer verify re-run green before expansion.
- **Gate preserved (T-86-07):** `(dashboard)/layout.tsx` keeps both redirects byte-identical; only the `main` className/style changed. New `tests/admin-dashboard-layout.test.tsx` asserts no user to `/admin/login`, non-admin and `is_admin: false` to `/`, and `main.admin-main pt-16 md:pt-8` with no `ml-[`.
- **Icon rail (Task 2):** 11 lucide icons in the original order and hrefs, `aria-current="page"` on the active item, labels kept as visually-hidden text when collapsed, nav list scrolls with a pinned footer, 44px tiles centered in the rail.
- **Tooltips:** one `role="tooltip"` span, `position: fixed`, 8px right of the rail, z-index 70; shown after 300ms on hover and immediately on focus, only when collapsed and at least 768px (checked at event time). Collapse button tooltip adds the "Ctrl+\ or Cmd+\" hint line.
- **Theme toggle:** Moon + "Switch to dark theme" in light, Sun + "Switch to light theme" in dark; two clicks return to the start with exactly one `admin_theme` cookie; a shell re-render with other initial props keeps the in-memory choice.
- **Shortcut:** document keydown on Ctrl/Cmd with `key === '\\'` or `code === 'Backslash'`, `preventDefault`, ignored in input/textarea/select/contenteditable and while any `[aria-modal="true"]` exists; listener removed on unmount.
- **Light vs dark look:** light rows are soft-filled (`--admin-sidebar-hover` / `--admin-sidebar-active`) with no accent bar; dark keeps the 3px accent bar and tracked labels.
- **Login (Task 3):** page, card, fields, error text and primary button use only admin/status tokens (`--admin-on-accent` on the accent fill, `--status-danger-fg` for errors, Fraunces wordmark via `--admin-font-brand`). `signIn`, `useActionState(signIn, null)`, the hidden `next` input, the post-mount `?next=` read and all copy are untouched; `login/actions.ts` diff against main is empty.
- **Ledger:** `AdminSidebar.tsx` removed from the pending ledger in Task 2, `86-02.json` deleted in Task 3; the colour guard still passes.

## Task Commits

1. **Task 1 (tracer): collapsible sidebar width via --admin-sidebar-w** - `08cb9a43` (feat)
2. **Task 2: icon rail, theme toggle and shortcut** - `f3885705` (feat)
3. **Task 3: themed admin login** - `ad407c17` (feat)

## Verification Results

- `npx vitest run` on AdminSidebar, admin-dashboard-layout, admin-theme-css, admin-shell-layout, admin-no-hardcoded-colors, admin-login-next, locale-links-backstop, admin-shell-prefs: 8 files, 170 tests passed (AdminSidebar alone 33, including the five original assertions unchanged).
- `tsc --noEmit`: no errors outside `tests/` (the baseline 8 old errors); none in any file touched here.
- `eslint --quiet` clean on AdminSidebar.tsx and the three test files. Not run on `login/page.tsx` (the sandbox refused the parenthesised path); that file only had style values changed.
- Acceptance greps: redirects x1 each, `className="admin-main pt-16 md:pt-8"` x1, `aria-controls="admin-sidebar"` x1, `--admin-sidebar-w: 72px` x1, icon import names = 5, `role="tooltip"` x1, both theme labels x1, `--admin-on-accent` x1, `--status-danger-fg` x1, `useActionState(signIn, null)` x1, no hex/rgb literal in AdminSidebar.tsx or login/page.tsx, ledger file gone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Aside pinned with top and bottom instead of min-height**
- **Found during:** Task 2 (CSS for the scrolling nav)
- **Issue:** the plan specified `min-height: 100vh` on the fixed aside; with an auto height the aside grows with its content, so `overflow-y: auto` on the nav never engages on a short viewport and the footer is pushed off screen, contradicting the "footer stays pinned" truth.
- **Fix:** `.admin-aside` uses `top: 0; bottom: 0` (viewport height) and no min-height.
- **Files modified:** `app/(internal)/admin/admin-theme.css`
- **Commit:** `f3885705`

**2. [Rule 2 - Spec alignment] No native `title` on the collapse button**
- **Found during:** Task 2
- **Issue:** UI-SPEC forbids the native `title` for tooltips; an early draft added one.
- **Fix:** removed before commit; the hint is shown only in the custom tooltip.
- **Commit:** `f3885705`

**Total deviations:** 2 (1 bug, 1 spec alignment), both inside the plan's own files.

### Process notes (not plan deviations)

- Task 2 tests were written after the implementation (the component was rewritten in one pass), so that task has no separate RED run; the Task 1 tracer did run RED first (11 failures) then GREEN. The new tests were checked to exercise real behaviour (guard cases dispatch from real input/textarea/select/contenteditable/aria-modal nodes).
- The per-plan commit ledger file could not be written to the worktree git dir (sandbox); the spawn-time base `043b2d1b` was asserted at start and the count is measured from it.

## Known Limitations

- `tests/login-actions.test.ts` (listed in Task 3 verify) cannot run in this worktree: its `vi.mock('next-intl/server')` factory imports `../node_modules/next-intl/dist/esm/development/server.react-server.js`, which fails with `ERR_MODULE_NOT_FOUND` through the `node_modules` symlink to the main checkout. This is a worktree environment issue, unrelated to this plan (the test does not import the login page, and `actions.ts` has an empty diff against main). The orchestrator should run it once in the main checkout after merge.
- Light-theme sentence-case for the login labels ("Admin", "Email", "Password" keep their inline uppercase) is left to the plan 86-08 safety net, as the plan states.
- Visual verification in a browser was not possible (admin sign-in blocked on localhost, no preview run); see coverage D8.

## Known Stubs

None.

## Threat Flags

None. The shortcut is a document-level listener covered by T-86-08; cookie writes still go only through the typed serialisers (T-86-06).

## Next Phase Readiness

The shell is complete for Wave 2 conversion plans: `--admin-sidebar-w` and every class in the plan's vocabulary exist, and the completeness test passes with no new tokens required. Remaining ledger files are 86-03 through 86-07.

## Self-Check: PASSED

- Created/modified files present: `components/admin/AdminSidebar.tsx`, `tests/admin-dashboard-layout.test.tsx`, `app/(internal)/admin/admin-theme.css`, login page and layout; `tests/fixtures/admin-color-pending/86-02.json` absent.
- Commits `08cb9a43`, `f3885705`, `ad407c17` present in `git log 043b2d1b..HEAD`.
- STATE.md and ROADMAP.md not modified.
