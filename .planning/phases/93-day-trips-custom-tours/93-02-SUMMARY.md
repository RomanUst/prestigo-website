---
phase: 93-day-trips-custom-tours
plan: 02
subsystem: i18n
tags: [next-intl, i18n, tours, copy, icu-plural]
requires: []
provides:
  - "Tours.* and TourEmails.ack.* copy (172 keys) in all 8 locale catalogs"
  - "tests/tours-copy-i18n.test.ts guard (parity, ICU args, plural categories, no price / scarcity / rating / ride-hailing)"
affects: [93-11, 93-12, 93-13, 93-14, 93-15, 93-18, 93-19, 93-32, 93-34]
tech-stack:
  added: []
  patterns:
    - "Catalog namespaces appended by text insertion (existing bytes untouched); zh-hant generated from zh"
    - "Hours and people as ICU plural; every plural head spells out the full CLDR category set of the locale"
key-files:
  created:
    - tests/tours-copy-i18n.test.ts
  modified:
    - messages/en.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - messages/zh-hant.json
key-decisions:
  - "Key tree follows the plan interfaces block exactly; keys the block only named (for example Tours.box.carUpTo, Tours.checkout.errEmail) got their wording from the UI-SPEC Copywriting Contract"
  - "Counts that read as people or passengers (paxMore, onlyFit, carUpTo, upTo, checkout.extra) are ICU plurals so ru and ar get correct grammar"
  - "Where Arabic would need gender agreement with hours (included, extra), the copy is phrased as 'Included: N hours' so no adjective has to agree"
  - "Tours.hub.emptyBody has no CTA key of its own; its button reuses Tours.custom.cta"
duration: "about 25 min"
completed: 2026-11-18
status: complete
commits: 3
plan_head_before: 22c3ca2ff23902275bffa2d2dd82de7829a07e34
plan_head_after: e74d4a1a50b729506924051fa4d524e5a9924191
actuals:
  tokens: 30900
  tasks: 3
  commits: 3
---

# Phase 93 Plan 02: Tours copy in 8 locales Summary

Full client-facing copy of the day-trip and custom-tour surfaces (`Tours.*`, `TourEmails.ack.*`) in en, ru, es, fr, ar, hi, zh and zh-hant, guarded by a test that rejects missing keys, changed ICU arguments, missing plural categories, typed amounts, scarcity claims, ratings and ride-hailing mentions.

## What was built

- **Task 1 (tracer)** - EN source (172 keys under 12 namespaces) and ru, plus `tests/tours-copy-i18n.test.ts` with a `PENDING` locale set. Commit `da0e75ae`.
- **Task 2** - es (usted) and fr (vous), `PENDING` reduced. Commit `48622ae1`.
- **Task 3** - ar (zero/one/two/few/many/other), hi (one/other), zh (other), zh-hant generated with `node scripts/zh-hant-sync.mjs`; `PENDING` is now `new Set([]) as Set<string>`. Commit `e74d4a1a`.

Namespaces: `Tours.page`, `facts`, `sections`, `gallery`, `box`, `custom`, `hub`, `checkout`, `confirmation`, `request`, `manage` and `TourEmails.ack`. Key names are the contract of the later UI plans and were not renamed.

## Test coverage (tests/tours-copy-i18n.test.ts)

- exact key set for every locale; ICU argument names and `<link>` tags identical to EN per key
- every plural head carries `other` plus all CLDR categories of the locale (ru one/few/many/other, ar all six; es and fr need no `many`)
- real translation (no `[XX]` stub, differs from EN, cognates listed explicitly), no Latin words except Prestigo and WhatsApp in ru/ar/hi/zh/zh-hant, Latin digits only in ar/hi/zh/zh-hant
- script check on `Tours.box.cta`, `Tours.page.eyebrow`, `TourEmails.ack.subject` (Cyrillic, Arabic, Devanagari, CJK)
- every key formats through `createTranslator(...).rich` with sample values, no leftover brace
- EN: no price, currency sign, scarcity claim, rating/review string (D-14), ride-hailing name; D-12 cancellation keys carry `hours` as a plural argument; no Phase 88/89 key copied
- zh-hant equals the OpenCC `cn -> twp` conversion of zh

## Verification

`npx vitest run --exclude '.claude/**' tests/tours-copy-i18n.test.ts tests/i18n-completeness.test.ts tests/i18n-catalog-array-types.test.ts` - 99 passed. Also green: `i18n-freeze-manifest`, `quote-copy-i18n`, `payments-copy-i18n`, `i18n-translate-manifest`. `npx tsc --noEmit` shows no new errors (baseline errors only); `npx eslint --quiet` on the new test is clean. `git diff --stat -- content/` is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zh-hant-sync generated untracked content files**
- **Found during:** Task 3
- **Issue:** `node scripts/zh-hant-sync.mjs` also converts `content/{blog,pages,routes}/zh`; it produced three new untracked files (`content/blog/zh-hant/bohemian-crystal-day-trip.mdx`, `prague-airport-to-karlovy-vary-spa-transfer.mdx`, `prague-airport-transfer-christmas-new-year.mdx`) whose zh sources have no committed zh-hant counterpart. Tracked content files were byte-identical (no diff).
- **Fix:** deleted those three generated files by name (out of scope for this plan; the prebuild script regenerates them). Not committed.
- **Files modified:** none committed

**2. [Rule 1 - Bug] Test helper regex missed ICU plural heads**
- The `params` helper copied from `quote-copy-i18n.test.ts` only matched `{name}`; the tour copy uses `{hours, plural, ...}`. The new helper reads argument names from plain, plural and select heads plus `<tag>` names, and a brace-aware parser checks plural categories.

### Notes

- Catalogs are edited by text insertion before the closing brace (a JSON round-trip would reformat many existing inline arrays/objects); messages/en..zh diffs are pure additions.
- `PENDING` is the literal `new Set([]) as Set<string>` (matches the acceptance grep).
- Actuals tokens is bytes/4 over added lines (upper bound for the non-Latin catalogs).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema change; strings render as React text or next-intl rich text only.

## Self-Check: PASSED

- Files: tests/tours-copy-i18n.test.ts and messages/{en,ru,es,fr,ar,hi,zh,zh-hant}.json present, each with `Tours` and `TourEmails`
- Commits da0e75ae, 48622ae1, e74d4a1a exist on worktree-agent-afdf8820fee32c268
