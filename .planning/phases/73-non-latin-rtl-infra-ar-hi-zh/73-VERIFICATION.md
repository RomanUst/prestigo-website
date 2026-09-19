---
phase: 73-non-latin-rtl-infra-ar-hi-zh
verified: 2026-09-19T12:37:31Z
status: gaps_found
score: 4/6 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "/ar/ renders right-to-left with no mirrored-layout breakage (ROADMAP SC#2, RTL-01; 73-01 must_have on the Nav.tsx chevron; 73-06 D-10 prohibition)"
    status: failed
    reason: >
      The Nav.tsx account-menu chevron's JS-computed RTL mirror is a deterministic logic bug that
      inverts the open/closed visual indicator for every `ar` user, on every render of the
      signed-in account menu — one of the phase's own 5 D-10 representative QA pages
      (account/login). transform = rotate((menuOpen?180:0) + (isRtl?180:0)deg): RTL+open =
      180+180 = 360deg ≡ 0deg (visually "closed"); RTL+closed = 0+180 = 180deg (visually "open").
      This was found and documented as CR-01 in 73-REVIEW.md (2026-09-19, same day as the
      SUMMARYs) and confirmed still present in the current codebase at commit 78701bd
      (components/Nav.tsx:211) — no fix commit exists after the review. This directly
      contradicts 73-01-PLAN.md's own must_have truth ("the Nav.tsx inline-style dropdown
      chevron ... points the reader-correct way on /ar/ (D-03)") and 73-06-PLAN.md's phase-gate
      prohibition ("MUST NOT declare the phase complete while a /ar/ QA page shows
      mirrored-layout breakage ... those are bugs, not accepted states (D-10/D-11)").
    artifacts:
      - path: "components/Nav.tsx"
        issue: "Line 211: `transform: rotate(${(menuOpen ? 180 : 0) + (isRtl ? 180 : 0)}deg)` inverts the open/closed chevron state for ar (CR-01, unfixed)."
      - path: "components/Nav.tsx"
        issue: "Line 227: dropdown panel positioned with physical `right: 0` instead of `insetInlineEnd`/isRtl-conditioned value, so it doesn't mirror to the reading-end edge in ar (WR-01, unfixed)."
    missing:
      - "Drop the isRtl branch from the chevron rotation (shape is horizontally symmetric, needs no mirror) or use scaleX(-1) if a genuine mirror-needing shape is substituted."
      - "Convert the dropdown panel's `right: 0` inline style to a logical inset (insetInlineEnd: 0) or isRtl-conditioned value."
  - truth: "RTL visual QA on /ar/ passes (ROADMAP SC#4; 73-06 must_have D-10/D-11 checklist)"
    status: failed
    reason: >
      73-RTL-QA.md's own Task 3 explicitly records this as NOT done — every mirroring/tofu/
      mixed-content cell across all 5 D-10 pages is marked "PENDING — operator," and the file's
      own harvest note states the checklist is "authored and committed as scaffold," with the
      actual pixel-level walkthrough "queued for the end-of-phase human-check harvest," not
      performed. The ROADMAP success criterion requires "RTL visual QA on /ar/ passes" as an
      already-true fact, not a scaffold. Independently, the code review (73-REVIEW.md) found two
      concrete defects (CR-01 chevron inversion on the account/login QA page; CR-02 missing bdi
      isolation on the route/service QA-relevant pages) that a completed visual QA pass would be
      expected to catch — reinforcing that the pass has not actually been run to a clean result.
    artifacts:
      - path: ".planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md"
        issue: "Groups 1 (mirroring), 2 (tofu), 3 (mixed LTR-in-RTL), 4 (backstops) are entirely PENDING — operator; no row has an actual pass/fail visual result."
    missing:
      - "A completed human visual walkthrough of the 5 D-10 pages (or equivalent) with recorded pass/fail per checklist row."
      - "Resolution of CR-01/CR-02 before that walkthrough, since both are on the D-10 page set."
deferred: []
behavior_unverified_items:
  - truth: "/ar/, /hi/, /zh/ render Noto glyphs with no tofu/fallback boxes (ROADMAP SC#3, FONT-01)"
    test: "Load /ar/, /hi/login, /zh/login in a real browser and visually confirm every non-Latin glyph renders via its Noto face (no empty boxes)."
    expected: "No tofu/fallback-glyph boxes on any of the three locales across the 5 D-10 page types."
    why_human: >
      Font *delivery* is programmatically confirmed (build-output inspection: exactly one Noto
      family's CSS variable class is present on <body> per locale, zero Noto bytes ship to
      en/ru/es/fr, no cross-family leak — 73-RTL-QA.md Task 2, independently re-derivable from
      components/SiteChrome.tsx's single localeFontClassName ternary). Whether the delivered font
      actually paints every glyph without tofu is a rendering behavior that only a live browser
      can confirm, and 73-RTL-QA.md itself leaves every tofu-check cell "PENDING — operator."
coincidental_reliance_items: []
human_verification:
  - test: "Load /ar/, /hi/login, /zh/login and confirm no tofu/fallback glyph boxes appear anywhere on the 5 D-10 representative pages."
    expected: "Every ar/hi/zh glyph renders via its Noto face; no empty boxes."
    why_human: "Glyph-level rendering cannot be confirmed by static analysis; 73-RTL-QA.md leaves this PENDING — operator."
  - test: "Complete the D-10/D-11 checklist in 73-RTL-QA.md end to end, including Group 3 (mixed LTR-in-RTL) on /ar/routes/prague-vienna and /ar/services/city-rides, where CR-02 (missing <bdi> isolation) means a reversed price/phone token is a live possibility, not a hypothetical."
    expected: "No reversed price/phone/time token, no mirrored-layout breakage, no clipping/overflow on ar/hi/zh."
    why_human: "Bidi-reversal and layout-breakage are rendering-time behaviors; the plan's own prohibition treats a positive finding here as a bug requiring a fix, not an accepted state."
---

# Phase 73: Non-Latin & RTL Infra (AR, HI, ZH) Verification Report

**Phase Goal:** The three non-Latin locales — Arabic (ar), Hindi (hi), Chinese (zh) — render correctly with real translations, proper non-Latin fonts, and (for Arabic) correct RTL layout. Re-run the Phase 72 pipeline to generate complete ar/hi/zh catalogs + localized content; load Noto Sans Arabic/Devanagari/SC per locale via next/font; audit and convert physical-direction Tailwind classes to logical properties so Arabic mirrors without breakage; EN stays source of truth and ru/es/fr output unaffected.

**Verified:** 2026-09-19T12:37:31Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Complete ar/hi/zh catalogs + localized content generated, 0 missing keys vs en, DNT/glossary/tone enforced (SC#1, TR-02) | VERIFIED | `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` exits 0 ("PASSED — [ar, hi, zh] complete vs messages/en.json"); spot-checked `Nav.items` in messages/{ar,hi,zh}.json — real Arabic/Hindi/Chinese, not English placeholders; `content/blog/{ar,hi,zh}/` populated (4+ MDX files sampled, real script content confirmed in i18n/QA-REPORT.md's sampled diffs) |
| 2 | /ar/ renders RTL: physical-direction Tailwind classes across the layout audited + converted, `dir="rtl"` set for ar, no mirrored-layout breakage (SC#2, RTL-01) | **FAILED** | Mechanical class conversion confirmed clean (`grep -rlE "text-(left|right)"` and `pl-/pr-/ml-/mr-/border-l/border-r` return 0 files across app/[locale]/routes, app/[locale]/services, app/[locale]/blog, and the 5 converted shared components). But `components/Nav.tsx:211`'s chevron RTL-mirror logic deterministically inverts the account-menu open/closed indicator for `ar` (CR-01, confirmed unfixed in current code, see gap below) — this is mirrored-layout breakage on one of the phase's own 5 D-10 QA pages |
| 3 | ru/es/fr and English-root output byte-for-byte unchanged (SC#4 part, D-12) | VERIFIED | `git status --porcelain` clean on messages/{en,ru,es,fr}.json and content/routes/{en,ru,es,fr}; `--check` confirms "EN unchanged, no API calls made"; targeted re-run of `tests/route-page-render.test.tsx` (byte-parity snapshot test) + `tests/i18n-completeness.test.ts` + `tests/middleware-i18n.test.ts` — 47/47 passed |
| 4 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font — correct family per locale, zero Noto bytes on en/ru/es/fr, no cross-family leak (SC#3 part, FONT-01) | VERIFIED | `components/SiteChrome.tsx` confirmed: single `localeFontClassName` ternary (lines 142-149) applies exactly one of `notoArabic.variable`/`notoDevanagari.variable`/`notoSC.variable`/`''`; 73-RTL-QA.md Task 2 build-output inspection (full static-HTML count, not a sample) shows 0/32 en, 0/32 ru, 0/32 es, 0/32 fr files carry any Noto class, and every ar/hi/zh file that does carry one carries only its own family |
| 5 | ar/hi/zh glyphs render without tofu/fallback boxes (SC#3 part, FONT-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Font delivery is verified (truth 4); actual glyph-level rendering requires a live browser. 73-RTL-QA.md leaves every tofu-check cell "PENDING — operator." Routed to human verification. |
| 6 | RTL visual QA on /ar/ passes; QA sampling pass across ar/hi/zh recorded (SC#4 part, D-10/D-11) | **FAILED** (QA-sampling half verified; visual-QA half not done) | `i18n/QA-REPORT.md` exists and is substantive (269 lines, per-locale completeness/leakage/DNT/plural checks + sampled diffs) — QA-sampling half VERIFIED. But `73-RTL-QA.md`'s own Task 3 (D-10/D-11 checklist) is entirely "PENDING — operator" across all 4 groups on all 5 pages — the roadmap SC requires visual QA to have *passed*, not to be scaffolded and pending |

**Score:** 4/6 truths verified (1 present, behavior-unverified; 2 failed — see Gaps)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `messages/{ar,hi,zh}.json` | Complete translated catalogs | ✓ VERIFIED | 0 missing keys, real translated values confirmed |
| `content/{routes,pages,blog}/{ar,hi,zh}/**` | Generated localized content | ✓ VERIFIED | Directories populated, MDX files present and real-script |
| `components/SiteChrome.tsx` | Noto loaders + localeFontClassName wiring | ✓ VERIFIED | Single ternary, correctly wired to `<body>` className |
| `components/Nav.tsx` | Logical classes + correct dir-aware chevron mirror | ⚠️ **STUB LOGIC** | Logical classes converted correctly; chevron mirror logic is present but functionally wrong (CR-01) — dropdown panel positioning still physical (WR-01) |
| 30 route pages + city-rides | text-left/right → text-start/end | ✓ VERIFIED | grep-confirmed 0 residual physical classes |
| 3 blog pages | border-l/pl → border-s/ps, bdi isolation | ✓ VERIFIED (mechanical swap); ⚠️ bdi scope over-broad (WR-05, non-blocking since these 3 pages are EN-only regardless of locale) |
| `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` | Completed D-10/D-11 visual QA record | ⚠️ **SCAFFOLD ONLY** | File exists and is well-structured, but contains no completed visual-QA results — all PENDING |
| `i18n/QA-REPORT.md` | Sampling QA record | ✓ VERIFIED | Substantive, per-locale |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `getLocale()` (SiteChrome) | `<body>` className | `localeFontClassName` ternary | ✓ WIRED | Confirmed by source read |
| `dir="ltr"/"rtl"` (html) | Tailwind logical utilities | native `ms/me/ps/pe/start/end` classes | ✓ WIRED (route/service/blog pages, shared components) | grep-confirmed 0 residual physical classes |
| `dir==='rtl'` | Nav chevron rotation | JS-computed inline `transform` | ⚠️ **WIRED BUT WRONG** | Composes the intended formula, but the formula itself inverts the visual state (CR-01) — a wiring success that produces a functional failure |
| glossary `richTextTags` (price) render sites | `<bdi>` isolation | Hero.tsx pattern | ⚠️ **PARTIAL** | Applied in Hero.tsx and (over-broadly) in 3 static blog pages; **absent** in `app/[locale]/routes/prague-berlin/page.tsx` and `app/[locale]/services/city-rides/page.tsx` — confirmed by `grep -n "bdi"` returning no matches in either file, despite both interpolating live prices into translated Arabic copy via `getRouteContent`/`getPageContent` (CR-02) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/Nav.tsx` | 211 | Logic bug: RTL-mirror formula inverts open/closed chevron state | 🛑 Blocker | Directly fails RTL-01 "no mirrored-layout breakage" on a D-10 QA page (CR-01) |
| `components/Nav.tsx` | 227 | Physical `right: 0` on dropdown panel, not logical/isRtl-aware | ⚠️ Warning | Panel doesn't mirror to reading-end edge in ar (WR-01) |
| `app/globals.css` | 308, 555, 579, 588 | Residual physical `left`/`right`/`text-align: left`/`transform-origin: left` outside the reviewed component/page scope | ⚠️ Warning | skip-link, calendar nav, calendar caption, CTA hover-zoom stay physically anchored under ar (WR-02) |
| `components/TestimonialsCarousel.tsx` | 77-80 | ArrowRight/ArrowLeft keyboard nav not RTL-aware | ⚠️ Warning | Minor a11y/UX inconsistency under ar (WR-03) |
| `components/SiteChrome.tsx` | 170-172 | Hardcoded English "Skip to content" skip-link, not run through `useTranslations` | ⚠️ Warning | Renders English under every locale incl. ar/hi/zh/ru/es/fr (WR-04) — pre-existing i18n gap, not RTL-specific, but touched by this phase's chrome |
| No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any phase-touched file | — | — | — | Clean |

None of the warning-level items above are new findings by this verifier — all are carried forward, unresolved, from `73-REVIEW.md` (same-day code review, no fix commits found afterward).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| TR-02 | 73-01, 73-02, 73-06 | Complete ru/es/fr/ar/hi/zh translations across every catalog and content file | ✓ SATISFIED | `--check` passes for ar/hi/zh; ru/es/fr previously shipped (Phase 72); content spot-checked real-script |
| RTL-01 | 73-01, 73-03, 73-04, 73-05, 73-06 | Arabic renders RTL; physical-direction classes (~42 files) audited/converted; no mirrored-layout breakage | ✗ BLOCKED | Mechanical conversion complete and clean, but the chevron logic bug (CR-01) is a confirmed instance of "mirrored-layout breakage" on a D-10 representative page, and the D-10 visual QA that would certify "no breakage" has not been run to completion |
| FONT-01 | 73-01, 73-06 | Noto Sans Arabic/Devanagari/SC loaded per locale via next/font | ⚠️ PARTIALLY SATISFIED | Delivery wiring fully verified programmatically; tofu-free glyph rendering (the requirement's actual visible outcome) is unverified — routed to human check |

REQUIREMENTS.md currently marks all three of TR-02/RTL-01/FONT-01 as `[x]` complete — this verifier's finding contradicts that for RTL-01 (and partially for FONT-01) and recommends REQUIREMENTS.md not be left checked until CR-01 is fixed and the D-10/D-11 QA is actually completed.

No orphaned requirements found — RTL-01, FONT-01, TR-02 are the full requirement set mapped to Phase 73 in REQUIREMENTS.md, and all three are claimed across the six plans.

### Gaps Summary

Two blocking gaps, both traceable to the same root cause: the phase's own code review (`73-REVIEW.md`, authored the same day as the plan SUMMARYs) found two BLOCKER-level RTL-correctness defects (CR-01 Nav chevron inversion, CR-02 missing bdi isolation on the pages that actually render translated Arabic prices) and five WARNING-level residuals — none of which have a fix commit after the review. The phase's own D-10/D-11 visual-QA checklist (`73-RTL-QA.md`) was authored as a scaffold with the explicit intent that a human operator complete it before the phase could be "fully verified," and it has not been completed. Both the translation-generation pipeline (TR-02) and the font-delivery wiring (FONT-01's mechanical half) are solid and independently re-verified in this pass. The gap is entirely in the RTL-correctness half of the phase (RTL-01) plus the deferred FONT-01 visual confirmation, both of which the phase's own artifacts (the review, the QA scaffold) already flag as open — this verification does not surface new problems, it confirms the phase's own flagged problems were never closed out.

**Recommended path:** fix CR-01 (drop the isRtl branch from the chevron rotation) and CR-02 (add `<bdi>` at the interpolated-price render sites in `prague-berlin/page.tsx` and `city-rides/page.tsx`, then audit the other 29 route pages for the same gap per the review's own recommendation), then complete the 73-RTL-QA.md D-10/D-11 human walkthrough. WR-01 through WR-05 are lower-severity but should be swept into the same closure plan since they're already fully diagnosed with fixes proposed in 73-REVIEW.md.

---

_Verified: 2026-09-19T12:37:31Z_
_Verifier: Claude (gsd-verifier)_
