// @vitest-environment node
/**
 * SEO snippet rules for every intercity route page (60 routes × 7 locales):
 *  - the <title> leads with the search phrase "Transfer Prague – City" in the
 *    page's language, cities in route order and spelled as in the page's hero;
 *  - no prices in title / description / og:* — fares live only in the page body
 *    (from the admin via {ePrice}/{sPrice}/{vPrice}), never in the snippet;
 *  - the layout appends " | PRESTIGO", so the bare title stays ≤ 49 chars.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
type Locale = (typeof LOCALES)[number]
const DIR = path.join(process.cwd(), 'content', 'routes')
const SLUGS = fs.readdirSync(path.join(DIR, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

const TITLE_PHRASE: Record<Locale, (a: string, b: string) => string> = {
  en: (a, b) => `${a} to ${b} Transfer — `,
  ru: (a, b) => `Трансфер ${a} — ${b} — `,
  es: (a, b) => `Traslado ${a} – ${b} — `,
  fr: (a, b) => `Transfert ${a} – ${b} — `,
  ar: (a, b) => `نقل من ${a} إلى ${b} — `,
  hi: (a, b) => `${a} से ${b} ट्रांसफर — `,
  zh: (a, b) => `${a}至${b}接送 — `,
}
const DESC_PHRASE: Record<Locale, (a: string, b: string) => string[]> = {
  en: (a, b) => [`Premium ${a} to ${b} transfer: `, `Executive ${a} to ${b} transfer: `],
  ru: (a, b) => [`Премиум-трансфер ${a} — ${b}: `, `VIP-трансфер ${a} — ${b}: `],
  es: (a, b) => [`Traslado premium ${a} – ${b}: `, `Traslado ejecutivo ${a} – ${b}: `],
  fr: (a, b) => [`Transfert premium ${a} – ${b} : `, `Transfert haut de gamme ${a} – ${b} : `],
  ar: (a, b) => [`نقل فاخر من ${a} إلى ${b}: `],
  hi: (a, b) => [`प्रीमियम ट्रांसफर ${a} से ${b}: `],
  zh: (a, b) => [`高端${a}至${b}接送：`],
}
/** Service-level words: every title carries exactly one (premium / executive / limousine …). */
const LEVEL: Record<Locale, RegExp> = {
  en: /\b(Premium|Executive|Limousine)\b/gi,
  ru: /премиум|бизнес-класс|VIP/gi,
  es: /premium|ejecutivo|limusina/gi,
  fr: /premium|haut de gamme|limousine/gi,
  ar: /فاخر|لرجال الأعمال|ليموزين/g,
  hi: /प्रीमियम|एग्ज़िक्यूटिव|लिमोज़ीन/g,
  zh: /高端|商务|豪华/g,
}
/** Descriptions name the limousine service (not ru — a stretch limo there; not zh — 加长豪华轿车). */
const LIMO: Partial<Record<Locale, RegExp>> = {
  en: /limousine service/i,
  es: /limusina/i,
  fr: /limousine/i,
  ar: /ليموزين/,
  hi: /लिमोज़ीन/,
}
const PRICE = /€|\{[evs]Price\}|\bEUR\b|евро|يورو/

describe('route metadata: search-phrase titles, no prices in snippets', () => {
  it('covers 60 routes', () => {
    expect(SLUGS).toHaveLength(60)
  })

  for (const locale of LOCALES) {
    it(`${locale}: every route title/description follows the snippet rules`, () => {
      for (const slug of SLUGS) {
        const c = JSON.parse(fs.readFileSync(path.join(DIR, locale, `${slug}.json`), 'utf8'))
        const [from, to] = (c.hero.label as string).split(/\s*[→←]\s*/)
        expect(slug.startsWith('prague-') ? from : to, `${locale}/${slug} hero.label`).toBe(
          { en: 'Prague', ru: 'Прага', es: 'Praga', fr: 'Prague', ar: 'براغ', hi: 'प्राग', zh: '布拉格' }[locale],
        )
        const m = c.metadata as Record<'title' | 'description' | 'ogTitle' | 'ogDescription', string>
        for (const [k, v] of Object.entries(m)) expect(v, `${locale}/${slug} ${k}`).not.toMatch(PRICE)
        expect(m.title.startsWith(TITLE_PHRASE[locale](from, to)), `${locale}/${slug} title: ${m.title}`).toBe(true)
        expect(m.ogTitle.startsWith(TITLE_PHRASE[locale](from, to)), `${locale}/${slug} ogTitle`).toBe(true)
        expect(
          DESC_PHRASE[locale](from, to).some((p) => m.description.startsWith(p)),
          `${locale}/${slug} description: ${m.description}`,
        ).toBe(true)
        expect(m.title.match(LEVEL[locale])?.length, `${locale}/${slug} level word in title: ${m.title}`).toBe(1)
        const limo = LIMO[locale]
        if (limo) expect(m.description, `${locale}/${slug} limousine mention`).toMatch(limo)
        // Devanagari combining marks take no width; count only spacing characters
        const visible = m.title.replace(/\p{Mn}/gu, '').length
        expect(visible + ' | PRESTIGO'.length, `${locale}/${slug} title length: ${m.title}`).toBeLessThanOrEqual(60)
        if (locale !== 'zh') {
          expect(m.description.length, `${locale}/${slug} description length`).toBeGreaterThanOrEqual(120)
          expect(m.description.length, `${locale}/${slug} description length`).toBeLessThanOrEqual(160)
        }
      }
    })
  }
})
