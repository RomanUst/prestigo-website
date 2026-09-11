---
phase: 71-content-externalization-marketing-seo-pages
plan: 09
subsystem: content
tags: [blog, mdx, i18n, next-intl, content-model, seo]

# Dependency graph
requires:
  - phase: 71-01
    provides: golden-HTML byte-parity harness pattern and the content/routes + content/pages EN-fallback loader convention (lib/route-content.ts, lib/page-content.ts) this plan mirrors for the blog
provides:
  - "content/blog/<locale>/ per-locale blog content model (D-07)"
  - "lib/blog.ts: contentDirFor(locale), resolveLocalizedMdx(slug, locale), blogCanonical(slug, isFallback), locale-defaulted getMDXPosts/getAllPosts"
  - "Locale-aware /blog listing and /blog/[slug] route with EN fallback + canonical->EN for untranslated paths"
  - "content/pages/en/blog.json listing chrome content"
affects: [72-blog-translation, 73-remaining-locale-content]

# Actuals (#2632)
actuals:
  tokens: 5516
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-slug MDX resolution with EN fallback (resolveLocalizedMdx) — distinct from the directory-level EN fallback already used for routes/pages (contentDirFor), because a partially-translated locale directory must still fall back per-missing-file, not just when the whole directory is absent"
    - "canonical -> EN selection extracted into a pure, independently-testable helper (blogCanonical) rather than inlined in generateMetadata"
    - "dynamicParams=true + generateStaticParams sourced only from the locales that actually have content — avoids a 7x static-param explosion for content that is byte-identical to EN until Phase 72/73 translate it"

key-files:
  created:
    - content/pages/en/blog.json
    - tests/blog-locale-fallback.test.ts
  modified:
    - lib/blog.ts
    - app/[locale]/blog/[slug]/page.tsx
    - app/[locale]/blog/page.tsx
    - content/blog/en/*.mdx (git-mv renames, 10 files)

key-decisions:
  - "Relocated 10 tracked MDX posts (not 11 as the plan's estimate stated) — the actual tracked file count in content/blog/ was 10; the untracked WIP file mentioned in the parent conversation's git status does not exist in this worktree checkout, so it was never a factor"
  - "resolveLocalizedMdx validates locale against routing.locales (not just slug) before any fs path build, per the plan's threat_model T-71-BLOG-01, even though the plan's task 1 <action> text only explicitly called out the slug allowlist"
  - "blogCanonical and resolveLocalizedMdx both live in lib/blog.ts (added across Task 1 and Task 2) even though Task 2's files_modified list only names the [slug]/page.tsx — this matches the plan's own artifacts_produced list, which names both helpers as lib/blog.ts additions"

requirements-completed: [CNT-03]

coverage:
  - id: D1
    description: "10 tracked English MDX posts relocated content/blog/*.mdx -> content/blog/en/ via git mv, history preserved as renames"
    verification:
      - kind: unit
        ref: "git status --short (100% rename detection, manually verified) + tests/blog.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/blog.ts is locale-aware: contentDirFor(locale) with EN fallback, getMDXPosts/getAllPosts default locale='en', resolveLocalizedMdx(slug, locale) per-post fallback with slug+locale validation before any fs path build, blogCanonical(slug, isFallback) canonical selection"
    requirement: CNT-03
    verification:
      - kind: unit
        ref: "tests/blog-locale-fallback.test.ts"
        status: pass
      - kind: unit
        ref: "tests/blog.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "/blog/[slug] renders the active locale's MDX with EN fallback; generateMetadata sets alternates.canonical to the absolute EN URL for an untranslated localized path (canonical -> EN, D-07); EN itself is byte-for-byte unchanged"
    requirement: CNT-03
    verification:
      - kind: unit
        ref: "tests/blog-locale-fallback.test.ts (blogCanonical assertions)"
        status: pass
    human_judgment: true
    rationale: "The route's runtime rendering (dynamic MDX import resolving to the correct locale/EN-fallback body, actual page render for a non-EN locale) is not exercised by an automated integration/e2e test in this plan — only the pure canonical-selection logic and the underlying lib/blog.ts resolution are unit-tested. A human should spot-check /ru/blog/<slug> renders the EN body once a preview environment is available."
  - id: D4
    description: "/blog listing renders getAllPosts(locale) (active locale, EN fallback) and its own hero/empty-state/CTA/metadata prose is externalized to content/pages/en/blog.json via getPageContent; EN output is byte-for-byte unchanged"
    requirement: CNT-03
    verification:
      - kind: unit
        ref: "tests/blog-locale-fallback.test.ts (blog listing content EN-fallback + spot-check)"
        status: pass
    human_judgment: true
    rationale: "Visual byte-for-byte parity of the rendered EN /blog page was verified by structural code comparison (identical JSX markup, only text literals swapped for content.* reads) rather than an automated render-diff harness — no such harness exists yet for the blog listing (that infra is a Wave 0 RESEARCH gap tracked outside this plan)."

duration: 25min
completed: 2026-09-11
status: complete
---

# Phase 71 Plan 09: Blog Locale Model Summary

**Blog relocated to `content/blog/<locale>/` with a `resolveLocalizedMdx`/`blogCanonical` fallback pair in `lib/blog.ts`, driving locale-aware rendering on `/blog` and `/blog/[slug]` with `canonical → EN` for untranslated paths — English output byte-for-byte unchanged.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-11T21:54:50Z (approx, worktree HEAD assertion)
- **Completed:** 2026-09-11T22:19:50Z
- **Tasks:** 3
- **Files modified:** 15 (10 MDX renames + lib/blog.ts + 2 page.tsx + 1 new JSON + 1 new/extended test file)

## Accomplishments
- 10 tracked English MDX blog posts relocated `content/blog/*.mdx` → `content/blog/en/` via `git mv` (100% rename detection, git history preserved)
- `lib/blog.ts` extended with `contentDirFor(locale)` (directory-level EN fallback), `resolveLocalizedMdx(slug, locale)` (per-post fallback with slug + locale validation before any fs path build — T-71-BLOG-01), and `blogCanonical(slug, isFallback)`; `getMDXPosts`/`getAllPosts` now default `locale='en'` so `app/sitemap.ts`, `lib/llms-content.ts`, `lib/llms-data.ts`, and `app/api/cron/indexnow/route.ts` keep working unchanged
- `app/[locale]/blog/[slug]/page.tsx` resolves the active locale via `getLocale()`, dynamic-imports `content/blog/${resolved.dir}/${slug}.mdx`, and sets `alternates.canonical` to the absolute EN URL on fallback (canonical → EN, D-07); `generateStaticParams` now sources `content/blog/en/` and `dynamicParams = true` so untranslated `{locale, slug}` combinations render on-demand instead of 404ing
- `app/[locale]/blog/page.tsx` renders `getAllPosts(locale)` and its hero/empty-state/bottom-CTA prose + `generateMetadata` title/description are externalized to `content/pages/en/blog.json` via `getPageContent('blog', locale)`
- JSX_POSTS registry (3 legacy articles, D-08) untouched — verified via `git diff` showing no edits inside the array
- `tests/blog-locale-fallback.test.ts` (new) covers: `getAllPosts` EN-fallback deep-equality, JSX_POSTS presence across locales, `resolveLocalizedMdx` per-post fallback/traversal/invalid-locale rejection, `blogCanonical` selection, and the blog listing content EN-fallback + spot-check

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate MDX to content/blog/en/ and make lib/blog.ts locale-aware** - `741c373` (feat)
2. **Task 2: Locale-aware [slug] MDX resolution + canonical→EN fallback** - `e1e0a7e` (feat)
3. **Task 3: Locale-aware /blog listing + externalize listing chrome** - `ab6b558` (feat)

## Files Created/Modified
- `content/blog/en/*.mdx` (10 files) - relocated via `git mv`, content unchanged
- `lib/blog.ts` - `contentDirFor`, `resolveLocalizedMdx`, `blogCanonical`, locale-defaulted `getMDXPosts`/`getAllPosts`
- `app/[locale]/blog/[slug]/page.tsx` - locale-aware MDX resolution, `dynamicParams = true`, canonical→EN metadata
- `app/[locale]/blog/page.tsx` - `getAllPosts(locale)`, chrome externalized to `content/pages/en/blog.json`
- `content/pages/en/blog.json` - listing hero/empty-state/CTA/metadata strings
- `tests/blog-locale-fallback.test.ts` - new test file (CNT-03 coverage)

## Decisions Made
- Actual tracked MDX count was 10, not the 11 the plan's frontmatter estimate stated. This is a plan-estimate discrepancy, not a scope change — all tracked files were moved (0 remain at the old path), the untracked `prague-christmas-markets-chauffeur-2026.mdx` WIP file mentioned in the parent conversation's git status does not exist in this worktree checkout at all (worktrees are separate filesystem checkouts), so it was never at risk of being touched.
- `resolveLocalizedMdx` validates `locale` against `routing.locales` in addition to the slug allowlist, per the plan's own `threat_model` (T-71-BLOG-01), even though Task 1's `<action>` prose only explicitly called out the slug regex — the threat register is the authoritative correctness requirement here (Rule 2).
- `sitemap.ts`'s existing hardcoded blog `sourceFile` strings (`content/blog/${slug}.mdx`) were left unchanged despite the physical relocation: `lastModFor()` resolves lastmod via `git log --follow -- <path>`, and git's pathspec matching finds the file's full pre-rename history regardless of current on-disk location (empirically verified: both the old and new path resolve to the identical oldest-commit date after the `git mv`). No fix needed; EN sitemap output stays byte-for-byte unchanged.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing-critical-functionality, or blocking issues required Rule 1-3 auto-fixes. The `routing.locales` validation in `resolveLocalizedMdx` (see Decisions Made) is a spec-completeness addition already implied by the plan's own threat_model, not a deviation from stated behavior.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan executed as specified, with the threat_model's locale-validation requirement folded directly into Task 1's implementation rather than treated as a gap.

## Issues Encountered
- Full `npx vitest run` (no path filter) shows 5 pre-existing failing test files (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) due to a worktree-local `node_modules` deficiency unrelated to this plan (already logged in `.planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md` by the sibling 71-01 plan, confirmed still reproducing here, confirmed unrelated to blog/`lib/blog.ts`/page.tsx changes via isolated re-run and `git log` on the affected files showing last touch in Phase 70-08). All of this plan's own targeted verification commands (`tests/blog.test.ts`, `tests/blog-locale-fallback.test.ts`, `tests/blog-jsonld.test.ts`, `tests/sitemap.test.ts`, `tests/llms-content.test.ts`, plus `tests/page-content.test.ts`/`tests/route-content.test.ts` as a cross-check) are green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CNT-03 complete: the blog is per-locale (`content/blog/<locale>/`), listing + `[slug]` render the active locale with EN fallback and `canonical → EN` for untranslated paths, EN posts stay at their canonical `/blog/*` URLs byte-for-byte, and the 3 legacy JSX posts remain EN-only and untouched.
- Ready for Phase 72's AI translation pipeline to populate `content/blog/<locale>/` for ru/es/fr/ar/hi/zh — `resolveLocalizedMdx` and `getMDXPosts`/`getAllPosts` already handle the per-post and per-directory fallback transition transparently once those files start appearing.
- No blockers.

## Self-Check: PASSED

- `content/blog/en/premium-airport-transfer-prague-shortcut.mdx` — FOUND
- `content/pages/en/blog.json` — FOUND
- `tests/blog-locale-fallback.test.ts` — FOUND
- `resolveLocalizedMdx` exported from `lib/blog.ts` — FOUND
- `blogCanonical` exported from `lib/blog.ts` — FOUND
- Commits `741c373`, `e1e0a7e`, `ab6b558` — all present in `git log --oneline`
- `npx vitest run tests/blog.test.ts tests/blog-locale-fallback.test.ts tests/blog-jsonld.test.ts tests/sitemap.test.ts tests/llms-content.test.ts` — 5 files / 43 tests passed
- `git diff lib/blog.ts` — no edits inside the `JSX_POSTS` array (D-08 preserved)
- `content/blog/*.mdx` (old path) — 0 files remain; `content/blog/en/*.mdx` — 10 files present

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-11*
