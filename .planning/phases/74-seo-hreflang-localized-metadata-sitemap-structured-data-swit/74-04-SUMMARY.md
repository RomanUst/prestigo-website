---
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
plan: 04
subsystem: seo
tags: [nextjs, next-intl, force-static, hreflang, jsonld, i18n]

requires:
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    plan: "01"
    provides: "getAlternates(path, opts) — index-aware (D-06) + translation-aware (D-07) hreflang cluster helper in lib/seo.ts"
provides:
  - "10 force-static pages (about, corporate, faq, privacy, terms, contact, blog listing, services/corporate-accounts, services/group-transfers, services/vip-events) forward { locale } = await params into both generateMetadata and the page body instead of the bare next-intl/server getLocale() request-time accessor — closes the confirmed EN-leak bug (RESEARCH Pitfall 1, WINDOWS #7)"
  - "All 10 pages emit their hreflang cluster via getAlternates() instead of a hand-rolled { en, x-default } literal"
  - "services/corporate-accounts (noindex) passes indexable:false — closes the second live D-06 violation"
  - "inLanguage (BCP-47) added to each page's primary content-sourced JSON-LD node"
affects: [74-05, 74-06, 74-07]

actuals:
  tokens: 8345
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Force-static pages forward { locale } = await params (never a bare next-intl/server getLocale() call) into both generateMetadata and the default page component — the next-intl-documented fix for the force-static default-locale resolution bug"
    - "getAlternates(path, { indexable, content }) replaces every hand-rolled alternates literal on non-route pages, matching the 74-01 tracer pattern"

key-files:
  created:
    - tests/force-static-metadata.test.tsx
  modified:
    - app/[locale]/about/page.tsx
    - app/[locale]/corporate/page.tsx
    - app/[locale]/faq/page.tsx
    - app/[locale]/privacy/page.tsx
    - app/[locale]/terms/page.tsx
    - app/[locale]/contact/page.tsx
    - app/[locale]/blog/page.tsx
    - app/[locale]/services/corporate-accounts/page.tsx
    - app/[locale]/services/group-transfers/page.tsx
    - app/[locale]/services/vip-events/page.tsx

key-decisions:
  - "corporate/page.tsx had no generateMetadata of its own — its title/description live in a fully static, locale-oblivious ./layout.tsx export that is NOT in this plan's files_modified list. Rather than leave corporate off the getAlternates sweep, added a new generateMetadata to page.tsx (page-level metadata overrides layout-level metadata for matching keys in Next.js's metadata resolution) that emits a full D-07-aware hreflang cluster via getAlternates(), while title/description stay the pre-existing EN literal (duplicated from layout.tsx) for every locale — no `metadata` field exists in content/pages/*/corporate.json for any locale to source a localized title from. The real EN-leak bug for this page (the page BODY reading getPageContent('corporate', locale)) is fixed via params forwarding exactly like the other 9 pages. layout.tsx itself was left untouched (out of files_modified scope) — its static alternates/title/description are now dead weight, superseded by page.tsx, which is harmless but worth flagging for a future cleanup pass."
  - "Task 1's RED test plan named generateMetadata for about(ru)/faq(es)/corporate(fr) as the three cases. Since corporate/page.tsx has no generateMetadata (see above), the corporate case tests the page BODY render instead — asserting French hero copy from content/pages/fr/corporate.json appears in place of the EN fallback. This is the literal, real target of the SEO-02 fix for this specific page and a stronger test than a metadata-title comparison would have been, since corporate's metadata was never locale-based to begin with."
  - "inLanguage (BCP-47 via BCP47_TAG) was added to each page's PRIMARY content-sourced JSON-LD node only, not every emitted schema node: AboutPage (about), FAQPage (faq, corporate), Service (services/corporate-accounts, services/group-transfers, services/vip-events), BreadcrumbList (contact, the only node it emits). privacy/terms/blog emit no bespoke JSON-LD at all, so nothing was added there."

requirements-completed: [SEO-02, SEO-01]

coverage:
  - id: D1
    description: "Each of the 10 force-static pages forwards the resolved locale from await params into BOTH generateMetadata and the page body, so /ru/about, /es/faq, /fr/corporate etc. render genuine non-EN content instead of silently serving EN"
    requirement: "SEO-02"
    verification:
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — generateMetadata resolves the params locale, not the default (SEO-02) > about: locale='ru' returns metadata sourced from content/pages/ru/about.json, not the EN file"
        status: pass
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — generateMetadata resolves the params locale, not the default (SEO-02) > faq: locale='es' returns metadata sourced from content/pages/es/faq.json, not the EN file"
        status: pass
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — page body resolves the params locale (SEO-02, corporate body case) > corporate: locale='fr' renders French hero copy from content/pages/fr/corporate.json, not the EN fallback"
        status: pass
      - kind: other
        ref: "grep -rl \"await params\" across the 10 pages returns 10/10 (plan's own <verification>)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Calling each fixed page's generateMetadata (or, for corporate, rendering the page body) with an explicit non-EN locale param yields locale-sourced output, not the EN file; the en case stays byte-identical to pre-fix output"
    requirement: "SEO-02"
    verification:
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — generateMetadata resolves the params locale, not the default (SEO-02) > about: locale='en' returns the EN metadata unchanged"
        status: pass
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — generateMetadata resolves the params locale, not the default (SEO-02) > faq: locale='en' returns the EN metadata unchanged"
        status: pass
      - kind: unit
        ref: "tests/force-static-metadata.test.tsx#force-static pages — page body resolves the params locale (SEO-02, corporate body case) > corporate: locale='en' renders the EN hero copy unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each fixed page emits its hreflang cluster via getAlternates() with the page content ref, replacing the hand-rolled { en, x-default } block"
    requirement: "SEO-01"
    verification:
      - kind: other
        ref: "grep -rl \"x-default\" across the 10 pages returns 0/10 (plan's own <verification>, re-run post-commit)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The noindex services/corporate-accounts page emits NO hreflang cluster (getAlternates indexable:false), closing the second live D-06 violation, while keeping its cross-canonical -> /corporate"
    requirement: "SEO-01"
    verification:
      - kind: other
        ref: "grep -Eq \"indexable: ?false\" app/[locale]/services/corporate-accounts/page.tsx (plan's own <verification>)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live proof that the fix resolves correctly under a real next build/start (not just mocked Vitest) is deferred to the 74-07 phase gate, per this plan's own <verification> note"
    verification: []
    human_judgment: true
    rationale: "Explicitly deferred by the plan itself to the 74-07 live build gate (next build && next start -> /ru/about renders Russian) since Vitest mocks the locale accessor and cannot prove static-generation-time behavior end to end."

duration: ~35min
completed: 2026-09-23
status: complete
---

# Phase 74 Plan 04: Force-Static EN-Leak Fix — params Forwarding + getAlternates Sweep Summary

**Fixed the confirmed EN-leak bug on 10 force-static pages (about, corporate, faq, privacy, terms, contact, blog, services/corporate-accounts, services/group-transfers, services/vip-events) by forwarding `{ locale } = await params` into `generateMetadata` and the page body instead of the bare `getLocale()` request-time accessor, and centralized every page's hreflang cluster onto `getAlternates()`, closing the second live D-06 noindex/hreflang contradiction on `services/corporate-accounts`.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 completed
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- All 10 force-static pages now resolve genuine per-locale content: `generateMetadata` and the default page component both accept `{ params }: { params: Promise<{ locale: string }> }`, await it, and thread the resolved locale into `getPageContent()`/`getAllPosts()` — the next-intl-documented fix for `dynamic = 'force-static'` pages, where a bare request-time locale accessor silently resolves to the default locale (`en`) at static-generation time regardless of the URL being built
- Every page's hand-rolled `{ en, x-default }` alternates literal is replaced by `lib/seo.ts`'s `getAlternates(path, { indexable, content })` — the same D-06/D-07-aware helper wired end-to-end in 74-01. Content-model pages now offer all 7 locales (filtered to genuinely translated ones) in their hreflang cluster instead of just `en + x-default`
- `services/corporate-accounts` (a noindex page) now passes `{ indexable: false }`, closing the second live D-06 violation named in the plan (a noindex page previously emitted a full hreflang cluster contradicting its own `robots: { index: false }`), while its cross-canonical `→ /corporate` is preserved
- Added `inLanguage` (BCP-47 via `BCP47_TAG`, `zh` → `zh-Hans`) to each page's primary content-sourced JSON-LD node: `AboutPage` (about), `FAQPage` (faq, corporate), `Service` (the 3 services pages), `BreadcrumbList` (contact — its only emitted node)
- New `tests/force-static-metadata.test.tsx` (6 tests) pins the per-locale resolution contract for `about`/`faq` `generateMetadata` and `corporate`'s page-body render, plus an `en`-unchanged backstop for each

## Task Commits

1. **Task 1: RED — tests/force-static-metadata.test.tsx pins per-locale resolution** - `eb6c16d` (test)
2. **Task 2 + Task 3 combined: GREEN — forward params + getAlternates sweep + D-06 fix** - `88c0033` (feat)

_TDD gate sequence: RED (`test(74-04)`) precedes GREEN (`feat(74-04)`) — verified via `git log --oneline`._

## Files Created/Modified

- `tests/force-static-metadata.test.tsx` - New Vitest suite (6 tests) pinning the SEO-02 per-locale resolution contract
- `app/[locale]/about/page.tsx` - params forwarding, `getAlternates('/about', { content: { kind: 'page', key: 'about' } })`, `inLanguage` on the `AboutPage` node
- `app/[locale]/corporate/page.tsx` - params forwarding on the page body (the actual bug fix); NEW `generateMetadata` added (previously had none — see Deviations) with `getAlternates()`; `inLanguage` on the `FAQPage` node
- `app/[locale]/faq/page.tsx` - params forwarding, `getAlternates('/faq', ...)`, `inLanguage` on the `FAQPage` schema
- `app/[locale]/privacy/page.tsx` - params forwarding, `getAlternates('/privacy', ...)` (no JSON-LD on this page)
- `app/[locale]/terms/page.tsx` - params forwarding, `getAlternates('/terms', ...)` (no JSON-LD on this page)
- `app/[locale]/contact/page.tsx` - params forwarding, `getAlternates('/contact', ...)`, `inLanguage` on `breadcrumbSchema` (now built as a function)
- `app/[locale]/blog/page.tsx` - params forwarding (including into `getAllPosts(locale)`), `getAlternates('/blog', ...)` (no JSON-LD on this page)
- `app/[locale]/services/corporate-accounts/page.tsx` - params forwarding, `getAlternates('/corporate', { indexable: false })` closing D-06, `inLanguage` on the `Service` node
- `app/[locale]/services/group-transfers/page.tsx` - params forwarding, `getAlternates('/services/group-transfers', ...)`, `inLanguage` on the `Service` node
- `app/[locale]/services/vip-events/page.tsx` - params forwarding, `getAlternates('/services/vip-events', ...)`, `inLanguage` on the `Service` node

## Decisions Made

- **corporate/page.tsx had no `generateMetadata`.** Its title/description lived entirely in a static, locale-oblivious `./layout.tsx` export (`export const metadata: Metadata = {...}`), which is outside this plan's `files_modified` list. Rather than leave corporate off the `getAlternates` sweep (which would violate the plan's own must-have that all 10 pages emit their cluster via `getAlternates()`), a new `generateMetadata` was added directly to `page.tsx`. Next.js metadata resolution has page-level metadata override layout-level metadata for matching keys, so this new function fully supersedes `layout.tsx`'s static export for `title`/`description`/`alternates`/`openGraph` without needing to touch `layout.tsx` itself. Title/description remain the pre-existing EN literal (duplicated verbatim from `layout.tsx`) for every locale, because no `metadata` field exists anywhere in `content/pages/*/corporate.json` (confirmed by inspection across all 7 locale files) to source a localized title from — writing new localized titles by hand would bypass the project's AI-translation pipeline and is out of scope for a bug-fix plan. The real EN-leak defect for this page — the page BODY reading `getPageContent('corporate', locale)` for hero/benefits/FAQ copy — is fixed via params forwarding identically to the other 9 pages. `layout.tsx` itself was left completely untouched (strictly matching `files_modified` scope); its static `alternates`/`title`/`description` exports are now dead weight (silently overridden), which is harmless functionally but is flagged here for a future cleanup pass.
- **Task 1's RED test plan named `generateMetadata` for `about(ru)`/`faq(es)`/`corporate(fr)`.** Since `corporate/page.tsx` had no `generateMetadata` prior to this plan (see above), testing it via `generateMetadata` the way `about`/`faq` are tested was not possible. The corporate test case instead renders the page component's BODY with `params` resolving `locale: 'fr'` and asserts the rendered DOM contains French hero copy (`content/pages/fr/corporate.json`'s `hero.headlineLine1`) rather than the English fallback. This is arguably a *stronger* test of the actual SEO-02 defect for this specific page, since corporate's title was never locale-based to begin with — the real bug was always in the body.
- **`inLanguage` was added to each page's single PRIMARY content-sourced JSON-LD node, not every schema node emitted.** `AboutPage` for about; `FAQPage` for faq and corporate (the content-sourced FAQ entity, chosen over corporate's `Service` node since the Service description text is a static English literal, not locale-varying); `Service` for the 3 `services/*` pages (whose `description` field IS content-sourced via `content.serviceDescription`); `BreadcrumbList` for contact (its only emitted schema node). `privacy`, `terms`, and `blog` emit no bespoke JSON-LD at all, so nothing was added on those three.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] corporate/page.tsx has no generateMetadata to forward params into**
- **Found during:** Task 2 (read_first review of `app/[locale]/corporate/page.tsx`)
- **Issue:** The plan's Task 2/3 actions describe forwarding params into "generateMetadata AND the page body" and replacing "the hand-rolled alternates block" for all 10 pages, but `corporate/page.tsx` has neither a `generateMetadata` function nor an alternates block — both live in a sibling `./layout.tsx` file that is not in this plan's `files_modified` list.
- **Fix:** Added a new `generateMetadata` to `page.tsx` that emits a `getAlternates()`-sourced hreflang cluster (closing the SEO-01 gap for this page) with the pre-existing EN literal title/description (since no localized `metadata` content exists to source from); fixed the real body-content EN-leak bug via params forwarding on the default page component, matching the other 9 pages exactly.
- **Files modified:** `app/[locale]/corporate/page.tsx`
- **Verification:** `tests/force-static-metadata.test.tsx`'s corporate body-render cases pass; the plan's own grep verification scripts (10/10 `await params`, 0/10 `x-default`) pass; `npx tsc --noEmit` shows no new errors.
- **Committed in:** `88c0033` (combined Task 2+3 commit)

**2. [Process deviation] Tasks 2 and 3 committed as a single combined commit, not two separate commits**
- **Found during:** Implementation of Task 2 (params forwarding) and Task 3 (getAlternates sweep)
- **Issue:** Both tasks modify the exact same `generateMetadata` function body per page (Task 2 changes the function signature and locale source; Task 3 replaces the `alternates` field's value inside that same function). Implementing them as fully separable, individually-committable diffs would have required artificial, error-prone file surgery to re-split an already-unified edit rather than reflecting genuinely separable units of work.
- **Fix:** Task 2 and Task 3 were combined into a single `feat(74-04)` commit (`88c0033`), following the RED `test(74-04)` commit (`eb6c16d`). The TDD gate sequence contract (RED precedes GREEN) is fully intact and verified via `git log`; this only reduces the commit count from 3 to 2 for this plan's implementation work.
- **Files modified:** all 10 force-static pages
- **Verification:** `git log --oneline` shows `test(74-04)` immediately preceding `feat(74-04)`.
- **Committed in:** `88c0033`

**3. [Process note] RED-state verification via git revert was blocked by the sandbox's destructive-action classifier**
- **Found during:** Task 1 (attempting to literally reproduce the RED failure by reverting the 10 already-fixed pages to HEAD, running the test, then restoring the fix)
- **Issue:** `git checkout -- <10 page files>` was denied by the harness's auto-mode classifier ("Irreversible Local Destruction"), even with a full patch backup already saved to the scratchpad directory beforehand.
- **Fix:** Per Task 1's own escape-hatch clause ("If mocking makes the current bug non-reproducible in unit form... record in the SUMMARY that the true reproduction is the live build check"), RED was not literally re-demonstrated via revert. Instead: (a) the GREEN state was verified directly by running the suite against the fixed code (6/6 pass); (b) analytically, the pre-fix `about`/`faq` `generateMetadata()` signatures took no `params` argument and called the real (unmocked) `next-intl/server` `getLocale()` outside of any Next.js request scope, which would fail (either by throwing, since no request-scoped async-local-storage context exists in a plain Vitest call, or — if it somehow resolved — by returning the default `en` locale regardless of the `locale: 'ru'`/`'es'` value the test intends to exercise) against every non-EN assertion in this suite; this is the same class of failure the plan's own Pitfall 1 describes. The live, unmocked reproduction remains deferred to the 74-07 `next build && next start` gate exactly as the plan's `<verification>` section already specifies.
- **Files modified:** None (verification-process note only)
- **Verification:** N/A — documented for audit-trail completeness.
- **Committed in:** N/A (no code change)

---

**Total deviations:** 3 (1 blocking-issue auto-fix, 2 process notes)
**Impact on plan:** The corporate/page.tsx fix (deviation 1) is necessary for correctness and stays within `files_modified` scope (only `page.tsx` touched, `layout.tsx` left alone). Deviations 2 and 3 are process/commit-structure notes with no functional impact — the plan's actual code deliverables and verification criteria are all met.

## Known Stubs

- **`app/[locale]/corporate/page.tsx` title/description remain hardcoded EN for all 7 locales.** No `metadata` field exists in any `content/pages/*/corporate.json` file (confirmed across all 7 locales) to source a localized title/description from — this predates this plan and is not something a bug-fix plan should invent by hand-translating (bypassing the project's AI-translation pipeline). The hreflang cluster and page BODY are now fully locale-correct; only the `<title>`/meta description stay EN-only. Logged to `.planning/WINDOWS.md` as a stub for future tracking (a natural fit for a future content-authoring plan that adds `metadata` to `corporate.json` across all locales via the standard translation pipeline).

## Issues Encountered

- **Worktree `node_modules` was an empty stub** (0 items) — symlinked to the main checkout's `node_modules` per the worktree execution protocol; not committed.
- **`git checkout --` for RED-state reversion was blocked by the harness's destructive-action classifier** — see Deviation 3 above.
- **5 pre-existing test suites fail in this worktree** (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) — the same documented worktree-only `next-intl/server` relative-path-through-symlink limitation already noted in 74-01-SUMMARY.md. None of the 5 failing files touch anything modified by this plan (confirmed via `grep` — zero hits on the 10 page paths or `lib/seo.ts`). Full suite: 123 passed / 5 failed (pre-existing, out of scope) / 4 skipped test files; 1581 tests passed.
- **Pre-existing TypeScript errors** in `tests/i18n-translate-dnt.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts` (unrelated files, already documented in 74-01-SUMMARY.md) — confirmed unchanged by `npx tsc --noEmit`; not touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 10 force-static pages now resolve genuine per-locale content and emit `getAlternates()`-sourced hreflang clusters, matching the pattern established by 74-01's `prague-vienna` tracer.
- The `services/corporate-accounts` D-06 violation (noindex page emitting a hreflang cluster) is closed.
- **`.planning/WINDOWS.md` entry #7** (the phase-73 deviation documenting this exact "7 static pages render EN on every locale due to unforwarded `getLocale()`" bug) is now marked `fixed` — this plan is its resolution. A new stub entry (#9) was logged for the narrower `corporate/page.tsx` title/description gap (see Known Stubs).
- `corporate/page.tsx`'s title/description localization gap is a known, logged stub (see Known Stubs, WINDOWS #9) — not a blocker for this plan, but worth a follow-up content plan.
- Live end-to-end proof (`next build && next start` → `/ru/about` renders Russian) remains deferred to the 74-07 phase gate exactly as this plan's `<verification>` section specifies — this was never claimed to be provable via mocked Vitest.
- No blockers for the next plan.

---
*Phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit*
*Plan: 04*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 10 modified force-static pages plus the new `tests/force-static-metadata.test.tsx` verified present on disk. Both task commits (`eb6c16d` test, `88c0033` feat) verified present in `git log`. `npx vitest run tests/force-static-metadata.test.tsx` re-run and confirmed 6/6 passing. Plan-level `<verification>` grep scripts (10/10 `await params`, 0/10 `x-default`, `indexable: ?false` on corporate-accounts) re-run and confirmed passing post-commit.
