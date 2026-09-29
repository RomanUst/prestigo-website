// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 77, Plan 07 — Chatwoot config-as-code sync, proven against an in-memory
 * fake Chatwoot API. No test here makes a network call or reads a real token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChatwootApiError,
  createChatwootClient,
  loadChatwootConfig,
} from '../infra/chatwoot/lib/client.mjs'
import { planCollection, runSync } from '../infra/chatwoot/sync.mjs'

const FAKE_TOKEN = 'tok_SECRET_0123456789abcdef'
const BASE = 'https://chat.example.test'

type Req = { method: string; path: string; body: any; headers: Record<string, string> }

/** In-memory Chatwoot: state keyed by resource, every request recorded. */
function createFakeChatwoot() {
  const state = {
    labels: [] as any[],
  }
  const requests: Req[] = []
  let nextId = 1

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchImpl = async (url: string, init: any = {}) => {
    const method = (init.method ?? 'GET') as string
    const headers = (init.headers ?? {}) as Record<string, string>
    const parsed = new URL(url)
    const p = parsed.pathname.replace(/^\/api\/v1(\/accounts\/\d+)?/, '')
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    requests.push({ method, path: p + parsed.search, body, headers })

    if (headers['api-access-token'] !== FAKE_TOKEN) return json({ error: 'unauthorized' }, 401)

    let m: RegExpMatchArray | null
    if (method === 'GET' && p === '/labels') return json({ payload: state.labels })
    if (method === 'POST' && p === '/labels') {
      const row = { id: nextId++, ...body }
      state.labels.push(row)
      return json(row)
    }
    if (method === 'PATCH' && (m = p.match(/^\/labels\/(\d+)$/))) {
      const row = state.labels.find((l) => l.id === Number(m![1]))
      Object.assign(row, body)
      return json(row)
    }
    return json({ error: `unhandled ${method} ${p}` }, 404)
  }

  return { state, requests, fetchImpl }
}

function makeClient(fake: ReturnType<typeof createFakeChatwoot>) {
  return createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })
}

function collectLog() {
  const lines: string[] = []
  return { lines, log: (line: string) => lines.push(line) }
}

afterEach(() => vi.restoreAllMocks())

describe('planCollection', () => {
  const keyOf = (x: { k: string }) => x.k
  const differs = (a: any, b: any) => a.v !== b.v

  it('splits create / update / unchanged and ignores undesired existing items', () => {
    const plan = planCollection({
      desired: [{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'c', v: 3 }],
      existing: [{ k: 'a', v: 1 }, { k: 'b', v: 9 }, { k: 'zzz', v: 0 }],
      keyOf,
      differs,
    })
    expect(plan.create.map((x: any) => x.k)).toEqual(['c'])
    expect(plan.update.map((x: any) => x.desired.k)).toEqual(['b'])
    expect(plan.unchanged.map((x: any) => x.desired.k)).toEqual(['a'])
  })

  it('equal input twice yields empty create and update', () => {
    const items = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }]
    const plan = planCollection({ desired: items, existing: items, keyOf, differs })
    expect(plan.create).toEqual([])
    expect(plan.update).toEqual([])
    expect(plan.unchanged).toHaveLength(2)
  })
})

describe('client', () => {
  it('sends the hyphenated api-access-token header (underscore headers are dropped by the proxy) and never api_access_token', async () => {
    const fake = createFakeChatwoot()
    await makeClient(fake).request('GET', '/labels')
    const headers = fake.requests[0].headers
    expect(headers['api-access-token']).toBe(FAKE_TOKEN)
    expect(Object.keys(headers)).not.toContain('api_access_token')
  })

  it('ChatwootApiError message carries method, path and status but never the token', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: `bad token ${FAKE_TOKEN}` }), { status: 401 })
    const client = createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fetchImpl as any })
    const err = await client.request('POST', '/labels', { title: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChatwootApiError)
    const message = (err as Error).message
    expect(message).toContain('POST')
    expect(message).toContain('/labels')
    expect(message).toContain('401')
    expect(message).not.toContain(FAKE_TOKEN)
  })

  it('loadChatwootConfig reads env first, then the file, and rejects a non-https base url', () => {
    const fromEnv = loadChatwootConfig({
      env: { CHATWOOT_API_TOKEN: 't', CHATWOOT_BASE_URL: 'https://a.test', CHATWOOT_ACCOUNT_ID: '3' },
      readFile: () => {
        throw new Error('file must not be read when env is complete')
      },
    })
    expect(fromEnv).toEqual({ baseUrl: 'https://a.test', token: 't', accountId: '3' })

    const fromFile = loadChatwootConfig({
      env: {},
      readFile: () => 'CHATWOOT_API_TOKEN=abc\nCHATWOOT_BASE_URL=https://b.test\nCHATWOOT_ACCOUNT_ID=1\n',
    })
    expect(fromFile.baseUrl).toBe('https://b.test')

    expect(() =>
      loadChatwootConfig({
        env: { CHATWOOT_API_TOKEN: 'secret-value', CHATWOOT_BASE_URL: 'http://a.test', CHATWOOT_ACCOUNT_ID: '1' },
      }),
    ).toThrow(/https/)
    try {
      loadChatwootConfig({ env: {}, readFile: () => null })
    } catch (e) {
      expect((e as Error).message).not.toMatch(/secret-value/)
    }
  })
})

describe('runSync labels (tracer)', () => {
  it('creates 11 labels, then a second run reports create=0 update=0 unchanged=11', async () => {
    const fake = createFakeChatwoot()
    const first = collectLog()
    await runSync({ client: makeClient(fake), only: ['labels'], log: first.log })
    expect(first.lines).toContain('labels: create=11 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.labels).toHaveLength(11)

    const second = collectLog()
    await runSync({ client: makeClient(fake), only: ['labels'], log: second.log })
    expect(second.lines).toContain('labels: create=0 update=0 unchanged=11 skipped=0 deleted=0')
    expect(second.lines).toContain('summary: create=0 update=0 skipped=0')
  })

  it('updates a drifted label and leaves operator-made labels alone', async () => {
    const fake = createFakeChatwoot()
    await runSync({ client: makeClient(fake), only: ['labels'], log: () => {} })
    fake.state.labels.find((l) => l.title === 'payment').color = '#000000'
    fake.state.labels.push({ id: 900, title: 'operator-made', description: 'x', color: '#111111', show_on_sidebar: true })

    const run = collectLog()
    await runSync({ client: makeClient(fake), only: ['labels'], log: run.log })
    expect(run.lines).toContain('labels: create=0 update=1 unchanged=10 skipped=0 deleted=0')
    expect(fake.state.labels.find((l) => l.title === 'payment').color).toBe('#BFA06A')
    expect(fake.state.labels.find((l) => l.title === 'operator-made').color).toBe('#111111')
  })

  it('--dry-run issues only GET requests but still prints the plan', async () => {
    const fake = createFakeChatwoot()
    const run = collectLog()
    await runSync({ client: makeClient(fake), only: ['labels'], dryRun: true, log: run.log })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(run.lines).toContain('labels: create=11 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.labels).toHaveLength(0)
  })

  it('rejects an unknown --only resource', async () => {
    const fake = createFakeChatwoot()
    await expect(runSync({ client: makeClient(fake), only: ['nope'], log: () => {} })).rejects.toThrow(/Unknown resource/)
  })

  it('never writes the token to console output or the log lines', async () => {
    const fake = createFakeChatwoot()
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
    const run = collectLog()
    await runSync({ client: makeClient(fake), only: ['labels'], log: run.log })
    await runSync({ client: makeClient(fake), only: ['labels'], dryRun: true })
    const seen = [...run.lines, ...spies.flatMap((s) => s.mock.calls.flat().map(String))].join('\n')
    expect(seen).not.toContain(FAKE_TOKEN)
  })
})
