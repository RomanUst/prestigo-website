---
status: partial
phase: 56-article-migration-seo-wiring
source: [56-VERIFICATION.md]
started: 2026-05-14T22:10:00Z
updated: 2026-05-14T22:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Redirect Smoke Test — Article Paths
expected: curl -sIL https://rideprestigo.com/guides/prague-airport-to-city-center → single 301 hop to https://rideprestigo.com/blog/prague-airport-to-city-center; no redirect chains, no 404
result: [pending]

### 2. Live Redirect Smoke Test — Hub Paths
expected: curl -sIL https://rideprestigo.com/guides → 301 to /blog; curl -sIL https://rideprestigo.com/compare → 301 to /blog
result: [pending]

### 3. Google Rich Results Test — BreadcrumbList (Post-WR-01 Fix)
expected: Each of the 3 migrated article URLs shows breadcrumb rich result; position 2 (Blog) shows https://rideprestigo.com/blog; no structural errors
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
