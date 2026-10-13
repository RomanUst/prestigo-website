#!/usr/bin/env node
/**
 * infra/espocrm/backfill.mjs
 *
 * One-time, re-runnable booking backfill (Phase 80, plan 09; D-06, D-07, D-10, D-21).
 * Supabase export (page-NN.json files produced with the Supabase MCP or the SQL editor,
 * kept under the git-ignored infra/espocrm/.work/) -> EspoCRM Contact + CBooking.
 *
 *   node infra/espocrm/backfill.mjs [--dry-run] [--input path] [--limit N]
 *                                   [--delay-ms N] [--relink] [--audit]
 *
 * Identity: prestigo-sync (API key, Sync writer role). Exit codes: 0 ok, 1 config,
 * 2 API, 3 audit found duplicates.
 *
 * Safety properties:
 *   - only reads Supabase export files; never writes to Supabase, never deletes a CRM record;
 *   - idempotent: lookup before write, keyed on supabaseBookingId (bookings) and the
 *     normalized email (contacts); a second run reports create=0 update=0;
 *   - field ownership: an existing Contact keeps its names, accountId, title and
 *     description; phoneNumber is filled only when empty. Bookings are sync-owned;
 *   - a 409 on Contact create is resolved by looking the Contact up by email (no
 *     duplicate-check bypass header is ever sent);
 *   - output is counts only: no email, name or phone number is ever printed.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import {
  BookingMapError,
  PAYMENT_METHOD_VALUES,
  SYNCED_BOOKING_FIELDS,
  isAbandonedCheckout,
  normalizeEmail,
  rowToBooking,
  rowToContact,
} from './lib/booking-map.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_INPUT = path.join(HERE, '.work', 'export')
const PAGE_SIZE = 200
const DEFAULT_DELAY_MS = 50

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isNil = (v) => v === null || v === undefined
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

/** null and '' are equal; numbers compare numerically (a numeric string equals its number). */
function sameValue(a, b) {
  const ea = isNil(a) || a === ''
  const eb = isNil(b) || b === ''
  if (ea || eb) return ea && eb
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a)
    const nb = Number(b)
    return Number.isFinite(na) && Number.isFinite(nb) && na === nb
  }
  return String(a) === String(b)
}

const countBy = (items, pick) => {
  const out = {}
  for (const item of items) {
    const key = pick(item)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

const fmtCounts = (obj) =>
  Object.keys(obj)
    .sort()
    .map((k) => `${k}=${obj[k]}`)
    .join(' ')

const byExportOrder = (a, b) => {
  const ca = String(a.created_at ?? '')
  const cb = String(b.created_at ?? '')
  if (ca !== cb) return ca < cb ? -1 : 1
  const ia = String(a.id)
  const ib = String(b.id)
  return ia < ib ? -1 : ia > ib ? 1 : 0
}

// ---------------------------------------------------------------------------
// Export loading
// ---------------------------------------------------------------------------

/**
 * Load the Supabase export: a single .json file or a directory of page-*.json files.
 * De-duplicates by id (duplicate_rows) and re-applies the abandoned-checkout rule
 * (excluded_abandoned). Rows come back in export order (created_at, id).
 * Error messages name only the path: file contents never reach an error message.
 */
export function loadExport(input) {
  if (!input || !existsSync(input)) {
    throw new EspoConfigError(`Export input not found: ${input}`)
  }
  let files
  if (statSync(input).isDirectory()) {
    files = readdirSync(input)
      .filter((f) => /^page-.*\.json$/.test(f))
      .sort()
      .map((f) => path.join(input, f))
    if (files.length === 0) throw new EspoConfigError(`No page-*.json files in: ${input}`)
  } else {
    files = [input]
  }

  const seen = new Map()
  let duplicateRows = 0
  for (const file of files) {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      throw new EspoConfigError(`Export file is not valid JSON: ${file}`)
    }
    if (!Array.isArray(parsed)) throw new EspoConfigError(`Export file is not a JSON array: ${file}`)
    for (const row of parsed) {
      if (!row || typeof row !== 'object' || isNil(row.id) || row.id === '') {
        throw new EspoConfigError(`Export file holds a row without id: ${file}`)
      }
      if (seen.has(row.id)) duplicateRows++
      else seen.set(row.id, row)
    }
  }

  const all = [...seen.values()]
  const rows = all.filter((r) => !isAbandonedCheckout(r)).sort(byExportOrder)
  return {
    rows,
    counts: {
      rows: all.length,
      excluded_abandoned: all.length - rows.length,
      duplicate_rows: duplicateRows,
    },
  }
}

// ---------------------------------------------------------------------------
// Plan (pure)
// ---------------------------------------------------------------------------

function diffBooking(existing, desired, contactInfo) {
  const data = {}
  for (const field of SYNCED_BOOKING_FIELDS) {
    if (!sameValue(existing[field], desired[field])) data[field] = desired[field]
  }
  if (contactInfo) {
    if (!contactInfo.id || !sameValue(existing.contactId, contactInfo.id)) data.contactId = contactInfo.id ?? null
    if (contactInfo.id && !sameValue(existing.accountId, contactInfo.accountId)) {
      data.accountId = contactInfo.accountId ?? null
    }
  }
  return data
}

/**
 * Pure: export rows + preloaded CRM state -> operations + counts. Never touches the network.
 *
 * @param {{ rows: object[], contacts: object[], bookings: object[], limit?: number }} input
 */
export function planBackfill({ rows, contacts, bookings, limit }) {
  const existingContacts = new Map()
  for (const c of contacts) {
    const key = normalizeEmail(c.emailAddress)
    if (key && !existingContacts.has(key)) existingContacts.set(key, c)
  }
  const existingBookings = new Map()
  for (const b of bookings) {
    if (!isNil(b.supabaseBookingId) && b.supabaseBookingId !== '' && !existingBookings.has(b.supabaseBookingId)) {
      existingBookings.set(b.supabaseBookingId, b)
    }
  }

  let invalid = 0
  let valid = []
  for (const row of [...rows].sort(byExportOrder)) {
    try {
      valid.push({ row, booking: rowToBooking(row) })
    } catch (err) {
      if (err instanceof BookingMapError) invalid++
      else throw err
    }
  }
  if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) valid = valid.slice(0, limit)

  // Contacts, keyed by normalized email, first row (export order) wins for names.
  const contactPlans = new Map()
  const contactOf = new Map()
  let withoutContact = 0
  for (const { row, booking } of valid) {
    const payload = rowToContact(row)
    if (!payload) {
      withoutContact++
      continue
    }
    const key = payload.emailAddress
    contactOf.set(booking.supabaseBookingId, key)
    let plan = contactPlans.get(key)
    if (!plan) {
      plan = { key, existing: existingContacts.get(key) ?? null, payload, phone: payload.phoneNumber }
      contactPlans.set(key, plan)
    } else if (!plan.phone && payload.phoneNumber) {
      plan.phone = payload.phoneNumber
    }
  }

  const contactOps = []
  const contactCounts = { create: 0, update: 0, unchanged: 0 }
  for (const plan of contactPlans.values()) {
    if (!plan.existing) {
      contactCounts.create++
      contactOps.push({ kind: 'create', key: plan.key, payload: { ...plan.payload, phoneNumber: plan.phone } })
    } else if (isNil(plan.existing.phoneNumber) || plan.existing.phoneNumber === '') {
      if (plan.phone) {
        contactCounts.update++
        contactOps.push({ kind: 'update', key: plan.key, id: plan.existing.id, data: { phoneNumber: plan.phone } })
      } else contactCounts.unchanged++
    } else contactCounts.unchanged++
  }

  const bookingOps = []
  const bookingCounts = { create: 0, update: 0, unchanged: 0, without_contact: withoutContact }
  for (const { booking } of valid) {
    const key = contactOf.get(booking.supabaseBookingId) ?? null
    const cplan = key ? contactPlans.get(key) : null
    // A Contact still to be created has no id yet: the booking links to it at apply time.
    const contactInfo = cplan
      ? { id: cplan.existing?.id ?? null, accountId: cplan.existing?.accountId ?? null }
      : null
    const existing = existingBookings.get(booking.supabaseBookingId)
    if (!existing) {
      bookingCounts.create++
      bookingOps.push({ kind: 'create', data: booking, contactKey: key })
      continue
    }
    const data = diffBooking(existing, booking, contactInfo)
    if (Object.keys(data).length === 0) bookingCounts.unchanged++
    else {
      bookingCounts.update++
      bookingOps.push({ kind: 'update', id: existing.id, data, contactKey: key })
    }
  }

  const methods = Object.fromEntries(PAYMENT_METHOD_VALUES.map((m) => [m, 0]))
  for (const { booking } of valid) methods[booking.paymentMethod]++

  return {
    contactOps,
    bookingOps,
    counts: {
      eligible: rows.length,
      invalid,
      planned: valid.length,
      byStatus: countBy(valid, (v) => v.booking.status),
      bySource: countBy(valid, (v) => v.booking.source),
      byPaymentMethod: methods,
      contacts: contactCounts,
      bookings: bookingCounts,
    },
  }
}

// ---------------------------------------------------------------------------
// CRM preload
// ---------------------------------------------------------------------------

/** Page through a collection (server cap 200); de-duplicates by id against unstable paging. */
async function fetchAll(client, entity, select) {
  const out = new Map()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const qs = `select=${select.join(',')}&maxSize=${PAGE_SIZE}&offset=${offset}&orderBy=createdAt&order=asc`
    const res = await client.request('GET', `/${entity}?${qs}`)
    const list = Array.isArray(res?.list) ? res.list : []
    for (const rec of list) if (rec?.id && !out.has(rec.id)) out.set(rec.id, rec)
    if (list.length < PAGE_SIZE) break
    if (typeof res?.total === 'number' && res.total >= 0 && offset + PAGE_SIZE >= res.total) break
  }
  return [...out.values()]
}

const CONTACT_SELECT = ['id', 'emailAddress', 'accountId', 'phoneNumber']
const BOOKING_SELECT = ['id', ...SYNCED_BOOKING_FIELDS, 'contactId', 'accountId']

function readOnlyClient(client) {
  return {
    ...client,
    request(method, apiPath, body) {
      if (method !== 'GET') throw new Error(`dry-run refused ${method} ${apiPath.split('?')[0]}`)
      return client.request(method, apiPath, body)
    },
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function printCounts(log, exp, plan, limit) {
  const c = plan.counts
  log(
    `export: rows=${exp.counts.rows} eligible=${c.eligible} excluded_abandoned=${exp.counts.excluded_abandoned} ` +
      `invalid=${c.invalid} duplicate_rows=${exp.counts.duplicate_rows}`,
  )
  if (typeof limit === 'number') log(`limit: planned=${c.planned}`)
  log(`by_status: ${fmtCounts(c.byStatus)}`)
  log(`by_source: ${fmtCounts(c.bySource)}`)
  log(`by_payment_method: ${PAYMENT_METHOD_VALUES.map((m) => `${m}=${c.byPaymentMethod[m]}`).join(' ')}`)
  log(`contacts: create=${c.contacts.create} update=${c.contacts.update} unchanged=${c.contacts.unchanged}`)
  log(
    `bookings: create=${c.bookings.create} update=${c.bookings.update} unchanged=${c.bookings.unchanged} ` +
      `without_contact=${c.bookings.without_contact}`,
  )
}

/**
 * @param {{ client: { request: Function }, input?: string, dryRun?: boolean, limit?: number,
 *           delayMs?: number, log?: (line: string) => void }} options
 */
export async function runBackfill({
  client: rawClient,
  input = DEFAULT_INPUT,
  dryRun = false,
  limit,
  delayMs = DEFAULT_DELAY_MS,
  log = console.log,
}) {
  const exp = loadExport(input)
  const client = dryRun ? readOnlyClient(rawClient) : rawClient
  const contacts = await fetchAll(client, 'Contact', CONTACT_SELECT)
  const bookings = await fetchAll(client, 'CBooking', BOOKING_SELECT)
  const plan = planBackfill({ rows: exp.rows, contacts, bookings, limit })
  printCounts(log, exp, plan, limit)
  if (dryRun) log('dry-run: nothing written')
  return { counts: plan.counts, plan }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { dryRun: false, input: DEFAULT_INPUT, limit: undefined, delayMs: DEFAULT_DELAY_MS, relink: false, audit: false }
  const intArg = (name, value) => {
    const n = Number(value)
    if (value === undefined || !Number.isInteger(n) || n < 0) throw new EspoConfigError(`${name} needs a non-negative integer`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--relink') opts.relink = true
    else if (arg === '--audit') opts.audit = true
    else if (arg === '--input') {
      if (!argv[i + 1]) throw new EspoConfigError('--input needs a path')
      opts.input = argv[++i]
    } else if (arg.startsWith('--input=')) opts.input = arg.slice('--input='.length)
    else if (arg === '--limit') opts.limit = intArg('--limit', argv[++i])
    else if (arg.startsWith('--limit=')) opts.limit = intArg('--limit', arg.slice('--limit='.length))
    else if (arg === '--delay-ms') opts.delayMs = intArg('--delay-ms', argv[++i])
    else if (arg.startsWith('--delay-ms=')) opts.delayMs = intArg('--delay-ms', arg.slice('--delay-ms='.length))
    else throw new EspoConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

/** API failure line without query string or body: a lookup URL can carry an email address. */
function describeApiError(err) {
  return `${err.method} ${String(err.apiPath).split('?')[0]} -> ${err.status}`
}

/** @returns {Promise<number>} the process exit code */
export async function runCli(argv, { client, log = console.log, error = console.error } = {}) {
  try {
    const opts = parseArgs(argv)
    if (!opts.audit && !opts.relink) {
      // Validate the export before touching credentials or the network.
      loadExport(opts.input)
    }
    const api = client ?? createEspoClient({ config: loadEspoConfig({ identity: 'apikey' }) })
    await runBackfill({ client: api, ...opts, log })
    return 0
  } catch (err) {
    if (err instanceof EspoApiError) {
      error(`API error: ${describeApiError(err)}`)
      return 2
    }
    if (err instanceof EspoConfigError) {
      error(`Config error: ${err.message}`)
      return 1
    }
    error(`Backfill failed: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  process.exit(await runCli(process.argv.slice(2)))
}
