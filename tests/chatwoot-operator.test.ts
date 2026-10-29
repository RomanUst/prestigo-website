// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Spy on readEnv so the config loader's env reads can be asserted by name.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return { ...actual, readEnv: vi.fn(actual.readEnv) }
})

import { readEnv } from '@/lib/env'
import {
  isPlausibleOperatorToken,
  loadPanelChatwootConfig,
  panelChatwootOrigin,
  PANEL_CHATWOOT_AUTH_HEADER,
  PanelChatwootError,
  resetOperatorCacheForTests,
  verifyOperator,
} from '@/lib/chatwoot-operator'

// Obviously fake token, passed as a value only.
const TOKEN = 'fake-operator-token-0123456789'
const CONFIG = { baseUrl: 'https://chat.example.test', accountId: '3' }
const PROFILE_PATH = '/api/v1/profile'
const CONV_PATH = '/api/v1/accounts/3/conversations/42'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
interface Call {
  url: string
  path: string
  init: RequestInit
}

/** Local fetch stub: routes by URL path, records every call. */
function makeStub(routes: Record<string, Handler | Response>) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    calls.push({ url, path, init })
    const route = routes[path]
    if (!route) return json({ error: 'not stubbed' }, 404)
    return typeof route === 'function' ? route(url, init) : route.clone()
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const goodProfile = () => json({ id: 7, accounts: [{ id: 3, name: 'Prestigo' }], access_token: 'LEAK-A', pubsub_token: 'LEAK-P' })
const goodConversation = () =>
  json({
    id: 42,
    account_id: 3,
    meta: {
      sender: {
        id: 99,
        email: ' Jane@Example.test ',
        phone_number: '+420700000001',
        identifier: 'LEAK-IDENT',
        custom_attributes: { secret: 'LEAK-ATTR' },
      },
      hmac_verified: true,
    },
    messages: [{ id: 1, content: 'LEAK-MESSAGE-BODY' }],
  })

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      collectKeys(v, out)
    }
  }
  return out
}

beforeEach(() => {
  resetOperatorCacheForTests()
})

describe('isPlausibleOperatorToken', () => {
  it('accepts 1..128 printable ASCII characters', () => {
    expect(isPlausibleOperatorToken('a')).toBe(true)
    expect(isPlausibleOperatorToken(TOKEN)).toBe(true)
    expect(isPlausibleOperatorToken('x'.repeat(128))).toBe(true)
  })

  it('rejects empty, whitespace, over-long, spaced and non-ASCII values', () => {
    for (const bad of ['', '   ', 'x'.repeat(129), 'has space', 'tok\tab', 'tok\nen', 'tökén', '令牌', 42, null, undefined, {}]) {
      expect(isPlausibleOperatorToken(bad), String(bad)).toBe(false)
    }
  })
})

describe('loadPanelChatwootConfig / panelChatwootOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the base URL (trailing slashes stripped) and the numeric account id', () => {
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://chat.example.test///')
    vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3')
    expect(loadPanelChatwootConfig()).toEqual({ baseUrl: 'https://chat.example.test', accountId: '3' })
    expect(panelChatwootOrigin()).toBe('https://chat.example.test')
  })

  it('an http base URL, a non-numeric account id or a missing value is not configured', () => {
    vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3')
    vi.stubEnv('CHATWOOT_BASE_URL', 'http://chat.example.test')
    expect(loadPanelChatwootConfig()).toBeNull()
    expect(panelChatwootOrigin()).toBeNull()

    vi.stubEnv('CHATWOOT_BASE_URL', 'https://chat.example.test')
    vi.stubEnv('CHATWOOT_ACCOUNT_ID', 'abc')
    expect(loadPanelChatwootConfig()).toBeNull()

    vi.stubEnv('CHATWOOT_BASE_URL', 'not a url')
    vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3')
    expect(loadPanelChatwootConfig()).toBeNull()

    vi.stubEnv('CHATWOOT_BASE_URL', '')
    expect(loadPanelChatwootConfig()).toBeNull()
  })

  it('never reads the site-wide API token variables', () => {
    vi.stubEnv('CHATWOOT_BASE_URL', 'https://chat.example.test')
    vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3')
    vi.mocked(readEnv).mockClear()
    loadPanelChatwootConfig()
    const names = vi.mocked(readEnv).mock.calls.map((c) => c[0])
    expect(names.sort()).toEqual(['CHATWOOT_ACCOUNT_ID', 'CHATWOOT_BASE_URL'])
  })
})

describe('PanelChatwootError', () => {
  it('carries method, path and status only', () => {
    const err = new PanelChatwootError('GET', '/api/v1/profile', 401)
    expect(err.message).toBe('GET /api/v1/profile -> 401')
    expect(err).toMatchObject({ method: 'GET', path: '/api/v1/profile', status: 401 })
  })

  it('drops a query string from the path', () => {
    expect(new PanelChatwootError('GET', '/x?token=abc', 500).path).toBe('/x')
  })
})

describe('verifyOperator: tracer happy path', () => {
  it('proves the agent and returns only the contact keys the lookup needs', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    const result = await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
    expect(result).toEqual({
      ok: true,
      agentId: 7,
      contact: { chatwootContactId: 99, email: 'Jane@Example.test', phone: '+420700000001', verified: true },
    })
  })

  it('calls the profile then exactly <base>/api/v1/accounts/3/conversations/42', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
    expect(stub.calls.map((c) => c.url)).toEqual([
      'https://chat.example.test/api/v1/profile',
      'https://chat.example.test/api/v1/accounts/3/conversations/42',
    ])
  })

  it('sends only the hyphenated api-access-token header, GET, redirect "error"', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
    expect(PANEL_CHATWOOT_AUTH_HEADER).toBe('api-access-token')
    for (const call of stub.calls) {
      const headers = call.init.headers as Record<string, string>
      expect(headers['api-access-token']).toBe(TOKEN)
      expect(Object.keys(headers).some((h) => h.includes('_'))).toBe(false)
      expect(call.init.method).toBe('GET')
      expect(call.init.redirect).toBe('error')
      expect(call.init.body).toBeUndefined()
    }
  })

  it('returns no message bodies, custom attributes or tokens (deep key scan and value scan)', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    const result = await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
    const keys = collectKeys(result)
    for (const forbidden of ['messages', 'content', 'custom_attributes', 'access_token', 'pubsub_token', 'identifier']) {
      expect(keys.has(forbidden), forbidden).toBe(false)
    }
    const text = JSON.stringify(result)
    for (const leak of ['LEAK-A', 'LEAK-P', 'LEAK-IDENT', 'LEAK-ATTR', 'LEAK-MESSAGE-BODY']) {
      expect(text).not.toContain(leak)
    }
  })
})

describe('verifyOperator: configuration and input gates', () => {
  it('config null -> not_configured, no network call', async () => {
    const stub = makeStub({})
    const result = await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: null })
    expect(result).toEqual({ ok: false, reason: 'not_configured' })
    expect(stub.calls).toHaveLength(0)
  })

  it('a malformed token -> invalid_token, no network call', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    for (const bad of ['', '   ', 'x'.repeat(129), 'has space', 'tökén']) {
      const result = await verifyOperator(bad, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
      expect(result, JSON.stringify(bad)).toEqual({ ok: false, reason: 'invalid_token' })
    }
    expect(stub.calls).toHaveLength(0)
  })

  it('an invalid conversation id never reaches the network (no path interpolation)', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    for (const bad of [0, -1, 1.5, NaN, Infinity, 2 ** 31, Number.MAX_SAFE_INTEGER + 1, '42' as unknown as number]) {
      const result = await verifyOperator(TOKEN, bad, { fetchImpl: stub.fetchImpl, config: CONFIG })
      expect(result.ok, String(bad)).toBe(false)
    }
    expect(stub.calls).toHaveLength(0)
  })
})
