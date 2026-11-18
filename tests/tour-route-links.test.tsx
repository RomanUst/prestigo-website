/**
 * Phase 93-15 (SEO map rule 2): route pages hand day-trip intent to their tour page.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createTranslator } from 'use-intl/core'
import enMessages from '@/messages/en.json'
import ruMessages from '@/messages/ru.json'

const CATALOGS: Record<string, Record<string, unknown>> = {
  en: enMessages as unknown as Record<string, unknown>,
  ru: ruMessages as unknown as Record<string, unknown>,
}

const storeMock = vi.hoisted(() => ({ getPublishedTourLocales: vi.fn() }))
vi.mock('@/lib/tours/store', () => storeMock)
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (arg: { locale: string; namespace: string }) =>
    createTranslator({ locale: arg.locale, messages: CATALOGS[arg.locale] ?? CATALOGS.en, namespace: arg.namespace } as never),
  ),
}))

import RouteTourLink from '@/components/tours/RouteTourLink'
import { routeSlugForTour, tourSlugForRoute } from '@/lib/tours/route-links'

describe('route-links helpers', () => {
  it('maps a route slug to its day-trip slug', () => {
    expect(tourSlugForRoute('prague-dresden')).toBe('dresden-day-trip')
    expect(tourSlugForRoute('prague-cesky-krumlov')).toBe('cesky-krumlov-day-trip')
    expect(tourSlugForRoute('vienna-prague')).toBeNull()
  })

  it('returns the slug only when that tour is in the published list', () => {
    expect(tourSlugForRoute('prague-dresden', ['dresden-day-trip'])).toBe('dresden-day-trip')
    expect(tourSlugForRoute('prague-berlin', ['dresden-day-trip'])).toBeNull()
    expect(tourSlugForRoute('prague-dresden', [])).toBeNull()
  })

  it('maps a tour slug back to a route that exists in lib/routes.ts', () => {
    expect(routeSlugForTour('dresden-day-trip')).toBe('prague-dresden')
    expect(routeSlugForTour('karlstejn-day-trip')).toBeNull()
    expect(routeSlugForTour('dresden')).toBeNull()
  })
})

describe('RouteTourLink', () => {
  beforeEach(() => {
    storeMock.getPublishedTourLocales.mockReset()
  })
  afterEach(cleanup)

  it('renders one link to the tour page when the tour is published', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([
      { slug: 'dresden-day-trip', locales: ['en', 'ru'], updatedAt: '2026-12-01T10:00:00Z' },
    ])
    render(await RouteTourLink({ locale: 'en', routeSlug: 'prague-dresden' }))
    const link = screen.getByRole('link', { name: /Dresden day trip/ })
    expect(link.getAttribute('href')).toBe('/services/dresden-day-trip')
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('localises the link for a complete locale', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([
      { slug: 'dresden-day-trip', locales: ['en', 'ru'], updatedAt: '2026-12-01T10:00:00Z' },
    ])
    render(await RouteTourLink({ locale: 'ru', routeSlug: 'prague-dresden' }))
    expect(screen.getByRole('link').getAttribute('href')).toBe('/ru/services/dresden-day-trip')
  })

  it('links to the EN tour page for a locale without a complete translation', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([
      { slug: 'dresden-day-trip', locales: ['en'], updatedAt: '2026-12-01T10:00:00Z' },
    ])
    render(await RouteTourLink({ locale: 'ru', routeSlug: 'prague-dresden' }))
    expect(screen.getByRole('link').getAttribute('href')).toBe('/services/dresden-day-trip')
  })

  it('renders nothing when the tour is unpublished', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([])
    expect(await RouteTourLink({ locale: 'en', routeSlug: 'prague-dresden' })).toBeNull()
  })

  it('renders nothing for a route without a tour (Berlin)', async () => {
    storeMock.getPublishedTourLocales.mockResolvedValue([
      { slug: 'dresden-day-trip', locales: ['en'], updatedAt: '2026-12-01T10:00:00Z' },
    ])
    expect(await RouteTourLink({ locale: 'en', routeSlug: 'prague-berlin' })).toBeNull()
  })

  it('renders nothing when the store throws', async () => {
    storeMock.getPublishedTourLocales.mockRejectedValue(new Error('boom'))
    expect(await RouteTourLink({ locale: 'en', routeSlug: 'prague-dresden' })).toBeNull()
  })
})

describe('route pages wire the link into their day-trip section', () => {
  it.each(['prague-dresden', 'prague-cesky-krumlov', 'prague-kutna-hora', 'prague-karlovy-vary'])('%s', (slug) => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app', '[locale]', 'routes', slug, 'page.tsx'), 'utf8')
    expect(src).toContain(`<RouteTourLink locale={locale} routeSlug="${slug}" />`)
    // the day-trip section keeps its own heading; the tour title is not injected into H1/H2
    expect(src).toContain('{content.dayTrip.headingLine1}')
    expect(src.indexOf('<RouteTourLink')).toBeGreaterThan(src.indexOf('{content.dayTrip.footnote}'))
  })
})
