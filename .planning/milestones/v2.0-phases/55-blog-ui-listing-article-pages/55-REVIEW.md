---
phase: 55-blog-ui-listing-article-pages
reviewed: 2026-05-13T10:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - app/blog/[slug]/page.tsx
  - app/blog/page.tsx
  - app/sitemap.ts
  - components/BlogCard.tsx
  - lib/blog-jsonld.ts
  - mdx-components.tsx
  - tests/BlogCard.test.tsx
  - tests/blog-jsonld.test.ts
  - tests/sitemap.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 55: Code Review Report

**Reviewed:** 2026-05-13T10:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Фаза 55 добавляет страницу-листинг блога (`/blog`), страницу статьи (`/blog/[slug]`), компонент `BlogCard`, JSON-LD билдер и MDX-компоненты. Общее качество кода высокое: типы строгие, slug-allowlist на месте, xss-безопасность JSON-LD через `JSON.stringify`, тесты покрывают ключевые контракты. Найдены 3 предупреждения (потенциальные баги) и 3 информационных замечания (качество кода).

---

## Warnings

### WR-01: `getAllPosts()` вызывается в module scope — данные замораживаются при запуске сервера

**File:** `app/blog/page.tsx:15-16`

**Issue:** `const posts = getAllPosts()` и `const ogImage = posts[0]?.coverImage` вычисляются на уровне модуля при первом импорте. В режиме `force-static` Next.js это допустимо, однако если в будущем страница станет динамической или появится hot-reload в dev-режиме, новые `.mdx`-файлы не будут подхватываться без перезапуска — что создаёт скрытый баг. Все соседние страницы (и `sitemap.ts`) вызывают `getAllPosts()` внутри функции. Здесь нарушается этот же принцип.

**Fix:**
```tsx
// Перенести в тело функции-компонента:
export default function BlogPage() {
  const posts = getAllPosts()
  const ogImage = posts[0]?.coverImage ?? '/hero-airport-transfer.webp'
  // ...
}

// metadata тоже должна использовать lazy-вычисление:
export async function generateMetadata() {
  const posts = getAllPosts()
  const ogImage = posts[0]?.coverImage ?? '/hero-airport-transfer.webp'
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: {
      images: [{ url: `https://rideprestigo.com${ogImage}`, width: 1200, height: 630 }],
    },
    // ...
  }
}
```

---

### WR-02: `generateMetadata` возвращает пустой объект `{}` при ненайденном посте — нет fallback title/description

**File:** `app/blog/[slug]/page.tsx:39`

**Issue:** Если `findMdxPost(slug)` возвращает `undefined`, функция возвращает `{}`. Для статического сайта (`dynamicParams = false`) это теоретически невозможно, однако при вызове `generateMetadata` Next.js может вызвать её для slug-ов, которые не прошли `generateStaticParams` (например, при инкрементальной регенерации или в preview-режиме). Страница ниже корректно делает `notFound()`, но metadata будет отдана пустой — без title, без description, без canonical — что создаёт дубликатные или пустые мета-теги в сниппетах поиска.

**Fix:**
```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = findMdxPost(slug)
  if (!post) {
    // Явный 404-сигнал для Next.js, не пустой объект
    return { title: 'Not Found — Prestigo' }
  }
  // ...остальной код без изменений
}
```

---

### WR-03: `dangerouslySetInnerHTML` с JSON-LD не экранирует `</script>` внутри строковых значений

**File:** `app/blog/[slug]/page.tsx:98-100`

**Issue:** `JSON.stringify(jsonLd)` безопасен от XSS в большинстве случаев, но не экранирует последовательность `</script>` внутри строковых полей (например, в `post.title` или `post.description`). Если MDX-файл содержит `</script>` в frontmatter (случайно или намеренно), браузер закроет тег `<script>` преждевременно, что нарушит JSON-LD и может создать XSS-вектор в экзотических браузерах/парсерах. Next.js не экранирует это автоматически для ручного `dangerouslySetInnerHTML`.

**Fix:**
```tsx
// Экранировать </script> в сериализованном JSON-LD:
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>')
}

// В JSX:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
/>
```

---

## Info

### IN-01: `mdx-components.tsx` не маппит `h1` — статья может содержать два `<h1>`

**File:** `mdx-components.tsx:14-67`

**Issue:** Файл маппит `h2`, `h3`, `p`, `ul`, `li`, `strong`, `a`, `blockquote`, `hr`, но не `h1`. Если автор MDX-файла напишет `# Заголовок` в теле статьи, он отрендерится браузерным дефолтным `<h1>` без стилей, и на странице появятся два `<h1>` (один в hero-секции страницы), что является нарушением доступности и SEO. Либо нужно добавить маппинг `h1` с переопределением в `h2`, либо явно задокументировать инвариант "MDX не должен содержать h1".

**Fix:**
```tsx
// Вариант A: Переопределить h1 → h2 визуально
h1: ({ children }: { children?: ReactNode }) => (
  <h2 className="font-display font-light text-[28px] md:text-[32px] text-offwhite mt-14 mb-6 leading-[1.25]">
    {children}
  </h2>
),

// Вариант B: Добавить комментарий-правило в CLAUDE.md / контент-гайд:
// "MDX content must NOT contain # (h1) — the page shell provides the only h1."
```

---

### IN-02: `app/sitemap.ts` содержит абсолютный путь к локальному файлу в комментарии

**File:** `app/sitemap.ts:10`

**Issue:** Комментарий содержит `/Users/romanustyugov/Desktop/founder prestigo/routes/03-noindex-rules-20-red-routes.md` — абсолютный путь на машине разработчика. Это не создаёт баг, но попадёт в git-историю, может раскрыть структуру файловой системы и сломается у любого другого разработчика при клонировании.

**Fix:**
```ts
// Заменить на относительную или обобщённую ссылку:
// See SEO strategy: docs/seo/noindex-rules-red-routes.md
```

---

### IN-03: В тестах `BlogCard.test.tsx` и `blog-jsonld.test.ts` отсутствует проверка `dateModified`

**File:** `tests/BlogCard.test.tsx`, `tests/blog-jsonld.test.ts`

**Issue:** Тестовый `post`-объект не включает `dateModified`. Тест `'BlogPosting dates default dateModified to date when omitted'` покрывает fallback корректно. Однако нет теста для пути, когда `dateModified` задан явно и отличается от `date`. Это означает, что если логика `post.dateModified ?? post.date` будет сломана (например, `post.dateModified || post.date` не учтёт пустую строку), тесты не поймают регрессию.

**Fix:**
```ts
it('BlogPosting.dateModified uses explicit dateModified when provided', () => {
  const modifiedPost: BlogPost = { ...post, dateModified: '2026-05-14' }
  const ld = buildBlogPostingJsonLd(modifiedPost) as { '@graph': Array<Record<string, unknown>> }
  const article = ld['@graph'][1] as { datePublished: string; dateModified: string }
  expect(article.datePublished).toBe('2026-05-13')
  expect(article.dateModified).toBe('2026-05-14')
})
```

---

_Reviewed: 2026-05-13T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
