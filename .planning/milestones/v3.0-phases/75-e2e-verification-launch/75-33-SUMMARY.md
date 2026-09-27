---
phase: 75-e2e-verification-launch
plan: 33
subsystem: i18n-metadata
status: complete
tags: [i18n, seo, metadata, 404, not-found, open-graph, gap-closure]
requires:
  - "75-31: lib/site-metadata.ts getNotFoundMetadata + getLocaleSiteMetadata, tests/helpers/resolveNextMetadata.ts"
provides:
  - "Localized, absolute, noindex 404 metadata on all three 404 paths: unknown blog slug, catch-all, not-found error shell"
  - "setRequestLocale(locale) on app/[locale]/blog/[slug] (WR-05)"
affects:
  - "75-36 (production proof: share_meta_audit.py raw HTML + notfound_audit.py hydrated)"
tech-stack:
  added: []
  patterns:
    - "Every 404 metadata path delegates to getNotFoundMetadata(locale); only the validated locale reaches it"
    - "app/[locale]/not-found.tsx generateMetadata({ params }) is resolved by Next for the error shell (layout + not-found metadata)"
key-files:
  created:
    - tests/not-found-metadata-i18n.test.ts
  modified:
    - app/[locale]/blog/[slug]/page.tsx
    - app/[locale]/[...rest]/page.tsx
    - app/[locale]/not-found.tsx
    - tests/locale-catch-all-not-found.test.ts
    - tests/shared-sections-i18n.test.tsx
decisions:
  - "app/[locale]/not-found.tsx now uses generateMetadata({ params }) with a defensive EN fallback (undefined, empty, rejected or unknown params). This supersedes the 75-13 D-09 static-title exception, which was out of date for Next 16.2."
  - "blog/[slug] collapses both not-found metadata branches into one path: getNotFoundMetadata(locale) for a valid locale, {} otherwise (e.g. 'api')."
metrics:
  duration: "~15 min"
  completed: 2026-09-27
actuals:
  tokens: 4600
  tasks: 2
  commits: 5
---

# Phase 75 Plan 33: Localized 404 metadata on every 404 path Summary

Unknown blog slugs, the catch-all 404 and the raw not-found error shell now all resolve to `getNotFoundMetadata(locale)`: a localized absolute NotFound title (no ` | PRESTIGO` brand doubling), a localized description and openGraph (Next.js mirrors twitter from og), and noindex/nofollow on all 7 locales. The blog post route also pins its request locale.

## What was built

**Task 1 (tracer): unknown blog slug + setRequestLocale** (WR-01, WR-05)
- In `app/[locale]/blog/[slug]/page.tsx`, the two hardcoded `{ title: 'Not Found — Prestigo' }` returns are replaced by a single not-found path: `hasLocale(locales, locale) ? await getNotFoundMetadata(locale) : {}`. The slug never reaches the helper. The found-post metadata branch is unchanged.
- `BlogArticlePage` calls `setRequestLocale(locale)` right after reading params, the same placement as the 75-27 JSX posts.

**Task 2: catch-all + not-found boundary** (WINDOWS #24/#26 404 part, IN-05)
- In `app/[locale]/[...rest]/page.tsx`, generateMetadata now returns `getNotFoundMetadata(locale)`, which adds description and og. A non-locale segment still returns `{}`. The default export (synchronous `notFound()`) and the invariants comment are untouched.
- In `app/[locale]/not-found.tsx`, the static English `metadata` constant is replaced by `generateMetadata({ params })`. It reads the locale defensively and falls back to EN, so it never throws (T-75-G42). The comment block is rewritten, and the component body is unchanged.

## Verification

- `tests/not-found-metadata-i18n.test.ts` (new):
  - blog unknown slug ×7 equals `getNotFoundMetadata(locale)`;
  - slug not reflected;
  - `'api'` returns `{}`;
  - found-post branch intact;
  - real-Next contract for ru;
  - not-found.tsx ×7;
  - EN fallback for `xx` / `{}` / undefined / rejected params;
  - no static `metadata` export;
  - error-shell contract ×7 (layout + not-found metadata through the real `accumulateMetadata`): absolute localized title, EN exactly `Page Not Found — PRESTIGO`, og/twitter title and description localized, robots `noindex, nofollow`.
- `tests/locale-catch-all-not-found.test.ts`: the full-shape cases ×7 are added, and all existing cases (sync throw, route shape, `'api'` returns `{}`) are kept.
- `tests/shared-sections-i18n.test.tsx`: `setRequestLocale` mock added, and the blog CTA test asserts `setRequestLocale('ar')`.
- Targeted run: 3 files, 69/69 pass.
- Full suite: 2824 passed, 10 skipped, 139 todo. Only the 5 known symlink-load suites fail (account-trips, auth-customer, login-actions, passenger-actions, profile-actions), which is the worktree `node_modules` symlink quirk and unrelated.
- `npx tsc --noEmit`, filtered to the touched app and test files: no errors.
- `npx next build`: `✓ Compiled successfully` and `Finished TypeScript` both pass. It then fails at prerender on `/es/terms` with `@supabase/ssr: Your project's URL and API key are required`, the known env-limited sandbox failure (75-18 precedent).
- Acceptance greps:
  - `Not Found — Prestigo` = 0;
  - `setRequestLocale(locale)` = 1;
  - no `post.title` lines in the diff;
  - `export const metadata` (non-comment) = 0;
  - `export async function generateMetadata` = 1;
  - catch-all `getNotFoundMetadata` = 2;
  - catch-all `generateStaticParams` = 0 (unchanged);
  - `app/not-found.tsx` untouched.
- Tracer gate (autonomous): the Task 1 verify was re-run green before expansion.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 8be2282a | test(75-33): add failing tests for localized blog unknown-slug 404 metadata + setRequestLocale |
| 1 GREEN | a8803575 | feat(75-33): localized noindex 404 metadata for unknown blog slugs + setRequestLocale |
| 2 RED | cad00671 | test(75-33): add failing tests for catch-all + not-found boundary localized metadata |
| 2 GREEN | f512fa8f | feat(75-33): localized share metadata on catch-all 404 + locale-aware not-found boundary |

## Deviations from Plan

None. The plan was executed exactly as written.

## TDD Gate Compliance

RED commits (`test(...)`) precede GREEN commits (`feat(...)`) for both tasks. No refactor was needed.

## Notes

- The raw error-shell `<html>` still has no `lang` attribute. This is framework behaviour and out of scope; it is deferred to 75-36.
- The production proof (curl of the raw HTML title for `/ru/blog/<unknown>` and `/ru/<unmatched>`) happens in 75-36. Local rendering is impossible in the sandbox because the Supabase env is missing.
- No STATE.md, ROADMAP.md or REQUIREMENTS.md changes (orchestrator-owned).

## Self-Check: PASSED

- FOUND: tests/not-found-metadata-i18n.test.ts, app/[locale]/blog/[slug]/page.tsx, app/[locale]/[...rest]/page.tsx, app/[locale]/not-found.tsx
- FOUND commits: 8be2282a, a8803575, cad00671, f512fa8f
