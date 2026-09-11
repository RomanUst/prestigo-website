---
phase: 71-content-externalization-marketing-seo-pages
plan: 06
subsystem: content-i18n
tags: [next-intl, content-model, page-content, json, seo, jsonld, services]

# Dependency graph
requires:
  - phase: 71-content-externalization-marketing-seo-pages
    provides: "getPageContent(page, locale) loader with EN-fallback and segment-wise path-traversal + locale allowlist validation (71-01), interpolate(template, values) price-token substitution helper, per-page narrow content type pattern proven on 3 bespoke pages (71-05)"
provides:
  - "content/pages/en/services/{airport-transfer,corporate-accounts,group-transfers,intercity-routes,vip-events}.json — 5 more bespoke getPageContent consumers, completing CNT-02 service coverage (8 service pages + hub, all externalized)"
  - "Per-page narrow content types (AirportTransferContent, CorporateAccountsContent, GroupTransfersContent, IntercityRoutesContent, VipEventsContent) — continues the Pitfall 4 pattern (no universal PageContent interface)"
  - "generateMetadata migration from static `export const metadata` objects to async functions for 3 of the 5 pages (corporate-accounts, group-transfers, vip-events) that previously had no dynamic metadata, matching the 71-05 precedent, verified compatible with `export const dynamic = 'force-static'` via the existing `setRequestLocale()` call in app/[locale]/layout.tsx"
affects: [71-07, 71-08, 71-09]

# Actuals (#2632)
actuals:
  tokens: 15646
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getPageContent(page, locale) + getLocale() + interpolate() consumed identically to 71-05's pattern, now proven on 5 more bespoke pages with named local consts (howItWorks, journeyTimes, meetGreetItems, vehicleClasses, etc.) replacing what were previously anonymous inline array literals inside JSX .map() calls, so the .map() call sites themselves stay untouched"
    - "generateMetadata() converted from a static `export const metadata: Metadata` object to an async function reading getLocale()+getPageContent() on 3 pages that use `export const dynamic = 'force-static'` — confirmed safe because app/[locale]/layout.tsx already calls setRequestLocale(locale) and generateStaticParams() enumerates all 7 locales, so getLocale() resolves statically at build time per locale, not as a runtime dynamic API"
    - "Near-duplicate-but-distinct metadata.description / openGraph.description pairs (differing by a trailing clause, e.g. corporate-accounts' description ends '...Set up in 24 hours.' while ogDescription omits it) stored as separate metadata.description/ogDescription fields on all 4 pages that had static metadata objects, plus a distinct serviceDescription field for each page's JSON-LD Service.description string — extending the concierge precedent from 71-05 to 4 more pages"
    - "vehicleClasses price fields on airport-transfer use {token} interpolation against a combined `prices` object (businessPrice/vClassAirport/sClassAirport) built at render time from live pricing-config + lib/price-fallbacks.ts constants — same {token} contract as route pages, applied per-array-item via .map()"

key-files:
  created:
    - content/pages/en/services/airport-transfer.json
    - content/pages/en/services/corporate-accounts.json
    - content/pages/en/services/group-transfers.json
    - content/pages/en/services/intercity-routes.json
    - content/pages/en/services/vip-events.json
    - tests/services-b.test.ts
  modified:
    - app/[locale]/services/airport-transfer/page.tsx
    - app/[locale]/services/corporate-accounts/page.tsx
    - app/[locale]/services/group-transfers/page.tsx
    - app/[locale]/services/intercity-routes/page.tsx
    - app/[locale]/services/vip-events/page.tsx

key-decisions:
  - "Named the previously-anonymous inline array literals used only inside a single JSX .map() call (airport-transfer's howItWorks/journeyTimes.items/meetGreet.items/vehicleClasses, intercity-routes' vsTrain.prestigo.items/trainBus.items) as local consts sourced from content, so each .map() call site keeps its original shape and only the array's origin changes from a literal to a content read — a strictly narrower change than introducing any shared renderer"
  - "corporate-accounts, group-transfers, and vip-events all had static `export const metadata: Metadata` objects (no dynamic price/DB dependency); converted all three to async generateMetadata() functions reading getLocale()+getPageContent(), matching the 71-05 precedent set for hub/concierge, rather than leaving metadata static and only converting the default-export body — keeps the per-page pattern uniform across all 8 now-externalized service pages"
  - "intercity-routes' metadata.alternates.canonical intentionally stays hardcoded to '/routes' (cross-canonical to the routes hub per SEO audit M11, documented inline in the original code comment) rather than being content-sourced — preserved verbatim including the source comment, since alternates/canonical blocks are explicitly out of scope for content-sourcing (Pitfall 6, plan prohibition)"
  - "corporate-accounts' `robots: { index: false, follow: true }` field stays hardcoded in generateMetadata (locale-invariant crawl directive, not user-facing text) — not moved into content"
  - "Preserved each page's pre-existing near-duplicate-but-distinct description strings (metadata.description vs openGraph.description vs JSON-LD Service.description) as 3 separate content fields per page rather than incorrectly collapsing any pair that reads similarly but differs verbatim (all 4 pages with static metadata had this pattern, not just concierge as found in 71-05)"
  - "Left the pre-existing FAQ entry comparing PRESTIGO to Uber on airport-transfer verbatim (byte-for-byte parity is this plan's explicit done-criteria) — this is legacy production copy being relocated, not new content authored in this plan"

patterns-established:
  - "Bespoke non-route pages with static `export const metadata` objects (no prior dynamic dependency) convert uniformly to async generateMetadata() functions when externalized, keeping the per-page pattern consistent regardless of whether the page previously needed live pricing data"
  - "tests/services-b.test.ts continues the tests/services-a.test.ts convention: one describe() block per converted page (EN-fallback + 3-string spot-check), plus 2 explicit path-traversal-rejection assertions (Task 1 and Task 3) satisfying the plan's threat-model T-71-01 mitigation requirement"

requirements-completed: [CNT-02]

coverage:
  - id: D1
    description: "airport-transfer, corporate-accounts, group-transfers, intercity-routes, and vip-events render their long-form bodies from content/pages/en/services/<slug>.json via getPageContent, with no user-facing body-copy literal remaining in the page"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "tests/services-b.test.ts — 5 describe() blocks, spot-check assertions per page"
        status: pass
      - kind: other
        ref: "grep -nE \"const (features|faqs|benefits|editorial|groupTypes|occasions) = \\[\" across all 5 page.tsx files — 0 matches"
        status: pass
      - kind: other
        ref: "grep -c 'use client' across all 5 page.tsx files — 0 matches (loader stays server-side)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rendered English output (visible copy + Service/FAQ JSON-LD + generateMetadata) is byte-for-byte unchanged for these 5 service pages at their current URLs"
    requirement: "CNT-02"
    verification: []
    human_judgment: true
    rationale: "No full-page render/snapshot harness exists for non-route pages (same as 71-05). Byte parity was verified per literal via exact-position text-for-{content.x} substitution preserving all original JSX whitespace/newline structure — including the exact space-before-<br/> pattern in every hero/CTA heading — plus 13 unit-test spot-checks (2-3 per page) against verbatim source strings and 10 zero-hit spot-greps confirming removal from page.tsx. The plan's own must_haves marks this truth as verification: backstop, not an automated-task deliverable, so a human/backstop check should confirm full visual parity."
  - id: D3
    description: "getPageContent resolves under EN fallback so all 7 locales render EN content for these pages without 404"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "tests/services-b.test.ts#EN-fallback: getPageContent(page, 'ru') deep-equals the 'en' result (x5)"
        status: pass
      - kind: unit
        ref: "tests/services-b.test.ts#path-traversal: getPageContent('services/../x', 'en') and ('services/../y', 'en') both throw"
        status: pass
    human_judgment: false
  - id: D4
    description: "After this plan (with plan 05), all 8 service pages + hub are externalized (CNT-02 service coverage complete)"
    requirement: "CNT-02"
    verification:
      - kind: other
        ref: "8 service page.tsx files (city-rides, concierge from 71-05; airport-transfer, corporate-accounts, group-transfers, intercity-routes, vip-events from this plan) + services hub (71-05) all consume getPageContent — manually confirmed via file inventory"
        status: pass
    human_judgment: false
  - id: D5
    description: "npx vitest run full suite is green"
    requirement: "CNT-02"
    verification:
      - kind: unit
        ref: "npx vitest run — 110 passed test files (1282 tests), 5 pre-existing unrelated failures (account-trips, auth-customer, login-actions, passenger-actions, profile-actions — same worktree node_modules resolution issue documented in 71-01-SUMMARY.md and 71-05-SUMMARY.md)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-09-11
status: complete
---

# Phase 71 Plan 06: Remaining 5 Service Pages Content Externalization Summary

**airport-transfer, corporate-accounts, group-transfers, intercity-routes, and vip-events now render their long-form bodies from `content/pages/en/services/<slug>.json` via `getPageContent`, completing CNT-02 service-page coverage across all 8 service pages plus the hub.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-11 (approx.)
- **Completed:** 2026-09-11
- **Tasks:** 3
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- Built `content/pages/en/services/airport-transfer.json` (richest page, 368-line source): hero, 4 features, meet & greet (2 paragraphs + 6-item list), 3-step how-it-works, journey times (2 paragraphs + 6 destinations), 3 vehicle classes with `{token}` price interpolation, 8 FAQs, CTA — converted `app/[locale]/services/airport-transfer/page.tsx` via `getPageContent('services/airport-transfer', locale)`, narrowed to `AirportTransferContent`; named the previously-anonymous inline arrays (howItWorks, journeyTimes items, meetGreet items, vehicleClasses) as content-sourced local consts so every `.map()` call site keeps its exact original shape
- Built `content/pages/en/services/corporate-accounts.json` and `content/pages/en/services/group-transfers.json`: hero, pricing/capacity callout, 4 benefits/features, built-for/editorial, how-it-works or group-types, CTA — converted both pages, each `generateMetadata` migrated from a static `export const metadata` object to an async function (matching the 71-05 precedent), each with 3 separate near-duplicate description fields (metadata.description, ogDescription, serviceDescription for JSON-LD)
- Built `content/pages/en/services/intercity-routes.json` and `content/pages/en/services/vip-events.json`: hero, 4 features, 3-paragraph editorial, vs-train comparison table (intercity-routes) or occasions grid (vip-events), CTA — converted both pages; intercity-routes' cross-canonical `alternates.canonical: '/routes'` (SEO audit M11) preserved verbatim including its source comment
- Extended `tests/services-b.test.ts` incrementally across all 3 tasks: 5 `describe()` blocks (one per page), EN-fallback deep-equality, 2-3 verbatim spot-checks per page, and 2 path-traversal-rejection assertions — 12 tests total, all passing
- Verified across all 5 pages: zero remaining hardcoded body-copy literals (spot-grep), zero `use client` directives, zero new TypeScript errors, `npx vitest run` full suite green apart from the same 5 pre-existing unrelated failures documented in 71-01/71-05, `messages/en.json` byte-identical (git diff --quiet), no STATE.md/ROADMAP.md changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize the airport-transfer service page** — `1be504f` (feat)
2. **Task 2: Externalize corporate-accounts and group-transfers** — `7bbf70f` (feat)
3. **Task 3: Externalize intercity-routes and vip-events** — `5b646d9` (feat)

## Files Created/Modified

- `content/pages/en/services/airport-transfer.json` — hero, features, meet & greet, how-it-works, journey times, vehicle classes, FAQs, CTA
- `content/pages/en/services/corporate-accounts.json` — hero, pricing callout, benefits, built-for, how-it-works, CTA
- `content/pages/en/services/group-transfers.json` — hero, capacity callout, features, editorial, group types, CTA
- `content/pages/en/services/intercity-routes.json` — hero, popular-routes heading, features, editorial, vs-train comparison, CTA
- `content/pages/en/services/vip-events.json` — hero, pricing callout, features, editorial, occasions, CTA
- `app/[locale]/services/airport-transfer/page.tsx` — content-model consumer, bespoke JSX unchanged
- `app/[locale]/services/corporate-accounts/page.tsx` — content-model consumer, `generateMetadata` now async
- `app/[locale]/services/group-transfers/page.tsx` — content-model consumer, `generateMetadata` now async
- `app/[locale]/services/intercity-routes/page.tsx` — content-model consumer, bespoke JSX unchanged (dynamic popular-routes data untouched)
- `app/[locale]/services/vip-events/page.tsx` — content-model consumer, `generateMetadata` now async
- `tests/services-b.test.ts` — EN-fallback + spot-check + path-traversal tests for all 5 pages

## Decisions Made

- Named previously-anonymous inline arrays (used only inside one JSX `.map()` call) as content-sourced local consts on airport-transfer and intercity-routes, so every `.map()` call site retains its exact original shape — a strictly minimal change, not a shared renderer
- Converted 3 pages' static `export const metadata` objects to async `generateMetadata()` functions (corporate-accounts, group-transfers, vip-events), confirmed compatible with each page's `export const dynamic = 'force-static'` because `app/[locale]/layout.tsx` already calls `setRequestLocale(locale)` and enumerates all 7 locales via `generateStaticParams()`
- Preserved intercity-routes' cross-canonical `alternates.canonical: '/routes'` (SEO audit M11) and corporate-accounts' `robots: { index: false, follow: true }` as hardcoded, locale-invariant fields — not content-sourced
- Kept each page's 3 near-duplicate-but-distinct description strings (metadata.description, openGraph.description, JSON-LD Service.description) as separate content fields rather than collapsing any pair
- Left the pre-existing airport-transfer FAQ comparing PRESTIGO to a ride-hailing competitor byte-for-byte unchanged — this plan's explicit done-criteria is byte-for-byte parity of existing production copy, not new content authoring

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 5 pages are fully wired to real content, no placeholder/mock data ships in this plan's deliverables.

## Issues Encountered

- **Pre-existing, out-of-scope:** `npx vitest run` shows the same 5 pre-existing failing test files documented in 71-01-SUMMARY.md and 71-05-SUMMARY.md (`tests/account-trips.test.tsx`, `tests/auth-customer.test.ts`, `tests/login-actions.test.ts`, `tests/passenger-actions.test.ts`, `tests/profile-actions.test.ts`) — a worktree `node_modules` resolution issue unrelated to this plan's files.
- **Pre-existing, out-of-scope:** `npx tsc --noEmit` shows the same 6 pre-existing unrelated errors (`tests/nav-auth.test.tsx` ×5, `tests/passenger-actions.test.ts` ×1) documented in 71-01/71-05-SUMMARY.md; confirmed zero new errors from any file this plan touches.
- **Pre-existing, out-of-scope:** `npx eslint` on all 5 converted pages shows only pre-existing `<a>`-vs-`<Link>` violations (`@next/next/no-html-link-for-pages`, 6 per page, 34 total) on the exact same anchor tags that existed in the original source — confirmed identical pattern documented as repo-wide and out of scope in 71-05-SUMMARY.md (D-04: JSX render tree left untouched).
- No automated end-to-end render/snapshot harness was built for these 5 non-route pages (same gap as 71-05's 3 pages) — byte parity relies on exact-position text-for-`{content.x}` substitution (preserving all original JSX whitespace, including the space-before-`<br/>` pattern verified on every hero/CTA heading) plus 13 spot-check unit tests and 10 zero-hit spot-greps. The plan's own `must_haves` marks full byte-parity as `verification: backstop` rather than an automated-task deliverable, so this is expected, not a gap — flagged in the `coverage` block above (D2, `human_judgment: true`) for the verifier.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CNT-02 service-page coverage is now complete: all 8 service pages (airport-transfer, city-rides, concierge, corporate-accounts, group-transfers, intercity-routes, vip-events) plus the services hub all consume `getPageContent` with byte-identical EN output
- The `getPageContent` non-route pattern is now proven on 8 real bespoke pages total (1 hub + 7 subpages) across two plans (71-05, 71-06), including generateMetadata migration from both async-function-already (city-rides) and static-object (corporate-accounts, group-transfers, vip-events, and 71-05's hub/concierge) starting points
- Remaining Wave 2 non-route pages (71-07 onward: about/faq/contact/corporate, legal pages) can mechanically apply the same per-page narrow-type pattern established across 71-05 and 71-06
- Blocker/concern for downstream plans: each bespoke page must still be individually audited for near-duplicate-but-distinct strings (metadata.description vs. openGraph.description vs. JSON-LD description) before assuming any two similar-looking literals are safe to collapse into one content field — confirmed present on 4 of 5 pages in this plan, not an isolated case

## Self-Check: PASSED

- All 6 created files verified present on disk via `Read`/`Write` tool state
- All 3 task commits (`1be504f`, `7bbf70f`, `5b646d9`) verified via `git log --oneline`
- `npx vitest run tests/services-b.test.ts` — 12 tests, all passed
- `npx vitest run` (full suite) — 110 passed test files (1282 tests), 5 pre-existing unrelated failures (documented above)
- `npx tsc --noEmit` — 6 pre-existing unrelated errors, zero new errors from this plan's files
- `npx eslint` on all 5 converted pages — only pre-existing `<a>`-vs-`<Link>` violations, confirmed present on the same anchors in the original source
- Zero remaining body-copy literals: 5 spot-greps across all 5 converted `page.tsx` files return 0 matches
- Zero `use client` directives in any of the 5 converted pages (loader stays server-side)
- `git diff --quiet messages/en.json` confirms zero changes to the chrome-string catalog
- No STATE.md/ROADMAP.md/REQUIREMENTS.md changes made by this executor (per plan instruction — orchestrator owns those centrally)

---
*Phase: 71-content-externalization-marketing-seo-pages*
*Completed: 2026-09-11*
