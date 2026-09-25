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

<!-- gsd:write-continue -->
