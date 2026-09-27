---
phase: 75-e2e-verification-launch
plan: 18
subsystem: i18n
tags: [i18n, translation-manifest, metricool, content-parity, qa-gate, freeze-tool]

requires:
  - phase: 75-e2e-verification-launch
    provides: freeze/75-06.freeze .. freeze/75-16.freeze (hand-translated unit patterns from plans 75-06..75-16), en_leak_static.mjs (Plan 75-02), the Metricool client (existing publish pipeline)
provides:
  - scripts/i18n-freeze-manifest.mjs — freeze tool + selectUnits/freezeUnits/verifyFrozen exports
  - i18n/translation-manifest.json frozen for 355 Phase-75 hand-translated units
  - lib/content/metricool.ts CreatePostInput.draft?: boolean
  - tests/content-locale-parity.test.ts — 313-case content/locale structural parity backstop
  - .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md — full pre-deploy gate record
affects: [75-19, 75-20, 75-21]

actuals:
  tokens: 34578
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "freeze pattern files (.planning/phases/.../freeze/*.freeze) enumerate sourceKey[::dotPrefix] lines resolved via the same enumerateEnSources() mapping the real pipeline uses"
    - "en_leak_allowlist.json dnt/placeNames/tierNames categories reused as the freeze tool's own legitimately-identical-value exception, alongside a purely-numeric-string exception"

key-files:
  created:
    - scripts/i18n-freeze-manifest.mjs
    - tests/i18n-freeze-manifest.test.ts
    - tests/content-locale-parity.test.ts
    - .planning/phases/75-e2e-verification-launch/freeze/75-18.freeze
    - .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md
  modified:
    - i18n/translation-manifest.json
    - lib/content/metricool.ts
    - tests/content-metricool.test.ts
    - scripts/qa/en_leak_allowlist.json
    - app/[locale]/contact/page.tsx
    - content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json
    - content/pages/hi/book/multi-day.json

key-decisions:
  - "Freeze tool's DNT-only exception (glossary brand/vehicleClasses) was too narrow for real content — extended to reuse scripts/qa/en_leak_allowlist.json's dnt/placeNames/tierNames registry (place names with no distinct exonym, cross-language cognates) plus a numeric-code exception, adding 4 new allowlist entries the real freeze run surfaced"
  - "components/admin/** en_leak_static.mjs findings (149) left untouched — matches the already-recorded UNOWNED bucket in 75-EN-LEAK-AUDIT.md and STATE.md's explicit 'admin panel out of i18n scope' guardrail; the scanner itself was not modified, following the existing test-level-filter convention (tests/locale-links-backstop.test.ts)"
  - "Pre-existing tsc --noEmit (8 errors/3 files) and npm run lint (42 errors/~22 files) failures recorded, not fixed — 100% pre-existing, zero overlap with this plan's files_modified, matching the tsc precedent already set in 75-10-SUMMARY.md/75-11-SUMMARY.md"
  - "5 vitest suite failures (account-trips, auth-customer, login-actions, passenger-actions, profile-actions) are a worktree-only next-intl relative-import artifact, not a regression — identical to the issue independently documented in 75-10/75-11-SUMMARY.md; does not reproduce on the main checkout"

patterns-established:
  - "A plan discovering a genuine content/code defect via its own QA gate (Task 3) fixes it inline as a Rule 1/2 deviation, freezes any newly hand-translated unit via a same-numbered freeze/*.freeze file, then re-verifies --verify before continuing"

requirements-completed: [VER-01]  # frontmatter mirrors this plan's own `requirements` field per template convention; NOT run through requirements.mark-complete here — VER-01 is shared by all 21 phase-75 plans and stays Pending in REQUIREMENTS.md until every plan finishes and the phase verifier passes. Per worktree-mode instructions, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT touched by this executor — the orchestrator owns those writes after merge.

coverage:
  - id: D1
    description: "scripts/i18n-freeze-manifest.mjs freezes every freeze/*.freeze pattern (68 real patterns, 354→355 units after Task 3's own new freeze file) into i18n/translation-manifest.json, refusing missing/EN-identical (non-DNT/non-allowlisted/non-numeric) values"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/i18n-freeze-manifest.test.ts (32 cases: pattern parsing, whole-path-segment prefix selection, missing/identical refusal, DNT/allowlist/numeric exceptions, dedup, --verify pass/fail)"
        status: pass
      - kind: other
        ref: "node scripts/i18n-freeze-manifest.mjs --verify on the real repo — 355 frozen units, PASSED"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/content/metricool.ts CreatePostInput.draft?: boolean — true sends draft:true/autoPublish:false, omitted/false reproduces today's body byte-identically; createMetricoolPosts fans it through per channel"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/content-metricool.test.ts > draft: true / omitting draft / draft: false / createMetricoolPosts fans draft through (4 new cases) + tests/content-publish.test.ts unchanged (git diff lib/content/publish.ts empty)"
        status: pass
    human_judgment: false
  - id: D3
    description: "tests/content-locale-parity.test.ts proves every content/pages/en/**/*.json (recursive) and content/routes/en/*.json has all 6 locale siblings with identical key set, leaf types, and array lengths"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/content-locale-parity.test.ts (313 cases, all pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full pre-deploy gate run and recorded in 75-QA-RESULTS.md, including the D-15 vitest baseline classification"
    requirement: VER-01
    verification:
      - kind: other
        ref: "75-QA-RESULTS.md — every gate command's exit code and totals, cross-checked against this plan's files_modified"
        status: pass
    human_judgment: true
    rationale: "Whether the documented pre-existing/out-of-scope classifications (tsc, lint, admin-panel leak bucket) and the worktree-only vitest artifact are an acceptable gate outcome for deploy readiness is a judgment call this SUMMARY documents but a human/the phase verifier should confirm before plan 75-19 ships"

duration: 62min
completed: 2026-09-26
status: complete
---

# Phase 75 Plan 18: Freeze translation manifest, Metricool drafts, content parity, pre-deploy gate Summary

**Froze 355 hand-translated Phase-75 units into the i18n manifest, added Metricool draft support, proved 313-case content/locale structural parity, and ran+recorded the full pre-deploy gate — finding and fixing 2 genuine EN leaks (contact hero alt, a hardcoded legal address) along the way.**

## Performance

- **Duration:** 62 min
- **Started:** 2026-09-26T21:35:00Z (approx.)
- **Completed:** 2026-09-26T22:37:00Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- **Task 1 (tracer):** `scripts/i18n-freeze-manifest.mjs` — reads every `freeze/*.freeze` pattern (68 real patterns from plans 75-06..75-16), resolves each `sourceKey[::dotPrefix]` via the same `enumerateEnSources()` mapping the AI pipeline uses, and writes `{enHash, lastTranslatedAt}` into `i18n/translation-manifest.json` — refusing to freeze any unit missing or byte-identical to EN in any of the 6 locales unless the value is legitimately identical (glossary DNT, `en_leak_allowlist.json`'s `dnt`/`placeNames`/`tierNames` registry, or a purely-numeric code). Running it over the real freeze directory surfaced a genuine untranslated stub (`content/pages/hi/book/multi-day.json` `dayTypeLabels.TRANSFER` left as English while every other locale translated it) — fixed to `"ट्रांसफर"` matching the established hi transliteration convention — plus 4 legitimate French-cognate/exonym false positives, now documented in the allowlist. Froze 354 units; `--verify` PASSED.
- **Task 2:** `lib/content/metricool.ts` gained `CreatePostInput.draft?: boolean` — `true` sends `draft:true`/`autoPublish:false`; omitted/`false` reproduces today's body exactly. `createMetricoolPosts` already fans any `CreatePostInput` field through per channel, so no extra wiring was needed. `lib/content/publish.ts` is byte-unchanged (verified via `git diff`).
- **Task 3:** `tests/content-locale-parity.test.ts` (313 cases) proves every content JSON has all 6 locale siblings with identical structure. Running the pre-deploy gate's `en_leak_static.mjs` found 2 genuine, customer-facing leaks (not the pre-documented admin-panel bucket): the `/contact` hero image's hardcoded English `alt` (externalized to `content.hero.imageAlt`, translated into all 6 locales, frozen via a new `freeze/75-18.freeze`) and a hardcoded legal-entity postal address in `Footer.tsx`/`contact/page.tsx` (allowlisted — addresses are never translated). The full gate (vitest, i18n-check, tsc, lint, en_leak_static, locale-links-backstop, next build) was run and recorded in `75-QA-RESULTS.md`, including the D-15 vitest baseline classification.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — manifest freeze tool + froze all Phase 75 units** - `b3d51516` (feat)
2. **Task 2: Metricool draft support** - `a94416e1` (feat)
3. **Task 3a: content/locale parity test + fix 2 genuine EN leaks found by the gate** - `a23ab1b3` (feat)
4. **Task 3b: record full pre-deploy gate results** - `a7cba155` (docs)

**Plan metadata:** this SUMMARY's own commit (recorded after this file is committed).

_Note: no TDD-plan-level RED/GREEN/REFACTOR gate — Tasks 1/2 use per-task `tdd="true"` (fixture-first tests, committed together with the implementation in one commit each per this plan's structure); Task 3 is `type="auto"`._

## Files Created/Modified

- `scripts/i18n-freeze-manifest.mjs` (new) - CLI + `selectUnits`/`freezeUnits`/`verifyFrozen`/`readFreezePatterns` exports
- `tests/i18n-freeze-manifest.test.ts` (new) - 32-case fixture test suite
- `tests/content-locale-parity.test.ts` (new) - 313-case content/locale structural parity backstop
- `.planning/phases/75-e2e-verification-launch/freeze/75-18.freeze` (new) - freezes this plan's own new `contact.json::hero.imageAlt` unit
- `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md` (new) - full pre-deploy gate record
- `i18n/translation-manifest.json` - 355 units frozen (was 2188, now 2543)
- `lib/content/metricool.ts` - `CreatePostInput.draft?: boolean`
- `tests/content-metricool.test.ts` - 4 new draft-behavior cases
- `scripts/qa/en_leak_allowlist.json` - 5 new entries (Prague→{city}, Service, Message, Distance cognates; the chelautotrans postal address), all with non-empty reasons
- `app/[locale]/contact/page.tsx` - hero `alt` now reads `content.hero.imageAlt` instead of a hardcoded string
- `content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json` - added `hero.imageAlt` (EN + 6 translations)
- `content/pages/hi/book/multi-day.json` - fixed untranslated `dayTypeLabels.TRANSFER` stub

## Decisions Made

- Extended the freeze tool's legitimately-identical-value check beyond glossary DNT to reuse `en_leak_allowlist.json`'s existing `dnt`/`placeNames`/`tierNames` registry plus a numeric-code exception — the literal "DNT-only" spec was too narrow for real content (many town names/cognates are correctly identical across locales); reusing the project's own already-audited registry avoided inventing parallel logic.
- Left `components/admin/**`'s 149 `en_leak_static.mjs` findings untouched — matches the phase's own already-recorded UNOWNED bucket (`75-EN-LEAK-AUDIT.md`) and STATE.md's explicit admin-out-of-i18n-scope guardrail; did not modify the shared scanner, following the existing test-level-filter convention.
- Recorded (did not fix) pre-existing `tsc --noEmit` (8 errors/3 files) and `npm run lint` (42 errors/~22 files) failures — zero overlap with this plan's `files_modified`, matching the identical `tsc` precedent already set by `75-10-SUMMARY.md`/`75-11-SUMMARY.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed untranslated stub `dayTypeLabels.TRANSFER` in hi**
- **Found during:** Task 1 (running the freeze CLI over the real freeze directory)
- **Issue:** `content/pages/hi/book/multi-day.json` left `dayTypeLabels.TRANSFER` as English `"TRANSFER"` while `HOURLY` was correctly translated and every other locale (ru/es/fr/ar/zh) translated `TRANSFER` too — the freeze tool correctly refused to freeze it as "translated."
- **Fix:** Changed to `"ट्रांसफर"`, matching the transliteration convention already used for "transfer" elsewhere in the hi corpus (`book.json`, `services/group-transfers.json`).
- **Files modified:** `content/pages/hi/book/multi-day.json`
- **Verification:** `node scripts/i18n-freeze-manifest.mjs` now freezes the unit without violation; `tests/content-locale-parity.test.ts` unaffected (value stayed a string).
- **Committed in:** `b3d51516` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Extended the freeze tool's identical-value exception**
- **Found during:** Task 1 (dry-run over the real freeze directory surfaced 54 violations, mostly false positives)
- **Issue:** The plan's literal "DNT-only" exception (glossary brand/vehicleClasses) is too narrow — real content legitimately has identical values across EN and a locale for place names with no distinct exonym (e.g. "Austria" in Spanish, many Czech/German town names) and cross-language cognates (French "Service"/"Message"/"Distance"), which would otherwise block freezing entire content files.
- **Fix:** Extended the exception to also recognize `scripts/qa/en_leak_allowlist.json`'s `dnt`/`placeNames`/`tierNames` entries (the same registry the D-06 leak scanners already maintain for this exact class of value) and purely-numeric strings (e.g. "404"). Added 4 new allowlist entries (`Prague → {city}`, `Service`, `Message`, `Distance`) with reasons for the cases not already covered.
- **Files modified:** `scripts/i18n-freeze-manifest.mjs`, `scripts/qa/en_leak_allowlist.json`
- **Verification:** Real-repo dry run went from 54 violations to 0; `tests/i18n-freeze-manifest.test.ts` covers both the numeric and allowlist exception paths with fixture cases.
- **Committed in:** `b3d51516` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed 2 genuine EN leaks found by Task 3's own gate run**
- **Found during:** Task 3 (running `node scripts/qa/en_leak_static.mjs` as part of the pre-deploy gate)
- **Issue:** `app/[locale]/contact/page.tsx`'s hero `<Image alt="Contact PRESTIGO — Premium Chauffeur Prague">` was hardcoded English (R2) — never localized. `components/Footer.tsx` + the same contact page hardcode the `chelautotrans s.r.o.` legal entity's physical address (R1) — legitimately never-translated content that the scanner correctly flagged as unrecognized.
- **Fix:** Externalized the hero alt to `content.hero.imageAlt`, hand-translated into all 6 locales, wired the component, and froze the new unit via `freeze/75-18.freeze`. Added the postal address to `en_leak_allowlist.json`'s `dnt` category (a street address is never translated, for correct mail delivery — same treatment as the legal entity name itself).
- **Files modified:** `app/[locale]/contact/page.tsx`, `content/pages/{en,ru,es,fr,ar,hi,zh}/contact.json`, `i18n/translation-manifest.json`, `.planning/phases/75-e2e-verification-launch/freeze/75-18.freeze`, `scripts/qa/en_leak_allowlist.json`
- **Verification:** `node scripts/qa/en_leak_static.mjs` post-fix shows 0 non-admin actionable findings; `node scripts/i18n-freeze-manifest.mjs --verify` reports 355 units PASSED; `tests/content-locale-parity.test.ts` still 313/313.
- **Committed in:** `a23ab1b3` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 bug-cluster found by the plan's own gate)
**Impact on plan:** All auto-fixes were necessary for correctness (a real untranslated stub, a real hardcoded EN leak) or to make the freeze tool usable against real content without inventing scope creep (the allowlist-reuse extension). No architectural changes; no scope creep beyond what the plan's own `<action>` text explicitly anticipated ("fixed... or, if intentional, allowlisted with an explicit reason").

## Issues Encountered

- **Pre-existing, out-of-scope `tsc --noEmit` failures** (not introduced by this plan, files never touched by this plan): `tests/i18n-translate-dnt.test.ts` (2 errors), `tests/nav-auth.test.tsx` (5 errors), `tests/passenger-actions.test.ts` (1 error). Identical to the set independently documented in `75-10-SUMMARY.md`/`75-11-SUMMARY.md`. Zero `tsc` errors in any file this plan modified.
- **Pre-existing, out-of-scope `npm run lint` failures** (not introduced by this plan): 42 errors + 18 warnings across ~22 files, almost entirely `@next/next/no-html-link-for-pages` in route/component files plus a few `no-explicit-any`/`ban-ts-comment` in unrelated test files. Zero lint issues in any file this plan modified.
- **Pre-existing, out-of-scope `en_leak_static.mjs` findings** (149, `components/admin/**`): matches the already-recorded UNOWNED bucket in `75-EN-LEAK-AUDIT.md` — admin panel is explicitly out of i18n scope per STATE.md. Not fixed; the scanner was not modified. Zero actionable non-admin findings remain.
- **Pre-existing, worktree-environment-only `vitest run` failures** (5 suites: `account-trips`, `auth-customer`, `login-actions`, `passenger-actions`, `profile-actions`): all fail at import time on a relative `node_modules` path that only resolves in the main checkout, not this worktree's symlinked stub. Identical to the issue documented in `75-10-SUMMARY.md`/`75-11-SUMMARY.md`. All other 2639 tests pass. Does not reproduce after merge to `main`.
- **`npx next build` fails only on missing local Supabase env vars** during static prerendering (compiles + typechecks clean) — `.env.local` is sandbox-denied to this executor. Recorded as environment-limited per this plan's own instruction.

Full detail, exit codes, and per-command output for all of the above: see `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The translation manifest is frozen for every Phase-75 hand-translated unit (355 units, `--verify` PASSED) — a future `i18n-translate.mjs` run will neither overwrite nor re-spend tokens on this phase's work.
- The Metricool client is draft-capable and cannot publish an announcement live by default-path accident — ready for plan 75-21's announcement task (which additionally goes through a blocking checkpoint per the threat register).
- Content/locale structural parity is proven across all 22 `content/pages/en` + 30 `content/routes/en` sources.
- The pre-deploy gate is fully recorded in `75-QA-RESULTS.md`. **Judgment call for the phase verifier / plan 75-19 to confirm before shipping:** the documented pre-existing/out-of-scope classifications (tsc, lint, admin-panel leak bucket) and the worktree-only vitest artifact are, in this executor's assessment, non-blocking — but this SUMMARY flags them explicitly (coverage `D4`, `human_judgment: true`) rather than silently asserting a clean gate.
- No blockers for plan 75-19 (deploy).

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-26*

## Self-Check: PASSED

All created files verified on disk (`scripts/i18n-freeze-manifest.mjs`, `tests/i18n-freeze-manifest.test.ts`, `tests/content-locale-parity.test.ts`, `.planning/phases/75-e2e-verification-launch/freeze/75-18.freeze`, `.planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md`). All 4 task commits (`b3d51516`, `a94416e1`, `a23ab1b3`, `a7cba155`) found in `git log --oneline` on branch `worktree-agent-a2c2ef2845dd855b2`. Plan-level `<verification>` re-run: freeze tool tests + `--verify` green (355 units, PASSED); Metricool tests green (11/11 in `tests/content-metricool.test.ts`); full gate commands run and recorded in `75-QA-RESULTS.md` per the plan's own `<action>` instructions.
