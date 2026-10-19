/**
 * Site-side Chatwoot client (Phase 82, plan 82-10). A TypeScript port of the infra client
 * (infra/chatwoot/lib/client.mjs): library code never imports infra code. Configured from Vercel env;
 * this is the ONLY file that names the CHATWOOT_* env vars, and it is reachable only from the
 * QStash-invoked dispatcher (lib/lead-sync.ts -> lib/chatwoot-sync.ts), never from a request path a
 * visitor can hit (enforced by tests/infra-vps-isolation-guard.test.ts).
 *
 * Hardening: https-only base URL, redirects are an error (the token must not leave the instance),
 * every request has a timeout, the token goes in the HYPHENATED `api-access-token` header (the VPS
 * proxy drops underscore headers, live finding of plan 77-07), and error text carries method, path
 * WITHOUT the query string and status only: never a response body, a header or a config value.
 *
 * Two credentials: CHATWOOT_API_TOKEN does every normal write; CHATWOOT_ADMIN_API_TOKEN (optional)
 * is used only by the separate admin client, for contact_merge and erasure (T-82-29).
 */

export interface SiteChatwootConfig {
  baseUrl: string
  accountId: string
  token: string
  /** Administrator token; null when not configured (merge and erasure are then unavailable). */
  adminToken: string | null
}

export const CHATWOOT_AUTH_HEADER = 'api-access-token'

const ACCOUNT_ID_RE = /^\d+$/
// A header value must be printable ASCII; a stray character would surface as a cryptic fetch error.
const TOKEN_RE = /^[\x21-\x7e]+$/

/** Never throws, never reads files. Null when Chatwoot is not (validly) configured. */
export function loadSiteChatwootConfig(env: Record<string, string | undefined> = process.env): SiteChatwootConfig | null {
  try {
    const rawUrl = env.CHATWOOT_BASE_URL
    const accountId = env.CHATWOOT_ACCOUNT_ID
    const token = env.CHATWOOT_API_TOKEN
    if (!rawUrl || !accountId || !token) return null
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return null
    if (!ACCOUNT_ID_RE.test(accountId)) return null
    if (!TOKEN_RE.test(token)) return null
    const admin = env.CHATWOOT_ADMIN_API_TOKEN
    return {
      baseUrl: url.origin,
      accountId,
      token,
      adminToken: admin && TOKEN_RE.test(admin) ? admin : null,
    }
  } catch {
    return null
  }
}

export class SiteChatwootError extends Error {
  method: string
  /** Path relative to the account, without the query string. */
  path: string
  /** 0 = network error or timeout. */
  status: number
  /** cw_http_<status> | cw_network | cw_timeout */
  code: string

  constructor(method: string, path: string, status: number, kind: 'network' | 'timeout' = 'network') {
    const cleanPath = path.split('?')[0]
    const code = status === 0 ? (kind === 'timeout' ? 'cw_timeout' : 'cw_network') : `cw_http_${status}`
    super(`Chatwoot ${method} ${cleanPath} failed: ${status === 0 ? 'no response' : `HTTP ${status}`}`)
    this.name = 'SiteChatwootError'
    this.method = method
    this.path = cleanPath
    this.status = status
    this.code = code
  }
}

export type ChatwootErrorClass = 'transient' | 'auth' | 'not_found' | 'unprocessable' | 'permanent'

export function classifyChatwootError(err: unknown): ChatwootErrorClass {
  const status = err instanceof SiteChatwootError ? err.status : 0
  const method = err instanceof SiteChatwootError ? err.method : ''
  if (status === 0 || status === 429 || status >= 500) return 'transient'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  // Deleting an online contact answers 422 and succeeds later, once the contact is offline.
  if (status === 422) return method === 'DELETE' ? 'transient' : 'unprocessable'
  return 'permanent'
}

export interface SiteChatwootClient {
  get(path: string): Promise<unknown>
  post(path: string, body: unknown): Promise<unknown>
  put(path: string, body: unknown): Promise<unknown>
  del(path: string): Promise<unknown>
}

/** Null when the administrator client is requested and no administrator token is configured. */
export function createSiteChatwootClient({
  config,
  admin = false,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}: {
  config: SiteChatwootConfig
  admin?: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): SiteChatwootClient | null {
  const token = admin ? config.adminToken : config.token
  if (!token) return null
  const root = `${config.baseUrl.replace(/\/+$/, '')}/api/v1/accounts/${config.accountId}`

  async function send(method: string, path: string, body?: unknown): Promise<unknown> {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('chatwoot path must start with "/"')
    }

    const headers: Record<string, string> = { Accept: 'application/json', [CHATWOOT_AUTH_HEADER]: token as string }
    let payload: string | undefined
    if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }

    const signal = AbortSignal.timeout(timeoutMs)
    let timedOutFlag = false
    // Race the signal explicitly so a fetch that ignores it cannot hang the invocation.
    const timedOut = new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          timedOutFlag = true
          reject(new Error('timeout'))
        },
        { once: true },
      )
    })
    // The race loser must never surface as an unhandled rejection.
    timedOut.catch(() => undefined)

    let text: string
    let status: number
    try {
      const res = await Promise.race([
        fetchImpl(`${root}${path}`, {
          method,
          headers,
          body: payload,
          // Never follow a redirect: the token must not leave the instance.
          redirect: 'error',
          signal,
        }),
        timedOut,
      ])
      status = res.status
      text = await Promise.race([res.text(), timedOut])
    } catch {
      // Network error, timeout, redirect refused: no message is kept (it could hold the URL or token).
      throw new SiteChatwootError(method, path, 0, timedOutFlag ? 'timeout' : 'network')
    }

    if (status < 200 || status >= 300) throw new SiteChatwootError(method, path, status)
    if (text.trim() === '') return null
    try {
      return JSON.parse(text)
    } catch {
      // A 2xx that is not JSON is a broken proxy, not a Chatwoot answer: treat as unreachable.
      throw new SiteChatwootError(method, path, 0)
    }
  }

  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, body),
    put: (path, body) => send('PUT', path, body),
    del: (path) => send('DELETE', path),
  }
}
