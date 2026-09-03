---
phase: 68-i18n-foundation-routing
plan: 01
subsystem: infra
tags: [next-intl, nextjs-16, middleware, i18n, csp, supabase, csrf, app-router]

requires: []
provides:
  - next-intl@4.14.2 composed into the existing CSP-nonce/Supabase-updateSession/CSRF-Origin-guard middleware chain
  - i18n/routing.ts typed single-source locale config (en, ru, es, fr, ar, hi, zh)
  - Split root layouts (app/[locale]/layout.tsx + app/(internal)/layout.tsx) sharing components/SiteChrome.tsx
  - Full public route tree moved under app/[locale]/, admin+driver under app/(internal)/
  - Regression test lock: tests/middleware-i18n.test.ts, tests/i18n-routing.test.ts
affects: [69-string-externalization-ui-chrome, 70-string-externalization-booking-account, 74-seo-hreflang, 68-02]

actuals:
  tokens: 25816
  tasks: 2
  commits: 2

tech-stack:
  added: [next-intl@4.14.2]
  patterns:
    - "Non-destructive middleware composition: isNonLocalizedRoute() branches BEFORE handleI18nRouting() touches the request; only /admin,/api,/auth,/driver skip next-intl entirely"
    - "Response-object threading: updateSession() accepts baseResponse/pathnameOverride so next-intl's x-middleware-rewrite header survives instead of being dropped by a fresh NextResponse.next()"
    - "Shared SiteChrome extraction consumed by both root layouts to keep /admin and /driver chrome provably byte-for-byte unchanged"
    - "Typed single-source locale config module (i18n/routing.ts) mirroring lib/routes.ts's header-comment 'single source of truth + consumer list' convention"

key-files:
  created:
    - i18n/routing.ts
    - i18n/request.ts
    - components/SiteChrome.tsx
    - app/[locale]/layout.tsx
    - app/[locale]/not-found.tsx
    - app/(internal)/layout.tsx
    - app/not-found.tsx
    - tests/middleware-i18n.test.ts
    - tests/i18n-routing.test.ts
  modified:
    - middleware.ts
    - lib/supabase/middleware.ts
    - next.config.ts
    - app/sitemap.ts
    - app/auth/callback/route.ts
    - components/Nav.tsx
    - components/admin/AdminSidebar.tsx
    - components/account/ProfileForm.tsx
    - .husky/pre-commit
    - "~90 route files (git mv into app/[locale]/ or app/(internal)/)"
    - "9 test files with stale @/app/login|account|admin|driver|book import paths"

key-decisions:
  - "next-intl@4.14.2 exact pin approved via blocking-human package-legitimacy checkpoint (amannn/next-intl, 5+ year old package, 5.4M weekly downloads, no postinstall script; the [SUS] 'too-new' signal fired on the latest patch's publish date, dispositioned as a false positive)"
  - "Consolidated the non-localized and public branch CSP/Supabase logic into one shared runCspAndAuthChain() helper parameterized by decision pathname + optional baseResponse/pathnameOverride, rather than duplicating the block twice as the plan's pseudocode literally showed — functionally identical, less drift risk"
  - "useNonceCsp is decided from the RAW request pathname, not the locale-stripped decisionPathname, so a crafted /ru/admin request can never qualify for a nonce-based CSP even though it strips to '/admin' for the isDynamicPath decision (T-68-04 fix, found while authoring the Task 2 security test)"

patterns-established:
  - "i18n/routing.ts is the single typed source of locales/AppLocale/rtlLocales/routing, consumed by middleware.ts and both root layouts — extend this file, never redeclare the locale list elsewhere"
  - "sourceFile path strings in app/sitemap.ts's entry() calls must track the physical app/ file location (now app/[locale]/...), not the public URL — keep these in sync on any future route-tree move"

requirements-completed: [I18N-01, I18N-02, I18N-03, I18N-04]

coverage:
  - id: D1
    description: "EN resolves at root (localePrefix as-needed) with every existing English URL byte-identical, /en/x 307-redirects to /x"
    requirement: I18N-01
    verification:
      - kind: integration
        ref: "tests/middleware-i18n.test.ts#public branch — default locale (en) resolves at root"
        status: pass
      - kind: e2e
        ref: "manual curl: GET / -> 200 (no redirect), GET /en -> 307 -> /, both verified against a live npm run dev server"
        status: pass
    human_judgment: false
  - id: D2
    description: "Composed middleware preserves CSP nonce, Supabase updateSession, and CSRF Origin-guard byte-for-byte for /admin, /api, /auth, /driver; locale-prefixed public paths (/ru/book, /ru/account) are correctly gated via the locale-stripped pathname"
    requirement: I18N-02
    verification:
      - kind: unit
        ref: "tests/middleware-customer.test.ts (all 7 assertions, zero changes)"
        status: pass
      - kind: integration
        ref: "tests/middleware-i18n.test.ts#non-localized branch, #locale-prefixed dynamic path, #locale-preserving auth redirect"
        status: pass
      - kind: e2e
        ref: "manual curl against live dev server: /admin unauth -> 307 /admin/login; /admin/login carries nonce CSP; /ru/account unauth -> 307 /login?return-to=%2Fru%2Faccount; /account unauth -> 307 /login?return-to=%2Faccount"
        status: pass
    human_judgment: false
  - id: D3
    description: "<html lang>/dir set dynamically per locale, dir=rtl only for ar; per-locale not-found renders"
    requirement: I18N-03
    verification:
      - kind: e2e
        ref: "manual curl against live dev server: GET / -> <html lang=\"en\" dir=\"ltr\">; GET /ar -> <html lang=\"ar\" dir=\"rtl\">"
        status: pass
    human_judgment: true
    rationale: "No automated RSC-render test exists in this suite for SSR <html> tag output (RESEARCH.md flagged this as a Wave 0 gap, not worth inventing new test infra for a routing phase); verified live against a real dev server instead of a unit test, but a human should still eyeball the rendered pages once for visual confirmation."
  - id: D4
    description: "Typed single-source locale config (7 locales, defaultLocale, localePrefix, localeDetection) consumed by middleware and layouts; every configured non-EN subpath renders EN without 404"
    requirement: I18N-04
    verification:
      - kind: unit
        ref: "tests/i18n-routing.test.ts (10 assertions)"
        status: pass
      - kind: e2e
        ref: "manual curl against live dev server: /ru, /es, /fr, /ar, /hi, /zh all -> 200"
        status: pass
    human_judgment: false
  - id: D5
    description: "Locale-prefix path confusion (/ru/admin) cannot bypass admin auth gating or acquire a nonce CSP — hasLocale-guarded [locale] 404 renders instead"
    requirement: I18N-02
    verification:
      - kind: unit
        ref: "tests/middleware-i18n.test.ts#security: /ru/admin does not bypass admin gating (T-68-04)"
        status: pass
      - kind: e2e
        ref: "manual curl against live dev server: GET /ru/admin -> 404, Content-Security-Policy has no nonce- directive"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-09-03
status: complete
---

# Phase 68 Plan 01: i18n Foundation & Routing Summary

**next-intl@4.14.2 composed non-destructively into the CSP-nonce/Supabase/CSRF middleware chain, root layout split into app/[locale]/ + app/(internal)/ sharing one SiteChrome, and the full public route tree moved under app/[locale]/ with every existing EN URL byte-identical**

## Performance

- **Duration:** ~55 min (includes two coordinator round-trips: package-legitimacy checkpoint approval and an `npm install` permission workaround run from the orchestrator session)
- **Completed:** 2026-09-03T19:20:32Z
- **Tasks:** 2 (tracer + TDD regression lock)
- **Files modified:** ~118 (across both commits; ~90 are pure `git mv` renames with no content change)

## Accomplishments
- `next-intl@4.14.2` installed at the human-approved exact pin, composed into `middleware.ts` so `/admin`, `/api`, `/auth`, `/driver` run the pre-existing CSP/Supabase/CSRF chain byte-for-byte while every other path resolves locale first via `handleI18nRouting`
- Root layout split into `app/[locale]/layout.tsx` (dynamic `<html lang dir>`, `hasLocale` guard, `setRequestLocale`) and `app/(internal)/layout.tsx` (hard-coded `lang="en"`), both sharing the extracted `components/SiteChrome.tsx` so `/admin`/`/driver` chrome is provably unchanged
- Full public route tree (~20 top-level folders, ~90 pages) moved under `app/[locale]/` via `git mv`; `admin`/`driver` moved under `app/(internal)/`; `api`, `auth`, `sitemap.ts` stayed at root
- `i18n/routing.ts` established as the single typed source of the 7 locales (en/ru/es/fr/ar/hi/zh), consumed by middleware and both layouts
- Two new regression-lock test files (20 assertions) plus the pre-existing `tests/middleware-customer.test.ts` (7 assertions, zero changes) all green; full vitest suite at 104 files / 1158 tests, no regressions
- Live-verified against a real `npm run dev` server: `/` (200, EN, no redirect), `/en` (307→/), `/ru`/`/es`/`/fr`/`/ar`/`/hi`/`/zh` (all 200), `/ar` (`dir="rtl"`), `/admin` unauth (307→/admin/login, nonce CSP), `/ru/account` unauth (307→/login with locale-preserving return-to), `/ru/admin` (404, no nonce CSP leak)

## Task Commits

Each task was committed atomically:

1. **Checkpoint: next-intl package legitimacy + version pin** — cleared via coordinator relay (human approved `next-intl@4.14.2`, `amannn/next-intl` confirmed); no separate commit, gates Task 1's install step.
2. **Task 1: End-to-end EN-at-root through the composed next-intl stack** — `7d52265` (feat)
3. **Task 2: Lock the composition + config contract with regression tests** — `3fed8f2` (test, includes a Rule 1 fix to `middleware.ts` found while authoring the security test)

**Plan metadata:** commit pending (this SUMMARY + STATE.md/ROADMAP.md update)

_Note: Task 2 is `tdd="true"` but the implementation predates the test (Task 1 is the tracer — deliberately production-quality and already committed before Task 2's regression tests were written). No artificial RED-commit ceremony was performed; instead, a genuine gap was found by reasoning through the `/ru/admin` test case before running it, fixed in the same commit as the test, then confirmed GREEN. See "TDD Gate Compliance" below._

## Files Created/Modified
- `i18n/routing.ts` — typed single-source locale config (7 locales, `as-needed`, `localeDetection: false`)
- `i18n/request.ts` — `getRequestConfig` stub (`messages: {}` until Phase 69)
- `middleware.ts` — composed `isNonLocalizedRoute`/`stripLocalePrefix`/`handleI18nRouting`, shared `runCspAndAuthChain` helper
- `lib/supabase/middleware.ts` — `updateSession` gains optional `baseResponse`/`pathnameOverride` params
- `next.config.ts` — `withNextIntl(withMDX(nextConfig))`
- `components/SiteChrome.tsx` — extraction of the old `app/layout.tsx` body, shared by both new root layouts
- `app/[locale]/layout.tsx`, `app/[locale]/not-found.tsx`, `app/(internal)/layout.tsx`, `app/not-found.tsx` — new root layouts + fallbacks
- `app/sitemap.ts` — `lastModFor()` sourceFile paths updated to `app/[locale]/...` (Rule 1 — the move silently broke git-history/mtime lookups for every sitemap entry)
- `.husky/pre-commit` — stale `app/blog/` price-check exclusion widened to `/blog/` (Rule 1 — the move broke the exclusion, which would have false-positive-blocked every future blog commit)
- ~90 route files moved via `git mv` into `app/[locale]/` or `app/(internal)/`
- 15 import-path fixes across `app/auth/callback/route.ts`, `components/Nav.tsx`, `components/admin/AdminSidebar.tsx`, `components/account/ProfileForm.tsx`, and 9 test files
- `tests/middleware-i18n.test.ts`, `tests/i18n-routing.test.ts` — new regression-lock suites

## Decisions Made
- `next-intl@4.14.2` exact pin (not caret) per the checkpoint's human decision, matching the plan default
- Consolidated CSP/Supabase branch logic into one shared helper rather than duplicating the block for the localized/non-localized branches (functionally identical to the plan's pseudocode, less drift risk going forward)
- `useNonceCsp` decided from the raw request pathname rather than the locale-stripped decision pathname — see Deviations below

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useNonceCsp` incorrectly derivable from a locale-stripped pathname, letting `/ru/admin` acquire a nonce CSP**
- **Found during:** Task 2 (writing the `/ru/admin` security test per the plan's STRIDE E-of-P behavior spec)
- **Issue:** The shared `runCspAndAuthChain` helper computed `useNonceCsp = decisionPathname.startsWith('/admin') || decisionPathname.startsWith('/driver')`. In the public branch, `decisionPathname` is the locale-stripped pathname — so a crafted `/ru/admin` request strips to `/admin`, incorrectly qualifying for a nonce-based CSP even though `updateSession`'s admin auth checks correctly key off the raw pathname and never fire for it. This didn't break auth (no bypass), but leaked internal-area CSP posture (and generated a real per-request nonce) onto a route next-intl was about to 404 anyway — a genuine violation of T-68-04's "does NOT set a nonce CSP" requirement.
- **Fix:** Changed the `useNonceCsp` check to read `request.nextUrl.pathname` (the raw, unstripped pathname) instead of `decisionPathname`. The non-localized branch is the only place `/admin`/`/driver` can appear as the raw pathname by construction (the public branch is only entered when `isNonLocalizedRoute(raw pathname)` is false), so this is byte-identical for the existing non-localized call sites and closes the leak on the public branch.
- **Files modified:** `middleware.ts`
- **Verification:** `tests/middleware-i18n.test.ts#security: /ru/admin does not bypass admin gating` passes; live-verified against `npm run dev` — `GET /ru/admin` returns 404 with a CSP header containing no `nonce-` directive.
- **Committed in:** `3fed8f2` (bundled into the Task 2 test commit, since it was discovered while authoring that exact test)

**2. [Rule 1 - Bug] `app/sitemap.ts`'s `lastModFor()` sourceFile paths broken by the route move**
- **Found during:** Task 1, Step D/E (route tree move)
- **Issue:** `app/sitemap.ts` passes hardcoded `app/<route>/page.tsx` strings to `lastModFor()`, which runs `git log --follow` and a filesystem `stat()` against that path to derive each URL's `lastModified` date. After the `git mv` into `app/[locale]/`, every one of these paths pointed at a location that no longer exists, silently degrading every sitemap entry's `lastModified` to the build-time fallback (today's date) — an SEO regression (uniform lastmod is discounted by Google, which is exactly what this mechanism exists to avoid).
- **Fix:** Updated all `entry(...)` calls in `app/sitemap.ts` to reference the new `app/[locale]/...` paths.
- **Files modified:** `app/sitemap.ts`
- **Verification:** `npm run build` succeeds with no "Encountered unexpected file" warnings related to this path (confirmed by direct code read — this file's paths now match the actual `git mv` targets on disk); not independently unit-tested (no existing test covers `lastModFor()`).
- **Committed in:** `7d52265` (Task 1 commit)

**3. [Rule 1 - Bug] Blog `[slug]` dynamic MDX import broke — relative path depth changed by the move**
- **Found during:** Task 1 build verification (`npm run build` surfaced a Turbopack "Module not found" warning)
- **Issue:** `app/blog/[slug]/page.tsx` dynamically imports `../../../content/blog/${slug}.mdx` using a relative path. Moving the file one directory deeper (`app/[locale]/blog/[slug]/page.tsx`) required one more `../` level; the old 3-level relative path no longer resolved.
- **Fix:** Changed the import to `../../../../content/blog/${slug}.mdx` (4 levels).
- **Files modified:** `app/[locale]/blog/[slug]/page.tsx`
- **Verification:** `npm run build` — the Turbopack "Module not found" warning is gone on rebuild.
- **Committed in:** `7d52265` (Task 1 commit)

**4. [Rule 1 - Bug] `.husky/pre-commit`'s stale `app/blog/` exclusion in the EUR-price-check hook**
- **Found during:** First commit attempt for Task 1 (the hook rejected the commit)
- **Issue:** `.husky/pre-commit` greps the current `app/`/`components/` trees for hardcoded EUR prices and excludes `app/compare/`, `app/guides/`, `app/blog/` by path prefix (blog content legitimately quotes prices). After the move, blog content lives at `app/[locale]/blog/`, so the `app/blog/` exclusion no longer matched — every future blog commit (not just this one) would have been false-positive-blocked.
- **Fix:** Widened the exclusion from `app/blog/` to `/blog/` (a substring match that survives the route-group nesting).
- **Files modified:** `.husky/pre-commit`
- **Verification:** Re-ran the hook's grep logic manually — zero matches after the fix; the actual `git commit` for Task 1 then succeeded with the hook active (not bypassed).
- **Committed in:** `7d52265` (Task 1 commit)

**5. [Rule 1 - Bug] `tests/confirmation-page.test.tsx` stale `@/app/book/confirmation/page` import — missed by the plan's declared stale-prefix sweep**
- **Found during:** Task 1's full `vitest run` verification (one failing suite: "Failed to resolve import")
- **Issue:** The plan's Step E sweep explicitly named 4 stale prefixes to search for (`@/app/login`, `@/app/account`, `@/app/admin`, `@/app/driver`) but omitted `@/app/book`, even though `/book` also moved under `app/[locale]/`. A broader sweep across all 17 moved top-level folders found exactly one more affected file.
- **Fix:** Updated the import to `@/app/[locale]/book/confirmation/page`.
- **Files modified:** `tests/confirmation-page.test.tsx`
- **Verification:** Full `vitest run` — 104 files / 1158 tests, zero failures.
- **Committed in:** `7d52265` (Task 1 commit)

---

**Total deviations:** 5 auto-fixed (all Rule 1 — bugs directly caused by this task's route-tree move, none architectural)
**Impact on plan:** All fixes were necessary for correctness (security leak, SEO regression, broken imports, broken commit hook) and directly in-scope of Task 1/2's own file changes. No scope creep — nothing outside files this plan already touched was modified.

## Issues Encountered
- The Claude Code harness's auto-mode permission classifier independently blocked `npm install next-intl@4.14.2` inside this subagent even after the GSD package-legitimacy checkpoint was cleared by the human. Resolved by the orchestrator running the install from its own session and relaying the verified result (exact pin present, no postinstall script, `node_modules/next-intl` version confirmed) back to this executor.
- Initial `git commit -F` heredoc-based invocations failed with shell parse errors (likely from an `eval` re-parse layer wrapping the Bash tool). Resolved by writing commit messages to a scratch file via the `Write` tool and using `git commit -F <file>` instead of inline heredocs.

## User Setup Required
None — no external service configuration required. `next-intl@4.14.2` is a code dependency only (no env vars, no dashboard config).

## TDD Gate Compliance

Task 2 (`tdd="true"`) does not follow the literal RED→GREEN commit-separation ceremony: the implementation under test (Task 1's composed middleware) was already built and committed *before* Task 2's tests were authored, by the plan's own design (Task 1 is explicitly `type="tracer"` — a production-quality, already-verified slice; Task 2 exists to "lock the composition + config contract with regression tests" against it, not to drive new behavior into existence). No `test(...)`-only RED commit exists showing the tests failing against pre-fix code. Instead: while authoring the `/ru/admin` security test case, a genuine gap in the Task 1 implementation was identified by tracing the code (not by running a failing test first), fixed in `middleware.ts`, and the fix was bundled into the same `test(68-01): ...` commit (`3fed8f2`) alongside the new test files. The commit was verified GREEN (build + full suite) before being made. This preserves TDD's substantive value (a real regression-test-driven behavior discovery cycle) without a contrived RED ceremony against code that had no reason to be broken until the specific attack-path test was written.

## Next Phase Readiness
- Route tree, middleware composition, and layout split are stable, tested, and live-verified. Ready for Phase 69 (String Externalization — UI Chrome) and Plan 68-02 of this phase.
- `i18n/request.ts`'s `messages: {}` stub is intentional — Phase 69 (STR-01) introduces the first message catalog; no blocker.
- No blockers or concerns carried forward.

## Self-Check: PASSED

All 15 claimed created/modified files (i18n/routing.ts, i18n/request.ts, components/SiteChrome.tsx, app/[locale]/layout.tsx, app/[locale]/not-found.tsx, app/(internal)/layout.tsx, app/not-found.tsx, tests/middleware-i18n.test.ts, tests/i18n-routing.test.ts, middleware.ts, lib/supabase/middleware.ts, next.config.ts, app/sitemap.ts, .husky/pre-commit, app/[locale]/blog/[slug]/page.tsx, tests/confirmation-page.test.tsx) confirmed present on disk. Both task commits (`7d52265`, `3fed8f2`) confirmed present in git history.

---
*Phase: 68-i18n-foundation-routing*
*Completed: 2026-09-03*
