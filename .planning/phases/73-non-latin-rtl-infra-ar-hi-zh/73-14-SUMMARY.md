---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 14
subsystem: i18n
tags: [next-intl, rtl, bidi, testing, vitest, qa-record]

# Dependency graph
requires:
  - phase: 73-13
    provides: "GAP-1 code fix: openingParagraphs/routeNarrative.paragraphs/faqs[].a on all 30 app/[locale]/routes/prague-*/page.tsx switched to interpolateBidi()/aBidi at the render site, FAQPage JSON-LD text: f.a carve-out preserved"
provides:
  - "GAP-2 closed: tests/rtl-backstop.test.ts CR-02 block strengthened from a file-level 'interpolateBidi anywhere in file' check to per-field render-call-site assertions (openingParagraphs/routeNarrative.paragraphs precomputes, faqs.aBidi field + faq.aBidi render, JSON-LD text: f.a carve-out) across all 30 route pages, with negative assertions proving the plain-interpolate() form is gone from those exact sites"
  - "GAP-3 closed: 73-RTL-QA.md's Group 3 route-page row corrected FAIL -> PASS, backed by a live structural render re-check (tests/route-page-render.test.tsx) on both /ar D-10 reference pages (prague-vienna, prague-berlin) proving the opening-paragraph and FAQ-answer price tokens render inside <bdi>"
  - "Regression-proofed the strengthened CR-02 test: a temporary single-file revert to the plain interpolate() form on prague-vienna's openingParagraphs precompute made the test FAIL, confirming it would have caught the original GAP-1 defect"
affects: [73-VERIFICATION.md (re-verification), phase-73 milestone close]

# Actuals (#2632)
actuals:
  tokens: 2700
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-field render-call-site regex assertions anchored on the full field-qualified LHS (e.g. content.openingParagraphs.map((p) => interpolateBidi(p, prices))) rather than a bare helper-name grep — the interpolate\\( token boundary (immediate open-paren after the helper name) cannot match interpolateBidi(, so positive/negative pairs distinguish the two helpers without special-casing sibling fields that legitimately stay on the plain helper (e.g. chauffeurNarrative)."

key-files:
  created: []
  modified:
    - tests/rtl-backstop.test.ts
    - tests/route-page-render.test.tsx
    - .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md

key-decisions:
  - "Extended tests/route-page-render.test.tsx with a PragueBerlinPage /ar structural re-check equivalent to the existing 73-13 PragueViennaPage one, rather than relying solely on the (also strengthened) source-level rtl-backstop.test.ts assertions — the plan's GAP-3 acceptance criteria explicitly called for a render-based re-check on BOTH D-10 reference pages (prague-vienna AND prague-berlin), and a live render proves the render OUTPUT is correct, not just that the correct helper is called in source."
  - "Kept the servicePages loop in rtl-backstop.test.ts on its original file-level hasBidiEvidence check, per the plan's explicit instruction to leave it untouched — only the route-page CR-02 loop was strengthened."

patterns-established:
  - "Regression-proof discipline for a strengthened test: before committing a strengthened assertion meant to catch a specific historical defect, temporarily reintroduce that exact defect on one file, confirm the test fails, then restore the file and confirm the working tree is byte-identical (git status clean) before proceeding — proves the new test earns its purpose rather than assuming it does."

requirements-completed: [RTL-01, FONT-01]

coverage:
  - id: D1
    description: "tests/rtl-backstop.test.ts CR-02 block asserts, per route page (all 30), the SPECIFIC openingParagraphs/routeNarrative.paragraphs/faqs render call sites use interpolateBidi (not mere file-level presence), verifies the FAQPage JSON-LD text stays plain f.a, and fails if the plain interpolate() call returns to the openingParagraphs/routeNarrative sites."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "npx vitest run tests/rtl-backstop.test.ts (136/136 passed)"
        status: pass
      - kind: other
        ref: "Regression proof: temporarily reverted prague-vienna's openingParagraphs precompute to plain interpolate(), re-ran npx vitest run tests/rtl-backstop.test.ts, confirmed 1 failing test (the new openingParagraphs assertion), then restored the file and confirmed git status clean and the suite green again"
        status: pass
      - kind: other
        ref: "grep -c hasBidiEvidence tests/rtl-backstop.test.ts shows exactly 1 remaining occurrence, in the untouched servicePages loop only"
        status: pass
    human_judgment: false
  - id: D2
    description: "73-RTL-QA.md Group 3 route-page row (previously FAIL) now reads PASS, noting openingParagraphs/routeNarrative/faqs are bidi-isolated via interpolateBidi() (gap cycle 73-13/73-14); a live /ar/routes/prague-vienna + prague-berlin structural re-check confirms the prose price tokens render inside <bdi>."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — /ar openingParagraphs/faqs bidi isolation + JSON-LD plain-text carve-out (73-13, re-confirmed green this cycle)"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueBerlinPage — /ar openingParagraphs/faqs bidi isolation (73-14 Group 3 re-check, new this plan)"
        status: pass
      - kind: other
        ref: "grep -n FAIL .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md — Group 3 route-page row itself now reads PASS; remaining FAIL text is historical narrative (Group 1 wordmark find-and-fix, the corrected row's own before/after explanation, the updated Harvest note) explicitly labeled as closed by 73-13/73-14"
        status: pass
      - kind: other
        ref: "grep -n interpolateBidi .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md — corrected row cites interpolateBidi()/aBidi and the JSON-LD f.a carve-out"
        status: pass
    human_judgment: false
  - id: D3
    description: "FONT-01 glyph-tofu human-verification routing (Task 3, Group 2 of 73-RTL-QA.md) left unchanged — not claimed closed by this plan, per the human_verification_note."
    human_judgment: true
    rationale: "This is a non-gating, deliberately out-of-scope item for this plan (visual glyph-tofu check requires independent human sign-off per verification policy); confirmed unchanged by inspection, not something an automated test can close."

duration: ~20min
completed: 2026-09-20
status: complete
---

# Phase 73 Plan 14: Strengthen CR-02 Backstop + Correct Group 3 QA Record Summary

**Rewrote `tests/rtl-backstop.test.ts`'s CR-02 block from a file-level `interpolateBidi`-anywhere check to per-field render-call-site assertions across all 30 route pages (regression-proofed against the original GAP-1 defect), and corrected `73-RTL-QA.md`'s Group 3 route-page row from FAIL to PASS backed by a new `/ar` structural render re-check on prague-berlin.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-20T16:56:00Z (approx, from prior plan's final commit)
- **Completed:** 2026-09-20T17:03:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **GAP-2 closed:** `tests/rtl-backstop.test.ts`'s CR-02 describe block for the 30 route pages now asserts, per file: (a) the `openingParagraphs` precompute uses `interpolateBidi(p, prices)` and NOT the plain `interpolate(p, prices)` form at that exact call site; (b) the `routeNarrative.paragraphs` precompute likewise; (c) the `faqs` precompute defines `aBidi: interpolateBidi(f.a, prices)` and the FAQ answer JSX renders `{faq.aBidi}`; (d) the FAQPage JSON-LD `acceptedAnswer.text` stays on the plain `text: f.a` carve-out. The old weak `hasBidiEvidence = /interpolateBidi/.test(src) || /<bdi>/.test(src)` check was removed from the route-page loop (it now exists only in the untouched `servicePages` loop, confirmed by `grep -c hasBidiEvidence` returning 1).
- **Regression proof performed and verified:** temporarily reverted `prague-vienna/page.tsx`'s `openingParagraphs` precompute to the plain `interpolate()` form, re-ran `npx vitest run tests/rtl-backstop.test.ts`, confirmed exactly 1 test failed (the new openingParagraphs assertion for that slug) while the other 135 stayed green, then restored the file from a byte-identical backup and confirmed `git status --short` showed zero diff before re-running the full suite green (136/136). This proves the strengthened test would have caught GAP-1.
- **GAP-3 closed:** extended `tests/route-page-render.test.tsx` with a new `PragueBerlinPage — /ar openingParagraphs/faqs bidi isolation (73-14 Group 3 re-check)` describe block, mirroring the existing 73-13 `PragueViennaPage` assertion — proves the opening-paragraph and FAQ-answer Arabic prose price tokens (`€{ePrice}`/`€{vPrice}`/`€{sPrice}`) render inside `<bdi>` (6+ isolates), while the FAQPage JSON-LD `<script>` payload stays a plain string with zero `<bdi>` markup, on the second D-10 reference page named in `73-RTL-QA.md`.
- Corrected `73-RTL-QA.md`'s Group 3 route-page row from `FAIL (corrected post-verification, WR-01)` to `PASS (closed by gap cycle 73-13/73-14)`, citing the 73-13 `interpolateBidi()`/`aBidi` fix, the preserved JSON-LD `f.a` carve-out, and this plan's strengthened `rtl-backstop.test.ts` per-field guard. Added an "Update (gap cycle 73-13/73-14)" note to the Harvest section recording the closure. The FONT-01 glyph-tofu human-verification routing (Group 2, Task 3) and all other rows are untouched.
- Full project test suite re-run clean: `npx vitest run` — 1601 passed, 0 failed, 10 skipped, 139 todo (up from 73-13's 1510 passed — the added per-field assertions and the new render test account for the delta, no regressions).

## Task Commits

Each task was committed atomically:

1. **Task 1: Strengthen the CR-02 backstop to per-field render-call-site correctness (GAP-2)** - `d06f7f1` (test)
2. **Task 2: Re-run the D-10/D-11 Group 3 structural bidi check and correct the 73-RTL-QA.md record (GAP-3)** - `821ea5d` (fix)

## Files Created/Modified
- `tests/rtl-backstop.test.ts` - CR-02 describe block rewritten to per-field, per-route-page assertions (positive: openingParagraphs/routeNarrative.paragraphs interpolateBidi precomputes, faqs `aBidi` field + `faq.aBidi` render, JSON-LD `text: f.a` carve-out; negative: plain-helper precompute forms absent). servicePages loop untouched.
- `tests/route-page-render.test.tsx` - new `PragueBerlinPage` `/ar` structural re-check proving openingParagraphs/FAQ-answer `<bdi>` isolation and the JSON-LD plain-text carve-out, mirroring the existing prague-vienna assertion.
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` - Group 3 route-page row corrected FAIL → PASS; Harvest note updated to record the closed gap.

## Decisions Made
- Added a render-based re-check for prague-berlin (rather than relying only on the strengthened source-level rtl-backstop assertions) because the plan's GAP-3 acceptance criteria explicitly required proving the render OUTPUT is correct on both named D-10 reference pages, not just that the correct helper is invoked in source.
- Left the servicePages loop in rtl-backstop.test.ts on its original weak check, matching the plan's explicit instruction not to touch it.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria were verified directly (grep counts, regression-proof revert/restore cycle, full test suite run) rather than assumed.

## Issues Encountered
None - the strengthened assertions matched the actual post-73-13 code shape on the first attempt for all 30 route pages (verified via grep before writing the test), so no iteration was needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GAP-2 and GAP-3 from `73-VERIFICATION.md`'s `gaps_found` status (2026-09-19) are both closed: the CR-02 backstop now verifies per-field render-call-site correctness (would have caught GAP-1, regression-proofed), and `73-RTL-QA.md`'s Group 3 route-page row is factually corrected to PASS with a green structural re-check on both `/ar` reference pages.
- FONT-01 glyph-tofu human-verification sign-off (behavior_unverified truth #5 in `73-VERIFICATION.md`) remains open and correctly routed to independent human review — not attempted or claimed closed by this plan.
- This was the final plan in Phase 73 (73-01..73-14, no 73-15 exists). Phase 73 should now be re-verified end-to-end (`/gsd-verify-work 73` or a re-run of `/gsd-plan-phase`'s verification loop) to confirm `73-VERIFICATION.md`'s `gaps_found` status can be upgraded, pending the still-open FONT-01 human sign-off.
- No blockers.

## Self-Check: PASSED

Verified both modified test files and the corrected QA record exist on disk with the expected content: `tests/rtl-backstop.test.ts` (grep confirms `hasBidiEvidence` appears exactly once, servicePages-only), `tests/route-page-render.test.tsx` (contains the new `PragueBerlinPage — /ar openingParagraphs/faqs bidi isolation (73-14 Group 3 re-check)` describe block), `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` (Group 3 route-page row reads PASS, cites interpolateBidi). Both task commits (`d06f7f1`, `821ea5d`) confirmed present in `git log --oneline --all`. `npx vitest run tests/route-page-render.test.tsx tests/rtl-backstop.test.ts` exits 0 (140/140 passed); full suite `npx vitest run` exits 0 (1601 passed, 0 failed).

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-20*
