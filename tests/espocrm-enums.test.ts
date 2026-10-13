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
const stageLabels = (fake: Fake) => fake.state.i18n['Opportunity.stage']?.translatedOptions

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

  it('a rename present at the very first run is kept (no label clobber)', async () => {
    const fake = fresh()
    fake.state.i18n['Opportunity.stage'] = { translatedOptions: { 'Closed Won': 'Signed partner' } }
    await sync(fake, configDir(stageConfig()))
    expect(stageLabels(fake)['Closed Won']).toBe('Signed partner')
    expect(stageLabels(fake)['Closed Lost']).toBe('Lost')
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
