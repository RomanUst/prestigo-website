import { describe, it, expect } from 'vitest'
import { getAlternates } from '@/lib/seo'

/**
 * Pins the target getAlternates(path, opts) contract (Phase 74, SEO-01/03/04).
 * Grounded against the real content tree, not hypothetical fixtures:
 *   - content/routes/{en,ru,es,fr,ar,hi,zh}/prague-vienna.json all exist
 *     (fully translated route — RESEARCH: "30/30 routes ... fully populated").
 *   - content/pages/{en,ru,es,fr,ar,hi,zh}/data-deletion.json all exist
 *     (real, current noindex page — RESEARCH Pitfall 5/6).
 *   - content/blog/<locale>/prague-airport-to-city-center.mdx does NOT exist
 *     for ANY locale (it's one of the 3 legacy JSX_POSTS articles, which have
 *     no content/blog file at all) — the real, grounded "locale file absent"
 *     case for the D-07 exclusion gate (every non-en locale key omitted; en +
 *     x-default always present, per getAlternates's "en always included"
 *     rule).
 */
const FULL_KEYS = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh-Hans', 'x-default']

describe('getAlternates', () => {
  it('emits one key per locale (BCP-47 tag) + x-default for an indexable, fully-translated route', () => {
    const result = getAlternates('/routes/prague-vienna', {
      indexable: true,
      content: { kind: 'route', key: 'prague-vienna' },
    })
    expect(result.canonical).toBe('/routes/prague-vienna')
    expect(Object.keys(result.languages)).toEqual(FULL_KEYS)
    expect(result.languages.en).toBe('https://rideprestigo.com/routes/prague-vienna')
    expect(result.languages.ru).toBe('https://rideprestigo.com/ru/routes/prague-vienna')
    expect(result.languages['zh-Hans']).toBe('https://rideprestigo.com/zh/routes/prague-vienna')
    expect(result.languages['x-default']).toBe('https://rideprestigo.com/routes/prague-vienna')
  })

  it('returns an empty languages cluster (but keeps canonical) for a noindex page — D-06', () => {
    const result = getAlternates('/data-deletion', {
      indexable: false,
      content: { kind: 'page', key: 'data-deletion' },
    })
    expect(result.canonical).toBe('/data-deletion')
    expect(result.languages).toEqual({})
  })

  it('excludes locales with no genuine translation file, keeping en + x-default — D-07', () => {
    const result = getAlternates('/blog/prague-airport-to-city-center', {
      indexable: true,
      content: { kind: 'blog', key: 'prague-airport-to-city-center' },
    })
    expect(Object.keys(result.languages)).toEqual(['en', 'x-default'])
    expect(result.languages.ru).toBeUndefined()
    expect(result.languages.es).toBeUndefined()
    expect(result.languages['zh-Hans']).toBeUndefined()
  })

  it('maps zh to the zh-Hans BCP-47 script subtag; en/ru/es/fr/ar/hi map to themselves', () => {
    const result = getAlternates('/routes/prague-vienna', {
      indexable: true,
      content: { kind: 'route', key: 'prague-vienna' },
    })
    const keys = Object.keys(result.languages)
    expect(keys).toContain('zh-Hans')
    expect(keys).not.toContain('zh')
    for (const tag of ['en', 'ru', 'es', 'fr', 'ar', 'hi']) {
      expect(keys).toContain(tag)
    }
  })

  it('key order is deterministic — routing.locales order with x-default last', () => {
    const result = getAlternates('/routes/prague-vienna', {
      indexable: true,
      content: { kind: 'route', key: 'prague-vienna' },
    })
    expect(Object.keys(result.languages)).toEqual(FULL_KEYS)
  })

  it('includes all 7 locales when no content ref is supplied (chrome-only page)', () => {
    const result = getAlternates('/book', { indexable: true })
    expect(Object.keys(result.languages)).toEqual(FULL_KEYS)
    expect(result.languages.ru).toBe('https://rideprestigo.com/ru/book')
  })

  it('emits x-default -> EN root-form URL and a self-canonical for the home ("" / "/") case', () => {
    const resultEmpty = getAlternates('', { indexable: true })
    expect(resultEmpty.canonical).toBe('https://rideprestigo.com')
    expect(resultEmpty.languages['x-default']).toBe('https://rideprestigo.com')
    expect(resultEmpty.languages.en).toBe('https://rideprestigo.com')

    const resultSlash = getAlternates('/', { indexable: true })
    expect(resultSlash.canonical).toBe('https://rideprestigo.com')
    expect(resultSlash.languages['x-default']).toBe('https://rideprestigo.com')
  })
})
