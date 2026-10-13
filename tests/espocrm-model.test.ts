// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 04 - Booking mirror data model: entities / links / fields (and
 * later layouts) sync resources, proven against the in-memory fake, plus the
 * config invariants that pin fields.json to infra/espocrm/lib/booking-map.mjs.
 * No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EspoConfigError, createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { finalFieldName, runSync } from '../infra/espocrm/sync.mjs'
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

/** Writes the given config files into a fresh temp dir and returns its path. */
function configDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'espocrm-model-'))
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(data))
  return dir
}

async function sync(fake: Fake, dir: string, opts: { only?: string[]; dryRun?: boolean } = {}) {
  const lines: string[] = []
  await runSync({ client: adminClient(fake), configDir: dir, log: (l) => lines.push(l), ...opts })
  return lines
}

const fresh = () => createFakeEspoCRM({ metadata: stockEspoMetadata() })
const mutations = (fake: Fake) => fake.requests.filter((r) => r.method !== 'GET')

const BOOKING_ENTITY = { name: 'Booking', type: 'Base', labelSingular: 'Booking', labelPlural: 'Bookings', stream: false }
const CONTACT_LINK = {
  entity: 'CBooking',
  link: 'contact',
  linkType: 'manyToOne',
  entityForeign: 'Contact',
  linkForeign: 'bookings',
  label: 'Contact',
  labelForeign: 'Bookings',
}
const KEY_FIELD = {
  name: 'supabaseBookingId',
  type: 'varchar',
  maxLength: 36,
  required: true,
  label: 'Supabase Booking ID',
}
const tracerConfig = () => ({
  'entities.json': { entities: [BOOKING_ENTITY], links: [CONTACT_LINK] },
  'fields.json': { fields: { CBooking: [KEY_FIELD] } },
})

const only = ['entities', 'links', 'fields']

describe('finalFieldName', () => {
  it('prefixes stock-scope fields with c + Ucfirst and leaves custom-scope fields alone', () => {
    expect(finalFieldName('Account', 'commissionPercent')).toBe('cCommissionPercent')
    expect(finalFieldName('Contact', 'x')).toBe('cX')
    expect(finalFieldName('CBooking', 'status')).toBe('status')
    expect(finalFieldName('CPartnerRate', 'price')).toBe('price')
  })

  it('honours an explicit custom-scope list over the name heuristic', () => {
    expect(finalFieldName('Weird', 'name', new Set(['Weird']))).toBe('name')
    expect(finalFieldName('CBooking', 'name', new Set(['Other']))).toBe('cName')
  })
})

describe('runSync entities + links + fields (tracer)', () => {
  it('creates CBooking, the contact link and supabaseBookingId, then a second run is a no-op', async () => {
    const fake = fresh()
    const dir = configDir(tracerConfig())

    const first = await sync(fake, dir, { only })
    expect(first).toContain('entities: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(first).toContain('links: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(first).toContain('fields: create=1 update=0 unchanged=0 skipped=0 removed=0')

    const md = fake.state.metadata
    expect(md.scopes.CBooking.isCustom).toBe(true)
    expect(md.entityDefs.CBooking.links.contact).toMatchObject({ entity: 'Contact', foreign: 'cBookings' })
    expect(md.entityDefs.Contact.links.cBookings).toMatchObject({ entity: 'CBooking', foreign: 'contact' })
    expect(md.entityDefs.CBooking.fields.supabaseBookingId).toMatchObject({ type: 'varchar', maxLength: 36, required: true })
    expect(fake.state.i18n['CBooking.supabaseBookingId'].label).toBe('Supabase Booking ID')

    const before = mutations(fake).length
    const second = await sync(fake, dir, { only })
    for (const resource of only) expect(second).toContain(`${resource}: create=0 update=0 unchanged=1 skipped=0 removed=0`)
    expect(mutations(fake)).toHaveLength(before)
  })

  it('entities and links are create-only: relabelling in git never updates a live entity', async () => {
    const fake = fresh()
    await sync(fake, configDir(tracerConfig()), { only })
    const relabelled = tracerConfig()
    relabelled['entities.json'].entities[0] = { ...BOOKING_ENTITY, labelPlural: 'Reservations' }
    relabelled['entities.json'].links[0] = { ...CONTACT_LINK, labelForeign: 'Reservations' }
    const before = mutations(fake).length

    const lines = await sync(fake, configDir(relabelled), { only })
    expect(lines).toContain('entities: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(lines).toContain('links: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(mutations(fake)).toHaveLength(before)
  })

  it('creates fields on a stock scope under the c-prefixed name and finds them again on the next run', async () => {
    const fake = fresh()
    const dir = configDir({
      'entities.json': { entities: [], links: [] },
      'fields.json': { fields: { Account: [{ name: 'vatId', type: 'varchar', maxLength: 30, label: 'VAT ID' }] } },
    })
    const first = await sync(fake, dir, { only: ['fields'] })
    expect(first).toContain('fields: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(fake.state.metadata.entityDefs.Account.fields.cVatId).toMatchObject({ type: 'varchar', maxLength: 30 })
    expect(fake.state.metadata.entityDefs.Account.fields.vatId).toBeUndefined()

    const second = await sync(fake, dir, { only: ['fields'] })
    expect(second).toContain('fields: create=0 update=0 unchanged=1 skipped=0 removed=0')
  })

  it('a param not permitted for the field type throws EspoConfigError before any POST or PUT', async () => {
    const fake = fresh()
    const dir = configDir({
      'entities.json': { entities: [BOOKING_ENTITY], links: [] },
      'fields.json': {
        fields: { CBooking: [KEY_FIELD, { name: 'pickup', type: 'varchar', maxLength: 255, unique: true }] },
      },
    })
    await sync(fake, dir, { only: ['entities'] })
    const before = mutations(fake).length

    await expect(sync(fake, dir, { only: ['fields'] })).rejects.toBeInstanceOf(EspoConfigError)
    await expect(sync(fake, dir, { only: ['fields'] })).rejects.toThrow(/unique/)
    // the valid first field was not created either: validation precedes every write
    expect(mutations(fake)).toHaveLength(before)
    expect(fake.state.metadata.entityDefs.CBooking.fields.supabaseBookingId).toBeUndefined()
  })

  it('an unknown field type throws EspoConfigError', async () => {
    const fake = fresh()
    const dir = configDir({
      'entities.json': { entities: [BOOKING_ENTITY], links: [] },
      'fields.json': { fields: { CBooking: [{ name: 'x', type: 'nonsense' }] } },
    })
    await sync(fake, dir, { only: ['entities'] })
    await expect(sync(fake, dir, { only: ['fields'] })).rejects.toBeInstanceOf(EspoConfigError)
  })

  it('declaring fields for a scope that does not exist throws EspoConfigError (live run)', async () => {
    const fake = fresh()
    const dir = configDir({
      'entities.json': { entities: [], links: [] },
      'fields.json': { fields: { CBooking: [KEY_FIELD] } },
    })
    await expect(sync(fake, dir, { only: ['fields'] })).rejects.toBeInstanceOf(EspoConfigError)
  })

  it('drift in an applied param produces one PUT; relabelling alone produces none', async () => {
    const fake = fresh()
    const dir = configDir(tracerConfig())
    await sync(fake, dir, { only })

    // someone shortened maxLength by hand in the UI
    fake.state.metadata.entityDefs.CBooking.fields.supabaseBookingId.maxLength = 20
    const putsBefore = fake.requests.filter((r) => r.method === 'PUT').length
    const drifted = await sync(fake, dir, { only: ['fields'] })
    expect(drifted).toContain('fields: create=0 update=1 unchanged=0 skipped=0 removed=0')

    const puts = fake.requests.filter((r) => r.method === 'PUT').slice(putsBefore)
    expect(puts).toHaveLength(1)
    expect(puts[0].path).toBe('/Admin/fieldManager/CBooking/supabaseBookingId')
    // the owner-editable create-only keys are not re-sent on an update
    expect(puts[0].body).not.toHaveProperty('label')
    expect(puts[0].body).not.toHaveProperty('translatedOptions')
    expect(puts[0].body).not.toHaveProperty('name')
    expect(fake.state.metadata.entityDefs.CBooking.fields.supabaseBookingId.maxLength).toBe(36)

    const cfg = tracerConfig()
    cfg['fields.json'].fields.CBooking[0] = { ...KEY_FIELD, label: 'Booking key (renamed in git)' }
    const putsAfter = fake.requests.filter((r) => r.method === 'PUT').length
    const relabelled = await sync(fake, configDir(cfg), { only: ['fields'] })
    expect(relabelled).toContain('fields: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(putsAfter)
    expect(fake.state.i18n['CBooking.supabaseBookingId'].label).toBe('Supabase Booking ID')
  })

  it('sends create-only translatedOptions on create and never the local-only commercial key', async () => {
    const fake = fresh()
    const dir = configDir({
      'entities.json': { entities: [BOOKING_ENTITY], links: [] },
      'fields.json': {
        fields: {
          CBooking: [
            {
              name: 'source',
              type: 'enum',
              options: ['online', 'manual'],
              translatedOptions: { online: 'Website', manual: 'Admin-created' },
              commercial: true,
            },
          ],
        },
      },
    })
    await sync(fake, dir, { only: ['entities', 'fields'] })
    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/Admin/fieldManager/CBooking')
    expect(post?.body).toMatchObject({ name: 'source', type: 'enum', translatedOptions: { online: 'Website', manual: 'Admin-created' } })
    expect(post?.body).not.toHaveProperty('commercial')
    expect(fake.state.i18n['CBooking.source'].translatedOptions).toEqual({ online: 'Website', manual: 'Admin-created' })

    const second = await sync(fake, dir, { only: ['fields'] })
    expect(second).toContain('fields: create=0 update=0 unchanged=1 skipped=0 removed=0')
  })

  it('a changed enum option list is applied with one PUT (git is the source of truth for options)', async () => {
    const fake = fresh()
    const spec = (options: string[]) => ({
      'entities.json': { entities: [BOOKING_ENTITY], links: [] },
      'fields.json': { fields: { CBooking: [{ name: 'source', type: 'enum', options }] } },
    })
    await sync(fake, configDir(spec(['online'])), { only: ['entities', 'fields'] })
    const lines = await sync(fake, configDir(spec(['online', 'manual'])), { only: ['fields'] })
    expect(lines).toContain('fields: create=0 update=1 unchanged=0 skipped=0 removed=0')
    expect(fake.state.metadata.entityDefs.CBooking.fields.source.options).toEqual(['online', 'manual'])
  })

  it('--dry-run sends only GET requests and changes nothing', async () => {
    const fake = fresh()
    const lines = await sync(fake, configDir(tracerConfig()), { only, dryRun: true })
    expect(mutations(fake)).toHaveLength(0)
    expect(lines).toContain('entities: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(lines).toContain('links: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(lines).toContain('fields: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(fake.state.metadata.scopes.CBooking).toBeUndefined()
  })

  it('never has two metadata writes in flight (sequential metadata rule)', async () => {
    const fake = fresh()
    await sync(fake, configDir(tracerConfig()), { only })
    expect(fake.maxInFlight()).toBe(1)
  })
})

describe('shipped config files (tracer)', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm', file), 'utf8'))

  it('entities.json declares the Booking entity (stream off) and a manyToOne contact link', () => {
    const cfg = read('entities.json')
    expect(cfg.entities).toEqual([BOOKING_ENTITY])
    expect(cfg.links).toContainEqual(CONTACT_LINK)
  })

  it('fields.json declares supabaseBookingId as varchar(36), required (D-07 key)', () => {
    const cfg = read('fields.json')
    const key = cfg.fields.CBooking.find((f: any) => f.name === 'supabaseBookingId')
    expect(key).toMatchObject({ type: 'varchar', maxLength: 36, required: true })
  })

  it('the shipped config applies cleanly to an empty fake and is idempotent', async () => {
    const fake = fresh()
    const dir = join(REPO_ROOT, 'infra/espocrm')
    await sync(fake, dir, { only })
    const before = mutations(fake).length
    const again = await sync(fake, dir, { only })
    for (const resource of only) expect(again.find((l) => l.startsWith(`${resource}:`))).toMatch(/create=0 update=0 /)
    expect(mutations(fake)).toHaveLength(before)
  })
})
