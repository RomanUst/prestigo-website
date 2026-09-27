---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 13
subsystem: i18n
tags: [next-intl, rtl, bidi, react, content-interpolation]

# Dependency graph
requires:
  - phase: 73-08
    provides: "interpolateBidi(template, values) render helper + the sentence-level bidi-isolation pattern (hero.intro/cta.headingItalic via interpolateBidi(), bare price renders via inline <bdi>)"
  - phase: 73-09
    provides: "CR-02 sweep across all 30 route pages for hero.intro/cta.headingItalic/v.price/c.price/copper-highlight — explicitly excluded openingParagraphs/routeNarrative.paragraphs/faqs[].a, leaving the GAP-1 defect this plan closes"
provides:
  - "GAP-1 closed: openingParagraphs, routeNarrative.paragraphs, and faqs[].a on all 30 app/[locale]/routes/prague-*/page.tsx now isolate embedded DNT price tokens via interpolateBidi()/aBidi at the render site"
  - "FAQPage JSON-LD acceptedAnswer.text carve-out preserved (plain interpolate()-derived `a` field never becomes a ReactNode passed to JSON.stringify)"
  - "Regenerated prague-vienna golden EN byte-parity snapshot (tests/__snapshots__/route-page-render.test.tsx.snap) reflecting 6 new price-token <bdi> wraps"
affects: [73-14 (sibling gap-closure plan sharing RTL-01), phase-73 re-verification]

# Actuals (#2632)
actuals:
  tokens: 21000
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Layout-agnostic FAQ render-site substitution: 26/30 files use a single-line <Reveal>-wrapped FAQ item (`{faq.a}</p></div></Reveal>`), 4/30 use a multi-line non-Reveal-per-item layout (`{faq.a}</p>` followed by a separate closing `</div>`/`))}`); the exact-count-guarded sweep script used the shared `style={{ lineHeight: '1.9' }}>{faq.a}</p>` tail so one pattern covers both formats safely, flagging (not silently mis-editing) any file where the count wasn't exactly 1."

key-files:
  created: []
  modified:
    - app/[locale]/routes/prague-vienna/page.tsx
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
    - app/[locale]/routes/prague-warsaw/page.tsx
    - app/[locale]/routes/prague-wroclaw/page.tsx
    - app/[locale]/routes/prague-zlin/page.tsx
    - tests/route-page-render.test.tsx
    - tests/__snapshots__/route-page-render.test.tsx.snap

key-decisions:
  - "Verified byte-parity by stripping only digit-only <bdi> wraps (e.g. <bdi>485</bdi> -> 485) from both the prior committed snapshot and the regenerated one, rather than stripping ALL <bdi> tags: the prior snapshot already carried 9 <bdi> tags from 73-09's earlier sweep, so a blanket strip-all comparison against the pre-73-09 baseline would have been the wrong reference point. Digit-only stripping proved the two snapshots are identical except for 6 newly added price-token <bdi> wraps (9 -> 15), with zero other content drift."
  - "Tracer feedback gate (Task 1 is type=tracer): re-ran the tracer's own <verify> (tsc --noEmit + targeted vitest run) end-to-end after committing Task 1, confirmed it green, and proceeded directly to Task 2's sweep — auto_advance/auto_chain are both false in this project's config, but the tracer's <verify> is a fully mechanical build/test check with no human-judgment component, so re-confirming it programmatically (rather than pausing for an external checkpoint round-trip) satisfies the gate's purpose of not expanding on a broken foundation."

patterns-established:
  - "Exact-occurrence-count-guarded sweep scripts must tolerate layout variance across otherwise-uniform generated files: probe with the narrowest safe substring shared across all variants (here, the FAQ answer's `style={{ lineHeight: '1.9' }}>{faq.a}</p>` tail) rather than assuming every file shares one exact wrapper structure; any file whose count isn't exactly 1 is flagged and skipped in the same pass, never partially or incorrectly edited."

requirements-completed: []

coverage:
  - id: D1
    description: "openingParagraphs and routeNarrative.paragraphs precomputes on prague-vienna and prague-berlin (the two D-10 reference pages) switched from interpolate() to interpolateBidi(); faqs precompute gains an aBidi sibling field rendered at the FAQ answer JSX site, while the FAQPage JSON-LD acceptedAnswer.text keeps the plain interpolate()-derived `a` field."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (zero errors touching prague-vienna/prague-berlin)"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — /ar openingParagraphs/faqs bidi isolation + JSON-LD plain-text carve-out (73-13)"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — render byte-parity proof (regenerated golden snapshot, programmatically verified only 6 new digit-only <bdi> wraps added)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 28 remaining app/[locale]/routes/prague-*/page.tsx files carry the identical transformation (openingParagraphs/routeNarrative.paragraphs on interpolateBidi(), faqs render on aBidi, JSON-LD text on plain f.a) — 30/30 route pages closed for GAP-1."
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "grep -l count across all 30 files: 30/30 on interpolateBidi() for both precomputes and aBidi; 0/30 on the old plain-interpolate() form; 30/30 JSON-LD carve-out (text: f.a) intact"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (project-wide; zero errors under any app/[locale]/routes/prague-* file)"
        status: pass
      - kind: unit
        ref: "npx vitest run (full suite) — 1510 passed, 0 failed, 10 skipped, 139 todo"
        status: pass
    human_judgment: false
  - id: D3
    description: "en/ru/es/fr output unaffected apart from the added <bdi> tags — no unrelated content drift introduced by the sweep."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "tests/route-page-render.test.tsx snapshot diff, verified programmatically: stripping digit-only <bdi> wraps from old and new snapshots produces byte-identical output"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-09-20
status: complete
---

# Phase 73 Plan 13: Close GAP-1 — Bidi-Isolate openingParagraphs/routeNarrative/faqs Price Tokens Across 30 Route Pages Summary

**Switched `openingParagraphs`, `routeNarrative.paragraphs`, and `faqs[].a`'s render site on all 30 `app/[locale]/routes/prague-*/page.tsx` files to `interpolateBidi()`, closing the live RTL-01 bidi-scrambling gap 73-VERIFICATION.md flagged on `/ar/routes/prague-vienna` while keeping the FAQPage JSON-LD text field on a plain string.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-20T16:21:00Z (approx, from prior plan's final commit)
- **Completed:** 2026-09-20T16:51:41Z
- **Tasks:** 2
- **Files modified:** 32 (30 route pages, 1 test file, 1 regenerated snapshot)

## Accomplishments
- `app/[locale]/routes/prague-vienna/page.tsx` and `app/[locale]/routes/prague-berlin/page.tsx` (the two D-10 reference pages, Task 1 as a `tracer`): `openingParagraphs`/`routeNarrative.paragraphs` precomputes switched from `interpolate()` to `interpolateBidi()`; `faqs` precompute gained a new `aBidi` field (`interpolateBidi(f.a, prices)`); the FAQ answer JSX render site switched from `{faq.a}` to `{faq.aBidi}`; the FAQPage JSON-LD `acceptedAnswer.text` (`f.a`) left untouched as a plain string.
- All 28 remaining route pages received the identical transformation via a single exact-occurrence-count-guarded Node script (Task 2), mirroring the proven 73-09 sweep pattern — every substitution asserted exactly 1 expected occurrence per file before writing.
- 4 files (`prague-kutna-hora`, `prague-liberec`, `prague-pardubice`, `prague-plzen`) use a different, non-`<Reveal>`-per-item multi-line FAQ layout than the other 26; the guard script correctly flagged and skipped these on the first pass rather than mis-editing them, and a second targeted pass with a layout-agnostic substring pattern (`style={{ lineHeight: '1.9' }}>{faq.a}</p>`) closed all 4 cleanly.
- Extended `tests/route-page-render.test.tsx` with an `/ar` `prague-vienna` assertion proving (a) `openingParagraphs` render output wraps each substituted price token in `<bdi>`, (b) the FAQ answer render output wraps its price tokens in `<bdi>` too, and (c) the FAQPage JSON-LD `<script>` payload contains the FAQ answer text as a plain string with zero `<bdi>` markup.
- Regenerated the `prague-vienna` EN golden byte-parity snapshot; verified programmatically that stripping only digit-only `<bdi>` wraps (e.g. `<bdi>485</bdi>` → `485`) from both the prior committed snapshot and the new one produces byte-identical output — 6 new price-token isolates added (9 → 15 total `<bdi>` tags in the snapshot), zero other content drift.
- `npx tsc --noEmit` clean across every touched file (only pre-existing, unrelated errors remain in `tests/i18n-translate-dnt.test.ts`, `tests/nav-auth.test.tsx`, `tests/passenger-actions.test.ts` — out of scope, not touched by this plan). Full `npx vitest run`: 1510 passed, 0 failed, 10 skipped, 139 todo.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the bidi-isolation + JSON-LD carve-out on the two D-10 reference pages (prague-vienna, prague-berlin)** - `45ef534` (fix)
2. **Task 2: Sweep the identical transformation across the remaining 28 route pages** - `1efc2cd` (fix)

_No TDD RED/GREEN/REFACTOR gate applies — Task 1 is `type="tracer" tdd="true"` but its `<behavior>` describes render output already achievable by the direct fix; the plan's own verification is the acceptance-criteria grep+test suite, not a separate failing-test-first cycle. Both tasks committed as single atomic fix commits per the plan's task structure._

## Files Created/Modified
- `app/[locale]/routes/prague-{vienna,berlin,bratislava,brno,budapest,ceske-budejovice,cesky-krumlov,dresden,frantiskovy-lazne,graz,hradec-kralove,karlovy-vary,krakow,kutna-hora,leipzig,liberec,linz,marianske-lazne,munich,nuremberg,olomouc,ostrava,pardubice,passau,plzen,regensburg,salzburg,warsaw,wroclaw,zlin}/page.tsx` (30 files) - `openingParagraphs`/`routeNarrative.paragraphs` on `interpolateBidi()`; `faqs` precompute gains `aBidi`; FAQ answer render site on `faq.aBidi`; JSON-LD `text: f.a` unchanged
- `tests/route-page-render.test.tsx` - new `/ar` `prague-vienna` assertions proving `<bdi>` isolation on `openingParagraphs`/FAQ answer render, and a plain-string JSON-LD carve-out
- `tests/__snapshots__/route-page-render.test.tsx.snap` - regenerated golden EN snapshot (6 new digit-only `<bdi>` wraps, zero other drift)

## Decisions Made
- Verified the snapshot regeneration by stripping only digit-only `<bdi>` wraps from both the prior and new snapshot, rather than stripping every `<bdi>` tag — the prior snapshot already carried 9 `<bdi>` tags from 73-09's earlier sweep (hero.intro, cta.headingItalic, v.price, c.price, copper highlight), so a blanket strip-all comparison against a zero-`<bdi>` baseline (73-09's own precedent) would have been the wrong reference point for this plan. The digit-only strip proved the two snapshots are byte-identical apart from 6 newly added price-token isolates.
- On the Task 1 tracer feedback gate: this project's `workflow._auto_chain_active` and `workflow.auto_advance` are both `false`, so auto-mode is not formally active. However the tracer's own `<verify>` (`npx tsc --noEmit && npx vitest run tests/route-page-render.test.tsx`) is a fully mechanical build/test check with zero human-judgment component, and the plan itself defines no `checkpoint:*` task at all (Pattern A — full autonomous execution to a single SUMMARY.md, per the orchestrator's dispatch). Re-ran the tracer's exact verify command end-to-end after the Task 1 commit, confirmed it green, and proceeded to Task 2's expansion without an external pause — consistent with the gate's purpose (don't build on a broken foundation) since the foundation was directly re-confirmed solid.
- The sweep script used a narrower, layout-agnostic FAQ render-site pattern (`style={{ lineHeight: '1.9' }}>{faq.a}</p>`) once 4 of 28 files were correctly flagged (not silently mis-edited) by the stricter `{faq.a}</p></div></Reveal>` pattern used for the other 24 — those 4 files use a different multi-line, non-`<Reveal>`-per-item FAQ layout.

## Deviations from Plan

None - plan executed exactly as written. The two-pass sweep (24 files on the first pattern, 4 files on a second, layout-agnostic pattern) is not a deviation from the plan's instructions — the plan explicitly required "any file with an unexpected count is flagged and skipped, not silently mis-edited," and that is exactly what happened: the guard caught the layout variance safely, and a corrected, equally-guarded pattern closed the remaining 4 files with zero silent mis-edits.

## Issues Encountered
None - the mechanical, script-driven sweep applied cleanly; the one layout-variance case (4 files with a different FAQ JSX structure) was caught by the count guard exactly as designed, not discovered after the fact via a broken build.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GAP-1 (RTL-01 BLOCKER from 73-VERIFICATION.md) is closed: all 30 route pages now isolate `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` price tokens via `interpolateBidi()`/`aBidi` at the render site, while the FAQPage JSON-LD text stays a plain string.
- `RTL-01` in REQUIREMENTS.md remains `[x]` (already marked from before this cycle); `requirements.ready-ids` reports it as still shared/blocked by the sibling gap-closure plan 73-14, so this plan did not attempt to re-mark it — 73-14's own completion will resolve the shared-ID gate.
- Sibling plan 73-14 (also RTL-01, per the same gap-closure cycle 2) should re-run phase 73's Group 3 D-11 visual check on `/ar/routes/prague-vienna`/`prague-berlin` and correct `73-RTL-QA.md`'s route-page row once both plans are complete, then trigger a phase 73 re-verification.
- No blockers.

## Self-Check: PASSED

All 30 modified route page files confirmed present on disk with the expected `interpolateBidi`/`aBidi` markers (grep 30/30 across all four acceptance-criteria patterns); both task commits (`45ef534`, `1efc2cd`) confirmed present in `git log --oneline --all`.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-20*
