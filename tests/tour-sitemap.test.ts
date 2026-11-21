/**
 * Phase 93-15 (TRIP-01 / D-08): the sitemap lists every published tour once per
 * complete locale, with the cluster taken from getPublishedTourLocales().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPublishedTourLocales = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tours/store', () => ({ getPublishedTourLocales }))

import sitemap from '@/app/sitemap'

type Langs = Record<string, string>
const langsOf = (e: { alternates?: unknown }) => (e.alternates as { languages: Langs }).languages

describe('sitemap tour rows', () => {
  beforeEach(() => {
    getPublishedTourLocales.mockReset()
  })

  it('lists a published tour with only its complete locales plus x-default, lastmod from updated_at', async () => {
    getPublishedTourLocales.mockResolvedValue([
      { slug: 'dresden-day-trip', locales: ['en', 'ru'], updatedAt: '2026-12-01T10:00:00Z' },
    ])
    const entries = await sitemap()
    const rows = entries.filter((e) => e.url === 'https://rideprestigo.com/services/dresden-day-trip')
    expect(rows).toHaveLength(1)
    const langs = langsOf(rows[0])
    expect(Object.keys(langs).sort()).toEqual(['en', 'ru', 'x-default'])
    expect(langs.ru).toBe('https://rideprestigo.com/ru/services/dresden-day-trip')
    expect(langs['x-default']).toBe('https://rideprestigo.com/services/dresden-day-trip')
    expect((rows[0].lastModified as Date).toISOString()).toBe('2026-12-01T10:00:00.000Z')
  }, 60_000)

  it('has no tour URL when the store returns an empty list, hub stays', async () => {
    getPublishedTourLocales.mockResolvedValue([])
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.filter((u) => u.includes('/services/') && u.endsWith('-day-trip'))).toEqual([])
    expect(urls).toContain('https://rideprestigo.com/services/day-trips-from-prague')
  }, 60_000)

  it('survives a throwing store', async () => {
    getPublishedTourLocales.mockRejectedValue(new Error('no supabase env'))
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.filter((u) => u.includes('/services/') && u.endsWith('-day-trip'))).toEqual([])
    expect(urls).toContain('https://rideprestigo.com/services/day-trips-from-prague')
  }, 60_000)
})
