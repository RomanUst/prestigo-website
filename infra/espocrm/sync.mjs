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
 * Resource order: settings, entities, links, fields. (Later plans insert layouts,
 * enums, roles and mail in the order fixed by the plans: fields, enums, layouts, ...)
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

export const RESOURCE_ORDER = ['settings', 'entities', 'links', 'fields']

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

// ---------------------------------------------------------------------------
// Metadata helpers (entities, links, fields)
// ---------------------------------------------------------------------------

const ucFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1)

/** GET /Metadata/action/get?key=<dot.path>: the merged metadata value, or null when absent (admin only). */
const readMetadata = (ctx, key) => ctx.get(`/Metadata/action/get?key=${encodeURIComponent(key)}`)

/** EntityManager::create gives a custom entity the `C` prefix: Booking -> CBooking. */
export const customEntityName = (name) => `C${ucFirst(name)}`

/**
 * Final field name after FieldManager::create: fields on a custom scope (CBooking,
 * CPartnerRate) keep their name, fields on a stock scope (Account, Contact,
 * Opportunity) get `c` + Ucfirst (commissionPercent -> cCommissionPercent).
 * `customScopes` (Set or array of scope names) overrides the `C<Upper>...` name
 * heuristic; the sync passes the live `scopes.{scope}.isCustom` answer.
 */
export function finalFieldName(scope, name, customScopes) {
  const isCustom = customScopes ? new Set(customScopes).has(scope) : /^C[A-Z]/.test(scope)
  return isCustom ? name : `c${ucFirst(name)}`
}

const requireKeys = (resource, item, keys) => {
  const missing = keys.filter((k) => typeof item?.[k] !== 'string' || !item[k])
  if (missing.length) {
    throw new EspoConfigError(`${resource}: ${JSON.stringify(item?.name ?? item?.link ?? item)} is missing ${missing.join(', ')}`)
  }
}

// ---------------------------------------------------------------------------
// entities (create only: labels and tabs are owner-editable afterwards)
// ---------------------------------------------------------------------------

async function syncEntities(ctx) {
  const counts = emptyCounts()
  const { entities = [] } = ctx.readConfig('entities.json')
  for (const def of entities) {
    requireKeys('entities', def, ['name', 'type', 'labelSingular', 'labelPlural'])
    if (!/^[A-Z][A-Za-z0-9]*$/.test(def.name)) {
      throw new EspoConfigError(`entities: "${def.name}" must be UpperCamelCase letters and digits`)
    }
    const finalName = customEntityName(def.name)
    if (await readMetadata(ctx, `scopes.${finalName}`)) {
      counts.unchanged++
      continue
    }
    await ctx.mutate('POST', '/EntityManager/action/createEntity', def, finalName)
    counts.create++
  }
  return counts
}

// ---------------------------------------------------------------------------
// links (create only)
// ---------------------------------------------------------------------------

async function syncLinks(ctx) {
  const counts = emptyCounts()
  const { links = [] } = ctx.readConfig('entities.json')
  for (const def of links) {
    requireKeys('links', def, ['entity', 'link', 'linkType', 'entityForeign', 'linkForeign'])
    if (await readMetadata(ctx, `entityDefs.${def.entity}.links.${def.link}`)) {
      counts.unchanged++
      continue
    }
    await ctx.mutate('POST', '/EntityManager/action/createLink', def, `${def.entity}.${def.link}`)
    counts.create++
  }
  return counts
}

// ---------------------------------------------------------------------------
// fields
// ---------------------------------------------------------------------------

/**
 * Params FieldManager accepts for every type, confirmed against
 * application/Espo/Tools/FieldManager/FieldManager.php at tag 10.0.8:
 *   prepareFieldDefs: type, isCustom, isPersonalData, tooltip, inlineEditDisabled,
 *                     defaultAttributes (and notLockable on lockable scopes)
 *   write():          label, tooltipText, translatedOptions (only for types whose
 *                     metadata has `translatedOptions`), dynamicLogicVisible /
 *                     Required / ReadOnly / Options / Invalid / ReadOnlySaved /
 *                     Cascading (stored in logic defs, not in entityDefs)
 * Anything else must be in `fields.{type}.params` (read live) or in a
 * `fieldManagerAdditionalParamList`.
 */
export const UNIVERSAL_FIELD_PARAMS = [
  'type',
  'isCustom',
  'isPersonalData',
  'tooltip',
  'inlineEditDisabled',
  'defaultAttributes',
  'notLockable',
  'label',
  'tooltipText',
  'translatedOptions',
  'dynamicLogicVisible',
  'dynamicLogicRequired',
  'dynamicLogicReadOnly',
  'dynamicLogicOptions',
  'dynamicLogicInvalid',
  'dynamicLogicReadOnlySaved',
  'dynamicLogicCascading',
]

/** Local-only config keys: never sent to the CRM (`commercial` is consumed by plan 80-06). */
const LOCAL_FIELD_KEYS = ['name', 'commercial']
/** Sent on create, never on update, never diffed: the owner may relabel in the UI. */
const CREATE_ONLY_FIELD_KEYS = ['label', 'translatedOptions', 'tooltipText']
const isLogicKey = (key) => key.startsWith('dynamicLogic')

const paramNames = (list) =>
  (Array.isArray(list) ? list : []).map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean)

/** Declared value `false` equals an absent server value (EspoCRM stores only non-default params). */
function dropFalseDefaults(want, have) {
  return Object.fromEntries(Object.entries(want).filter(([k, v]) => !(v === false && have[k] == null)))
}

/**
 * Reads, validates and applies the field specs in fields.json:
 * { "fields": { "<Scope>": [ { name, type, ...params } ] } }. Every spec is
 * validated against the live field-type metadata before the first write.
 */
async function syncFields(ctx) {
  const counts = emptyCounts()
  const declared = ctx.readConfig('fields.json').fields ?? {}
  const typeCache = new Map()
  const readType = async (type) => {
    if (!typeCache.has(type)) typeCache.set(type, await readMetadata(ctx, `fields.${type}`))
    return typeCache.get(type)
  }

  // Pass 1: read-only. Resolve names, validate every param, compute the diff.
  const work = []
  for (const [scope, specs] of Object.entries(declared)) {
    const scopeDefs = await readMetadata(ctx, `scopes.${scope}`)
    if (!scopeDefs && !ctx.dryRun) {
      throw new EspoConfigError(`fields: scope ${scope} does not exist (sync "entities" first)`)
    }
    const customScopes = (scopeDefs ? scopeDefs.isCustom : /^C[A-Z]/.test(scope)) ? [scope] : []

    for (const spec of specs) {
      requireKeys('fields', spec, ['name', 'type'])
      const typeDefs = await readType(spec.type)
      if (!typeDefs) throw new EspoConfigError(`fields: ${scope}.${spec.name} has unknown field type "${spec.type}"`)

      const finalName = finalFieldName(scope, spec.name, customScopes)
      const have = await readMetadata(ctx, `entityDefs.${scope}.fields.${finalName}`)

      const additional = have?.fieldManagerAdditionalParamList ?? typeDefs.fieldManagerAdditionalParamList ?? []
      const allowed = new Set([
        ...LOCAL_FIELD_KEYS,
        ...UNIVERSAL_FIELD_PARAMS,
        ...paramNames(typeDefs.params),
        ...paramNames(additional),
      ])
      const rejected = Object.keys(spec).filter((k) => !allowed.has(k))
      if (rejected.length) {
        throw new EspoConfigError(
          `fields: ${scope}.${spec.name} (${spec.type}) has params not permitted for the type: ${rejected.join(', ')}`,
        )
      }
      if (spec.translatedOptions && !typeDefs.translatedOptions) {
        throw new EspoConfigError(`fields: ${scope}.${spec.name} (${spec.type}) does not support translatedOptions`)
      }

      const body = Object.fromEntries(Object.entries(spec).filter(([k]) => !LOCAL_FIELD_KEYS.includes(k)))
      if (paramNames(additional).length) body.fieldManagerAdditionalParamList = additional
      work.push({ scope, name: spec.name, finalName, spec, body, have })
    }
  }

  // Pass 2: writes, strictly one after the other.
  for (const { scope, name, finalName, body, have } of work) {
    const key = `${scope}.${finalName}`
    if (!have) {
      await ctx.mutate('POST', `/Admin/fieldManager/${scope}`, { name, ...body }, key)
      counts.create++
      continue
    }
    const diffable = Object.fromEntries(
      Object.entries(body).filter(([k]) => !CREATE_ONLY_FIELD_KEYS.includes(k) && !isLogicKey(k) && k !== 'fieldManagerAdditionalParamList'),
    )
    if (subsetEqual(dropFalseDefaults(diffable, have), have)) {
      counts.unchanged++
      continue
    }
    const update = Object.fromEntries(Object.entries(body).filter(([k]) => !CREATE_ONLY_FIELD_KEYS.includes(k)))
    await ctx.mutate('PUT', `/Admin/fieldManager/${scope}/${finalName}`, update, key)
    counts.update++
  }
  return counts
}

const HANDLERS = {
  settings: syncSettings,
  entities: syncEntities,
  links: syncLinks,
  fields: syncFields,
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
