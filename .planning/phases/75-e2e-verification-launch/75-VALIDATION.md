---
phase: 75
slug: e2e-verification-launch
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-24
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (jsdom) + Python/Playwright QA scripts under `scripts/qa/` |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest related <changed-files> --run` |
| **Full suite command** | `npx vitest run` (no `npm test` script exists) |
| **Estimated runtime** | ~120 seconds (vitest full); QA scripts vary per surface |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest related <touched files> --run`
- **After every plan wave:** Run `npx vitest run` + the relevant `scripts/qa/*.py` script(s) for that wave's surface
- **Before `/gsd-verify-work`:** Full vitest suite green + full `scripts/qa/*.py` suite run against production, results in `75-VERIFICATION.md`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner / validate-phase) | | | VER-01 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/qa/render_audit.py`, `switcher_audit.py`, `en_leak_static.py`, `en_leak_rendered.py`, `hreflang_reciprocity.py`, `csp_regression.py`, `booking_e2e.py` — new, modeled on `scripts/qa/overflow_audit.py`
- [ ] `tests/corporate-form.test.tsx` — CorporateForm resolves all strings from `Corporate` namespace (renderWithIntl)
- [ ] Tests asserting `site_locale` in `sendGa4Purchase` params and surviving `customDataSchema.strict()` in `/api/meta-capi`
- [ ] Metricool `draft: true` support test (buildBody) before any announcement call

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GSC sitemap resubmit | VER-01 | GSC token is `webmasters.readonly` | Resubmit sitemap in GSC UI; record per-locale indexing baseline |
| GA4 custom dimension registration | VER-01 | No Admin API credentials | Register event-scoped `site_locale` in GA4 Admin UI |
| Rich Results Test | VER-01 | Google web tool | Test sampled locale URLs in search.google.com/test/rich-results |
| Metricool drafts review | VER-01 | Brand/public content | Confirm posts exist as drafts only in Metricool UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
