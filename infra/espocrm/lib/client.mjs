/**
 * infra/espocrm/lib/client.mjs
 *
 * Two-identity EspoCRM REST client for the config-as-code tooling (Phase 80,
 * plan 01, D-17). Node built-ins only (fetch, AbortSignal, Buffer).
 *
 * Identities (credentials are never command-line arguments, never logged):
 *   admin   prestigo-config, an Admin user without 2FA. Needed for metadata,
 *           entity manager, roles and settings (an API user is never admin).
 *           Env/file: ESPOCRM_BASE_URL, ESPOCRM_ADMIN_USER, ESPOCRM_ADMIN_PASSWORD
 *           in ~/.config/prestigo/espocrm-config.env.
 *   apikey  prestigo-sync, an API user with an API key and the Sync writer role.
 *           Env/file: ESPOCRM_BASE_URL, ESPOCRM_API_KEY in
 *           ~/.config/prestigo/espocrm-sync.env.
 * Environment variables with the same names override the file values.
 *
 * Header contract (verified against espocrm 10.0.8 sources, plan 80-01):
 *   apikey  `X-Api-Key: <key>`                      (Logins/ApiKey.php)
 *   admin   first call `GET /api/v1/App/user` with `Espo-Authorization:
 *           base64(user:password)`; the response carries `token`. Every later
 *           call sends `Espo-Authorization: base64(user:token)` plus
 *           `Espo-Authorization-By-Token: true` (HeaderKey::AUTHORIZATION_BY_TOKEN,
 *           Authentication::login). The password is sent exactly once.
 *
 * Safety properties:
 *   - requests run strictly one at a time (the app container is memory capped);
 *   - the first 401 poisons the client: it never retries and every later call
 *     throws without touching the network (EspoCRM bans the IP after repeated
 *     failed logins);
 *   - redirects are refused (redirect 'error') so auth headers never leave the host;
 *   - every request has a timeout; messages and bodies are redacted.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'prestigo')
export const CONFIG_ENV_FILE = path.join(CONFIG_DIR, 'espocrm-config.env')
export const SYNC_ENV_FILE = path.join(CONFIG_DIR, 'espocrm-sync.env')
/** Holds RESEND_SMTP_PASSWORD only: the password of the system mail (Resend SMTP) group account. */
export const SMTP_ENV_FILE = path.join(CONFIG_DIR, 'espocrm-smtp.env')

/** Metadata rebuilds can take long; the admin identity does schema work. */
export const ADMIN_TIMEOUT_MS = 120_000
/** Plain data calls (the API-key identity). */
export const DATA_TIMEOUT_MS = 30_000

const IDENTITIES = {
  admin: {
    keys: ['ESPOCRM_BASE_URL', 'ESPOCRM_ADMIN_USER', 'ESPOCRM_ADMIN_PASSWORD'],
    file: CONFIG_ENV_FILE,
  },
  apikey: {
    keys: ['ESPOCRM_BASE_URL', 'ESPOCRM_API_KEY'],
    file: SYNC_ENV_FILE,
  },
}

export class EspoConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EspoConfigError'
  }
}

export class EspoApiError extends Error {
  constructor(method, apiPath, status, body) {
    super(`${method} ${apiPath} -> ${status}${body ? ` ${body}` : ''}`)
    this.name = 'EspoApiError'
    this.method = method
    this.apiPath = apiPath
    this.status = status
    this.body = body
  }
}

/**
 * Parse KEY=value lines (optional `export ` prefix, optional quotes, # comments). A comment
 * after the value ("KEY=abc # note", "KEY='abc' # note") is dropped; a "#" that is not
 * preceded by whitespace is part of the value. Never logs values.
 */
export function parseEnvFile(text) {
  const out = {}
  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    line = line.replace(/^export\s+/, '')
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const quoted = value.match(/^(["'])(.*?)\1(?:\s+#.*)?$/)
    if (quoted) value = quoted[2]
    else if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, '')
    out[key] = value
  }
  return out
}

/**
 * Default reader for a credential file: null when it does not exist, an EspoConfigError when it
 * is readable by group or others (the README requires mode 600). Skipped on Windows, where POSIX
 * modes do not apply.
 */
export function readSecretFile(file) {
  if (!existsSync(file)) return null
  if (process.platform !== 'win32') {
    const mode = statSync(file).mode
    if (mode & 0o077) {
      const shown = file.replace(os.homedir(), '~')
      throw new EspoConfigError(`${shown} is readable by other users (mode ${(mode & 0o777).toString(8)}); run: chmod 600 ${shown}`)
    }
  }
  return readFileSync(file, 'utf8')
}

/**
 * @param {{ identity: 'admin' | 'apikey', env?: Record<string, string | undefined>, filePath?: string, readFile?: (p: string) => string | null }} options
 * @returns {{ identity: string, baseUrl: string, user?: string, password?: string, apiKey?: string }}
 */
export function loadEspoConfig({ identity, env = process.env, filePath, readFile } = {}) {
  const spec = IDENTITIES[identity]
  if (!spec) throw new EspoConfigError(`Unknown identity "${identity}" (expected admin or apikey)`)
  const file = filePath ?? spec.file

  const values = {}
  for (const key of spec.keys) if (env[key]) values[key] = env[key]

  if (spec.keys.some((k) => !values[k])) {
    const reader = readFile ?? readSecretFile
    const text = reader(file)
    if (text) {
      const parsed = parseEnvFile(text)
      for (const key of spec.keys) if (!values[key] && parsed[key]) values[key] = parsed[key]
    }
  }

  const missing = spec.keys.filter((k) => !values[k])
  if (missing.length) {
    throw new EspoConfigError(
      `Missing ${missing.join(', ')} - set the environment variables or add them to ${file.replace(os.homedir(), '~')}`,
    )
  }

  let url
  try {
    url = new URL(values.ESPOCRM_BASE_URL)
  } catch {
    throw new EspoConfigError('ESPOCRM_BASE_URL is not a valid URL')
  }
  if (url.protocol !== 'https:') throw new EspoConfigError('ESPOCRM_BASE_URL must use https')

  if (identity === 'admin') {
    return {
      identity,
      baseUrl: url.origin,
      user: values.ESPOCRM_ADMIN_USER,
      password: values.ESPOCRM_ADMIN_PASSWORD,
    }
  }
  // A header value must be plain printable ASCII. A stray character (e.g. one typed on a
  // non-Latin keyboard layout while pasting) otherwise surfaces as a cryptic ByteString fetch error.
  if (!/^[\x21-\x7e]+$/.test(values.ESPOCRM_API_KEY)) {
    throw new EspoConfigError(
      `ESPOCRM_API_KEY contains a character outside printable ASCII (check ${file.replace(os.homedir(), '~')})`,
    )
  }
  return { identity, baseUrl: url.origin, apiKey: values.ESPOCRM_API_KEY }
}

/**
 * Reads RESEND_SMTP_PASSWORD from the mode-600 smtp env file (never from the environment and never
 * from a command line). The value is returned to the caller and must go into a request body only:
 * it is never logged and never part of an error message.
 *
 * @param {{ filePath?: string, readFile?: (p: string) => string | null }} [options]
 * @returns {string}
 */
export function loadSmtpPassword({ filePath = SMTP_ENV_FILE, readFile } = {}) {
  const shown = filePath.replace(os.homedir(), '~')
  const reader = readFile ?? readSecretFile
  const text = reader(filePath)
  const value = text ? parseEnvFile(text).RESEND_SMTP_PASSWORD : undefined
  if (!value) throw new EspoConfigError(`Missing RESEND_SMTP_PASSWORD - add it to ${shown} (mode 600)`)
  if (!/^[\x21-\x7e]+$/.test(value)) {
    throw new EspoConfigError(`RESEND_SMTP_PASSWORD contains a character outside printable ASCII (check ${shown})`)
  }
  return value
}

const MAX_BODY_CHARS = 300

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64')

/** Redactor over a growing secret list (the token only exists after the exchange). */
function makeRedactor() {
  const secrets = new Set()
  const redact = (text) => {
    let out = String(text ?? '')
    for (const secret of secrets) out = out.split(secret).join('[redacted]')
    out = out.replace(/("(?:token|password|apiKey|api_key|secret)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2')
    return out.length > MAX_BODY_CHARS ? `${out.slice(0, MAX_BODY_CHARS)}...` : out
  }
  redact.add = (...values) => {
    for (const v of values) if (v) secrets.add(v)
  }
  return redact
}

/**
 * @param {{ config: ReturnType<typeof loadEspoConfig>, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
export function createEspoClient({ config, fetchImpl = globalThis.fetch, timeoutMs } = {}) {
  if (!config || !config.baseUrl) throw new EspoConfigError('createEspoClient needs a config with baseUrl')
  const identity = config.identity
  if (identity === 'admin' && !(config.user && config.password)) {
    throw new EspoConfigError('createEspoClient (admin) needs user and password')
  }
  if (identity === 'apikey' && !config.apiKey) throw new EspoConfigError('createEspoClient (apikey) needs apiKey')
  if (identity !== 'admin' && identity !== 'apikey') throw new EspoConfigError(`Unknown identity "${identity}"`)

  const effectiveTimeout = timeoutMs ?? (identity === 'admin' ? ADMIN_TIMEOUT_MS : DATA_TIMEOUT_MS)
  const root = config.baseUrl.replace(/\/+$/, '')
  const redact = makeRedactor()

  if (identity === 'admin') {
    redact.add(config.password, b64(`${config.user}:${config.password}`))
  } else {
    redact.add(config.apiKey)
  }

  let token = null
  let poisoned = false
  // Serialises every request (including the token exchange): one in flight.
  let chain = Promise.resolve()

  async function rawFetch(method, apiPath, headers, body) {
    let res
    try {
      res = await fetchImpl(`${root}/api/v1${apiPath}`, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body,
        // Never follow a redirect: the auth headers must not leave the instance.
        redirect: 'error',
        signal: AbortSignal.timeout(effectiveTimeout),
      })
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new EspoApiError(
        method,
        apiPath,
        0,
        timedOut ? `request timed out after ${effectiveTimeout} ms` : redact(err instanceof Error ? err.message : String(err)),
      )
    }
    // A timeout or reset while the body streams is a transport problem too: map it to the same
    // status-0 EspoApiError so callers that branch on EspoApiError classify it correctly.
    let text
    try {
      text = await res.text()
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new EspoApiError(
        method,
        apiPath,
        0,
        timedOut ? `response timed out after ${effectiveTimeout} ms` : redact(err instanceof Error ? err.message : String(err)),
      )
    }
    if (!res.ok) {
      // EspoCRM often explains an error in X-Status-Reason rather than the body.
      const reason = res.headers?.get?.('X-Status-Reason')
      throw new EspoApiError(method, apiPath, res.status, redact(text || reason || ''))
    }
    return text
  }

  async function exchangeToken() {
    const basic = b64(`${config.user}:${config.password}`)
    let text
    try {
      text = await rawFetch('GET', '/App/user', { 'Espo-Authorization': basic })
    } catch (err) {
      // Any failed login attempt (401, 403 ban, ...) stops the whole client.
      poisoned = true
      throw err
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      poisoned = true
      throw new EspoApiError('GET', '/App/user', 200, 'response was not JSON')
    }
    const issued = parsed?.token
    if (typeof issued !== 'string' || !issued) {
      poisoned = true
      throw new EspoApiError('GET', '/App/user', 200, 'response carried no token')
    }
    token = issued
    redact.add(token, b64(`${config.user}:${token}`))
  }

  async function send(method, apiPath, body, extraHeaders) {
    if (poisoned) throw new EspoApiError(method, apiPath, 401, 'aborted after earlier 401')
    if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
      throw new EspoConfigError('apiPath must start with "/" and be relative to /api/v1')
    }

    let headers
    if (identity === 'apikey') {
      headers = { 'X-Api-Key': config.apiKey }
    } else {
      if (!token) await exchangeToken()
      headers = {
        'Espo-Authorization': b64(`${config.user}:${token}`),
        'Espo-Authorization-By-Token': 'true',
      }
    }

    // Caller headers (e.g. X-Skip-Duplicate-Check) never override the auth headers set above.
    if (extraHeaders) headers = { ...extraHeaders, ...headers }

    let payload
    if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }

    let text
    try {
      text = await rawFetch(method, apiPath, headers, payload)
    } catch (err) {
      if (err instanceof EspoApiError && err.status === 401) poisoned = true
      throw err
    }
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return {
    identity,
    /** Registers a secret (e.g. the SMTP password) so error bodies and messages mask it. */
    addSecret(...values) {
      redact.add(...values)
    },
    request(method, apiPath, body, extraHeaders) {
      const run = chain.then(() => send(method, apiPath, body, extraHeaders))
      chain = run.catch(() => {})
      return run
    },
  }
}
