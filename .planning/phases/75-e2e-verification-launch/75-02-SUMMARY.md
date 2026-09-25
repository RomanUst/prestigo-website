---
phase: 75-e2e-verification-launch
plan: 02
subsystem: testing
tags: [playwright, typescript-compiler-api, i18n, qa-scripts, en-leak-audit]

requires:
  - phase: 75-e2e-verification-launch (plan 01)
    provides: scripts/qa/ Python Playwright QA-script style (overflow_audit.py skeleton, consent init script, analytics-abort route)
provides:
  - "scripts/qa/en_leak_static.mjs -- AST static scan (TypeScript compiler API) for hardcoded EN JSX text/attrs and locale-dropping navigation"
  - "scripts/qa/en_leak_allowlist.json -- single reasoned D-09/D-05/Phase-74-D-09 allowlist read by both audit layers"
  - "scripts/qa/en_leak_rendered.py -- Playwright rendered-layer scan (Latin-run detection ru/ar/hi/zh, EN-diff es/fr, internal-link locale check)"
  - "75-EN-LEAK-AUDIT.md -- complete pre-fix leak inventory (static: 703 findings/89 files; rendered: 6 locales x 26 pages, 2003 text + 1404 link leaks), each row mapped to an owning fix plan (75-06..75-16) or an explicit UNOWNED heading"
affects: [75-06, 75-07, 75-08, 75-09, 75-10, 75-11, 75-12, 75-13, 75-14, 75-15, 75-16, 75-20 (final re-verification re-runs both scanners for a before/after diff)]

actuals:
  tokens: 18200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "TypeScript compiler API static AST scan via createRequire(import.meta.url) -- no new npm dependency, reuses the already-installed typescript devDependency"
    - "One allowlist file (scripts/qa/en_leak_allowlist.json) read by both an .mjs scanner and a .py scanner -- single source of D-09/D-05/DNT/place/tier exemptions across the two audit layers"
    - "Ancestor-chain visibility walk (isHiddenByAncestor) in a Playwright page.evaluate() to defeat opacity/pointer-events-toggled always-mounted overlays -- getComputedStyle(el).opacity only reports an element's OWN opacity, never a composited ancestor's"
    - "staticIgnoreFiles allowlist entries carry an optional per-rule 'rules' array so a file's text findings (R1/R2) can be suppressed while its navigation findings (R3) remain checked (D-05 book/confirmation)"

key-files:
  created:
    - scripts/qa/en_leak_static.mjs
    - scripts/qa/en_leak_allowlist.json
    - scripts/qa/en_leak_rendered.py
    - tests/en-leak-static.test.ts
    - tests/fixtures/en-leak/leaky.tsx
    - tests/fixtures/en-leak/clean.tsx
    - .planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md
  modified:
    - .gitignore

key-decisions:
  - "R4 (object-literal title/body/q/a/name/description leaves) is review-only and never fails the CLI exit code -- it surfaces genuine content-model leaks (book/multi-day EXAMPLES, fleet/routes FAQ arrays) for the fix plans without conflating them with proven JSX-rendered R1/R2/R3 defects"
  - "Rendered-scan page set fixes two concrete controls: 'beyond-transport-luxury-chauffeur-service-prague' (an MDX post translated in all 7 locales -- a translated-clean positive control) and 'prague-airport-to-city-center' (one of the 3 D-09 EN-only JSX_POSTS -- an allowlisted-not-leaked control), plus a deliberately-missing URL as an empty/404-page edge case"
  - "es/fr use a stricter 3-word byte-identical-to-EN diff rule (both are Latin-script, so a Latin run alone proves nothing); ru/ar/hi/zh use a 2-word any-Latin-run rule (Latin script itself is inherently suspicious there) -- this is why es/fr totals are consistently lower per page without being under-scanned"
  - "components/admin/** is walked (it lives under components/) but every finding there is bucketed under an explicit UNOWNED heading, never assigned a Phase 75 fix plan, per STATE.md's 'Do NOT localize app/admin/*' guardrail"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "AST static EN-leak scanner (R1 JSX text, R2 string-literal attrs, R3 locale-dropping navigation, R4 review-only object-literal leaves) with a reasoned allowlist, proven on fixtures and run over the full repo into a pre-fix inventory"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "tests/en-leak-static.test.ts (9/9 passing -- every rule variant on leaky.tsx, zero findings on clean.tsx)"
        status: pass
      - kind: other
        ref: "node scripts/qa/en_leak_static.mjs --json scripts/qa/out/en_leak_static.json (exit 1, 89 files / 703 findings, includes fleet/page.tsx, book/page.tsx, CorporateForm.tsx, and route-page R3 anchors as required by the plan's acceptance criteria)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rendered-layer production EN-leak scanner (Latin-run detection ru/ar/hi/zh, EN-diff es/fr, internal-link locale check, JSON-LD FAQ/route-Service text, D-09/D-05 page-level allowlisting) run against production into the same pre-fix inventory"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/en_leak_rendered.py https://rideprestigo.com --locales ru,fr (exit 1, ru/fr both present, ru /fleet + /book leaks and /routes/prague-vienna link leaks reproduced as required)"
        status: pass
      - kind: e2e
        ref: "python3 scripts/qa/en_leak_rendered.py https://rideprestigo.com (full 6-locale x 26-page production run, exit 1, 2003 text leaks / 1404 link leaks, D-09 JSX post correctly allowlisted not leaked, D-05 confirmation page text allowlisted with navigation still checked)"
        status: pass
    human_judgment: false

duration: 48min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 02: EN-Leak Audit (D-06 Two-Layer Static + Rendered Scan) Summary

**Two-layer AST + Playwright EN-leak scanner (TypeScript compiler API + Python Playwright) built and run against the repo and production, producing a 703-finding static inventory and a 2003-text/1404-link-leak rendered inventory, both mapped to owning fix plans 75-06..75-16.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-09-25T10:55:00Z
- **Completed:** 2026-09-25T11:43:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `scripts/qa/en_leak_static.mjs`: AST scan of every `.tsx` under `app/[locale]/**` and `components/**` (TypeScript compiler API via `createRequire` — no new dependency) detecting R1 hardcoded JSX text, R2 hardcoded `placeholder`/`aria-label`/`alt`/`title`/`label` attrs, R3 locale-dropping navigation (raw `<a href>`, `next/link` default import, `next/navigation` `useRouter`, `redirect()` with a root-relative literal), and R4 review-only object-literal leaves. Exits 1 on any non-allowlisted R1/R2/R3 finding.
- `scripts/qa/en_leak_allowlist.json`: single reasoned allowlist (dnt/placeNames/tierNames/enFallbackPaths/recordedAsIs/jsonLdByDesign/staticIgnoreFiles/linkExempt), seeded from `i18n/glossary.json` and `lib/routes.ts`, read by both audit layers.
- `tests/en-leak-static.test.ts` + fixtures: 9/9 passing, proving every rule variant fires on `leaky.tsx` and `clean.tsx` (real `useTranslations`/i18n `Link`/`getPathname` output) yields zero findings.
- Full-repo static run: 89 files, 703 findings (R1=270, R2=76, R3=248, R4=109), exit 1 — confirmed on `fleet/page.tsx`, `book/page.tsx`, `CorporateForm.tsx`, and every `routes/prague-*/page.tsx` R3 anchor per the plan's acceptance criteria.
- `scripts/qa/en_leak_rendered.py`: Playwright production scan (overflow_audit.py skeleton) over the 21 key pages plus 5 extras (`/authors/roman-ustyugov`, one MDX post translated in every locale, one D-09 EN-only JSX post, a deliberately-missing URL, `/book/confirmation`). Flags Latin-run leaks on ru/ar/hi/zh, EN-byte-identical leaks on es/fr, and locale-dropping internal links on all 6.
- Full production run: 6 locales × 26 pages, 2003 text leaks / 1404 link leaks, exit 1 — confirmed known planning-time findings (ru `/fleet` 33, `/book` 62, `/routes/prague-vienna` link leaks), and confirmed the D-09/D-05 page-level allowlisting works (text exempted, navigation still checked).
- `75-EN-LEAK-AUDIT.md`: complete static + rendered pre-fix inventory, every row mapped to an owning fix plan (75-06..75-16) or an explicit UNOWNED heading (admin panel, out of i18n scope).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — AST static scanner + allowlist + fixture tests, run into the audit inventory** - `d533ec87` (feat)
2. **Task 2: Rendered production scan + baseline** - `b2209a6f` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `scripts/qa/en_leak_static.mjs` - AST static EN-leak scanner (R1/R2/R3/R4)
- `scripts/qa/en_leak_allowlist.json` - shared reasoned allowlist for both audit layers
- `scripts/qa/en_leak_rendered.py` - Playwright rendered-layer EN-leak scanner
- `tests/en-leak-static.test.ts` + `tests/fixtures/en-leak/{leaky,clean}.tsx` - fixture-proof of every rule variant
- `.planning/phases/75-e2e-verification-launch/75-EN-LEAK-AUDIT.md` - full pre-fix inventory, static + rendered, mapped to owning plans
- `.gitignore` - added `scripts/qa/__pycache__/`, `__pycache__/`, `*.pyc`

## Decisions Made
- R4 findings are review-only (never fail the exit code) — they surface genuine content-model leaks (e.g. `book/multi-day`'s `EXAMPLES` array) without conflating them with proven R1/R2/R3 defects that the CLI gate must catch.
- Chose one MDX post translated in every locale (`beyond-transport-luxury-chauffeur-service-prague`) as a translated-clean positive control, and one of the 3 D-09 JSX posts (`prague-airport-to-city-center`) as an allowlisted-not-leaked control, plus a deliberately-missing URL as the empty/404-page edge case — all three prove the scanner's edge-case behavior rather than just its happy path.
- es/fr use the stricter 3-word byte-identical-to-EN diff rule (both Latin-script, so a bare Latin run proves nothing); ru/ar/hi/zh use the looser 2-word any-Latin-run rule (Latin script itself is inherently suspicious on those locales) — this asymmetry is intentional per D-06, not a scanning gap.
- `components/admin/**` is walked (it lives under `components/`, not excluded like `app/admin`) but every finding is bucketed under an explicit UNOWNED heading rather than assigned to a Phase 75 fix plan, since the admin panel is explicitly out of i18n scope per STATE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LocaleSwitcher's always-mounted dropdown menu produced false-positive leaks on every page**
- **Found during:** Task 2, first production run of `en_leak_rendered.py`
- **Issue:** `components/LocaleSwitcher.tsx`'s dropdown (`role="menu"`) is always mounted in the DOM (opacity/pointer-events toggle, not conditional render — the same underlying fact 75-01's `switcher_audit.py` had to work around). The rendered scanner's text-node walk checked only each element's own `display`/`visibility` via `getComputedStyle`, which does not account for an ancestor's `opacity: 0` — so every locale's endonym label (`Español`, `Français`, `العربية`, …) was flagged as a leak on every single page (29 spurious findings on `ru /` alone).
- **Fix:** Added `isHiddenByAncestor()` to `EXTRACT_JS`, walking the full ancestor chain up to `<body>` checking `display`/`visibility`/`opacity` at every level plus a defensive `role="menu"` check, since `getComputedStyle(el).opacity` only ever reports an element's OWN opacity, never a composited ancestor's effective opacity.
- **Files modified:** `scripts/qa/en_leak_rendered.py`
- **Verification:** Smoke-tested `collect_leaks()` on `ru /` before/after — 29 spurious findings (all `Español`-type endonym leaks) dropped to 20 genuine findings (Hero/booking-section copy) with `'Español' in texts` confirmed `False` after the fix; full 6-locale production run then completed cleanly with only genuine content leaks.
- **Committed in:** `b2209a6f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for the rendered scanner to produce a trustworthy inventory at all — without the fix, every single page/locale combination would have shown 7+ spurious findings, burying the real defects. No scope creep.

## Issues Encountered
None beyond the deviation above (auto-fixed).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The two-layer EN-leak audit (D-06) is committed and its full pre-fix inventory is recorded in `75-EN-LEAK-AUDIT.md`, with every finding mapped to an owning fix plan (75-06..75-16) or an explicit UNOWNED heading. Fix plans can now run `node scripts/qa/en_leak_static.mjs` / `python3 scripts/qa/en_leak_rendered.py` as a green-gate check against their own scope, and plan 75-20 has a concrete before/after reference.
- Not yet verifiable by this rendered scan (recorded, not a gap in this plan): Stripe Elements `locale` and Google Places `language` (D-07 scope) — both render inside third-party iframes/widgets with no DOM text exposure to a static-DOM scan; deferred to the booking E2E layer (plan 75-03/75-05) per RESEARCH.md.
- Ready for: 75-06 through 75-16 (each fixes its owned rows against this inventory, then re-runs both scanners scoped to its own files).

## Self-Check: PASSED

All 7 created files confirmed present on disk; both task commit hashes (`d533ec87`, `b2209a6f`) confirmed in `git log`.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*
