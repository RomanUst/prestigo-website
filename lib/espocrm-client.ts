/**
 * Site-side EspoCRM client (Phase 81). API-key identity only, configured from
 * Vercel env. This is the ONLY file that names the CRM env vars, and it is
 * reachable only from the QStash-invoked dispatcher (lib/lead-sync.ts and
 * app/api/integrations/dispatch/route.ts) — never from a request path a visitor
 * can hit (enforced by tests/infra-vps-isolation-guard.test.ts).
 *
 * Hardening: https-only base URL, redirects are an error (the API key must not
 * leave the instance), every request has a timeout, the first 401/403 poisons
 * the client (EspoCRM bans an IP after repeated failed logins), and error text
 * carries method, path WITHOUT the query string (a query can hold an email) and
 * status only.
 */

export interface SiteEspoConfig {
  baseUrl: string
  apiKey: string
  leadAssigneeId: string | null
}

const ASSIGNEE_RE = /^[0-9a-f]{17}$/
const API_KEY_RE = /^[\x21-\x7e]+$/

/** Never throws. Null when the CRM is not (validly) configured. */
export function loadSiteEspoConfig(env: Record<string, string | undefined> = process.env): SiteEspoConfig | null {
  try {
    const rawUrl = env.ESPOCRM_BASE_URL
    const apiKey = env.ESPOCRM_API_KEY
    if (!rawUrl || !apiKey) return null
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return null
    // A header value must be printable ASCII; a stray character would surface as a cryptic fetch error.
    if (!API_KEY_RE.test(apiKey)) return null
    const assignee = env.ESPOCRM_LEAD_ASSIGNEE_ID
    return {
      baseUrl: url.origin,
      apiKey,
      leadAssigneeId: assignee && ASSIGNEE_RE.test(assignee) ? assignee : null,
    }
  } catch {
    return null
  }
}

export class SiteEspoError extends Error {
  method: string
  /** Path without the query string. */
  path: string
  /** 0 = network error or timeout. */
  status: number
  /** crm_unreachable | crm_auth | crm_<status> */
  code: string

  constructor(method: string, path: string, status: number) {
    const cleanPath = path.split('?')[0]
    const code = status === 0 ? 'crm_unreachable' : status === 401 || status === 403 ? 'crm_auth' : `crm_${status}`
    super(`EspoCRM ${method} ${cleanPath} failed: ${status === 0 ? 'no response' : `HTTP ${status}`}`)
    this.name = 'SiteEspoError'
    this.method = method
    this.path = cleanPath
    this.status = status
    this.code = code
  }
}

/** PUT / DELETE of one stream Note: `/Note/<id>`. */
function isNoteWrite(method: string, path: string): boolean {
  return (method === 'PUT' || method === 'DELETE') && /^\/Note\/[A-Za-z0-9]+(?:\?.*)?$/.test(path)
}

export type EspoErrorClass = 'transient' | 'auth' | 'not_found' | 'conflict' | 'permanent'

export function classifyEspoError(err: unknown): EspoErrorClass {
  const status = err instanceof SiteEspoError ? err.status : 0
  if (status === 0 || status === 429 || status >= 500) return 'transient'
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  return 'permanent'
}

export interface SiteEspoClient {
  get(path: string): Promise<unknown>
  post(path: string, body: unknown, headers?: Record<string, string>): Promise<unknown>
  put(path: string, body: unknown): Promise<unknown>
  del(path: string): Promise<unknown>
}

export function createSiteEspoClient({
  config,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}: {
  config: SiteEspoConfig
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): SiteEspoClient {
  const root = config.baseUrl.replace(/\/+$/, '')
  let poisoned = false

  async function send(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('espocrm path must start with "/"')
    }
    if (poisoned) throw new SiteEspoError(method, path, 401)

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...extraHeaders,
      'X-Api-Key': config.apiKey,
    }
    let payload: string | undefined
    if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
    }

    const signal = AbortSignal.timeout(timeoutMs)
    // Race the signal explicitly so a fetch that ignores it cannot hang the invocation.
    const timedOut = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    })

    let text: string
    let status: number
    try {
      const res = await Promise.race([
        fetchImpl(`${root}/api/v1${path}`, {
          method,
          headers,
          body: payload,
          // Never follow a redirect: the API key must not leave the instance.
          redirect: 'error',
          signal,
        }),
        timedOut,
      ])
      status = res.status
      text = await Promise.race([res.text(), timedOut])
    } catch {
      // Network error, timeout, redirect refused: no message is kept (it could hold the URL or key).
      throw new SiteEspoError(method, path, 0)
    }

    if (status < 200 || status >= 300) {
      // A 403 on one Note write is a per-record refusal (the Note was written by another user), not a
      // credential failure: the same invocation already authenticated. It must not stop the erasure
      // saga that skips such a Note (Phase 83 D-16). Every other 401/403 still poisons the client.
      if (status === 401 || (status === 403 && !isNoteWrite(method, path))) poisoned = true
      throw new SiteEspoError(method, path, status)
    }
    if (text.trim() === '') return null
    try {
      return JSON.parse(text)
    } catch {
      // A 2xx that is not JSON is a broken proxy, not a CRM answer: treat as unreachable.
      throw new SiteEspoError(method, path, 0)
    }
  }

  return {
    get: (path) => send('GET', path),
    post: (path, body, headers) => send('POST', path, body, headers),
    put: (path, body) => send('PUT', path, body),
    del: (path) => send('DELETE', path),
  }
}
