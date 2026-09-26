import { describe, it, expect } from 'vitest'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ruMessages from '@/messages/ru.json'
import type { AbstractIntlMessages } from 'next-intl'
import BlogCard from '@/components/BlogCard'
import { formatBylineDate } from '@/lib/authors'
import type { BlogPost } from '@/lib/blog'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages

const post: BlogPost = {
  slug: 'premium-airport-transfer-prague-shortcut',
  title: "Premium Airport Transfer: Prague's Hidden Shortcut",
  description: 'Most travellers waste 40 minutes queueing for a taxi at Václav Havel Airport.',
  date: '2026-05-13',
  coverImage: '/hero-airport-transfer.webp',
  category: 'Airport Transfer',
  author: 'roman-ustyugov',
  source: 'mdx',
}

describe('BlogCard', () => {
  it('renders title accessible via aria-label on the link', () => {
    renderWithIntl(<BlogCard post={post} />)
    const link = screen.getByRole('link', { name: post.title })
    expect(link).toBeTruthy()
  })

  it('links to /blog/{slug} under en (unprefixed)', () => {
    renderWithIntl(<BlogCard post={post} />)
    const link = screen.getByRole('link', { name: post.title }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(`/blog/${post.slug}`)
  })

  it('renders category label', () => {
    renderWithIntl(<BlogCard post={post} />)
    expect(screen.getByText(post.category)).toBeTruthy()
  })

  it('renders cover image with title as alt text', () => {
    renderWithIntl(<BlogCard post={post} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe(post.title)
    expect(img.getAttribute('src')).toBe(post.coverImage)
  })

  it('renders the formatted date string', () => {
    renderWithIntl(<BlogCard post={post} />)
    const formatted = formatBylineDate(post.date)
    expect(screen.getByText(formatted)).toBeTruthy()
  })

  it('renders "Read article →" in en', () => {
    renderWithIntl(<BlogCard post={post} />)
    expect(screen.getByText('Read article →')).toBeTruthy()
  })

  it('links to /ru/blog/{slug} and renders the ru CTA under the ru catalog', () => {
    renderWithIntl(<BlogCard post={post} />, { locale: 'ru', messages: ruMessagesTyped })
    const link = screen.getByRole('link', { name: post.title }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(`/ru/blog/${post.slug}`)
    expect(screen.queryByText('Read article →')).toBeNull()
    const ruLabel = (ruMessagesTyped as unknown as { BlogCard: { readArticle: string } }).BlogCard
      .readArticle
    expect(screen.getByText(ruLabel)).toBeTruthy()
  })
})
