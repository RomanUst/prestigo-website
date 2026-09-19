---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 10
subsystem: ui
tags: [rtl, css, logical-properties, bdi, bidi-isolation, i18n]

# Dependency graph
requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    provides: 73-REVIEW.md's exact file:line diagnosis for WR-02 and WR-05, plus the Hero.tsx isolate-the-token-only <bdi> precedent (73-08)
provides:
  - "app/globals.css fully logical-property-clean for the four residual physical-direction rules found by the review (.skip-link, .rdp-nav, .rdp-month_caption, .cta-text)"
  - "Blog CTA <bdi> scope narrowed to DNT numeral/price/time tokens only, matching the Hero.tsx pattern"
affects: [73-12 (D-10 visual walkthrough), any future phase reusing app/globals.css skip-link/calendar/cta-text rules or the three static blog CTA headings]

# Actuals (#2632)
actuals:
  tokens: 900
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS logical properties (inset-inline-start/end, text-align: start, centered transform-origin) for direction-neutral or reading-direction-anchored rules"
    - "bdi scope narrowed to the DNT token only, with display-italic styling moved to a wrapping span — matches components/Hero.tsx:79-89"

key-files:
  created: []
  modified:
    - app/globals.css
    - app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
    - app/[locale]/blog/prague-airport-to-city-center/page.tsx
    - app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx

key-decisions:
  - "cta-text hover-zoom transform-origin set to centered (50% 50%) rather than a :dir(rtl)-conditional left/right pair — the review's fix note offered both options and centered is direction-neutral with zero added complexity."
  - "Vienna CTA isolates both the price (€455) and the duration (3h 15min) in separate <bdi> elements per D-11, while the two airport CTAs isolate only the price (no duration token present in their copy)."

patterns-established:
  - "When narrowing an over-broad bdi that also carries styling, move the class to a wrapping span rather than duplicating it or leaving it on the bdi — keeps the isolate boundary pure and the visible styling untouched."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "app/globals.css residual physical-direction CSS (.skip-link, .rdp-nav, .rdp-month_caption, .cta-text) converted to logical properties (WR-02)"
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "grep gate: inset-inline-start: 1rem, inset-inline-end: 0, text-align: start present; left: 1rem and transform-origin: left center absent (0 occurrences) — plan's <verify> automated block, GATE_PASS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three static blog CTA headings narrow <bdi> scope to the DNT price/duration token only, moving display-italic to a wrapping span (WR-05)"
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "grep gate: bdi className=\"display-italic\" count across the three files is 0; <bdi>€69</bdi> and <bdi>€455</bdi> present — plan's <verify> automated block, GATE_PASS"
        status: pass
    human_judgment: false

duration: ~3min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 10: RTL Gap-Closure — Logical CSS + Blog CTA bdi Narrowing Summary

**Closed WR-02 (four residual physical-direction CSS rules in globals.css converted to logical properties) and WR-05 (three static blog CTA headings' over-broad `<bdi>` narrowed to isolate only the DNT price/duration token, matching the Hero.tsx pattern).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-19T19:53:00Z
- **Completed:** 2026-09-19T19:55:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `app/globals.css`: `.skip-link` (`left` → `inset-inline-start`), `.rdp-nav` (`right` → `inset-inline-end`), `.rdp-month_caption` (`text-align: left` → `start`), and `.cta-text` (`transform-origin: left center` → centered `50% 50%`) all now follow reading direction or are direction-neutral under `dir=rtl`.
- Three static blog CTA headings (`prague-airport-taxi-vs-chauffeur`, `prague-airport-to-city-center`, `prague-vienna-transfer-vs-train`) restructured so `display-italic` styling lives on a wrapping `<span>` and each `<bdi>` isolates only its numeral/price/duration run — no plain prose sits inside an isolate anymore.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert residual physical-direction CSS to logical properties (WR-02)** - `b35f4bd` (fix)
2. **Task 2: Narrow blog CTA `<bdi>` scope to the DNT token only (WR-05)** - `a3d71f7` (fix)

_Note: no TDD tasks in this plan — both are `type="auto"` presentational fixes with grep-based automated `<verify>` gates._

## Files Created/Modified
- `app/globals.css` - four physical-direction rules converted to logical equivalents (see Accomplishments)
- `app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx` - CTA `<bdi>` narrowed to `€69` only
- `app/[locale]/blog/prague-airport-to-city-center/page.tsx` - CTA `<bdi>` narrowed to `€69` only
- `app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx` - CTA `<bdi>` narrowed to `€455` and `3h 15min` (two separate isolates)

## Decisions Made
- `.cta-text` hover-zoom uses a centered `transform-origin` (not a `:dir(rtl)`-conditional pair) — simplest direction-neutral fix, matches the review's primary suggestion.
- Vienna CTA isolates both the price and duration tokens separately (per D-11's numeral-run scope, which covers price AND time runs); the two airport CTAs have only a price token to isolate.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` specs exactly, both automated `<verify>` gates passed on the first run (`GATE_PASS`), and no additional issues, missing dependencies, or blocking errors were encountered.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WR-02 and WR-05 are closed; `app/globals.css` and the three static blog CTAs are ready for the 73-12 visual walkthrough (D-10 QA surfaces) with no known residual physical-direction anchoring bugs in the files this plan touched.
- LTR rendering is unaffected: all four CSS conversions and the three bdi restructurings preserve the visible output byte-for-byte (verified by inspection — no text content or class list changed, only markup nesting and property names).
- Remaining review items (CR-01 chevron fix and CR-02 route/service-page bidi gaps) were already closed in earlier plans (73-07, 73-08) per STATE.md; WR-01, WR-03, and WR-04 remain open in 73-REVIEW.md and are out of this gap-closure plan's scope (WR-02/WR-05 only).

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: app/globals.css
- FOUND: app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx
- FOUND: app/[locale]/blog/prague-airport-to-city-center/page.tsx
- FOUND: app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx
- FOUND commit: b35f4bd (Task 1)
- FOUND commit: a3d71f7 (Task 2)
