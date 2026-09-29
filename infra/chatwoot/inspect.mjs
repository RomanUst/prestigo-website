#!/usr/bin/env node
/**
 * infra/chatwoot/inspect.mjs
 *
 * Read-only views of the live Chatwoot instance (Phase 77 plan 09). Used by the
 * owner and by plans 77-11, 77-12 and 77-13 to verify configuration, activity,
 * native reports (INBOX-06 / D-22) and contact identity (INBOX-03); Phase 78
 * plan 04 adds the WhatsApp channel health view.
 *
 *   node infra/chatwoot/inspect.mjs --status
 *   node infra/chatwoot/inspect.mjs --activity [--since ISO] [--limit N]
 *   node infra/chatwoot/inspect.mjs --report --since ISO [--until ISO]
 *   node infra/chatwoot/inspect.mjs --contact <email> --expect-identifier <uuid>
 *   node infra/chatwoot/inspect.mjs --whatsapp [--expect-connected]
 *   node infra/chatwoot/inspect.mjs --print website-token|hmac-token | <consumer>
 *
 * Exit codes: 0 ok, 1 expectation failed (or --print on a terminal, or no WhatsApp
 * inbox), 2 API/config error.
 *
 * Every request is a GET. The API token is read by lib/client.mjs (env or file,
 * never argv). --print is the only path that emits a secret and it refuses to
 * write to a terminal: the value can only flow into a pipe (T-77-21). --contact
 * prints booleans only and --activity prints ids, labels and statuses only,
 * never names, emails or message bodies (T-77-23).
 *
 * --whatsapp (T-78-12) prints only enums, counts and booleans: the Meta health
 * status fields, whether a signature secret and a verification pin are stored
 * (derived from key presence, never from the value), the provider source from a
 * fixed set, template counts by status and the window rule delay. It never
 * prints a provider_config value (the Meta token and the app secret live there),
 * a phone number, a verified name or a template name. --expect-connected exits 1
 * unless status is CONNECTED, a signature secret is configured and no
 * verification pin is stored. SECRET_KINDS is deliberately unchanged: no WhatsApp
 * secret can be printed by any path in this file.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from './lib/client.mjs'
import { buildInboxRefs, featureState } from './sync.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const SECRET_KINDS = ['website-token', 'hmac-token']
export const TTY_REFUSAL = 'refusing to print a secret to a terminal; pipe it'

// ---------------------------------------------------------------------------
// Pure helpers and formatters
// ---------------------------------------------------------------------------

/** Chatwoot list endpoints answer as [..], {payload:[..]} or {payload:{key:[..]}}. */
export function unwrapList(res, ...keys) {
  if (Array.isArray(res)) return res
  const payload = res?.payload
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
    if (Array.isArray(res?.[key])) return res[key]
  }
  if (Array.isArray(res?.data?.payload)) return res.data.payload
  return []
}

const show = (value) => (value === undefined || value === null || value === '' ? 'unknown' : String(value))

/**
 * @param {{
 *   labels: any[], teams: { name: string, owner_member?: boolean }[], attributes: any[],
 *   canned: any[], rules: any[], inboxes: any[], website: any | null,
 *   config: { website: { name: string }, managed: { name: string, channel_type: string }[] },
 *   configTeams?: string[]
 * }} state
 * @returns {string[]}
 */
export function formatStatus(state) {
  const lines = []
  const display = new Map((state.configTeams ?? []).map((n) => [n.toLowerCase(), n]))
  const teams = state.teams.map((t) => `${display.get(String(t.name).toLowerCase()) ?? t.name}${t.owner_member ? '(owner)' : ''}`)

  lines.push(`labels=${state.labels.length}`)
  lines.push(`teams=${teams.join(',')}`)
  lines.push(`custom_attributes=${state.attributes.length}`)
  lines.push(`canned=${state.canned.length}`)
  lines.push(`automation_rules=${state.rules.length}`)

  const webName = state.config.website.name
  const web = state.website ?? state.inboxes.find((i) => i.name === webName)
  if (!web) {
    lines.push(`inbox ${webName} web_widget missing`)
  } else {
    const emailField = (web.pre_chat_form_options?.pre_chat_fields ?? []).find((f) => f.name === 'emailAddress')
    lines.push(
      `inbox ${webName} web_widget hmac_mandatory=${show(web.hmac_mandatory)} reply_time=${show(web.reply_time)} ` +
        `widget_color=${show(web.widget_color)} pre_chat_email_required=${emailField ? Boolean(emailField.required) : 'unknown'}`,
    )
  }

  const refs = buildInboxRefs(state.inboxes, state.config)
  for (const entry of state.config.managed) {
    lines.push(`inbox ${entry.name} ${entry.channel_type} ${refs.has(entry.name) ? 'present' : 'missing'}`)
  }
  return lines
}

const WA_CHANNEL_TYPE = 'Channel::Whatsapp'
/** provider_config keys that hold the webhook signature secret (Chatwoot has used several names). */
const WA_SIGNATURE_KEYS = ['app_secret', 'app_secret_key', 'client_secret', 'api_secret']
const WA_SOURCES = ['manual_setup_v2', 'embedded_signup']
const ENUM_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== ''
/** An enum-like health value, or "unknown" / "other" - never an arbitrary string. */
const enumValue = (v) => (!hasValue(v) ? 'unknown' : ENUM_RE.test(String(v)) ? String(v) : 'other')

/**
 * Normalised WhatsApp health state. Holds only enums, counts and booleans, so
 * nothing downstream can print a credential.
 * @typedef {{ missing?: boolean, status?: string, code_verification_status?: string, platform_type?: string,
 *   name_status?: string, quality_rating?: string, messaging_limit_tier?: string,
 *   signature_secret_configured?: boolean, verification_pin_stored?: boolean, provider_source?: string,
 *   templates?: { total: number, approved: number, pending: number, rejected: number, other: number },
 *   window_rule_delay_minutes?: string, delayed_automations?: string }} WhatsappState
 */

/** @param {WhatsappState} state @returns {string[]} */
export function formatWhatsapp(state) {
  if (state.missing) return ['whatsapp inbox missing']
  const t = state.templates ?? { total: 0, approved: 0, pending: 0, rejected: 0, other: 0 }
  return [
    `status=${enumValue(state.status)}`,
    `code_verification_status=${enumValue(state.code_verification_status)}`,
    `platform_type=${enumValue(state.platform_type)}`,
    `name_status=${enumValue(state.name_status)}`,
    `quality_rating=${enumValue(state.quality_rating)}`,
    `messaging_limit_tier=${enumValue(state.messaging_limit_tier)}`,
    `signature_secret_configured=${Boolean(state.signature_secret_configured)}`,
    `verification_pin_stored=${Boolean(state.verification_pin_stored)}`,
    `provider_source=${WA_SOURCES.includes(state.provider_source) ? state.provider_source : 'other'}`,
    `templates total=${t.total} approved=${t.approved} pending=${t.pending} rejected=${t.rejected} other=${t.other}`,
    `window_rule_delay_minutes=${/^\d+$/.test(String(state.window_rule_delay_minutes)) ? state.window_rule_delay_minutes : 'missing'}`,
    `delayed_automations=${['true', 'false'].includes(state.delayed_automations) ? state.delayed_automations : 'unknown'}`,
  ]
}

/** Names of the failed --expect-connected checks (empty when all pass). */
export function whatsappExpectationFailures(state) {
  if (state.missing) return ['whatsapp inbox missing']
  const failures = []
  if (state.status !== 'CONNECTED') failures.push('status is not CONNECTED')
  if (state.signature_secret_configured !== true) failures.push('signature_secret_configured is not true')
  if (state.verification_pin_stored !== false) failures.push('verification_pin_stored is not false')
  return failures
}

/**
 * One line per conversation. Only ids, labels, team name and statuses (T-77-23).
 * @param {{ inboxName: string, conversation: any, ownerId: number | null, teamsById?: Map<number, string>, lastOutgoing?: string | null }} args
 */
export function formatActivity({ inboxName, conversation, ownerId, teamsById, lastOutgoing }) {
  const c = conversation
  const labels = Array.isArray(c.labels) && c.labels.length ? c.labels.join(',') : 'none'
  const assigneeId = c.meta?.assignee?.id ?? c.assignee_id ?? null
  const team = c.meta?.team?.name ?? (c.team_id != null ? teamsById?.get(c.team_id) : undefined) ?? 'none'
  return (
    `inbox=${inboxName} id=${c.id} status=${c.status} labels=${labels} ` +
    `assignee_is_owner=${ownerId != null && assigneeId === ownerId} team=${team} last_outgoing=${lastOutgoing || 'none'}`
  )
}

/** Last outgoing message status from a /messages payload (never its content). */
export function lastOutgoingStatus(messages) {
  const outgoing = messages.filter((m) => m.message_type === 1 || m.message_type === 'outgoing')
  if (!outgoing.length) return null
  const last = outgoing.reduce((a, b) => ((b.created_at ?? 0) >= (a.created_at ?? 0) ? b : a))
  return last.status ?? null
}

const avgOrNull = (value, count) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (Number(count) === 0) return null
  return Math.round(n)
}

/** @param {{ kind: 'inbox' | 'label', name: string, summary: any }} args */
export function formatReport({ kind, name, summary }) {
  const s = summary ?? {}
  const count = Number(s.conversations_count ?? 0)
  const first = avgOrNull(s.avg_first_response_time, count)
  const resolution = avgOrNull(s.avg_resolution_time, count)
  return `report ${kind} ${name} conversations=${count} avg_first_response_s=${first === null ? 'null' : first} avg_resolution_s=${resolution === null ? 'null' : resolution}`
}

/** Booleans only, nothing else (T-77-23). */
export function formatContact({ found, matches }) {
  return `contact_found=${Boolean(found)} identifier_matches=${Boolean(matches)}`
}

/**
 * Emit a secret only when stdout is not a terminal. Returns the exit code.
 * getValue is not called on a terminal, so the secret is not even fetched.
 * @param {string} kind website-token | hmac-token
 * @param {{ isTTY?: boolean, getValue: (kind: string) => Promise<string>, out: (text: string) => void, err: (text: string) => void }} io
 */
export async function printSecret(kind, { isTTY, getValue, out, err }) {
  if (!SECRET_KINDS.includes(kind)) {
    err(`--print needs one of: ${SECRET_KINDS.join(', ')}`)
    return 2
  }
  if (isTTY) {
    err(TTY_REFUSAL)
    return 1
  }
  const value = await getValue(kind)
  if (!value) {
    err(`no ${kind} available from Chatwoot`)
    return 2
  }
  out(String(value))
  return 0
}

export function isoToEpoch(iso, flag) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) throw new ChatwootConfigError(`${flag} needs an ISO date, got: ${iso}`)
  return Math.floor(ms / 1000)
}

// ---------------------------------------------------------------------------
// Live gathering (GET only)
// ---------------------------------------------------------------------------

function readConfig(configDir, name) {
  return JSON.parse(readFileSync(path.join(configDir, name), 'utf8'))
}

async function listAutomationRules(client) {
  const seen = new Map()
  for (let page = 1; page <= 50; page++) {
    const rows = unwrapList(await client.request('GET', `/automation_rules?page=${page}`), 'automation_rules')
    const fresh = rows.filter((r) => !seen.has(r.id))
    if (!fresh.length) break
    for (const r of fresh) seen.set(r.id, r)
  }
  return [...seen.values()]
}

async function ownerIdOf(client) {
  const profile = await client.request('GET', '/api/v1/profile')
  return profile?.id ?? null
}

export async function gatherStatus(client, { configDir = HERE } = {}) {
  const config = readConfig(configDir, 'inboxes.json')
  const configTeams = readConfig(configDir, 'teams.json').teams.map((t) => t.name)
  const ownerId = await ownerIdOf(client)

  const labels = unwrapList(await client.request('GET', '/labels'), 'labels')
  const rawTeams = unwrapList(await client.request('GET', '/teams'), 'teams')
  const teams = []
  for (const t of rawTeams) {
    const members = unwrapList(await client.request('GET', `/teams/${t.id}/team_members`), 'members')
    teams.push({ name: t.name, owner_member: ownerId != null && members.some((u) => u.id === ownerId) })
  }
  const attributes = [
    ...unwrapList(await client.request('GET', '/custom_attribute_definitions?attribute_model=conversation_attribute'), 'definitions'),
    ...unwrapList(await client.request('GET', '/custom_attribute_definitions?attribute_model=contact_attribute'), 'definitions'),
  ]
  const canned = unwrapList(await client.request('GET', '/canned_responses'), 'canned_responses')
  const rules = await listAutomationRules(client)
  const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
  const listed = inboxes.find((i) => i.name === config.website.name)
  const website = listed ? ((await client.request('GET', `/inboxes/${listed.id}`)) ?? listed) : null

  return { labels, teams, attributes, canned, rules, inboxes, website, config, configTeams }
}

/** GET that tolerates a 4xx (older or partial Chatwoot): returns null instead of throwing. */
async function optionalGet(client, apiPath) {
  try {
    return await client.request('GET', apiPath)
  } catch (err) {
    if (err instanceof ChatwootApiError && err.status >= 400 && err.status < 500) return null
    throw err
  }
}

/**
 * Read-only WhatsApp channel health. Resolves the single Channel::Whatsapp inbox
 * by channel type. The raw inbox payload (provider_config) is reduced to booleans
 * and one fixed-set enum right here and is never kept.
 * @returns {Promise<WhatsappState>}
 */
export async function gatherWhatsapp(client, { configDir = HERE } = {}) {
  const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
  const found = inboxes.filter((i) => i.channel_type === WA_CHANNEL_TYPE)
  if (found.length === 0) return { missing: true }
  if (found.length > 1) throw new ChatwootConfigError(`Expected exactly one ${WA_CHANNEL_TYPE} inbox, found ${found.length}`)
  const listed = found[0]

  let providerConfig = listed.provider_config
  if (providerConfig === undefined) providerConfig = (await optionalGet(client, `/inboxes/${listed.id}`))?.provider_config
  const pc = providerConfig && typeof providerConfig === 'object' ? providerConfig : {}
  const signature = WA_SIGNATURE_KEYS.some((k) => hasValue(pc[k]))
  const pinStored = Object.keys(pc).some((k) => /(^|_)pin(_|$)/i.test(k) && hasValue(pc[k]))
  const source = WA_SOURCES.includes(pc.source) ? pc.source : 'other'

  const healthRes = await optionalGet(client, `/inboxes/${listed.id}/health`)
  const health = healthRes?.payload && typeof healthRes.payload === 'object' && !Array.isArray(healthRes.payload) ? healthRes.payload : (healthRes ?? {})

  const templateRows = unwrapList(await optionalGet(client, `/inboxes/${listed.id}/message_templates`), 'message_templates', 'templates')
  const templates = { total: templateRows.length, approved: 0, pending: 0, rejected: 0, other: 0 }
  for (const row of templateRows) {
    const status = String(row?.status ?? '').toUpperCase()
    if (status === 'APPROVED') templates.approved++
    else if (status === 'PENDING') templates.pending++
    else if (status === 'REJECTED') templates.rejected++
    else templates.other++
  }

  let windowName = 'window: whatsapp closing soon'
  try {
    windowName = readConfig(configDir, 'automation-rules.json').windowRules?.[0]?.name ?? windowName
  } catch {
    // no config file next to the script: keep the default rule name
  }
  const rules = await listAutomationRules(client)
  const windowRule = rules.find((r) => r.name === windowName)
  const delay = windowRule?.execution_delay
  const account = await optionalGet(client, '')

  return {
    status: enumValue(health.status),
    code_verification_status: enumValue(health.code_verification_status),
    platform_type: enumValue(health.platform_type),
    name_status: enumValue(health.name_status),
    quality_rating: enumValue(health.quality_rating),
    messaging_limit_tier: enumValue(health.messaging_limit_tier),
    signature_secret_configured: signature,
    verification_pin_stored: pinStored,
    provider_source: source,
    templates,
    window_rule_delay_minutes: Number.isInteger(delay) && delay >= 0 ? String(delay) : 'missing',
    delayed_automations: { on: 'true', off: 'false', unknown: 'unknown' }[featureState(account, 'delayed_automations')],
  }
}

/** Website inbox secrets. Never logged; only handed to printSecret's consumer. */
export async function fetchInboxSecret(client, kind, { configDir = HERE } = {}) {
  const name = readConfig(configDir, 'inboxes.json').website.name
  const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
  const listed = inboxes.find((i) => i.name === name)
  if (!listed) throw new ChatwootConfigError(`Inbox "${name}" does not exist`)
  const field = kind === 'website-token' ? 'website_token' : 'hmac_token'
  if (listed[field]) return listed[field]
  const detail = await client.request('GET', `/inboxes/${listed.id}`)
  return detail?.[field] ?? ''
}

export async function gatherActivity(client, { since, limit = 20, configDir = HERE } = {}) {
  const ownerId = await ownerIdOf(client)
  const teams = unwrapList(await client.request('GET', '/teams'), 'teams')
  const teamsById = new Map(teams.map((t) => [t.id, t.name]))
  const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
  void configDir
  const lines = []
  for (const inbox of inboxes) {
    const res = await client.request('GET', `/conversations?inbox_id=${inbox.id}&status=all&page=1`)
    let conversations = unwrapList(res, 'conversations')
    if (since != null) conversations = conversations.filter((c) => (c.created_at ?? 0) >= since)
    conversations = conversations.slice(0, limit)
    for (const conversation of conversations) {
      const messages = unwrapList(await client.request('GET', `/conversations/${conversation.id}/messages`), 'messages')
      lines.push(
        formatActivity({
          inboxName: inbox.name,
          conversation,
          ownerId,
          teamsById,
          lastOutgoing: lastOutgoingStatus(messages),
        }),
      )
    }
  }
  return lines
}

/**
 * Native reports. Tries GET /api/v2/.../summary_reports/{inbox|label} first (one
 * call per kind), falls back to GET /api/v2/.../reports/summary?type=&id= per
 * entity when the summary_reports path answers 404. `log` receives the path used.
 */
export async function gatherReport(client, { since, until, log = () => {} }) {
  const inboxes = unwrapList(await client.request('GET', '/inboxes'), 'inboxes')
  const labels = unwrapList(await client.request('GET', '/labels'), 'labels').filter((l) => String(l.title).startsWith('ch-'))
  const acct = client.accountId
  const range = `since=${since}&until=${until}`
  const lines = []
  let usedFallback = false

  async function summaryFor(kind, entities) {
    const out = new Map()
    if (!usedFallback) {
      try {
        const rows = unwrapList(await client.request('GET', `/api/v2/accounts/${acct}/summary_reports/${kind}?${range}`))
        for (const row of rows) out.set(row.id, row)
        return out
      } catch (err) {
        if (!(err instanceof ChatwootApiError) || err.status !== 404) throw err
        usedFallback = true
      }
    }
    for (const entity of entities) {
      out.set(entity.id, await client.request('GET', `/api/v2/accounts/${acct}/reports/summary?type=${kind}&id=${entity.id}&${range}`))
    }
    return out
  }

  const inboxRows = await summaryFor('inbox', inboxes)
  for (const inbox of inboxes) lines.push(formatReport({ kind: 'inbox', name: inbox.name, summary: inboxRows.get(inbox.id) }))
  const labelRows = await summaryFor('label', labels)
  for (const label of labels) lines.push(formatReport({ kind: 'label', name: label.title, summary: labelRows.get(label.id) }))

  log(usedFallback ? 'reports_path=/reports/summary' : 'reports_path=/summary_reports')
  return lines
}

export async function checkContact(client, { email, expectIdentifier }) {
  const res = await client.request('GET', `/contacts/search?q=${encodeURIComponent(email)}`)
  const contacts = unwrapList(res, 'contacts')
  const contact = contacts.find((c) => String(c.email ?? '').toLowerCase() === String(email).toLowerCase())
  const found = Boolean(contact)
  const matches = found && contact.identifier === expectIdentifier
  return { found, matches }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { mode: null, since: null, until: null, limit: 20, contact: null, expectIdentifier: null, printKind: null, expectConnected: false }
  const takeValue = (i, flag) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new ChatwootConfigError(`${flag} needs a value`)
    return v
  }
  const setMode = (mode) => {
    if (opts.mode && opts.mode !== mode) throw new ChatwootConfigError('Use exactly one of --status, --activity, --report, --contact, --whatsapp, --print')
    opts.mode = mode
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--status') setMode('status')
    else if (arg === '--activity') setMode('activity')
    else if (arg === '--report') setMode('report')
    else if (arg === '--whatsapp') setMode('whatsapp')
    else if (arg === '--expect-connected') opts.expectConnected = true
    else if (arg === '--contact') {
      setMode('contact')
      opts.contact = takeValue(i++, '--contact')
    } else if (arg === '--print') {
      setMode('print')
      opts.printKind = takeValue(i++, '--print')
    } else if (arg === '--since') opts.since = takeValue(i++, '--since')
    else if (arg === '--until') opts.until = takeValue(i++, '--until')
    else if (arg === '--limit') {
      const n = Number(takeValue(i++, '--limit'))
      if (!Number.isInteger(n) || n < 1) throw new ChatwootConfigError('--limit needs a positive integer')
      opts.limit = n
    } else if (arg === '--expect-identifier') opts.expectIdentifier = takeValue(i++, '--expect-identifier')
    else throw new ChatwootConfigError(`Unknown argument: ${arg}`)
  }
  if (!opts.mode) throw new ChatwootConfigError('Use one of --status, --activity, --report, --contact, --whatsapp, --print')
  if (opts.expectConnected && opts.mode !== 'whatsapp') throw new ChatwootConfigError('--expect-connected only works with --whatsapp')
  if (opts.mode === 'report' && !opts.since) throw new ChatwootConfigError('--report needs --since ISO')
  if (opts.mode === 'contact' && !opts.expectIdentifier) throw new ChatwootConfigError('--contact needs --expect-identifier <uuid>')
  return opts
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {{ client: any, out?: (line: string) => void, err?: (line: string) => void, isTTY?: boolean, write?: (text: string) => void, now?: () => number, configDir?: string }} io
 * @returns {Promise<number>} exit code
 */
export async function runInspect(opts, { client, out = console.log, err = console.error, isTTY = false, write, now = Date.now, configDir = HERE }) {
  if (opts.mode === 'status') {
    for (const line of formatStatus(await gatherStatus(client, { configDir }))) out(line)
    return 0
  }
  if (opts.mode === 'activity') {
    const since = opts.since ? isoToEpoch(opts.since, '--since') : null
    for (const line of await gatherActivity(client, { since, limit: opts.limit, configDir })) out(line)
    return 0
  }
  if (opts.mode === 'report') {
    const since = isoToEpoch(opts.since, '--since')
    const until = opts.until ? isoToEpoch(opts.until, '--until') : Math.floor(now() / 1000)
    for (const line of await gatherReport(client, { since, until, log: err })) out(line)
    return 0
  }
  if (opts.mode === 'contact') {
    const result = await checkContact(client, { email: opts.contact, expectIdentifier: opts.expectIdentifier })
    out(formatContact(result))
    return result.found && result.matches ? 0 : 1
  }
  if (opts.mode === 'whatsapp') {
    const state = await gatherWhatsapp(client, { configDir })
    for (const line of formatWhatsapp(state)) out(line)
    if (state.missing) return 1
    if (opts.expectConnected) {
      const failures = whatsappExpectationFailures(state)
      if (failures.length) {
        err(`expectation failed: ${failures.join('; ')}`)
        return 1
      }
    }
    return 0
  }
  if (opts.mode === 'print') {
    return printSecret(opts.printKind, {
      isTTY,
      getValue: (kind) => fetchInboxSecret(client, kind, { configDir }),
      out: write ?? ((text) => process.stdout.write(text)),
      err,
    })
  }
  throw new ChatwootConfigError('Unknown mode')
}

async function main(argv) {
  try {
    const opts = parseArgs(argv)
    const client = createChatwootClient(loadChatwootConfig())
    const code = await runInspect(opts, { client, isTTY: Boolean(process.stdout.isTTY) })
    // exitCode (not exit()) so a piped --print value is fully flushed first.
    process.exitCode = code
  } catch (error) {
    if (error instanceof ChatwootApiError) {
      console.error(`API error: ${error.message}`)
      process.exitCode = 2
      return
    }
    if (error instanceof ChatwootConfigError) {
      console.error(`Config error: ${error.message}`)
      process.exitCode = 2
      return
    }
    console.error(`Inspect failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
