---
phase: 73-non-latin-rtl-infra-ar-hi-zh
verified: 2026-09-19T21:16:58Z
status: gaps_found
score: 4/6 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "CR-01 Nav.tsx chevron RTL-mirror inversion (WR-01-original: dropdown panel physical right:0) — both confirmed fixed: chevron rotation formula no longer has an isRtl branch (components/Nav.tsx:209), dropdown panel uses insetInlineEnd (components/Nav.tsx:225)."
    - "D-10/D-11 RTL visual QA checklist was scaffold-only/all-PENDING — now recorded as a performed live-browser walkthrough (73-RTL-QA.md Task 3) with one FAIL found (brand wordmark flex-reversal under RTL) and fixed (app/globals.css .wordmark { direction: ltr }, confirmed present), plus a machine backstop (tests/rtl-backstop.test.ts, 46/46 passing, confirmed by direct run this session)."
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "/ar/ renders RTL with no mirrored-layout breakage; RTL visual QA on /ar/ passes with no reversed price/phone/time token (ROADMAP SC#2 + SC#4, RTL-01, D-11 — this cycle's re-review WR-01, distinct from the now-closed original WR-01 dropdown-inset finding)"
    status: failed
    reason: >
      Directly confirmed against the live codebase and content: `app/[locale]/routes/prague-vienna/page.tsx`
      (one of the phase's own 5 D-10 representative QA pages) interpolates `content.openingParagraphs`
      and `content.faqs[].a` with the plain, non-bidi `interpolate()` helper (lines 53 and 65) and renders
      them as raw strings with zero `<bdi>` protection. `content/routes/ar/prague-vienna.json`'s
      `openingParagraphs[0]` demonstrably contains an embedded, unprotected `{ePrice}`/`{vPrice}`/`{sPrice}`
      run inside Arabic RTL prose ("تبدأ التعرفة الثابتة من {ePrice} يورو في سيارة Mercedes E-Class...").
      This is the exact Unicode-bidi-scrambling risk `interpolateBidi()`/`<bdi>` were built to prevent, and
      it is unprotected on the live page a real `/ar/routes/prague-vienna` visitor sees today.
      Confirmed this is not isolated to one page: the same `interpolate(p, prices)` / `interpolate(f.a, prices)`
      pattern (no `interpolateBidi`) appears in 31/31 and 30/30 route-page files respectively
      (`grep -l` count), and 73-08/73-09-SUMMARY.md explicitly record that `openingParagraphs`,
      `routeNarrative.paragraphs`, and the FAQ `interpolate()` calls were **deliberately excluded** from
      the CR-02 bidi sweep ("FAQ/metadata interpolate() calls are explicitly excluded from this sweep per
      the plan") — the sweep covered only `hero.intro`, `cta.headingItalic`, bare `v.price`/`c.price`, and
      the copper highlight. No plan after 73-09 (73-10, 73-11, 73-12) touches this code path; 73-12 only
      added the QA walkthrough + a backstop test, neither of which closes the gap (see artifacts below).
      This directly contradicts `73-RTL-QA.md`'s own Group 3 table row for the route-page template
      ("PASS (direction) — every price token is bidi-isolated ... 73-08/73-09 sweep") — that PASS verdict
      is factually incorrect for `openingParagraphs`/`faqs` on the very page it certifies.
    artifacts:
      - path: "app/[locale]/routes/prague-vienna/page.tsx"
        issue: "Lines 53, 65: openingParagraphs and faqs[].a interpolated with plain interpolate(), rendered raw, no <bdi>."
      - path: "app/[locale]/routes/prague-berlin/page.tsx"
        issue: "Lines 54, 66, 139-144, 296 — same pattern, matches 73-REVIEW.md's WR-01 finding verbatim, still present unfixed after this closure cycle."
      - path: "tests/rtl-backstop.test.ts"
        issue: "Lines 140-146: the CR-02 backstop only asserts /interpolateBidi/.test(src) || /<bdi>/.test(src) ANYWHERE in the file — true for every route page because hero.intro IS wrapped — so it passes (46/46) without detecting that openingParagraphs/faqs specifically are not. Presence-in-file, not per-field correctness."
    missing:
      - "Switch openingParagraphs/routeNarrative.paragraphs/faqs[].a interpolation to interpolateBidi() at the render call across all ~30 route pages (keep a separate plain-interpolate()-derived string for the FAQPage JSON-LD text field, per 73-REVIEW.md's own note)."
      - "Strengthen the rtl-backstop.test.ts CR-02 assertions to check the specific openingParagraphs/faqs render call sites use interpolateBidi, not just file-level presence of the helper anywhere."
      - "Re-run the D-10/D-11 Group 3 visual check on /ar/routes/prague-vienna (and prague-berlin) after the fix to confirm no reversed token, and correct 73-RTL-QA.md's Group 3 row."
deferred: []
behavior_unverified_items:
  - truth: "/ar/, /hi/, /zh/ render Noto glyphs with no tofu/fallback boxes (ROADMAP SC#3, FONT-01)"
    test: "Load /ar/, /hi/login, /zh/login in a real browser and visually confirm every non-Latin glyph renders via its Noto face (no empty boxes)."
    expected: "No tofu/fallback-glyph boxes on any of the three locales across the 5 D-10 page types."
    why_human: >
      Font delivery is programmatically re-confirmed this session (components/SiteChrome.tsx:142-149 single
      localeFontClassName ternary, unchanged since the previous verification pass). 73-RTL-QA.md Task 3 now
      documents a specific, detailed live-browser walkthrough (screenshots + quoted rendered strings per
      locale, one real FAIL found-and-fixed en route — the wordmark reversal — which is stronger evidence
      than a rubber-stamped scaffold). However, glyph-level tofu rendering is a visual fact this verifier
      did not independently re-observe in a browser this session, and per verification policy visual
      appearance is always routed to human sign-off regardless of how detailed the executor's own record is.
coincidental_reliance_items: []
human_verification:
  - test: "Load /ar/, /hi/login, /zh/login and independently confirm no tofu/fallback glyph boxes appear anywhere on the 5 D-10 representative pages (cross-check against 73-RTL-QA.md's already-recorded PASS results)."
    expected: "Every ar/hi/zh glyph renders via its Noto face; no empty boxes."
    why_human: "Glyph-level rendering is a visual fact; 73-RTL-QA.md documents a detailed walkthrough with a genuine FAIL-found-and-fixed track record, which is credible but not a substitute for an independent human sign-off."
---

# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) Verification Report

**Phase Goal:** The three non-Latin locales (ar, hi, zh) render correctly with real translations, proper non-Latin fonts, and (for Arabic) correct RTL layout; Phase 72 pipeline re-run for complete ar/hi/zh catalogs + localized content; Noto fonts per locale via next/font; physical-direction Tailwind classes converted to logical properties so Arabic mirrors without breakage; en/ru/es/fr output unaffected.

**Verified:** 2026-09-19T21:16:58Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (73-07..73-12)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Complete ar/hi/zh catalogs + localized content generated, 0 missing keys vs en, glossary/DNT rules enforced (SC#1, TR-02) | ✓ VERIFIED | `--check` passes for messages/*.json (0 missing keys, EN unchanged). Independently re-derived a full structural key-diff across `content/routes/{ar,hi,zh}` (30 files each) and `content/pages/{ar,hi,zh}` (17 files each) vs `en`: **0 missing keys in any file**, including all 6 "credit-blocker" route files + corporate.json. Spot-checked real-script prose in all 6 flagged files + corporate.json (Arabic/Hindi/Chinese, not English placeholder) — see caveat below. |
| 2 | /ar/ renders RTL: physical-direction Tailwind classes converted to logical properties, dir="rtl" set, no mirrored-layout breakage, no reversed price/phone/time token (SC#2, RTL-01) | ✗ **FAILED** | Mechanical logical-class conversion holds (unchanged since previous pass). CR-01 (Nav chevron mirror-inversion) and the original WR-01 (dropdown panel `right:0`) are confirmed fixed (`components/Nav.tsx:209,225`). But a **new, confirmed, unfixed bidi-isolation gap** (this cycle's 73-REVIEW.md WR-01) remains live on `/ar/routes/prague-vienna` — one of the phase's own 5 D-10 QA pages — and repeats across all ~30 route pages by design (73-08/73-09 explicitly excluded these fields from the sweep). See Gaps. |
| 3 | ru/es/fr and English-root output byte-for-byte unchanged (SC#4 part, D-12) | ✓ VERIFIED | `git status --porcelain` clean on `messages/{en,ru,es,fr}.json` and `content/{routes,pages,blog}/{en,ru,es,fr}` before and after this session's checks; `tests/i18n-completeness.test.ts` + `tests/middleware-i18n.test.ts` re-run this session — 46/46 passed. |
| 4 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font, zero Noto bytes on en/ru/es/fr, no cross-family leak (SC#3 part, FONT-01) | ✓ VERIFIED | `components/SiteChrome.tsx:142-149` re-read this session — single `localeFontClassName` ternary, unchanged, structurally guarantees exactly one Noto family per ar/hi/zh render and none for en/ru/es/fr. Matches 73-RTL-QA.md Task 2's full (not sampled) build-output count of 0/32 Noto-carrying files across en/ru/es/fr. |
| 5 | ar/hi/zh glyphs render without tofu/fallback boxes (SC#3 part, FONT-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Delivery verified (truth 4). 73-RTL-QA.md Task 3 now documents a detailed, credible live-browser walkthrough (screenshots, quoted rendered Arabic/Hindi/Chinese strings, one genuine FAIL found-and-fixed) rather than a scaffold. Still routed to human verification per policy — visual glyph rendering is not independently re-observable by this verifier without a browser. |
| 6 | RTL visual QA on /ar/ passes; QA-sampling recorded (SC#4 part, D-10/D-11) | ✗ **FAILED** (QA-sampling half verified; visual-QA half contains a factually incorrect PASS) | `i18n/QA-REPORT.md` substantive, per-locale — QA-sampling half VERIFIED (unchanged from previous pass). But `73-RTL-QA.md`'s Group 3 row for the route-page template asserts "every price token is bidi-isolated" — directly contradicted by the confirmed unprotected tokens in `openingParagraphs`/`faqs` on the same page (`prague-vienna`) that row certifies. Same root cause as truth #2. |

**Score:** 4/6 truths verified (1 present, behavior-unverified; 2 failed — see Gaps)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `content/routes/{ar,hi,zh}/*.json` (30 files each, incl. the 6 credit-blocker files) | Complete, real-translated content | ✓ VERIFIED | 0 missing keys vs en (full structural diff, not just `--check`'s messages/*.json scope); real-script prose confirmed in all 6 flagged files |
| `content/pages/{ar,hi,zh}/corporate.json` | Complete, real-translated content | ✓ VERIFIED | 0 missing keys vs en; real-script prose confirmed (Arabic/Hindi headline sampled) |
| `components/Nav.tsx` | Correct dir-aware chevron + dropdown positioning | ✓ VERIFIED | CR-01 and original-WR-01 both fixed and confirmed present |
| `app/globals.css` `.wordmark` | LTR-forced wordmark, no flex-reversal under RTL | ✓ VERIFIED | `direction: ltr` present with an explanatory comment referencing this closure cycle |
| `tests/rtl-backstop.test.ts` | Machine backstop for CR-01/WR-01/WR-02/WR-03/WR-05/CR-02 fixes | ⚠️ **WEAK ON CR-02** | 46/46 passing (re-run confirmed this session), but the CR-02 assertions are file-level presence checks, not per-field — they do not detect the openingParagraphs/faqs gap (see Gaps) |
| `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` | Completed D-10/D-11 visual QA record | ⚠️ **PERFORMED BUT ONE ROW FACTUALLY WRONG** | No longer a scaffold — records a real walkthrough with a genuine FAIL-found-and-fixed (wordmark), but Group 3's route-page row asserts a bidi-isolation completeness that the code does not have |
| 30 route pages (`app/[locale]/routes/prague-*/page.tsx`) | openingParagraphs/faqs bidi-protected where they embed price tokens | ✗ **GAP** | Confirmed unprotected across the sweep by design (73-08/73-09 explicitly excluded these fields) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `getLocale()` (SiteChrome) | `<body>` className | `localeFontClassName` ternary | ✓ WIRED | Re-confirmed unchanged |
| `dir="rtl"` (Nav) | chevron rotation | JS inline `transform` | ✓ WIRED, CORRECT | CR-01 fix confirmed (`rotate(${menuOpen ? 180 : 0}deg)`, no isRtl addend) |
| `dir="rtl"` (Nav) | dropdown panel position | `insetInlineEnd` | ✓ WIRED, CORRECT | Confirmed at `components/Nav.tsx:225` |
| `content.openingParagraphs`/`faqs[].a` (route pages) | `<bdi>` isolation | `interpolateBidi()` | ✗ **NOT WIRED** | Still routed through plain `interpolate()` on all ~30 route pages; confirmed live on `/ar/routes/prague-vienna` |
| `content.hero.intro`/`cta.headingItalic`/`v.price`/`c.price` (route pages) | `<bdi>` isolation | `interpolateBidi()` / inline `<bdi>` | ✓ WIRED, CORRECT | Confirmed unchanged from 73-08/73-09 |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|--------------|--------|----------|
| TR-02 | 73-01, 73-02, 73-06, 73-11 | Complete translations across every catalog and content file for ru/es/fr/ar/hi/zh | ✓ SATISFIED | `--check` passes for messages; full structural key-diff on content/routes+pages shows 0 missing keys, including the 6 credit-blocker files; real-script content confirmed |
| RTL-01 | 73-01, 73-03..73-10, 73-11, 73-12 | Arabic renders RTL; physical-direction classes converted; no mirrored-layout breakage | ✗ **BLOCKED** | CR-01/original-WR-01 fixed. But the confirmed, live, unprotected-bidi-token gap on `/ar/routes/prague-vienna` (a D-10 page) and ~29 other route pages means "no mirrored-layout breakage" / "no reversed token" is not yet true |
| FONT-01 | 73-01, 73-06, 73-12 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font | ⚠️ PARTIALLY SATISFIED | Delivery wiring fully verified programmatically (unchanged, correct). Tofu-free glyph rendering has a detailed but not independently-reconfirmed QA record — routed to human sign-off |

REQUIREMENTS.md currently marks RTL-01 and FONT-01 as `[x]` complete. This verifier's finding: RTL-01 should remain open (the bidi gap is a live, confirmed, in-scope defect on a D-10 page), and FONT-01 should stay flagged pending an independent human tofu check, even though the underlying QA record for it is now substantially stronger than the previous pass.

No orphaned requirements — RTL-01, FONT-01, TR-02 are the full set mapped to Phase 73, and all three are declared across the twelve plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/[locale]/routes/prague-vienna/page.tsx` (and ~29 siblings) | 53, 65 | `interpolate()` (not `interpolateBidi()`) on `openingParagraphs`/`faqs[].a`, which demonstrably embed price tokens in Arabic prose on the live content | 🛑 Blocker | Fails RTL-01/D-11 "no reversed price/phone/time token" on a D-10 QA page |
| `tests/rtl-backstop.test.ts` | 140-146 | CR-02 backstop checks file-level presence of `interpolateBidi`/`<bdi>`, not per-field correctness | ⚠️ Warning | Gives false confidence — 46/46 green while the WR-01 gap is live |
| No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any phase-touched file this session | — | — | — | Clean |

### Credit-Blocker Cross-Check (WINDOWS #8 / deferred-items.md)

Directly verified against the codebase (structural key-diff + real-script sampling, described under truth #1 and the Required Artifacts table): the 6 route files (`prague-marianske-lazne`, `prague-olomouc`, `prague-pardubice`, `prague-plzen`, `prague-wroclaw`, `prague-zlin`) and `content/pages/{ar,hi,zh}/corporate.json` flagged by 73-11-SUMMARY.md / WINDOWS #8 / deferred-items.md as "left untranslated" by the Anthropic credit exhaustion are **not** in fact untranslated — they were fully populated with real, structurally complete Arabic/Hindi/Chinese content back in 73-02 (commit `f6f9af5`), and `git diff` confirms zero writes to them since. The credit exhaustion blocked a re-sync attempt on a small number of already-translated, pre-existing "stale" units inside these files (the pipeline discovered them while walking the full EN source tree for an unrelated key) — not a completeness gap. **This does not block SC#1** as originally feared in the known-context brief; it is correctly logged as an open, non-blocking quality item (WINDOWS #8) and should stay open for the eventual re-sync, but its current wording ("6 route files... left untranslated") overstates the actual state of the content and should be clarified.

**Note on verification methodology:** this cross-check was performed via `--check` (read-only) plus a custom structural key-diff script — not via `node scripts/i18n-translate.mjs --dry-run`. That flag was tried once during this session and was discovered to be a **real-write fixture/stub-translator mode**, not a no-op preview — it overwrote several already-correct AR/HI/ZH translations (including the very `whyBook.headingLine1` field this cross-check is about) with `[AR]`/stub placeholder text. The mutation was caught immediately via `git status`/`git diff` and reverted via `git stash` (not `git checkout`, which the sandbox's destructive-action guard blocked) before any further work; the working tree was confirmed byte-identical to `HEAD` afterward. No commit was made with the mutated state. This is recorded here for transparency and as a warning for any future verifier or engineer: **do not run `i18n-translate.mjs --dry-run` against the real repo tree** — it is not a dry run despite the flag name.

### Gaps Summary

Both gaps from the previous VERIFICATION.md are genuinely closed: CR-01 (chevron mirror inversion) is fixed and backstop-tested, and the D-10/D-11 visual QA scaffold has been executed into a real walkthrough with one real bug found and fixed (wordmark reversal). That part of the gap-closure cycle worked as intended.

However, the phase's own concurrent code review (73-REVIEW.md, committed this cycle) surfaced a new, confirmed, unfixed defect: `openingParagraphs` and `faqs[].a` on essentially every route page (30/30 by pattern match) render embedded DNT price tokens through the plain `interpolate()` helper with zero `<bdi>` isolation, while sibling fields on the same pages (hero intro, CTA heading, vehicle price) are correctly protected. This was deliberately out of scope for 73-08/73-09's sweep (confirmed by their own SUMMARYs: "FAQ/metadata interpolate() calls are explicitly excluded from this sweep per the plan") and no later plan (73-10, 73-11, 73-12) picked it up. It is live on `/ar/routes/prague-vienna` — one of the phase's own 5 D-10 representative QA pages — so the D-10/D-11 checklist's Group 3 "PASS" for the route-page row is factually incorrect for this specific field pair, even though the walkthrough that produced it appears to have been genuinely performed (unlike last cycle's scaffold).

The credit-exhaustion item (WINDOWS #8) that the known-context brief flagged as a possible SC#1 blocker turned out, on direct inspection, not to be one — the affected files are complete and real, just missing a re-sync of a handful of already-translated units. This is good news that reduces the phase's risk surface, but it does not offset the newly confirmed RTL-01 gap.

**Recommended path:** switch `openingParagraphs`/`routeNarrative.paragraphs`/`faqs[].a` interpolation to `interpolateBidi()` on all ~30 route pages (mirroring the 73-08/73-09 pattern already proven for the other fields, keeping the FAQPage JSON-LD `text` field on plain `interpolate()`), strengthen `tests/rtl-backstop.test.ts`'s CR-02 assertions to check the specific render call sites rather than file-level presence, and re-run the Group 3 D-11 check on `/ar/routes/prague-vienna`/`prague-berlin` to correct `73-RTL-QA.md`. This is a mechanical, well-scoped fix — the pattern, the helper, and the file list are all already established by 73-08/73-09.

---

_Verified: 2026-09-19T21:16:58Z_
_Verifier: Claude (gsd-verifier)_
