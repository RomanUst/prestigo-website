---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 04
subsystem: ui
tags: [tailwind, rtl, i18n, logical-properties, route-pages]

requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh (plan 01)
    provides: "html dir=rtl wiring for ar, byte-parity test scaffolding (tests/route-page-render.test.tsx)"
provides:
  - "All 30 app/[locale]/routes/*/page.tsx have zero text-left/text-right occurrences — logical text-start/text-end only"
  - "app/[locale]/services/city-rides/page.tsx converted to logical text alignment"
  - "prague-vienna golden-HTML byte-parity snapshot updated to the new text-end baseline, verified programmatically to contain no diff beyond the token swap"
affects: [74-seo-hreflang-metadata, 75-e2e-verification-launch]

actuals:
  tokens: 27000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure 1:1 Tailwind physical-to-logical class-name swap (text-right→text-end) applied per-file via grep-then-sed on the single matched line — no other change to structure, spacing, or content"

key-files:
  created: []
  modified:
    - app/[locale]/routes/prague-berlin/page.tsx
    - app/[locale]/routes/prague-bratislava/page.tsx
    - app/[locale]/routes/prague-brno/page.tsx
    - app/[locale]/routes/prague-budapest/page.tsx
    - app/[locale]/routes/prague-ceske-budejovice/page.tsx
    - app/[locale]/routes/prague-cesky-krumlov/page.tsx
    - app/[locale]/routes/prague-dresden/page.tsx
    - app/[locale]/routes/prague-frantiskovy-lazne/page.tsx
    - app/[locale]/routes/prague-graz/page.tsx
    - app/[locale]/routes/prague-hradec-kralove/page.tsx
    - app/[locale]/routes/prague-karlovy-vary/page.tsx
    - app/[locale]/routes/prague-krakow/page.tsx
    - app/[locale]/routes/prague-kutna-hora/page.tsx
    - app/[locale]/routes/prague-leipzig/page.tsx
    - app/[locale]/routes/prague-liberec/page.tsx
    - app/[locale]/routes/prague-linz/page.tsx
    - app/[locale]/routes/prague-marianske-lazne/page.tsx
    - app/[locale]/routes/prague-munich/page.tsx
    - app/[locale]/routes/prague-nuremberg/page.tsx
    - app/[locale]/routes/prague-olomouc/page.tsx
    - app/[locale]/routes/prague-ostrava/page.tsx
    - app/[locale]/routes/prague-pardubice/page.tsx
    - app/[locale]/routes/prague-passau/page.tsx
    - app/[locale]/routes/prague-plzen/page.tsx
    - app/[locale]/routes/prague-regensburg/page.tsx
    - app/[locale]/routes/prague-salzburg/page.tsx
    - app/[locale]/routes/prague-vienna/page.tsx
    - app/[locale]/routes/prague-warsaw/page.tsx
    - app/[locale]/routes/prague-wroclaw/page.tsx
    - app/[locale]/routes/prague-zlin/page.tsx
    - app/[locale]/services/city-rides/page.tsx
    - tests/__snapshots__/route-page-render.test.tsx.snap

key-decisions:
  - "Each of the 30 route pages + city-rides contained exactly one `text-right` occurrence and zero `text-left` occurrences (grep-confirmed per file before editing) — matches the plan's edge:adjacency and edge:empty assumptions exactly, no surprises."
  - "The prague-vienna golden-HTML byte-parity snapshot required a one-time regeneration (`vitest -u`) because the rendered class attribute literally changes from `text-right` to `text-end` — this is the expected, intended mechanical consequence of the swap, not a regression. Verified programmatically (string-substitution equality check between old and new snapshot content) that the ONLY difference introduced is the `text-right`→`text-end` token; no other byte in the ~33KB rendered HTML changed. This snapshot now becomes the new baseline for future non-regression checks."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "All 30 route pages converted from text-left/text-right to text-start/text-end"
    requirement: RTL-01
    verification:
      - kind: other
        ref: "grep -rlE 'text-(left|right)' app/[locale]/routes — returns no files"
        status: pass
    human_judgment: false
  - id: D2
    description: "city-rides service page converted from text-right to text-end"
    requirement: RTL-01
    verification:
      - kind: other
        ref: "grep -rlE 'text-(left|right)' app/[locale]/services — returns no files"
        status: pass
    human_judgment: false
  - id: D3
    description: "prague-vienna renders byte-identical (aside from the intended class-name token) under dir=ltr after conversion"
    requirement: RTL-01
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#renders and matches the golden EN snapshot"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 04: Route/Service Logical Text-Alignment Swap Summary

**Converted `text-left`/`text-right` to `text-start`/`text-end` across all 30 route pages and the city-rides service page — a pure, judgment-free physical-to-logical Tailwind axis swap for RTL-01.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-19T10:48:00+02:00 (approx.)
- **Completed:** 2026-09-19T10:53:00+02:00
- **Tasks:** 3
- **Files modified:** 31 route/service pages + 1 test snapshot

## Accomplishments
- All 30 `app/[locale]/routes/*/page.tsx` files converted: each had exactly one `text-right` occurrence (a "Related Routes"/"Popular"-style mini-card distance/duration block), now `text-end`.
- `app/[locale]/services/city-rides/page.tsx` converted (one occurrence).
- Phase-wide grep (`grep -rlE "text-(left|right)" app/[locale]/routes app/[locale]/services`) confirmed zero remaining matches after all three tasks.
- `tests/route-page-render.test.tsx` byte-parity snapshot for `prague-vienna` regenerated and passes; verified programmatically that the only content change versus the prior golden snapshot is the `text-right`→`text-end` token (no spacing, structure, price, or metadata drift).
- Full project test suite run (`npx vitest run`): 123/124 test files pass, 1457/1458 tests pass — the sole failure is the pre-existing, out-of-scope `tests/blog-locale-fallback.test.ts` case caused by the untracked `prague-to-budapest-private-transfer.mdx` blog draft (documented in the executor brief as not-mine-to-fix).

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert route pages batch A (berlin → hradec-kralove) + city-rides service** - `4df47eb` (feat)
2. **Task 2: Convert route pages batch B (karlovy-vary → olomouc)** - `2e1c25d` (feat)
3. **Task 3: Convert route pages batch C (ostrava → zlin) + byte-parity snapshot gate** - `d300c31` (feat)

_No plan metadata commit yet — this SUMMARY + STATE/ROADMAP updates land in the final docs commit._

## Files Created/Modified
- 30× `app/[locale]/routes/*/page.tsx` - `text-right` → `text-end` (single-line, single-token swap each)
- `app/[locale]/services/city-rides/page.tsx` - same swap
- `tests/__snapshots__/route-page-render.test.tsx.snap` - regenerated golden HTML baseline to reflect the new `text-end` class name

## Decisions Made
- Regenerated the prague-vienna byte-parity snapshot in place (`vitest -u`) rather than leaving the test red — the failing assertion was the expected, deliberate consequence of the class-name change the plan mandates, not a regression. Verified via a direct string-substitution equality check (`old.replace('text-right','text-end') === new`) that no other byte differs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regenerated the prague-vienna byte-parity golden snapshot**
- **Found during:** Task 3 (batch C conversion, byte-parity gate)
- **Issue:** `npx vitest run tests/route-page-render.test.tsx` failed after the batch C conversion because the golden snapshot still contained the literal string `text-right`, while the freshly rendered HTML now contains `text-end` (the intended output of this plan's swap). This blocked the task's own acceptance criterion ("`npx vitest run tests/route-page-render.test.tsx` passes").
- **Fix:** Ran `npx vitest run tests/route-page-render.test.tsx -u` to regenerate the snapshot, then verified programmatically that `old_snapshot.replace('text-right', 'text-end') === new_snapshot` — confirming the regeneration introduced exactly one kind of change (the intended token swap) and nothing else (no spacing/structure/price/metadata drift).
- **Files modified:** `tests/__snapshots__/route-page-render.test.tsx.snap`
- **Verification:** `npx vitest run tests/route-page-render.test.tsx` passes; programmatic diff-equality check confirms scope; full suite run shows no new regressions.
- **Committed in:** `d300c31` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — required test-snapshot regeneration, not a plan file)
**Impact on plan:** Necessary and expected consequence of the swap; no scope creep, no unplanned code changes.

## Issues Encountered
None beyond the snapshot regeneration documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 30 route pages + city-rides service page use logical text alignment; RTL-01's route/service file count (31 of ~40 total phase files) is complete.
- Remaining RTL-01 files outside this plan's scope (already handled in prior 73-01/73-02/73-03 plans, or scheduled in later plans of this phase) are unaffected.
- No blockers for the next plan in this phase.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: app/[locale]/routes/prague-berlin/page.tsx
- FOUND: app/[locale]/routes/prague-zlin/page.tsx
- FOUND: app/[locale]/services/city-rides/page.tsx
- FOUND: tests/__snapshots__/route-page-render.test.tsx.snap
- FOUND: .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-04-SUMMARY.md
- FOUND commit: 4df47eb
- FOUND commit: 2e1c25d
- FOUND commit: d300c31
