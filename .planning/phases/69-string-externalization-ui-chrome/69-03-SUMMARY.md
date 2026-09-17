---
phase: 69-string-externalization-ui-chrome
plan: 03
subsystem: i18n
tags: [next-intl, i18n, hero, react, vitest, lcp]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: "Plan 01 — locked namespace/key/array/ICU/stub convention, next-intl catalog/provider/navigation pipeline, renderWithIntl test harness"
provides:
  - "messages/en.json — Hero namespace (label, headlineSuffix, headlineItalic, subhead1/2, bookRide, priceAnchor rich key, scroll, ratingAria, googleReviews, words 5-item array, bookViaWhatsapp, heroAlt), synced to 6 stubs"
  - "Hero.tsx + HeroRating.tsx (sync Server Components) fully externalized via useTranslations('Hero')"
  - "HeroTypewriter.tsx, HeroWhatsApp.tsx, HeroBackground.tsx (client) fully externalized via useTranslations('Hero'), reading through the SiteChrome NextIntlClientProvider"
  - "Proof that one namespace can span a mixed server/client component cluster, including a t.rich interpolation and a t.raw array-valued key, with zero LCP/behavior regression"
affects: [70-string-externalization-booking-account, 71-content-externalization-marketing-seo-pages]

actuals:
  tokens: 3920
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "t.rich('priceAnchor', { amount, price: (chunks) => <span>...</span> }) — inline styled span inside a translated sentence, numeric ICU arg interpolated without locale-aware number formatting (plain {amount} coerces via String(), matching prior template-literal output byte-for-byte)"
    - "t.raw('words') as string[] inside a client component body — array-valued catalog key consumed at render time, replacing a module-level const; the LCP width-safety comment moved with it"
    - "useTranslations('Hero') called identically in both server (Hero, HeroRating) and client ('use client' HeroTypewriter/HeroWhatsApp/HeroBackground) components sharing one namespace — client reads resolve through the NextIntlClientProvider wired in Plan 01's SiteChrome, no new provider needed"

key-files:
  created: []
  modified:
    - components/Hero.tsx
    - components/HeroRating.tsx
    - components/HeroTypewriter.tsx
    - components/HeroWhatsApp.tsx
    - components/HeroBackground.tsx
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json

key-decisions:
  - "HeroBackground's HERO_ALT converted from a module-level const to a local const inside the component body (HERO_ALT = t('heroAlt')) — useTranslations can only be called inside the component, so the constant necessarily moves from module scope to render scope; all 3 usage sites (2x getImageProps alt, 1x <img alt>) untouched, byte-identical value at runtime"
  - "HeroTypewriter's LCP-safety code comment (words[0] must stay the widest phrase) was kept and reworded to point at the message-catalog array instead of the removed module-level const, preserving the warning for future translators/phase-72 authors"

patterns-established: []

requirements-completed: [STR-01]

coverage:
  - id: D1
    description: "Hero.tsx + HeroRating.tsx (sync Server Components) render every visible string, aria-label via useTranslations('Hero'); Hero stays synchronous (no await introduced); price anchor keeps its inline copper span through t.rich with the DB-driven airportPrice prop"
    requirement: STR-01
    verification:
      - kind: other
        ref: "grep -n \"useTranslations('Hero')\" components/Hero.tsx components/HeroRating.tsx (both match); grep -cE 'async function Hero' components/Hero.tsx (returns 0)"
        status: pass
      - kind: integration
        ref: "npm run build (exit 0, no MISSING_MESSAGE); npx vitest run (1184 passed, 0 failed)"
        status: pass
      - kind: manual_procedural
        ref: "npm run dev; curl http://localhost:3000/ — confirmed 'Prague · Premium Chauffeur', 'Book a ride', 'Airport transfers from', <span style=\"color:var(--copper)\">€69</span>, 'Google reviews', 'Rated 5 out of 5 from 4 Google reviews' all render byte-identical to pre-externalization copy"
        status: pass
    human_judgment: false
  - id: D2
    description: "HeroTypewriter, HeroWhatsApp, HeroBackground (client sub-parts) render their string/alt/rotating-words via useTranslations('Hero'), resolving through the SiteChrome provider; words array is a true JSON array (t.raw), not a comma-joined string; LCP-safe rotation timing/reduced-motion/interaction-gating unchanged"
    requirement: STR-01
    verification:
      - kind: other
        ref: "grep -c \"useTranslations('Hero')\" components/HeroTypewriter.tsx components/HeroWhatsApp.tsx components/HeroBackground.tsx (1 match each); node -e checked Hero.words.length === 5, Hero.heroAlt and Hero.bookViaWhatsapp present"
        status: pass
      - kind: integration
        ref: "npm run build (exit 0, no MISSING_MESSAGE); npx vitest run (1184 passed, 0 failed)"
        status: pass
      - kind: manual_procedural
        ref: "npm run dev; curl http://localhost:3000/ — confirmed 'Book via WhatsApp', full HERO_ALT sentence, and 'Chauffeur Service' (words[0]) all render byte-identical"
        status: pass
    human_judgment: false
  - id: D3
    description: "messages/en.json Hero namespace complete (all 13 keys across both tasks) and all 6 stub locale files byte-identical to en.json"
    requirement: STR-01
    verification:
      - kind: other
        ref: "cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json — all exit 0, re-checked after each task's catalog append"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-09-04
status: complete
---

# Phase 69 Plan 03: Externalize Hero + 4 Sub-Parts (LCP-Critical Cluster) Summary

**Hero.tsx, HeroRating.tsx, HeroTypewriter.tsx, HeroWhatsApp.tsx, and HeroBackground.tsx now consume one shared `useTranslations('Hero')` namespace — proving the Phase 69 catalog convention holds across a mixed sync-Server/Client-Component cluster with a `t.rich` price interpolation and a `t.raw` array-valued key, with zero byte-level or LCP-timing regression.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-04T13:52:00Z (approx)
- **Completed:** 2026-09-04T14:14:00Z (approx)
- **Tasks:** 2
- **Files modified:** 12 (5 components + 7 message catalogs)

## Accomplishments
- `messages/en.json` gained the full `Hero` namespace (13 keys: `label`, `headlineSuffix`, `headlineItalic`, `subhead1`, `subhead2`, `bookRide`, `priceAnchor` rich key, `scroll`, `ratingAria`, `googleReviews`, `words` 5-item array, `bookViaWhatsapp`, `heroAlt`), re-synced byte-identical to all 6 stub locales after each task.
- `Hero.tsx` stays a **synchronous** Server Component (`useTranslations`, no `await` introduced) — the RESEARCH.md Open Question #2 recommendation enforced as a hard acceptance criterion (`grep -cE 'async function Hero'` returns 0).
- The price anchor's inline copper `€{amount}` span survives through `t.rich('priceAnchor', { amount: airportPrice, price: (chunks) => <span style={{ color: 'var(--copper)' }}>{chunks}</span> })` — structurally XSS-safe (React-component renderer, never raw HTML), `airportPrice` stays the DB-driven prop untouched.
- `HeroRating.tsx`'s `aria-label` now built from `t('ratingAria', { rating: ratingValue, count: reviewCount })`; star-rendering math and `ratingValue.toFixed(1)` (numeric data) unchanged.
- `HeroTypewriter.tsx`'s 5 rotating phrases are a genuine JSON array (`t.raw('words') as string[]`), not a comma-joined string — a later phase can reorder per-locale without code changes. `words[0]` ("Chauffeur Service") stays the widest phrase; the LCP-safety code comment moved with it. Rotation timing, opacity transitions, `prefers-reduced-motion` gating, and the post-interaction-only rotation start are byte-for-byte unchanged.
- `HeroWhatsApp.tsx`'s visible "Book via WhatsApp" text now renders via `t('bookViaWhatsapp')`; `wa.me` href, prefilled query text, and the `trackMetaEvent` onClick handler untouched.
- `HeroBackground.tsx`'s `HERO_ALT` moved from a module-level const to `t('heroAlt')` inside the component body (required — `useTranslations` can only be called inside the component); all 3 usage sites (desktop `getImageProps` alt, mobile `getImageProps` alt, `<img alt>`) still reference the same value. Preload/picture/parallax-motion logic untouched.
- EN output verified byte-identical via a live `npm run dev` + `curl` spot-check after each task: headline, subhead, price anchor (`€69`), rating aria (`Rated 5 out of 5 from 4 Google reviews`), WhatsApp CTA, and the full `HERO_ALT` sentence all matched pre-externalization copy exactly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize Hero.tsx + HeroRating.tsx (server parts)** — `f96b3eb` (feat)
2. **Task 2: Externalize the 3 client sub-parts (HeroTypewriter, HeroWhatsApp, HeroBackground)** — `50ee9dc` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

## Files Created/Modified
- `components/Hero.tsx` - `useTranslations('Hero')` (sync); label, headline suffix, italic line, subhead, "Book a ride", `t.rich` price anchor, "Scroll" all externalized
- `components/HeroRating.tsx` - `useTranslations('Hero')`; `ratingAria` + `googleReviews` externalized
- `components/HeroTypewriter.tsx` - `useTranslations('Hero')`; `t.raw('words')` replaces the module-level const
- `components/HeroWhatsApp.tsx` - `useTranslations('Hero')`; `bookViaWhatsapp` replaces the hardcoded CTA text
- `components/HeroBackground.tsx` - `useTranslations('Hero')`; `heroAlt` replaces the module-level `HERO_ALT` const at all 3 usage sites
- `messages/en.json` - `Hero` namespace (13 keys total across both tasks)
- `messages/{ru,es,fr,ar,hi,zh}.json` - re-synced byte-identical EN-copy stubs after each task

## Decisions Made
- `HERO_ALT` necessarily moved from module scope to a local `const` inside `HeroBackground`'s component body — `useTranslations` is only callable inside the component, not at module load time. All 3 usage sites kept referencing the same identifier so the diff stays minimal and the value is still computed once per render.
- `HeroTypewriter`'s LCP-safety comment was preserved and reworded to reference the message-catalog array (rather than deleted, since the width-safety constraint on `words[0]` is exactly the kind of institutional knowledge Phase 72/73 translators need before reordering per-locale).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria passed on first implementation; no auto-fixes, no architectural questions, no auth gates.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The message-catalog pattern is now proven on the hardest case in the phase: a namespace shared across sync-Server + Client Components through the provider boundary, with both a `t.rich` interpolation and a `t.raw` array-valued key, and zero LCP/behavior regression.
- Remaining plans (69-04: Services/Fleet/HowItWorks — wait, HowItWorks already done in 69-02; 69-04/69-05 cover Services/Fleet and Testimonials/CookieBanner) can reuse this plan's `t.rich`/`t.raw` patterns directly for their own interpolated/array-valued keys (Services' `From €{price}` callouts, CookieBanner's Privacy/Legal `t.rich` links, per RESEARCH Pitfall 4/Pattern 5).
- No blockers for 69-04.

## Self-Check: PASSED

All 5 key component files verified present on disk (`[ -f ]`); both commits (`f96b3eb`, `50ee9dc`) verified present in `git log --oneline --all`; `messages/en.json` Hero namespace verified valid JSON with `words.length === 5`; all 6 stub locales verified byte-identical via `cmp -s`.

---
*Phase: 69-string-externalization-ui-chrome*
*Completed: 2026-09-04*
