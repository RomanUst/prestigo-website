---
phase: 55-blog-ui-listing-article-pages
fixed_at: 2026-05-14T00:00:00Z
review_path: .planning/phases/55-blog-ui-listing-article-pages/55-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 55: Code Review Fix Report

**Fixed at:** 2026-05-14T00:00:00Z
**Source review:** .planning/phases/55-blog-ui-listing-article-pages/55-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `getAllPosts()` вызывался в module scope

**Files modified:** `app/blog/page.tsx`
**Commit:** 98e744a
**Applied fix:** Удалены module-scope переменные `posts` и `ogImage`. Статичный объект `metadata` заменён на async-функцию `generateMetadata()`, которая вызывает `getAllPosts()` внутри себя. В теле компонента `BlogPage` добавлен локальный вызов `getAllPosts()`.

---

### WR-02: `generateMetadata` возвращал `{}` при ненайденном посте

**Files modified:** `app/blog/[slug]/page.tsx`
**Commit:** 9b27491
**Applied fix:** Строка `if (!post) return {}` заменена на `if (!post) return { title: 'Not Found — Prestigo' }` — явный fallback title вместо пустого объекта.

---

### WR-03: JSON-LD не экранировал `</script>` внутри строковых значений

**Files modified:** `app/blog/[slug]/page.tsx`
**Commit:** fd11633
**Applied fix:** Добавлена локальная функция `safeJsonLd(obj: unknown): string`, которая вызывает `JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>')`. Вызов `JSON.stringify(jsonLd)` в `dangerouslySetInnerHTML` заменён на `safeJsonLd(jsonLd)`.

---

_Fixed: 2026-05-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
