---
phase: 92-quotes
plan: 07
subsystem: quotes-pdf
status: waiting-checkpoint
tags: [pdf, puppeteer-core, chromium-min, fonts, i18n]
requirements: [QUOTE-07]
requires: [92-04, 92-05]
provides: [renderQuotePdf, checkFontCoverage, fontFaceCss, samplePdfHtml, "GET /api/admin/quotes/pdf-check"]
key-files:
  created:
    - lib/quotes/pdf.ts
    - lib/quotes/pdf-fonts.ts
    - lib/quotes/pdf-sample.ts
    - app/api/admin/quotes/pdf-check/route.ts
    - tests/quote-pdf.test.ts
    - tests/quote-pdf-spike.test.ts
  modified:
    - next.config.ts
commits: 3
plan_head_before: 425e4799c21dd6e7e394e46451db00271fc1aa55
plan_head_after: 9314ad0ec1bda0e8365ddb9d49e6985970b05bf3
actuals:
  tokens: 28000
  tasks: 2
  commits: 3
---

# Phase 92 Plan 07: PDF render spike Summary

**Status: Tasks 1 and 2 done; WAITING for the Task 3 checkpoint (orchestrator and owner look at the 8 sample PDFs). The "D-14 decision" below is intentionally not filled in.**

One hardened `renderQuotePdf(html)` (JavaScript off, every non-`data:` request aborted, 20 s budget, never throws) over local Chrome or chromium-min, per-locale embedded font faces, a font-coverage check through CDP, a sample document per site locale and an admin-only `pdf-check` route.

## Commits
| Commit | What |
|--------|------|
| `909ad8b4` | `next.config.ts` only: `serverExternalPackages` (puppeteer-core, @sparticuz/chromium-min) + `outputFileTracingIncludes` of `./lib/quotes/pdf-fonts/**` for `/api/quote/pdf`, `/api/admin/quotes/[id]/send`, `/api/admin/quotes/pdf-check`. 92-04 header rules untouched. Own commit for the 92-32 cherry-pick. |
| `c466d55d` | Task 1 (tracer): `lib/quotes/pdf.ts`, `pdf-fonts.ts`, `pdf-sample.ts`, `tests/quote-pdf.test.ts` (27 tests) |
| `9314ad0e` | Task 2: `app/api/admin/quotes/pdf-check/route.ts`, route tests, opt-in `tests/quote-pdf-spike.test.ts` |

## Local spike result (Task 2)
Command: `QUOTE_PDF_SPIKE=1 QUOTE_PDF_SPIKE_DIR=<dir> QUOTE_PDF_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx vitest run tests/quote-pdf-spike.test.ts` (passed). Output dir (scratch, not committed): `/private/tmp/claude-501/-Users-romanustyugov-Desktop-Prestigo/c361a2bd-1aa8-432b-83f6-15a12e9993ff/scratchpad/quote-pdf-samples/`

| locale | render ms | bytes | pages | fallback |
|--------|-----------|-------|-------|----------|
| en | 1909 | 179850 | 1 | [] |
| ru | 2087 | 212511 | 1 | [] |
| es | 1921 | 182070 | 1 | [] |
| fr | 2093 | 181279 | 1 | [] |
| ar | 2347 | 226161 | 1 | [] |
| hi | 2415 | 211274 | 1 | [] |
| zh | 4488 | 397199 | 1 | [] |
| zh-hant | 3959 | 410452 | 1 | [] |

Render time = `renderQuotePdf` only (browser launch + setContent + pdf), local Chrome on this Mac; the font base64 read is cached after the first call. All PDFs are under 2 MB. Every row has an empty fallback list, so every glyph came from an embedded face.

Sanity of the coverage check (temporary test, removed): the same kind of text without embedded faces reports `Geeza Pro, ITF Devanagari, Songti SC, Times`; the zh-hant sample with the Noto Sans TC face removed reports `蘋方-繁` (the macOS system font). So an empty list is not a vacuous pass. Hardening check against a local HTTP server: an `<img>`, a `<link>`, an `<iframe>` and a script `fetch` pointed at it produced 0 hits.

## Settings recorded for the platform proof (92-32)
- `next.config.ts`: `serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min']`; `outputFileTracingIncludes` for the three PDF routes (fonts total 31 MB, within the 250 MB bundle limit; chromium-min ships no binary, the pack is downloaded at runtime).
- `CHROMIUM_PACK_URL` = `https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar` (HEAD checked: 200, 70 MB). Downloaded once per cold start into /tmp.
- Engine on Vercel is selected by the `VERCEL` env; locally by `QUOTE_PDF_CHROME_PATH`.
- `pdf-check` route: `maxDuration = 300`, `force-dynamic`, no-store. It renders each sample twice per locale (PDF, then coverage) in separate browser launches, so expect 16 launches on production.
- Not yet proven: cold-start time, bundle size and the chromium-min render on Vercel (that is 92-32).

## D-14 decision
PENDING the Task 3 checkpoint: orchestrator opens the 8 PDFs (ar joined and right-to-left, hi conjuncts, zh and zh-hant characters, ru Cyrillic), the owner opens ar, hi, zh and zh-hant; then record "attachment" or "link fallback" here.

## Deviations from Plan
- **[Added export] `pdfEngineKind()`** in `lib/quotes/pdf.ts` (and `fontStacks(locale)` in `pdf-fonts.ts`): the route needs the engine name for its `engine` field without launching anything, and the sample document needs the embedded-family stacks. No behaviour beyond the plan.
- **[Process] plan commit ledger**: writing the ledger file inside the shared git dir is blocked for a worktree agent, so `plan_head_before` was taken from `git rev-parse HEAD` before the first commit (`425e4799`) and `commits: 3` measured with `git rev-list --count`.
- **[Tooling] page previews**: `pdftoppm` is not installed here, so the Read tool cannot render PDF pages; PNG thumbnails were made with `qlmanage` into `.../scratchpad/quote-pdf-previews/` (ar and zh-hant looked correct: joined RTL Arabic, Traditional characters, amounts readable). The final check of all eight is the checkpoint.
- No other deviations.

## Observation (not changed, outside this plan)
`messages/zh-hant.json` `PaymentEmails.common.assistanceText` reads "聯络我們" ("络" is the Simplified form; Traditional is "絡"). Visible in the zh-hant sample footer. Left for the orchestrator.

## Known Stubs
None.

## Threat Flags
None beyond the plan's register: `pdf-check` is admin-only and renders fixed samples (T-92-24); T-92-21 (SSRF) and T-92-22 (script) mitigated by the hardened page and covered by tests; T-92-92 mitigated by Noto Sans TC plus `checkFontCoverage`.

## Verification
- `npx vitest run tests/quote-pdf.test.ts tests/quote-pdf-spike.test.ts tests/next-config-headers.test.ts tests/quote-pdf-deps.test.ts`: 81 passed, 1 skipped (the opt-in spike without env).
- `npx tsc --noEmit`: only the 8 baseline errors in `tests/` (nav-auth, i18n-translate-dnt, passenger-actions).
- `npx eslint --quiet` on all new files and `next.config.ts`: clean.

## Self-Check: PASSED
Files exist (`lib/quotes/pdf.ts`, `pdf-fonts.ts`, `pdf-sample.ts`, route, both tests); commits `909ad8b4`, `c466d55d`, `9314ad0e` exist on the branch.
