import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import Reveal from '@/components/Reveal'
import BlogCard from '@/components/BlogCard'
import { getAllPosts } from '@/lib/blog'
import { getPageContent } from '@/lib/page-content'

export const dynamic = 'force-static'

type BlogListingContent = {
  metadata: { title: string; description: string }
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string }
  emptyState: { heading: string; body: string; ctaLabel: string }
  cta: {
    headingLine1: string
    headingItalic: string
    body: string
    primaryLabel: string
    secondaryLabel: string
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const content = getPageContent('blog', locale) as BlogListingContent
  const posts = getAllPosts(locale)
  const ogImage = posts[0]?.coverImage ?? '/hero-airport-transfer.webp'
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: {
      canonical: '/blog',
      languages: {
        en: 'https://rideprestigo.com/blog',
        'x-default': 'https://rideprestigo.com/blog',
      },
    },
    openGraph: {
      url: 'https://rideprestigo.com/blog',
      title: content.metadata.title,
      description: content.metadata.description,
      images: [
        {
          url: `https://rideprestigo.com${ogImage}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  }
}

export default async function BlogPage() {
  const locale = await getLocale()
  const content = getPageContent('blog', locale) as BlogListingContent
  const posts = getAllPosts(locale)
  return (
    <>
      <Nav />
      <main id="main-content">
        {/* Hero */}
        <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20">
          <div className="max-w-5xl mx-auto px-6 md:px-12">
            <p className="label" style={{ color: 'var(--copper-light)' }}>{content.hero.label}</p>
            <div className="copper-line my-6" />
            <h1 className="font-display font-light text-[40px] md:text-[56px] text-offwhite leading-[1.1]">
              {content.hero.headlineLine1}{' '}
              <span className="italic" style={{ color: 'var(--copper-pale)' }}>
                {content.hero.headlineItalic}
              </span>
            </h1>
            <p className="body-text mt-6 max-w-2xl">
              {content.hero.intro}
            </p>
          </div>
        </section>

        <Divider />

        {/* Card grid */}
        <section className="theme-light bg-anthracite-mid py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6 md:px-12">
            {posts.length === 0 ? (
              <div className="text-center py-24">
                <p className="font-display font-light text-[28px] text-offwhite mb-4">
                  {content.emptyState.heading}
                </p>
                <p className="body-text mb-8">
                  {content.emptyState.body}
                </p>
                <a href="/book" className="btn-primary">{content.emptyState.ctaLabel}</a>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post, i) => (
                  <Reveal key={post.slug} variant="up" delay={i * 100}>
                    <BlogCard post={post} />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>

        <Divider />

        {/* Bottom CTA */}
        <section className="bg-anthracite py-20">
          <div className="max-w-3xl mx-auto px-6 md:px-12 text-center">
            <h2 className="font-display font-light text-[28px] md:text-[36px] text-offwhite leading-[1.15]">
              {content.cta.headingLine1}{' '}
              <span className="italic" style={{ color: 'var(--copper-pale)' }}>
                {content.cta.headingItalic}
              </span>
            </h2>
            <p className="body-text mt-5 mb-8">
              {content.cta.body}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/book" className="btn-primary">{content.cta.primaryLabel}</a>
              <a href="/fleet" className="btn-ghost">{content.cta.secondaryLabel}</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
