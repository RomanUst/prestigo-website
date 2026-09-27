---
phase: 75-e2e-verification-launch
plan: 32
subsystem: qa-tooling
status: complete
tags: [i18n, qa, en-leak, metadata, twitter-card, 404, gap-closure]
requires: []
provides:
  - "en_leak_rendered.py: twitter:* meta, es/fr meta-identical-to-en, joined-text, en-date detection"
  - "share_meta_audit.py: raw-HTML status / twitter-mirror / en-site-default / notfound-title audit"
  - "notfound_audit.py: /blog/this-post-does-not-exist (dynamic-segment 404, WR-01)"
  - "Committed pre-fix production baseline (evidence/75-32-*-prefix.json) + class -> fixing-plan ledger"
affects: [75-31, 75-33, 75-34, 75-35, 75-36]
tech-stack:
  added: []
  patterns:
    - "Joined element innerText (inline-only children) evaluated alongside per-node text; node-level findings suppress joined duplicates via substring check"
    - "Raw server HTML audit with stdlib html.parser, script/style/svg/template content ignored, redirects never followed"
key-files:
  created:
    - scripts/qa/share_meta_audit.py
    - scripts/qa/test_share_meta_audit.py
    - .planning/phases/75-e2e-verification-launch/evidence/75-32-en-leak-rendered-prefix.json
    - .planning/phases/75-e2e-verification-launch/evidence/75-32-share-meta-audit-prefix.json
    - .planning/phases/75-e2e-verification-launch/evidence/75-32-notfound-audit-prefix.json
  modified:
    - scripts/qa/en_leak_rendered.py
    - scripts/qa/test_en_leak_rendered.py
    - scripts/qa/notfound_audit.py
    - .planning/phases/75-e2e-verification-launch/75-EN-LEAK-RESIDUAL.md
decisions:
  - "es/fr meta rule uses a 2-significant-word threshold (the legacy default title strips to 'Premium Chauffeur'; 3 words would miss it); texts/attrs/joined keep 3 words"
  - "share_meta_audit ignores <title> inside svg/script/style/template/noscript/math so inline SVG icon titles never pollute the 404-title check"
  - "Per-locale rule set centralized in collect_locale_leaks() (used by main() and unit tests)"
  - "No known leak added to classifiedResidual; every pre-fix finding class maps to 75-31/75-33/75-34 (UNMAPPED: none)"
metrics:
  duration: "~20 min"
  completed: 2026-09-27
  tasks: 3
  files: 9
actuals:
  tokens: 12800   # chars/4 over the scripts + ledger diff (51,148 chars); the 3 generated evidence JSON files (~15.4k lines) excluded
  tasks: 3
  commits: 7
---

# Phase 75 Plan 32: QA scanners see every GAP-4 residual leak class Summary

The QA gate can now detect every leak class that the code review and the verifier found. `en_leak_rendered.py` reads twitter:* meta, compares es/fr meta to EN, evaluates JSX-split joined element text and flags English dates. The new stdlib `share_meta_audit.py` does the verifier's curl-level raw-HTML check: twitter mirror, EN site default and the brand-doubled 404 `<title>`. `notfound_audit.py` now covers the blog unknown-slug 404. A committed production baseline taken before any fix maps every finding class to 75-31, 75-33 or 75-34.

## What was built

| Task | Change | Commits |
|---|---|---|
| 1 (tracer) | `EXTRACT_JS` metaTexts also reads `twitter:title` and `twitter:description`. `collect_es_fr_leaks(data, en_strings, locale=None, en_meta=None)` adds kind `meta-identical-to-en` (2+ words). `main()` builds a per-path EN meta baseline. | d7111f92 (RED), a85c3fe5 (GREEN) |
| 2 | `EXTRACT_JS` returns `joined` = collapsed innerText of p/li/h1-6/span/a/button/label/td/th/dd/dt elements whose element children are all inline. New: `collect_joined_leaks` (kind `joined-text`, node leaks are not reported twice), `ENGLISH_DATE_RE` + `collect_date_leaks` (kind `en-date`, all non-EN locales), `collect_locale_leaks` (per-locale rule set). es/fr also check joined text for identical-to-EN (3+ words). The error fallback dict gets `joined: []`. | ee49ec96 (RED), 8b0b0688 (GREEN) |
| 3 | New `share_meta_audit.py`: 12 sample pages x 7 locales, including both 404 classes. Finding kinds: `status`, `twitter-mirror`, `en-site-default`, `notfound-title`. It reuses notfound_audit's no-redirect opener with the certifi context. `notfound_audit.py` adds `/blog/this-post-does-not-exist` to MISSING_PATHS and updates its docstring. Pre-fix production baseline and ledger section committed. | a104e564 (RED), 7e5b1f1b (GREEN), 79be9b36 (baseline) |

Unit tests: `python3 -m unittest discover -s scripts/qa -p 'test_*.py'` → **67 tests OK**. There were 29 before the plan. The optional headless-Chromium `EXTRACT_JS` test ran and was not skipped.

## Pre-fix red proof (production, 2026-09-27)

**Task 1 tracer:** `en_leak_rendered.py --locales ru,es --pages /fleet` exited 1.
- ru `/fleet`, kind `meta`:
  - "PRESTIGO — Premium Chauffeur Service Prague" (twitter:title)
  - "Premium chauffeur service in Prague. Airport transfers, intercity routes, corporate accounts. Fixed prices, flight tracking, meet & greet." (twitter:description)
- es `/fleet`, kind `meta-identical-to-en`: the same two values.

**Task 2 red check:** `--locales ru,fr --pages /blog,/blog/beyond-transport-luxury-chauffeur-service-prague` exited 1.
- ru `joined-text` "Published 13 July 2026" on the MDX post.
- `en-date` on both ru and fr `/blog`: "4 September 2026", "2 September 2026", "29 August 2026".
- `en-date` on the post: "13 July 2026".

**Task 3 full baseline.** All three runs exited 1:

| Script | Findings | Evidence |
|---|---|---|
| en_leak_rendered (6 x 26) | 346 text / 0 link (per locale: `meta`/`meta-identical-to-en` 53, `en-date` 4, `joined-text` 1 on ru/ar/hi/zh) | `evidence/75-32-en-leak-rendered-prefix.json` |
| share_meta_audit (7 x 12) | 370 (`twitter-mirror` 98, `en-site-default` 258, `notfound-title` 14, `status` 0) | `evidence/75-32-share-meta-audit-prefix.json` |
| notfound_audit (7 x 3 + 12 shadowing) | 7: `/blog/this-post-does-not-exist` hydrated title "Not Found — Prestigo \| PRESTIGO" on every locale | `evidence/75-32-notfound-audit-prefix.json` |

Class → plan mapping (full table in `75-EN-LEAK-RESIDUAL.md` → "Extended-scanner pre-fix baseline (plan 75-32)"):
- **75-31:** twitter/og site default, pages without their own og, `/login`.
- **75-33:** catch-all 404 meta, raw-SSR 404 title, blog unknown-slug 404.
- **75-34:** "Published" byline, en-GB dates.

**UNMAPPED: none.** No `deferred-items.md` entry was needed.

## Deviations from Plan

### Execution-flow note

**1. Tracer feedback gate handled as auto-verified, not a human checkpoint**
- **Found during:** Task 1
- **Issue:** `workflow._auto_chain_active` is false, so the interactive tracer gate would require stopping for a `checkpoint:human-verify` after Task 1. But the plan is `autonomous: true`, the orchestrator asked for the whole plan in this worktree (it is removed on return), and the tracer's `<verify>` is fully automated.
- **Action:** Re-ran the tracer `<verify>` end-to-end: the unit tests plus the production run, which exited 1 with the expected ru `meta` and es `meta-identical-to-en` findings. It passed, so I continued with the expansion tasks. The red values are recorded above.

### Minor additions within scope (Rule 2)
- `parse_head_meta` ignores `<title>` inside `svg`, `template`, `noscript` and `math` as well as `script`/`style`. Inline SVG icon titles in the body would otherwise break the `notfound-title` check. A unit test covers this.
- Added the `collect_locale_leaks()` helper so the per-locale rule set wired into `main()` can be unit-tested directly.

Otherwise the plan executed as written. PAGES was confirmed on production before freezing: all 12 sample paths x 7 locales answered 200 or 404, with no 3xx, so nothing was dropped.

## Known Stubs

None.

## Threat Flags

None. share_meta_audit.py makes plain GETs only: no JS, no subresources, redirects not followed. en_leak_rendered keeps the ABORT_SUBSTRINGS route handler and the analytics:false consent init. The evidence files hold only public page metadata and text. `git ls-files scripts/qa/out` is empty.

## Self-Check: PASSED
- FOUND: scripts/qa/share_meta_audit.py, scripts/qa/test_share_meta_audit.py, the 3 evidence/75-32-*-prefix.json files (tracked, 3), the ledger section at 75-EN-LEAK-RESIDUAL.md line 50
- FOUND commits: d7111f92, a85c3fe5, ee49ec96, 8b0b0688, a104e564, 7e5b1f1b, 79be9b36
- STATE.md / ROADMAP.md / REQUIREMENTS.md untouched
