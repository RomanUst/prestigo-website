// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  loadSiteEspoConfig,
  createSiteEspoClient,
  classifyEspoError,
  SiteEspoError,
} from '@/lib/espocrm-client'

const API_KEY = 'key_SECRET_abcdef0123'
const CONFIG = { baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null }

const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

async function catchErr(p: Promise<unknown>): Promise<SiteEspoError> {
  try {
    await p
  } catch (e) {
    return e as SiteEspoError
  }
  throw new Error('expected a rejection')
}

describe('loadSiteEspoConfig', () => {
  const base = { ESPOCRM_BASE_URL: 'https://crm.example.test/', ESPOCRM_API_KEY: API_KEY }

  it('returns origin, key and a null assignee by default', () => {
    expect(loadSiteEspoConfig(base)).toEqual({ baseUrl: 'https://crm.example.test', apiKey: API_KEY, leadAssigneeId: null })
  })

  it('accepts a 17-char lowercase hex assignee only', () => {
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_LEAD_ASSIGNEE_ID: 'a1b2c3d4e5f6a7b8c' })?.leadAssigneeId).toBe(
      'a1b2c3d4e5f6a7b8c',
    )
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_LEAD_ASSIGNEE_ID: 'abc' })?.leadAssigneeId).toBeNull()
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_LEAD_ASSIGNEE_ID: 'A1B2C3D4E5F6A7B8C' })?.leadAssigneeId).toBeNull()
  })

  it('returns null for a missing, non-https or invalid URL', () => {
    expect(loadSiteEspoConfig({ ESPOCRM_API_KEY: API_KEY })).toBeNull()
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_BASE_URL: 'http://crm.example.test' })).toBeNull()
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_BASE_URL: 'not a url' })).toBeNull()
  })

  it('returns null for a missing key or a key outside printable ASCII', () => {
    expect(loadSiteEspoConfig({ ESPOCRM_BASE_URL: base.ESPOCRM_BASE_URL })).toBeNull()
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_API_KEY: 'has space' })).toBeNull()
    expect(loadSiteEspoConfig({ ...base, ESPOCRM_API_KEY: 'klyuchк' })).toBeNull()
  })
})

describe('createSiteEspoClient', () => {
  it('sends X-Api-Key, redirect error, a signal and passthrough headers', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ ok: true }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    await client.post('/Lead', { a: 1 }, { 'X-Skip-Duplicate-Check': 'true' })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://crm.example.test/api/v1/Lead')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers['X-Api-Key']).toBe(API_KEY)
    expect(init.headers['X-Skip-Duplicate-Check']).toBe('true')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('returns null for an empty body and omits Content-Type on GET', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(await client.get('/Lead/x')).toBeNull()
    const init = (fetchImpl.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1]
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('a fetch that never resolves ends as status 0 crm_unreachable after the timeout', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 20 })

    const err = await catchErr(client.get('/Lead'))

    expect(err).toBeInstanceOf(SiteEspoError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('crm_unreachable')
    expect(classifyEspoError(err)).toBe('transient')
  })

  it('a rejecting fetch (network error) is crm_unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const err = await catchErr(client.get('/Lead'))

    expect(err.status).toBe(0)
    expect(err.code).toBe('crm_unreachable')
  })

  it('a 500 is crm_500 and transient; 429 is transient', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const err = await catchErr(client.get('/Lead'))
    expect(err.status).toBe(500)
    expect(err.code).toBe('crm_500')
    expect(classifyEspoError(err)).toBe('transient')
    expect(classifyEspoError(new SiteEspoError('GET', '/Lead', 429))).toBe('transient')
  })

  it('error text never contains the API key, the query string or the response body', async () => {
    const fetchImpl = vi.fn(async () => new Response(`bad ${API_KEY} anna@example.com`, { status: 400 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const err = await catchErr(client.get('/Contact?where[0][value]=anna%40example.com'))

    for (const text of [String(err), err.message, err.stack ?? '', JSON.stringify(err)]) {
      expect(text).not.toContain(API_KEY)
      expect(text).not.toContain('anna')
      expect(text).not.toContain('where[0]')
    }
    expect(err.path).toBe('/Contact')
    expect(err.message).toContain('GET')
    expect(err.message).toContain('400')
  })

  it('the first 401 poisons the client: later calls fail crm_auth without fetching', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const first = await catchErr(client.get('/Lead'))
    const second = await catchErr(client.post('/Lead', {}))

    expect(first.code).toBe('crm_auth')
    expect(second.code).toBe('crm_auth')
    expect(second.status).toBe(401)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(classifyEspoError(first)).toBe('auth')
  })

  it('a 403 is crm_auth too and also stops further calls', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const first = await catchErr(client.get('/Lead'))
    await catchErr(client.get('/Lead'))

    expect(first.code).toBe('crm_auth')
    expect(classifyEspoError(first)).toBe('auth')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a non-JSON 2xx is treated as unreachable', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>bad gateway</html>', { status: 200 }))
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })

    const err = await catchErr(client.get('/Lead'))
    expect(err.status).toBe(0)
  })

  it('rejects a path that does not start with a slash', async () => {
    const fetchImpl = vi.fn()
    const client = createSiteEspoClient({ config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.get('Lead')).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('classifyEspoError', () => {
  it.each([
    [0, 'transient'],
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [409, 'conflict'],
    [400, 'permanent'],
    [422, 'permanent'],
  ])('status %i is %s', (status, expected) => {
    expect(classifyEspoError(new SiteEspoError('GET', '/x', status))).toBe(expected)
  })

  it('treats a non-SiteEspoError as transient (status 0)', () => {
    expect(classifyEspoError(new Error('x'))).toBe('transient')
  })
})
