# Requirements — Milestone v1.0: SEO Blog

## Scope

Build an MDX-powered blog at `/blog` for rideprestigo.com. Migrate 3 existing editorial articles from `/guides` and `/compare` into the blog hub. Goal: scalable organic search content under a single canonical path.

---

## INFRA — MDX Pipeline

- [ ] **INFRA-01**: `mdx-components.tsx` created at repo root (required by `@next/mdx`; maps HTML elements to Prestigo-styled components)
- [ ] **INFRA-02**: `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`, `gray-matter`, `remark-gfm` installed; `next.config.ts` wrapped with `createMDX()`
- [ ] **INFRA-03**: `content/blog/` directory created with a `.gitkeep` placeholder (or first real MDX test file)
- [ ] **INFRA-04**: `lib/blog.ts` exports `getAllPosts(): BlogPost[]` — aggregates MDX frontmatter (via `gray-matter` file reads) + `JSX_POSTS` hardcoded registry; sorted newest-first
- [ ] **INFRA-05**: MDX frontmatter schema enforced in `lib/blog.ts`: `title`, `description`, `date`, `coverImage`, `category`, `author` (typed as `AuthorSlug`); optional `dateModified`

## LISTING — Blog Index Page

- [ ] **LIST-01**: `app/blog/page.tsx` renders card grid of all posts from `getAllPosts()`, sorted newest-first
- [ ] **LIST-02**: Each card: cover image (`coverImage`), category label (copper), title (display font), description (body-text), formatted date; links to `/blog/[slug]`
- [ ] **LIST-03**: `/blog` has full SEO metadata: `<title>`, `<meta description>`, canonical `/blog`, `og:title`, `og:description`, `og:image` (first post's `coverImage`)

## ARTICLE — MDX Article Page

- [ ] **ART-01**: `app/blog/[slug]/page.tsx` renders MDX articles with `dynamicParams = false` (404 for unknown slugs)
- [ ] **ART-02**: `generateStaticParams()` returns MDX-only slugs from `content/blog/*.mdx` — must NOT include the 3 JSX article slugs
- [ ] **ART-03**: Article page renders: hero `<img>` with `coverImage`, `<ArticleByline>`, MDX body content, bottom CTA section
- [ ] **ART-04**: Article page full SEO: `og:title`, `og:description`, `og:image` (= `coverImage`), canonical `/blog/[slug]`, `Schema.org BlogPosting` with `personSchemaFor()` author node
- [ ] **ART-05**: `app/blog/page.tsx` and `app/blog/[slug]/page.tsx` both include `/blog/*` entries in `app/sitemap.ts`

## MIGRATE — Article Migration

- [ ] **MIG-01**: 3 JSX articles moved (via `git mv`) to `/blog/*` in their own atomic commit, before any URL updates or sitemap changes
  - `app/guides/prague-airport-to-city-center/page.tsx` → `app/blog/prague-airport-to-city-center/page.tsx`
  - `app/compare/prague-airport-taxi-vs-chauffeur/page.tsx` → `app/blog/prague-airport-taxi-vs-chauffeur/page.tsx`
  - `app/compare/prague-vienna-transfer-vs-train/page.tsx` → `app/blog/prague-vienna-transfer-vs-train/page.tsx`
- [ ] **MIG-02**: All 9 URL locations per file updated (use `const CANONICAL_PATH` at file top):
  - `alternates.canonical`, `alternates.languages.en`, `alternates.languages['x-default']`, `openGraph.url`
  - Schema.org: `BreadcrumbList @id`, `ListItem.item`, `Article @id`, `Article url`, `FAQPage @id` (fragment variants included)
- [ ] **MIG-03**: 5 permanent redirects added to `next.config.ts` `redirects()` array:
  - `/guides` → `/blog`
  - `/guides/prague-airport-to-city-center` → `/blog/prague-airport-to-city-center`
  - `/compare` → `/blog`
  - `/compare/prague-airport-taxi-vs-chauffeur` → `/blog/prague-airport-taxi-vs-chauffeur`
  - `/compare/prague-vienna-transfer-vs-train` → `/blog/prague-vienna-transfer-vs-train`
- [ ] **MIG-04**: `app/sitemap.ts` updated: old `/guides/*` and `/compare/*` entries removed; `/blog`, `/blog/prague-airport-to-city-center`, `/blog/prague-airport-taxi-vs-chauffeur`, `/blog/prague-vienna-transfer-vs-train` added; MDX posts added dynamically
- [ ] **MIG-05**: `app/guides/page.tsx` and `app/compare/page.tsx` converted to redirect pages pointing to `/blog` (or removed; redirects in `next.config.ts` cover the paths)
- [ ] **MIG-06**: `JSX_POSTS` registry in `lib/blog.ts` populated with metadata for all 3 migrated articles (title, description, date, coverImage, category, authorSlug, slug)

---

## Future Requirements (deferred)

- Czech and Russian blog posts — internationalisation deferred to a future milestone
- Search within blog — site-level search is a separate initiative
- Category filter on `/blog` listing — unnecessary at current post volume; add when > 15 posts
- Headless CMS (Contentful, Sanity) — MDX-in-repo is sufficient for now
- Converting JSX articles to MDX — too complex; JSX stays

## Out of Scope

- Comments or community features — editorial blog only
- Dynamic server-side rendering for blog pages — all pages are `force-static`
- `runtime = 'edge'` on sitemap or blog pages — `fs.readdirSync` is blocked in Edge Runtime

---

## Traceability

| Phase | Requirements |
|-------|-------------|
| Phase 54 — MDX Infrastructure | INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05 |
| Phase 55 — Blog UI (Listing + Article) | LIST-01, LIST-02, LIST-03, ART-01, ART-02, ART-03, ART-04, ART-05 |
| Phase 56 — Article Migration + SEO Wiring | MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06 |

---

*Last updated: 2026-05-13 — Milestone v1.0 requirements defined*
