#!/usr/bin/env node
/**
 * infra/chatwoot/sync.mjs
 *
 * Idempotent config-as-code sync (Phase 77 plan 07, D-18): turns the JSON under
 * infra/chatwoot/ into live Chatwoot configuration. Run by Claude/owner from a
 * workstation, never by the site at runtime.
 *
 *   node infra/chatwoot/sync.mjs [--dry-run] [--only labels,teams,...]
 *
 * Resource order: account, labels, teams, attributes, canned, inboxes, automation.
 * Matching (never re-create what exists): labels by title, teams by name,
 * attributes by attribute_key + model, canned responses by short_code, inboxes
 * by name, automation rules by name (infra/vps/scripts/provision-monitors.sh
 * precedent).
 *
 * Output contract, one line per resource then a summary:
 *   <resource>: create=N update=N unchanged=N skipped=N deleted=N
 *   website_token=<public token>
 *   summary: create=N update=N skipped=N
 * Exit codes: 0 ok, 1 config/validation error, 2 API error.
 *
 * Secrets: the API token is read by lib/client.mjs (env or file, never a command
 * line argument) and never printed; the Website inbox hmac_token is never
 * printed either (only the public website_token is).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from './lib/client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

export const RESOURCE_ORDER = ['account', 'labels', 'teams', 'attributes', 'canned', 'inboxes', 'automation']

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
  if (want === null || typeof want !== 'object') {
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

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Replace "@owner", "@team:<name>", "@inbox:<name>" placeholders (whole-string
 * values only) with their numeric ids. Returns { value, missing } where missing
 * lists the placeholders that could not be resolved.
 */
export function resolveRefs(value, refs) {
  const missing = []
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node === '@owner') {
        if (refs.ownerId == null) missing.push('@owner')
        return refs.ownerId
      }
      const team = node.match(/^@team:(.+)$/)
      if (team) {
        const id = refs.teams?.get(team[1])
        if (id == null) missing.push(node)
        return id
      }
      const inbox = node.match(/^@inbox:(.+)$/)
      if (inbox) {
        const id = refs.inboxes?.get(inbox[1])
        if (id == null) missing.push(node)
        return id
      }
      return node
    }
    if (Array.isArray(node)) return node.map(walk)
    if (isPlainObject(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]))
    return node
  }
  const resolved = walk(value)
  return { value: resolved, missing: [...new Set(missing)] }
}

/** Name prefix of every generated keyword rule; only these are ever deleted. */
export const GENERATED_RULE_PREFIX = 'topic:'

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function unwrapList(res, ...keys) {
  if (Array.isArray(res)) return res
  const payload = res?.payload
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
    if (Array.isArray(res?.[key])) return res[key]
  }
  return []
}

function readJson(configDir, ...parts) {
  return JSON.parse(readFileSync(path.join(configDir, ...parts), 'utf8'))
}

const emptyCounts = () => ({ create: 0, update: 0, unchanged: 0, skipped: 0, deleted: 0 })

const formatCounts = (c) =>
  `create=${c.create} update=${c.update} unchanged=${c.unchanged} skipped=${c.skipped} deleted=${c.deleted}`

/** In dry-run mode the client is wrapped so any non-GET request throws. */
function readOnlyClient(client) {
  return {
    ...client,
    request(method, apiPath, body) {
      if (method !== 'GET') throw new Error(`dry-run refused ${method} ${apiPath}`)
      return client.request(method, apiPath, body)
    },
    upload() {
      throw new Error('dry-run refused upload')
    },
  }
}

function makeContext({ client: rawClient, dryRun, log, configDir, repoRoot }) {
  const client = dryRun ? readOnlyClient(rawClient) : rawClient
  const refs = { ownerId: null, teams: null, inboxes: null }

  async function mutate(method, apiPath, body) {
    if (dryRun) return null
    return client.request(method, apiPath, body)
  }

  return {
    client,
    dryRun,
    log,
    configDir,
    repoRoot,
    refs,
    mutate,
    read: (...parts) => readJson(configDir, ...parts),
    list: async (apiPath, ...keys) => unwrapList(await client.request('GET', apiPath), ...keys),
    async ownerId() {
      if (refs.ownerId == null) {
        const profile = await client.request('GET', '/api/v1/profile')
        refs.ownerId = profile?.id ?? null
        if (refs.ownerId == null) throw new ChatwootConfigError('Could not resolve the token owner id from /api/v1/profile')
      }
      return refs.ownerId
    },
  }
}

// ---------------------------------------------------------------------------
// Resource: labels
// ---------------------------------------------------------------------------

async function syncLabels(ctx) {
  const counts = emptyCounts()
  const desired = ctx.read('labels.json').labels
  const existing = await ctx.list('/labels', 'labels')
  const plan = planCollection({
    desired,
    existing,
    keyOf: (l) => l.title,
    differs: (want, have) =>
      want.description !== have.description ||
      want.color !== have.color ||
      Boolean(want.show_on_sidebar) !== Boolean(have.show_on_sidebar),
  })
  for (const want of plan.create) {
    ctx.log(`  [create] label ${want.title}`)
    await ctx.mutate('POST', '/labels', want)
    counts.create++
  }
  for (const { desired: want, existing: have } of plan.update) {
    ctx.log(`  [update] label ${want.title}`)
    await ctx.mutate('PATCH', `/labels/${have.id}`, want)
    counts.update++
  }
  counts.unchanged = plan.unchanged.length
  return counts
}

const HANDLERS = {
  labels: syncLabels,
}

// ---------------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------------

/**
 * @param {{ client?: any, only?: string[], dryRun?: boolean, log?: (line: string) => void, configDir?: string, repoRoot?: string }} [options]
 */
export async function runSync({
  client,
  only,
  dryRun = false,
  log = console.log,
  configDir = HERE,
  repoRoot = REPO_ROOT,
} = {}) {
  const selected = only && only.length ? only : RESOURCE_ORDER
  const unknown = selected.filter((r) => !RESOURCE_ORDER.includes(r))
  if (unknown.length) throw new ChatwootConfigError(`Unknown resource for --only: ${unknown.join(', ')}`)

  const ctx = makeContext({ client, dryRun, log, configDir, repoRoot })
  const totals = { create: 0, update: 0, skipped: 0 }
  const results = {}

  for (const resource of RESOURCE_ORDER) {
    if (!selected.includes(resource)) continue
    const handler = HANDLERS[resource]
    if (!handler) {
      throw new ChatwootConfigError(`Resource "${resource}" is not implemented yet`)
    }
    const counts = await handler(ctx)
    results[resource] = counts
    log(`${resource}: ${formatCounts(counts)}`)
    totals.create += counts.create
    totals.update += counts.update
    totals.skipped += counts.skipped
  }

  log(`summary: create=${totals.create} update=${totals.update} skipped=${totals.skipped}`)
  return { results, totals, dryRun }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { dryRun: false, only: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--only') {
      const value = argv[++i]
      if (!value) throw new ChatwootConfigError('--only needs a comma-separated list')
      opts.only = value.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else throw new ChatwootConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const client = createChatwootClient(loadChatwootConfig())
    await runSync({ client, only: opts.only, dryRun: opts.dryRun })
  } catch (err) {
    if (err instanceof ChatwootApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof ChatwootConfigError) {
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
