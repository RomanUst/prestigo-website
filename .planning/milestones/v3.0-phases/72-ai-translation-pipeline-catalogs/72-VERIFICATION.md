---
phase: 72-ai-translation-pipeline-catalogs
verified: 2026-09-17T07:55:41Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "SC#4 (/ru/, /es/, /fr/ subpaths render fully translated chrome with no English leakage) — the 10 array/object-typed catalog leaves (Nav.items, Hero.words, Footer.services/routes/blog, FeatureStrip.pillars, Services.cards, Fleet.vehicles, HowItWorks.steps, Booking.tripTypeTabs.items) are now real arrays/objects in messages/{ru,es,fr}.json, matching messages/en.json's shape — the previously-reproduced `pillars.map is not a function` crash no longer reproduces"
    - "SC#3 value-type completeness (previously 'key-set only') — messages/{ru,es,fr}.json now pass both key-set AND value-type parity vs messages/en.json"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification: []
---

# Phase 72: AI Translation Pipeline & Catalogs Verification Report

**Phase Goal:** A re-runnable, AI-only translation pipeline (`scripts/i18n-translate.mjs`) exists that translates the English source into target locales, governed by a locked brand glossary/DNT list with idempotent re-runs; using it, complete `ru`, `es`, `fr` catalogs and localized content are generated and rendered under their subpaths, followed by a QA sampling pass. AR/HI/ZH generation is deferred to Phase 73.

**Verified:** 2026-09-17T07:55:41Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commits abf31fe, 99f8612)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC / plan must_have) | Status | Evidence |
|---|---|---|---|
| 1 | SC#1: `scripts/i18n-translate.mjs` is a re-runnable pipeline; re-running against an unchanged EN source is idempotent; only added/changed keys re-translate | ✓ VERIFIED | `node scripts/i18n-translate.mjs --check` exits 0 with "no API calls made"; `tests/i18n-translate-manifest.test.ts` passing (regression check — unchanged from prior verification) |
| 2 | SC#2: Pipeline enforces a locked brand glossary + DNT list (prices/numbers, Prestigo, E/S/V-Class, proper nouns) with locale-appropriate tone | ✓ VERIFIED | `i18n/glossary.json` present with `doNotTranslate`/`placeNames`/per-locale tone data; `verifyDntPreserved`/`verifyPluralCategories` wired; unchanged from prior verification (regression check) |
| 3 | SC#3: Complete `messages/{ru,es,fr}.json` exist with every EN key present (0 missing/0 extra) AND matching value types; corresponding route/page/blog content generated | ✓ VERIFIED (full — key-set AND value-type) | Direct check: ru/es/fr each have exactly 509 leaf keys matching `messages/en.json`, 0 missing/0 extra (regression-confirmed); **NEW: all 10 previously-corrupted array/object leaves now match EN's container type in all 3 locales (10/10 fixed × 3 locales = 30/30 checked, 0 mismatches)**; `content/routes/{ru,es,fr}` = 30 files each, `content/pages/{ru,es,fr}` = 17 files each, `content/blog/{ru,es,fr}` = 11 files each — unchanged, still matching EN counts |
| 4 | SC#4: `/ru/`, `/es/`, `/fr/` subpaths render fully translated chrome and content with no English leakage; EN root byte-for-byte unchanged; QA sampling pass recorded; ar/hi/zh continue rendering English | ✓ VERIFIED | **Gap closed.** Re-reproduced the prior crash case directly against the committed `messages/ru.json`: `ru.FeatureStrip.pillars.map(x=>x)` now succeeds (returns 4 `{title,sub}` objects) instead of throwing `TypeError`. `Nav.items` is a real 6-element array of translated strings (`Услуги`, `Автопарк`, ...). All 10 keys confirmed arrays/objects across ru/es/fr. `git diff --exit-code -- messages/en.json content/routes/en content/pages/en content/blog/en` is clean (EN unchanged — held in prior verification too). ar/hi/zh confirmed still byte-identical to EN (`ar.Nav` deepEqual `en.Nav` = true, same for hi/zh) — untouched, per Phase 73 scope |
| 5 | Plan 72-01 must_have: idempotent re-run, hash-manifest select/skip, empty-unit handling, UTF-8/NFC, key-order preservation, distinct-unitKey tracking, fail-loud glossary validation | ✓ VERIFIED | `tests/i18n-translate-manifest.test.ts` passing (regression check, unchanged) |
| 6 | Plan 72-02 must_have: DNT/ICU/rich-tag/RU-plural post-hoc verification is fail-closed | ✓ VERIFIED | `tests/i18n-translate-dnt.test.ts` passing (regression check, unchanged) |
| 7 | Plan 72-03/72-04 must_have: MDX-aware blog translation, QA-report generator, CI workflow, stale comment fixed | ✓ VERIFIED | `tests/i18n-translate-mdx.test.ts` + `tests/i18n-completeness.test.ts` passing (regression check, unchanged); `.github/workflows/i18n-translate.yml` unchanged from prior verification |

**Score:** 7/7 verified. Net: **passed**.

### Fix Verification Detail (Gap #1 closure)

Direct reproduction of the fix against the real, committed `messages/ru.json`, `es.json`, `fr.json`:

```
$ node -e "const ru=require('./messages/ru.json'); console.log(Array.isArray(ru.FeatureStrip.pillars)); ru.FeatureStrip.pillars.map(x=>x)"
true
[ { title: '...', sub: '...' }, ... 4 objects, no crash ]

$ node -e "const ru=require('./messages/ru.json'); console.log(Array.isArray(ru.Nav.items), ru.Nav.items)"
true [ 'Услуги', 'Автопарк', 'Маршруты', 'Многодневные поездки', 'Для компаний', 'Контакты' ]
```

All 10 previously-affected leaves (`Nav.items`, `Hero.words`, `Footer.services/routes/blog`, `FeatureStrip.pillars`, `Services.cards`, `Fleet.vehicles`, `HowItWorks.steps`, `Booking.tripTypeTabs.items`) checked programmatically across ru/es/fr (30 checks total): 0 mismatches.

**Root cause fix confirmed in source:**
- `scripts/lib/i18n-surfaces.mjs:147` — `coerceToSourceType(enValue, translatedValue)`: for a non-string EN leaf, `JSON.parse()`s the model's stringified response back to its original container type; on parse failure or shape mismatch, returns the raw string unchanged (fail-closed — leaves it for the structural verifier to flag rather than silently shipping malformed data).
- `scripts/lib/i18n-surfaces.mjs:133` — `batchShortStrings()` applies `coerceToSourceType()` to every unit's translated value before writing to the output map.
- `scripts/lib/i18n-qa-report.mjs:65` — `checkValueTypeParity(enObj, localeObj)`: new defense-in-depth check, diffs value TYPE (not just key presence) between EN and each locale catalog.
- `scripts/i18n-translate.mjs:707` — `--check` mode now calls `checkValueTypeParity()` per locale and fails the gate on any mismatch (previously only checked key-set completeness).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `i18n/glossary.json` | DNT + per-locale tone/term data | ✓ VERIFIED | unchanged (regression check) |
| `scripts/lib/i18n-manifest.mjs` | sha256/flatten/select/load/write | ✓ VERIFIED | unchanged (regression check) |
| `scripts/i18n-translate.mjs` | CLI entry, full pipeline, `--check` (now with value-type parity gate) | ✓ VERIFIED | `--check` exits 0; `checkValueTypeParity` wired at line 707 |
| `scripts/lib/i18n-surfaces.mjs` | EN-source walkers + batching, type-preserving round-trip | ✓ VERIFIED (fixed) | `coerceToSourceType()` added and applied in `batchShortStrings()`; root cause of Gap #1 resolved |
| `scripts/lib/i18n-qa-report.mjs` | completeness/no-leakage/value-type-parity/QA report | ✓ VERIFIED (extended) | `checkValueTypeParity()` added; wired into `--check` |
| `messages/{ru,es,fr}.json` | complete, correctly-typed catalogs | ✓ VERIFIED | key-complete (509/509, 0 missing/0 extra) AND type-complete (10/10 array leaves correctly typed × 3 locales) |
| `tests/i18n-catalog-array-types.test.ts` | regression test for array-typed catalog leaf round-trip | ✓ VERIFIED | present, 9/9 tests passing |
| `content/{routes,pages,blog}/{ru,es,fr}/**` | complete, structurally sound | ✓ VERIFIED | unchanged (regression check) — file counts match EN exactly |
| `.github/workflows/i18n-translate.yml` | path-filtered + manual CI, PR-only | ✓ VERIFIED | unchanged (regression check) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/lib/i18n-surfaces.mjs` `batchShortStrings()` | `coerceToSourceType()` | direct call per unit before writing to output map | ✓ WIRED | confirmed in source, line 133 |
| `scripts/i18n-translate.mjs` `--check` | `scripts/lib/i18n-qa-report.mjs` `checkValueTypeParity()` | called per locale, failures pushed to gate | ✓ WIRED | confirmed in source, line 707; exercised live (exit 0, no mismatches) |
| `scripts/i18n-translate.mjs` (batch path) | `scripts/lib/i18n-verify.mjs` | post-hoc DNT/plural verification | ✓ WIRED | unchanged (regression check) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `components/FeatureStrip.tsx` | `pillars` | `t.raw('pillars')` ← `messages/{locale}.json` `FeatureStrip.pillars` | Real array of 4 `{title,sub}` objects | ✓ FLOWING (fixed — was DISCONNECTED) |
| `components/Nav.tsx` | `navItems` | `t.raw('items')` ← `Nav.items` | Real 6-element array of translated strings | ✓ FLOWING (fixed — was DISCONNECTED) |
| Other affected components (`Fleet.tsx`, `Footer.tsx`, `Services.tsx`, `HeroTypewriter.tsx`, `HowItWorks.tsx`, `booking/TripTypeTabs.tsx`) | catalog arrays via `t.raw(...)` | same `messages/{locale}.json` array leaves | Real, correctly-typed arrays (verified programmatically for all 10 keys) | ✓ FLOWING (fixed) |
| Route/page prose | body text | `translateWholeFile()` round-trip | Real, correctly-typed translated prose | ✓ FLOWING (unchanged) |
| Blog MDX body/frontmatter | body/title/description | `translateMdxFile()` round-trip | Real, correctly-typed translated MDX | ✓ FLOWING (unchanged) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| `--check` completeness + value-type gate | `node scripts/i18n-translate.mjs --check` | "PASSED — [ru, es, fr] complete vs messages/en.json, EN unchanged, no API calls made" | ✓ PASS |
| Array-leaf type parity in `messages/*.json` | inline Node script checking `Array.isArray()`/type on all 10 EN array paths × 3 locales | 30/30 correctly typed, 0 mismatches | ✓ PASS (was 10/10 broken — now fixed) |
| Key-set parity (direct) | inline Node script diffing flattened leaf keys | ru/es/fr: 509/509, 0 missing, 0 extra | ✓ PASS |
| FeatureStrip render reproduction | `ru.FeatureStrip.pillars.map(x=>x)` against real `messages/ru.json` | Returns 4 objects, no error | ✓ PASS (was crashing — now fixed) |
| Nav.items render reproduction | `ru.Nav.items` inspected directly | Real 6-element translated string array | ✓ PASS |
| File-count parity | `find content/{routes,pages,blog}/{ru,es,fr} -type f \| wc -l` | 30/30, 17/17, 11/11 per locale | ✓ PASS (unchanged) |
| EN sources unchanged | `git diff --exit-code -- messages/en.json content/routes/en content/pages/en content/blog/en` | clean, exit 0 | ✓ PASS |
| ar/hi/zh untouched (Phase 73 scope) | deep-equal `ar.Nav`/`hi.Nav`/`zh.Nav` vs `en.Nav` | true for all three | ✓ PASS |
| Regression test (new) | `npx vitest run tests/i18n-catalog-array-types.test.ts` | 1 file, 9 tests, all passing | ✓ PASS |
| Full workspace test suite (run once) | `npx vitest run` | 123 files passed, 4 skipped; 1438 tests passed, 10 skipped, 139 todo, 0 failing | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| TR-01 | 72-01 through 72-04 | Re-runnable AI translation pipeline, locked glossary/DNT, idempotent | ✓ SATISFIED | pipeline exists, idempotent, glossary-governed, CI-wired, now also gates on value-type parity |
| TR-02 | 72-01 through 72-05 (ru/es/fr scope); 73 (ar/hi/zh) | Complete translations for ru/es/fr/ar/hi/zh across every catalog and content file | ✓ SATISFIED for ru/es/fr | ru/es/fr `messages/*.json` are key-complete AND value-type-complete; content-JSON+blog are complete and correctly typed; rendered chrome confirmed non-crashing and correctly populated. ar/hi/zh remain explicitly deferred to Phase 73 (not this phase's scope) |

No orphaned requirements — REQUIREMENTS.md maps only TR-01/TR-02 to Phase 72 (TR-02 also maps to 73 for ar/hi/zh), matching all 5 plans' `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned the two gap-closure commits (abf31fe, 99f8612) for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers across all changed files — no matches.

### Human Verification Required

None. Both the original defect and its fix are deterministically reproducible via direct inspection of the committed `messages/{ru,es,fr}.json` and the consuming component source; no visual/runtime judgment call is needed to confirm resolution.

### Deviations Noted (not gaps)

Per the phase brief: the first live translation run (72-05) was executed locally (not via the CI workflow) and committed directly to `milestone/v3.0-i18n`, with production merge to `main` intentionally deferred by the project owner. This is an accepted, documented deviation, not a gap — TR-02's deliverable (the generated ru/es/fr catalogs and content) is present and correct on this branch, which is what this verification checks.

### Gaps Summary

No gaps. The single blocker from the prior verification (10 array/object-typed catalog leaves corrupted into JSON-stringified strings by the batch-translation path, breaking `.map()`/indexing in 8 components across ru/es/fr) has been fixed at the root cause (`coerceToSourceType()` type round-trip in `scripts/lib/i18n-surfaces.mjs`), the data has been repaired in place (no re-translation needed — translations were intact inside the strings), defense-in-depth has been added (`checkValueTypeParity()` wired into the `--check` gate), and a regression test now covers this class of bug. Full workspace test suite is green (1438/1438 passing, 0 failing). Phase 72 goal is achieved: the pipeline is sound, idempotent, glossary-governed, and produces complete, correctly-typed, rendering-safe `ru`/`es`/`fr` catalogs and content, with `ar`/`hi`/`zh` correctly left untouched for Phase 73.

---

*Verified: 2026-09-17T07:55:41Z*
*Verifier: Claude (gsd-verifier)*
