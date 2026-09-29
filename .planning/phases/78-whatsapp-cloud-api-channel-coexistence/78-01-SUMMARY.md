---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 01
subsystem: infra
tags: [whatsapp, constants, repo-guard, vitest, refactor]

requires:
  - phase: 77-chatwoot-deployment-core-channels
    provides: lib/contact-channels.ts (WHATSAPP_CHAT_URL, Telegram constants)
provides:
  - "Single source of the public business number in lib/contact-channels.ts (D-22)"
  - "Derived constants BUSINESS_PHONE_E164/DIGITS/DISPLAY/SCHEMA_HYPHEN, BUSINESS_TEL_URL, WHATSAPP_CHAT_URL, whatsappUrlWithText()"
  - "tests/business-number-guard.test.ts with consistency assertion A, THIRD_PARTY_NUMBERS allowlist, REFACTORED_FILES literal ban"
affects: [78-07, 78-14, 78-16, 78-17]

actuals:
  tokens: 16000
  tasks: 2
  commits: 2
plan_head_before: 938a8024af8222d73ee269aac671349d86a3c614
plan_head_after: 09b13d13f956c80e8df15f20487b4a6aa42c68cc

tech-stack:
  added: []
  patterns:
    - "One non-exported literal + slice-derived exports for a public identifier"
    - "Source-reading repo guard over git ls-files with a scan floor and per-locale coverage floor"

key-files:
  created:
    - tests/business-number-guard.test.ts
  modified:
    - lib/contact-channels.ts
    - components/HeroWhatsApp.tsx
    - components/Footer.tsx
    - app/[locale]/contact/page.tsx
    - app/[locale]/privacy/page.tsx
    - components/booking/steps/Step2DateTime.tsx
    - components/ContactForm.tsx
    - tests/telegram-bot-profile.test.ts
    - tests/contact-form.test.tsx

key-decisions:
  - "The number value is unchanged in this plan (still the current one); plan 78-14 flips the single literal after the go-live test"
  - "Guard never spells the number: every test string is built from imported constants"
  - "tests/ is not scanned by assertion A (fixtures hold customer-style numbers)"

patterns-established:
  - "BUSINESS_PHONE_E164_VALUE line format `const BUSINESS_PHONE_E164_VALUE = '+420ddddddddd'` is regex-readable by scripts (plan 78-07)"

requirements-completed: [WA-04]

coverage:
  - id: D1
    description: "lib/contact-channels.ts holds exactly one number literal; all derived formats are exact (DISPLAY groups, HYPHEN, TEL, wa.me, encodeURIComponent prefilled text)"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/business-number-guard.test.ts#business-number constants (D-22)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Footer, HeroWhatsApp, contact page, privacy tel link, Step2DateTime urgent link and ContactForm placeholder import the constants and hold no literal"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/business-number-guard.test.ts#refactored files hold no number literal (D-21)"
        status: pass
      - kind: unit
        ref: "tests/contact-form.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Byte-identical output: four golden snapshots pass without -u, no diff under tests/__snapshots__"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/book-page-render.test.tsx, multi-day-page-render, route-page-render, routes-hub-render"
        status: pass
    human_judgment: false
  - id: D4
    description: "Assertion A: every Czech-number-shaped string in tracked app/components/lib/content/i18n files equals the constant (except 2 reasoned third-party blog numbers); all 35 locale content files contain it"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/business-number-guard.test.ts#assertion A"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-29
status: complete
---

# Phase 78 Plan 01: Single business-number constant and repo guard Summary

**One E.164 literal in lib/contact-channels.ts now drives every wa.me/tel/visible-number/placeholder surface in code, with a git-ls-files repo guard proving all 7 locales' content JSON agrees, and zero visible change.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-09-29T18:16:33Z
- **Completed:** 2026-09-29T18:20:00Z
- **Tasks:** 2
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments
- `lib/contact-channels.ts` exposes `BUSINESS_PHONE_E164`, `_DIGITS`, `_DISPLAY`, `_SCHEMA_HYPHEN`, `BUSINESS_TEL_URL`, `WHATSAPP_CHAT_URL`, `whatsappUrlWithText()`, all derived from a single non-exported literal (value unchanged; no env reads, no imports).
- Six surfaces refactored onto the constants: Footer, HeroWhatsApp, contact page (module `WHATSAPP_NUMBER` removed), privacy tel link, Step2DateTime urgent-transfer link, ContactForm placeholder.
- `tests/business-number-guard.test.ts` (22 tests): constant invariants incl. boundary rejection of the pattern (digit removed / appended), matcher separator variants (space, U+00A0, U+202F, hyphen, none) and embedded-digit-run rejection, assertion A, non-vacuous coverage, refactored-file literal ban.

## Guard coverage
- Files scanned by assertion A: 764 tracked files under app/, components/, lib/, content/, i18n/ (floor 250).
- 35/35 files `content/pages/{en,ru,es,fr,ar,hi,zh}/{book,faq,routes,services,privacy}.json` each contain the constant (including the no-break-space form in en/privacy.json).
- THIRD_PARTY_NUMBERS: 2 entries (two editorial blog pages), each still matching.
- Snapshots: `git diff HEAD -- tests/__snapshots__` is empty; the four golden render tests pass without `-u`.

## Task Commits

1. **Task 1 (tracer): constants + Footer/Hero + guard** - `b956a3b9` (refactor)
2. **Task 2: contact/privacy/booking/form surfaces** - `09b13d13` (refactor)

**Plan metadata:** the SUMMARY commit follows these two (commits: 2 above counts the task commits measured before the SUMMARY was written).

## Files Created/Modified
- `lib/contact-channels.ts` - single literal, derived constants, `whatsappUrlWithText()`
- `tests/business-number-guard.test.ts` - repo guard (assertion A; assertion B arrives with plan 78-16)
- `components/Footer.tsx`, `components/HeroWhatsApp.tsx` - tel/wa.me/display from constants
- `app/[locale]/contact/page.tsx`, `app/[locale]/privacy/page.tsx` - wa.me/tel/display from constants
- `components/booking/steps/Step2DateTime.tsx` - urgent-transfer wa.me link
- `components/ContactForm.tsx` - phone placeholder
- `tests/telegram-bot-profile.test.ts`, `tests/contact-form.test.tsx` - literal assertions replaced by constants

## Decisions Made
- Followed plan as specified; the published number is unchanged until plan 78-14.

## Deviations from Plan

None - plan executed exactly as written.

The RED step of Task 1 failed mostly on the missing exports (constants did not exist yet) as well as the Footer/Hero literal-ban case; both went GREEN with the refactor.

## Issues Encountered
- The worktree had no `node_modules`; a gitignored symlink to the main checkout's `node_modules` was created so vitest/tsc/eslint could run (no packages installed, nothing committed). The orchestrator's post-merge test run in the main tree is unaffected.

## Verification
- `npx vitest run` on business-number-guard, telegram-bot-profile, chat-launcher, contact-form, book/multi-day/route/routes-hub render tests, static-pages-locale: 9 files / 164 tests passed.
- `npx tsc --noEmit`: 8 errors total (the documented baseline in tests/), none in refactored files.
- `npx eslint --quiet` on all touched source files and the guard: clean.
- The `verify` skill was not invoked separately; its checks (tsc, eslint, tests, no hard-coded prices, no secrets staged) were run directly on the changed files.

## Known Stubs
None.

## Threat Flags
None - no new network endpoints, auth paths or trust-boundary changes; the constants module imports nothing and reads no env.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 78-07 can read the value line with `^const BUSINESS_PHONE_E164_VALUE = '\+420[0-9]{9}'$`.
- Plan 78-14 flips the single literal plus a scripted content replace; plan 78-16 adds assertion B (former number absent) to the same guard.

## Self-Check: PASSED

---
*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Completed: 2026-09-29*
