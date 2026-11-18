// @vitest-environment node
/**
 * Phase 93 (plan 93-11; TRIP-02; T-93-29, T-93-32): structured data of a tour page.
 * Offers carry the DB class prices; priceValidUntil is date-dependent (today + 365), so every snapshot-like
 * comparison normalizes it to a fixed token (CLAUDE.md rule). No aggregateRating and no Product anywhere.
 */
import { describe, it, expect } from 'vitest'
import { buildTourJsonLd, safeJsonLd } from '@/lib/tours/jsonld'

const translation = {
  title: 'Dresden Day Trip',
  short_description: 'A private day trip to Dresden.',
  itinerary: [
    { title: 'Pickup in Prague', body: 'x' },
    { title: 'Frauenkirche', body: 'y' },
    { title: 'Return to Prague', body: 'z' },
  ],
  faq: [
    { q: 'Is a guide included?', a: 'No, your chauffeur is not a guide.' },
    { q: 'Can I add time?', a: 'Yes, at booking.' },
  ],
}
const tour = { price_e_eur: 400, price_s_eur: 520.5, price_v_eur: 560 }

function normalize<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc).replace(/"priceValidUntil":"[^"]*"/g, '"priceValidUntil":"<DATE>"'))
}

function nodes(doc: ReturnType<typeof buildTourJsonLd>) {
  return doc['@graph'] as Array<Record<string, unknown>>
}

function find(doc: ReturnType<typeof buildTourJsonLd>, type: string) {
  return nodes(doc).find((n) => n['@type'] === type) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      out.push(k)
      keysDeep(val, out)
    }
  }
  return out
}

function typesDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => typesDeep(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      if (k === '@type') out.push(...(Array.isArray(val) ? (val as string[]) : [String(val)]))
      typesDeep(val, out)
    }
  }
  return out
}

const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

describe('safeJsonLd', () => {
  it('escapes a script-breaking payload and the line separators (script injection)', () => {
    const out = safeJsonLd({ a: '</script><script>alert(1)</script>', b: `x${LS}y${PS}z` })
    expect(out).not.toContain('<')
    expect(out).not.toContain(LS)
    expect(out).not.toContain(PS)
    // Still valid JSON that round-trips to the original value.
    expect(JSON.parse(out)).toEqual({ a: '</script><script>alert(1)</script>', b: `x${LS}y${PS}z` })
  })
})

describe('buildTourJsonLd', () => {
  const doc = buildTourJsonLd({ slug: 'dresden-day-trip', locale: 'en', translation, tour, coverUrl: 'https://img/x.jpg' })

  it('has a TouristTrip with a localized @id, inLanguage, provider and the itinerary ItemList', () => {
    const trip = find(doc, 'TouristTrip')
    expect(trip['@id']).toBe('https://rideprestigo.com/services/dresden-day-trip#trip')
    expect(trip.inLanguage).toBe('en')
    expect(trip.provider).toEqual({ '@id': 'https://rideprestigo.com/#business' })
    expect(trip.image).toBe('https://img/x.jpg')
    expect(trip.itinerary['@type']).toBe('ItemList')
    expect(trip.itinerary.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      'Pickup in Prague',
      'Frauenkirche',
      'Return to Prague',
    ])
  })

  it('uses the locale prefix and the BCP-47 tag for a non-EN locale', () => {
    const ru = buildTourJsonLd({ slug: 'dresden-day-trip', locale: 'ru', translation, tour, coverUrl: null })
    const trip = find(ru, 'TouristTrip')
    expect(trip['@id']).toBe('https://rideprestigo.com/ru/services/dresden-day-trip#trip')
    expect(trip.inLanguage).toBe('ru')
    expect(trip.image).toBeUndefined()
    const zh = buildTourJsonLd({ slug: 'dresden-day-trip', locale: 'zh', translation, tour, coverUrl: null })
    expect(find(zh, 'TouristTrip').inLanguage).toBe('zh-Hans')
  })

  it('has 3 Offers whose prices equal the DB class prices, in EUR, InStock', () => {
    const offers = find(doc, 'TouristTrip').offers as Array<Record<string, string>>
    expect(offers.map((o) => o.price)).toEqual(['400', '520.5', '560'])
    for (const o of offers) {
      expect(o['@type']).toBe('Offer')
      expect(o.priceCurrency).toBe('EUR')
      expect(o.availability).toBe('https://schema.org/InStock')
      expect(o.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('omits a class with a null price and the whole offers key when no class is priced', () => {
    const partial = buildTourJsonLd({
      slug: 'dresden-day-trip',
      locale: 'en',
      translation,
      tour: { price_e_eur: 400, price_s_eur: null, price_v_eur: 560 },
      coverUrl: null,
    })
    expect((find(partial, 'TouristTrip').offers as unknown[]).length).toBe(2)
    const none = buildTourJsonLd({
      slug: 'dresden-day-trip',
      locale: 'en',
      translation,
      tour: { price_e_eur: null, price_s_eur: null, price_v_eur: null },
      coverUrl: null,
    })
    expect(find(none, 'TouristTrip').offers).toBeUndefined()
  })

  it('FAQPage mainEntity equals the FAQ items', () => {
    const faq = find(doc, 'FAQPage')
    expect(faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, q.acceptedAnswer.text])).toEqual(
      translation.faq.map((f) => [f.q, f.a]),
    )
  })

  it('BreadcrumbList is Home / Services / Day trips from Prague / title', () => {
    const crumbs = find(doc, 'BreadcrumbList').itemListElement as Array<{ position: number; name: string; item: string }>
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Services', 'Day trips from Prague', 'Dresden Day Trip'])
    expect(crumbs.map((c) => c.position)).toEqual([1, 2, 3, 4])
    expect(crumbs[3].item).toBe('https://rideprestigo.com/services/dresden-day-trip')
  })

  it('has no aggregateRating key and no Product type anywhere in the graph (D-14)', () => {
    expect(keysDeep(doc)).not.toContain('aggregateRating')
    expect(typesDeep(doc)).not.toContain('Product')
  })

  it('snapshot with priceValidUntil normalized', () => {
    expect(normalize(doc)).toMatchSnapshot()
  })
})
