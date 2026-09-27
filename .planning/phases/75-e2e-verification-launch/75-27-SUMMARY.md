---
phase: 75-e2e-verification-launch
plan: 27
subsystem: i18n / blog
status: complete
tags: [i18n, next-intl, mdx, blog, link-leak, gap-closure, GAP-4c]
gap_closure: true
requirements: [VER-01]
dependency_graph:
  requires:
    - i18n/routing.ts (createNavigation Link, localePrefix as-needed)
    - app/[locale]/layout.tsx (setRequestLocale at layout level)
  provides:
    - Locale-aware MDX anchor mapping for every translated MDX blog post
    - Locale-preserving CTAs on the three D-09 EN-only JSX posts
  affects:
    - /<locale>/blog/<any MDX slug> (internal body links)
    - /<locale>/blog/prague-airport-to-city-center, prague-vienna-transfer-vs-train, prague-airport-taxi-vs-chauffeur
tech-stack:
  added: []
  patterns:
    - "MDX `a` mapping classifies href: internal page path -> Link from @/i18n/routing, everything else -> plain anchor"
    - "force-static page using the server Link pins setRequestLocale((await params).locale) before render"
key-files:
  created:
    - tests/mdx-locale-links.test.tsx
  modified:
    - mdx-components.tsx
    - app/[locale]/blog/prague-airport-to-city-center/page.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
    - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
decisions:
  - "Internal page path = single leading slash, not //, not /api/ or /_next/, no '.' in the last path segment (query/hash stripped first); only those go through the locale Link"
  - "EN-only JSX posts call setRequestLocale((await params).locale) in the page body so the server Link resolves the route locale on force-static routes"
metrics:
  duration: "~23 min"
  completed: 2026-09-27
  tasks: 2
  files: 5
actuals:
  tokens: 4100
  tasks: 2
  commits: 3
---

# Phase 75 Plan 27: Locale-aware blog content links (GAP-4c) Summary

Internal links in blog content now keep the visitor's locale. The MDX `a` mapping sends internal page paths through the next-intl `Link` from `@/i18n/routing`, which fixes every translated MDX post at once. On the three EN-only JSX posts, the 14 internal CTA/inline anchors now use the same `Link`, and each page pins its locale with `setRequestLocale`.

## What was built

### Task 1 (tracer, TDD): MDX mapping
- `mdx-components.tsx`: new `isInternalPagePath(href)` helper. An href counts as internal when it starts with a single `/`, is not `//host`, is not under `/api/` or `/_next/`, and its last path segment has no file extension. Internal hrefs render `<Link>` and everything else renders the original `<a>`. Both branches use the same className (`underline underline-offset-2 transition-colors`) and the same `color: var(--copper-light)` style.
- `tests/mdx-locale-links.test.tsx` (26 cases):
  - The 5 internal targets from the beyond-transport post under ru become `/ru/...`. Under en they stay unprefixed.
  - `https://`, `//evil…`, `mailto:`, `tel:`, `#faq`, `/api/x`, `/_next/static/x.js` and `/brand/guide.pdf` keep their exact href under both ru and en.
  - className and style are checked in every case.
- RED: 5 ru cases failed before the change (commit b915f45e). GREEN: 26/26 passed (commit f420b4df).

**Local end-to-end proof (dev server):** `next dev -p 3127` with placeholder `NEXT_PUBLIC_SUPABASE_*` values. These were only needed so the Nav client could construct; no secrets were used. Port 3100 was already taken by another process.
- `/ru/blog/beyond-transport-luxury-chauffeur-service-prague` returned 200. Of 51 internal page hrefs, all 51 are under `/ru/`, so 0 leaks. The 9 MDX body links now render as `/ru/blog/prague-airport-meet-and-greet`, `/ru/services/corporate-accounts` x2, `/ru/services/intercity-routes`, `/ru/routes` x2 and `/ru/book` x3.
- `/ar/...` of the same post: 51 prefixed, 0 leaks.
- EN root `/blog/beyond-transport-luxury-chauffeur-service-prague`: 0 locale-prefixed hrefs, so as-needed EN stays unprefixed.

### Task 2: EN-only JSX posts
- `prague-airport-to-city-center` (5 anchors), `prague-vienna-transfer-vs-train` (6) and `prague-airport-taxi-vs-chauffeur` (3): each `<a href="/...">…</a>` became `<Link href="/...">…</Link>`. href, className, style and visible text are byte-identical, and no English sentence changed (D-09).
- Acceptance grep: `grep -c -E '<a[[:space:]][^>]*href="/[^/]' <file>` returns `0` for all three files. `grep -c "from '@/i18n/routing'"` returns `1` for all three.
- Dev-server proof after the change:

  | Path | Result |
  | --- | --- |
  | `/ru/blog/prague-airport-to-city-center` | 45 prefixed, 0 leaks |
  | `/ru/blog/prague-vienna-transfer-vs-train` | 46 / 0 |
  | `/ru/blog/prague-airport-taxi-vs-chauffeur` | 43 / 0 |
  | `/ar/blog/prague-airport-to-city-center` | 45 / 0 |
  | EN root, all three posts | 0 locale-prefixed hrefs |

## Verification
- `npx vitest run tests/blog.test.ts tests/seo.test.ts tests/locale-links-backstop.test.ts tests/mdx-locale-links.test.tsx`: 4 files, 54/54 passed.
- Full `npx vitest run`: 153 files passed, 2 skipped, 5 failed. Tests: 2665 passed, 0 failed. The 5 failed files (`account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`) are the known worktree-only artifact `Cannot find module '../node_modules/next-intl/dist/esm/development/server.react-server.js'` (suite load error, green on main). None of them touch files from this plan.
- No golden/snapshot test changed. None cover these posts' Link markup.
- `tsc --noEmit`: 0 errors in touched files. `eslint` is clean on all touched files.
- `git diff --stat -- content/blog` is empty, so no MDX content was edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pinned the request locale on the three force-static EN-only posts**
- **Found during:** Task 2 (dev-server curl proof)
- **Issue:** The server-side `Link` from `@/i18n/routing` resolves the locale through next-intl's request config (`getConfig` → `setRequestLocale` cache, otherwise headers). These three pages are `force-static` and never called `setRequestLocale`. On `/ru/...` in dev, the whole page, including the Nav/Footer chrome, rendered with 0 `/ru/` hrefs (43–46 leaks). This was already the case with the original, unmodified page. Swapping to `Link` alone would therefore not have reliably produced `/ru/...` hrefs.
- **Fix:** Each page's default export now takes `params` and calls `setRequestLocale((await params).locale)` first. This is next-intl's documented static-rendering pattern, the same one `app/[locale]/layout.tsx` uses. The chrome and the CTAs then went from all-EN to 0 leaks. Invalid locales are still rejected by the layout's `hasLocale` → `notFound()`.
- **Files modified:** the three `app/[locale]/blog/prague-*/page.tsx` files (import line plus 4 lines at the top of the page function)
- **Commit:** ed293407
- **Note for plan 75-28:** it also edits these three files. The only non-anchor change here is the page function signature and its first 3 lines.

## TDD Gate Compliance
- RED: `test(75-27)` b915f45e, 5 failing ru cases confirmed.
- GREEN: `feat(75-27)` f420b4df, 26/26 passing.
- No refactor commit was needed.

## Known Stubs
None.

## Environment notes
- The local proof ran on `next dev`. Production proof (`en_leak_rendered.py --pages`) belongs to plan 75-30.
- The dev server changed `next-env.d.ts`. That change was reverted and not committed.

## Commits
| Task | Commit | Message |
| --- | --- | --- |
| 1 (RED) | b915f45e | test(75-27): add failing test for locale-aware MDX anchor mapping |
| 1 (GREEN) | f420b4df | feat(75-27): route MDX internal page links through the locale Link |
| 2 | ed293407 | fix(75-27): keep visitor locale on EN-only blog post CTAs |

## Self-Check: PASSED
