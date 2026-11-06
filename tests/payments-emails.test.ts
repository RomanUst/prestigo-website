// @vitest-environment node
/**
 * Phase 88, Plan 03 — MAIL-01: renderPaymentEmail builds the four client
 * payment emails from one HTML shell and the PaymentEmails catalog namespace.
 * Per-locale cases run for every messages/<l>.json that has the namespace
 * (en today; plan 88-05 adds the other six without touching this file).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { locales, rtlLocales } from '@/i18n/locales'
import { formatLocaleDate, formatLocaleDateTime } from '@/lib/locale-date'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

// Phase 89 plan 89-04: emailVarsFromRow mints a manage token and reads the no-show wait through the service client.
const { world } = vi.hoisted(() => ({
  world: { db: null as null | { client: { from: (t: string) => unknown } } },
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: (table: string) => world.db!.client.from(table) }),
}))
import { formatCZK, formatEUR } from '@/lib/currency'
import { escapeHtml } from '@/lib/email'
import { formatMinor } from '@/lib/payments/money'
import {
  renderPaymentEmail,
  type PaymentEmailKind,
  type PaymentEmailVars,
} from '@/lib/payments/emails/render'
import { emailVarsFromRow } from '@/lib/payments/emails/send'
import { MANAGE_TOKEN_RE } from '@/lib/manage-link'
import { DEFAULT_POLICY } from '@/lib/cancellation-policy'

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

// ---------------------------------------------------------------------------
// Phase 89 plan 89-04: cancellation box and Manage booking button (UI-SPEC 8.1, D-01, D-18)
// ---------------------------------------------------------------------------

const MANAGE_URL = `https://rideprestigo.com/manage/${'A'.repeat(43)}`
// 2026-11-14 08:05 UTC = 09:05 in Prague.
const POLICY = { freeUntilMs: Date.parse('2026-11-14T08:05:00Z'), percent: 50, feeAmountMinor: 6000, waitMin: 30 }

describe('renderPaymentEmail: cancellation box and Manage booking button (en)', () => {
  it('card_saved with a stored policy carries the box with every parameter and the outlined button after the calendar link', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: MANAGE_URL, policy: POLICY }))
    expect(out.html).toContain('Free cancellation until')
    expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDateTime(POLICY.freeUntilMs, 'en')}</bdi>`)
    expect(out.html).toContain('<bdi dir="ltr">50</bdi>%')
    expect(out.html).toContain(`<bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi>`)
    expect(out.html).toContain('<bdi dir="ltr">30</bdi> minutes')
    expect(out.html).toContain('A person at Prestigo decides every charge.')
    expect(out.html).toContain('Manage booking')
    expect(out.html).toContain('Keep this link private.')
    expect(out.html).toContain(`href="${MANAGE_URL}"`)
    expect(out.html.indexOf(CALENDAR_URL.split('&')[0])).toBeLessThan(out.html.indexOf(MANAGE_URL))
    // The manage button is outlined; no second filled button appears.
    expect(out.html.match(FILLED_BUTTON) ?? []).toHaveLength(0)
    expect(out.html).not.toMatch(/\{[A-Za-z]+\}/)
  })

  it('shows neither box nor button when the booking stored no policy (nothing new before go-live, D-18)', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', baseVars())
    expect(out.html).not.toContain('Free cancellation')
    expect(out.html).not.toContain('Manage booking')
    expect(out.html).not.toContain('/manage/')
  })

  it('every hold_placed variant carries box and button; charged and payment_failed never do', async () => {
    for (const variant of ['at_checkout', 'scheduled'] as const) {
      const out = await renderPaymentEmail('hold_placed', 'en', baseVars({ variant, manageUrl: MANAGE_URL, policy: POLICY }))
      expect(out.html).toContain('Free cancellation until')
      expect(out.html).toContain(`href="${MANAGE_URL}"`)
    }
    const charged = await renderPaymentEmail('charged', 'en', baseVars({ manageUrl: MANAGE_URL, policy: POLICY }))
    const failed = await renderPaymentEmail(
      'payment_failed',
      'en',
      baseVars({ variant: 'declined', payUrl: PAY_URL, manageUrl: MANAGE_URL, policy: POLICY }),
    )
    for (const out of [charged, failed]) {
      expect(out.html).not.toContain('Free cancellation')
      expect(out.html).not.toContain(MANAGE_URL)
    }
    // payment_failed keeps exactly one filled button.
    expect(failed.html.match(FILLED_BUTTON) ?? []).toHaveLength(1)
  })

  it('the box alone (no link) and the link alone each render without the other', async () => {
    const boxOnly = await renderPaymentEmail('card_saved', 'en', baseVars({ policy: POLICY }))
    expect(boxOnly.html).toContain('Free cancellation until')
    expect(boxOnly.html).not.toContain('Manage booking')
    const linkOnly = await renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: MANAGE_URL }))
    expect(linkOnly.html).not.toContain('Free cancellation')
    expect(linkOnly.html).toContain('Manage booking')
  })

  it('without a calendar link the manage button still renders (hold_placed scheduled has none)', async () => {
    const out = await renderPaymentEmail(
      'hold_placed',
      'en',
      baseVars({ variant: 'scheduled', calendarUrl: undefined, manageUrl: MANAGE_URL }),
    )
    expect(out.html).toContain(`href="${MANAGE_URL}"`)
  })

  it('rejects a non-https manage link', async () => {
    await expect(renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: 'http://rideprestigo.com/manage/x' }))).rejects.toThrow()
    await expect(renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: 'javascript:alert(1)' }))).rejects.toThrow()
  })

  it('types no amount: the fee in the box comes from the parameter', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: MANAGE_URL, policy: { ...POLICY, feeAmountMinor: 4321 } }))
    expect(out.html).toContain(formatMinor(4321, 'eur'))
  })
})

/** The static text around the ICU parameters of a catalog leaf, HTML-escaped as the renderer escapes it. */
function staticFragments(locale: string, key: 'body' | 'label'): string[] {
  const m = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as {
    PaymentEmails: { policyBox: Record<string, string> }
  }
  return m.PaymentEmails.policyBox[key]
    .split(/\{[A-Za-z]+\}/)
    .map((f) => f.trim())
    .filter((f) => f.length > 3)
    .map(escapeHtml)
}

describe.each(catalogLocales())('cancellation box and Manage booking button per locale: %s', (locale) => {
  const WITH = { manageUrl: MANAGE_URL, policy: POLICY }
  const FAMILY: Case[] = [
    { kind: 'card_saved' },
    { kind: 'hold_placed', variant: 'at_checkout' },
    { kind: 'hold_placed', variant: 'scheduled' },
  ]

  it.each(FAMILY.map((c) => [`${c.kind}${c.variant ? `/${c.variant}` : ''}`, c] as const))(
    '%s carries the box and the button with every parameter resolved',
    async (_name, c) => {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...WITH }))
      expect(out.html).not.toMatch(/\{[A-Za-z]+\}/)
      for (const fragment of [...staticFragments(locale, 'body'), ...staticFragments(locale, 'label')]) {
        expect(out.html).toContain(fragment)
      }
      expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDateTime(POLICY.freeUntilMs, locale)}</bdi>`)
      expect(out.html).toContain('<bdi dir="ltr">50</bdi>')
      expect(out.html).toContain(`<bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi>`)
      expect(out.html).toContain('<bdi dir="ltr">30</bdi>')
      expect(out.html).toContain(`href="${MANAGE_URL}"`)
      expect(out.html).toContain('border: 1px solid #BFA06A; color: #E6D6B0')
      // Latin digits whatever the locale.
      expect(out.html).not.toMatch(/[٠-٩۰-۹०-९]/)
      const rtl = (rtlLocales as readonly string[]).includes(locale)
      if (rtl) expect(out.html).toContain('<html lang="' + locale + '" dir="rtl">')
      else expect(out.html).not.toContain('dir="rtl"')
      expect(out.html.match(FILLED_BUTTON) ?? []).toHaveLength(0)
    },
  )

  it('the same emails carry neither the box nor the button without a stored policy', async () => {
    for (const c of FAMILY) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant }))
      expect(out.html).not.toContain('/manage/')
      for (const fragment of staticFragments(locale, 'body')) expect(out.html).not.toContain(fragment)
    }
  })

  it('charged and payment_failed never carry the box, even when the vars have it', async () => {
    const charged = await renderPaymentEmail('charged', locale, baseVars(WITH))
    const failed = await renderPaymentEmail('payment_failed', locale, baseVars({ variant: 'declined', payUrl: PAY_URL, ...WITH }))
    for (const out of [charged, failed]) {
      expect(out.html).not.toContain('/manage/')
      for (const fragment of staticFragments(locale, 'body')) expect(out.html).not.toContain(fragment)
    }
  })

  it('fee and refund wording appears only in the box: the email without it states none', async () => {
    // Phase 88 guard as a positive allow-list: the same kinds minus the box carry no percent and no fee sentence.
    for (const c of [...FAMILY, { kind: 'charged' } as Case]) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant }))
      const visibleText = out.html.replace(/<[^>]+>/g, ' ')
      expect(visibleText).not.toMatch(/\d\s?%|%\s?\d/)
    }
  })
})

describe('emailVarsFromRow: stored-terms gate (tracer, D-18)', () => {
  let db: FakePaymentsDb

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'booking-1',
    booking_reference: 'PRG-1',
    client_email: 'client@example.test',
    locale: 'en',
    trip_type: 'transfer',
    distance_km: 50,
    pickup_date: '2026-11-15',
    pickup_time: '10:00',
    origin_address: 'Old Town Square, Prague',
    origin_lat: null,
    origin_lng: null,
    destination_address: 'Hotel Four Seasons',
    vehicle_class: 'first_class',
    passengers: 2,
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    cancel_policy_version: '2026-11-1',
    cancel_policy: DEFAULT_POLICY,
    ...over,
  })

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
    db = createFakePaymentsDb({ bookings: [row()] })
    world.db = db
  })

  it('mints a token and flows it into the card_saved email as the Manage booking button and the box', async () => {
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.manageUrl).toMatch(/^https:\/\/rideprestigo\.com\/manage\/[A-Za-z0-9_-]{43}$/)
    const token = vars.manageUrl!.split('/').pop()!
    expect(token).toMatch(MANAGE_TOKEN_RE)
    expect(db.state.booking_manage_tokens).toHaveLength(1)
    expect(db.state.booking_manage_tokens[0].token).toBe(token)
    // 50 km is the short window: one hour before the 10:00 Prague pickup; the fee is the stored 100 percent.
    expect(vars.policy).toEqual({
      freeUntilMs: Date.parse('2026-11-15T08:00:00Z'),
      percent: 100,
      feeAmountMinor: 12000,
      waitMin: 30,
    })

    const out = await renderPaymentEmail('card_saved', 'en', vars)
    expect(out.html).toContain('Manage booking')
    expect(out.html).toContain(`href="${vars.manageUrl}"`)
    expect(out.html).toContain('Free cancellation until')
    expect(out.html).toContain('09:00')
  })

  it('a second email for the same booking reuses the token', async () => {
    const a = await emailVarsFromRow(db.state.bookings[0], { kind: 'hold_placed' })
    const b = await emailVarsFromRow(db.state.bookings[0], { kind: 'hold_placed' })
    expect(a.manageUrl).toBe(b.manageUrl)
    expect(db.state.booking_manage_tokens).toHaveLength(1)
  })

  it('uses the stored snapshot, not today settings, and the airport wait for an airport pickup', async () => {
    db.state.pricing_globals[0].cancel_free_hours_short = 6
    db.state.bookings[0].origin_address = 'Václav Havel Airport Prague'
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.policy?.freeUntilMs).toBe(Date.parse('2026-11-15T08:00:00Z'))
    expect(vars.policy?.waitMin).toBe(60)
  })

  it('a booking with no stored policy gets neither the link nor the box, and no token row', async () => {
    db.state.bookings[0].cancel_policy_version = null
    db.state.bookings[0].cancel_policy = null
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.manageUrl).toBeUndefined()
    expect(vars.policy).toBeUndefined()
    expect('manageUrl' in vars).toBe(false)
    expect(db.state.booking_manage_tokens).toHaveLength(0)
    const out = await renderPaymentEmail('card_saved', 'en', vars)
    expect(out.html).not.toContain('Manage booking')
    expect(out.html).not.toContain('Free cancellation')
  })

  it('a partner booking gets no link', async () => {
    db.state.bookings[0].booking_source = 'gnet'
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.manageUrl).toBeUndefined()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('charged and payment_failed mint no token', async () => {
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'charged' })
    expect(vars.manageUrl).toBeUndefined()
    expect(vars.policy).toBeUndefined()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('a link failure drops the button, never the email', async () => {
    const real = world.db
    world.db = {
      client: {
        from: (t: string) => {
          if (t === 'booking_manage_tokens') throw new Error('tokens table down')
          return real!.client.from(t)
        },
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.manageUrl).toBeUndefined()
    expect(vars.policy).toBeDefined()
  })

  it('a zero amount drops the box (no fee can be stated)', async () => {
    db.state.bookings[0].payment_amount_minor = 0
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.policy).toBeUndefined()
  })

  it('a non-https site url drops the button instead of failing the email', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved' })
    expect(vars.manageUrl).toBeUndefined()
  })
})
