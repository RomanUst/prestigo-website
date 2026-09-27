---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 07
subsystem: ui
tags: [rtl, i18n, next-intl, react, arabic]

# Dependency graph
requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh (73-01..73-06)
    provides: Physical-to-logical Tailwind RTL swap infrastructure, ar/hi/zh catalogs+content, code review (73-REVIEW.md) identifying CR-01/WR-01/WR-03
provides:
  - Nav.tsx account-menu chevron rotates open/closed only (no RTL mirror addend) — CR-01 BLOCKER closed
  - Nav.tsx account dropdown panel anchors via insetInlineEnd (logical) instead of physical right — WR-01 closed
  - TestimonialsCarousel.tsx ArrowRight/ArrowLeft keyboard nav is RTL-aware (isRtl-conditioned delta) — WR-03 closed
affects: [73-12 (D-10/D-11 human visual QA walkthrough — this plan is a prerequisite)]

actuals:
  tokens: 780
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Horizontally-symmetric SVG glyphs (e.g. chevron M2 4l4 4 4-4) need NO RTL mirror — only vertically-asymmetric shapes need scaleX(-1) conditioned on isRtl, never an extra +180deg rotation addend (rotation and horizontal-mirror are only equivalent for shapes also vertically symmetric)."
    - "Inline-style positional insets in RTL-aware client components use insetInlineEnd/insetInlineStart, never physical right/left."
    - "Keyboard arrow-key navigation in a carousel/menu derives isRtl from useLocale() === 'ar' locally, and swaps ArrowRight/ArrowLeft deltas rather than swapping the key names."

key-files:
  created: []
  modified:
    - components/Nav.tsx
    - components/TestimonialsCarousel.tsx

key-decisions:
  - "CR-01 fix removed the isRtl mirror addend entirely rather than replacing it with scaleX(-1) — the chevron path is horizontally symmetric and needs no mirror of any kind, per 73-REVIEW.md's root-cause analysis."
  - "Committed the three tasks as three separate atomic commits despite two touching the same file (Nav.tsx), by staging/reverting the WR-01 hunk between commits so each commit maps 1:1 to a plan task."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "Account-menu chevron rotation is open/closed only on /ar/ — no inverted indicator (CR-01)"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "grep -c isRtl components/Nav.tsx == 0 && grep -q 'menuOpen ? 180 : 0' components/Nav.tsx"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (no Nav.tsx errors)"
        status: pass
    human_judgment: true
    rationale: "Visual open/closed chevron correctness on the live /ar/ account menu is a D-10 human visual QA item (73-12); this plan proves the logic gate mechanically but the rendered glyph direction itself is confirmed at the human walkthrough."
  - id: D2
    description: "Account dropdown panel anchors to the reading-end edge under dir=rtl instead of the physical right edge (WR-01)"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "grep -q 'insetInlineEnd: 0' components/Nav.tsx && ! grep -q 'right: 0' components/Nav.tsx"
        status: pass
    human_judgment: true
    rationale: "Panel edge placement on /ar/ is confirmed visually at the D-10/D-11 walkthrough (73-12); this plan proves the CSS logical-property gate."
  - id: D3
    description: "Testimonial carousel ArrowRight/ArrowLeft keyboard navigation moves in the reader-correct direction under dir=rtl (WR-03)"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "grep -q useLocale, isRtl ? -1 : 1, isRtl ? 1 : -1 in components/TestimonialsCarousel.tsx"
        status: pass
      - kind: unit
        ref: "tests/TestimonialsCarousel.test.tsx (31 tests across 4 suites incl. nav-locale-render-parity)"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 07: RTL Nav Chevron & Carousel Direction Fixes Summary

**Closed the phase's one code-review BLOCKER (CR-01 chevron open/closed inversion on /ar/) plus WR-01 dropdown physical inset and WR-03 carousel arrow-key direction — all three JS/inline-style direction-logic bugs the mechanical Tailwind logical-property swap could not reach.**

## Performance

- **Duration:** ~10min
- **Completed:** 2026-09-19
- **Tasks:** 3/3 completed
- **Files modified:** 2 (components/Nav.tsx, components/TestimonialsCarousel.tsx)

## Accomplishments

- Removed the `isRtl`-conditioned `+180deg` addend from the account-menu chevron's rotation in `Nav.tsx` — the chevron path (`M2 4l4 4 4-4`) is horizontally symmetric and needs no mirror at all; the addend was inverting the open/closed indicator on `/ar/` (CR-01, the phase's one BLOCKER).
- Replaced the account dropdown panel's hardcoded physical `right: 0` inline style with the logical `insetInlineEnd: 0`, so the panel now anchors to the reading-end edge under `dir=rtl` and is a no-op in LTR (WR-01).
- Made `TestimonialsCarousel.tsx`'s `onKeyDown` handler RTL-aware: `ArrowRight`/`ArrowLeft` deltas now swap under `isRtl` (derived from `useLocale() === 'ar'`) so the physical arrow key matches the visual forward direction of the mirrored carousel on `/ar/` (WR-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix account-menu chevron RTL inversion (CR-01)** - `fbc6031` (fix)
2. **Task 2: Convert account dropdown panel to a logical inline-end inset (WR-01)** - `da4418f` (fix)
3. **Task 3: RTL-aware carousel arrow-key navigation (WR-03)** - `5b867d7` (fix)

## Files Created/Modified

- `components/Nav.tsx` - Chevron rotation reduced to open/closed only (isRtl mirror addend + unused `isRtl` const removed); dropdown panel `right: 0` replaced with `insetInlineEnd: 0`.
- `components/TestimonialsCarousel.tsx` - Added `useLocale` import; derived `isRtl` from `useLocale() === 'ar'`; `onKeyDown` ArrowRight/ArrowLeft deltas now conditioned on `isRtl`.

## Decisions Made

- Dropped the RTL mirror branch entirely for the chevron rather than replacing it with `scaleX(-1)` — per 73-REVIEW.md's root-cause walkthrough, this specific glyph is horizontally symmetric about x=6 and genuinely needs no mirror of any kind. Any future asymmetric chevron (e.g. pagination/back-navigation arrow) should use `scaleX(-1)` conditioned on `isRtl`, not a rotation addend, since rotation and horizontal-mirror are only equivalent for shapes that are also vertically symmetric.
- Committed Task 1 and Task 2 as two separate atomic commits even though both touch `Nav.tsx`, by temporarily reverting the WR-01 hunk before the Task 1 commit and reapplying it before the Task 2 commit — keeps a clean 1:1 mapping between plan tasks and commits for traceability.

## Deviations from Plan

None - plan executed exactly as written. All three acceptance-criteria grep gates and the `tsc --noEmit` check passed on first application; no auto-fixes, blockers, or architectural questions arose.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

CR-01 (the phase's one BLOCKER), WR-01, and WR-03 are all closed. `components/Nav.tsx` and `components/TestimonialsCarousel.tsx` both type-check clean and the full relevant test suite (`tests/nav-auth.test.tsx`, `tests/TestimonialsCarousel.test.tsx`, `tests/i18n-navigation.test.tsx`, `tests/nav-locale-render-parity.test.tsx` — 31 tests) passes, confirming en/ru/es/fr byte-parity is preserved and only `ar`/RTL behavior changed. This plan was the direct prerequisite named in the objective for the D-10/D-11 human visual walkthrough in 73-12 — that plan can now proceed against a correct chevron/dropdown/carousel baseline. Remaining phase-73 gap-closure plans (73-08 through 73-12, covering CR-02 bidi-isolation on translated route/service pages and WR-02/04/05) are unaffected by and independent of this plan's scope.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: components/Nav.tsx
- FOUND: components/TestimonialsCarousel.tsx
- FOUND: fbc6031 (Task 1 commit)
- FOUND: da4418f (Task 2 commit)
- FOUND: 5b867d7 (Task 3 commit)
