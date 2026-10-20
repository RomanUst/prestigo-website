// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 07 - operator roles as code (CRM-05, D-15/D-16/D-17/D-22): the
 * `roles` sync resource, the role invariants pinned to infra/espocrm/roles.json and the
 * expectation builder / runner of infra/espocrm/verify-acl.mjs, all against the
 * in-memory fake. No test here makes a network call or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EspoConfigError, createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import { buildRoleSpecs, runSync } from '../infra/espocrm/sync.mjs'
import { AclInterruptedError, buildAclExpectations, runAclProbe, scanForSecrets } from '../infra/espocrm/verify-acl.mjs'
import { createFakeEspoCRM, stockEspoMetadata, type FakeReq } from './helpers/fake-espocrm'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://crm.example.test'
const readJson = (file: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm', file), 'utf8'))
const ROLES_JSON = readJson('roles.json')
const ROLE_COUNT = ROLES_JSON.roles.length
const FIELDS_JSON = readJson('fields.json')

type Fake = ReturnType<typeof createFakeEspoCRM>

/** The .mjs return type is inferred narrowly; the assertions below index it loosely. */
const specsOf = (): any[] => buildRoleSpecs(ROLES_JSON, FIELDS_JSON)

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
    const specs = specsOf()
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

const spec = (name: string) => specsOf().find((s: any) => s.name === name)
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
    const writers = specsOf()
      .filter((r: any) => r.data.CBooking && (r.data.CBooking.create !== 'no' || r.data.CBooking.edit !== 'no'))
      .map((r: any) => r.name)
    expect(writers).toEqual(['Sync writer'])
  })

  it('Sync writer: Account, Contact, CBooking, Lead (+ User read for assignment); no Opportunity, CPartnerRate, Email or Task; delete only on Lead (D-22) and Contact (GDPR erasure, plan 82-12)', () => {
    const w = spec('Sync writer')
    expect(Object.keys(w.data).filter((k) => w.data[k] !== false).sort()).toEqual(['Account', 'CBooking', 'Contact', 'Lead', 'User'])
    // User is read-only: needed to relate assignedUser (EspoCRM 403 cannotRelateForbidden otherwise)
    expect(w.data.User).toEqual({ read: 'all' })
    for (const scope of ['Opportunity', 'CPartnerRate', 'Email', 'Task']) expect(noAccess(w.data[scope])).toBe(true)
    for (const [scope, acl] of Object.entries<any>(w.data)) {
      if (acl && typeof acl === 'object' && scope !== 'User') expect(acl.delete, scope).toBe(scope === 'Lead' || scope === 'Contact' ? 'all' : 'no')
    }
    expect(w.data.CBooking).toEqual({ create: 'yes', read: 'all', edit: 'all', delete: 'no' })
    // Plan 82-12 (D-09): the erasure saga scrubs then deletes the person's Contacts; Account and CBooking stay undeletable.
    expect(w.data.Contact).toEqual({ create: 'yes', read: 'all', edit: 'all', delete: 'all' })
    expect(w.data.Account.delete).toBe('no')
    expect(w.data.Lead).toEqual({ create: 'yes', read: 'all', edit: 'all', delete: 'all' })
    expect(w.assignTo).toEqual(['prestigo-sync'])
  })

  it('Sync writer may assign records to other users (D-13: site Leads go to the owner); no other role is widened', () => {
    // Without it EspoCRM answers 403 "Assignment failure" on every Lead create with assignedUserId.
    expect(spec('Sync writer').assignmentPermission).toBe('all')
    expect(spec('Dispatcher').assignmentPermission).toBeUndefined()
    expect(spec('Sales manager').assignmentPermission).toBeUndefined()
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

  it('D-22: Dispatcher has no Lead access at all, Sales manager has full Lead access', () => {
    expect(spec('Dispatcher').data.Lead).toBe(false)
    expect(spec('Sales manager').data.Lead).toEqual({ create: 'yes', read: 'all', edit: 'all', delete: 'all' })
  })

  it('the human roles forbid export and mass update', () => {
    for (const role of ['Dispatcher', 'Sales manager']) {
      expect(spec(role).exportPermission).toBe('no')
      expect(spec(role).massUpdatePermission).toBe('no')
    }
  })

  it('only the Sync writer is assigned to a user, and it is prestigo-sync', () => {
    const assigned = specsOf().filter((r: any) => r.assignTo)
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
  const specs = specsOf()
  const all = buildAclExpectations(specs, FIELDS_JSON)
  const labels = (role: string) => all.filter((c: any) => c.role === role).map((c: any) => c.label)

  it('Dispatcher: Opportunity is forbidden and every commercial Account field is hidden', () => {
    const l = labels('Dispatcher')
    expect(l).toContain('GET /Opportunity forbidden')
    expect(l).toContain('GET /Account/{id} hides cCommissionPercent')
    for (const name of commercialFinalNames()) expect(l).toContain(`GET /Account/{id} hides ${name}`)
  })

  it('Dispatcher: reads Contact, Account and CBooking; Opportunity, CPartnerRate and Email are forbidden', () => {
    const l = labels('Dispatcher')
    for (const scope of ['Contact', 'Account', 'CBooking']) expect(l).toContain(`GET /${scope} allowed`)
    for (const scope of ['Opportunity', 'CPartnerRate', 'Email']) expect(l).toContain(`GET /${scope} forbidden`)
  })

  it('Dispatcher: CBooking POST, PUT and DELETE are forbidden, and so is the contract file download', () => {
    const l = labels('Dispatcher')
    expect(l).toContain('POST /CBooking forbidden')
    expect(l).toContain('PUT /CBooking/{id} forbidden')
    expect(l).toContain('DELETE /CBooking/{id} forbidden')
    expect(l).toContain('GET /Attachment/file/{id} forbidden for the contract file')
  })

  it('Sales manager: reads Opportunity and CPartnerRate, sees every commercial field, cannot touch bookings or delete accounts', () => {
    const l = labels('Sales manager')
    expect(l).toContain('GET /Opportunity allowed')
    expect(l).toContain('GET /CPartnerRate allowed')
    for (const name of commercialFinalNames()) expect(l).toContain(`GET /Account/{id} shows ${name}`)
    expect(l).toContain('GET /Attachment/file/{id} allowed for the contract file')
    for (const verb of ['POST /CBooking', 'PUT /CBooking/{id}', 'DELETE /CBooking/{id}']) expect(l).toContain(`${verb} forbidden`)
    expect(l).toContain('DELETE /Account/{id} forbidden')
    expect(l).toContain('DELETE /Contact/{id} forbidden')
    expect(l).toContain('PUT /Account/{id} allowed')
  })

  it('Sync writer: creates and edits CBooking, cannot delete it, cannot read Opportunity', () => {
    const l = labels('Sync writer')
    expect(l).toContain('POST /CBooking allowed')
    expect(l).toContain('PUT /CBooking/{id} allowed')
    expect(l).toContain('DELETE /CBooking/{id} forbidden')
    expect(l).toContain('GET /Opportunity forbidden')
    expect(l).toContain('GET /CPartnerRate forbidden')
    expect(l).toContain('GET /Email forbidden')
  })

  it('D-22 Lead: Dispatcher GET is forbidden; Sales manager and Sync writer create, edit and delete a Lead', () => {
    expect(labels('Dispatcher')).toContain('GET /Lead forbidden')
    expect(labels('Dispatcher').filter((l: string) => l.includes('/Lead') && !l.startsWith('GET'))).toEqual([])
    for (const role of ['Sales manager', 'Sync writer']) {
      const l = labels(role)
      for (const verb of ['GET /Lead', 'POST /Lead', 'PUT /Lead/{id}', 'DELETE /Lead/{id}']) expect(l, role).toContain(`${verb} allowed`)
    }
  })

  it('the allowed Lead DELETE removes a throw-away record, never the shared Lead fixture', () => {
    const del = all.filter((c: any) => c.label === 'DELETE /Lead/{id} allowed')
    expect(del).toHaveLength(2)
    for (const c of del) {
      expect(c.fixture).toBe('disposable')
      expect(c.disposable).toBe('Lead')
    }
    expect(all.find((c: any) => c.label === 'PUT /Lead/{id} allowed').fixture).toBe('lead')
  })

  it('a forbidden check means 403 (or 404 for the attachment), never "anything but 2xx"', () => {
    for (const c of all) {
      if (c.expect !== 'forbidden') continue
      const accepted: number[] = c.statuses ?? [c.status]
      expect(accepted.length).toBeGreaterThan(0)
      for (const status of accepted) expect([403, 404]).toContain(status)
    }
  })

  it('roles are probed in a stable order with deletes last for each role', () => {
    for (const role of ['Dispatcher', 'Sales manager', 'Sync writer']) {
      const methods = all.filter((c: any) => c.role === role).map((c: any) => c.method)
      const firstDelete = methods.indexOf('DELETE')
      if (firstDelete >= 0) expect(methods.slice(firstDelete).every((m: string) => m === 'DELETE')).toBe(true)
    }
  })
})

describe('output self-check', () => {
  it('scanForSecrets flags a key that appears in any line and ignores empty secrets', () => {
    expect(scanForSecrets(['PASS a', 'PASS b'], ['key_SECRET_zzz'])).toBe(false)
    expect(scanForSecrets(['PASS a', 'FAIL b key_SECRET_zzz'], ['key_SECRET_zzz'])).toBe(true)
    expect(scanForSecrets(['PASS a'], ['', undefined as any])).toBe(false)
  })

  it('the runner reports leaked=true when a secret turns up in what it prints, and leaked=false otherwise', async () => {
    const clean = await probe(aclFake(), { only: 'Dispatcher' })
    expect(clean.leaked).toBe(false)
    const leaky = await probe(aclFake(), { only: 'Dispatcher', extraSecrets: ['GET /Opportunity forbidden'] })
    expect(leaky.leaked).toBe(true)
  })
})

// --------------------------------------------------------------------------------------------
// runner against the fake, with a role-enforcing hook that applies the stored Role record
// --------------------------------------------------------------------------------------------

const SYNC_KEY = 'key_SECRET_abcdef0123' // the fake's default prestigo-sync key

/** Enforces the Role records stored by the roles resource like the live ACL would (absent scope = 403). */
function aclFake() {
  return createFakeEspoCRM({
    metadata: roleMetadata(),
    records: { Role: [], User: [{ id: 'b00000000000000a1', userName: 'prestigo-sync', type: 'api', rolesIds: [] }] },
    extraRoutes: (req: FakeReq, state) => {
      const key = req.headers['x-api-key']
      if (!key) return undefined
      const user =
        state.records.User.find((u: any) => u.apiKey === key) ??
        (key === SYNC_KEY ? state.records.User.find((u: any) => u.userName === 'prestigo-sync') : undefined)
      if (!user) return undefined
      const role = state.records.Role.find((r: any) => r.id === (user.rolesIds ?? [])[0])
      const deny = () => new Response('', { status: 403 })

      if (/^\/Attachment\/file\//.test(req.path)) {
        return role?.fieldData?.Account?.cContractFile?.read === 'no' ? deny() : new Response('acl probe contract', { status: 200 })
      }
      const m = req.path.match(/^\/([A-Za-z]+)(?:\/([0-9a-f]{17}))?$/)
      if (!m) return undefined
      const acl = role?.data?.[m[1]]
      if (!acl) return deny()
      const level =
        req.method === 'GET' ? acl.read : req.method === 'POST' ? acl.create : req.method === 'PUT' ? acl.edit : acl.delete
      if (level === 'no' || level === undefined) return deny()
      if (req.method === 'GET' && m[1] === 'Account' && m[2]) {
        const rec = { ...state.records.Account.find((a: any) => a.id === m[2]) }
        for (const [field, rule] of Object.entries<any>(role?.fieldData?.Account ?? {})) {
          if (rule.read === 'no') for (const k of [field, `${field}Id`, `${field}Name`]) delete rec[k]
        }
        return new Response(JSON.stringify(rec), { status: 200 })
      }
      return undefined
    },
  })
}

async function probe(fake: Fake, options: { only?: string; syncClient?: any; extraSecrets?: string[] } = {}) {
  await syncRoles(fake)
  return runAclProbe({
    admin: adminClient(fake),
    makeClient: (apiKey: string) => apiClient(fake, apiKey),
    roleSpecs: specsOf(),
    fieldsJson: FIELDS_JSON,
    ...options,
  })
}

const noProbeLeftovers = (fake: Fake) => {
  const r = fake.state.records
  expect((r.User ?? []).filter((u: any) => String(u.userName).startsWith('acl-probe'))).toHaveLength(0)
  for (const scope of ['Account', 'Contact', 'CBooking', 'Attachment', 'Lead']) expect(r[scope] ?? []).toHaveLength(0)
}

describe('runAclProbe (all roles)', () => {
  it('passes for the shipped roles and leaves no probe user, Account, Contact, Booking or attachment', async () => {
    const fake = aclFake()
    const result = await probe(fake)
    expect(result.lines.filter((l: string) => l.startsWith('FAIL'))).toEqual([])
    expect(result.fail).toBe(0)
    expect(result.pass).toBeGreaterThan(40)
    expect(result.leaked).toBe(false)
    noProbeLeftovers(fake)
    for (const role of ['Dispatcher', 'Sales manager', 'Sync writer']) {
      expect(result.lines.some((l: string) => l.startsWith(`PASS ${role} `))).toBe(true)
    }
  })

  it('the Sync writer checks use the real prestigo-sync client when given, and then create no probe user for it', async () => {
    const fake = aclFake()
    const result = await probe(fake, { syncClient: apiClient(fake, SYNC_KEY), only: 'Sync writer' })
    expect(result.fail).toBe(0)
    expect(result.lines).toContain('PASS Sync writer is assigned to prestigo-sync')
    expect(fake.requests.filter((r) => r.method === 'POST' && r.path === '/User')).toHaveLength(0)
    noProbeLeftovers(fake)
  })

  it('FAILs when a commercial field leaks to the Dispatcher, and still cleans up', async () => {
    const fake = aclFake()
    // The probe runs after the roles resource: drift the live role between the sync and the probe.
    await syncRoles(fake)
    const dispatcher = fake.state.records.Role.find((r: any) => r.name === 'Dispatcher')
    delete dispatcher.fieldData.Account.cCommissionPercent
    const result = await runAclProbe({
      admin: adminClient(fake),
      makeClient: (apiKey: string) => apiClient(fake, apiKey),
      roleSpecs: specsOf(),
      fieldsJson: FIELDS_JSON,
      only: 'Dispatcher',
    })
    expect(result.lines.some((l: string) => l.startsWith('FAIL Dispatcher GET /Account/{id} hides cCommissionPercent'))).toBe(true)
    expect(result.fail).toBe(1)
    noProbeLeftovers(fake)
  })

  it('FAILs when the Dispatcher can read Opportunity, and when a human role can write bookings', async () => {
    const fake = aclFake()
    await syncRoles(fake)
    const dispatcher = fake.state.records.Role.find((r: any) => r.name === 'Dispatcher')
    dispatcher.data.Opportunity = { create: 'no', read: 'all', edit: 'no', delete: 'no' }
    dispatcher.data.CBooking.edit = 'all'
    const result = await runAclProbe({
      admin: adminClient(fake),
      makeClient: (apiKey: string) => apiClient(fake, apiKey),
      roleSpecs: specsOf(),
      fieldsJson: FIELDS_JSON,
      only: 'Dispatcher',
    })
    expect(result.lines).toContain('FAIL Dispatcher GET /Opportunity forbidden (got 200)')
    expect(result.lines).toContain('FAIL Dispatcher PUT /CBooking/{id} forbidden (got 200)')
    expect(result.fail).toBe(2)
    noProbeLeftovers(fake)
  })

  it('FAILs when the contract file can be downloaded by the Dispatcher (A6)', async () => {
    const fake = aclFake()
    await syncRoles(fake)
    const dispatcher = fake.state.records.Role.find((r: any) => r.name === 'Dispatcher')
    delete dispatcher.fieldData.Account.cContractFile
    const result = await runAclProbe({
      admin: adminClient(fake),
      makeClient: (apiKey: string) => apiClient(fake, apiKey),
      roleSpecs: specsOf(),
      fieldsJson: FIELDS_JSON,
      only: 'Dispatcher',
    })
    expect(result.lines.some((l: string) => l.startsWith('FAIL Dispatcher GET /Attachment/file/{id} forbidden for the contract file (got 200)'))).toBe(true)
  })

  it('never prints a generated api key', async () => {
    const result = await probe(aclFake())
    expect(result.lines.join('\n')).not.toMatch(/key_GEN_|key_SECRET_/)
  })

  it('the output lines carry no record data: only role, check label and a status', async () => {
    const result = await probe(aclFake())
    for (const line of result.lines) expect(line).toMatch(/^(PASS|FAIL) (Dispatcher|Sales manager|Sync writer) [A-Za-z /{}]+/)
    expect(result.lines.join('\n')).not.toMatch(/PROBE|@|acl-probe/)
  })

  it('IN-05: SIGINT stops at the next step and still deletes every probe object', async () => {
    const fake = aclFake()
    await syncRoles(fake)
    const base = adminClient(fake)
    const signals = new EventEmitter()
    const admin = {
      async request(method: string, apiPath: string, body?: unknown) {
        const out = await base.request(method, apiPath, body)
        if (method === 'POST' && apiPath === '/Contact') signals.emit('SIGINT')
        return out
      },
    }
    await expect(
      runAclProbe({
        admin,
        makeClient: (apiKey: string) => apiClient(fake, apiKey),
        roleSpecs: specsOf(),
        fieldsJson: FIELDS_JSON,
        interruptSource: signals,
      }),
    ).rejects.toBeInstanceOf(AclInterruptedError)
    noProbeLeftovers(fake)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('IN-05: a failed cleanup names the leftover objects (scope/id) and the probe prefix', async () => {
    const fake = aclFake()
    await syncRoles(fake)
    const base = adminClient(fake)
    const admin = {
      async request(method: string, apiPath: string, body?: unknown) {
        if (method === 'DELETE' && apiPath.startsWith('/Contact/')) throw new Error('delete refused')
        return base.request(method, apiPath, body)
      },
    }
    const result = await runAclProbe({
      admin,
      makeClient: (apiKey: string) => apiClient(fake, apiKey),
      roleSpecs: specsOf(),
      fieldsJson: FIELDS_JSON,
      only: 'Dispatcher',
      interruptSource: new EventEmitter(),
    })
    const contactId = fake.state.records.Contact[0].id
    const line = result.lines.find((l: string) => l.startsWith('FAIL cleanup'))
    expect(line).toContain('1 probe object(s) could not be deleted')
    expect(line).toContain(`Contact/${contactId}`)
    expect(line).toContain('acl-probe')
    expect(result.fail).toBe(1)
  })

  it('rejects an unknown role name', async () => {
    await expect(probe(aclFake(), { only: 'Nobody' })).rejects.toBeInstanceOf(EspoConfigError)
  })
})
