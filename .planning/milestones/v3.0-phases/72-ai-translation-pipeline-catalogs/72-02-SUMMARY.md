---
phase: 72-ai-translation-pipeline-catalogs
plan: 02
subsystem: infra
tags: [anthropic-sdk, claude-opus-5, structured-outputs, streaming, i18n, translation-pipeline, zod, vitest, tdd]

requires:
  - phase: 72-ai-translation-pipeline-catalogs (Plan 01)
    provides: i18n/glossary.json + scripts/lib/i18n-glossary.mjs (loadGlossary/buildSystemPrompt/PHASE_72_LOCALES), scripts/lib/i18n-manifest.mjs (hash-manifest primitives), scripts/i18n-translate.mjs's injectable-translator + idempotent-write architecture (translateSource), i18n/locales.ts (plain-Node locale source)
provides:
  - scripts/lib/i18n-surfaces.mjs — enumerateEnSources() (catalog + content/routes/en + content/pages/en, recursive incl. services/), batchShortStrings() (Pattern 3.1), translateWholeFile() (Pattern 3.2), translateCatalog()/translateContentJson() (pure per-source-per-locale orchestrators)
  - scripts/lib/i18n-verify.mjs — extractIcuTokens(), extractRichTags(), verifyDntPreserved(), verifyPluralCategories() (fail-closed DNT/ICU/tag/RU-plural verifier)
  - scripts/i18n-translate.mjs::runFullTranslation() — the full-catalog CLI pipeline (replaces the Plan 01 tracer's single-key `main()` scope), wired to real Anthropic batch (structured output) + whole-file (streaming) translators and their --dry-run mocks
  - tests/i18n-translate-dnt.test.ts — 14 DNT/ICU/rich-tag/RU-plural preservation unit tests
  - extended fixture corpus (tests/fixtures/i18n/content/routes/en/sample-route.json, .../content/pages/en/services/sample-service.json)
affects: [72-03-qa-report-and-blog, 72-04-ci-workflow, 72-05, 73-non-latin-rtl-infra]

actuals:
  tokens: 11279
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure orchestration functions (translateCatalog/translateContentJson) read the manifest but never write it or touch the filesystem beyond the EN source read — the caller (runFullTranslation) owns persistence, so a translator failure never partially commits state."
    - "Two batching strategies selected by source.surfaceType: 'catalog' -> batchShortStrings (chunked structured-output batch calls), 'content' -> translateWholeFile (one streamed call per file per locale)."
    - "Cross-locale manifest-advance gating: a unit's manifest entry only advances after it succeeded (translated + verified, or was empty) in EVERY requested locale this run, not after the first locale — the manifest's enHash carries no locale dimension."
    - "Fail-closed unit acceptance: verifyTranslatedUnits() (DNT/ICU/plural) runs after every translation and before a unit enters the output tree or the manifest; a failing unit falls back to the EN value in the output file and is excluded from the manifest so it is retried next run, rather than shipping a broken or silently-English string."

key-files:
  created:
    - scripts/lib/i18n-surfaces.mjs
    - scripts/lib/i18n-verify.mjs
    - tests/i18n-translate-dnt.test.ts
    - tests/fixtures/i18n/content/routes/en/sample-route.json
    - tests/fixtures/i18n/content/pages/en/services/sample-service.json
  modified:
    - scripts/i18n-translate.mjs

key-decisions:
  - "Cross-locale manifest advance deferred to after all requested locales are attempted for a source (Rule 1 auto-fix — see Deviations). Discovered while wiring runFullTranslation()'s locale loop: the Plan 01 tracer's per-locale translateSource() call wrote the manifest entry immediately after ONE locale succeeded, sharing one manifest across a multi-locale main() loop — the second and third locales would then see that unitKey as 'already done' (enHash matches) and silently fall back to the untranslated EN value for that unit."
  - "translateCatalog()/translateContentJson() are intentionally read-only/pure (no file writes, no manifest mutation) — runFullTranslation() alone owns writing target files and advancing the manifest, keeping a translator-call failure or a verification failure cleanly retry-able on the next run with no partial-write state."
  - "Real batch translator uses client.messages.parse() + zodOutputFormat (structured JSON-array output, per 72-COVERAGE.md — replaces the deprecated assistant-prefill pattern, which returns a 400 on Opus 5). Real whole-file translator uses client.messages.stream() + finalMessage() at max_tokens:64000 (per 72-COVERAGE.md's streaming decision — long-form route/page prose can exceed safe non-streaming max_tokens)."
  - "translateSource(), createAnthropicTranslator(), createDryRunTranslator(), and TRACER_UNIT_KEY are kept byte-for-byte in scripts/i18n-translate.mjs, unchanged, for the Plan 01 tracer test's committed coverage (tests/i18n-translate-manifest.test.ts) — the full-catalog path is an additive function (runFullTranslation), not a rewrite of the tracer's entry point."
  - "A unit that fails post-hoc DNT/ICU/plural verification is excluded from BOTH the output write and the manifest advance — buildOutputTree's existing 'fall back to the EN node when no override is present' behavior means the output file shows the English value for that unit (never a broken/DNT-violating translation), and the missing manifest entry means the unit is automatically retried on the next run. Manually verified end-to-end (see Task 1/2 coverage D4 below) rather than left as an assumption."

patterns-established:
  - "Pattern: pure orchestration + caller-owned persistence — a translate*() helper never writes state; the pipeline loop that calls it decides when writes/manifest-advances are safe to commit."
  - "Pattern: surfaceType-dispatched batching — enumerateEnSources() tags each source with 'catalog' | 'content', and the pipeline loop switches strategy on that tag rather than inspecting file paths again."

requirements-completed: [TR-01, TR-02]

coverage:
  - id: D1
    description: "The pipeline walks every EN catalog + content-JSON source (messages/en.json, content/routes/en/*.json, content/pages/en/**/*.json incl. services/) and produces ru/es/fr outputs for each, with manifest-gated incrementality (a second run over unchanged sources issues zero translator calls)."
    requirement: "TR-02"
    verification:
      - kind: other
        ref: "node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n — run 1: 3 sources walked, 27 unit-translations written across ru/es/fr (catalog + route + nested services/ page), 0 flagged; run 2 (unchanged): 3 sources skipped, 0 unit-translations, 0 flagged"
        status: pass
    human_judgment: false
  - id: D2
    description: "Target locales are derived locale-generically from i18n/locales.ts (via PHASE_72_LOCALES, re-exported through i18n/routing.ts) — no hardcoded ['ru','es','fr'] array anywhere in scripts/lib/i18n-surfaces.mjs."
    requirement: "TR-02"
    verification:
      - kind: other
        ref: "grep -n \"'ru'\" scripts/lib/i18n-surfaces.mjs (zero matches); scripts/i18n-translate.mjs main() imports PHASE_72_LOCALES from ./lib/i18n-glossary.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Post-hoc verifier: every EN ICU variable/plural-block, rich-text tag, and brand/vehicle-class DNT term must survive verbatim in translation; RU plural blocks must carry all 4 CLDR categories (es/fr stay 2)."
    requirement: "TR-01"
    verification:
      - kind: unit
        ref: "tests/i18n-translate-dnt.test.ts (14/14 passing) — extractIcuTokens, extractRichTags, verifyDntPreserved (missing ICU var / unbalanced tag / altered DNT term / all-preserved-passes), verifyPluralCategories (RU missing few/many fails, full RU one/few/many/other passes, es/fr one/other passes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A unit that fails DNT/ICU/plural verification is NOT written as accepted — it falls back to the EN value in the output file and is excluded from the manifest, so it is retried automatically on the next run rather than shipping silently."
    requirement: "TR-01"
    verification:
      - kind: integration
        ref: "manual end-to-end check: runFullTranslation() with a translateBatch mock that drops {amount} from a translated unit — console logs the verification failure, summary.flagged contains the unitKey, the written messages/ru.json carries the EN fallback value 'Airport transfers from {amount}' (not the broken translation), and the manifest has zero entries for that unit (confirmed via direct file read after the run)"
        status: pass
    human_judgment: false
  - id: D5
    description: "TDD gate sequence followed for Task 2: RED (test committed against a non-existent module, confirmed failing with a module-resolution error) then GREEN (implementation committed, 14/14 passing)."
    verification:
      - kind: other
        ref: "git log: 430bd1f (test, RED) -> 5e8740c (feat, GREEN); RED confirmed by moving scripts/lib/i18n-verify.mjs aside and re-running vitest before writing it"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full regression: existing Plan 01 tracer tests and the entire project test suite remain green after the full-catalog rewrite."
    verification:
      - kind: unit
        ref: "npx vitest run tests/i18n-translate-manifest.test.ts tests/i18n-translate-dnt.test.ts (30/30 passing); npx vitest run full suite (120 files / 1378 tests passing, 10 skipped, 0 new failures vs. the 72-01 baseline of 119 files / 1364 tests)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-09-14
status: complete
---

# Phase 72 Plan 02: AI Translation Pipeline — Full Catalog + Content-JSON Coverage Summary

**Full EN-surface walker (catalog + 30 route files + 17 page files incl. nested services/) with per-surface batching (structured-output batch for chrome strings, streamed whole-file calls for route/page prose) and a fail-closed post-hoc DNT/ICU-variable/rich-tag/RU-plural verifier that excludes any broken translation from both the output tree and the manifest.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-14T21:27:00Z (immediately following 72-01)
- **Completed:** 2026-09-14T21:46:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Built `scripts/lib/i18n-surfaces.mjs`: `enumerateEnSources()` walks `messages/en.json` + every `content/routes/en/*.json` + `content/pages/en/**/*.json` (recursive, replicating the nested `services/` subdirectory under each locale), and two batching strategies — `batchShortStrings()` (chunked structured-output batch per locale for the catalog) and `translateWholeFile()` (one streamed call per file per locale for route/page prose, per 72-RESEARCH.md Pattern 3).
- Rewrote `scripts/i18n-translate.mjs`'s `main()` around a new `runFullTranslation()` that walks every enumerated source for every requested locale (`ru`/`es`/`fr`, locale-generically derived from `i18n/locales.ts`), replacing the Plan 01 tracer's one-key scope — while keeping `translateSource()`/`createAnthropicTranslator()`/`createDryRunTranslator()`/`TRACER_UNIT_KEY` intact for that plan's committed test coverage.
- Fixed a real cross-locale manifest-ordering bug found while wiring the locale loop (Rule 1): the manifest now advances a unit only after EVERY requested locale has succeeded for it this run — not after the first — closing a silent English-fallback risk for the second/third locale in a run.
- Built `scripts/lib/i18n-verify.mjs` via strict TDD (RED confirmed, then GREEN): `extractIcuTokens()`, `extractRichTags()`, `verifyDntPreserved()`, `verifyPluralCategories()` — wired into `runFullTranslation()` so every translated unit is checked before acceptance; a failing unit falls back to the EN value in the output and is excluded from the manifest (auto-retried next run).
- Extended the fixture corpus with a route file and a nested `services/` page so `--dry-run --fixtures` exercises all three surface types (catalog, route, nested content page) and all three locales in one run; verified idempotency (a second run against unchanged fixtures issues zero translator calls) and that EN sources stay byte-for-byte unchanged throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: Walk all catalog + content-JSON sources and batch-translate per surface type** - `1e30917` (feat)
2. **Task 2: Post-hoc DNT / ICU-variable / rich-tag / RU-plural verifier (fail-closed)** - `430bd1f` (test, RED) then `5e8740c` (feat, GREEN)

**Plan metadata:** (this commit, `docs(72-02): complete plan`)

## Files Created/Modified

- `scripts/lib/i18n-surfaces.mjs` - EN-source walker + per-surface batching (short-string batch, whole-file)
- `scripts/lib/i18n-verify.mjs` - fail-closed DNT/ICU/rich-tag/RU-plural verifier
- `scripts/i18n-translate.mjs` - `runFullTranslation()` (full-surface pipeline), real Anthropic batch/whole-file translators (structured output + streaming) and their `--dry-run` mocks, `verifyTranslatedUnits()` gate; Plan 01 tracer entry points kept unchanged
- `tests/i18n-translate-dnt.test.ts` - 14 tests covering every DNT/ICU/tag/plural behavior, using real EN tokens from `messages/en.json`
- `tests/fixtures/i18n/content/routes/en/sample-route.json` - NEW fixture, exercises the whole-file route-translation path
- `tests/fixtures/i18n/content/pages/en/services/sample-service.json` - NEW fixture, exercises the nested `services/` directory-preservation requirement

## Decisions Made

See `key-decisions` in frontmatter. In short: manifest-advance is deferred until every locale in a run succeeds for a unit (not per-locale-immediate); `translateCatalog`/`translateContentJson` are pure/read-only so a translator or verification failure never partially commits state; the real Anthropic calls use the exact API shapes 72-COVERAGE.md specified (`messages.parse` + `zodOutputFormat` for the batch path, `messages.stream` + `finalMessage()` for the whole-file path); the Plan 01 tracer's functions are left untouched rather than folded into the new pipeline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cross-locale manifest-advance ordering**
- **Found during:** Task 1 (wiring the multi-locale `main()` loop around the Plan 01 tracer's per-locale `translateSource()` call)
- **Issue:** The manifest's `enHash` entry carries no locale dimension, but the tracer's `main()` looped `for (const locale of requestedLocales) { await translateSource(...) }` against ONE shared manifest, writing the manifest entry inside each `translateSource()` call as soon as that single locale finished. The second and third locale in the loop would then see the unitKey as "already translated" (hash matches) and silently fall back to the EN value for that locale — a real correctness gap for `es`/`fr` that the Plan 01 verification (which only checked `ru.json`) did not surface.
- **Fix:** `runFullTranslation()` computes `selected` once per source, translates it for every requested locale first, and only advances the manifest for a unit after it succeeded (or was empty) in every locale attempted this run. A unit that fails in any single locale is excluded from this run's manifest advance so every locale retries it next run.
- **Files modified:** `scripts/i18n-translate.mjs`
- **Verification:** `node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n` — confirmed `ru`, `es`, and `fr` all receive real per-locale translated output (not just the first locale processed) for the catalog, the route file, and the nested services page
- **Committed in:** `1e30917` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was necessary for TR-02's "produces ru/es/fr outputs for each" guarantee to actually hold across all three locales in a single multi-locale run. No scope creep — the plan's stated architecture (manifest format, two-strategy batching, fail-closed verifier) is unchanged.

## Issues Encountered

- A shell/heredoc quoting issue in this execution environment caused one commit message (`1e30917`) to lose a closing parenthesis and pick up two stray literal tokens ("EOF" and a lone ")") where an inline-code span using backticks appeared in the message body — apparently backtick expansion was not fully suppressed inside the `<<'EOF'`-quoted heredoc used to build that commit message. The commit's actual file changes and diff are unaffected and fully correct (verified via `git show`/`git diff`); only the prose commit-message body has this cosmetic artifact. Per the git safety protocol (never amend unless explicitly requested), the message was left as committed rather than rewritten. Subsequent commits in this plan avoided backticks in the message body to prevent recurrence.
- Running the plan's literal `<verify>` command (`node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n`) directly against the committed fixtures directory mutates it in place (overwrites the hand-edited `ru.json` fixture, creates new `es.json`/`fr.json`/`translation-manifest.json`/locale subdirectories) — there is no temp-copy isolation for this manual CLI path (the committed Vitest test does isolate via a temp-dir copy). Handled by running the verification, capturing/confirming its output, then `git checkout -- tests/fixtures/i18n/messages/ru.json` and deleting the generated files before committing, so only the two new EN fixture sources were added to the committed fixture corpus.

## User Setup Required

None for this plan. `ANTHROPIC_API_KEY` is optional (only needed for an optional local real-API smoke test — the committed tests and CLI `--dry-run` mode never require it); CI repo-secret wiring remains Plan 72-04 scope.

## Next Phase Readiness

- The full catalog + content-JSON surface is translatable for ru/es/fr with manifest-gated incrementality and a fail-closed DNT/ICU/plural gate — Plan 72-03 can build the QA-report generator and MDX blog translation on top of `enumerateEnSources()`'s pattern and `runFullTranslation()`'s `summary.flagged` list without re-deriving the walk or the verifier.
- `summary.flagged` (unitKey + locale + missing/unbalanced/missingPluralCategories, or `reason: 'translator_call_failed'`) is the exact shape Plan 72-03's QA report needs to enumerate failures — no additional plumbing required to surface them.
- No blockers. The real Anthropic batch/whole-file translator paths are implemented per 72-COVERAGE.md's exact API shapes but have not been exercised against the live API in this plan (only the deterministic `--dry-run` mocks were run) — that remains Plan 72-04's CI-wiring scope or an optional local smoke test.

---
*Phase: 72-ai-translation-pipeline-catalogs*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 5 created files found on disk (scripts/lib/i18n-surfaces.mjs, scripts/lib/i18n-verify.mjs, tests/i18n-translate-dnt.test.ts, tests/fixtures/i18n/content/routes/en/sample-route.json, tests/fixtures/i18n/content/pages/en/services/sample-service.json); all 3 task commit hashes (430bd1f, 5e8740c, 1e30917) found in git log.
