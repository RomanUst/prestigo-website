// Fixture for the quote cancel and refund tests (plan 92-22): a PAID quote with a frozen version, two lines, the linked
// trips and the succeeded deposit PaymentIntent in the Stripe double, seeded into the in-memory payments database.

import type { FakePaymentsDb } from './fake-payments-db'
import type { FakeStripe } from './fake-stripe'

export interface PaidQuoteSeed {
  /** Quote reference suffix (6 chars A-Z0-9) and id suffix, so a test can seed several quotes. */
  suffix?: string
  locale?: string
  email?: string
  deposit?: number
  freeHours?: number
  feePercent?: number
  /** Status of every linked trip. Default confirmed. */
  tripStatus?: string
  /** Statuses per trip (overrides tripStatus). */
  tripStatuses?: string[]
  tripMode?: 'card_hold' | 'quote' | 'cash_guarantee'
  /** Remainder paid on the quote page. */
  remainderPaid?: { intent: string; amount: number }
  depositRefunded?: number
  noBookings?: boolean
  /** Extra columns on the quote row. */
  quote?: Record<string, unknown>
}

export interface PaidQuoteFixture {
  quoteId: string
  versionId: string
  lineIds: string[]
  bookingIds: string[]
  reference: string
  email: string
  depositIntent: string
  remainderIntent: string | null
  deposit: number
}

/** First pickup of the fixture: 2026-12-20 08:30 Prague time (07:30Z). */
export const FIRST_PICKUP_MS = Date.parse('2026-12-20T07:30:00.000Z')

function ok(res: { error: { message: string; code?: string } | null }, what: string): void {
  if (res.error) throw new Error(`seed ${what}: ${res.error.message}`)
}

export async function seedPaidQuote(db: FakePaymentsDb, fake: FakeStripe, seed: PaidQuoteSeed = {}): Promise<PaidQuoteFixture> {
  const c = db.client
  const suffix = seed.suffix ?? 'AAAAAA'
  const reference = `Q-20261114-${suffix}`
  const email = seed.email ?? `eva-${suffix.toLowerCase()}@example.com`
  const deposit = seed.deposit ?? 5000
  const depositIntent = `pi_dep_${suffix}`
  const remainderIntent = seed.remainderPaid ? seed.remainderPaid.intent : null
  const freeHours = seed.freeHours ?? 48

  const quote = await c
    .from('quotes')
    .insert({
      reference,
      client_first_name: 'Eva',
      client_last_name: 'Novakova',
      client_email: email,
      client_phone: null,
      lead_channel: 'whatsapp',
    })
    .select('*')
    .single()
  ok(quote, 'quote')
  const quoteId = (quote.data as { id: string }).id

  const version = await c
    .from('quote_versions')
    .insert({ quote_id: quoteId, version_no: 1, locale: seed.locale ?? 'en', currency: 'eur' })
    .select('*')
    .single()
  ok(version, 'version')
  const versionId = (version.data as { id: string }).id

  const half = Math.floor(deposit / 2)
  const specs = [
    { share: half, remainder: 7000, time: '08:30' },
    { share: deposit - half, remainder: 0, time: '09:30' },
  ]
  const lineIds: string[] = []
  let total = 0
  for (const [i, spec] of specs.entries()) {
    const amount = spec.share + spec.remainder
    total += amount
    const line = await c
      .from('quote_version_lines')
      .insert({
        version_id: versionId,
        position: i + 1,
        trip_type: 'transfer',
        pickup_date: '2026-12-20',
        pickup_time: spec.time,
        origin_address: 'Letiste Vaclava Havla, Praha',
        destination_address: 'Karlovo namesti 1, Praha',
        vehicle_class: 'business',
        passengers: 2,
        luggage: 1,
        amount_minor: amount,
        deposit_share_minor: spec.share,
        remainder_minor: spec.remainder,
        amount_eur: amount / 100,
        amount_czk: Math.round((amount / 100) * 25),
      })
      .select('*')
      .single()
    ok(line, 'line')
    lineIds.push((line.data as { id: string }).id)
  }
  ok(
    await c
      .from('quote_versions')
      .update({
        frozen_at: '2026-11-13T09:00:00.000Z',
        total_minor: total,
        deposit_kind: 'fixed',
        deposit_value: deposit,
        deposit_minor: deposit,
        remainder_method: 'saved_card',
        cancel_free_hours: freeHours,
        cancel_fee_percent: seed.feePercent ?? 100,
        cancel_policy: {
          version: 'quote-2026-11-1',
          kmThreshold: 100,
          freeHoursShort: freeHours,
          freeHoursLong: freeHours,
          freeHoursHourly: freeHours,
          feePercent: seed.feePercent ?? 100,
        },
        cancel_policy_version: 'quote-2026-11-1',
        terms_version: 'quote-2026-11-1',
      })
      .eq('id', versionId),
    'freeze',
  )

  ok(
    await c
      .from('quotes')
      .update({
        status: 'paid',
        current_version_id: versionId,
        accepted_version_id: versionId,
        accepted_at: '2026-11-13T10:00:00.000Z',
        paid_at: '2026-11-13T10:05:00.000Z',
        deposit_payment_intent_id: depositIntent,
        deposit_refunded_minor: seed.depositRefunded ?? 0,
        ...(seed.remainderPaid
          ? {
              remainder_payment_intent_id: seed.remainderPaid.intent,
              remainder_amount_minor: seed.remainderPaid.amount,
              remainder_paid_at: '2026-11-14T09:00:00.000Z',
            }
          : {}),
        ...(seed.quote ?? {}),
      })
      .eq('id', quoteId),
    'paid',
  )

  fake.state.paymentIntents.set(depositIntent, {
    id: depositIntent,
    object: 'payment_intent',
    status: 'succeeded',
    amount: deposit,
    amount_received: deposit,
    amount_refunded: seed.depositRefunded ?? 0,
    currency: 'eur',
  } as never)
  if (seed.remainderPaid) {
    fake.state.paymentIntents.set(seed.remainderPaid.intent, {
      id: seed.remainderPaid.intent,
      object: 'payment_intent',
      status: 'succeeded',
      amount: seed.remainderPaid.amount,
      amount_received: seed.remainderPaid.amount,
      amount_refunded: 0,
      currency: 'eur',
    } as never)
  }

  const bookingIds: string[] = []
  if (!seed.noBookings) {
    for (const [i, lineId] of lineIds.entries()) {
      const mode = seed.tripMode ?? 'card_hold'
      const booking = await c
        .from('bookings')
        .insert({
          status: seed.tripStatuses?.[i] ?? seed.tripStatus ?? 'confirmed',
          booking_source: 'web',
          booking_reference: `PRG-20261220-Q${suffix.slice(0, 4)}${i + 1}`,
          client_first_name: 'Eva',
          client_last_name: 'Novakova',
          client_email: email,
          locale: seed.locale ?? 'en',
          trip_type: 'transfer',
          distance_km: 20,
          origin_address: 'Letiste Vaclava Havla, Praha',
          destination_address: 'Karlovo namesti 1, Praha',
          vehicle_class: 'business',
          pickup_date: '2026-12-20',
          pickup_time: specs[i].time,
          pickup_utc: new Date(FIRST_PICKUP_MS + i * 3_600_000).toISOString(),
          payment_mode: mode,
          payment_state: mode === 'quote' ? 'none' : 'card_saved',
          payment_currency: mode === 'quote' ? null : 'eur',
          payment_amount_minor: mode === 'quote' ? null : specs[i].remainder || null,
          stripe_customer_id: mode === 'quote' ? null : 'cus_1',
          stripe_payment_method_id: mode === 'quote' ? null : 'pm_ok',
          quote_id: quoteId,
          quote_line_id: lineId,
        })
        .select('*')
        .single()
      ok(booking, 'booking')
      bookingIds.push((booking.data as { id: string }).id)
    }
  }

  return { quoteId, versionId, lineIds, bookingIds, reference, email, depositIntent, remainderIntent, deposit }
}
