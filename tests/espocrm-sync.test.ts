// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 80, Plan 01 - EspoCRM config-as-code client + sync engine + settings
 * resource, proven against the in-memory fake. No test here makes a network call
 * or reads a real credential.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EspoApiError,
  EspoConfigError,
  createEspoClient,
  loadEspoConfig,
} from '../infra/espocrm/lib/client.mjs'
import { parseArgs, runSync } from '../infra/espocrm/sync.mjs'
import { createFakeEspoCRM } from './helpers/fake-espocrm'

const PASSWORD = 'pw_SECRET_0123456789'
const API_KEY = 'key_SECRET_abcdef0123'
const BASE = 'https://crm.example.test'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const settingsConfig = JSON.parse(readFileSync(join(REPO_ROOT, 'infra/espocrm/settings.json'), 'utf8'))
const DECLARED_KEYS = Object.keys(settingsConfig.settings).sort()

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

const adminConfig = () =>
  loadEspoConfig({
    identity: 'admin',
    env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'prestigo-config', ESPOCRM_ADMIN_PASSWORD: PASSWORD },
  })

const apiKeyConfig = () =>
  loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY } })

const adminClient = (fake: ReturnType<typeof createFakeEspoCRM>, extra: Record<string, unknown> = {}) =>
  createEspoClient({ config: adminConfig(), fetchImpl: fake.fetchImpl as any, ...extra })

async function sync(fake: ReturnType<typeof createFakeEspoCRM>, opts: { only?: string[]; dryRun?: boolean } = {}) {
  const lines: string[] = []
  await runSync({ client: adminClient(fake), log: (l) => lines.push(l), ...opts })
  return lines
}

describe('loadEspoConfig', () => {
  it('admin: reads env first, then the file; a missing key is named without any value', () => {
    const fromEnv = loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'u', ESPOCRM_ADMIN_PASSWORD: 'p' },
      readFile: () => {
        throw new Error('file must not be read when env is complete')
      },
    })
    expect(fromEnv).toEqual({ identity: 'admin', baseUrl: BASE, user: 'u', password: 'p' })

    const fromFile = loadEspoConfig({
      identity: 'admin',
      env: { ESPOCRM_ADMIN_PASSWORD: 'env-wins' },
      readFile: () => `ESPOCRM_BASE_URL=${BASE}\nESPOCRM_ADMIN_USER=file-user\nESPOCRM_ADMIN_PASSWORD=file-pass\n`,
    })
    expect(fromFile.user).toBe('file-user')
    expect(fromFile.password).toBe('env-wins')

    let message = ''
    try {
      loadEspoConfig({
        identity: 'admin',
        env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_ADMIN_USER: 'u' },
        readFile: () => null,
      })
    } catch (e) {
      expect(e).toBeInstanceOf(EspoConfigError)
      message = (e as Error).message
    }
    expect(message).toContain('ESPOCRM_ADMIN_PASSWORD')
    expect(message).not.toContain(BASE)
  })

  it('rejects a non-https base url', () => {
    expect(() =>
      loadEspoConfig({
        identity: 'admin',
        env: { ESPOCRM_BASE_URL: 'http://crm.example.test', ESPOCRM_ADMIN_USER: 'u', ESPOCRM_ADMIN_PASSWORD: 'p' },
      }),
    ).toThrow(/https/)
  })

  it('apikey: needs only the base url and the api key', () => {
    const config = loadEspoConfig({
      identity: 'apikey',
      env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY },
      readFile: () => {
        throw new Error('file must not be read when env is complete')
      },
    })
    expect(config).toEqual({ identity: 'apikey', baseUrl: BASE, apiKey: API_KEY })
  })
})

describe('client', () => {
  it('admin: one password exchange, then base64(user:token) with Espo-Authorization-By-Token; the password is never sent twice', async () => {
    const fake = createFakeEspoCRM()
    const client = adminClient(fake)
    await client.request('GET', '/Settings')
    await client.request('GET', '/Settings')

    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /App/user', 'GET /Settings', 'GET /Settings'])
    expect(fake.state.logins).toBe(1)

    const [exchange, ...rest] = fake.requests
    expect(exchange.headers['espo-authorization']).toBe(b64(`prestigo-config:${PASSWORD}`))
    expect(exchange.headers['espo-authorization-by-token']).toBeUndefined()

    const token = [...fake.state.tokens.keys()][0]
    for (const req of rest) {
      expect(req.headers['espo-authorization']).toBe(b64(`prestigo-config:${token}`))
      expect(req.headers['espo-authorization-by-token']).toBe('true')
    }
    expect(fake.requests.filter((r) => r.headers['espo-authorization'] === exchange.headers['espo-authorization'])).toHaveLength(1)
  })

  it('apikey: sends X-Api-Key and never Espo-Authorization', async () => {
    const fake = createFakeEspoCRM()
    const client = createEspoClient({ config: apiKeyConfig(), fetchImpl: fake.fetchImpl as any })
    await client.request('GET', '/Settings')
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0].headers['x-api-key']).toBe(API_KEY)
    expect(fake.requests[0].headers['espo-authorization']).toBeUndefined()
  })

  it('apikey: admin-only endpoints answer 403 (the fake mirrors the real ACL split)', async () => {
    const fake = createFakeEspoCRM()
    const client = createEspoClient({ config: apiKeyConfig(), fetchImpl: fake.fetchImpl as any })
    const err = await client.request('PUT', '/Settings', { timeZone: 'UTC' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EspoApiError)
    expect((err as EspoApiError).status).toBe(403)
  })

  it('always passes redirect error and a timeout signal', async () => {
    const seen: any[] = []
    const fetchImpl = async (_url: string, init: any) => {
      seen.push(init)
      return new Response(JSON.stringify({ token: 'tok_SECRET_x' }), { status: 200 })
    }
    await adminClient({ fetchImpl } as any).request('GET', '/Settings')
    expect(seen.length).toBe(2)
    for (const init of seen) {
      expect(init.redirect).toBe('error')
      expect(init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('a stalled request rejects with a timed-out EspoApiError', async () => {
    const fake = createFakeEspoCRM({ stallPaths: ['/Settings'] })
    const client = adminClient(fake, { timeoutMs: 40 })
    const err = await client.request('GET', '/Settings').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EspoApiError)
    expect((err as Error).message).toMatch(/timed out/)
  })

  it('a 401 aborts after one request; the next request throws without calling fetch', async () => {
    const fake = createFakeEspoCRM({ adminPassword: 'a-different-password' })
    const client = adminClient(fake)
    const first = await client.request('GET', '/Settings').catch((e: unknown) => e)
    expect(first).toBeInstanceOf(EspoApiError)
    expect((first as EspoApiError).status).toBe(401)
    expect(fake.requests).toHaveLength(1)

    const second = await client.request('GET', '/Settings').catch((e: unknown) => e)
    expect(second).toBeInstanceOf(EspoApiError)
    expect((second as EspoApiError).status).toBe(401)
    expect((second as Error).message).toMatch(/aborted after earlier 401/)
    expect(fake.requests).toHaveLength(1)
  })

  it('a 401 on a later token call also poisons the client', async () => {
    const fake = createFakeEspoCRM()
    const client = adminClient(fake)
    await client.request('GET', '/Settings')
    fake.state.tokens.clear() // token revoked server-side
    const err = await client.request('GET', '/Settings').catch((e: unknown) => e)
    expect((err as EspoApiError).status).toBe(401)
    const before = fake.requests.length
    await client.request('GET', '/Settings').catch(() => {})
    expect(fake.requests).toHaveLength(before)
    expect(fake.state.logins).toBe(1)
  })

  it('error messages carry method, path and status but never the password, token, api key or their base64 forms', async () => {
    const fake = createFakeEspoCRM()
    const echo = async (url: string, init: any) => {
      if (String(url).endsWith('/App/user')) return fake.fetchImpl(url, init)
      const auth = init.headers['Espo-Authorization'] as string
      // A hostile server body echoing every secret the client holds.
      const token = [...fake.state.tokens.keys()][0]
      return new Response(
        JSON.stringify({ error: `bad ${PASSWORD} ${token} ${API_KEY} ${auth} ${b64(`prestigo-config:${PASSWORD}`)}`, token }),
        { status: 500 },
      )
    }
    const client = createEspoClient({ config: adminConfig(), fetchImpl: echo as any })
    const err = await client.request('POST', '/CBooking', { name: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EspoApiError)
    const message = (err as Error).message
    expect(message).toContain('POST')
    expect(message).toContain('/CBooking')
    expect(message).toContain('500')
    const token = [...fake.state.tokens.keys()][0]
    for (const secret of [PASSWORD, token, b64(`prestigo-config:${PASSWORD}`), b64(`prestigo-config:${token}`)]) {
      expect(message).not.toContain(secret)
    }
  })

  it('apikey: an echoed api key never reaches an error message', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: `bad key ${API_KEY}` }), { status: 500 })
    const client = createEspoClient({ config: apiKeyConfig(), fetchImpl: fetchImpl as any })
    const err = await client.request('GET', '/Contact').catch((e: unknown) => e)
    expect((err as Error).message).toContain('500')
    expect((err as Error).message).not.toContain(API_KEY)
  })

  it('a failed exchange error does not leak the password or its base64', async () => {
    const fetchImpl = async () => new Response(`denied ${PASSWORD} ${b64(`prestigo-config:${PASSWORD}`)}`, { status: 401 })
    const client = createEspoClient({ config: adminConfig(), fetchImpl: fetchImpl as any })
    const err = await client.request('GET', '/Settings').catch((e: unknown) => e)
    const message = (err as Error).message
    expect(message).not.toContain(PASSWORD)
    expect(message).not.toContain(b64(`prestigo-config:${PASSWORD}`))
  })

  it('runs requests started together strictly one after the other', async () => {
    const fake = createFakeEspoCRM()
    const client = adminClient(fake)
    await Promise.all([client.request('GET', '/Settings'), client.request('GET', '/Settings'), client.request('GET', '/Settings')])
    expect(fake.requests).toHaveLength(4)
    expect(fake.maxInFlight()).toBe(1)
  })
})

describe('runSync settings (tracer)', () => {
  it('updates drifted settings with exactly the declared keys, then a second run is unchanged', async () => {
    const fake = createFakeEspoCRM({
      settings: {
        defaultCurrency: 'USD',
        baseCurrency: 'USD',
        currencyList: ['USD'],
        timeZone: 'UTC',
        weekStart: 0,
        b2cMode: true,
        outboundEmailFromAddress: 'phase76@example.test',
        siteUrl: 'https://crm.example.test',
        auth2FA: true,
      },
    })

    const first = await sync(fake, { only: ['settings'] })
    expect(first).toContain('settings: create=0 update=1 unchanged=0 skipped=0 removed=0')
    expect(first).toContain('summary: create=0 update=1 removed=0')

    const puts = fake.requests.filter((r) => r.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0].path).toBe('/Settings')
    expect(Object.keys(puts[0].body).sort()).toEqual(DECLARED_KEYS)

    expect(fake.state.settings.defaultCurrency).toBe('EUR')
    expect(fake.state.settings.timeZone).toBe('Europe/Prague')
    // Phase 76 keys survive untouched.
    expect(fake.state.settings.outboundEmailFromAddress).toBe('phase76@example.test')
    expect(fake.state.settings.siteUrl).toBe('https://crm.example.test')
    expect(fake.state.settings.auth2FA).toBe(true)

    const second = await sync(fake, { only: ['settings'] })
    expect(second).toContain('settings: create=0 update=0 unchanged=1 skipped=0 removed=0')
    expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(1)
  })

  it('--dry-run sends only GET requests but still reports the plan', async () => {
    const fake = createFakeEspoCRM({ settings: { defaultCurrency: 'USD' } })
    const lines = await sync(fake, { dryRun: true })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(lines).toContain('settings: create=0 update=1 unchanged=0 skipped=0 removed=0')
    expect(fake.state.settings.defaultCurrency).toBe('USD')
  })

  it('rejects an unknown --only resource', async () => {
    const fake = createFakeEspoCRM()
    await expect(runSync({ client: adminClient(fake), only: ['nope'], log: () => {} })).rejects.toThrow(/Unknown resource/)
  })

  it('refuses a settings.json that declares Phase 76 keys', async () => {
    const fake = createFakeEspoCRM()
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'espocrm-cfg-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ settings: { smtpServer: 'x', timeZone: 'UTC' } }))
    await expect(
      runSync({ client: adminClient(fake), only: ['settings'], log: () => {}, configDir: dir }),
    ).rejects.toThrow(EspoConfigError)
    expect(fake.requests).toHaveLength(0)
  })

  it('settings.json declares exactly the six expected keys', () => {
    expect(DECLARED_KEYS).toEqual(['b2cMode', 'baseCurrency', 'currencyList', 'defaultCurrency', 'timeZone', 'weekStart'])
    expect(settingsConfig.settings.defaultCurrency).toBe('EUR')
    expect(settingsConfig.settings.timeZone).toBe('Europe/Prague')
  })
})

describe('parseArgs', () => {
  it('accepts --dry-run and --only (both spellings)', () => {
    expect(parseArgs(['--dry-run', '--only', 'settings'])).toEqual({ dryRun: true, only: ['settings'] })
    expect(parseArgs(['--only=settings'])).toEqual({ dryRun: false, only: ['settings'] })
    expect(parseArgs([])).toEqual({ dryRun: false, only: [] })
  })

  it('rejects an unknown flag and an unknown --only name with EspoConfigError', () => {
    expect(() => parseArgs(['--force'])).toThrow(EspoConfigError)
    expect(() => parseArgs(['--only', 'nope'])).toThrow(EspoConfigError)
    expect(() => parseArgs(['--only'])).toThrow(EspoConfigError)
  })
})

describe('ignore rules and README (Task 3)', () => {
  const isIgnored = (path: string) => {
    try {
      execFileSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  it('ignores the PII working dir and env files but keeps config tracked', () => {
    expect(isIgnored('infra/espocrm/.work/export.json')).toBe(true)
    expect(isIgnored('infra/espocrm/espocrm-sync.env')).toBe(true)
    expect(isIgnored('infra/espocrm/settings.json')).toBe(false)
  })

  it('README documents identities, naming interface, ownership matrix and PII rule', () => {
    const readme = readFileSync(join(REPO_ROOT, 'infra/espocrm/README.md'), 'utf8')
    for (const needle of [
      'espocrm-config.env',
      'espocrm-sync.env',
      'prestigo-config',
      'prestigo-sync',
      'CBooking',
      'CPartnerRate',
      'supabaseBookingId',
      'cBookings',
      'cPartnerRates',
      'Field ownership matrix',
      'infra/espocrm/.work/',
    ]) {
      expect(readme, needle).toContain(needle)
    }
  })
})
