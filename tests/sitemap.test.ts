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

// SEO-03: sitemap entries delegate to getAlternates() — the same single
// source of truth consumed by per-page generateMetadata() — so the sitemap
// cluster for any URL is identical to that URL's page-level cluster.
describe('sitemap alternates cluster (SEO-03, delegates to getAlternates)', () => {
  const entries = sitemap()

  it('a fully-translated route entry (prague-vienna) carries the full 7-locale + x-default cluster', () => {
    const routeEntry = entries.find((e) => e.url === 'https://rideprestigo.com/routes/prague-vienna')
    expect(routeEntry).toBeDefined()
    const langs = (routeEntry!.alternates as { languages: Record<string, string> }).languages
    expect(Object.keys(langs)).toEqual(['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans', 'x-default'])
    expect(langs['zh-Hans']).toBe('https://rideprestigo.com/zh/routes/prague-vienna')
  })

  it('a legacy JSX_POSTS blog entry (no content/blog file in any locale) collapses to en + x-default only', () => {
    const jsxEntry = entries.find(
      (e) => e.url === 'https://rideprestigo.com/blog/prague-airport-to-city-center',
    )
    expect(jsxEntry).toBeDefined()
    const langs = (jsxEntry!.alternates as { languages: Record<string, string> }).languages
    expect(Object.keys(langs)).toEqual(['en', 'x-default'])
  })
})
