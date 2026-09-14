---
phase: 72-ai-translation-pipeline-catalogs
plan: 03
subsystem: infra
tags: [anthropic-sdk, claude-opus-5, gray-matter, mdx, i18n, translation-pipeline, qa-report, vitest, tdd]

requires:
  - phase: 72-ai-translation-pipeline-catalogs (Plan 02)
    provides: scripts/lib/i18n-surfaces.mjs (enumerateEnSources/translateCatalog/translateContentJson), scripts/lib/i18n-verify.mjs (verifyDntPreserved/verifyPluralCategories), scripts/i18n-translate.mjs's runFullTranslation() full-catalog pipeline and its summary.flagged shape
provides:
  - scripts/lib/i18n-mdx.mjs — enumerateBlogEnSources(), flattenMdxSource(), verifyMdxStructure(enBody, trBody), buildTranslatedMdx(), translateMdxFile() (D-10 MDX-aware blog translation)
  - scripts/lib/i18n-qa-report.mjs — checkCompleteness(enFlat, localeFlat), checkNoEnglishLeakage(processedUnits, glossary), generateQaReport() writing i18n/QA-REPORT.md (D-09)
  - scripts/i18n-translate.mjs — blog branch wired into runFullTranslation() (processBlogSource helper), createAnthropicMdxBodyTranslator()/createDryRunMdxBodyTranslator(), summary.accepted tracking, checkPipelineState() + a `--check` CLI mode (no API calls), QA-report generation wired as the final step of main()
  - content/blog/en/prague-christmas-markets-chauffeur-2026.mdx — relocated from content/blog/ root (Open Question 3), now visible to lib/blog.ts's getMDXPosts() and the pipeline
affects: [72-04-ci-workflow, 72-05, 73-non-latin-rtl-infra]

actuals:
  tokens: 16510
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "MDX per-file orchestrator (translateMdxFile) reuses the exact JSON per-source manifest-gate/verify/accept contract established in Plan 72-02 (translateCatalog/translateContentJson) via a shared 3-unit {frontmatter.title, frontmatter.description, body} manifest-key shape — no new persistence model needed for MDX."
    - "Structural verification (verifyMdxStructure) is a hard gate BEFORE a unit ever reaches translatedByUnitKey — a structurally-failed body never enters the accepted map, so the caller's per-key EN-fallback (buildTranslatedMdx) requires no special-case branch to exclude it."
    - "QA report is built entirely from in-memory pipeline output (summary.accepted/summary.flagged) plus caller-supplied completeness diffs — it never re-reads translated files from disk, so it can never disagree with what the pipeline actually wrote or skipped this run."

key-files:
  created:
    - scripts/lib/i18n-mdx.mjs
    - scripts/lib/i18n-qa-report.mjs
    - tests/i18n-translate-mdx.test.ts
    - tests/i18n-completeness.test.ts
    - tests/fixtures/i18n/content/blog/en/sample-post.mdx
  modified:
    - scripts/i18n-translate.mjs
    - content/blog/en/prague-christmas-markets-chauffeur-2026.mdx (relocated; git recorded as an add since the source path was untracked)

key-decisions:
  - "gray-matter's stringify(content, data) parameter order (BODY first, DATA second) is the inverse of the order shown in 72-RESEARCH.md's / 72-PATTERNS.md's code snippets (matter.stringify(translatedData, translatedBody)) — confirmed against node_modules/gray-matter/README.md this session and implemented with the correct order in buildTranslatedMdx() (Rule 1 fix, caught during implementation, before any test even ran)."
  - "translateMdxFile() only ever populates translatedByUnitKey for a body unit that PASSES verifyMdxStructure — a structurally-failed body is pushed to failedUnitKeys and never added to translatedByUnitKey at all, so runFullTranslation's blog branch needs no extra downstream filtering step to exclude it."
  - "checkPipelineState() returns {ok, failures} instead of calling process.exit() itself, keeping --check's exact CI/local guard logic directly unit-testable (including a real temp-git-repo EN-mutation test) with no process.exit mocking; main() alone owns translating that result into an exit code."
  - "generateQaReport()'s no-English-leakage check is scoped to summary.accepted (units this run actually processed, never the whole catalog) and excludes DNT-only values (glossary brand/vehicleClasses terms) via isDntOnlyValue() — an untouched hand-edited unit is never re-examined, and a legitimately-identical brand term (e.g. \"Prestigo\") is never false-flagged."

patterns-established:
  - "Pattern: structural-invariant gate before acceptance — verifyMdxStructure() runs immediately after the body translator call and BEFORE the value is added to the accepted-candidates map, not as a separate downstream filter."
  - "Pattern: in-memory QA reporting — a report generator consumes the pipeline's own return value (summary.accepted/summary.flagged), never re-derives state by re-reading output files from disk."

requirements-completed: [TR-01, TR-02]

coverage:
  - id: D1
    description: "Stray content/blog/prague-christmas-markets-chauffeur-2026.mdx relocated into content/blog/en/ so lib/blog.ts's getMDXPosts() and the pipeline both see it (Open Question 3)"
    requirement: "TR-01"
    verification:
      - kind: other
        ref: "test -f content/blog/en/prague-christmas-markets-chauffeur-2026.mdx && test ! -f content/blog/prague-christmas-markets-chauffeur-2026.mdx (both true); git status confirms the relocation, file body unchanged"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/lib/i18n-mdx.mjs: gray-matter frontmatter round-trip (title/description translated, date/dateModified/coverImage/category/author copied byte-for-byte) + whole-document body translation + verifyMdxStructure() (fence count, link count, URL preservation, heading count)"
    requirement: "TR-01"
    verification:
      - kind: unit
        ref: "tests/i18n-translate-mdx.test.ts (9/9 passing) — flattenMdxSource unit-key shape, enumerateBlogEnSources, verifyMdxStructure pass/fail on faithful vs. broken (dropped link URL / dropped code fence) translations, translateMdxFile+buildTranslatedMdx full round-trip incl. D-05 hash-matched skip and the mdx_structure_failed flag path"
        status: pass
    human_judgment: false
  - id: D3
    description: "Blog branch wired into runFullTranslation() (processBlogSource) — a real dry-run over a fixture MDX writes content/blog/<locale>/<slug>.mdx with byte-preserved non-prose frontmatter, manifest-gated"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "tests/i18n-translate-mdx.test.ts#dry-run pipeline over the fixture (runFullTranslation integration test — same frontmatter keys, same order, as EN)"
        status: pass
      - kind: other
        ref: "manual end-to-end check: node scripts/i18n-translate.mjs --dry-run --fixtures <scratch copy of tests/fixtures/i18n> — content/blog/ru/sample-post.mdx frontmatter date/coverImage/category/author byte-identical to EN, title/description translated, 4 sources walked (catalog + route + service + blog), 0 flagged"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/lib/i18n-qa-report.mjs: checkCompleteness() + checkNoEnglishLeakage() + generateQaReport() writing i18n/QA-REPORT.md with per-locale completeness, no-leakage, DNT/ICU/plural, MDX-structural-invariant, and sampled-diff sections (D-09)"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "tests/i18n-completeness.test.ts#checkCompleteness, #checkNoEnglishLeakage, #generateQaReport (7 tests — missing/extra key diff, DNT-only value never false-flagged, all 5 report sections populated)"
        status: pass
      - kind: other
        ref: "manual check: the same dry-run above wrote a QA-REPORT.md with all 5 sections populated (0 missing/0 extra per locale, 0 leaks, 0 DNT/plural failures, 0 MDX-structure failures, populated sampled diff for ru/es/fr)"
        status: pass
    human_judgment: false
  - id: D5
    description: "--check CLI mode: NO API calls, asserts ru/es/fr catalog completeness vs messages/en.json and that EN sources are unmutated per git diff, exits non-zero on either failure"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "tests/i18n-completeness.test.ts#checkPipelineState (4 tests — complete-fixture pass, missing-key fail, real temp-git-repo EN-mutation-guard fail, clean-git-repo pass)"
        status: pass
      - kind: other
        ref: "manual check: node scripts/i18n-translate.mjs --check against the real repo (no ANTHROPIC_API_KEY set) — exit code 1, zero API calls, correctly detects the pre-existing 22-key RoutePage.* drift documented in 72-RESEARCH.md (real translation of that drift is Plan 72-05's live-run scope, not this plan's)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full regression: existing Phase 72 tests and the entire project test suite remain green after the MDX + QA-report additions"
    verification:
      - kind: unit
        ref: "npx vitest run tests/i18n-translate-manifest.test.ts tests/i18n-translate-dnt.test.ts tests/i18n-translate-mdx.test.ts tests/i18n-completeness.test.ts (50/50 passing); npx vitest run full suite (122 files / 1398 tests passing, 10 skipped, 139 todo, 0 new failures vs. the 72-02 baseline of 120/1378)"
        status: pass
    human_judgment: false

duration: ~16min
completed: 2026-09-14
status: complete
---

# Phase 72 Plan 03: MDX Blog Translation + QA Report Summary

**MDX-aware blog translation branch (gray-matter round-trip + whole-body translate + fenced-code/link/heading structural verification) and a QA-report generator (completeness/no-leakage/DNT/MDX-structure/sampled-diff, written to i18n/QA-REPORT.md) wired into the unified pipeline, plus a no-API-calls `--check` guard.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-09-14T21:53:00Z (immediately following 72-02)
- **Completed:** 2026-09-14T22:00:40Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Relocated the stray `content/blog/prague-christmas-markets-chauffeur-2026.mdx` into `content/blog/en/` — it was previously invisible to both the EN blog listing (`lib/blog.ts`) and this pipeline (Open Question 3).
- Built `scripts/lib/i18n-mdx.mjs`: MDX-aware blog translation via `gray-matter` (same parser + required-field set as `lib/blog.ts`) — `title`/`description` translated as short strings, `date`/`dateModified`/`coverImage`/`category`/`author` copied byte-for-byte, the markdown body translated whole-document, and `verifyMdxStructure()` (fenced-code-block count, link count, URL preservation, heading count) as a hard fail-closed gate before any body translation is accepted.
- Wired the blog branch into `scripts/i18n-translate.mjs`'s `runFullTranslation()` via a new `processBlogSource()` helper, mirroring the JSON loop's cross-locale manifest-advance and fail-closed-verification contract (Plan 72-02 pattern) — the pipeline now walks catalog + content-JSON + blog MDX uniformly.
- Built `scripts/lib/i18n-qa-report.mjs`: `checkCompleteness()` (leaf-key-set diff vs `messages/en.json`), `checkNoEnglishLeakage()` (flags a processed unit whose translation is byte-identical to EN, excluding legitimately-identical DNT terms), and `generateQaReport()` writing `i18n/QA-REPORT.md` with 5 sections (completeness, no-leakage, DNT/ICU/plural, MDX-structural-invariants, sampled diff) — the phase's recorded QA sampling-pass artifact (D-09).
- Added a `--check` CLI mode that makes **zero** API calls: verifies ru/es/fr catalog completeness against `messages/en.json` and that EN sources are unmutated per `git diff`, exiting non-zero on either failure. Manually verified against the real repo — it correctly surfaces the pre-existing 22-key `RoutePage.*` drift documented in 72-RESEARCH.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate the stray blog file into content/blog/en/** - `792fa43` (feat)
2. **Task 2: MDX-aware blog translation branch (D-10) + structural verification (TDD)** - `bf26975` (test, RED) then `3416d4d` (feat, GREEN)
3. **Task 3: QA-report generator + `--check` mode** - `11d167f` (feat)

**Plan metadata:** (this commit, `docs(72-03): complete plan`)

## Files Created/Modified

- `content/blog/en/prague-christmas-markets-chauffeur-2026.mdx` - relocated from `content/blog/` root, body unchanged
- `scripts/lib/i18n-mdx.mjs` - NEW, `enumerateBlogEnSources()`, `flattenMdxSource()`, `verifyMdxStructure()`, `buildTranslatedMdx()`, `translateMdxFile()`
- `scripts/lib/i18n-qa-report.mjs` - NEW, `checkCompleteness()`, `checkNoEnglishLeakage()`, `generateQaReport()`
- `scripts/i18n-translate.mjs` - blog branch (`processBlogSource`), MDX-body translator factories, `summary.accepted` tracking, `checkPipelineState()` + `--check` mode, QA-report generation wired as the final step of `main()`
- `tests/i18n-translate-mdx.test.ts` - NEW, 9 tests covering the MDX branch end-to-end
- `tests/i18n-completeness.test.ts` - NEW, 11 tests covering completeness/leakage/QA-report/--check
- `tests/fixtures/i18n/content/blog/en/sample-post.mdx` - NEW fixture (heading, link, code fence) exercising every `verifyMdxStructure` invariant

## Decisions Made

See `key-decisions` in frontmatter. In short: `buildTranslatedMdx()` uses `matter.stringify(content, data)`'s real argument order (confirmed against the installed package, correcting an inverted snippet in 72-RESEARCH.md/72-PATTERNS.md); a structurally-failed MDX body never enters `translatedByUnitKey` at all (no downstream filter needed); `checkPipelineState()` returns a plain result object rather than calling `process.exit()`, keeping it directly unit-testable; the no-English-leakage check is scoped to units this run actually processed and excludes DNT-only values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected gray-matter's `stringify()` argument order**
- **Found during:** Task 2 (writing `buildTranslatedMdx()`, before running any test)
- **Issue:** 72-RESEARCH.md's and 72-PATTERNS.md's `matter.stringify()` code snippets show `matter.stringify(translatedData, translatedBody)` — data first, body second. Checked directly against `node_modules/gray-matter/README.md`'s documented example (`matter.stringify('foo bar baz', {title: 'Home'})`): the real signature is `stringify(content, data)`, body first. Using the research snippet's order verbatim would have silently serialized the markdown body as YAML frontmatter data and vice versa.
- **Fix:** `buildTranslatedMdx()` calls `matter.stringify(translatedBody, translatedData)` — verified correct order, documented in the function's doc comment for future plans reusing this pattern.
- **Files modified:** `scripts/lib/i18n-mdx.mjs`
- **Verification:** `tests/i18n-translate-mdx.test.ts`'s full round-trip test asserts `data.title`/`data.description`/`content` come back correctly-shaped and the non-prose frontmatter fields survive byte-for-byte; manual dry-run over the real fixture confirmed the same.
- **Committed in:** `3416d4d` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was necessary for MDX output to be structurally valid at all. No scope creep — the plan's stated architecture (gray-matter round-trip, whole-body translation, post-hoc structural verification) is unchanged; only the third-party API call's argument order was corrected against its actual documented signature.

## Issues Encountered

None beyond the one auto-fixed deviation above.

## User Setup Required

None for this plan. `ANTHROPIC_API_KEY` is optional (only needed for a real, non-dry-run pipeline invocation — every committed test and the `--check` mode never require it); CI repo-secret wiring remains Plan 72-04 scope, and a real production run against the full corpus (which would resolve the 22-key `RoutePage.*` drift `--check` currently reports) remains Plan 72-05 scope.

## Next Phase Readiness

- The pipeline now uniformly covers all three EN surfaces required by TR-01/TR-02: catalog (`messages/en.json`), content-JSON (`content/routes/en`, `content/pages/en/**`), and blog MDX (`content/blog/en/*.mdx`) — Plan 72-04 (CI workflow) can wire `node scripts/i18n-translate.mjs` (real run, writes `i18n/QA-REPORT.md`) and `node scripts/i18n-translate.mjs --check` (PR/CI gate, zero API calls) directly, no further pipeline-code changes needed for either.
- `i18n/QA-REPORT.md` is the D-09 recorded QA sampling-pass artifact the owner reviews in the PR alongside their native-RU spot-check — its 5 sections (completeness, no-leakage, DNT/ICU/plural, MDX-structural-invariants, sampled diff) are all populated from real pipeline output, verified end-to-end via a manual dry-run this plan.
- `--check`'s real-repo run against the current `messages/{ru,es,fr}.json` confirms the exact pre-existing drift 72-RESEARCH.md documented (22 `RoutePage.*` keys missing) is still present and correctly detected — this is expected (this plan builds the pipeline, not the first live-run reconciliation) and is exactly what Plan 72-05's first real run against the full corpus resolves.
- No blockers. The real Anthropic batch/whole-file/MDX-body translator paths are implemented per 72-RESEARCH.md/72-COVERAGE.md's exact API shapes but have not been exercised against the live API in this plan (only the deterministic `--dry-run` mocks were run, plus `--check`'s zero-API-call path against the real repo).

---
*Phase: 72-ai-translation-pipeline-catalogs*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 6 created/deliverable files found on disk (content/blog/en/prague-christmas-markets-chauffeur-2026.mdx, scripts/lib/i18n-mdx.mjs, scripts/lib/i18n-qa-report.mjs, tests/i18n-translate-mdx.test.ts, tests/i18n-completeness.test.ts, tests/fixtures/i18n/content/blog/en/sample-post.mdx); all 4 task commit hashes (792fa43, bf26975, 3416d4d, 11d167f) found in git log.
