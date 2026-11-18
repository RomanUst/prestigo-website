// @vitest-environment jsdom
/**
 * Phase 93, plan 93-03 (D-11, TRIP-04, T-93-07, T-93-08): CardPaymentStage is the store-agnostic payment stage the
 * transfer wizard and the tour checkout both render. These cases drive it with injected callbacks only: the wizard
 * store module is mocked so that ANY access to it fails the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor, fireEvent, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { renderWithIntl as render } from './helpers/renderWithIntl'
import enMessages from '@/messages/en.json'
import { formatMinor } from '@/lib/payments/money'

const en = enMessages as unknown as { Booking: { step6: { cardOnFile: Record<string, string> } } }
const cof = en.Booking.step6.cardOnFile

const h = vi.hoisted(() => ({
  submitMock: vi.fn(),
  confirmSetupMock: vi.fn(),
  confirmPaymentMock: vi.fn(),
  snapshotMock: vi.fn(),
  noticeMock: vi.fn(),
  storeAccesses: 0,
}))

vi.mock('@stripe/react-stripe-js', async () => {
  const React = await import('react')
  return {
    Elements: ({ children }: { children: ReactNode }) => children,
    PaymentElement: (props: { onReady?: () => void }) => {
      React.useEffect(() => {
        props.onReady?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return React.createElement('div', { 'data-testid': 'payment-element' })
    },
    useStripe: () => ({ confirmSetup: h.confirmSetupMock, confirmPayment: h.confirmPaymentMock }),
    useElements: () => ({ submit: h.submitMock }),
  }
})

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn().mockResolvedValue({}) }))

vi.mock('@/lib/analytics-snapshot', () => ({
  writePurchaseSnapshot: (...a: unknown[]) => h.snapshotMock(...a),
}))

vi.mock('@/lib/confirmation-notice', () => ({
  writeConfirmationNotice: (...a: unknown[]) => h.noticeMock(...a),
}))

// The wizard store must never be touched by the stage when the caller injects everything. Any read of the store
// (the cardCheckoutApi helpers reach it through this module) counts as an access and fails the test below.
vi.mock('@/lib/booking-store', () => ({
  get useBookingStore() {
    h.storeAccesses++
    throw new Error('wizard store touched by CardPaymentStage')
  },
}))

import { CardPaymentStage, type CardPaymentStageProps, type PaymentChoice } from '@/components/booking/CardPaymentStage'
import type { InitEligible } from '@/components/booking/steps/cardCheckoutApi'

const POLICY = {
  version: '2026-11-1',
  freeUntilIso: '2026-11-30T08:30:00.000Z',
  freeUntilPassed: false,
  hours: 24,
  percent: 100,
  feeMinor: 12000,
  waitMin: 45,
}

function eligibleInit(over: Partial<InitEligible> = {}): InitEligible {
  return {
    eligible: true,
    mode: 'setup',
    holdAtIso: '2026-11-12T06:00:00.000Z',
    holdDateIso: '2026-11-12',
    amountMinor: 12000,
    currency: 'eur',
    policy: POLICY,
    cashAvailable: false,
    ...over,
  }
}

type Reply = { status?: number; body?: unknown }
let intentReply: Reply = {}
let intentBodies: Array<Record<string, unknown>> = []

const TRIP_PART = { tour: { slug: 'karlovy-vary', date: '2026-12-01' }, attemptId: 'tour-attempt-1' }

function setup(over: Partial<CardPaymentStageProps> = {}) {
  const props = {
    onPaymentChange: vi.fn(),
    buildIntentBody: vi.fn((attemptId: string) => ({ ...TRIP_PART, attemptId })),
    attempt: { ensure: vi.fn(() => 'tour-attempt-1'), mark: vi.fn(), renew: vi.fn() },
    onInvalidPhone: vi.fn(),
    onConfirmed: vi.fn(),
    onFallback: vi.fn(),
    onBusyChange: vi.fn(),
    totalEur: 120,
    analyticsItems: [
      { item_id: 'tour', item_name: 'Tour', item_category: 'tour', item_variant: 'tour', price: 120, quantity: 1 },
    ],
  }
  return props
}

/** Holds the payment choice like the caller does (the stage is controlled). */
function Harness({ init, base }: { init: InitEligible; base: ReturnType<typeof setup> }) {
  const [payment, setPayment] = useState<PaymentChoice>('card')
  return (
    <CardPaymentStage
      init={init}
      payment={payment}
      {...base}
      onPaymentChange={(p) => {
        base.onPaymentChange(p)
        setPayment(p)
      }}
    />
  )
}

async function ready() {
  const box = await screen.findByRole('checkbox')
  await act(async () => {})
  return box as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  h.storeAccesses = 0
  h.submitMock.mockResolvedValue({})
  h.confirmSetupMock.mockResolvedValue({ setupIntent: { status: 'succeeded' } })
  h.confirmPaymentMock.mockResolvedValue({ paymentIntent: { status: 'requires_capture' } })
  window.sessionStorage.clear()
  intentBodies = []
  intentReply = {
    body: { clientSecret: 'seti_1_secret_x', mode: 'setup', bookingReference: 'TRP-20261201-ABC123', amountMinor: 12000, currency: 'eur' },
  }
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/card-checkout/intent') {
      intentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      const status = intentReply.status ?? 200
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(intentReply.body ?? {}),
      } as Response)
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
  }) as unknown as typeof fetch
  // jsdom cannot navigate; capture assignments to location.href
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { origin: 'http://localhost', href: 'http://localhost/en/tours', assign: vi.fn() },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CardPaymentStage with injected callbacks and no wizard store', () => {
  it('posts the injected trip body plus the displayed values from init, and no amount from the trip part', async () => {
    const base = setup()
    render(<Harness init={eligibleInit()} base={base} />)
    const box = await ready()
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: cof.ctaSetup }))

    await waitFor(() => expect(intentBodies).toHaveLength(1))
    const body = intentBodies[0]
    expect(base.attempt.ensure).toHaveBeenCalled()
    expect(base.attempt.mark).toHaveBeenCalledWith('tour-attempt-1')
    expect(base.buildIntentBody).toHaveBeenCalledWith('tour-attempt-1')
    expect(body).toMatchObject({
      ...TRIP_PART,
      currency: 'eur',
      mode: 'setup',
      payment: 'card',
      consent: true,
      displayedAmountMinor: 12000,
      displayedHoldDateIso: '2026-11-12',
      displayedFreeUntilIso: POLICY.freeUntilIso,
      displayedFreeUntilPassed: false,
    })
    // the amount the server trusts is never sent: only the display cross-check
    expect(body).not.toHaveProperty('amount')
    expect(body).not.toHaveProperty('amountMinor')
    expect(base.buildIntentBody.mock.results[0].value).not.toHaveProperty('amountMinor')
  })

  it('INVALID_PHONE: a 422 answer calls onInvalidPhone once and shows the existing invalid-phone message', async () => {
    intentReply = { status: 422, body: { code: 'INVALID_PHONE' } }
    const base = setup()
    render(<Harness init={eligibleInit()} base={base} />)
    fireEvent.click(await ready())
    fireEvent.click(screen.getByRole('button', { name: cof.ctaSetup }))

    const msg = (enMessages as unknown as { Booking: { validation: { invalidPhone: string } } }).Booking.validation.invalidPhone
    expect(await screen.findByText(msg)).toBeInTheDocument()
    expect(base.onInvalidPhone).toHaveBeenCalledTimes(1)
    expect(base.onConfirmed).not.toHaveBeenCalled()
    expect(h.confirmSetupMock).not.toHaveBeenCalled()
  })

  it('onConfirmed runs with the booking reference before navigation and the notice (card: null cashLabel)', async () => {
    const order: string[] = []
    const base = setup()
    base.onConfirmed.mockImplementation(() => {
      order.push(`confirmed:${window.location.href}`)
    })
    h.noticeMock.mockImplementation(() => {
      order.push('notice')
    })
    render(<Harness init={eligibleInit()} base={base} />)
    fireEvent.click(await ready())
    fireEvent.click(screen.getByRole('button', { name: cof.ctaSetup }))

    await waitFor(() => expect(window.location.href).toMatch(/\/book\/confirmation\?ref=TRP-20261201-ABC123$/))
    expect(base.onConfirmed).toHaveBeenCalledWith({ ref: 'TRP-20261201-ABC123', cashLabel: null })
    // before the notice, and before the browser left the page
    expect(order).toEqual(['confirmed:http://localhost/en/tours', 'notice'])
    expect(h.snapshotMock).toHaveBeenCalledWith(expect.objectContaining({ ref: 'TRP-20261201-ABC123', value: 120 }))
  })

  it('onConfirmed passes a non-null cashLabel for a cash booking', async () => {
    const base = setup()
    render(<Harness init={eligibleInit({ cashAvailable: true })} base={base} />)
    await ready()
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(cof.choiceCashTitle) }))
    fireEvent.click(await ready())
    fireEvent.click(screen.getByRole('button', { name: cof.ctaSetup }))

    await waitFor(() => expect(base.onConfirmed).toHaveBeenCalledTimes(1))
    expect(intentBodies[0]).toMatchObject({ payment: 'cash', mode: 'setup', displayedHoldDateIso: null })
    expect(base.onConfirmed).toHaveBeenCalledWith({
      ref: 'TRP-20261201-ABC123',
      cashLabel: formatMinor(12000, 'eur'),
    })
  })

  it('the consent checkbox is unticked on mount and after switching card / cash', async () => {
    const base = setup()
    render(<Harness init={eligibleInit({ cashAvailable: true })} base={base} />)
    const first = await ready()
    expect(first.checked).toBe(false)
    expect(first.getAttribute('type')).toBe('checkbox')

    fireEvent.click(first)
    expect(first.checked).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(cof.choiceCashTitle) }))
    const afterCash = await ready()
    expect(afterCash.checked).toBe(false)
    expect(base.onPaymentChange).toHaveBeenLastCalledWith('cash')
    expect(base.attempt.renew).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('card-live-region')).toHaveTextContent(cof.noticeDetailsChanged)

    fireEvent.click(afterCash)
    expect(afterCash.checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(cof.choiceCardTitle) }))
    const afterCard = await ready()
    expect(afterCard.checked).toBe(false)
    expect(base.onPaymentChange).toHaveBeenLastCalledWith('card')
  })

  it('never touches the wizard store module while rendering, switching and submitting', async () => {
    const base = setup()
    render(<Harness init={eligibleInit({ cashAvailable: true })} base={base} />)
    fireEvent.click(await ready())
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(cof.choiceCashTitle) }))
    fireEvent.click(await ready())
    fireEvent.click(screen.getByRole('button', { name: cof.ctaSetup }))
    await waitFor(() => expect(base.onConfirmed).toHaveBeenCalled())
    expect(h.storeAccesses).toBe(0)
  })
})
