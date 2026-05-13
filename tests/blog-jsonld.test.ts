import { describe, it, expect } from 'vitest'
import { buildBlogPostingJsonLd } from '@/lib/blog-jsonld'
import { personSchemaFor } from '@/lib/authors'
import type { BlogPost } from '@/lib/blog'

const post: BlogPost = {
  slug: 'premium-airport-transfer-prague-shortcut',
  title: "Premium Airport Transfer: Prague's Hidden Shortcut",
  description: 'Most travellers waste 40 minutes queueing for a taxi.',
  date: '2026-05-13',
  coverImage: '/hero-airport-transfer.webp',
  category: 'Airport Transfer',
  author: 'roman-ustyugov',
  source: 'mdx',
}

describe('buildBlogPostingJsonLd', () => {
  it('returns @context schema.org and a @graph of length 2', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@context': string; '@graph': unknown[] }
    expect(ld['@context']).toBe('https://schema.org')
    expect(Array.isArray(ld['@graph'])).toBe(true)
    expect(ld['@graph']).toHaveLength(2)
  })

  it('@graph[0] is a BreadcrumbList with 3 items', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    const crumb = ld['@graph'][0] as { '@type': string; itemListElement: unknown[] }
    expect(crumb['@type']).toBe('BreadcrumbList')
    expect(crumb.itemListElement).toHaveLength(3)
  })

  it('@graph[1] is BlogPosting (not Article)', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    expect(ld['@graph'][1]['@type']).toBe('BlogPosting')
  })

  it('BlogPosting.image.url is the absolute URL of coverImage', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    const article = ld['@graph'][1] as { image: { url: string } }
    expect(article.image.url).toBe('https://rideprestigo.com/hero-airport-transfer.webp')
  })

  it('BlogPosting.author equals personSchemaFor(post.author)', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    const article = ld['@graph'][1] as { author: unknown }
    expect(article.author).toEqual(personSchemaFor(post.author))
  })

  it('BlogPosting dates default dateModified to date when omitted', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    const article = ld['@graph'][1] as { datePublished: string; dateModified: string }
    expect(article.datePublished).toBe('2026-05-13')
    expect(article.dateModified).toBe('2026-05-13')
  })

  it('BlogPosting.url is the absolute canonical /blog/{slug}', () => {
    const ld = buildBlogPostingJsonLd(post) as { '@graph': Array<Record<string, unknown>> }
    const article = ld['@graph'][1] as { url: string }
    expect(article.url).toBe('https://rideprestigo.com/blog/premium-airport-transfer-prague-shortcut')
  })
})
