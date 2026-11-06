// Phase 89 plan 11 (CANC-02, D-07, D-18): the cancellation policy note, the pay-now acceptance line and the init policy
// parsing.
import { describe, it, expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { AbstractIntlMessages } from 'next-intl'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import { formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor } from '@/lib/payments/money'
import CancellationPolicyNote, { CancellationAcceptanceLine } from '@/components/booking/CancellationPolicyNote'
import { parseInitPolicy, type InitPolicy } from '@/components/booking/steps/cardCheckoutApi'
import arMessagesRaw from '@/messages/ar.json'
import ruMessagesRaw from '@/messages/ru.json'

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
