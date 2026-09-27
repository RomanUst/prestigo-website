---
phase: 75-e2e-verification-launch
plan: 25
subsystem: i18n-routing
status: complete
tags: [i18n, 404, next-intl, catch-all, seo, qa, gap-closure]
requires: []
provides:
  - "app/[locale]/[...rest] required catch-all -> localized not-found boundary"
  - "NotFound.metaTitle x 7 (frozen)"
  - "scripts/qa/notfound_audit.py (post-deploy gate for 75-30)"
affects: [75-28, 75-30]
tech-stack:
  added: []
  patterns:
    - "Required catch-all page calling notFound() synchronously + page-level generateMetadata controls the 404 title"
    - "Minimal manifest freeze: add only the new unit's entry instead of committing the full re-timestamped rewrite"
key-files:
  created:
    - "app/[locale]/[...rest]/page.tsx"
    - "tests/locale-catch-all-not-found.test.ts"
    - "scripts/qa/notfound_audit.py"
    - ".planning/phases/75-e2e-verification-launch/freeze/75-25.freeze"
  modified:
    - "messages/{en,ru,es,fr,ar,hi,zh}.json (NotFound.metaTitle)"
    - "i18n/translation-manifest.json (one new entry)"
decisions:
  - "Catch-all imports `locales` from @/i18n/locales (the single source routing.ts re-exports) instead of `routing.locales`, avoiding the next-intl/navigation graph in the page module and its unit test; semantics identical."
  - "Manifest freeze committed as a single appended entry (messages/en.json::NotFound.metaTitle) rather than the freeze tool's full rewrite, which re-timestamps all 356 frozen units — keeps the diff merge-safe against 75-28."
metrics:
  duration: "~25 min"
  completed: 2026-09-27
actuals:
  tokens: 5600
  tasks: 2
  commits: 4
---

# Phase 75 Plan 25: Localized catch-all 404 (GAP-4a) Summary

A required catch-all `app/[locale]/[...rest]/page.tsx` throws `notFound()` synchronously, so every unmatched localized and EN-root path now renders the localized `app/[locale]/not-found.tsx` inside LocaleLayout. That gives correct `lang`/`dir`, the locale's NotFound heading, a localized noindex title, and a real 404. The plan also ships a repeatable audit that checks the 404s are localized and that the catch-all shadows no other route.

## What was built

- **Catch-all route**: `app/[locale]/[...rest]/page.tsx`. The default export's first and only statement is `notFound()`: no await, no Suspense, no static-params export. `generateMetadata` reads `locale` from `params` (CR-01, never a bare `getLocale()`), checks it with `hasLocale(locales, locale)` and returns `{ title: { absolute: t('metaTitle') }, robots: { index: false, follow: false } }`. For a non-locale segment such as `api` it returns `{}`.
- **`NotFound.metaTitle`** hand-translated in-session (D-08), with PRESTIGO kept in Latin:
  - en: `Page Not Found — PRESTIGO` (byte-identical to the existing static title)
  - ru: `Страница не найдена — PRESTIGO`
  - es: `Página no encontrada — PRESTIGO`
  - fr: `Page introuvable — PRESTIGO`
  - ar: `الصفحة غير موجودة — PRESTIGO`
  - hi: `पेज नहीं मिला — PRESTIGO`
  - zh: `页面未找到 — PRESTIGO`
- **Freeze**: `freeze/75-25.freeze` contains `messages/en.json::NotFound.metaTitle`. `i18n-freeze-manifest.mjs --verify` PASSED (356 frozen units), and `i18n-translate.mjs --check` PASSED after the commit.
- **Tests**: `tests/locale-catch-all-not-found.test.ts` covers:
  - the synchronous throw with digest `NEXT_HTTP_ERROR_FALLBACK;404`
  - the absolute noindex title for each of the 7 locales
  - `{}` for `api`
  - the required `[...rest]` shape, with no `[[...` sibling and no generateStaticParams

  Result: 34/34 passing together with `i18n-completeness`. The related suites (content-locale-parity, en-leak-static, translate-manifest, freeze-manifest, locale-links-backstop, catalog-array-types) also pass: 365/365.
- **Audit**: `scripts/qa/notfound_audit.py [base_url] [--locales]`.
  - It uses Playwright after hydration to check status 404, lang, dir, that the h1 contains `NotFound.headingLine1`, and that the title equals `NotFound.metaTitle`. Both `/this-page-does-not-exist` and `/qa/nested/missing-page` are checked for each locale.
  - Separate plain-HTTP checks (no redirect following) cover non-shadowing.
  - Output goes to `scripts/qa/out/notfound_audit.json`. Exit codes: 0 pass, 1 findings, 2 infra error.

## Verification results

**Local end-to-end** (`next dev` on port 3125, see deviations):

| URL | Status |
|-----|--------|
| /zh/this-page-does-not-exist | 404 |
| /ru/a/b/c | 404 |
| /ru | 200 |
| /ru/fleet | 200 |
| /this-page-does-not-exist (EN root) | 404 |

`python3 scripts/qa/notfound_audit.py http://localhost:3125` exited 0:
- **Non-shadowing:** 12/12 PASS.
- **Localized 404:** 14/14 PASS. Every locale gets lang equal to the locale, `dir=rtl` only on ar, the localized h1 and title, and status 404.

**Production pre-deploy baseline** (`https://rideprestigo.com`, exit 1, as expected):
- **Non-shadowing:** 12/12 PASS. `/`, `/ru`, `/ru/fleet`, `/ru/routes/prague-vienna`, `/ru/blog/beyond-transport-luxury-chauffeur-service-prague`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/favicon.ico` and `/e-class-photo.avif` all return 200. `/api/does-not-exist` and `/de/foo` return 404.
- **Localized 404:** 0/14 PASS. Every locale returns status 404 but `lang="en"`, h1 "Page not found" and title "Page Not Found — PRESTIGO", and ar has no `dir`. This is the live GAP-4a leak and the baseline plan 75-30 compares against.

**Prohibitions** (all confirmed):
- None of the 75-25 commits touch `middleware.ts`, `app/not-found.tsx`, `app/[locale]/not-found.tsx` or `app/[locale]/layout.tsx`.
- No optional catch-all exists.
- The i18n-translate `--dry-run` was never run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dev server port and env**
- **Found during:** Task 1 local proof.
- **Issue:** Port 3100 was already in use (EADDRINUSE, probably a parallel agent). The worktree has no `.env.local`, so `/ru` returned 500 with "@supabase/ssr: URL and API key are required". This had nothing to do with the change.
- **Fix:** Ran on port 3125 with placeholder non-secret Supabase env vars (a local URL and dummy keys). `.env.local` was not read.
- **Commit:** none (runtime only).

**2. [Rule 1 - Bug] Audit status-check timeout too short for `next dev`**
- **Found during:** Task 2 local run.
- **Issue:** On first hit, `next dev` took about 35 s to compile the blog route. That tripped the 30 s urllib timeout and was reported as an infra error (exit 2).
- **Fix:** Raised the default to 90 s, the same as the Playwright goto timeout.
- **Files modified:** `scripts/qa/notfound_audit.py`
- **Commit:** cb7dd270

**3. [Scope-minimising] Manifest diff reduced to a single entry**
- **Issue:** `node scripts/i18n-freeze-manifest.mjs` re-timestamps all 356 frozen units, giving a diff of about 714 lines that would conflict with 75-28.
- **Fix:** Restored the manifest and appended only the `messages/en.json::NotFound.metaTitle` entry with the tool's computed enHash. `--verify` still PASSED.
- **Commit:** 824bf684

**4. [Minor] `locales` imported from `@/i18n/locales`** instead of `routing.locales`. This is the same single-source list and keeps next-intl/navigation out of the page's import graph.

## Known Stubs

None.

## TDD Gate Compliance

RED `c7b2e204` (test, failed: module missing), then GREEN `824bf684` (feat). No refactor was needed.

## Commits

- c7b2e204 test(75-25): add failing test for locale catch-all 404 route
- 824bf684 feat(75-25): route unmatched localized paths to the localized 404 boundary
- a4a37b0f feat(75-25): add repeatable localized-404 + catch-all non-shadowing audit
- cb7dd270 fix(75-25): raise notfound_audit status-check timeout to 90s

## Notes

- `node_modules` in this worktree is a gitignored symlink to the main checkout's node_modules, used to run vitest and next. It is not committed.
- Post-deploy proof: after the merge, run `python3 scripts/qa/notfound_audit.py` against production in plan 75-30. Expect exit 0.

## Self-Check: PASSED
