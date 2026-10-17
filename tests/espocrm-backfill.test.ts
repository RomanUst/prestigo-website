// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 09 - booking backfill (D-06, D-07, D-10, D-21) proven against the
 * in-memory fake. Synthetic data only (example.test emails, fake names, no network,
 * no real credential).
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import {
  loadExport,
  parseArgs,
  planBackfill,
  runAudit,
  runBackfill,
  runCli,
  runRelink,
} from '../infra/espocrm/backfill.mjs'
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

// ---------------------------------------------------------------------------
// Task 2: write path
// ---------------------------------------------------------------------------

const run = async (
  fake: ReturnType<typeof createFakeEspoCRM>,
  dir: string,
  opts: Record<string, unknown> = {},
) => {
  const lines: string[] = []
  const result = await runBackfill({
    client: apiKeyClient(fake),
    input: dir,
    delayMs: 0,
    log: (l: string) => lines.push(l),
    ...opts,
  })
  return { lines, text: lines.join('\n'), result }
}

const piiOf = (rows: Record<string, any>[]) =>
  rows.flatMap((r) => [r.client_email, r.client_first_name, r.client_last_name, r.client_phone].filter(Boolean) as string[])

describe('runBackfill write path', () => {
  it('run 1 creates contacts and bookings (linked); run 2 reports create=0 update=0', async () => {
    const rows = [row(), row(), row({ client_email: 'Shared@Example.test' }), row({ client_email: 'shared@example.test' })]
    const dir = writePages([rows])
    const fake = createFakeEspoCRM()
    const first = await run(fake, dir)
    expect(first.text).toMatch(/^contacts: create=3 update=0 unchanged=0$/m)
    expect(first.text).toMatch(/^bookings: create=4 update=0 unchanged=0 without_contact=0$/m)
    expect(fake.state.records.Contact).toHaveLength(3)
    expect(fake.state.records.CBooking).toHaveLength(4)
    for (const b of fake.state.records.CBooking) {
      expect(fake.state.records.Contact.some((c: any) => c.id === b.contactId)).toBe(true)
    }
    const second = await run(fake, dir)
    expect(second.text).toMatch(/^contacts: create=0 update=0 unchanged=3$/m)
    expect(second.text).toMatch(/^bookings: create=0 update=0 unchanged=4 without_contact=0$/m)
    expect(fake.state.records.Contact).toHaveLength(3)
    expect(fake.state.records.CBooking).toHaveLength(4)
  })

  it('keeps owner-edited Contact fields, fills an empty phone, copies accountId onto bookings', async () => {
    const r = row({ client_email: 'Owner@Example.test', client_phone: '+420711111111' })
    const dir = writePages([[r, row({ client_email: 'owner@example.test' })]])
    const fake = createFakeEspoCRM({
      records: {
        Contact: [
          {
            id: 'a00000000000000c1',
            emailAddress: 'owner@example.test',
            firstName: 'Owner',
            lastName: 'Owner-Edited',
            accountId: 'acc1',
            phoneNumber: '',
          },
        ],
      },
    })
    const out = await run(fake, dir)
    expect(out.text).toMatch(/^contacts: create=0 update=1 unchanged=0$/m)
    const contact = fake.state.records.Contact[0]
    expect(contact.accountId).toBe('acc1')
    expect(contact.lastName).toBe('Owner-Edited')
    expect(contact.firstName).toBe('Owner')
    expect(contact.phoneNumber).toBe('+420711111111')
    expect(fake.state.records.CBooking).toHaveLength(2)
    for (const b of fake.state.records.CBooking) {
      expect(b.contactId).toBe('a00000000000000c1')
      expect(b.accountId).toBe('acc1')
    }
    // A non-empty phone is never overwritten.
    const dir2 = writePages([[row({ client_email: 'owner@example.test', client_phone: '+420722222222' })]])
    const again = await run(fake, dir2)
    expect(again.text).toMatch(/^contacts: create=0 update=0 unchanged=1$/m)
    expect(fake.state.records.Contact[0].phoneNumber).toBe('+420711111111')
  })

  it('resolves a 409 on Contact create by looking the Contact up (no skip-duplicate header, one POST)', async () => {
    const r = row({ client_email: 'dup@example.test' })
    const dir = writePages([[r]])
    const fake = createFakeEspoCRM({
      duplicateCheck: { Contact: 'emailAddress' },
      records: { Contact: [{ id: 'a00000000000000c2', emailAddress: 'dup@example.test', lastName: 'Existing', accountId: 'accD' }] },
      // The preload list is hidden once so the Contact looks missing and the POST hits the duplicate check.
      extraRoutes: (req) =>
        req.method === 'GET' && req.path === '/Contact' && !req.query.includes('where')
          ? new Response(JSON.stringify({ total: 0, list: [] }), { status: 200 })
          : undefined,
    })
    await run(fake, dir)
    const posts = fake.requests.filter((q) => q.method === 'POST' && q.path === '/Contact')
    expect(posts).toHaveLength(1)
    expect(fake.requests.every((q) => !('x-skip-duplicate-check' in q.headers))).toBe(true)
    expect(fake.state.records.Contact).toHaveLength(1)
    expect(fake.state.records.CBooking).toHaveLength(1)
    expect(fake.state.records.CBooking[0].contactId).toBe('a00000000000000c2')
    expect(fake.state.records.CBooking[0].accountId).toBe('accD')
  })

  it('450 bookings over 3 pages and a shuffled copy give the same plan; the second run is a no-op (paging > 200)', async () => {
    const rows = Array.from({ length: 450 }, () => row())
    const pages = [rows.slice(0, 150), rows.slice(150, 300), rows.slice(300)]
    const shuffled = [...rows].reverse().sort((a, b) => (a.id.charCodeAt(30) % 7) - (b.id.charCodeAt(30) % 7))
    const shuffledPages = [shuffled.slice(0, 200), shuffled.slice(200)]
    const a = await run(createFakeEspoCRM(), writePages(pages), { dryRun: true })
    const b = await run(createFakeEspoCRM(), writePages(shuffledPages), { dryRun: true })
    expect(a.text).toBe(b.text)
    expect(a.text).toMatch(/^bookings: create=450 /m)

    const fake = createFakeEspoCRM()
    await run(fake, writePages(pages))
    expect(fake.state.records.CBooking).toHaveLength(450)
    const second = await run(fake, writePages(shuffledPages))
    expect(second.text).toMatch(/^contacts: create=0 update=0 unchanged=450$/m)
    expect(second.text).toMatch(/^bookings: create=0 update=0 unchanged=450 /m)
    expect(fake.state.records.CBooking).toHaveLength(450)
  }, 60_000)

  it('a changed status in the export yields bookings: update=1', async () => {
    const rows = [row(), row()]
    const fake = createFakeEspoCRM()
    await run(fake, writePages([rows]))
    const changed = [{ ...rows[0], status: 'completed' }, rows[1]]
    const out = await run(fake, writePages([changed]))
    expect(out.text).toMatch(/^bookings: create=0 update=1 unchanged=1 /m)
    expect(fake.state.records.CBooking.filter((b: any) => b.status === 'completed')).toHaveLength(1)
  })

  it('--limit 1 writes exactly one booking and its contact', async () => {
    const dir = writePages([[row(), row(), row()]])
    const fake = createFakeEspoCRM()
    await run(fake, dir, { limit: 1 })
    expect(fake.state.records.CBooking).toHaveLength(1)
    expect(fake.state.records.Contact).toHaveLength(1)
  })

  it('a booking without a usable email is created without a contact', async () => {
    const dir = writePages([[row({ client_email: '' })]])
    const fake = createFakeEspoCRM()
    const out = await run(fake, dir)
    expect(out.text).toMatch(/^bookings: create=1 update=0 unchanged=0 without_contact=1$/m)
    expect(fake.state.records.CBooking[0].contactId ?? null).toBeNull()
    expect(fake.state.records.Contact ?? []).toHaveLength(0)
  })
})

describe('runRelink', () => {
  it('re-copies accountId only where it drifted, then is a no-op', async () => {
    const shared = 'Shared@Example.test'
    const rows = [row({ client_email: shared }), row({ client_email: shared.toLowerCase() }), row()]
    const fake = createFakeEspoCRM()
    await run(fake, writePages([rows]))
    const contact = fake.state.records.Contact.find((c: any) => c.emailAddress === shared.toLowerCase())
    contact.accountId = 'accNew'
    const lines: string[] = []
    const first = await runRelink({ client: apiKeyClient(fake), delayMs: 0, log: (l: string) => lines.push(l) })
    expect(first).toEqual({ update: 2, unchanged: 1 })
    expect(lines.join('\n')).toMatch(/^relink: update=2 unchanged=1$/m)
    expect(fake.state.records.CBooking.filter((b: any) => b.accountId === 'accNew')).toHaveLength(2)
    const second = await runRelink({ client: apiKeyClient(fake), delayMs: 0, log: () => {} })
    expect(second).toEqual({ update: 0, unchanged: 3 })
  })

  it('--dry-run relink writes nothing', async () => {
    const fake = createFakeEspoCRM()
    await run(fake, writePages([[row()]]))
    fake.state.records.Contact[0].accountId = 'accZ'
    const before = fake.requests.length
    const out = await runRelink({ client: apiKeyClient(fake), dryRun: true, delayMs: 0, log: () => {} })
    expect(out.update).toBe(1)
    expect(fake.requests.slice(before).every((q) => q.method === 'GET')).toBe(true)
    expect(fake.state.records.CBooking[0].accountId ?? null).toBeNull()
  })
})

describe('runAudit', () => {
  it('lists duplicate supabaseBookingId groups and exits 3', async () => {
    const fake = createFakeEspoCRM({
      records: {
        CBooking: [
          { id: 'a00000000000000b1', supabaseBookingId: 'sb-dup', name: 'X' },
          { id: 'a00000000000000b2', supabaseBookingId: 'sb-dup', name: 'X' },
          { id: 'a00000000000000b3', supabaseBookingId: 'sb-ok', name: 'Y' },
        ],
      },
    })
    const lines: string[] = []
    const code = await runCli(['--audit'], { client: apiKeyClient(fake), log: (l: string) => lines.push(l), error: () => {} })
    expect(code).toBe(3)
    const text = lines.join('\n')
    expect(text).toMatch(/^audit: records=3 duplicates=1$/m)
    expect(text).toContain('sb-dup')
    expect(text).toContain('a00000000000000b1')
    expect(text).toContain('a00000000000000b2')
    expect(text).not.toContain('a00000000000000b3')
  })

  it('prints duplicates=0 and exits 0 on a clean fake', async () => {
    const fake = createFakeEspoCRM({
      records: { CBooking: [{ id: 'a00000000000000b1', supabaseBookingId: 'sb-1' }, { id: 'a00000000000000b2', supabaseBookingId: 'sb-2' }] },
    })
    const lines: string[] = []
    const audit = await runAudit({ client: apiKeyClient(fake), log: (l: string) => lines.push(l) })
    expect(audit.duplicates).toBe(0)
    expect(lines.join('\n')).toMatch(/^audit: records=2 duplicates=0$/m)
    expect(await runCli(['--audit'], { client: apiKeyClient(fake), log: () => {}, error: () => {} })).toBe(0)
  })
})

describe('parseArgs and runCli', () => {
  it('parses every flag', () => {
    expect(parseArgs(['--dry-run', '--input', '/x', '--limit', '5', '--delay-ms=10', '--relink', '--audit'])).toMatchObject({
      dryRun: true,
      input: '/x',
      limit: 5,
      delayMs: 10,
      relink: true,
      audit: true,
    })
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/)
    expect(() => parseArgs(['--limit', 'abc'])).toThrow(/--limit/)
  })

  it('a missing input path exits 1 and names only the path', async () => {
    const errors: string[] = []
    const code = await runCli(['--input', '/nonexistent/export-dir', '--dry-run'], {
      client: apiKeyClient(createFakeEspoCRM()),
      log: () => {},
      error: (l: string) => errors.push(l),
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toBe('Config error: Export input not found: /nonexistent/export-dir')
  })

  it('the source never sends the duplicate-check bypass header', () => {
    const src = readFileSync(join(__dirname, '..', 'infra/espocrm/backfill.mjs'), 'utf8')
    expect(src.toLowerCase()).not.toContain('skip-duplicate-check')
  })
})

describe('PII-free logs', () => {
  it('no run, dry-run, relink, audit or API-error output contains an email, name or phone', async () => {
    const rows = [row(), row(), row({ client_email: 'Dup@Example.test' })]
    const pii = piiOf(rows).concat(['dup@example.test'])
    const out: string[] = []
    const log = (l: string) => out.push(l)
    const err = (l: string) => out.push(l)

    const dir = writePages([rows])
    await run(createFakeEspoCRM(), dir, { dryRun: true, log })
    const fake = createFakeEspoCRM()
    await run(fake, dir, { log })
    await runRelink({ client: apiKeyClient(fake), delayMs: 0, log })
    await runAudit({ client: apiKeyClient(fake), log })

    // API failure on the Contact lookup (the URL carries an email address).
    const failing = createFakeEspoCRM({
      duplicateCheck: { Contact: 'emailAddress' },
      records: { Contact: [{ id: 'a00000000000000c3', emailAddress: 'dup@example.test', lastName: 'Zed' }] },
      extraRoutes: (req) => {
        if (req.method === 'GET' && req.path === '/Contact') {
          return req.query.includes('where')
            ? new Response('boom dup@example.test', { status: 500 })
            : new Response(JSON.stringify({ total: 0, list: [] }), { status: 200 })
        }
        return undefined
      },
    })
    const code = await runCli(['--input', dir, '--delay-ms', '0'], { client: apiKeyClient(failing), log, error: err })
    expect(code).toBe(2)

    const blob = out.join('\n')
    expect(blob.length).toBeGreaterThan(0)
    for (const value of pii) expect(blob.toLowerCase()).not.toContain(value.toLowerCase())
  })
})

describe('phone normalisation and rejected-phone retry', () => {
  it('contact_phones line counts kept / prefixed / omitted; omitted Contacts are created without a phone', async () => {
    const rows = [
      row({ client_phone: '+420700000001' }),
      row({ client_phone: '700000002' }),
      row({ client_phone: '7000000003' }),
      row({ client_phone: '' }),
    ]
    const dir = writePages([rows])
    const fake = createFakeEspoCRM()
    const { text } = await run(fake, dir)
    expect(text).toMatch(/^contact_phones: kept=1 prefixed=1 omitted=2$/m)
    const phones = (fake.state.records.Contact ?? []).map((c: any) => c.phoneNumber ?? '').sort()
    expect(phones).toEqual(['', '', '+420700000001', '+420700000002'])
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/Contact')
    expect(posts.filter((r) => 'phoneNumber' in ((r.body as any) ?? {}))).toHaveLength(2)
  })

  it('a Contact whose normalised phone is still rejected (400) is retried once without it (phone_dropped)', async () => {
    const rows = [row({ client_phone: '+420700000011' }), row({ client_phone: '+420700000012' })]
    const dir = writePages([rows])
    const fake = createFakeEspoCRM({
      extraRoutes: (req: any) => {
        if (req.method === 'POST' && req.path === '/Contact' && req.body?.phoneNumber === '+420700000011') {
          return new Response('', { status: 400 })
        }
        return undefined
      },
    })
    const { text } = await run(fake, dir)
    expect(text).toMatch(/^contacts: phone_dropped=1$/m)
    expect(text).toMatch(/^applied: contacts=2 bookings=2$/m)
    expect(fake.state.records.Contact).toHaveLength(2)
    expect(fake.state.records.CBooking).toHaveLength(2)
    const posts = fake.requests.filter((r) => r.method === 'POST' && r.path === '/Contact')
    expect(posts).toHaveLength(3) // 1 rejected + 1 retry without phone + 1 normal
  })

  it('a 400 that persists without the phone still fails the run', async () => {
    const dir = writePages([[row()]])
    const fake = createFakeEspoCRM({
      extraRoutes: (req: any) =>
        req.method === 'POST' && req.path === '/Contact' ? new Response('', { status: 400 }) : undefined,
    })
    await expect(run(fake, dir)).rejects.toThrow()
  })
})
