import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import ArticleByline from '@/components/ArticleByline'
import { getAllPosts, type BlogPost } from '@/lib/blog'
import { buildBlogPostingJsonLd } from '@/lib/blog-jsonld'

export const dynamic = 'force-static'
export const dynamicParams = false

/**
 * MDX-only generateStaticParams. JSX article slugs MUST NOT appear here
 * (ART-02). Phase 54 invariant — preserved verbatim.
 */
export function generateStaticParams(): Array<{ slug: string }> {
  const contentDir = path.join(process.cwd(), 'content', 'blog')
  if (!fs.existsSync(contentDir)) return []
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => ({ slug: f.replace(/\.mdx$/, '') }))
}

function findMdxPost(slug: string): BlogPost | undefined {
  return getAllPosts().find((p) => p.slug === slug && p.source === 'mdx')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = findMdxPost(slug)
  if (!post) return { title: 'Not Found — Prestigo' }
  const canonical = `/blog/${slug}`
  const absolute = `https://rideprestigo.com${canonical}`
  return {
    title: `${post.title} — Prestigo`,
    description: post.description,
    alternates: {
      canonical,
      languages: { en: absolute, 'x-default': absolute },
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: absolute,
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

  // Allowlist preserved from Phase 54 scaffold — defence in depth even
  // with dynamicParams=false. Path-traversal safe.
  if (!/^[a-z0-9-]+$/.test(slug)) {
    notFound()
  }

  const post = findMdxPost(slug)
  if (!post) {
    notFound()
  }

  // Relative path is mandatory — webpack/Turbopack cannot resolve @/ in
  // dynamic import template strings. See RESEARCH.md Pitfall 3.
  let Post: React.ComponentType
  try {
    const mod = await import(`../../../content/blog/${slug}.mdx`)
    Post = mod.default
  } catch {
    notFound()
  }

  const jsonLd = buildBlogPostingJsonLd(post)

  return (
    <>
      <Nav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
