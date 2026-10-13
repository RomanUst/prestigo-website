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

/** Attributes a field occupies in a record payload (a file/link field adds Id and Name). */
export const fieldAttributes = (finalName) => [finalName, `${finalName}Id`, `${finalName}Name`]

/**
 * Pure: the checks the live CRM must satisfy, derived from the role specs.
 * Each check: { role, label, expect, method, path, status?, fixture, attrs? } where
 * `expect` is forbidden (exactly 403) | allowed (2xx) | hidden (2xx and none of attrs in the
 * record) | visible (2xx and some attr present). `{id}` in a path is filled from `fixture`
 * (account | booking | attachment) by the runner.
 */
export function buildAclExpectations(roleSpecs, fieldsJson) {
  void fieldsJson
  const checks = []
  for (const spec of roleSpecs) {
    const role = spec.name
    for (const [scope, acl] of Object.entries(spec.data)) {
      if (BOOLEAN_SCOPES.has(scope)) continue
      if (acl === false) {
        checks.push({ role, label: `GET /${scope} forbidden`, expect: 'forbidden', method: 'GET', path: `/${scope}?maxSize=1`, status: 403, fixture: null })
      }
    }
    for (const [scope, rules] of Object.entries(spec.fieldData ?? {})) {
      for (const [field, rule] of Object.entries(rules)) {
        if (rule?.read !== 'no') continue
        checks.push({
          role,
          label: `GET /${scope}/{id} hides ${field}`,
          expect: 'hidden',
          method: 'GET',
          path: `/${scope}/{id}`,
          fixture: scope.toLowerCase(),
          attrs: fieldAttributes(field),
        })
      }
    }
  }
  return checks
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

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * @param {{ admin: any, makeClient: (apiKey: string) => any, roleSpecs: any[], fieldsJson: any,
 *           only?: string, now?: () => number, random?: () => string }} options
 * @returns {Promise<{ pass: number, fail: number, lines: string[] }>}
 */
export async function runAclProbe({
  admin,
  makeClient,
  roleSpecs,
  fieldsJson,
  only,
  now = () => Date.now(),
  random = () => Math.random().toString(36).slice(2, 8),
}) {
  const selected = only ? roleSpecs.filter((s) => s.name.toLowerCase() === only.toLowerCase()) : roleSpecs
  if (selected.length === 0) throw new EspoConfigError(`verify-acl: no managed role named "${only}"`)

  const lines = []
  let pass = 0
  let fail = 0
  const stamp = `${now()}-${random()}`

  const liveRoles = (await admin.request('GET', '/Role?select=id,name&maxSize=200'))?.list ?? []
  const roleId = (name) => {
    const hit = liveRoles.find((r) => r.name === name)
    if (!hit) throw new EspoConfigError(`verify-acl: role "${name}" does not exist live (run: node infra/espocrm/sync.mjs --only roles)`)
    return hit.id
  }
  for (const spec of selected) roleId(spec.name)

  const fixtures = { account: null }
  const cleanup = []
  let tornDown = true

  try {
    tornDown = false
    const account = await admin.request('POST', '/Account', { name: `ACL Probe ${stamp}`, ...commercialValues(fieldsJson) })
    fixtures.account = account.id
    cleanup.push(async () => {
      await admin.request('DELETE', `/Account/${fixtures.account}`)
    })

    const expectations = buildAclExpectations(selected, fieldsJson)

    for (const spec of selected) {
      const probeUser = await admin.request('POST', '/User', {
        type: 'api',
        userName: `${PROBE_PREFIX}-${slug(spec.name)}-${stamp}`,
        authMethod: 'ApiKey',
        isActive: true,
        rolesIds: [roleId(spec.name)],
      })
      cleanup.push(async () => {
        await admin.request('DELETE', `/User/${probeUser.id}`)
      })
      let apiKey = probeUser.apiKey
      if (!apiKey) apiKey = (await admin.request('GET', `/User/${probeUser.id}`))?.apiKey
      if (!apiKey) throw new EspoApiError('POST', '/User', 200, 'API user was created without an api key')
      const client = makeClient(apiKey)

      for (const check of expectations.filter((c) => c.role === spec.name)) {
        const outcome = await evaluate(client, check, fixtures)
        lines.push(`${outcome.ok ? 'PASS' : 'FAIL'} ${check.role} ${check.label}${outcome.ok ? '' : ` (${outcome.detail})`}`)
        if (outcome.ok) pass++
        else fail++
      }
    }
  } finally {
    // Reverse order: probe users first, fixtures last. Every step is attempted.
    const failures = []
    for (const step of cleanup.reverse()) {
      try {
        await step()
      } catch (err) {
        failures.push(err)
      }
    }
    tornDown = failures.length === 0
    if (!tornDown) {
      lines.push(`FAIL cleanup ${failures.length} probe object(s) could not be deleted`)
      fail++
    }
  }
  return { pass, fail, lines }
}

/** Run one check with the role's client. Never throws for an HTTP error status. */
async function evaluate(client, check, fixtures) {
  const target = check.fixture ? fixtures[check.fixture] : null
  if (check.fixture && !target) return { ok: false, detail: 'fixture missing' }
  const apiPath = check.path.replace('{id}', target ?? '')
  let status = 200
  let body = null
  try {
    body = await client.request(check.method, apiPath, check.body)
  } catch (err) {
    status = statusOf(err)
  }
  const ok2xx = status === 200
  switch (check.expect) {
    case 'forbidden':
      return { ok: status === (check.status ?? 403), detail: `got ${status}` }
    case 'allowed':
      return { ok: ok2xx, detail: `got ${status}` }
    case 'hidden':
      if (!ok2xx || !isPlainObject(body)) return { ok: false, detail: `got ${status}` }
      return { ok: !check.attrs.some((a) => a in body), detail: 'field present' }
    case 'visible':
      if (!ok2xx || !isPlainObject(body)) return { ok: false, detail: `got ${status}` }
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

    const { pass, fail, lines } = await runAclProbe({ admin, makeClient, roleSpecs, fieldsJson, only: opts.role })
    for (const line of lines) console.log(line)
    console.log(`acl: pass=${pass} fail=${fail}`)
    process.exit(fail > 0 ? 3 : 0)
  } catch (err) {
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
