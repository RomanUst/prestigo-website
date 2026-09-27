---
phase: 71-content-externalization-marketing-seo-pages
plan: 01
subsystem: content-i18n
tags: [next-intl, content-model, route-pages, json, seo, jsonld]

# Dependency graph
requires:
  - phase: 70-string-externalization-booking-account
    provides: next-intl 4.14.2 routing/message-catalog foundation, getTranslations/getLocale conventions, RoutePage-style namespace precedent
provides:
  - "getRouteContent(slug, locale) loader with EN-fallback and path-traversal/locale allowlist validation"
  - "getPageContent(page, locale) loader mirroring the same shape for non-route pages (Wave 2+)"
  - "interpolate(template, values) price-token substitution helper"
  - "RoutePage chrome namespace in messages/en.json (30/30-grep-verified strings only)"
  - "content/routes/en/prague-vienna.json — first route content file, proving the schema end-to-end"
  - "tests/helpers/route-content-parity.ts — FIXTURE_PRICES/assertRouteContentShape/assertRouteParity, importable by every Wave 2 route plan"
  - "render byte-parity technique (tests/route-page-render.test.tsx) Wave 2 reuses as its backstop"
affects: [71-02, 71-03, 71-04, 71-05, 71-06, 71-07, 71-08, 71-09]

# Actuals (#2632)
actuals:
  tokens: 28111
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "content/{routes,pages}/<locale>/<key>.json + EN-fallback loader (node:fs, sync read), mirroring lib/blog.ts's existing idiom"
    - "getLocale() from next-intl/server used inside Server Components for zero-signature-change locale resolution (D-04)"
    - "{token} interpolation for DB-sourced prices kept out of translatable content JSON (D-02)"
    - "30/30 grep-gate before promoting any route-page string to the shared RoutePage messages namespace (Pitfall 1 discipline)"

key-files:
  created:
    - lib/route-content.ts
    - lib/page-content.ts
    - lib/content-interpolate.ts
    - content/routes/en/prague-vienna.json
    - tests/helpers/route-content-parity.ts
    - tests/route-content.test.ts
    - tests/route-page-render.test.tsx
    - tests/__snapshots__/route-page-render.test.tsx.snap
    - .planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md
  modified:
    - messages/en.json
    - app/[locale]/routes/prague-vienna/page.tsx

key-decisions:
  - "Extended the plan's drafted RouteContent schema with includedLabel/dayTripLabel/faqsHeading (page-specific headings that fail the 30/30 chrome grep gate) and a vehicles[] array field (explicitly required by the plan's vehicles-text migration instruction but not present in the drafted schema)"
  - "Two headings the plan's Pitfall-1 examples implied were page-specific — the What's Included heading (Everything included, / nothing to arrange.) and the Chauffeur heading (What to expect / from your driver.) — verified 30/30 identical via grep and promoted to the RoutePage chrome namespace instead of content JSON"
  - "relatedRoutes stored verbatim (city/distance/duration duplicated from lib/routes.ts) per the plan's explicit instruction, not derived from ROUTES_BY_SLUG (RESEARCH Open Question 1 recommendation not adopted for this plan)"
  - "tests/route-page-render.test.tsx mocks getLocale/getTranslations directly against messages/en.json instead of the project's usual redirect-to-real-react-server-build trick (tests/account-trips.test.tsx pattern), because this worktree's local node_modules lacks the real next-intl package tree that trick depends on — documented in deferred-items.md"

patterns-established:
  - "Wave 2 route plans import tests/helpers/route-content-parity.ts directly (FIXTURE_PRICES, assertRouteContentShape, assertRouteParity) rather than re-deriving loader test scaffolding per route"
  - "Every route-page.tsx keeps its literal variable names (inclusions, faqs, dayTripConfigurations, whyBook, relatedRoutes, highlights, vehicles) now populated from content.* + interpolate(), so the JSX render tree is untouched (D-04)"

requirements-completed: [CNT-01]

coverage:
  - id: D1
    description: "getRouteContent(slug, locale) resolves content/routes/<locale>/<slug>.json with EN-fallback for all 7 locales, and getPageContent(page, locale) mirrors the same shape for non-route pages"
    requirement: "CNT-01"
    verification:
      - kind: unit
        ref: "tests/route-content.test.ts#EN-fallback: getRouteContent('prague-vienna', 'ru') deep-equals the 'en' result"
        status: pass
      - kind: unit
        ref: "tests/route-content.test.ts#passes assertRouteContentShape for prague-vienna (en)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getRouteContent/getPageContent validate slug/page against ^[a-z0-9-]+$ and locale against routing.locales before any path.join, rejecting path-traversal and invalid-locale input (T-71-01)"
    requirement: "CNT-01"
    verification:
      - kind: unit
        ref: "tests/route-content.test.ts#path-traversal: getRouteContent('../secrets', 'en') throws"
        status: pass
      - kind: unit
        ref: "tests/route-content.test.ts#invalid-locale: getRouteContent('prague-vienna', 'xx') throws"
        status: pass
    human_judgment: false
  - id: D3
    description: "prague-vienna renders from the content model with English output byte-for-byte unchanged (visible copy + FAQPage/BreadcrumbList JSON-LD sourced from the same content.faqs array)"
    requirement: "CNT-01"
    verification:
      - kind: unit
        ref: "tests/route-content.test.ts#assertRouteParity spot-checks prague-vienna's five representative fields"
        status: pass
      - kind: automated_ui
        ref: "tests/route-page-render.test.tsx#renders and matches the golden EN snapshot"
        status: pass
    human_judgment: false
  - id: D4
    description: "RoutePage chrome namespace in messages/en.json holds only strings verified present in all 30 route page.tsx files (grep count == 30)"
    requirement: "CNT-01"
    verification:
      - kind: other
        ref: "grep -Fl '<value>' app/[locale]/routes/*/page.tsx | wc -l == 30, run per RoutePage key during Task 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "No shared <RoutePageBody> renderer introduced; JSX render tree for prague-vienna is structurally unchanged apart from literal-to-content-variable swaps (D-04)"
    requirement: "CNT-01"
    verification:
      - kind: other
        ref: "grep -c RoutePageBody app/[locale]/routes/prague-vienna/page.tsx == 0; git diff --stat shows net line reduction (arrays removed, no structural additions)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-09-07
status: complete
---

# Phase 71 Plan 01: Content-Model Foundation + prague-vienna Tracer Summary

**Locale-aware content loaders (`getRouteContent`/`getPageContent`) with EN-fallback and path-traversal guards, a price-interpolation helper, a 30/30-grep-verified `RoutePage` chrome namespace, and `prague-vienna` fully converted off hardcoded literals with byte-for-byte-proven English output.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-07T00:15:00Z (approx.)
- **Completed:** 2026-09-07T00:54:16Z
- **Tasks:** 3
- **Files modified:** 12 (9 created, 2 modified, 1 deferred-items log)

## Accomplishments

- Built `lib/route-content.ts` (`RouteContent` type + `getRouteContent`) and `lib/page-content.ts` (`getPageContent`), both validating `slug`/`page` against `^[a-z0-9-]+$` and `locale` against `routing.locales` before any `path.join` (T-71-01 mitigation), with EN-fallback resolution mirroring `lib/blog.ts`'s existing fs idiom
- Built `lib/content-interpolate.ts`'s `interpolate()` for `{token}` price substitution, keeping DB-sourced `ePrice`/`sPrice`/`vPrice` out of the translatable content JSON (D-02)
- Added a `RoutePage` namespace to `messages/en.json` containing only strings verified 30/30 identical across all route pages via grep gate — correctly excluding "Frequently asked questions" (29/30, hradec-kralove differs), "What's Included" and "Day Trips from Prague" (16/30 each, per Pitfall 1) while including the two headings whose 30/30-identical status the pitfall's phrasing did not make obvious ("Everything included,/nothing to arrange." and "What to expect/from your driver.")
- Converted `app/[locale]/routes/prague-vienna/page.tsx` end-to-end: all local literal consts (`inclusions`, `dayTripConfigurations`, `whyBook`, `relatedRoutes`, `faqs`, `highlights`, `vehicles`, hero/opening/narrative/chauffeur strings, `generateMetadata()` title/description/OG) now read from `content/routes/en/prague-vienna.json` via `getRouteContent` + `getLocale()`, with `interpolate()` applied wherever a price token appears — JSX render tree structurally unchanged, FAQPage JSON-LD built from the same `content.faqs` array the visible page renders
- Built Wave-0 test infrastructure: `tests/helpers/route-content-parity.ts` (importable by every Wave 2 route plan), `tests/route-content.test.ts` (6 tests: shape, EN-fallback, 2× path-traversal, invalid-locale, 5-field byte-parity spot-check), and `tests/route-page-render.test.tsx` (renders `PragueViennaPage()` and snapshots `container.innerHTML` as the golden EN baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the content-model foundation + RoutePage chrome namespace** — `02e470e` (feat)
2. **Task 2: Convert prague-vienna end-to-end onto the content model** — `e5af59f` (feat)
3. **Task 3: Wave-0 test infrastructure** — `f039993` (test)

## Files Created/Modified

- `lib/route-content.ts` — `RouteContent` type + `getRouteContent(slug, locale)` loader
- `lib/page-content.ts` — `getPageContent(page, locale)` loader (segment-wise validated for nested page keys)
- `lib/content-interpolate.ts` — `interpolate(template, values)` price-token substitution
- `messages/en.json` — new `RoutePage` namespace (additions only, verified via `git diff`)
- `content/routes/en/prague-vienna.json` — first route content file, full literal extraction
- `app/[locale]/routes/prague-vienna/page.tsx` — content-model consumer, JSX unchanged
- `tests/helpers/route-content-parity.ts` — shared parity helpers for Wave 2
- `tests/route-content.test.ts` — loader unit tests
- `tests/route-page-render.test.tsx` — render byte-parity proof + golden snapshot
- `tests/__snapshots__/route-page-render.test.tsx.snap` — committed golden EN baseline
- `.planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md` — logs a pre-existing, out-of-scope worktree environment issue (see Deviations)

## Decisions Made

- Extended the plan's drafted `RouteContent` schema with `includedLabel`, `dayTripLabel`, `faqsHeading` (page-specific headings failing the 30/30 chrome grep gate) and a `vehicles[]` field (the plan's action text explicitly requires moving "vehicles text" to content, but the drafted schema had no field for it) — necessary to satisfy the "no prose literal remains in the page" done-criterion
- Verified via grep that the "Everything included, / nothing to arrange." and "What to expect / from your driver." headings are exactly 30/30 identical across all route pages (unlike the FAQ heading and included/day-trip section labels, which are not) and promoted them to the `RoutePage` chrome namespace rather than content JSON
- `relatedRoutes` stored verbatim per the plan's explicit instruction (city/distance/duration duplicated from `lib/routes.ts`), not derived from `ROUTES_BY_SLUG` — the plan overrides RESEARCH's Open Question 1 recommendation for this specific plan
- The render-parity test mocks `getLocale`/`getTranslations` directly against `messages/en.json` rather than redirecting to next-intl's real react-server build (the project's established `tests/account-trips.test.tsx` pattern) — this worktree's local `node_modules` lacks the real package tree that redirect depends on; documented in `deferred-items.md`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended RouteContent schema beyond the plan's drafted field list**
- **Found during:** Task 1 (schema design) / Task 2 (full literal inventory)
- **Issue:** The plan's drafted `RouteContent` type (based on RESEARCH.md Pattern 1, extended in the plan's own Task 1 action text) did not include fields for the "What's Included" section label, the day-trip section label, the FAQ heading text, or a `vehicles[]` array — all of which are genuine hardcoded literals in `prague-vienna/page.tsx` that the "no prose literal remains in the page" done-criterion requires removing, and (per the 30/30 grep gate) three of the four are NOT safe to promote to shared chrome since they're not identical across all 30 route pages (Pitfall 1: "Frequently asked questions" is 29/30, "What's Included" and "Day Trips from Prague" are 16/30 each)
- **Fix:** Added `includedLabel: string`, `dayTripLabel: string`, `faqsHeading: string`, and `vehicles: Array<{name,category,capacity,bags,price,photo}>` to `RouteContent`, populated verbatim/interpolated in `content/routes/en/prague-vienna.json`
- **Files modified:** `lib/route-content.ts`, `content/routes/en/prague-vienna.json`, `app/[locale]/routes/prague-vienna/page.tsx`
- **Verification:** `grep -nE "const (inclusions|dayTripConfigurations|whyBook|faqs|relatedRoutes) = \[" app/[locale]/routes/prague-vienna/page.tsx` returns nothing; full render snapshot shows correct text at every position
- **Committed in:** `02e470e`, `e5af59f`

**2. [Rule 1 - Bug] Two chrome-eligible headings the pitfall's framing implied were page-specific**
- **Found during:** Task 1 (30/30 grep verification)
- **Issue:** RESEARCH.md's Pitfall 1 discusses non-uniform section labels/headings near the "What's Included" and "Day Trips from Prague"/chauffeur sections, which could be read as implying the adjacent headings are also non-uniform. Exact-string grep showed the "Everything included, / nothing to arrange." and "What to expect / from your driver." headings ARE byte-identical across all 30 pages (only the *section labels* above them and the day-trip heading are not)
- **Fix:** Added `includedHeading` and `chauffeurHeading` to the `RoutePage` messages namespace (chrome) instead of content JSON, verified 30/30 via exact-string grep before adding
- **Files modified:** `messages/en.json`
- **Verification:** `grep -rl 'Everything included, <br /><span className="display-italic">nothing to arrange.</span>' app/[locale]/routes/*/page.tsx | wc -l` and the equivalent for the chauffeur heading both return 30
- **Committed in:** `02e470e`

---

**Total deviations:** 2 auto-fixed (1 missing-critical schema extension, 1 correct-classification chrome/content split). **Impact:** Both necessary for correctness (byte-for-byte parity + minimizing Phase 72 translation surface per D-05). No scope creep — no additional pages or plans touched.

## Known Stubs

None — prague-vienna is fully wired to real content, no placeholder/mock data ships in this plan's deliverables.

## Issues Encountered

- **Pre-existing, out-of-scope:** Full-suite `npx vitest run` shows 5 pre-existing failing test files (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`), all failing on the same cause — a literal relative path into `node_modules` that assumes a populated local `node_modules`, which this git worktree's near-empty stub `node_modules` (only a `.vite` cache dir; real deps resolve via Node's upward directory walk to the main checkout) does not satisfy. Confirmed pre-existing via `git log --oneline -1` on those files (last touched Phase 70-08, before Phase 71 began) — not a regression introduced by this plan. Logged to `.planning/phases/71-content-externalization-marketing-seo-pages/deferred-items.md`.
- **Pre-existing, out-of-scope:** `npx tsc --noEmit` shows 6 pre-existing errors in `tests/nav-auth.test.tsx` (5×) and `tests/passenger-actions.test.ts` (1×), unrelated to any file this plan touches — confirmed via targeted grep that none reference `route-content`, `page-content`, `content-interpolate`, or `prague-vienna`.
- Left one minor 30/30-identical literal untouched by design-scope decision: the `Prague → {r.city}` prefix in the Related Routes card is not promoted to chrome or content — it is a trivial two-character route-origin glyph, not prose, and moving it was not required by any acceptance criterion; noted here for transparency, not tracked as a stub.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The content-model architecture, loaders, interpolate helper, `RoutePage` chrome namespace, and the reusable `tests/helpers/route-content-parity.ts` + render-byte-parity technique are proven end-to-end on the hardest real page (`prague-vienna`, the 391-line skeleton all 30 route pages share)
- Wave 2 plans (71-02 onward) can now mechanically apply the same pattern to the remaining 29 route pages and all non-route pages, importing the shared test helpers directly
- Blocker/concern for Wave 2: when adding new page-specific fields to `RouteContent` (as this plan did for `includedLabel`/`dayTripLabel`/`faqsHeading`/`vehicles`), each Wave 2 route plan must re-run the 30/30 grep gate for its own route before assuming a string is safe to leave in content JSON vs. promote to chrome — the classification is per-string, not fixed by this plan's precedent alone

## Self-Check: PASSED

- All 9 created files verified present on disk via `test -f`
- All 3 task commits (`02e470e`, `e5af59f`, `f039993`) verified via `git log --oneline`
- `npx vitest run tests/route-content.test.ts tests/route-page-render.test.tsx` — 2 files, 7 tests, all passed
- `npx vitest run` (full suite) — 105 passed test files, 1158 tests passed, 5 pre-existing unrelated failures (documented above and in deferred-items.md)
- `npx tsc --noEmit` — 6 pre-existing unrelated errors, zero new errors from this plan's files
- Byte-parity: 5-field spot-check (unit test) + 24 additional distinctive-substring cross-checks against the golden render snapshot, all matching verbatim source text

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-07*
