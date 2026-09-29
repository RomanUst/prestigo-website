// @vitest-environment node
/**
 * Phase 78, WA-04 (D-21, D-22) — repo guard for the public business number.
 *
 * lib/contact-channels.ts holds the ONE literal of the public business number.
 * Link-style surfaces (Footer, HeroWhatsApp, contact/privacy pages, urgent
 * transfer link, form placeholder) import the derived constants. Locale content
 * JSON keeps literals, so this guard proves that every Czech-number-shaped
 * string in code and content equals the constant (assertion A: consistency).
 *
 * Assertion B (no former number anywhere) arrives with plan 78-16, right after
 * the plan 78-14 switch. This file never spells the business number itself:
 * every test string is built from the imported constants.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  BUSINESS_PHONE_E164,
  BUSINESS_PHONE_DIGITS,
  BUSINESS_PHONE_DISPLAY,
  BUSINESS_PHONE_SCHEMA_HYPHEN,
  BUSINESS_TEL_URL,
  WHATSAPP_CHAT_URL,
  whatsappUrlWithText,
} from '@/lib/contact-channels'

const REPO_ROOT = resolve(__dirname, '..')

const SCAN_DIRS = ['app/', 'components/', 'lib/', 'content/', 'i18n/']
const SCAN_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.mdx', '.txt']
const SCAN_FLOOR = 250

// Optional plus or 00, then 420, then three 3-digit groups with an optional
// separator (space, U+00A0, U+202F, hyphen) before each group. Digit
// look-arounds keep a number embedded in a longer digit run from matching.
const CZ_NUMBER_SOURCE = '(?<![0-9])(?:\\+|00)?420(?:[ \\u00A0\\u202F-]?[0-9]{3}){3}(?![0-9])'
const czMatches = (text: string): string[] => text.match(new RegExp(CZ_NUMBER_SOURCE, 'g')) ?? []
const normalize = (raw: string): string => raw.replace(/[^0-9]/g, '').replace(/^00/, '')

// Third-party Czech numbers quoted in editorial blog pages (not ours).
const THIRD_PARTY_NUMBERS: { file: string; digits: string; reason: string }[] = [
  {
    file: 'app/[locale]/blog/prague-airport-taxi-vs-chauffeur/page.tsx',
    digits: '420222333222',
    reason: 'A taxi company number quoted as an example in an editorial blog post',
  },
  {
    file: 'app/[locale]/blog/prague-airport-to-city-center/page.tsx',
    digits: '420220111220',
    reason: 'Prague airport assistance line quoted as reference in an editorial blog post',
  },
]

// Files that were moved onto the constants: they must hold no number literal.
const REFACTORED_FILES: string[] = [
  'components/Footer.tsx',
  'components/HeroWhatsApp.tsx',
  'app/[locale]/contact/page.tsx',
  'app/[locale]/privacy/page.tsx',
  'components/booking/steps/Step2DateTime.tsx',
  'components/ContactForm.tsx',
]

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh']
const CONTENT_PAGES = ['book', 'faq', 'routes', 'services', 'privacy']

function trackedScanFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\0')
    .filter((p) => p !== '')
    .filter((p) => SCAN_DIRS.some((d) => p.startsWith(d)))
    .filter((p) => SCAN_EXT.some((e) => p.endsWith(e)))
}

const FILES = trackedScanFiles()
const readRepoFile = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8')
const MATCHES_BY_FILE = new Map<string, string[]>(
  FILES.map((f) => [f, czMatches(readRepoFile(f)).map(normalize)]),
)

describe('business-number constants (D-22)', () => {
  it('BUSINESS_PHONE_E164 is a Czech E.164 number', () => {
    expect(BUSINESS_PHONE_E164).toMatch(/^\+420[0-9]{9}$/)
  })

  it('the E.164 pattern rejects the constant with a digit removed or appended', () => {
    const re = /^\+420[0-9]{9}$/
    expect(re.test(BUSINESS_PHONE_E164.slice(0, -1))).toBe(false)
    expect(re.test(`${BUSINESS_PHONE_E164}0`)).toBe(false)
  })

  it('DIGITS is E.164 without the plus sign', () => {
    expect(BUSINESS_PHONE_DIGITS).toBe(BUSINESS_PHONE_E164.slice(1))
  })

  it('DISPLAY is +420 and three 3-digit groups joined by single spaces', () => {
    expect(BUSINESS_PHONE_DISPLAY.replace(/ /g, '')).toBe(BUSINESS_PHONE_E164)
    expect(BUSINESS_PHONE_DISPLAY).toMatch(/^\+420 [0-9]{3} [0-9]{3} [0-9]{3}$/)
    const spaces = [...BUSINESS_PHONE_DISPLAY].flatMap((c, i) => (c === ' ' ? [i] : []))
    expect(spaces).toEqual([4, 8, 12])
  })

  it('SCHEMA_HYPHEN is DISPLAY with hyphens instead of spaces', () => {
    expect(BUSINESS_PHONE_SCHEMA_HYPHEN).toBe(BUSINESS_PHONE_DISPLAY.replace(/ /g, '-'))
  })

  it('TEL_URL is tel: + E.164', () => {
    expect(BUSINESS_TEL_URL).toBe(`tel:${BUSINESS_PHONE_E164}`)
  })

  it('WHATSAPP_CHAT_URL is https://wa.me/ + digits (no plus sign)', () => {
    expect(WHATSAPP_CHAT_URL).toBe(`https://wa.me/${BUSINESS_PHONE_DIGITS}`)
    expect(WHATSAPP_CHAT_URL).not.toContain('+')
  })

  it('whatsappUrlWithText uses encodeURIComponent (byte-identical to the live prefilled links)', () => {
    expect(whatsappUrlWithText('Hello PRESTIGO, I would like to book a transfer.')).toBe(
      `${WHATSAPP_CHAT_URL}?text=Hello%20PRESTIGO%2C%20I%20would%20like%20to%20book%20a%20transfer.`,
    )
    expect(whatsappUrlWithText('Hello PRESTIGO, I need an urgent transfer.')).toBe(
      `${WHATSAPP_CHAT_URL}?text=Hello%20PRESTIGO%2C%20I%20need%20an%20urgent%20transfer.`,
    )
  })

  it('lib/contact-channels.ts holds exactly one number literal, on the value line, and no env / VPS host', () => {
    const src = readRepoFile('lib/contact-channels.ts')
    expect(czMatches(src)).toHaveLength(1)
    expect(src).toMatch(/^const BUSINESS_PHONE_E164_VALUE = '\+420[0-9]{9}'$/m)
    expect(src).not.toMatch(/process\.env/)
    expect(src).not.toMatch(/chat\.rideprestigo\.com/)
    expect(src).not.toMatch(/^\s*import\s/m)
  })
})

describe('Czech-number matcher', () => {
  it('finds the display value with space, no-break space, narrow no-break space, hyphen and no separator', () => {
    const groups = BUSINESS_PHONE_DISPLAY.slice(5).split(' ')
    for (const sep of [' ', ' ', ' ', '-', '']) {
      const text = `call +420${sep}${groups.join(sep)} now`
      const found = czMatches(text).map(normalize)
      expect(found, `separator ${JSON.stringify(sep)}`).toEqual([BUSINESS_PHONE_DIGITS])
    }
  })

  it('does not match a number embedded in a longer digit run', () => {
    expect(czMatches(`1${BUSINESS_PHONE_DIGITS}2`)).toEqual([])
    expect(czMatches(`${BUSINESS_PHONE_DIGITS}2`)).toEqual([])
    expect(czMatches(`1${BUSINESS_PHONE_DIGITS}`)).toEqual([])
  })
})

describe('assertion A: every Czech-number-shaped string equals the business number', () => {
  it('scans enough tracked files to be meaningful (not vacuous)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(SCAN_FLOOR)
  })

  it('every match normalizes to the business number or to a reasoned third-party entry', () => {
    const offenders: string[] = []
    for (const [file, digitsList] of MATCHES_BY_FILE) {
      for (const digits of digitsList) {
        if (digits === BUSINESS_PHONE_DIGITS) continue
        const allowed = THIRD_PARTY_NUMBERS.some((e) => e.file === file && e.digits === digits)
        if (!allowed) offenders.push(`${file}: ${digits}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every THIRD_PARTY_NUMBERS entry has a reason and still matches something', () => {
    for (const entry of THIRD_PARTY_NUMBERS) {
      expect(entry.reason.length, `${entry.file} reason`).toBeGreaterThanOrEqual(20)
      expect(MATCHES_BY_FILE.get(entry.file) ?? [], `${entry.file} still matches`).toContain(entry.digits)
    }
  })

  it('all 35 locale content files contain the business number at least once', () => {
    const missing: string[] = []
    let checked = 0
    for (const loc of LOCALES) {
      for (const page of CONTENT_PAGES) {
        const file = `content/pages/${loc}/${page}.json`
        checked += 1
        if (!(MATCHES_BY_FILE.get(file) ?? []).includes(BUSINESS_PHONE_DIGITS)) missing.push(file)
      }
    }
    expect(checked).toBe(35)
    expect(missing).toEqual([])
  })

  it('the no-break-space form in content/pages/en/privacy.json is found', () => {
    const raw = readRepoFile('content/pages/en/privacy.json')
    expect(raw).toMatch(/ /)
    expect(MATCHES_BY_FILE.get('content/pages/en/privacy.json')).toContain(BUSINESS_PHONE_DIGITS)
  })
})

describe('refactored files hold no number literal (D-21)', () => {
  it.each(REFACTORED_FILES)('%s has zero Czech-number matches', (file) => {
    expect(czMatches(readRepoFile(file))).toEqual([])
  })
})
