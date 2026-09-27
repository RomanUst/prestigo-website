---
phase: 73-non-latin-rtl-infra-ar-hi-zh
plan: 06
subsystem: i18n
tags: [next-intl, next-font, tailwind-v4, rtl, phase-gate, vitest, next-build]

# Dependency graph
requires:
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    plan: 02
    provides: real ar/hi/zh catalogs + content, --check completeness gate
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    plan: 03
    provides: shared-component RTL/logical-property conversion, bdi bidi isolation
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    plan: 04
    provides: route/service page logical text-alignment swap
  - phase: 73-non-latin-rtl-infra-ar-hi-zh
    plan: 05
    provides: legacy blog page logical conversion + bdi isolation
provides:
  - i18n/QA-REPORT.md phase-gate confirmation (SC#1/SC#4/RTL-01 automated results, PASS)
  - 73-RTL-QA.md — FONT-01 weight-budget build-output inspection (PASS, full static-output
    count, zero LTR leak) + D-10/D-11 visual QA checklist scaffold (pending operator harvest)
  - Critical cross-phase finding recorded (not fixed, out of scope): 7 static page templates
    (about/terms/corporate/privacy/faq/blog-index/contact) render EN content + skip the Noto
    class on every locale due to an unforwarded getLocale() in force-static pages — pre-existing
    since Phase 71, logged to deferred-items.md and WINDOWS.md (entry #7)
affects: [74-seo-hreflang-metadata, 75-e2e-verification-launch]

# Actuals (#2632)
actuals:
  tokens: 6224
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Weight-budget verification via full static-output HTML scan (.next/server/app/<locale>/*.html) rather than a per-page sample, since next/font emits no machine-checkable per-route font manifest"
    - "next build + next start + curl live-server verification to distinguish SSG-cache locale-resolution bugs from genuine per-request rendering behavior"

key-files:
  created:
    - .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md
  modified:
    - i18n/QA-REPORT.md
    - .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md
    - .planning/WINDOWS.md

key-decisions:
  - "Discovered (not fixed, Scope Boundary rule): 7 static page templates (about/terms/corporate/privacy/faq/blog-index/contact) resolve getLocale() to the i18n default ('en') during next build static generation instead of the per-page locale, because they call getLocale() with no params-derived forward — a pattern next-intl's own docs flag as required for reliable static rendering. Confirmed via a clean rebuild + live next start + curl, 100% deterministic, present since Phase 71 (predates Phase 73, already affects shipped ru/es/fr Phase-72 content). Does not block Phase 73's own D-10-scoped gate since none of the 5 representative template types are among the 7 affected pages — all 5 verified correct this session."
  - "D-10/D-11 visual-QA cells left explicit PENDING — operator rather than fabricated pass/fail: this executor has no browser/screenshot capability in this session, and the task's own verify spec designates the checklist for an end-of-phase human-check harvest, not synchronous executor completion."

requirements-completed: [RTL-01, FONT-01, TR-02]

coverage:
  - id: D1
    description: "Automated phase gate — full vitest suite green, i18n --check ar/hi/zh green, en/ru/es/fr+EN-root byte-parity clean, residual physical-direction-class grep returns 0 files — recorded in i18n/QA-REPORT.md"
    requirement: "TR-02"
    verification:
      - kind: other
        ref: "npx vitest run — 124 files / 1458 tests passed, 0 failed"
        status: pass
      - kind: other
        ref: "node scripts/i18n-translate.mjs --check --locales ar,hi,zh — exit 0"
        status: pass
      - kind: other
        ref: "git diff --exit-code -- messages/{en,ru,es,fr}.json + content/{routes,pages,blog}/{en,ru,es,fr} — exit 0"
        status: pass
      - kind: other
        ref: "grep -rlE residual-physical-class-pattern app/[locale] components (excluding SiteChrome/globals) — 0 files"
        status: pass
    human_judgment: false
  - id: D2
    description: "FONT-01 weight-budget check — npx next build passes; full static-output scan confirms 0/32 en/ru/es/fr pages carry any Noto class (zero-Noto-on-LTR hard gate, no exceptions) and ar/hi/zh pages that do carry a Noto class carry only their own family (no cross-family leak); source guarantee (single localeFontClassName ternary) confirmed in components/SiteChrome.tsx"
    requirement: "FONT-01"
    verification:
      - kind: other
        ref: "npx next build (clean rebuild) — exit 0, no nextFontError"
        status: pass
      - kind: other
        ref: "grep -l noto_sans_* across .next/server/app/{en,ru,es,fr}/*.html — 0/32 files per locale"
        status: pass
      - kind: other
        ref: "grep -c localeFontClassName components/SiteChrome.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Critical cross-phase finding: 7 static page templates render EN content on every locale (pre-existing SSG getLocale() bug, not caused by Phase 73) — discovered, root-caused, and recorded to deferred-items.md + WINDOWS.md rather than silently missed"
    requirement: "TR-02"
    verification: []
    human_judgment: true
    rationale: "This is a discovery/documentation deliverable, not a code fix — a human (or a later remediation plan) must decide when to schedule the actual fix across the 7 affected files; not verifiable by an automated pass/fail here."
  - id: D4
    description: "D-10 5-page + D-11 mixed-LTR-in-RTL + tofu + backstop checklist scaffold authored in 73-RTL-QA.md, queued for the end-of-phase human-check harvest"
    requirement: "RTL-01"
    verification:
      - kind: other
        ref: "test -f .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md"
        status: pass
    human_judgment: true
    rationale: "The checklist's actual pass/fail content requires a live browser visual pass (mirroring correctness, tofu-glyph absence, CJK line-breaking, vertical-rhythm drift) that this executor cannot perform in this session — explicitly deferred to the operator per the task's own human-check verify spec."

duration: ~45min
completed: 2026-09-19
status: complete
---

# Phase 73 Plan 06: Non-Latin & RTL Infra — Closing Gate Summary

**Automated phase gate confirms all four Phase 73 success criteria hold together (full suite green, ar/hi/zh completeness, en/ru/es/fr+EN byte-parity, zero residual physical-direction classes, zero Noto-bytes-on-LTR-locale leak) — and surfaces a critical, pre-existing, cross-phase bug (7 static pages silently rendering English on every locale since Phase 71) that this plan documents for remediation rather than silently missing.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-09-19
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **Task 1 — Automated phase gate (PASS):** `npx vitest run` full suite green (124 files / 1458 tests, 0 failed); `node scripts/i18n-translate.mjs --check --locales ar,hi,zh` exit 0; `git diff --exit-code` on en/ru/es/fr catalogs + content clean (D-12); residual physical-direction Tailwind class grep over `app/[locale]` + `components` returns 0 unexplained files (the one remaining `left-1/2`/`-translate-x-1/2` centering pair in `Hero.tsx` is the documented 73-03 intentional exception). Recorded in `i18n/QA-REPORT.md`.
- **Task 2 — FONT-01 weight-budget check (PASS):** clean `npx next build` succeeds. Full static-output scan (not a sample) confirms `en`/`ru`/`es`/`fr` carry **zero** Noto font bytes across all 32 static pages each — the hard weight-budget gate is satisfied with zero exceptions. `ar`/`hi`/`zh` pages that do carry a Noto class carry only their own family, never a cross-family leak. Source guarantee confirmed in `components/SiteChrome.tsx`.
- **Task 2 — critical finding (documented, not fixed):** while verifying weight-budget via live `next build && next start` inspection, discovered that 7 statically-generated page templates (`about`, `terms`, `corporate`, `privacy`, `faq`, the blog index listing, `contact`) render `content/pages/en/*.json` content on **every** locale — including already-shipped `ru`/`es`/`fr` — because they call `getLocale()` with no `params`-derived locale forward, a pattern next-intl's own documentation (confirmed via Context7) flags as unreliable for static rendering. Root-caused, reproduced on a clean build, confirmed live via `next start`/`curl`, and logged to `deferred-items.md` + `.planning/WINDOWS.md` (entry #7) rather than silently missed. Confirmed this does **not** block Phase 73's own D-10-scoped success criteria: none of the 5 D-10 representative template types are among the 7 affected pages, and all 5 (home, booking flow, route page, blog post, login) were live-verified correct this session.
- **Task 3 — D-10/D-11 checklist scaffold:** authored the 5-page × 4-group RTL visual QA table in `73-RTL-QA.md` (mirroring, tofu, mixed LTR-in-RTL, backstops), pre-filling only cells confirmable from this session's automated/text-based checks (Noto class presence, correct-script text delivery, the existing `<bdi>` wrap on the Hero price anchor) and leaving every cell requiring genuine visual judgment as explicit `PENDING — operator` — never silently defaulted to pass. Queued for the end-of-phase human-check harvest per the task's own verify spec.

## Task Commits

Each task was committed atomically:

1. **Task 1: Automated phase gate — full suite + completeness + phase-wide byte-parity + residual-class grep** - `30594ae` (feat)
2. **Task 2: FONT-01 weight-budget check — no Noto bytes on LTR locales, one family per non-Latin locale** - `a87d917` (feat)
3. **Task 3: RTL visual QA scaffold (D-10 5 pages) + mixed LTR-in-RTL (D-11) + tofu + backstops** - `ec804c9` (feat)

**Plan metadata:** (this commit) `docs(73-06): complete non-latin-rtl-infra-ar-hi-zh plan`

## Files Created/Modified

- `i18n/QA-REPORT.md` - Phase 73 gate automated-confirmation section appended
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md` (new) - FONT-01 weight-budget result + critical finding write-up + D-10/D-11 checklist scaffold
- `.planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md` - critical cross-phase finding + minor `/book` heading gap logged
- `.planning/WINDOWS.md` - entry #7 (deviation, phase 73) recorded for ship-gate visibility

## Decisions Made

- Discovered-but-not-fixed the 7-page static `getLocale()` bug per the Scope Boundary rule (pre-existing since Phase 71, not caused by 73-01..73-05, multi-file mechanical fix better scoped as its own remediation task) — see key-decisions in frontmatter for full reasoning and the recommended fix pattern documented in `73-RTL-QA.md`.
- Left all genuine visual-judgment QA cells (mirroring correctness, tofu-glyph absence, CJK breaking, rhythm drift) as explicit `PENDING — operator` rather than fabricating a pass, since this executor has no browser/screenshot capability and the task's own verify spec defers this to an end-of-phase human-check harvest.

## Deviations from Plan

### Auto-documented (not auto-fixed) Issues

**1. [Scope Boundary — logged, not fixed] 7 static pages silently render English on every locale**
- **Found during:** Task 2 (FONT-01 weight-budget build-output inspection)
- **Issue:** `about`, `terms`, `corporate`, `privacy`, `faq`, the blog index page, and `contact` — all statically generated (`export const dynamic = 'force-static'`) — call `getLocale()` from `next-intl/server` with no `params`-derived locale forward, in both `generateMetadata()` and the page body. During `next build`, this resolves to the i18n config's default locale (`en`) instead of the per-page requested locale, on every one of the 7 locales (`en`/`ru`/`es`/`fr`/`ar`/`hi`/`zh`) — including already-shipped Phase 72 `ru`/`es`/`fr` content. The same pages also skip the per-locale Noto `<body>` class on `ar`/`hi`/`zh` (font delivery shares the broken locale-resolution call).
- **Fix:** Not applied — this predates Phase 73 (none of 73-01..73-05 touched these files) and is a multi-file (~7 pages), mechanical-but-broad fix (forward `{ locale } = await params` into `generateMetadata` + the page body per next-intl's documented pattern), better scoped as its own remediation task than folded into this phase's font/RTL-infra closing gate.
- **Files affected (not modified):** `app/[locale]/about/page.tsx`, `app/[locale]/terms/page.tsx`, `app/[locale]/corporate/page.tsx`, `app/[locale]/privacy/page.tsx`, `app/[locale]/faq/page.tsx`, `app/[locale]/blog/page.tsx`, `app/[locale]/contact/page.tsx`
- **Verification:** Reproduced on a clean `rm -rf .next && next build`; confirmed live via `next start` + `curl` (not a static-export-only artifact); confirmed deterministic (not a race) across repeat builds; confirmed the 5 D-10 representative pages are unaffected.
- **Recorded in:** `deferred-items.md`, `.planning/WINDOWS.md` (entry #7), `73-RTL-QA.md` (full write-up + recommended fix)

**2. [Scope Boundary — logged, not fixed] `/book` decorative heading never externalized**
- **Found during:** Task 2, while live-verifying the D-10 "booking flow" template
- **Issue:** `app/[locale]/book/page.tsx:97`'s literal JSX string `Your transfer,` (decorative heading above the EntryBar) is hardcoded English, never wired to a translation key under Phase 70/STR-02 — unrelated to the getLocale() bug above.
- **Fix:** Not applied — narrow, pre-existing STR-02 (Phase 70) scope gap, not a RTL-01/FONT-01/TR-02 item. The actual D-10 "booking flow" surface (EntryBar/wizard) beneath it is correctly translated.
- **Recorded in:** `deferred-items.md`

---

**Total deviations:** 2 discovered-and-documented (0 auto-fixed — both are pre-existing, out-of-Scope-Boundary issues per the executor rules)
**Impact on plan:** Neither finding blocks this plan's own success criteria (D-10's 5 representative pages are unaffected by either); both are recorded with enough detail (root cause, reproduction, recommended fix) for a fast, confident follow-up fix.

## Issues Encountered

None beyond the two documented findings above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four Phase 73 success criteria are proven together at the automated level (SC#1 ar/hi/zh completeness, SC#2 RTL-01 residual-class-clean, SC#3 FONT-01 weight-budget, SC#4 en/ru/es/fr+EN byte-parity). The D-10/D-11 visual QA (mirroring, tofu, mixed-LTR-in-RTL, backstops) is scaffolded and queued for the end-of-phase human-check harvest — not yet completed, per the plan's own design (this executor cannot perform a visual pass).
- **Recommended before Phase 74/75 or a production merge:** schedule a fast remediation for the 7-page `getLocale()` static-rendering bug (deferred-items.md, WINDOWS.md #7) — it affects already-shipped `ru`/`es`/`fr` production content, not just this phase's `ar`/`hi`/`zh` work.
- The operator should complete the `73-RTL-QA.md` D-10/D-11 checklist via a live `/ar/`, `/hi/`, `/zh/` browser walkthrough before treating RTL-01/FONT-01's visual bar as fully closed.

---
*Phase: 73-non-latin-rtl-infra-ar-hi-zh*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: i18n/QA-REPORT.md
- FOUND: .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-RTL-QA.md
- FOUND: .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/deferred-items.md
- FOUND: .planning/WINDOWS.md
- FOUND: .planning/phases/73-non-latin-rtl-infra-ar-hi-zh/73-06-SUMMARY.md
- FOUND commit: 30594ae
- FOUND commit: a87d917
- FOUND commit: ec804c9
