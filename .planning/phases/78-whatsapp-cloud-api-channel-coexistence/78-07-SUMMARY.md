---
phase: 78-whatsapp-cloud-api-channel-coexistence
plan: 07
subsystem: infra
tags: [whatsapp, json-ld, email, llms, repo-guard, live-check, vitest]

requires:
  - phase: 78-whatsapp-cloud-api-channel-coexistence
    provides: "Plan 78-01 lib/contact-channels.ts constants and the BUSINESS_PHONE_E164_VALUE literal line"
provides:
  - "JSON-LD telephone (business node, home graph, home contactPoint) derived from the business-number constants"
  - "Email footers (5) and llms text (4 mentions) derived from BUSINESS_PHONE_DISPLAY"
  - "Code-wide guard: no code file under app/, components/, lib/ except lib/contact-channels.ts holds the business number"
  - "scripts/qa/business_number_live_check.mjs (readBusinessNumber, countNumber, evaluatePages, runCli) proven against production in pre-switch mode"
affects: [78-14, 78-16, 78-17]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 5e364e705863cadb8382b2b5c8ba585cb17b9952
plan_head_after: 24c30a55781f9ccf694b1ec8c6a70a254439ca5f

tech-stack:
  added: []
  patterns:
    - "Live-check script with injectable fetch/log/repoRoot (runCli) so the CLI is unit-tested offline"
    - "Former personal number assembled from parts at runtime; tests derive a synthetic number by reversing national digits"

key-files:
  created:
    - scripts/qa/business_number_live_check.mjs
    - tests/business-number-live-check.test.ts
  modified:
    - lib/jsonld.ts
    - app/[locale]/page.tsx
    - lib/email.ts
    - lib/llms-content.ts
    - tests/business-number-guard.test.ts
    - tests/book-page-render.test.tsx
    - tests/routes-hub-render.test.tsx

key-decisions:
  - "/llms.txt (the short file) carries no phone by design, so the live check exempts it from the presence requirement but still requires zero former-number hits there after the switch"
  - "The home JSON-LD telephone check accepts every telephone value that normalizes to the business digits (E.164 and hyphen forms), and is required in both modes"
  - "The reported former= count is always measured (equals business= in pre-switch mode)"

patterns-established:
  - "Separator regex also matches escaped/entity no-break spaces (\\u00a0, &nbsp;, &#160;) so RSC payloads cannot hide a leftover former number"

requirements-completed: [WA-04]

coverage:
  - id: D1
    description: "businessNode() and the home graph telephone equal BUSINESS_PHONE_E164; home contactPoint uses BUSINESS_PHONE_SCHEMA_HYPHEN; output byte-identical"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/business-number-guard.test.ts#structured data follows the constant"
        status: pass
      - kind: unit
        ref: "tests/jsonld.test.ts, tests/route-page-render.test.tsx, tests/multi-day-page-render.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Five email footers and four llms text mentions interpolate BUSINESS_PHONE_DISPLAY; DNT tokens follow the constant"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/email.test.ts, tests/llms-content.test.ts, tests/book-page-render.test.tsx, tests/routes-hub-render.test.tsx"
        status: pass
      - kind: unit
        ref: "tests/business-number-guard.test.ts#code holds the business number in one place only"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live check reads the constant, covers 10 public surfaces, and passes against production in pre-switch mode"
    requirement: WA-04
    verification:
      - kind: unit
        ref: "tests/business-number-live-check.test.ts (29 tests, fake fetch)"
        status: pass
      - kind: manual
        ref: "node scripts/qa/business_number_live_check.mjs against https://rideprestigo.com: mode=pre-switch verdict=pass"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-29
status: complete
---

# Phase 78 Plan 07: Structured data, emails, llms text and live check Summary

**JSON-LD, five email footers and the llms text now read the single business-number constant, a code-wide guard bans the literal everywhere else, and a proven live-check script (pre-switch pass on production) is ready for the 78-14 / 78-17 verification.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-09-29T20:31Z
- **Completed:** 2026-09-29T20:38Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- Tracer: `businessNode()` and the home graph use `BUSINESS_PHONE_E164`, home `contactPoint` uses `BUSINESS_PHONE_SCHEMA_HYPHEN` (format unchanged). Golden snapshots pass without `-u`; tracer gate re-verified end to end before expansion.
- `lib/email.ts`: one module-level `EMAIL_CONTACT_LINE` built from `BUSINESS_PHONE_DISPLAY`, used in the five footer sentences. `lib/llms-content.ts`: four mentions interpolate `BUSINESS_PHONE_DISPLAY`. Wording unchanged.
- Guard: `REFACTORED_FILES` replaced by a code-wide ban (every tracked .ts/.tsx/.js/.jsx/.mjs/.cjs under app/, components/, lib/ except `lib/contact-channels.ts`), with a scan floor and presence checks for email/llms/jsonld, import assertions and a check that both DNT token lists use the constant.
- Live check: `scripts/qa/business_number_live_check.mjs` reads the literal line, GETs 10 surfaces, counts every separator form (including escaped/entity no-break spaces), extracts home JSON-LD telephones, derives the mode and prints the output contract with exit codes 0/1/2.

## Live check against production (pre-switch, kept for the record)

```
page / status=200 business=13 former=13
page /contact status=200 business=16 former=16
page /privacy status=200 business=13 former=13
page /faq status=200 business=15 former=15
page /book status=200 business=13 former=13
page /routes status=200 business=17 former=17
page /llms.txt status=200 business=0 former=0
page /llms-full.txt status=200 business=4 former=4
page /ru/contact status=200 business=16 former=16
page /ar/faq status=200 business=15 former=15
jsonld_telephone=ok
mode=pre-switch
verdict=pass
```
Exit 0; 10 `page` lines. GET requests only.

## Task Commits

1. **Task 1 (tracer): JSON-LD telephone from the constant** - `4319e64d` (refactor)
2. **Task 2: email footers, llms text, DNT tokens, code-wide guard** - `c7b8246a` (refactor)
3. **Task 3: live public-surface check** - `24c30a55` (feat)

**Plan metadata:** the SUMMARY commit follows these three (`commits: 3` counts the task commits measured before the SUMMARY was written).

## Verification
- Plan verification set (12 files: guard, book/routes-hub/multi-day/route render, contact-form, telegram-bot-profile, jsonld, llms-content, email, chat-launcher, live-check): 12 files / 216 tests passed.
- Snapshots: `git diff 5e364e70 HEAD -- tests/__snapshots__` is empty; no `-u` was used.
- `npx tsc --noEmit`: no errors in any touched file (baseline errors only in unrelated tests/).
- `npx eslint --quiet` on all touched source, test and script files: clean.
- `git grep` for the Czech-number forms in `app components lib` excluding `lib/contact-channels.ts`: no matches. The literal-spelling grep on the script and its test prints 0 for both.
- The `verify` skill was not invoked separately; its checks (tsc, eslint, tests, price/secret scans via the pre-commit hook) were run directly on the changed files.

## Decisions Made
- See key-decisions above. The published number is unchanged; plan 78-14 flips the single literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Live-check presence requirement wrong for /llms.txt**
- **Found during:** Task 3 (first production run)
- **Issue:** The plan requires the business number on every page in pre-switch mode, but `/llms.txt` (the short summary produced by the first builder in `lib/llms-content.ts`) contains no phone number by design; only `/llms-full.txt` does (the plan itself lists just the four mentions in the full builder). The first run reported `verdict=fail` on a correct site.
- **Fix:** Added `NUMBER_OPTIONAL_PAGES = ['/llms.txt']`: the business number is not required there, but in post-switch mode a former-number occurrence there still fails. Tests cover both directions. Output contract unchanged (10 page lines).
- **Files modified:** scripts/qa/business_number_live_check.mjs, tests/business-number-live-check.test.ts
- **Commit:** 24c30a55

Otherwise the plan was executed as written. The number of guard tests changed (the per-file `it.each` over REFACTORED_FILES was replaced by the code-wide checks), which is the intended generalization.

## Issues Encountered
- The worktree had no `node_modules`; a gitignored symlink to the main checkout's `node_modules` was created (nothing installed, nothing committed).

## Known Stubs
None.

## Threat Flags
None. No new endpoints, auth paths or trust-boundary changes; the live-check script performs GET requests only and writes nothing.

## User Setup Required
None.

## Next Phase Readiness
- Plans 78-14 and 78-17 can run `node scripts/qa/business_number_live_check.mjs` after the switch and deploy; the mode flips to post-switch automatically once the literal changes, and the check then requires zero former-number occurrences on all 10 surfaces plus a matching home JSON-LD telephone.
- After 78-14, code holds the number in exactly one place (`lib/contact-channels.ts`); locale content JSON is handled by the scripted replace in 78-14 and asserted by 78-16.

## Self-Check: PASSED

- FOUND: scripts/qa/business_number_live_check.mjs, tests/business-number-live-check.test.ts
- FOUND commits: 4319e64d, c7b8246a, 24c30a55

---
*Phase: 78-whatsapp-cloud-api-channel-coexistence*
*Completed: 2026-09-29*
