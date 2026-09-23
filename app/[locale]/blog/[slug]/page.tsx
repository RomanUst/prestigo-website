import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ArticleByline from '@/components/ArticleByline'
import { getAllPosts, resolveLocalizedMdx, blogCanonical, type BlogPost } from '@/lib/blog'
import { buildBlogPostingJsonLd } from '@/lib/blog-jsonld'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'

export const dynamic = 'force-static'
// Untranslated {locale, slug} combinations (no localized MDX yet, all of
// them until Phase 72/73 land) render on-demand via the EN fallback below
// rather than 404 — RESEARCH.md Open Question 2.
export const dynamicParams = true

/**
 * MDX-only generateStaticParams, sourced from content/blog/en/ — the
 * localized files that actually exist today (EN only, Phase 71 does no
 * translation). JSX article slugs MUST NOT appear here (ART-02). Phase 54
 * invariant — preserved.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  const contentDir = path.join(process.cwd(), 'content', 'blog', 'en')
  if (!fs.existsSync(contentDir)) return []
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => ({ slug: f.replace(/\.mdx$/, '') }))
}

function findMdxPost(slug: string, dir: string): BlogPost | undefined {
  return getAllPosts(dir).find((p) => p.slug === slug && p.source === 'mdx')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}): Promise<Metadata> {
  // CR-01: locale comes from the route's own dynamic segment (`params`),
  // not a bare `getLocale()` call — this page is `force-static`, and a
  // bare getLocale() on a force-static route was the Phase-73 EN-leak bug.
  const { slug, locale } = await params
  const resolved = resolveLocalizedMdx(slug, locale)
  if (!resolved) return { title: 'Not Found — Prestigo' }
  const post = findMdxPost(slug, resolved.dir)
  if (!post) return { title: 'Not Found — Prestigo' }
  // canonical → EN for an untranslated localized path (D-07); self-refs the
  // current locale's own URL for a genuinely localized post (CR-01).
  // getAlternates' own D-07 fs-probe (content: { kind: 'blog', key: slug })
  // sources the languages cluster — only locales with a genuine
  // content/blog/<locale>/<slug>.mdx join it.
  const canonical = blogCanonical(slug, resolved.isFallback, locale)
  const { languages } = getAlternates(`/blog/${slug}`, {
    indexable: true,
    content: { kind: 'blog', key: slug },
  })
  return {
    title: { absolute: `${post.title} — Prestigo` },
    description: post.description,
    alternates: { canonical, languages },
    openGraph: {
      title: post.title,
      description: post.description,
      url: toAbsoluteUrl(canonical),
      images: [
        {
          url: `https://rideprestigo.com${post.coverImage}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  }
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const locale = await getLocale()

  // Allowlist preserved from Phase 54 scaffold — defence in depth even
  // with dynamicParams=true. Path-traversal safe.
  if (!/^[a-z0-9-]+$/.test(slug)) {
    notFound()
  }

  const resolved = resolveLocalizedMdx(slug, locale)
  if (!resolved) {
    notFound()
  }

  const post = findMdxPost(slug, resolved.dir)
  if (!post) {
    notFound()
  }

  // Relative path is mandatory — webpack/Turbopack cannot resolve @/ in
  // dynamic import template strings. See RESEARCH.md Pitfall 3. resolved.dir
  // is constrained to a validated locale or the literal 'en' by
  // resolveLocalizedMdx (T-71-BLOG-01) before it ever reaches this import.
  let Post: React.ComponentType
  try {
    const mod = await import(`../../../../content/blog/${resolved.dir}/${slug}.mdx`)
    Post = mod.default
  } catch {
    notFound()
  }

  const jsonLd = buildBlogPostingJsonLd(post)

  function safeJsonLd(obj: unknown): string {
    return JSON.stringify(obj).replace(/<\/script>/gi, '<\\/script>')
  }

  return (
    <>
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <main id="main-content">
        {/* Hero */}
        <section className="bg-anthracite pt-32 pb-12 md:pt-40 md:pb-16 border-b border-anthracite-light">
          <div className="max-w-3xl mx-auto px-6 md:px-12">
            <p className="label" style={{ color: 'var(--copper-light)' }}>
              {post.category}
            </p>
            <div className="copper-line my-6" />
            <h1 className="font-display font-light text-[40px] md:text-[56px] text-offwhite leading-[1.1]">
              {post.title}
            </h1>
            <p className="body-text mt-6">{post.description}</p>
            <div className="mt-8">
              <ArticleByline
                authorSlug={post.author}
                datePublished={post.date}
                dateModified={post.dateModified}
              />
            </div>
          </div>
        </section>

        {/* Hero image */}
        <section className="bg-anthracite">
          <div className="max-w-4xl mx-auto">
            <img
              src={post.coverImage}
              alt={post.title}
              width={1200}
              height={675}
              className="w-full aspect-[16/9] object-cover"
              loading="eager"
              decoding="async"
            />
          </div>
        </section>

        {/* MDX body */}
        <article className="bg-anthracite py-16 md:py-24">
          <div className="max-w-3xl mx-auto px-6 md:px-12">
            <Post />
          </div>
        </article>

        {/* Bottom CTA */}
        <section className="bg-anthracite py-20 border-t border-anthracite-light">
          <div className="max-w-3xl mx-auto px-6 md:px-12 text-center">
            <h2 className="font-display font-light text-[28px] md:text-[36px] text-offwhite leading-[1.15]">
              Skip the taxi rank.{' '}
              <span className="italic" style={{ color: 'var(--copper-pale)' }}>
                Chauffeur inside Arrivals.
              </span>
            </h2>
            <p className="body-text mt-5 mb-8">
              Mercedes E-Class. Free flight tracking. Free waiting on delays. 24/7.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/book" className="btn-primary">
                Book your transfer
              </a>
              <a href="/services/airport-transfer" className="btn-ghost">
                Airport transfer details
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
