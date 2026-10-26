#!/usr/bin/env node
/**
 * infra/espocrm/webhook.mjs
 *
 * Registers and manages the single EspoCRM webhook that tells the site about human Contact edits
 * (Phase 83 plan 05, HOOK-04 / D-13 / D-14 / D-19). Run by the owner; nothing here is applied by CI.
 *
 *   node infra/espocrm/webhook.mjs create             register Contact.update as prestigo-sync with skipOwn
 *   node infra/espocrm/webhook.mjs list               id, event, active, skipOwn, owner (never a secret)
 *   node infra/espocrm/webhook.mjs delete <id>        remove one webhook (17 lowercase hex id)
 *   node infra/espocrm/webhook.mjs --print secret|id  stored value to a pipe (refused on a terminal)
 *   node infra/espocrm/webhook.mjs probe              signed round trip against the site receiver
 *
 *   --url <https url>   receiver URL (default https://rideprestigo.com/api/webhooks/espocrm)
 *   --allow-host        accept another host or a non-https URL (tests only)
 *
 * Why the sync identity: EspoCRM silently forces skipOwn off for a webhook created by an admin user,
 * so an admin-created webhook would echo every sync write back to the site. The webhook is created
 * with the prestigo-sync API key (Sync writer role, Webhook scope) and re-read afterwards: the run
 * fails unless skipOwn stuck and the webhook has an owner.
 *
 * Secrets: the webhook secret goes only into ~/.config/prestigo/espocrm-webhook.env (mode 0600) and,
 * through `--print secret | vercel env add ...`, into Vercel. It is never printed, logged or committed;
 * output is fixed key=value lines.
 *
 * Exit codes: 0 ok, 1 refused or failed check, 2 API / usage error.
 */

import { createHmac, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createEspoClient, loadEspoConfig, parseEnvFile, EspoApiError, EspoConfigError, SYNC_ENV_FILE } from './lib/client.mjs'

export const WEBHOOK_EVENT = 'Contact.update'
export const DEFAULT_WEBHOOK_URL = 'https://rideprestigo.com/api/webhooks/espocrm'
const CANONICAL_HOST = 'rideprestigo.com'
const DEFAULT_CONFIG_DIR = path.dirname(SYNC_ENV_FILE)
const ENV_FILE_NAME = 'espocrm-webhook.env'
/** `<CONFIG_DIR>/espocrm-webhook.env`: ESPOCRM_WEBHOOK_ID and ESPOCRM_WEBHOOK_SECRET, mode 0600. */
export const WEBHOOK_ENV_FILE = path.join(DEFAULT_CONFIG_DIR, ENV_FILE_NAME)

const COMMANDS = ['create', 'list', 'delete', 'probe']
const PRINT_KINDS = ['secret', 'id']
const ID_RE = /^[0-9a-f]{17}$/
const PROBE_TIMEOUT_MS = 15_000
const TTY_REFUSAL = 'refusing to print a secret to a terminal: pipe it, e.g. node infra/espocrm/webhook.mjs --print secret | vercel env add ESPOCRM_WEBHOOK_SECRET production --sensitive'

/**
 * @param {string[]} argv
 * @returns {{ command: 'create' | 'list' | 'delete' | 'print' | 'probe', id?: string, printKind?: 'secret' | 'id', url: string, allowHost: boolean }}
 */
export function parseWebhookArgs(argv) {
  let command
  let id
  let printKind
  let url = DEFAULT_WEBHOOK_URL
  let allowHost = false
  const setCommand = (name) => {
    if (command) throw new EspoConfigError(`Only one command at a time (got ${command} and ${name})`)
    command = name
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--allow-host') allowHost = true
    else if (arg === '--url') {
      url = argv[++i]
      if (!url) throw new EspoConfigError('--url needs a value')
    } else if (arg.startsWith('--url=')) url = arg.slice('--url='.length)
    else if (arg === '--print' || arg.startsWith('--print=')) {
      setCommand('print')
      printKind = arg === '--print' ? argv[++i] : arg.slice('--print='.length)
      if (!PRINT_KINDS.includes(printKind)) throw new EspoConfigError(`--print needs one of: ${PRINT_KINDS.join(', ')}`)
    } else if (COMMANDS.includes(arg)) {
      setCommand(arg)
      if (arg === 'delete') {
        id = argv[++i]
        if (typeof id !== 'string' || !ID_RE.test(id)) throw new EspoConfigError('delete needs a webhook id (17 lowercase hex characters)')
      }
    } else if (arg.startsWith('-')) throw new EspoConfigError(`Unknown argument: ${arg}`)
    else throw new EspoConfigError(`Unknown command: ${arg}`)
  }
  if (!command) throw new EspoConfigError(`Missing command (expected one of ${[...COMMANDS, '--print'].join(', ')})`)

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new EspoConfigError('--url is not a valid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new EspoConfigError('--url must be an https URL')
  if (!allowHost) {
    if (parsed.protocol !== 'https:') throw new EspoConfigError('--url must use https')
    if (parsed.hostname !== CANONICAL_HOST) throw new EspoConfigError(`--url must point at ${CANONICAL_HOST} (use --allow-host only in tests)`)
  }

  /** @type {any} */
  const result = { command, url, allowHost }
  if (id !== undefined) result.id = id
  if (printKind !== undefined) result.printKind = printKind
  return result
}

/**
 * EspoCRM 10.0.8 Sender: `Signature` = base64("<webhookId>:<hex HMAC-SHA256(body, secret)>").
 * Exported so the site verifier can be cross-checked against it.
 */
export function espoSignature(webhookId, secret, body) {
  const hex = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  return Buffer.from(`${webhookId}:${hex}`, 'utf8').toString('base64')
}

// ---------------------------------------------------------------------------
// Secret file (mode 0600, directory 0700)
// ---------------------------------------------------------------------------

const envPath = (configDir) => path.join(configDir, ENV_FILE_NAME)

function writeWebhookEnv(configDir, id, secret) {
  mkdirSync(configDir, { recursive: true, mode: 0o700 })
  chmodSync(configDir, 0o700)
  const file = envPath(configDir)
  writeFileSync(file, `ESPOCRM_WEBHOOK_ID=${id}\nESPOCRM_WEBHOOK_SECRET=${secret}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
}

/** @returns {{ id?: string, secret?: string }} */
function readWebhookEnv(configDir) {
  const file = envPath(configDir)
  if (!existsSync(file)) return {}
  const parsed = parseEnvFile(readFileSync(file, 'utf8'))
  return { id: parsed.ESPOCRM_WEBHOOK_ID || undefined, secret: parsed.ESPOCRM_WEBHOOK_SECRET || undefined }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const asList = (response) => (Array.isArray(response?.list) ? response.list : [])
// skipOwn needs an owner. Admin reads show userId; the prestigo-sync API user (EspoCRM 10.0.8) only
// sees createdById, which for an API-user-created webhook is that same user (verified live 2026-10-26).
const nonEmpty = (v) => typeof v === 'string' && v !== ''
const hasOwner = (webhook) => nonEmpty(webhook?.userId) || nonEmpty(webhook?.createdById)

async function listWebhooks(client) {
  return asList(await client.request('GET', '/Webhook?maxSize=200'))
}

async function createWebhook({ client, configDir, url, out, err }) {
  const existing = (await listWebhooks(client)).find((w) => w.event === WEBHOOK_EVENT && w.url === url)
  if (existing) {
    const skipOwn = existing.skipOwn === true
    out(`webhook=exists id=${existing.id} skipOwn=${skipOwn}\n`)
    if (!skipOwn) err('error=skipown_not_effective (delete this webhook and create it again as prestigo-sync)\n')
    return skipOwn ? 0 : 1
  }

  const created = await client.request('POST', '/Webhook', { event: WEBHOOK_EVENT, url, isActive: true, skipOwn: true })
  const id = created?.id
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new EspoApiError('POST', '/Webhook', 200, 'response carried no webhook id')
  const secret = typeof created.secretKey === 'string' && created.secretKey ? created.secretKey : undefined
  if (secret && typeof client.addSecret === 'function') client.addSecret(secret)

  const reread = await client.request('GET', `/Webhook/${id}`)
  const stuck = reread?.skipOwn === true && hasOwner(reread)
  const finalSecret = secret ?? (typeof reread?.secretKey === 'string' && reread.secretKey ? reread.secretKey : undefined)
  if (!stuck || !finalSecret) {
    // A webhook that echoes sync writes (or whose secret we never saw) is worse than none: remove it.
    let cleanup = 'deleted'
    try {
      await client.request('DELETE', `/Webhook/${id}`)
    } catch {
      cleanup = 'failed'
    }
    err(`error=${stuck ? 'secret_not_returned' : 'skipown_not_effective'} id=${id} cleanup=${cleanup}\n`)
    return 1
  }

  writeWebhookEnv(configDir, id, finalSecret)
  out(`webhook=created id=${id} skipOwn=true\n`)
  return 0
}

async function deleteWebhook({ client, configDir, id, out }) {
  await client.request('DELETE', `/Webhook/${id}`)
  if (readWebhookEnv(configDir).id === id) unlinkSync(envPath(configDir))
  out(`webhook=deleted id=${id}\n`)
  return 0
}

function printStored({ configDir, kind, isTTY, out, err }) {
  if (isTTY) {
    err(`${TTY_REFUSAL}\n`)
    return 1
  }
  const stored = readWebhookEnv(configDir)
  const value = kind === 'secret' ? stored.secret : stored.id
  if (!value) {
    err(`no webhook ${kind} stored in ~/.config/prestigo/${ENV_FILE_NAME} (run: node infra/espocrm/webhook.mjs create)\n`)
    return 2
  }
  out(value)
  return 0
}

/** D-19 live check: the deployed receiver must accept EspoCRM's exact signature scheme and reject a tampered body. */
async function probeReceiver({ configDir, url, fetchImpl, out, err }) {
  const { id, secret } = readWebhookEnv(configDir)
  if (!id || !secret) {
    err('error=no_stored_webhook (run: node infra/espocrm/webhook.mjs create)\n')
    return 2
  }
  const contactId = randomBytes(9).toString('hex').slice(0, 17)
  const body = JSON.stringify([{ id: contactId, firstName: 'Probe' }])
  const tampered = JSON.stringify([{ id: contactId, firstName: 'Probe-tampered' }])
  const signature = espoSignature(id, secret, body)

  const post = async (payload) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Signature: signature },
      body: payload,
      redirect: 'error',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return res.status
  }

  let statuses
  try {
    statuses = [await post(body), await post(tampered)]
  } catch (cause) {
    out(`probe_status=error verdict=fail\n`)
    err(`error=request_failed (${cause instanceof Error ? cause.name : 'unknown'})\n`)
    return 1
  }
  const ok = statuses[0] === 200 && statuses[1] === 401
  out(`probe_status=${statuses.join(',')}\n`)
  out(`verdict=${ok ? 'ok' : 'fail'}\n`)
  return ok ? 0 : 1
}

/**
 * @param {{ argv: string[], client?: { request: Function, addSecret?: Function }, fetchImpl?: typeof fetch, configDir?: string,
 *           isTTY?: boolean, out?: (text: string) => void, err?: (text: string) => void }} options
 * @returns {Promise<number>} the exit code
 */
export async function runWebhook({
  argv,
  client,
  fetchImpl = globalThis.fetch,
  configDir = DEFAULT_CONFIG_DIR,
  isTTY = false,
  out = (text) => process.stdout.write(text),
  err = (text) => process.stderr.write(text),
}) {
  const args = parseWebhookArgs(argv)
  const needClient = () => {
    if (!client) throw new EspoConfigError(`${args.command} needs the prestigo-sync client`)
    return client
  }

  switch (args.command) {
    case 'create':
      return createWebhook({ client: needClient(), configDir, url: args.url, out, err })
    case 'list': {
      const webhooks = await listWebhooks(needClient())
      for (const w of webhooks) {
        out(`id=${w.id} event=${w.event} active=${w.isActive === true} skipOwn=${w.skipOwn === true} owner=${hasOwner(w) ? 'set' : 'none'}\n`)
      }
      return 0
    }
    case 'delete':
      return deleteWebhook({ client: needClient(), configDir, id: args.id, out })
    case 'print':
      return printStored({ configDir, kind: args.printKind, isTTY, out, err })
    case 'probe':
      return probeReceiver({ configDir, url: args.url, fetchImpl, out, err })
    default:
      throw new EspoConfigError(`Unknown command: ${args.command}`)
  }
}

async function main(argv) {
  try {
    const args = parseWebhookArgs(argv)
    // Every API call runs as prestigo-sync: the owner of the webhook decides whether skipOwn sticks.
    const client = ['create', 'list', 'delete'].includes(args.command)
      ? createEspoClient({ config: loadEspoConfig({ identity: 'apikey' }) })
      : undefined
    process.exit(await runWebhook({ argv, client, isTTY: Boolean(process.stdout.isTTY) }))
  } catch (cause) {
    if (cause instanceof EspoApiError) {
      console.error(`API error: ${cause.message}`)
      process.exit(2)
    }
    if (cause instanceof EspoConfigError) {
      console.error(`Config error: ${cause.message}`)
      process.exit(2)
    }
    console.error(`Webhook script failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exit(2)
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
