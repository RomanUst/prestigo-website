---
status: testing
phase: 74-seo-hreflang-localized-metadata-sitemap-structured-data-swit
source: [74-VERIFICATION.md]
started: 2026-09-24T02:01:38Z
updated: 2026-09-24T02:01:38Z
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
result: [pending]

### 2. First-visit language banner in a real browser
expected: With the browser language set to e.g. Russian and cookies cleared, opening an EN page shows the banner only after hydration (view-source has no banner markup); "Switch" opens the same page in /ru; "Stay" hides it and it does not return on reload; no automatic redirect ever happens
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
