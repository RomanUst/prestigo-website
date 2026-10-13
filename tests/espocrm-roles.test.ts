// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 07 - operator roles as code (CRM-05, D-15/D-16/D-17/D-22): the
 * `roles` sync resource, the role invariants pinned to infra/espocrm/roles.json and the
 * expectation builder / runner of infra/espocrm/verify-acl.mjs, all against the
 * in-memory fake. No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EspoConfigError, createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { buildRoleSpecs, runSync } from '../infra/espocrm/sync.mjs'
import { buildAclExpectations, runAclProbe } from '../infra/espocrm/verify-acl.mjs'
import { createFakeEspoCRM, stockEspoMetadata, type FakeReq } from './helpers/fake-espocrm'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://crm.example.test'
const readJson = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm', file), 'utf8'))
const ROLES_JSON = readJson('roles.json')
const ROLE_COUNT = ROLES_JSON.roles.length
const FIELDS_JSON = readJson('fields.json')

type Fake = ReturnType<typeof createFakeEspoCRM>

const adminClient = (fake: Fake) =>
  createEspoClient({
    config: loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'prestigo-config', ESPOCRM_ADMIN_PASSWORD: 'pw_SECRET_0123456789' },
    }),
    fetchImpl: fake.fetchImpl as any,
  })

const apiClient = (fake: Fake, apiKey: string) =>
  createEspoClient({
    config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: apiKey } }),
    fetchImpl: fake.fetchImpl as any,
  })

function configDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'espocrm-roles-'))
  for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(data))
  return dir
}

const roleMetadata = () => {
  const md = stockEspoMetadata()
  for (const f of ['exportPermission', 'massUpdatePermission', 'dataPrivacyPermission', 'portalPermission']) {
    md.entityDefs.Role = { ...(md.entityDefs.Role ?? {}), fields: { ...(md.entityDefs.Role?.fields ?? {}), [f]: { type: 'enum', options: ['not-set', 'yes', 'no'] } } }
  }
  return md
}

const freshFake = (extra: Record<string, any> = {}) =>
  createFakeEspoCRM({
    metadata: roleMetadata(),
    records: {
      Role: [{ id: 'a00000000000000c1', name: 'Restore drill canary', data: { Account: { read: 'own' } } }],
      User: [{ id: 'b00000000000000a1', userName: 'prestigo-sync', type: 'api', rolesIds: ['a00000000000000c1'] }],
      ...extra,
    },
  })

async function syncRoles(fake: Fake, rolesJson: unknown = ROLES_JSON, fieldsJson: unknown = FIELDS_JSON) {
  const lines: string[] = []
  await runSync({
    client: adminClient(fake),
    configDir: configDir({ 'roles.json': rolesJson, 'fields.json': fieldsJson }),
    only: ['roles'],
    log: (l: string) => lines.push(l),
  })
  return lines
}

const commercialFinalNames = () =>
  FIELDS_JSON.fields.Account.filter((f: any) => f.commercial === true).map(
    (f: any) => `c${f.name.charAt(0).toUpperCase()}${f.name.slice(1)}`,
  )

describe('buildRoleSpecs', () => {
  it('expands @commercialHidden into the 9 commercial Account fields under their final names, all hidden', () => {
    const specs = buildRoleSpecs(ROLES_JSON, FIELDS_JSON)
    const dispatcher = specs.find((s: any) => s.name === 'Dispatcher')
    const hidden = dispatcher.fieldData.Account
    expect(Object.keys(hidden).sort()).toEqual(commercialFinalNames().sort())
    expect(Object.keys(hidden)).toHaveLength(9)
    expect(Object.keys(hidden)).toContain('cCommissionPercent')
    expect(Object.keys(hidden)).not.toContain('cOtherTypeNote')
    for (const rule of Object.values(hidden)) expect(rule).toEqual({ read: 'no', edit: 'no' })
  })

  it('rejects an unknown marker and a malformed scope action', () => {
    const bad = (patch: any) => () => buildRoleSpecs({ roles: [{ name: 'X', data: {}, ...patch }] }, FIELDS_JSON)
    expect(bad({ fieldData: { Account: '@nope' } })).toThrow(EspoConfigError)
    expect(bad({ data: { Account: { create: 'maybe', read: 'all', edit: 'no', delete: 'no' } } })).toThrow(EspoConfigError)
    expect(bad({ data: { Account: { create: 'no', read: 'everyone', edit: 'no', delete: 'no' } } })).toThrow(EspoConfigError)
  })
})

describe('roles resource', () => {
  it('creates the managed role once, then reports unchanged; the canary role is never touched', async () => {
    const fake = freshFake()
    const first = await syncRoles(fake)
    // one update: the Sync writer role is assigned to prestigo-sync
    expect(first).toContain(`roles: create=${ROLE_COUNT} update=1 unchanged=0 skipped=0 removed=0`)
    const second = await syncRoles(fake)
    expect(second).toContain(`roles: create=0 update=0 unchanged=${ROLE_COUNT} skipped=0 removed=0`)

    const stored = fake.state.records.Role
    expect(stored.map((r: any) => r.name).sort()).toEqual(['Dispatcher', 'Restore drill canary', 'Sales manager', 'Sync writer'])
    expect(stored.find((r: any) => r.name === 'Restore drill canary').data).toEqual({ Account: { read: 'own' } })

    const canaryWrites = fake.requests.filter(
      (r) => r.method !== 'GET' && r.path.startsWith('/Role/') && r.path.endsWith('a00000000000000c1'),
    )
    expect(canaryWrites).toHaveLength(0)
    expect(fake.requests.some((r) => r.method === 'GET' && r.path === '/Role/a00000000000000c1')).toBe(false)
  })

  it('stores the expanded field rules and the permission values', async () => {
    const fake = freshFake()
    await syncRoles(fake)
    const dispatcher = fake.state.records.Role.find((r: any) => r.name === 'Dispatcher')
    expect(Object.keys(dispatcher.fieldData.Account)).toHaveLength(9)
    expect(dispatcher.exportPermission).toBe('no')
    expect(dispatcher.assignTo).toBeUndefined()
  })

  it('updates a drifted managed role', async () => {
    const fake = freshFake()
    await syncRoles(fake)
    const dispatcher = fake.state.records.Role.find((r: any) => r.name === 'Dispatcher')
    dispatcher.data.Opportunity = { create: 'yes', read: 'all', edit: 'all', delete: 'all' }
    const lines = await syncRoles(fake)
    expect(lines).toContain(`roles: create=0 update=1 unchanged=${ROLE_COUNT - 1} skipped=0 removed=0`)
    expect(fake.state.records.Role.find((r: any) => r.name === 'Dispatcher').data.Opportunity).toBe(false)
  })

  it('rejects a permission value the live Role metadata does not offer', async () => {
    const fake = freshFake()
    const rolesJson = { roles: [{ ...ROLES_JSON.roles[0], exportPermission: 'sometimes' }] }
    await expect(syncRoles(fake, rolesJson)).rejects.toBeInstanceOf(EspoConfigError)
    expect(fake.requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
  })
})

const spec = (name: string) => buildRoleSpecs(ROLES_JSON, FIELDS_JSON).find((s: any) => s.name === name)
const noAccess = (acl: any) => acl === undefined || acl === false || acl.read === 'no'

describe('role invariants (D-15, D-16, D-17, D-22)', () => {
  it('Dispatcher: no Opportunity, CPartnerRate or Email; every commercial Account field is hidden', () => {
    const d = spec('Dispatcher')
    expect(d.data.Opportunity).toBe(false)
    expect(d.data.CPartnerRate).toBe(false)
    expect(d.data.Email).toBe(false)
    const hidden = Object.keys(d.fieldData.Account)
    for (const name of commercialFinalNames()) expect(hidden).toContain(name)
    expect(hidden).toHaveLength(commercialFinalNames().length)
  })

  it('both human roles: CBooking is read-only and Contact/Account/CBooking are readable at level all', () => {
    for (const role of ['Dispatcher', 'Sales manager']) {
      const r = spec(role)
      expect(r.data.CBooking).toEqual({ create: 'no', read: 'all', edit: 'no', delete: 'no' })
      expect(r.data.Contact.read).toBe('all')
      expect(r.data.Account.read).toBe('all')
    }
  })

  it('Sync writer is the only managed role that can create or edit a CBooking', () => {
    const writers = buildRoleSpecs(ROLES_JSON, FIELDS_JSON)
      .filter((r: any) => r.data.CBooking && (r.data.CBooking.create !== 'no' || r.data.CBooking.edit !== 'no'))
      .map((r: any) => r.name)
    expect(writers).toEqual(['Sync writer'])
  })

  it('Sync writer: Account, Contact, CBooking only; no Opportunity, CPartnerRate or Email; no delete anywhere', () => {
    const w = spec('Sync writer')
    expect(Object.keys(w.data).filter((k) => w.data[k] !== false).sort()).toEqual(['Account', 'CBooking', 'Contact'])
    for (const scope of ['Opportunity', 'CPartnerRate', 'Email']) expect(noAccess(w.data[scope])).toBe(true)
    for (const acl of Object.values<any>(w.data)) if (acl && typeof acl === 'object') expect(acl.delete).toBe('no')
    expect(w.data.CBooking).toEqual({ create: 'yes', read: 'all', edit: 'all', delete: 'no' })
    expect(w.assignTo).toEqual(['prestigo-sync'])
  })

  it('Sales manager: writes Accounts, Contacts, Opportunities and CPartnerRate, never deletes Accounts or Contacts', () => {
    const s = spec('Sales manager')
    for (const scope of ['Account', 'Contact', 'Opportunity', 'CPartnerRate']) {
      expect(s.data[scope].create).toBe('yes')
      expect(s.data[scope].edit).toBe('all')
    }
    expect(s.data.Account.delete).toBe('no')
    expect(s.data.Contact.delete).toBe('no')
    expect(s.fieldData).toEqual({})
  })

  it('the human roles forbid export and mass update', () => {
    for (const role of ['Dispatcher', 'Sales manager']) {
      expect(spec(role).exportPermission).toBe('no')
      expect(spec(role).massUpdatePermission).toBe('no')
    }
  })

  it('only the Sync writer is assigned to a user, and it is prestigo-sync', () => {
    const assigned = buildRoleSpecs(ROLES_JSON, FIELDS_JSON).filter((r: any) => r.assignTo)
    expect(assigned.map((r: any) => r.name)).toEqual(['Sync writer'])
    expect(JSON.stringify(ROLES_JSON).match(/"prestigo-sync"/g)).toHaveLength(1)
  })
})

describe('api key hygiene', () => {
  const load = (key: string) => loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: key } })

  it('rejects a key with a stray non-ASCII character (clear config error, key never echoed)', () => {
    const bad = `\u0433${'a'.repeat(32)}`
    let message = ''
    try {
      load(bad)
    } catch (e) {
      expect(e).toBeInstanceOf(EspoConfigError)
      message = (e as Error).message
    }
    expect(message).toContain('ESPOCRM_API_KEY')
    expect(message).not.toContain('aaaa')
  })

  it('accepts a plain hex key', () => {
    expect(load('0123456789abcdef0123456789abcdef').apiKey).toHaveLength(32)
  })
})

describe('role assignment', () => {
  const syncUser = (fake: Fake) => fake.state.records.User.find((u: any) => u.userName === 'prestigo-sync')

  it('adds the Sync writer role to prestigo-sync, keeps the existing role id, and a second run writes no /User', async () => {
    const fake = freshFake()
    await syncRoles(fake)
    const writerId = fake.state.records.Role.find((r: any) => r.name === 'Sync writer').id
    expect(syncUser(fake).rolesIds).toEqual(['a00000000000000c1', writerId])

    const before = fake.requests.length
    const lines = await syncRoles(fake)
    expect(lines).toContain(`roles: create=0 update=0 unchanged=${ROLE_COUNT} skipped=0 removed=0`)
    expect(fake.requests.slice(before).filter((r) => r.method !== 'GET')).toHaveLength(0)
  })

  it('refuses to guess when the user to assign does not exist', async () => {
    const fake = freshFake({ User: [] })
    await expect(syncRoles(fake)).rejects.toBeInstanceOf(EspoConfigError)
  })
})

describe('buildAclExpectations', () => {
  const specs = buildRoleSpecs(ROLES_JSON, FIELDS_JSON)
  const labels = (role: string) =>
    buildAclExpectations(specs, FIELDS_JSON)
      .filter((c: any) => c.role === role)
      .map((c: any) => c.label)

  it('Dispatcher: Opportunity is forbidden and every commercial Account field is hidden', () => {
    const l = labels('Dispatcher')
    expect(l).toContain('GET /Opportunity forbidden')
    expect(l).toContain('GET /Account/{id} hides cCommissionPercent')
    for (const name of commercialFinalNames()) expect(l).toContain(`GET /Account/{id} hides ${name}`)
  })

  it('a forbidden check means 403, never "anything but 2xx"', () => {
    for (const c of buildAclExpectations(specs, FIELDS_JSON)) {
      if (c.expect === 'forbidden') expect(c.status).toBe(403)
    }
  })
})

// --------------------------------------------------------------------------------------------
// runner against the fake, with a tiny role-enforcing hook (Dispatcher: no Opportunity, no money)
// --------------------------------------------------------------------------------------------

function enforcingFake(options: { leak?: boolean } = {}) {
  return createFakeEspoCRM({
    metadata: roleMetadata(),
    records: { Role: [], User: [{ id: 'b00000000000000a1', userName: 'prestigo-sync', type: 'api', rolesIds: [] }] },
    extraRoutes: (req: FakeReq, state) => {
      const key = req.headers['x-api-key']
      if (!key) return undefined
      const user = state.records.User.find((u: any) => u.apiKey === key)
      if (!user || !String(user.userName).startsWith('acl-probe-')) return undefined
      if (req.method === 'GET' && /^\/(Opportunity|CPartnerRate|Email)(\/|$)/.test(req.path)) return new Response('', { status: 403 })
      const account = req.path.match(/^\/Account\/([0-9a-f]{17})$/)
      if (req.method === 'GET' && account && !options.leak) {
        const rec = state.records.Account.find((a: any) => a.id === account[1])
        const copy = { ...rec }
        for (const f of Object.keys(copy)) if (/^c[A-Z]/.test(f)) delete copy[f]
        return new Response(JSON.stringify(copy), { status: 200 })
      }
      return undefined
    },
  })
}

describe('runAclProbe (Dispatcher tracer)', () => {
  const run = async (fake: Fake) => {
    const roles = buildRoleSpecs(ROLES_JSON, FIELDS_JSON)
    const admin = adminClient(fake)
    // the managed role must exist live before the probe
    await syncRoles(fake)
    return runAclProbe({
      admin,
      makeClient: (apiKey: string) => apiClient(fake, apiKey),
      roleSpecs: roles,
      fieldsJson: FIELDS_JSON,
      only: 'Dispatcher',
    })
  }

  it('passes, and deletes the probe user and the Account fixture', async () => {
    const fake = enforcingFake()
    const result = await run(fake)
    expect(result.fail).toBe(0)
    expect(result.pass).toBeGreaterThanOrEqual(2)
    expect(result.lines.some((l: string) => l === 'PASS Dispatcher GET /Opportunity forbidden')).toBe(true)
    expect(fake.state.records.User.filter((u: any) => String(u.userName).startsWith('acl-probe'))).toHaveLength(0)
    expect(fake.state.records.Account ?? []).toHaveLength(0)
  })

  it('reports FAIL (not a pass) when a commercial field leaks to the probe user, and still cleans up', async () => {
    const fake = enforcingFake({ leak: true })
    const result = await run(fake)
    expect(result.fail).toBeGreaterThan(0)
    expect(result.lines.some((l: string) => l.startsWith('FAIL Dispatcher GET /Account/{id} hides cCommissionPercent'))).toBe(true)
    expect(fake.state.records.User.filter((u: any) => String(u.userName).startsWith('acl-probe'))).toHaveLength(0)
    expect(fake.state.records.Account ?? []).toHaveLength(0)
  })

  it('never prints the generated api key', async () => {
    const fake = enforcingFake()
    const result = await run(fake)
    expect(result.lines.join('\n')).not.toMatch(/key_GEN_/)
  })
})
