---
phase: 75-e2e-verification-launch
plan: 01
subsystem: testing
tags: [playwright, qa-scripts, i18n, seo, csp, hreflang, jsonld, next-intl]

requires:
  - phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
    provides: lib/seo.ts getAlternates() (hreflang/sitemap single source), LocaleSwitcher.tsx, per-locale JSON-LD inLanguage
provides:
  - "scripts/qa/render_audit.py, switcher_audit.py, hreflang_reciprocity.py, jsonld_audit.py, csp_regression.py -- repeatable production QA harness (D-13)"
  - "scripts/qa/baselines/csp_baseline.json -- golden pre-change CSP snapshot"
  - "75-QA-BASELINE.md -- pre-change production baseline for all 5 scripts"
affects: [75-e2e-verification-launch (later plans re-run this harness), 75-20 (before/after comparison against this baseline)]

actuals:
  tokens: 46000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Python Playwright QA scripts in scripts/qa/, styled after overflow_audit.py: CLI positional base_url + --locales flag, consent localStorage init script, network-abort route for analytics domains, JSON output to scripts/qa/out/"
    - "Stable id-prefix selectors (locale-switcher-trigger-/locale-switcher-menu-) instead of aria-haspopup, to disambiguate from the signed-in account-menu trigger"
    - "wait_for_function on aria-expanded=true before clicking a menuitem in an always-mounted (opacity-toggled) dropdown, instead of a fixed sleep, to eliminate click-race flakiness"
    - "urllib + certifi SSL context for all non-browser QA scripts (hreflang_reciprocity, jsonld_audit, csp_regression) -- the interpreter's default cafile was unset in this environment"
    - "CSP snapshot/diff via urllib with redirects disabled (HTTPRedirectHandler.redirect_request returning None) so the first response's headers -- including on a 307/401 route class -- are captured, with nonce tokens normalized to a fixed placeholder before storage"

key-files:
  created:
    - scripts/qa/render_audit.py
    - scripts/qa/switcher_audit.py
    - scripts/qa/hreflang_reciprocity.py
    - scripts/qa/jsonld_audit.py
    - scripts/qa/csp_regression.py
    - scripts/qa/baselines/csp_baseline.json
    - .planning/phases/75-e2e-verification-launch/75-QA-BASELINE.md
  modified:
    - .gitignore

key-decisions:
  - "hreflang_reciprocity.py's real sitemap structure (one <url> entry per EN canonical, carrying the full 7-locale + x-default cluster inline -- not one entry per locale) does not match RESEARCH.md's naive full-mesh code example; reciprocity was implemented as sitemap-surface-vs-rendered-page-surface cross-check (both sourced from lib/seo.ts getAlternates()) instead, per the plan's own key_links wording"
  - "switcher_audit.py source-locale restriction via --locales; target locale set always stays the full 7-locale list so a restricted run (e.g. --locales ru) still exercises real cross-locale switches"
  - "csp_regression.py's --locales flag is accepted for CLI-shape parity across all 5 scripts but is a no-op -- CSP is not locale-scoped"

requirements-completed: [VER-01]

coverage:
  - id: D1
    description: "render_audit.py: 7 locales x 21 pages -- HTTP status, html lang/dir, canonical, hreflang alternate count, CSP violations; production baseline recorded (147 URLs, 7 findings on /login canonical, all pre-existing)"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/render_audit.py https://rideprestigo.com --locales en,ar (exit 1, /ar entries present)"
        status: pass
      - kind: e2e
        ref: "python3 scripts/qa/render_audit.py https://rideprestigo.com (full 7-locale baseline run, exit 1, 147 URLs checked)"
        status: pass
    human_judgment: false
  - id: D2
    description: "switcher_audit.py (63 switch ops, 0 findings), hreflang_reciprocity.py (63 clusters/417 alternates, 4 pre-existing D-09 EN-only findings), jsonld_audit.py (84 blocks x 7 locales, 0 findings) -- all run against production with baselines recorded"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/hreflang_reciprocity.py https://rideprestigo.com && python3 scripts/qa/jsonld_audit.py https://rideprestigo.com --locales en,ru && python3 scripts/qa/switcher_audit.py https://rideprestigo.com --locales ru (chained, all exit <=1)"
        status: pass
      - kind: e2e
        ref: "python3 scripts/qa/switcher_audit.py https://rideprestigo.com (full 7-source-locale baseline run, exit 0, 63/63 clean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "csp_regression.py --capture/--compare (11 route classes, nonce-normalized) -- golden pre-change CSP baseline committed, compare mode proven self-consistent immediately after capture"
    requirement: VER-01
    verification:
      - kind: e2e
        ref: "python3 scripts/qa/csp_regression.py --capture https://rideprestigo.com && python3 scripts/qa/csp_regression.py --compare https://rideprestigo.com (exit 0, 0 findings) + baseline shape assertion (11 entries, no raw nonce)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-09-25
status: complete
---

# Phase 75 Plan 01: Production QA Harness + Pre-change Baseline Summary

**Five Python Playwright/urllib QA scripts (render, switcher, hreflang reciprocity, JSON-LD, CSP) built in the overflow_audit.py style and run against production to capture the pre-change VER-01 baseline in 75-QA-BASELINE.md.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-25T08:16:00Z
- **Completed:** 2026-09-25T09:00:56Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- `render_audit.py`: 7 locales x 21 pages, checks HTTP status, `<html lang/dir>`, canonical presence, hreflang alternate count, and CSP violations (via a `securitypolicyviolation` listener); aborts GA4/Meta network requests at the route level so a QA run never sends real analytics hits.
- `switcher_audit.py`: 63 LocaleSwitcher switch operations (42 ordered source/target pairs on `/routes/prague-vienna` + 21 rotating-target cases on `/`, `/book`, `/fleet`), locating the trigger/menu by their stable id prefix and synchronizing on `aria-expanded="true"` before clicking a menuitem.
- `hreflang_reciprocity.py`: parses `/sitemap.xml`, verifies structural completeness + `x-default` = EN root form, checks all 417 distinct alternate URLs return 200, and cross-checks 10 sampled clusters' sitemap surface against the EN page's own rendered `<link rel=alternate hreflang>` tags.
- `jsonld_audit.py`: parses every `ld+json` block on 7 locales x 7 pages, checking JSON validity, `@context` presence, `FAQPage.acceptedAnswer.text` string-type (Phase 73 CR-02 regression guard), and route `Service.inLanguage` correctness (`zh` -> `zh-Hans`).
- `csp_regression.py`: `--capture`/`--compare` modes over 11 fixed route classes, nonce-normalized, redirects not followed (captures the first response's headers even on a 307/401 route). Golden pre-change baseline committed at `scripts/qa/baselines/csp_baseline.json`.
- `75-QA-BASELINE.md`: full pre-change production baseline for all 5 scripts, giving plan 75-20 a concrete before/after comparison.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer -- render_audit.py end-to-end + QA output ignore rules** - `6d07f16c` (feat)
2. **Task 2: switcher_audit.py, hreflang_reciprocity.py, jsonld_audit.py + baseline** - `2175ea60` (feat)
3. **Task 3: csp_regression.py + golden pre-change CSP baseline** - `0750e2fc` (feat)

**Plan metadata:** commit hash recorded after this SUMMARY is committed.

## Files Created/Modified
- `scripts/qa/render_audit.py` - 7 locales x 21 pages render/CSP-violation audit
- `scripts/qa/switcher_audit.py` - LocaleSwitcher end-to-end navigation audit
- `scripts/qa/hreflang_reciprocity.py` - sitemap <-> page-level hreflang cross-check
- `scripts/qa/jsonld_audit.py` - JSON-LD structural + inLanguage regression audit
- `scripts/qa/csp_regression.py` - CSP header snapshot/diff, nonce-normalized
- `scripts/qa/baselines/csp_baseline.json` - golden pre-change CSP snapshot (11 route classes)
- `.planning/phases/75-e2e-verification-launch/75-QA-BASELINE.md` - pre-change production baseline for all 5 scripts
- `.gitignore` - added `scripts/qa/out/` and `scripts/qa/.e2e-account.json`

## Decisions Made
- **hreflang reciprocity reinterpreted for the real sitemap shape.** `app/sitemap.ts` emits one `<url>` entry per EN canonical URL carrying the entire 7-locale + x-default cluster inline -- there is no separate sitemap entry per non-EN locale, so RESEARCH.md's naive "does the target's own cluster list this URL back" code example doesn't apply (every non-EN target lookup would spuriously fail, since only EN URLs are top-level sitemap keys). Implemented reciprocity as documented in the plan's own `key_links` instead: cross-checking the sitemap surface against the EN page's own rendered `<link rel=alternate hreflang>` tags for 10 sampled clusters, since both surfaces are generated by the same `lib/seo.ts::getAlternates()` call and can never legitimately diverge.
- **switcher_audit.py restricts the SOURCE locale set via `--locales`, never the target set** -- so a restricted run (e.g. `--locales ru`, used by the plan's own verify command) still exercises real cross-locale switches instead of producing zero pairs.
- **SSL certificate verification fix (Rule 3 -- blocking).** All three urllib-based scripts (`hreflang_reciprocity.py`, `jsonld_audit.py`, `csp_regression.py`) initially failed with `CERTIFICATE_VERIFY_FAILED` against `https://rideprestigo.com` -- this Python 3.14 interpreter has no default CA bundle configured. Fixed by building an explicit `ssl.create_default_context(cafile=certifi.where())` (the `certifi` package is already installed) and passing it through `urlopen`'s `context=` parameter, with a silent fallback to the interpreter default if `certifi` is ever unavailable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] switcher_audit.py false-failure race fixed with an explicit aria-expanded wait**
- **Found during:** Task 2, full 7-source-locale baseline run
- **Issue:** The LocaleSwitcher dropdown (`<div role="menu">`) is always mounted in the DOM (opacity/pointer-events toggle, not conditional render). A fixed `wait_for_timeout` after clicking the trigger produced intermittent false failures (a different (source, target) pair failed on each of two consecutive full runs; the exact same failing pair always succeeded when re-run in isolation), because Playwright's click-actionability retry occasionally raced the trigger's React state update.
- **Fix:** Capture the trigger's own `id` before clicking it, then `page.wait_for_function(...)` polling for `aria-expanded="true"` on that specific element (5s timeout) before locating/clicking the target menuitem, replacing the fixed-timeout heuristic with a definitive synchronization point.
- **Files modified:** `scripts/qa/switcher_audit.py`
- **Verification:** Full 7-source-locale run (63 switch operations) went from 3-4 flaky findings per run to 0 findings, twice in a row after the fix.
- **Committed in:** `2175ea60` (Task 2 commit)

**2. [Rule 3 - Blocking] SSL cafile fix for all urllib-based QA scripts**
- **Found during:** Task 2 (`hreflang_reciprocity.py`), carried into Task 3 (`csp_regression.py`)
- **Issue:** `urlopen()` against `https://rideprestigo.com` raised `CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate` -- this Python 3.14 interpreter (`/Library/Frameworks/Python.framework/Versions/3.14`) has no CA bundle configured at its default `openssl_cafile` path.
- **Fix:** Build an `ssl.create_default_context(cafile=certifi.where())` context at module load (guarded by `try/except ImportError`, falling back to the interpreter default if `certifi` is missing) and pass it via `context=`/`HTTPSHandler(context=...)` in every `urlopen`/`build_opener` call.
- **Files modified:** `scripts/qa/hreflang_reciprocity.py`, `scripts/qa/jsonld_audit.py`, `scripts/qa/csp_regression.py`
- **Verification:** All three scripts ran cleanly against production after the fix (see Accomplishments).
- **Committed in:** `2175ea60`, `0750e2fc` (part of the Task 2/3 commits touching each affected file)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for the scripts to function reliably at all against production in this environment; no scope creep.

## Issues Encountered
None beyond the two deviations above (both auto-fixed).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The five-script QA harness is committed and its pre-change production baseline is recorded in `75-QA-BASELINE.md`. Later phase-75 plans (EN-leak audit/fix, Stripe/Places locale wiring, GA4/Meta `site_locale` wiring, booking E2E, launch ops) can now build on this harness, and plan 75-20 has a concrete pre-change reference to diff against post-deploy.
- Recorded, not fixed, in this plan (out of Task 1-3 scope): a missing `<link rel="canonical">` on `/login` across all 7 locales (render_audit baseline), and the intentional Phase 71/74 D-07/D-08/D-09 EN-only exclusion of 3 legacy blog posts + 1 author page from the hreflang cluster (hreflang_reciprocity baseline).

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 3 task commit
hashes confirmed in `git log`.

---
*Phase: 75-e2e-verification-launch*
*Completed: 2026-09-25*
