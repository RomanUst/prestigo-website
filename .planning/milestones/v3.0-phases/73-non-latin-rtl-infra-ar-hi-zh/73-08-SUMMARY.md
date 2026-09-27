---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 08
subsystem: i18n
tags: [next-intl, rtl, bidi, react, content-interpolation]

# Dependency graph
requires:
  - phase: 73-05
    provides: components/Hero.tsx's <bdi> DNT price-isolation pattern (D-11 source-of-truth)
  - phase: 73-06
    provides: real AI-translated ar/hi/zh content in content/routes/*, content/pages/*
provides:
  - "interpolateBidi(template, values) render helper — isolates only the substituted price token in <bdi>, leaves surrounding prose unwrapped"
  - "CR-02 closed on app/[locale]/routes/prague-berlin/page.tsx and app/[locale]/services/city-rides/page.tsx"
  - "Render-test backstop (tests/route-page-render.test.tsx) proving the /ar bidi-isolation fix, independent of the EN byte-parity snapshot"
affects: [73-09 (mechanical sweep of the remaining ~29 route pages / other service pages for the same CR-02 pattern)]

# Actuals (#2632)
actuals:
  tokens: 4598
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "interpolateBidi(): sentence-level DNT-token render sites use this ReactNode-returning sibling of interpolate(); metadata/JSON-LD strings keep the plain-string interpolate()"
    - "Bare price-token render sites (v.price, c.price, €{businessHourly}/hr) wrap the already-interpolated string value directly in inline <bdi> rather than going through interpolateBidi()"

key-files:
  created:
    - lib/content-interpolate.test.tsx
  modified:
    - lib/content-interpolate.ts
    - app/[locale]/routes/prague-berlin/page.tsx
    - app/[locale]/services/city-rides/page.tsx
    - tests/route-page-render.test.tsx

key-decisions:
  - "interpolateBidi splits on the same /\\{(\\w+)\\}/g token boundary as interpolate() and wraps only the matched token's substituted value in createElement('bdi', ...) — literal text (including any € sign outside the token) stays a plain string segment, so the isolate is exactly the digit run, not the currency symbol or surrounding words"
  - "Extended Task 2's scope (Rule 2) to also fix the prague-berlin 'Price from' highlight bare-price render (line 129) — named in 73-REVIEW.md's CR-02 file-line reference but not spelled out in the plan's action text; same bare-token pattern as v.price/c.price"
  - "Task 3's render-test targets the sentence-level cta.headingItalic site specifically (exact-substring assertion against the real ar content string) rather than a blanket 'no bdi contains whitespace' rule, because the plan's own bare-token fix for v.price/c.price intentionally wraps short labels like 'From €185' / 'ابتداءً من €485' — which do contain a leading word — as a single <bdi>, per the plan's explicit acceptance criteria"

patterns-established:
  - "Sentence-level DNT price field -> interpolateBidi() at the render call (not the plain interpolate() precompute)"
  - "Bare price-only field -> inline <bdi>{value}</bdi> around the already-interpolated string"

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "interpolateBidi(template, values) helper added to lib/content-interpolate.ts — wraps each substituted token in <bdi>, unmatched tokens fall through literally, existing interpolate() untouched"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "lib/content-interpolate.test.tsx#interpolateBidi"
        status: pass
    human_judgment: false
  - id: D2
    description: "CR-02 closed on prague-berlin and city-rides — every interpolated price/number token rendered inside translated ar prose is bidi-isolated (hero.intro, cta.headingItalic, highlights 'Price from', v.price, c.price on prague-berlin; €{businessHourly}/hr, vClassLine, firstClassLine on city-rides); metadata interpolate() calls untouched"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueBerlinPage — /ar DNT price bidi-isolation (CR-02 backstop)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (no errors in either page or content-interpolate.ts)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Render-test backstop added confirming the /ar bidi-isolation fix, while the pre-existing en/ru/es/fr byte-parity snapshot for prague-vienna remains unchanged (D-12 non-regression)"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — render byte-parity proof"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueBerlinPage — /ar DNT price bidi-isolation (CR-02 backstop)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 08: CR-02 DNT Price Bidi-Isolation (prague-berlin + city-rides) Summary

**Added a reusable `interpolateBidi()` render helper and applied it (plus inline `<bdi>` wraps) to close CR-02 — the missing DNT price bidi-isolation — on `prague-berlin` and `city-rides`, the two pages that actually render AI-translated Arabic prose with embedded live prices.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `lib/content-interpolate.ts` gained a new exported `interpolateBidi(template, values): ReactNode` that isolates only the substituted `{token}` value in `<bdi>` via `createElement`, leaving surrounding translated prose unwrapped; the original string-returning `interpolate()` is untouched (still consumed by `generateMetadata()`).
- `app/[locale]/routes/prague-berlin/page.tsx`: sentence-level price renders (`content.hero.intro`, `content.cta.headingItalic`) now use `interpolateBidi()` at the render call; bare price-token renders (`{v.price}`, `{c.price}`, and the "Price from" highlight bare value) are wrapped inline in `<bdi>`.
- `app/[locale]/services/city-rides/page.tsx`: the bare `€{businessHourly}/hr` literal is wrapped as `€<bdi>{businessHourly}</bdi>`; the `vClassLine`/`firstClassLine` precomputes switched from `interpolate()` to `interpolateBidi()` so the embedded hourly-rate token is isolated where rendered.
- Added a render-test backstop (`tests/route-page-render.test.tsx`) asserting the `/ar` render of `prague-berlin` isolates only the price digits at the sentence-level site (`€<bdi>485</bdi>`, not the whole heading), while the pre-existing en/ru/es/fr byte-parity snapshot for `prague-vienna` stays unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the interpolateBidi render helper + unit test** - `adccda2` (feat)
2. **Task 2: Apply DNT price bidi-isolation on prague-berlin + city-rides** - `b8a87a2` (fix)
3. **Task 3: Render-test backstop for bidi isolation on an /ar route render** - `75fdd76` (test)

_No TDD gate applies — this plan's tasks are `type="auto"` (Task 1's `tdd="true"` unit test was authored alongside the implementation in a single commit per the plan's action text, not as a separate RED/GREEN pair)._

## Files Created/Modified
- `lib/content-interpolate.ts` - new `interpolateBidi()` export; `interpolate()` unchanged
- `lib/content-interpolate.test.tsx` - unit tests for `interpolateBidi()` (single/multi-token isolation, unmatched-token fallthrough, `interpolate()` regression check)
- `app/[locale]/routes/prague-berlin/page.tsx` - `interpolateBidi` import + sentence-level swaps (hero.intro, cta.headingItalic); inline `<bdi>` on `{v.price}`, `{c.price}`, and the copper "Price from" highlight
- `app/[locale]/services/city-rides/page.tsx` - `interpolateBidi` import; `vClassLine`/`firstClassLine` precomputes switched; inline `<bdi>` on the `€{businessHourly}/hr` literal
- `tests/route-page-render.test.tsx` - new `/ar` render assertion for `PragueBerlinPage` (CR-02 backstop), alongside the untouched EN byte-parity snapshot

## Decisions Made
- `interpolateBidi()` isolates exactly the substituted token value, not the literal `€` that sits outside the `{token}` boundary in the content JSON — matching `interpolate()`'s own regex scope and avoiding a new parsing pass.
- Task 2 was extended (Rule 2 — auto-add missing critical functionality) to also fix the prague-berlin "Price from" highlight bare-price render, which 73-REVIEW.md's CR-02 file/line reference named (line 129) but the plan's action text didn't spell out — same bare-token pattern as the explicitly-named `v.price`/`c.price` sites, and required by the plan's own must_haves truth ("every interpolated price/number token... is bidi-isolated").
- The render-test backstop targets the known real-content exact substring (`ابتداءً من €<bdi>485</bdi>، بسعر ثابت.`) for the sentence-level site, rather than a blanket "no `<bdi>` contains whitespace" rule — the plan's own bare-token fix for `v.price`/`c.price` intentionally wraps short labels containing a lead-in word (e.g. "From €185" / "ابتداءً من €485") as a single `<bdi>`, per its explicit acceptance criteria grep pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wrapped the prague-berlin "Price from" highlight bare-price render in `<bdi>`**
- **Found during:** Task 2
- **Issue:** 73-REVIEW.md's CR-02 finding cited `app/[locale]/routes/prague-berlin/page.tsx:...129` as part of the missing-bidi-isolation defect, but the plan's Task 2 action text only explicitly named the `{v.price}` (193) and `{c.price}` (237) bare-token sites, omitting the highlights render. The highlights array includes a `"Price from": "€{ePrice}"` entry rendered as a bare string at line 129 whenever `copper` is true — the same unwrapped-DNT-token defect.
- **Fix:** Conditionally wrapped `{h.value}` in `<bdi>` only when `h.copper` is true (the existing style-distinguishing flag for the price highlight), leaving the non-price highlight values (`~350 km`, `~4 hours`, the vehicle-tag list) unwrapped.
- **Files modified:** `app/[locale]/routes/prague-berlin/page.tsx`
- **Verification:** Manual render inspection (via the Task 3 test's `getPropertyByRegex` extraction) confirmed `<bdi>€485</bdi>` renders for the highlight in `/ar`.
- **Committed in:** `b8a87a2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Closes the exact gap the code review named at that file/line; no scope creep beyond the two named pages.

## Issues Encountered
- Initial render-test assertion assumed every `<bdi>` isolate would contain a pure `€\d+` price with no leading words, which conflicted with the plan's own explicit bare-token design for `v.price`/`c.price` (these contain a short lead-in word in the real ar content, e.g. "ابتداءً من €485" — "From €485"). Corrected the test to assert against the specific sentence-level render site's exact substring instead of a blanket no-whitespace rule across all isolates — this reflects the plan's actual two-category design (sentence-level via `interpolateBidi()` vs. bare-label wrap), not a bug in the implementation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CR-02 pattern proven end-to-end on the two representative pages named by 73-REVIEW.md; `interpolateBidi()` is ready for reuse by 73-09's mechanical sweep across the remaining ~29 route pages and other service pages that share the same `interpolate()`-precompute-into-prose shape.
- No blockers. The plan's scope was deliberately narrow (2 pages) — 73-09 (not yet planned/executed) carries the broader sweep.

## Self-Check: PASSED

All 5 files verified present on disk; all 3 task commits (`adccda2`, `b8a87a2`, `75fdd76`) verified present in git log.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*
