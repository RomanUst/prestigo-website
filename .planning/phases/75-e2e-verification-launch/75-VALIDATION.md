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
| 75-01 T1-T3 | 01 | 1 | VER-01 | T-75-01/03 | QA runs abort GA4/Meta hits; golden CSP captured pre-change | QA script | `python3 scripts/qa/render_audit.py https://rideprestigo.com --locales en,ar` / `csp_regression.py --compare` | ❌ W0 new | ⬜ pending |
| 75-02 T1-T2 | 02 | 1 | VER-01 | T-75-04 | Allowlist entries require reasons | unit + QA script | `npx vitest run tests/en-leak-static.test.ts` / `python3 scripts/qa/en_leak_rendered.py` | ❌ W0 new | ⬜ pending |
| 75-03 T1-T2 | 03 | 1 | VER-01 | T-75-06/07/08 | E2E never pays; marker on every row; creds git-ignored | QA script | `python3 scripts/qa/booking_e2e.py https://rideprestigo.com --locales en` | ❌ W0 new | ⬜ pending |
| 75-04 T1-T3 | 04 | 1 | VER-01 | T-75-10/11/12 | customDataSchema stays .strict(); Pixel/CAPI identical site_locale | unit + QA script | `npx vitest run tests/site-locale.test.ts tests/analytics-page-view.test.tsx tests/meta-capi.test.ts tests/meta-pixel-locale.test.ts` | ❌ W0 new | ⬜ pending |
| 75-05 T1-T2 | 05 | 2 | VER-01 | T-75-14/15/16 | Locale allow-listed before Stripe/DB/GA4; return_url same-origin | unit | `npx vitest run tests/create-payment-intent.test.ts tests/analytics-server.test.ts tests/webhooks-stripe.test.ts tests/booking-locale.test.ts tests/Step6Payment.test.tsx tests/address-input-locale.test.tsx` | partial | ⬜ pending |
| 75-06 T1-T2 | 06 | 1 | VER-01 | T-75-17 | DNT/prices verbatim in translations | render + parity | `npx vitest run tests/book-page-render.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-07 T1-T2 | 07 | 1 | VER-01 | T-75-17 | same | render + parity | `npx vitest run tests/multi-day-page-render.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-08 T1-T2 | 08 | 1 | VER-01 | T-75-17/20 | FAQ schema == visible FAQ per locale | render + parity | `npx vitest run tests/fleet-page-render.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-09 T1-T2 | 09 | 1 | VER-01 | T-75-21 | Hub links keep locale | render + parity | `npx vitest run tests/routes-hub-render.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-10 T1-T2 | 10 | 1 | VER-01 | T-75-21/22 | EN golden snapshot unchanged | render | `npx vitest run tests/route-page-render.test.tsx tests/route-locale-links.test.tsx tests/route-hero-alt.test.ts` | partial | ⬜ pending |
| 75-11 T1-T2 | 11 | 1 | VER-01 | T-75-23 | '//' never treated as internal | unit + render | `npx vitest run tests/localized-href.test.ts tests/static-pages-locale.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-12 T1-T2 | 12 | 1 | VER-01 | T-75-24/25 | API payloads + analytics ids unchanged | component | `npx vitest run tests/corporate-form.test.tsx tests/contact-form.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-13 T1-T3 | 13 | 2 | VER-01 | T-75-21 | Links keep locale | component | `npx vitest run tests/shared-sections-i18n.test.tsx tests/BlogCard.test.tsx` | ❌ W0 new | ⬜ pending |
| 75-14 T1-T2 | 14 | 4 | VER-01 | T-75-27 | Backstop allowlist not widened | backstop | `npx vitest run tests/locale-links-backstop.test.ts` | ❌ W0 new | ⬜ pending |
| 75-15 T1-T2 | 15 | 1 | VER-01 | T-75-28/29 | safeReturnTo guard unchanged | unit | `npx vitest run tests/login-actions.test.ts tests/middleware-customer.test.ts tests/account-trips.test.tsx` | ✓ extend | ⬜ pending |
| 75-16 T1-T2 | 16 | 3 | VER-01 | T-75-31/32 | Only coded catalog errors rendered | unit + component | `npx vitest run tests/create-payment-intent.test.ts tests/validate-promo.test.ts tests/Step6Payment.test.tsx tests/auth-error-code.test.ts tests/Step3Auth.test.tsx` | partial | ⬜ pending |
| 75-17 T1-T3 | 17 | 3 | VER-01 | T-75-33/34 | Decision + schema applied before deploy | unit + MCP check | `npx vitest run tests/supabase.test.ts tests/BookingsTable.test.tsx` | ✓ extend | ⬜ pending |
| 75-18 T1-T3 | 18 | 5 | VER-01 | T-75-36/37 | No stub frozen; Metricool draft flag | unit + full gate | `npx vitest run && node scripts/i18n-translate.mjs --check && node scripts/qa/en_leak_static.mjs` | ❌ W0 new | ⬜ pending |
| 75-19 T1-T3 | 19 | 6 | VER-01 | T-75-39/40 | Pre-push secret scan; human deploy approval | smoke | `python3 scripts/qa/render_audit.py https://rideprestigo.com --locales ar` | n/a | ⬜ pending |
| 75-20 T1-T3 | 20 | 7 | VER-01 | T-75-41/42 | Strict-marker cleanup, 0 rows remain | QA suite | all `scripts/qa/*` against production | n/a | ⬜ pending |
| 75-21 T1-T3 | 21 | 8 | VER-01 | T-75-43/44 | Metricool drafts only; token never printed | script + manual | `python3 scripts/qa/gsc_indexing_baseline.py` | ❌ W0 new | ⬜ pending |

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
