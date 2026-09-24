---
phase: 74
slug: seo-hreflang-localized-metadata-sitemap-structured-data-swit
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-24
---

# Phase 74 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → middleware | Every non-static request passes CSP nonce, Supabase session refresh, CSRF Origin check and route gating in `middleware.ts` | Cookies, Origin header, URL path |
| URL path → server metadata | `[locale]` route param and content keys feed `getAlternates()` / `getPathname()` / `fs.existsSync` | Locale segment (validated against `routing.locales`) |
| Browser language → client UI | `navigator.languages` drives the language suggestion inside the consent modal | Browser language tag (validated against `locales`) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-74-01 | Tampering | `lib/seo.ts` hasLocaleContent | medium | mitigate | Locale allowlist check before any `path.join`/`fs.existsSync` (`lib/seo.ts:94`), survives 8e2e9826 refactor | closed |
| T-74-02 / 02a / 03a / 03b / 04b | Tampering | hreflang/noindex correctness | medium | mitigate | D-06/D-07 centralized in `getAlternates()`; no live hand-rolled cluster (only dead `corporate/layout.tsx` literal, overridden by page metadata) | closed |
| T-74-04a | Information Disclosure | force-static locale leak | high | mitigate | `{ locale } = await params` forwarded on all 10 pages; live `/ru/about`, `/ru/corporate` serve Russian | closed |
| T-74-05-01 | Tampering | LocaleSwitcher navigation target | medium | mitigate | Allowlisted `locales.map`, `router.replace(pathname, { locale })` via next-intl bridge | closed |
| T-74-05-02 | Tampering | NEXT_LOCALE cookie write | low | accept | No `document.cookie` in LocaleSwitcher; next-intl owns the cookie | closed |
| T-74-05-03 | Tampering | CSP in Nav | low | accept | No script / dangerouslySetInnerHTML | closed |
| T-74-06-01 | Tampering | language-suggestion navigation target (now in `CookieBanner.tsx`) | medium | mitigate | `i18n/suggest-locale.ts` returns only allowlisted locales; `router.replace(pathname, { locale })` | closed |
| T-74-06-02 | Tampering | hand-written cookie (old Stay action) | low | mitigate | Closed by removal — merged design writes no cookie | closed |
| T-74-06-03 | Tampering (cloaking) | SSR output vs Accept-Language | high | mitigate | Client-only `useEffect` decision; prod HTML byte-identical for ru vs en Accept-Language (post-deploy 8469b24e) | closed |
| T-74-SC | Tampering | package installs | low | accept | `package.json` / lock unchanged since df80052 | closed |
| T-74-07 | Elevation of Privilege / CSRF bypass | `middleware.ts` matcher | medium | mitigate | Found by audit: extension-suffix exclusion let `PUT /api/admin/route-prices/<slug>.xml` skip CSRF Origin check. Fixed 8821d8b8 — exclusion no longer applies under `api/`, `admin/`, `driver/`, `auth/`, `[locale/]account/`; regression tests in `tests/middleware-matcher.test.ts`; live dev: crafted PUT → 403 "Origin header required", evil Origin → 403, `/account/x.png` → login redirect, static SEO files still 200 | closed |
| T-74-08 | Tampering | canonical / og:url construction | high | mitigate | Self-canonical only for locales in allowlisted available set, else EN; `BASE` hardcoded; `[locale]/layout.tsx` `hasLocale` → `notFound()` | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-74-01 | T-74-05-02, T-74-05-03, T-74-SC | Low-severity plan-time acceptances: cookie owned by next-intl, no script injection surface, no new packages | plan-time register (74-05/74-06 PLAN) | 2026-09-23 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-24 | 18 | 17 | 1 (T-74-07, medium, non-blocking) | gsd-security-auditor |
| 2026-09-24 | 18 | 18 | 0 | orchestrator — T-74-07 fixed in 8821d8b8, verified on live dev server |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-24
