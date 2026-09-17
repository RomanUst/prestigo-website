---
phase: 69-string-externalization-ui-chrome
plan: 01
subsystem: i18n
tags: [next-intl, i18n, nav, react, vitest]

requires:
  - phase: 68-i18n-foundation-routing
    provides: i18n/routing.ts (routing/locales/rtlLocales/stripLocalePrefix), composed middleware, split root layouts, next-intl@4.14.2 already installed
provides:
  - "messages/en.json — Nav namespace, establishing the LOCKED namespace/key/array/ICU/stub convention for Phases 69-71"
  - "6 byte-identical EN-copy stub files (messages/{ru,es,fr,ar,hi,zh}.json)"
  - "i18n/request.ts real catalog loader (messages/${locale}.json, no try/catch needed)"
  - "i18n/routing.ts createNavigation(routing) exports — Link, redirect, usePathname, useRouter, getPathname (I18N-04, closes Phase 68 IN-01)"
  - "components/SiteChrome.tsx async, wraps body in NextIntlClientProvider (shared by [locale] and (internal) trees)"
  - "app/(internal)/layout.tsx async (ripple from SiteChrome)"
  - "vitest.config.ts server.deps.inline: ['next-intl']"
  - "tests/helpers/renderWithIntl.tsx — shared NextIntlClientProvider test wrapper, reused by later component-plan tests"
  - "Nav fully externalized via useTranslations('Nav') + locale-aware Link/usePathname — the tracer proof for the whole phase"
affects: [70-string-externalization-booking-account, 71-content-externalization-marketing-seo-pages]

actuals:
  tokens: 5944
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Message catalog namespace = component name in PascalCase; sub-keys camelCase, semantic (not literal-text-derived)"
    - "Ordered/repeated UI lists are JSON arrays (t.raw('key')), paired by index with a static (untranslated) hrefs/config array in code — never comma-joined strings"
    - "6 EN-copy stub locale files (not a request.ts try/catch) so every configured locale renders without MISSING_MESSAGE; re-synced (cp) after every catalog change until Phase 72/73 translate them"
    - "NextIntlClientProvider wired once in SiteChrome.tsx (shared by both root layouts), not duplicated per-layout"
    - "createNavigation(routing) is the single-source locale-aware Link/usePathname — never hand-roll ${locale}${href} concatenation"
    - "renderWithIntl(ui, { locale, messages }) test helper wraps NextIntlClientProvider — default locale 'en' + messages/en.json"

key-files:
  created:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/helpers/renderWithIntl.tsx
    - tests/i18n-navigation.test.tsx
  modified:
    - i18n/request.ts
    - i18n/routing.ts
    - components/SiteChrome.tsx
    - app/(internal)/layout.tsx
    - vitest.config.ts
    - components/Nav.tsx
    - tests/nav-auth.test.tsx

key-decisions:
  - "Task 1 checkpoint (blocking-human, pre-approved by operator as Option A — see full convention text below) locks the namespace/key/array/ICU/stub convention before any key was authored"
  - "Nav.tsx's NAV_LINKS holds only the 6 static hrefs (routes, not translatable copy); labels come from t.raw('items') in messages/en.json, index-paired — avoids over-modeling href+label as one translatable unit"
  - "NAV_LINKS typed as ReadonlyArray<{ href: string; isNew?: boolean }> (not `as const`) — an `as const` tuple produces a discriminated union where TS rejects `link.isNew` on members lacking that property"

patterns-established:
  - "Message catalog convention (namespace/key/array/ICU/stub) — see 'Approved Convention' section below, reused verbatim by 70/71"
  - "renderWithIntl test harness — every future client-component test wraps render(<X/>) with renderWithIntl instead of raw testing-library render"

requirements-completed: [STR-01]

coverage:
  - id: D1
    description: "messages/en.json (Nav namespace) + 6 EN-copy stub files exist and parse as valid JSON, byte-identical to en.json"
    requirement: STR-01
    verification:
      - kind: other
        ref: "node -e JSON.parse(...) + cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json (all exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "i18n/request.ts loads real catalogs; i18n/routing.ts exports createNavigation's Link/usePathname/redirect/useRouter/getPathname; SiteChrome wraps the client subtree in NextIntlClientProvider"
    requirement: STR-01
    verification:
      - kind: integration
        ref: "npm run build (all 7 locale subpaths prerender, no MISSING_MESSAGE, no async-child build error)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nav renders every string via useTranslations('Nav'), EN byte-identical to the prior hardcoded text; internal links locale-aware"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "tests/nav-auth.test.tsx (8/8 NAV-01/NAV-02 assertions, wrapped in renderWithIntl)"
        status: pass
      - kind: unit
        ref: "tests/i18n-navigation.test.tsx (4/4 — createNavigation Link primitive + Nav-rendered link locale-prefix retention)"
        status: pass
    human_judgment: false
  - id: D4
    description: "EN Nav output byte-for-byte unchanged (visual fidelity of externalized copy)"
    requirement: STR-01
    verification:
      - kind: manual_procedural
        ref: "npm run dev; curl http://localhost:3000/ — confirmed >Services<, >Book now<, >Sign in<, aria-label=\"PRESTIGO — home\" all render identically; curl http://localhost:3000/ru — confirmed href=\"/ru/services\" (locale-prefixed) vs href=\"/services\" on EN root (unprefixed, localePrefix: as-needed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full vitest suite green + npm run build green — no Phase-68 CSP-nonce / Supabase / CSRF / non-bypass regression"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "npx vitest run — 105 test files passed, 1184 tests passed, 0 failed"
        status: pass
      - kind: integration
        ref: "npm run build — exit 0"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-04
status: complete
---

# Phase 69 Plan 01: Wire next-intl Message Pipeline + Externalize Nav (Tracer) Summary

**Full next-intl catalog/provider/navigation pipeline wired end-to-end and proven on Nav — real messages/en.json + 6 stub locales, NextIntlClientProvider in SiteChrome, createNavigation exports closing Phase 68's IN-01 gap, and Nav fully externalized via useTranslations('Nav') with locale-prefix retention locked by an automated test.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-04T13:25:00Z (approx)
- **Completed:** 2026-09-04T13:37:14Z
- **Tasks:** 3 (Task 1 checkpoint pre-approved by operator; Task 2 + Task 3 executed)
- **Files modified:** 16

## Approved Convention (Task 1 — locked verbatim, reused by Phases 70/71)

Operator approved **Option A (approve as specified)** at the Task 1 blocking-human checkpoint:

1. **Top-level namespace** = component name in PascalCase (`Nav`, `Footer`, `Hero`, `Services`, `Fleet`, `HowItWorks`, `Testimonials`, `CookieBanner`, `FeatureStrip`). Hero sub-parts (`HeroTypewriter`/`HeroRating`/`HeroWhatsApp`/`HeroBackground`) share the single `Hero` namespace. `TestimonialsCarousel` shares the single `Testimonials` namespace.
2. **Sub-keys** = camelCase, semantic (e.g. `bookNow`, `ctaHeadlineLine1`) — never derived from the literal English text.
3. **Ordered/repeated UI lists** are JSON arrays (nav items, HeroTypewriter's 5 rotating words, service cards, footer link groups, vehicle feature lists, feature-strip pillars) — never one comma-joined string, so a later phase can reorder per-locale without code churn.
4. **Runtime-interpolated values** use named ICU args: `{price}`, `{year}`, `{count}`, `{n}`. Embedded inline links (CookieBanner Privacy/Legal) use `t.rich` with `<privacy>`/`<terms>` tags.
5. **Stub strategy:** ship 6 byte-identical EN-copy locale files (Option A), NOT a `request.ts` try/catch fallback.

**Out-of-scope this phase (stays hardcoded EN):** `siteMetadata`, `generateMetadata`, JSON-LD, vehicle model names, the chelautotrans legal address block, phone/email/social URLs.

No amendment — approved as specified, no objection raised.

## Accomplishments
- Real message catalog pipeline: `messages/en.json` (Nav namespace) + 6 EN-copy stub locales, loaded by `i18n/request.ts` via `(await import(\`../messages/${locale}.json\`)).default` — every configured locale resolves without a `MISSING_MESSAGE` throw.
- `i18n/routing.ts` extended (not replaced) with `createNavigation(routing)` — `Link`, `redirect`, `usePathname`, `useRouter`, `getPathname` — the single-source locale-aware navigation bridge, closing Phase 68's IN-01 gap.
- `components/SiteChrome.tsx` is now `async`, wraps its shared body in `NextIntlClientProvider` fed by `getLocale()`/`getMessages()` — works on both the `[locale]` public tree and the `(internal)` admin/driver tree (which always resolves the `en` catalog, matching the "admin/driver stay English-only" requirement with zero conditional logic).
- `app/(internal)/layout.tsx` made `async` to safely render the now-async `SiteChrome` child (Pitfall 3 ripple, verified via a clean `npm run build`).
- `vitest.config.ts` gained `server.deps.inline: ['next-intl']` (required once `createNavigation` is exercised — vercel/next.js#77200) and `tests/helpers/renderWithIntl.tsx` provides the shared `NextIntlClientProvider` test wrapper every later component-plan test reuses.
- `Nav.tsx` fully externalized: `useTranslations('Nav')` drives every visible label + aria-label (nav items, NEW badge, Sign in, Account menu, My trips, Profile, Sign out, Book now, Menu, home aria-label); `Link`/`usePathname` swapped from `next/link`/`next/navigation` to the locale-aware `@/i18n/routing` exports — the active-link comparison needed zero changes.
- `tests/i18n-navigation.test.tsx` locks locale-prefix retention with a genuine RED→GREEN cycle: the standalone `createNavigation` `Link` primitive already passed (Task 2 infra proven correct); the Nav-rendered assertion genuinely failed pre-swap (`/services` instead of `/ru/services`) and passes post-swap — proving Nav itself (not just the primitive) is locale-aware.
- Manual dev-server spot-check confirmed EN root renders `>Services<`, `>Book now<`, `>Sign in<`, `aria-label="PRESTIGO — home"` byte-identical, and `/ru` internal links resolve to `href="/ru/services"` (locale-prefixed) vs `href="/services"` on EN root (unprefixed, `localePrefix: 'as-needed'`).

## Task Commits

Task 1 (checkpoint:decision) was pre-approved by the operator before this executor ran — no code commit for Task 1 itself.

1. **Task 2: Wire the pipeline — catalog loader, provider, createNavigation, 6 stubs, test harness** - `6377621` (feat)
2. **Task 3: Externalize Nav + lock locale-prefix retention (the tracer proof)** — TDD cycle:
   - RED — `c701b25` (test): tests/i18n-navigation.test.tsx + nav-auth.test.tsx harness swap; `npx vitest run tests/i18n-navigation.test.tsx` failed as expected (1/4 — Nav internal link locale prefix)
   - GREEN — `ba6a4ee` (feat): components/Nav.tsx externalized; `npx vitest run tests/nav-auth.test.tsx tests/i18n-navigation.test.tsx` passed 12/12
   - REFACTOR — none needed (implementation was already clean)

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

## Files Created/Modified
- `messages/en.json` - Nav namespace source catalog (Task 1 convention)
- `messages/{ru,es,fr,ar,hi,zh}.json` - 6 byte-identical EN-copy stubs
- `i18n/request.ts` - real `messages/${locale}.json` loader (replaces Phase 68's `messages: {}` stub)
- `i18n/routing.ts` - `createNavigation(routing)` exports appended
- `components/SiteChrome.tsx` - now async, wraps body in `NextIntlClientProvider`
- `app/(internal)/layout.tsx` - now async (SiteChrome ripple)
- `vitest.config.ts` - `server.deps.inline: ['next-intl']`
- `tests/helpers/renderWithIntl.tsx` - shared test render helper
- `components/Nav.tsx` - `useTranslations('Nav')` + locale-aware `Link`/`usePathname`
- `tests/nav-auth.test.tsx` - `render` swapped to `renderWithIntl` (aliased, no assertion changes)
- `tests/i18n-navigation.test.tsx` - new locale-prefix retention regression lock

## Decisions Made
- Task 1 convention approved as-is (Option A) — no amendment. Recorded verbatim above for Phases 70/71 to reuse.
- Nav's 6 nav-item hrefs kept as a static in-code array (`NAV_LINKS`), index-paired with the translated `items` array from `t.raw('items')` — hrefs are routes, not translatable copy, matching the plan's explicit array-for-ordered-lists convention without over-modeling.
- `NAV_LINKS` typed as `ReadonlyArray<{ href: string; isNew?: boolean }>` rather than `as const` — an `as const` array literal infers a discriminated union of distinct object shapes, which TypeScript then rejects when accessing `.isNew` on members that didn't declare it (caught by `npm run build`'s type check, fixed inline as a Rule 1 bug).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] renderWithIntl.tsx TypeScript build failure — AbstractIntlMessages array typing**
- **Found during:** Task 2 (`npm run build` after the test harness was written)
- **Issue:** `messages/en.json`'s inferred type includes `Nav.items: string[]`, which next-intl's `AbstractIntlMessages` type (`Record<string, string | AbstractIntlMessages>`) does not structurally accept — a plain `as AbstractIntlMessages` cast was also rejected by TS ("neither type sufficiently overlaps").
- **Fix:** Cast via `enMessages as unknown as AbstractIntlMessages` in the default parameter — messages are still the real runtime JSON, only the type-level view is widened for the helper's public signature.
- **Files modified:** tests/helpers/renderWithIntl.tsx
- **Verification:** `npm run build` exits 0 after the fix
- **Committed in:** `6377621` (Task 2 commit)

**2. [Rule 1 - Bug] Nav.tsx NAV_LINKS `as const` discriminated-union TypeScript error**
- **Found during:** Task 3 GREEN phase (`npm run build`)
- **Issue:** `NAV_LINKS` declared with `as const` produced a union of 6 distinct object-literal types (only the multi-day entry has `isNew`), so `link.isNew` failed to typecheck on the other 5 entries during `.map()`.
- **Fix:** Re-typed `NAV_LINKS` as `ReadonlyArray<{ href: string; isNew?: boolean }>` (plain type annotation instead of `as const` literal inference).
- **Files modified:** components/Nav.tsx
- **Verification:** `npm run build` exits 0; `npx vitest run tests/nav-auth.test.tsx tests/i18n-navigation.test.tsx` still 12/12
- **Committed in:** `ba6a4ee` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — TypeScript build-time bugs surfaced by `npm run build`'s type check, not runtime/logic bugs)
**Impact on plan:** Both fixes are narrow type-annotation corrections with zero behavior change; no scope creep.

## Issues Encountered
None beyond the two auto-fixed TypeScript issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The message-catalog pipeline (loader, provider, createNavigation, stub strategy, test harness) is fully proven end-to-end on Nav — the remaining 69-02..69-05 plans (Footer, Hero + sub-parts, Services/Fleet/HowItWorks, Testimonials/CookieBanner/FeatureStrip) can now apply the same pattern directly, reusing `renderWithIntl` and the locked namespace/key/array/ICU/stub convention without re-deriving it.
- Known follow-up for later plans (not a blocker here): Footer.tsx, Fleet.tsx, and CookieBanner.tsx still contain raw `<a href="/...">` internal links (RESEARCH Pitfall 1) — those conversions are explicitly out of this plan's scope (Nav-only tracer) and belong to their respective component plans.
- No blockers for 69-02.

## Self-Check: PASSED

All 17 key files verified present on disk (`[ -f ]`); all 4 commits (`6377621`, `c701b25`, `ba6a4ee`, `15416a4`) verified present in `git log --oneline --all`.

---
*Phase: 69-string-externalization-ui-chrome*
*Completed: 2026-09-04*
