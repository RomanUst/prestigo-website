#!/usr/bin/env node
/**
 * infra/espocrm/verify-acl.mjs
 *
 * Live ACL probe for the operator roles (Phase 80 plan 07, CRM-05, D-15/D-16/D-22). For each
 * managed role the admin identity creates a throw-away API user that holds only that role,
 * the script calls the CRM with that user's key and compares every answer with what
 * roles.json promises, then deletes the user again. Fixtures (an Account carrying commercial
 * values) are created by the admin and removed in the same `finally`.
 *
 *   node infra/espocrm/verify-acl.mjs [--role "Dispatcher"]
 *
 * Output: one line per check `PASS|FAIL {role} {check}` (no names, emails, record data or keys;
 * a FAIL carries the HTTP status), then `acl: pass=N fail=M`.
 * Exit codes: 0 all pass, 1 config error, 2 API error, 3 any FAIL.
 *
 * Secrets: the probe keys exist only in memory (never written, never logged). "Forbidden"
 * means exactly HTTP 403, "allowed" means a 2xx answer: a 5xx can never satisfy a check.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import { buildRoleSpecs } from './sync.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROBE_PREFIX = 'acl-probe'

const ucFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1)
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------------------
// Expectations (pure)
// ---------------------------------------------------------------------------

/** Boolean-type scopes have no REST endpoint to probe. */
const BOOLEAN_SCOPES = new Set(['EmailAccountScope'])
/**
 * Boolean scopes that do have a list endpoint: a role holding `true` must get a 2xx on GET, every other
 * role exactly 403. Webhook (Phase 83): only the Sync writer owns the webhook that carries skipOwn.
 */
const PROBED_BOOLEAN_SCOPES = ['Webhook']
/** A role that does not grant these (false or absent) must get exactly 403 on them. */
const SENSITIVE_SCOPES = ['Opportunity', 'CPartnerRate', 'Email']
/** Scopes whose writes the probe exercises, with the fixture a PUT/DELETE targets. */
const WRITE_SCOPES = {
  Account: { fixture: 'account', create: { name: 'ACL Probe {uid}' }, edit: { description: 'acl probe edit' } },
  Contact: { fixture: 'contact', create: { lastName: 'ACL Probe {uid}' }, edit: { description: 'acl probe edit' } },
  CBooking: {
    fixture: 'booking',
    create: { name: 'ACL Probe {uid}', supabaseBookingId: 'acl-probe-{uid}' },
    edit: { name: 'ACL Probe edited' },
  },
  // Lead (Phase 81, D-22): cSupabaseRef is the c-prefixed site-reference field from fields.json.
  Lead: {
    fixture: 'lead',
    create: { lastName: 'ACL Probe {uid}', cSupabaseRef: 'acl-probe:{uid}' },
    edit: { description: 'acl probe edit' },
    deletable: true,
  },
}
/** Order inside a role: reads first, deletes last (an unexpected delete must not hide later checks). */
const PHASE = { read: 0, field: 1, attachment: 2, put: 3, post: 4, delete: 5 }

/** Attributes a field occupies in a record payload (a file/link field adds Id and Name). */
export const fieldAttributes = (finalName) => [finalName, `${finalName}Id`, `${finalName}Name`]

const finalAccountField = (spec) => `c${ucFirst(spec.name)}`

/**
 * Pure: the checks the live CRM must satisfy, derived from the role specs.
 * Each check: { role, label, expect, method, path, status?, statuses?, fixture, attrs?, body?, track? }
 * where `expect` is forbidden (exactly 403, or one of `statuses`) | allowed (2xx) | hidden (2xx and
 * none of attrs in the record) | visible (2xx and some attr present). `{id}` in a path is filled
 * from `fixture` (account | contact | booking | lead | attachment | disposable) by the runner;
 * `disposable` is a record of the scope named in `disposable`, created by the admin right before the check; `{uid}` in a body is a
 * per-run unique token; `track` names a scope whose created record the runner deletes afterwards.
 */
export function buildAclExpectations(roleSpecs, fieldsJson) {
  const commercial = (fieldsJson?.fields?.Account ?? []).filter((f) => f.commercial === true)
  const checks = []
  for (const spec of roleSpecs) {
    const role = spec.name
    const add = (phase, check) => checks.push({ role, phase, ...check })

    for (const [scope, acl] of Object.entries(spec.data)) {
      if (BOOLEAN_SCOPES.has(scope) || PROBED_BOOLEAN_SCOPES.includes(scope)) continue
      if (acl === false) {
        add('read', { label: `GET /${scope} forbidden`, expect: 'forbidden', method: 'GET', path: `/${scope}?maxSize=1`, status: 403, fixture: null })
      } else if (isPlainObject(acl) && acl.read !== 'no') {
        add('read', { label: `GET /${scope} allowed`, expect: 'allowed', method: 'GET', path: `/${scope}?maxSize=1`, fixture: null })
      }
    }
    for (const scope of PROBED_BOOLEAN_SCOPES) {
      if (spec.data[scope] === true) {
        add('read', { label: `GET /${scope} allowed`, expect: 'allowed', method: 'GET', path: `/${scope}?maxSize=1`, fixture: null })
      } else {
        add('read', { label: `GET /${scope} forbidden`, expect: 'forbidden', method: 'GET', path: `/${scope}?maxSize=1`, status: 403, fixture: null })
      }
    }
    for (const scope of SENSITIVE_SCOPES) {
      if (spec.data[scope] === undefined) {
        add('read', { label: `GET /${scope} forbidden`, expect: 'forbidden', method: 'GET', path: `/${scope}?maxSize=1`, status: 403, fixture: null })
      }
    }

    for (const [scope, write] of Object.entries(WRITE_SCOPES)) {
      const acl = spec.data[scope]
      if (!isPlainObject(acl)) continue
      const created = acl.create === 'yes'
      add('post', {
        label: `POST /${scope} ${created ? 'allowed' : 'forbidden'}`,
        expect: created ? 'allowed' : 'forbidden',
        method: 'POST',
        path: `/${scope}`,
        body: write.create,
        status: 403,
        fixture: null,
        ...(created ? { track: scope } : {}),
      })
      const edited = acl.edit !== 'no'
      add('put', {
        label: `PUT /${scope}/{id} ${edited ? 'allowed' : 'forbidden'}`,
        expect: edited ? 'allowed' : 'forbidden',
        method: 'PUT',
        path: `/${scope}/{id}`,
        body: write.edit,
        status: 403,
        fixture: write.fixture,
      })
      if (acl.delete === 'no') {
        add('delete', {
          label: `DELETE /${scope}/{id} forbidden`,
          expect: 'forbidden',
          method: 'DELETE',
          path: `/${scope}/{id}`,
          status: 403,
          fixture: write.fixture,
        })
      } else if (write.deletable && acl.delete === 'all') {
        // An allowed delete consumes its target, so it runs on a throw-away record the runner creates
        // right before the check (the shared fixture must survive for the next role's PUT).
        add('delete', {
          label: `DELETE /${scope}/{id} allowed`,
          expect: 'allowed',
          method: 'DELETE',
          path: `/${scope}/{id}`,
          fixture: 'disposable',
          disposable: scope,
        })
      }
    }

    const account = spec.data.Account
    if (isPlainObject(account) && account.read !== 'no') {
      const rules = spec.fieldData?.Account ?? {}
      for (const f of commercial) {
        const name = finalAccountField(f)
        const hidden = rules[name]?.read === 'no'
        add('field', {
          label: `GET /Account/{id} ${hidden ? 'hides' : 'shows'} ${name}`,
          expect: hidden ? 'hidden' : 'visible',
          method: 'GET',
          path: '/Account/{id}',
          fixture: 'account',
          attrs: fieldAttributes(name),
        })
        if (f.type === 'file') {
          add('attachment', {
            label: `GET /Attachment/file/{id} ${hidden ? 'forbidden for the contract file' : 'allowed for the contract file'}`,
            expect: hidden ? 'forbidden' : 'allowed',
            method: 'GET',
            path: '/Attachment/file/{id}',
            statuses: [403, 404],
            fixture: 'attachment',
          })
        }
      }
    }
  }
  return checks.sort((a, b) => a.role.localeCompare(b.role) || PHASE[a.phase] - PHASE[b.phase])
}

/** True when any printed line contains one of the secrets (probe keys, the sync key). */
export function scanForSecrets(lines, secrets) {
  return secrets.filter(Boolean).some((secret) => lines.some((line) => String(line).includes(secret)))
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A value the field type accepts, for the Account fixture's commercial fields. */
function sampleValue(def, finalName) {
  switch (def.type) {
    case 'float':
    case 'currency':
      return Math.min(def.max ?? 12.5, Math.max(def.min ?? 0, 12.5))
    case 'int':
      return Math.min(def.max ?? 7, Math.max(def.min ?? 0, 7))
    case 'bool':
      return true
    case 'date':
      return '2030-01-01'
    case 'enum':
      return (def.options ?? []).find((o) => o !== '') ?? undefined
    case 'varchar':
    case 'text':
      return `PROBE ${finalName}`.slice(0, def.maxLength ?? 30)
    default:
      return undefined
  }
}

const commercialSpecs = (fieldsJson) => (fieldsJson?.fields?.Account ?? []).filter((f) => f.commercial === true)
const accountFinalName = (spec) => `c${ucFirst(spec.name)}`

function commercialValues(fieldsJson) {
  const values = {}
  for (const spec of commercialSpecs(fieldsJson)) {
    if (spec.type === 'file') continue // attached separately
    const value = sampleValue(spec, accountFinalName(spec))
    if (value !== undefined) values[accountFinalName(spec)] = value
  }
  return values
}

const statusOf = (err) => (err instanceof EspoApiError ? err.status : -1)

/** Replace `{uid}` in every string of a body with the per-run token. */
function fill(value, uid) {
  if (typeof value === 'string') return value.replaceAll('{uid}', uid)
  if (Array.isArray(value)) return value.map((v) => fill(v, uid))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, uid)]))
  return value
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** The operator pressed Ctrl-C (or the process got SIGTERM); cleanup has run by the time this surfaces. */
export class AclInterruptedError extends Error {
  constructor() {
    super('verify-acl interrupted; probe objects were cleaned up')
    this.name = 'AclInterruptedError'
  }
}

/**
 * @param {{ admin: any, makeClient: (apiKey: string) => any, roleSpecs: any[], fieldsJson: any,
 *           only?: string, syncClient?: any, extraSecrets?: string[],
 *           now?: () => number, random?: () => string, interruptSource?: { once: Function, off: Function } }} options
 *   `syncClient`: a client built from the real prestigo-sync key; when given, the Sync writer
 *   checks run with it instead of a temporary probe user.
 * @returns {Promise<{ pass: number, fail: number, lines: string[], leaked: boolean }>}
 */
export async function runAclProbe({
  admin,
  makeClient,
  roleSpecs,
  fieldsJson,
  only,
  syncClient,
  extraSecrets = [],
  now = () => Date.now(),
  random = () => Math.random().toString(36).slice(2, 8),
  interruptSource = process,
}) {
  const selected = only ? roleSpecs.filter((s) => s.name.toLowerCase() === only.toLowerCase()) : roleSpecs
  if (selected.length === 0) throw new EspoConfigError(`verify-acl: no managed role named "${only}"`)

  const lines = []
  const secrets = [...extraSecrets]
  let pass = 0
  let fail = 0
  const stamp = `${now()}-${random()}`
  let counter = 0
  const report = (ok, text) => {
    lines.push(`${ok ? 'PASS' : 'FAIL'} ${text}`)
    if (ok) pass++
    else fail++
  }

  const liveRoles = (await admin.request('GET', '/Role?select=id,name&maxSize=200'))?.list ?? []
  const roleId = (name) => {
    const hit = liveRoles.find((r) => r.name === name)
    if (!hit) throw new EspoConfigError(`verify-acl: role "${name}" does not exist live (run: node infra/espocrm/sync.mjs --only roles)`)
    return hit.id
  }
  for (const spec of selected) roleId(spec.name)

  const fixtures = { account: null, contact: null, booking: null, lead: null, attachment: null, disposable: null }
  // Every created object is registered with a label (scope/id: no PII) so a failed cleanup can say what is left.
  const cleanup = []
  const removeLater = (scope, id) =>
    cleanup.push({ label: `${scope}/${id}`, run: async () => void (await admin.request('DELETE', `/${scope}/${id}`)) })
  // A record the probe itself may already have deleted (the allowed-delete checks): gone counts as clean.
  const removeLaterIfPresent = (scope, id) =>
    cleanup.push({
      label: `${scope}/${id}`,
      run: async () => {
        try {
          await admin.request('DELETE', `/${scope}/${id}`)
        } catch (err) {
          if (statusOf(err) !== 404) throw err
        }
      },
    })

  // Ctrl-C / SIGTERM stop the probe at the next step instead of killing the process: the finally
  // block below still deletes every probe user and record (a second signal kills at once).
  let interrupted = false
  const onInterrupt = () => {
    interrupted = true
  }
  const signals = ['SIGINT', 'SIGTERM']
  for (const name of signals) interruptSource.once(name, onInterrupt)
  const guard = () => {
    if (interrupted) throw new AclInterruptedError()
  }

  try {
    // Fixtures (admin): an Account carrying every commercial value plus a contract file,
    // a Contact and a Booking. All names/ids are unique per run.
    guard()
    const account = await admin.request('POST', '/Account', { name: `ACL Probe ${stamp}`, ...commercialValues(fieldsJson) })
    fixtures.account = account.id
    removeLater('Account', account.id)

    const fileField = commercialSpecs(fieldsJson).find((f) => f.type === 'file')
    if (fileField) {
      const attachment = await admin.request('POST', '/Attachment', {
        name: `${PROBE_PREFIX}-contract.txt`,
        type: 'text/plain',
        role: 'Attachment',
        relatedType: 'Account',
        field: accountFinalName(fileField),
        file: `data:text/plain;base64,${Buffer.from('acl probe contract').toString('base64')}`,
      })
      fixtures.attachment = attachment.id
      removeLater('Attachment', attachment.id)
      await admin.request('PUT', `/Account/${account.id}`, { [`${accountFinalName(fileField)}Id`]: attachment.id })
    }

    guard()
    const contact = await admin.request('POST', '/Contact', { lastName: `ACL Probe ${stamp}` })
    fixtures.contact = contact.id
    removeLater('Contact', contact.id)

    guard()
    const booking = await admin.request('POST', '/CBooking', { name: `ACL Probe ${stamp}`, supabaseBookingId: `${PROBE_PREFIX}-${stamp}` })
    fixtures.booking = booking.id
    removeLater('CBooking', booking.id)

    guard()
    const lead = await admin.request('POST', '/Lead', fill(WRITE_SCOPES.Lead.create, stamp))
    fixtures.lead = lead.id
    removeLater('Lead', lead.id)

    const expectations = buildAclExpectations(selected, fieldsJson)

    for (const spec of selected) {
      guard()
      let client
      if (spec.name === 'Sync writer' && syncClient) {
        client = syncClient
      } else {
        const probeUser = await admin.request('POST', '/User', {
          type: 'api',
          userName: `${PROBE_PREFIX}-${slug(spec.name)}-${stamp}`,
          authMethod: 'ApiKey',
          isActive: true,
          rolesIds: [roleId(spec.name)],
        })
        cleanup.push({ label: `User/${probeUser.id}`, run: async () => void (await admin.request('DELETE', `/User/${probeUser.id}`)) })
        let apiKey = probeUser.apiKey
        if (!apiKey) apiKey = (await admin.request('GET', `/User/${probeUser.id}`))?.apiKey
        if (!apiKey) throw new EspoApiError('POST', '/User', 200, 'API user was created without an api key')
        secrets.push(apiKey)
        client = makeClient(apiKey)
      }

      // The identity the sync really uses must hold the role (admin-side proof, no key involved).
      for (const userName of spec.assignTo ?? []) {
        const params = new URLSearchParams({ select: 'id', maxSize: '2' })
        params.set('where[0][type]', 'equals')
        params.set('where[0][attribute]', 'userName')
        params.set('where[0][value]', userName)
        const hit = ((await admin.request('GET', `/User?${params.toString()}`))?.list ?? [])[0]
        const rolesIds = hit ? ((await admin.request('GET', `/User/${hit.id}`))?.rolesIds ?? []) : []
        report(rolesIds.includes(roleId(spec.name)), `${spec.name} is assigned to ${userName}`)
      }

      for (const check of expectations.filter((c) => c.role === spec.name)) {
        guard()
        if (check.disposable) {
          const made = await admin.request('POST', `/${check.disposable}`, fill(WRITE_SCOPES[check.disposable].create, `${stamp}-${++counter}`))
          fixtures.disposable = made.id
          removeLaterIfPresent(check.disposable, made.id)
        }
        const outcome = await evaluate(client, check, fixtures, (body) => fill(body, `${stamp}-${++counter}`))
        if (outcome.createdId) removeLater(check.track, outcome.createdId)
        report(outcome.ok, `${check.role} ${check.label}${outcome.ok ? '' : ` (${outcome.detail})`}`)
      }
    }
  } finally {
    // Reverse order: records created by checks and users first, fixtures last. Every step is attempted.
    for (const name of signals) interruptSource.off(name, onInterrupt)
    const left = []
    for (const step of cleanup.reverse()) {
      try {
        await step.run()
      } catch {
        left.push(step.label)
      }
    }
    if (left.length > 0) {
      // Labels are scope/id pairs, never names or values: safe to print, and enough to find them.
      report(false, `cleanup ${left.length} probe object(s) could not be deleted: ${left.join(', ')} (probe names start with "${PROBE_PREFIX}" or "ACL Probe", run ${stamp})`)
    }
  }

  const leaked = scanForSecrets(lines, secrets)
  return { pass, fail, lines, leaked }
}

/** Run one check with the role's client. Never throws for an HTTP error status. */
async function evaluate(client, check, fixtures, fillBody) {
  const target = check.fixture ? fixtures[check.fixture] : null
  if (check.fixture && !target) return { ok: false, detail: 'fixture missing' }
  const apiPath = check.path.replace('{id}', target ?? '')
  let status = 200
  let body = null
  try {
    body = await client.request(check.method, apiPath, check.body === undefined ? undefined : fillBody(check.body))
  } catch (err) {
    status = statusOf(err)
  }
  const succeeded = status === 200
  const createdId = check.track && succeeded && isPlainObject(body) && typeof body.id === 'string' ? body.id : undefined
  switch (check.expect) {
    case 'forbidden': {
      const accepted = check.statuses ?? [check.status ?? 403]
      return { ok: accepted.includes(status), detail: `got ${status}` }
    }
    case 'allowed':
      return { ok: succeeded, detail: `got ${status}`, createdId }
    case 'hidden':
      if (!succeeded || !isPlainObject(body)) return { ok: false, detail: `got ${status}` }
      return { ok: !check.attrs.some((a) => a in body), detail: 'field present' }
    case 'visible':
      if (!succeeded || !isPlainObject(body)) return { ok: false, detail: `got ${status}` }
      return { ok: check.attrs.some((a) => a in body), detail: 'field missing' }
    default:
      return { ok: false, detail: 'unknown expectation' }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** @returns {{ role?: string }} */
export function parseArgs(argv) {
  /** @type {{ role?: string }} */
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--role') opts.role = argv[++i]
    else if (arg.startsWith('--role=')) opts.role = arg.slice('--role='.length)
    else throw new EspoConfigError(`Unknown argument: ${arg}`)
    if (opts.role !== undefined && !opts.role) throw new EspoConfigError('--role needs a role name')
  }
  return opts
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const read = (file) => JSON.parse(readFileSync(path.join(HERE, file), 'utf8'))
    const fieldsJson = read('fields.json')
    const roleSpecs = buildRoleSpecs(read('roles.json'), fieldsJson)

    const baseUrl = loadEspoConfig({ identity: 'admin' }).baseUrl
    const admin = createEspoClient({ config: loadEspoConfig({ identity: 'admin' }) })
    const makeClient = (apiKey) => createEspoClient({ config: { identity: 'apikey', baseUrl, apiKey } })

    // The Sync writer checks use the real prestigo-sync key when it can be loaded (never printed).
    const preface = []
    let syncClient
    const extraSecrets = []
    try {
      const syncConfig = loadEspoConfig({ identity: 'apikey' })
      syncClient = createEspoClient({ config: syncConfig })
      extraSecrets.push(syncConfig.apiKey)
    } catch (err) {
      if (!(err instanceof EspoConfigError)) throw err
      preface.push(`WARN prestigo-sync key not usable (${err.message}); Sync writer checks use a temporary probe user`)
    }

    const { pass, fail, lines, leaked } = await runAclProbe({
      admin,
      makeClient,
      roleSpecs,
      fieldsJson,
      only: opts.role,
      syncClient,
      extraSecrets,
    })
    const output = [...preface, ...lines]
    if (leaked || scanForSecrets(output, extraSecrets)) {
      // Self-check: a key reached the output. Print nothing of it.
      console.error('FAIL output self-check: an API key appeared in the probe output; output suppressed')
      process.exit(3)
    }
    for (const line of output) console.log(line)
    console.log(`acl: pass=${pass} fail=${fail}`)
    process.exit(fail > 0 ? 3 : 0)
  } catch (err) {
    if (err instanceof AclInterruptedError) {
      console.error(err.message)
      process.exit(130)
    }
    if (err instanceof EspoApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof EspoConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`verify-acl failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
