import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Phase 77-03: config-as-code validation for infra/chatwoot/.
 *
 * findForbiddenContent() is the single shared "is this text safe to send
 * to a customer" check reused across canned responses (this file), and
 * (Task 3) automation-rules.json keyword lists. Keep it a pure function of
 * (text) -> string[] issues, no I/O, so it's directly unit-testable and
 * cheap to call in a tight loop over every locale of every topic.
 */

const CANNED_DIR = path.join(process.cwd(), 'infra/chatwoot/canned-responses')
const INFRA_DIR = path.join(process.cwd(), 'infra/chatwoot')
const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
type Locale = (typeof LOCALES)[number]

const FORBIDDEN_KEYWORDS = ['uber', 'bolt', 'ride-hailing', 'ride hailing', 'taxi app']

const ALLOWED_CHATWOOT_VARS = new Set([
  '{{contact.first_name}}',
  '{{contact.name}}',
  '{{agent.first_name}}',
  '{{agent.name}}',
])

// Euro sign, EUR/CZK currency codes, or "Kč" — any of these next to nothing
// (not just digit-adjacent) is disallowed in operator-facing template copy.
const CURRENCY_RE = /€|\bEUR\b|\bCZK\b|Kč/
// A real booking reference shaped PRG-<8 digits>, e.g. PRG-20260818-DE8697's
// PRG-20260818 segment — templates must use the [BOOKING_REF] placeholder.
const BOOKING_REF_RE = /PRG-\d{8}/i

export function findForbiddenContent(text: string): string[] {
  const issues: string[] = []
  if (CURRENCY_RE.test(text)) issues.push('currency/price token found')

  const lower = text.toLowerCase()
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (lower.includes(kw)) issues.push(`forbidden keyword: ${kw}`)
  }

  if (/prestigio/i.test(text)) issues.push('misspelled brand: Prestigio')
  if (BOOKING_REF_RE.test(text)) issues.push('real booking reference pattern found')

  const varMatches = text.match(/\{\{[^}]+\}\}/g) || []
  for (const v of varMatches) {
    if (!ALLOWED_CHATWOOT_VARS.has(v)) issues.push(`disallowed chatwoot variable: ${v}`)
  }

  return issues
}

function listCannedResponseFiles(): string[] {
  if (!fs.existsSync(CANNED_DIR)) return []
  return fs.readdirSync(CANNED_DIR).filter((f) => f.endsWith('.json')).sort()
}

describe('findForbiddenContent (pure helper)', () => {
  it('flags a euro amount', () => {
    expect(findForbiddenContent('Total: €305')).toContain('currency/price token found')
  })

  it('flags an Uber mention', () => {
    const issues = findForbiddenContent('cheaper than Uber for this route')
    expect(issues.some((i) => i.includes('uber'))).toBe(true)
  })

  it('passes clean text', () => {
    expect(
      findForbiddenContent('Hi {{contact.first_name}}, your pickup time changed. — Prestigo')
    ).toEqual([])
  })
})

describe('infra/chatwoot/canned-responses/*.json', () => {
  const files = listCannedResponseFiles()

  it('has at least one topic file', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const topic = file.replace(/\.json$/, '')

    describe(`topic: ${topic}`, () => {
      const raw = fs.readFileSync(path.join(CANNED_DIR, file), 'utf8')
      const data = JSON.parse(raw) as {
        topic: string
        sourceScript: string
        placeholders: string[]
        responses: Record<Locale, string>
      }

      it('declares the topic matching its filename', () => {
        expect(data.topic).toBe(topic)
      })

      it('has exactly the 7 locale keys', () => {
        expect(Object.keys(data.responses).sort()).toEqual([...LOCALES].sort())
      })

      it('every locale value is non-empty', () => {
        for (const loc of LOCALES) {
          expect(data.responses[loc].trim().length).toBeGreaterThan(0)
        }
      })

      it('every non-en locale differs from en (no English copy-paste stub)', () => {
        for (const loc of LOCALES) {
          if (loc === 'en') continue
          expect(data.responses[loc]).not.toBe(data.responses.en)
        }
      })

      it('every declared placeholder appears in every locale text', () => {
        for (const loc of LOCALES) {
          for (const ph of data.placeholders || []) {
            expect(data.responses[loc]).toContain(ph)
          }
        }
      })

      it('short_code "<topic>-<locale>" matches the required pattern for every locale', () => {
        for (const loc of LOCALES) {
          const shortCode = `${topic}-${loc}`
          expect(shortCode).toMatch(/^[a-z]+(-[a-z]+)*-(en|ru|es|fr|ar|hi|zh)$/)
        }
      })

      it('no locale value contains forbidden content (price, Uber, misspelling, real booking ref, bad variable)', () => {
        for (const loc of LOCALES) {
          const issues = findForbiddenContent(data.responses[loc])
          expect(issues).toEqual([])
        }
      })
    })
  }
})

describe('infra/chatwoot template price guard (D-18)', () => {
  it('.husky/pre-commit scans infra/chatwoot for currency tokens', () => {
    const hook = fs.readFileSync(path.join(process.cwd(), '.husky/pre-commit'), 'utf8')
    expect(hook).toContain('infra/chatwoot')
    expect(hook).toContain('Price or currency found in Chatwoot template source')
  })

  it('scripts/qa/secret_gate_probe.sh proves the currency guard blocks and allows correctly', () => {
    const probe = fs.readFileSync(
      path.join(process.cwd(), 'scripts/qa/secret_gate_probe.sh'),
      'utf8'
    )
    expect(probe).toContain('template-price')
    expect(probe).toContain('template-clean')
  })

  it('infra/chatwoot directory exists on disk', () => {
    expect(fs.existsSync(INFRA_DIR)).toBe(true)
  })
})
