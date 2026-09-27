---
phase: 71-content-externalization-marketing-seo-pages
plan: 05
subsystem: content-i18n
tags: [next-intl, content-model, page-content, json, seo, jsonld, services]

# Dependency graph
requires:
  - phase: 71-content-externalization-marketing-seo-pages
    provides: "getPageContent(page, locale) loader with EN-fallback and segment-wise path-traversal + locale allowlist validation (71-01), interpolate(template, values) price-token substitution helper"
provides:
  - "content/pages/en/services.json, content/pages/en/services/city-rides.json, content/pages/en/services/concierge.json — first three getPageContent consumers proving the non-route (bespoke) content-model pattern"
  - "Per-page narrow content types (ServicesHubContent, CityRidesContent, ConciergeContent) — the pattern for Pitfall 4 (no universal PageContent interface across bespoke pages)"
  - "Nested page-key precedent (services/city-rides, services/concierge) exercising the Wave 1 loader's segment-wise path-traversal guard on a real nested key"
affects: [71-06, 71-07, 71-08, 71-09]

# Actuals (#2632)
actuals:
  tokens: 22540
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getPageContent(page, locale) + getLocale() + interpolate() consumed identically to the route-page pattern (71-01), but each bespoke page gets its own narrow local content type instead of a shared interface"
    - "Nested page keys (services/<slug>) mirror the URL structure; the Wave 1 loader validates each path segment independently before path.join"
    - "Per-request dynamic prices (pricing-config/DB-sourced, not per-route fixed prices) still flow through the same {token} interpolation contract as route pages — content JSON stores the template, the page computes the live value and interpolates at render time"

key-files:
  created:
    - content/pages/en/services.json
    - content/pages/en/services/city-rides.json
    - content/pages/en/services/concierge.json
    - tests/services-a.test.ts
  modified:
    - app/[locale]/services/page.tsx
    - app/[locale]/services/city-rides/page.tsx
    - app/[locale]/services/concierge/page.tsx

key-decisions:
  - "generateMetadata converted from a static `export const metadata` object (hub, concierge) to an async `generateMetadata()` function reading from getLocale()+getPageContent, matching the function-based pattern city-rides already used for its dynamic price — keeps all 3 pages consistent and future-proofs Phase 72 per-locale metadata, with EN output byte-identical today"
  - "concierge's default export was converted from a synchronous function to `async function` to allow `getLocale()` — the page previously had no await calls at all"
  - "Discovered and preserved 3 DISTINCT description strings on the concierge page (metadata.description, metadata.openGraph.description, and the in-component Service JSON-LD description) that read as near-duplicates but differ verbatim in wording — stored as three separate content fields (metadata.description, metadata.ogDescription, serviceDescription) rather than collapsing them"
  - "Left breadcrumbSchema hardcoded/untouched on all 3 pages (locale-invariant structural JSON-LD, same treatment as prague-vienna's BreadcrumbList in 71-01) — only the Service/ItemList/FAQPage JSON-LD, which is built from the same visible-copy arrays, is now content-sourced"
  - "Left the pre-existing inline JSON.stringify(...) JSON-LD writes on all 3 pages without the </script>-escaping helper — per the plan's threat model (T-71-02), this is the 'pre-existing inline route/service JSON.stringify... left as-is (out of scope)' disposition, since only the underlying data source changed (literal consts to content-loaded consts), not the JSON-LD construction pattern itself"
  - "Did not fix pre-existing `<a>`-instead-of-`<Link>` ESLint violations on all 3 pages (6-16 errors per file) — confirmed via `npx eslint` on the still-unconverted app/[locale]/services/airport-transfer/page.tsx that the identical violation pattern exists repo-wide; out of scope per the scope-boundary rule and D-04 (JSX render tree left untouched)"

patterns-established:
  - "Bespoke non-route pages import getPageContent + getLocale (+ interpolate when the page has dynamic/DB-sourced prices), define one local narrow content type per page, and keep every existing JSX/component structure untouched — literal variable names (services, trust, servicesFaqs, features, editorial, useCases, handles, howItWorks, faqs) now populated from content.* instead of local consts"
  - "tests/services-a.test.ts groups one describe() block per converted page (EN-fallback + 3-string spot-check), extended incrementally as each Wave-2 services plan lands, mirroring tests/route-content.test.ts's per-slug organization"

requirements-completed: [CNT-02]

coverage:
  - id: D1
    description: "Services hub page (app/[locale]/services/page.tsx) renders its hero, service cards, trust block, FAQs, and CTA from content/pages/en/services.json via getPageContent, with no user-facing body-copy literal remaining in the page"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "tests/services-a.test.ts#getPageContent('services') — hub page > spot-checks 3 representative body strings against verbatim originals"
        status: pass
      - kind: other
        ref: "grep -c on 3 removed hub sentences + 'use client' in app/[locale]/services/page.tsx == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "city-rides and concierge service pages render their bodies from content/pages/en/services/<slug>.json via getPageContent, each with its own narrow content type (Pitfall 4), no shared PageContent interface or <PageBody> renderer introduced"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "tests/services-a.test.ts#getPageContent('services/city-rides') and #getPageContent('services/concierge') — 3-string spot-checks each"
        status: pass
      - kind: other
        ref: "grep -c on removed sentences + 'use client' in both page.tsx files == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "getPageContent(page,'en') resolves under EN fallback for all 3 pages across all 7 locales (no non-EN content authored this plan) and the nested services/<slug> key passes the Wave 1 segment-wise path-traversal guard"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "tests/services-a.test.ts#EN-fallback: getPageContent(page, 'ru') deep-equals the 'en' result (x3)"
        status: pass
      - kind: unit
        ref: "tests/services-a.test.ts#path-traversal: getPageContent('services/../x', 'en') throws"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rendered English output (visible copy + Service/ItemList/FAQPage JSON-LD + generateMetadata title/description/OG) is byte-for-byte unchanged for all 3 pages at their current URLs"
    requirement: "CNT-02"
    verification: []
    human_judgment: true
    rationale: "No full-page render/snapshot harness exists for non-route pages in this plan (the plan's must_haves marks this truth as verification: backstop, not an automated task deliverable). Byte parity was manually verified per literal via exact-position text-for-{content.x} substitution preserving all original JSX whitespace/newline structure, plus 9 unit-test spot-checks (3 per page) against verbatim source strings and 6 zero-hit spot-greps confirming removal from page.tsx — but no automated end-to-end render diff was built, so a human/backstop check should confirm full visual parity."
  - id: D5
    description: "npx vitest run full suite is green apart from pre-existing, out-of-scope failures"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "npx vitest run — 109 passed test files (1270 tests), 5 pre-existing unrelated failures (account-trips, auth-customer, login-actions, passenger-actions, profile-actions — documented in 71-01-SUMMARY.md as a worktree node_modules issue predating this plan)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-09-11
status: complete
---

# Phase 71 Plan 05: Services Hub + City-Rides + Concierge Content Externalization Summary

**Services hub, city-rides, and concierge pages now render their long-form bodies from `content/pages/en/` via `getPageContent`, each with its own narrow bespoke content type and byte-identical English output preserved through exact-position JSX substitution.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-11 (approx.)
- **Completed:** 2026-09-11
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Built `content/pages/en/services.json`, extracting the hub page's hero, 8 service cards, 3 trust items, 6 FAQs (with `{airportFrom}`/`{hourlyFrom}`/`{cheapestIntercity}`/`{budapest}`/`{vienna}`/`{berlin}`/`{munich}`/`{kutnaHora}`/`{sClassFallback}`/`{vClassFallback}` price tokens), and CTA copy — converted `app/[locale]/services/page.tsx` to consume it via `getPageContent('services', locale)` + `getLocale()`, narrowed to a local `ServicesHubContent` type, with `generateMetadata` converted from a static object to an async function
- Built `content/pages/en/services/city-rides.json` (nested key, per RESEARCH Open Q3) — hero, price-callout copy, 4 features, 3-paragraph editorial, 6 use cases, CTA — converted `app/[locale]/services/city-rides/page.tsx` via `getPageContent('services/city-rides', locale)`, narrowed to `CityRidesContent`, with dynamic hourly-rate prices (`vClassHourly`, `firstClassHourly`) interpolated into content templates at render time
- Built `content/pages/en/services/concierge.json` — hero, 8 "what your chauffeur handles" items, 3-paragraph editorial, 3 how-it-works steps, 4 cross-service cards, 6 FAQs, CTA — converted `app/[locale]/services/concierge/page.tsx` (default export made `async`) via `getPageContent('services/concierge', locale)`, narrowed to `ConciergeContent`; preserved 3 genuinely distinct description strings (`metadata.description`, `metadata.ogDescription`, `serviceDescription`) that read as near-duplicates in the source but differ verbatim
- Wrote `tests/services-a.test.ts` (node env, 7 tests total across 3 `describe()` blocks): EN-fallback deep-equality for all 3 pages, 3-string verbatim spot-checks per page (9 total), and a nested-key path-traversal guard assertion (`getPageContent('services/../x', 'en')` throws)
- Verified across all 3 pages: zero remaining hardcoded body-copy literals (spot-grep), zero `use client` directives (loader stays server-side), zero new TypeScript errors, `npx vitest run` full suite green apart from 5 pre-existing unrelated failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize the services hub page** — `4b2ee9d` (feat)
2. **Task 2: Externalize the city-rides service page** — `ab2aa59` (feat)
3. **Task 3: Externalize the concierge service page** — `228e5ee` (feat)

## Files Created/Modified

- `content/pages/en/services.json` — hub page content (hero, 8 services, trust, FAQs, CTA)
- `content/pages/en/services/city-rides.json` — city-rides content (nested key)
- `content/pages/en/services/concierge.json` — concierge content (nested key)
- `app/[locale]/services/page.tsx` — content-model consumer, JSX unchanged, `generateMetadata` now async
- `app/[locale]/services/city-rides/page.tsx` — content-model consumer, JSX unchanged
- `app/[locale]/services/concierge/page.tsx` — content-model consumer, default export now async, JSX unchanged
- `tests/services-a.test.ts` — EN-fallback + spot-check + path-traversal tests for all 3 pages

## Decisions Made

- `generateMetadata` converted from static `export const metadata` (hub, concierge) to async functions reading `getLocale()`+`getPageContent()`, matching city-rides' pre-existing function-based pattern — consistent shape across all 3 pages, future-proofs Phase 72 per-locale metadata, EN output unchanged today
- concierge's default export converted to `async function` solely to allow `getLocale()` (the page had no prior `await` calls)
- Preserved 3 distinct near-duplicate description strings on concierge as separate content fields (`metadata.description`, `metadata.ogDescription`, `serviceDescription`) rather than incorrectly collapsing them into one
- `breadcrumbSchema` left hardcoded/untouched on all 3 pages (locale-invariant structural JSON-LD), matching the 71-01 precedent for `BreadcrumbList`
- Pre-existing inline `JSON.stringify(...)` JSON-LD writes left without the `</script>`-escaping helper — per the plan's T-71-02 disposition ("pre-existing inline route/service JSON.stringify... left as-is"), since only the underlying data source changed, not the JSON-LD construction itself
- Pre-existing `<a>`-instead-of-`<Link>` ESLint violations (6-16 per file) left untouched — confirmed identical violations exist on the still-unconverted `airport-transfer` page, so this is a repo-wide pre-existing pattern out of this plan's scope (D-04: JSX render tree untouched)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 3 pages are fully wired to real content, no placeholder/mock data ships in this plan's deliverables.

## Issues Encountered

- **Pre-existing, out-of-scope:** `npx vitest run` shows the same 5 pre-existing failing test files documented in 71-01-SUMMARY.md (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) — a worktree `node_modules` resolution issue unrelated to this plan's files.
- **Pre-existing, out-of-scope:** `npx tsc --noEmit` shows the same 6 pre-existing unrelated errors (`tests/nav-auth.test.tsx` ×5, `tests/passenger-actions.test.ts` ×1) documented in 71-01-SUMMARY.md; confirmed zero new errors from any file this plan touches.
- No automated end-to-end render/snapshot harness was built for these 3 non-route pages in this plan (unlike prague-vienna's `tests/route-page-render.test.tsx` in 71-01) — byte parity relies on exact-position text-for-`{content.x}` substitution (preserving all original JSX whitespace) plus the 9 spot-check unit tests and 6 zero-hit spot-greps. The plan's own `must_haves` marks full byte-parity as `verification: backstop` rather than an automated-task deliverable, so this is expected, not a gap — flagged in the `coverage` block above (D4, `human_judgment: true`) for the verifier.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The `getPageContent` non-route pattern is now proven on 3 real bespoke pages (1 hub + 2 subpages), including a genuinely nested page key (`services/<slug>`) exercising the Wave 1 loader's segment-wise path-traversal guard
- Remaining Wave 2 non-route pages (71-06 onward: remaining services subpages, about/faq/contact/corporate, legal pages) can mechanically apply the same per-page narrow-type pattern
- Blocker/concern for downstream plans: each bespoke page must be individually audited for near-duplicate-but-distinct strings (as found on concierge's 3 description variants) before assuming any two similar-looking literals are safe to collapse into one content field

## Self-Check: PASSED

- All 4 created files verified present on disk via `Read`/`Write` tool state
- All 3 task commits (`4b2ee9d`, `ab2aa59`, `228e5ee`) verified via `git log --oneline`
- `npx vitest run tests/services-a.test.ts` — 7 tests, all passed
- `npx vitest run` (full suite) — 109 passed test files (1270 tests), 5 pre-existing unrelated failures (documented above)
- `npx tsc --noEmit` — 6 pre-existing unrelated errors, zero new errors from this plan's files
- `npx eslint` on all 3 converted pages — only pre-existing `<a>`-vs-`<Link>` violations, confirmed present identically on an unconverted sibling page (`airport-transfer`)
- Zero remaining body-copy literals: 6 spot-greps (2 per page) across all 3 converted `page.tsx` files return 0 matches
- Zero `use client` directives in any of the 3 converted pages (loader stays server-side)

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-11*
