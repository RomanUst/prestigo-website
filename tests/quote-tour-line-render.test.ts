// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { locales } from '@/i18n/locales'
import { renderQuoteDocumentHtml, type QuoteDocumentInput } from '@/lib/quotes/document'
import { renderQuoteConfirmedEmail } from '@/lib/quotes/emails/confirmed'
import { buildQuoteView } from '@/lib/quotes/view'
import type { ResolvedQuote } from '@/lib/quotes/resolve'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'

// Quick task quote-tour-line (migration 096): a tour line reads under its own title and any line shows the operator's
// client description, escaped, line breaks kept, on the quote page view, the quote document (PDF) and the confirmation.

process.env.RESEND_API_KEY = 're_test'
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: vi.fn() } }
  }),
}))

const EVIL = '<script>alert(1)</script>'
const DESCRIPTION = `Day 1: Kutná Hora & Sedlec\n${EVIL}\r\nLunch not included`

const QUOTE = {
  id: 'q-1',
  reference: 'Q-20261123-TOUR01',
  status: 'sent',
  client_first_name: 'Anna',
  client_last_name: 'Novak',
  client_email: 'anna@example.invalid',
  expires_at: null,
} as unknown as QuoteRow

const VERSION = (locale: string): QuoteVersionRow =>
  ({
    id: 'v-1',
    quote_id: 'q-1',
    version_no: 1,
    frozen_at: '2026-11-23T09:00:00.000Z',
    locale,
    currency: 'eur',
    total_minor: 95000,
    deposit_kind: 'percent',
    deposit_value: 30,
    deposit_minor: 28500,
    remainder_method: 'saved_card',
    cancel_free_hours: 48,
    cancel_fee_percent: 100,
    cancel_policy: { freeHours: 48, feePercent: 100 },
    cancel_policy_version: 'quote-policy-v1',
    terms_version: 'quote-2026-11-1',
  }) as unknown as QuoteVersionRow

const LINE = (over: Partial<QuoteLineRow> = {}): QuoteLineRow & { stops: QuoteStopRow[] } => ({
  id: 'l-1',
  version_id: 'v-1',
  position: 1,
  trip_type: 'tour',
  title: `Private day trip ${EVIL}`,
  description: DESCRIPTION,
  pickup_date: '2090-05-10',
  pickup_time: '08:00',
  landing_date: null,
  landing_time: null,
  pickup_offset_min: null,
  origin_address: 'Hotel Paris, Prague',
  origin_lat: null,
  origin_lng: null,
  destination_address: null,
  destination_lat: null,
  destination_lng: null,
  vehicle_class: 'business',
  passengers: 2,
  luggage: 0,
  hours: 9,
  return_date: null,
  distance_km: null,
  flight_number: null,
  terminal: null,
  special_requests: 'Operator-only note',
  extra_child_seat: false,
  extra_meet_greet: false,
  extra_luggage: false,
  suggested_amount_minor: null,
  amount_minor: 65000,
  price_overridden: false,
  deposit_share_minor: 19500,
  remainder_minor: 45500,
  amount_eur: 650,
  amount_czk: 16250,
  ...over,
  stops: [],
})

const TRANSFER = LINE({
  id: 'l-2',
  position: 2,
  trip_type: 'transfer',
  title: null,
  description: 'Meet at gate 2',
  destination_address: 'Stephansplatz, Vienna',
  hours: null,
  distance_km: 330,
  amount_minor: 30000,
})

const input = (locale: string): QuoteDocumentInput => ({ quote: QUOTE, version: VERSION(locale), lines: [LINE(), TRANSFER] })

describe('quote document (PDF source)', () => {
  it('heads a tour by its escaped title and a transfer by its trip type; the description is escaped with <br>', async () => {
    const html = await renderQuoteDocumentHtml(input('en'))
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('Private day trip &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toMatch(/<h3>Trip 2 · Transfer<\/h3>/)
    expect(html).toContain('Day 1: Kutná Hora &amp; Sedlec<br>&lt;script&gt;alert(1)&lt;/script&gt;<br>Lunch not included')
    expect(html).toContain('>Details</th>')
    expect(html).toContain('Meet at gate 2')
    // Driver notes are never in a client document.
    expect(html).not.toContain('Operator-only note')
  })

  it('a line without a description has no Details row', async () => {
    const html = await renderQuoteDocumentHtml({ ...input('en'), lines: [LINE({ description: null })] })
    expect(html).not.toContain('>Details</th>')
  })

  it.each([...locales])('%s: renders a tour line (every catalog has the tour and description keys)', async (locale) => {
    const html = await renderQuoteDocumentHtml({
      ...input(locale),
      lines: [LINE({ title: null }), TRANSFER],
    })
    expect(html).toContain('<div dir="auto" class="desc">')
  })
})

describe('quote confirmation email', () => {
  it('names the tour title and shows the description, both escaped, line breaks as <br>', async () => {
    const { html } = await renderQuoteConfirmedEmail({
      quote: { reference: QUOTE.reference, client_first_name: 'Anna' },
      version: { locale: 'en', currency: 'eur', deposit_minor: 28500, remainder_method: 'saved_card' },
      bookings: [
        {
          booking_reference: 'PRG-QT-001',
          pickup_date: '2090-05-10',
          pickup_time: '08:00',
          origin_address: 'Hotel Paris, Prague',
          destination_address: null,
          title: `Kutná Hora ${EVIL}`,
          description: DESCRIPTION,
        },
        {
          booking_reference: 'PRG-QT-002',
          pickup_date: '2090-05-11',
          pickup_time: '09:00',
          origin_address: 'Prague',
          destination_address: 'Vienna',
        },
      ],
      remainderDueMinor: 45500,
      quoteUrl: null,
    })
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('<bdi dir="auto">Kutná Hora &lt;script&gt;alert(1)&lt;/script&gt;</bdi>')
    expect(html).toContain('Day 1: Kutná Hora &amp; Sedlec<br>&lt;script&gt;alert(1)&lt;/script&gt;<br>Lunch not included')
    expect(html).not.toContain('&ccaron;')
  })
})

describe('quote page view', () => {
  it('carries the title of a tour only, and the description of any line', () => {
    const resolved = {
      state: 'offer',
      quote: QUOTE,
      version: VERSION('en'),
      lines: [LINE(), TRANSFER, LINE({ id: 'l-3', position: 3, title: 'Not a tour', trip_type: 'hourly', description: null })],
      bookings: [],
    } as unknown as ResolvedQuote
    const view = buildQuoteView(resolved, Date.parse('2026-11-23T10:00:00Z'))
    expect(view.lines[0]).toMatchObject({ tripType: 'tour', title: `Private day trip ${EVIL}`, description: DESCRIPTION, hours: 9 })
    expect(view.lines[1]).toMatchObject({ tripType: 'transfer', title: null, description: 'Meet at gate 2' })
    expect(view.lines[2]).toMatchObject({ tripType: 'hourly', title: null, description: null })
    expect(JSON.stringify(view)).not.toContain('Operator-only note')
  })
})
