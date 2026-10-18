// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 05 - merge-safe enum sync (D-01 Opportunity stages, D-02 Account
 * types, D-20 retire-when-unused). mergeEnumOptions is pure; the `enums` resource is
 * proven against the in-memory fake. No test here makes a network call or reads a
 * real credential.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { ACCOUNT_TYPE_VALUES } from '../infra/espocrm/lib/candidates.mjs'
import { mergeEnumOptions } from '../infra/espocrm/lib/enum-merge.mjs'
import { RESOURCE_ORDER, runSync } from '../infra/espocrm/sync.mjs'
import { createFakeEspoCRM, stockEspoMetadata } from './helpers/fake-espocrm'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://crm.example.test'

type Fake = ReturnType<typeof createFakeEspoCRM>

const adminClient = (fake: Fake) =>
  createEspoClient({
    config: loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'prestigo-config', ESPOCRM_ADMIN_PASSWORD: 'pw_SECRET_0123456789' },
    }),
    fetchImpl: fake.fetchImpl as any,
  })

const realEnums = () => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm/enums.json'), 'utf8'))

function configDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'espocrm-enums-'))
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(data))
  return dir
}

async function sync(fake: Fake, dir: string, opts: { dryRun?: boolean } = {}) {
  const lines: string[] = []
  await runSync({ client: adminClient(fake), configDir: dir, only: ['enums'], log: (l) => lines.push(l), ...opts })
  return lines
}

const fresh = (records: Record<string, any[]> = {}) => createFakeEspoCRM({ metadata: stockEspoMetadata(), records })
const mutations = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET')
const stageField = (fake: Fake) => fake.state.metadata.entityDefs.Opportunity.fields.stage
const typeField = (fake: Fake) => fake.state.metadata.entityDefs.Account.fields.type
const stageLabels = (fake: Fake) => fake.state.i18n['Opportunity.stage']?.translatedOptions
const typeLabels = (fake: Fake) => fake.state.i18n['Account.type']?.translatedOptions

const STAGES = [
  { value: 'New', label: 'New' },
  { value: 'First Contact', label: 'First contact' },
  { value: 'Meeting', label: 'Meeting / call' },
  { value: 'Rate Sent', label: 'Rate sent' },
  { value: 'Trial Ride', label: 'Trial ride' },
  { value: 'Closed Won', label: 'Partner (Won)' },
  { value: 'Closed Lost', label: 'Lost' },
]
const STOCK_STAGES = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']
const STOCK_STAGE_LABELS = Object.fromEntries(STOCK_STAGES.map((v) => [v, v]))
const STAGE_RETIRE = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation']

describe('mergeEnumOptions (pure)', () => {
  const base = { desired: STAGES, current: STOCK_STAGES, currentLabels: STOCK_STAGE_LABELS, retire: STAGE_RETIRE, inUse: new Set<string>() }

  it('returns the 7 D-01 stages first, drops unused stock stages, relabels Closed Won / Closed Lost', () => {
    const out = mergeEnumOptions(base)
    expect(out.options).toEqual(STAGES.map((s) => s.value))
    expect(out.removed).toEqual(STAGE_RETIRE)
    expect(out.translatedOptions['Closed Won']).toBe('Partner (Won)')
    expect(out.translatedOptions['Closed Lost']).toBe('Lost')
    expect(out.translatedOptions['First Contact']).toBe('First contact')
  })

  it('keeps an in-use stock stage after the desired values', () => {
    const out = mergeEnumOptions({ ...base, inUse: new Set(['Prospecting']) })
    expect(out.options).toEqual([...STAGES.map((s) => s.value), 'Prospecting'])
    expect(out.removed).toEqual(['Qualification', 'Proposal', 'Negotiation'])
  })

  it('is stable: feeding the output back as current changes nothing', () => {
    const once = mergeEnumOptions({ ...base, inUse: new Set(['Prospecting']) })
    const twice = mergeEnumOptions({ ...base, inUse: new Set(['Prospecting']), current: once.options, currentLabels: once.translatedOptions })
    expect(twice.options).toEqual(once.options)
    expect(twice.translatedOptions).toEqual(once.translatedOptions)
    expect(twice.removed).toEqual([])
  })

  it('keeps an owner rename (label differs from both the value and the desired label)', () => {
    const out = mergeEnumOptions({
      ...base,
      current: ['New', 'Trial Ride', 'Closed Won', 'Closed Lost'],
      currentLabels: { New: 'New', 'Trial Ride': 'Test drive', 'Closed Won': 'Closed Won', 'Closed Lost': 'Closed Lost' },
    })
    expect(out.translatedOptions['Trial Ride']).toBe('Test drive')
    expect(out.translatedOptions['Closed Won']).toBe('Partner (Won)')
  })

  it('keeps owner-added values after the desired ones, in their original order', () => {
    const out = mergeEnumOptions({
      ...base,
      current: ['Airline', ...STOCK_STAGES, 'Charter'],
      currentLabels: { ...STOCK_STAGE_LABELS, Airline: 'Airline partner' },
    })
    expect(out.options).toEqual([...STAGES.map((s) => s.value), 'Airline', 'Charter'])
    expect(out.translatedOptions.Airline).toBe('Airline partner')
  })

  it('never removes a value that is not on the retire list, even when nothing uses it', () => {
    const out = mergeEnumOptions({ ...base, current: [...STOCK_STAGES, 'Airline'], retire: [] })
    expect(out.options).toContain('Airline')
    expect(out.options).toContain('Prospecting')
    expect(out.removed).toEqual([])
  })
})

describe('enums resource against the fake', () => {
  const stageConfig = () => ({
    'enums.json': {
      enums: [
        {
          scope: 'Opportunity',
          field: 'stage',
          values: STAGES,
          retire: STAGE_RETIRE,
          default: 'New',
          probabilityMap: { New: 10, 'First Contact': 20, Meeting: 40, 'Rate Sent': 60, 'Trial Ride': 80, 'Closed Won': 100, 'Closed Lost': 0 },
          style: { 'Trial Ride': 'primary', 'Closed Won': 'success', 'Closed Lost': 'info' },
        },
      ],
    },
  })

  it('first run updates the stage field once, second run is a no-op', async () => {
    const fake = fresh()
    const dir = configDir(stageConfig())
    const first = await sync(fake, dir)
    expect(first).toContain('enums: create=0 update=1 unchanged=0 skipped=0 removed=4')

    const put = mutations(fake)
    expect(put).toHaveLength(1)
    expect(put[0].method).toBe('PUT')
    expect(put[0].path).toBe('/Admin/fieldManager/Opportunity/stage')
    expect(put[0].body.default).toBe('New')
    expect(put[0].body.options).toEqual(STAGES.map((s) => s.value))
    expect(put[0].body.translatedOptions['Closed Won']).toBe('Partner (Won)')
    expect(put[0].body.translatedOptions.Prospecting).toBe('Prospecting') // existing labels are carried over
    expect(put[0].body.probabilityMap['Trial Ride']).toBe(80)
    expect(put[0].body.style['Trial Ride']).toBe('primary')

    expect(stageField(fake).options).toEqual(STAGES.map((s) => s.value))
    expect(stageField(fake).default).toBe('New')
    expect(stageField(fake).probabilityMap).toMatchObject({ New: 10, 'Trial Ride': 80, 'Closed Won': 100, 'Closed Lost': 0 })
    expect(stageField(fake).probabilityMap.Prospecting).toBeUndefined()
    expect(stageField(fake).style).toEqual({ 'Closed Won': 'success', 'Closed Lost': 'info', 'Trial Ride': 'primary' })
    expect(stageLabels(fake)['Closed Lost']).toBe('Lost')

    const before = mutations(fake).length
    const second = await sync(fake, dir)
    expect(second).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(mutations(fake)).toHaveLength(before)
  })

  it('dry run reads only and reports what it would change', async () => {
    const fake = fresh()
    const lines = await sync(fake, configDir(stageConfig()), { dryRun: true })
    expect(mutations(fake)).toHaveLength(0)
    expect(lines).toContain('enums: create=0 update=1 unchanged=0 skipped=0 removed=4')
    expect(stageField(fake).options).toEqual(STOCK_STAGES)
  })

  it('an owner-edited probability or style survives, a retired default is replaced', async () => {
    const fake = fresh()
    stageField(fake).default = 'Prospecting'
    const dir = configDir(stageConfig())
    await sync(fake, dir)
    stageField(fake).probabilityMap['Trial Ride'] = 90
    stageField(fake).style['Trial Ride'] = 'danger'
    const again = await sync(fake, dir)
    expect(again).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(stageField(fake).probabilityMap['Trial Ride']).toBe(90)
    expect(stageField(fake).style['Trial Ride']).toBe('danger')

    stageField(fake).default = 'Meeting' // owner picked another valid default
    await sync(fake, dir)
    expect(stageField(fake).default).toBe('Meeting')
  })

  it('an owner-added value and an owner-renamed label survive every re-run', async () => {
    const fake = fresh()
    const dir = configDir({ 'enums.json': { enums: [...stageConfig()['enums.json'].enums, realEnums().enums.find((e: any) => e.scope === 'Account')] } })
    await sync(fake, dir)

    // The owner works in Entity Manager: a new Account type and a renamed stage label.
    typeField(fake).options.push('Airline')
    fake.state.i18n['Account.type'].translatedOptions.Airline = 'Airline partner'
    fake.state.i18n['Opportunity.stage'].translatedOptions['Trial Ride'] = 'Test drive'

    const second = await sync(fake, dir)
    const third = await sync(fake, dir)
    for (const lines of [second, third]) expect(lines).toContain('enums: create=0 update=0 unchanged=2 skipped=0 removed=0')
    expect(typeField(fake).options).toEqual([...ACCOUNT_TYPE_VALUES, 'Airline'])
    expect(typeLabels(fake).Airline).toBe('Airline partner')
    expect(stageLabels(fake)['Trial Ride']).toBe('Test drive')
    expect(stageField(fake).options).toEqual(STAGES.map((s) => s.value))
  })

  it('a rename present at the very first run is kept (no label clobber)', async () => {
    const fake = fresh()
    fake.state.i18n['Opportunity.stage'] = { translatedOptions: { 'Closed Won': 'Signed partner' } }
    await sync(fake, configDir(stageConfig()))
    expect(stageLabels(fake)['Closed Won']).toBe('Signed partner')
    expect(stageLabels(fake)['Closed Lost']).toBe('Lost')
  })
})

describe('D-20 retire guard (account types)', () => {
  const typeConfig = () => ({ 'enums.json': { enums: [realEnums().enums.find((e: any) => e.scope === 'Account')] } })

  it('removes an unused stock type and keeps one that a record still uses', async () => {
    const fake = fresh({ Account: [{ id: 'a1', name: 'Restore Drill Canary', type: 'Partner' }] })
    const lines = await sync(fake, configDir(typeConfig()))
    expect(typeField(fake).options).toEqual([...ACCOUNT_TYPE_VALUES, 'Partner'])
    expect(typeField(fake).options).not.toContain('Customer')
    // '' is unused (the only account has a type) and goes with Customer, Investor, Reseller.
    expect(lines).toContain('enums: create=0 update=1 unchanged=0 skipped=0 removed=4')
    // a record is never touched
    expect(fake.state.records.Account).toEqual([{ id: 'a1', name: 'Restore Drill Canary', type: 'Partner' }])
    expect(mutations(fake).every((r) => r.path.startsWith('/Admin/fieldManager/'))).toBe(true)
  })

  it('keeps the empty option while an account has no type', async () => {
    const fake = fresh({ Account: [{ id: 'a1', name: 'Typeless', type: '' }] })
    await sync(fake, configDir(typeConfig()))
    expect(typeField(fake).options).toContain('')
    expect(typeField(fake).options).not.toContain('Customer')
  })

  it('zero records: every listed stock type is removed and a repeat run is a no-op', async () => {
    const fake = fresh()
    const dir = configDir(typeConfig())
    await sync(fake, dir)
    expect(typeField(fake).options).toEqual(ACCOUNT_TYPE_VALUES)
    expect(typeLabels(fake)['Agency']).toBe('Travel agency / DMC')
    expect(typeLabels(fake)['Embassy']).toBe('Embassy / event agency')
    const second = await sync(fake, dir)
    expect(second).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
  })

  it('an in-use stage is kept as well, counted once as in use', async () => {
    const fake = fresh({ Opportunity: [{ id: 'o1', name: 'Old deal', stage: 'Proposal' }] })
    const dir = configDir(stageConfig())
    const first = await sync(fake, dir)
    expect(first).toContain('enums: create=0 update=1 unchanged=0 skipped=0 removed=3')
    expect(stageField(fake).options).toEqual([...STAGES.map((s) => s.value), 'Proposal'])
    const second = await sync(fake, dir)
    expect(second).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
  })

  function stageConfig() {
    return { 'enums.json': { enums: [realEnums().enums.find((e: any) => e.scope === 'Opportunity')] } }
  }
})

describe('Lead.source (D-08, plan 81-06)', () => {
  const LEAD_SOURCES = ['Website booking', 'GNet', 'Contact form', 'Corporate form', 'Multi-day quote', 'WhatsApp', 'Phone', 'Email', 'Partner', 'Other']
  const STOCK_LEAD_SOURCES = ['', 'Call', 'Email', 'Existing Customer', 'Partner', 'Public Relations', 'Web Site', 'Campaign', 'Other']
  const leadConfig = () => ({ 'enums.json': { enums: [realEnums().enums.find((e: any) => e.scope === 'Lead' && e.field === 'source')] } })
  const sourceField = (fake: Fake) => fake.state.metadata.entityDefs.Lead.fields.source

  it('shipped entry has the 10 values in order, label = value, and an empty retire list', () => {
    const entry = realEnums().enums.find((e: any) => e.scope === 'Lead' && e.field === 'source')
    expect(entry.values.map((v: any) => v.value)).toEqual(LEAD_SOURCES)
    expect(entry.values.every((v: any) => v.label === v.value)).toBe(true)
    expect(entry.retire).toEqual([])
  })

  it('keeps all 9 stock options, adds the 7 new ones, and a second run is a no-op', async () => {
    const fake = fresh()
    const dir = configDir(leadConfig())
    expect(sourceField(fake).options).toEqual(STOCK_LEAD_SOURCES)
    const first = await sync(fake, dir)
    expect(first).toContain('enums: create=0 update=1 unchanged=0 skipped=0 removed=0')
    const options = sourceField(fake).options as string[]
    for (const v of STOCK_LEAD_SOURCES) expect(options).toContain(v)
    for (const v of LEAD_SOURCES) expect(options).toContain(v)
    expect(options.slice(0, LEAD_SOURCES.length)).toEqual(LEAD_SOURCES)
    expect(options).toHaveLength(new Set([...STOCK_LEAD_SOURCES, ...LEAD_SOURCES]).size)
    const before = mutations(fake).length
    const second = await sync(fake, dir)
    expect(second).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(mutations(fake).length).toBe(before)
  })

  it('an owner-added live value survives the merge', async () => {
    const fake = fresh()
    sourceField(fake).options = [...STOCK_LEAD_SOURCES, 'Fair']
    const dir = configDir(leadConfig())
    await sync(fake, dir)
    expect(sourceField(fake).options).toContain('Fair')
    expect(sourceField(fake).options).toContain('Web Site')
    const second = await sync(fake, dir)
    expect(second).toContain('enums: create=0 update=0 unchanged=1 skipped=0 removed=0')
  })
})

describe('enums.json invariants', () => {
  const enums = realEnums().enums as any[]
  const entry = (scope: string, field: string) => enums.find((e) => e.scope === scope && e.field === field)

  it('Opportunity.stage is exactly the 7 D-01 values in D-01 order with the D-01 labels', () => {
    const stage = entry('Opportunity', 'stage')
    expect(stage.values).toEqual(STAGES)
    expect(stage.values.map((v: any) => v.value)).toEqual(expect.arrayContaining(['Closed Won', 'Closed Lost']))
    expect(stage.default).toBe('New')
    expect(stage.retire).toEqual(STAGE_RETIRE)
    expect(Object.keys(stage.probabilityMap).sort()).toEqual(STAGES.map((s) => s.value).sort())
  })

  it('Closed Won / Closed Lost stay as stored values (no second won/lost value)', () => {
    const values = entry('Opportunity', 'stage').values.map((v: any) => v.value)
    expect(values.filter((v: string) => /won/i.test(v))).toEqual(['Closed Won'])
    expect(values.filter((v: string) => /lost/i.test(v))).toEqual(['Closed Lost'])
    expect(entry('Opportunity', 'stage').retire).not.toContain('Closed Won')
    expect(entry('Opportunity', 'stage').retire).not.toContain('Closed Lost')
  })

  it('Account.type is exactly the 5 D-02 values, equal to ACCOUNT_TYPE_VALUES, with the D-02 labels', () => {
    const type = entry('Account', 'type')
    expect(type.values.map((v: any) => v.value)).toEqual(ACCOUNT_TYPE_VALUES)
    expect(Object.fromEntries(type.values.map((v: any) => [v.value, v.label]))).toEqual({
      Hotel: 'Hotel',
      Agency: 'Travel agency / DMC',
      Corporate: 'Corporate',
      Embassy: 'Embassy / event agency',
      Other: 'Other',
    })
    expect(type.retire).toEqual(['', 'Customer', 'Investor', 'Partner', 'Reseller'])
  })

  it('no retire list overlaps its desired values', () => {
    for (const e of enums) {
      const wanted = new Set(e.values.map((v: any) => v.value))
      expect(e.retire.filter((v: string) => wanted.has(v))).toEqual([])
    }
  })

  it('enums runs between fields and layouts', () => {
    const order = RESOURCE_ORDER as string[]
    expect(order.indexOf('enums')).toBe(order.indexOf('fields') + 1)
    expect(order.indexOf('layouts')).toBe(order.indexOf('enums') + 1)
  })
})
