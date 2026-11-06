// @vitest-environment node
/**
 * Phase 88, Plan 03 — MAIL-01: renderPaymentEmail builds the four client
 * payment emails from one HTML shell and the PaymentEmails catalog namespace.
 * Per-locale cases run for every messages/<l>.json that has the namespace
 * (en today; plan 88-05 adds the other six without touching this file).
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { locales, rtlLocales } from '@/i18n/locales'
import { formatLocaleDate } from '@/lib/locale-date'
import { formatCZK, formatEUR } from '@/lib/currency'
import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import {
  renderPaymentEmail,
  type PaymentEmailKind,
  type PaymentEmailVars,
} from '@/lib/payments/emails/render'

const CALENDAR_URL = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=PRG-1&dates=20261115T100000/20261115T110000'
const PAY_URL = 'https://pay.example.test/session/abc123'

function baseVars(over: Partial<PaymentEmailVars> = {}): PaymentEmailVars {
  return {
    reference: 'PRG-1',
    amountMinor: 12000,
    currency: 'eur',
    pickupDateIso: '2026-11-15',
    pickupTime: '10:00',
    origin: 'Václav Havel Airport Prague',
    destination: 'Hotel Four Seasons, Veleslavínova 2a',
    vehicleClass: 'first_class',
    passengers: 2,
    holdDateIso: '2026-11-12',
    calendarUrl: CALENDAR_URL,
    ...over,
  }
}

type Case = { kind: PaymentEmailKind; variant?: PaymentEmailVars['variant']; extra?: Partial<PaymentEmailVars> }
const CASES: Case[] = [
  { kind: 'card_saved' },
  { kind: 'hold_placed', variant: 'at_checkout' },
  { kind: 'hold_placed', variant: 'scheduled' },
  { kind: 'charged' },
  { kind: 'charged', extra: { diffMinor: 1500 } },
  { kind: 'payment_failed', variant: 'declined', extra: { payUrl: PAY_URL } },
  { kind: 'payment_failed', variant: 'auth_required', extra: { payUrl: PAY_URL } },
]

function catalogLocales(): string[] {
  return locales.filter((l) => {
    const p = join(process.cwd(), 'messages', `${l}.json`)
    if (!existsSync(p)) return false
    const m = JSON.parse(readFileSync(p, 'utf8')) as { PaymentEmails?: unknown }
    return Boolean(m.PaymentEmails)
  })
}

const FILLED_BUTTON = /background-color:\s*#BFA06A/gi

describe('formatMinor', () => {
  it('whole units match formatEUR / formatCZK', () => {
    expect(formatMinor(4500, 'eur')).toBe(formatEUR(45))
    expect(formatMinor(125000, 'czk')).toBe(formatCZK(1250))
  })
  it('non-whole amounts keep symbol and placement with two decimals', () => {
    expect(formatMinor(4550, 'eur')).toBe('€45.50')
    expect(formatMinor(4550, 'czk')).toMatch(/^45,50 Kč$/)
  })
})

describe('PaymentEmails catalog', () => {
  it('en is among the locales that carry the namespace', () => {
    expect(catalogLocales()).toContain('en')
  })
  it('en copy contains no typed currency amounts', () => {
    const raw = readFileSync(join(process.cwd(), 'messages', 'en.json'), 'utf8')
    expect(/€\s?[0-9]/.test(raw)).toBe(false)
  })
})

describe('renderPaymentEmail: locale fallback', () => {
  it('null, empty and unknown booking locales render in English', async () => {
    for (const input of [null, undefined, '', 'xx', 42]) {
      const out = await renderPaymentEmail('card_saved', input, baseVars())
      expect(out.locale).toBe('en')
      expect(out.html).toContain('<html lang="en">')
    }
  })
})

describe('renderPaymentEmail: card_saved in English (tracer)', () => {
  it('carries the reference, exact hold date, amount and calendar link', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', baseVars())
    expect(out.subject).toContain('PRG-1')
    expect(out.html).toContain(formatMinor(12000, 'eur'))
    expect(out.html).toContain(formatLocaleDate('2026-11-12', 'en'))
    expect(out.html).toContain(escapeHtml(CALENDAR_URL))
    expect(out.html).toMatch(/<html lang="en">/)
    expect(out.html).not.toContain('dir="rtl"')
    expect(out.locale).toBe('en')
  })
})

describe('renderPaymentEmail: shell rules', () => {
  it('keeps the bdi-carrying intro out of a p and gives the contact line gold links', async () => {
    const { html } = await renderPaymentEmail('hold_placed', 'en', baseVars({ variant: 'scheduled' }))
    expect(html).not.toMatch(/<p[\s>]/)
    expect(html).toContain('<a href="mailto:info@rideprestigo.com" style="color: #BFA06A;')
    expect(html).toMatch(/<a href="tel:\+\d+" style="color: #BFA06A;/)
  })

  it('escapes user-supplied strings and wraps amounts, references and addresses in bdi', async () => {
    const out = await renderPaymentEmail(
      'card_saved',
      'en',
      baseVars({ origin: '<b>x</b>', destination: 'A & B "quoted"' }),
    )
    expect(out.html).not.toContain('<b>x</b>')
    expect(out.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(out.html).toContain('A &amp; B &quot;quoted&quot;')
    expect(out.html).toContain('<bdi dir="auto">&lt;b&gt;x&lt;/b&gt;</bdi>')
    expect(out.html).toContain('<bdi dir="ltr">PRG-1</bdi>')
    expect(out.html).toContain(`<bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi>`)
  })

  it('88-REVIEW C-IN-01: localized dates are isolated with dir=auto (Arabic reads them in order), times stay ltr', async () => {
    const out = await renderPaymentEmail('card_saved', 'ar', baseVars())
    expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDate('2026-11-12', 'ar')}</bdi>`)
    expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDate('2026-11-15', 'ar')}</bdi>, <bdi dir="ltr">10:00</bdi>`)
    expect(out.html).not.toContain(`<bdi dir="ltr">${formatLocaleDate('2026-11-12', 'ar')}</bdi>`)
  })

  it('uses no non-standard named HTML entities', async () => {
    for (const c of CASES) {
      const out = await renderPaymentEmail(c.kind, 'en', baseVars({ variant: c.variant, payUrl: PAY_URL, ...c.extra }))
      const named = out.html.match(/&[a-zA-Z]+;/g) ?? []
      for (const e of named) expect(['&amp;', '&lt;', '&gt;', '&quot;']).toContain(e)
    }
  })

  it('rejects a non-https pay link', async () => {
    await expect(
      renderPaymentEmail('payment_failed', 'en', baseVars({ variant: 'declined', payUrl: 'javascript:alert(1)' })),
    ).rejects.toThrow()
  })
})

describe.each(catalogLocales())('renderPaymentEmail per locale: %s', (locale) => {
  it.each(CASES.map((c) => [`${c.kind}${c.variant ? `/${c.variant}` : ''}${c.extra?.diffMinor ? '+diff' : ''}`, c] as const))(
    '%s renders a complete email',
    async (_name, c) => {
      const vars = baseVars({ variant: c.variant, ...c.extra })
      const out = await renderPaymentEmail(c.kind, locale, vars)
      expect(out.locale).toBe(locale)
      expect(out.subject.length).toBeGreaterThan(0)
      expect(out.html.length).toBeGreaterThan(0)
      expect(out.subject).toContain('PRG-1')
      expect(out.subject).not.toMatch(/\{[A-Za-z]+\}/)
      expect(out.html).not.toMatch(/\{[A-Za-z]+\}/)
      expect(out.html).toContain(`<html lang="${locale}"`)
      expect(out.html).toContain(formatMinor(12000, 'eur'))
      expect(out.html).toContain(formatLocaleDate('2026-11-15', locale))
      if (c.kind === 'card_saved') expect(out.html).toContain(formatLocaleDate('2026-11-12', locale))
      const rtl = (rtlLocales as readonly string[]).includes(locale)
      if (rtl) {
        expect(out.html).toContain('<html lang="' + locale + '" dir="rtl">')
        expect(out.html).toContain('<body dir="rtl"')
      } else {
        expect(out.html).not.toContain('dir="rtl"')
      }
      const wordsEn = /refund|cancellation fee|will be cancelled/i
      if (locale === 'en') expect(out.html).not.toMatch(wordsEn)
    },
  )

  it('payment_failed has exactly one filled button carrying the pay link; the others have none', async () => {
    for (const c of CASES) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...c.extra }))
      const filled = out.html.match(FILLED_BUTTON) ?? []
      if (c.kind === 'payment_failed') {
        expect(filled.length).toBe(1)
        expect(out.html).toContain(`href="${PAY_URL}"`)
        expect(out.html.split(PAY_URL).length - 1).toBe(1)
      } else {
        expect(filled.length).toBe(0)
      }
    }
  })

  it('charged shows the difference line only when diffMinor is set', async () => {
    const withDiff = await renderPaymentEmail('charged', locale, baseVars({ diffMinor: 1500 }))
    const without = await renderPaymentEmail('charged', locale, baseVars())
    expect(withDiff.html).toContain(formatMinor(1500, 'eur'))
    expect(without.html).not.toContain(formatMinor(1500, 'eur'))
  })

  it('labels are uppercase with spacing only in en, es, fr, ru', async () => {
    const out = await renderPaymentEmail('card_saved', locale, baseVars())
    if (['en', 'es', 'fr', 'ru'].includes(locale)) {
      expect(out.html).toContain('text-transform: uppercase')
    } else {
      expect(out.html).not.toContain('text-transform: uppercase')
      expect(out.html).toContain('letter-spacing: normal')
    }
  })

  it('keeps the brand tagline in Latin', async () => {
    const out = await renderPaymentEmail('card_saved', locale, baseVars())
    expect(out.html).toContain('PRESTIGE IN EVERY MILE')
  })
})

describe('renderPaymentEmail: CZK amounts', () => {
  it('renders CZK through formatMinor', async () => {
    const out = await renderPaymentEmail('charged', 'en', baseVars({ amountMinor: 300000, currency: 'czk' }))
    expect(out.html).toContain(formatMinor(300000, 'czk'))
  })
})
