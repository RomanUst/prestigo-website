import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// Owner rule (2026-10-31): search snippets carry no prices. Fares change in the
// admin (/admin/pricing) while Google caches title/description for weeks, so a
// "From €69" snippet goes stale and misleads. Prices live only in page bodies
// (<Price>, getFares(), {ePrice}-style tokens interpolated at render time).
//
// Covered: content/pages/<locale>/**/*.json `metadata`, content/blog/<locale>/*.mdx
// frontmatter, and messages/<locale>.json snippet keys. content/routes/** is
// handled by the route-page tests and is out of scope here.

const ROOT = process.cwd()
const SNIPPET_FIELDS = ['title', 'description', 'ogTitle', 'ogDescription'] as const

// €, "EUR 69" / "69 EUR", and price-like interpolation tokens ({ePrice},
// {businessPrice}, {hourlyFrom}, {from}, {viennaPrice}, …).
const PRICE_PATTERNS: RegExp[] = [
  /€/,
  /\bEUR\s?\d|\d\s?EUR\b/,
  /\{[A-Za-z]*(?:[Pp]rice|[Ff]rom|Fare|fare)[A-Za-z]*\}/,
  /\{(?:from|e|s|v)\}/,
]

function priceHits(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return PRICE_PATTERNS.filter((re) => re.test(value)).map(String)
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  )
}

function frontmatter(file: string): Record<string, string> {
  const text = fs.readFileSync(file, 'utf8')
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const pageFiles = walk(path.join(ROOT, 'content', 'pages')).filter((f) => f.endsWith('.json'))
const blogFiles = walk(path.join(ROOT, 'content', 'blog')).filter((f) => f.endsWith('.mdx'))
const messageFiles = fs
  .readdirSync(path.join(ROOT, 'messages'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.join(ROOT, 'messages', f))

describe('SEO snippets carry no prices', () => {
  it('finds the content to check', () => {
    expect(pageFiles.length).toBeGreaterThan(100)
    expect(blogFiles.length).toBeGreaterThan(100)
    expect(messageFiles.length).toBe(7)
  })

  it('content/pages metadata: no €, EUR amounts or price tokens', () => {
    const bad: string[] = []
    for (const file of pageFiles) {
      const meta = (JSON.parse(fs.readFileSync(file, 'utf8')) as { metadata?: Record<string, unknown> }).metadata
      if (!meta) continue
      for (const f of SNIPPET_FIELDS) {
        if (priceHits(meta[f]).length) bad.push(`${path.relative(ROOT, file)} metadata.${f}: ${meta[f]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('blog frontmatter: no €, EUR amounts or price tokens in title/description', () => {
    const bad: string[] = []
    for (const file of blogFiles) {
      const fm = frontmatter(file)
      for (const f of SNIPPET_FIELDS) {
        if (priceHits(fm[f]).length) bad.push(`${path.relative(ROOT, file)} ${f}: ${fm[f]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('messages snippet keys (SiteMetadata, NotFound meta): no prices', () => {
    const bad: string[] = []
    for (const file of messageFiles) {
      const msg = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>
      const values = {
        'SiteMetadata.defaultTitle': msg.SiteMetadata?.defaultTitle,
        'SiteMetadata.defaultDescription': msg.SiteMetadata?.defaultDescription,
        'NotFound.metaTitle': msg.NotFound?.metaTitle,
        'NotFound.metaDescription': msg.NotFound?.metaDescription,
      }
      for (const [k, v] of Object.entries(values)) {
        if (priceHits(v).length) bad.push(`${path.relative(ROOT, file)} ${k}: ${v}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the pattern catches the forms we removed', () => {
    for (const s of ['From €{businessPrice}', 'Dès {hourlyFrom} €/heure', 'Vienna from {viennaPrice}', 'EUR 69', 'from {from}/hour']) {
      expect(priceHits(s).length, s).toBeGreaterThan(0)
    }
    expect(priceHits('Fixed-price chauffeur, 60 min free waiting, 24/7')).toEqual([])
  })
})
