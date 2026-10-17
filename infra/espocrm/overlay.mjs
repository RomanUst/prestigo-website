/**
 * infra/espocrm/overlay.mjs
 *
 * Phase 80, plan 08 (D-19, D-07): race-safe Booking idempotency key. EspoCRM's REST API cannot
 * declare unique indexes, so one metadata overlay is merged into the custom CBooking entityDefs
 * file (same mechanism as core entityDefs/User.json `userNameDeleteId`) and EspoCRM's own
 * rebuild creates the index. No raw SQL is ever run.
 *
 * Commands (exit 0 ok, 1 config/usage, 2 API, 3 check failed):
 *   merge {current} {overlay} --out {file}   prints `merge: added=...` or `merge: unchanged`
 *   check {file}                             exit 0 when the overlay keys are present
 *   precheck                                 (admin API) cbooking_total=N; exit 3 on duplicate keys
 *   rebuild                                  (admin API) POST /Admin/rebuild
 *   probe-unique                             (admin API) duplicate create must fail:
 *                                            unique=enforced (0) or unique=absent (3)
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

const KEY_FIELD = 'supabaseBookingId'
const MAX_SCAN = 20_000

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Serialise exactly as the merge tool writes files: 4-space indent, trailing newline. */
export const serialize = (json) => `${JSON.stringify(json, null, 4)}\n`

export function loadOverlay(file = DEFAULT_OVERLAY_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * Merge the overlay into the CBooking entityDefs FieldManager wrote. Fields and links are untouched.
 * @returns {{ result: Record<string, any>, added: string[] }}
 */
export function mergeOverlay(current, overlay) {
  if (!isPlainObject(current) || !isPlainObject(current.fields) || !current.fields[KEY_FIELD]) {
    throw new EspoConfigError(`Refusing to merge: the file is not the CBooking definition (no fields.${KEY_FIELD})`)
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

/** True when every overlay key is already present in the given CBooking entityDefs. */
export function hasOverlay(json, overlay = loadOverlay()) {
  if (!isPlainObject(json)) return false
  for (const [name, def] of Object.entries(overlay.indexes ?? {})) {
    if (!sameJson(json.indexes?.[name], def)) return false
  }
  if (overlay.deleteId !== undefined && json.deleteId !== overlay.deleteId) return false
  return true
}

/** @param {{ currentFile: string, overlayFile?: string, outFile: string, log?: (line: string) => void }} options */
export async function runMerge({ currentFile, overlayFile, outFile, log = console.log }) {
  const current = JSON.parse(readFileSync(currentFile, 'utf8'))
  const overlay = loadOverlay(overlayFile)
  const { result, added } = mergeOverlay(current, overlay)
  writeFileSync(outFile, serialize(result))
  log(added.length ? `merge: added=${added.join(',')}` : 'merge: unchanged')
  return 0
}

/** @param {{ file: string, overlayFile?: string, log?: (line: string) => void }} options */
export function runCheck({ file, overlayFile, log = console.log }) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  const ok = hasOverlay(json, loadOverlay(overlayFile))
  log(ok ? 'check: overlay present' : 'check: overlay missing')
  return ok ? 0 : 3
}

/** Count CBooking rows and look for repeated supabaseBookingId values (index creation would fail). */
/** @param {{ client: { request: (method: string, path: string, body?: unknown) => Promise<any> }, log?: (line: string) => void }} options */
export async function runPrecheck({ client, log = console.log }) {
  const first = await client.request('GET', '/CBooking?maxSize=1&select=id')
  const total = Number(first?.total ?? 0)
  log(`cbooking_total=${total}`)
  if (total === 0) return 0
  if (total > MAX_SCAN) {
    log(`precheck: more than ${MAX_SCAN} rows, scan skipped`)
    return 3
  }

  // fetchAll orders by the unique id, de-duplicates repeated ids and fails closed when it
  // loaded fewer rows than the server reports: a row repeated by unstable paging is not a
  // duplicate key, and a skipped row must not give a false pass.
  const rows = await fetchAll(client, 'CBooking', ['id', KEY_FIELD])
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
 * Create one CBooking, try to create the same key again, delete whatever was created.
 * A failing second create means the database refuses duplicates (unique=enforced).
 */
/** @param {{ client: { request: (method: string, path: string, body?: unknown) => Promise<any> }, log?: (line: string) => void }} options */
export async function runProbeUnique({ client, log = console.log }) {
  const key = `unique-probe-${Date.now()}-${randomBytes(4).toString('hex')}`
  const body = { name: 'unique-probe', [KEY_FIELD]: key }
  const created = []
  let enforced = false
  try {
    const first = await client.request('POST', '/CBooking', body)
    if (!first?.id) throw new EspoApiError('POST', '/CBooking', 200, 'probe record was created without an id')
    created.push(first.id)

    try {
      const second = await client.request('POST', '/CBooking', body)
      if (second?.id) created.push(second.id)
    } catch (err) {
      // Auth failures and transport problems say nothing about the index: surface them.
      if (!(err instanceof EspoApiError) || err.status === 401 || err.status === 403 || err.status === 0) throw err
      enforced = true
    }

    if (enforced) {
      // The first record must be the only one with this key.
      const found = await client.request('GET', `/CBooking?select=id&where[0][type]=equals&where[0][attribute]=${KEY_FIELD}&where[0][value]=${encodeURIComponent(key)}`)
      if (Number(found?.total ?? 0) !== 1) enforced = false
    }
  } finally {
    for (const id of created) {
      try {
        await client.request('DELETE', `/CBooking/${id}`)
      } catch (err) {
        log(`probe cleanup: delete failed (${err instanceof EspoApiError ? err.status : 'error'})`)
      }
    }
  }
  log(enforced ? 'unique=enforced' : 'unique=absent')
  return enforced ? 0 : 3
}

/** @returns {{ command: string, positional: string[], out?: string }} */
export function parseArgs(argv) {
  const [command, ...rest] = argv
  const positional = []
  let out
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--out') out = rest[++i]
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length)
    else if (arg.startsWith('--')) throw new EspoConfigError(`Unknown argument: ${arg}`)
    else positional.push(arg)
  }
  return { command, positional, out }
}

const USAGE = 'Usage: overlay.mjs merge {current} {overlay} --out {file} | check {file} | precheck | rebuild | probe-unique'

async function main(argv) {
  try {
    const { command, positional, out } = parseArgs(argv)
    const adminClient = () => createEspoClient({ config: loadEspoConfig({ identity: 'admin' }) })
    let code
    switch (command) {
      case 'merge':
        if (positional.length !== 2 || !out) throw new EspoConfigError(USAGE)
        code = await runMerge({ currentFile: positional[0], overlayFile: positional[1], outFile: out })
        break
      case 'check':
        if (positional.length !== 1) throw new EspoConfigError(USAGE)
        code = runCheck({ file: positional[0] })
        break
      case 'precheck':
        code = await runPrecheck({ client: adminClient() })
        break
      case 'rebuild':
        code = await runRebuild({ client: adminClient() })
        break
      case 'probe-unique':
        code = await runProbeUnique({ client: adminClient() })
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
