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
 * Resource order: settings, entities, links, fields, enums, layouts, roles, mail.
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
import { mergeDefault, mergeEnumOptions, mergeValueMap } from './lib/enum-merge.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const RESOURCE_ORDER = ['settings', 'entities', 'links', 'fields', 'enums', 'layouts', 'roles', 'mail']

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

// ---------------------------------------------------------------------------
// enums (merge-safe: the owner may add values and rename labels in the UI)
// ---------------------------------------------------------------------------

/** One count probe: does any record of `scope` match a single where item on `field`? */
async function countsAny(ctx, scope, type, field, value) {
  const params = new URLSearchParams({ select: 'id', maxSize: '1' })
  params.set('where[0][type]', type)
  params.set('where[0][attribute]', field)
  if (value !== undefined) params.set('where[0][value]', value)
  const result = await ctx.get(`/${scope}?${params.toString()}`)
  return Number(result?.total ?? 0) > 0 || (Array.isArray(result?.list) && result.list.length > 0)
}

/**
 * Does any record of `scope` carry `value` in `field`? Admin sees every record (the canary
 * included). The empty option has no `isEmpty` where type on a plain column, so it is
 * checked as "null or empty string" with two probes.
 */
async function isValueInUse(ctx, scope, field, value) {
  if (value === '') {
    return (await countsAny(ctx, scope, 'isNull', field)) || (await countsAny(ctx, scope, 'equals', field, ''))
  }
  return countsAny(ctx, scope, 'equals', field, value)
}

function validateEnumEntry(def) {
  requireKeys('enums', def, ['scope', 'field'])
  const label = `${def.scope}.${def.field}`
  if (!Array.isArray(def.values) || def.values.length === 0) {
    throw new EspoConfigError(`enums: ${label} needs a non-empty values list`)
  }
  for (const v of def.values) {
    if (typeof v?.value !== 'string' || !v.value || typeof v.label !== 'string' || !v.label) {
      throw new EspoConfigError(`enums: ${label} has a value without value or label: ${JSON.stringify(v)}`)
    }
  }
  const wanted = def.values.map((v) => v.value)
  if (new Set(wanted).size !== wanted.length) throw new EspoConfigError(`enums: ${label} declares a value twice`)
  const retire = def.retire ?? []
  if (!Array.isArray(retire) || retire.some((v) => typeof v !== 'string')) {
    throw new EspoConfigError(`enums: ${label} retire must be a list of strings`)
  }
  const overlap = retire.filter((v) => wanted.includes(v))
  if (overlap.length) throw new EspoConfigError(`enums: ${label} retires values it also declares: ${overlap.join(', ')}`)
  if (def.default !== undefined && !wanted.includes(def.default)) {
    throw new EspoConfigError(`enums: ${label} default "${def.default}" is not a declared value`)
  }
}

/**
 * enums.json: { "enums": [ { scope, field, values: [{value,label}], retire?, default?,
 * probabilityMap?, style? } ] }. Per entry: read options/labels/in-use counts, merge with
 * mergeEnumOptions and PUT the whole merged definition only when it differs. Owner-added
 * values, renamed labels and edited probabilities/styles are never overwritten; the only
 * removals are retire-listed stock values that no record uses.
 */
async function syncEnums(ctx) {
  const counts = emptyCounts()
  const { enums = [] } = ctx.readConfig('enums.json')
  for (const def of enums) validateEnumEntry(def)

  let i18n
  const readLabels = async (scope, field) => {
    i18n ??= (await ctx.get('/I18n')) ?? {}
    return i18n?.[scope]?.options?.[field] ?? {}
  }

  for (const def of enums) {
    const { scope, field } = def
    const key = `${scope}.${field}`
    const have = await readMetadata(ctx, `entityDefs.${scope}.fields.${field}`)
    if (!have) {
      if (ctx.dryRun) {
        counts.skipped++
        continue
      }
      throw new EspoConfigError(`enums: field ${key} does not exist`)
    }
    if (have.type !== 'enum') throw new EspoConfigError(`enums: ${key} is a ${have.type} field, not an enum`)

    const current = Array.isArray(have.options) ? have.options : []
    const currentLabels = await readLabels(scope, field)
    const retire = def.retire ?? []
    const wanted = new Set(def.values.map((v) => v.value))

    const inUse = new Set()
    for (const value of retire) {
      if (!current.includes(value) || wanted.has(value)) continue
      if (await isValueInUse(ctx, scope, field, value)) inUse.add(value)
    }

    const merged = mergeEnumOptions({ desired: def.values, current, currentLabels, retire, inUse })
    const next = {
      options: merged.options,
      translatedOptions: merged.translatedOptions,
    }
    const nextDefault = mergeDefault({ desired: def.default, current: have.default, retire })
    if (nextDefault !== undefined) next.default = nextDefault
    if (def.probabilityMap) {
      next.probabilityMap = mergeValueMap({ desired: def.probabilityMap, current: have.probabilityMap, removed: merged.removed })
    }
    if (def.style) {
      next.style = mergeValueMap({ desired: def.style, current: have.style, removed: merged.removed })
    }

    const unchanged =
      sameJson(next.options, current) &&
      sameJson(next.translatedOptions, currentLabels) &&
      (next.default === undefined || next.default === have.default) &&
      (next.probabilityMap === undefined || sameJson(next.probabilityMap, have.probabilityMap ?? {})) &&
      (next.style === undefined || sameJson(next.style, have.style ?? {}))
    if (unchanged) {
      counts.unchanged++
      continue
    }

    const body = { type: 'enum', ...next }
    if (Array.isArray(have.fieldManagerAdditionalParamList)) body.fieldManagerAdditionalParamList = have.fieldManagerAdditionalParamList
    await ctx.mutate('PUT', `/Admin/fieldManager/${scope}/${field}`, body, key)
    counts.update++
    counts.removed += merged.removed.length
  }
  return counts
}

// ---------------------------------------------------------------------------
// layouts
// ---------------------------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPanel = (item) => isPlainObject(item) && typeof item.label === 'string' && Array.isArray(item.rows)
const itemName = (item) => (typeof item === 'string' ? item : isPlainObject(item) ? item.name : undefined)

/** Order-insensitive-for-keys, order-sensitive-for-arrays JSON equality. */
function sameJson(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameJson(a[k], b[k]))
  }
  return a === b
}

/**
 * Compute the layout to PUT.
 *   replace  our layout wins (custom entities such as CBooking).
 *   append   stock scopes (Contact, Account): add what is missing, never remove,
 *            reorder or alter anything that exists, so owner edits survive.
 *              - list of names (`relationships`, list columns): a desired name that is
 *                absent is appended in the server's item form (plain strings, or
 *                {name} objects only when every existing item is such an object);
 *              - list of panels (`detail`): a desired panel is added when no panel
 *                with the same label exists;
 *              - keyed object (`bottomPanelsDetail`): missing keys are added.
 * Returns `current` itself (same reference) when nothing needs adding.
 */
export function mergeLayout(mode, current, desired) {
  if (mode === 'replace') return desired
  if (mode !== 'append') throw new EspoConfigError(`layouts: unknown mode "${mode}" (expected replace or append)`)
  if (current === null || current === undefined) return desired

  if (Array.isArray(current) && Array.isArray(desired)) {
    const additions = []
    const objectForm = current.length > 0 && current.every((x) => isPlainObject(x) && typeof x.name === 'string')
    for (const want of desired) {
      if (isPanel(want)) {
        const exists = [...current, ...additions].some((x) => isPanel(x) && x.label === want.label)
        if (!exists) additions.push(want)
        continue
      }
      const name = itemName(want)
      if (!name) throw new EspoConfigError(`layouts: cannot append ${JSON.stringify(want)} (no name or label)`)
      const exists = [...current, ...additions].some((x) => itemName(x) === name)
      if (exists) continue
      additions.push(isPlainObject(want) ? want : objectForm ? { name } : name)
    }
    return additions.length ? [...current, ...additions] : current
  }

  if (isPlainObject(current) && isPlainObject(desired)) {
    const missing = Object.keys(desired).filter((k) => !(k in current))
    return missing.length ? { ...current, ...Object.fromEntries(missing.map((k) => [k, desired[k]])) } : current
  }

  throw new EspoConfigError('layouts: append needs the live and the declared layout to have the same shape (list or keyed object)')
}

/** GET a layout; a missing scope or layout (404) reads as null instead of failing a dry run. */
async function readLayout(ctx, scope, name) {
  try {
    return await ctx.get(`/${scope}/layout/${name}`)
  } catch (err) {
    if (err instanceof EspoApiError && err.status === 404) return null
    throw err
  }
}

/**
 * layouts.json: { "layouts": [ { scope, name, mode: "replace" | "append", layout } ] }.
 * PUT only when the merged layout differs from the live one.
 */
async function syncLayouts(ctx) {
  const counts = emptyCounts()
  const { layouts = [] } = ctx.readConfig('layouts.json')
  for (const def of layouts) {
    requireKeys('layouts', def, ['scope', 'name', 'mode'])
    if (def.mode !== 'replace' && def.mode !== 'append') {
      throw new EspoConfigError(`layouts: ${def.scope}/${def.name} has unknown mode "${def.mode}" (expected replace or append)`)
    }
    if (typeof def.layout !== 'object' || def.layout === null) {
      throw new EspoConfigError(`layouts: ${def.scope}/${def.name} needs a layout array or object`)
    }
  }

  for (const def of layouts) {
    const current = await readLayout(ctx, def.scope, def.name)
    const merged = mergeLayout(def.mode, current, def.layout)
    if (current !== null && current !== undefined && (merged === current || sameJson(merged, current))) {
      counts.unchanged++
      continue
    }
    await ctx.mutate('PUT', `/${def.scope}/layout/${def.name}`, merged, `${def.scope}/${def.name}`)
    if (current === null || current === undefined) counts.create++
    else counts.update++
  }
  return counts
}

// ---------------------------------------------------------------------------
// roles (Phase 80 plan 07: D-15/D-16/D-17/D-22, least-privilege ACL as code)
// ---------------------------------------------------------------------------

/** Role permission fields whose allowed values are read from entityDefs.Role.fields.{name}.options. */
const ROLE_PERMISSION_FIELDS = [
  'exportPermission',
  'massUpdatePermission',
  'assignmentPermission',
  'userPermission',
  'portalPermission',
  'groupEmailAccountPermission',
  'dataPrivacyPermission',
]
const ROLE_LOCAL_KEYS = ['name', 'data', 'fieldData', 'assignTo']
const ROLE_LEVELS = ['all', 'team', 'own', 'no']
const ROLE_ACTIONS = ['read', 'edit', 'delete', 'stream']
const COMMERCIAL_HIDDEN = '@commercialHidden'

function validateRoleScope(roleName, scope, acl) {
  const where = `roles: ${roleName}.data.${scope}`
  if (acl === false || acl === true) return
  if (!isPlainObject(acl)) throw new EspoConfigError(`${where} must be false, true or an action object`)
  if (acl.create !== undefined && acl.create !== 'yes' && acl.create !== 'no') {
    throw new EspoConfigError(`${where}.create must be "yes" or "no" (got ${JSON.stringify(acl.create)})`)
  }
  for (const action of ROLE_ACTIONS) {
    if (acl[action] !== undefined && !ROLE_LEVELS.includes(acl[action])) {
      throw new EspoConfigError(`${where}.${action} must be one of ${ROLE_LEVELS.join(', ')} (got ${JSON.stringify(acl[action])})`)
    }
  }
}

/**
 * roles.json -> role specs ready to write: validates the shapes and expands the
 * `@commercialHidden` marker of a fieldData scope into { finalName: { read: 'no', edit: 'no' } }
 * for every fields.json entry of that scope tagged `commercial: true` (D-16/D-22), so a new
 * commercial field can never be forgotten in the Dispatcher role. `assignTo` (user names) is kept
 * on the spec and stripped before the role body is sent.
 */
export function buildRoleSpecs(rolesJson, fieldsJson) {
  const roles = rolesJson?.roles
  if (!Array.isArray(roles) || roles.length === 0) throw new EspoConfigError('roles.json needs a non-empty "roles" list')
  const names = new Set()
  return roles.map((role) => {
    requireKeys('roles', role, ['name'])
    if (names.has(role.name)) throw new EspoConfigError(`roles: "${role.name}" is declared twice`)
    names.add(role.name)
    if (!isPlainObject(role.data)) throw new EspoConfigError(`roles: ${role.name} needs a "data" object`)
    for (const [scope, acl] of Object.entries(role.data)) validateRoleScope(role.name, scope, acl)

    const fieldData = {}
    for (const [scope, rules] of Object.entries(role.fieldData ?? {})) {
      if (rules === COMMERCIAL_HIDDEN) {
        const customScopes = /^C[A-Z]/.test(scope) ? [scope] : []
        const commercial = (fieldsJson?.fields?.[scope] ?? []).filter((f) => f.commercial === true)
        if (commercial.length === 0) throw new EspoConfigError(`roles: ${role.name} uses ${COMMERCIAL_HIDDEN} on ${scope} but fields.json tags no commercial field there`)
        fieldData[scope] = Object.fromEntries(
          commercial.map((f) => [finalFieldName(scope, f.name, customScopes), { read: 'no', edit: 'no' }]),
        )
      } else if (isPlainObject(rules)) {
        fieldData[scope] = rules
      } else {
        throw new EspoConfigError(`roles: ${role.name}.fieldData.${scope} must be an object or "${COMMERCIAL_HIDDEN}"`)
      }
    }

    const unknown = Object.keys(role).filter((k) => !ROLE_LOCAL_KEYS.includes(k) && !ROLE_PERMISSION_FIELDS.includes(k))
    if (unknown.length) throw new EspoConfigError(`roles: ${role.name} has unknown keys: ${unknown.join(', ')}`)

    const spec = { name: role.name, data: role.data, fieldData }
    for (const field of ROLE_PERMISSION_FIELDS) if (role[field] !== undefined) spec[field] = role[field]
    if (role.assignTo !== undefined) {
      if (!Array.isArray(role.assignTo) || role.assignTo.some((u) => typeof u !== 'string' || !u)) {
        throw new EspoConfigError(`roles: ${role.name}.assignTo must be a list of user names`)
      }
      spec.assignTo = role.assignTo
    }
    return spec
  })
}

/** Permission values must be offered by the live Role metadata (not-set / yes / no / all / team). */
async function validateRolePermissions(ctx, specs) {
  for (const spec of specs) {
    for (const field of ROLE_PERMISSION_FIELDS) {
      if (spec[field] === undefined) continue
      const defs = await readMetadata(ctx, `entityDefs.Role.fields.${field}`)
      const options = Array.isArray(defs?.options) ? defs.options : null
      if (options && !options.includes(spec[field])) {
        throw new EspoConfigError(`roles: ${spec.name}.${field} "${spec[field]}" is not one of ${options.join(', ')}`)
      }
    }
  }
}

const sameKeys = (a, b) => {
  const left = Object.keys(a ?? {}).sort()
  const right = Object.keys(b ?? {}).sort()
  return left.length === right.length && left.every((k, i) => k === right[i])
}

/** Declared role vs live role: the declared values are a subset AND no scope was added behind our back. */
function roleDiffers(body, have) {
  if (!subsetEqual(body, have)) return true
  if (!sameKeys(body.data, have.data)) return true
  if (!sameKeys(body.fieldData, have.fieldData)) return true
  return Object.keys(body.fieldData).some((scope) => !sameKeys(body.fieldData[scope], have.fieldData?.[scope]))
}

/** Adds `roleId` to the user's roles (merge: an existing role is never removed). Returns true when it wrote. */
async function assignRole(ctx, userName, roleId) {
  const params = new URLSearchParams({ select: 'id,userName', maxSize: '2' })
  params.set('where[0][type]', 'equals')
  params.set('where[0][attribute]', 'userName')
  params.set('where[0][value]', userName)
  const found = (await ctx.get(`/User?${params.toString()}`))?.list ?? []
  const hit = found.find((u) => u.userName === userName)
  if (!hit) {
    if (ctx.dryRun) return false
    throw new EspoConfigError(`roles: assignTo user "${userName}" does not exist`)
  }
  const user = await ctx.get(`/User/${hit.id}`)
  const existing = Array.isArray(user?.rolesIds) ? user.rolesIds : []
  if (roleId && existing.includes(roleId)) return false
  await ctx.mutate('PUT', `/User/${hit.id}`, { rolesIds: [...existing, roleId ?? 'pending'] }, `${userName} (assign role)`)
  return true
}

/**
 * roles.json: { "roles": [ { name, data, fieldData?, <permission>?, assignTo? } ] }. Roles are matched
 * by exact name; git wins for the managed names and nothing else is read for update or written
 * (the restore-drill canary role stays untouched). `assignTo` merges the role into the listed users.
 */
async function syncRoles(ctx) {
  const counts = emptyCounts()
  const specs = buildRoleSpecs(ctx.readConfig('roles.json'), ctx.readConfig('fields.json'))
  await validateRolePermissions(ctx, specs)

  const live = (await ctx.get('/Role?select=id,name&maxSize=200'))?.list ?? []

  for (const spec of specs) {
    const { assignTo = [], ...body } = spec
    const matches = live.filter((r) => r.name === spec.name)
    if (matches.length > 1) throw new EspoConfigError(`roles: more than one live role is named "${spec.name}"`)

    let roleId = matches[0]?.id
    if (!roleId) {
      const created = await ctx.mutate('POST', '/Role', body, spec.name)
      roleId = created?.id
      counts.create++
    } else {
      const have = await ctx.get(`/Role/${roleId}`)
      if (roleDiffers(body, have ?? {})) {
        await ctx.mutate('PUT', `/Role/${roleId}`, body, spec.name)
        counts.update++
      } else {
        counts.unchanged++
      }
    }

    for (const userName of assignTo) {
      if (await assignRole(ctx, userName, roleId)) counts.update++
    }
  }
  return counts
}

// ---------------------------------------------------------------------------
// mail (Phase 80 plan 10: D-05 reminders, D-11..D-13 owner mailbox prerequisites)
// ---------------------------------------------------------------------------

const MAIL_FILTER_ACTION = 'Move to Folder'
const REMINDER_TYPES = ['Popup', 'Email']

/**
 * Validates mail.json before the first request. A filter may only move mail to a folder: the
 * "Skip" action would hide task reminders (they are fetched back into the owner's mailbox).
 */
export function validateMailConfig(cfg) {
  const where = 'mail.json'
  if (!isPlainObject(cfg)) throw new EspoConfigError(`${where} must be an object`)
  requireKeys('mail', cfg.owner, ['userName', 'emailAddress'])
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.owner.emailAddress)) throw new EspoConfigError(`${where}: owner.emailAddress is not an email address`)

  const folders = cfg.folders ?? []
  const filters = cfg.filters ?? []
  const preferences = cfg.preferences ?? []
  const requiredJobs = cfg.requiredJobs ?? []
  for (const [name, list] of [['folders', folders], ['filters', filters], ['preferences', preferences], ['requiredJobs', requiredJobs]]) {
    if (!Array.isArray(list)) throw new EspoConfigError(`${where}: ${name} must be a list`)
  }
  if (requiredJobs.some((j) => typeof j !== 'string' || !j)) throw new EspoConfigError(`${where}: requiredJobs must be a list of job names`)

  for (const folder of folders) requireKeys('mail.folders', folder, ['name', 'user'])
  for (const filter of filters) {
    requireKeys('mail.filters', filter, ['name', 'user', 'from', 'action', 'folder'])
    if (filter.action === 'Skip') {
      throw new EspoConfigError(`${where}: filter "${filter.name}" uses Skip, which would hide reminders; use "${MAIL_FILTER_ACTION}"`)
    }
    if (filter.action !== MAIL_FILTER_ACTION) {
      throw new EspoConfigError(`${where}: filter "${filter.name}" action must be "${MAIL_FILTER_ACTION}"`)
    }
    if (!folders.some((f) => f.name === filter.folder && f.user === filter.user)) {
      throw new EspoConfigError(`${where}: filter "${filter.name}" targets folder "${filter.folder}" that is not declared for ${filter.user}`)
    }
  }
  for (const pref of preferences) {
    requireKeys('mail.preferences', pref, ['user'])
    const reminders = pref.defaultRemindersTask
    if (!Array.isArray(reminders)) throw new EspoConfigError(`${where}: preferences for ${pref.user} need a defaultRemindersTask list`)
    for (const r of reminders) {
      if (!REMINDER_TYPES.includes(r?.type) || !Number.isInteger(r?.seconds) || r.seconds < 0) {
        throw new EspoConfigError(`${where}: reminder ${JSON.stringify(r)} must be { type: Popup|Email, seconds: integer >= 0 }`)
      }
    }
  }
}

const normalizeReminders = (list) =>
  (Array.isArray(list) ? list : [])
    .map((r) => ({ type: r?.type, seconds: Number(r?.seconds) }))
    .sort((a, b) => a.seconds - b.seconds || String(a.type).localeCompare(String(b.type)))

/** Looks a user up by exact userName. Returns { id, emailAddress } or null. */
async function findUserByName(ctx, userName) {
  const params = new URLSearchParams({ select: 'id,userName,emailAddress', maxSize: '2' })
  params.set('where[0][type]', 'equals')
  params.set('where[0][attribute]', 'userName')
  params.set('where[0][value]', userName)
  const found = (await ctx.get(`/User?${params.toString()}`))?.list ?? []
  const hit = found.find((u) => u.userName === userName)
  return hit ? { id: hit.id, emailAddress: hit.emailAddress ?? '' } : null
}

/** GET a list by exact name (maxSize 200), the caller narrows further in code. */
async function listByName(ctx, entity, name, select) {
  const params = new URLSearchParams({ select, maxSize: '200' })
  params.set('where[0][type]', 'equals')
  params.set('where[0][attribute]', 'name')
  params.set('where[0][value]', name)
  return (await ctx.get(`/${entity}?${params.toString()}`))?.list ?? []
}

/**
 * Reads scheduled-job statuses by their `job` attribute and requires every listed job to be Active.
 * A stopped scheduler means no mail fetch and no reminder emails, so this fails the run (exit 2)
 * before any write and names the job.
 */
export async function assertJobsActive(ctx, requiredJobs) {
  const rows = (await ctx.get('/ScheduledJob?select=name,job,status&maxSize=200'))?.list ?? []
  const status = new Map(rows.map((r) => [r.job, r.status]))
  for (const job of requiredJobs) {
    if (status.get(job) !== 'Active') {
      throw new Error(`mail: scheduled job ${job} is ${status.get(job) ?? 'missing'}, expected Active`)
    }
  }
  return requiredJobs.map((job) => `${job}=Active`)
}

/**
 * mail.json: the owner user's address (a Personal Email Account must use the owner's own address),
 * a personal filter that files system mail into the owner's "Reminders" folder instead of the sales
 * inbox (D-05; never Skip), Task reminder defaults and the scheduler check. The mailbox itself
 * (host, password) is created by the owner in the UI (D-12): no password ever passes through here.
 *
 * Folders are verified, never created (live finding, plan 80-10): POST /EmailFolder assigns the
 * folder to the CALLING admin (prestigo-config) whatever assignedUserId says, so an admin identity
 * cannot create a folder for the owner. The owner creates "Reminders" in Emails -> Folders; this
 * resource then finds it (by name AND owner) and points the owner's filter at it. Until it exists,
 * the folder and its filter are `skipped`, never created against a folder the owner cannot see.
 */
async function syncMail(ctx) {
  const counts = emptyCounts()
  const cfg = ctx.readConfig('mail.json')
  validateMailConfig(cfg)
  const { owner, folders = [], filters = [], preferences = [], requiredJobs = [] } = cfg

  const jobLines = await assertJobsActive(ctx, requiredJobs)

  const actionDef = await readMetadata(ctx, 'entityDefs.EmailFilter.fields.action')
  const folderDefs = await readMetadata(ctx, 'entityDefs.EmailFolder.fields')
  const prefDef = await readMetadata(ctx, 'entityDefs.Preferences.fields.defaultRemindersTask')
  let folderIssue = null
  if (!Array.isArray(actionDef?.options) || !actionDef.options.includes(MAIL_FILTER_ACTION)) {
    folderIssue = `this EspoCRM has no "${MAIL_FILTER_ACTION}" filter action`
  } else if (!folderDefs?.assignedUser) {
    folderIssue = 'an EmailFolder cannot be assigned to another user'
  }

  const users = new Map()
  const resolveUser = async (userName) => {
    if (users.has(userName)) return users.get(userName)
    const user = await findUserByName(ctx, userName)
    if (!user && !ctx.dryRun) throw new EspoConfigError(`mail: user "${userName}" does not exist`)
    users.set(userName, user)
    return user
  }

  // 1. The owner user's email address (case-insensitive compare; the server's casing wins).
  const ownerUser = await resolveUser(owner.userName)
  if (!ownerUser) {
    counts.skipped++
  } else if (ownerUser.emailAddress.toLowerCase() === owner.emailAddress.toLowerCase()) {
    counts.unchanged++
  } else {
    await ctx.mutate('PUT', `/User/${ownerUser.id}`, { emailAddress: owner.emailAddress }, `${owner.userName} (email address)`)
    counts.update++
  }

  // 2. Folders (verified, owner-created), then 3. filters that point at them.
  if (folderIssue && (folders.length || filters.length)) {
    ctx.log(`mail: folders and filters skipped (${folderIssue}); the owner creates "Reminders" and its filter in the UI (never Skip)`)
    counts.skipped += folders.length + filters.length
  } else {
    const folderIds = new Map()
    for (const folder of folders) {
      const user = await resolveUser(folder.user)
      if (!user) {
        counts.skipped++
        continue
      }
      const existing = (await listByName(ctx, 'EmailFolder', folder.name, 'id,name,assignedUserId')).find((f) => f.name === folder.name && f.assignedUserId === user.id)
      if (existing) {
        folderIds.set(`${folder.user}/${folder.name}`, existing.id)
        counts.unchanged++
        continue
      }
      ctx.log(`mail: folder "${folder.name}" owned by ${folder.user} does not exist; the owner creates it in Emails -> Folders (an API-created folder would belong to the admin identity)`)
      counts.skipped++
    }

    for (const filter of filters) {
      const user = await resolveUser(filter.user)
      const folderId = folderIds.get(`${filter.user}/${filter.folder}`)
      if (!user || !folderId) {
        counts.skipped++
        continue
      }
      const body = {
        name: filter.name,
        from: filter.from,
        action: filter.action,
        emailFolderId: folderId,
        parentType: 'User',
        parentId: user.id,
        isGlobal: false,
      }
      const existing = (await listByName(ctx, 'EmailFilter', filter.name, 'id,name,from,action,emailFolderId,parentId,isGlobal')).find((f) => f.parentId === user.id)
      if (!existing) {
        await ctx.mutate('POST', '/EmailFilter', body, `${filter.user}/${filter.name}`)
        counts.create++
      } else if (existing.from !== body.from || existing.action !== body.action || existing.emailFolderId !== body.emailFolderId) {
        await ctx.mutate('PUT', `/EmailFilter/${existing.id}`, { from: body.from, action: body.action, emailFolderId: body.emailFolderId }, `${filter.user}/${filter.name}`)
        counts.update++
      } else {
        counts.unchanged++
      }
    }
  }

  // 4. Reminder defaults per user (the Preferences record id is the user id).
  for (const pref of preferences) {
    const user = await resolveUser(pref.user)
    if (!user || !prefDef) {
      counts.skipped++
      continue
    }
    let have = null
    try {
      have = await ctx.get(`/Preferences/${user.id}`)
    } catch (err) {
      if (!(err instanceof EspoApiError && err.status === 404)) throw err
    }
    if (sameJson(normalizeReminders(have?.defaultRemindersTask), normalizeReminders(pref.defaultRemindersTask))) {
      counts.unchanged++
      continue
    }
    await ctx.mutate('PUT', `/Preferences/${user.id}`, { defaultRemindersTask: pref.defaultRemindersTask }, `${pref.user} (defaultRemindersTask)`)
    counts.update++
  }

  ctx.log(`jobs: ${jobLines.join(' ')}`)
  return counts
}

const HANDLERS = {
  settings: syncSettings,
  entities: syncEntities,
  links: syncLinks,
  fields: syncFields,
  enums: syncEnums,
  layouts: syncLayouts,
  roles: syncRoles,
  mail: syncMail,
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
