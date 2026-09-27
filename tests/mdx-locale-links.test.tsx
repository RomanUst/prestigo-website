/**
 * tests/mdx-locale-links.test.tsx — 75-27 (GAP-4c).
 *
 * The MDX `a` mapping in mdx-components.tsx must keep the visitor's locale
 * on internal page links (single leading slash, not /api/ or /_next/, no
 * file extension) by rendering them through the next-intl Link from
 * @/i18n/routing, while every other href class (external, protocol-relative,
 * mailto:, tel:, hash-only, /api/, file-extension assets) renders the
 * original plain anchor with its href untouched. className and the inline
 * copper-light color must be identical in both branches.
 */
import { describe, it, expect } from 'vitest'
import type { ComponentType, ReactNode } from 'react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ruMessages from '@/messages/ru.json'
import { useMDXComponents } from '@/mdx-components'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages

const EXPECTED_CLASS = 'underline underline-offset-2 transition-colors'
const EXPECTED_COLOR = 'var(--copper-light)'

// eslint-disable-next-line react-hooks/rules-of-hooks -- plain mapping factory, not a React hook
const A = useMDXComponents({}).a as ComponentType<{ href?: string; children?: ReactNode }>

function renderAnchor(href: string, locale: 'en' | 'ru') {
  const opts = locale === 'ru' ? { locale, messages: ruMessagesTyped } : {}
  renderWithIntl(<A href={href}>link text</A>, opts)
  return screen.getByText('link text').closest('a') as HTMLAnchorElement
}

function expectStyled(a: HTMLAnchorElement) {
  expect(a.getAttribute('class')).toBe(EXPECTED_CLASS)
  expect(a.style.color).toBe(EXPECTED_COLOR)
}

describe('MDX a mapping — internal page paths keep the locale', () => {
  const internal: Array<[string, string, string]> = [
    // [href, ru expected, en expected]
    ['/book', '/ru/book', '/book'],
    ['/routes', '/ru/routes', '/routes'],
    ['/services/corporate-accounts', '/ru/services/corporate-accounts', '/services/corporate-accounts'],
    ['/services/intercity-routes', '/ru/services/intercity-routes', '/services/intercity-routes'],
    ['/blog/prague-airport-meet-and-greet', '/ru/blog/prague-airport-meet-and-greet', '/blog/prague-airport-meet-and-greet'],
  ]

  for (const [href, ru, en] of internal) {
    it(`ru: ${href} -> ${ru}`, () => {
      const a = renderAnchor(href, 'ru')
      expect(a.getAttribute('href')).toBe(ru)
      expectStyled(a)
    })

    it(`en: ${href} stays ${en} (as-needed, unprefixed)`, () => {
      const a = renderAnchor(href, 'en')
      expect(a.getAttribute('href')).toBe(en)
      expectStyled(a)
    })
  }
})

describe('MDX a mapping — non-page hrefs render unchanged', () => {
  const passthrough = [
    'https://example.com/x',
    '//evil.example.com/x',
    'mailto:a@b.c',
    'tel:+420',
    '#faq',
    '/api/x',
    '/_next/static/x.js',
    '/brand/guide.pdf',
  ]

  for (const href of passthrough) {
    for (const locale of ['ru', 'en'] as const) {
      it(`${locale}: ${href} keeps its exact href`, () => {
        const a = renderAnchor(href, locale)
        expect(a.getAttribute('href')).toBe(href)
        expectStyled(a)
      })
    }
  }
})
