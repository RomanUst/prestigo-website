---
phase: 75-e2e-verification-launch
plan: 29
subsystem: i18n
tags: [i18n, qa, en-leak, hi, ru, allowlist, freeze, gap-closure]
status: complete

requires:
  - phase: 75-e2e-verification-launch
    provides: "75-26 residual ledger (fix:75-29 rows: hi 55, ru 12), properNouns/inlineTerms with locale scoping, en_leak_catalog.py; 75-28 shared-surface fixes"
provides:
  - "User decision keep-per-glossary recorded: hi keeps Latin travel/tech loanwords per the Phase 72 hi toneGuide"
  - "hi-scoped inlineTerms/properNouns allowlist entries with reasons"
  - "Rewritten hi/ru leaves (only untranslated words/phrases), frozen in freeze/75-29.freeze"
  - "All 67 fix:75-29 ledger rows annotated (26 fixed, 41 classified)"
affects: [75-30]

actuals:
  tokens: 36500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Locale-scoped loanword policy: kept words go into hi-scoped inlineTerms, never unscoped. Over-masking guards prove they are still flagged in ru/zh."
    - "Freeze only this plan's units: run the freeze tool with --dir pointing at a temporary folder that holds only 75-29.freeze, so no other manifest timestamps change"

key-files:
  created:
    - .planning/phases/75-e2e-verification-launch/freeze/75-29.freeze
    - .planning/phases/75-e2e-verification-launch/75-29-SUMMARY.md
  modified:
    - scripts/qa/en_leak_allowlist.json
    - scripts/qa/test_en_leak_rendered.py
    - content/pages/hi/book.json
    - content/pages/hi/services/city-rides.json
    - content/pages/hi/services/concierge.json
    - content/routes/hi/prague-vienna.json
    - messages/hi.json
    - content/pages/ru/services/airport-transfer.json
    - content/pages/ru/corporate.json
    - i18n/translation-manifest.json
    - .planning/phases/75-e2e-verification-launch/75-EN-LEAK-RESIDUAL.md

key-decisions:
  - "Task 1 decision (user, 2026-09-27): keep-per-glossary. hi keeps Latin travel/tech loanwords per the i18n/glossary.json locales.hi.toneGuide."
  - "The kept set is the set presented in the decision plus case variants: airport, Airport, flight, terminal, Terminal, Arrivals, arrivals, pickup, drop-off, driver, chauffeur, door-to-door, Door-to-door, vignette, checkout, live. All other English words were rewritten in Hindi."
  - "Fully English phrases were rewritten as whole Hindi phrases (Airport transfers / Airport Transfer -> एयरपोर्ट ट्रांसफ़र). Mixed strings got minimal edits: only the non-kept words changed, kept loanwords were left as they were."
  - "The 75-26 guard 'airport pickup inside Hindi still leaks' was replaced to match the decision. Kept loanwords are masked only for hi; ru/zh still leak. Genuine English inside Hindi (air-traffic-control, last-minute, full English sentences, Flight tracking) is still flagged."
  - "prague-vienna and messages/hi.json were edited, so every catalog row in those files was cleared: Viennese proper nouns and CookieBanner brand names were added as hi-scoped entries, and untranslated words were rewritten. This meets the 0-rows-per-edited-file acceptance."
  - "messages/ru.json, content/pages/ru/book.json, content/pages/hi/home.json and content/pages/hi/book/multi-day.json were not edited. They had no fix:75-29 rows, and ru CookieBanner brand names are left for the 75-30 catalog triage."

patterns-established:
  - "Ledger annotation: 'fixed in 75-29 (pending deploy)' when the leaf changed, listing any kept hi loanwords; 'classified (75-29)' when the leaf is unchanged and only kept loanwords remain"

requirements-completed: []

coverage:
  - id: D1
    description: "keep-per-glossary proven on /hi/book: ledger row -> catalog leaf -> freeze -> catalog scan 0 (tracer)"
    requirement: VER-01
    verification:
      - kind: other
        ref: "python3 scripts/qa/en_leak_catalog.py --locales hi --files content/pages/hi/book.json -> 0 findings"
        status: pass
      - kind: unit
        ref: "npx vitest run tests/content-locale-parity.test.ts (313 passed); node scripts/i18n-freeze-manifest.mjs --verify"
        status: pass
  - id: D2
    description: "All remaining fix:75-29 rows (hi + ru) resolved and annotated; edited files at 0 catalog rows"
    requirement: VER-01
    verification:
      - kind: other
        ref: "python3 scripts/qa/en_leak_catalog.py --locales hi,ru -> 0 rows for all 14 in-scope files"
        status: pass
      - kind: unit
        ref: "python3 -m unittest discover -s scripts/qa -p 'test_*.py' (30 tests incl. over-masking guards)"
        status: pass
      - kind: unit
        ref: "npx vitest run (full suite: 2743 passed; only the 5 known worktree-only next-intl import failures)"
        status: pass

duration: 22min
completed: 2026-09-27
---

# Phase 75 Plan 29: hi/ru in-content EN-leak closure (keep-per-glossary) Summary

**The hi policy is keep-per-glossary: Latin travel/tech loanwords stay in Latin and are covered by hi-scoped allowlist entries, each with a reason. Only genuinely untranslated English in hi was rewritten. The ru "Fast-track", "Prague Airport Transfer" and "reverse charge" wording is now Russian. All 67 `fix:75-29` ledger rows are resolved: 26 fixed and 41 classified.**

## Decision

**Option id: `keep-per-glossary`.** The user chose it on 2026-09-27; the orchestrator asked before dispatch. hi keeps Latin travel/tech loanwords as the Phase 72 hi toneGuide says ("common English tech/travel terms (airport, flight, terminal) stay as-is"). They are classified with hi-scoped allowlist entries, and only genuinely untranslated phrases are rewritten. ru was not part of the decision; it follows the ru toneGuide and is rewritten. The option id is also in the ledger header of `75-EN-LEAK-RESIDUAL.md` and in the header of `freeze/75-29.freeze`.

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-09-27
- **Tasks:** 3/3 (Task 1 resolved before dispatch)
- **Files modified:** 12 (+ SUMMARY)

## Accomplishments

- **Allowlist** (`scripts/qa/en_leak_allowlist.json`). Every new entry has `"locales": ["hi"]` and a reason:
  - **inlineTerms, loanwords the toneGuide keeps:** airport, Airport, flight, terminal, Terminal, Arrivals, arrivals, pickup, drop-off, driver, chauffeur, door-to-door, Door-to-door, vignette, checkout, live.
  - **inlineTerms, brand/product names in `messages/hi.json` CookieBanner:** Google Ads, Instagram, Facebook, Consent Mode.
  - **properNouns:** U-Bahn, Nordautobahn, Kunsthistorisches Museum, Wiener Staatsoper, Naschmarkt, MuseumsQuartier.
  - `classifiedResidual` stays `[]`.
- **Over-masking guards** (`scripts/qa/test_en_leak_rendered.py`):
  - `airport pickup …` is masked for hi but still leaks for ru and zh.
  - These are still flagged inside Hindi: `live air-traffic-control`, `last-minute`, a full English sentence, and `Flight tracking included`.
  - The LocaleScopedTokens, OverMasking and InlineTerms guards all still pass (30 tests).
- **hi rewrites.** 19 leaves changed, all in Hindi, reusing the dominant hi vocabulary (डिस्पैच, इनवॉइस, लैंडिंग, पासपोर्ट, इमिग्रेशन, कनेक्शन, वाहन क्लास, बूस्टर, टॉडलर, मीट एंड ग्रीट, ट्रांसफ़र):
  - `content/pages/hi/book.json`: 8 leaves (afterYouBook.intro, whyBookDirect.items[0].body, faq.items[0..5].a).
  - `content/pages/hi/services/city-rides.json` editorial[2]: departures → प्रस्थान हॉल.
  - `content/pages/hi/services/concierge.json`: editorial[2], pairsWell[0].title (`Airport Transfer` → `एयरपोर्ट ट्रांसफ़र`), faqs[5].a.
  - `content/routes/hi/prague-vienna.json`: onboard → वाहन में; shuttle / ride-hail → शटल / राइड-हेल; Vienna International Airport → वियना अंतरराष्ट्रीय एयरपोर्ट; Konditorei → पारंपरिक पेस्ट्री-कैफ़े (कॉन्डिटोराई).
  - `messages/hi.json`: Hero.priceAnchor (`Airport transfers` → `एयरपोर्ट ट्रांसफ़र`), Services.cards[0].body (`Flight ट्रैकिंग, meet & greet` → `फ़्लाइट ट्रैकिंग, मीट एंड ग्रीट`).
- **ru rewrites.** 8 leaves changed:
  - `content/pages/ru/services/airport-transfer.json`:
    - `Prestigo Prague Airport Transfer — это трансфер` → `Трансфер Prestigo из аэропорта Праги — это поездка`.
    - Every `Fast-track` / `fast-track` → `ускоренное прохождение (паспортного) контроля`, with grammar agreement («может быть добавлено»).
  - `content/pages/ru/corporate.json` faqs[2].a: `reverse charge по НДС` → `обратного начисления НДС`.
- **Freeze.** `freeze/75-29.freeze` holds 15 EN unit patterns (`content/pages/en/book.json` was already frozen whole by 75-06). The freeze ran against a temporary directory that held only 75-29.freeze, so `i18n/translation-manifest.json` changed in exactly those 15 `lastTranslatedAt` entries. The enHashes were unchanged.
- **Ledger.** All 67 `fix:75-29` rows are annotated: 26 "fixed in 75-29 (pending deploy)" and 41 "classified (75-29)". The count of annotated rows equals the count of `fix:75-29` rows. The decision and the resolution are recorded in the disposition-rules header and the summary table.

## Verification

**Catalog rows per edited or in-scope file** (`python3 scripts/qa/en_leak_catalog.py --locales hi,ru`):

| File | Rows before (base allowlist) | Rows after |
|---|---|---|
| content/pages/hi/book.json | 17 | 0 |
| content/pages/hi/services/airport-transfer.json | 6 | 0 |
| content/pages/hi/services/city-rides.json | 3 | 0 |
| content/pages/hi/services/intercity-routes.json | 2 | 0 |
| content/pages/hi/services/vip-events.json | 1 | 0 |
| content/pages/hi/services/group-transfers.json | 2 | 0 |
| content/pages/hi/services/concierge.json | 4 | 0 |
| content/pages/hi/contact.json | 3 | 0 |
| content/pages/hi/faq.json | 1 | 0 |
| content/pages/hi/corporate.json | 3 | 0 |
| content/routes/hi/prague-vienna.json | 24 | 0 |
| messages/hi.json | 8 | 0 |
| content/pages/ru/services/airport-transfer.json | 7 | 0 |
| content/pages/ru/corporate.json | 1 | 0 |

The rest of the catalog is outside the audited pages and was not touched here. It still has hi 91 and ru 59 rows, left for the 75-30 deferred/catalog triage.

**Placeholder / tag / DNT check.** Every one of the 26 changed leaves was compared with its old value and with EN:
- ICU argument names are identical to EN, e.g. `{amount}`, `{businessPrice}`, `{ePrice}/{sPrice}/{vPrice}`.
- The rich tag `<price>…</price>` is preserved.
- Digit runs (prices, phone `+420 725 986 855`, times) are preserved.
- DNT token counts are unchanged: PRESTIGO/Prestigo, Mercedes-Benz, E/S/V-Class, Stripe, Visa, Mastercard, American Express, Apple/Google Pay, WhatsApp, info@rideprestigo.com.
- Result: 26/26 ok, 0 failures.

**Commands:**
- `git diff 53fd5875 HEAD -- content/pages/en content/routes/en messages/en.json` is empty.
- `node scripts/i18n-freeze-manifest.mjs --verify`: PASSED, 390 frozen units.
- `node scripts/i18n-translate.mjs --check` after each commit: PASSED.
- `npx vitest run tests/content-locale-parity.test.ts tests/i18n-completeness.test.ts`: 333 passed.
- `npx vitest run` (full suite): 157 files passed, 2743 tests passed. The only failures are the 5 known worktree-only next-intl import failures (account-trips, auth-customer, login-actions, passenger-actions, profile-actions).

## Task Commits

1. **Task 1 (checkpoint:decision):** resolved before dispatch as `keep-per-glossary`; no commit.
2. **Task 2 (tracer), /hi/book:** `fb405ae1`. Tracer verified end-to-end (catalog 0, freeze verify, parity, translate --check).
3. **Task 3, remaining hi + ru rows and ledger closure:** `453f34c3`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 75-26 over-masking guard contradicted the user decision**
- **Found during:** Task 2
- **Issue:** `test_hi_latin_loanwords_still_leak` asserted that `airport pickup …` leaks in hi. Under keep-per-glossary these words are intentionally classified, so the guard encoded the pre-decision assumption.
- **Fix:** Replaced it with `test_hi_kept_loanwords_are_hi_scoped_only`, which checks the words are masked for hi but still leak for ru and zh. Added `test_hi_untranslated_english_still_leaks_next_to_kept_loanwords`. The guard intent (no over-masking) is preserved and made stricter across locales.
- **Files modified:** scripts/qa/test_en_leak_rendered.py
- **Commit:** fb405ae1

**2. [Rule 2 - Missing critical] Extra catalog rows cleared in edited files**
- **Found during:** Task 3
- **Issue:** Acceptance requires 0 catalog rows for every edited file. `content/routes/hi/prague-vienna.json` (a rendered/audited page) and `messages/hi.json` had rows outside the ledger: shuttle/ride-hail, onboard, Konditorei, Vienna International Airport, Viennese proper nouns, `Flight ट्रैकिंग, meet & greet`, CookieBanner brand names.
- **Fix:** Untranslated words were rewritten. Proper nouns and brand names were added as hi-scoped properNouns/inlineTerms with reasons.
- **Files modified:** content/routes/hi/prague-vienna.json, messages/hi.json, scripts/qa/en_leak_allowlist.json
- **Commit:** 453f34c3

**3. Freeze run isolated to this plan's patterns (process)**
- A normal freeze run rewrites the timestamps of all ~390 frozen units. It was run with `--dir` pointing at a temporary folder that held only `75-29.freeze`, and the folder was deleted afterwards. As a result only the 15 new or changed units were re-stamped. `--verify` against the real freeze dir passes.

## Known Stubs

None.

## Threat Flags

None. The only changes are catalog text and QA allowlist/test data; no new network, auth or file-access surface.

## Next

75-30 is the production re-scan after deploy. It should confirm that the 26 fixed rows are gone on production and that the 41 classified hi rows are now masked by the hi-scoped entries. The catalog-only residue (hi 91 / ru 59 rows outside the audited pages, and the ru CookieBanner brand names) goes into the 75-30 deferred log.

## Self-Check: PASSED

- FOUND: .planning/phases/75-e2e-verification-launch/freeze/75-29.freeze
- FOUND: scripts/qa/en_leak_allowlist.json (hi-scoped entries)
- FOUND commit fb405ae1
- FOUND commit 453f34c3
