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
const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as null | { client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> } },
  },
  mockResendSend: vi.fn(),
}))
process.env.RESEND_API_KEY = 're_test'
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => world.db!.client.from(table),
    rpc: (name: string, args?: Record<string, unknown>) => world.db!.client.rpc(name, args),
  }),
}))
// Phase 89 plan 89-25: sendPaymentEmail is exercised end to end; only Resend is a double.
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
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
    // WR-04: the deadline in the email names the Prague time zone.
    expect(out.html).toContain('09:05 (Prague time)</bdi>')
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
        rpc: (n: string, a?: Record<string, unknown>) => real!.client.rpc(n, a),
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

// ---------------------------------------------------------------------------
// Phase 89 plan 89-25: cancelled, fee_charged, fee_waived, card_saved cash, payment_failed fee (UI-SPEC 8.2)
// ---------------------------------------------------------------------------

const BOOK_URL = 'https://rideprestigo.com/book'
const FREE_UNTIL = Date.parse('2026-11-14T08:05:00Z')

/** Every kind and variant added by Phase 89, with the vars the engine plans pass. */
const NEW_CASES: Case[] = [
  { kind: 'card_saved', variant: 'cash', extra: { freeUntil: FREE_UNTIL, policy: POLICY, manageUrl: MANAGE_URL } },
  { kind: 'cancelled', variant: 'free', extra: { moneyOutcome: 'released', bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'free', extra: { moneyOutcome: 'refunded', refundMinor: 12000, bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'free', extra: { moneyOutcome: 'none', bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'by_prestigo', extra: { moneyOutcome: 'released', bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'by_prestigo', extra: { moneyOutcome: 'refunded', refundMinor: 12000, bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'by_prestigo', extra: { moneyOutcome: 'none', bookAgainUrl: BOOK_URL } },
  { kind: 'cancelled', variant: 'late', extra: { freeUntil: FREE_UNTIL, feeMinor: 6000, bookAgainUrl: BOOK_URL } },
  { kind: 'fee_charged', variant: 'late_cancel', extra: { freeUntil: FREE_UNTIL, feeMinor: 6000 } },
  { kind: 'fee_charged', variant: 'no_show', extra: { waitMin: 30, feeMinor: 6000 } },
  { kind: 'fee_charged', variant: 'cash_unpaid', extra: {} },
  { kind: 'fee_charged', variant: 'cash_card', extra: {} },
  { kind: 'fee_waived', extra: { moneyOutcome: 'released', bookAgainUrl: BOOK_URL } },
  { kind: 'fee_waived', extra: { moneyOutcome: 'refunded', refundMinor: 12000, bookAgainUrl: BOOK_URL } },
  { kind: 'fee_waived', extra: { moneyOutcome: 'none', bookAgainUrl: BOOK_URL } },
  { kind: 'payment_failed', variant: 'fee', extra: { feeLabel: 'cancellation', feeMinor: 6000, payUrl: PAY_URL } },
  { kind: 'payment_failed', variant: 'fee', extra: { feeLabel: 'no_show', feeMinor: 6000, payUrl: PAY_URL } },
  { kind: 'payment_failed', variant: 'fee', extra: { feeLabel: 'trip', payUrl: PAY_URL } },
]

const caseName = (c: Case) => [c.kind, c.variant, c.extra?.moneyOutcome, c.extra?.feeLabel].filter(Boolean).join('/')

describe('Phase 89 kinds: the tracer through sendPaymentEmail (English)', () => {
  let db: FakePaymentsDb

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
    mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
    db = createFakePaymentsDb({
      bookings: [
        {
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
        },
      ],
    })
    world.db = db
  })

  it('cancelled free: the named kind reaches Resend as rendered English HTML, once per ledger key', async () => {
    const { sendPaymentEmail } = await import('@/lib/payments/emails/send')
    const input = {
      kind: 'cancelled' as const,
      variant: 'free' as const,
      moneyOutcome: 'released' as const,
      booking: db.state.bookings[0],
      eventKey: 'email:cancelled:booking-1',
    }
    expect(await sendPaymentEmail(input)).toBe('sent')
    expect(mockResendSend).toHaveBeenCalledTimes(1)
    const message = mockResendSend.mock.calls[0][0] as { to: string[]; subject: string; html: string }
    expect(message.to).toEqual(['client@example.test'])
    expect(message.subject).toBe('Your PRESTIGO booking is cancelled — PRG-1')
    expect(message.html).toContain('<html lang="en">')
    expect(message.html).toContain('Your booking is cancelled.')
    expect(message.html).toContain('Nothing was charged. The hold on your card is released.')
    expect(message.html).toContain('Book another ride')
    expect(message.html).toContain('href="https://rideprestigo.com/book"')
    expect(message.html).not.toMatch(/\{[A-Za-z]+\}/)

    expect(await sendPaymentEmail(input)).toBe('duplicate')
    expect(mockResendSend).toHaveBeenCalledTimes(1)
  })

  it('late cancel: the free period, the wait and the proposed fee come from the stored policy', async () => {
    const { emailVarsFromRow } = await import('@/lib/payments/emails/send')
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'cancelled', variant: 'late' })
    expect(vars.freeUntil).toBe(Date.parse('2026-11-15T08:00:00Z'))
    expect(vars.feeMinor).toBe(12000)
    expect(vars.waitMin).toBe(30)
    expect(vars.bookAgainUrl).toBe('https://rideprestigo.com/book')
    const out = await renderPaymentEmail('cancelled', 'en', vars)
    expect(out.html).toContain('You cancelled after')
    expect(out.html).toContain(`<bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi>`)
  })

  it('passed vars win over the stored policy; the other kinds get no Book another ride link and no token', async () => {
    const { emailVarsFromRow } = await import('@/lib/payments/emails/send')
    const vars = await emailVarsFromRow(db.state.bookings[0], {
      kind: 'fee_charged',
      variant: 'no_show',
      feeMinor: 3000,
      waitMin: 45,
    })
    expect(vars.feeMinor).toBe(3000)
    expect(vars.waitMin).toBe(45)
    expect(vars.bookAgainUrl).toBeUndefined()
    expect(vars.manageUrl).toBeUndefined()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('card_saved cash: the policy box and the manage link flow from the stored policy', async () => {
    const { emailVarsFromRow } = await import('@/lib/payments/emails/send')
    const vars = await emailVarsFromRow(db.state.bookings[0], { kind: 'card_saved', variant: 'cash' })
    expect(vars.freeUntil).toBe(Date.parse('2026-11-15T08:00:00Z'))
    const out = await renderPaymentEmail('card_saved', 'en', vars)
    expect(out.html).toContain('Free cancellation until')
    expect(out.html).toContain('Your card is only a guarantee.')
    expect(out.html).toContain(`href="${vars.manageUrl}"`)
  })

  it('T-89-13: operator reasons and notes on the booking row never reach the vars or the mail', async () => {
    const { emailVarsFromRow } = await import('@/lib/payments/emails/send')
    const row = {
      ...db.state.bookings[0],
      admin_notes: 'OPERATOR-NOTE-XYZ',
      cancel_reason: 'OPERATOR-REASON-XYZ',
      fee_reason: 'OPERATOR-FEE-REASON-XYZ',
    }
    const vars = await emailVarsFromRow(row, { kind: 'cancelled', variant: 'late' })
    const out = await renderPaymentEmail('cancelled', 'en', vars)
    expect(JSON.stringify(vars)).not.toContain('OPERATOR')
    expect(out.html).not.toContain('OPERATOR')
  })
})

describe('Phase 89 kinds: copy of UI-SPEC 8.2 (English)', () => {
  const render = (c: Case) => renderPaymentEmail(c.kind, 'en', baseVars({ variant: c.variant, ...c.extra }))
  const find = (kind: PaymentEmailKind, variant?: string, outcome?: string) =>
    NEW_CASES.find((c) => c.kind === kind && c.variant === variant && c.extra?.moneyOutcome === outcome)!
  const findPlain = (kind: PaymentEmailKind, variant: string) =>
    NEW_CASES.find((c) => c.kind === kind && c.variant === variant)!

  it('card_saved cash: guarantee wording, three payment lines and the cash sentence in the box', async () => {
    const out = await render(findPlain('card_saved', 'cash'))
    expect(out.subject).toBe('Your PRESTIGO booking is confirmed — PRG-1')
    expect(out.html).toContain('Your booking is confirmed.')
    expect(out.html).toContain('Your card is saved as a guarantee. Nothing has been charged and no hold is placed.')
    expect(out.html).toContain('Today: your card is saved. No hold, no charge.')
    expect(out.html).toContain(`On the day: pay <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi> in cash to your driver.`)
    expect(out.html).toContain('Only if needed: we charge the saved card if you cancel after')
    expect(out.html).toContain('A person at Prestigo decides first.')
    expect(out.html).toContain(
      `You pay <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi> in cash to your driver. Your card is only a guarantee.`,
    )
    expect(out.html).toContain('Free cancellation until')
    expect(out.html).toContain('Add to calendar')
    expect(out.html).toContain(`href="${MANAGE_URL}"`)
    // No hold is placed, so the hold date line of the card variant is absent.
    expect(out.html).not.toContain('we hold')
  })

  it('the cash sentence belongs to the cash variant only', async () => {
    const card = await renderPaymentEmail('card_saved', 'en', baseVars({ manageUrl: MANAGE_URL, policy: POLICY }))
    expect(card.html).not.toContain('Your card is only a guarantee.')
  })

  it('cancelled free: three money sentences and no kind-specific box', async () => {
    expect((await render(find('cancelled', 'free', 'released'))).html).toContain(
      'Nothing was charged. The hold on your card is released.',
    )
    const refunded = await render(find('cancelled', 'free', 'refunded'))
    expect(refunded.html).toContain(
      `We refunded <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi> to your card. Your bank usually shows it within 5 to 10 business days.`,
    )
    const none = await render(find('cancelled', 'free', 'none'))
    expect(none.html).toContain('Nothing was charged.')
    expect(none.html).not.toContain('released')
    expect(none.subject).toBe('Your PRESTIGO booking is cancelled — PRG-1')
    expect(none.html).toContain('Book another ride')
    expect(none.html).not.toContain('What happens next')
    expect(none.html).not.toContain('Receipt')
  })

  it('cancelled by Prestigo: apologises, never charges, emphasises the contact line', async () => {
    const out = await render(find('cancelled', 'by_prestigo', 'released'))
    expect(out.html).toContain('We had to cancel your booking.')
    expect(out.html).toContain(
      'We are sorry. Your booking is cancelled and you are not charged. The hold on your card is released.',
    )
    expect(out.html).toContain('color: #F3EEE3; line-height: 1.6;">For any queries, contact us at')
    const none = await render(find('cancelled', 'by_prestigo', 'none'))
    expect(none.html).toContain('We are sorry. Your booking is cancelled and you are not charged.</div>')
    // The other kinds keep the muted contact line.
    const free = await render(find('cancelled', 'free', 'none'))
    expect(free.html).toContain('color: #A9AEB0; line-height: 1.6;">For any queries, contact us at')
  })

  it('cancelled late: fee up to the amount, a person decides, nothing charged yet', async () => {
    const out = await render(findPlain('cancelled', 'late'))
    expect(out.html).toContain('You cancelled after')
    expect(out.html).toContain(`a cancellation fee of up to <bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi> may apply.`)
    expect(out.html).toContain('A person at Prestigo decides and emails you. Nothing has been charged yet.')
    expect(out.html).toContain('What happens next')
    expect(out.html).toContain('We email you our decision.')
    expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDateTime(FREE_UNTIL, 'en')}</bdi>`)
  })

  it('fee_charged: subject, H1, intro and receipt per variant', async () => {
    const late = await render(findPlain('fee_charged', 'late_cancel'))
    expect(late.subject).toBe('Cancellation fee for your PRESTIGO booking — PRG-1')
    expect(late.html).toContain('We charged a cancellation fee.')
    expect(late.html).toContain('You cancelled booking <bdi dir="ltr">PRG-1</bdi> after')
    expect(late.html).toContain(`We charged <bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi> to your card.`)
    expect(late.html).toContain(`Total charged: <bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi>`)
    expect(late.html).toContain('Reason: cancellation after')

    const noShow = await render(findPlain('fee_charged', 'no_show'))
    expect(noShow.subject).toBe('No-show fee for your PRESTIGO booking — PRG-1')
    expect(noShow.html).toContain('We charged a no-show fee.')
    expect(noShow.html).toContain(
      'Your driver waited <bdi dir="ltr">30</bdi> minutes at the pick-up point and could not meet you.',
    )
    expect(noShow.html).toContain('Reason: no-show, the driver waited <bdi dir="ltr">30</bdi> minutes')

    const unpaid = await render(findPlain('fee_charged', 'cash_unpaid'))
    expect(unpaid.subject).toBe('Payment for your PRESTIGO trip — PRG-1')
    expect(unpaid.html).toContain('We charged your saved card.')
    expect(unpaid.html).toContain('was not paid in cash, so we charged')
    expect(unpaid.html).toContain(`Total charged: <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi>`)
    expect(unpaid.html).toContain('Reason: the trip was not paid in cash')

    const card = await render(findPlain('fee_charged', 'cash_card'))
    expect(card.subject).toBe('Payment received — PRG-1')
    expect(card.html).toContain('Thank you for travelling with Prestigo.')
    expect(card.html).toContain('You chose to pay by card, so we charged')
    expect(card.html).not.toContain('Reason:')
  })

  it('"a person at Prestigo decides" is in every late and no-show mail', async () => {
    for (const c of [findPlain('cancelled', 'late'), findPlain('fee_charged', 'late_cancel'), findPlain('fee_charged', 'no_show')]) {
      const out = await render(c)
      expect({ name: caseName(c), ok: /A person at Prestigo decides/.test(out.html) }).toEqual({
        name: caseName(c),
        ok: true,
      })
    }
  })

  it('fee_waived: the waiver and its three money sentences', async () => {
    const released = await render(find('fee_waived', undefined, 'released'))
    expect(released.subject).toBe('No fee for your PRESTIGO booking — PRG-1')
    expect(released.html).toContain('No fee for your booking.')
    expect(released.html).toContain('We decided not to charge a cancellation fee. The hold on your card is released.')
    expect((await render(find('fee_waived', undefined, 'refunded'))).html).toContain(
      `We refunded <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi> to your card.`,
    )
    expect((await render(find('fee_waived', undefined, 'none'))).html).toContain(
      'We decided not to charge a cancellation fee. Nothing was charged.',
    )
  })

  it('payment_failed fee: the filled button carries the fee amount, the intro names what it was for', async () => {
    const cancellation = await render(NEW_CASES.find((c) => c.extra?.feeLabel === 'cancellation')!)
    expect(cancellation.subject).toBe('Action needed: payment for your PRESTIGO booking — PRG-1')
    expect(cancellation.html).toContain('We couldn&#39;t charge your card.')
    expect(cancellation.html).toContain(
      `We couldn&#39;t charge <bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi> to your card for the cancellation fee.`,
    )
    expect(cancellation.html).toContain(`Pay <bdi dir="ltr">${formatMinor(6000, 'eur')}</bdi> securely`)
    expect(cancellation.html).toContain('Pay securely')
    expect(cancellation.html.match(FILLED_BUTTON) ?? []).toHaveLength(1)
    const noShow = await render(NEW_CASES.find((c) => c.extra?.feeLabel === 'no_show')!)
    expect(noShow.html).toContain('for the no-show fee.')
    const trip = await render(NEW_CASES.find((c) => c.extra?.feeLabel === 'trip')!)
    expect(trip.html).toContain('for your trip.')
    // A trip fee without feeMinor is the whole booking amount.
    expect(trip.html).toContain(`Pay <bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi> securely`)
  })

  it('every new kind renders a complete email: subject with the reference, no open parameter, no named entity', async () => {
    for (const c of NEW_CASES) {
      const out = await render(c)
      expect({ name: caseName(c), subject: out.subject.includes('PRG-1') }).toEqual({ name: caseName(c), subject: true })
      expect(out.html).not.toMatch(/\{[A-Za-z]+\}/)
      expect(out.subject).not.toMatch(/\{[A-Za-z]+\}/)
      for (const e of out.html.match(/&[a-zA-Z]+;/g) ?? []) expect(['&amp;', '&lt;', '&gt;', '&quot;']).toContain(e)
      expect(out.html).toContain('<bdi dir="ltr">PRG-1</bdi>')
      expect(out.html).toContain(formatLocaleDate('2026-11-15', 'en'))
    }
  })

  it('payment_failed is the only email with a filled button across all kinds', async () => {
    for (const c of [...CASES, ...NEW_CASES]) {
      const out = await render({ ...c, extra: { payUrl: PAY_URL, ...c.extra } })
      const filled = out.html.match(FILLED_BUTTON) ?? []
      expect({ name: caseName(c), filled: filled.length }).toEqual({
        name: caseName(c),
        filled: c.kind === 'payment_failed' ? 1 : 0,
      })
    }
  })

  it('Book another ride is an outlined button and only renders with a https link', async () => {
    const withLink = await render(find('cancelled', 'free', 'none'))
    expect(withLink.html).toContain('border: 1px solid #BFA06A; color: #E6D6B0')
    const without = await renderPaymentEmail('cancelled', 'en', baseVars({ variant: 'free' }))
    expect(without.html).not.toContain('Book another ride')
    await expect(
      renderPaymentEmail('cancelled', 'en', baseVars({ variant: 'free', bookAgainUrl: 'javascript:alert(1)' })),
    ).rejects.toThrow()
  })

  it('a required var that is missing fails the render instead of leaving a parameter open', async () => {
    const fails = (kind: PaymentEmailKind, over: Partial<PaymentEmailVars>, rx?: RegExp) =>
      expect(renderPaymentEmail(kind, 'en', baseVars(over))).rejects.toThrow(rx)
    await fails('cancelled', { variant: 'late', feeMinor: 6000 }, /freeUntil/)
    await fails('cancelled', { variant: 'late', freeUntil: FREE_UNTIL }, /feeMinor/)
    await fails('fee_charged', { variant: 'no_show', feeMinor: 6000 }, /waitMin/)
    await fails('fee_charged', { variant: 'no_show', waitMin: 30 }, /feeMinor/)
    await fails('fee_charged', { variant: 'late_cancel', feeMinor: 6000 }, /freeUntil/)
    await fails('fee_charged', { variant: 'late_cancel', freeUntil: 'nonsense', feeMinor: 6000 })
    await fails('payment_failed', { variant: 'fee', feeLabel: 'no_show', payUrl: PAY_URL }, /feeMinor/)
    await fails('card_saved', { variant: 'cash' }, /freeUntil/)
    await fails('fee_charged', {})
  })

  it('freeUntil accepts an ISO string as well as epoch milliseconds', async () => {
    const iso = await renderPaymentEmail(
      'fee_charged',
      'en',
      baseVars({ variant: 'late_cancel', freeUntil: '2026-11-14T08:05:00Z', feeMinor: 6000 }),
    )
    expect(iso.html).toContain(`<bdi dir="auto">${formatLocaleDateTime(FREE_UNTIL, 'en')}</bdi>`)
  })

  it('T-89-13: no template renders a reason or a note, whatever the caller passes', async () => {
    const bogus = {
      reason: 'OPERATOR-REASON-XYZ',
      note: 'OPERATOR-NOTE-XYZ',
      adminNote: 'OPERATOR-ADMIN-XYZ',
      contactNote: 'OPERATOR-CONTACT-XYZ',
    } as unknown as Partial<PaymentEmailVars>
    for (const c of NEW_CASES) {
      const out = await renderPaymentEmail(c.kind, 'en', baseVars({ variant: c.variant, ...c.extra, ...bogus }))
      expect({ name: caseName(c), leaked: out.html.includes('OPERATOR') || out.subject.includes('OPERATOR') }).toEqual({
        name: caseName(c),
        leaked: false,
      })
    }
  })

  it('UI E21: long addresses wrap in the journey table of the new kinds', async () => {
    const long = 'Na Příkopě 1234/56, Praha 1 — Nové Město, Česká republika, '.repeat(6)
    for (const c of NEW_CASES) {
      const out = await renderPaymentEmail(
        c.kind,
        'en',
        baseVars({ variant: c.variant, ...c.extra, origin: long, destination: long }),
      )
      expect(out.html).toContain('word-break: break-word; overflow-wrap: anywhere')
      expect(out.html).toContain(escapeHtml(long))
    }
  })

  it('the contact line of the payment emails is built from the catalog word for "or"', async () => {
    const out = await renderPaymentEmail('card_saved', 'en', baseVars())
    expect(out.html).toMatch(/info@rideprestigo\.com<\/a><\/bdi> or <bdi dir="ltr"><a href="tel:\+\d+"/)
  })
})

// ---------------------------------------------------------------------------
// Phase 89 plan 89-25: the new kinds in all 7 locales
// ---------------------------------------------------------------------------

/** A PaymentEmails catalog leaf of a locale, by dotted path. */
function leaf(locale: string, path: string): string {
  const m = JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as {
    PaymentEmails: Record<string, unknown>
  }
  let node: unknown = m.PaymentEmails
  for (const part of path.split('.')) node = (node as Record<string, unknown>)[part]
  if (typeof node !== 'string') throw new Error(`no catalog leaf ${path} in ${locale}`)
  return node
}

/** The static text of a leaf around its ICU parameters, escaped as the renderer escapes it. */
function fragments(locale: string, path: string): string[] {
  return leaf(locale, path)
    .split(/\{[A-Za-z]+\}/)
    .map((f) => f.trim())
    .filter((f) => f.length > 2)
    .map(escapeHtml)
}

describe.each(catalogLocales())('Phase 89 kinds per locale: %s', (locale) => {
  const rtl = (rtlLocales as readonly string[]).includes(locale)

  it.each(NEW_CASES.map((c) => [caseName(c), c] as const))('%s renders a complete email', async (_name, c) => {
    const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...c.extra }))
    expect(out.locale).toBe(locale)
    expect(out.subject.length).toBeGreaterThan(0)
    expect(out.subject).toContain('PRG-1')
    expect(out.subject).not.toMatch(/\{[A-Za-z]+\}/)
    expect(out.html).not.toMatch(/\{[A-Za-z]+\}/)
    expect(out.html).toContain(`<html lang="${locale}"`)
    expect(out.html).toContain(formatLocaleDate('2026-11-15', locale))
    // Latin digits whatever the locale.
    expect(out.html).not.toMatch(/[٠-٩۰-۹०-९]/)
    if (rtl) {
      expect(out.html).toContain('<html lang="' + locale + '" dir="rtl">')
      expect(out.html).toContain('<body dir="rtl"')
    } else {
      expect(out.html).not.toContain('dir="rtl"')
    }
    // The amount of the mail is a formatted parameter, never typed text. A release or a plain cancel states none.
    const statesAmount =
      c.kind === 'fee_charged' ||
      c.kind === 'payment_failed' ||
      (c.kind === 'card_saved' && c.variant === 'cash') ||
      (c.kind === 'cancelled' && c.variant === 'late') ||
      c.extra?.moneyOutcome === 'refunded'
    if (statesAmount) expect(out.html).toContain(formatMinor(c.extra?.feeMinor ?? c.extra?.refundMinor ?? 12000, 'eur'))
    for (const e of out.html.match(/&[a-zA-Z]+;/g) ?? []) expect(['&amp;', '&lt;', '&gt;', '&quot;']).toContain(e)
  })

  it('payment_failed is the only email with a filled button, and a fee failure carries the pay link', async () => {
    for (const c of [...CASES, ...NEW_CASES]) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, payUrl: PAY_URL, ...c.extra }))
      const filled = out.html.match(FILLED_BUTTON) ?? []
      expect({ name: caseName(c), filled: filled.length }).toEqual({
        name: caseName(c),
        filled: c.kind === 'payment_failed' ? 1 : 0,
      })
    }
  })

  it('the contact line says the locale word for "or", never the English one', async () => {
    const out = await renderPaymentEmail('cancelled', locale, baseVars({ variant: 'by_prestigo', bookAgainUrl: BOOK_URL }))
    const word = escapeHtml(leaf(locale, 'contactOr'))
    expect(out.html).toContain(`</a></bdi> ${word} <bdi dir="ltr"><a href="tel:`)
    if (locale !== 'en') expect(out.html).not.toContain('</a></bdi> or <bdi')
    // The old shared line is gone from the payment emails.
    expect(out.html).not.toMatch(/<\/a> or <a href="tel:/)
  })

  it('"a person at Prestigo decides" is in every late and no-show mail', async () => {
    const decides = escapeHtml(leaf(locale, 'common.decides'))
    for (const c of [NEW_CASES.find((n) => n.variant === 'late_cancel')!, NEW_CASES.find((n) => n.variant === 'no_show')!]) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...c.extra }))
      expect({ name: caseName(c), ok: out.html.includes(decides) }).toEqual({ name: caseName(c), ok: true })
    }
    const late = await renderPaymentEmail('cancelled', locale, baseVars({ variant: 'late', freeUntil: FREE_UNTIL, feeMinor: 6000 }))
    for (const fragment of fragments(locale, 'cancelled.introLate')) expect(late.html).toContain(fragment)
    const cash = await renderPaymentEmail('card_saved', locale, baseVars({ variant: 'cash', freeUntil: FREE_UNTIL }))
    for (const fragment of fragments(locale, 'cardSaved.cashLineIfNeeded')) expect(cash.html).toContain(fragment)
  })

  it('the three money sentences of cancelled and fee_waived are translated and resolved', async () => {
    const render = (kind: PaymentEmailKind, variant: PaymentEmailVars['variant'], moneyOutcome: 'released' | 'refunded' | 'none') =>
      renderPaymentEmail(
        kind,
        locale,
        baseVars({ variant, moneyOutcome, refundMinor: 12000, bookAgainUrl: BOOK_URL }),
      )
    for (const [kind, variant] of [
      ['cancelled', 'free'],
      ['cancelled', 'by_prestigo'],
      ['fee_waived', undefined],
    ] as const) {
      const released = await render(kind, variant, 'released')
      for (const f of fragments(locale, 'money.released')) expect(released.html).toContain(f)
      const refunded = await render(kind, variant, 'refunded')
      for (const f of fragments(locale, 'money.refunded')) expect(refunded.html).toContain(f)
      expect(refunded.html).toContain(`<bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi>`)
      const none = await render(kind, variant, 'none')
      expect(none.html).not.toContain(fragments(locale, 'money.released')[0])
      if (!(kind === 'cancelled' && variant === 'by_prestigo')) {
        for (const f of fragments(locale, 'money.nothing')) expect(none.html).toContain(f)
      }
    }
  })

  it('the cash booking email carries the guarantee wording, the cash line and the cash sentence in the box', async () => {
    const out = await renderPaymentEmail(
      'card_saved',
      locale,
      baseVars({ variant: 'cash', freeUntil: FREE_UNTIL, policy: POLICY, manageUrl: MANAGE_URL }),
    )
    for (const path of ['cardSaved.introCash', 'cardSaved.cashLineToday', 'cardSaved.cashLineDay', 'policyBox.cash']) {
      for (const f of fragments(locale, path)) expect(out.html).toContain(f)
    }
    expect(out.html).toContain(`<bdi dir="auto">${formatLocaleDateTime(FREE_UNTIL, locale)}</bdi>`)
    expect(out.html).toContain(`<bdi dir="ltr">${formatMinor(12000, 'eur')}</bdi>`)
    // The card variant of the same email has no cash sentence.
    const card = await renderPaymentEmail('card_saved', locale, baseVars({ policy: POLICY, manageUrl: MANAGE_URL }))
    for (const f of fragments(locale, 'policyBox.cash')) expect(card.html).not.toContain(f)
  })

  it('T-89-13: no operator reason or note reaches any new kind', async () => {
    const bogus = { reason: 'OPERATOR-REASON-XYZ', note: 'OPERATOR-NOTE-XYZ' } as unknown as Partial<PaymentEmailVars>
    for (const c of NEW_CASES) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...c.extra, ...bogus }))
      expect({ name: caseName(c), leaked: out.html.includes('OPERATOR') }).toEqual({ name: caseName(c), leaked: false })
    }
  })

  it('UI E21: long addresses wrap in the journey table', async () => {
    const long = 'Na Příkopě 1234/56, Praha 1 — Nové Město, Česká republika, '.repeat(6)
    for (const c of NEW_CASES) {
      const out = await renderPaymentEmail(c.kind, locale, baseVars({ variant: c.variant, ...c.extra, origin: long, destination: long }))
      expect(out.html).toContain('word-break: break-word; overflow-wrap: anywhere')
    }
  })

  it('labels are uppercase with spacing only in en, es, fr, ru', async () => {
    const out = await renderPaymentEmail('fee_charged', locale, baseVars({ variant: 'cash_card' }))
    if (['en', 'es', 'fr', 'ru'].includes(locale)) expect(out.html).toContain('text-transform: uppercase')
    else expect(out.html).not.toContain('text-transform: uppercase')
  })
})
