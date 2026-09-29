/**
 * infra/chatwoot/lib/graph.mjs
 *
 * Minimal Meta Graph API client for the WhatsApp template tooling (Phase 78
 * plan 03, D-09). Mirrors lib/client.mjs: Node built-ins only, secrets never on
 * the command line, redacted errors, no redirects, 30 s timeout.
 *
 * Token source (never a command-line argument): env META_WA_SYSTEM_USER_TOKEN
 * and META_WA_WABA_ID; any key missing from the environment is read from
 * ~/.config/prestigo/meta-whatsapp.env (owner-created, mode 600). Optional
 * META_WA_GRAPH_VERSION (default v25.0). The token is sent only in the
 * Authorization header, never in a URL, and never appears in an error message.
 *
 * Only GET and POST exist here: the template tooling must never delete
 * (a deleted template name is blocked by Meta for 30 days).
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseEnvFile } from './client.mjs'

export const DEFAULT_META_ENV_FILE = path.join(os.homedir(), '.config', 'prestigo', 'meta-whatsapp.env')
export const DEFAULT_GRAPH_VERSION = 'v25.0'
export const GRAPH_ORIGIN = 'https://graph.facebook.com'
export const REQUEST_TIMEOUT_MS = 30_000
export const MAX_PAGES = 50

const TOKEN_KEY = 'META_WA_SYSTEM_USER_TOKEN'
const WABA_KEY = 'META_WA_WABA_ID'
const VERSION_KEY = 'META_WA_GRAPH_VERSION'
const ALL_KEYS = [TOKEN_KEY, WABA_KEY, VERSION_KEY]

/** Rate-limit signals [ASSUMED A5]: HTTP 429 or these Graph error codes. */
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 613])
/** Already-exists signal [ASSUMED]: HTTP 400 + message, or this subcode. */
const ALREADY_EXISTS_SUBCODE = 2388024

export class MetaConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MetaConfigError'
  }
}

export class MetaApiError extends Error {
  /**
   * @param {string} method
   * @param {string} apiPath
   * @param {number} status HTTP status, 0 for a transport failure
   * @param {string} body already-redacted response body
   * @param {{ code?: number, subcode?: number, message?: string }} [meta] parsed Graph error fields
   */
  constructor(method, apiPath, status, body, meta = {}) {
    super(`${method} ${apiPath} -> ${status}${body ? ` ${body}` : ''}`)
    this.name = 'MetaApiError'
    this.method = method
    this.path = apiPath
    this.status = status
    this.body = body
    this.code = meta.code
    this.subcode = meta.subcode
    this.graphMessage = meta.message ?? ''
  }

  get isRateLimit() {
    return this.status === 429 || (this.code !== undefined && RATE_LIMIT_CODES.has(this.code))
  }

  get isAlreadyExists() {
    return this.status === 400 && (this.subcode === ALREADY_EXISTS_SUBCODE || /already exists/i.test(this.graphMessage))
  }
}

/**
 * @param {{ env?: Record<string, string | undefined>, filePath?: string, readFile?: (p: string) => string | null, required?: string[] }} [options]
 * `required` lists the keys that must resolve (default: token and WABA id).
 */
export function loadMetaConfig({
  env = process.env,
  filePath = DEFAULT_META_ENV_FILE,
  readFile,
  required = [TOKEN_KEY, WABA_KEY],
} = {}) {
  const values = {}
  for (const key of ALL_KEYS) if (env[key]) values[key] = env[key]

  if (ALL_KEYS.some((k) => !values[k])) {
    const reader = readFile ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null))
    const text = reader(filePath)
    if (text) {
      const parsed = parseEnvFile(text)
      for (const key of ALL_KEYS) if (!values[key] && parsed[key]) values[key] = parsed[key]
    }
  }

  const missing = required.filter((k) => !values[k])
  if (missing.length) {
    throw new MetaConfigError(
      `Missing ${missing.join(', ')} - set the environment variables or add them to ~/.config/prestigo/meta-whatsapp.env`,
    )
  }

  const graphVersion = values[VERSION_KEY] || DEFAULT_GRAPH_VERSION
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new MetaConfigError(`${VERSION_KEY} must look like v25.0`)
  }
  if (values[WABA_KEY] && !/^\d+$/.test(values[WABA_KEY])) {
    throw new MetaConfigError(`${WABA_KEY} must be a number`)
  }

  return {
    token: values[TOKEN_KEY],
    wabaId: values[WABA_KEY],
    graphVersion,
  }
}

const MAX_BODY_CHARS = 300

function makeRedactor(token) {
  return (text) => {
    let out = String(text ?? '')
    if (token) out = out.split(token).join('[redacted]')
    // Never let a secret leak through an echoed response body either.
    out = out.replace(/("(?:access_token|app_secret|client_secret|fb_exchange_token)"\s*:\s*")[^"]*(")/g, '$1[redacted]$2')
    out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    out = out.replace(/([?&](?:access_token|app_secret|client_secret)=)[^&\s"]*/g, '$1[redacted]')
    return out.length > MAX_BODY_CHARS ? `${out.slice(0, MAX_BODY_CHARS)}...` : out
  }
}

function parseGraphError(text) {
  try {
    const parsed = JSON.parse(text)
    const e = parsed && typeof parsed === 'object' ? parsed.error : null
    if (e && typeof e === 'object') {
      return {
        code: typeof e.code === 'number' ? e.code : undefined,
        subcode: typeof e.error_subcode === 'number' ? e.error_subcode : undefined,
        message: typeof e.message === 'string' ? e.message : '',
      }
    }
  } catch {
    /* not JSON */
  }
  return {}
}

/**
 * @param {{ token: string, graphVersion?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createGraphClient({
  token,
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!token) throw new MetaConfigError('createGraphClient needs a token')
  const redact = makeRedactor(token)
  const root = `${GRAPH_ORIGIN}/${graphVersion}`

  async function request(method, apiPath, body) {
    if (method !== 'GET' && method !== 'POST') {
      throw new MetaConfigError(`Graph client only supports GET and POST (got ${method})`)
    }
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/') || apiPath.includes('://')) {
      throw new MetaConfigError('Graph client paths must start with / and never be absolute URLs')
    }
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    let payload
    if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }
    let res
    try {
      res = await fetchImpl(`${root}${apiPath}`, {
        method,
        headers,
        body: payload,
        // Never follow a redirect: the Authorization header must not travel to
        // any host other than graph.facebook.com.
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new MetaApiError(
        method,
        apiPath,
        0,
        timedOut ? `request timed out after ${timeoutMs} ms` : redact(err instanceof Error ? err.message : String(err)),
      )
    }
    const text = await res.text()
    if (!res.ok) {
      const meta = parseGraphError(text)
      if (meta.message) meta.message = redact(meta.message)
      throw new MetaApiError(method, apiPath, res.status, redact(text), meta)
    }
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  /**
   * GET every page of a Graph collection. Pages are followed by the
   * paging.cursors.after cursor on the fixed Graph origin, never by fetching a
   * paging.next URL (that URL is server-supplied and could point anywhere).
   * @returns {Promise<any[]>}
   */
  async function paginate(apiPath, { maxPages = MAX_PAGES } = {}) {
    const items = []
    let after = null
    for (let page = 0; page < maxPages; page++) {
      const sep = apiPath.includes('?') ? '&' : '?'
      const pagePath = after ? `${apiPath}${sep}after=${encodeURIComponent(after)}` : apiPath
      const res = await request('GET', pagePath)
      if (res && Array.isArray(res.data)) items.push(...res.data)
      const next = res?.paging?.cursors?.after
      // Graph omits paging.next on the last page; only continue while it exists.
      if (!res?.paging?.next || !next || next === after) return items
      after = next
    }
    throw new MetaApiError('GET', apiPath, 0, `more than ${maxPages} pages - stopping`)
  }

  return { request, paginate }
}
