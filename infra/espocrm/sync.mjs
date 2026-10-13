#!/usr/bin/env node
/**
 * infra/espocrm/sync.mjs
 *
 * Idempotent config-as-code sync for EspoCRM (Phase 80, plan 01): turns the JSON
 * under infra/espocrm/ into live CRM configuration. Run by Claude/owner from a
 * workstation, never by the site at runtime. Mirrors infra/chatwoot/sync.mjs:
 * read the live state, diff against the declared state, write only the delta.
 *
 *   node infra/espocrm/sync.mjs [--dry-run] [--only settings,...]
 *
 * Resource order: settings. (Later plans insert entities, links, fields, enums,
 * layouts, roles and mail after it, in that order.)
 *
 * Handler contract: `async function syncX(ctx) -> { create, update, unchanged,
 * skipped, removed }`, where
 *   ctx = { client, dryRun, log, configDir, resource, readConfig(file), get(path),
 *           mutate(method, path, body, key?) }
 * `mutate` logs `[create]/[update]/[remove] <resource> <key>` and is a no-op in
 * dry-run mode (the client is also wrapped so any non-GET throws).
 *
 * Output contract, one line per resource then a summary:
 *   <resource>: create=N update=N unchanged=N skipped=N removed=N
 *   summary: create=N update=N removed=N
 * Exit codes: 0 ok, 1 config error (EspoConfigError), 2 API error or anything else.
 *
 * Identity: the sync uses the `admin` identity (prestigo-config) because settings,
 * metadata and roles are admin-only. The client reads the credentials (env or
 * ~/.config/prestigo/espocrm-config.env, never a command-line argument), sends
 * the password exactly once, never retries after a 401 and never prints a secret.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const RESOURCE_ORDER = ['settings']

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Split desired items into create / update / unchanged against existing ones.
 * Existing items that are not desired are ignored (never touched here).
 */
export function planCollection({ desired, existing, keyOf, differs }) {
  const byKey = new Map()
  for (const item of existing) byKey.set(keyOf(item), item)
  const plan = { create: [], update: [], unchanged: [] }
  for (const want of desired) {
    const have = byKey.get(keyOf(want))
    if (!have) plan.create.push(want)
    else if (differs(want, have)) plan.update.push({ desired: want, existing: have })
    else plan.unchanged.push({ desired: want, existing: have })
  }
  return plan
}

/**
 * True when every value in `want` is present in `have`. Extra keys on the
 * server side (ids, timestamps, normalized defaults) are ignored. Arrays are
 * compared element by element, except arrays of objects carrying a `name`,
 * which are matched by name (the server may reorder or append fields).
 */
export function subsetEqual(want, have) {
  if (want === null) return have == null
  if (want === '') return have == null || have === ''
  if (typeof want !== 'object') {
    if (want === undefined) return true
    return want === have
  }
  if (Array.isArray(want)) {
    if (!Array.isArray(have) || have.length < want.length) return false
    const named = want.every((x) => x && typeof x === 'object' && 'name' in x)
    if (named) return want.every((w) => have.some((h) => h && h.name === w.name && subsetEqual(w, h)))
    if (have.length !== want.length) return false
    return want.every((w, i) => subsetEqual(w, have[i]))
  }
  if (have === null || typeof have !== 'object') return false
  return Object.keys(want).every((k) => subsetEqual(want[k], have[k]))
}

export const formatCounts = (c) =>
  `create=${c.create} update=${c.update} unchanged=${c.unchanged} skipped=${c.skipped} removed=${c.removed}`

const emptyCounts = () => ({ create: 0, update: 0, unchanged: 0, skipped: 0, removed: 0 })

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** In dry-run mode the client is wrapped so any non-GET request throws. */
function readOnlyClient(client) {
  return {
    ...client,
    request(method, apiPath, body) {
      if (method !== 'GET') throw new Error(`dry-run refused ${method} ${apiPath}`)
      return client.request(method, apiPath, body)
    },
  }
}

const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'remove' }

function makeContext({ client: rawClient, dryRun, log, configDir }) {
  const client = dryRun ? readOnlyClient(rawClient) : rawClient

  return {
    forResource(resource) {
      return {
        client,
        dryRun,
        log,
        configDir,
        resource,
        readConfig: (file) => JSON.parse(readFileSync(path.join(configDir, file), 'utf8')),
        get: (apiPath) => client.request('GET', apiPath),
        async mutate(method, apiPath, body, key = apiPath) {
          log(`${dryRun ? '[dry-run] ' : ''}[${VERB[method] ?? method.toLowerCase()}] ${resource} ${key}`)
          if (dryRun) return null
          return client.request(method, apiPath, body)
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

/** Phase 76 owns outbound mail, 2FA and the site URL; this resource never sends them. */
const FORBIDDEN_SETTING_KEY = /^(?:smtp|outboundEmail|auth2FA|siteUrl$)/i

/** Declared subset of /Settings (infra/espocrm/settings.json), PUT only when it differs. */
async function syncSettings(ctx) {
  const counts = emptyCounts()
  const desired = ctx.readConfig('settings.json').settings ?? {}
  const forbidden = Object.keys(desired).filter((k) => FORBIDDEN_SETTING_KEY.test(k))
  if (forbidden.length) {
    throw new EspoConfigError(`settings.json must not declare Phase 76 keys: ${forbidden.join(', ')}`)
  }

  const current = (await ctx.get('/Settings')) ?? {}
  if (subsetEqual(desired, current)) {
    counts.unchanged = 1
    return counts
  }
  await ctx.mutate('PUT', '/Settings', desired, 'settings')
  counts.update = 1
  return counts
}

const HANDLERS = {
  settings: syncSettings,
}

// ---------------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------------

/**
 * @param {{ client?: any, only?: string[], dryRun?: boolean, log?: (line: string) => void, configDir?: string }} [options]
 */
export async function runSync({ client, only, dryRun = false, log = console.log, configDir = HERE } = {}) {
  const selected = only && only.length ? only : RESOURCE_ORDER
  const unknown = selected.filter((r) => !RESOURCE_ORDER.includes(r))
  if (unknown.length) throw new EspoConfigError(`Unknown resource for --only: ${unknown.join(', ')}`)

  const context = makeContext({ client, dryRun, log, configDir })
  const totals = { create: 0, update: 0, removed: 0 }
  const results = {}

  for (const resource of RESOURCE_ORDER) {
    if (!selected.includes(resource)) continue
    const handler = HANDLERS[resource]
    if (!handler) throw new EspoConfigError(`Resource "${resource}" is not implemented yet`)
    const counts = await handler(context.forResource(resource))
    results[resource] = counts
    log(`${resource}: ${formatCounts(counts)}`)
    totals.create += counts.create
    totals.update += counts.update
    totals.removed += counts.removed
  }

  log(`summary: create=${totals.create} update=${totals.update} removed=${totals.removed}`)
  return { results, totals, dryRun }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseOnly(value) {
  const names = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!names.length) throw new EspoConfigError('--only needs a comma-separated list')
  const unknown = names.filter((n) => !RESOURCE_ORDER.includes(n))
  if (unknown.length) throw new EspoConfigError(`Unknown resource for --only: ${unknown.join(', ')}`)
  return names
}

/** @returns {{ dryRun: boolean, only: string[] }} */
export function parseArgs(argv) {
  /** @type {{ dryRun: boolean, only: string[] }} */
  const opts = { dryRun: false, only: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--only') opts.only = parseOnly(argv[++i])
    else if (arg.startsWith('--only=')) opts.only = parseOnly(arg.slice('--only='.length))
    else throw new EspoConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const client = createEspoClient({ config: loadEspoConfig({ identity: 'admin' }) })
    await runSync({ client, only: opts.only, dryRun: opts.dryRun })
  } catch (err) {
    if (err instanceof EspoApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof EspoConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
