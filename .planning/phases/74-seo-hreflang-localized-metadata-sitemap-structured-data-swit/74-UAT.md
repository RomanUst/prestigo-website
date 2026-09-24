---
status: testing
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
source: [74-VERIFICATION.md]
started: 2026-09-24T02:01:38Z
updated: 2026-09-24T16:54:51Z
---

## Current Test

number: 1
name: Google Search Console — sitemap fetch + hreflang report (after deploy)
expected: |
  After the phase ships to production, https://rideprestigo.com/sitemap.xml returns 200 and Search Console fetches it successfully; the international-targeting / hreflang report shows reciprocal, non-conflicting annotations for the indexable page set.
awaiting: user response

## Tests

### 1. Google Search Console — sitemap fetch + hreflang report (after deploy)
expected: Sitemap fetches successfully (also /robots.txt and /llms.txt return 200 in prod); hreflang report shows reciprocal, non-conflicting annotations for the indexable page set
result: pass
note: "Automated prod crawl 2026-09-24: sitemap.xml 200 (63 entries); all 417 localized URLs 200, self-canonical, no noindex, page hreflang cluster == sitemap cluster (0 problems). Owner submitted sitemap in Search Console."

### 2. First-visit language suggestion in a real browser (revised: inside the cookie consent modal)
expected: With the browser language set to e.g. Russian and cookies cleared, opening an EN page shows the banner only after hydration (view-source has no banner markup); "Switch" opens the same page in /ru; "Stay" hides it and it does not return on reload; no automatic redirect ever happens
result: issue
reported: "Automated Playwright run on prod (browser locale ru-RU, fresh context, cookies accepted): banner never appears on /about. Server sets `NEXT_LOCALE=en` on the very first response, and the banner treats any NEXT_LOCALE cookie as an already-made choice."
severity: major

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Deferred Follow-Ups

- test: 1
  idea: "Check the Search Console international-targeting / hreflang report ~1 week after sitemap submission (2026-10-01) for errors"
  deferred_at: 2026-09-24

## Gaps

- gap_id: G-74-2
  truth: "First-visit banner appears for a visitor whose browser language differs from the page locale and who has not yet chosen a language"
  status: failed
  reason: "Automated prod check: banner never renders — next-intl middleware sets NEXT_LOCALE on every response (`set-cookie: NEXT_LOCALE=en` on first /about visit), and FirstVisitBanner.hasNextLocaleCookie() hides the banner whenever that cookie exists"
  severity: major
  test: 2
  root_cause: "components/FirstVisitBanner.tsx uses the next-intl-managed NEXT_LOCALE cookie as its 'user already chose' signal, but next-intl writes that cookie server-side on every request, so it is always present before hydration"
  artifacts:
    - path: "components/FirstVisitBanner.tsx"
      issue: "hasNextLocaleCookie() gate is always true in production"
  missing:
    - "Use a banner-owned persisted flag (set on Stay and on Switch) instead of NEXT_LOCALE presence"
    - "Unit test that a server-set NEXT_LOCALE cookie alone does not suppress the banner"
  fix_commit: 12b3b160, 663b6ef9
  design_change: "Owner decision 2026-09-24: merge the language suggestion into the cookie consent modal (one prompt instead of two). Standalone FirstVisitBanner removed. Verified locally (Playwright, ru-RU browser): row in modal header, Switch → same page /ru with modal re-rendered in Russian and no consent recorded, Arabic/RTL, mobile, /book no longer clashes with the price bar, en browser → no row."
  fix_note: "Banner now uses its own PRESTIGO_LOCALE_PROMPT flag; also inset-inline-0 (not a Tailwind 4 class) → inset-x-0 so the bar is full width per UI-SPEC. Verified locally with Playwright (ru-RU browser): shows after consent, Switch → /ru/about + NEXT_LOCALE=ru, Stay hides and persists across reload, Arabic/RTL banner on /ar/about, full width desktop/mobile/RTL. Prod raw HTML identical for ru vs en Accept-Language. Awaiting deploy + prod re-run."

