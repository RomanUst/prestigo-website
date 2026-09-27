---
phase: 69-string-externalization-ui-chrome
plan: 05
subsystem: i18n
tags: [next-intl, i18n, testimonials, cookie-consent, react, vitest]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: "69-01 locked message-catalog convention (PascalCase namespaces, camelCase sub-keys, JSON arrays, named ICU args, 6 EN-copy stub files) + renderWithIntl test harness + createNavigation Link/usePathname from i18n/routing.ts"
provides:
  - "messages/en.json — Testimonials namespace (shared by Testimonials.tsx async server component and TestimonialsCarousel.tsx client component) + CookieBanner namespace (heading, rich consentBody, tabs, category/service copy, buttons, toggle labels)"
  - "6 byte-identical EN-copy stub files re-synced twice (after each task) — final completed catalog for the phase"
  - "Testimonials.tsx proves getTranslations (async Server Component) pattern; CookieBanner.tsx proves t.rich embedded-link pattern — the two next-intl shapes not yet exercised by 69-01..69-04"
affects: [70-string-externalization-booking-account, 71-content-externalization-marketing-seo-pages]

actuals:
  tokens: 3903
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Async Server Component (already awaiting other data) uses `await getTranslations('Namespace')` from 'next-intl/server', never the `useTranslations` hook, because hooks cannot be called after an await boundary — Testimonials.tsx is the concrete proof"
    - "t.rich('key', { tag: (chunks) => <Component>{chunks}</Component> }) embeds localized Link/JSX inside a translated sentence — CookieBanner's consentBody keeps the ' · ' separator inside the message string itself, not as surrounding JSX"
    - "A nested function component (Toggle, StarBadge) rendered only within an already-translated client tree can call useTranslations(sameNamespace) directly instead of threading a `t` prop down from the parent"

key-files:
  created: []
  modified:
    - components/Testimonials.tsx
    - components/TestimonialsCarousel.tsx
    - components/CookieBanner.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - tests/TestimonialsCarousel.test.tsx

key-decisions:
  - "Testimonials + TestimonialsCarousel share one `Testimonials` namespace per the 69-01 locked convention — no separate Carousel namespace"
  - "StarBadge and Toggle (nested function components used only inside an already-translated tree) call useTranslations(namespace) directly rather than receiving a `t` prop — simpler, matches how CategoryRow/ServiceRow already receive pre-translated title/description props instead"
  - "review.quote/name/role/sourceLabel/relativeTime and the 5 service-provider proper nouns (Stripe, Supabase, Google Maps, Google Analytics 4, Meta Pixel) stay hardcoded — explicitly out of STR-01 scope (user-generated content / proper nouns)"

patterns-established:
  - "getTranslations (async server) vs useTranslations (sync server/client) selection rule, applied concretely for the first time this phase"
  - "t.rich embedded-link pattern for CookieBanner, reusable by any future component with an inline localized link inside a translated sentence"

requirements-completed: [STR-01]

coverage:
  - id: D1
    description: "Testimonials.tsx (async Server Component) renders label/heading/body via await getTranslations('Testimonials'); TestimonialsCarousel.tsx (client) renders all chrome (star aria, Google Review label, carousel/pagination aria, go-to-slide aria) via useTranslations('Testimonials'); review content (quote/name/role/sourceLabel) stays hardcoded"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "grep -n \"getTranslations('Testimonials')\" components/Testimonials.tsx and grep -n \"useTranslations('Testimonials')\" components/TestimonialsCarousel.tsx (both matched)"
        status: pass
      - kind: unit
        ref: "tests/TestimonialsCarousel.test.tsx (swapped to renderWithIntl) — full file, 15/15 tests passing under npx vitest run"
        status: pass
    human_judgment: false
  - id: D2
    description: "messages/en.json Testimonials namespace has ICU args ({stars}, {n}); all 6 stub locales byte-identical to en.json"
    requirement: STR-01
    verification:
      - kind: other
        ref: "node -e JSON.parse checks for {stars}/{n} presence + cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json (all exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "CookieBanner.tsx renders every visible string via useTranslations('CookieBanner'); Privacy Policy / Legal Notice inline links render through t.rich('consentBody', { privacy, terms }) as localized Link from @/i18n/routing, no raw internal <a href=\"/...\"> remains; provider proper nouns + consent-storage/gtag/CustomEvent logic untouched"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "grep -n \"useTranslations('CookieBanner')\", grep -n \"t.rich('consentBody'\", grep -n \"from '@/i18n/routing'\" (all matched); grep -cE '<a[[:space:]]+href=\"/' components/CookieBanner.tsx returns 0"
        status: pass
      - kind: integration
        ref: "npx vitest run — full suite (no CookieBanner-specific test file exists; verified no regression across 105 test files / 1184 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "EN root output byte-for-byte unchanged; /ru internal Privacy/Legal links keep the /ru/ prefix (t.rich + Link works end-to-end)"
    requirement: STR-01
    verification:
      - kind: manual_procedural
        ref: "npm run dev; fetch('http://localhost:3000/') confirmed 'Trusted by those', 'who value their time.', 'Published with permission...', 'Welcome aboard.', 'Before your journey begins', 'Privacy Policy', 'Legal Notice' all present; fetch('http://localhost:3000/ru') confirmed href=\"/ru/privacy\" and href=\"/ru/terms\" (locale-prefixed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full vitest suite green + npm run build green — no regression from Phase 68/69 prior plans; STR-01 fully complete (no hardcoded UI-chrome copy remains across Nav, Footer, Hero+subs, Services, Fleet, HowItWorks, Testimonials+Carousel, CookieBanner, FeatureStrip)"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "npx vitest run — 105 test files passed (5 skipped), 1184 tests passed (10 skipped, 139 todo), 0 failed"
        status: pass
      - kind: integration
        ref: "npm run build — exit 0, no MISSING_MESSAGE across any of the 7 locale subpaths"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-04
status: complete
---

# Phase 69 Plan 05: Externalize Testimonials + TestimonialsCarousel + CookieBanner Summary

**Testimonials.tsx proves the `getTranslations` async-Server-Component pattern, CookieBanner.tsx proves `t.rich` embedded-link translation for its Privacy/Legal copy, and STR-01 (all UI-chrome strings externalized) is now complete across the entire phase.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-04T14:12:05Z (approx, continuing from 69-04)
- **Completed:** 2026-09-04T14:26:00Z (approx)
- **Tasks:** 2
- **Files modified:** 11 (3 components, 7 message-catalog files, 1 test file)

## Accomplishments
- `Testimonials.tsx` (already `async` — awaits `getReviews()`) now uses `await getTranslations('Testimonials')` from `next-intl/server` for its label, two heading lines, and privacy-notice body — the concrete proof that an async Server Component must use the awaitable API, not the `useTranslations` hook, after an await boundary.
- `TestimonialsCarousel.tsx` (`'use client'`) uses `useTranslations('Testimonials')` — shared with `Testimonials.tsx` per the 69-01 locked convention — for the star-rating aria-label (`{stars} out of 5 stars`), "Google Review" label, carousel region aria-label, pagination aria-label, and each dot's "Go to slide {n}" aria-label. `review.quote`/`name`/`role`/`sourceLabel`/`relativeTime` stayed untouched — user-generated content, explicitly out of scope.
- `CookieBanner.tsx` (`'use client'`) fully externalized via `useTranslations('CookieBanner')`: wordmark aria-label, "Welcome aboard." heading, the two tab labels, the 3 CategoryRow title/description pairs, the 5 ServiceRow category badges + descriptions, the 3 footer buttons, and the Toggle's `sr-only` Enabled/Disabled label. The 5 service-provider proper nouns (Stripe, Supabase, Google Maps, Google Analytics 4, Meta Pixel) stayed hardcoded in the component as planned.
- The consent paragraph's inline Privacy Policy / Legal Notice links now render via `t.rich('consentBody', { privacy, terms })` → localized `Link` from `@/i18n/routing`, replacing the two raw `<a href="/...">` tags. The `' · '` separator moved inside the message string itself; the surrounding `{' · '}` JSX was removed.
- `messages/en.json` gained the `Testimonials` and `CookieBanner` namespaces (Task 1 and Task 2 respectively), each immediately re-synced to all 6 stub locale files (`cp messages/en.json messages/{ru,es,fr,ar,hi,zh}.json`) — the message catalog for the whole phase is now complete.
- `tests/TestimonialsCarousel.test.tsx` swapped its `render` import from raw `@testing-library/react` to `renderWithIntl` (aliased as `render`, per the 69-01-established Pitfall-2 mitigation) — required the moment `TestimonialsCarousel` started calling `useTranslations`; no assertion changes needed.
- Manual dev-server spot-check confirmed EN root renders `Trusted by those` / `who value their time.` / the privacy-notice body / `Welcome aboard.` / the consent paragraph / `Privacy Policy` / `Legal Notice` byte-identical to the pre-phase text, and `/ru` resolves the CookieBanner's Privacy/Legal links to `href="/ru/privacy"` / `href="/ru/terms"` (locale-prefixed) — proving `t.rich` + `Link` compose correctly end-to-end.

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize Testimonials (getTranslations) + TestimonialsCarousel (useTranslations)** - `76332e8` (feat)
2. **Task 2: Externalize CookieBanner (t.rich links + full consent copy)** - `d4eb606` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit).

_No TDD tasks in this plan — both were `type="auto"`._

## Files Created/Modified
- `components/Testimonials.tsx` - async Server Component now uses `await getTranslations('Testimonials')`
- `components/TestimonialsCarousel.tsx` - client component uses `useTranslations('Testimonials')` for all chrome; review content untouched
- `components/CookieBanner.tsx` - client component uses `useTranslations('CookieBanner')` + `t.rich('consentBody', ...)` for embedded Privacy/Legal links
- `messages/en.json` - gained `Testimonials` + `CookieBanner` namespaces (source catalog, now complete for the phase)
- `messages/{ru,es,fr,ar,hi,zh}.json` - re-synced byte-identical to en.json, twice (after each task)
- `tests/TestimonialsCarousel.test.tsx` - `render` swapped to `renderWithIntl` (aliased, no assertion changes)

## Decisions Made
- Testimonials + TestimonialsCarousel share the single `Testimonials` namespace, exactly as the 69-01 convention specified — no separate namespace for the Carousel sub-component.
- `StarBadge` and `Toggle` (nested function components rendered only inside an already-translated client tree) call `useTranslations(sameNamespace)` directly rather than threading a `t` prop down from their parent — simpler and consistent with how `CategoryRow`/`ServiceRow` already receive pre-translated `title`/`description` props from the parent instead of calling the hook themselves.
- No new packages, no architectural changes — pure application-code wiring against the already-proven next-intl pipeline (69-01) and message-catalog convention.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- STR-01 is complete: no hardcoded user-facing UI-chrome copy remains in Nav, Footer, Hero(+HeroTypewriter/HeroRating/HeroWhatsApp/HeroBackground), Services, Fleet, HowItWorks, Testimonials(+Carousel), CookieBanner, or FeatureStrip.
- `messages/en.json` is now the complete EN catalog for the entire UI-chrome surface, synced byte-identical across all 6 stub locales — ready for Phase 70 (Booking & Account string externalization) to extend with new namespaces, and for Phase 72 (AI Translation Pipeline) to translate the stub locales for real.
- No blockers for Phase 70.

## Self-Check: PASSED

All 11 key files verified present on disk (`[ -f ]`); both commits (`76332e8`, `d4eb606`) verified present in `git log --oneline --all`. Full `npx vitest run` (105 files / 1184 tests) and `npm run build` (exit 0, no MISSING_MESSAGE) both re-confirmed green at SUMMARY time.

## Gap Closure (2026-09-04)

**Gap:** A verifier pass over the phase found the "NEW" badge was still a hardcoded literal string `NEW` in two components — `components/Footer.tsx:75` and `components/Services.tsx:64` — even though `Nav.tsx` had already externalized the identical badge pattern to `t('new')` (key `Nav.new = "NEW"`) earlier in this same phase. This violated Success Criterion #2 (no hardcoded user-facing copy) for those two components.

**Fix:**
- Added `"new": "NEW"` to the `Footer` and `Services` namespaces in `messages/en.json` (byte-identical value to the existing `Nav.new`), then re-synced all 6 stub locales (`ru`, `es`, `fr`, `ar`, `hi`, `zh`) to remain byte-identical copies of `en.json`.
- `components/Footer.tsx` (line 75) and `components/Services.tsx` (line 64) already called `useTranslations('Footer')` / `useTranslations('Services')` respectively — replaced the hardcoded `NEW` text node in each with `{t('new')}`, keeping all `className`/styling byte-identical.

**Verification:**
- `grep -n ">NEW<" components/Footer.tsx components/Services.tsx` — no matches.
- `node -e` check confirmed `Footer.new === 'NEW'` and `Services.new === 'NEW'` in `messages/en.json`.
- `npx vitest run` — 105 test files passed (5 skipped), 1184 tests passed (10 skipped, 139 todo), 0 failed.
- `npm run build` — exit 0, no `MISSING_MESSAGE` across any of the 7 locale subpaths.

**Files modified:** `components/Footer.tsx`, `components/Services.tsx`, `messages/en.json`, `messages/ru.json`, `messages/es.json`, `messages/fr.json`, `messages/ar.json`, `messages/hi.json`, `messages/zh.json`

**Commit:** `4dd1094` — `fix(69): externalize hardcoded NEW badge in Footer + Services (gap closure)`

STR-01 is now fully closed with no remaining hardcoded UI-chrome copy across the phase's 9 components.

---
*Phase: 69-string-externalization-ui-chrome*
*Completed: 2026-09-04*
