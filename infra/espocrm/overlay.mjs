/**
 * infra/espocrm/overlay.mjs
 *
 * Phase 80, plan 08 (D-19, D-07): race-safe Booking idempotency key. EspoCRM's REST API cannot
 * declare unique indexes, so one metadata overlay is merged into the custom CBooking entityDefs
 * file (same mechanism as core entityDefs/User.json `userNameDeleteId`) and EspoCRM's own
 * rebuild creates the index. No raw SQL is ever run.
 *
 * Phase 81, plan 08 (D-05): the same mechanism for Lead.cSupabaseRef. Every entity-specific
 * command takes `--entity CBooking|Lead` (default CBooking; see ENTITY_SPECS).
 *
 * Commands (exit 0 ok, 1 config/usage, 2 API, 3 check failed). `[--entity E]` is optional everywhere
 * except rebuild, which is entity-independent:
 *   merge {current} {overlay} --out {file} [--entity E]
 *                                            prints `merge: added=...` or `merge: unchanged`
 *   check {file} [--entity E]                exit 0 when the entity's overlay keys are present
 *   precheck [--entity E]                    (admin API) <entity>_total=N; exit 3 on duplicate keys
 *   rebuild                                  (admin API) POST /Admin/rebuild
 *   probe-unique [--entity E]                (admin API) duplicate create must fail:
 *                                            unique=enforced (0) or unique=absent (3). Lead also
 *                                            proves Leads without a key stay creatable:
 *                                            empty_keys=allowed (0) or empty_keys=blocked (3)
 *
 * Output never contains credentials, record ids or key values.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import { fetchAll } from './lib/crm-read.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_OVERLAY_FILE = path.join(HERE, 'overlay', 'CBooking.entityDefs.json')

/**
 * Per-entity overlay settings. `probeBody(key)` is the minimal valid create body carrying the key
 * (`key` undefined -> a record without the key). `emptyKeyProbe` additionally proves that records
 * without the key stay creatable (manual Leads created in the UI have no cSupabaseRef).
 * `createHeaders` go on every probe create: stock Lead runs EspoCRM duplicate detection (by name),
 * which answers 409 with a duplicate list before the database is reached, so without
 * X-Skip-Duplicate-Check a refusal would say nothing about the unique index.
 */
export const ENTITY_SPECS = {
  CBooking: {
    keyField: 'supabaseBookingId',
    overlayFile: DEFAULT_OVERLAY_FILE,
    probeBody: (key) => ({ name: 'unique-probe', supabaseBookingId: key }),
    emptyKeyProbe: false,
  },
  Lead: {
    keyField: 'cSupabaseRef',
    overlayFile: path.join(HERE, 'overlay', 'Lead.entityDefs.json'),
    probeBody: (key) => (key === undefined ? { lastName: 'unique-probe' } : { lastName: 'unique-probe', cSupabaseRef: key }),
    emptyKeyProbe: true,
    createHeaders: { 'X-Skip-Duplicate-Check': 'true' },
  },
}
const DEFAULT_ENTITY = 'CBooking'

function entitySpec(entity = DEFAULT_ENTITY) {
  const spec = Object.hasOwn(ENTITY_SPECS, entity) ? ENTITY_SPECS[entity] : undefined
  if (!spec) throw new EspoConfigError(`Unknown entity: ${entity} (expected ${Object.keys(ENTITY_SPECS).join('|')})`)
  return spec
}

const MAX_SCAN = 20_000

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Serialise exactly as the merge tool writes files: 4-space indent, trailing newline. */
export const serialize = (json) => `${JSON.stringify(json, null, 4)}\n`

export function loadOverlay(file = DEFAULT_OVERLAY_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * Merge the overlay into the entityDefs FieldManager wrote. Fields and links are untouched.
 * `keyField` (default: the CBooking key) must exist in `fields`, or the file is not the expected
 * entity's definition and the merge refuses.
 * @param {any} current
 * @param {any} overlay
 * @param {{ keyField?: string }} [options]
 * @returns {{ result: Record<string, any>, added: string[] }}
 */
export function mergeOverlay(current, overlay, { keyField = ENTITY_SPECS[DEFAULT_ENTITY].keyField } = {}) {
  if (!isPlainObject(current) || !isPlainObject(current.fields) || !current.fields[keyField]) {
    const name = Object.entries(ENTITY_SPECS).find(([, s]) => s.keyField === keyField)?.[0] ?? 'expected entity'
    throw new EspoConfigError(`Refusing to merge: the file is not the ${name} definition (no fields.${keyField})`)
  }
  if (!isPlainObject(overlay)) throw new EspoConfigError('Overlay must be a JSON object')

  const result = { ...current }
  const added = []

  if (overlay.indexes !== undefined) {
    const indexes = { ...(isPlainObject(current.indexes) ? current.indexes : {}) }
    for (const [name, def] of Object.entries(overlay.indexes)) {
      if (!sameJson(indexes[name], def)) added.push(`indexes.${name}`)
      indexes[name] = structuredClone(def)
    }
    result.indexes = indexes
  }
  if (overlay.deleteId !== undefined) {
    if (current.deleteId !== overlay.deleteId) added.push('deleteId')
    result.deleteId = overlay.deleteId
  }
  return { result, added }
}

/** True when every overlay key is already present in the given entityDefs. */
export function hasOverlay(json, overlay = loadOverlay()) {
  if (!isPlainObject(json)) return false
  for (const [name, def] of Object.entries(overlay.indexes ?? {})) {
    if (!sameJson(json.indexes?.[name], def)) return false
  }
  if (overlay.deleteId !== undefined && json.deleteId !== overlay.deleteId) return false
  return true
}

/** @param {{ currentFile: string, overlayFile?: string, outFile: string, entity?: string, log?: (line: string) => void }} options */
export async function runMerge({ currentFile, overlayFile, outFile, entity, log = console.log }) {
  const spec = entitySpec(entity)
  const current = JSON.parse(readFileSync(currentFile, 'utf8'))
  const overlay = loadOverlay(overlayFile ?? spec.overlayFile)
  const { result, added } = mergeOverlay(current, overlay, { keyField: spec.keyField })
  writeFileSync(outFile, serialize(result))
  log(added.length ? `merge: added=${added.join(',')}` : 'merge: unchanged')
  return 0
}

/** @param {{ file: string, overlayFile?: string, entity?: string, log?: (line: string) => void }} options */
export function runCheck({ file, overlayFile, entity, log = console.log }) {
  const spec = entitySpec(entity)
  const json = JSON.parse(readFileSync(file, 'utf8'))
  const ok = hasOverlay(json, loadOverlay(overlayFile ?? spec.overlayFile))
  log(ok ? 'check: overlay present' : 'check: overlay missing')
  return ok ? 0 : 3
}

/** Count the entity's rows and look for repeated key values (index creation would fail). */
/** @param {{ client: { request: (method: string, path: string, body?: unknown) => Promise<any> }, entity?: string, log?: (line: string) => void }} options */
export async function runPrecheck({ client, entity = DEFAULT_ENTITY, log = console.log }) {
  const { keyField: KEY_FIELD } = entitySpec(entity)
  const first = await client.request('GET', `/${entity}?maxSize=1&select=id`)
  const total = Number(first?.total ?? 0)
  log(`${entity.toLowerCase()}_total=${total}`)
  if (total === 0) return 0
  if (total > MAX_SCAN) {
    log(`precheck: more than ${MAX_SCAN} rows, scan skipped`)
    return 3
  }

  // fetchAll orders by the unique id, de-duplicates repeated ids and fails closed when it
  // loaded fewer rows than the server reports: a row repeated by unstable paging is not a
  // duplicate key, and a skipped row must not give a false pass.
  const rows = await fetchAll(client, entity, ['id', KEY_FIELD])
  const seen = new Set()
  let duplicates = 0
  for (const row of rows) {
    const value = row?.[KEY_FIELD]
    if (value == null || value === '') continue
    if (seen.has(value)) duplicates++
    else seen.add(value)
  }
  log(`duplicates=${duplicates}`)
  return duplicates > 0 ? 3 : 0
}

/** @param {{ client: { request: (method: string, path: string, body?: unknown) => Promise<any> }, log?: (line: string) => void }} options */
export async function runRebuild({ client, log = console.log }) {
  await client.request('POST', '/Admin/rebuild')
  log('rebuild: done')
  return 0
}

/**
 * Statuses that can be the database refusing a duplicate key: 409 and 400 when EspoCRM maps the
 * constraint violation, 500 for the unmapped PDOException. Anything else (401/403 auth, 404, 429
 * rate limit, 502/503/504 gateway or upstream trouble, status 0 transport) says nothing about the
 * index and is surfaced instead of being reported as "enforced". A 500 is still ambiguous on its
 * own, so a refusal is only accepted after the control create below succeeds.
 */
export const UNIQUE_REFUSAL_STATUSES = new Set([400, 409, 500])

/**
 * Create one record of the entity, try to create the same key again, delete whatever was created.
 * A failing second create means the database refuses duplicates (unique=enforced), provided a
 * control record with a different key can still be created right afterwards (the refusal was
 * about the key, not a general server fault).
 *
 * For entities with `emptyKeyProbe` (Lead) it then creates two records WITHOUT the key: both must
 * succeed (empty_keys=allowed), because the owner creates Leads by hand in the CRM and those have no
 * site reference. A refused unkeyed create prints empty_keys=blocked and exits 3 (caller rolls back).
 */
/** @param {{ client: { request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<any> }, entity?: string, log?: (line: string) => void }} options */
export async function runProbeUnique({ client, entity = DEFAULT_ENTITY, log = console.log }) {
  const spec = entitySpec(entity)
  const keyField = spec.keyField
  const route = `/${entity}`
  const key = `unique-probe-${Date.now()}-${randomBytes(4).toString('hex')}`
  const body = spec.probeBody(key)
  const created = []
  let enforced = false
  let emptyKeys // undefined = not probed, true = allowed, false = blocked
  try {
    const first = await client.request('POST', route, body, spec.createHeaders)
    if (!first?.id) throw new EspoApiError('POST', route, 200, 'probe record was created without an id')
    created.push(first.id)

    let refused = false
    try {
      const second = await client.request('POST', route, body, spec.createHeaders)
      if (second?.id) created.push(second.id)
    } catch (err) {
      if (!(err instanceof EspoApiError) || !UNIQUE_REFUSAL_STATUSES.has(err.status)) throw err
      refused = true
    }

    if (refused) {
      // Control: another key must still be creatable, or the failure proves nothing about the index.
      const control = await client.request('POST', route, spec.probeBody(`${key}-control`), spec.createHeaders)
      if (!control?.id) throw new EspoApiError('POST', route, 200, 'control record was created without an id')
      created.push(control.id)
      enforced = true
      // The first record must be the only one with this key.
      const found = await client.request('GET', `${route}?select=id&where[0][type]=equals&where[0][attribute]=${keyField}&where[0][value]=${encodeURIComponent(key)}`)
      if (Number(found?.total ?? 0) !== 1) enforced = false
    }

    if (enforced && spec.emptyKeyProbe) {
      emptyKeys = true
      for (let i = 0; i < 2 && emptyKeys; i++) {
        try {
          const row = await client.request('POST', route, spec.probeBody(undefined), spec.createHeaders)
          if (!row?.id) throw new EspoApiError('POST', route, 200, 'probe record without a key was created without an id')
          created.push(row.id)
        } catch (err) {
          if (!(err instanceof EspoApiError) || !UNIQUE_REFUSAL_STATUSES.has(err.status)) throw err
          emptyKeys = false
        }
      }
    }
  } finally {
    for (const id of created) {
      try {
        await client.request('DELETE', `${route}/${id}`)
      } catch (err) {
        log(`probe cleanup: delete failed (${err instanceof EspoApiError ? err.status : 'error'})`)
      }
    }
  }
  log(enforced ? 'unique=enforced' : 'unique=absent')
  if (emptyKeys !== undefined) log(emptyKeys ? 'empty_keys=allowed' : 'empty_keys=blocked')
  return enforced && emptyKeys !== false ? 0 : 3
}

/** @returns {{ command: string, positional: string[], out?: string, entity?: string }} */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const positional = []
  let out
  let entity
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--out') out = rest[++i]
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length)
    else if (arg === '--entity') entity = rest[++i] ?? ''
    else if (arg.startsWith('--entity=')) entity = arg.slice('--entity='.length)
    else if (arg.startsWith('--')) throw new EspoConfigError(`Unknown argument: ${arg}`)
    else positional.push(arg)
  }
  if (entity !== undefined) entitySpec(entity) // unknown or missing value -> EspoConfigError
  return { command, positional, out, entity }
}

const USAGE =
  'Usage: overlay.mjs merge {current} {overlay} --out {file} [--entity CBooking|Lead] | check {file} [--entity E] | precheck [--entity E] | rebuild | probe-unique [--entity E]'

async function main(argv) {
  try {
    const { command, positional, out, entity } = parseArgs(argv)
    const adminClient = () => createEspoClient({ config: loadEspoConfig({ identity: 'admin' }) })
    let code
    switch (command) {
      case 'merge':
        if (positional.length !== 2 || !out) throw new EspoConfigError(USAGE)
        code = await runMerge({ currentFile: positional[0], overlayFile: positional[1], outFile: out, entity })
        break
      case 'check':
        if (positional.length !== 1) throw new EspoConfigError(USAGE)
        code = runCheck({ file: positional[0], entity })
        break
      case 'precheck':
        code = await runPrecheck({ client: adminClient(), entity })
        break
      case 'rebuild':
        code = await runRebuild({ client: adminClient() })
        break
      case 'probe-unique':
        code = await runProbeUnique({ client: adminClient(), entity })
        break
      default:
        throw new EspoConfigError(USAGE)
    }
    process.exit(code)
  } catch (err) {
    if (err instanceof EspoApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof EspoConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`Overlay failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
