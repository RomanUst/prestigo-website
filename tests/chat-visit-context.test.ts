/**
 * Phase 77, Plan 10 (Task 2) — buildVisitContext (D-06, T-77-25, T-77-26).
 * Pure function: no browser globals, no network, no storage.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildVisitContext,
  getLandingHref,
  rememberLandingHref,
  resetLandingHrefForTests,
  VISIT_CONTEXT_KEYS,
} from '@/lib/chat-visit-context'

const OPENED_AT = '2026-09-29T08:00:00.000Z'

const base = {
  pageHref: 'https://rideprestigo.com/ru/routes/prague-vienna',
  siteLocale: 'ru',
  openedAt: OPENED_AT,
}

beforeEach(() => {
  resetLandingHrefForTests()
})

describe('VISIT_CONTEXT_KEYS', () => {
  it('equals the conversation attribute keys in infra/chatwoot/custom-attributes.json exactly', () => {
    const json = JSON.parse(
      readFileSync(join(process.cwd(), 'infra/chatwoot/custom-attributes.json'), 'utf8'),
    ) as { conversation: Array<{ key: string }> }
    const expected = json.conversation.map((a) => a.key).sort()
    expect([...VISIT_CONTEXT_KEYS].sort()).toEqual(expected)
  })
})

describe('buildVisitContext — URL sanitisation (T-77-26)', () => {
  it('keeps origin + pathname + utm_* of page_url and drops other query params and the hash', () => {
    const ctx = buildVisitContext({
      ...base,
      pageHref:
        'https://rideprestigo.com/ru/book?email=a%40b.cz&token=secret&utm_source=newsletter&utm_medium=email#step-2',
    })
    expect(ctx.page_url).toBe(
      'https://rideprestigo.com/ru/book?utm_source=newsletter&utm_medium=email',
    )
    expect(ctx.page_url).not.toMatch(/email=|token|step-2/)
  })

  it('does the same for landing_url', () => {
    const ctx = buildVisitContext({
      ...base,
      landingHref: 'https://rideprestigo.com/?gclid=abc&utm_campaign=spring#top',
    })
    expect(ctx.landing_url).toBe('https://rideprestigo.com/?utm_campaign=spring')
  })

  it('reduces the referrer to origin + pathname (no query, no hash, not even utm_*)', () => {
    const ctx = buildVisitContext({
      ...base,
      referrer: 'https://www.google.com/search?q=prague+chauffeur&utm_source=x#frag',
    })
    expect(ctx.referrer).toBe('https://www.google.com/search')
  })

  it('omits a referrer that is not http(s) or not a URL', () => {
    expect(buildVisitContext({ ...base, referrer: 'android-app://com.google.android.gm' })).not.toHaveProperty(
      'referrer',
    )
    expect(buildVisitContext({ ...base, referrer: 'not a url' })).not.toHaveProperty('referrer')
    expect(buildVisitContext({ ...base, referrer: '' })).not.toHaveProperty('referrer')
  })

  it('takes utm_* from the landing URL first, then from the current URL', () => {
    const ctx = buildVisitContext({
      ...base,
      pageHref: 'https://rideprestigo.com/book?utm_source=page&utm_term=pageterm',
      landingHref: 'https://rideprestigo.com/?utm_source=landing&utm_medium=cpc',
    })
    expect(ctx.utm_source).toBe('landing')
    expect(ctx.utm_medium).toBe('cpc')
    expect(ctx.utm_term).toBe('pageterm')
    expect(ctx).not.toHaveProperty('utm_campaign')
    expect(ctx).not.toHaveProperty('utm_content')
  })
})

describe('buildVisitContext — value hygiene (T-77-25)', () => {
  it('strips control characters, trims and omits empty values', () => {
    const ctx = buildVisitContext({
      ...base,
      pageHref: 'https://rideprestigo.com/?utm_source=%0Aad%00s%1F%20&utm_medium=%20%20',
    })
    expect(ctx.utm_source).toBe('ads')
    expect(ctx).not.toHaveProperty('utm_medium')
  })

  it('caps every value at 200 characters', () => {
    const long = 'a'.repeat(500)
    const ctx = buildVisitContext({
      ...base,
      pageHref: `https://rideprestigo.com/?utm_campaign=${long}`,
      booking: { tripType: 'transfer', origin: long, destination: long, vehicle: long },
    })
    for (const value of Object.values(ctx)) {
      expect(value.length).toBeLessThanOrEqual(200)
    }
    expect(ctx.utm_campaign).toBe('a'.repeat(200))
    expect(ctx.book_origin).toBe('a'.repeat(200))
  })

  it('an invalid page URL yields no page_url and never throws', () => {
    const ctx = buildVisitContext({ ...base, pageHref: '::not-a-url::' })
    expect(ctx).not.toHaveProperty('page_url')
    expect(ctx.chat_consent).toBe('click-to-open')
  })
})

describe('buildVisitContext — consent record and booking data (D-06, D-02)', () => {
  it("records chat_consent='click-to-open', the supplied timestamp and the site locale", () => {
    const ctx = buildVisitContext(base)
    expect(ctx.chat_consent).toBe('click-to-open')
    expect(ctx.chat_opened_at).toBe(OPENED_AT)
    expect(ctx.site_locale).toBe('ru')
  })

  it('adds book_* keys only when booking data is supplied', () => {
    expect(Object.keys(buildVisitContext(base)).filter((k) => k.startsWith('book_'))).toEqual([])
    const ctx = buildVisitContext({
      ...base,
      booking: {
        tripType: 'transfer',
        origin: 'Prague Airport',
        destination: 'Vienna',
        vehicle: 'business',
      },
    })
    expect(ctx).toMatchObject({
      book_trip_type: 'transfer',
      book_origin: 'Prague Airport',
      book_destination: 'Vienna',
      book_vehicle: 'business',
    })
  })

  it('omits individual empty booking fields', () => {
    const ctx = buildVisitContext({
      ...base,
      booking: { tripType: 'hourly', origin: 'Prague', destination: null, vehicle: '' },
    })
    expect(ctx.book_origin).toBe('Prague')
    expect(ctx).not.toHaveProperty('book_destination')
    expect(ctx).not.toHaveProperty('book_vehicle')
  })

  it('only ever emits keys from VISIT_CONTEXT_KEYS', () => {
    const ctx = buildVisitContext({
      ...base,
      landingHref: 'https://rideprestigo.com/?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e',
      referrer: 'https://example.com/x',
      booking: { tripType: 't', origin: 'o', destination: 'd', vehicle: 'v' },
    })
    for (const key of Object.keys(ctx)) {
      expect(VISIT_CONTEXT_KEYS as readonly string[]).toContain(key)
    }
    // With everything supplied, every declared key is present.
    expect(Object.keys(ctx).sort()).toEqual([...VISIT_CONTEXT_KEYS].sort())
  })
})

describe('first-touch landing href (in memory only)', () => {
  it('remembers the first href and ignores later ones', () => {
    expect(getLandingHref()).toBeNull()
    rememberLandingHref('https://rideprestigo.com/?utm_source=first')
    rememberLandingHref('https://rideprestigo.com/book')
    expect(getLandingHref()).toBe('https://rideprestigo.com/?utm_source=first')
  })

  it('does not touch cookies or web storage (source check)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/chat-visit-context.ts'), 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})
