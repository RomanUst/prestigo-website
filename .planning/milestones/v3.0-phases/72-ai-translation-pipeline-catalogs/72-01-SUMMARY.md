---
phase: 72-ai-translation-pipeline-catalogs
plan: 01
subsystem: infra
tags: [anthropic-sdk, claude-opus-5, zod, i18n, translation-pipeline, hash-manifest, tdd]

requires:
  - phase: 68-i18n-foundation-routing
    provides: i18n/routing.ts locale config (locales, AppLocale, routing) and app/[locale] tree
  - phase: 69-string-externalization-ui-chrome
    provides: messages/en.json catalog shape (Nav, Booking, Footer, etc. namespaces)
provides:
  - i18n/glossary.json — owner-editable DNT + per-locale tone/term data (D-06/D-07)
  - scripts/lib/i18n-glossary.mjs — zod-validated glossary loader + buildSystemPrompt()
  - scripts/lib/i18n-manifest.mjs — sha256/flatten/unitsNeedingTranslation/buildOutputTree/loadManifest/writeManifest
  - scripts/i18n-translate.mjs — injectable-translator CLI entry, tracer scoped to one unit
  - i18n/translation-manifest.json — hash-manifest sidecar contract (D-04)
  - i18n/locales.ts — dependency-free locale-list source, importable from plain Node scripts
affects: [72-02-plan-full-catalog-translation, 72-03, 72-04-ci-workflow, 72-05, 73-non-latin-rtl-infra]

actuals:
  tokens: 9648
  tasks: 3
  commits: 5

tech-stack:
  added: ["@anthropic-ai/sdk@0.125.0 (exact-pinned)"]
  patterns:
    - "Flat unitKey -> {enHash, lastTranslatedAt} hash manifest for idempotent, git-history-independent change detection (D-04)"
    - "Output tree always rebuilt by walking the EN source structure (buildOutputTree), never merged/patched — guarantees EN key-order preservation and byte-identical unchanged re-runs"
    - "Translator function injected into translateSource() — production default is a real @anthropic-ai/sdk client, tests/CLI --dry-run substitute deterministic mocks, never touching the real API"
    - "Plain-Node-importable locale source (i18n/locales.ts) kept separate from the Next.js-bundler-only i18n/routing.ts navigation exports"

key-files:
  created:
    - i18n/glossary.json
    - i18n/locales.ts
    - i18n/translation-manifest.json
    - scripts/lib/i18n-glossary.mjs
    - scripts/lib/i18n-manifest.mjs
    - scripts/i18n-translate.mjs
    - tests/i18n-translate-manifest.test.ts
    - tests/fixtures/i18n/messages/en.json
    - tests/fixtures/i18n/messages/ru.json
  modified:
    - package.json
    - package-lock.json
    - i18n/routing.ts

key-decisions:
  - "i18n/routing.ts cannot be imported from a plain `node` script — createNavigation() from next-intl/navigation transitively requires next/navigation, unresolvable outside Next's bundler. Extracted the locale list into new i18n/locales.ts (zero next-intl/next dependencies); routing.ts re-exports it unchanged for every existing consumer."
  - "scripts/lib/i18n-glossary.mjs's DEFAULT_GLOSSARY_PATH resolves against process.cwd(), not import.meta.url + fileURLToPath — the latter throws under Vite/Vitest's module transform ('URL must be of scheme file'); process.cwd()-relative resolution matches the project's existing script convention and works identically for the real CLI and the test runner."
  - "Empty/whitespace-only or structurally-empty (array/object) EN units are excluded from translator calls entirely inside the selected-unit loop, then copied through verbatim and still recorded in the manifest — this keeps idempotency simple (they never re-select once tracked) without a separate manifest code path."
  - "The output target file is always rebuilt in full by walking the EN source tree (buildOutputTree), substituting each leaf from a merged {existing-target-values, newly-translated-values} map — never a partial patch. This is what guarantees EN key-order preservation and byte-identical output on an unchanged re-run."
  - "Real (non-fixture) CLI runs are scoped to exactly one unit (TRACER_UNIT_KEY = messages/en.json::Nav.signIn) via the `only` filter — Plan 72-02 removes this restriction to cover the full catalog."

patterns-established:
  - "Pattern: injected translator function — translateSource({ translator }) never assumes a specific transport; production wires @anthropic-ai/sdk, every test/dry-run wires a deterministic mock."
  - "Pattern: manifest entry written only after its unit's value is queued for the output write — never speculatively, never for skipped/untouched units."

requirements-completed: [TR-01]

coverage:
  - id: D1
    description: "@anthropic-ai/sdk installed, exact-pinned (no caret range), approved at the Task 1 blocking-human package-legitimacy checkpoint"
    requirement: "TR-01"
    verification:
      - kind: other
        ref: "grep '@anthropic-ai/sdk' package.json (== \"0.125.0\", no ^/~) + node -e \"import('@anthropic-ai/sdk')\" resolves"
        status: pass
    human_judgment: false
  - id: D2
    description: "i18n/glossary.json (D-06/D-07 verbatim) + zod-validated loadGlossary() (fail-loud on malformed input) + buildSystemPrompt(glossary, locale)"
    requirement: "TR-01"
    verification:
      - kind: unit
        ref: "tests/i18n-translate-manifest.test.ts#glossary (4 tests: real glossary loads+validates, malformed glossary throws, invalid JSON throws, buildSystemPrompt contains DNT/tone/plural-categories)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/lib/i18n-manifest.mjs: sha256, flattenEnSource, buildOutputTree, unitsNeedingTranslation (D-04/D-05 select/skip), isEmptyValue, loadManifest/writeManifest"
    requirement: "TR-01"
    verification:
      - kind: unit
        ref: "tests/i18n-translate-manifest.test.ts#sha256, #flattenEnSource, #isEmptyValue, #unitsNeedingTranslation (10 tests covering select-absent, select-changed-hash, skip-matched-hash, distinct-unitKey tracking, empty-container non-fabrication, array-as-atomic-leaf)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/i18n-translate.mjs tracer: EN read -> manifest change-detect -> glossary-governed mock/real translate -> target write (EN key order, UTF-8/NFC) -> manifest update -> idempotent re-run, for one key/one locale"
    requirement: "TR-01"
    verification:
      - kind: integration
        ref: "tests/i18n-translate-manifest.test.ts#translateSource (2 tests: hand-edited hash-matched unit skipped untouched + no translator call for whitespace unit + newly-selected units translated + EN key order preserved; second run byte-identical output+manifest with zero new translator calls)"
        status: pass
      - kind: other
        ref: "node scripts/i18n-translate.mjs --dry-run --fixtures tests/fixtures/i18n run twice: run 2 = 0 translated/5 skipped, ru.json + manifest byte-identical to run 1; git diff --exit-code -- tests/fixtures/i18n/messages/en.json clean throughout"
        status: pass
    human_judgment: false
  - id: D5
    description: "Deviation fix: i18n/locales.ts extracted so plain-Node scripts can import the locale list without pulling in next-intl/navigation; i18n/routing.ts re-exports unchanged for all existing consumers"
    verification:
      - kind: unit
        ref: "tests/i18n-routing.test.ts + tests/middleware-i18n.test.ts + tests/i18n-navigation.test.tsx (46/46 passing, unchanged)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json (no new errors vs. pre-existing unrelated baseline); npx vitest run full suite (119 files / 1364 tests passing, 0 new failures)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-09-14
status: complete
---

# Phase 72 Plan 01: AI Translation Pipeline Tracer Summary

**One-key/one-locale translation tracer proving the hash-manifest + glossary + idempotent-write architecture end-to-end with a mocked Anthropic client, plus the owner-approved `@anthropic-ai/sdk@0.125.0` install.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-14T21:07:00Z
- **Completed:** 2026-09-14T21:26:00Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Installed and committed `@anthropic-ai/sdk@0.125.0`, exact-pinned, after the owner's explicit approval at the blocking-human package-legitimacy checkpoint (T-72-SC).
- Built `i18n/glossary.json` encoding D-06/D-07 verbatim (ru formal «Вы», es-ES `usted`, fr `vous`, 4 ru CLDR plural categories) plus `scripts/lib/i18n-glossary.mjs`'s zod-validated `loadGlossary()`/`buildSystemPrompt()`.
- Built the hash-manifest module (`scripts/lib/i18n-manifest.mjs`) implementing D-04/D-05 change detection, key-order-preserving output-tree reconstruction, and empty-unit handling — 10 passing unit tests.
- Built the tracer CLI (`scripts/i18n-translate.mjs`) with an injectable translator (real Anthropic client by default, deterministic mock for `--dry-run`), proved end-to-end for one key/one locale (`Nav.signIn` -> ru) with mocked calls, including a verified byte-identical idempotent second run.
- Followed proper TDD gate sequence: `test(72-01)` commit (RED, confirmed failing — modules didn't exist) before `feat(72-01)` commit (GREEN, 16/16 tests passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve + install @anthropic-ai/sdk** - `6187d0c` (feat)
2. **Task 2: Author i18n/glossary.json + glossary schema/prompt module** - `6ce1dc0` (feat, includes the i18n/locales.ts deviation fix)
3. **Task 3: TRACER (TDD)** - `4662f24` (test, RED) then `3885375` (feat, GREEN)

**Plan metadata:** (this commit, `docs(72-01): complete plan`)

## Files Created/Modified

- `i18n/glossary.json` - owner-editable DNT list + per-locale tone/formality/plural data (D-06/D-07)
- `i18n/locales.ts` - NEW, dependency-free locale list (extracted from i18n/routing.ts)
- `i18n/routing.ts` - re-exports locales/AppLocale/rtlLocales from i18n/locales.ts unchanged
- `i18n/translation-manifest.json` - initial empty hash-manifest sidecar (`{version:1,units:{}}`)
- `scripts/lib/i18n-glossary.mjs` - zod schema, `loadGlossary()`, `buildSystemPrompt()`
- `scripts/lib/i18n-manifest.mjs` - `sha256`, `flattenEnSource`, `buildOutputTree`, `unitsNeedingTranslation`, `isEmptyValue`, `loadManifest`, `writeManifest`
- `scripts/i18n-translate.mjs` - CLI entry, `translateSource()`, `createAnthropicTranslator()`, `createDryRunTranslator()`, `TRACER_UNIT_KEY`
- `tests/i18n-translate-manifest.test.ts` - 16 tests (glossary, manifest primitives, tracer end-to-end + idempotency)
- `tests/fixtures/i18n/messages/en.json` / `ru.json` - tiny fixture corpus (includes a hand-edited unit and a whitespace-only unit)
- `package.json` / `package-lock.json` - `@anthropic-ai/sdk@0.125.0` dependency

## Decisions Made

- **i18n/locales.ts extraction (Rule 3 auto-fix, blocking issue):** `i18n/routing.ts` cannot be imported from a plain `node` script — its `createNavigation()` call (from `next-intl/navigation`) transitively requires `next/navigation`, which fails to resolve (`ERR_MODULE_NOT_FOUND`) outside Next's own bundler. Verified directly: `node -e "import('./i18n/routing.ts')"` fails; `node -e "import('./i18n/locales.ts')"` (a pure-TS constants file) succeeds. Since the plan explicitly requires "never hardcode a duplicate locale list," the fix was to extract `locales`/`AppLocale`/`rtlLocales` into a new dependency-free `i18n/locales.ts`, with `i18n/routing.ts` re-exporting them unchanged — every existing consumer (middleware, layout, components, tests) is unaffected. Verified via `tsc --noEmit` and the full `i18n-routing`/`middleware-i18n`/`i18n-navigation` test suites (46/46 passing).
- **Glossary path resolution (Rule 1 auto-fix, bug):** the original `fileURLToPath(new URL('../../i18n/glossary.json', import.meta.url))` pattern throws `TypeError: The URL must be of scheme file` when the module is loaded through Vite/Vitest's transform pipeline (`import.meta.url` isn't a `file://` URL there). Switched to `path.resolve(process.cwd(), 'i18n/glossary.json')`, matching this project's existing convention of scripts assuming a repo-root cwd (see `scripts/get-business-location.mjs`'s relative `.env.local` read).
- **Empty-unit handling folded into manifest tracking:** rather than a separate "already handled" state, empty/whitespace/structurally-empty units are simply excluded from the translator call within the normal selected-unit loop, then copied through and recorded in the manifest like any other processed unit — this keeps the second-run idempotency guarantee uniform across all unit types with no special-case branch.
- **Fixture design:** `tests/fixtures/i18n/messages/ru.json` intentionally pre-seeds a hand-edited `Nav.signIn` translation plus stale EN-copy placeholders for the rest — mirroring the real repo's current `messages/ru.json` drift (per 72-RESEARCH.md's Runtime State Inventory finding) and giving the fixture-based test real coverage of the D-05 "manual edit preserved" guarantee, not just the D-04 selection logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted i18n/locales.ts so plain-Node scripts can import the locale list**
- **Found during:** Task 2 (glossary module — needed to import `locales` per the plan's explicit "never hardcode" instruction)
- **Issue:** `i18n/routing.ts` transitively imports `next-intl/navigation` -> `next/navigation`, which a plain `node` invocation cannot resolve outside Next's bundler
- **Fix:** Extracted `locales`/`AppLocale`/`rtlLocales` into new `i18n/locales.ts` (zero next-intl/next dependencies); `i18n/routing.ts` re-exports them unchanged
- **Files modified:** i18n/locales.ts (new), i18n/routing.ts
- **Verification:** `tsc --noEmit` clean on both files; `tests/i18n-routing.test.ts`, `tests/middleware-i18n.test.ts`, `tests/i18n-navigation.test.tsx` — 46/46 passing, unchanged
- **Committed in:** `6ce1dc0` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed glossary default path resolution under Vite/Vitest**
- **Found during:** Task 3 (first GREEN test run — `TypeError: The URL must be of scheme file`)
- **Issue:** `fileURLToPath(new URL('../../i18n/glossary.json', import.meta.url))` breaks when the module is loaded through Vite's transform (non-`file://` `import.meta.url`)
- **Fix:** Resolve `DEFAULT_GLOSSARY_PATH` against `process.cwd()` instead
- **Files modified:** scripts/lib/i18n-glossary.mjs
- **Verification:** `npx vitest run tests/i18n-translate-manifest.test.ts` — 16/16 passing; real CLI invocation (`node scripts/i18n-translate.mjs --dry-run ...`) also confirmed working from repo-root cwd
- **Committed in:** `3885375` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were necessary for the tracer to be executable at all outside Next's bundler/build pipeline. No scope creep — the plan's stated architecture (manifest format, glossary schema, injectable translator, one-key/one-locale scope) is unchanged; only the module-resolution mechanics were adjusted.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None for this plan. `ANTHROPIC_API_KEY` is optional (only needed for an optional local real-API smoke test — the committed tests and CLI `--dry-run` mode never require it); CI repo-secret wiring is Plan 72-04 scope.

## Next Phase Readiness

- The manifest format (`i18n/translation-manifest.json`), glossary schema (`i18n/glossary.json`), and the injectable `translateSource()` contract are locked and proven end-to-end — Plan 72-02 can extend `TRACER_UNIT_KEY`'s single-unit scope to the full `messages/en.json` catalog (and content/route/page/blog surfaces) without changing the underlying algorithm.
- `i18n/locales.ts` is now available as the canonical plain-Node-importable locale source for any future script in this pipeline (Plans 72-02 through 72-05, and Phase 73's AR/HI/ZH extension).
- No blockers. The real Anthropic API call path (`createAnthropicTranslator`) is implemented but has not been exercised against the live API in this plan — that remains an optional local smoke test or Plan 72-04's CI wiring.

---
*Phase: 72-ai-translation-pipeline-catalogs*
*Completed: 2026-09-14*

## Self-Check: PASSED

All 10 created/deliverable files found on disk; all 4 task commit hashes (6187d0c, 6ce1dc0, 4662f24, 3885375) found in git log.
