// Fixture for the public quote surfaces (plan 92-09): a quote with a frozen version, lines, stops and a hashed link,
// seeded into the in-memory payments database, plus a client wrapper that counts every write (the GET must make none).

import { hashQuoteToken, newQuoteToken } from '@/lib/quotes/token'
import type { FakePaymentsDb } from './fake-payments-db'

export interface PublicQuoteSeed {
  status?: 'draft' | 'sent' | 'viewed' | 'accepted' | 'paid' | 'expired' | 'voided'
  locale?: string
  expiresAt?: string | null
  cancelledAt?: string | null
  /** Pickup of line 1 (Prague wall clock). Default: far in the future of any test clock. */
  pickupDate?: string
  pickupTime?: string
  revokeLink?: boolean
  /** Create a version 2 and make it current: the link of version 1 is then superseded. */
  supersede?: boolean
  anonymised?: boolean
  remainderMethod?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  /** A booking created from line 1 (paid quotes). */
  withBooking?: boolean
  cancelFreeHours?: number
  cancelFeePercent?: number
}

export interface PublicQuoteFixture {
  token: string
  quoteId: string
  versionId: string
  linkId: string
  lineIds: string[]
}

const POLICY = (hours: number, percent: number) => ({
  version: 'quote-2026-11-1',
  kmThreshold: 100,
  freeHoursShort: hours,
  freeHoursLong: hours,
  freeHoursHourly: hours,
  feePercent: percent,
})

function ok(res: { error: { message: string; code?: string } | null }, what: string): void {
  if (res.error) throw new Error(`seed ${what}: ${res.error.message}`)
}

/** Secret values that must never reach a client view; tests assert they are absent from the rendered markup. */
export const QUOTE_SECRETS = {
  firstName: 'Ada',
  lastName: 'Lovelacesecret',
  email: 'ada.secret@example.com',
  phone: '+420777000111',
  billingName: 'Secret Billing Ltd',
  note: 'internal billing note secret',
  special: 'special request secret',
} as const

export async function seedPublicQuote(db: FakePaymentsDb, seed: PublicQuoteSeed = {}): Promise<PublicQuoteFixture> {
  const token = newQuoteToken()
  const quoteId = '00000000-0000-4000-8000-0000000a0001'
  const versionId = '00000000-0000-4000-8000-0000000b0001'
  const version2Id = '00000000-0000-4000-8000-0000000b0002'
  const linkId = '00000000-0000-4000-8000-0000000c0001'
  const lineIds = ['00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0002']
  const status = seed.status ?? 'sent'

  ok(
    await db.client.from('quotes').insert({
      id: quoteId,
      reference: 'Q-20261114-ABC123',
      status: 'draft',
      client_first_name: QUOTE_SECRETS.firstName,
      client_last_name: QUOTE_SECRETS.lastName,
      client_email: QUOTE_SECRETS.email,
      client_phone: QUOTE_SECRETS.phone,
      lead_channel: 'email',
      expires_at: seed.expiresAt ?? null,
      anonymised_at: seed.anonymised ? '2026-11-01T00:00:00.000Z' : null,
    }),
    'quote',
  )

  const versionRow = (id: string, no: number) => ({
    id,
    quote_id: quoteId,
    version_no: no,
    locale: seed.locale ?? 'en',
    currency: 'eur',
    total_minor: 30000,
    deposit_kind: 'percent',
    deposit_value: 30,
    deposit_minor: 9000,
    remainder_method: seed.remainderMethod ?? 'saved_card',
    cancel_free_hours: seed.cancelFreeHours ?? null,
    cancel_fee_percent: seed.cancelFeePercent ?? null,
    cancel_policy: POLICY(seed.cancelFreeHours ?? 48, seed.cancelFeePercent ?? 100),
    cancel_policy_version: 'quote-2026-11-1',
    terms_version: 'quote-2026-11-1',
    billing_name: QUOTE_SECRETS.billingName,
    billing_note: QUOTE_SECRETS.note,
  })
  ok(await db.client.from('quote_versions').insert(versionRow(versionId, 1)), 'version')

  ok(
    await db.client.from('quote_version_lines').insert([
      {
        id: lineIds[0],
        version_id: versionId,
        position: 1,
        trip_type: 'transfer',
        pickup_date: seed.pickupDate ?? '2027-06-10',
        pickup_time: seed.pickupTime ?? '10:30',
        landing_date: '2027-06-10',
        landing_time: '10:05',
        pickup_offset_min: 30,
        origin_address: 'Vaclav Havel Airport Prague',
        destination_address: 'Hotel Aria, Prague',
        vehicle_class: 'business',
        passengers: 2,
        luggage: 2,
        amount_minor: 12000,
        deposit_share_minor: 3600,
        remainder_minor: 8400,
        special_requests: QUOTE_SECRETS.special,
      },
      {
        id: lineIds[1],
        version_id: versionId,
        position: 2,
        trip_type: 'transfer',
        pickup_date: '2027-06-12',
        pickup_time: '09:00',
        origin_address: 'Hotel Aria, Prague',
        destination_address: 'Karlovy Vary',
        vehicle_class: 'business_van',
        passengers: 4,
        luggage: 4,
        amount_minor: 18000,
        deposit_share_minor: 5400,
        remainder_minor: 12600,
      },
    ]),
    'lines',
  )
  ok(
    await db.client.from('quote_version_line_stops').insert([
      {
        id: '00000000-0000-4000-8000-0000000e0002',
        line_id: lineIds[1],
        position: 2,
        address: 'Kutna Hora, Czechia',
        wait_minutes: 45,
        free_minutes: 15,
        blocks: 2,
        fee_per_block_eur: 7,
        fee_eur: 14,
      },
      {
        id: '00000000-0000-4000-8000-0000000e0001',
        line_id: lineIds[1],
        position: 1,
        address: 'Cesky Sternberk Castle',
        wait_minutes: 30,
        free_minutes: 15,
        blocks: 1,
        fee_per_block_eur: 7,
        fee_eur: 7,
      },
    ]),
    'stops',
  )
  ok(
    await db.client.from('quote_versions').update({ frozen_at: '2026-11-14T08:00:00.000Z' }).eq('id', versionId),
    'freeze',
  )

  let currentVersionId = versionId
  if (seed.supersede) {
    ok(await db.client.from('quote_versions').insert(versionRow(version2Id, 2)), 'version 2')
    currentVersionId = version2Id
  }
  ok(
    await db.client
      .from('quotes')
      .update({ status, current_version_id: currentVersionId, cancelled_at: seed.cancelledAt ?? null })
      .eq('id', quoteId),
    'quote status',
  )
  ok(
    await db.client.from('quote_links').insert({
      id: linkId,
      quote_id: quoteId,
      version_id: versionId,
      token_hash: hashQuoteToken(token),
      revoked_at: seed.revokeLink ? '2026-11-14T09:00:00.000Z' : null,
    }),
    'link',
  )

  if (seed.withBooking) {
    ok(
      await db.client.from('bookings').insert({
        booking_reference: 'PR-9001',
        quote_id: quoteId,
        quote_line_id: lineIds[0],
        status: 'confirmed',
        payment_mode: 'card_hold',
      }),
      'booking',
    )
  }

  return { token, quoteId, versionId, linkId, lineIds }
}

/**
 * The fake client with every write counted. `count` is reset by the test before the call under test; a GET page and the
 * resolver must leave it at 0.
 */
export function countingClient(db: FakePaymentsDb): { from: (table: string) => unknown; writes: { count: number } } {
  const writes = { count: 0 }
  return {
    writes,
    from(table: string) {
      const q = db.client.from(table) as unknown as Record<string, unknown>
      for (const method of ['insert', 'update', 'delete', 'upsert']) {
        const original = q[method]
        q[method] = (...args: unknown[]) => {
          writes.count += 1
          if (typeof original !== 'function') throw new Error(`fake db has no ${method}`)
          return (original as (...a: unknown[]) => unknown).apply(q, args)
        }
      }
      return q
    },
  }
}
