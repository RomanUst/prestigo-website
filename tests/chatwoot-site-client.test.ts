// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  classifyChatwootError,
  createSiteChatwootClient,
  loadSiteChatwootConfig,
  SiteChatwootError,
  type SiteChatwootConfig,
} from '@/lib/chatwoot-client'

const TOKEN = 'cw_agent_SECRET_0123456789'
const ADMIN = 'cw_admin_SECRET_9876543210'
const ENV = {
  CHATWOOT_BASE_URL: 'https://chat.example.test/',
  CHATWOOT_ACCOUNT_ID: '7',
  CHATWOOT_API_TOKEN: TOKEN,
  CHATWOOT_ADMIN_API_TOKEN: ADMIN,
}
const CONFIG: SiteChatwootConfig = { baseUrl: 'https://chat.example.test', accountId: '7', token: TOKEN, adminToken: ADMIN }

describe('loadSiteChatwootConfig', () => {
  it('reads the four variables and normalises the base URL to its origin', () => {
    expect(loadSiteChatwootConfig(ENV)).toEqual(CONFIG)
  })

  it('an http base URL is not configured', () => {
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_BASE_URL: 'http://chat.example.test' })).toBeNull()
  })

  it('a non-numeric account id is not configured', () => {
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_ACCOUNT_ID: 'abc' })).toBeNull()
  })

  it('a token with a newline (or any non-printable character) is not configured', () => {
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_API_TOKEN: `${TOKEN}\n` })).toBeNull()
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_API_TOKEN: 'tok en' })).toBeNull()
  })

  it('a missing variable is not configured and never throws', () => {
    expect(loadSiteChatwootConfig({})).toBeNull()
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_BASE_URL: 'not a url' })).toBeNull()
    expect(loadSiteChatwootConfig({ ...ENV, CHATWOOT_API_TOKEN: undefined })).toBeNull()
  })

  it('a missing or invalid admin token leaves adminToken null and the admin client unavailable', () => {
    const noAdmin = loadSiteChatwootConfig({ ...ENV, CHATWOOT_ADMIN_API_TOKEN: undefined })
    expect(noAdmin).toMatchObject({ token: TOKEN, adminToken: null })
    expect(createSiteChatwootClient({ config: noAdmin as SiteChatwootConfig, admin: true })).toBeNull()
    expect(createSiteChatwootClient({ config: noAdmin as SiteChatwootConfig })).not.toBeNull()

    const badAdmin = loadSiteChatwootConfig({ ...ENV, CHATWOOT_ADMIN_API_TOKEN: 'bad token' })
    expect(badAdmin?.adminToken).toBeNull()
  })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createSiteChatwootClient', () => {
  it('sends the hyphenated api-access-token header to the account-scoped URL with redirect "error"', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = []
    const client = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, init })
        return json({ payload: [] })
      }) as unknown as typeof fetch,
    })

    await client?.post('/contacts/filter', { payload: [] })

    expect(seen[0].url).toBe('https://chat.example.test/api/v1/accounts/7/contacts/filter')
    const headers = seen[0].init.headers as Record<string, string>
    expect(headers['api-access-token']).toBe(TOKEN)
    expect(Object.keys(headers).some((h) => h.includes('_'))).toBe(false)
    expect(seen[0].init.redirect).toBe('error')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('the admin client uses the administrator token', async () => {
    let token = ''
    const client = createSiteChatwootClient({
      config: CONFIG,
      admin: true,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        token = (init.headers as Record<string, string>)['api-access-token']
        return json({})
      }) as unknown as typeof fetch,
    })
    await client?.post('/actions/contact_merge', { base_contact_id: 1, mergee_contact_id: 2 })
    expect(token).toBe(ADMIN)
  })

  it('a 301 response rejects (a redirect is never followed or trusted)', async () => {
    const client = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => new Response('', { status: 301, headers: { Location: 'https://evil.example.test/' } })) as unknown as typeof fetch,
    })
    await expect(client?.get('/contacts/1')).rejects.toMatchObject({ name: 'SiteChatwootError', status: 301 })
  })

  it('a fetch that refuses the redirect itself is a network error', async () => {
    const client = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => {
        throw new TypeError('redirect mode is set to error')
      }) as unknown as typeof fetch,
    })
    await expect(client?.get('/contacts/1')).rejects.toMatchObject({ status: 0, code: 'cw_network' })
  })

  it('a stalled fetch rejects with cw_timeout after the timeout', async () => {
    const client = createSiteChatwootClient({
      config: CONFIG,
      timeoutMs: 30,
      fetchImpl: (() => new Promise(() => undefined)) as unknown as typeof fetch,
    })
    const started = Date.now()
    await expect(client?.get('/contacts/1')).rejects.toMatchObject({ status: 0, code: 'cw_timeout' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('error text carries method and path without the query string, never a body or the token', async () => {
    const client = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => json({ message: `secret body ${TOKEN} person@x.test` }, 503)) as unknown as typeof fetch,
    })
    const err = await client?.get('/contacts/search?q=person@x.test').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SiteChatwootError)
    const e = err as SiteChatwootError
    expect(e.message).toBe('Chatwoot GET /contacts/search failed: HTTP 503')
    expect(e.path).toBe('/contacts/search')
    expect(e.code).toBe('cw_http_503')
    expect(`${e.message} ${e.stack ?? ''}`).not.toContain('person@x.test')
    expect(`${e.message} ${e.stack ?? ''}`).not.toContain(TOKEN)
  })

  it('a 2xx that is not JSON is treated as unreachable; an empty 2xx is null', async () => {
    const html = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => new Response('<html>proxy</html>', { status: 200 })) as unknown as typeof fetch,
    })
    await expect(html?.get('/contacts/1')).rejects.toMatchObject({ status: 0 })

    const empty = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => new Response('', { status: 200 })) as unknown as typeof fetch,
    })
    expect(await empty?.del('/contacts/1')).toBeNull()
  })

  it('a path that does not start with "/" is a programming error, not a request', async () => {
    let called = false
    const client = createSiteChatwootClient({
      config: CONFIG,
      fetchImpl: (async () => {
        called = true
        return json({})
      }) as unknown as typeof fetch,
    })
    await expect(client?.get('contacts/1')).rejects.toThrow('must start with "/"')
    expect(called).toBe(false)
  })
})

describe('classifyChatwootError', () => {
  const err = (method: string, status: number) => new SiteChatwootError(method, '/contacts/1', status)

  it('network, 429 and 5xx are transient', () => {
    expect(classifyChatwootError(err('GET', 0))).toBe('transient')
    expect(classifyChatwootError(err('GET', 429))).toBe('transient')
    expect(classifyChatwootError(err('GET', 503))).toBe('transient')
  })

  it('401 and 403 are auth', () => {
    expect(classifyChatwootError(err('GET', 401))).toBe('auth')
    expect(classifyChatwootError(err('POST', 403))).toBe('auth')
  })

  it('404 is not_found; a 422 is unprocessable except on DELETE (online contact: retry later)', () => {
    expect(classifyChatwootError(err('GET', 404))).toBe('not_found')
    expect(classifyChatwootError(err('PUT', 422))).toBe('unprocessable')
    expect(classifyChatwootError(err('POST', 422))).toBe('unprocessable')
    expect(classifyChatwootError(err('DELETE', 422))).toBe('transient')
  })

  it('anything else is permanent; a non-Chatwoot error counts as transient', () => {
    expect(classifyChatwootError(err('POST', 400))).toBe('permanent')
    expect(classifyChatwootError(err('GET', 301))).toBe('permanent')
    expect(classifyChatwootError(new Error('x'))).toBe('transient')
  })
})
