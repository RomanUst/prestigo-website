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

function unwrapList(res) {
  if (Array.isArray(res)) return res
  if (Array.isArray(res?.payload)) return res.payload
  if (Array.isArray(res?.data)) return res.data
  return []
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const MODES = new Map([['--probe', 'probe']])

export function parseArgs(argv) {
  const opts = { mode: null }
  for (const arg of argv) {
    if (MODES.has(arg)) {
      const mode = MODES.get(arg)
      if (opts.mode && opts.mode !== mode) throw new UsageError('Use exactly one mode')
      opts.mode = mode
    } else {
      throw new UsageError(`Unknown argument: ${arg}`)
    }
  }
  if (!opts.mode) throw new UsageError('Use one of --probe')
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
