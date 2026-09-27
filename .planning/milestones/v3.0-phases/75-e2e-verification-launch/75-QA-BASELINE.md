# Phase 75: Pre-change Production QA Baseline

Captured before any Phase 75 code change is deployed (VER-01, D-13). This is
the "before" half of the before/after comparison plan 75-20 performs by
re-running these exact scripts post-deploy.

Run date (UTC): 2026-09-25
Target: `https://rideprestigo.com` (production)

---

## render_audit (pre-change baseline)

Command: `python3 scripts/qa/render_audit.py https://rideprestigo.com`

- **URLs checked:** 147 (7 locales x 21 pages)
- **URLs with findings:** 7
- **Exit code:** 1

### Failures

| URL | Finding |
|---|---|
| https://rideprestigo.com/login | missing canonical link |
| https://rideprestigo.com/ru/login | missing canonical link |
| https://rideprestigo.com/es/login | missing canonical link |
| https://rideprestigo.com/fr/login | missing canonical link |
| https://rideprestigo.com/ar/login | missing canonical link |
| https://rideprestigo.com/hi/login | missing canonical link |
| https://rideprestigo.com/zh/login | missing canonical link |

No status-code failures, no lang/dir mismatches, and no CSP violations were
recorded on any of the 147 URLs. The only defect class is a missing
`<link rel="canonical">` tag on `/login` across all 7 locales — recorded here
as the pre-change baseline, not fixed in this plan (Task 1 scope is the QA
harness + baseline capture, not remediation).

## jsonld_audit (pre-change baseline)

Command: `python3 scripts/qa/jsonld_audit.py https://rideprestigo.com`

- **ld+json blocks checked:** 84 (7 locales x 7 pages: `/`, `/routes/prague-vienna`, `/faq`, `/fleet`, `/routes`, `/services/airport-transfer`, `/book`)
- **Findings:** 0
- **Exit code:** 0

Clean baseline — no invalid JSON, no missing `@context`, no `FAQPage`
`acceptedAnswer.text` regression (all plain strings, per Phase 73 CR-02), and
every Service node on `/routes/prague-vienna` carries the correct BCP-47
`inLanguage` tag for its locale (including `zh-Hans` for `zh`).

## hreflang_reciprocity (pre-change baseline)

Command: `python3 scripts/qa/hreflang_reciprocity.py https://rideprestigo.com`

- **Sitemap clusters checked:** 63
- **Alternate URLs verified (200 reachability):** 417
- **Reciprocity errors:** 4
- **Exit code:** 1

### Failures

| Cluster (EN loc) | Finding |
|---|---|
| https://rideprestigo.com/blog/prague-airport-to-city-center | missing hreflang entries ['ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans'] |
| https://rideprestigo.com/blog/prague-airport-taxi-vs-chauffeur | missing hreflang entries ['ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans'] |
| https://rideprestigo.com/blog/prague-vienna-transfer-vs-train | missing hreflang entries ['ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans'] |
| https://rideprestigo.com/authors/roman-ustyugov | missing hreflang entries ['ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans'] |

All 4 failures are the pre-existing, **intentional** EN-only allowlist
(Phase 75 CONTEXT D-09): the 3 EN-only legacy `JSX_POSTS` blog articles and
the author page are self-canonical → EN and deliberately excluded from the
hreflang cluster per 71 D-07/D-08 and 74 D-07 — recorded here, not a
regression to fix. No non-reciprocal sitemap/page-level surface mismatch was
found on any of the 10 sampled clusters (`/`, `/fleet`, `/book`, `/routes`,
`/routes/prague-vienna`, `/services/airport-transfer`, `/faq`, `/about`,
`/contact`, `/blog`), and every alternate URL across all 63 clusters
returned 200.

## csp_regression (pre-change golden baseline)

Commands:
```
python3 scripts/qa/csp_regression.py --capture https://rideprestigo.com
python3 scripts/qa/csp_regression.py --compare https://rideprestigo.com
```

- **Route classes captured:** 11
- **Baseline file:** `scripts/qa/baselines/csp_baseline.json` (nonce values normalized to a fixed placeholder before storage — no raw nonce committed)
- **Self-consistency compare (immediately after capture):** 0 findings, exit 0

### Route classes

| Route class | Status | CSP policy |
|---|---|---|
| `/` | 200 | static (`buildCspStatic`) |
| `/ru` | 200 | static |
| `/ru/fleet` | 200 | static |
| `/routes/prague-vienna` | 200 | static |
| `/ar/routes/prague-vienna` | 200 | static |
| `/book` | 200 | static |
| `/ru/book` | 200 | static |
| `/login` | 200 | static |
| `/ru/login` | 200 | static |
| `/ru/account` | 307 (unauthenticated redirect) | static |
| `/api/health` | 401 (no bearer token supplied) | static |

All 11 sampled route classes resolve to the static (`unsafe-inline`)
marketing/booking CSP — none of them fall under `/admin` or `/driver`, the
only two prefixes middleware.ts routes to the per-request nonce CSP. This
is the golden pre-change reference plan 75-20 diffs against post-deploy; a
CSP drift is investigated as a regression, never "fixed" by widening the
policy (RESEARCH Pitfall 8).

## switcher_audit (pre-change baseline)

Command: `python3 scripts/qa/switcher_audit.py https://rideprestigo.com`

- **Switch operations tested:** 63 (42 ordered (source, target) pairs on `/routes/prague-vienna`, source != target, plus 21 rotating-target cases across `/`, `/book`, `/fleet` — one per source locale per extra page)
- **Findings:** 0
- **Exit code:** 0

Every switch lands on the same page in the target locale with the correct
`<html lang>`. The switcher trigger/menu are located by their stable
`locale-switcher-trigger-`/`locale-switcher-menu-` id prefixes (never by
`aria-haspopup` alone, which also matches the NAV-02 account-menu trigger
when signed in). The `NEXT_LOCALE` cookie value is recorded per case for
information only — next-intl sets it on every response regardless of
switcher use, so it is never treated as a pass signal.

---

## Summary

| Script | URLs/entities checked | Findings | Exit |
|---|---|---|---|
| render_audit | 147 URLs | 7 (missing canonical on `/login`, all 7 locales) | 1 |
| switcher_audit | 63 switch operations | 0 | 0 |
| hreflang_reciprocity | 63 sitemap clusters, 417 alternate URLs | 4 (intentional EN-only blog/author allowlist, D-09) | 1 |
| jsonld_audit | 84 ld+json blocks (7 locales x 7 pages) | 0 | 0 |
| csp_regression | 11 route classes | 0 (self-consistent immediately after capture) | 0 |

All non-zero findings above are pre-existing, already-understood conditions
(a missing canonical tag on `/login`, and the deliberate EN-only blog/author
hreflang exclusion) — recorded here as the pre-change reference, not fixed
in this plan. Plan 75-20 re-runs these exact five scripts against production
after the phase's other plans land and diffs the results against this file.

---

*Phase: 75-e2e-verification-launch*
*Plan: 01*
*Captured: 2026-09-25*
