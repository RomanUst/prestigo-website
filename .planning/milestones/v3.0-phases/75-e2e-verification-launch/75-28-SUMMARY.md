---
phase: 75-e2e-verification-launch
plan: 28
subsystem: i18n
status: complete
tags: [i18n, gap-closure, en-leak, metadata, next-intl, author, testimonials, blog]
requires:
  - 75-25 (NotFound.metaTitle manifest entry; minimal-freeze pattern)
  - 75-26 (75-EN-LEAK-RESIDUAL.md fix:75-28 rows)
  - 75-27 (JSX posts: i18n Link + setRequestLocale at top of page function)
provides:
  - Localized /login <title> + meta description on all 7 locales (robots unchanged)
  - ArticleByline with a required route-locale prop; localized jobTitle / portrait alt / aria-label
  - Localized author-page metadata (title/description/og:title) and short bio
  - Localized hardcoded homepage testimonials (quote/role/source label)
  - Localized blog category labels (BlogCard + MDX post hero) via lib/blog-categories.ts
affects:
  - 75-30 (production re-scan should show the 76 fix:75-28 rows gone after deploy)
tech-stack:
  added: []
  patterns:
    - "Route-locale prop threading into a shared server component on force-static routes (CR-01)"
    - "Catalog lookup by stable data id with t.has() fallback to raw EN fields"
    - "EN data value -> catalog key mapping at render time (frontmatter stays untouched)"
key-files:
  created:
    - lib/blog-categories.ts
    - tests/login-metadata-i18n.test.ts
    - tests/author-surfaces-i18n.test.tsx
    - .planning/phases/75-e2e-verification-launch/freeze/75-28.freeze
  modified:
    - app/[locale]/login/layout.tsx
    - components/ArticleByline.tsx
    - app/[locale]/blog/[slug]/page.tsx
    - app/[locale]/blog/prague-airport-to-city-center/page.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
    - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
    - app/[locale]/authors/roman-ustyugov/page.tsx
    - content/pages/{en,ru,es,fr,ar,hi,zh}/authors/roman-ustyugov.json
    - lib/google-reviews.ts
    - components/TestimonialsCarousel.tsx
    - components/BlogCard.tsx
    - messages/{en,ru,es,fr,ar,hi,zh}.json
    - i18n/translation-manifest.json
    - tests/TestimonialsCarousel.test.tsx
    - tests/BlogCard.test.tsx
    - tests/shared-sections-i18n.test.tsx
    - .planning/phases/75-e2e-verification-launch/75-EN-LEAK-RESIDUAL.md
    - .planning/phases/75-e2e-verification-launch/deferred-items.md
decisions:
  - "Person name stays Latin (Roman Ustyugov) in the new author metadata/aria strings; existing imageAlt/bio transliterations left as-is"
  - "Blog [slug] page now takes its locale from params instead of getLocale() (CR-01), so the byline gets the route locale"
  - "Category mapping lives in lib/blog-categories.ts (shared by BlogCard and the MDX post hero); unknown categories render the raw value"
  - "Hardcoded testimonial ids michaelH/stepanN/linhC; EN fields stay on HARDCODED_TESTIMONIALS as the data source, carousel falls back to them when the id is not in the catalog"
  - "Manifest: only the 19 new units appended (no full re-timestamp), same approach as 75-25"
metrics:
  duration: "~17 min"
  completed: 2026-09-27
  tasks: 3
  files: 33
estimate:
  tokens: 90000
actuals:
  tokens: 33000
  tasks: 3
  commits: 9
---

# Phase 75 Plan 28: Shared-surface EN-leak localization Summary

The four English surfaces that showed up on every non-EN locale are now localized: /login metadata, the author byline and author page, the hardcoded homepage testimonials, and blog category labels. All new strings were hand-translated in this session into ru/es/fr/ar/hi/zh and frozen in the manifest. EN output is unchanged, except /login, which now has its own title and description.

## What was built

### Task 1 (tracer): /login metadata
- `app/[locale]/login/layout.tsx`: the static `metadata` export became `generateMetadata({ params })`. It reads `Auth.login.metaTitle` (as an absolute title) and `Auth.login.metaDescription` for the route locale. `robots { index: false, follow: true }` is unchanged. For a non-locale segment it returns only robots. No canonical or alternates were added.
- EN: "Sign in — PRESTIGO" / "Sign in to your PRESTIGO account to view and manage your bookings and upcoming trips."
- Tracer gate: the `<verify>` was re-run and passed. A real dev-server render of `/ru/login` returned `<title>Вход — PRESTIGO</title>`, the ru description and `noindex, follow`. `/login` returned "Sign in — PRESTIGO".

### Task 2: Author surfaces
- `content/pages/*/authors/roman-ustyugov.json` gained `bioShort`, `metadata.{title,description,ogTitle}` and `labels.aboutAuthorAria` ("About the author, {name}"). All 7 files have identical key sets. The EN values match the old constants exactly.
- `components/ArticleByline.tsx` has a new required `locale` prop. `jobTitle`, `imageAlt` and the aria label come from `getPageContent('authors/<slug>', locale)`. Name, image and dates still come from lib/authors.ts. It does not import `next-intl/server`.
- Call sites with `locale={locale}` (one ArticleByline per file):
  - `app/[locale]/blog/[slug]/page.tsx`: 1
  - `app/[locale]/blog/prague-airport-to-city-center/page.tsx`: 1
  - `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx`: 1
  - `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx`: 1
- In the three JSX posts, 75-27's `setRequestLocale((await params).locale)` became `const { locale } = await params; setRequestLocale(locale)`. It stays at the top of the page function.
- The author page's `generateMetadata` and short-bio render now read from the content JSON. `lib/authors.ts` is unchanged, so the `personSchemaFor` JSON-LD is still English.

### Task 3: Testimonials and blog categories
- `lib/google-reviews.ts`: `HardcodedReview.id` was added (`michaelH`, `stepanN`, `linhC`).
- `components/TestimonialsCarousel.tsx`: hardcoded reviews render `Testimonials.hardcoded.<id>.{quote,role,sourceLabel}`, checked with `t.has`. If the id is missing, the raw EN fields are used. Google reviews render exactly as before.
- `lib/blog-categories.ts` maps "Airport Transfer" / "Intercity Routes" / "Chauffeur Service" to `BlogCategories.*`. `components/BlogCard.tsx` and the MDX post hero in `app/[locale]/blog/[slug]/page.tsx` use it. `content/blog/**` is untouched.
- All 78 `fix:75-28` lines in 75-EN-LEAK-RESIDUAL.md are annotated "fixed in 75-28 (pending deploy)" with the source files that changed. That is 76 finding rows plus the rule line and the summary row. The `fix:75-28` count equals the `fixed in 75-28` count: 78 = 78.

## Verification

- `tests/login-metadata-i18n.test.ts`: 10 tests. `tests/author-surfaces-i18n.test.tsx`: 20 tests. `tests/TestimonialsCarousel.test.tsx` and `tests/BlogCard.test.tsx` have new 75-28 blocks. All pass, along with i18n-completeness, content-locale-parity, google-reviews and shared-sections-i18n.
- Full suite: 2743 passed, 10 skipped. The only failing files are the 5 known worktree-only next-intl import artifacts (account-trips, auth-customer, login-actions, passenger-actions, profile-actions).
- `node scripts/i18n-freeze-manifest.mjs --verify`: PASSED, 375 frozen units. `node scripts/i18n-translate.mjs --check`: PASSED after each commit.
- `npx tsc --noEmit`: none of the touched files has errors. The 8 remaining errors are pre-existing, in untouched test files.
- `git diff c96882a4..HEAD -- content/blog lib/authors.ts` is empty.
- Dev-server renders on port 3107:
  - `/zh/authors/roman-ustyugov`: zh title, description, og:title and short bio.
  - `/ru/blog`: every card category is in ru.
  - `/ar/blog/beyond-transport-…`: ar hero category, ar aria-label, ar alt, ar job title, and the author link is `/ar/authors/roman-ustyugov`.
  - `/hi/blog/prague-vienna-transfer-vs-train`: hi byline.
  - `/blog/prague-airport-to-city-center`: EN byline byte-identical.
  - `/ru` home: the visible testimonial is in ru. The EN fields remain only inside the RSC props payload, which the rendered scanner (visible text only) does not read.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Blog [slug] page locale source switched to params**
- **Found during:** Task 2
- **Issue:** The page's default export used a bare `getLocale()`. The plan requires the byline locale to come from route params.
- **Fix:** `const { slug, locale } = await params`, and the `getLocale` import was removed. `tests/shared-sections-i18n.test.tsx` now passes `locale: 'ar'` in params instead of `mockGetLocale.mockResolvedValueOnce('ar')`. That file was not in `files_modified`.
- **Commit:** a2a1ca4f

**2. [Rule 3 - Blocking] New helper file lib/blog-categories.ts**
- **Found during:** Task 3
- **Issue:** BlogCard and the MDX post hero need the same EN value to catalog key mapping. This file was not in `files_modified`.
- **Fix:** A small shared module, `blogCategoryKey()`. It uses an own-property check, so values like `constructor` cannot match.
- **Commit:** 363e3063

**3. Tracer gate handled autonomously**
- Auto-advance is not configured, which would normally mean an interactive checkpoint after the tracer. The plan is `autonomous: true` and the project rule is to self-verify, so the gate was closed with the re-run `<verify>` plus a real dev-server render of `/ru/login` and `/login`. It passed, and execution continued.

**4. Existing test fixture got an id**
- The `hardcodedReview()` fixture in `tests/TestimonialsCarousel.test.tsx` now has `id: 'testFixture'`, because `id` is required on the type. It is not a catalog id, so it also exercises the fallback path.

## Deferred

- ArticleByline's "By" / "Published" / "Updated" words and the `en-GB` byline and BlogCard dates stay English on localized posts. The 75-26 scan has no ledger row for them. Logged to `deferred-items.md` (commit 2a1bb99a).

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust-boundary surface. T-75-G21: the `{name}` in the aria label comes from the lib/authors.ts constant via plain string replace. T-75-G23: units frozen and `--verify` passed. T-75-G24: locale comes from route params and is tested for every locale.

## Commits

| Commit | Message |
|--------|---------|
| 129742c5 | test(75-28): add failing test for localized /login metadata |
| bd7b235e | feat(75-28): localize /login title and description on every locale |
| d8e8b950 | test(75-28): add failing test for localized author byline and author page |
| a2a1ca4f | feat(75-28): localize author byline, short bio and author-page metadata |
| c913ddf0 | test(75-28): add failing tests for localized testimonials and blog categories |
| 363e3063 | feat(75-28): localize hardcoded testimonials and blog category labels |
| 615796c7 | docs(75-28): annotate fix:75-28 EN-leak ledger rows as fixed (pending deploy) |
| 2a1bb99a | docs(75-28): log byline By/Published/date EN leftovers as deferred |

## Self-Check: PASSED
