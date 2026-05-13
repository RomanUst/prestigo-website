import type { Metadata } from 'next'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'
import Divider from '@/components/Divider'
import Reveal from '@/components/Reveal'
import BlogCard from '@/components/BlogCard'
import { getAllPosts } from '@/lib/blog'

export const dynamic = 'force-static'

const TITLE = 'Prague Chauffeur Blog — Airport, Routes & Transfer Guides'
const DESCRIPTION =
  'Practical guides on Prague airport transfers, intercity routes, and luxury chauffeur services — verified 2026 fares and local knowledge from Prestigo.'

const posts = getAllPosts()
const ogImage = posts[0]?.coverImage ?? '/hero-airport-transfer.webp'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/blog',
    languages: {
      en: 'https://rideprestigo.com/blog',
      'x-default': 'https://rideprestigo.com/blog',
    },
  },
  openGraph: {
    url: 'https://rideprestigo.com/blog',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: `https://rideprestigo.com${ogImage}`,
        width: 1200,
        height: 630,
      },
    ],
  },
}

export default function BlogPage() {
  return (
    <>
      <Nav />
      <main id="main-content">
        {/* Hero */}
        <section className="bg-anthracite pt-32 pb-16 md:pt-40 md:pb-20">
          <div className="max-w-5xl mx-auto px-6 md:px-12">
            <p className="label" style={{ color: 'var(--copper-light)' }}>Blog</p>
            <div className="copper-line my-6" />
            <h1 className="font-display font-light text-[40px] md:text-[56px] text-offwhite leading-[1.1]">
              Prague travel,{' '}
              <span className="italic" style={{ color: 'var(--copper-pale)' }}>
                explained clearly.
              </span>
            </h1>
            <p className="body-text mt-6 max-w-2xl">
              Practical guides written from real dispatch data. Every fare, route, and timing verified for 2026.
            </p>
          </div>
        </section>

        <Divider />

        {/* Card grid */}
        <section className="bg-anthracite-mid py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-6 md:px-12">
            {posts.length === 0 ? (
              <div className="text-center py-24">
                <p className="font-display font-light text-[28px] text-offwhite mb-4">
                  No articles yet.
                </p>
                <p className="body-text mb-8">
                  We&apos;re preparing detailed guides on Prague transfers and routes. Check back soon, or book your transfer now.
                </p>
                <a href="/book" className="btn-primary">Book a Transfer</a>
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
              Ready to book?{' '}
              <span className="italic" style={{ color: 'var(--copper-pale)' }}>
                Fixed price, door-to-door.
              </span>
            </h2>
            <p className="body-text mt-5 mb-8">
              No meters. No surprises. Mercedes fleet, 24/7 Prague dispatch.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/book" className="btn-primary">Book a Transfer</a>
              <a href="/fleet" className="btn-ghost">View Fleet</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
