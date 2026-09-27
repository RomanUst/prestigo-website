---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
plan: 03
subsystem: seo
tags: [nextjs, next-intl, hreflang, jsonld, metadata]

requires:
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: "getAlternates(path, opts) — index-aware (D-06) + translation-aware (D-07) hreflang cluster helper in lib/seo.ts (74-01 tracer)"
provides:
  - "15 ISR/force-static non-route + blog/author pages centralized on getAlternates() — no hand-rolled x-default literal remains in this plan's scope"
  - "/data-deletion self-canonical with an empty hreflang cluster (D-06 violation closed)"
  - "/login and /book/confirmation layouts verified to still carry no alternates block — D-06 verification closed for all 4 real noindex pages"
  - "blog/[slug] content-aware hreflang cluster (D-07) + 3 EN-only JSX blog posts and the author page collapsed to an EN-only fallback"
  - "buildAirportTransferJsonLd(opts) — locale-aware inLanguage, EN name/description/price byte-parity preserved"
affects: [74-02, 74-04, 74-05, 74-06]

actuals:
  tokens: 6674
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "getAlternates(path, { indexable, content }) is the single call every generateMetadata()/static metadata export in this plan's scope now reads — no page hand-rolls its own languages object"
    - "A content ref with no matching content/<kind>/<locale>/<key> file in ANY locale (not even en) is a valid, intentional way to force an EN-only fallback — used for the 3 legacy JSX blog posts and the author page, matching the JSX_POSTS precedent already in app/sitemap.ts (74-01)"
    - "buildAirportTransferJsonLd follows the same opts?: { locale, name, description } + BCP47_TAG inLanguage pattern buildRouteJsonLd established in 74-01"

key-files:
  created: []
  modified:
    - app/[locale]/services/airport-transfer/page.tsx
    - app/[locale]/services/city-rides/page.tsx
    - app/[locale]/services/concierge/page.tsx
    - app/[locale]/services/intercity-routes/page.tsx
    - app/[locale]/services/page.tsx
    - app/[locale]/fleet/page.tsx
    - app/[locale]/book/page.tsx
    - app/[locale]/book/multi-day/page.tsx
    - app/[locale]/page.tsx
    - app/[locale]/data-deletion/page.tsx
    - app/[locale]/blog/[slug]/page.tsx
    - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
    - app/[locale]/blog/prague-airport-to-city-center/page.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
    - app/[locale]/authors/roman-ustyugov/page.tsx
    - lib/jsonld.ts
    - tests/jsonld.test.ts

key-decisions:
  - "buildAirportTransferJsonLd's EN name/description stay the pre-phase hardcoded strings even for non-EN locales (no opts.name/description wired from the airport page's content model). The airport page's content.metadata.description carries an unrelated {businessPrice} interpolation placeholder intended for the HTML meta description, not Service-schema text — treating it as a direct JSON-LD source would require re-deriving interpolation logic and risks the exact Pitfall-7-style EN/content divergence 74-01's buildRouteJsonLd deliberately avoided. Only `locale` (and therefore `inLanguage`) is wired; `opts.name`/`opts.description` remain unset for this pass — EN and every non-EN locale currently render the same hardcoded Service name/description text, differing only in `inLanguage`."
  - "Author page's content ref uses `{ kind: 'page', key: 'authors/roman-ustyugov' }` (not `kind: 'blog'`) — no content/pages/<locale>/authors/roman-ustyugov.json file exists in any locale, so the D-07 fs-probe force-includes only 'en' and collapses to an EN-only fallback, semantically matching the page's own content kind."
  - "Documented page↔sitemap cluster divergence for /authors/roman-ustyugov (see Next Phase Readiness) — out of this plan's file scope, not fixed here."
  - "book/page.tsx, book/multi-day/page.tsx, and fleet/page.tsx previously used ABSOLUTE canonical URLs (`https://rideprestigo.com/book`); getAlternates() returns a RELATIVE canonical (`/book`), matching the convention every other page in this sweep already used (services/*, data-deletion, prague-vienna). No functional difference — Next.js resolves a relative canonical against the current origin — but flagging the format change for visibility."

requirements-completed: [SEO-01, SEO-03, SEO-04]

coverage:
  - id: D1
    description: "9 ISR non-route pages (4 service pages + services hub, fleet, book, book/multi-day, home) wired to getAlternates(); /data-deletion emits an empty hreflang cluster (D-06 closed) while staying self-canonical with robots index:false preserved"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "tests/sitemap.test.ts (7 tests, all green)"
        status: pass
      - kind: other
        ref: "grep -q getAlternates + grep -Eq 'indexable: ?false' on app/[locale]/data-deletion/page.tsx; grep -rl x-default across services/fleet/book/page.tsx/data-deletion (within this plan's 10 files) returns 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "/login and /book/confirmation layouts verified to carry no alternates block — D-06 verification closed for all 4 real noindex pages (RESEARCH finding #3)"
    requirement: "SEO-01"
    verification:
      - kind: other
        ref: "grep -l alternates app/[locale]/login/layout.tsx app/[locale]/book/confirmation/layout.tsx returns no matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "services/intercity-routes preserves its cross-canonical to /routes via getAlternates('/routes', { indexable: true })"
    requirement: "SEO-01"
    verification:
      - kind: other
        ref: "manual read of app/[locale]/services/intercity-routes/page.tsx generateMetadata"
        status: pass
    human_judgment: false
  - id: D4
    description: "blog/[slug] passes a blog content ref to getAlternates (D-07) while preserving blogCanonical()'s EN-fallback canonical behavior; the 3 EN-only JSX blog posts and the author page collapse to an EN-only fallback (no non-EN alternate claimed)"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx (4 tests, all green — byte-parity unaffected)"
        status: pass
      - kind: other
        ref: "grep -rl x-default across app/[locale]/blog/[slug], the 3 JSX posts, and app/[locale]/authors/roman-ustyugov (within this plan's 5 files) returns 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildAirportTransferJsonLd carries inLanguage (BCP-47, zh -> zh-Hans); EN name/description/price stay byte-for-byte unchanged; airport-transfer page wired to pass the active locale"
    requirement: "SEO-04"
    verification:
      - kind: unit
        ref: "tests/jsonld.test.ts#buildAirportTransferJsonLd — inLanguage (SEO-04) (5 new tests, all green)"
        status: pass
      - kind: other
        ref: "grep -c inLanguage lib/jsonld.ts returns 4 (>= 2 required: route + airport builders)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-23
status: complete
---

# Phase 74 Plan 03: ISR + Blog/Author Alternates Sweep + Airport JSON-LD inLanguage Summary

**Centralized 15 ISR/force-static non-route and blog/author pages onto `getAlternates()`, closed the live `/data-deletion` noindex/hreflang contradiction (D-06), applied the blog D-07 content-aware cluster to the 3 EN-only legacy JSX articles and author page, and extended `buildAirportTransferJsonLd` with locale-aware `inLanguage`.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 completed
- **Files modified:** 17 (16 planned + `tests/jsonld.test.ts`, required by Task 3's own `<action>` though absent from the plan frontmatter's `files_modified` summary list)

## Accomplishments

- `app/[locale]/services/{airport-transfer,city-rides,concierge,intercity-routes,page}.tsx`, `app/[locale]/fleet/page.tsx`, `app/[locale]/book/page.tsx`, `app/[locale]/book/multi-day/page.tsx`, and `app/[locale]/page.tsx` (home) all replaced their hand-rolled `{ en, x-default }` alternates blocks with `getAlternates()` calls — `services/intercity-routes` keeps its cross-canonical to `/routes`
- `app/[locale]/data-deletion/page.tsx` now calls `getAlternates('/data-deletion', { indexable: false })` — closes the live D-06 violation (previously emitted a hreflang cluster alongside `robots: { index: false }`); verified `app/[locale]/login/layout.tsx` and `app/[locale]/book/confirmation/layout.tsx` still carry no `alternates` block, closing D-06 verification for all 4 real noindex pages
- Home page's `buildLocalBusinessSchema` JSON-LD node gained `inLanguage` (BCP-47 of the active locale)
- `app/[locale]/blog/[slug]/page.tsx` now sources its hreflang cluster from `getAlternates('/blog/' + slug, { content: { kind: 'blog', key: slug } })` while preserving `blogCanonical()`'s existing EN-fallback canonical logic unchanged
- The 3 EN-only legacy JSX blog posts and the author page pass a content ref with no matching file in any locale, which the D-07 fs-probe naturally collapses to an EN-only fallback (`en` is force-included by `getAlternates`'s own logic regardless of file existence) — same precedent as `JSX_POSTS` in `app/sitemap.ts` (74-01)
- `lib/jsonld.ts`'s `buildAirportTransferJsonLd` gained an optional `opts?: { locale, name, description }` param and now emits `inLanguage` (BCP-47), mirroring `buildRouteJsonLd`'s 74-01 pattern; EN name/description/price are unchanged
- `app/[locale]/services/airport-transfer/page.tsx` passes `{ locale }` into the builder
- `tests/jsonld.test.ts` extended with 5 new tests covering `inLanguage` defaults, `zh`→`zh-Hans`, `ru` (no remap), and EN price byte-parity

## Task Commits

1. **Task 1: Alternates sweep — ISR services + fleet + book + home + noindex data-deletion** - `d4546aa` (feat)
2. **Task 2: Blog + author surface — D-07 content-aware alternates** - `37b8276` (feat)
3. **Task 3: buildAirportTransferJsonLd inLanguage + airport page wiring** - `99caef5` (feat)

## Files Created/Modified

- `app/[locale]/services/airport-transfer/page.tsx` - `getAlternates()` wired (content ref `services/airport-transfer`); `buildAirportTransferJsonLd` call passes `{ locale }`
- `app/[locale]/services/city-rides/page.tsx` - `getAlternates()` wired (content ref `services/city-rides`)
- `app/[locale]/services/concierge/page.tsx` - `getAlternates()` wired (content ref `services/concierge`)
- `app/[locale]/services/intercity-routes/page.tsx` - `getAlternates('/routes', { indexable: true })` — cross-canonical preserved, no content ref
- `app/[locale]/services/page.tsx` - `getAlternates()` wired (content ref `services`)
- `app/[locale]/fleet/page.tsx` - `getAlternates('/fleet', { indexable: true })` — no content ref (chrome-only, matches sitemap)
- `app/[locale]/book/page.tsx` - `getAlternates('/book', { indexable: true })` — no content ref
- `app/[locale]/book/multi-day/page.tsx` - `getAlternates('/book/multi-day', { indexable: true })` — no content ref
- `app/[locale]/page.tsx` - `getAlternates('/', { content: { kind: 'page', key: 'home' } })`; `buildLocalBusinessSchema` gained `locale` param + `inLanguage`
- `app/[locale]/data-deletion/page.tsx` - `getAlternates('/data-deletion', { indexable: false })` — D-06 closed
- `app/[locale]/blog/[slug]/page.tsx` - `getAlternates()` sources `languages`; `blogCanonical()` still sources `canonical`
- `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx` - `getAlternates()` with a blog content ref, collapses to EN-only
- `app/[locale]/blog/prague-airport-to-city-center/page.tsx` - same pattern
- `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx` - same pattern
- `app/[locale]/authors/roman-ustyugov/page.tsx` - `getAlternates()` with a page content ref (`authors/roman-ustyugov`), collapses to EN-only
- `lib/jsonld.ts` - `buildAirportTransferJsonLd(globals, sClassPrice, vClassPrice, opts?)` — adds `inLanguage`
- `tests/jsonld.test.ts` - 5 new tests for `buildAirportTransferJsonLd` `inLanguage` + EN byte-parity

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Airport JSON-LD `name`/`description` stay hardcoded EN text for every locale (only `inLanguage` is wired); the airport page's content model description carries an unrelated `{businessPrice}` interpolation placeholder not suited as a direct Service-schema source, mirroring 74-01's Pitfall-7 caution for `buildRouteJsonLd`.
- Author page's content ref uses `kind: 'page'` (not `'blog'`) for semantic accuracy — no content file exists for that key in any locale, so it still collapses to EN-only.
- `book`, `book/multi-day`, and `fleet` canonical URLs changed from absolute to relative format as a side effect of delegating to `getAlternates()` — no functional difference, aligns with the sitewide convention already used by every other swept page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal "x-default" substring from my own explanatory code comments**
- **Found during:** Task 2 (own acceptance-criteria re-run)
- **Issue:** Comments I added to the 3 JSX blog posts and the author page explaining the EN-only fallback used the phrase "en + x-default only", which caused the acceptance criterion's `grep -rl "x-default"` to false-positive match my own comment text (not a hand-rolled config object).
- **Fix:** Reworded the comments to say "EN-only fallback" instead, removing the literal substring while keeping the explanation accurate.
- **Files modified:** the 3 JSX blog post pages + author page (already listed above)
- **Verification:** Re-ran `grep -rl "x-default"` scoped to this plan's own files — 0 matches.
- **Committed in:** `37b8276` (Task 2 commit, fixed before commit — not a separate commit)

**2. [Rule 3 - Blocking] `tests/jsonld.test.ts` modified though absent from the plan frontmatter's `files_modified` list**
- **Found during:** Task 3
- **Issue:** Task 3's own `<action>` explicitly instructs "Extend tests/jsonld.test.ts to assert inLanguage is present and defaults to en," and the task's `<verify>` runs `npx vitest run tests/jsonld.test.ts` — but the plan frontmatter's `files_modified` summary list only includes `lib/jsonld.ts` and the airport page, omitting the test file (an authoring omission in the frontmatter summary, not the task body).
- **Fix:** Extended `tests/jsonld.test.ts` per the task's explicit instruction; low collision risk since no sibling wave-2 plan (74-02/74-04/74-05/74-06) touches `buildAirportTransferJsonLd`'s test coverage.
- **Files modified:** `tests/jsonld.test.ts`
- **Verification:** 15/15 tests pass in `tests/jsonld.test.ts`.
- **Committed in:** `99caef5` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes were necessary for the task's own acceptance criteria and verify command to pass cleanly. No scope creep — the test-file edit was explicitly commanded by the task body itself.

## Issues Encountered

- **Worktree `node_modules` was absent** (not present at all, not just empty) — symlinked to the main checkout's `node_modules` per the worktree execution protocol; not committed.
- **Plan-level `<verification>` grep spans 4 files outside this plan's scope**: `app/[locale]/services/vip-events/page.tsx`, `app/[locale]/services/corporate-accounts/page.tsx`, `app/[locale]/services/group-transfers/page.tsx`, and `app/[locale]/blog/page.tsx` still contain hand-rolled `x-default` literals — confirmed via `grep -l` against sibling `74-04-PLAN.md`'s `files_modified` that all 4 belong to plan 74-04 (a parallel wave-2 executor), not this plan. This is expected: the phase-level `<verification>` in `74-03-PLAN.md`'s own `<verification>` block is written to be re-run by the orchestrator after all wave-2 plans merge, not scoped strictly to this plan's 16 files. Every file actually in this plan's `files_modified` was individually confirmed clean (0 `x-default` hits).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 15 non-route/blog/author pages in this plan's scope are centralized on `getAlternates()`; the D-06 and D-07 gates are proven closed for every file this plan touched.
- **Known page↔sitemap divergence for `/authors/roman-ustyugov` (flag for a future plan or the phase-level verifier):** this plan's `generateMetadata` now emits an EN-only hreflang cluster for the author page (per this plan's own Task 2 acceptance criteria: "The 3 JSX posts + author page emit exactly en + x-default"). However, `app/sitemap.ts` (wired in 74-01, out of this plan's `files_modified` scope) still calls `getAlternates('/authors/roman-ustyugov', { indexable: true })` with **no content ref** — under 74-01's "chrome-only page" classification — which includes **all 7 locales** in the sitemap's cluster for that same URL. This means the sitemap and the page's own `<link rel="alternate">` tags currently diverge for `/authors/roman-ustyugov` specifically, violating the "sitemap and page can never diverge" design invariant documented in `lib/seo.ts`'s own header comment. Neither this plan nor 74-01 is positioned to fix it without touching `app/sitemap.ts`, which is outside this plan's `files_modified`. Recommend a follow-up: change `app/sitemap.ts`'s author-page `entry()` call to pass `{ content: { kind: 'page', key: 'authors/roman-ustyugov' } }` (matching this plan's page-level fix) so both sources agree on the EN-only cluster.
- `buildAirportTransferJsonLd`'s `opts` signature (`{ locale, name, description }`) is available for a future plan to wire genuine non-EN content-sourced name/description if a suitable content-model field is added.
- No blockers for the remaining wave-2 plans (74-02, 74-04, 74-05, 74-06) or phase-level verification.

---
*Phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit*
*Plan: 03*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 17 modified files verified present on disk. All 3 task commits (`d4546aa`, `37b8276`, `99caef5`) verified present in `git log --oneline`. All acceptance criteria re-run and confirmed passing within this plan's own file scope (0 `x-default` hits, `getAlternates`/`indexable: false` present on `/data-deletion`, `inLanguage` count = 4 in `lib/jsonld.ts`, no `alternates` block in `/login` or `/book/confirmation` layouts). Plan-level `<verification>` test suite (`tests/sitemap.test.ts tests/jsonld.test.ts tests/route-page-render.test.tsx`) re-run: 26/26 tests pass. `npx tsc --noEmit` clean on every file this plan touched.
