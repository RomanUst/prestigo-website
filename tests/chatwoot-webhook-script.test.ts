// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 83, Plan 06 - infra/chatwoot/webhook.mjs (HOOK-03 / D-20) proven against the in-memory
 * fake Chatwoot. No test here makes a network call or reads a real credential; every secret is an
 * obviously fake object property.
 */
import { describe, it, expect } from 'vitest'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN } from './helpers/fake-chatwoot'
import { createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import {
  chatwootSignature,
  loadDesiredWebhook,
  parseChatwootWebhookArgs,
  runChatwootWebhook,
} from '../infra/chatwoot/webhook.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_DIR = join(REPO_ROOT, 'infra/chatwoot')
const DESIRED_URL = 'https://rideprestigo.com/api/webhooks/chatwoot'
const FOUR = ['message_created', 'conversation_status_changed', 'conversation_updated', 'contact_updated']
const FAKE_SECRET = 'whsec_FAKE_not_a_real_secret_0123'

function setup(opts: Parameters<typeof createFakeChatwoot>[0] = {}, token = FAKE_ADMIN_TOKEN) {
  const fake = createFakeChatwoot(opts)
  const client = createChatwootClient({
    baseUrl: 'https://chat.example.test',
    token,
    accountId: '1',
    fetchImpl: fake.fetchImpl as any,
  })
  return { fake, client }
}

async function run(argv: string[], ctx: { client: any }, extra: Record<string, unknown> = {}) {
  const out: string[] = []
  const err: string[] = []
  const code = await runChatwootWebhook({
    argv,
    client: ctx.client,
    configDir: CONFIG_DIR,
    isTTY: false,
    out: (t: string) => out.push(t),
    err: (t: string) => err.push(t),
    ...extra,
  })
  return { code, out, err, text: out.join('\n'), errText: err.join('\n') }
}

const webhookWrites = (fake: ReturnType<typeof createFakeChatwoot>) =>
  fake.requests.filter((r) => r.path.startsWith('/webhooks') && r.method !== 'GET')

describe('webhooks.json (desired state)', () => {
  it('declares exactly one account webhook with the four subscriptions on the canonical apex URL', () => {
    const desired = loadDesiredWebhook(CONFIG_DIR)
    expect(desired.url).toBe(DESIRED_URL)
    expect([...desired.subscriptions].sort()).toEqual([...FOUR].sort())
    const raw = JSON.parse(readFileSync(join(CONFIG_DIR, 'webhooks.json'), 'utf8'))
    expect(raw.webhooks).toHaveLength(1)
  })
})

describe('parseChatwootWebhookArgs', () => {
  it('takes the url from webhooks.json by default and the command from the first word', () => {
    expect(parseChatwootWebhookArgs(['ensure'], { configDir: CONFIG_DIR })).toMatchObject({ command: 'ensure', url: DESIRED_URL, allowHost: false })
    expect(parseChatwootWebhookArgs(['list'], { configDir: CONFIG_DIR }).command).toBe('list')
    expect(parseChatwootWebhookArgs(['rotate'], { configDir: CONFIG_DIR }).command).toBe('rotate')
    expect(parseChatwootWebhookArgs(['probe'], { configDir: CONFIG_DIR }).command).toBe('probe')
    expect(parseChatwootWebhookArgs(['delete', '12'], { configDir: CONFIG_DIR })).toMatchObject({ command: 'delete', id: 12 })
    expect(parseChatwootWebhookArgs(['--print', 'secret'], { configDir: CONFIG_DIR }).command).toBe('print')
  })

  it('refuses a URL that is not https on rideprestigo.com unless --allow-host', () => {
    for (const url of ['http://rideprestigo.com/api/webhooks/chatwoot', 'https://www.rideprestigo.com/x', 'https://evil.example.test/x', 'not a url']) {
      expect(() => parseChatwootWebhookArgs(['ensure', '--url', url], { configDir: CONFIG_DIR })).toThrow()
    }
    const ok = parseChatwootWebhookArgs(['ensure', '--url', 'https://receiver.example.test/h', '--allow-host'], { configDir: CONFIG_DIR })
    expect(ok).toMatchObject({ url: 'https://receiver.example.test/h', allowHost: true })
  })

  it('refuses an unknown command, a missing command and an unknown --print kind', () => {
    expect(() => parseChatwootWebhookArgs([], { configDir: CONFIG_DIR })).toThrow()
    expect(() => parseChatwootWebhookArgs(['frobnicate'], { configDir: CONFIG_DIR })).toThrow()
    expect(() => parseChatwootWebhookArgs(['--print', 'token'], { configDir: CONFIG_DIR })).toThrow()
    expect(() => parseChatwootWebhookArgs(['ensure', '--bogus'], { configDir: CONFIG_DIR })).toThrow()
  })
})

describe('ensure', () => {
  it('creates the webhook once on an empty account with the four subscriptions', async () => {
    const ctx = setup()
    const res = await run(['ensure'], ctx)
    expect(res.code).toBe(0)
    expect(res.text).toContain('webhook=created id=1')
    const writes = webhookWrites(ctx.fake)
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe('POST')
    expect(writes[0].body.webhook.url).toBe(DESIRED_URL)
    expect([...writes[0].body.webhook.subscriptions].sort()).toEqual([...FOUR].sort())
  })

  it('is idempotent: a second run makes no write and reports unchanged', async () => {
    const ctx = setup()
    await run(['ensure'], ctx)
    const second = await run(['ensure'], ctx)
    expect(second.code).toBe(0)
    expect(second.text).toContain('webhook=unchanged')
    expect(webhookWrites(ctx.fake)).toHaveLength(1)
    expect(ctx.fake.state.webhooks).toHaveLength(1)
  })

  it('updates (never duplicates) a webhook that has three of the four subscriptions', async () => {
    const ctx = setup({ webhooks: [{ id: 9, name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR.slice(0, 3), secret: FAKE_SECRET }] })
    const res = await run(['ensure'], ctx)
    expect(res.code).toBe(0)
    expect(res.text).toContain('webhook=updated')
    const writes = webhookWrites(ctx.fake)
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe('PATCH')
    expect(writes[0].path).toBe('/webhooks/9')
    expect([...ctx.fake.state.webhooks[0].subscriptions].sort()).toEqual([...FOUR].sort())
    expect(ctx.fake.state.webhooks).toHaveLength(1)
  })

  it('compares subscriptions as sets (order does not matter)', async () => {
    const ctx = setup({ webhooks: [{ name: 'Prestigo site', url: DESIRED_URL, subscriptions: [...FOUR].reverse(), secret: FAKE_SECRET }] })
    const res = await run(['ensure'], ctx)
    expect(res.text).toContain('webhook=unchanged')
    expect(webhookWrites(ctx.fake)).toHaveLength(0)
  })

  it('exits 1 with duplicate_webhooks when two webhooks share the url, and writes nothing', async () => {
    const ctx = setup({
      webhooks: [
        { name: 'a', url: DESIRED_URL, subscriptions: FOUR },
        { name: 'b', url: DESIRED_URL, subscriptions: FOUR },
      ],
    })
    const res = await run(['ensure'], ctx)
    expect(res.code).toBe(1)
    expect(`${res.text}\n${res.errText}`).toContain('duplicate_webhooks')
    expect(webhookWrites(ctx.fake)).toHaveLength(0)
  })

  it('leaves webhooks for other urls alone', async () => {
    const ctx = setup({ webhooks: [{ id: 3, name: 'other', url: 'https://other.example.test/h', subscriptions: ['message_created'] }] })
    const res = await run(['ensure'], ctx)
    expect(res.text).toContain('webhook=created')
    expect(ctx.fake.state.webhooks).toHaveLength(2)
  })

  it('exits 2 and writes nothing when the token is an agent token (webhooks are administrator-only)', async () => {
    const ctx = setup({}, FAKE_AGENT_TOKEN)
    const res = await run(['ensure'], ctx)
    expect(res.code).toBe(2)
    expect(webhookWrites(ctx.fake)).toHaveLength(0)
  })
})

describe('list', () => {
  it('prints id, url and subscriptions per webhook and never the secret', async () => {
    const ctx = setup({ webhooks: [{ id: 5, name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: FAKE_SECRET }] })
    const res = await run(['list'], ctx)
    expect(res.code).toBe(0)
    expect(res.text).toContain(`id=5 url=${DESIRED_URL} subscriptions=${FOUR.join(',')}`)
    expect(`${res.text}${res.errText}`).not.toContain(FAKE_SECRET)
  })
})

describe('print secret (TTY guard)', () => {
  it('refuses on a TTY: exit 1, nothing on out, and the secret is not even fetched', async () => {
    const ctx = setup({ webhooks: [{ name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: FAKE_SECRET }] })
    const res = await run(['--print', 'secret'], ctx, { isTTY: true })
    expect(res.code).toBe(1)
    expect(res.out).toEqual([])
    expect(res.errText).toContain('refusing to print a secret to a terminal')
    expect(res.errText).not.toContain(FAKE_SECRET)
    expect(ctx.fake.requests).toHaveLength(0)
  })

  it('on a pipe writes exactly the secret (no newline, nothing else) through the write channel', async () => {
    const ctx = setup({ webhooks: [{ name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: FAKE_SECRET }] })
    const res = await run(['--print', 'secret'], ctx)
    expect(res.code).toBe(0)
    expect(res.out).toEqual([FAKE_SECRET])
    expect(res.errText).toBe('')
  })

  it('prefers a dedicated write channel over out when one is given', async () => {
    const ctx = setup({ webhooks: [{ name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: FAKE_SECRET }] })
    const written: string[] = []
    const res = await run(['--print', 'secret'], ctx, { write: (t: string) => written.push(t) })
    expect(res.code).toBe(0)
    expect(written).toEqual([FAKE_SECRET])
    expect(res.out).toEqual([])
  })

  it('exits 2 without output when no webhook exists for the url', async () => {
    const ctx = setup()
    const res = await run(['--print', 'secret'], ctx)
    expect(res.code).toBe(2)
    expect(res.out).toEqual([])
  })
})

describe('inbound-webhooks.env.example', () => {
  const raw = readFileSync(join(REPO_ROOT, 'infra/vps/env/inbound-webhooks.env.example'), 'utf8')
  const NAMES = [
    'CHATWOOT_WEBHOOK_SECRET',
    'CHATWOOT_WEBHOOK_SECRET_PREVIOUS',
    'ESPOCRM_WEBHOOK_SECRET',
    'ESPOCRM_WEBHOOK_SECRET_PREVIOUS',
    'ESPOCRM_WEBHOOK_ID',
  ]

  it('lists exactly the five names, each with an empty value', () => {
    const lines = raw.split('\n').filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    expect(lines.map((l) => l.split('=')[0])).toEqual(NAMES)
    for (const l of lines) expect(l.slice(l.indexOf('=') + 1)).toBe('')
  })

  it('every SECRET name is picked up by the pre-commit INFRA_SECRET_KEY_NAMES derivation', () => {
    const hook = readFileSync(join(REPO_ROOT, '.husky/pre-commit'), 'utf8')
    expect(hook).toContain("grep -E '(PASSWORD|SECRET|_KEY|TOKEN)'")
    const derived = NAMES.filter((n) => /(PASSWORD|SECRET|_KEY|TOKEN)/.test(n))
    expect(derived).toEqual(NAMES.filter((n) => n.includes('SECRET')))
    expect(derived).toHaveLength(4)
  })
})

describe('chatwootSignature', () => {
  it('is a sha256= prefixed hex string', () => {
    expect(chatwootSignature('fake-secret', 1_729_950_000, '{}')).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('equals sha256= + hex HMAC-SHA256(secret, "<ts>.<body>")', () => {
    const expected = `sha256=${createHmac('sha256', 'fake-secret').update('1729950000.{}').digest('hex')}`
    expect(chatwootSignature('fake-secret', 1_729_950_000, '{}')).toBe(expected)
  })
})

/** A receiver that verifies like the site does: 300 s timestamp window, exact HMAC over "<ts>.<body>". */
function siteReceiver(secret: string, nowSec: number) {
  const calls: Array<{ url: string; init: RequestInit; headers: Headers; body: string }> = []
  const fetchImpl = async (url: unknown, init: RequestInit = {}) => {
    const headers = new Headers(init.headers as HeadersInit)
    const body = String(init.body ?? '')
    calls.push({ url: String(url), init, headers, body })
    const ts = headers.get('x-chatwoot-timestamp')
    const sig = headers.get('x-chatwoot-signature')
    if (!ts || !sig || !headers.get('x-chatwoot-delivery')) return new Response('', { status: 401 })
    if (Math.abs(nowSec - Number(ts)) > 300) return new Response('', { status: 401 })
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`)
    const given = Buffer.from(sig)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return new Response('', { status: 401 })
    return new Response('{"ok":true}', { status: 200 })
  }
  return { fetchImpl, calls }
}

describe('probe', () => {
  const NOW = 1_729_950_000
  const seeded = () => setup({ webhooks: [{ id: 2, name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: FAKE_SECRET }] })

  it('probe prints verdict=ok for 200, 401, 401 against a receiver that verifies like the site', async () => {
    const ctx = seeded()
    const receiver = siteReceiver(FAKE_SECRET, NOW)
    const res = await run(['probe'], ctx, { fetchImpl: receiver.fetchImpl, nowSec: NOW })
    expect(res.code).toBe(0)
    expect(res.text).toContain('probe_status=200,401,401')
    expect(res.text).toContain('verdict=ok')
    expect(receiver.calls).toHaveLength(3)
    expect(`${res.text}\n${res.errText}`).not.toContain(FAKE_SECRET)
  })

  it('probe sends a private outgoing note with timestamp, delivery id and a signature, to the desired url only', async () => {
    const ctx = seeded()
    const receiver = siteReceiver(FAKE_SECRET, NOW)
    await run(['probe'], ctx, { fetchImpl: receiver.fetchImpl, nowSec: NOW })
    const [a, b, c] = receiver.calls
    for (const call of receiver.calls) {
      expect(call.url).toBe(DESIRED_URL)
      expect(call.init.method).toBe('POST')
      expect(call.headers.get('content-type')).toBe('application/json')
      expect(call.headers.get('x-chatwoot-timestamp')).toMatch(/^\d+$/)
      expect(call.headers.get('x-chatwoot-delivery')).toMatch(/^[0-9a-f-]{36}$/)
      expect(call.headers.get('x-chatwoot-signature')).toMatch(/^sha256=[0-9a-f]{64}$/)
      expect(call.headers.get('api-access-token')).toBeNull()
      expect(call.init.redirect).toBe('manual')
    }
    expect(new Set(receiver.calls.map((x) => x.headers.get('x-chatwoot-delivery'))).size).toBe(3)
    expect(JSON.parse(a.body)).toMatchObject({ event: 'message_created', message_type: 'outgoing', private: true })
    // 2: a changed body under the first signature. 3: a 600 s old timestamp, correctly signed for it.
    expect(b.body).not.toBe(a.body)
    expect(b.headers.get('x-chatwoot-signature')).toBe(a.headers.get('x-chatwoot-signature'))
    expect(c.body).toBe(a.body)
    expect(c.headers.get('x-chatwoot-timestamp')).toBe(String(NOW - 600))
    expect(c.headers.get('x-chatwoot-signature')).toBe(chatwootSignature(FAKE_SECRET, NOW - 600, a.body))
  })

  it('probe fails (verdict=fail, exit 1) against a receiver that accepts everything', async () => {
    const ctx = seeded()
    const calls: unknown[] = []
    const acceptAll = async (url: unknown) => {
      calls.push(url)
      return new Response('{}', { status: 200 })
    }
    const res = await run(['probe'], ctx, { fetchImpl: acceptAll, nowSec: NOW })
    expect(res.code).toBe(1)
    expect(res.text).toContain('probe_status=200,200,200')
    expect(res.text).toContain('verdict=fail')
    expect(res.text).not.toContain('verdict=ok')
  })

  it('probe fails when the receiver redirects (a redirected POST is not a 200)', async () => {
    const ctx = seeded()
    const redirecting = async () => new Response('', { status: 308, headers: { location: 'https://www.rideprestigo.com/x' } })
    const res = await run(['probe'], ctx, { fetchImpl: redirecting, nowSec: NOW })
    expect(res.code).toBe(1)
    expect(res.text).toContain('probe_status=308,308,308')
    expect(res.text).toContain('verdict=fail')
  })

  it('probe records a network failure as status 0 without leaking the error text', async () => {
    const ctx = seeded()
    const broken = async () => {
      throw new Error(`connect failed with ${FAKE_SECRET}`)
    }
    const res = await run(['probe'], ctx, { fetchImpl: broken, nowSec: NOW })
    expect(res.code).toBe(1)
    expect(res.text).toContain('probe_status=0,0,0')
    expect(`${res.text}\n${res.errText}`).not.toContain(FAKE_SECRET)
  })

  it('probe exits 2 and sends nothing when no webhook is registered for the url', async () => {
    const ctx = setup()
    const receiver = siteReceiver(FAKE_SECRET, NOW)
    const res = await run(['probe'], ctx, { fetchImpl: receiver.fetchImpl, nowSec: NOW })
    expect(res.code).toBe(2)
    expect(receiver.calls).toHaveLength(0)
  })

  it('probe refuses a non-canonical host unless --allow-host, before any request', async () => {
    const ctx = seeded()
    const receiver = siteReceiver(FAKE_SECRET, NOW)
    const res = await run(['probe', '--url', 'https://evil.example.test/h'], ctx, { fetchImpl: receiver.fetchImpl, nowSec: NOW })
    expect(res.code).toBe(2)
    expect(receiver.calls).toHaveLength(0)
    expect(ctx.fake.requests).toHaveLength(0)
  })
})

describe('rotate', () => {
  const OLD_SECRET = 'whsec_FAKE_old_secret_value_aaaa'

  it('rotate deletes the url webhook then creates a new one, and prints neither secret', async () => {
    const ctx = setup({ webhooks: [{ id: 2, name: 'Prestigo site', url: DESIRED_URL, subscriptions: FOUR, secret: OLD_SECRET }] })
    const res = await run(['rotate'], ctx)
    expect(res.code).toBe(0)
    const writes = webhookWrites(ctx.fake)
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual(['DELETE /webhooks/2', 'POST /webhooks'])
    expect(ctx.fake.state.webhooks).toHaveLength(1)
    const next = ctx.fake.state.webhooks[0]
    expect(next.secret).not.toBe(OLD_SECRET)
    expect(next.url).toBe(DESIRED_URL)
    expect([...next.subscriptions].sort()).toEqual([...FOUR].sort())
    const all = `${res.text}\n${res.errText}`
    expect(all).not.toContain(OLD_SECRET)
    expect(all).not.toContain(next.secret)
    expect(all).toContain('CHATWOOT_WEBHOOK_SECRET_PREVIOUS')
    expect(all).toContain('webhook.mjs --print secret')
  })

  it('rotate on an account without the webhook just creates it (no delete)', async () => {
    const ctx = setup()
    const res = await run(['rotate'], ctx)
    expect(res.code).toBe(0)
    expect(webhookWrites(ctx.fake).map((w) => w.method)).toEqual(['POST'])
  })

  it('rotate refuses duplicates: exit 1 and no write', async () => {
    const ctx = setup({
      webhooks: [
        { name: 'a', url: DESIRED_URL, subscriptions: FOUR },
        { name: 'b', url: DESIRED_URL, subscriptions: FOUR },
      ],
    })
    const res = await run(['rotate'], ctx)
    expect(res.code).toBe(1)
    expect(`${res.text}\n${res.errText}`).toContain('duplicate_webhooks')
    expect(webhookWrites(ctx.fake)).toHaveLength(0)
  })
})

describe('delete', () => {
  it('delete refuses a non-numeric id before any request', async () => {
    for (const bad of ['abc', '1; rm', '-3', '0', '1.5', '']) {
      const ctx = setup({ webhooks: [{ id: 1, name: 'w', url: DESIRED_URL, subscriptions: FOUR }] })
      const res = await run(['delete', bad], ctx)
      expect(res.code).toBe(2)
      expect(ctx.fake.requests).toHaveLength(0)
    }
  })

  it('delete removes exactly the named webhook', async () => {
    const ctx = setup({
      webhooks: [
        { id: 1, name: 'a', url: DESIRED_URL, subscriptions: FOUR },
        { id: 2, name: 'b', url: 'https://other.example.test/h', subscriptions: FOUR },
      ],
    })
    const res = await run(['delete', '2'], ctx)
    expect(res.code).toBe(0)
    expect(res.text).toContain('webhook=deleted id=2')
    expect(ctx.fake.state.webhooks.map((w) => w.id)).toEqual([1])
  })
})
