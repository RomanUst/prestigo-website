---
phase: 75-e2e-verification-launch
plan: 19
subsystem: deploy
tags: [deploy, production, smoke, ga4, e2e-account]
requirements-completed: []
key-files:
  modified:
    - .planning/phases/75-e2e-verification-launch/75-QA-RESULTS.md
duration: ~40min
completed: 2026-09-26
---

# Phase 75 Plan 19: Production deploy + smoke Summary

**Phase 75 shipped to production via PR #37 (merge `960e4e0f`). All five smoke checks recorded; the only finding is a pre-existing baseline item. The GA4 dimension is registered; the E2E account file is pending.**

The orchestrator executed this plan inline, because it is checkpoint-heavy and involves an outward-facing push.

## Tasks
1. **Deploy decision (blocking-human):** user chose "Через PR (Recommended)" (deploy-via-pr).
2. **Secret scan, deploy, smoke:**
   - Secret scan of 6809 added lines: clean.
   - Precondition met: migration 062 was verified in 75-17.
   - PR https://github.com/RomanUst/prestigo-website/pull/37 was merged. Vercel Production reported success.
   - Smoke results:
     - /ru/fleet title in Russian: PASS
     - /ru/routes/prague-berlin: 8× `/ru/book`, 0× `/book`: PASS
     - ga-init `site_locale`: PASS
     - CSP compare: 0 findings, PASS
     - render_audit ar: 1 finding (`/ar/login` missing canonical). This is pre-existing baseline, not a regression.
3. **Human setup:**
   - A (GA4 Site Locale dimension): confirmed by the user.
   - B (E2E account): the user reported it as created, but `scripts/qa/.e2e-account.json` is absent. The 75-20 account path is conditional on the file.
   - Delete the account after QA: yes.

## Deviations / notes
- Wave 1 (75-01..12, 75-15) reached production earlier through PR #35/#36, which other sessions opened from branches based on local main. This bypassed the deploy gate. It was smoke-checked when discovered, with no regressions.
- User directive: no data may be lost. 75-20 cleanup must be verify-then-show-then-delete, limited to E2E/TEST records.
- Observation for 75-20: `/zh/<unknown>` shows an English "Page not found" h1.

## Self-Check: PASSED
