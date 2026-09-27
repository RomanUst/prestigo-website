---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 11
subsystem: i18n
tags: [next-intl, ai-translation, accessibility, skip-link, ar, hi, zh, ru, es, fr]

requires:
  - phase: 73-08
    provides: interpolateBidi()/bdi price-token isolation pattern (unrelated file, same phase)
  - phase: 72-02
    provides: AI translation pipeline (scripts/i18n-translate.mjs, hash-manifest idempotency)
provides:
  - Common.skipToContent message key across all 7 catalogs (en/ar/hi/zh/ru/es/fr)
  - SiteChrome.tsx skip-to-content link localized via getTranslations
affects: [gsd-code-review, gsd-ship, future SiteChrome.tsx edits, i18n glossary/pipeline follow-ups]

actuals:
  tokens: 12200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "getTranslations('Common') pattern for shared/global chrome strings that don't belong to a single component namespace"

key-files:
  created: []
  modified:
    - messages/en.json
    - messages/ar.json
    - messages/hi.json
    - messages/zh.json
    - messages/ru.json
    - messages/es.json
    - messages/fr.json
    - components/SiteChrome.tsx
    - content/routes/ru/prague-ceske-budejovice.json
    - content/routes/ru/prague-frantiskovy-lazne.json
    - content/routes/zh/prague-ceske-budejovice.json

key-decisions:
  - "New shared 'Common' top-level namespace introduced for SiteChrome-level accessibility strings, distinct from per-component namespaces (Nav, Footer, etc.) — precedent for future cross-component chrome strings."
  - "Kept 2 incidental ru/zh route-translation resyncs the AI pipeline made as an unavoidable side effect of walking the full EN source tree (Rule 1 auto-fix), rather than reverting them, since they fix real pre-existing EN/translation drift with no downside."
  - "Did not attempt to fix or retry translation for 6 route files + corporate.json that failed with an Anthropic 'credit balance too low' error — out of scope (unrelated files) and blocked on account billing, which only the owner can resolve. Logged to deferred-items.md and WINDOWS.md #8."

patterns-established:
  - "getTranslations('Common') for global/shared UI strings not owned by a single component's namespace"

requirements-completed: [RTL-01, TR-02]

coverage:
  - id: D1
    description: "Common.skipToContent message key added to messages/en.json and translated (AI pipeline) into ar/hi/zh/ru/es/fr, with all pre-existing keys byte-unchanged"
    requirement: "TR-02"
    verification:
      - kind: unit
        ref: "node scripts/i18n-translate.mjs --check --locales ar,hi,zh,ru,es,fr"
        status: pass
      - kind: other
        ref: "node -e checking Common.skipToContent presence in all 7 messages/*.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "SiteChrome.tsx skip-to-content link renders the active locale's translated label instead of a hardcoded English literal (WR-04)"
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "grep -q getTranslations / t('skipToContent') in components/SiteChrome.tsx; grep -c 'Skip to content' == 0"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (SiteChrome.tsx clean)"
        status: pass
      - kind: e2e
        ref: "tests/nav-locale-render-parity.test.tsx, tests/route-page-render.test.tsx (byte-parity gate, D-12)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 11: Skip-Link i18n Gap Closure (WR-04) Summary

**Externalized SiteChrome's hardcoded English "Skip to content" accessibility link into a new `Common.skipToContent` message key, AI-translated into all 6 non-English locales, closing the one piece of chrome that never got the i18n treatment.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-19T21:56Z (approx, from prior STATE.md session timestamp)
- **Completed:** 2026-09-19T22:17:23+02:00
- **Tasks:** 3
- **Files modified:** 11 (8 declared in plan + 3 incidental pipeline-driven resyncs)

## Accomplishments

- `messages/en.json` gained a new top-level `Common` namespace with `skipToContent` set to the exact string previously hardcoded in `SiteChrome.tsx` ("Skip to content").
- Ran the AI translation pipeline (`scripts/i18n-translate.mjs`) for ar/hi/zh/ru/es/fr — all 6 catalogs picked up the new key with a real, per-locale AI translation (e.g. AR: "تخطَّ إلى المحتوى", HI: "सामग्री पर जाएँ", ZH: "跳转到主要内容"); `--check` reports 0 missing keys across all 6 locales.
- `components/SiteChrome.tsx` now imports `getTranslations` from `next-intl/server`, resolves `t = await getTranslations('Common')`, and renders `{t('skipToContent')}` instead of the literal — so `/ar`, `/hi`, `/zh`, `/ru`, `/es`, `/fr` all render the accessibility skip-link in the active locale. `/admin` and `/driver` (which share this same `SiteChrome` and always resolve `getLocale()` to `en`) are unaffected — they still render the English label, correctly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a Common.skipToContent source key to messages/en.json** - `04b550b` (feat)
2. **Task 2: Translate the new key into ar/hi/zh/ru/es/fr via the AI pipeline (TR-02)** - `dd1076c` (feat)
   - Incidental fix (Rule 1, same pipeline run): `04cb622` (fix)
3. **Task 3: Route the SiteChrome skip-link through the Common namespace (WR-04)** - `d776e89` (feat)

_No plan-metadata commit yet — this file + STATE.md/ROADMAP.md/REQUIREMENTS.md updates follow in the final commit._

## Files Created/Modified

- `messages/en.json` — new `Common.skipToContent` source key
- `messages/ar.json`, `messages/hi.json`, `messages/zh.json`, `messages/ru.json`, `messages/es.json`, `messages/fr.json` — `Common.skipToContent` AI-translated per locale
- `components/SiteChrome.tsx` — `getTranslations('Common')` import + `t('skipToContent')` replacing the hardcoded skip-link label
- `i18n/translation-manifest.json` — new manifest entry for `messages/en.json::Common.skipToContent`
- `i18n/QA-REPORT.md` — regenerated (pipeline artifact)
- `content/routes/ru/prague-ceske-budejovice.json`, `content/routes/ru/prague-frantiskovy-lazne.json`, `content/routes/zh/prague-ceske-budejovice.json` — incidental resync of a pre-existing stale `whyBook.headingLine1` translation (see Deviations)

## Decisions Made

- Introduced a shared `Common` top-level namespace (sibling to `Booking`, `Nav`, `Hero`, etc.) for SiteChrome-level accessibility strings that don't belong to any single component's namespace — precedent for future cross-component chrome strings.
- Kept the 2 incidental ru/zh route-content resyncs the AI pipeline made as a side effect of walking the full EN source tree, instead of reverting them — see Deviations below.
- Did not retry or attempt to unblock the credit-exhausted translation attempts on 6 unrelated route files + `corporate.json` — that's an account-billing issue, not something an agent can resolve; logged for the owner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resynced 2 pre-existing stale ru/zh route translations discovered mid-pipeline-run**
- **Found during:** Task 2 (`node scripts/i18n-translate.mjs --locales ar,hi,zh,ru,es,fr`)
- **Issue:** The pipeline walks every EN source (catalogs + content JSON + blog), not just `messages/en.json`. It discovered `content/routes/en/prague-ceske-budejovice.json` and `content/routes/en/prague-frantiskovy-lazne.json`'s `whyBook.headingLine1` field had drifted out of hash-sync with their `ru`/`zh` translations (pre-existing, unrelated to WR-04) — the EN wording had changed since the last translation run but only some locales had been re-translated.
- **Fix:** The same AI pipeline call that translated `Common.skipToContent` also re-translated and DNT/verified these 2 units for `ru` and `zh` (both passed verification and were written). `hi`'s equivalent unit for these same 2 files failed DNT verification (dropped the "Prestigo" brand token) and correctly fell back to English — this matches the already-tracked, already-open WINDOWS #6 issue, not a new problem.
- **Files modified:** `content/routes/ru/prague-ceske-budejovice.json`, `content/routes/ru/prague-frantiskovy-lazne.json`, `content/routes/zh/prague-ceske-budejovice.json`
- **Verification:** `git diff` confirms only the single `whyBook.headingLine1` line changed per file; `content/routes/en/*.json` sources remain byte-unchanged.
- **Committed in:** `04cb622` (separate commit, clearly labeled as an out-of-scope discovery, distinct from the WR-04/TR-02 catalog work)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing content drift resynced as an unavoidable side effect of the mandated full-pipeline command)
**Impact on plan:** No scope creep in intent — these 3 files were not hand-edited or targeted; they were corrected by the same sanctioned AI pipeline call this plan's Task 2 already required, and reverting them would have reintroduced a known EN/translation mismatch for no benefit. Kept as a clearly separated commit for reviewability.

## Issues Encountered

- **Anthropic API credit exhaustion mid-run (not a bug in this plan's work, but blocking for an unrelated pre-existing gap):** while walking the full EN source tree during Task 2's mandated pipeline run, the pipeline attempted to translate 6 route files (`prague-marianske-lazne`, `prague-olomouc`, `prague-pardubice`, `prague-plzen`, `prague-wroclaw`, `prague-zlin`) and `content/pages/en/corporate.json` for all 6 target locales — these had pre-existing, unrelated stale/pending translation units. Every attempt failed with `400 "Your credit balance is too low to access the Anthropic API."` This is entirely out of this plan's declared scope (`files_modified` never listed these files) and is blocked on Anthropic account billing, which only the account owner can resolve.
  - **Verified safe:** the pipeline's cross-locale-success manifest invariant held correctly — no unit for these 7 files was marked "done" partially, no file was corrupted or partially written (`git status` confirms zero diff on all 7), and all EN sources remain byte-unchanged.
  - **Not fixed here:** per Scope Boundary (unrelated files) and because it cannot be fixed by an agent (billing). Logged to `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md` and `.planning/WINDOWS.md` entry #8 (open, kind: deviation).
  - **Recommended follow-up:** top up the Anthropic account's credit balance, then re-run `node scripts/i18n-translate.mjs` (full surface, no `--locales` filter) to complete these 7 files and re-verify nothing else has drifted.

## Known Stubs

None introduced by this plan. (Pre-existing hi DNT-fallback stub for `whyBook.headingLine1`/similar headings remains tracked at WINDOWS #6, unaffected by this plan's scope.)

## User Setup Required

None for this plan's actual deliverable (WR-04/TR-02 for `Common.skipToContent`) — the `ANTHROPIC_API_KEY` precondition was met from `.env.local` and the translation succeeded for all 6 requested locales.

**Follow-up action for the project owner (not blocking this plan, but blocking a separate pre-existing gap):** the Anthropic account ran out of credits partway through this run's full-surface walk. Top up billing at https://console.anthropic.com/settings/billing, then re-run `node scripts/i18n-translate.mjs` (no `--locales` filter) to translate the 6 route files + `corporate.json` that failed. See Issues Encountered above and WINDOWS #8.

## Next Phase Readiness

- WR-04 is closed: the skip-to-content accessibility link now renders in the active locale on every public locale (`/ar`, `/hi`, `/zh`, `/ru`, `/es`, `/fr`), while `/admin`/`/driver` chrome correctly stays English.
- TR-02 gains one more real, AI-translated, verified key across all 7 catalogs.
- Byte-parity non-regression gate (D-12) holds: `tests/nav-locale-render-parity.test.tsx` and `tests/route-page-render.test.tsx` both pass unchanged.
- Blocker for a separate, pre-existing (not this-plan-caused) gap: Anthropic billing needs a top-up before the 6 route files + `corporate.json` translation debt can be cleared (WINDOWS #8, deferred-items.md).

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- All 8 declared `files_modified` paths confirmed present on disk.
- All 4 commit hashes (04b550b, dd1076c, 04cb622, d776e89) confirmed present in `git log --oneline --all`.
