// @vitest-environment node
/**
 * Phase 89 plan 89-25 — operator mail of UI-SPEC 8.3: subject prefixes and body lines per alert kind.
 * The real sender runs; Resend and Supabase are doubles. Fee case mails carry [Fee], client actions [Booking],
 * the Phase 88 kinds keep [Payment].
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

const { world, mockResendSend } = vi.hoisted(() => ({
  world: {
    db: null as null | {
      client: { from: (t: string) => unknown; rpc: (n: string, a?: Record<string, unknown>) => Promise<unknown> }
    },
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
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockResendSend } }
  }),
}))

import { OPERATOR_ALERT_KINDS, sendPaymentOperatorAlert, type OperatorAlertKind } from '@/lib/payments/alerts'

const ID = '77777777-7777-4777-8777-777777777777'
const REF = 'PRG-20261201-ALERT1'

let db: FakePaymentsDb

function booking(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    status: 'confirmed',
    booking_source: 'web',
    payment_mode: 'card_hold',
    payment_state: 'authorized',
    booking_reference: REF,
    client_email: 'anna@example.com',
    client_first_name: 'Anna',
    client_last_name: 'Novak',
    locale: 'en',
    pickup_date: '2026-12-01',
    pickup_time: '14:00',
    origin_address: 'Prague Airport',
    destination_address: 'Vienna',
    payment_currency: 'eur',
    payment_amount_minor: 12000,
    ...over,
  }
}

const row = (over: Record<string, unknown> = {}) =>
  ({ ...db.state.bookings.find((b) => b.id === ID)!, ...over }) as Record<string, unknown>
const ledger = () => db.state.booking_payment_events.filter((e) => e.booking_id === ID)

interface Sent {
  from: string
  to: string[]
  subject: string
  text: string
}
const sent = (): Sent[] => mockResendSend.mock.calls.map((c) => c[0] as Sent)
const lastMail = (): Sent => sent()[sent().length - 1]

const key = (kind: string, n = '1') => `alert:${kind}:${ID}:${n}`

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MANAGER_EMAIL = 'owner@example.com'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
  mockResendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null })
  db = createFakePaymentsDb({ bookings: [booking()] })
  world.db = db
})

const FEE_DETAILS = {
  cancelledAt: '2026-12-01T09:00:00Z',
  freeUntil: '2026-12-01T08:00:00Z',
  proposedMinor: 6000,
  captureBefore: '2026-12-05T12:00:00Z',
}

describe('a late cancel whose fee case could not be opened (plan 89-27)', () => {
  it('says there is no case to charge or waive, instead of pointing at a button that is not there', async () => {
    const result = await sendPaymentOperatorAlert('fee_decision_needed', row(), {
      eventKey: `alert:fee_decision_needed:${ID}:case_missing`,
      note: 'case_missing',
      ...FEE_DETAILS,
    })
    expect(result).toBe('sent')
    const mail = lastMail()
    expect(mail.subject).toBe(`[Fee] Decision needed — ${REF}`)
    expect(mail.text).toContain('the fee case could not be opened')
    expect(mail.text).toContain('Nothing is charged.')
    expect(mail.text).not.toContain('Charge or waive the fee from the booking.')
  })
})

describe('tracer: a late cancel opens a case and the owner is mailed with the [Fee] prefix', () => {
  it('sends the Surface 8.3 lines to MANAGER_EMAIL', async () => {
    const result = await sendPaymentOperatorAlert('fee_decision_needed', row(), { eventKey: key('fee_decision_needed'), ...FEE_DETAILS })
    expect(result).toBe('sent')
    const mail = lastMail()
    expect(mail.to).toEqual(['owner@example.com'])
    expect(mail.subject).toBe(`[Fee] Decision needed — ${REF}`)
    expect(mail.text).toContain(`Booking reference: ${REF}`)
    expect(mail.text).toContain('Client name: Anna Novak')
    expect(mail.text).toContain('Pickup (Prague): 2026-12-01 14:00')
    // 09:00 UTC on 1 December is 10:00 in Prague.
    expect(mail.text).toContain('Cancelled at: 1 Dec 2026, 10:00')
    expect(mail.text).toContain('Free period ended: 1 Dec 2026, 09:00')
    expect(mail.text).toContain('Proposed fee: €60')
    expect(mail.text).toContain('Hold ends: 5 Dec 2026, 13:00')
    expect(mail.text).toContain('Open in admin: https://rideprestigo.com/admin/bookings')
    expect(mail.text).toContain('Charge or waive the fee from the booking.')
    expect(mail.text).not.toContain('Driver arrived')
    expect(mail.text).not.toContain('Open since')
  })
})

describe('subject prefixes', () => {
  const cases: Array<[OperatorAlertKind, string]> = [
    ['fee_decision_needed', `[Fee] Decision needed — ${REF}`],
    ['fee_no_show_needed', `[Fee] No-show, decision needed — ${REF}`],
    ['fee_pending_24h', `[Fee] Still undecided after 24 h — ${REF}`],
    ['client_cancelled', `[Booking] Cancelled by client — ${REF}`],
    ['change_request', `[Booking] Change request — ${REF}`],
  ]
  it.each(cases)('%s', async (kind, subject) => {
    expect(await sendPaymentOperatorAlert(kind, row(), { eventKey: key(kind), message: 'hello' })).toBe('sent')
    expect(lastMail().subject).toBe(subject)
  })

  it('existing kinds keep [Payment]', async () => {
    const legacy = OPERATOR_ALERT_KINDS.filter(
      (k) => !['fee_decision_needed', 'fee_no_show_needed', 'fee_pending_24h', 'client_cancelled', 'change_request'].includes(k),
    )
    // Ten Phase 88 / 89 kinds plus ops_attention (Phase 91 review).
    expect(legacy).toHaveLength(11)
    for (const kind of legacy) {
      await sendPaymentOperatorAlert(kind, row(), { eventKey: key(kind), code: 'x' })
      expect(lastMail().subject.startsWith('[Payment] ')).toBe(true)
    }
    expect(sent()).toHaveLength(11)
  })

  it('ops_attention: one body per note, ids and amounts only', async () => {
    const notes = ['extra_unresolved', 'extra_late_success', 'extra_second_payment', 'extra_receipt_failed', 'stops_missing']
    const seen = new Set<string>()
    for (const note of notes) {
      expect(
        await sendPaymentOperatorAlert('ops_attention', row(), { eventKey: key(`ops_${note}`), code: note, amountMinor: 1500, note }),
      ).toBe('sent')
      const mail = lastMail()
      expect(mail.subject).toBe(`[Payment] Needs attention — ${REF}`)
      expect(mail.text).toContain(`Booking reference: ${REF}`)
      expect(mail.text).toContain(`Reason code: ${note}`)
      seen.add(mail.text.split('\n').slice(-1)[0])
    }
    // each note has its own instruction
    expect(seen.size).toBe(notes.length)
  })

  it('exposes the five new kinds', () => {
    for (const kind of ['fee_decision_needed', 'fee_no_show_needed', 'fee_pending_24h', 'client_cancelled', 'change_request']) {
      expect(OPERATOR_ALERT_KINDS).toContain(kind)
    }
  })
})

describe('fee case bodies', () => {
  it('a no-show adds the driver arrival, the request and the wait threshold', async () => {
    await sendPaymentOperatorAlert('fee_no_show_needed', row(), {
      eventKey: key('fee_no_show_needed'),
      proposedMinor: 12000,
      arrivedAt: '2026-12-01T13:00:00Z',
      requestedAt: '2026-12-01T13:35:00Z',
      thresholdMin: 30,
      captureBefore: '2026-12-05T12:00:00Z',
    })
    const text = lastMail().text
    expect(text).toContain('Driver arrived: 1 Dec 2026, 14:00')
    expect(text).toContain('No-show requested: 1 Dec 2026, 14:35')
    expect(text).toContain('Wait threshold: 30 minutes')
    expect(text).toContain('Proposed fee: €120')
    expect(text).not.toContain('Cancelled at')
    expect(text).not.toContain('Free period ended')
  })

  it('the 24 h reminder adds when the case opened and says nothing is charged until the owner decides', async () => {
    await sendPaymentOperatorAlert('fee_pending_24h', row(), {
      eventKey: key('fee_pending_24h'),
      ...FEE_DETAILS,
      openedAt: '2026-11-30T09:00:00Z',
    })
    const text = lastMail().text
    expect(text).toContain('Open since: 30 Nov 2026, 10:00')
    expect(text).toContain('Nothing is charged until you decide.')
    expect(text).toContain('Charge or waive the fee from the booking.')
  })

  it('a missing field is simply omitted, never printed as n/a or undefined', async () => {
    await sendPaymentOperatorAlert('fee_decision_needed', row({ capture_before: null }), { eventKey: key('fee_decision_needed') })
    const text = lastMail().text
    expect(text).toContain(`Booking reference: ${REF}`)
    expect(text).not.toMatch(/Cancelled at|Free period ended|Proposed fee|Hold ends|undefined|null/)
  })

  it('the hold end falls back to the booking capture_before', async () => {
    await sendPaymentOperatorAlert('fee_decision_needed', row({ capture_before: '2026-12-06T12:00:00Z' }), {
      eventKey: key('fee_decision_needed'),
    })
    expect(lastMail().text).toContain('Hold ends: 6 Dec 2026, 13:00')
  })

  it('a CZK booking states the proposed fee in crowns', async () => {
    await sendPaymentOperatorAlert('fee_decision_needed', row({ payment_currency: 'czk' }), {
      eventKey: key('fee_decision_needed'),
      proposedMinor: 150000,
    })
    expect(lastMail().text).toMatch(/Proposed fee: 1\s?500 Kč/)
  })
})

describe('refund_failed on a booking paid in cash (money WR-10)', () => {
  it('tells the operator to return the cash, not to refund in Stripe', async () => {
    await sendPaymentOperatorAlert('refund_failed', row(), { eventKey: key('refund_failed'), amountMinor: 9000, note: 'cash_settled', code: 'cash_settled' })
    const text = String(sent()[0].text)
    expect(text).toContain('recorded as paid in cash')
    expect(text).not.toContain('Stripe Dashboard')
  })
})

describe('client_cancelled after the free period (public WR-06)', () => {
  it('says the cancel was late and that no fee can be taken', async () => {
    await sendPaymentOperatorAlert('client_cancelled', row(), { eventKey: key('client_cancelled'), moneyOutcome: 'none', late: true })
    const text = String(sent()[0].text)
    expect(text).toContain('Late cancellation. No fee can be taken.')
    expect(text).not.toContain('Free cancellation')
  })
})

describe('client_cancelled', () => {
  it.each([
    ['released', 'Free cancellation. Hold released.'],
    ['refunded', 'Free cancellation. Refund of €120 issued.'],
    ['none', 'Free cancellation. Nothing to refund.'],
    [undefined, 'Free cancellation. Nothing to refund.'],
  ] as const)('money outcome %s', async (moneyOutcome, line) => {
    await sendPaymentOperatorAlert('client_cancelled', row(), { eventKey: key('client_cancelled'), moneyOutcome })
    const text = lastMail().text
    expect(text).toContain(`Booking reference: ${REF}`)
    expect(text).toContain('Client name: Anna Novak')
    expect(text).toContain('Pickup (Prague): 2026-12-01 14:00')
    expect(text).toContain(line)
  })
})

describe('change_request (T-89-72)', () => {
  const HOSTILE = '<script>alert("x")</script> & <img src=x onerror=alert(1)>'

  it('escapes the client message and shows the instruction', async () => {
    await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b1'), message: HOSTILE })
    const text = lastMail().text
    expect(text).toContain(`Booking reference: ${REF}`)
    expect(text).toContain('Client name: Anna Novak')
    expect(text).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img src=x onerror=alert(1)&gt;')
    expect(text).not.toContain('<script>')
    expect(text).not.toContain('<img')
    expect(text).toContain('Edit the booking in admin and reply to the client.')
  })

  it('never writes the message to the ledger', async () => {
    await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b1'), message: 'PRIVATE-WORDS-XYZ' })
    expect(lastMail().text).toContain('PRIVATE-WORDS-XYZ')
    expect(JSON.stringify(ledger())).not.toContain('PRIVATE-WORDS-XYZ')
    expect(ledger().map((e) => e.event_key)).toEqual([key('change_request', 'b1')])
  })

  it('caps a very long message', async () => {
    await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b2'), message: 'a'.repeat(5000) })
    expect(lastMail().text).toContain('a'.repeat(2000))
    expect(lastMail().text).not.toContain('a'.repeat(2001))
  })

  it('a message-less request still mails the owner', async () => {
    expect(await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b3') })).toBe('sent')
    expect(lastMail().text).toContain('Client message: n/a')
  })
})

describe('exactly once per event key', () => {
  it.each(['fee_decision_needed', 'fee_no_show_needed', 'fee_pending_24h', 'client_cancelled', 'change_request'] as const)(
    '%s: the same key sends nothing the second time',
    async (kind) => {
      expect(await sendPaymentOperatorAlert(kind, row(), { eventKey: key(kind), message: 'x' })).toBe('sent')
      expect(await sendPaymentOperatorAlert(kind, row(), { eventKey: key(kind), message: 'x' })).toBe('duplicate')
      expect(sent()).toHaveLength(1)
      expect(ledger().filter((e) => e.kind === 'alert_sent')).toHaveLength(1)
    },
  )

  it('a different key (a later change request) sends again', async () => {
    await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b1'), message: 'one' })
    await sendPaymentOperatorAlert('change_request', row(), { eventKey: key('change_request', 'b2'), message: 'two' })
    expect(sent()).toHaveLength(2)
  })

  it('without MANAGER_EMAIL nothing is sent and the result is failed', async () => {
    delete process.env.MANAGER_EMAIL
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendPaymentOperatorAlert('fee_decision_needed', row(), { eventKey: key('fee_decision_needed') })).toBe('failed')
    expect(sent()).toHaveLength(0)
  })
})
