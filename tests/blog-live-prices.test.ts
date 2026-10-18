import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ROUTES } from '@/lib/routes'
import { AIRPORT_ROUTE } from '@/lib/live-prices'

// Guard: Prestigo fares in blog articles are live (admin → Pricing), never
// typed into the text. MDX uses <Price route="…" car="…" />, JSX articles use
// getFares() from lib/live-prices.ts. The .husky/pre-commit € check skips
// /blog/, so this test is the only thing that catches a hard-coded fare there.
//
// The only amounts allowed in article text are OTHER operators' prices
// (train, coach, Uber/Bolt, rental, parking, transit), listed per file below.
// Adding a third-party price? Add it here. Adding a Prestigo price? Use <Price>.

const ROOT = process.cwd()

const THIRD_PARTY: Record<string, string[]> = {
  // RegioJet / FlixBus coach, €8–€12 per person
  'karlovy-vary-film-festival-2026-vip-transfer.mdx': ['12'],
  'prague-to-karlovy-vary-private-transfer.mdx': ['12'],
  // Uber / Bolt / Liftago fares, PID transit ticket, scam-taxi example
  'prague-airport-taxi-vs-chauffeur': ['1.80', '18', '20', '22', '26', '30', '32', '40'],
  'prague-airport-to-city-center': ['1.80', '18', '26', '30', '32', '35', '45', '50'],
  // ÖBB RailJet / RegioJet / FlixBus fares, rental car, Vienna parking, metro
  'prague-vienna-transfer-vs-train': [
    '1.60', '10', '14.90', '15', '18', '19.90', '20', '22.90', '23.90', '25', '29.80',
    '29.90', '30', '35', '36', '40', '50', '59', '59.60', '60', '70', '72', '80', '89.40', '90',
    '100', '108', '110', '118', '120', '170', '180', '200', '234', '236', '240', '250', '280',
    '320', '354', '360', '370', '420',
  ],
}

// An amount next to a currency sign or word, in any article locale.
const AMOUNT =
  /€\s?(\p{Nd}[\p{Nd}.,]*)|(\p{Nd}[\p{Nd}.,]*)\s?(?:€|EUR\b|euros?\b|евро|يورو|यूरो|欧元)/gu

function articleFiles(): string[] {
  const files: string[] = []
  const mdxRoot = path.join(ROOT, 'content/blog')
  for (const locale of fs.readdirSync(mdxRoot)) {
    for (const f of fs.readdirSync(path.join(mdxRoot, locale))) {
      if (f.endsWith('.mdx')) files.push(path.join('content/blog', locale, f))
    }
  }
  const jsxRoot = path.join(ROOT, 'app/[locale]/blog')
  for (const dir of fs.readdirSync(jsxRoot)) {
    const page = path.join('app/[locale]/blog', dir, 'page.tsx')
    if (fs.existsSync(path.join(ROOT, page))) files.push(page)
  }
  return files
}

function allowedFor(file: string): Set<string> {
  const key = Object.keys(THIRD_PARTY).find((k) => file.includes(`/${k}`))
  return new Set(key ? THIRD_PARTY[key] : [])
}

const files = articleFiles()

describe('blog articles use live Prestigo prices', () => {
  it('finds the articles', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files)('%s has no hard-coded fare', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
    const allowed = allowedFor(file)
    const hardCoded = [...src.matchAll(AMOUNT)]
      .map((m) => (m[1] ?? m[2]).replace(/[.,]+$/, ''))
      .filter((amount) => /\p{Nd}{2,}/u.test(amount) && !allowed.has(amount))
    expect(hardCoded, 'use <Price route="…" /> or getFares() instead').toEqual([])
  })

  it('every <Price> points at a real route and vehicle class', () => {
    const slugs = new Set([...ROUTES.map((r) => r.slug), AIRPORT_ROUTE])
    const bad: string[] = []
    for (const file of files.filter((f) => f.endsWith('.mdx'))) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const [tag] of src.matchAll(/<Price\b[^>]*>/g)) {
        const route = tag.match(/route="([^"]+)"/)?.[1]
        const car = tag.match(/car="([^"]+)"/)?.[1] ?? 'e'
        if (!route || !slugs.has(route) || !['e', 's', 'v'].includes(car) || !tag.endsWith('/>')) {
          bad.push(`${file}: ${tag}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('lib/routes.ts keeps no copy of the fares', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/routes.ts'), 'utf8')
    expect(src).not.toMatch(/€\s?\d/)
  })
})
