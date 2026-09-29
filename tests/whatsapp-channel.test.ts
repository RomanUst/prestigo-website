// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Chatwoot/Graph payloads are intentionally loose */
/**
 * Phase 78, Plan 09 — WhatsApp channel ops tool (--probe, --harden, --number,
 * --register, recovery levers), proven against an in-memory fake Chatwoot API +
 * fake webhook endpoint + fake Graph API. No test here makes a network call or
 * uses a real credential. Secrets are plain words; the fixture phone number is
 * synthetic (never a real Czech number).
 */
import { createHmac } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import {
  buildProbePayload,
  loadChannelMeta,
  mergeAppSecret,
  parseArgs,
  runChannel,
  signBody,
} from '../infra/chatwoot/whatsapp-channel.mjs'

const BASE = 'https://chat.test.example'
const CW_TOKEN = 'test-chatwoot-token'
const APP_SECRET = 'test-app-secret'
const OTHER_SECRET = 'test-other-secret'
const GRAPH_TOKEN = 'test-graph-token'
const API_KEY = 'test-wa-api-key-distinct'
const PHONE_ID = '555000111'
const WABA = '777888999'
const NINE = ['0', '0', '0', '1', '2', '3', '4', '5', '6'].join('')
const E164 = `+420${NINE}`
const PIN = '246810'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO_ROOT, 'infra/chatwoot/whatsapp-channel.mjs')

const META_ENV: Record<string, string> = {
  META_WA_SYSTEM_USER_TOKEN: GRAPH_TOKEN,
  META_WA_APP_SECRET: APP_SECRET,
  META_WA_WABA_ID: WABA,
  META_WA_PHONE_NUMBER_ID: PHONE_ID,
}

// ---------------------------------------------------------------------------
// Fake world: Chatwoot API + webhook endpoint + Graph API in one fetchImpl
// ---------------------------------------------------------------------------

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  init: any
}

function makeInbox(over: Record<string, any> = {}) {
  return {
    id: 7,
    name: 'WhatsApp',
    channel_type: 'Channel::Whatsapp',
    phone_number: E164,
    provider_config: {
      source: 'manual_setup_v2',
      api_key: API_KEY,
      phone_number_id: PHONE_ID,
      business_account_id: WABA,
    } as Record<string, any>,
    ...over,
  }
}

type PatchMode = 'accept' | 'reject' | 'drop_api_key' | 'change_source'

function makeWorld(inboxes: any[] = [makeInbox()]) {
  const world: any = {
    calls: [] as Call[],
    inboxes,
    patchMode: 'accept' as PatchMode,
    graph: {
      status: 'CONNECTED',
      code_verification_status: 'VERIFIED',
      platform_type: 'CLOUD_API',
      name_status: 'APPROVED',
      quality_rating: 'GREEN',
      messaging_limit_tier: 'TIER_250',
      display_phone_number: '+420 000 123 456',
      currency: 'EUR',
      wabaPhoneIds: [PHONE_ID],
      registerMode: 'ok' as 'ok' | 'fail',
    },
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  world.fetchImpl = async (input: any, init: any = {}) => {
    const url = String(input)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
    world.calls.push({ method: init.method ?? 'GET', url, headers, body: init.body, init })
    const method = init.method ?? 'GET'
    const inbox = world.inboxes[0]

    if (url.startsWith(`${BASE}/webhooks/whatsapp/`)) {
      const secret = inbox?.provider_config?.app_secret
      if (secret) {
        const expected = `sha256=${createHmac('sha256', secret).update(String(init.body)).digest('hex')}`
        if (headers['x-hub-signature-256'] !== expected) return json(401, { error: 'invalid signature' })
      }
      return json(200, { ok: true })
    }

    if (url.startsWith(`${BASE}/api/v1/accounts/1/inboxes`)) {
      if (headers['api-access-token'] !== CW_TOKEN) return json(401, { error: 'unauthorized' })
      const rest = url.slice(`${BASE}/api/v1/accounts/1/inboxes`.length)
      if (rest === '' && method === 'GET') {
        return json(
          200,
          { payload: world.inboxes.map((i: any) => ({ id: i.id, name: i.name, channel_type: i.channel_type, phone_number: i.phone_number })) },
        )
      }
      const m = rest.match(/^\/(\d+)(\/[a-z_]+)?$/)
      const target = m ? world.inboxes.find((i: any) => String(i.id) === m[1]) : null
      if (!target) return json(404, { error: 'not found' })
      if (!m![2] && method === 'GET') return json(200, structuredClone(target))
      if (!m![2] && method === 'PATCH') {
        const sent = JSON.parse(String(init.body)).channel.provider_config
        if (world.patchMode === 'reject') {
          return json(422, { error: 'invalid provider config', echoed: { api_key: target.provider_config.api_key, app_secret: sent.app_secret }, provider_config: JSON.stringify(sent) })
        }
        const stored = structuredClone(sent)
        if (world.patchMode === 'drop_api_key') delete stored.api_key
        if (world.patchMode === 'change_source') stored.source = 'embedded_signup'
        target.provider_config = stored
        return json(200, structuredClone(target))
      }
      if (m![2] === '/sync_templates' && method === 'POST') return json(200, {})
      if (m![2] === '/register_webhook' && method === 'POST') return json(200, {})
      return json(404, { error: 'not found' })
    }

    if (url.startsWith('https://graph.facebook.com/v25.0/')) {
      if (headers.authorization !== `Bearer ${GRAPH_TOKEN}`) return json(401, { error: { message: 'bad token', code: 190 } })
      const rest = url.slice('https://graph.facebook.com/v25.0'.length)
      const g = world.graph
      if (rest.startsWith(`/${PHONE_ID}/register`) && method === 'POST') {
        if (g.registerMode === 'fail') return json(400, { error: { message: `bad request pin ${JSON.parse(String(init.body)).pin}`, code: 100 } })
        g.status = 'CONNECTED'
        return json(200, { success: true })
      }
      if (rest.startsWith(`/${PHONE_ID}?`) && method === 'GET') {
        return json(200, {
          id: PHONE_ID,
          status: g.status,
          code_verification_status: g.code_verification_status,
          platform_type: g.platform_type,
          name_status: g.name_status,
          quality_rating: g.quality_rating,
          messaging_limit_tier: g.messaging_limit_tier,
          display_phone_number: g.display_phone_number,
        })
      }
      if (rest.startsWith(`/${WABA}/phone_numbers`) && method === 'GET') return json(200, { data: g.wabaPhoneIds.map((id: string) => ({ id })) })
      if (rest.startsWith(`/${WABA}?`) && method === 'GET') return json(200, { id: WABA, currency: g.currency })
      return json(404, { error: { message: 'unknown object', code: 100 } })
    }
    return json(404, { error: 'unrouted' })
  }
  return world
}

function chatwootFor(world: any) {
  return createChatwootClient({ baseUrl: BASE, token: CW_TOKEN, accountId: '1', fetchImpl: world.fetchImpl })
}

function makePrompt(answers: string[]) {
  const questions: string[] = []
  const prompt = async (question: string) => {
    questions.push(question)
    return answers.shift() ?? ''
  }
  return { prompt, questions }
}

async function run(argv: string[], world: any, over: Record<string, any> = {}, metaEnv: Record<string, string> = META_ENV) {
  const out: string[] = []
  const err: string[] = []
  const code = await runChannel(parseArgs(argv), {
    chatwoot: chatwootFor(world),
    baseUrl: BASE,
    fetchImpl: world.fetchImpl,
    loadMeta: (required: string[]) => loadChannelMeta(required, { env: metaEnv, readFile: () => null }),
    secrets: [CW_TOKEN],
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    isTTY: true,
    ...over,
  })
  return { code, out, err, all: [...out, ...err].join('\n') }
}

const webhookCalls = (world: any): Call[] => world.calls.filter((c: Call) => c.url.startsWith(`${BASE}/webhooks/`))
const patchCalls = (world: any): Call[] => world.calls.filter((c: Call) => c.method === 'PATCH')

// ---------------------------------------------------------------------------
// Task 1 (tracer): --probe
// ---------------------------------------------------------------------------

describe('signBody / buildProbePayload', () => {
  it('signBody equals sha256= + HMAC-SHA256 hex over exactly the posted bytes', async () => {
    const world = makeWorld([makeInbox({ provider_config: { source: 'manual_setup_v2', api_key: API_KEY, phone_number_id: PHONE_ID, business_account_id: WABA, app_secret: APP_SECRET } })])
    await run(['--probe'], world)
    const signed = webhookCalls(world)[2]
    expect(signed.headers['x-hub-signature-256']).toBe(`sha256=${createHmac('sha256', APP_SECRET).update(signed.body as string).digest('hex')}`)
    expect(signBody(APP_SECRET, 'abc')).toBe(`sha256=${createHmac('sha256', APP_SECRET).update('abc').digest('hex')}`)
  })

  it('buildProbePayload carries metadata only: no messages or statuses key at any depth', () => {
    const payload = buildProbePayload(makeInbox())
    const keys: string[] = []
    const walk = (node: any) => {
      if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          keys.push(k)
          walk(v)
        }
      }
    }
    walk(payload)
    expect(keys).not.toContain('messages')
    expect(keys).not.toContain('statuses')
    expect(keys).toContain('metadata')
    expect(payload.entry[0].id).toBe(WABA)
    expect(payload.entry[0].changes[0].value.metadata).toEqual({ display_phone_number: E164.slice(1), phone_number_id: PHONE_ID })
  })
})

describe('--probe', () => {
  const enforcing = () =>
    makeWorld([makeInbox({ provider_config: { source: 'manual_setup_v2', api_key: API_KEY, phone_number_id: PHONE_ID, business_account_id: WABA, app_secret: APP_SECRET } })])

  it('prints unsigned=401 wrong_signature=401 signed=200 and verdict=enforced against an enforcing webhook', async () => {
    const world = enforcing()
    const res = await run(['--probe'], world)
    expect(res.out).toContain('unsigned=401 wrong_signature=401 signed=200')
    expect(res.out).toContain('verdict=enforced')
    expect(res.code).toBe(0)
  })

  it('prints verdict=NOT ENFORCED and exits 1 against a webhook that accepts everything (pre-harden state)', async () => {
    const world = makeWorld()
    const res = await run(['--probe'], world)
    expect(res.out).toContain('unsigned=200 wrong_signature=200 signed=200')
    expect(res.out).toContain('verdict=NOT ENFORCED')
    expect(res.code).toBe(1)
  })

  it('posts three times to <base>/webhooks/whatsapp/<stored phone number> with no Chatwoot token, no redirects and a timeout', async () => {
    const world = enforcing()
    await run(['--probe'], world)
    const hits = webhookCalls(world)
    expect(hits).toHaveLength(3)
    for (const hit of hits) {
      expect(hit.method).toBe('POST')
      expect(hit.url).toBe(`${BASE}/webhooks/whatsapp/${E164}`)
      expect(hit.headers['api-access-token']).toBeUndefined()
      expect(hit.headers.authorization).toBeUndefined()
      expect(hit.init.redirect).toBe('error')
      expect(hit.init.signal).toBeInstanceOf(AbortSignal)
    }
    expect(hits[0].headers['x-hub-signature-256']).toBeUndefined()
    expect(hits[1].headers['x-hub-signature-256']).toMatch(/^sha256=0{64}$/)
    expect(hits[0].body).toBe(hits[2].body)
    const body = JSON.parse(hits[0].body as string)
    expect(JSON.stringify(body)).not.toMatch(/"(?:messages|statuses)":/)
  })

  it('reports "whatsapp inbox missing" with exit 1 when no WhatsApp inbox exists', async () => {
    const world = makeWorld([])
    const res = await run(['--probe'], world)
    expect(res.out).toContain('whatsapp inbox missing')
    expect(res.code).toBe(1)
    expect(webhookCalls(world)).toHaveLength(0)
  })

  it('names the missing META_WA_APP_SECRET, exits 2 and sends no request at all', async () => {
    const world = makeWorld()
    const env = { ...META_ENV }
    delete (env as any).META_WA_APP_SECRET
    const res = await run(['--probe'], world, {}, env)
    expect(res.code).toBe(2)
    expect(res.all).toContain('META_WA_APP_SECRET')
    expect(world.calls).toHaveLength(0)
  })

  it('never prints the app secret, provider_config values or the Chatwoot token', async () => {
    for (const world of [enforcing(), makeWorld()]) {
      const res = await run(['--probe'], world)
      for (const value of [APP_SECRET, API_KEY, CW_TOKEN, GRAPH_TOKEN, PHONE_ID]) expect(res.all).not.toContain(value)
    }
  })
})

// ---------------------------------------------------------------------------
// Task 2: --harden, recovery levers, provider_config redaction
// ---------------------------------------------------------------------------

describe('mergeAppSecret', () => {
  it('returns a new object with every existing key plus app_secret and never mutates its input', () => {
    const existing = { source: 'manual_setup_v2', api_key: API_KEY, phone_number_id: PHONE_ID, nested: { a: 1 } }
    const snapshot = JSON.parse(JSON.stringify(existing))
    const merged = mergeAppSecret(existing, APP_SECRET)
    expect(merged).toEqual({ ...snapshot, app_secret: APP_SECRET })
    expect(merged).not.toBe(existing)
    expect(existing).toEqual(snapshot)
    expect(Object.keys(existing)).not.toContain('app_secret')
  })
})

describe('--harden', () => {
  const noLeak = (text: string) => {
    for (const value of [APP_SECRET, OTHER_SECRET, API_KEY, CW_TOKEN, GRAPH_TOKEN, PHONE_ID, WABA]) expect(text).not.toContain(value)
  }

  it('sends exactly one PATCH with the full existing provider_config plus app_secret, then re-reads and prints booleans only', async () => {
    const world = makeWorld()
    const before = structuredClone(world.inboxes[0].provider_config)
    const res = await run(['--harden'], world)
    const patches = patchCalls(world)
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toBe(`${BASE}/api/v1/accounts/1/inboxes/7`)
    expect(JSON.parse(patches[0].body as string)).toEqual({ channel: { provider_config: { ...before, app_secret: APP_SECRET } } })
    // a GET of the inbox follows the PATCH (preservation proof)
    const idxPatch = world.calls.indexOf(patches[0])
    expect(world.calls.slice(idxPatch + 1).some((c: Call) => c.method === 'GET' && c.url.endsWith('/inboxes/7'))).toBe(true)
    expect(res.out).toEqual(['app_secret=configured', 'source_preserved=true', 'api_key_preserved=true', 'phone_number_id_preserved=true'])
    expect(res.code).toBe(0)
    expect(world.inboxes[0].provider_config).toEqual({ ...before, app_secret: APP_SECRET })
    noLeak(res.all)
  })

  it('is idempotent: a second run sends no PATCH and prints app_secret=unchanged', async () => {
    const world = makeWorld()
    await run(['--harden'], world)
    const patchesBefore = patchCalls(world).length
    const res = await run(['--harden'], world)
    expect(patchCalls(world)).toHaveLength(patchesBefore)
    expect(res.out).toEqual(['app_secret=unchanged'])
    expect(res.code).toBe(0)
  })

  it('replaces a different stored secret with one PATCH and prints app_secret=updated', async () => {
    const world = makeWorld()
    world.inboxes[0].provider_config.app_secret = OTHER_SECRET
    const res = await run(['--harden'], world)
    expect(patchCalls(world)).toHaveLength(1)
    expect(res.out[0]).toBe('app_secret=updated')
    expect(world.inboxes[0].provider_config.app_secret).toBe(APP_SECRET)
    noLeak(res.all)
  })

  it('--dry-run reads only and prints plan app_secret=set (or unchanged once configured)', async () => {
    const world = makeWorld()
    const res = await run(['--harden', '--dry-run'], world)
    expect(res.out).toEqual(['plan app_secret=set'])
    expect(res.code).toBe(0)
    expect(world.calls.every((c: Call) => c.method === 'GET')).toBe(true)
    world.inboxes[0].provider_config.app_secret = APP_SECRET
    const again = await run(['--harden', '--dry-run'], world)
    expect(again.out).toEqual(['plan app_secret=unchanged'])
  })

  it('a rejected PATCH echoing api_key and app_secret exits 2 without leaking, points at the rails runner fallback, and a rerun completes', async () => {
    const world = makeWorld()
    const before = structuredClone(world.inboxes[0].provider_config)
    world.patchMode = 'reject'
    const res = await run(['--harden'], world)
    expect(res.code).toBe(2)
    noLeak(res.all)
    expect(res.all).toContain('rails runner')
    expect(world.inboxes[0].provider_config).toEqual(before)
    world.patchMode = 'accept'
    const rerun = await run(['--harden'], world)
    expect(rerun.code).toBe(0)
    expect(rerun.out[0]).toBe('app_secret=configured')
  })

  it('exits 1 with the failing *_preserved=false line when the write dropped api_key', async () => {
    const world = makeWorld()
    world.patchMode = 'drop_api_key'
    const res = await run(['--harden'], world)
    expect(res.code).toBe(1)
    expect(res.out).toContain('api_key_preserved=false')
    expect(res.out).toContain('source_preserved=true')
    noLeak(res.all)
  })

  it('exits 1 with source_preserved=false when the write changed source', async () => {
    const world = makeWorld()
    world.patchMode = 'change_source'
    const res = await run(['--harden'], world)
    expect(res.code).toBe(1)
    expect(res.out).toContain('source_preserved=false')
  })

  it('requires META_WA_APP_SECRET before any request', async () => {
    const world = makeWorld()
    const env = { ...META_ENV }
    delete (env as any).META_WA_APP_SECRET
    const res = await run(['--harden'], world, {}, env)
    expect(res.code).toBe(2)
    expect(res.all).toContain('META_WA_APP_SECRET')
    expect(world.calls).toHaveLength(0)
  })
})

describe('recovery levers', () => {
  it('--sync-templates issues exactly one POST to /inboxes/:id/sync_templates', async () => {
    const world = makeWorld()
    const res = await run(['--sync-templates'], world)
    const posts = world.calls.filter((c: Call) => c.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`${BASE}/api/v1/accounts/1/inboxes/7/sync_templates`)
    expect(res.out).toEqual(['sync_templates=requested'])
    expect(res.code).toBe(0)
  })

  it('--register-webhook issues exactly one POST to /inboxes/:id/register_webhook', async () => {
    const world = makeWorld()
    const res = await run(['--register-webhook'], world)
    const posts = world.calls.filter((c: Call) => c.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`${BASE}/api/v1/accounts/1/inboxes/7/register_webhook`)
    expect(res.out).toEqual(['register_webhook=ok'])
    expect(res.code).toBe(0)
  })

  it('both levers report a missing WhatsApp inbox with exit 1 and no POST', async () => {
    for (const mode of ['--sync-templates', '--register-webhook']) {
      const world = makeWorld([])
      const res = await run([mode], world)
      expect(res.out).toContain('whatsapp inbox missing')
      expect(res.code).toBe(1)
      expect(world.calls.some((c: Call) => c.method === 'POST')).toBe(false)
    }
  })
})

describe('client error redaction (provider_config keys)', () => {
  it('redacts api_key, app_secret, app_secret_key, client_secret, api_secret, verification_pin and business_management_token in error bodies', async () => {
    const values: Record<string, string> = {
      api_key: 'distinct-value-api-key',
      app_secret: 'distinct-value-app-secret',
      app_secret_key: 'distinct-value-app-secret-key',
      client_secret: 'distinct-value-client-secret',
      api_secret: 'distinct-value-api-secret',
      verification_pin: 'distinct-value-pin',
      business_management_token: 'distinct-value-bm-token',
    }
    const body = JSON.stringify({ error: 'nope', provider_config: { ...values, keep: 'visible' } })
    const client = createChatwootClient({
      baseUrl: BASE,
      token: CW_TOKEN,
      accountId: '1',
      fetchImpl: async () => new Response(body, { status: 422 }),
    })
    const error: any = await client.request('PATCH', '/inboxes/7', { channel: {} }).catch((e: unknown) => e)
    for (const value of Object.values(values)) expect(error.message).not.toContain(value)
    expect(error.message).toContain('[redacted]')
    expect(error.message).toContain('visible')
  })

  it('also redacts a numeric verification_pin', async () => {
    const client = createChatwootClient({
      baseUrl: BASE,
      token: CW_TOKEN,
      accountId: '1',
      fetchImpl: async () => new Response('{"verification_pin":135790}', { status: 500 }),
    })
    const error: any = await client.request('GET', '/inboxes/7').catch((e: unknown) => e)
    expect(error.message).not.toContain('135790')
  })
})
