// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 09 - booking backfill (D-06, D-07, D-10, D-21) proven against the
 * in-memory fake. Synthetic data only (example.test emails, fake names, no network,
 * no real credential).
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { loadExport, planBackfill, runBackfill } from '../infra/espocrm/backfill.mjs'
import { createFakeEspoCRM } from './helpers/fake-espocrm'

const API_KEY = 'key_SECRET_abcdef0123'
const BASE = 'https://crm.example.test'

const apiKeyClient = (fake: ReturnType<typeof createFakeEspoCRM>) =>
  createEspoClient({
    config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY } }),
    fetchImpl: fake.fetchImpl as any,
  })

let seq = 0
/** Synthetic export row; every override is explicit. */
function row(over: Record<string, unknown> = {}): Record<string, any> {
  seq++
  const n = String(seq).padStart(4, '0')
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    booking_reference: `PRG-20260101-${n}`,
    status: 'confirmed',
    booking_source: 'online',
    leg: null,
    trip_type: 'transfer',
    vehicle_class: 'business',
    pickup_utc: '2026-03-15T08:30:00+00:00',
    pickup_date: '2026-03-15',
    pickup_time: '09:30',
    origin_address: 'Test Airport',
    destination_address: 'Test Hotel',
    amount_eur: 100 + seq,
    amount_czk: null,
    client_first_name: `First${n}`,
    client_last_name: `Last${n}`,
    client_email: `person${n}@example.test`,
    client_phone: `+4207000${n}`,
    flight_number: null,
    payment_intent_id: `pi_test_${n}`,
    payment_link_id: null,
    invoice_number: null,
    paid_at: null,
    attempt_id: null,
    user_id: null,
    created_at: `2026-01-01T00:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}+00:00`,
    driver_name: null,
    company_name: null,
    account_type: null,
    ...over,
  }
}

function writePages(pages: unknown[][]): string {
  const dir = mkdtempSync(join(tmpdir(), 'backfill-test-'))
  mkdirSync(join(dir, 'export'))
  pages.forEach((page, i) => {
    writeFileSync(join(dir, 'export', `page-${String(i + 1).padStart(2, '0')}.json`), JSON.stringify(page))
  })
  return join(dir, 'export')
}

describe('loadExport', () => {
  it('reads a directory of page files, de-duplicates by id and drops abandoned checkouts', () => {
    const a = row()
    const b = row()
    const c = row()
    const abandoned = row({ status: 'unpaid', booking_source: null, payment_link_id: null, payment_intent_id: 'pi_x' })
    const dir = writePages([[a, b], [b, c, abandoned]])
    const out = loadExport(dir)
    expect(out.rows.map((r: any) => r.id).sort()).toEqual([a.id, b.id, c.id].sort())
    expect(out.counts.duplicate_rows).toBe(1)
    expect(out.counts.excluded_abandoned).toBe(1)
    expect(out.counts.rows).toBe(4)
  })

  it('accepts a single .json file', () => {
    const a = row()
    const dir = mkdtempSync(join(tmpdir(), 'backfill-test-'))
    const file = join(dir, 'one.json')
    writeFileSync(file, JSON.stringify([a]))
    expect(loadExport(file).rows).toHaveLength(1)
  })

  it('names only the path when the input is missing', () => {
    expect(() => loadExport('/nonexistent/backfill-input')).toThrow(/\/nonexistent\/backfill-input/)
  })
})

describe('planBackfill', () => {
  it('3 eligible rows sharing one email in different case: contacts create=1, bookings create=3', () => {
    const rows = [
      row({ client_email: 'Shared.Person@Example.test' }),
      row({ client_email: ' shared.person@example.test ' }),
      row({ client_email: 'SHARED.PERSON@EXAMPLE.TEST' }),
    ]
    const plan = planBackfill({ rows, contacts: [], bookings: [] })
    expect(plan.counts.contacts).toEqual({ create: 1, update: 0, unchanged: 0 })
    expect(plan.counts.bookings.create).toBe(3)
    expect(plan.counts.bookings.update).toBe(0)
  })

  it('two distinct normalized emails among 3 rows give 2 contacts', () => {
    const rows = [row({ client_email: 'A.B@Example.test' }), row({ client_email: 'a.b@example.test' }), row()]
    const plan = planBackfill({ rows, contacts: [], bookings: [] })
    expect(plan.counts.contacts.create).toBe(2)
    expect(plan.counts.bookings.create).toBe(3)
  })

  it('maps counts per status / source / payment method and counts invalid rows', () => {
    const rows = [
      row({ status: 'completed' }),
      row({ status: 'pending', payment_intent_id: null, payment_link_id: null }),
      row({ booking_source: 'manual', payment_intent_id: null }),
      row({ status: 'weird_status' }),
    ]
    const plan = planBackfill({ rows, contacts: [], bookings: [] })
    expect(plan.counts.invalid).toBe(1)
    expect(plan.counts.byStatus).toEqual({ completed: 1, pending: 1, confirmed: 1 })
    expect(plan.counts.bySource).toEqual({ online: 2, manual: 1 })
    expect(plan.counts.byPaymentMethod).toEqual({ Stripe: 1, Invoice: 0, Cash: 1, Other: 1 })
  })
})

describe('runBackfill --dry-run', () => {
  it('sends only GET requests and prints the count lines', async () => {
    const rows = [row(), row(), row({ client_email: 'not-an-email' })]
    const dir = writePages([rows])
    const fake = createFakeEspoCRM()
    const lines: string[] = []
    const result = await runBackfill({
      client: apiKeyClient(fake),
      input: dir,
      dryRun: true,
      delayMs: 0,
      log: (l: string) => lines.push(l),
    })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    const text = lines.join('\n')
    expect(text).toMatch(/^export: rows=3 eligible=3 excluded_abandoned=0 invalid=0 duplicate_rows=0$/m)
    expect(text).toMatch(/^by_status: confirmed=3$/m)
    expect(text).toMatch(/^by_source: online=3$/m)
    expect(text).toMatch(/^by_payment_method: Stripe=3 Invoice=0 Cash=0 Other=0$/m)
    expect(text).toMatch(/^contacts: create=2 update=0 unchanged=0$/m)
    expect(text).toMatch(/^bookings: create=3 update=0 unchanged=0 without_contact=1$/m)
    expect(result.counts.bookings.create).toBe(3)
    expect(fake.state.records.CBooking ?? []).toHaveLength(0)
  })
})
