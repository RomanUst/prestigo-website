// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFakePaymentsDb } from './helpers/fake-payments-db'

// The conversion contract of plan 92-06 against the fake DB: quote_convert_to_bookings turns the accepted, paid version
// of a quote into one confirmed booking per line, exactly once. The SQL function is pinned by text in
// tests/migration-091.test.ts; this file pins what the fake answers, so every TypeScript money plan can rely on it.

type Db = ReturnType<typeof createFakePaymentsDb>
type Row = Record<string, unknown>

const HASH = 'b'.repeat(64)
const NOW = Date.parse('2026-11-14T10:00:00.000Z')
const HOLD_AT = '2026-12-17T08:00:00.000Z'

interface LineSpec {
  share: number
  remainder: number
}

interface SeedOptions {
  method?: 'saved_card' | 'payment_link' | 'cash' | 'invoice'
  lines?: LineSpec[]
  suffix?: string
  intent?: string
  status?: string
  quote?: Row
}

interface Seeded {
  quoteId: string
  versionId: string
  lineIds: string[]
  intent: string
}

async function seed(db: Db, opts: SeedOptions = {}): Promise<Seeded> {
  const c = db.client
  const suffix = opts.suffix ?? 'AAAAAA'
  const intent = opts.intent ?? 'pi_1'
  const specs = opts.lines ?? [
    { share: 3000, remainder: 7000 },
    { share: 2000, remainder: 0 },
  ]
  const quote = await c
    .from('quotes')
    .insert({
      reference: `Q-20261114-${suffix}`,
      client_first_name: 'Eva',
      client_last_name: 'Nováková',
      client_email: `eva-${suffix}@example.com`,
      client_phone: null,
      lead_channel: 'whatsapp',
    })
    .select('*')
    .single()
  const quoteId = (quote.data as { id: string }).id
  const version = await c
    .from('quote_versions')
    .insert({ quote_id: quoteId, version_no: 1, locale: 'zh-hant', currency: 'eur' })
    .select('*')
    .single()
  const versionId = (version.data as { id: string }).id

  const lineIds: string[] = []
  let total = 0
  let deposit = 0
  for (const [i, spec] of specs.entries()) {
    const amount = spec.share + spec.remainder
    total += amount
    deposit += spec.share
    const line = await c
      .from('quote_version_lines')
      .insert({
        version_id: versionId,
        position: i + 1,
        trip_type: 'transfer',
        pickup_date: '2026-12-20',
        pickup_time: `0${i + 8}:30`,
        landing_date: i === 0 ? '2026-12-20' : null,
        landing_time: i === 0 ? '08:00' : null,
        pickup_offset_min: i === 0 ? 30 : null,
        origin_address: 'Letiste Vaclava Havla, Praha',
        origin_lat: 50.1,
        origin_lng: 14.26,
        destination_address: 'Karlovo namesti 1, Praha',
        vehicle_class: 'business',
        passengers: 2,
        luggage: 1,
        distance_km: 17.5,
        flight_number: 'OK123',
        terminal: 'T2',
        special_requests: 'Name board',
        extra_child_seat: i === 0,
        amount_minor: amount,
        deposit_share_minor: spec.share,
        remainder_minor: spec.remainder,
        amount_eur: amount / 100,
        amount_czk: Math.round((amount / 100) * 25),
      })
      .select('*')
      .single()
    expect(line.error).toBeNull()
    const lineId = (line.data as { id: string }).id
    lineIds.push(lineId)
    const stop = await c.from('quote_version_line_stops').insert({
      line_id: lineId,
      position: 1,
      address: `Stop ${i + 1}, Praha`,
      lat: 50.08,
      lng: 14.42,
      wait_minutes: 15,
      free_minutes: 15,
      blocks: 0,
      fee_eur: 0,
    })
    expect(stop.error).toBeNull()
  }

  const frozen = await c
    .from('quote_versions')
    .update({
      frozen_at: '2026-11-13T09:00:00.000Z',
      total_minor: total,
      deposit_kind: 'fixed',
      deposit_value: deposit,
      deposit_minor: deposit,
      remainder_method: opts.method ?? 'saved_card',
      cancel_free_hours: 48,
      cancel_fee_percent: 100,
      cancel_policy: { freeHours: 48, feePercent: 100 },
      cancel_policy_version: 'quote-policy-v1',
      terms_version: 'quote-2026-11-1',
    })
    .eq('id', versionId)
  expect(frozen.error).toBeNull()

  const acceptance = await c.from('quote_acceptances').insert({
    quote_id: quoteId,
    version_id: versionId,
    locale: 'zh-hant',
    terms_version: 'quote-2026-11-1',
    terms_sha256: HASH,
    terms_rendered: 'Terms of this quote. '.repeat(100),
    deposit_minor: deposit,
    currency: 'eur',
    ip: '203.0.113.7',
    user_agent: 'test-agent',
    payment_intent_id: intent,
  })
  expect(acceptance.error).toBeNull()

  const upd = await c
    .from('quotes')
    .update({
      status: opts.status ?? 'accepted',
      current_version_id: versionId,
      accepted_version_id: versionId,
      deposit_payment_intent_id: intent,
      ...(opts.quote ?? {}),
    })
    .eq('id', quoteId)
  expect(upd.error).toBeNull()
  return { quoteId, versionId, lineIds, intent }
}

const linesArg = (n: number, holdAt: string | null = HOLD_AT) =>
  Array.from({ length: n }, (_, i) => ({ position: i + 1, booking_reference: `PRG-QT-00${i + 1}`, hold_at: holdAt }))

function convertArgs(s: Seeded, over: Row = {}): Row {
  return {
    p_quote_id: s.quoteId,
    p_version_id: s.versionId,
    p_payment_intent_id: s.intent,
    p_customer_id: 'cus_1',
    p_payment_method_id: 'pm_1',
    p_lines: linesArg(s.lineIds.length),
    p_actor_type: 'webhook',
    p_actor_id: 'evt_1',
    ...over,
  }
}

const convert = async (db: Db, s: Seeded, over: Row = {}) => {
  const res = await db.client.rpc('quote_convert_to_bookings', convertArgs(s, over))
  expect(res.error).toBeNull()
  return res.data as { converted: boolean; first_time?: boolean; booking_ids?: string[]; reason?: string }
}

const bookingsOf = (db: Db, quoteId: string) =>
  db.state.bookings.filter((b) => b.quote_id === quoteId).sort((a, b) => String(a.booking_reference).localeCompare(String(b.booking_reference)))

/** Everything a refused call must leave alone. */
const written = (db: Db) =>
  JSON.stringify([
    db.state.bookings,
    db.state.booking_stops,
    db.state.booking_payment_events,
    db.state.booking_payment_consents,
    db.state.quote_events,
    db.state.quotes,
    db.state.quote_acceptances,
  ])

describe('quote_convert_to_bookings in the fake DB', () => {
  it('tracer: a saved-card line with a remainder and a line without one become two linked bookings', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const res = await convert(db, s)
    expect(res).toMatchObject({ converted: true, first_time: true })
    expect(res.booking_ids).toHaveLength(2)

    const [b1, b2] = bookingsOf(db, s.quoteId)
    expect(res.booking_ids).toEqual([b1.id, b2.id])

    expect(b1).toMatchObject({
      status: 'confirmed',
      booking_type: 'confirmed',
      booking_source: 'manual',
      lead_channel: 'whatsapp',
      payment_mode: 'card_hold',
      payment_state: 'card_saved',
      payment_amount_minor: 7000,
      payment_currency: 'eur',
      stripe_customer_id: 'cus_1',
      stripe_payment_method_id: 'pm_1',
      hold_at: HOLD_AT,
      quote_id: s.quoteId,
      quote_line_id: s.lineIds[0],
      quote_deposit_minor: 3000,
      booking_reference: 'PRG-QT-001',
      client_first_name: 'Eva',
      client_phone: '',
      locale: 'zh-hant',
      cancel_policy_version: 'quote-policy-v1',
      landing_date: '2026-12-20',
      landing_time: '08:00',
      pickup_offset_min: 30,
      flight_number: 'OK123',
      terminal: 'T2',
      special_requests: 'Name board',
      distance_km: 17.5,
      amount_eur: 100,
      extra_child_seat: true,
    })
    expect(b2).toMatchObject({
      payment_mode: 'quote',
      payment_state: 'none',
      payment_amount_minor: null,
      payment_currency: null,
      stripe_customer_id: null,
      stripe_payment_method_id: null,
      hold_at: null,
      quote_line_id: s.lineIds[1],
      quote_deposit_minor: 2000,
    })
    // Pitfall 2: the deposit intent is never on a booking.
    expect(b1.payment_intent_id).toBeNull()
    expect(b2.payment_intent_id).toBeNull()

    // The stops are copied from the frozen line.
    const stops = db.state.booking_stops.filter((r) => r.booking_id === b1.id)
    expect(stops).toHaveLength(1)
    expect(stops[0]).toMatchObject({ position: 1, address: 'Stop 1, Praha', wait_minutes: 15, free_minutes: 15 })

    // One quote_deposit ledger row per booking with the line's share; the intent id only in stripe_object_id.
    const ledger = db.state.booking_payment_events.filter((e) => e.kind === 'quote_deposit')
    expect(ledger).toHaveLength(2)
    expect(ledger.find((e) => e.booking_id === b1.id)).toMatchObject({
      event_key: 'quote_deposit:pi_1',
      stripe_object_id: 'pi_1',
      amount_minor: 3000,
      currency: 'eur',
      actor_type: 'webhook',
    })
    expect(ledger.find((e) => e.booking_id === b2.id)).toMatchObject({ amount_minor: 2000 })

    // One consent per booking, mode quote, the acceptance's text.
    const consents = db.state.booking_payment_consents
    expect(consents).toHaveLength(2)
    expect(consents.every((r) => r.mode === 'quote' && r.text_version === 'quote-2026-11-1' && r.text_sha256 === HASH)).toBe(true)
    expect(consents.every((r) => (r.text_rendered as string).length > 2000)).toBe(true)
    expect(consents.every((r) => r.ip === '203.0.113.7' && r.locale === 'zh-hant')).toBe(true)

    // The quote, the acceptance and the events.
    const quote = db.state.quotes.find((q) => q.id === s.quoteId) as Row
    expect(quote).toMatchObject({ status: 'paid', stripe_customer_id: 'cus_1', stripe_payment_method_id: 'pm_1' })
    expect(typeof quote.paid_at).toBe('string')
    expect(db.state.quote_acceptances[0].confirmed_at).not.toBeNull()
    const keys = db.state.quote_events.map((e) => `${e.kind}|${e.event_key}`).sort()
    expect(keys).toEqual([`converted|converted:${s.versionId}`, 'deposit_paid|deposit_paid:pi_1'])
    expect(db.state.quote_events.find((e) => e.kind === 'deposit_paid')).toMatchObject({ amount_minor: 5000, currency: 'eur' })
  })

  it('exactly once: a second call returns the same ids with first_time false and writes nothing', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const first = await convert(db, s)
    const before = written(db)
    const again = await convert(db, s)
    expect(again).toEqual({ converted: true, first_time: false, booking_ids: first.booking_ids })
    expect(bookingsOf(db, s.quoteId)).toHaveLength(2)
    expect(written(db)).toBe(before)
  })

  it('exactly once: the unique quote_line_id makes a duplicate booking impossible even past the status check', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    await convert(db, s)
    // Put the quote back to accepted (a bypassed status check): the unique index still refuses, and nothing changes.
    await db.client.from('quotes').update({ status: 'accepted', paid_at: null }).eq('id', s.quoteId)
    const before = written(db)
    const res = await db.client.rpc('quote_convert_to_bookings', convertArgs(s))
    expect(res.error?.code).toBe('23505')
    expect(res.error?.message).toContain('bookings_quote_line_id_key')
    expect(written(db)).toBe(before)
    expect(bookingsOf(db, s.quoteId)).toHaveLength(2)
  })

  it('W2: a replay of the recorded deposit after a late cancel answers first_time false, a different intent is intent_mismatch', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const first = await convert(db, s)
    // 92-22 records a late cancel: the deposit is kept.
    const cancel = await db.client
      .from('quotes')
      .update({ cancelled_at: '2026-11-20T10:00:00.000Z', cancel_outcome: 'late', cancel_initiator: 'admin_client', deposit_refunded_minor: 0 })
      .eq('id', s.quoteId)
    expect(cancel.error).toBeNull()
    const before = written(db)

    const replay = await convert(db, s)
    expect(replay).toEqual({ converted: true, first_time: false, booking_ids: first.booking_ids })

    const other = await convert(db, s, { p_payment_intent_id: 'pi_2' })
    expect(other).toEqual({ converted: false, reason: 'intent_mismatch' })
    expect(written(db)).toBe(before)

    // Voided after payment: the replay of the recorded deposit still answers from the bookings.
    await db.client.from('quotes').update({ status: 'voided', voided_at: '2026-11-21T10:00:00.000Z' }).eq('id', s.quoteId)
    expect(await convert(db, s)).toEqual({ converted: true, first_time: false, booking_ids: first.booking_ids })
    expect(await convert(db, s, { p_payment_intent_id: 'pi_2' })).toEqual({ converted: false, reason: 'intent_mismatch' })
  })

  it('refuses without writing: wrong version, wrong intent, voided, cancelled, not accepted, unknown quote', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const before = written(db)

    expect(await convert(db, s, { p_version_id: '00000000-0000-4000-8000-0000000000ff' })).toEqual({ converted: false, reason: 'version_mismatch' })
    expect(await convert(db, s, { p_payment_intent_id: 'pi_other' })).toEqual({ converted: false, reason: 'intent_mismatch' })
    expect(await convert(db, s, { p_payment_intent_id: null })).toEqual({ converted: false, reason: 'intent_mismatch' })
    expect(await convert(db, s, { p_quote_id: '00000000-0000-4000-8000-0000000000ff' })).toEqual({ converted: false, reason: 'not_found' })
    expect(written(db)).toBe(before)

    await db.client.from('quotes').update({ status: 'sent' }).eq('id', s.quoteId)
    expect(await convert(db, s)).toEqual({ converted: false, reason: 'not_accepted' })

    await db.client.from('quotes').update({ status: 'voided', voided_at: '2026-11-14T10:00:00.000Z' }).eq('id', s.quoteId)
    expect(await convert(db, s)).toEqual({ converted: false, reason: 'voided' })

    await db.client.from('quotes').update({ status: 'accepted', voided_at: null, cancelled_at: '2026-11-14T10:00:00.000Z' }).eq('id', s.quoteId)
    expect(await convert(db, s)).toEqual({ converted: false, reason: 'cancelled' })

    expect(db.state.bookings).toHaveLength(0)
    expect(db.state.booking_stops).toHaveLength(0)
    expect(db.state.booking_payment_events).toHaveLength(0)
    expect(db.state.booking_payment_consents).toHaveLength(0)
    expect(db.state.quote_events).toHaveLength(0)
  })

  it('a version that is not the current one is refused even when it is the intent owner', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const v2 = await db.client.from('quote_versions').insert({ quote_id: s.quoteId, version_no: 2, locale: 'en', currency: 'eur' }).select('*').single()
    await db.client.from('quotes').update({ current_version_id: (v2.data as { id: string }).id }).eq('id', s.quoteId)
    expect(await convert(db, s)).toEqual({ converted: false, reason: 'version_mismatch' })
    expect(db.state.bookings).toHaveLength(0)
  })

  it('refuses lines that are not exactly the version lines, and a missing hold_at, without writing', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const before = written(db)

    expect(await convert(db, s, { p_lines: linesArg(1) })).toEqual({ converted: false, reason: 'lines_mismatch' })
    expect(await convert(db, s, { p_lines: [...linesArg(2), { position: 3, booking_reference: 'X', hold_at: HOLD_AT }] })).toEqual({
      converted: false,
      reason: 'lines_mismatch',
    })
    expect(await convert(db, s, { p_lines: [{ position: 1, booking_reference: 'A', hold_at: HOLD_AT }, { position: 1, booking_reference: 'B', hold_at: HOLD_AT }] })).toEqual({
      converted: false,
      reason: 'lines_mismatch',
    })
    expect(await convert(db, s, { p_lines: [{ position: 1, booking_reference: '', hold_at: HOLD_AT }, { position: 2, booking_reference: 'B' }] })).toEqual({
      converted: false,
      reason: 'lines_mismatch',
    })
    expect(await convert(db, s, { p_lines: null })).toEqual({ converted: false, reason: 'lines_mismatch' })
    // Line 1 holds a card with a remainder: no hold_at, no conversion. Line 2 has no remainder and needs none.
    expect(await convert(db, s, { p_lines: [{ position: 1, booking_reference: 'A', hold_at: null }, { position: 2, booking_reference: 'B' }] })).toEqual({
      converted: false,
      reason: 'hold_at_missing',
    })
    expect(written(db)).toBe(before)

    const ok = await convert(db, s, { p_lines: [{ position: 2, booking_reference: 'B' }, { position: 1, booking_reference: 'A', hold_at: HOLD_AT }] })
    expect(ok.converted).toBe(true)
  })

  it('a card line without customer and card ids raises and leaves nothing behind', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    const res = await db.client.rpc('quote_convert_to_bookings', convertArgs(s, { p_customer_id: null, p_payment_method_id: null }))
    expect(res.error?.message).toBe('quote_card_ids_missing')
    expect(db.state.bookings).toHaveLength(0)
    expect((db.state.quotes[0] as Row).status).toBe('accepted')
  })

  it('the quote own card ids fill in when the caller passes none', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db, { quote: { stripe_customer_id: 'cus_q', stripe_payment_method_id: 'pm_q' } })
    const res = await convert(db, s, { p_customer_id: null, p_payment_method_id: null })
    expect(res.converted).toBe(true)
    expect(bookingsOf(db, s.quoteId)[0]).toMatchObject({ stripe_customer_id: 'cus_q', stripe_payment_method_id: 'pm_q' })
  })

  it('cash: a line with a remainder is cash_guarantee / card_saved without hold_at; a zero remainder is quote / none', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db, { method: 'cash', suffix: 'CASH01' })
    const res = await convert(db, s, { p_lines: linesArg(2, null) })
    expect(res.converted).toBe(true)
    const [b1, b2] = bookingsOf(db, s.quoteId)
    expect(b1).toMatchObject({
      payment_mode: 'cash_guarantee',
      payment_state: 'card_saved',
      payment_amount_minor: 7000,
      payment_currency: 'eur',
      stripe_customer_id: 'cus_1',
      stripe_payment_method_id: 'pm_1',
      hold_at: null,
    })
    expect(b2).toMatchObject({ payment_mode: 'quote', payment_state: 'none', payment_amount_minor: null })
  })

  it.each(['payment_link', 'invoice'] as const)('%s: every line is quote / none without Stripe ids', async (method) => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db, { method, suffix: method === 'invoice' ? 'INV001' : 'LNK001' })
    const res = await convert(db, s, { p_lines: linesArg(2, null) })
    expect(res.converted).toBe(true)
    for (const b of bookingsOf(db, s.quoteId)) {
      expect(b).toMatchObject({
        payment_mode: 'quote',
        payment_state: 'none',
        payment_amount_minor: null,
        payment_currency: null,
        stripe_customer_id: null,
        stripe_payment_method_id: null,
        hold_at: null,
      })
      expect(b.payment_intent_id).toBeNull()
    }
  })

  it('claim: claim_due_payment_work picks the card_hold booking once its hold_at has passed, never the quote or cash rows', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const hold = await seed(db, { suffix: 'HOLD01', intent: 'pi_hold' })
    const cash = await seed(db, { method: 'cash', suffix: 'CASH02', intent: 'pi_cash' })
    const link = await seed(db, { method: 'payment_link', suffix: 'LINK02', intent: 'pi_link' })
    await convert(db, hold, { p_lines: [{ position: 1, booking_reference: 'H-1', hold_at: HOLD_AT }, { position: 2, booking_reference: 'H-2', hold_at: HOLD_AT }] })
    await convert(db, cash, { p_lines: [{ position: 1, booking_reference: 'C-1' }, { position: 2, booking_reference: 'C-2' }] })
    await convert(db, link, { p_lines: [{ position: 1, booking_reference: 'L-1' }, { position: 2, booking_reference: 'L-2' }] })

    // Before hold_at: nothing is due.
    const early = await db.client.rpc('claim_due_payment_work', { p_limit: 10, p_lease_seconds: 60 })
    expect(early.data).toEqual([])

    // Pickup is 2026-12-20, hold_at 2026-12-17T08:00Z: move the clock past hold_at, before the pickup.
    db.state.nowMs = Date.parse('2026-12-17T09:00:00.000Z')
    const due = await db.client.rpc('claim_due_payment_work', { p_limit: 10, p_lease_seconds: 60 })
    const claimed = due.data as Row[]
    expect(claimed).toHaveLength(1)
    expect(claimed[0]).toMatchObject({ booking_reference: 'H-1', payment_mode: 'card_hold', payment_state: 'placing_hold', quote_id: hold.quoteId })
    const ledger = db.state.booking_payment_events.filter((e) => e.kind === 'hold_started')
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ booking_id: claimed[0].id, amount_minor: 7000, currency: 'eur' })
  })

  it('actor: an unknown actor type is recorded as system, the actor id is cut to 64 characters', async () => {
    const db = createFakePaymentsDb({ nowMs: NOW })
    const s = await seed(db)
    await convert(db, s, { p_actor_type: 'client', p_actor_id: 'x'.repeat(100) })
    const ledger = db.state.booking_payment_events.find((e) => e.kind === 'quote_deposit') as Row
    expect(ledger.actor_type).toBe('system')
    expect((ledger.actor_id as string).length).toBe(64)
    expect(db.state.quote_events.every((e) => e.actor_type === 'system')).toBe(true)
  })
})
