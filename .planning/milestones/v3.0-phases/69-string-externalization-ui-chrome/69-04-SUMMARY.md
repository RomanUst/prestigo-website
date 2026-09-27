---
phase: 69-string-externalization-ui-chrome
plan: 04
subsystem: i18n
tags: [next-intl, i18n, react, vitest]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: "69-01 locked message-catalog convention (PascalCase namespace, camelCase sub-keys, JSON arrays for ordered lists, named ICU args, 6 EN-copy stub files) + renderWithIntl test harness + createNavigation Link/usePathname exports"
provides:
  - "messages/en.json — Services namespace (label, 2-line heading, 8-card catalog array, fromPrice/fromPriceHourly ICU keys, learnMore, bookTransfer) + Fleet namespace (label, 2-line heading, 3-vehicle catalog array with features arrays + per-index altTemplate ICU key, seePricing), synced to 6 stubs"
  - "components/Services.tsx fully externalized via useTranslations('Services'); DB-driven price callouts (airportPrice/hourlyFrom/cheapestIntercity) rendered through named ICU args, not hardcoded"
  - "components/Fleet.tsx fully externalized via useTranslations('Fleet'); vehicle model proper nouns (Mercedes-Benz E/S/V-Class) stay structural in-code config, interpolated into translated alt text via a per-index ICU key"
  - "Established pattern: data-driven card grid = structural {id/model,href/photo} config array in code, zipped by index with a translated catalog array from t.raw(...) — the shape Phases 70/71 reuse for booking vehicle cards and route pages"
affects: [70-string-externalization-booking-account, 71-content-externalization-marketing-seo-pages]

actuals:
  tokens: 10250
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Structural config array {id/model, href/photo, isNew?} stays in code (React key + lookup key), zipped by index with t.raw('cards'|'vehicles') translated display fields — never puts routes/photo paths/proper nouns into the message catalog"
    - "DB-driven runtime values (price) interpolated via named ICU args passed to t('fromPrice', {price}) — never string-templated into the catalog"
    - "Per-index nested ICU interpolation: t(`vehicles.${i}.altTemplate`, { model }) resolves an array-nested message key with a named arg — proven working via next-intl's dot-path array resolution, avoids manual .replace() string surgery"

key-files:
  created: []
  modified:
    - components/Services.tsx
    - components/Fleet.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json

key-decisions:
  - "Services structural config reduced to {id, href, isNew} where id is the original label text (e.g. 'Airport') — reused as BOTH the React key and the priceCallouts lookup key, kept out of the translated catalog since it's a stable identifier, not display text"
  - "Fleet vehicle model names (proper nouns) interpolated into the alt text via a per-index t() call with a named ICU arg (t(`vehicles.${i}.altTemplate`, {model})), not string.replace() — matches the plan's explicit prohibition on manual template substitution"

patterns-established:
  - "Data-driven card-grid externalization pattern (structural code array zipped by index with t.raw catalog array) — reused verbatim by Phases 70/71 for booking vehicle cards and route pages"

requirements-completed: [STR-01]

coverage:
  - id: D1
    description: "Services.tsx renders all visible copy (label, heading, 8 cards, price callouts, Learn more, Book a transfer) through useTranslations('Services'); DB-driven price callouts keep their airportPrice/hourlyFrom/cheapestIntercity values via named ICU args; Learn more uses the locale-aware Link"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "npx vitest run (105 files / 1184 tests passed, 0 failed, no Services/Fleet regression)"
        status: pass
      - kind: integration
        ref: "npm run build (exit 0, all 7 locale subpaths prerender, no MISSING_MESSAGE)"
        status: pass
      - kind: manual_procedural
        ref: "npm run start -p 3999; curl / — confirmed 'From €69', 'From €49/hr' price callouts and href=\"/services/*\">Learn more render identically; curl /ru — confirmed href=\"/ru/services/*\" and href=\"/ru/book\" locale-prefixed links"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fleet.tsx renders category/passengers/bags/features/alt via useTranslations('Fleet'); vehicle model names stay proper nouns in code (not translatable catalog values); See pricing uses the locale-aware Link"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "npx vitest run (105 files / 1184 tests passed, 0 failed)"
        status: pass
      - kind: integration
        ref: "npm run build (exit 0)"
        status: pass
      - kind: manual_procedural
        ref: "curl / — confirmed alt=\"Mercedes-Benz E-Class — Prague chauffeur service\" / S-Class / V-Class interpolated correctly; href=\"/book\">See pricing →; grep -c Mercedes-Benz components/Fleet.tsx = 3, grep Mercedes-Benz messages/en.json shows only pre-existing Hero/FeatureStrip/HowItWorks occurrences, none from Fleet namespace"
        status: pass
    human_judgment: false
  - id: D3
    description: "EN output byte-for-byte unchanged; Services/Fleet namespaces present and byte-identical across all 7 locale files"
    requirement: STR-01
    verification:
      - kind: other
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json (all exit 0, both after Task 1 and after Task 2's Fleet addition)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-04
status: complete
---

# Phase 69 Plan 04: Externalize Services + Fleet Summary

**Services grid (8 cards, DB-driven price callouts) and Fleet vehicle cards (3 vehicles, proper-noun model names) fully externalized via useTranslations, establishing the structural-config-zipped-by-index pattern that Phases 70/71 reuse for data-driven card grids.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-04T16:00:00Z (approx)
- **Completed:** 2026-09-04T16:25:00Z (approx)
- **Tasks:** 2
- **Files modified:** 9 (2 components, 7 message catalogs)

## Accomplishments
- `messages/en.json` gained a `Services` namespace (label, 2-line heading, `cards` array of 8 `{label,title,body,detail}` objects verbatim from the original in-code array, `fromPrice`/`fromPriceHourly` ICU keys, `learnMore`, `bookTransfer`) and a `Fleet` namespace (label, 2-line heading, `vehicles` array of 3 `{category,passengers,bags,features[],altTemplate}` objects, `seePricing`) — both re-synced byte-identical to all 6 stub locales.
- `components/Services.tsx`: the `services` config array reduced to structural `{id, href, isNew}` (id = the original label string, e.g. `"Airport"`, reused as React key AND `priceCallouts` lookup key — never rendered). Display fields (`label`, `title`, `body`, `detail`) come from `t.raw('cards')` zipped by index. `priceCallouts` rebuilt from `t('fromPrice', {price: airportPrice})` / `t('fromPriceHourly', {price: hourlyFrom})` / `t('fromPrice', {price: cheapestIntercity})` — the DB-driven numeric props flow through named ICU args, never baked into the catalog. "Learn more" `Link` swapped from `next/link` to `@/i18n/routing` (locale-aware); the `#book` fragment anchor stays a raw `<a>`.
- `components/Fleet.tsx`: the `vehicles` config array reduced to structural `{model, photo}` (model = proper noun `"Mercedes-Benz E-Class"` etc., stays in code, never enters the message catalog). Display fields come from `t.raw('vehicles')` zipped by index. The photo `alt` text is rendered via a per-index nested ICU call — `t(\`vehicles.${i}.altTemplate\`, {model: v.model})` — which resolves the array-nested `altTemplate` message and interpolates the proper-noun model name, matching the plan's explicit prohibition on manual `.replace()` string surgery. "See pricing →" raw `<a href="/book">` converted to the locale-aware `Link`.
- Manual dev-server spot-check (curl against `npm run start -p 3999`) confirmed: EN root renders `From €69` / `From €49/hr` price callouts and `Learn more` links unchanged; `/ru` resolves `href="/ru/services/*"` and `href="/ru/book"` (locale-prefixed); Fleet `alt` attributes render `"Mercedes-Benz E-Class — Prague chauffeur service"` etc. — proving the per-index ICU interpolation works end-to-end, not just in isolation.
- Full `npx vitest run` (105 files / 1184 tests) and `npm run build` (all 7 locale subpaths, no `MISSING_MESSAGE`) both green at the final committed state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize Services.tsx (grid + price callouts + Link swap)** - `a73a60c` (feat)
2. **Task 2: Externalize Fleet.tsx (vehicle cards + raw `<a>` -> Link, model as proper noun)** - `de0599f` (feat)

_Note: `messages/en.json` and its 6 stubs were staged in two passes per commit — the Task 1 commit's `en.json` diff contains only the `Services` namespace (the `Fleet` namespace was temporarily held out of the working file, then restored and re-synced immediately before the Task 2 commit) — so each commit's file set matches exactly the plan's per-task `<files>` list, even though both namespaces were authored in a single editing pass._

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

## Files Created/Modified
- `components/Services.tsx` - `useTranslations('Services')`, structural `{id,href,isNew}` config zipped with `t.raw('cards')`, ICU price callouts, locale-aware `Link`
- `components/Fleet.tsx` - `useTranslations('Fleet')`, structural `{model,photo}` config zipped with `t.raw('vehicles')`, per-index ICU alt interpolation, locale-aware `Link`
- `messages/en.json` - `Services` + `Fleet` namespaces added
- `messages/{ru,es,fr,ar,hi,zh}.json` - re-synced byte-identical EN-copy stubs (both namespaces)

## Decisions Made
- Services `id` (structural key) reuses the original label text as both React key and `priceCallouts` lookup — kept out of the translated `cards` catalog since it's an identifier, not display copy, avoiding a redundant translatable field.
- Fleet's `altTemplate` interpolation uses next-intl's own dot-path array resolution (`t(\`vehicles.${i}.altTemplate\`, {model})`) rather than manual string substitution — verified via curl that the model name interpolates correctly into the rendered `alt` attribute for all 3 vehicles.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The structural-config-zipped-by-index pattern is now proven on two data-driven card grids (Services, Fleet) in addition to HowItWorks (69-02) — Phase 70 (booking/account vehicle cards) and Phase 71 (route pages) can reuse it directly without re-deriving the shape.
- Remaining Phase 69 scope: 69-05 (Testimonials/CookieBanner/FeatureStrip) is the last plan before Phase 69 verification.
- No blockers for 69-05.

## Self-Check: PASSED

Verified `components/Services.tsx` and `components/Fleet.tsx` exist on disk (`[ -f ]`); verified `messages/en.json` contains `Services.cards` (8 elements) and `Fleet.vehicles` (3 elements) via `node -e "JSON.parse(...)"`; verified all 6 stub locales are byte-identical to `en.json` via `cmp -s` (all exit 0); verified both commits (`a73a60c`, `de0599f`) present in `git log --oneline --all`.

---
*Phase: 69-string-externalization-ui-chrome*
*Completed: 2026-09-04*
