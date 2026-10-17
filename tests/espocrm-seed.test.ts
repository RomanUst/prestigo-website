// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 13 - owner-confirmed Account seeding (D-10, D-14) proven against the
 * in-memory fake. Synthetic data only (example.test addresses, invented company names,
 * no network, no real credential).
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { parseArgs, planSeed, runCli, runSeed } from '../infra/espocrm/seed-accounts.mjs'
import { createFakeEspoCRM } from './helpers/fake-espocrm'

const API_KEY = 'key_SECRET_abcdef0123'
const BASE = 'https://crm.example.test'

const apiKeyClient = (fake: ReturnType<typeof createFakeEspoCRM>) =>
  createEspoClient({
    config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY } }),
    fetchImpl: fake.fetchImpl as any,
  })

/** 17-hex-character record id, the shape the fake routes by. */
const hid = (n: number) => `a${n.toString(16).padStart(16, '0')}`

const candidate = (over: Record<string, unknown>) => ({
  key: 'x',
  name: 'Name',
  domain: null,
  companyNames: [],
  bookerCount: 2,
  bookingCount: 3,
  totalEur: 100,
  suggestedType: 'Other',
  confirm: false,
  type: null,
  ...over,
})

const contact = (n: number, email: string, accountId: string | null = null) => ({
  id: hid(n),
  emailAddress: email,
  accountId,
})

const exportRow = (email: string, company: string | null) => ({
  id: `row-${email}-${company}`,
  client_email: email,
  company_name: company,
})

const writes = (fake: ReturnType<typeof createFakeEspoCRM>) => fake.requests.filter((r) => r.method !== 'GET')

const CANDIDATES = [
  candidate({ key: 'domain:acme-corp.test', name: 'Acme Corp', domain: 'acme-corp.test', companyNames: ['Acme Corp'], confirm: true, type: 'Corporate' }),
  candidate({ key: 'company:tltgo', name: 'TLTGO', companyNames: ['TLTGO'], confirm: true, type: 'Agency' }),
  candidate({ key: 'domain:unsure.test', name: 'Unsure Ltd', domain: 'unsure.test', companyNames: ['Unsure Ltd'] }),
]

function newFake(records: Record<string, any[]> = {}) {
  return createFakeEspoCRM({ records })
}

describe('planSeed (pure)', () => {
  it('creates only confirmed candidates and reuses an existing Account by case-insensitive name', () => {
    const plan = planSeed({
      candidates: [
        candidate({ key: 'k1', name: 'TravelExpress', companyNames: ['TravelExpress'], confirm: true, type: 'Agency' }),
        candidate({ key: 'k2', name: 'Fresh Hotel', domain: 'fresh-hotel.test', confirm: true, type: 'Hotel' }),
        candidate({ key: 'k3', name: 'Never Confirmed', confirm: false }),
      ],
      accounts: [{ id: hid(1), name: 'travelexpress', website: null, type: 'Agency' }],
      contacts: [],
      rows: [],
    })
    expect(plan.counts.accounts).toEqual({ create: 1, existing: 1 })
    expect(plan.accountOps.find((o: any) => o.kind === 'existing')).toMatchObject({ id: hid(1), key: 'k1' })
    expect(plan.accountOps.find((o: any) => o.kind === 'create')?.payload).toEqual({
      name: 'Fresh Hotel',
      type: 'Hotel',
      website: 'https://fresh-hotel.test',
    })
  })

  it('reuses an Account that has the same website domain under another name', () => {
    const plan = planSeed({
      candidates: [candidate({ key: 'k1', name: 'Hotel Group', domain: 'hotel.test', confirm: true, type: 'Hotel' })],
      accounts: [{ id: hid(7), name: 'Different Name', website: 'https://www.hotel.test/en', type: 'Hotel' }],
      contacts: [],
      rows: [],
    })
    expect(plan.counts.accounts).toEqual({ create: 0, existing: 1 })
    expect(plan.accountOps[0]).toMatchObject({ kind: 'existing', id: hid(7) })
  })

  it('carries an Other-type note only when one was given', () => {
    const plan = planSeed({
      candidates: [
        candidate({ key: 'k1', name: 'Odd One', confirm: true, type: 'Other', note: 'Private club' }),
        candidate({ key: 'k2', name: 'Plain Other', confirm: true, type: 'Other' }),
        candidate({ key: 'k3', name: 'Typed', confirm: true, type: 'Agency', note: 'ignored' }),
      ],
      accounts: [],
      contacts: [],
      rows: [],
    })
    const byName = Object.fromEntries(plan.accountOps.map((o: any) => [o.payload.name, o.payload]))
    expect(byName['Odd One'].cOtherTypeNote).toBe('Private club')
    expect(byName['Plain Other']).not.toHaveProperty('cOtherTypeNote')
    expect(byName['Typed']).not.toHaveProperty('cOtherTypeNote')
  })

  it('links by email domain and by booking company name, skips linked and ambiguous contacts', () => {
    const plan = planSeed({
      candidates: CANDIDATES,
      accounts: [],
      contacts: [
        contact(1, 'one@acme-corp.test'), // domain match
        contact(2, 'two@acme-corp.test', hid(99)), // already has an Account
        contact(3, 'person@gmail.test'), // company match through the export
        contact(4, 'mixed@acme-corp.test'), // domain Acme + company TLTGO -> ambiguous
        contact(5, 'stranger@elsewhere.test'), // no match
        contact(6, 'sure@unsure.test'), // unconfirmed candidate only -> no match
      ],
      rows: [
        exportRow('person@gmail.test', 'tltgo'),
        exportRow('mixed@acme-corp.test', 'TLTGO'),
        exportRow('stranger@elsewhere.test', null),
      ],
    })
    expect(plan.counts.contacts).toEqual({ link: 2, already_linked: 1, ambiguous: 1 })
    const linkedIds = plan.links.map((l: any) => l.contactId).sort()
    expect(linkedIds).toEqual([hid(1), hid(3)])
    expect(plan.links.find((l: any) => l.contactId === hid(1))?.candidateKey).toBe('domain:acme-corp.test')
    expect(plan.links.find((l: any) => l.contactId === hid(3))?.candidateKey).toBe('company:tltgo')
  })

  it('creates and links nothing without confirmed candidates', () => {
    const plan = planSeed({
      candidates: [candidate({ key: 'k1', name: 'Pending', domain: 'pending.test' })],
      accounts: [],
      contacts: [contact(1, 'a@pending.test')],
      rows: [exportRow('a@pending.test', 'Pending')],
    })
    expect(plan.accountOps).toEqual([])
    expect(plan.links).toEqual([])
    expect(plan.counts.accounts).toEqual({ create: 0, existing: 0 })
    expect(plan.counts.contacts).toEqual({ link: 0, already_linked: 0, ambiguous: 0 })
  })

  it('rejects the restore-drill canary and an invalid confirmed type', () => {
    expect(() =>
      planSeed({
        candidates: [candidate({ name: 'Restore Drill Canary', confirm: true, type: 'Other' })],
        accounts: [],
        contacts: [],
        rows: [],
      }),
    ).toThrow(/canary/)
    expect(() =>
      planSeed({ candidates: [candidate({ name: 'Bad Type', confirm: true, type: 'Bank' })], accounts: [], contacts: [], rows: [] }),
    ).toThrow(/invalid type/)
  })
})

describe('runSeed against the fake', () => {
  const rows = [exportRow('person@gmail.test', 'TLTGO')]
  const seedRecords = () => ({
    Account: [
      { id: hid(500), name: 'Restore Drill Canary', type: 'Other', website: null },
      { id: hid(501), name: 'unrelated partner', type: 'Hotel', website: 'https://other.test' },
    ],
    Contact: [
      contact(1, 'one@acme-corp.test'),
      contact(2, 'two@acme-corp.test', hid(99)),
      contact(3, 'person@gmail.test'),
      contact(4, 'mixed@acme-corp.test'),
    ],
  })

  it('creates the two confirmed Accounts, links contacts, and never touches the canary', async () => {
    const fake = newFake(seedRecords())
    const lines: string[] = []
    const result = await runSeed({ client: apiKeyClient(fake), candidates: CANDIDATES, rows: [...rows, exportRow('mixed@acme-corp.test', 'TLTGO')], delayMs: 0, log: (l: string) => lines.push(l) })

    expect(result.counts.accounts).toEqual({ create: 2, existing: 0 })
    expect(result.counts.contacts).toEqual({ link: 2, already_linked: 1, ambiguous: 1 })
    expect(lines).toContain('accounts: create=2 existing=0')
    expect(lines).toContain('contacts: link=2 already_linked=1 ambiguous=1')
    expect(lines.filter((l) => /^account \S+ created$/.test(l))).toHaveLength(2)

    const accounts = fake.state.records.Account
    expect(accounts).toHaveLength(4)
    const acme = accounts.find((a: any) => a.name === 'Acme Corp')
    const tltgo = accounts.find((a: any) => a.name === 'TLTGO')
    expect(acme).toMatchObject({ type: 'Corporate', website: 'https://acme-corp.test' })
    expect(tltgo).toMatchObject({ type: 'Agency' })
    expect(tltgo).not.toHaveProperty('website')
    expect(accounts.find((a: any) => a.name === 'Unsure Ltd')).toBeUndefined()

    const byId = (id: string) => fake.state.records.Contact.find((c: any) => c.id === id)
    expect(byId(hid(1)).accountId).toBe(acme.id)
    expect(byId(hid(3)).accountId).toBe(tltgo.id)
    expect(byId(hid(2)).accountId).toBe(hid(99))
    expect(byId(hid(4)).accountId).toBeNull()

    // Only POST /Account and PUT /Contact/{id}: no Account PUT/DELETE, nothing else.
    for (const w of writes(fake)) {
      expect(`${w.method} ${w.path.replace(/\/a[0-9a-f]{16}$/, '/:id')}`).toMatch(/^(POST \/Account|PUT \/Contact\/:id)$/)
    }
    expect(fake.state.records.Account.filter((a: any) => a.name === 'Restore Drill Canary')).toHaveLength(1)
    expect(fake.state.records.Account.find((a: any) => a.id === hid(500))).toEqual({ id: hid(500), name: 'Restore Drill Canary', type: 'Other', website: null })
  })

  it('second run is a no-op: create=0 and link=0', async () => {
    const fake = newFake(seedRecords())
    const client = apiKeyClient(fake)
    const allRows = [...rows, exportRow('mixed@acme-corp.test', 'TLTGO')]
    await runSeed({ client, candidates: CANDIDATES, rows: allRows, delayMs: 0, log: () => {} })
    const before = writes(fake).length
    const lines: string[] = []
    await runSeed({ client, candidates: CANDIDATES, rows: allRows, delayMs: 0, log: (l: string) => lines.push(l) })
    expect(lines).toContain('accounts: create=0 existing=2')
    expect(lines).toContain('contacts: link=0 already_linked=3 ambiguous=1')
    expect(lines.filter((l) => /^account \S+ existing$/.test(l))).toHaveLength(2)
    expect(writes(fake).length).toBe(before)
  })

  it('reuses an existing lower-case Account without modifying it', async () => {
    const fake = newFake({
      Account: [{ id: hid(600), name: 'tltgo', type: 'Agency', website: null, cMarker: 'keep' }],
      Contact: [contact(3, 'person@gmail.test')],
    })
    const lines: string[] = []
    await runSeed({ client: apiKeyClient(fake), candidates: CANDIDATES, rows, delayMs: 0, log: (l: string) => lines.push(l) })
    expect(lines).toContain('accounts: create=1 existing=1')
    expect(fake.state.records.Account.find((a: any) => a.id === hid(600))).toEqual({ id: hid(600), name: 'tltgo', type: 'Agency', website: null, cMarker: 'keep' })
    expect(writes(fake).some((w) => w.path === `/Account/${hid(600)}`)).toBe(false)
    expect((fake.state.records.Contact[0] as any).accountId).toBe(hid(600))
  })

  it('zero confirmed candidates writes nothing', async () => {
    const fake = newFake(seedRecords())
    const lines: string[] = []
    await runSeed({
      client: apiKeyClient(fake),
      candidates: [candidate({ key: 'k', name: 'Pending', domain: 'acme-corp.test' })],
      rows,
      delayMs: 0,
      log: (l: string) => lines.push(l),
    })
    expect(writes(fake)).toEqual([])
    expect(lines).toContain('accounts: create=0 existing=0')
    expect(lines).toContain('contacts: link=0 already_linked=0 ambiguous=0')
  })

  it('--dry-run sends only GET and prints no email or name', async () => {
    const fake = newFake(seedRecords())
    const lines: string[] = []
    await runSeed({ client: apiKeyClient(fake), candidates: CANDIDATES, rows, dryRun: true, delayMs: 0, log: (l: string) => lines.push(l) })
    expect(writes(fake)).toEqual([])
    expect(fake.state.records.Account).toHaveLength(2)
    const text = lines.join('\n')
    expect(text).not.toMatch(/example|\.test|@/)
    expect(text).not.toMatch(/Acme|TLTGO|Unsure/)
    expect(text).toContain('accounts: create=2 existing=0')
    expect(text).toContain('dry-run: nothing written')
  })
})

describe('CLI', () => {
  const tmpFiles = (candidates: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-test-'))
    mkdirSync(join(dir, 'export'))
    writeFileSync(
      join(dir, 'export', 'page-01.json'),
      JSON.stringify([
        { id: 'r1', status: 'confirmed', booking_source: 'online', client_email: 'person@gmail.test', company_name: 'TLTGO' },
      ]),
    )
    const file = join(dir, 'candidates.json')
    writeFileSync(file, JSON.stringify({ generatedAt: 'x', candidates }))
    return { input: join(dir, 'export'), file }
  }

  it('parseArgs reads the documented flags', () => {
    expect(parseArgs(['--dry-run', '--candidates', 'c.json', '--input', 'e'])).toMatchObject({ dryRun: true, candidates: 'c.json', input: 'e' })
    expect(parseArgs(['--candidates=c.json', '--input=e'])).toMatchObject({ dryRun: false, candidates: 'c.json', input: 'e' })
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/)
  })

  it('exits 1 before any write when the canary is confirmed', async () => {
    const fake = newFake({ Account: [], Contact: [contact(3, 'person@gmail.test')] })
    const { input, file } = tmpFiles([candidate({ key: 'k', name: 'Restore Drill Canary', confirm: true, type: 'Other' })])
    const errors: string[] = []
    const code = await runCli(['--candidates', file, '--input', input], { client: apiKeyClient(fake), log: () => {}, error: (l: string) => errors.push(l) })
    expect(code).toBe(1)
    expect(fake.requests).toEqual([])
    expect(errors.join('\n')).toMatch(/canary/)
  })

  it('exits 1 when the candidates file is missing', async () => {
    const fake = newFake()
    const code = await runCli(['--candidates', '/nonexistent/candidates.json', '--input', '/nonexistent/export'], { client: apiKeyClient(fake), log: () => {}, error: () => {} })
    expect(code).toBe(1)
    expect(fake.requests).toEqual([])
  })

  it('runs end to end from files and exits 0', async () => {
    const fake = newFake({ Account: [], Contact: [contact(3, 'person@gmail.test')] })
    const { input, file } = tmpFiles(CANDIDATES)
    const lines: string[] = []
    const code = await runCli(['--candidates', file, '--input', input, '--delay-ms', '0'], { client: apiKeyClient(fake), log: (l: string) => lines.push(l), error: () => {} })
    expect(code).toBe(0)
    expect(lines).toContain('accounts: create=2 existing=0')
    expect(lines).toContain('contacts: link=1 already_linked=0 ambiguous=0')
  })

  it('maps an API failure to exit 2', async () => {
    const fake = createFakeEspoCRM({ apiKeys: { other_key_0123456789: 'someone' } })
    const { input, file } = tmpFiles(CANDIDATES)
    const errors: string[] = []
    const code = await runCli(['--candidates', file, '--input', input], { client: apiKeyClient(fake), log: () => {}, error: (l: string) => errors.push(l) })
    expect(code).toBe(2)
    expect(errors.join('\n')).toMatch(/API error: GET \/Account -> 401/)
  })
})

describe('WR-01: two confirmed candidates that resolve to one Account', () => {
  const twins = [
    candidate({ key: 'domain:hotel-one.test', name: 'Grand Hotel', domain: 'hotel-one.test', companyNames: ['Grand Hotel'], confirm: true, type: 'Hotel' }),
    candidate({ key: 'domain:hotel-two.test', name: 'grand hotel', domain: 'hotel-two.test', companyNames: [], confirm: true, type: 'Hotel' }),
  ]
  const twinContacts = [
    contact(1, 'a@hotel-one.test'), // first candidate only
    contact(2, 'b@hotel-two.test'), // second candidate only
    contact(3, 'both@hotel-one.test'), // first by domain, second through the booking company name
  ]
  const twinRows = [exportRow('both@hotel-one.test', 'grand hotel')]

  it('plans one create and one alias, and does not call a contact on both candidates ambiguous', () => {
    const plan = planSeed({ candidates: twins, accounts: [], contacts: twinContacts, rows: twinRows })
    expect(plan.accountOps.map((o: any) => o.kind)).toEqual(['create', 'alias'])
    expect(plan.accountOps[1]).toMatchObject({ key: 'domain:hotel-two.test', of: 'domain:hotel-one.test' })
    expect(plan.counts.accounts).toEqual({ create: 1, existing: 0, merged: 1 })
    expect(plan.counts.contacts).toEqual({ link: 3, already_linked: 0, ambiguous: 0 })
  })

  it('links every contact to the created Account id, never to null', async () => {
    const fake = newFake({ Account: [], Contact: twinContacts })
    const lines: string[] = []
    await runSeed({ client: apiKeyClient(fake), candidates: twins, rows: twinRows, delayMs: 0, log: (l: string) => lines.push(l) })

    expect(fake.state.records.Account).toHaveLength(1)
    const accountId = fake.state.records.Account[0].id
    const contactWrites = writes(fake).filter((r) => r.path.startsWith('/Contact/'))
    expect(contactWrites).toHaveLength(3)
    for (const w of contactWrites) expect(w.body).toEqual({ accountId })
    expect(fake.state.records.Contact.map((c: any) => c.accountId)).toEqual([accountId, accountId, accountId])
    expect(lines).toContain('accounts: create=1 existing=0 merged=1')
    expect(lines.join('\n')).not.toMatch(/\bnull\b/)
  })

  it('a second run converges: nothing to create or link', async () => {
    const fake = newFake({ Account: [], Contact: twinContacts })
    await runSeed({ client: apiKeyClient(fake), candidates: twins, rows: twinRows, delayMs: 0, log: () => {} })
    const before = writes(fake).length
    const lines: string[] = []
    await runSeed({ client: apiKeyClient(fake), candidates: twins, rows: twinRows, delayMs: 0, log: (l: string) => lines.push(l) })
    expect(writes(fake).length).toBe(before)
    expect(lines).toContain('accounts: create=0 existing=2')
    expect(lines).toContain('contacts: link=0 already_linked=3 ambiguous=0')
  })

  it('dry-run prints no null id and writes nothing', async () => {
    const fake = newFake({ Account: [], Contact: twinContacts })
    const lines: string[] = []
    await runSeed({ client: apiKeyClient(fake), candidates: twins, rows: twinRows, dryRun: true, delayMs: 0, log: (l: string) => lines.push(l) })
    expect(writes(fake)).toEqual([])
    expect(lines.join('\n')).not.toMatch(/\bnull\b/)
  })
})

describe('IN-08: free-mail domains and blank names in a confirmed candidate', () => {
  it('does not write a free-mail domain as the website or use it to match an Account', () => {
    const plan = planSeed({
      candidates: [candidate({ key: 'k1', name: 'Private Person Co', domain: 'gmail.com', confirm: true, type: 'Other' })],
      accounts: [{ id: hid(5), name: 'Someone Else', website: 'https://gmail.com', type: 'Other' }],
      contacts: [],
      rows: [],
    })
    expect(plan.counts.accounts).toEqual({ create: 1, existing: 0 })
    expect(plan.accountOps[0].payload).not.toHaveProperty('website')
  })

  it('refuses a blank-name or string-confirm candidate before any request', async () => {
    const fake = newFake()
    await expect(
      runSeed({ client: apiKeyClient(fake), candidates: [candidate({ key: 'k', name: '  ', confirm: true, type: 'Other' })], delayMs: 0, log: () => {} }),
    ).rejects.toThrow(/blank name/)
    await expect(
      runSeed({ client: apiKeyClient(fake), candidates: [candidate({ key: 'k', name: 'Real', confirm: 'yes', type: 'Other' })], delayMs: 0, log: () => {} }),
    ).rejects.toThrow(/non-boolean confirm/)
    expect(fake.requests).toEqual([])
  })
})
