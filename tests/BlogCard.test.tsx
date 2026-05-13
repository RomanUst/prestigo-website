import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlogCard from '@/components/BlogCard'
import { formatBylineDate } from '@/lib/authors'
import type { BlogPost } from '@/lib/blog'

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
    render(<BlogCard post={post} />)
    const link = screen.getByRole('link', { name: post.title })
    expect(link).toBeTruthy()
  })

  it('links to /blog/{slug}', () => {
    render(<BlogCard post={post} />)
    const link = screen.getByRole('link', { name: post.title }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(`/blog/${post.slug}`)
  })

  it('renders category label', () => {
    render(<BlogCard post={post} />)
    expect(screen.getByText(post.category)).toBeTruthy()
  })

  it('renders cover image with title as alt text', () => {
    render(<BlogCard post={post} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe(post.title)
    expect(img.getAttribute('src')).toBe(post.coverImage)
  })

  it('renders the formatted date string', () => {
    render(<BlogCard post={post} />)
    const formatted = formatBylineDate(post.date)
    expect(screen.getByText(formatted)).toBeTruthy()
  })
})
