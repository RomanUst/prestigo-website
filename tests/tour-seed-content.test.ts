import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { buildSeedRows, loadSeedTours, type SeedTranslation } from '@/lib/tours/seed'
import { TOUR_SLUG_PATTERN } from '@/lib/tours/types'
import { locales, type AppLocale } from '@/i18n/locales'

// Phase 93 (plan 93-21; D-01, D-02, D-08; Pitfall 8, T-93-59): the launch content must fit the fixed-price +
// hours-included model, state no amounts, and keep the package-travel posture (the chauffeur is not a guide,
// tickets and guides are not included). Every locale folder that exists under content/tours-seed is checked.

const ROOT = path.resolve(__dirname, '..')
const SEED_ROOT = path.join(ROOT, 'content', 'tours-seed')

const SLUGS = [
  'cesky-krumlov-day-trip',
  'kutna-hora-day-trip',
  'karlovy-vary-day-trip',
  'dresden-day-trip',
  'karlstejn-day-trip',
  'bohemian-switzerland-day-trip',
]

const seed = loadSeedTours(ROOT)
const present = locales.filter((l) => l !== 'zh-hant' && fs.existsSync(path.join(SEED_ROOT, l)))

/** Every text value of one translation, flattened. */
function texts(t: SeedTranslation): string[] {
  return [
    t.title,
    t.short_description,
    t.description,
    ...t.highlights,
    ...t.itinerary.flatMap((i) => [i.title, i.body]),
    ...t.includes,
    ...t.excludes,
    t.pickup_info,
    t.important_info,
    ...t.faq.flatMap((f) => [f.q, f.a]),
    t.seo_title,
    t.seo_description,
  ]
}

// Currency in any locale: the euro sign, an amount next to a currency code or sign.
const CURRENCY = /€|\b(EUR|CZK|USD)\b|\d\s?(€|eur|czk|kč)|\b(eur|czk)\s?\d|Kč/i
// The retired waiting model (Pitfall 8).
const WAITING_MODEL = /15 ?min|started 15|first 15 minutes|15 minutes/i
// Scarcity, popularity and urgency claims (as in tests/tours-copy-i18n.test.ts), ratings and ride-hailing.
const SCARCITY =
  /booked \d+ times|sell(s|ing)? (out|fast)|spots? left|only \d+ left|last chance|popular choice|limited (availability|spots|places)|book (now )?before it/i
const RATING = /\b(rating|rated|reviews?|stars?|five-star|best-rated)\b/i
const RIDE_HAILING = /uber|bolt\b|taxi app|ride-?hailing|\btaxi\b/i
// Hours and cancellation numbers come from the tour row and the settings, never from copy.
const HOUR_NUMBER = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[ -](hours?|hrs?)\b|\b\d+\s?h\b/i
const CANCEL_NUMBER = /cancel[^.]{0,80}\b(\d+|one|two|three|four|five|six|twelve|twenty|twenty-four|forty-eight)\b/i

describe('tours.json', () => {
  const tours = seed.tours

  it('lists the six launch slugs, all valid tour slugs', () => {
    expect(tours.map((t) => t.slug).sort()).toEqual([...SLUGS].sort())
    for (const t of tours) expect(t.slug).toMatch(TOUR_SLUG_PATTERN)
  })

  it('has sane hours, start windows in 30-minute steps and no money values', () => {
    for (const t of tours) {
      expect(t.hours_included).toBeGreaterThanOrEqual(1)
      expect(t.hours_included).toBeLessThanOrEqual(12)
      for (const hhmm of [t.start_time_min, t.start_time_max]) expect(hhmm).toMatch(/^([01][0-9]|2[0-3]):(00|30)$/)
      expect(t.start_time_max > t.start_time_min).toBe(true)
      expect(t.drive_minutes_each_way).toBeGreaterThanOrEqual(10)
      expect(t.drive_minutes_each_way).toBeLessThanOrEqual(600)
      expect(t.destination_label.length).toBeLessThanOrEqual(120)
      expect(t.distance_km_one_way).toBeGreaterThan(0)
    }
    const raw = fs.readFileSync(path.join(SEED_ROOT, 'tours.json'), 'utf8')
    expect(/price|eur/i.test(raw)).toBe(false)
  })

  it('names a route only for the four tours that have a route page', () => {
    const withRoute = tours.filter((t) => t.route_slug).map((t) => t.slug).sort()
    expect(withRoute).toEqual(['cesky-krumlov-day-trip', 'dresden-day-trip', 'karlovy-vary-day-trip', 'kutna-hora-day-trip'])
  })
})

describe('seed content rules', () => {
  it('has English content for all six tours, the reference locale', () => {
    expect(present).toContain('en')
    for (const slug of SLUGS) expect(seed.translations.en?.[slug], slug).toBeDefined()
  })

  for (const locale of present) {
    describe(`locale ${locale}`, () => {
      const built = buildSeedRows(seed, { locales: [locale as AppLocale] })

      it('has a file for every tour', () => {
        for (const slug of SLUGS) expect(seed.translations[locale as AppLocale]?.[slug], `${locale}/${slug}`).toBeDefined()
      })

      for (const slug of SLUGS) {
        const t = seed.translations[locale as AppLocale]?.[slug]
        if (!t) continue
        const all = texts(t)

        describe(slug, () => {
          it('is complete with no leak and fits the database limits', () => {
            const report = built.reports.find((r) => r.slug === slug)!
            expect({ complete: report.complete, missing: report.missing, leak: report.leak, overflow: report.overflow }).toEqual({
              complete: true,
              missing: [],
              leak: null,
              overflow: [],
            })
          })

          it('states no price, amount or currency sign', () => {
            for (const s of all) expect(s, s.slice(0, 60)).not.toMatch(CURRENCY)
          })

          it('rejects the 15 minute waiting model (Pitfall 8)', () => {
            for (const s of all) expect(s, s.slice(0, 60)).not.toMatch(WAITING_MODEL)
          })

          it('has no scarcity claim, rating or ride-hailing comparison', () => {
            for (const s of all) {
              expect(s, s.slice(0, 60)).not.toMatch(SCARCITY)
              expect(s, s.slice(0, 60)).not.toMatch(RATING)
              expect(s, s.slice(0, 60)).not.toMatch(RIDE_HAILING)
            }
          })
        })
      }
    })
  }

  describe('English wording rules', () => {
    for (const slug of SLUGS) {
      const t = seed.translations.en?.[slug]
      if (!t) continue
      const all = texts(t)

      describe(slug, () => {
        it('names no hours-included or cancellation-hours number (they come from settings and the tour row)', () => {
          for (const s of all) {
            expect(s, s.slice(0, 60)).not.toMatch(HOUR_NUMBER)
            expect(s, s.slice(0, 60)).not.toMatch(CANCEL_NUMBER)
          }
        })

        it('starts the itinerary with the pickup and ends it with the return to the same address', () => {
          const first = t.itinerary[0]
          const last = t.itinerary[t.itinerary.length - 1]
          expect(`${first.title} ${first.body}`).toMatch(/pick/i)
          expect(`${last.title} ${last.body}`).toMatch(/(return|back)/i)
          expect(`${last.title} ${last.body}`).toMatch(/same/i)
        })

        it('says Day Trip in the titles, never Transfer', () => {
          expect(t.title).toMatch(/Day Trip/)
          expect(t.seo_title).toMatch(/Day Trip/)
          expect(t.title).not.toMatch(/transfer/i)
          expect(t.seo_title).not.toMatch(/transfer/i)
        })

        it('keeps the title within 60 characters and the SEO description within 160', () => {
          expect(t.title.length).toBeLessThanOrEqual(60)
          expect(t.seo_title.length).toBeLessThanOrEqual(60)
          expect(t.seo_description.length).toBeLessThanOrEqual(160)
          expect(t.seo_description.length).toBeGreaterThan(80)
        })

        it('keeps the package-travel posture: not a guide, tickets and guides not included, child seats free', () => {
          expect(t.important_info).toMatch(/not a guide/i)
          expect(t.excludes.join(' ')).toMatch(/ticket/i)
          expect(t.excludes.join(' ')).toMatch(/guide/i)
          expect(t.includes.join(' ')).toMatch(/child seats? at no charge/i)
          expect(t.includes.join(' ')).toMatch(/pickup and return/i)
        })

        it('has substantive content', () => {
          const words = all.join(' ').split(/\s+/).length
          expect(words).toBeGreaterThan(850)
          expect(t.highlights.length).toBeGreaterThanOrEqual(4)
          expect(t.itinerary.length).toBeGreaterThanOrEqual(5)
          expect(t.faq.length).toBeGreaterThanOrEqual(5)
        })
      })
    }
  })
})
