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
 *     duplicate-check bypass header is ever sent). A 409 that no Contact with that email
 *     explains (EspoCRM also matches first + last name) is counted as duplicate_unresolved:
 *     the run continues and those bookings are written without a Contact link;
 *   - output is counts only: no email, name or phone number is ever printed.
 */

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import { PartialPreloadError, describeApiError, fetchAll, readOnlyClient, sleep } from './lib/crm-read.mjs'
import { byExportOrder, loadExport } from './lib/export-loader.mjs'
import {
  BookingMapError,
  PAYMENT_METHOD_VALUES,
  SYNCED_BOOKING_FIELDS,
  normalizeContactPhone,
  normalizeEmail,
  rowToBooking,
  rowToContact,
} from './lib/booking-map.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_INPUT = path.join(HERE, '.work', 'export')
const DEFAULT_DELAY_MS = 50

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isNil = (v) => v === null || v === undefined

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

// Re-exported: the export reader lives in lib/export-loader.mjs and is shared with seed-accounts.
export { loadExport }

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
      plan = {
        key,
        existing: existingContacts.get(key) ?? null,
        payload,
        phone: payload.phoneNumber,
        phoneKind: payload.phoneNumber ? normalizeContactPhone(row.client_phone).kind : 'omitted',
      }
      contactPlans.set(key, plan)
    } else if (!plan.phone && payload.phoneNumber) {
      plan.phone = payload.phoneNumber
      plan.phoneKind = normalizeContactPhone(row.client_phone).kind
    }
  }

  const contactOps = []
  const contactCounts = { create: 0, update: 0, unchanged: 0 }
  // Phone handling per Contact (aggregate only): kept / prefixed / omitted.
  const phoneCounts = { kept: 0, prefixed: 0, omitted: 0 }
  for (const plan of contactPlans.values()) phoneCounts[plan.phoneKind]++
  for (const plan of contactPlans.values()) {
    if (!plan.existing) {
      contactCounts.create++
      const payload = { ...plan.payload }
      if (plan.phone) payload.phoneNumber = plan.phone
      else delete payload.phoneNumber
      contactOps.push({ kind: 'create', key: plan.key, payload })
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
      phones: phoneCounts,
      bookings: bookingCounts,
    },
  }
}

// ---------------------------------------------------------------------------
// CRM preload
// ---------------------------------------------------------------------------

const CONTACT_SELECT = ['id', 'emailAddress', 'accountId', 'phoneNumber']
const BOOKING_SELECT = ['id', ...SYNCED_BOOKING_FIELDS, 'contactId', 'accountId']

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
  log(`contact_phones: kept=${c.phones.kept} prefixed=${c.phones.prefixed} omitted=${c.phones.omitted}`)
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
  if (dryRun) {
    log('dry-run: nothing written')
    return { counts: plan.counts, plan }
  }
  const applied = await applyPlan({ client, plan, contacts, delayMs })
  if (applied.conflicts > 0) log(`contacts: duplicate_resolved=${applied.conflicts}`)
  if (applied.duplicateUnresolved > 0) {
    log(`contacts: duplicate_unresolved=${applied.duplicateUnresolved} bookings_unlinked=${applied.unlinkedBookings}`)
  }
  log(`contacts: phone_dropped=${applied.phoneDropped}`)
  log(`applied: contacts=${applied.contactWrites} bookings=${applied.bookingWrites}`)
  return { counts: plan.counts, plan, applied }
}

/** Sequential writes with a pause between them (the app container is memory capped). */
function makeWriter(delayMs) {
  let first = true
  return async () => {
    if (!first) await sleep(delayMs)
    first = false
  }
}

async function lookupContactByEmail(client, email) {
  const qs =
    'select=id,emailAddress,accountId,phoneNumber&maxSize=2' +
    `&where[0][type]=equals&where[0][attribute]=emailAddress&where[0][value]=${encodeURIComponent(email)}`
  const res = await client.request('GET', `/Contact?${qs}`)
  return Array.isArray(res?.list) && res.list.length > 0 ? res.list[0] : null
}

async function applyPlan({ client, plan, contacts, delayMs }) {
  const pause = makeWriter(delayMs)
  // email key -> { id, accountId } for every Contact a booking may link to.
  const contactMap = new Map()
  for (const c of contacts) {
    const key = normalizeEmail(c.emailAddress)
    if (key && !contactMap.has(key)) contactMap.set(key, { id: c.id, accountId: c.accountId ?? null })
  }
  let contactWrites = 0
  let bookingWrites = 0
  let conflicts = 0
  let phoneDropped = 0
  // Contact keys (emails) whose create hit a 409 that no Contact with that email explains.
  const unresolved = new Set()
  let unlinkedBookings = 0

  for (const op of plan.contactOps) {
    if (op.kind === 'create') {
      await pause()
      try {
        let created
        try {
          created = await client.request('POST', '/Contact', op.payload)
        } catch (err) {
          // EspoCRM still rejects the normalised phone: retry this one Contact once without it.
          if (!(err instanceof EspoApiError) || err.status !== 400 || !op.payload.phoneNumber) throw err
          const { phoneNumber: _dropped, ...withoutPhone } = op.payload
          await pause()
          created = await client.request('POST', '/Contact', withoutPhone)
          phoneDropped++
        }
        contactWrites++
        contactMap.set(op.key, { id: created.id, accountId: created.accountId ?? null })
      } catch (err) {
        // 409 = EspoCRM duplicate check: the Contact exists, reuse it.
        if (!(err instanceof EspoApiError) || err.status !== 409) throw err
        const found = await lookupContactByEmail(client, op.key)
        if (!found) {
          // The check also matches on first + last name, so a 409 can come from a DIFFERENT
          // Contact that merely shares the name (another email). That is not resolvable here:
          // leave this email without a Contact, keep going, and let the owner decide in the CRM.
          // Counts only are reported. Re-running repeats the same 409 harmlessly.
          unresolved.add(op.key)
          continue
        }
        conflicts++
        contactMap.set(op.key, { id: found.id, accountId: found.accountId ?? null })
      }
    } else {
      await pause()
      try {
        await client.request('PUT', `/Contact/${op.id}`, op.data)
        contactWrites++
      } catch (err) {
        // A phone EspoCRM rejects is skipped: the Contact keeps no phone, the run continues.
        if (!(err instanceof EspoApiError) || err.status !== 400) throw err
        phoneDropped++
      }
    }
  }

  for (const op of plan.bookingOps) {
    const data = { ...op.data }
    const contact = op.contactKey ? contactMap.get(op.contactKey) : null
    if (contact) {
      data.contactId = contact.id
      if (contact.accountId) data.accountId = contact.accountId
      else if (op.kind === 'create') delete data.accountId
    } else if (op.contactKey && unresolved.has(op.contactKey)) {
      // No usable Contact for this email: write the booking without touching its Contact link.
      delete data.contactId
      delete data.accountId
      unlinkedBookings++
    }
    await pause()
    if (op.kind === 'create') await client.request('POST', '/CBooking', data)
    else await client.request('PUT', `/CBooking/${op.id}`, data)
    bookingWrites++
  }
  return { contactWrites, bookingWrites, conflicts, phoneDropped, duplicateUnresolved: unresolved.size, unlinkedBookings }
}

/**
 * D-10 re-link pass: re-copy accountId from each booking's Contact wherever it drifted
 * (the owner attaches Contacts to Accounts after the first run). Idempotent.
 */
export async function runRelink({ client: rawClient, dryRun = false, delayMs = DEFAULT_DELAY_MS, log = console.log }) {
  const client = dryRun ? readOnlyClient(rawClient) : rawClient
  const contacts = await fetchAll(client, 'Contact', ['id', 'accountId'])
  const bookings = await fetchAll(client, 'CBooking', ['id', 'contactId', 'accountId'])
  const accountOf = new Map(contacts.map((c) => [c.id, c.accountId ?? null]))
  const pause = makeWriter(delayMs)
  let update = 0
  let unchanged = 0
  for (const b of bookings) {
    if (!b.contactId || !accountOf.has(b.contactId)) continue
    const desired = accountOf.get(b.contactId)
    if (sameValue(b.accountId, desired)) {
      unchanged++
      continue
    }
    update++
    if (!dryRun) {
      await pause()
      await client.request('PUT', `/CBooking/${b.id}`, { accountId: desired })
    }
  }
  log(`relink: update=${update} unchanged=${unchanged}`)
  return { update, unchanged }
}

/** Reports supabaseBookingId values held by more than one CBooking (read-only). */
export async function runAudit({ client, log = console.log }) {
  const bookings = await fetchAll(client, 'CBooking', ['id', 'supabaseBookingId'])
  const groups = new Map()
  for (const b of bookings) {
    if (isNil(b.supabaseBookingId) || b.supabaseBookingId === '') continue
    const ids = groups.get(b.supabaseBookingId) ?? []
    ids.push(b.id)
    groups.set(b.supabaseBookingId, ids)
  }
  const duplicates = [...groups.entries()].filter(([, ids]) => ids.length > 1)
  log(`audit: records=${bookings.length} duplicates=${duplicates.length}`)
  for (const [sid, ids] of duplicates) log(`duplicate: supabaseBookingId=${sid} records=${ids.join(',')}`)
  return { records: bookings.length, duplicates: duplicates.length, groups: duplicates }
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

/**
 * @param {string[]} argv
 * @param {{ client?: { request: Function }, log?: (line: string) => void, error?: (line: string) => void }} [deps]
 * @returns {Promise<number>} the process exit code
 */
export async function runCli(argv, { client, log = console.log, error = console.error } = {}) {
  try {
    const opts = parseArgs(argv)
    if (!opts.audit && !opts.relink) {
      // Validate the export before touching credentials or the network.
      loadExport(opts.input)
    }
    const api = client ?? createEspoClient({ config: loadEspoConfig({ identity: 'apikey' }) })
    if (opts.audit) {
      const audit = await runAudit({ client: api, log })
      return audit.duplicates > 0 ? 3 : 0
    }
    if (opts.relink) {
      await runRelink({ client: api, dryRun: opts.dryRun, delayMs: opts.delayMs, log })
      return 0
    }
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
    if (err instanceof PartialPreloadError) {
      // Entity name and counts only: safe to print.
      error(`Preload incomplete: ${err.message}`)
      return 2
    }
    error(`Backfill failed: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  process.exit(await runCli(process.argv.slice(2)))
}
