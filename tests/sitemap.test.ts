import { describe, it, expect } from 'vitest'
import sitemap from '@/app/sitemap'
import { JSX_POSTS } from '@/lib/blog'

describe('sitemap /blog entries', () => {
  const entries = sitemap()
  const urls = entries.map((e) => e.url)

  it('includes the /blog listing URL', () => {
    expect(urls).toContain('https://rideprestigo.com/blog')
  })

  it('includes the MDX test post under /blog/{slug}', () => {
    expect(urls).toContain(
      'https://rideprestigo.com/blog/premium-airport-transfer-prague-shortcut',
    )
  })

  it('includes /blog/* entries for all 3 migrated JSX articles', () => {
    for (const jsx of JSX_POSTS) {
      expect(urls).toContain(`https://rideprestigo.com/blog/${jsx.slug}`)
    }
  })

  it('does NOT include /guides/* or /compare/* entries', () => {
    for (const url of urls) {
      expect(url).not.toMatch(/rideprestigo\.com\/(guides|compare)/)
    }
  })

  it('every /blog/* entry has lastModified Date and en + x-default alternates', () => {
    const blogEntries = entries.filter((e) =>
      (e.url as string).startsWith('https://rideprestigo.com/blog'),
    )
    expect(blogEntries.length).toBeGreaterThan(0)
    for (const e of blogEntries) {
      expect(e.lastModified).toBeInstanceOf(Date)
      const langs = (e.alternates as { languages: Record<string, string> }).languages
      expect(typeof langs.en).toBe('string')
      expect(typeof langs['x-default']).toBe('string')
    }
  })
})
