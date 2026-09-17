---
phase: 69-string-externalization-ui-chrome
plan: 02
subsystem: i18n
tags: [next-intl, i18n, footer, catalog, react, vitest]

requires:
  - phase: 69-string-externalization-ui-chrome
    provides: "messages/en.json Nav namespace + locked namespace/key/array/ICU/stub convention, i18n/routing.ts Link/usePathname exports, tests/helpers/renderWithIntl.tsx (69-01)"
provides:
  - "messages/en.json — Footer, FeatureStrip, HowItWorks namespaces (catalog arrays for services/routes/blog/pillars/steps)"
  - "6 byte-identical EN-copy stub files re-synced (messages/{ru,es,fr,ar,hi,zh}.json)"
  - "components/Footer.tsx fully externalized, every internal link converted from raw <a> to the locale-aware Link (closes Phase 68 IN-01 for Footer)"
  - "components/FeatureStrip.tsx and components/HowItWorks.tsx fully externalized"
affects: [70-string-externalization-booking-account, 71-content-externalization-marketing-seo-pages]

actuals:
  tokens: 11021
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Structural href/icon/number/photo-path config stays in the component as a plain array, zipped by array index with the translated catalog array from t.raw('key') — never merged into the message JSON itself (reused verbatim from the 69-01 convention)"
    - "Footer's 3 link groups (services/routes/blog) each pair a structural hrefs array with a t.raw() labels array by index"

key-files:
  created: []
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - components/Footer.tsx
    - components/FeatureStrip.tsx
    - components/HowItWorks.tsx

key-decisions:
  - "Footer's services array key uses `s.href + i` as the React key (not `s.href` alone) because 3 of the 8 service items intentionally share the same href (/services) — a plain href key would collide"
  - "FeatureStrip's icon components (UserRound/Car/ShieldCheck/Clock) and HowItWorks' step number/photo path stay in a plain in-code array (featureIcons / stepConfig), zipped by index with the translated pillars/steps catalog arrays — matches the plan's explicit non-translatable-structural-data guidance"

patterns-established: []

requirements-completed: [STR-01]

coverage:
  - id: D1
    description: "Footer renders every visible string + aria-label through useTranslations('Footer'); every internal link (CTA /book, 8 services, 5 routes, /routes, 3 blog, /blog, /privacy, /terms) converted to the locale-aware Link; tel:/mailto:/wa.me/instagram/facebook stay raw <a>"
    requirement: STR-01
    verification:
      - kind: other
        ref: "grep -cE '<a[[:space:]]+href=\"/' components/Footer.tsx (0) + grep -cE 'href=\"(tel:|mailto:|https://)' components/Footer.tsx (5)"
        status: pass
      - kind: integration
        ref: "npm run dev; curl-equivalent fetch of /ru — confirmed all 11 internal footer hrefs (book/services/routes/corporate/about/faq/routes/prague-vienna/blog/blog-post/privacy/terms) carry the /ru prefix"
        status: pass
    human_judgment: false
  - id: D2
    description: "FeatureStrip and HowItWorks render every string, aria-label, and alt text through their own namespaces; icons/step-numbers/photo-paths stay structural"
    requirement: STR-01
    verification:
      - kind: other
        ref: "grep -n \"useTranslations('FeatureStrip')\" components/FeatureStrip.tsx + grep -n \"useTranslations('HowItWorks')\" components/HowItWorks.tsx — both match"
        status: pass
    human_judgment: false
  - id: D3
    description: "messages/en.json gains Footer/FeatureStrip/HowItWorks namespaces with correctly-sized catalog arrays (services:8, routes:5, blog:3, pillars:4, steps:3); all 6 stubs re-synced byte-identical"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "node -e JSON.parse + array-length assertions on messages/en.json; cmp -s messages/en.json messages/{ru,es,fr,ar,hi,zh}.json (all exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "EN output of all three components is byte-for-byte unchanged (visible text, line breaks, punctuation, arrows, aria-labels, alt text, the © {year} interpolation)"
    requirement: STR-01
    verification:
      - kind: manual_procedural
        ref: "npm run dev; fetch('http://localhost:3000') — 34/34 exact-string substring checks passed for Footer/FeatureStrip/HowItWorks copy; 'Step 01/02/03' verified equal after stripping React hydration HTML comment markers (an unavoidable SSR-markup artifact of any t()-converted adjacent-expression text, not a content change — confirmed by DOM-text-content equivalence, same methodology as 69-01's Nav verification)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full vitest suite green + npm run build green — no regression from Phase 69-01 or Phase 68"
    requirement: STR-01
    verification:
      - kind: unit
        ref: "npx vitest run — 105 test files passed (5 skipped), 1184 tests passed, 0 failed"
        status: pass
      - kind: integration
        ref: "npm run build — exit 0, all locale subpaths prerender, no MISSING_MESSAGE in build or dev-server logs"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-09-04
status: complete
---

# Phase 69 Plan 02: Footer + FeatureStrip + HowItWorks Externalization Summary

**Footer (largest raw-`<a>`-to-`Link` conversion in the phase — 19 internal links across 3 catalog groups), FeatureStrip, and HowItWorks fully externalized via `useTranslations`, applying the Plan 01 namespace/array/stub convention verbatim with zero EN regression.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-09-04T13:39:32Z (approx, following 69-01 completion)
- **Completed:** 2026-09-04T13:48:55Z
- **Tasks:** 2
- **Files modified:** 10 (3 components, 7 message-catalog files)

## Accomplishments
- `messages/en.json` gained `Footer` (19 keys incl. 3 catalog arrays — `services`:8, `routes`:5, `blog`:3), `FeatureStrip` (`sectionAria` + `pillars`:4 objects), and `HowItWorks` (`label`/heading lines/`stepPrefix` + `steps`:3 objects) namespaces — all copy-pasted verbatim from the prior hardcoded JSX, never re-typed.
- `Footer.tsx` closes the largest remaining piece of Phase 68's IN-01 link-sweep debt: all 19 internal links (the `/book` CTA, 8 service items, 5 route items, `/routes`, 3 blog items, `/blog`, `/privacy`, `/terms`) converted from raw `<a href="/...">` to the locale-aware `Link` from `@/i18n/routing`. `tel:+420...`, `mailto:...`, `https://wa.me/...`, and the two social `https://` links stay raw `<a>` (external/protocol, deliberately unconverted).
- The chelautotrans s.r.o. legal address block, phone number text, and email text stay hardcoded EN — confirmed out-of-scope per RESEARCH Pitfall 5, matching the locked convention.
- `FeatureStrip.tsx`'s 4 pillars (icon + title + sub) and `HowItWorks.tsx`'s 3 steps (title/body/photoAlt) externalized with the icon components / step numbers / photo paths kept as structural in-code config, zipped by array index with the translated catalog arrays — the same "structural config stays in code" pattern Plan 01 established for Nav's hrefs.
- Manual dev-server verification (Task-level, not a formal checkpoint): 34/34 substring checks confirmed EN output unchanged on `/`, and all 11 Footer internal hrefs carry the `/ru` prefix when fetched from `/ru` — no `MISSING_MESSAGE` in build or dev-server logs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Externalize Footer + convert every internal link to the localized Link** - `02cb76e` (feat)
2. **Task 2: Externalize FeatureStrip + HowItWorks** - `123e976` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below).

## Files Created/Modified
- `messages/en.json` - `Footer`, `FeatureStrip`, `HowItWorks` namespaces added
- `messages/{ru,es,fr,ar,hi,zh}.json` - re-synced byte-identical EN-copy stubs (twice — once per task)
- `components/Footer.tsx` - `useTranslations('Footer')`; all internal `<a>` → `Link` from `@/i18n/routing`
- `components/FeatureStrip.tsx` - `useTranslations('FeatureStrip')`; icons stay structural
- `components/HowItWorks.tsx` - `useTranslations('HowItWorks')`; step number/photo path stay structural

## Decisions Made
- Footer's services `<li>` React key uses `s.href + i` rather than `s.href` alone: 3 of the 8 service items share `href: '/services'` (VIP & Events, Group Transfer both point at `/services` alongside Airport Transfer), so a bare href key would collide and produce a React duplicate-key warning.
- FeatureStrip's `featureIcons` array and HowItWorks' `stepConfig` array (number + photo path) are kept as plain in-code arrays zipped by index with `t.raw('pillars')`/`t.raw('steps')` — consistent with the plan's explicit "keep icon/href/number/photo config in the component, don't move it into the catalog" instruction.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. One verification nuance worth recording: the plan's acceptance-criteria grep for external/protocol anchors (`grep -cE '<a[[:space:]]+href="(tel:|mailto:|https://)' components/Footer.tsx`) returns `2`, not the expected `>=5`, because 3 of the 5 external anchors (WhatsApp, Instagram, Facebook) have their `href` attribute on a line following `<a` rather than on the same line — this is pre-existing formatting inherited unchanged from the original file (confirmed via `git show HEAD~2:components/Footer.tsx` returning the identical `2` for the same strict pattern), not a regression introduced by this plan. A line-boundary-agnostic grep (`grep -cE 'href="(tel:|mailto:|https://)' components/Footer.tsx`) correctly returns `5`, confirming all 5 external/protocol anchors are present and unconverted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The Footer/FeatureStrip/HowItWorks externalization is complete; Plan 69-01's namespace/key/array/ICU/stub convention has now been proven across a client component (Nav), a link-heavy server component (Footer), and two simple server components (FeatureStrip, HowItWorks) with zero deviation from the locked convention.
- Remaining Phase 69 scope (Hero + sub-parts, Services/Fleet, Testimonials/CookieBanner) is unblocked and can proceed directly against the same pattern.
- No blockers for 69-03.

## Self-Check: PASSED

All 10 key files + this SUMMARY verified present on disk (`[ -f ]`); both commits (`02cb76e`, `123e976`) verified present in `git log --oneline --all`.

---
*Phase: 69-string-externalization-ui-chrome*
*Completed: 2026-09-04*
