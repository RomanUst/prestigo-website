---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 03
subsystem: ui
tags: [tailwind, rtl, i18n, logical-properties, bidi, next-intl]

requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh (plan 01)
    provides: "html dir=rtl wiring for ar, Nav.tsx rtl: chevron precedent, byte-parity test scaffolding"
provides:
  - "CookieBanner toggle knob mirrors correctly under dir=rtl (position + transform)"
  - "Hero decorative corner accents converted to logical start/end; scroll-cue centering pair explicitly preserved"
  - "HowItWorks step-number label converted to logical start"
  - "FeatureStrip pillar divider and TestimonialsCarousel margin/border/padding converted to logical properties"
  - "Hero price anchor DNT token wrapped in <bdi> for bidi isolation (D-11)"
affects: [74-seo-hreflang-metadata, 75-e2e-verification-launch]

actuals:
  tokens: 1300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Tailwind v4 native logical utilities (start-*/end-*/border-s/ms-*/ps-*) replacing physical left/right/ml/mr/pl/pr/border-l on judgment-requiring shared components"
    - "<bdi> wrap at existing rich-text tag render boundary (t.rich's price render fn) for DNT numeral/currency isolation, matching the glossary richTextTags convention"

key-files:
  created: []
  modified:
    - components/CookieBanner.tsx
    - components/Hero.tsx
    - components/HowItWorks.tsx
    - components/FeatureStrip.tsx
    - components/TestimonialsCarousel.tsx

key-decisions:
  - "CookieBanner toggle knob: added rtl:-translate-x-5 alongside start-0.5 (Rule 1 auto-fix) — the plan's action text only called for the position class swap, but leaving the checked-state translate-x-5 unconditional would push the knob off the track once its resting position mirrors to the right under dir=rtl; negating the transform under rtl: is the minimal correct fix."
  - "Hero scroll-cue centering pair (left-1/2 + -translate-x-1/2) left fully untouched, not partially converted — converting only the position half (start-1/2) would resolve to right:50% under RTL, which combined with the unconditional translateX(-50%) breaks centering (not a true logical equivalent); the plan's must_haves phrasing ('the pair is preserved') is honored literally over the task action's 'if desired' optional wording."
  - "Hero decorative corner accent gradient directions (bg-gradient-to-r/-to-b/-to-t) were NOT flipped when their positions converted to start-*/end-* — out of scope per PATTERNS.md/UI-SPEC's conversion table, which covers only text-align/padding/margin/border/absolute-position utilities, not background-image gradient direction; left as a documented, low-severity cosmetic note rather than an architectural change."
  - "No directional-icon rtl: mirroring was added to any of the five components — audited all five against the UI-SPEC Mirroring Rules table and found zero rendered chevron/arrow glyphs. TestimonialsCarousel's ArrowLeft/ArrowRight are keydown key names (keyboard nav), not rendered icons, and are outside the Mirroring Rules table's scope (rendered glyphs only) — left unchanged."

patterns-established:
  - "DNT price/phone tokens rendered via t.rich's rich-text tag render functions get bidi-isolated by swapping the wrapping element from <span> to <bdi> at that same call site — no new parsing pass, matches i18n/glossary.json doNotTranslate.structural.richTextTags boundaries."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "CookieBanner toggle-switch knob converted to logical start-0.5 with rtl:-translate-x-5 on the checked-state transform, so it mirrors correctly under dir=rtl"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "grep -nE (left|right)-[0-9] components/CookieBanner.tsx — 0 matches"
        status: pass
    human_judgment: true
    rationale: "Visual mirroring correctness of a toggle knob position/transform is a rendering judgment call best confirmed by a human viewing /ar/ — no automated screenshot/visual-regression test exists for this component yet."
  - id: D2
    description: "Hero decorative corner accents converted to logical start-0/end-0; scroll-cue centering pair (left-1/2 + -translate-x-1/2) explicitly preserved unconverted to avoid breaking centering under RTL"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "grep -c -translate-x-1/2 components/Hero.tsx — count unchanged at 1"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#renders and matches the golden EN snapshot"
        status: pass
    human_judgment: false
  - id: D3
    description: "HowItWorks step-number label position converted to logical start-5"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#renders and matches the golden EN snapshot"
        status: pass
    human_judgment: false
  - id: D4
    description: "FeatureStrip pillar divider (lg:border-l) and TestimonialsCarousel margin/border/padding (ml-2, border-l-2, pl-6) converted to logical border-s/ms-2/border-s-2/ps-6"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/TestimonialsCarousel.test.tsx (16 tests)"
        status: pass
      - kind: unit
        ref: "grep -cE (border-l|border-r|ml-|mr-|pl-|pr-)[0-9]? components/FeatureStrip.tsx components/TestimonialsCarousel.tsx — sum 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hero price anchor DNT token (€{amount}) wrapped in <bdi> at the existing t.rich price render boundary for bidi isolation on /ar/"
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "grep -rc <bdi components/Hero.tsx — 2 (comment + JSX)"
        status: pass
    human_judgment: true
    rationale: "Bidi-isolation correctness (numeral stays LTR and un-reversed inside an RTL paragraph) is a rendering behavior best confirmed visually on a live /ar/ page — no automated bidi-rendering assertion exists in this test suite."

duration: ~15min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 03: Shared-Component RTL/Logical-Property Conversion Summary

**Converted CookieBanner, Hero, HowItWorks, FeatureStrip, and TestimonialsCarousel from physical-direction Tailwind classes to logical properties + rtl: mirroring + `<bdi>` bidi isolation, extending the Nav.tsx tracer pattern to the site's other shared chrome components.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-19
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- CookieBanner's toggle-switch knob now mirrors correctly under `dir="rtl"` — both the resting position (`start-0.5`) and the checked-state slide transform (`rtl:-translate-x-5`).
- Hero's decorative corner accents converted to logical `start-0`/`end-0`; the scroll-cue centering transform pair was audited and correctly left untouched to avoid breaking centering under RTL.
- HowItWorks step-number label converted to logical `start-5`.
- FeatureStrip's pillar divider and TestimonialsCarousel's margin/border/padding converted to logical `border-s`/`ms-2`/`border-s-2`/`ps-6`, identical spacing values.
- Hero's price anchor DNT token now renders inside a `<bdi>` element at the existing rich-text `price` tag render boundary, isolating it from RTL bidi reordering on `/ar/`.
- Audited all five components against the UI-SPEC Mirroring Rules table for direction-encoding chevron/arrow icons — none found; no `rtl:rotate-180`/`rtl:-scale-x-100` classes were needed or added, correctly avoiding over-application to non-directional marks.

## Task Commits

Each task was committed atomically:

1. **Task 1: CookieBanner + Hero + HowItWorks — knob, decorative corners, absolute-position audit** - `9331eb4` (feat)
2. **Task 2: FeatureStrip + TestimonialsCarousel — border/margin/padding logical conversion** - `f650d37` (feat)
3. **Task 3: Directional-icon mirroring (rtl:) + bidi isolation of DNT price/phone tokens** - `f69906d` (feat)

**Plan metadata:** (this commit) `docs(73-03): complete non-latin-rtl-infra-ar-hi-zh plan`

## Files Created/Modified
- `components/CookieBanner.tsx` - Toggle knob: `left-0.5` → `start-0.5`; checked-state transform gained `rtl:-translate-x-5`
- `components/Hero.tsx` - Corner accents `left-0`/`right-0` → `start-0`/`end-0`; price anchor `<span>` → `<bdi>` for DNT isolation; centering pair (line 96) intentionally untouched
- `components/HowItWorks.tsx` - Step-number label `left-5` → `start-5`
- `components/FeatureStrip.tsx` - Pillar divider `lg:border-l` → `lg:border-s`
- `components/TestimonialsCarousel.tsx` - Star-badge `ml-2` → `ms-2`; pull-quote `border-l-2 pl-6` → `border-s-2 ps-6`

## Decisions Made
- CookieBanner toggle: added `rtl:-translate-x-5` beyond the plan's literal instruction (Rule 1 auto-fix) — without it the knob's checked-state slide would push it off the track once the resting position mirrors under RTL. See key-decisions in frontmatter for full reasoning.
- Hero scroll-cue centering pair: left fully unconverted rather than partially converting the position half, because `right:50%` + unconditional `translateX(-50%)` is not a true logical-equivalent centering pair — it would visually break centering on `/ar/`.
- Hero corner-accent gradient directions were not flipped alongside their position classes — out of scope per PATTERNS.md's conversion table (covers positional/spacing utilities, not `bg-gradient-to-*` direction), a purely cosmetic/subtle effect, not a functional RTL break.
- No `rtl:` mirroring classes were added to any of the five components — all were audited against the Mirroring Rules table and none render a direction-encoding chevron/arrow icon.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CookieBanner toggle knob checked-state transform would break under RTL without a mirrored translate**
- **Found during:** Task 1 (CookieBanner conversion)
- **Issue:** The plan's action text called for converting only the knob's resting-position class (`left-0.5` → `start-0.5`). Simulating the RTL layout showed that leaving the checked-state `translate-x-5` unconditional would push the knob physically further right (off the track) once its resting position mirrors to the right side under `dir="rtl"`, rather than sliding it toward the visually-correct "on" side.
- **Fix:** Added `rtl:-translate-x-5` alongside the existing `translate-x-5` in the checked-state class string, so the slide direction mirrors correctly under RTL while remaining a no-op under LTR.
- **Files modified:** `components/CookieBanner.tsx`
- **Verification:** `grep -nE "(left|right)-[0-9]" components/CookieBanner.tsx` returns 0; reasoned through the CSS box-model math for both LTR and RTL cases.
- **Committed in:** `9331eb4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for the toggle to genuinely satisfy the plan's own must_haves truth ("mirrors under dir=rtl"). No scope creep — confined to the exact element the plan already targeted.

## Issues Encountered
- Found 35 pre-existing test failures on a full `npx vitest run` (`tests/blog-locale-fallback.test.ts`, `tests/legal.test.ts`, `tests/route-content.test.ts`, `tests/routes-a/b/c.test.ts`) — all asserting a stale "ar still falls back to EN" expectation that Phase 73-02's real ar/hi/zh content generation (commit `f6f9af5`) invalidated. Confirmed none of these test files import or exercise any of this plan's five files; failure count and identity were unchanged before and after this plan's edits. Logged to `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md` per the Scope Boundary rule — not fixed here (out of scope for a component-level RTL class conversion plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Five of the highest-traffic shared components (chrome that appears on nearly every public page) now carry correct logical-property RTL layout and bidi-isolated DNT tokens, extending the Nav.tsx tracer pattern from 73-01.
- Remaining RTL-01 conversion surface (route pages, blog pages) is tracked in other Phase 73 plans (73-04/05/06 per the phase directory listing).
- The 35 pre-existing stale-fallback test failures (deferred-items.md) should be swept up by whichever plan/phase next touches `tests/route-content.test.ts` / `tests/routes-*.test.ts` / `tests/legal.test.ts` / `tests/blog-locale-fallback.test.ts` fixtures now that real ar/hi/zh content exists.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

All 5 modified component files confirmed present on disk; SUMMARY.md and deferred-items.md confirmed present; all 3 task commits (9331eb4, f650d37, f69906d) confirmed present in `git log --oneline --all`.
