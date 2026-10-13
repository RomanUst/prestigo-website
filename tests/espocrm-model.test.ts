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
import {
  BOOKING_SOURCE_VALUES,
  BOOKING_STATUS_VALUES,
  FIELD_MAX_LENGTH,
  LEG_VALUES,
  PAYMENT_METHOD_VALUES,
  SYNCED_BOOKING_FIELDS,
  TRIP_TYPE_VALUES,
  VEHICLE_CLASS_VALUES,
} from '../infra/espocrm/lib/booking-map.mjs'
import { finalFieldName, mergeLayout, runSync } from '../infra/espocrm/sync.mjs'
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

describe('CBooking config invariants (D-09, D-10, 80-03 contract)', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm', file), 'utf8'))
  const specs: any[] = read('fields.json').fields.CBooking
  const byName = (name: string) => specs.find((f) => f.name === name)

  // payload keys of booking-map minus the built-in `name` and the currency attribute `amountCurrency`
  const CONTRACT_FIELDS = SYNCED_BOOKING_FIELDS.filter((k: string) => k !== 'name' && k !== 'amountCurrency')

  it('declares exactly the 80-03 payload fields (15 specs), no more, no fewer', () => {
    expect(specs).toHaveLength(15)
    expect(specs.map((f) => f.name).sort()).toEqual([...CONTRACT_FIELDS].sort())
    expect(new Set(specs.map((f) => f.name)).size).toBe(specs.length)
  })

  it('uses the contract type for every field', () => {
    const expected: Record<string, string> = {
      supabaseBookingId: 'varchar',
      leg: 'enum',
      pickupAt: 'datetime',
      pickup: 'varchar',
      dropoff: 'varchar',
      tripType: 'enum',
      vehicleClass: 'enum',
      status: 'enum',
      amount: 'currency',
      paymentMethod: 'enum',
      passengerName: 'varchar',
      flightNumber: 'varchar',
      driverName: 'varchar',
      source: 'enum',
      adminLink: 'url',
    }
    for (const [name, type] of Object.entries(expected)) expect(byName(name)?.type, name).toBe(type)
  })

  it('enum options deep-equal the booking-map constants (same order, same values)', () => {
    expect(byName('status').options).toEqual(BOOKING_STATUS_VALUES)
    expect(byName('source').options).toEqual(BOOKING_SOURCE_VALUES)
    expect(byName('vehicleClass').options).toEqual(VEHICLE_CLASS_VALUES)
    expect(byName('tripType').options).toEqual(TRIP_TYPE_VALUES)
    expect(byName('leg').options).toEqual(LEG_VALUES)
    expect(byName('paymentMethod').options).toEqual(PAYMENT_METHOD_VALUES)
  })

  it('every non-empty enum option has a seeded label and no label is orphaned', () => {
    for (const spec of specs.filter((f) => f.type === 'enum')) {
      const optionKeys = (spec.options as string[]).filter((o) => o !== '').sort()
      expect(Object.keys(spec.translatedOptions).sort(), spec.name).toEqual(optionKeys)
    }
    expect(byName('vehicleClass').translatedOptions).toEqual({
      business: 'E-Class',
      first_class: 'S-Class',
      business_van: 'V-Class',
    })
    expect(byName('source').translatedOptions).toEqual({ online: 'Website', manual: 'Admin-created', gnet: 'GNet' })
    expect(byName('status').translatedOptions.en_route).toBe('En Route')
  })

  it('varchar maxLength equals FIELD_MAX_LENGTH for every limited field; each limited field is declared', () => {
    for (const [name, max] of Object.entries(FIELD_MAX_LENGTH)) expect(byName(name).maxLength, name).toBe(max)
    for (const spec of specs.filter((f) => f.type === 'varchar')) {
      expect(spec.maxLength, `${spec.name} has a FIELD_MAX_LENGTH`).toBe((FIELD_MAX_LENGTH as Record<string, number>)[spec.name])
    }
  })

  it('no CBooking field is read-only: read-only is role ACL (80-07); a field flag would also strip the sync writer', () => {
    for (const spec of specs) {
      expect(spec, spec.name).not.toHaveProperty('readOnly')
      expect(spec, spec.name).not.toHaveProperty('readOnlyAfterCreate')
      expect(spec, spec.name).not.toHaveProperty('dynamicLogicReadOnly')
    }
  })

  it('passengerName and flightNumber are personal data; amount is EUR-only currency', () => {
    expect(byName('passengerName').isPersonalData).toBe(true)
    expect(byName('flightNumber').isPersonalData).toBe(true)
    expect(byName('amount').onlyDefaultCurrency).toBe(true)
    expect(byName('supabaseBookingId')).toMatchObject({ required: true, maxLength: 36 })
  })

  it('entities.json links CBooking.contact -> Contact and CBooking.account -> Account (manyToOne, linkForeign bookings)', () => {
    const links = read('entities.json').links
    for (const [link, foreign] of [
      ['contact', 'Contact'],
      ['account', 'Account'],
    ]) {
      expect(links).toContainEqual(
        expect.objectContaining({
          entity: 'CBooking',
          link,
          linkType: 'manyToOne',
          entityForeign: foreign,
          linkForeign: 'bookings',
        }),
      )
    }
    expect(read('entities.json').entities).toHaveLength(1)
  })

  it('applies to the fake: all fields and both links on the first run, nothing on the second', async () => {
    const fake = fresh()
    const dir = join(REPO_ROOT, 'infra/espocrm')
    const first = await sync(fake, dir, { only })
    expect(first).toContain('entities: create=1 update=0 unchanged=0 skipped=0 removed=0')
    expect(first).toContain('links: create=2 update=0 unchanged=0 skipped=0 removed=0')
    expect(first).toContain('fields: create=15 update=0 unchanged=0 skipped=0 removed=0')

    const md = fake.state.metadata
    expect(md.entityDefs.Contact.links.cBookings).toMatchObject({ entity: 'CBooking', foreign: 'contact' })
    expect(md.entityDefs.Account.links.cBookings).toMatchObject({ entity: 'CBooking', foreign: 'account' })
    expect(md.entityDefs.CBooking.fields.passengerName.isPersonalData).toBe(true)
    expect(md.entityDefs.CBooking.fields.status.options).toEqual(BOOKING_STATUS_VALUES)
    expect(fake.state.i18n['CBooking.vehicleClass'].translatedOptions.first_class).toBe('S-Class')

    const second = await sync(fake, dir, { only })
    expect(second).toContain('entities: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(second).toContain('links: create=0 update=0 unchanged=2 skipped=0 removed=0')
    expect(second).toContain('fields: create=0 update=0 unchanged=15 skipped=0 removed=0')
  })
})

describe('mergeLayout', () => {
  it('append: adds a missing relationship in the server item form and keeps the order of what exists', () => {
    // string form
    const strings = ['history', 'opportunities']
    expect(mergeLayout('append', strings, ['cBookings'])).toEqual(['history', 'opportunities', 'cBookings'])
    // {name} form
    const objects = [{ name: 'history' }, { name: 'opportunities' }]
    expect(mergeLayout('append', objects, ['cBookings'])).toEqual([...objects, { name: 'cBookings' }])
    // mixed (the server may store either): the string form wins unless every item is an object
    expect(mergeLayout('append', ['history', { name: 'opportunities' }], ['cBookings'])).toEqual([
      'history',
      { name: 'opportunities' },
      'cBookings',
    ])
    // an empty list gets the plain name
    expect(mergeLayout('append', [], ['cBookings'])).toEqual(['cBookings'])
  })

  it('append: returns the very same array when the item is present (string or {name} form)', () => {
    const strings = ['cBookings', 'history']
    expect(mergeLayout('append', strings, ['cBookings'])).toBe(strings)
    const mixed = ['history', { name: 'cBookings', width: 10 }]
    expect(mergeLayout('append', mixed, ['cBookings'])).toBe(mixed)
  })

  it('append: never reorders, removes or alters existing items', () => {
    const current = ['tasks', 'cases', { name: 'opportunities', width: 30 }]
    const merged = mergeLayout('append', current, ['opportunities', 'cases', 'cBookings'])
    expect(merged.slice(0, 3)).toEqual(current)
    expect(merged).toEqual([...current, 'cBookings'])
    expect(current).toHaveLength(3) // input untouched
  })

  it('append: detail panels are added only when no panel with the same label exists, existing panels are never altered', () => {
    const overview = { label: 'Overview', rows: [[{ name: 'owner' }, false]] }
    const current = [overview]
    const merged = mergeLayout('append', current, [
      { label: 'Overview', rows: [[{ name: 'something-else' }]] },
      { label: 'Commercial', rows: [[{ name: 'cVatId' }, false]] },
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toBe(overview)
    expect(merged[1].label).toBe('Commercial')
    expect(mergeLayout('append', merged, [{ label: 'Commercial', rows: [] }])).toBe(merged)
  })

  it('append: keyed layouts (bottomPanelsDetail) get missing keys only', () => {
    const current = { opportunities: { name: 'opportunities', index: 7 }, mine: { index: 1 } }
    const merged = mergeLayout('append', current, {
      opportunities: { name: 'opportunities', index: 5 },
      cBookings: { name: 'cBookings', index: 5.5 },
    })
    expect(merged).toEqual({ ...current, cBookings: { name: 'cBookings', index: 5.5 } })
    expect(merged.opportunities.index).toBe(7)
    expect(mergeLayout('append', merged, { cBookings: { index: 9 } })).toBe(merged)
  })

  it('append: nothing live yet takes the desired layout; a shape mismatch is a config error', () => {
    expect(mergeLayout('append', null, ['cBookings'])).toEqual(['cBookings'])
    expect(() => mergeLayout('append', ['a'], { cBookings: {} })).toThrow(EspoConfigError)
    expect(() => mergeLayout('upsert' as any, [], [])).toThrow(EspoConfigError)
  })

  it('replace: returns the desired layout', () => {
    const desired = [{ name: 'name', link: true }]
    expect(mergeLayout('replace', [{ name: 'other' }], desired)).toEqual(desired)
    expect(mergeLayout('replace', null, desired)).toEqual(desired)
  })
})

describe('runSync layouts', () => {
  const STOCK_CONTACT_PANELS = {
    opportunities: { name: 'opportunities', index: 5 },
    cases: { name: 'cases', index: 5.001 },
  }
  const layoutsConfig = () => ({
    'entities.json': { entities: [], links: [] },
    'fields.json': { fields: {} },
    'layouts.json': {
      layouts: [
        { scope: 'CBooking', name: 'list', mode: 'replace', layout: [{ name: 'name', link: true }, { name: 'status' }] },
        { scope: 'Contact', name: 'bottomPanelsDetail', mode: 'append', layout: { cBookings: { name: 'cBookings', index: 5.5 } } },
        { scope: 'Contact', name: 'relationships', mode: 'append', layout: ['cBookings'] },
        { scope: 'Account', name: 'detail', mode: 'append', layout: [{ label: 'Bookings', rows: [] }] },
      ],
    },
  })
  const seeded = () =>
    createFakeEspoCRM({
      metadata: stockEspoMetadata(),
      layouts: {
        'CBooking/list': [{ name: 'name', link: true }],
        'Contact/bottomPanelsDetail': structuredClone(STOCK_CONTACT_PANELS),
        'Contact/relationships': ['cases', 'tasks', 'opportunities'], // reordered, owner-added `tasks`
        'Account/detail': [{ label: 'Overview', rows: [[{ name: 'name' }, false]] }],
      },
    })
  const onlyLayouts = ['layouts']

  it('replace writes ours; append adds only what is missing; the second run is a no-op', async () => {
    const fake = seeded()
    const dir = configDir(layoutsConfig())
    const first = await sync(fake, dir, { only: onlyLayouts })
    expect(first).toContain('layouts: create=0 update=4 unchanged=0 skipped=0 removed=0')

    const L = fake.state.layouts
    expect(L['CBooking/list']).toEqual([{ name: 'name', link: true }, { name: 'status' }])
    expect(L['Contact/bottomPanelsDetail']).toEqual({ ...STOCK_CONTACT_PANELS, cBookings: { name: 'cBookings', index: 5.5 } })
    expect(L['Contact/relationships']).toEqual(['cases', 'tasks', 'opportunities', 'cBookings'])
    expect(L['Account/detail']).toEqual([
      { label: 'Overview', rows: [[{ name: 'name' }, false]] },
      { label: 'Bookings', rows: [] },
    ])

    const puts = fake.requests.filter((r) => r.method === 'PUT').length
    const second = await sync(fake, dir, { only: onlyLayouts })
    expect(second).toContain('layouts: create=0 update=0 unchanged=4 skipped=0 removed=0')
    expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(puts)
  })

  it('owner edits to stock scopes survive a re-run: an added panel, a reordered list, a moved Bookings panel', async () => {
    const fake = seeded()
    const dir = configDir(layoutsConfig())
    await sync(fake, dir, { only: onlyLayouts })

    // the owner adds a relationship, reorders another list and moves the Bookings panel
    fake.state.layouts['Contact/relationships'] = ['tasks', 'cBookings', 'cases', 'opportunities', 'meetings']
    fake.state.layouts['Contact/bottomPanelsDetail'].cBookings.index = 1
    fake.state.layouts['Contact/bottomPanelsDetail'].meetings = { name: 'meetings', index: 9 }
    fake.state.layouts['Account/detail'][0].rows.push([{ name: 'website' }, false])
    const snapshot = structuredClone(fake.state.layouts)

    const again = await sync(fake, dir, { only: onlyLayouts })
    expect(again).toContain('layouts: create=0 update=0 unchanged=4 skipped=0 removed=0')
    expect(fake.state.layouts).toEqual(snapshot)
  })

  it('replace mode restores a custom-entity layout that drifted', async () => {
    const fake = seeded()
    const dir = configDir(layoutsConfig())
    await sync(fake, dir, { only: onlyLayouts })
    fake.state.layouts['CBooking/list'] = [{ name: 'status' }, { name: 'name', link: true }]
    const again = await sync(fake, dir, { only: onlyLayouts })
    expect(again).toContain('layouts: create=0 update=1 unchanged=3 skipped=0 removed=0')
    expect(fake.state.layouts['CBooking/list']).toEqual([{ name: 'name', link: true }, { name: 'status' }])
  })

  it('a layout that does not exist yet is created (null from the server)', async () => {
    const fake = createFakeEspoCRM({ metadata: stockEspoMetadata() })
    const lines = await sync(fake, configDir(layoutsConfig()), { only: onlyLayouts })
    expect(lines).toContain('layouts: create=4 update=0 unchanged=0 skipped=0 removed=0')
  })

  it('--dry-run sends only GET requests and writes nothing', async () => {
    const fake = seeded()
    const before = structuredClone(fake.state.layouts)
    const lines = await sync(fake, configDir(layoutsConfig()), { only: onlyLayouts, dryRun: true })
    expect(mutations(fake)).toHaveLength(0)
    expect(lines).toContain('layouts: create=0 update=4 unchanged=0 skipped=0 removed=0')
    expect(fake.state.layouts).toEqual(before)
  })

  it('rejects a layout entry with an unknown mode or a missing scope', async () => {
    const fake = seeded()
    const bad = layoutsConfig()
    bad['layouts.json'].layouts[0] = { scope: 'CBooking', name: 'list', mode: 'merge', layout: [] } as any
    await expect(sync(fake, configDir(bad), { only: onlyLayouts })).rejects.toBeInstanceOf(EspoConfigError)
    const noScope = layoutsConfig()
    noScope['layouts.json'].layouts[0] = { name: 'list', mode: 'replace', layout: [] } as any
    await expect(sync(fake, configDir(noScope), { only: onlyLayouts })).rejects.toBeInstanceOf(EspoConfigError)
    expect(mutations(fake)).toHaveLength(0)
  })
})

describe('shipped layouts.json (D-10)', () => {
  const read = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm', file), 'utf8'))
  const layouts: any[] = read('layouts.json').layouts
  const find = (scope: string, name: string) => layouts.find((l) => l.scope === scope && l.name === name)
  const fieldNames = new Set<string>([...read('fields.json').fields.CBooking.map((f: any) => f.name), 'name', 'contact', 'account'])

  const namesIn = (node: any): string[] => {
    if (Array.isArray(node)) return node.flatMap(namesIn)
    if (node && typeof node === 'object') return [...(typeof node.name === 'string' ? [node.name] : []), ...Object.values(node).flatMap(namesIn)]
    return []
  }

  it('has five entries: three CBooking layouts (replace) and the Contact and Account panels (append)', () => {
    expect(layouts).toHaveLength(5)
    for (const name of ['list', 'listSmall', 'detail']) expect(find('CBooking', name)?.mode, name).toBe('replace')
    for (const scope of ['Contact', 'Account']) {
      const entry = find(scope, 'bottomPanelsDetail')
      expect(entry?.mode, scope).toBe('append')
      expect(Object.keys(entry.layout)).toEqual(['cBookings'])
    }
  })

  it('every field named in a CBooking layout is declared (or built in / a link)', () => {
    for (const name of ['list', 'listSmall', 'detail']) {
      for (const used of namesIn(find('CBooking', name).layout)) expect(fieldNames.has(used), `${name}: ${used}`).toBe(true)
    }
  })

  it('the detail layout shows every CBooking field exactly once in one "Booking" panel', () => {
    const detail = find('CBooking', 'detail').layout
    expect(detail).toHaveLength(1)
    expect(detail[0].label).toBe('Booking')
    const used = namesIn(detail[0].rows)
    expect(used.sort()).toEqual([...fieldNames].sort())
  })

  it('the full shipped config applies to the fake and a second full run reports create=0 update=0 everywhere', async () => {
    const fake = createFakeEspoCRM({
      metadata: stockEspoMetadata(),
      settings: { defaultCurrency: 'USD' },
      layouts: {
        'Contact/bottomPanelsDetail': { opportunities: { name: 'opportunities', index: 5 } },
        'Account/bottomPanelsDetail': { contacts: { index: 3 } },
      },
    })
    const dir = join(REPO_ROOT, 'infra/espocrm')
    await sync(fake, dir)
    const puts = fake.requests.filter((r) => r.method !== 'GET').length
    const again = await sync(fake, dir)
    for (const line of again.filter((l) => /^[a-z]+: create=/.test(l))) expect(line).toMatch(/create=0 update=0 /)
    expect(again.map((l) => l.split(':')[0])).toEqual(expect.arrayContaining(['settings', 'entities', 'links', 'fields', 'layouts']))
    expect(fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(puts)
    expect(fake.state.layouts['Contact/bottomPanelsDetail'].opportunities).toEqual({ name: 'opportunities', index: 5 })
    expect(fake.state.layouts['Contact/bottomPanelsDetail'].cBookings).toBeDefined()
    expect(fake.state.layouts['Account/bottomPanelsDetail'].cBookings).toBeDefined()
  })
})
