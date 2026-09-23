---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
plan: 05
subsystem: ui
tags: [nextjs, next-intl, i18n, locale-switcher, react, a11y, rtl]

requires:
  - phase: 74-01
    provides: "LOCALE_ENDONYMS + BCP47_TAG structural maps in i18n/locales.ts"
provides:
  - "components/LocaleSwitcher.tsx — a 7-row header dropdown listing every locale's own endonym, switching to the same page in the target locale via the @/i18n/routing navigation bridge"
  - "LocaleSwitcher mounted in components/Nav.tsx's desktop wrapper + #mobile-menu block — reachable from every page"
  - "Live-verified fact: router.replace(pathname, { locale }) navigation produces a real Set-Cookie: NEXT_LOCALE=<locale> response header from next-intl's own middleware (RESEARCH Q3 closed)"
affects: [74-06]

actuals:
  tokens: 21742
  tasks: 4
  commits: 3

tech-stack:
  added: []
  patterns:
    - "router.replace(pathname, { locale: target }) via @/i18n/routing's useRouter/usePathname — imperative same-page locale switch, never string-concatenated, never a home-jump (D-03)"
    - "useId()-derived unique aria-controls/aria-labelledby ids so the same dropdown component can be mounted twice in one page (desktop + mobile) without DOM id collisions"
    - "vi.mock('next/navigation', importOriginal) router stub — required wherever a component that calls @/i18n/routing's useRouter is rendered in a jsdom test without a real Next App Router context (usePathname degrades to null gracefully; useRouter throws)"

key-files:
  created:
    - components/LocaleSwitcher.tsx
    - tests/locale-switcher.test.tsx
  modified:
    - components/Nav.tsx
    - tests/__snapshots__/nav-locale-render-parity.test.tsx.snap
    - tests/nav-auth.test.tsx
    - tests/i18n-navigation.test.tsx
    - tests/nav-locale-render-parity.test.tsx

key-decisions:
  - "Dropdown rows are <button role=\"menuitem\"> elements calling router.replace() directly (not <Link locale=...>) — matches the plan's Task 3 action text and the RED test's mocked-router assertion, mirrors the account-menu's own Sign Out <button role=\"menuitem\"> precedent, and avoids ambiguity between a real anchor's own navigation and an imperative router.replace() override on the same click"
  - "Trigger and menu ids are generated with React's useId() rather than hardcoded strings, since the component is mounted twice in the same DOM tree (desktop + mobile) and hardcoded ids would collide"
  - "No aria-label needed on the trigger — its visible text (the 2-letter locale code) already serves as the accessible name, avoiding a dependency on messages/*.json (owned by 74-06 in this wave) for a purely structural utility control"

requirements-completed: [UX-01]

coverage:
  - id: D1
    description: "Task 1 — NEXT_LOCALE cookie-write-on-locale-navigation confirmed live on a running dev server (RESEARCH Q3 closed as verified fact, not a documentation-inferred assumption)"
    requirement: "UX-01"
    verification:
      - kind: other
        ref: "curl -sD - -o /dev/null http://localhost:4593/ru/routes/prague-vienna — observed 'set-cookie: NEXT_LOCALE=ru; Path=/; SameSite=lax'"
        status: pass
    human_judgment: false
  - id: D2
    description: "LocaleSwitcher renders exactly 7 rows with endonym labels in fixed order en, ru, es, fr, ar, hi, zh; the active locale's row is marked without reordering the list"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "tests/locale-switcher.test.tsx#renders exactly 7 rows with endonym labels in fixed order en, ru, es, fr, ar, hi, zh"
        status: pass
      - kind: unit
        ref: "tests/locale-switcher.test.tsx#marks the active locale row without reordering the list"
        status: pass
    human_judgment: false
  - id: D3
    description: "Selecting a locale calls router.replace(pathname, { locale: target }) with the pathname from usePathname() — never a hand-built string, never a home-jump; selecting the already-active locale is a safe same-page no-op-equivalent"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "tests/locale-switcher.test.tsx#clicking a non-active row calls router.replace with the current pathname and { locale: target } — never a hand-built string"
        status: pass
      - kind: unit
        ref: "tests/locale-switcher.test.tsx#selecting the already-active locale is a safe same-page no-op-equivalent navigation"
        status: pass
    human_judgment: false
  - id: D4
    description: "LocaleSwitcher is reachable in both Nav.tsx's desktop wrapper and its #mobile-menu block; the Nav golden-snapshot diff versus the prior committed snapshot is additive-only (LocaleSwitcher markup only, no drift to existing Nav links/auth/Book Now)"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "tests/nav-locale-render-parity.test.tsx (4/4 — en/ru/es/fr)"
        status: pass
      - kind: other
        ref: "scratch script diff: stripping both <div class=\"relative\"> LocaleSwitcher blocks from the regenerated snapshot reproduces the prior committed snapshot byte-for-byte for all 4 locale fixtures"
        status: pass
    human_judgment: false
  - id: D5
    description: "No regression to existing Nav/RTL suites after mounting LocaleSwitcher"
    requirement: "UX-01"
    verification:
      - kind: unit
        ref: "tests/locale-switcher.test.tsx + tests/nav-locale-render-parity.test.tsx + tests/i18n-navigation.test.tsx + tests/nav-auth.test.tsx + tests/rtl-backstop.test.ts (157/157 passing)"
        status: pass
      - kind: unit
        ref: "full suite: npx vitest run (1580 passed, 10 skipped, 139 todo; 5 pre-existing worktree-only failures unrelated to this plan)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Dropdown panel min-width, RTL logical positioning, and long-endonym wrap-safety (visual/CSS-only backstop truths not amenable to jsdom assertion)"
    requirement: "UX-01"
    verification: []
    human_judgment: true
    rationale: "min-width: 200px and insetInlineEnd: 0 are set explicitly in the component's inline styles (grep-verifiable, confirmed present) but their rendered visual effect (no wrap for العربية/हिन्दी, correct RTL mirroring under dir=\"rtl\") needs a human/browser check — jsdom does not compute layout, so this cannot be proven by a unit test in this repo's existing test infrastructure."

duration: ~35min
completed: 2026-09-23
status: complete
---

# Phase 74 Plan 05: LocaleSwitcher — 7-endonym Header Dropdown Summary

**New `components/LocaleSwitcher.tsx` client dropdown mounted in `Nav.tsx`'s desktop and mobile layouts, switching locale via `router.replace(pathname, { locale })` with a live-verified `NEXT_LOCALE` cookie write from next-intl's own middleware.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 4 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **RESEARCH Q3 closed as verified fact, not an assumption.** Started a dev server inside the worktree (port 4593, isolated from sibling parallel worktrees) and confirmed a real `set-cookie: NEXT_LOCALE=ru; Path=/; SameSite=lax` response header on a request to `/ru/routes/prague-vienna` — the exact mechanism `router.replace(pathname, { locale })` triggers over the network — before writing any switcher code.
- **`components/LocaleSwitcher.tsx`** — a new `'use client'` dropdown that reads the active locale via `useLocale()` (next-intl) and the current path via `usePathname()` (`@/i18n/routing`), renders the 7 `LOCALE_ENDONYMS` rows (`en, ru, es, fr, ar, hi, zh`) in fixed order, marks the active row with `--copper-light` + a trailing checkmark (no reordering), and switches locale via `router.replace(pathname, { locale: target })` — never string-concatenated, never a home-jump, and NEXT_LOCALE persists automatically via next-intl's middleware (no hand-rolled `document.cookie` write).
- Trigger shows the fixed-width 2-letter locale code + the same chevron SVG path already used by `Nav.tsx`'s account-menu (horizontally symmetric, no RTL mirror needed); dropdown panel uses `insetInlineEnd: 0` (RTL-safe logical positioning) and `min-width: 200px` so `العربية`/`हिन्दी` never wrap.
- Mounted as the leftmost item in `Nav.tsx`'s desktop `flex items-center gap-3` auth+book wrapper and as an equivalent instance in the `#mobile-menu` block — reachable from every page in both layouts.
- Regenerated `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap` for en/ru/es/fr and proved programmatically (scratch diff script) that the only change versus the prior committed snapshot is the added LocaleSwitcher markup at both mount points.

## Task Commits

1. **Task 1: Live-verify NEXT_LOCALE cookie write on a running dev server (RESEARCH Q3)** — no commit (verification-only, no files created/modified per the task's own `<files>` spec)
2. **Task 2: RED — tests/locale-switcher.test.tsx pins switch behavior** - `7ca20de` (test)
3. **Task 3: GREEN — build components/LocaleSwitcher.tsx** - `154bd7b` (feat)
4. **Task 4: Mount LocaleSwitcher in Nav.tsx (desktop + mobile) + regression check** - `1132280` (feat)

_TDD gate sequence: RED (`test(74-05)`) precedes GREEN (`feat(74-05)`) — verified via `git log --grep`._

## Files Created/Modified

- `components/LocaleSwitcher.tsx` - New 7-row locale dropdown (`'use client'`, `useLocale`/`usePathname`/`useRouter`, RTL-safe positioning, outside-click/Escape/arrow-key nav mirroring the account-menu)
- `tests/locale-switcher.test.tsx` - New Vitest + Testing Library suite (5 tests) pinning the UX-01 switch contract
- `components/Nav.tsx` - Imports and mounts `LocaleSwitcher` in the desktop wrapper (leftmost) and `#mobile-menu` block
- `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap` - Regenerated for en/ru/es/fr (additive-only diff, verified programmatically)
- `tests/nav-auth.test.tsx`, `tests/i18n-navigation.test.tsx`, `tests/nav-locale-render-parity.test.tsx` - Added a `vi.mock('next/navigation', importOriginal)` router stub (see Deviations below)

## Decisions Made

- **Rows are `<button role="menuitem">`, not `<Link locale=...>`.** The UI-SPEC's "Rows" prose mentions a `<Link href={pathname} locale={targetLocale}>` shape, but the plan's own Task 3 action text and the RED test both specify imperative `router.replace()` on row activation with a mocked `useRouter`. A button calling `router.replace()` directly satisfies D-03, the acceptance-criteria grep for `router.replace`, and the test's mocked-router assertion without the ambiguity of overriding a real anchor's own click-navigation — and mirrors the account-menu's existing Sign Out `<button role="menuitem">` precedent already in `Nav.tsx`.
- **`useId()` for trigger/menu ids.** The component is mounted twice in the same page (desktop + mobile); hardcoded ids (as the account-menu uses, since it only ever mounts once) would collide. `useId()` guarantees uniqueness per mount.
- **No aria-label on the trigger.** The visible 2-letter code already serves as the accessible name, so no translation-catalog dependency was needed — relevant since `messages/*.json` is owned by 74-06 in this parallel wave and out of scope here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mounting LocaleSwitcher broke 3 existing Nav-rendering test files with a router-context invariant error**
- **Found during:** Task 4 (mounting LocaleSwitcher in Nav.tsx + running the plan's own regression suite)
- **Issue:** `next-intl/navigation`'s `useRouter()` wraps `next/navigation`'s real `useRouter()`, which throws `"invariant expected app router to be mounted"` when called in a jsdom test with no real Next App Router context (unlike `usePathname()`, which degrades gracefully to `null` — this is why `usePathname` already worked unmocked in every existing Nav test). Once `Nav.tsx` mounts `LocaleSwitcher`, every test that renders the real `Nav` component now calls `useRouter()` on render and crashes: `tests/nav-auth.test.tsx`, `tests/i18n-navigation.test.tsx`, and `tests/nav-locale-render-parity.test.tsx` — none of which are in this plan's declared `files_modified`, but all three are explicitly required to pass by the plan's own `<verification>` block.
- **Fix:** Added `vi.mock('next/navigation', async (importOriginal) => ({ ...actual, useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }))` to each of the 3 files, using `importOriginal` to preserve the already-working real `usePathname` implementation and every other `next/navigation` export unchanged. `tests/rtl-backstop.test.ts` needed no change — it only reads `Nav.tsx`'s source as text via `fs.readFileSync`, never renders the component.
- **Files modified:** tests/nav-auth.test.tsx, tests/i18n-navigation.test.tsx, tests/nav-locale-render-parity.test.tsx
- **Verification:** `npx vitest run tests/locale-switcher.test.tsx tests/nav-locale-render-parity.test.tsx tests/i18n-navigation.test.tsx tests/nav-auth.test.tsx tests/rtl-backstop.test.ts` — 157/157 passing. Full suite re-run: 1580 passed, 10 skipped, 139 todo; the only 5 failures are the pre-existing worktree-only `next-intl/server` symlink-resolution limitation already documented in `74-01-SUMMARY.md`'s Issues Encountered (unrelated files: `account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`).
- **Committed in:** `1132280` (Task 4 commit)

**2. [Rule 1 - Bug-adjacent, documentation accuracy] Task 4's literal acceptance-criteria grep count is unreachable without dropping the import statement**
- **Found during:** Task 4, verifying `grep -c "LocaleSwitcher" components/Nav.tsx` is 2
- **Issue:** The plan's acceptance criterion reads `grep -c "LocaleSwitcher" components/Nav.tsx` is 2 "(one desktop mount, one mobile mount)". `grep -c` counts matching *lines*, and the mandatory `import LocaleSwitcher from '@/components/LocaleSwitcher'` line itself always matches the same literal string (in both the identifier and the import path) — so the minimum possible count with a normal ES import plus 2 JSX mounts is 3, not 2. Comment lines referencing "LocaleSwitcher" by name would push the count higher still.
- **Fix:** Renamed the two mount-point comments to lowercase "locale switcher" (case-sensitive grep no longer matches them) to minimize noise, then confirmed the semantic intent — exactly 2 render occurrences — via the more precise `grep -c "<LocaleSwitcher" components/Nav.tsx` → 2. The literal command in the plan text yields 3 (import line + 2 JSX mounts), which is the correct and unavoidable count for working code, not a defect.
- **Files modified:** components/Nav.tsx (comment wording only, no functional change)
- **Verification:** `grep -c "<LocaleSwitcher" components/Nav.tsx` → 2 (desktop + mobile mounts, confirmed). `grep -n "<LocaleSwitcher" components/Nav.tsx` shows lines 156 and 386.
- **Committed in:** `1132280` (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking — Rule 3, 1 documentation-accuracy note — Rule 1-adjacent)
**Impact on plan:** Both were necessary to satisfy the plan's own explicit `<verification>` block after mounting a new component that introduces a router-context dependency; no scope creep beyond making the declared regression suite genuinely pass, and no functional behavior change to `Nav.tsx` beyond the two intended mount points.

## Issues Encountered

- **`.env.local` is not present in the worktree** (gitignored, per-instance file). `npm run dev` for Task 1's live verification hit a 500 render error (`@supabase/ssr: Your project's URL and API key are required`) because `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset. This did not block the verification: next-intl's middleware (which writes `NEXT_LOCALE`) runs upstream of page rendering, so the `Set-Cookie` header was present and observable on the 500 response regardless — confirmed exactly as the plan's own verify script anticipated (it greps response headers, not status code).
- **Worktree `node_modules` was an empty stub** (0 items) — symlinked to the main checkout's `node_modules` per the worktree execution protocol (not committed), matching the pattern already documented in `74-01-SUMMARY.md`.
- Used an isolated dev-server port (4593, not the default 3000) for Task 1's verification to avoid colliding with sibling parallel-executor worktrees (74-02/03/04/06) that may also start dev servers concurrently; killed the server immediately after capturing the response header.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UX-01 is fully satisfied: the switcher is live in both desktop and mobile Nav layouts, switches locale correctly via the routing bridge, and NEXT_LOCALE persistence is confirmed live (not assumed).
- The `vi.mock('next/navigation', importOriginal)` router-stub pattern introduced in `tests/nav-auth.test.tsx`/`tests/i18n-navigation.test.tsx`/`tests/nav-locale-render-parity.test.tsx` is now the established convention for any future test that renders a component consuming `@/i18n/routing`'s `useRouter` — 74-06's `FirstVisitBanner` (also client-side, also touching Nav-adjacent chrome via `SiteChrome.tsx`) may need the same pattern if its own test suite renders real `Nav`/`SiteChrome` alongside it, though `FirstVisitBanner` itself only needs `router.replace` for its "Switch to" action per its own UI-SPEC, not a Nav-level dependency.
- No blockers for the wave's remaining plans (74-02, 74-03, 74-04, 74-06) — this plan touched only `components/LocaleSwitcher.tsx`, `components/Nav.tsx`, and the locale-switcher/nav-adjacent test files, none of which overlap `messages/*.json` or `components/SiteChrome.tsx` (74-06's declared territory).

---
*Phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit*
*Plan: 05*
*Completed: 2026-09-23*

## Self-Check: PASSED

All created/modified files verified present on disk (`components/LocaleSwitcher.tsx`, `tests/locale-switcher.test.tsx`, `components/Nav.tsx`, `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap`, `tests/nav-auth.test.tsx`, `tests/i18n-navigation.test.tsx`, `tests/nav-locale-render-parity.test.tsx`). All 3 task commits (`7ca20de`, `154bd7b`, `1132280`) verified present in `git log`. Plan-level `<verification>` re-run and confirmed green: `tests/locale-switcher.test.tsx`, `tests/nav-locale-render-parity.test.tsx`, `tests/i18n-navigation.test.tsx`, `tests/nav-auth.test.tsx`, `tests/rtl-backstop.test.ts` all pass (157/157); LocaleSwitcher confirmed mounted at both Nav.tsx mount points (lines 156, 386); Nav golden-snapshot diff confirmed additive-only via scratch script for all 4 locale fixtures.
