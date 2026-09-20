---
phase: 73-non-latin-rtl-infra-ar-hi-zh
verified: 2026-09-20T19:25:00Z
status: passed
score: 5/6 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:

    - "GAP-1 (RTL-01 BLOCKER): openingParagraphs, routeNarrative.paragraphs, and faqs[].a on all 30 app/[locale]/routes/prague-*/page.tsx now interpolate embedded DNT price tokens via interpolateBidi()/aBidi at the render site, confirmed by direct grep across all 30 files (30/30 on the new pattern, 0/30 on the old plain-interpolate() form) AND by an actual component render test (tests/route-page-render.test.tsx) proving <bdi> tags appear in the real rendered /ar HTML on both D-10 reference pages (prague-vienna, prague-berlin), with the FAQPage JSON-LD acceptedAnswer.text carve-out confirmed still a plain string with zero <bdi> markup."
    - "GAP-2 (weak CR-02 backstop): tests/rtl-backstop.test.ts's CR-02 block rewritten from a file-level 'interpolateBidi anywhere in file' check to per-field, per-call-site assertions across all 30 route pages (positive: exact interpolateBidi() call at the openingParagraphs/routeNarrative.paragraphs/faqs.aBidi sites; negative: the old plain-interpolate() form is gone from those exact sites). Confirmed by direct reading of the test file and a clean run (136/136 passed)."
    - "GAP-3 (73-RTL-QA.md factually incorrect PASS): Group 3 route-page row corrected from FAIL to PASS, now citing the interpolateBidi()/aBidi fix and the JSON-LD carve-out, backed by a genuine re-check (not just narrative) — a live render-based test on both prague-vienna and prague-berlin."
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items:

  - truth: "/ar/, /hi/, /zh/ render Noto glyphs with no tofu/fallback boxes (ROADMAP SC#3, FONT-01)"
    test: "Load /ar/, /hi/login, /zh/login in a real browser and visually confirm every non-Latin glyph renders via its Noto face (no empty boxes)."
    expected: "No tofu/fallback-glyph boxes on any of the three locales across the 5 D-10 page types."
    why_human: >
      Font delivery is programmatically re-confirmed this session (components/SiteChrome.tsx single
      localeFontClassName ternary, unchanged). 73-RTL-QA.md Task 3 documents a detailed live-browser
      walkthrough (screenshots + quoted rendered strings per locale, one real FAIL found-and-fixed en
      route — the wordmark reversal). This is credible executor evidence, but glyph-level tofu rendering
      is a visual fact this verifier did not independently re-observe in a browser this session, and per
      verification policy visual appearance is always routed to human sign-off regardless of how detailed
      the executor's own record is. This item is unchanged from the previous verification pass — 73-13/
      73-14 did not touch font delivery and did not attempt to close it (correctly, per their own SUMMARYs).
coincidental_reliance_items: []
human_verification:

  - test: "Load /ar/, /hi/login, /zh/login and independently confirm no tofu/fallback glyph boxes appear anywhere on the 5 D-10 representative pages (cross-check against 73-RTL-QA.md's already-recorded PASS results)."
    expected: "Every ar/hi/zh glyph renders via its Noto face; no empty boxes."
    why_human: "Glyph-level rendering is a visual fact; 73-RTL-QA.md documents a detailed walkthrough with a genuine FAIL-found-and-fixed track record, which is credible but not a substitute for an independent human sign-off."
---

# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) Verification Report

**Phase Goal:** The three non-Latin locales (ar, hi, zh) render correctly with real translations, proper non-Latin fonts, and (for Arabic) correct RTL layout; Phase 72 pipeline re-run for complete ar/hi/zh catalogs + localized content; Noto fonts per locale via next/font; physical-direction Tailwind classes converted to logical properties so Arabic mirrors without breakage; en/ru/es/fr output unaffected.

**Verified:** 2026-09-20T19:25:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure cycle 2 (73-13, 73-14)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Complete ar/hi/zh catalogs + localized content generated, 0 missing keys vs en, glossary/DNT rules enforced (SC#1, TR-02) | ✓ VERIFIED | Independently re-ran a structural key-diff of `messages/{ar,hi,zh}.json` against `messages/en.json` this session: 0 missing keys in any of the three catalogs. Unchanged since previous pass; this cycle touched no translation content. |
| 2 | /ar/ renders RTL: physical-direction Tailwind classes converted to logical properties, dir="rtl" set, no mirrored-layout breakage, no reversed price/phone/time token (SC#2, RTL-01) | ✓ VERIFIED | `app/[locale]/layout.tsx:25` sets `dir={rtlLocales.includes(locale) ? 'rtl' : 'ltr'}` (unchanged, correct). CR-01/original-WR-01 (Nav chevron + dropdown inset) confirmed fixed at `components/Nav.tsx:209,225`. **The previously-open GAP-1 bidi-scrambling defect is now closed**: directly re-verified `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` use `interpolateBidi()`/`aBidi` at the render site on all 30/30 `app/[locale]/routes/prague-*/page.tsx` files (grep: 30/30 on the new pattern, 0/30 on the old plain-`interpolate()` form for these exact fields), AND confirmed via an actual React Server Component render test (`tests/route-page-render.test.tsx`, re-run this session, 4/4 passed) that the real `/ar` HTML output for both D-10 reference pages (prague-vienna, prague-berlin) wraps every substituted price digit in `<bdi>` while the FAQPage JSON-LD `<script>` payload stays a plain string with zero `<bdi>` markup. |
| 3 | ru/es/fr and English-root output byte-for-byte unchanged (SC#4 part, D-12) | ✓ VERIFIED | `git diff --stat` between the pre-gap-cycle-2 commit and HEAD shows zero touched files under `messages/{en,ru,es,fr}.json` or `content/{routes,pages,blog}/{en,ru,es,fr}`. Full `npx vitest run` re-run this session: 1601 passed, 0 failed, 10 skipped, 139 todo — matches SUMMARY claims exactly. |
| 4 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font, zero Noto bytes on en/ru/es/fr, no cross-family leak (SC#3 part, FONT-01) | ✓ VERIFIED | `components/SiteChrome.tsx` single `localeFontClassName` ternary re-confirmed unchanged. Matches 73-RTL-QA.md Task 2's full build-output count of 0/32 Noto-carrying files across en/ru/es/fr. Untouched by this gap-closure cycle. |
| 5 | ar/hi/zh glyphs render without tofu/fallback boxes (SC#3 part, FONT-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Delivery verified (truth 4). 73-RTL-QA.md Task 3 documents a detailed live-browser walkthrough (screenshots, quoted rendered Arabic/Hindi/Chinese strings, one genuine FAIL found-and-fixed). Still routed to human verification per policy — visual glyph rendering is not independently re-observable by this verifier without a browser. Unchanged from the previous pass; 73-13/73-14 correctly left this untouched. |
| 6 | RTL visual QA on /ar/ passes; QA-sampling recorded (SC#4 part, D-10/D-11) | ✓ VERIFIED | `i18n/QA-REPORT.md` substantive, per-locale (unchanged). `73-RTL-QA.md`'s Group 3 route-page row is now corrected to "PASS (closed by gap cycle 73-13/73-14)" and this claim is genuinely backed — not just narrative — by the live render-based test in `tests/route-page-render.test.tsx` on both named D-10 reference pages. |

**Score:** 5/6 truths verified (1 present, behavior-unverified — glyph tofu is a visual-only check, correctly routed to human sign-off)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `content/routes/{ar,hi,zh}/*.json` (30 files each) | Complete, real-translated content | ✓ VERIFIED | Unchanged since previous pass; 0 missing keys vs en |
| `content/pages/{ar,hi,zh}/corporate.json` | Complete, real-translated content | ✓ VERIFIED | Unchanged; 0 missing keys vs en |
| `components/Nav.tsx` | Correct dir-aware chevron + dropdown positioning | ✓ VERIFIED | CR-01/original-WR-01 fixed and confirmed present |
| `app/globals.css` `.wordmark` | LTR-forced wordmark, no flex-reversal under RTL | ✓ VERIFIED | `direction: ltr` present, unchanged |
| `app/[locale]/routes/prague-*/page.tsx` (30 files) | `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` bidi-protected at render site; JSON-LD text carve-out preserved | ✓ VERIFIED | 30/30 files confirmed on `interpolateBidi()`/`aBidi` for all three fields; 0/30 on the old plain-`interpolate()` form at these sites; 30/30 preserve `text: f.a` in the JSON-LD block; the 4 layout-variant files (`prague-kutna-hora`, `prague-liberec`, `prague-pardubice`, `prague-plzen`) confirmed correctly fixed via their non-`<Reveal>` FAQ layout |
| `tests/rtl-backstop.test.ts` | Machine backstop for CR-01/WR-01/WR-02/WR-03/WR-05/CR-02, strengthened to per-field call-site correctness | ✓ VERIFIED | Read the full file: CR-02 block now asserts, per route page, the exact `interpolateBidi()`/`aBidi` call sites plus a negative check the plain form is gone; 136/136 passed on direct re-run this session |
| `tests/route-page-render.test.tsx` | Actual render-based proof the fix reaches real /ar HTML output | ✓ VERIFIED | Read the full file: 4 describe blocks (byte-parity snapshot, prague-berlin CR-02 backstop, prague-vienna GAP-1 close, prague-berlin GAP-3 re-check), all asserting real rendered HTML content, not source presence; 4/4 passed on direct re-run this session |
| `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` | Completed D-10/D-11 visual QA record with an accurate Group 3 row | ✓ VERIFIED | Group 3 route-page row now reads "PASS (closed by gap cycle 73-13/73-14)" with a specific, checkable citation to the render test — confirmed accurate against the actual code and test results |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `getLocale()` (SiteChrome) | `<body>` className | `localeFontClassName` ternary | ✓ WIRED | Re-confirmed unchanged |
| `dir="rtl"` (layout) | chevron rotation | JS inline `transform` (Nav.tsx) | ✓ WIRED, CORRECT | CR-01 fix confirmed |
| `dir="rtl"` (layout) | dropdown panel position | `insetInlineEnd` (Nav.tsx) | ✓ WIRED, CORRECT | Confirmed |
| `content.openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` (30 route pages) | `<bdi>` isolation | `interpolateBidi()` / `aBidi` | ✓ WIRED, CORRECT (was NOT WIRED in previous pass) | Confirmed via source grep (30/30) AND live render test output on both D-10 reference pages |
| `content.faqs[].a` (JSON-LD `acceptedAnswer.text`) | plain string, no ReactNode | `text: f.a` carve-out | ✓ WIRED, CORRECT | Confirmed present on all 30 files; live render test confirms zero `<bdi>` inside the JSON-LD `<script>` payload |

### Data-Flow Trace (Level 4)

The GAP-1 fix is a rendering-logic change, not a new data source — traced the full chain from content JSON to rendered HTML: `content/routes/ar/prague-vienna.json` (`openingParagraphs[0]` containing embedded `{ePrice}` token) → `interpolateBidi(p, prices)` at the page component's precompute → JSX render `{openingParagraphs[0]}` → actual `<bdi>485</bdi> يورو`-shaped output confirmed present in the rendered HTML by `tests/route-page-render.test.tsx`. Data flows correctly end to end; no static/mock terminus found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-02 backstop (per-field, 30 route pages) passes | `npx vitest run tests/rtl-backstop.test.ts` | 136/136 passed | ✓ PASS |
| Live /ar render proves `<bdi>` isolation on prague-vienna + prague-berlin (openingParagraphs, FAQ answer) and plain JSON-LD text | `npx vitest run tests/route-page-render.test.tsx` | 4/4 passed | ✓ PASS |
| Full project suite green, no regressions from gap-closure cycle 2 | `npx vitest run` | 1601 passed, 0 failed, 10 skipped, 139 todo | ✓ PASS |
| en/ru/es/fr content/messages untouched by 73-13/73-14 | `git diff --stat <pre-cycle-commit>..HEAD -- messages/{en,ru,es,fr}.json content/{routes,pages,blog}/{en,ru,es,fr}` | empty diff | ✓ PASS |
| ar/hi/zh message catalogs still 0 missing keys vs en | custom key-diff script | 0/0/0 missing | ✓ PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` conventions and none are declared in the PLAN/SUMMARY files. Step 7c: SKIPPED (no probes declared for this phase).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|--------------|--------|----------|
| TR-02 | 73-01, 73-02, 73-06, 73-11 | Complete translations across every catalog and content file for ru/es/fr/ar/hi/zh | ✓ SATISFIED | 0 missing keys confirmed this session; unaffected by gap-closure cycle 2 |
| RTL-01 | 73-01, 73-03..73-14 | Arabic renders RTL; physical-direction classes converted; no mirrored-layout breakage | ✓ SATISFIED | The confirmed, live GAP-1 bidi-scrambling gap from the previous verification pass is now genuinely closed on all 30 route pages, backed by both source-level and live-render evidence |
| FONT-01 | 73-01, 73-06, 73-12, 73-14 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font | ⚠️ SATISFIED, pending independent human tofu sign-off | Delivery wiring fully verified programmatically. Glyph-level rendering has a detailed, credible QA record but requires independent human visual confirmation per policy — this is a permanent constraint of this requirement type, not a residual code gap |

REQUIREMENTS.md already marks RTL-01, FONT-01, and TR-02 as `[x]` complete, mapped to Phase 73. This verifier's finding: that marking is now substantiated for RTL-01 (previously it was not, per the prior verification pass) and remains substantiated for TR-02; FONT-01's code-level claim is substantiated, with its inherently visual component still requiring the human sign-off item below.

No orphaned requirements — RTL-01, FONT-01, TR-02 are the full set mapped to Phase 73, and all three are declared across the fourteen plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any file touched by 73-13/73-14 | — | Clean |

### Human Verification Required

### 1. Glyph tofu check — /ar/, /hi/login, /zh/login

**Test:** Load `/ar/`, `/hi/login`, `/zh/login` in a real browser and visually confirm every non-Latin glyph renders via its Noto face (no empty tofu/fallback boxes), spot-checking against the 5 D-10 representative page types already recorded in `73-RTL-QA.md`.
**Expected:** No tofu/fallback-glyph boxes anywhere on the three locales.
**Why human:** Font delivery wiring is programmatically verified (single Noto family guaranteed per locale, zero cross-family leak, zero Noto bytes shipped to en/ru/es/fr). But whether the browser actually paints every glyph via the correct Noto face — versus silently falling back to a tofu box for an uncovered code point — is a visual runtime fact no static analysis can observe. `73-RTL-QA.md` documents a detailed, credible walkthrough (screenshots, quoted rendered strings, one genuine FAIL found-and-fixed during the same session), which materially reduces risk here, but per verification policy this class of check always routes to independent human sign-off regardless of how thorough the executor's own record is.

### Gaps Summary

Both gaps from the previous VERIFICATION.md (2026-09-19, `gaps_found`, 4/6) are now genuinely closed, confirmed independently against the actual codebase rather than by trusting the SUMMARY narratives:

- **GAP-1 (RTL-01 BLOCKER — the live, unprotected DNT price token in `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` on all 30 route pages):** Closed. Directly re-verified via grep across all 30 files (30/30 on `interpolateBidi()`/`aBidi`, 0/30 on the old plain-`interpolate()` form for these exact fields) AND via an actual component render test that proves `<bdi>` isolation in the real rendered `/ar` HTML on both D-10 reference pages, with the FAQPage JSON-LD text carve-out intact (plain string, zero `<bdi>`, `JSON.stringify` never receives a ReactNode).
- **GAP-2 (weak CR-02 backstop that couldn't have caught GAP-1):** Closed. `tests/rtl-backstop.test.ts`'s CR-02 block now performs per-field, per-call-site assertions (not file-level presence) across all 30 route pages, confirmed by direct reading of the strengthened test and a clean 136/136 run.
- **GAP-3 (73-RTL-QA.md's factually incorrect Group 3 PASS row):** Closed. The row now correctly reads PASS, backed by a genuine live-render re-check rather than a narrative correction alone.

No regressions were introduced by the gap-closure cycle: the full suite is green (1601 passed, 0 failed — matches the SUMMARY's own claim exactly), and en/ru/es/fr messages/content are confirmed byte-identical (empty `git diff`) across the cycle.

The remaining item — FONT-01's glyph-tofu visual confirmation — is not a code gap. It is an inherent human-only check per verification policy, and per the known-context brief for this re-verification it should be classified as `human_verification`, not an automated failure. This is unchanged from the previous pass; 73-13/73-14 correctly did not attempt to close it.

**Recommended path:** Phase 73's automated/code-level goal is achieved. The only remaining action is an independent human loading `/ar/`, `/hi/login`, and `/zh/login` to confirm no tofu boxes appear, cross-checking `73-RTL-QA.md`'s already-recorded (and now more credible) PASS results. Once that sign-off is recorded, Phase 73 can close with no further code changes required.

---

_Verified: 2026-09-20T19:25:00Z_
_Verifier: Claude (gsd-verifier)_
