import { describe, it, expect } from 'vitest'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ruMessages from '@/messages/ru.json'
import type { AbstractIntlMessages } from 'next-intl'
import BlogCard from '@/components/BlogCard'
import { formatBylineDate } from '@/lib/authors'
import { formatLocaleDate } from '@/lib/locale-date'
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

// ─── 75-28 (GAP-4d): blog category labels render in the page locale ─────────

describe('BlogCard category label (75-28)', () => {
  const LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
  const CATEGORY_KEYS = {
    'Airport Transfer': 'airportTransfer',
    'Intercity Routes': 'intercityRoutes',
    'Chauffeur Service': 'chauffeurService',
  } as const

  it('EN catalog labels equal the EN frontmatter values verbatim', async () => {
    const en = (await import('@/messages/en.json')).default as unknown as {
      BlogCategories: Record<string, string>
    }
    for (const [value, key] of Object.entries(CATEGORY_KEYS)) {
      expect(en.BlogCategories[key]).toBe(value)
    }
  })

  for (const locale of LOCALES) {
    it(`renders the ${locale} BlogCategories label for each known category`, async () => {
      const messages = (await import(`@/messages/${locale}.json`)).default as unknown as AbstractIntlMessages
      const cats = (messages as unknown as { BlogCategories: Record<string, string> }).BlogCategories
      for (const [value, key] of Object.entries(CATEGORY_KEYS)) {
        const { unmount } = renderWithIntl(<BlogCard post={{ ...post, category: value }} />, {
          locale,
          messages,
        })
        expect(cats[key], `${locale}:${key}`).toBeTruthy()
        expect(cats[key]).not.toBe(value)
        expect(screen.getByText(cats[key])).toBeTruthy()
        expect(screen.queryByText(value)).toBeNull()
        unmount()
      }
    })
  }

  it('renders the ru label for "Intercity Routes" (ledger row)', () => {
    renderWithIntl(<BlogCard post={{ ...post, category: 'Intercity Routes' }} />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const ru = (ruMessagesTyped as unknown as { BlogCategories: { intercityRoutes: string } }).BlogCategories
    expect(screen.getByText(ru.intercityRoutes)).toBeTruthy()
  })

  it('falls back to the raw category value for an unknown category', () => {
    renderWithIntl(<BlogCard post={{ ...post, category: 'Travel Notes' }} />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    expect(screen.getByText('Travel Notes')).toBeTruthy()
  })
})

// ─── 75-34 (WR-04): card dates render in the page locale's own format ──────

describe('BlogCard date (75-34)', () => {
  const LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
  const EN_MONTHS =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/

  it('en provider: card date equals formatLocaleDate(date, "en") (unchanged en-GB)', () => {
    renderWithIntl(<BlogCard post={post} />)
    expect(formatLocaleDate(post.date, 'en')).toBe(formatBylineDate(post.date))
    expect(screen.getByText(formatLocaleDate(post.date, 'en'))).toBeTruthy()
  })

  for (const locale of LOCALES) {
    it(`${locale} provider: card date is formatLocaleDate(date, "${locale}") with no English month`, async () => {
      const messages = (await import(`@/messages/${locale}.json`)).default as unknown as AbstractIntlMessages
      const { container } = renderWithIntl(<BlogCard post={post} />, { locale, messages })
      const expected = formatLocaleDate(post.date, locale)
      expect(screen.getByText(expected)).toBeTruthy()
      expect(screen.queryByText(formatBylineDate(post.date))).toBeNull()
      expect(container.textContent ?? '').not.toMatch(EN_MONTHS)
    })
  }

  it('reads the locale via next-intl useLocale, not the en-GB-only lib/authors helper', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const src = readFileSync(path.resolve(__dirname, '..', 'components', 'BlogCard.tsx'), 'utf8')
    expect(src).not.toContain('formatBylineDate')
    expect(src).toContain('useLocale')
  })
})
