#!/usr/bin/env node
/**
 * infra/espocrm/inspect.mjs
 *
 * PII-free read-only views of the live EspoCRM instance (Phase 80 plan 10). Used by Claude to
 * verify the owner mailbox, the scheduler and the mail attach rules (D-11..D-13, D-24, D-05)
 * without ever reading a subject, a name or an address.
 *
 *   node infra/espocrm/inspect.mjs count {Entity} [attr=value | attr=]
 *   node infra/espocrm/inspect.mjs jobs
 *   node infra/espocrm/inspect.mjs mailbox [--expect-active]
 *   node infra/espocrm/inspect.mjs email-parent --since <ISO datetime>
 *   node infra/espocrm/inspect.mjs system-mail [--expect-active]
 *   node infra/espocrm/inspect.mjs user-id {userName}
 *   node infra/espocrm/inspect.mjs notify-settings
 *   node infra/espocrm/inspect.mjs contact-match
 *   node infra/espocrm/inspect.mjs links {Entity}
 *
 *   count         -> count=N            (attr= means "empty": null or empty string)
 *   jobs          -> {job}={status}     one line per requiredJobs entry of mail.json
 *   mailbox       -> email_account=active|inactive|missing imap=on|off smtp=on|off
 *                    store_sent=on|off chatwoot_inboxes_with_roman=N
 *   email-parent  -> emails=N Account=N Contact=N Opportunity=N none=N [other=N]
 *   system-mail   -> system_smtp=present|missing active=on|off use_smtp=on|off
 *                    from_matches_settings=on|off   (the system SMTP group account, no password)
 *   user-id       -> user_id=<17-hex id>   (Phase 81 D-13: the owner's user id Leads are assigned to;
 *                    exit 1 when the name matches no user or more than one)
 *   notify-settings -> assignment_email=on|off lead_in_assignment_email_list=yes|no
 *                    assignment_email_entities=<comma list of entity names>   (Phase 81 D-04)
 *   contact-match -> contact_match=ok|no_contacts|missing   (Phase 81 D-11: the exact-email query
 *                    `where[0][type]=equals&where[0][attribute]=emailAddress` finds a Contact; the
 *                    address is held in memory only; exit 1 on `missing`)
 *   links         -> links=<sorted comma list of link names of the entity>
 *
 * Exit codes: 0 ok, 1 expectation failed (a job not Active; mailbox --expect-active not met) or
 * a usage/config error, 2 API error. Every request is a GET with the admin identity
 * (prestigo-config). Output is counts, statuses and booleans only: never a subject, a name, an
 * address or a secret. The Chatwoot part of `mailbox` is one read-only GET of the inbox list and
 * prints only how many inboxes mention the owner address (D-11: roman@ lives in one system).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, EspoApiError, EspoConfigError } from './lib/client.mjs'
import { createChatwootClient, loadChatwootConfig, ChatwootApiError, ChatwootConfigError } from '../chatwoot/lib/client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const ENTITY_RE = /^[A-Z][A-Za-z0-9]*$/
const ATTR_RE = /^[A-Za-z][A-Za-z0-9]*$/
const COMMANDS = ['count', 'jobs', 'mailbox', 'email-parent', 'system-mail', 'user-id', 'notify-settings', 'contact-match', 'links']
const USER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/
const PAGE = 200
const MAX_PAGES = 50

/**
 * @param {string[]} argv
 * @returns {{ command: string, entity?: string, attr?: string, value?: string, empty?: boolean, since?: string, expectActive?: boolean, userName?: string }}
 */
export function parseInspectArgs(argv) {
  const [command, ...rest] = argv
  if (!command) throw new EspoConfigError(`Missing command (expected one of ${COMMANDS.join(', ')})`)
  if (!COMMANDS.includes(command)) throw new EspoConfigError(`Unknown command: ${command}`)

  if (command === 'count') {
    const [entity, filter, ...extra] = rest
    if (!entity || !ENTITY_RE.test(entity)) throw new EspoConfigError('count needs an entity name such as Lead (UpperCamelCase)')
    if (extra.length) throw new EspoConfigError('count takes one entity and at most one attr=value filter')
    if (filter === undefined) return { command, entity }
    const eq = filter.indexOf('=')
    if (eq < 1) throw new EspoConfigError('count filter must look like attr=value or attr=')
    const attr = filter.slice(0, eq)
    const value = filter.slice(eq + 1)
    if (!ATTR_RE.test(attr)) throw new EspoConfigError(`count filter attribute "${attr}" is not a plain attribute name`)
    return value === '' ? { command, entity, attr, value, empty: true } : { command, entity, attr, value }
  }

  if (command === 'email-parent') {
    let since
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--since') since = rest[++i]
      else if (rest[i].startsWith('--since=')) since = rest[i].slice('--since='.length)
      else throw new EspoConfigError(`Unknown argument: ${rest[i]}`)
    }
    if (!since || Number.isNaN(Date.parse(since))) throw new EspoConfigError('email-parent needs --since <ISO datetime>')
    return { command, since }
  }

  if (command === 'mailbox' || command === 'system-mail') {
    const unknown = rest.filter((a) => a !== '--expect-active')
    if (unknown.length) throw new EspoConfigError(`Unknown argument: ${unknown[0]}`)
    return { command, expectActive: rest.includes('--expect-active') }
  }

  if (command === 'user-id') {
    const [userName, ...extra] = rest
    if (!userName || !USER_NAME_RE.test(userName)) throw new EspoConfigError('user-id needs a user name such as prestigo-admin')
    if (extra.length) throw new EspoConfigError(`Unknown argument: ${extra[0]}`)
    return { command, userName }
  }

  if (command === 'links') {
    const [entity, ...extra] = rest
    if (!entity || !ENTITY_RE.test(entity)) throw new EspoConfigError('links needs an entity name such as Lead (UpperCamelCase)')
    if (extra.length) throw new EspoConfigError(`Unknown argument: ${extra[0]}`)
    return { command, entity }
  }

  if (rest.length) throw new EspoConfigError(`Unknown argument: ${rest[0]}`)
  return { command }
}

const readMailConfig = (configDir) => JSON.parse(readFileSync(path.join(configDir, 'mail.json'), 'utf8'))

/** Total of records matching one where item (a single GET, maxSize 1). */
async function totalWhere(client, entity, type, attr, value) {
  const params = new URLSearchParams({ select: 'id', maxSize: '1' })
  params.set('where[0][type]', type)
  params.set('where[0][attribute]', attr)
  if (value !== undefined) params.set('where[0][value]', value)
  const result = await client.request('GET', `/${entity}?${params.toString()}`)
  return Number(result?.total ?? (Array.isArray(result?.list) ? result.list.length : 0))
}

async function totalAll(client, entity) {
  const result = await client.request('GET', `/${entity}?select=id&maxSize=1`)
  return Number(result?.total ?? (Array.isArray(result?.list) ? result.list.length : 0))
}

async function runCount(args, { client, log }) {
  let total
  if (args.attr === undefined) total = await totalAll(client, args.entity)
  else if (args.empty) {
    // "Empty" is null or an empty string; the two sets are disjoint.
    total = (await totalWhere(client, args.entity, 'isNull', args.attr)) + (await totalWhere(client, args.entity, 'equals', args.attr, ''))
  } else total = await totalWhere(client, args.entity, 'equals', args.attr, args.value)
  log(`count=${total}`)
  return 0
}

async function runJobs({ client, log, configDir }) {
  const { requiredJobs = [] } = readMailConfig(configDir)
  const rows = (await client.request('GET', '/ScheduledJob?select=name,job,status&maxSize=200'))?.list ?? []
  const status = new Map(rows.map((r) => [r.job, r.status]))
  let code = 0
  for (const job of requiredJobs) {
    const value = status.get(job) ?? 'missing'
    log(`${job}=${value}`)
    if (value !== 'Active') code = 1
  }
  return code
}

const onOff = (value) => (value ? 'on' : 'off')

async function runMailbox(args, { client, log, configDir, getChatwootClient }) {
  const { owner } = readMailConfig(configDir)
  const want = owner.emailAddress.toLowerCase()

  const accounts = (await client.request('GET', '/EmailAccount?select=id,emailAddress,status,useImap,useSmtp,storeSentEmails&maxSize=200'))?.list ?? []
  const account = accounts.find((a) => String(a.emailAddress ?? '').toLowerCase() === want)
  const state = account ? String(account.status ?? 'Inactive').toLowerCase() : 'missing'

  // The only Chatwoot read: how many inboxes mention the owner address (count, never the data).
  const chatwoot = getChatwootClient()
  const inboxes = (await chatwoot.request('GET', '/inboxes'))?.payload ?? []
  const withOwner = inboxes.filter((inbox) => JSON.stringify(inbox).toLowerCase().includes(want)).length

  const imap = onOff(account?.useImap)
  const smtp = onOff(account?.useSmtp)
  const stored = onOff(account?.storeSentEmails)
  log(`email_account=${state} imap=${imap} smtp=${smtp} store_sent=${stored} chatwoot_inboxes_with_roman=${withOwner}`)

  if (args.expectActive && !(state === 'active' && imap === 'on' && smtp === 'on' && stored === 'on' && withOwner === 0)) return 1
  return 0
}

/**
 * The system SMTP group account (mail.json systemSmtp). Booleans only: it exists, it is Active, it
 * sends over SMTP, and its address is the one Settings.outboundEmailFromAddress points at (EspoCRM
 * only treats the account as the system sender when the two addresses are equal).
 */
async function runSystemMail(args, { client, log, configDir }) {
  const { systemSmtp } = readMailConfig(configDir)
  if (!systemSmtp?.emailAddress) throw new EspoConfigError('mail.json has no systemSmtp entry')
  const want = systemSmtp.emailAddress.toLowerCase()

  const accounts = (await client.request('GET', '/InboundEmail?select=id,emailAddress,status,useSmtp&maxSize=200'))?.list ?? []
  const account = accounts.find((a) => String(a.emailAddress ?? '').toLowerCase() === want)
  const settings = (await client.request('GET', '/Settings')) ?? {}
  const active = account?.status === 'Active'
  const smtp = Boolean(account?.useSmtp)
  const fromMatches = String(settings.outboundEmailFromAddress ?? '').toLowerCase() === want

  log(`system_smtp=${account ? 'present' : 'missing'} active=${onOff(active)} use_smtp=${onOff(smtp)} from_matches_settings=${onOff(fromMatches)}`)
  return args.expectActive && !(account && active && smtp && fromMatches) ? 1 : 0
}

/**
 * The user id Leads are assigned to (D-13). One GET on /User by exact userName; the id is not a secret.
 * Zero or several matches exit 1 so a typo can never yield a wrong assignee.
 */
async function runUserId(args, { client, log }) {
  const params = new URLSearchParams({ select: 'id', maxSize: '2' })
  params.set('where[0][type]', 'equals')
  params.set('where[0][attribute]', 'userName')
  params.set('where[0][value]', args.userName)
  const list = (await client.request('GET', `/User?${params.toString()}`))?.list ?? []
  if (list.length !== 1 || typeof list[0]?.id !== 'string' || !list[0].id) {
    log(`user_id=${list.length === 0 ? 'missing' : 'ambiguous'}`)
    return 1
  }
  log(`user_id=${list[0].id}`)
  return 0
}

/** D-04: does assigning a Lead send an email to the assignee? Flags and entity names only. */
async function runNotifySettings({ client, log }) {
  const settings = (await client.request('GET', '/Settings')) ?? {}
  const entities = Array.isArray(settings.assignmentEmailNotificationsEntityList) ? settings.assignmentEmailNotificationsEntityList.map(String) : []
  const inList = entities.includes('Lead')
  log(`assignment_email=${onOff(settings.assignmentEmailNotifications)} lead_in_assignment_email_list=${inList ? 'yes' : 'no'} assignment_email_entities=${entities.join(',')}`)
  return 0
}

/**
 * RESEARCH A2 / D-11: prove that the exact-email query the dispatcher uses finds an existing Contact.
 * Takes any Contact that has an address, queries by that address, and prints only the verdict.
 */
async function runContactMatch({ client, log }) {
  const probe = new URLSearchParams({ select: 'id,emailAddress', maxSize: '1' })
  probe.set('where[0][type]', 'isNotNull')
  probe.set('where[0][attribute]', 'emailAddress')
  const first = ((await client.request('GET', `/Contact?${probe.toString()}`))?.list ?? [])[0]
  const address = typeof first?.emailAddress === 'string' ? first.emailAddress : ''
  if (!first || !address) {
    log('contact_match=no_contacts')
    return 0
  }
  const match = new URLSearchParams({ select: 'id', maxSize: '2' })
  match.set('where[0][type]', 'equals')
  match.set('where[0][attribute]', 'emailAddress')
  match.set('where[0][value]', address)
  const found = (await client.request('GET', `/Contact?${match.toString()}`))?.list ?? []
  if (found.some((row) => row.id === first.id)) {
    log('contact_match=ok')
    return 0
  }
  log('contact_match=missing')
  return 1
}

/** Link names of an entity, sorted (e.g. to see whether plan 81-06's existing-contact link is there yet). */
async function runLinks(args, { client, log }) {
  const links = await client.request('GET', `/Metadata/action/get?key=${encodeURIComponent(`entityDefs.${args.entity}.links`)}`)
  const names = links && typeof links === 'object' ? Object.keys(links).sort() : []
  log(`links=${names.join(',')}`)
  return 0
}

/** EspoCRM stores UTC as `YYYY-MM-DD HH:MM:SS`. */
const parseEspoDate = (text) => Date.parse(`${String(text).replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(text)) ? '' : 'Z'}`)

async function runEmailParent(args, { client, log }) {
  const since = Date.parse(args.since)
  const tally = { Account: 0, Contact: 0, Opportunity: 0, none: 0, other: 0 }
  let emails = 0
  // Newest first: stop paging at the first email older than T.
  for (let page = 0, done = false; page < MAX_PAGES && !done; page++) {
    const params = new URLSearchParams({ select: 'id,parentType,createdAt', orderBy: 'createdAt', order: 'desc', maxSize: String(PAGE), offset: String(page * PAGE) })
    const list = (await client.request('GET', `/Email?${params.toString()}`))?.list ?? []
    for (const email of list) {
      if (parseEspoDate(email.createdAt) < since) {
        done = true
        break
      }
      emails++
      if (!email.parentType) tally.none++
      else if (email.parentType in tally && email.parentType !== 'other' && email.parentType !== 'none') tally[email.parentType]++
      else tally.other++
    }
    if (list.length < PAGE) done = true
  }
  const other = tally.other ? ` other=${tally.other}` : ''
  log(`emails=${emails} Account=${tally.Account} Contact=${tally.Contact} Opportunity=${tally.Opportunity} none=${tally.none}${other}`)
  return 0
}

/**
 * @param {{ argv: string[], client: { request: Function }, getChatwootClient?: () => { request: Function }, configDir?: string, log?: (line: string) => void }} options
 * @returns {Promise<number>} the exit code
 */
export async function runInspect({ argv, client, getChatwootClient, configDir = HERE, log = console.log }) {
  const args = parseInspectArgs(argv)
  const env = { client, log, configDir, getChatwootClient: getChatwootClient ?? (() => { throw new EspoConfigError('No Chatwoot client available') }) }
  switch (args.command) {
    case 'count':
      return runCount(args, env)
    case 'jobs':
      return runJobs(env)
    case 'mailbox':
      return runMailbox(args, env)
    case 'system-mail':
      return runSystemMail(args, env)
    case 'user-id':
      return runUserId(args, env)
    case 'notify-settings':
      return runNotifySettings(env)
    case 'contact-match':
      return runContactMatch(env)
    case 'links':
      return runLinks(args, env)
    default:
      return runEmailParent(args, env)
  }
}

async function main(argv) {
  try {
    parseInspectArgs(argv)
    const client = createEspoClient({ config: loadEspoConfig({ identity: 'admin' }) })
    const code = await runInspect({
      argv,
      client,
      getChatwootClient: () => createChatwootClient(loadChatwootConfig()),
    })
    process.exit(code)
  } catch (err) {
    if (err instanceof EspoApiError || err instanceof ChatwootApiError) {
      console.error(`API error: ${err.message}`)
      process.exit(2)
    }
    if (err instanceof EspoConfigError || err instanceof ChatwootConfigError) {
      console.error(`Config error: ${err.message}`)
      process.exit(1)
    }
    console.error(`Inspect failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
