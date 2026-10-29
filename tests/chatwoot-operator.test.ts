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
  operatorCacheKeysForTests,
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

describe('verifyOperator: hashed positive profile cache (D-02)', () => {
  it('caches the profile 5 minutes but always re-reads the conversation', async () => {
    let t = 1_000_000
    const now = () => t
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    const deps = { fetchImpl: stub.fetchImpl, config: CONFIG, now }

    expect((await verifyOperator(TOKEN, 42, deps)).ok).toBe(true)
    expect((await verifyOperator(TOKEN, 42, deps)).ok).toBe(true)
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(1)
    expect(stub.calls.filter((c) => c.path === CONV_PATH)).toHaveLength(2)

    t += 5 * 60_000 + 1
    expect((await verifyOperator(TOKEN, 42, deps)).ok).toBe(true)
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(2)
  })

  it('is still fresh just inside the TTL', async () => {
    let t = 0
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    const deps = { fetchImpl: stub.fetchImpl, config: CONFIG, now: () => t }
    await verifyOperator(TOKEN, 42, deps)
    t = 5 * 60_000 - 1
    await verifyOperator(TOKEN, 42, deps)
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(1)
  })

  it('never holds more than 500 entries, evicting the oldest, and keys are sha256 hex, not the token', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() })
    const deps = { fetchImpl: stub.fetchImpl, config: CONFIG, now: () => 1 }
    for (let i = 0; i < 501; i++) {
      await verifyOperator(`fake-token-${i}`, 42, deps)
    }
    const keys = operatorCacheKeysForTests()
    expect(keys).toHaveLength(500)
    for (const key of keys) {
      expect(key).toMatch(/^[0-9a-f]{64}$/)
      expect(key.startsWith('fake-token-')).toBe(false)
    }
    // The oldest token (0) was evicted: it needs a fresh profile call; the newest (500) is still cached.
    const before = stub.calls.filter((c) => c.path === PROFILE_PATH).length
    await verifyOperator('fake-token-500', 42, deps)
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(before)
    await verifyOperator('fake-token-0', 42, deps)
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(before + 1)
  })

  it('never caches a failure: profile 401 then 200 for the same token succeeds', async () => {
    let n = 0
    const stub = makeStub({
      [PROFILE_PATH]: () => (n++ === 0 ? json({ error: 'nope' }, 401) : goodProfile()),
      [CONV_PATH]: goodConversation(),
    })
    const deps = { fetchImpl: stub.fetchImpl, config: CONFIG }
    expect(await verifyOperator(TOKEN, 42, deps)).toEqual({ ok: false, reason: 'invalid_token' })
    expect((await verifyOperator(TOKEN, 42, deps)).ok).toBe(true)
  })
})

describe('verifyOperator: revocation re-check (D-01)', () => {
  /** Warm the cache, then make the conversation deny. */
  async function warm(conversationStatus: number, recheckProfile: Handler | Response) {
    let phase: 'warm' | 'denied' = 'warm'
    let profileCalls = 0
    const stub = makeStub({
      [PROFILE_PATH]: (u, i) => {
        profileCalls++
        if (phase === 'warm') return goodProfile()
        return typeof recheckProfile === 'function' ? recheckProfile(u, i) : recheckProfile.clone()
      },
      [CONV_PATH]: () => (phase === 'warm' ? goodConversation() : json({ error: 'x' }, conversationStatus)),
    })
    const deps = { fetchImpl: stub.fetchImpl, config: CONFIG, now: () => 1 }
    expect((await verifyOperator(TOKEN, 42, deps)).ok).toBe(true)
    phase = 'denied'
    return { stub, deps, profileCalls: () => profileCalls }
  }

  it('cached profile + conversation 401 -> one uncached re-check; re-check 401 -> invalid_token and eviction', async () => {
    const { deps, profileCalls } = await warm(401, json({ error: 'no' }, 401))
    expect(await verifyOperator(TOKEN, 42, deps)).toEqual({ ok: false, reason: 'invalid_token' })
    expect(profileCalls()).toBe(2)
    expect(operatorCacheKeysForTests()).toHaveLength(0)
  })

  it('cached profile + conversation 403 -> re-check 200 -> no_access', async () => {
    const { deps, profileCalls } = await warm(403, goodProfile())
    expect(await verifyOperator(TOKEN, 42, deps)).toEqual({ ok: false, reason: 'no_access' })
    expect(profileCalls()).toBe(2)
  })

  it('re-check profile without the configured account -> no_access', async () => {
    const { deps } = await warm(401, json({ id: 7, accounts: [{ id: 9 }] }))
    expect(await verifyOperator(TOKEN, 42, deps)).toEqual({ ok: false, reason: 'no_access' })
  })

  it('re-check network trouble -> unavailable', async () => {
    const { deps } = await warm(401, json({}, 503))
    expect(await verifyOperator(TOKEN, 42, deps)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a fresh (uncached) profile plus conversation 401 runs no extra re-check', async () => {
    const stub = makeStub({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: json({}, 401) })
    const result = await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
    expect(result).toEqual({ ok: false, reason: 'no_access' })
    expect(stub.calls.filter((c) => c.path === PROFILE_PATH)).toHaveLength(1)
  })
})

describe('verifyOperator: failure matrix', () => {
  const run = (routes: Record<string, Handler | Response>) => {
    const stub = makeStub(routes)
    return verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG })
  }

  it('profile 401 -> invalid_token', async () => {
    expect(await run({ [PROFILE_PATH]: json({}, 401) })).toEqual({ ok: false, reason: 'invalid_token' })
  })

  it('profile without account 3 -> no_access', async () => {
    expect(await run({ [PROFILE_PATH]: json({ id: 7, accounts: [{ id: 4 }] }) })).toEqual({ ok: false, reason: 'no_access' })
  })

  it('profile body failing the schema -> unavailable', async () => {
    expect(await run({ [PROFILE_PATH]: json({ id: 'seven' }) })).toEqual({ ok: false, reason: 'unavailable' })
    expect(await run({ [PROFILE_PATH]: json({ id: 7 }) })).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('profile 429 / 503 -> unavailable', async () => {
    expect(await run({ [PROFILE_PATH]: json({}, 429) })).toEqual({ ok: false, reason: 'unavailable' })
    expect(await run({ [PROFILE_PATH]: json({}, 503) })).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('conversation 403 -> no_access, 404 -> not_found, 429 and 503 -> unavailable', async () => {
    const withConv = (status: number) => run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: json({}, status) })
    expect(await withConv(403)).toEqual({ ok: false, reason: 'no_access' })
    expect(await withConv(404)).toEqual({ ok: false, reason: 'not_found' })
    expect(await withConv(429)).toEqual({ ok: false, reason: 'unavailable' })
    expect(await withConv(503)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a rejecting fetch (network) -> unavailable', async () => {
    const result = await run({
      [PROFILE_PATH]: goodProfile(),
      [CONV_PATH]: () => {
        throw new TypeError('connect ECONNREFUSED')
      },
    })
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a redirect status -> unavailable', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: 'https://evil.test/' } })
    expect(await run({ [PROFILE_PATH]: redirect })).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a non-JSON 200 -> unavailable', async () => {
    expect(await run({ [PROFILE_PATH]: new Response('<html>', { status: 200 }) })).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('a conversation whose id differs from the requested id -> no_access', async () => {
    const other = json({ id: 43, meta: { sender: { id: 1, email: 'a@b.test' } } })
    expect(await run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: other })).toEqual({ ok: false, reason: 'no_access' })
  })

  it('a contact with neither email nor phone -> ok with null email and phone; hmac missing or false -> verified false', async () => {
    const bare = json({ id: 42, meta: { sender: { id: 5, email: '  ', phone_number: null } } })
    expect(await run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: bare })).toEqual({
      ok: true,
      agentId: 7,
      contact: { chatwootContactId: 5, email: null, phone: null, verified: false },
    })
    const noMeta = json({ id: 42 })
    expect(await run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: noMeta })).toEqual({
      ok: true,
      agentId: 7,
      contact: { chatwootContactId: null, email: null, phone: null, verified: false },
    })
    const falsy = json({ id: 42, meta: { sender: { id: 5, email: 'a@b.test' }, hmac_verified: false } })
    const r2 = await run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: falsy })
    expect(r2.ok && r2.contact.verified).toBe(false)
  })

  it('caps email at 254 and phone at 32 characters', async () => {
    const long = json({ id: 42, meta: { sender: { id: 5, email: 'e'.repeat(300), phone_number: '1'.repeat(60) } } })
    const result = await run({ [PROFILE_PATH]: goodProfile(), [CONV_PATH]: long })
    expect(result.ok && result.contact.email?.length).toBe(254)
    expect(result.ok && result.contact.phone?.length).toBe(32)
  })
})

describe('verifyOperator: timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a fetch that never resolves -> unavailable within the 4000 ms timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = (() => new Promise(() => undefined)) as unknown as typeof fetch
    const pending = verifyOperator(TOKEN, 42, { fetchImpl, config: CONFIG })
    await vi.advanceTimersByTimeAsync(4001)
    expect(await pending).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('verifyOperator: the token never leaks', () => {
  it('no outcome and no error text contains the token, a header name or a response body', async () => {
    const SECRET_BODY = 'SECRET-RESPONSE-BODY-TEXT'
    const scenarios: Array<Record<string, Handler | Response>> = [
      { [PROFILE_PATH]: json({ error: SECRET_BODY }, 401) },
      { [PROFILE_PATH]: json({ error: SECRET_BODY }, 503) },
      { [PROFILE_PATH]: goodProfile(), [CONV_PATH]: json({ error: SECRET_BODY }, 403) },
      { [PROFILE_PATH]: goodProfile(), [CONV_PATH]: json({ error: SECRET_BODY }, 404) },
      {
        [PROFILE_PATH]: goodProfile(),
        [CONV_PATH]: () => {
          throw new Error(`connect failed with ${TOKEN} ${SECRET_BODY}`)
        },
      },
      { [PROFILE_PATH]: goodProfile(), [CONV_PATH]: goodConversation() },
    ]
    for (const routes of scenarios) {
      const stub = makeStub(routes)
      let text: string
      try {
        text = JSON.stringify(await verifyOperator(TOKEN, 42, { fetchImpl: stub.fetchImpl, config: CONFIG }))
      } catch (err) {
        text = String((err as Error)?.message)
      }
      expect(text).not.toContain(TOKEN)
      expect(text).not.toContain(SECRET_BODY)
      expect(text).not.toContain('api-access-token')
    }
    const err = new PanelChatwootError('GET', '/api/v1/profile?x=1', 401)
    expect(err.message).not.toContain(TOKEN)
    expect(err.message).not.toContain('?')
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
