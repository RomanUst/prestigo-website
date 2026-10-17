#!/usr/bin/env node
/**
 * infra/espocrm/seed-accounts.mjs
 *
 * D-14 / D-10 partner Account seeding (Phase 80, plan 13). Reads the owner-confirmed
 * candidate list written by account-candidates.mjs, creates one Account per confirmed
 * candidate and links the matching Contacts that have no Account yet.
 *
 *   node infra/espocrm/seed-accounts.mjs [--dry-run]
 *                                        [--candidates infra/espocrm/.work/candidates.json]
 *                                        [--input infra/espocrm/.work/export] [--delay-ms N]
 *
 * Afterwards run `node infra/espocrm/backfill.mjs --relink` so each CBooking inherits the
 * Account of its Contact.
 *
 * Identity: prestigo-sync (API key, Sync writer role). Exit codes: 0 ok, 1 config, 2 API.
 *
 * Safety properties:
 *   - only candidates with confirm:true and a D-02 type create anything; the restore-drill
 *     canary and a confirmed entry with a bad type abort the run before any request;
 *   - an existing Account (same name in any case, or same website domain) is reused and
 *     never modified or deleted; writes are POST /Account and PUT /Contact/{id} only;
 *   - only Contacts with an empty accountId are linked. A Contact matching two candidates is
 *     ambiguous and left alone. Free-mail domains never link (a hand-edited candidate
 *     carrying gmail.com cannot sweep up private people);
 *   - idempotent: a second run reports accounts: create=0 and contacts: link=0;
 *   - output is ids and counts only: no email address and no name is ever printed.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import { normalizeEmail } from './lib/booking-map.mjs'
import { FREE_MAIL_DOMAINS, emailDomain, selectConfirmed } from './lib/candidates.mjs'
import { PartialPreloadError, describeApiError, fetchAll, readOnlyClient, sleep } from './lib/crm-read.mjs'
import { loadExport } from './lib/export-loader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK_DIR = path.join(HERE, '.work')
export const DEFAULT_CANDIDATES = path.join(WORK_DIR, 'candidates.json')
export const DEFAULT_INPUT = path.join(WORK_DIR, 'export')
const DEFAULT_DELAY_MS = 50
const FREE_MAIL = new Set(FREE_MAIL_DOMAINS)

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const nameKey = (s) => collapse(s).toLowerCase()
const isBlank = (v) => v === null || v === undefined || v === ''

/** Host of a website value (protocol, www., path and port removed), lower case, or null. */
function websiteHost(website) {
  const text = collapse(website).toLowerCase()
  if (!text) return null
  const host = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].split(':')[0].replace(/^www\./, '')
  return host || null
}

// ---------------------------------------------------------------------------
// Plan (pure)
// ---------------------------------------------------------------------------

/**
 * Pure: owner-confirmed candidates + preloaded CRM state + export rows -> operations + counts.
 * Never touches the network. Throws for the canary or a confirmed candidate with a bad type.
 *
 * @param {{ candidates: object[], accounts: object[], contacts: object[], rows: object[] }} input
 */
export function planSeed({ candidates, accounts, contacts, rows }) {
  const confirmed = selectConfirmed(candidates)

  // Working copy of the Accounts so two candidates with one name cannot create it twice.
  const known = (accounts ?? []).map((a) => ({ id: a.id, nameKey: nameKey(a.name), host: websiteHost(a.website) }))
  const accountOps = []
  let created = 0
  let existing = 0
  confirmed.forEach((c, index) => {
    const key = c.key ?? `#${index}`
    const domain = isBlank(c.domain) ? null : String(c.domain).toLowerCase()
    const match = known.find((a) => a.nameKey === nameKey(c.name) || (domain !== null && a.host === domain))
    if (match) {
      existing++
      accountOps.push({ kind: 'existing', key, id: match.id })
      return
    }
    const payload = { name: collapse(c.name), type: c.type }
    if (domain) payload.website = `https://${domain}`
    if (c.type === 'Other' && !isBlank(c.note)) payload.cOtherTypeNote = collapse(c.note)
    created++
    known.push({ id: null, nameKey: nameKey(c.name), host: domain })
    accountOps.push({ kind: 'create', key, payload })
  })

  // Company names a given (normalized) email booked under.
  const companiesByEmail = new Map()
  for (const row of rows ?? []) {
    const email = normalizeEmail(row.client_email)
    const company = nameKey(row.company_name)
    if (!email || !company) continue
    if (!companiesByEmail.has(email)) companiesByEmail.set(email, new Set())
    companiesByEmail.get(email).add(company)
  }

  const matchers = confirmed.map((c, index) => ({
    key: c.key ?? `#${index}`,
    domain: isBlank(c.domain) || FREE_MAIL.has(String(c.domain).toLowerCase()) ? null : String(c.domain).toLowerCase(),
    companies: new Set((c.companyNames ?? []).map(nameKey).filter(Boolean)),
  }))

  const links = []
  const contactCounts = { link: 0, already_linked: 0, ambiguous: 0 }
  for (const contact of contacts ?? []) {
    const email = normalizeEmail(contact.emailAddress)
    if (!email) continue
    const domain = emailDomain(email)
    const companies = companiesByEmail.get(email) ?? new Set()
    const hits = matchers.filter(
      (m) => (m.domain !== null && domain === m.domain) || [...companies].some((name) => m.companies.has(name)),
    )
    if (hits.length === 0) continue
    if (!isBlank(contact.accountId)) {
      contactCounts.already_linked++
      continue
    }
    // Two candidates that resolve to one Account are not a conflict.
    const targets = new Set(
      hits.map((h) => accountOps.find((op) => op.key === h.key)).map((op) => (op.kind === 'existing' ? `id:${op.id}` : `new:${op.key}`)),
    )
    if (targets.size > 1) {
      contactCounts.ambiguous++
      continue
    }
    contactCounts.link++
    links.push({ contactId: contact.id, candidateKey: hits[0].key })
  }

  return {
    accountOps,
    links,
    counts: { accounts: { create: created, existing }, contacts: contactCounts },
  }
}

// ---------------------------------------------------------------------------
// CRM preload and run
// ---------------------------------------------------------------------------

/**
 * @param {{ client: { request: Function }, candidates: object[], rows?: object[], dryRun?: boolean,
 *           delayMs?: number, log?: (line: string) => void }} options
 */
export async function runSeed({ client: rawClient, candidates, rows = [], dryRun = false, delayMs = DEFAULT_DELAY_MS, log = console.log }) {
  // Validate the confirmations (canary, bad type) before the first request.
  try {
    selectConfirmed(candidates)
  } catch (err) {
    throw new EspoConfigError(err instanceof Error ? err.message : 'invalid candidates')
  }
  const client = dryRun ? readOnlyClient(rawClient) : rawClient
  const accounts = await fetchAll(client, 'Account', ['id', 'name', 'website', 'type'])
  const contacts = await fetchAll(client, 'Contact', ['id', 'emailAddress', 'accountId'])
  const plan = planSeed({ candidates, accounts, contacts, rows })

  const accountIdOf = new Map()
  let first = true
  const pause = async () => {
    if (!first) await sleep(delayMs)
    first = false
  }

  for (const op of plan.accountOps) {
    if (op.kind === 'existing') {
      accountIdOf.set(op.key, op.id)
      log(`account ${op.id} existing`)
    } else if (dryRun) {
      log('account - would-create')
    } else {
      await pause()
      const created = await client.request('POST', '/Account', op.payload)
      accountIdOf.set(op.key, created.id)
      log(`account ${created.id} created`)
    }
  }
  log(`accounts: create=${plan.counts.accounts.create} existing=${plan.counts.accounts.existing}`)

  if (!dryRun) {
    for (const link of plan.links) {
      await pause()
      await client.request('PUT', `/Contact/${link.contactId}`, { accountId: accountIdOf.get(link.candidateKey) })
    }
  }
  const c = plan.counts.contacts
  log(`contacts: link=${c.link} already_linked=${c.already_linked} ambiguous=${c.ambiguous}`)
  if (dryRun) log('dry-run: nothing written')
  return { counts: plan.counts, plan }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { dryRun: false, candidates: DEFAULT_CANDIDATES, input: DEFAULT_INPUT, delayMs: DEFAULT_DELAY_MS }
  const pathArg = (name, value) => {
    if (!value) throw new EspoConfigError(`${name} needs a path`)
    return value
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--candidates') opts.candidates = pathArg(arg, argv[++i])
    else if (arg.startsWith('--candidates=')) opts.candidates = pathArg('--candidates', arg.slice('--candidates='.length))
    else if (arg === '--input') opts.input = pathArg(arg, argv[++i])
    else if (arg.startsWith('--input=')) opts.input = pathArg('--input', arg.slice('--input='.length))
    else if (arg === '--delay-ms' || arg.startsWith('--delay-ms=')) {
      const value = arg === '--delay-ms' ? argv[++i] : arg.slice('--delay-ms='.length)
      const n = Number(value)
      if (value === undefined || !Number.isInteger(n) || n < 0) throw new EspoConfigError('--delay-ms needs a non-negative integer')
      opts.delayMs = n
    } else throw new EspoConfigError(`Unknown argument: ${arg}`)
  }
  return opts
}

function readCandidates(file) {
  if (!existsSync(file)) throw new EspoConfigError(`Candidates file not found: ${file}`)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new EspoConfigError(`Candidates file is not valid JSON: ${file}`)
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.candidates
  if (!Array.isArray(list)) throw new EspoConfigError(`Candidates file has no candidates array: ${file}`)
  return list
}

/**
 * @param {string[]} argv
 * @param {{ client?: { request: Function }, log?: (line: string) => void, error?: (line: string) => void }} [deps]
 * @returns {Promise<number>} the process exit code
 */
export async function runCli(argv, { client, log = console.log, error = console.error } = {}) {
  try {
    const opts = parseArgs(argv)
    // Validate files and confirmations before credentials or the network are touched.
    const candidates = readCandidates(opts.candidates)
    try {
      selectConfirmed(candidates)
    } catch (err) {
      throw new EspoConfigError(err instanceof Error ? err.message : 'invalid candidates')
    }
    const { rows } = loadExport(opts.input)
    const api = client ?? createEspoClient({ config: loadEspoConfig({ identity: 'apikey' }) })
    await runSeed({ client: api, candidates, rows, dryRun: opts.dryRun, delayMs: opts.delayMs, log })
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
    error(`Seed failed: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  process.exit(await runCli(process.argv.slice(2)))
}
