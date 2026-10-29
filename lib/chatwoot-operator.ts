/**
 * Panel-only Chatwoot client (Phase 84, plan 84-02): proves that the human on the other end of the
 * Chatwoot Dashboard App iframe is a Chatwoot agent who may see this conversation, using the
 * operator's OWN personal Chatwoot token (D-01), and returns just the contact keys the booking
 * lookup needs (D-03).
 *
 * Why this is a separate client and not lib/chatwoot-client.ts:
 *  - The panel path must never be able to act with site privileges. This module reads only
 *    CHATWOOT_BASE_URL and CHATWOOT_ACCOUNT_ID; the site-wide API token is not reachable from here,
 *    so a bug in an operator request can never act with it.
 *  - lib/chatwoot-client.ts is allowlisted in the VPS isolation guard as imported only by the
 *    QStash dispatcher; importing it from a request path would make that reason false.
 *
 * Why only GET: the panel is read-only (PANEL-02). There is no code path here that writes to Chatwoot.
 *
 * Why the conversation call is never cached: Chatwoot decides on every request whether this agent may
 * see the conversation (ConversationPolicy#show?), so removing an agent or resetting a token revokes
 * access on the very next request (D-01). Only the profile result is cached, positive only, keyed by
 * the sha256 hex of the token (D-02); the token itself is never stored.
 *
 * Hardening: https-only base URL, redirects are an error (the token must not leave the instance),
 * every call has a 4000 ms timeout, the token goes in the HYPHENATED `api-access-token` header (the
 * VPS proxy drops underscore headers), and error text carries method, path without the query string
 * and status only. The token, a header or a response body is never logged, thrown or returned, and
 * this module writes no console output at all.
 */
import { z } from 'zod'
import { readEnv } from '@/lib/env'

export const PANEL_CHATWOOT_AUTH_HEADER = 'api-access-token'

const REQUEST_TIMEOUT_MS = 4000
const ACCOUNT_ID_RE = /^\d+$/
// Printable ASCII only: a header value must be, and ASCII keeps bytes, code points and length equal.
const TOKEN_RE = /^[\x21-\x7e]{1,128}$/
const MAX_CONVERSATION_ID = 2 ** 31 - 1
const EMAIL_MAX = 254
const PHONE_MAX = 32

export function isPlausibleOperatorToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export interface PanelChatwootConfig {
  baseUrl: string
  accountId: string
}

/** Null when Chatwoot is not (validly) configured. Never reads the site API token. */
export function loadPanelChatwootConfig(): PanelChatwootConfig | null {
  try {
    const rawUrl = readEnv('CHATWOOT_BASE_URL')
    const accountId = readEnv('CHATWOOT_ACCOUNT_ID')
    if (!rawUrl || !accountId) return null
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return null
    if (!ACCOUNT_ID_RE.test(accountId)) return null
    return { baseUrl: url.origin, accountId }
  } catch {
    return null
  }
}

/** Origin of the configured Chatwoot instance (for the embed CSP), or null when not configured. */
export function panelChatwootOrigin(): string | null {
  const config = loadPanelChatwootConfig()
  return config ? new URL(config.baseUrl).origin : null
}

export class PanelChatwootError extends Error {
  method: string
  /** Path without the query string. */
  path: string
  /** 0 = network error, timeout or unusable response. */
  status: number

  constructor(method: string, path: string, status: number) {
    const cleanPath = path.split('?')[0]
    super(`${method} ${cleanPath} -> ${status}`)
    this.name = 'PanelChatwootError'
    this.method = method
    this.path = cleanPath
    this.status = status
  }
}

export interface OperatorContact {
  chatwootContactId: number | null
  email: string | null
  phone: string | null
  /** meta.hmac_verified === true: the contact's identity was HMAC-verified by the widget. */
  verified: boolean
}

export type OperatorVerification =
  | { ok: true; agentId: number; contact: OperatorContact }
  | { ok: false; reason: 'invalid_token' | 'no_access' | 'not_found' | 'unavailable' | 'not_configured' }

const profileSchema = z.object({
  id: z.number(),
  accounts: z.array(z.object({ id: z.number() })),
})

const optionalString = z.string().nullish().catch(null)
const conversationSchema = z.object({
  id: z.number(),
  meta: z
    .object({
      sender: z
        .object({
          id: z.number().nullish().catch(null),
          email: optionalString,
          phone_number: optionalString,
        })
        .nullish()
        .catch(null),
      hmac_verified: z.boolean().nullish().catch(null),
    })
    .nullish()
    .catch(null),
})

/** GET <baseUrl><path> with the operator's token; resolves to the parsed JSON body or throws PanelChatwootError. */
async function chatwootGet(
  config: PanelChatwootConfig,
  path: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const method = 'GET'
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  // Race the timer explicitly so a fetch that ignores the abort signal cannot hang the invocation.
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new Error('timeout'))
    }, REQUEST_TIMEOUT_MS)
  })
  // The race loser must never surface as an unhandled rejection.
  timeout.catch(() => undefined)

  try {
    let status: number
    let text: string
    try {
      const res = await Promise.race([
        fetchImpl(`${config.baseUrl}${path}`, {
          method,
          headers: { Accept: 'application/json', [PANEL_CHATWOOT_AUTH_HEADER]: token },
          // Never follow a redirect: the token must not leave the instance.
          redirect: 'error',
          signal: controller.signal,
        }),
        timeout,
      ])
      status = res.status
      text = status >= 200 && status < 300 ? await Promise.race([res.text(), timeout]) : ''
    } catch {
      // Network error, timeout, refused redirect: no message is kept (it could hold the URL or token).
      throw new PanelChatwootError(method, path, 0)
    }
    if (timedOut) throw new PanelChatwootError(method, path, 0)
    if (status < 200 || status >= 300) throw new PanelChatwootError(method, path, status)
    try {
      return JSON.parse(text)
    } catch {
      // A 2xx that is not JSON is a broken proxy, not a Chatwoot answer.
      throw new PanelChatwootError(method, path, 0)
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function statusOf(err: unknown): number {
  return err instanceof PanelChatwootError ? err.status : 0
}

function cleanText(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

type ProfileResult = { ok: true; agentId: number } | { ok: false; reason: 'invalid_token' | 'no_access' | 'unavailable' }

/** One uncached GET /api/v1/profile; the agent must belong to the configured account. */
async function fetchProfile(
  config: PanelChatwootConfig,
  token: string,
  fetchImpl: typeof fetch,
): Promise<ProfileResult> {
  let body: unknown
  try {
    body = await chatwootGet(config, '/api/v1/profile', token, fetchImpl)
  } catch (err) {
    const status = statusOf(err)
    if (status === 401) return { ok: false, reason: 'invalid_token' }
    if (status === 403) return { ok: false, reason: 'no_access' }
    return { ok: false, reason: 'unavailable' }
  }
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) return { ok: false, reason: 'unavailable' }
  const accountId = Number(config.accountId)
  if (!parsed.data.accounts.some((a) => a.id === accountId)) return { ok: false, reason: 'no_access' }
  return { ok: true, agentId: parsed.data.id }
}

export interface VerifyOperatorDeps {
  fetchImpl?: typeof fetch
  now?: () => number
  config?: PanelChatwootConfig | null
}

export async function verifyOperator(
  token: string,
  conversationId: number,
  deps: VerifyOperatorDeps = {},
): Promise<OperatorVerification> {
  if (!isPlausibleOperatorToken(token)) return { ok: false, reason: 'invalid_token' }
  if (!Number.isSafeInteger(conversationId) || conversationId < 1 || conversationId > MAX_CONVERSATION_ID) {
    return { ok: false, reason: 'not_found' }
  }
  const config = deps.config !== undefined ? deps.config : loadPanelChatwootConfig()
  if (!config) return { ok: false, reason: 'not_configured' }
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch

  const profile = await fetchProfile(config, token, fetchImpl)
  if (!profile.ok) return profile

  let body: unknown
  try {
    body = await chatwootGet(
      config,
      `/api/v1/accounts/${config.accountId}/conversations/${conversationId}`,
      token,
      fetchImpl,
    )
  } catch (err) {
    const status = statusOf(err)
    if (status === 401 || status === 403) return { ok: false, reason: 'no_access' }
    if (status === 404) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: 'unavailable' }
  }

  const parsed = conversationSchema.safeParse(body)
  if (!parsed.success) return { ok: false, reason: 'unavailable' }
  if (parsed.data.id !== conversationId) return { ok: false, reason: 'no_access' }

  const sender = parsed.data.meta?.sender
  return {
    ok: true,
    agentId: profile.agentId,
    contact: {
      chatwootContactId: sender?.id ?? null,
      email: cleanText(sender?.email, EMAIL_MAX),
      phone: cleanText(sender?.phone_number, PHONE_MAX),
      verified: parsed.data.meta?.hmac_verified === true,
    },
  }
}

/** Test seam: the cache is added in the next step; kept so tests can reset module state. */
export function resetOperatorCacheForTests(): void {
  // no cache yet
}
