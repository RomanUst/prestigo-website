---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 01
subsystem: i18n
tags: [next-intl, next-font, tailwind-v4, rtl, cldr-plural, vitest]

# Dependency graph
requires:
  - phase: 72-ai-translation-pipeline-catalogs
    provides: scripts/i18n-translate.mjs pipeline, i18n/glossary.json schema+loader, hash-manifest idempotency
  - phase: 68-i18n-foundation-routing
    provides: i18n/routing.ts rtlLocales/locales, app/[locale]/layout.tsx dir wiring
provides:
  - Noto Sans Arabic/Devanagari/SC next/font loaders declared in components/SiteChrome.tsx with a build-safe subset (SC corrected to 'latin')
  - Locale-conditional font className application on <body> (ar/hi/zh only; en/ru/es/fr/internal untouched)
  - ":lang(ar)"/":lang(hi)" letter-spacing reset in app/globals.css (.label, --letter-spacing-* tokens, booking-flow date-picker caption)
  - components/Nav.tsx physical-to-logical Tailwind class conversion (start-0/end-0, -me-1, text-start) + JS-computed RTL chevron mirror
  - i18n/glossary.json locales.ar/hi/zh tone/plural entries (ar carries the full 6-category CLDR plural set)
  - PHASE_72_LOCALES extended to all six production locales; CI workflow add-paths/commit-message/PR title cover ar/hi/zh
  - ar/hi/zh checkNoEnglishLeakage test fixtures; dir="rtl"-for-ar assertion (not just rtlLocales in isolation); Nav en/ru/es/fr golden byte-parity snapshots
affects: [73-02-ai-translation-generation, 73-03-rtl-audit, 73-04-rtl-audit, 73-05-rtl-audit, 73-06-rtl-gate]

# Actuals (#2632)
actuals:
  tokens: 9691
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-locale next/font className selection: module-scope loaders, locale-conditional application via a ternary chain on the resolved getLocale() value"
    - "Inline-style rotation composed in JS (menuOpen angle + isRtl 180deg) when the rtl: Tailwind variant cannot reach an inline style"
    - ":lang(ar)/:lang(hi) additive CSS overrides for letter-spacing, never touching the base Latin rule"

key-files:
  created:
    - tests/nav-locale-render-parity.test.tsx
    - tests/__snapshots__/nav-locale-render-parity.test.tsx.snap
  modified:
    - components/SiteChrome.tsx
    - app/globals.css
    - components/Nav.tsx
    - i18n/glossary.json
    - scripts/lib/i18n-glossary.mjs
    - .github/workflows/i18n-translate.yml
    - tests/i18n-completeness.test.ts
    - tests/middleware-i18n.test.ts

key-decisions:
  - "SC font subset corrected from the UI-SPEC's 'chinese-simplified' (invalid, build-breaking) to 'latin' (valid, harmless — full CJK glyph set ships regardless of subsets value) — RESEARCH.md Pitfall 2, verified against next's bundled font-data.json"
  - "--letter-spacing-nav/-wide/-logo theme tokens have no current DOM consumer (grep-confirmed) — reset them at the custom-property level under :lang(ar)/:lang(hi) rather than inventing non-existent 'bearing selectors', so any future var() consumer inherits the reset automatically"
  - "A1 (Claude's Discretion, resolved): PHASE_72_LOCALES extended to all six locales now, closing the latent bug where a future EN edit would silently skip ar/hi/zh re-translation in CI"

requirements-completed: [FONT-01, RTL-01, TR-02]

coverage:
  - id: D1
    description: "Noto Sans Arabic/Devanagari/SC loaders declared at module scope with a build-safe subset; next build compiles without a nextFontError"
    requirement: "FONT-01"
    verification:
      - kind: other
        ref: "npx next build (full production build, exit 0, no nextFontError referencing Noto Sans SC)"
        status: pass
      - kind: other
        ref: "grep -n \"Noto_Sans_SC\" components/SiteChrome.tsx shows subsets: ['latin']"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-locale conditional Noto className application on <body> (ar/hi/zh only; en/ru/es/fr and internal routes unaffected)"
    requirement: "FONT-01"
    verification:
      - kind: other
        ref: "grep -n font-noto-arabic|font-noto-devanagari|font-noto-sc components/SiteChrome.tsx shows all three variables applied through localeFontClassName"
        status: pass
    human_judgment: true
    rationale: "No automated mechanism exists in this stack to assert zero Noto bytes are requested on /en,/ru,/es,/fr at the network level (73-RESEARCH.md Wave 0 Gaps, flagged human_needed) — deferred to the D-10 visual/network QA pass in Plan 73-06 (the phase's RTL gate plan)."
  - id: D3
    description: "components/Nav.tsx physical-to-logical Tailwind conversion (start-0/end-0, -me-1, text-start) renders byte-identically under dir=\"ltr\" for en/ru/es/fr, and the dropdown chevron mirrors correctly on ar via a JS-computed rotation"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/nav-locale-render-parity.test.tsx — renders Nav identically (golden snapshot) for locale=$locale [en,ru,es,fr]"
        status: pass
      - kind: unit
        ref: "tests/nav-auth.test.tsx — 8 pre-existing Nav auth-state tests, unaffected by the conversion"
        status: pass
      - kind: other
        ref: "grep -cE \"(text-left|text-right|-?mr-1|left-0 right-0)\" components/Nav.tsx (comments excluded) == 0"
        status: pass
    human_judgment: false
  - id: D4
    description: ":lang(ar)/:lang(hi) letter-spacing reset added to app/globals.css (.label, theme tokens, booking-flow date-picker caption) without touching the base Latin rule"
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "npx vitest run tests/route-page-render.test.tsx tests/middleware-i18n.test.ts (unaffected by the additive CSS change)"
        status: pass
    human_judgment: true
    rationale: "Letter-spacing reset is a CSS-cascade claim not verifiable via jsdom text diff; visual confirmation is part of the D-10 RTL QA pass in Plan 73-06."
  - id: D5
    description: "i18n/glossary.json locales.ar/hi/zh entries (correct CLDR plural sets, D-06/07/08 tone) validate; PHASE_72_LOCALES and the CI workflow cover all six locales"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "node -e checking g.locales.ar.pluralCategories.length===6 && includes('few') && includes('many')"
        status: pass
      - kind: other
        ref: "node scripts/i18n-translate.mjs --check --locales ar,hi,zh (runs without a glossary-validation error)"
        status: pass
    human_judgment: false
  - id: D6
    description: "ar/hi/zh checkNoEnglishLeakage fixtures added; dir=\"rtl\" asserted specifically for locale ar (not just rtlLocales in isolation)"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "tests/i18n-completeness.test.ts (9 new ar/hi/zh cases, 20/20 total passing)"
        status: pass
      - kind: unit
        ref: "tests/middleware-i18n.test.ts — 'dir attribute resolution (RTL-01)' describe block, 26/26 total passing"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-09-18
status: complete
---

# Phase 73 Plan 01: Non-Latin & RTL Infra Tracer (ar) Summary

**Proved the Phase 73 architecture end-to-end on `/ar/`: corrected Noto font loaders (avoiding a build-breaking SC-subset bug), locale-conditional font application, `:lang()` tracking resets, Nav.tsx logical-class conversion with a JS-computed RTL chevron mirror, glossary/pipeline extension to all six locales, and the ar/hi/zh test scaffolds — all on one component/font/CSS slice before the ~42-file expansion.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-09-18T07:08:20Z (approx, from STATE.md pre-execution timestamp)
- **Completed:** 2026-09-18T07:25:21Z
- **Tasks:** 3
- **Files modified:** 8 modified, 2 created

## Accomplishments

- `components/SiteChrome.tsx` now declares `Noto_Sans_Arabic`/`Noto_Sans_Devanagari`/`Noto_Sans_SC` loaders at module scope with a build-safe `subsets` value for SC (`['latin']`, not the UI-SPEC's build-breaking `'chinese-simplified'`), and applies the resulting CSS variable on `<body>` only for the matching locale (`ar`/`hi`/`zh`) — `/en`,`/ru`,`/es`,`/fr` and internal `/admin`,`/driver` routes carry none of the three.
- `app/globals.css` gained additive `:lang(ar)`/`:lang(hi)` letter-spacing resets for `.label`, the `--letter-spacing-*` theme tokens, and the booking-flow date-picker's `!important` caption rule — positive tracking breaks Arabic letter-joining and fragments Devanagari conjuncts; `zh` is untouched.
- `components/Nav.tsx`'s four physical-direction sites converted to logical equivalents at identical pixel values (`left-0 right-0`→`start-0 end-0`, `-mr-1`→`-me-1`, `text-left`→`text-start`), and the dropdown chevron's inline-`style` rotation now composes the existing open/closed angle with a JS-computed `+180deg` RTL mirror (the `rtl:` Tailwind variant cannot reach an inline style).
- `i18n/glossary.json` gained `locales.ar/hi/zh` entries matching the existing `ru/es/fr` shape; `ar` carries the full 6-category CLDR plural set (`zero/one/two/few/many/other`), not the 2-category shortcut that would silently no-op `verifyPluralCategories()`.
- `PHASE_72_LOCALES` extended to all six production locales (A1 decision) and `.github/workflows/i18n-translate.yml`'s `add-paths`/commit-message/PR title updated to match — closing the latent gap where a future EN edit would silently skip ar/hi/zh re-translation in CI.
- Wave-0 test scaffolds landed: 9 new `ar`/`hi`/`zh` `checkNoEnglishLeakage` fixture cases, a `dir="rtl"`-for-`ar`-specifically assertion in `tests/middleware-i18n.test.ts`, and a new Nav en/ru/es/fr golden byte-parity snapshot suite. `lib/route-content.ts`'s EN-fallback for `ar` (A3) was already covered and passing (`tests/route-content.test.ts:23-25`).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end `/ar/` slice — Noto fonts + `:lang` tracking + Nav logical conversion + chevron mirror** - `78701bd` (feat)
2. **Task 2: Translation config — glossary ar/hi/zh + PHASE_72_LOCALES + CI workflow (A1 decision)** - `cd7229e` (feat)
3. **Task 3: Wave-0 test scaffolds — ar/hi/zh leakage fixtures, dir=rtl-for-ar assertion, byte-parity coverage** - `dbc3d58` (test)

**Plan metadata:** committed as part of this SUMMARY's own commit (docs: complete plan)

## Files Created/Modified

- `components/SiteChrome.tsx` - Noto loaders + locale-conditional `<body>` className
- `app/globals.css` - `:lang(ar)`/`:lang(hi)` letter-spacing reset
- `components/Nav.tsx` - logical classes + JS-computed RTL chevron mirror
- `i18n/glossary.json` - `locales.ar/hi/zh` tone/plural entries
- `scripts/lib/i18n-glossary.mjs` - `PHASE_72_LOCALES` extended to six locales
- `.github/workflows/i18n-translate.yml` - six-locale `add-paths`/commit-message/PR title
- `tests/i18n-completeness.test.ts` - ar/hi/zh `checkNoEnglishLeakage` fixtures
- `tests/middleware-i18n.test.ts` - `dir="rtl"`-for-`ar` assertion (dedicated describe block)
- `tests/nav-locale-render-parity.test.tsx` (new) - Nav en/ru/es/fr golden byte-parity snapshots
- `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap` (new) - snapshot baseline

## Decisions Made

- SC font subset corrected from the UI-SPEC's `'chinese-simplified'` (invalid, throws `nextFontError` at build time per RESEARCH.md Pitfall 2) to `'latin'` (valid; the full CJK glyph set ships regardless of the `subsets` value).
- `--letter-spacing-nav`/`-wide`/`-logo` theme tokens have no current DOM consumer anywhere in the codebase (grep-confirmed against `app/`/`components/`) — reset them at the custom-property level under `:lang(ar)`/`:lang(hi)` rather than inventing non-existent "bearing selectors" the plan's must-haves phrase referred to; this way any future `var()` consumer inherits the reset automatically.
- A1 (Claude's Discretion, resolved): `PHASE_72_LOCALES` extended to all six locales now rather than deferred — closes a latent CI gap (see Accomplishments).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Nav-inclusive byte-parity check moved to a new dedicated test file**
- **Found during:** Task 3 (Wave-0 test scaffolds)
- **Issue:** The plan specified extending `tests/route-page-render.test.tsx` with a Nav-inclusive snapshot. That file's module-scope `vi.mock('@/components/Nav', () => ({ default: () => null }))` is hoisted by Vitest ahead of any in-test `vi.unmock` call (confirmed live: an in-test `vi.unmock` + `vi.resetModules()` + dynamic re-import attempt broke the file's existing `PragueViennaPage` golden snapshot with a "no NextIntlClientProvider context" error, because the unmock took effect file-wide from the start of the module regardless of where it was written in the test body).
- **Fix:** Reverted `tests/route-page-render.test.tsx` to its committed baseline (unchanged) and created `tests/nav-locale-render-parity.test.tsx` — a dedicated file that renders the real, converted `Nav.tsx` under `dir="ltr"` for `en`/`ru`/`es`/`fr` and locks each as a golden snapshot, reusing the existing `tests/nav-auth.test.tsx`/`tests/i18n-navigation.test.tsx` mocking pattern (`createBrowserClient` + `customerSignOut`).
- **Files modified:** `tests/nav-locale-render-parity.test.tsx` (new), `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap` (new). `tests/route-page-render.test.tsx` itself is unchanged from before this plan.
- **Verification:** `npx vitest run tests/nav-locale-render-parity.test.tsx` (4/4 pass); full suite green afterward (124 files / 1458 tests passed, 0 failed).
- **Committed in:** `dbc3d58` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation is purely mechanical (which file hosts the test) — the Nav-inclusive byte-parity coverage the plan required is fully delivered, just in a separate file to work around a Vitest mock-hoisting constraint. No scope creep, no coverage gap.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None - no external service configuration required. (Task 2's `PHASE_72_LOCALES` extension affects the CI workflow's default locale set for the next auto-triggered run, but requires no new secret or manual setup — `ANTHROPIC_API_KEY` is already provisioned per Phase 72.)

## Next Phase Readiness

- The tracer proves all three of this phase's architectural risk points on one slice: the Noto SC subset build gate, per-locale font application, and the physical→logical conversion + chevron mirror pattern — Plans 73-03/04/05 can now apply the identical conversion pattern to the remaining ~38 files with confidence.
- Plan 73-02 (AI translation generation) can proceed: the glossary carries correct `ar`/`hi`/`zh` tone/plural entries, and `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` runs cleanly (still reporting the pre-reset manifest no-op state — Pitfall 1 — since the manifest reset + real generation run is explicitly Plan 73-02's job, not this plan's).
- No blockers. `next build` passes; full vitest suite green (124 files / 1458 tests, 0 failures); `git diff --exit-code` confirms zero drift in `en`/`ru`/`es`/`fr` message catalogs and content (D-12 non-regression).

## Self-Check: PASSED

All 10 files-created/modified verified present on disk (`components/SiteChrome.tsx`, `app/globals.css`, `components/Nav.tsx`, `i18n/glossary.json`, `scripts/lib/i18n-glossary.mjs`, `.github/workflows/i18n-translate.yml`, `tests/i18n-completeness.test.ts`, `tests/middleware-i18n.test.ts`, `tests/nav-locale-render-parity.test.tsx`, `tests/__snapshots__/nav-locale-render-parity.test.tsx.snap`). All 3 task commit hashes (`78701bd`, `cd7229e`, `dbc3d58`) verified present in `git log --oneline --all`.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-18*
