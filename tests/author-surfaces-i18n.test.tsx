/**
 * Phase 75, Plan 28 (GAP-4d, fix:75-28 author rows) — the author byline on
 * blog posts and the /authors/roman-ustyugov page used to render the EN
 * job title, portrait alt, byline aria-label, short bio and page metadata
 * on every locale (lib/authors.ts constants). They now come from
 * content/pages/<locale>/authors/roman-ustyugov.json for the ROUTE locale
 * (threaded as an explicit prop — CR-01, never the request-scoped helper on
 * these force-static routes). The person name stays Latin and the JSON-LD
 * Person node stays English by design (Phase 74 D-09).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ArticleByline from '@/components/ArticleByline'
import { AUTHORS } from '@/lib/authors'

const ROOT = path.resolve(__dirname, '..')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const

type AuthorContent = {
  labels: { aboutAuthorAria: string }
  jobTitle: string
  imageAlt: string
  bioShort: string
  metadata: { title: string; description: string; ogTitle: string }
}

function loadAuthor(locale: string): AuthorContent {
  return JSON.parse(
    readFileSync(path.join(ROOT, 'content', 'pages', locale, 'authors', 'roman-ustyugov.json'), 'utf8'),
  )
}

function loadMessages(locale: string): AbstractIntlMessages {
  return JSON.parse(readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
}

vi.mock('@/components/Nav', () => ({ default: () => null }))
vi.mock('@/components/Footer', () => ({ default: () => null }))

const NAME = AUTHORS['roman-ustyugov'].name

describe('ArticleByline — localized author surfaces', () => {
  it('keeps the EN output byte-identical to the pre-75-28 text', () => {
    renderWithIntl(
      <ArticleByline locale="en" authorSlug="roman-ustyugov" datePublished="2026-04-09" />,
    )
    expect(screen.getByText('Founder & Chief Experience Officer')).toBeTruthy()
    expect(screen.getByLabelText('About the author, Roman Ustyugov')).toBeTruthy()
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.getAttribute('alt')).toBe('Roman Ustyugov — Founder of PRESTIGO chauffeur service in Prague')
  })

  for (const locale of LOCALES) {
    it(`renders the ${locale} job title, portrait alt and aria-label from the author content`, () => {
      const c = loadAuthor(locale)
      renderWithIntl(
        <ArticleByline locale={locale} authorSlug="roman-ustyugov" datePublished="2026-04-09" />,
        { locale, messages: loadMessages(locale) },
      )
      expect(screen.getByText(c.jobTitle)).toBeTruthy()
      const aria = c.labels.aboutAuthorAria.replace('{name}', NAME)
      expect(aria).toContain(NAME)
      const link = screen.getByLabelText(aria) as HTMLAnchorElement
      expect(link.getAttribute('href')).toBe(
        locale === 'en' ? '/authors/roman-ustyugov' : `/${locale}/authors/roman-ustyugov`,
      )
      const img = screen.getByRole('img') as HTMLImageElement
      expect(img.getAttribute('alt')).toBe(c.imageAlt)
      // the person name itself stays Latin
      expect(screen.getAllByText(NAME).length).toBeGreaterThan(0)
    })
  }

  it('every non-EN author file translates the new keys (no EN copies) and keeps the {name} placeholder', () => {
    const en = loadAuthor('en')
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const c = loadAuthor(locale)
      expect(c.labels.aboutAuthorAria, locale).toContain('{name}')
      expect(c.labels.aboutAuthorAria, locale).not.toBe(en.labels.aboutAuthorAria)
      expect(c.bioShort, locale).not.toBe(en.bioShort)
      expect(c.metadata.title, locale).not.toBe(en.metadata.title)
      expect(c.metadata.description, locale).not.toBe(en.metadata.description)
      expect(c.metadata.ogTitle, locale).not.toBe(en.metadata.ogTitle)
      expect(c.metadata.title, locale).toContain('PRESTIGO')
    }
  })

  it('receives its locale only through the prop (no next-intl/server import)', () => {
    const src = readFileSync(path.join(ROOT, 'components', 'ArticleByline.tsx'), 'utf8')
    expect(src).not.toContain('next-intl/server')
  })

  it('every ArticleByline call site passes the route locale', () => {
    const sites = [
      'app/[locale]/blog/[slug]/page.tsx',
      'app/[locale]/blog/prague-airport-to-city-center/page.tsx',
      'app/[locale]/blog/prague-vienna-transfer-vs-train/page.tsx',
      'app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx',
    ]
    for (const site of sites) {
      const src = readFileSync(path.join(ROOT, site), 'utf8')
      const usages = src.match(/<ArticleByline[\s\S]*?\/>/g) ?? []
      expect(usages.length, site).toBeGreaterThan(0)
      for (const u of usages) expect(u, site).toMatch(/locale=\{locale\}/)
    }
  })
})

describe('/authors/roman-ustyugov — localized metadata and short bio', () => {
  it('EN generateMetadata is byte-identical to the pre-75-28 constants', async () => {
    const { generateMetadata } = await import('@/app/[locale]/authors/roman-ustyugov/page')
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    const desc =
      'Roman Ustyugov — Founder & Chief Experience Officer at PRESTIGO, Prague. 10+ years in luxury ground transport and 5★ hospitality. Author of the PRESTIGO travel guides.'
    expect(meta.title).toEqual({ absolute: 'Roman Ustyugov — Founder, PRESTIGO Prague' })
    expect(meta.description).toBe(desc)
    const og = meta.openGraph as { title: string; description: string }
    expect(og.title).toBe('Roman Ustyugov — Founder of PRESTIGO Chauffeur Service')
    expect(og.description).toBe(desc)
  })

  for (const locale of LOCALES) {
    it(`${locale} generateMetadata returns the locale's metadata.title/description/ogTitle`, async () => {
      const c = loadAuthor(locale)
      const { generateMetadata } = await import('@/app/[locale]/authors/roman-ustyugov/page')
      const meta = await generateMetadata({ params: Promise.resolve({ locale }) })
      expect(meta.title).toEqual({ absolute: c.metadata.title })
      expect(meta.description).toBe(c.metadata.description)
      const og = meta.openGraph as { title: string; description: string }
      expect(og.title).toBe(c.metadata.ogTitle)
      expect(og.description).toBe(c.metadata.description)
    })
  }

  it('renders the ru short bio; the JSON-LD Person description stays English', async () => {
    const { default: RomanUstyugovPage } = await import('@/app/[locale]/authors/roman-ustyugov/page')
    const el = await RomanUstyugovPage({ params: Promise.resolve({ locale: 'ru' }) })
    const { render } = await import('@testing-library/react')
    const { container } = render(el)
    expect(container.innerHTML).toContain(loadAuthor('ru').bioShort)
    expect(container.innerHTML).not.toContain(
      '<p class="body-text text-[13px] mt-5 max-w-xl" style="line-height: 1.9;">Founder of PRESTIGO.',
    )
    const ld = container.querySelector('script[type="application/ld+json"]')
    const parsed = JSON.parse(ld!.innerHTML) as { '@graph': Array<Record<string, unknown>> }
    const person = parsed['@graph'].find((n) => n['@type'] === 'Person') as { description: string; jobTitle: string }
    expect(person.description).toBe(
      'Founder of PRESTIGO. 10+ years in luxury transportation and 5★ hospitality in Prague.',
    )
    expect(person.jobTitle).toBe('Founder & Chief Experience Officer')
  })
})
