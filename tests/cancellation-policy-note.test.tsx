// Phase 89 plan 11 (CANC-02, D-07, D-18): the cancellation policy note, the pay-now acceptance line and the init policy
// parsing. Catalog parity for Booking.step6.cancellation and the new cardOnFile keys is asserted at the end.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, within } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import { locales } from '@/i18n/locales'
import { formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import CancellationPolicyNote, { CancellationAcceptanceLine } from '@/components/booking/CancellationPolicyNote'
import { parseInitPolicy, type InitPolicy } from '@/components/booking/steps/cardCheckoutApi'
import enMessages from '@/messages/en.json'
import arMessagesRaw from '@/messages/ar.json'
import ruMessagesRaw from '@/messages/ru.json'

const en = enMessages as unknown as { Booking: { step6: { cancellation: Record<string, string> } } }
const arMessages = arMessagesRaw as unknown as AbstractIntlMessages
const ruMessages = ruMessagesRaw as unknown as AbstractIntlMessages

function policy(over: Partial<InitPolicy> = {}): InitPolicy {
  return {
    version: '2026-11-1',
    freeUntilIso: '2026-11-12T08:30:00.000Z',
    freeUntilPassed: false,
    hours: 24,
    percent: 100,
    feeMinor: 12000,
    waitMin: 45,
    ...over,
  }
}

describe('CancellationPolicyNote (UI-SPEC 2.3)', () => {
  it('shows the exact deadline (Prague clock), the fee amount from the policy and the wait minutes', () => {
    const { container } = render(<CancellationPolicyNote policy={policy()} feeMinor={12000} currency="eur" />)
    const text = container.textContent ?? ''
    const when = formatLocaleDateTime(Date.parse('2026-11-12T08:30:00.000Z'), 'en')
    expect(when).toContain('09:30')
    expect(text).toContain(`Free cancellation until ${when}.`)
    // WR-04: the deadline names its time zone, so a client in another zone does not misread it.
    expect(when).toMatch(/09:30 \(Prague time\)$/)
    expect(text).toContain(`After that, 100% of the fare (${formatMinor(12000, 'eur')}) applies.`)
    expect(text).toContain('A person at Prestigo decides every charge and may waive it.')
    expect(text).toContain('once the driver has waited 45 minutes.')
    expect(screen.getByText('CANCELLATION')).toBeInTheDocument()
  })

  it('isolates the deadline and the amount in bdi', () => {
    const { container } = render(<CancellationPolicyNote policy={policy()} feeMinor={12000} currency="eur" />)
    const bdis = Array.from(container.querySelectorAll('bdi')).map((b) => b.textContent)
    expect(bdis).toContain(formatLocaleDateTime(Date.parse('2026-11-12T08:30:00.000Z'), 'en'))
    expect(bdis).toContain(formatMinor(12000, 'eur'))
  })

  it('a passed deadline switches row 1 to the not-available sentence with the hours; rows 2 and 3 stay', () => {
    const { container } = render(
      <CancellationPolicyNote policy={policy({ freeUntilPassed: true, hours: 12 })} feeMinor={12000} currency="eur" />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain(
      'Free cancellation is not available for this trip because pickup is less than 12 hours away.',
    )
    expect(text).not.toContain('Free cancellation until')
    expect(text).toContain('After that, 100% of the fare')
    expect(text).toContain('If you do not show up')
  })

  it('uses the singular for one hour and one minute', () => {
    const { container } = render(
      <CancellationPolicyNote
        policy={policy({ freeUntilPassed: true, hours: 1, waitMin: 1 })}
        feeMinor={12000}
        currency="eur"
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('less than 1 hour away')
    expect(text).toContain('waited 1 minute.')
  })

  it('the terms link opens in a new tab with noopener', () => {
    render(<CancellationPolicyNote policy={policy()} feeMinor={12000} currency="eur" />)
    const link = screen.getByRole('link', { name: 'Cancellation terms' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('href')).toMatch(/\/terms$/)
  })

  it('formats the fee in the given currency', () => {
    const { container } = render(<CancellationPolicyNote policy={policy()} feeMinor={300000} currency="czk" />)
    expect(container.textContent).toContain(formatMinor(300000, 'czk'))
  })

  it('in ar the deadline is written with Latin digits, inside bdi', () => {
    const { container } = render(<CancellationPolicyNote policy={policy()} feeMinor={12000} currency="eur" />, {
      locale: 'ar',
      messages: arMessages,
    })
    const when = formatLocaleDateTime(Date.parse('2026-11-12T08:30:00.000Z'), 'ar')
    expect(when).not.toMatch(/[٠-٩]/)
    expect(container.textContent).not.toMatch(/[٠-٩]/)
    expect(within(container).getByText(when).tagName).toBe('BDI')
    // plural branches keep Latin digits too
    const passed = render(
      <CancellationPolicyNote policy={policy({ freeUntilPassed: true, hours: 12, waitMin: 45 })} feeMinor={12000} currency="eur" />,
      { locale: 'ar', messages: arMessages },
    )
    expect(passed.container.textContent).toContain('12')
    expect(passed.container.textContent).not.toMatch(/[٠-٩]/)
  })

  it('uses logical properties only: leading rule on the inline start, no physical left/right borders or margins', () => {
    render(<CancellationPolicyNote policy={policy()} feeMinor={12000} currency="eur" />, { locale: 'ar', messages: arMessages })
    const note = screen.getByTestId('cancellation-note')
    const css = note.getAttribute('style') ?? ''
    expect(css).toMatch(/border-inline-start/)
    expect(css).not.toMatch(/border-left|border-right|margin-left|margin-right|padding-left|padding-right/)
    for (const el of Array.from(note.querySelectorAll('[style]'))) {
      expect(el.getAttribute('style') ?? '').not.toMatch(/(?:left|right):/)
    }
  })

  it('in ru the plural of hours and minutes follows the locale', () => {
    const { container } = render(
      <CancellationPolicyNote policy={policy({ freeUntilPassed: true, hours: 22, waitMin: 21 })} feeMinor={12000} currency="eur" />,
      { locale: 'ru', messages: ruMessages },
    )
    const text = container.textContent ?? ''
    expect(text).toContain('менее 22 часов')
    expect(text).toContain('прождёт 21 минуту')
  })
})

describe('CancellationAcceptanceLine', () => {
  it('reads the acceptance sentence with the terms link, and has no checkbox', () => {
    const { container } = render(<CancellationAcceptanceLine />)
    expect(container.textContent).toBe('By paying, you accept the cancellation terms above and our Terms & Conditions.')
    const link = screen.getByRole('link', { name: 'Terms & Conditions' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('parseInitPolicy (strict shape)', () => {
  it('accepts the init shape', () => {
    expect(parseInitPolicy(policy())).toEqual(policy())
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['missing version', { ...policy(), version: undefined }],
    ['bad date', { ...policy(), freeUntilIso: 'not a date' }],
    ['non-boolean passed flag', { ...policy(), freeUntilPassed: 'no' }],
    ['negative hours', { ...policy(), hours: -1 }],
    ['percent over 100', { ...policy(), percent: 101 }],
    ['NaN fee', { ...policy(), feeMinor: Number.NaN }],
    ['missing waitMin', { ...policy(), waitMin: undefined }],
  ])('ignores %s', (_label, raw) => {
    expect(parseInitPolicy(raw)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Catalog parity (Task 3): Booking.step6.cancellation and the Phase 89-11 cardOnFile keys, 7 locales
// ---------------------------------------------------------------------------

type Json = string | { [k: string]: Json }
function catalog(locale: string): { Booking: { step6: { cancellation: Record<string, string>; cardOnFile: Record<string, string> } } } {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as never
}

/** Argument names of an ICU message, including those used inside plural branches. */
function argNames(s: string): string[] {
  return [...new Set([...s.matchAll(/\{\s*([A-Za-z][A-Za-z0-9_]*)\s*[,}]/g)].map((m) => m[1]))].sort()
}
function tags(s: string): string[] {
  return [...s.matchAll(/<\/?([a-z]+)>/g)].map((m) => m[0])
}

const CHOICE_KEYS = [
  'paymentChoiceLabel',
  'choiceCardTitle',
  'choiceCardDescSetup',
  'choiceCardDescHoldNow',
  'choiceCashTitle',
  'choiceCashDesc',
  'headlineCash',
  'captionOnTheDay',
  'captionOnlyIfNeeded',
  'cashToday',
  'cashOnTheDay',
  'cashIfNeeded',
  'noticePolicyChanged',
] as const
const CANCELLATION_KEYS = ['label', 'rowFree', 'rowFreeUnavailable', 'rowFee', 'rowNoShow', 'termsLink', 'acceptance'] as const

describe('the EN source of the Phase 89-11 keys', () => {
  it('has every key, and the UI-SPEC wording for the rows', () => {
    const c = catalog('en')
    expect(Object.keys(c.Booking.step6.cancellation).sort()).toEqual([...CANCELLATION_KEYS].sort())
    for (const k of CHOICE_KEYS) expect(typeof c.Booking.step6.cardOnFile[k]).toBe('string')
    expect(en.Booking.step6.cancellation.rowFree).toBe('Free cancellation until <bdi>{freeUntil}</bdi>.')
    expect(c.Booking.step6.cardOnFile.choiceCardTitle).toBe('Pay by card after your trip')
    expect(c.Booking.step6.cardOnFile.choiceCashTitle).toBe('Pay cash to the driver')
  })
})

describe.each(locales.filter((l) => l !== 'en'))('Phase 89-11 checkout copy parity: %s', (locale) => {
  const base = catalog('en').Booking.step6
  const tr = catalog(locale).Booking.step6

  it('has the same keys and the same ICU arguments and rich tags as EN', () => {
    expect(Object.keys(tr.cancellation).sort()).toEqual(Object.keys(base.cancellation).sort())
    for (const k of CANCELLATION_KEYS) {
      expect({ k, args: argNames(tr.cancellation[k]) }).toEqual({ k, args: argNames(base.cancellation[k]) })
      expect({ k, tags: tags(tr.cancellation[k]) }).toEqual({ k, tags: tags(base.cancellation[k]) })
    }
    for (const k of CHOICE_KEYS) {
      expect({ k, args: argNames(tr.cardOnFile[k] ?? '') }).toEqual({ k, args: argNames(base.cardOnFile[k]) })
    }
  })

  it('is a real translation: no stub, no English copy', () => {
    for (const k of CANCELLATION_KEYS) {
      const v = tr.cancellation[k]
      expect({ k, stub: /^\[[A-Z]{2}\]/.test(v), same: v === base.cancellation[k] }).toEqual({ k, stub: false, same: false })
    }
    for (const k of CHOICE_KEYS) {
      const v = tr.cardOnFile[k]
      expect({ k, stub: /^\[[A-Z]{2}\]/.test(v), same: v === base.cardOnFile[k] }).toEqual({ k, stub: false, same: false })
    }
  })

  it('types no amount and keeps the brand spelling', () => {
    const all: string[] = [
      ...CANCELLATION_KEYS.map((k) => tr.cancellation[k]),
      ...CHOICE_KEYS.map((k) => tr.cardOnFile[k]),
    ]
    for (const v of all) {
      expect(/€\s?\d|\d\s?Kč/.test(v)).toBe(false)
      expect(/Prestigio/i.test(v)).toBe(false)
    }
  })

  it('ar, hi and zh type no non-Latin digit', () => {
    for (const k of CANCELLATION_KEYS) expect(/[٠-٩۰-۹०-९]/.test(tr.cancellation[k])).toBe(false)
  })
})

describe('plural branches of the cancellation rows cover every category of the locale', () => {
  it.each(locales.filter((l) => l !== 'en'))('%s renders hours and minutes for 0, 1, 2, 5, 11, 22, 100 without an empty branch', async (locale) => {
    const messages = locale === 'ar' ? arMessages : (await import(`@/messages/${locale}.json`)).default
    const { unmount } = render(<span />, { locale, messages })
    unmount()
    for (const n of [0, 1, 2, 5, 11, 22, 100]) {
      const { container, unmount: u } = render(
        <CancellationPolicyNote policy={policy({ freeUntilPassed: true, hours: n, waitMin: n })} feeMinor={12000} currency="eur" />,
        { locale, messages },
      )
      const text = container.textContent ?? ''
      // the number is present and no ICU syntax leaked into the page
      expect(text).toContain(String(n))
      expect(text).not.toMatch(/plural|\{|\}/)
      u()
    }
  })
})
