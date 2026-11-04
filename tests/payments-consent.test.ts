// @vitest-environment node
/**
 * Phase 88, Plan 03 — HOLD-01 / D-12: the consent text a client sees and the
 * text the server hashes come from the same catalog key and formatters, with a
 * pinned version (Research Pitfall 9).
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { locales } from '@/i18n/locales'
import { formatLocaleDate } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import {
  CARD_CONSENT_VERSION,
  consentMessageKey,
  consentVars,
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

// A change to either EN consent string changes the digest below; the author
// must bump CARD_CONSENT_VERSION and add the new version's digest here (keep
// the old entries as history).
const PINNED_EN_CONSENT_DIGEST: Record<string, string> = {
  '2026-11-draft-1': '673efc07665c3d17b18df116fb116fd6ad2d46d721beade1a3ba4d5a90980f65',
}

describe('CARD_CONSENT_VERSION', () => {
  it('is the draft version constant', () => {
    expect(CARD_CONSENT_VERSION).toBe('2026-11-draft-1')
  })

  it('is pinned to the EN consent strings (copy change without a bump fails)', () => {
    const en = loadCatalog('en').Booking.step6.cardOnFile!
    const digest = createHash('sha256')
      .update(`${en.consentSetup}\n${en.consentHoldNow}`.normalize('NFC'), 'utf8')
      .digest('hex')
    expect(PINNED_EN_CONSENT_DIGEST[CARD_CONSENT_VERSION]).toBe(digest)
  })
})

describe('consentMessageKey / consentVars', () => {
  it('maps the mode to its catalog key', () => {
    expect(consentMessageKey('setup')).toBe('consentSetup')
    expect(consentMessageKey('hold_now')).toBe('consentHoldNow')
  })

  it('formats amount with formatMinor and the hold date with formatLocaleDate', () => {
    const v = consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: '2026-11-12', locale: 'en' })
    expect(v).toEqual({ amount: formatMinor(12000, 'eur'), holdDate: formatLocaleDate('2026-11-12', 'en') })
  })

  it('returns an empty holdDate when holdDateIso is null', () => {
    expect(consentVars({ amountMinor: 12000, currency: 'eur', holdDateIso: null, locale: 'en' }).holdDate).toBe('')
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
    })
    expect(text).toContain(formatMinor(12000, 'eur'))
    expect(text).not.toContain(formatLocaleDate('2026-11-12', 'en'))
  })

  it('en is among the locales that carry the cardOnFile namespace', () => {
    expect(CATALOG_LOCALES).toContain('en')
  })

  describe.each(CATALOG_LOCALES)('client rendering path equals the server text: %s', (locale) => {
    it.each(['setup', 'hold_now'] as const)('%s', async (mode) => {
      const input = { amountMinor: 12050, currency: 'czk' as const, holdDateIso: '2026-11-12' }
      const server = await buildConsentText({ locale, mode, ...input })
      const t = createTranslator({
        locale,
        messages: loadCatalog(locale),
        namespace: 'Booking.step6.cardOnFile',
      }) as unknown as (key: string, values: Record<string, string>) => string
      const client = t(consentMessageKey(mode), consentVars({ ...input, locale }))
      expect(server).toBe(client)
    })
  })

  it('is deterministic: same inputs give the same text and hash', async () => {
    const input = {
      locale: 'en',
      mode: 'setup' as const,
      amountMinor: 9900,
      currency: 'eur' as const,
      holdDateIso: '2026-12-01',
    }
    const a = await buildConsentText(input)
    const b = await buildConsentText(input)
    expect(a).toBe(b)
    expect(consentSha256(a)).toBe(consentSha256(b))
  })

  it('falls back to English for an unknown locale', async () => {
    const en = await buildConsentText({
      locale: 'en',
      mode: 'hold_now',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: null,
    })
    const unknown = await buildConsentText({
      locale: 'xx',
      mode: 'hold_now',
      amountMinor: 12000,
      currency: 'eur',
      holdDateIso: null,
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
    expect(consentSha256('café')).toBe(consentSha256('café'))
  })
})
