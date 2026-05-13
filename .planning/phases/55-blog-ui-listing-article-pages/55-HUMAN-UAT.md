---
status: partial
phase: 55-blog-ui-listing-article-pages
source: [55-VERIFICATION.md]
started: 2026-05-13T23:10:00Z
updated: 2026-05-13T23:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Визуальный контракт /blog
expected: Сетка карточек 1/2/3 колонки, герой «Prague travel, explained clearly.», hover-эффекты (copper border, copper-light title, scale 1.02), 4 карточки (1 MDX + 3 JSX)
result: [pending]

### 2. Визуальный контракт /blog/[slug]
expected: Герой с категорией (copper-light), copper-line, h1, ArticleByline; full-bleed cover image 16:9; MDX body с Cormorant Garamond h2/h3, Montserrat 14px p, copper bullet dots; bottom CTA «Skip the taxi rank. Chauffeur inside Arrivals.»
result: [pending]

### 3. HTTP 404 для несуществующего slug
expected: `curl -o /dev/null -s -w '%{http_code}' http://localhost:3000/blog/non-existent-slug` → 404
result: [pending]

### 4. sitemap.xml в production build
expected: Содержит /blog и /blog/premium-airport-transfer-prague-shortcut; НЕ содержит /blog/prague-airport-to-city-center (JSX slug)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
