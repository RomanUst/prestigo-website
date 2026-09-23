import { describe, it, expect } from 'vitest'
import { getAlternates, toAbsoluteUrl } from '@/lib/seo'

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

/**
 * CR-01: alternates.canonical is now locale-aware via opts.locale.
 * Grounded against the same real content tree as the suite above:
 *   - content/routes/{en,ru,...}/prague-berlin.json exist (fully translated).
 *   - content/pages/{en,ru,...}/data-deletion.json exist (real noindex page).
 *   - content/blog/<locale>/prague-airport-to-city-center.mdx does NOT exist
 *     for any locale (JSX_POSTS legacy article, D-08 EN-only).
 */
describe('getAlternates — locale-aware canonical (CR-01)', () => {
  it('(a) no-locale call is byte-identical to the pre-CR-01 output', () => {
    const withLocaleOmitted = getAlternates('/routes/prague-vienna', {
      indexable: true,
      content: { kind: 'route', key: 'prague-vienna' },
    })
    expect(withLocaleOmitted.canonical).toBe('/routes/prague-vienna')
  })

  it('(b) locale:"ru" with translated content -> self-referencing ru canonical', () => {
    const result = getAlternates('/routes/prague-berlin', {
      indexable: true,
      content: { kind: 'route', key: 'prague-berlin' },
      locale: 'ru',
    })
    expect(result.canonical).toBe('https://rideprestigo.com/ru/routes/prague-berlin')
  })

  it('(c) locale:"ru" with a content ref but no ru translation file -> canonical stays EN (D-07 fallback)', () => {
    const result = getAlternates('/blog/prague-airport-to-city-center', {
      indexable: true,
      content: { kind: 'blog', key: 'prague-airport-to-city-center' },
      locale: 'ru',
    })
    expect(result.canonical).toBe('/blog/prague-airport-to-city-center')
  })

  it('(d) locale:"en" is identical to omitting locale entirely', () => {
    const withEn = getAlternates('/routes/prague-berlin', {
      indexable: true,
      content: { kind: 'route', key: 'prague-berlin' },
      locale: 'en',
    })
    const withoutLocale = getAlternates('/routes/prague-berlin', {
      indexable: true,
      content: { kind: 'route', key: 'prague-berlin' },
    })
    expect(withEn.canonical).toBe(withoutLocale.canonical)
  })

  it('(e) home ("/") with locale:"ru" -> https://rideprestigo.com/ru', () => {
    const result = getAlternates('/', { indexable: true, locale: 'ru' })
    expect(result.canonical).toBe('https://rideprestigo.com/ru')
  })

  it('(f) indexable:false ignores opts.locale entirely — canonical/languages unchanged', () => {
    const result = getAlternates('/data-deletion', {
      indexable: false,
      content: { kind: 'page', key: 'data-deletion' },
      locale: 'ru',
    })
    expect(result.canonical).toBe('/data-deletion')
    expect(result.languages).toEqual({})
  })

  it('an invalid/unconfigured locale falls through to the EN-form canonical', () => {
    const result = getAlternates('/routes/prague-berlin', {
      indexable: true,
      content: { kind: 'route', key: 'prague-berlin' },
      locale: 'xx',
    })
    expect(result.canonical).toBe('/routes/prague-berlin')
  })

  it('a chrome-only page (no content ref) self-canonicalizes for any routing locale', () => {
    const result = getAlternates('/book', { indexable: true, locale: 'es' })
    expect(result.canonical).toBe('https://rideprestigo.com/es/book')
  })
})

describe('toAbsoluteUrl (WR-02)', () => {
  it('leaves an already-absolute canonical unchanged', () => {
    expect(toAbsoluteUrl('https://rideprestigo.com/ru/about')).toBe(
      'https://rideprestigo.com/ru/about'
    )
  })

  it('prefixes a relative canonical with BASE', () => {
    expect(toAbsoluteUrl('/about')).toBe('https://rideprestigo.com/about')
  })

  it('home-page BASE-only canonical is returned unchanged (already absolute)', () => {
    expect(toAbsoluteUrl('https://rideprestigo.com')).toBe('https://rideprestigo.com')
  })
})
