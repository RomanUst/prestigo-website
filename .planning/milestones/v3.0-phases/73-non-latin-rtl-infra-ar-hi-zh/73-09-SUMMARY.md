---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 09
subsystem: i18n
tags: [next-intl, rtl, bidi, react, content-interpolation]

# Dependency graph
requires:
  - phase: 73-08
    provides: "interpolateBidi(template, values) render helper + the prague-berlin reference fix (hero.intro/cta.headingItalic sentence sites via interpolateBidi(), bare v.price/c.price/highlight-copper sites via inline <bdi>)"
provides:
  - "CR-02 closed on all 29 remaining app/[locale]/routes/prague-*/page.tsx files (every route page except prague-berlin, already fixed in 73-08)"
  - "CR-02 closed on app/[locale]/services/airport-transfer/page.tsx and app/[locale]/services/page.tsx"
  - "Regenerated prague-vienna golden EN byte-parity snapshot (tests/__snapshots__/route-page-render.test.tsx.snap) reflecting the new <bdi> markup"
affects: [73-12 (D-10/D-11 human visual walkthrough — this closes the reversed-price-token risk it would have flagged)]

# Actuals (#2632)
actuals:
  tokens: 79000
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mechanical sweep via a one-shot Node script performing exact-count-guarded string replacements (fs.readFileSync/writeFileSync, split/join) across all 29 files in a single pass, rather than 29 individual Edit calls — every substitution asserted an exact occurrence count before applying, and any file with an unexpected count would have been flagged and skipped rather than silently mis-edited"

key-files:
  created: []
  modified:
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
    - app/[locale]/services/airport-transfer/page.tsx
    - app/[locale]/services/page.tsx
    - tests/__snapshots__/route-page-render.test.tsx.snap

key-decisions:
  - "Extended the sweep to also fix each route page's 'Price from' copper-highlight bare-value render (the same site 73-08 fixed on prague-berlin as a Rule 2 deviation) — verified all 30 route content JSON files (including berlin) carry a copper:true highlight, so every one of the 29 swept pages shares the identical unisolated-price defect even though the plan's action text named only hero.intro/cta.headingItalic/v.price/c.price explicitly. Mirrors the reference implementation exactly rather than a narrower literal reading of the action text."
  - "app/[locale]/services/page.tsx does NOT import interpolateBidi, diverging from the plan's literal action text ('import interpolateBidi'). Investigated content/pages/en/services.json: hero.intro and cta.headingItalic contain no price tokens, and the FAQ/metadata interpolate() calls are explicitly excluded from this sweep per the plan — so there is no sentence-level render site in this file that needs interpolateBidi(). Importing it unused would be dead code; the acceptance criteria only requires the <bdi>{s.price}</bdi> bare wrap, which needs no interpolateBidi import."
  - "prague-vienna's golden EN byte-parity snapshot (tests/__snapshots__/route-page-render.test.tsx.snap) was regenerated with `vitest -u`, matching the precedent set in 73-04 (STATE.md: 'prague-vienna byte-parity snapshot regenerated after text-right→text-end swap; verified programmatically the only change is the token swap'). <bdi> is a real DOM element rendered identically regardless of locale, so adding it to a price render site legitimately changes the EN byte output too — verified programmatically that stripping every <bdi>/</bdi> tag from the new snapshot reproduces the old snapshot byte-for-byte (9 tags added, zero other drift)."

patterns-established:
  - "Multi-file mechanical sweeps that replicate an already-proven single-file fix are safe to apply via a scripted exact-count-guarded string replace across all target files in one pass, followed by a single tsc --noEmit + targeted vitest run + git diff spot-check, rather than 29 sequential Edit tool calls."

requirements-completed: [RTL-01]

coverage:
  - id: D1
    description: "All 29 remaining app/[locale]/routes/prague-*/page.tsx files (every route page except prague-berlin) isolate every rendered price/number token — hero.intro and cta.headingItalic sentence sites via interpolateBidi(), bare v.price/c.price/highlight-copper sites via inline <bdi> — mirroring the prague-berlin reference fix from 73-08; generateMetadata() interpolate() calls left untouched as plain strings."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (zero errors under app/[locale]/routes/prague-*)"
        status: pass
      - kind: other
        ref: "UNISOLATED grep sweep (plan's own verify command) — empty list across all 29 files"
        status: pass
      - kind: unit
        ref: "tests/route-page-render.test.tsx#PragueViennaPage — render byte-parity proof (regenerated golden snapshot, programmatically verified the only diff is 9 added <bdi> tags)"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/[locale]/services/airport-transfer/page.tsx and app/[locale]/services/page.tsx isolate their rendered price tokens (heroIntro precompute via interpolateBidi(), bare v.price/s.price via inline <bdi>); metadata interpolate() and JSON-LD s.price.replace() left untouched."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (zero errors under app/[locale]/services/airport-transfer and app/[locale]/services/page)"
        status: pass
      - kind: unit
        ref: "tests/admin-promo.test.ts, tests/i18n-routing.test.ts, tests/services-b.test.ts (all reference these two pages) — 43/43 pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full project test suite (1463 tests, 125 files) and full-project tsc --noEmit remain green after the sweep — no regression introduced across en/ru/es/fr/ar/hi/zh rendering."
    requirement: "RTL-01"
    verification:
      - kind: unit
        ref: "npx vitest run (full suite) — 1463 passed, 10 skipped, 139 todo, 0 failed"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 09: CR-02 DNT Price Bidi-Isolation Sweep (29 Route Pages + 2 Service Pages) Summary

**Mirrored the interpolateBidi()/inline `<bdi>` DNT price-isolation pattern proven on prague-berlin (73-08) across all 29 remaining route pages plus airport-transfer and the services index, closing the CR-02 code-review gap for the entire route/service surface.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 32 (29 route pages, 2 service pages, 1 regenerated snapshot)

## Accomplishments
- All 29 remaining `app/[locale]/routes/prague-*/page.tsx` files (every route page except prague-berlin, already fixed) now: (1) import `interpolateBidi` alongside `interpolate`; (2) render `content.hero.intro` and `content.cta.headingItalic` via `interpolateBidi()` at their sentence-level render sites; (3) wrap the bare `{v.price}` and `{c.price}` renders (where a day-trip section exists — 15 of the 29 files omit it) in inline `<bdi>`; (4) wrap the copper "Price from" highlight's bare value in a conditional `<bdi>` matching the prague-berlin reference exactly.
- `app/[locale]/services/airport-transfer/page.tsx`: `heroIntro` precompute switched from `interpolate()` to `interpolateBidi()`; the bare vehicle-price render `{v.price}` wrapped in `<bdi>`.
- `app/[locale]/services/page.tsx`: the bare `{s.price}` render wrapped in `<bdi>`.
- Every `generateMetadata()` `interpolate()` call across all 31 files remains an untouched plain string; every JSON-LD price field (`s.price.replace(...)`) is unchanged.
- Regenerated the prague-vienna golden EN byte-parity snapshot and programmatically verified the ONLY diff is 9 added `<bdi>` tags (stripping them reproduces the prior snapshot byte-for-byte) — no other content drifted.
- Full project test suite (1463 tests, 125 files) and `npx tsc --noEmit` across the entire project remain green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Sweep the 29 remaining route pages (CR-02)** - `15c79c7` (fix)
2. **Task 2: Sweep airport-transfer + services index (CR-02)** - `b8546ce` (fix)

_No TDD gate applies — both tasks are `type="auto"`._

## Files Created/Modified
- `app/[locale]/routes/prague-{bratislava,brno,budapest,ceske-budejovice,cesky-krumlov,dresden,frantiskovy-lazne,graz,hradec-kralove,karlovy-vary,krakow,kutna-hora,leipzig,liberec,linz,marianske-lazne,munich,nuremberg,olomouc,ostrava,pardubice,passau,plzen,regensburg,salzburg,vienna,warsaw,wroclaw,zlin}/page.tsx` (29 files) - `interpolateBidi` import + hero.intro/cta.headingItalic sentence-site swaps; inline `<bdi>` on `{v.price}`, `{c.price}` (where present), and the copper "Price from" highlight
- `app/[locale]/services/airport-transfer/page.tsx` - `interpolateBidi` import; `heroIntro` precompute swap; inline `<bdi>` on `{v.price}`
- `app/[locale]/services/page.tsx` - inline `<bdi>` on `{s.price}` (no `interpolateBidi` import needed — no sentence-level price site exists in this file)
- `tests/__snapshots__/route-page-render.test.tsx.snap` - regenerated golden EN snapshot for prague-vienna (9 `<bdi>` tags added, zero other content change)

## Decisions Made
- Extended the sweep beyond the plan's literal action text to also fix each of the 29 route pages' "Price from" copper-highlight bare-value render — the same site 73-08 fixed on prague-berlin as a Rule 2 deviation. Verified all 30 route content JSON files (including berlin) carry a `copper: true` highlight, confirming every swept page shares the identical unisolated-price defect. This mirrors the reference implementation exactly, consistent with the plan's own instruction to treat prague-berlin as "the exact render-site pattern to replicate."
- `app/[locale]/services/page.tsx` does not import `interpolateBidi`, diverging from the plan's literal action text. `content/pages/en/services.json`'s `hero.intro` and `cta.headingItalic` contain no price tokens, and FAQ/metadata `interpolate()` calls are explicitly excluded from this sweep per the plan — so no sentence-level render site in this file needs `interpolateBidi()`. Importing it unused would be dead code; the acceptance criteria only requires the bare `<bdi>{s.price}</bdi>` wrap.
- Regenerated the prague-vienna golden EN byte-parity snapshot (same precedent as 73-04) since `<bdi>` is a real DOM element that renders identically regardless of locale — adding it to a price site legitimately changes the EN byte output. Verified programmatically (stripping all `<bdi>`/`</bdi>` tags from the new snapshot reproduces the prior snapshot exactly) that no other content drifted.
- Applied the sweep via a single Node script performing exact-occurrence-count-guarded string replacements across all 29 files in one pass (rather than 29 sequential Edit calls) — every substitution asserted exactly the expected count of matches before applying; the script reported zero "UNEXPECTED count" warnings across all 29 files, confirming full structural uniformity before any file was written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended the sweep to the highlights "Price from" bare-value render on all 29 route pages**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 action text named only `hero.intro`, `cta.headingItalic`, `v.price`, and `c.price` as the sites to fix, but the read_first reference (prague-berlin) also fixes the copper "Price from" highlight bare-value render (a 73-08 Rule 2 deviation on the same file). All 30 route content JSON files carry a `copper: true` highlight, so all 29 swept pages have the identical unisolated defect.
- **Fix:** Applied the same conditional `<bdi>` wrap (`{(h as { copper?: boolean }).copper ? <bdi>{h.value}</bdi> : h.value}`) verbatim from the berlin reference to all 29 files.
- **Files modified:** All 29 `app/[locale]/routes/prague-*/page.tsx` files.
- **Verification:** `UNISOLATED` grep check empty; `npx tsc --noEmit` clean; full vitest suite green.
- **Committed in:** `15c79c7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Closes the exact same gap 73-08 identified and fixed on the reference file, applied consistently across the full sweep. No scope creep beyond mirroring the proven reference implementation.

## Issues Encountered
None - the mechanical, script-driven sweep applied cleanly to all 29 files with zero unexpected-count warnings; the one snapshot regeneration (prague-vienna) was anticipated by the 73-04 precedent and verified programmatically before committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CR-02 is now closed across the entire route/service page surface (prague-berlin from 73-08, plus all 29 remaining route pages and the two remaining service pages from this plan). The D-10/D-11 human visual walkthrough (73-12) no longer needs to flag a reversed-price-token risk on any route or service page.
- No blockers.

## Self-Check: PASSED

All 32 modified files verified present on disk with the expected `interpolateBidi`/`<bdi>` markers; both task commits (`15c79c7`, `b8546ce`) verified present in git log.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*
