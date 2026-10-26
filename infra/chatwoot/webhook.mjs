#!/usr/bin/env node
/**
 * infra/chatwoot/webhook.mjs
 *
 * The Chatwoot ACCOUNT webhook as config-as-code (Phase 83 plan 06, HOOK-03 / D-20). The desired
 * state is infra/chatwoot/webhooks.json: one webhook to the production receiver with four
 * subscriptions (conversation_updated is there for the no-lead label, D-20; the receiver filters).
 *
 *   node infra/chatwoot/webhook.mjs ensure                 create / update subscriptions / unchanged
 *   node infra/chatwoot/webhook.mjs list                   id, url, subscriptions (never the secret)
 *   node infra/chatwoot/webhook.mjs delete <id>            delete one webhook by numeric id
 *   node infra/chatwoot/webhook.mjs rotate                 delete + recreate = a new secret (see README order)
 *   node infra/chatwoot/webhook.mjs --print secret | <consumer>
 *                                                          the signing secret, only into a pipe
 *   node infra/chatwoot/webhook.mjs probe                  live signed round trip against the receiver
 *
 * Options: --url <url> (default: webhooks.json), --allow-host (tests only: accept a host other than
 * rideprestigo.com; the URL must still be https).
 *
 * Exit codes: 0 ok, 1 expectation failed / refused / duplicate, 2 API or config error.
 *
 * SECRET CUSTODY (T-83-21): Chatwoot generates the webhook secret (it cannot be chosen through the
 * API) and returns it to an administrator token. `--print secret` is the only path that emits it and
 * it refuses to write to a terminal; no other command prints it, no file stores it and it is never
 * a command-line argument. Every other output line passes a scrubber that removes any secret value
 * this process has seen.
 *
 * PROBE: fetches the secret itself and sends the receiver three synthetic requests for a private
 * outgoing note (the receiver ignores it, so no database row is touched): correctly signed (200),
 * changed body under the first signature (401) and a 600 s old timestamp correctly signed for it
 * (401). `verdict=ok` only for 200,401,401. A redirect shows as a non-200 first status. The secret
 * never leaves this process except as an HMAC.
 *
 * ACCOUNT-LEVEL ONLY (T-83-22): an API-inbox or agent-bot webhook is unsigned in Chatwoot v4.18, so
 * it is never created or used here.
 *
 * The Chatwoot administrator token comes from lib/client.mjs (env or
 * ~/.config/prestigo/chatwoot-api.env, never argv). Webhook endpoints need an administrator.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ChatwootApiError, ChatwootConfigError, createChatwootClient, loadChatwootConfig } from './lib/client.mjs'
import { TTY_REFUSAL, unwrapList } from './inspect.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const CANONICAL_HOST = 'rideprestigo.com'
const COMMANDS = ['ensure', 'list', 'delete', 'rotate', 'probe']
const MIN_SCRUB_LENGTH = 8
export const PROBE_TIMEOUT_MS = 30_000
/** The receiver's replay window is 300 s; 600 s old is unambiguously outside it. */
const STALE_SECONDS = 600

// ---------------------------------------------------------------------------
// Desired state and arguments
// ---------------------------------------------------------------------------

/**
 * @param {string} [configDir]
 * @returns {{ name: string, url: string, subscriptions: string[] }}
 */
export function loadDesiredWebhook(configDir = HERE) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path.join(configDir, 'webhooks.json'), 'utf8'))
  } catch {
    throw new ChatwootConfigError('webhooks.json is missing or not valid JSON')
  }
  const list = parsed?.webhooks
  if (!Array.isArray(list) || list.length !== 1) {
    throw new ChatwootConfigError('webhooks.json must declare exactly one webhook')
  }
  const [w] = list
  if (typeof w?.name !== 'string' || !w.name) throw new ChatwootConfigError('webhooks.json: webhook needs a name')
  if (typeof w.url !== 'string' || !w.url) throw new ChatwootConfigError('webhooks.json: webhook needs a url')
  if (!Array.isArray(w.subscriptions) || w.subscriptions.length === 0 || w.subscriptions.some((s) => typeof s !== 'string' || !s)) {
    throw new ChatwootConfigError('webhooks.json: webhook needs a non-empty subscriptions list')
  }
  return { name: w.name, url: w.url, subscriptions: [...w.subscriptions] }
}

/** https on the canonical apex host (RESEARCH A13: no apex-to-www redirect on POST), else --allow-host. */
function validateReceiverUrl(url, allowHost) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new ChatwootConfigError('The webhook url is not a valid URL')
  }
  if (parsed.protocol !== 'https:') throw new ChatwootConfigError('The webhook url must use https')
  if (parsed.username || parsed.password) throw new ChatwootConfigError('The webhook url must not carry credentials')
  if (!allowHost && parsed.hostname !== CANONICAL_HOST) {
    throw new ChatwootConfigError(`The webhook url must be on ${CANONICAL_HOST} (a redirecting host drops POSTs); --allow-host is for tests only`)
  }
}

/**
 * @param {string[]} argv
 * @param {{ configDir?: string }} [options]
 * @returns {{ command: 'ensure' | 'list' | 'delete' | 'rotate' | 'print' | 'probe', id?: number, url: string, allowHost: boolean }}
 */
export function parseChatwootWebhookArgs(argv, { configDir = HERE } = {}) {
  const opts = { command: undefined, id: undefined, url: undefined, allowHost: false }
  const takeValue = (i, flag) => {
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new ChatwootConfigError(`${flag} needs a value`)
    return value
  }
  const setCommand = (command) => {
    if (opts.command && opts.command !== command) throw new ChatwootConfigError(`Use exactly one command (got ${opts.command} and ${command})`)
    opts.command = command
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--print') {
      const kind = takeValue(i++, '--print')
      if (kind !== 'secret') throw new ChatwootConfigError('--print needs: secret')
      setCommand('print')
    } else if (arg === '--url') opts.url = takeValue(i++, '--url')
    else if (arg === '--allow-host') opts.allowHost = true
    else if (arg.startsWith('--')) throw new ChatwootConfigError(`Unknown argument: ${arg}`)
    else positional.push(arg)
  }

  if (positional.length > 0) {
    const [word, ...rest] = positional
    if (!COMMANDS.includes(word)) throw new ChatwootConfigError(`Unknown command: ${word}`)
    setCommand(word)
    if (word === 'delete') {
      if (rest.length !== 1 || !/^[1-9]\d{0,9}$/.test(rest[0])) throw new ChatwootConfigError('delete needs one positive integer webhook id')
      opts.id = Number(rest[0])
    } else if (rest.length > 0) {
      throw new ChatwootConfigError(`Unexpected argument: ${rest[0]}`)
    }
  }
  if (!opts.command) throw new ChatwootConfigError(`Use one of: ${COMMANDS.join(', ')}, --print secret`)

  const url = opts.url ?? loadDesiredWebhook(configDir).url
  validateReceiverUrl(url, opts.allowHost)
  return { command: opts.command, id: opts.id, url, allowHost: opts.allowHost }
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/** `sha256=<hex HMAC-SHA256(secret, "<ts>.<body>")>` - exactly what Chatwoot v4.18 sends. */
export function chatwootSignature(secret, timestampSec, body) {
  return `sha256=${createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex')}`
}

// ---------------------------------------------------------------------------
// Chatwoot webhook API helpers
// ---------------------------------------------------------------------------

function normalise(raw) {
  return {
    id: raw?.id,
    name: typeof raw?.name === 'string' ? raw.name : '',
    url: typeof raw?.url === 'string' ? raw.url : '',
    subscriptions: Array.isArray(raw?.subscriptions) ? raw.subscriptions.filter((s) => typeof s === 'string') : [],
    secret: typeof raw?.secret === 'string' ? raw.secret : '',
  }
}

/** List answers as [..], {payload:[..]} or {payload:{webhooks:[..]}} (shape confirmed live in 83-14). */
async function listWebhooks(client) {
  return unwrapList(await client.request('GET', '/webhooks'), 'webhooks').map(normalise)
}

function createdId(res) {
  return res?.payload?.webhook?.id ?? res?.payload?.id ?? res?.webhook?.id ?? res?.id ?? null
}

const sameSet = (a, b) => {
  const left = new Set(a)
  const right = new Set(b)
  return left.size === right.size && [...left].every((x) => right.has(x))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandEnsure(ctx) {
  const { client, desired, out, err } = ctx
  const found = (await listWebhooks(client)).filter((w) => w.url === desired.url)
  if (found.length > 1) {
    err('error=duplicate_webhooks (delete all but one with: webhook.mjs delete <id>)')
    return 1
  }
  if (found.length === 0) {
    const res = await client.request('POST', '/webhooks', {
      webhook: { name: desired.name, url: desired.url, subscriptions: desired.subscriptions },
    })
    ctx.note(res?.payload?.webhook?.secret ?? res?.payload?.secret ?? res?.secret)
    out(`webhook=created id=${createdId(res) ?? 'unknown'}`)
    return 0
  }
  const [existing] = found
  ctx.note(existing.secret)
  if (sameSet(existing.subscriptions, desired.subscriptions)) {
    out(`webhook=unchanged id=${existing.id}`)
    return 0
  }
  await client.request('PATCH', `/webhooks/${existing.id}`, { webhook: { subscriptions: desired.subscriptions } })
  out(`webhook=updated id=${existing.id}`)
  return 0
}

async function commandList(ctx) {
  const rows = await listWebhooks(ctx.client)
  for (const w of rows) {
    ctx.note(w.secret)
    ctx.out(`id=${w.id} url=${w.url} subscriptions=${w.subscriptions.join(',')}`)
  }
  if (rows.length === 0) ctx.out('webhooks=0')
  return 0
}

async function commandDelete(ctx, opts) {
  if (!Number.isInteger(opts.id) || opts.id < 1) {
    ctx.err('delete needs one positive integer webhook id')
    return 1
  }
  await ctx.client.request('DELETE', `/webhooks/${opts.id}`)
  ctx.out(`webhook=deleted id=${opts.id}`)
  return 0
}

/** The signing secret of the single webhook registered for the url, or a reason it is unavailable. */
async function currentSecret(ctx) {
  const found = (await listWebhooks(ctx.client)).filter((w) => w.url === ctx.desired.url)
  if (found.length === 0) return { reason: 'no webhook is registered for the url (run: webhook.mjs ensure)' }
  if (found.length > 1) return { reason: 'duplicate_webhooks: more than one webhook has the url' }
  if (!found[0].secret) return { reason: 'Chatwoot did not return a secret (the token must be an administrator token)' }
  return { secret: found[0].secret }
}

async function commandPrint(ctx) {
  // The TTY check comes first and fetches nothing: on a terminal the secret is not even read.
  if (ctx.isTTY) {
    ctx.err(TTY_REFUSAL)
    return 1
  }
  const { secret, reason } = await currentSecret(ctx)
  if (!secret) {
    ctx.err(`no webhook secret available: ${reason}`)
    return 2
  }
  ctx.note(secret)
  // Exactly the value: a trailing newline would become part of the stored Vercel value.
  ctx.write(secret)
  return 0
}

/**
 * Rotation = delete + recreate: Chatwoot has no rotate endpoint and generates the secret itself.
 * The README order (current secret -> CHATWOOT_WEBHOOK_SECRET_PREVIOUS first) is what keeps the
 * receiver accepting in-flight deliveries signed with the old secret. Prints no secret.
 */
async function commandRotate(ctx) {
  const found = (await listWebhooks(ctx.client)).filter((w) => w.url === ctx.desired.url)
  if (found.length > 1) {
    ctx.err('error=duplicate_webhooks (delete all but one with: webhook.mjs delete <id>)')
    return 1
  }
  for (const w of found) ctx.note(w.secret)
  if (found.length === 1) await ctx.client.request('DELETE', `/webhooks/${found[0].id}`)
  const res = await ctx.client.request('POST', '/webhooks', {
    webhook: { name: ctx.desired.name, url: ctx.desired.url, subscriptions: ctx.desired.subscriptions },
  })
  ctx.note(res?.payload?.webhook?.secret ?? res?.payload?.secret ?? res?.secret)
  ctx.out(`webhook=rotated old_id=${found.length === 1 ? found[0].id : 'none'} new_id=${createdId(res) ?? 'unknown'}`)
  ctx.out('next: node infra/chatwoot/webhook.mjs --print secret | vercel env add CHATWOOT_WEBHOOK_SECRET production --sensitive --yes')
  ctx.out('next: redeploy production, run webhook.mjs probe, then remove CHATWOOT_WEBHOOK_SECRET_PREVIOUS from Vercel after a day')
  ctx.out('(the old secret must already be saved as CHATWOOT_WEBHOOK_SECRET_PREVIOUS - see infra/chatwoot/README.md)')
  return 0
}

async function postProbe(ctx, url, body, timestampSec, signature) {
  let res
  try {
    // Plain fetch on purpose: no Chatwoot credential is ever attached to a receiver request, and a
    // redirect must be reported as such (manual), never followed.
    res = await ctx.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Chatwoot-Timestamp': String(timestampSec),
        'X-Chatwoot-Delivery': randomUUID(),
        'X-Chatwoot-Signature': signature,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return 0
  }
  await res.text().catch(() => '')
  return res.status
}

async function commandProbe(ctx) {
  const { secret, reason } = await currentSecret(ctx)
  if (!secret) {
    ctx.err(`no webhook secret available: ${reason}`)
    return 2
  }
  ctx.note(secret)
  const url = ctx.desired.url
  const now = ctx.nowSec()
  const payload = { event: 'message_created', message_type: 'outgoing', private: true, content: 'probe', conversation: { id: 1 } }
  const body = JSON.stringify(payload)
  const tampered = JSON.stringify({ ...payload, content: 'probe-tampered' })
  const signature = chatwootSignature(secret, now, body)
  const staleAt = now - STALE_SECONDS

  const valid = await postProbe(ctx, url, body, now, signature)
  const changedBody = await postProbe(ctx, url, tampered, now, signature)
  const stale = await postProbe(ctx, url, body, staleAt, chatwootSignature(secret, staleAt, body))

  ctx.out(`probe_status=${valid},${changedBody},${stale}`)
  const ok = valid === 200 && changedBody === 401 && stale === 401
  ctx.out(ok ? 'verdict=ok' : 'verdict=fail')
  return ok ? 0 : 1
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   argv: string[], client: any, fetchImpl?: typeof fetch, configDir?: string, isTTY?: boolean,
 *   nowSec?: number | (() => number), out?: (line: string) => void, err?: (line: string) => void,
 *   write?: (text: string) => void,
 * }} deps
 * @returns {Promise<number>} exit code
 */
export async function runChatwootWebhook({
  argv,
  client,
  fetchImpl = globalThis.fetch,
  configDir = HERE,
  isTTY = false,
  nowSec = () => Math.floor(Date.now() / 1000),
  out = (line) => console.log(line),
  err = (line) => console.error(line),
  write,
}) {
  const known = new Set()
  const scrub = (line) => {
    let text = String(line)
    for (const value of known) text = text.split(value).join('[redacted]')
    return text
  }
  const note = (value) => {
    if (typeof value === 'string' && value.length >= MIN_SCRUB_LENGTH) known.add(value)
  }

  try {
    const opts = parseChatwootWebhookArgs(argv, { configDir })
    const desired = { ...loadDesiredWebhook(configDir), url: opts.url }
    const ctx = {
      client,
      fetchImpl,
      desired,
      isTTY,
      nowSec: () => (typeof nowSec === 'function' ? nowSec() : nowSec),
      note,
      out: (line) => out(scrub(line)),
      err: (line) => err(scrub(line)),
      // The raw secret path: bypasses the scrubber on purpose, used by `--print secret` only.
      write: write ?? out,
    }
    if (opts.command === 'ensure') return await commandEnsure(ctx)
    if (opts.command === 'list') return await commandList(ctx)
    if (opts.command === 'delete') return await commandDelete(ctx, opts)
    if (opts.command === 'print') return await commandPrint(ctx)
    if (opts.command === 'rotate') return await commandRotate(ctx)
    if (opts.command === 'probe') return await commandProbe(ctx)
    ctx.err(`Unknown command: ${opts.command}`)
    return 1
  } catch (error) {
    if (error instanceof ChatwootApiError) {
      err(scrub(`API error: ${error.message}`))
      return 2
    }
    if (error instanceof ChatwootConfigError) {
      err(scrub(`Config error: ${error.message}`))
      return 2
    }
    err(scrub(`Webhook tool failed: ${error instanceof Error ? error.message : String(error)}`))
    return 2
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  let client
  try {
    client = createChatwootClient(loadChatwootConfig())
  } catch (error) {
    console.error(`Config error: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
    return
  }
  // exitCode (not exit()) so a piped --print value is fully flushed first.
  process.exitCode = await runChatwootWebhook({
    argv,
    client,
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => process.stdout.write(text),
  })
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
