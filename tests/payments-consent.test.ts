// @vitest-environment node
/**
 * Phase 88, Plan 03 — HOLD-01 / D-12: the consent text a client sees and the
 * text the server hashes come from the same catalog key and formatters, with a
 * pinned version (Research Pitfall 9).
 *
 * Phase 89, Plan 10 — CASH-01 / D-09 / D-10 / D-16: the wording is final and versioned, in three variants (setup,
 * hold now, cash) plus a variant for a free period that has already passed; each names the booking's free-until
 * moment, the cash variant also covers an unpaid ride, and every locale carries real translations.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { locales } from '@/i18n/locales'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import {
  CARD_CONSENT_VERSION,
  consentMessageKey,
  consentVars,
  type ConsentMode,
} from '@/lib/payments/consent-text'
import { buildConsentText, consentSha256 } from '@/lib/payments/consent'

function loadCatalog(locale: string): AbstractIntlMessages & {
  Booking: { step6: { cardOnFile?: Record<string, string> } }
} {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'))
}

const CATALOG_LOCALES = locales.filter(
  (l) => existsSync(join(process.cwd(), 'messages', `${l}.json`)) && Boolean(loadCatalog(l).Booking.step6.cardOnFile),
)

// A change to any EN consent string changes the digest below; the author
// must bump CARD_CONSENT_VERSION and add the new version's digest here (keep
// the old entries as history). Phase 89-10: the digest covers all six wordings (setup, hold now, cash and their
// "free period already passed" variants), joined by a newline in this key order. The draft entry hashed only the
// two Phase 88 strings and stays as history.
const CONSENT_KEYS = [
  'consentSetup',
  'consentSetupNoFree',
  'consentHoldNow',
  'consentHoldNowNoFree',
  'consentCash',
  'consentCashNoFree',
] as const

const PINNED_EN_CONSENT_DIGEST: Record<string, string> = {
  '2026-11-draft-1': '673efc07665c3d17b18df116fb116fd6ad2d46d721beade1a3ba4d5a90980f65',
  '2026-11-1': '2298be1c5dd717f6abe01e95faf7920fd68410d6badfdd675a3f6d74a51afb8f',
}

const MODES: ConsentMode[] = ['setup', 'hold_now', 'cash_setup']
const FREE_UNTIL_MS = Date.parse('2027-01-16T08:00:00Z')

describe('CARD_CONSENT_VERSION', () => {
  it('is the final version constant, with no draft marker (D-16)', () => {
    expect(CARD_CONSENT_VERSION).toBe('2026-11-1')
    expect(CARD_CONSENT_VERSION).not.toMatch(/draft/i)
  })

  it('is pinned to the EN consent strings (copy change without a bump fails)', () => {
    const en = loadCatalog('en').Booking.step6.cardOnFile!
    const digest = createHash('sha256')
      .update(CONSENT_KEYS.map((k) => en[k]).join('\n').normalize('NFC'), 'utf8')
      .digest('hex')
    expect(PINNED_EN_CONSENT_DIGEST[CARD_CONSENT_VERSION]).toBe(digest)
  })
})

describe('consentMessageKey / consentVars', () => {
  it('maps the mode to its catalog key, and the passed deadline to the NoFree variant', () => {
    expect(consentMessageKey('setup')).toBe('consentSetup')
    expect(consentMessageKey('hold_now')).toBe('consentHoldNow')
    expect(consentMessageKey('cash_setup')).toBe('consentCash')
    expect(consentMessageKey('setup', true)).toBe('consentSetupNoFree')
    expect(consentMessageKey('hold_now', true)).toBe('consentHoldNowNoFree')
    expect(consentMessageKey('cash_setup', true)).toBe('consentCashNoFree')
    expect(consentMessageKey('cash_setup', false)).toBe('consentCash')
  })

  it('formats amount with formatMinor, the hold date with formatLocaleDate and freeUntil with the Prague wall clock', () => {
    const v = consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-12', locale: 'en', freeUntilMs: FREE_UNTIL_MS })
    expect(v).toEqual({
      amount: formatMinor(12000, 'eur'),
      holdDate: formatLocaleDate('2026-11-12', 'en'),
      freeUntil: formatLocaleDateTime(FREE_UNTIL_MS, 'en'),
    })
    expect(v.freeUntil).toContain('09:00')
  })

  it('returns an empty holdDate when holdDateIso is null and an empty freeUntil when none is given', () => {
    const v = consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: null, locale: 'en' })
    expect(v.holdDate).toBe('')
    expect(v.freeUntil).toBe('')
  })

  it('freeUntil uses Latin digits in ar, hi and zh', () => {
    for (const locale of ['ar', 'hi', 'zh']) {
      const { freeUntil } = consentVars({ amountMinor: 100, currency: 'eur', holdDateIso: null, locale, freeUntilMs: FREE_UNTIL_MS })
      expect(freeUntil).toMatch(/2027/)
      expect(freeUntil).toMatch(/09:00/)
    }
  })
})

describe('buildConsentText', () => {
  it('setup mode names the amount and the exact hold date', async () => {
    const text = await buildConsentText({
      locale: 'en',
      mode: 'setup',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: '2026-11-12',
      freeUntilMs: FREE_UNTIL_MS,
    })
    expect(text).toContain(formatMinor(12000, 'eur'))
    expect(text).toContain(formatLocaleDate('2026-11-12', 'en'))
    expect(text).not.toMatch(/\{[A-Za-z]+\}/)
  })

  it('hold_now mode names the amount and not the date', async () => {
    const text = await buildConsentText({
      locale: 'en',
      mode: 'hold_now',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: '2026-11-12',
      freeUntilMs: FREE_UNTIL_MS,
    })
    expect(text).toContain(formatMinor(12000, 'eur'))
    expect(text).not.toContain(formatLocaleDate('2026-11-12', 'en'))
  })

  it('en is among the locales that carry the cardOnFile namespace', () => {
    expect(CATALOG_LOCALES).toContain('en')
  })

  describe.each(CATALOG_LOCALES)('client rendering path equals the server text: %s', (locale) => {
    it.each(MODES.flatMap((m) => [[m, false] as const, [m, true] as const]))('%s (deadline passed: %s)', async (mode, passed) => {
      const input = { amountMinor: 12050, currency: 'czk' as const, holdDateIso: mode === 'setup' ? '2026-11-12' : null }
      const server = await buildConsentText({ locale, mode, ...input, freeUntilMs: FREE_UNTIL_MS, freeUntilPassed: passed })
      const t = createTranslator({
        locale,
        messages: loadCatalog(locale),
        namespace: 'Booking.step6.cardOnFile',
      }) as unknown as (key: string, values: Record<string, string>) => string
      const client = t(consentMessageKey(mode, passed), consentVars({ ...input, locale, freeUntilMs: FREE_UNTIL_MS }))
      expect(server).toBe(client)
      expect(server).not.toMatch(/\{[A-Za-z]+\}/)
      expect(server).toContain(formatMinor(12050, 'czk'))
      // The free-until moment is named exactly when the deadline has not passed; the hold date only in setup mode.
      const freeUntil = formatLocaleDateTime(FREE_UNTIL_MS, locale)
      if (passed) expect(server).not.toContain(freeUntil)
      else expect(server).toContain(freeUntil)
      if (mode === 'setup') expect(server).toContain(formatLocaleDate('2026-11-12', locale))
    })
  })

  describe('wording content (D-09, D-10, D-16)', () => {
    const base = { amountMinor: 12000, currency: 'eur' as const, holdDateIso: '2026-11-12', freeUntilMs: FREE_UNTIL_MS }

    it('each English variant covers a late cancel, a no-show and says a person decides', async () => {
      for (const mode of MODES) {
        const text = await buildConsentText({ locale: 'en', mode, ...base })
        expect(text).toMatch(/cancel/)
        expect(text).toMatch(/do not show up/)
        expect(text).toMatch(/a person at Prestigo decides/i)
        expect(text).toContain(formatLocaleDateTime(FREE_UNTIL_MS, 'en'))
      }
    })

    it('the cash variant also covers an unpaid ride, names cash, and says no hold is placed and nothing is charged now', async () => {
      const text = await buildConsentText({ locale: 'en', mode: 'cash_setup', ...base, holdDateIso: null })
      expect(text).toContain('in cash')
      expect(text).toContain('if I do not pay the driver')
      expect(text).toContain('No hold is placed and nothing is charged now')
      expect(text).not.toContain(formatLocaleDate('2026-11-12', 'en'))
    })

    it('the card variants do not mention cash', async () => {
      for (const mode of ['setup', 'hold_now'] as const) {
        const text = await buildConsentText({ locale: 'en', mode, ...base })
        expect(text).not.toContain('cash')
      }
    })

    it('the NoFree variants drop the deadline wording', async () => {
      const text = await buildConsentText({ locale: 'en', mode: 'cash_setup', ...base, freeUntilPassed: true })
      expect(text).toContain('if I cancel, if I do not show up')
      expect(text).not.toContain('after ')
    })
  })

  it('every locale carries all six consent strings with the same parameters as English and no English wording', () => {
    const en = loadCatalog('en').Booking.step6.cardOnFile!
    const params = (str: string) => [...new Set([...str.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]))].sort()
    for (const locale of CATALOG_LOCALES) {
      const cat = loadCatalog(locale).Booking.step6.cardOnFile!
      for (const key of CONSENT_KEYS) {
        expect(typeof cat[key], `${locale}.${key}`).toBe('string')
        expect(cat[key].length, `${locale}.${key}`).toBeGreaterThan(40)
        expect(params(cat[key]), `${locale}.${key}`).toEqual(params(en[key]))
        if (locale !== 'en') expect(cat[key], `${locale}.${key}`).not.toBe(en[key])
      }
      // consentCash carries amount and freeUntil; the NoFree variant carries amount only.
      expect(params(cat.consentCash), `${locale}.consentCash`).toEqual(['amount', 'freeUntil'])
      expect(params(cat.consentCashNoFree), `${locale}.consentCashNoFree`).toEqual(['amount'])
    }
  })

  it('is deterministic: same inputs give the same text and hash', async () => {
    const input = {
      locale: 'en',
      mode: 'setup' as const,
      amountMinor: 9900,
      currency: 'eur' as const,
      holdDateIso: '2026-12-01',
      freeUntilMs: FREE_UNTIL_MS,
    }
    const a = await buildConsentText(input)
    const b = await buildConsentText(input)
    expect(a).toBe(b)
    expect(consentSha256(a)).toBe(consentSha256(b))
  })

  it('a different free-until moment changes the stored text and its hash', async () => {
    const input = { locale: 'en', mode: 'cash_setup' as const, amountMinor: 9900, currency: 'eur' as const, holdDateIso: null }
    const a = await buildConsentText({ ...input, freeUntilMs: FREE_UNTIL_MS })
    const b = await buildConsentText({ ...input, freeUntilMs: FREE_UNTIL_MS - 3_600_000 })
    expect(a).not.toBe(b)
    expect(consentSha256(a)).not.toBe(consentSha256(b))
  })

  it('falls back to English for an unknown locale', async () => {
    const en = await buildConsentText({
      locale: 'en',
      mode: 'hold_now',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: null,
      freeUntilMs: FREE_UNTIL_MS,
    })
    const unknown = await buildConsentText({
      locale: 'xx',
      mode: 'hold_now',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: null,
      freeUntilMs: FREE_UNTIL_MS,
    })
    expect(unknown).toBe(en)
  })
})

describe('consentSha256', () => {
  it('is 64 lowercase hex characters', () => {
    expect(consentSha256('I authorise Prestigo')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs for a one-character change', () => {
    expect(consentSha256('I authorise Prestigo.')).not.toBe(consentSha256('I authorise Prestigo!'))
  })

  it('is the SHA-256 of the UTF-8 bytes of the NFC text', () => {
    const text = 'Café €120'
    const expected = createHash('sha256').update(Buffer.from(text.normalize('NFC'), 'utf8')).digest('hex')
    expect(consentSha256(text)).toBe(expected)
  })

  it('composed and decomposed forms hash the same (NFC)', () => {
    expect(consentSha256('café')).toBe(consentSha256('café'))
  })
})
