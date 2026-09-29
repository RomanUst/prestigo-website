#!/usr/bin/env node
/**
 * infra/chatwoot/whatsapp-channel.mjs
 *
 * WhatsApp channel operations for the Chatwoot manual (Cloud API) inbox
 * (Phase 78 plan 09, D-03 / D-06 / D-18). One mode per run:
 *
 *   --probe                       three message-less webhook POSTs (unsigned, wrong
 *                                 signature, correct X-Hub-Signature-256) to the
 *                                 WhatsApp inbox's own webhook URL; verdict=enforced
 *                                 only for 401 / 401 / 200
 *   --harden [--dry-run]          merge app_secret into the manual channel's
 *                                 provider_config (admin inbox PATCH, full existing
 *                                 hash merged in memory), re-read, prove source,
 *                                 api_key and phone_number_id are unchanged. Idempotent.
 *   --sync-templates              POST /inboxes/:id/sync_templates (recovery lever)
 *   --register-webhook            POST /inboxes/:id/register_webhook (recovery lever)
 *   --number [--expect-e164 <E164>] [--expect-currency <ISO code>]
 *                                 read the number and WABA from Graph; prints enums
 *                                 only. --expect-e164 (+420 and 9 digits) prints
 *                                 number_matches without printing the number.
 *   --register                    register the number with the owner's own 6-digit PIN,
 *                                 typed at a hidden prompt in the owner's own terminal.
 *                                 Refuses without a TTY; reads status first; at most
 *                                 one register call per run (Meta allows 10 per 72 h).
 *                                 The PIN is never accepted from argv, env, a file or a
 *                                 pipe and is never printed, logged or stored.
 *
 * Config sources (never a command-line argument):
 *   - Chatwoot admin token: env CHATWOOT_API_TOKEN / CHATWOOT_BASE_URL /
 *     CHATWOOT_ACCOUNT_ID or ~/.config/prestigo/chatwoot-api.env (lib/client.mjs)
 *   - Meta values: env or ~/.config/prestigo/meta-whatsapp.env (owner-created,
 *     mode 600): META_WA_SYSTEM_USER_TOKEN, META_WA_APP_SECRET, META_WA_WABA_ID,
 *     META_WA_PHONE_NUMBER_ID, optional META_WA_GRAPH_VERSION.
 *
 * Exit codes: 0 ok, 1 expectation failed / refused / usage error,
 * 2 API or config error.
 *
 * NEVER PRINTS SECRETS: every output line is a fixed key=value enum, a status code
 * or a boolean. provider_config values, the app secret, the Meta token and the
 * Chatwoot token are never written to stdout/stderr (every line also passes a
 * scrubber that removes any credential value this process has seen).
 */

import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import readline from 'node:readline'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import {
  ChatwootApiError,
  ChatwootConfigError,
  createChatwootClient,
  loadChatwootConfig,
  parseEnvFile,
} from './lib/client.mjs'
import { createGraphClient, DEFAULT_META_ENV_FILE, loadMetaConfig, MetaApiError, MetaConfigError } from './lib/graph.mjs'

export const WA_CHANNEL_TYPE = 'Channel::Whatsapp'
export const PROBE_TIMEOUT_MS = 30_000
export const SIGNATURE_HEADER = 'X-Hub-Signature-256'

const TOKEN_KEY = 'META_WA_SYSTEM_USER_TOKEN'
const APP_SECRET_KEY = 'META_WA_APP_SECRET'
const WABA_KEY = 'META_WA_WABA_ID'
const PHONE_KEY = 'META_WA_PHONE_NUMBER_ID'
const VERSION_KEY = 'META_WA_GRAPH_VERSION'
const ALL_META_KEYS = [TOKEN_KEY, APP_SECRET_KEY, WABA_KEY, PHONE_KEY, VERSION_KEY]

/** Shortest credential value the output scrubber acts on (avoids mangling short tokens). */
const MIN_SCRUB_LENGTH = 6

export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Meta config for the channel tool. lib/graph.mjs loadMetaConfig only knows the
 * token, WABA id and Graph version, so the app secret and phone number id are
 * resolved here with the same env-then-file order, then handed to it for the
 * shared validation. `required` lists env names that must resolve.
 * @param {string[]} [required]
 * @param {{ env?: Record<string, string | undefined>, filePath?: string, readFile?: (p: string) => string | null }} [options]
 */
export function loadChannelMeta(required = [], { env = process.env, filePath = DEFAULT_META_ENV_FILE, readFile } = {}) {
  const merged = {}
  for (const key of ALL_META_KEYS) if (env[key]) merged[key] = env[key]
  if (ALL_META_KEYS.some((k) => !merged[k])) {
    const reader = readFile ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null))
    const text = reader(filePath)
    if (text) {
      const parsed = parseEnvFile(text)
      for (const key of ALL_META_KEYS) if (!merged[key] && parsed[key]) merged[key] = parsed[key]
    }
  }
  const missing = required.filter((k) => !merged[k])
  if (missing.length) {
    throw new MetaConfigError(
      `Missing ${missing.join(', ')} - set the environment variables or add them to ~/.config/prestigo/meta-whatsapp.env`,
    )
  }
  if (merged[PHONE_KEY] && !/^\d+$/.test(merged[PHONE_KEY])) {
    throw new MetaConfigError(`${PHONE_KEY} must be a number`)
  }
  const base = loadMetaConfig({ env: merged, readFile: () => null, required: [] })
  return {
    token: base.token,
    wabaId: base.wabaId,
    graphVersion: base.graphVersion,
    appSecret: merged[APP_SECRET_KEY],
    phoneNumberId: merged[PHONE_KEY],
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "sha256=" + hex HMAC-SHA256 of exactly the bytes that will be posted. */
export function signBody(secret, rawBody) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
}

/**
 * Message-less Meta webhook payload: metadata only, so the probe can never create
 * a customer conversation (no `messages`, no `statuses`).
 * @param {{ phone_number?: string, provider_config?: Record<string, any> }} inbox
 */
export function buildProbePayload(inbox) {
  const digits = String(inbox?.phone_number ?? '').replace(/\D/g, '')
  const pc = inbox?.provider_config && typeof inbox.provider_config === 'object' ? inbox.provider_config : {}
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: String(pc.business_account_id ?? ''),
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: digits, phone_number_id: String(pc.phone_number_id ?? '') },
            },
          },
        ],
      },
    ],
  }
}

/**
 * New provider_config with every existing key plus app_secret. The Chatwoot PATCH
 * REPLACES provider_config, so the full existing hash must be sent back. Never
 * mutates its input.
 * @param {Record<string, any>} existing
 * @param {string} secret
 */
export function mergeAppSecret(existing, secret) {
  return { ...structuredClone(existing ?? {}), app_secret: secret }
}

function unwrapList(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.payload)) return res.payload
  if (Array.isArray(res?.data)) return res.data
  return []
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const MODES = new Map([
  ['--probe', 'probe'],
  ['--harden', 'harden'],
  ['--sync-templates', 'sync-templates'],
  ['--register-webhook', 'register-webhook'],
  ['--number', 'number'],
  ['--register', 'register'],
])
const MODE_LIST = [...MODES.keys()].join(', ')

const E164_RE = /^\+420\d{9}$/
const CURRENCY_RE = /^[A-Z]{3}$/

/**
 * Anything that is not a listed mode or option is a usage error, so a PIN-style
 * flag (--pin, --verification-pin, ...) is rejected before any request is made.
 */
export function parseArgs(argv) {
  const opts = { mode: null, dryRun: false, expectE164: null, expectCurrency: null }
  const takeValue = (i, flag) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (MODES.has(arg)) {
      const mode = MODES.get(arg)
      if (opts.mode && opts.mode !== mode) throw new UsageError('Use exactly one mode')
      opts.mode = mode
    } else if (arg === '--dry-run') {
      opts.dryRun = true
    } else if (arg === '--expect-e164') {
      opts.expectE164 = takeValue(i++, '--expect-e164')
      if (!E164_RE.test(opts.expectE164)) throw new UsageError('--expect-e164 must look like +420 followed by 9 digits, no spaces')
    } else if (arg === '--expect-currency') {
      opts.expectCurrency = takeValue(i++, '--expect-currency')
      if (!CURRENCY_RE.test(opts.expectCurrency)) throw new UsageError('--expect-currency must be a 3-letter uppercase ISO currency code')
    } else {
      throw new UsageError(`Unknown argument: ${arg}`)
    }
  }
  if (!opts.mode) throw new UsageError(`Use one of ${MODE_LIST}`)
  if (opts.dryRun && opts.mode !== 'harden') throw new UsageError('--dry-run only works with --harden')
  if ((opts.expectE164 || opts.expectCurrency) && opts.mode !== 'number') {
    throw new UsageError('--expect-e164 and --expect-currency only work with --number')
  }
  return opts
}

// ---------------------------------------------------------------------------
// Chatwoot inbox resolution
// ---------------------------------------------------------------------------

function needChatwoot(ctx) {
  if (!ctx.chatwoot) throw new ChatwootConfigError('This mode needs a Chatwoot client')
  return ctx.chatwoot
}

/**
 * Exactly one Channel::Whatsapp inbox (0 -> null, >1 -> config error). With
 * `detail`, the admin-only single-inbox view (phone_number + provider_config) is
 * merged in. The provider_config never leaves the caller's scope.
 */
async function resolveInbox(ctx, { detail = false } = {}) {
  const chatwoot = needChatwoot(ctx)
  const found = unwrapList(await chatwoot.request('GET', '/inboxes')).filter((i) => i?.channel_type === WA_CHANNEL_TYPE)
  if (found.length === 0) return null
  if (found.length > 1) throw new ChatwootConfigError(`Expected exactly one ${WA_CHANNEL_TYPE} inbox, found ${found.length}`)
  const listed = found[0]
  if (!Number.isInteger(listed.id)) throw new ChatwootConfigError('WhatsApp inbox has no numeric id')
  if (!detail) return listed
  const full = await chatwoot.request('GET', `/inboxes/${listed.id}`)
  return { ...listed, ...(full && typeof full === 'object' ? full : {}) }
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function postProbe(ctx, url, rawBody, extraHeaders) {
  let res
  try {
    // Plain fetch on purpose: no Chatwoot or Meta credential is ever attached to a
    // webhook request, and a redirect must never be followed.
    res = await ctx.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: rawBody,
      redirect: 'error',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new Error(`webhook probe request failed (${timedOut ? 'timed out' : 'network error'})`)
  }
  await res.text().catch(() => '')
  return res.status
}

async function modeProbe(ctx) {
  const meta = ctx.loadMeta([APP_SECRET_KEY])
  ctx.addSecret(meta.appSecret)
  const inbox = await resolveInbox(ctx, { detail: true })
  if (!inbox) {
    ctx.out('whatsapp inbox missing')
    return 1
  }
  if (!ctx.baseUrl) throw new ChatwootConfigError('The probe needs the Chatwoot base URL')
  const phone = String(inbox.phone_number ?? '')
  if (!/^\+?\d{6,20}$/.test(phone)) throw new ChatwootConfigError('WhatsApp inbox has no usable phone number')
  const url = `${ctx.baseUrl.replace(/\/+$/, '')}/webhooks/whatsapp/${phone}`
  const rawBody = JSON.stringify(buildProbePayload(inbox))

  const unsigned = await postProbe(ctx, url, rawBody, {})
  const wrong = await postProbe(ctx, url, rawBody, { [SIGNATURE_HEADER]: `sha256=${'0'.repeat(64)}` })
  const signed = await postProbe(ctx, url, rawBody, { [SIGNATURE_HEADER]: signBody(meta.appSecret, rawBody) })

  ctx.out(`unsigned=${unsigned} wrong_signature=${wrong} signed=${signed}`)
  const enforced = unsigned === 401 && wrong === 401 && signed === 200
  ctx.out(enforced ? 'verdict=enforced' : 'verdict=NOT ENFORCED')
  return enforced ? 0 : 1
}

const RAILS_FALLBACK =
  'Fallback: merge app_secret into the Channel::Whatsapp provider_config with a rails runner in the Chatwoot rails container ' +
  '(VPS SSH, owner allow-rule); steps in infra/vps/runbooks/whatsapp.md. provider_config was not changed by this run.'

/** Same value on both sides, compared structurally. */
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function modeHarden(ctx, opts) {
  const meta = ctx.loadMeta([APP_SECRET_KEY])
  const inbox = await resolveInbox(ctx, { detail: true })
  if (!inbox) {
    ctx.out('whatsapp inbox missing')
    return 1
  }
  const existing = inbox.provider_config
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    throw new ChatwootConfigError('WhatsApp inbox has no readable provider_config (admin token needed)')
  }
  // Every provider_config value is treated as sensitive: if an error body echoes
  // any of them (escaped, nested), the scrubber removes it from the output.
  for (const value of Object.values(existing)) if (typeof value === 'string') ctx.addSecret(value)
  const hadSecret = typeof existing.app_secret === 'string' && existing.app_secret !== ''
  const unchanged = existing.app_secret === meta.appSecret

  if (opts.dryRun) {
    ctx.out(`plan app_secret=${unchanged ? 'unchanged' : 'set'}`)
    return 0
  }
  if (unchanged) {
    ctx.out('app_secret=unchanged')
    return 0
  }

  try {
    await needChatwoot(ctx).request('PATCH', `/inboxes/${inbox.id}`, {
      channel: { provider_config: mergeAppSecret(existing, meta.appSecret) },
    })
  } catch (error) {
    if (!(error instanceof ChatwootApiError)) throw error
    ctx.err(`API error: ${error.message}`)
    ctx.err(RAILS_FALLBACK)
    return 2
  }

  const after = (await needChatwoot(ctx).request('GET', `/inboxes/${inbox.id}`))?.provider_config ?? {}
  const saved = after.app_secret === meta.appSecret
  const checks = {
    source_preserved: same(existing.source, after.source),
    api_key_preserved: same(existing.api_key, after.api_key),
    phone_number_id_preserved: same(existing.phone_number_id, after.phone_number_id),
  }
  ctx.out(saved ? `app_secret=${hadSecret ? 'updated' : 'configured'}` : 'app_secret=not_saved')
  for (const [key, ok] of Object.entries(checks)) ctx.out(`${key}=${ok}`)
  return saved && Object.values(checks).every(Boolean) ? 0 : 1
}

async function modeLever(ctx, { path, line }) {
  const inbox = await resolveInbox(ctx)
  if (!inbox) {
    ctx.out('whatsapp inbox missing')
    return 1
  }
  await needChatwoot(ctx).request('POST', `/inboxes/${inbox.id}/${path}`)
  ctx.out(line)
  return 0
}

const PHONE_FIELDS = [
  'status',
  'code_verification_status',
  'platform_type',
  'name_status',
  'quality_rating',
  'messaging_limit_tier',
  'display_phone_number',
]

/** Fixed-set-shaped enum or "unknown": free text from Graph is never echoed. */
const enumOf = (value) => (typeof value === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(value) ? value : 'unknown')

async function readPhoneStatus(graph, phoneId) {
  return (await graph.request('GET', `/${phoneId}?fields=${PHONE_FIELDS.join(',')}`)) ?? {}
}

async function modeNumber(ctx, opts) {
  const meta = ctx.loadMeta([TOKEN_KEY, WABA_KEY, PHONE_KEY])
  const graph = ctx.graph(meta)
  const phone = await readPhoneStatus(graph, meta.phoneNumberId)
  const waba = (await graph.request('GET', `/${meta.wabaId}?fields=currency`)) ?? {}
  const ids = await graph.paginate(`/${meta.wabaId}/phone_numbers?fields=id`)
  const inWaba = ids.some((row) => String(row?.id) === meta.phoneNumberId)
  const currency = typeof waba.currency === 'string' && CURRENCY_RE.test(waba.currency.toUpperCase()) ? waba.currency.toUpperCase() : 'unknown'

  const failures = []
  const status = enumOf(phone.status)
  if (status !== 'CONNECTED') failures.push('status is not CONNECTED')
  if (!inWaba) failures.push('phone number id is not in the WABA')

  for (const key of PHONE_FIELDS.slice(0, 6)) ctx.out(`${key}=${enumOf(phone[key])}`)
  ctx.out(`currency=${currency}`)
  ctx.out(`number_in_waba=${inWaba}`)

  if (opts.expectE164) {
    const shown = String(phone.display_phone_number ?? '').replace(/\D/g, '')
    const matches = shown !== '' && shown === opts.expectE164.replace(/\D/g, '')
    ctx.out(`number_matches=${matches}`)
    if (!matches) failures.push('number does not match --expect-e164')
  }
  if (opts.expectCurrency) {
    const matches = currency === opts.expectCurrency
    ctx.out(`currency_matches=${matches}`)
    if (!matches) failures.push('currency does not match --expect-currency')
  }
  if (failures.length) {
    ctx.err(`expectation failed: ${failures.join('; ')}`)
    return 1
  }
  return 0
}

async function modeRegister(ctx) {
  // The PIN is typed by the owner at a hidden prompt in their own terminal: no
  // argument, env var, file or pipe can supply it, so refuse before anything else.
  if (!ctx.isTTY) {
    ctx.err('Refusing to run: --register needs an interactive terminal (TTY) so the PIN can be typed at a hidden prompt')
    return 1
  }
  const meta = ctx.loadMeta([TOKEN_KEY, PHONE_KEY])
  const graph = ctx.graph(meta)
  const phone = await readPhoneStatus(graph, meta.phoneNumberId)
  if (enumOf(phone.status) === 'CONNECTED') {
    ctx.out('register=already_connected')
    return 0
  }

  const ask = ctx.prompt ?? promptHidden
  const pin = await ask('Enter your 6-digit two-step verification PIN (input hidden): ')
  ctx.addSecret(pin)
  const confirm = await ask('Repeat the PIN: ')
  ctx.addSecret(confirm)
  if (!/^\d{6}$/.test(pin) || pin !== confirm) {
    ctx.err('The PIN must be exactly 6 digits and both entries must match. Nothing was sent.')
    return 1
  }

  // One attempt only (Meta allows 10 register calls per number per 72 h): no retry loop.
  try {
    const res = await graph.request('POST', `/${meta.phoneNumberId}/register`, { messaging_product: 'whatsapp', pin })
    if (res && res.success === false) {
      ctx.out('register=failed')
      return 2
    }
    ctx.out('register=ok')
    return 0
  } catch (error) {
    if (!(error instanceof MetaApiError)) throw error
    ctx.err(`API error: ${error.message}`)
    ctx.out('register=failed')
    return 2
  }
}

/**
 * Reads one line from the owner's terminal without echoing it.
 * @param {string} question
 */
export function promptHidden(question, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve, reject) => {
    let muted = false
    let answered = false
    const sink = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) output.write(chunk, encoding)
        callback()
      },
    })
    const rl = readline.createInterface({ input, output: sink, terminal: true })
    rl.on('close', () => {
      if (!answered) reject(new Error('input closed before a PIN was entered'))
    })
    rl.on('SIGINT', () => rl.close())
    output.write(question)
    muted = true
    rl.question('', (answer) => {
      answered = true
      muted = false
      rl.close()
      output.write('\n')
      resolve(answer)
    })
  })
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {{
 *   chatwoot?: any, baseUrl?: string, fetchImpl?: typeof fetch,
 *   loadMeta?: (required: string[]) => ReturnType<typeof loadChannelMeta>,
 *   graphFactory?: (meta: any, fetchImpl: typeof fetch) => any,
 *   out?: (line: string) => void, err?: (line: string) => void,
 *   isTTY?: boolean, prompt?: (question: string) => Promise<string>, secrets?: string[]
 * }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function runChannel(opts, deps = {}) {
  const {
    chatwoot,
    baseUrl,
    fetchImpl = globalThis.fetch,
    loadMeta = (required) => loadChannelMeta(required),
    graphFactory = (meta, f) => createGraphClient({ token: meta.token, graphVersion: meta.graphVersion, fetchImpl: f }),
    out: rawOut = console.log,
    err: rawErr = console.error,
    isTTY = false,
    prompt,
    secrets = [],
  } = deps

  const known = new Set(secrets.filter((s) => typeof s === 'string' && s.length >= MIN_SCRUB_LENGTH))
  const scrub = (line) => {
    let text = String(line)
    for (const value of known) text = text.split(value).join('[redacted]')
    return text
  }
  const ctx = {
    chatwoot,
    baseUrl,
    fetchImpl,
    isTTY,
    prompt,
    out: (line) => rawOut(scrub(line)),
    err: (line) => rawErr(scrub(line)),
    addSecret(value) {
      if (typeof value === 'string' && value.length >= MIN_SCRUB_LENGTH) known.add(value)
    },
    loadMeta(required) {
      const meta = loadMeta(required)
      this.addSecret(meta.token)
      this.addSecret(meta.appSecret)
      return meta
    },
    graph(meta) {
      return graphFactory(meta, fetchImpl)
    },
  }

  try {
    if (opts.mode === 'probe') return await modeProbe(ctx)
    if (opts.mode === 'harden') return await modeHarden(ctx, opts)
    if (opts.mode === 'sync-templates') return await modeLever(ctx, { path: 'sync_templates', line: 'sync_templates=requested' })
    if (opts.mode === 'register-webhook') return await modeLever(ctx, { path: 'register_webhook', line: 'register_webhook=ok' })
    if (opts.mode === 'number') return await modeNumber(ctx, opts)
    if (opts.mode === 'register') return await modeRegister(ctx)
    throw new UsageError('Unknown mode')
  } catch (error) {
    if (error instanceof UsageError) {
      ctx.err(`Usage error: ${error.message}`)
      return 1
    }
    if (error instanceof ChatwootApiError || error instanceof MetaApiError) {
      ctx.err(`API error: ${error.message}`)
      return 2
    }
    if (error instanceof ChatwootConfigError || error instanceof MetaConfigError) {
      ctx.err(`Config error: ${error.message}`)
      return 2
    }
    ctx.err(`Channel tool failed: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const CHATWOOT_MODES = new Set(['probe', 'harden', 'sync-templates', 'register-webhook'])

async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (error) {
    console.error(`Usage error: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  const deps = { isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY) }
  if (CHATWOOT_MODES.has(opts.mode)) {
    try {
      const config = loadChatwootConfig()
      deps.chatwoot = createChatwootClient(config)
      deps.baseUrl = config.baseUrl
      deps.secrets = [config.token]
    } catch (error) {
      console.error(`Config error: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 2
      return
    }
  }
  process.exitCode = await runChannel(opts, deps)
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  await main(process.argv.slice(2))
}
