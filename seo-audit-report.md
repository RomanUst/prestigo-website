# SEO Audit Report — rideprestigo.com

**Дата:** 2026-05-24
**Стек:** Next.js 16 App Router · MDX блог · Supabase · CSP nonce
**Метод:** параллельный subagent-аудит (Schema/On-Page + Technical/Content/GEO) над локальным репозиторием

---

## SEO Health Score: **82 / 100**

| Категория | Вес | Score | Взвешенный |
|---|---|---|---|
| Technical SEO | 22% | 92 | 20.24 |
| Content Quality | 23% | 70 | 16.10 |
| On-Page SEO | 20% | 85 | 17.00 |
| Schema / Structured Data | 10% | 75 | 7.50 |
| Performance (CWV — INP) | 10% | 80* | 8.00 |
| AI Search Readiness (GEO) | 10% | 85 | 8.50 |
| Images | 5% | 92 | 4.60 |
| **Итого** | **100%** | | **81.94** |

\* Performance — оценка по конфигу (AVIF/WebP, nonce-CSP, lazy components). Live INP/LCP/CLS не замерялись — отдельный этап на preview-сервере.

---

## Топ-3 quick wins (наибольший ROI / минимум кода)

### 1. AggregateRating не выводится на `/services/airport-transfer` — данные фетчатся и теряются

**Файл:** `app/services/airport-transfer/page.tsx:86`
`getStaticAggregateRating()` вызывается, но результат не попадает в `pageSchema['@graph']`. Это самая высокотрафиковая страница после home — звёзды в SERP дают +5-15% CTR. **Снипет 1** ниже.

### 2. FAQPage schema на route-страницах и `/services/*`

FAQ-секции уже отрендерены в JSX (массив `faqs` в `app/services/airport-transfer/page.tsx:58-79` + FAQ на каждом route). Markup отсутствует.
**Важно:** Google ограничил FAQ rich-results на gov/health (авг 2023). Выгода — **AI/LLM citations** (ChatGPT, Perplexity берут FAQPage как primary source). Приоритет — Medium, не Critical.

### 3. `dateModified` в MDX-фронтматтере блога

`lib/blog.ts:55-57` поддерживает optional `dateModified`, но MDX-статьи его не имеют. Без него BlogPosting получает только `datePublished` — Google понижает freshness-сигнал для evergreen content. Добавить 1 строчку в frontmatter каждой статьи.

---

## Findings по приоритетам

### 🔴 Critical (блокирует индексацию или вызывает пенальти)
*Не найдено.* Технический фундамент чистый.

### 🟠 High (значимо влияет на ранжирование, фикс в течение недели)

| # | Проблема | Файл | Impact |
|---|---|---|---|
| H1 | AggregateRating fetched но не injected в JSON-LD на airport-transfer | `app/services/airport-transfer/page.tsx:86, 88-110` | SERP CTR на главной конверсионной странице |
| H2 | Тематическая уникальность route-страниц ~30% (≈70% boilerplate структуры) | `app/routes/[slug]/*` (30 routes) | Тонкий контент при росте каталога |
| H3 | Blog author E-E-A-T signals недозаряжены — нет `dateModified`, `author.jobTitle`, `author.sameAs` | `content/blog/*.mdx`, `lib/blog.ts:55-57`, `lib/blog-jsonld.ts` | Freshness + authority для AI/Google |

### 🟡 Medium (оптимизация, фикс в течение месяца)

| # | Проблема | Файл | Impact |
|---|---|---|---|
| M1 | FAQPage schema отсутствует на route-страницах и `/services/*` (data есть) | `app/services/airport-transfer/page.tsx:58-79`, route templates | AI citation benefit |
| M2 | og:image — generic `hero-intercity-routes.png` для всех route-страниц вместо route-specific | `app/routes/[slug]/*:32` | Social/share CTR |
| M3 | BreadcrumbList отсутствует на `/services/page.tsx` (родительский листинг) | `app/services/page.tsx` | Crawl efficiency, mobile SERP |
| M4 | `/book` ReservationAction минимальна, без полного Reservation объекта | `app/book/page.tsx:31-45` | Booking intent signal |
| M5 | Author bio link в frontmatter MDX, но не в теле статьи (видимый byline) | `content/blog/*.mdx` | E-E-A-T visible signal |

### 🟢 Low (backlog)

| # | Проблема | Файл |
|---|---|---|
| L1 | og:type на `/about` мог бы быть `profile`, на `/book` — `business.business` | `app/about/page.tsx`, `app/book/page.tsx` |
| L2 | Hreflang только `en` + `x-default` (инфраструктура готова в `lib/seo.ts` для расширения) | (не баг — отметка для cs/de roadmap) |
| L3 | Testimonials.tsx — alt text динамический из Google Reviews API, не аудируется статически | `components/Testimonials.tsx` |
| L4 | Live INP/LCP/CLS не замерялись на preview — нужен отдельный прогон | — |

---

## Quality Gates — соблюдены

- ✅ HowTo schema **не рекомендуется** (deprecated Sept 2023)
- ✅ FAQPage помечен как **AI citation benefit**, не Google rich-result (Aug 2023 restriction на gov/health)
- ✅ Все CWV-метрики используют **INP**, не FID
- ✅ Location pages count = 30 — ниже warning threshold (50). Тонкий контент — flag H2 не hard stop
- ✅ Health Score reproducible (таблица выше с весами и числами)

---

## Ready-to-paste JSON-LD сниппеты

### Снипет 1 — AggregateRating на airport-transfer (Highest ROI)

**Файл:** `app/services/airport-transfer/page.tsx` — после получения `rating` через `getStaticAggregateRating()`, добавить в `pageSchema['@graph']`:

```typescript
...(rating ? [{
  '@type': ['LocalBusiness', 'TaxiService'],
  '@id': 'https://rideprestigo.com/#business',
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: rating.ratingValue.toFixed(1),
    reviewCount: rating.reviewCount,
    bestRating: '5',
    worstRating: '1',
  },
}] : []),
```

Тот же паттерн применим к остальным service-страницам (`city-rides`, `vip-events`, `group-transfers`, multi-day).

### Снипет 2 — FAQPage из существующего массива `faqs`

**Файл:** `app/services/airport-transfer/page.tsx` — добавить в `pageSchema['@graph']`:

```typescript
{
  '@type': 'FAQPage',
  '@id': 'https://rideprestigo.com/services/airport-transfer#faq',
  mainEntity: faqs.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
},
```

Аналогично — на каждой route-странице, где есть `faqs`-массив. В `lib/jsonld.ts` стоит добавить helper `faqPageSchema(faqs, pageUrl)` для переиспользования.

### Снипет 3 — расширенный Author schema для блога

**Файл:** `lib/blog-jsonld.ts` — расширить `BlogPosting.author`:

```typescript
author: {
  '@type': 'Person',
  name: 'Roman Ustyugov',
  jobTitle: 'Founder, Prestigo',
  url: 'https://rideprestigo.com/author/roman-ustyugov',
  sameAs: [
    'https://www.linkedin.com/in/<linkedin-handle>', // подтвердить URL
  ],
  worksFor: { '@id': 'https://rideprestigo.com/#business' },
},
```

И в каждый MDX frontmatter — добавить `dateModified: 2026-05-24` (или дату последней правки контента).

---

## Action plan (последовательность исполнения)

### Wave 1 — Schema injection (1-2 часа работы)
1. **H1 фикс** — добавить AggregateRating в `/services/airport-transfer` + остальные service-страницы (city-rides, vip-events, group-transfers, multi-day, /book если применимо)
2. **M3 фикс** — BreadcrumbList на `/services/page.tsx`
3. Создать helper `faqPageSchema()` в `lib/jsonld.ts`
4. **M1 фикс** — FAQPage на airport-transfer + route-страницы (через map по существующему массиву)

### Wave 2 — Blog authority (1 час)
5. **H3 фикс** — добавить `dateModified` в frontmatter обеих MDX-статей
6. Расширить `lib/blog-jsonld.ts` — author с `jobTitle`, `sameAs`, `worksFor`
7. **M5** — добавить видимый author byline в `app/blog/[slug]/page.tsx` (имя + должность + дата под H1)

### Wave 3 — Content uniqueness (отдельный milestone, ~1 день на 30 route)
8. **H2** — для каждой route-страницы добавить 150-300 слов уникального контекста: местная достопримечательность по пути, типичный профиль клиента (business/leisure), сезонные особенности. Это снимет thin-content риск при росте каталога.

### Wave 4 — Image & metadata polish (0.5 часа)
9. **M2** — route-specific og:image (использовать существующие city-картинки из `/public/routes/`)
10. **L1** — og:type per page (`profile` для /about, `business.business` для /book)

### Wave 5 — Performance verification
11. Запустить preview-сервер, замерить INP/LCP/CLS на:
    - / (home — heavy hero)
    - /routes/prague-vienna (route template — тяжёлый scroll)
    - /book (booking form interactions)
12. Проверить через `view-source:` или preview_eval, что schema действительно рендерится после правок

---

## Verification после execute-фазы

- [ ] Schema.org validator / Google Rich Results Test для home, /services/airport-transfer, /routes/prague-vienna, /blog/<article>
- [ ] `npm run build` без warnings
- [ ] Preview-сервер: schema видны в HTML, INP < 200ms, LCP < 2.5s
- [ ] sitemap.xml — все обновлённые страницы имеют свежий lastMod
- [ ] llms.txt всё ещё валидный (обновить если меняли URL-структуру)

---

**Следующий шаг:** одобрить Wave 1 (Schema injection — самый высокий ROI, минимум риска) и я открою отдельный план под него.
