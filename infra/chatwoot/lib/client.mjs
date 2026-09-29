/**
 * infra/chatwoot/lib/client.mjs
 *
 * Minimal Chatwoot Application API client for the config-as-code sync
 * (Phase 77 plan 07, D-18). Node built-ins only (fetch, FormData, Blob).
 *
 * Token source (never a command-line argument): env CHATWOOT_API_TOKEN,
 * CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID; any key missing from the environment
 * is read from ~/.config/prestigo/chatwoot-api.env (created by the owner with
 * umask 077). Error messages never contain the token or any config value.
 *
 * AUTH HEADER (live finding, plan 77-07): Chatwoot documents the header as
 * `api_access_token`, but the production reverse proxy / app server DROPS
 * request headers whose name contains an underscore, so `api_access_token: <t>`
 * answers 401. The hyphenated `api-access-token` reaches Rack unchanged and is
 * mapped to the same HTTP_API_ACCESS_TOKEN variable, so the client always sends
 * the hyphenated form.
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const DEFAULT_ENV_FILE = path.join(os.homedir(), '.config', 'prestigo', 'chatwoot-api.env')
export const AUTH_HEADER = 'api-access-token'

const KEYS = ['CHATWOOT_API_TOKEN', 'CHATWOOT_BASE_URL', 'CHATWOOT_ACCOUNT_ID']

export class ChatwootConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ChatwootConfigError'
  }
}

export class ChatwootApiError extends Error {
  constructor(method, apiPath, status, body) {
    super(`${method} ${apiPath} -> ${status}${body ? ` ${body}` : ''}`)
    this.name = 'ChatwootApiError'
    this.method = method
    this.path = apiPath
    this.status = status
    this.body = body
  }
}

/** Parse KEY=value lines (optional quotes, # comments). Never logs values. */
export function parseEnvFile(text) {
  const out = {}
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * @param {{ env?: Record<string, string | undefined>, filePath?: string, readFile?: (p: string) => string | null }} [options]
 */
export function loadChatwootConfig({ env = process.env, filePath = DEFAULT_ENV_FILE, readFile } = {}) {
  const values = {}
  for (const key of KEYS) if (env[key]) values[key] = env[key]

  if (KEYS.some((k) => !values[k])) {
    const reader = readFile ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : null))
    const text = reader(filePath)
    if (text) {
      const parsed = parseEnvFile(text)
      for (const key of KEYS) if (!values[key] && parsed[key]) values[key] = parsed[key]
    }
  }

  const missing = KEYS.filter((k) => !values[k])
  if (missing.length) {
    throw new ChatwootConfigError(
      `Missing ${missing.join(', ')} - set the environment variables or add them to ~/.config/prestigo/chatwoot-api.env`,
    )
  }

  let url
  try {
    url = new URL(values.CHATWOOT_BASE_URL)
  } catch {
    throw new ChatwootConfigError('CHATWOOT_BASE_URL is not a valid URL')
  }
  if (url.protocol !== 'https:') {
    throw new ChatwootConfigError('CHATWOOT_BASE_URL must use https')
  }
  if (!/^\d+$/.test(values.CHATWOOT_ACCOUNT_ID)) {
    throw new ChatwootConfigError('CHATWOOT_ACCOUNT_ID must be a number')
  }

  return {
    baseUrl: url.origin,
    token: values.CHATWOOT_API_TOKEN,
    accountId: values.CHATWOOT_ACCOUNT_ID,
  }
}

const MAX_BODY_CHARS = 300

/** JSON fields of a WhatsApp inbox provider_config whose values must never reach a log. */
const PROVIDER_SECRET_FIELD_RE =
  /("(?:api_key|app_secret|app_secret_key|client_secret|api_secret|verification_pin|business_management_token)"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?)/g

function makeRedactor(token) {
  return (text) => {
    let out = String(text ?? '')
    if (token) out = out.split(token).join('[redacted]')
    // Never let a secret leak through an echoed response body either.
    out = out.replace(/("(?:hmac_token|access_token|api_access_token)"\s*:\s*")[^"]*(")/g, '$1[redacted]$2')
    // Phase 78: a WhatsApp inbox PATCH/GET error can echo the whole provider_config
    // (Cloud API key, app secret, two-step PIN). String or bare-number values.
    out = out.replace(PROVIDER_SECRET_FIELD_RE, '$1"[redacted]"')
    return out.length > MAX_BODY_CHARS ? `${out.slice(0, MAX_BODY_CHARS)}...` : out
  }
}

/** A stalled connection must not hang sync.mjs/inspect.mjs forever. */
export const REQUEST_TIMEOUT_MS = 30_000

export function createChatwootClient({
  baseUrl,
  token,
  accountId,
  fetchImpl = globalThis.fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!baseUrl || !token || !accountId) throw new ChatwootConfigError('createChatwootClient needs baseUrl, token and accountId')
  const redact = makeRedactor(token)
  const root = baseUrl.replace(/\/+$/, '')

  const resolveUrl = (apiPath) =>
    `${root}${apiPath.startsWith('/api/') ? apiPath : `/api/v1/accounts/${accountId}${apiPath}`}`

  async function send(method, apiPath, { body, headers = {} } = {}) {
    let res
    try {
      res = await fetchImpl(resolveUrl(apiPath), {
        method,
        headers: { [AUTH_HEADER]: token, Accept: 'application/json', ...headers },
        body,
        // Never follow a redirect: undici strips only authorization/cookie on a
        // cross-origin hop, so the custom api-access-token header (the owner's
        // full Application API token) would be forwarded to the redirect target.
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new ChatwootApiError(
        method,
        apiPath,
        0,
        timedOut ? `request timed out after ${timeoutMs} ms` : redact(err instanceof Error ? err.message : String(err)),
      )
    }
    const text = await res.text()
    if (!res.ok) throw new ChatwootApiError(method, apiPath, res.status, redact(text))
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return {
    accountId,
    request(method, apiPath, body) {
      if (body === undefined) return send(method, apiPath)
      return send(method, apiPath, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
    },
    /** Multipart upload of one file field (e.g. inbox avatar). */
    async upload(apiPath, field, filePath, method = 'PATCH') {
      const form = new FormData()
      form.append(field, new Blob([readFileSync(filePath)]), path.basename(filePath))
      return send(method, apiPath, { body: form })
    },
  }
}
