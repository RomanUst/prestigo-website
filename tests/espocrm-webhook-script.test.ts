// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 83, Plan 05 - EspoCRM webhook registration script (infra/espocrm/webhook.mjs), proven
 * against the in-memory fake with a Webhook model that follows EspoCRM 10.0.8: an API-user owner
 * keeps skipOwn, an admin-created webhook has skipOwn forced off and no owner. No test here makes a
 * network call; every secret below is an obviously fake value.
 */
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EspoConfigError, createEspoClient, loadEspoConfig } from '../infra/espocrm/lib/client.mjs'
import {
  DEFAULT_WEBHOOK_URL,
  WEBHOOK_EVENT,
  espoSignature,
  parseWebhookArgs,
  runWebhook,
} from '../infra/espocrm/webhook.mjs'
import { createFakeEspoCRM, type FakeReq } from './helpers/fake-espocrm'

const BASE = 'https://crm.example.test'
const API_KEY = 'key_SECRET_abcdef0123'
const FAKE_SECRET = 'whsec_FAKE_0123456789abcdef'
const SYNC_USER_ID = 'e00000000000000a1'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'espo-webhook-test-'))
  dirs.push(dir)
  return path.join(dir, 'prestigo')
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

/**
 * Webhook rules of EspoCRM 10.0.8 (RESEARCH Pattern 4, Pitfall 3/4).
 * `ignoreSkipOwn` models a build that drops skipOwn even for an API owner.
 */
function webhookRules(options: { ignoreSkipOwn?: boolean; secret?: string; ownerAsCreatedBy?: boolean } = {}) {
  let counter = 0
  return (req: FakeReq, state: any) => {
    if (!/^\/Webhook(?:\/[0-9a-f]{17})?$/.test(req.path)) return undefined
    const list: any[] = (state.records.Webhook ??= [])
    const id = req.path.split('/')[2]
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    // the secret is part of every stored record on purpose: the script must never print it
    const publicView = (w: any) => ({ ...w })
    if (req.method === 'GET' && !id) return json({ total: list.length, list: list.map(publicView) })
    if (req.method === 'GET') {
      const hit = list.find((w) => w.id === id)
      return hit ? json(publicView(hit)) : new Response('', { status: 404 })
    }
    if (req.method === 'POST' && !id) {
      const viaApiKey = Boolean(req.headers['x-api-key'])
      const record = {
        id: `c${(0x2000 + ++counter).toString(16).padStart(16, '0')}`,
        event: req.body.event,
        url: req.body.url,
        isActive: req.body.isActive ?? true,
        skipOwn: viaApiKey && !options.ignoreSkipOwn ? Boolean(req.body.skipOwn) : false,
        ...(options.ownerAsCreatedBy
          ? { createdById: viaApiKey ? SYNC_USER_ID : null }
          : { userId: viaApiKey ? SYNC_USER_ID : null }),
        secretKey: options.secret ?? FAKE_SECRET,
      }
      list.push(record)
      return json(record)
    }
    if (req.method === 'DELETE' && id) {
      const at = list.findIndex((w) => w.id === id)
      if (at < 0) return new Response('', { status: 404 })
      list.splice(at, 1)
      return json(true)
    }
    return new Response('', { status: 405 })
  }
}

const world = (rules: Parameters<typeof webhookRules>[0] = {}) => {
  const fake = createFakeEspoCRM({ extraRoutes: webhookRules(rules) })
  const client = createEspoClient({
    config: loadEspoConfig({ identity: 'apikey', env: { ESPOCRM_BASE_URL: BASE, ESPOCRM_API_KEY: API_KEY } }),
    fetchImpl: fake.fetchImpl as any,
  })
  const configDir = tempDir()
  const out: string[] = []
  const err: string[] = []
  const run = async (argv: string[], extra: { isTTY?: boolean; fetchImpl?: any } = {}) => {
    out.length = 0
    err.length = 0
    const code = await runWebhook({
      argv,
      client,
      configDir,
      isTTY: extra.isTTY ?? false,
      fetchImpl: extra.fetchImpl,
      out: (text: string) => out.push(text),
      err: (text: string) => err.push(text),
    })
    return { code, stdout: out.join(''), stderr: err.join(''), all: `${out.join('')}${err.join('')}` }
  }
  const webhookPosts = () => fake.requests.filter((r) => r.method === 'POST' && r.path === '/Webhook')
  const envFile = path.join(configDir, 'espocrm-webhook.env')
  return { fake, client, configDir, envFile, run, webhookPosts }
}

describe('constants', () => {
  it('registers Contact.update only and targets the canonical production receiver (D-13, RESEARCH A13)', () => {
    expect(WEBHOOK_EVENT).toBe('Contact.update')
    expect(DEFAULT_WEBHOOK_URL).toBe('https://rideprestigo.com/api/webhooks/espocrm')
  })
})

describe('webhook create (tracer, HOOK-04 / D-14 echo guard at the source)', () => {
  it('creates the webhook as the API user with skipOwn true, Contact.update and the default URL', async () => {
    const w = world()
    const { code, stdout } = await w.run(['create'])
    expect(code).toBe(0)
    const posts = w.webhookPosts()
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({ event: 'Contact.update', url: DEFAULT_WEBHOOK_URL, skipOwn: true, isActive: true })
    // always the sync identity (X-Api-Key), never the admin token exchange
    expect(posts[0].headers['x-api-key']).toBe(API_KEY)
    expect(w.fake.requests.some((r) => r.path === '/App/user')).toBe(false)
    expect(stdout).toMatch(/^webhook=created id=c[0-9a-f]{16} skipOwn=true$/m)
  })

  it('stores id and secret in the env file with mode 0600 (directory 0700) and never prints the secret', async () => {
    const w = world()
    const result = await w.run(['create'])
    expect(result.all).not.toContain(FAKE_SECRET)
    expect(existsSync(w.envFile)).toBe(true)
    expect(statSync(w.envFile).mode & 0o777).toBe(0o600)
    expect(statSync(w.configDir).mode & 0o777).toBe(0o700)
    const text = readFileSync(w.envFile, 'utf8')
    const id = w.fake.state.records.Webhook[0].id
    expect(text).toContain(`ESPOCRM_WEBHOOK_ID=${id}`)
    expect(text).toContain(`ESPOCRM_WEBHOOK_SECRET=${FAKE_SECRET}`)
  })

  it('accepts the live EspoCRM 10 API-user shape: owner only as createdById (no userId) still counts as skipOwn effective', async () => {
    const w = world({ ownerAsCreatedBy: true })
    const { code, stdout } = await w.run(['create'])
    expect(code).toBe(0)
    expect(stdout).toMatch(/^webhook=created id=c[0-9a-f]{16} skipOwn=true$/m)
    expect(w.fake.state.records.Webhook).toHaveLength(1)
  })

  it('a second create registers nothing: webhook=exists and zero further POSTs (idempotence)', async () => {
    const w = world()
    await w.run(['create'])
    const second = await w.run(['create'])
    expect(second.code).toBe(0)
    expect(second.stdout).toMatch(/^webhook=exists id=c[0-9a-f]{16} skipOwn=true$/m)
    expect(w.webhookPosts()).toHaveLength(1)
    expect(second.all).not.toContain(FAKE_SECRET)
  })

  it('exits non-zero with skipown_not_effective when the re-read shows skipOwn false, writes no env file and removes the broken webhook', async () => {
    const w = world({ ignoreSkipOwn: true })
    const { code, all } = await w.run(['create'])
    expect(code).toBe(1)
    expect(all).toContain('skipown_not_effective')
    expect(all).not.toContain(FAKE_SECRET)
    expect(existsSync(w.envFile)).toBe(false)
    expect(w.fake.state.records.Webhook ?? []).toHaveLength(0)
  })

  it('an existing webhook with skipOwn false is reported and fails the run', async () => {
    const w = world()
    w.fake.state.records.Webhook = [
      { id: 'c00000000000000aa', event: WEBHOOK_EVENT, url: DEFAULT_WEBHOOK_URL, isActive: true, skipOwn: false, userId: null, secretKey: FAKE_SECRET },
    ]
    const { code, stdout } = await w.run(['create'])
    expect(code).toBe(1)
    expect(stdout).toContain('webhook=exists id=c00000000000000aa skipOwn=false')
    expect(w.webhookPosts()).toHaveLength(0)
  })

  it('never creates the webhook with the admin identity', async () => {
    const w = world()
    await w.run(['create'])
    expect(w.fake.requests.filter((r) => r.headers['espo-authorization'])).toHaveLength(0)
  })
})

describe('webhook list', () => {
  it('prints one line per webhook with id, event, active, skipOwn and owner, and no secret', async () => {
    const w = world()
    w.fake.state.records.Webhook = [
      { id: 'c00000000000000a1', event: 'Contact.update', url: DEFAULT_WEBHOOK_URL, isActive: true, skipOwn: true, userId: SYNC_USER_ID, secretKey: FAKE_SECRET },
      { id: 'c00000000000000a2', event: 'Lead.create', url: 'https://other.example/x', isActive: false, skipOwn: false, userId: null, secretKey: FAKE_SECRET },
    ]
    const { code, stdout, all } = await w.run(['list'])
    expect(code).toBe(0)
    expect(stdout.trim().split('\n')).toEqual([
      'id=c00000000000000a1 event=Contact.update active=true skipOwn=true owner=set',
      'id=c00000000000000a2 event=Lead.create active=false skipOwn=false owner=none',
    ])
    expect(all).not.toContain(FAKE_SECRET)
    expect(all).not.toContain('https://')
  })
})

describe('parseWebhookArgs', () => {
  it('parses the commands with the default URL', () => {
    expect(parseWebhookArgs(['create'])).toEqual({ command: 'create', url: DEFAULT_WEBHOOK_URL, allowHost: false })
    expect(parseWebhookArgs(['list'])).toMatchObject({ command: 'list' })
    expect(parseWebhookArgs(['probe'])).toMatchObject({ command: 'probe' })
    expect(parseWebhookArgs(['--print', 'secret'])).toMatchObject({ command: 'print', printKind: 'secret' })
    expect(parseWebhookArgs(['--print=id'])).toMatchObject({ command: 'print', printKind: 'id' })
    expect(parseWebhookArgs(['delete', 'c00000000000000a1'])).toMatchObject({ command: 'delete', id: 'c00000000000000a1' })
  })

  it('refuses a missing or unknown command, an unknown flag and a bad print kind', () => {
    expect(() => parseWebhookArgs([])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['purge'])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['create', '--nope'])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['--print', 'password'])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['--print'])).toThrow(EspoConfigError)
  })

  it('refuses a non-https URL or another host unless --allow-host is given', () => {
    expect(() => parseWebhookArgs(['create', '--url', 'http://rideprestigo.com/api/webhooks/espocrm'])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['create', '--url', 'https://evil.example/x'])).toThrow(EspoConfigError)
    expect(() => parseWebhookArgs(['create', '--url', 'not a url'])).toThrow(EspoConfigError)
    expect(parseWebhookArgs(['create', '--url', 'https://evil.example/x', '--allow-host'])).toMatchObject({
      url: 'https://evil.example/x',
      allowHost: true,
    })
  })

  it('refuses a delete id that is not 17 lowercase hex, before any request', async () => {
    for (const id of ['', 'abc', 'C00000000000000A1', 'c00000000000000a1x', '../Role']) {
      expect(() => parseWebhookArgs(['delete', id])).toThrow(EspoConfigError)
    }
    expect(() => parseWebhookArgs(['delete'])).toThrow(EspoConfigError)
    const w = world()
    await expect(w.run(['delete', 'nothex'])).rejects.toBeInstanceOf(EspoConfigError)
    expect(w.fake.requests).toHaveLength(0)
  })
})

describe('espoSignature', () => {
  it('is base64("<webhookId>:<hex HMAC-SHA256(body, secret)>") exactly like EspoCRM 10.0.8', () => {
    const hex = createHmac('sha256', 'fake-secret').update('[]').digest('hex')
    expect(espoSignature('a00000000000000w1', 'fake-secret', '[]')).toBe(Buffer.from(`a00000000000000w1:${hex}`).toString('base64'))
  })
})

describe('webhook --print custody (TTY refusal)', () => {
  const seeded = async () => {
    const w = world()
    await w.run(['create'])
    return w
  }

  it('TTY stdout: exit 1, nothing on stdout, no secret anywhere', async () => {
    const w = await seeded()
    const { code, stdout, stderr } = await w.run(['--print', 'secret'], { isTTY: true })
    expect(code).toBe(1)
    expect(stdout).toBe('')
    expect(stderr).not.toContain(FAKE_SECRET)
  })

  it('non-TTY stdout: writes exactly the stored secret, no trailing newline', async () => {
    const w = await seeded()
    const { code, stdout } = await w.run(['--print', 'secret'], { isTTY: false })
    expect(code).toBe(0)
    expect(stdout).toBe(FAKE_SECRET)
  })

  it('print id writes the stored id, also only to a pipe', async () => {
    const w = await seeded()
    const id = w.fake.state.records.Webhook[0].id
    expect((await w.run(['--print', 'id'], { isTTY: false })).stdout).toBe(id)
    expect((await w.run(['--print', 'id'], { isTTY: true })).stdout).toBe('')
  })

  it('exits 2 with a hint when nothing is stored', async () => {
    const w = world()
    const { code, stdout, stderr } = await w.run(['--print', 'secret'])
    expect(code).toBe(2)
    expect(stdout).toBe('')
    expect(stderr).toContain('webhook.mjs create')
  })
})

describe('webhook delete', () => {
  it('sends one DELETE /Webhook/<id> and removes the env file when it holds that id', async () => {
    const w = world()
    await w.run(['create'])
    const id = w.fake.state.records.Webhook[0].id
    const { code, stdout } = await w.run(['delete', id])
    expect(code).toBe(0)
    expect(stdout).toContain(`webhook=deleted id=${id}`)
    expect(w.fake.requests.filter((r) => r.method === 'DELETE' && r.path === `/Webhook/${id}`)).toHaveLength(1)
    expect(existsSync(w.envFile)).toBe(false)
    expect(w.fake.state.records.Webhook).toHaveLength(0)
  })

  it('keeps the env file when another webhook is deleted (rotation of the old one)', async () => {
    const w = world()
    await w.run(['create'])
    w.fake.state.records.Webhook.push({
      id: 'c00000000000000b1',
      event: 'Contact.update',
      url: 'https://old.example/x',
      skipOwn: true,
      userId: SYNC_USER_ID,
    })
    expect((await w.run(['delete', 'c00000000000000b1'])).code).toBe(0)
    expect(existsSync(w.envFile)).toBe(true)
  })
})

describe('webhook probe (D-19 live check)', () => {
  /** A fake receiver verifying the Signature header the way the site must: HMAC over the raw body. */
  const receiver = (id: string, secret: string, seen: any[] = []) => async (url: string, init: any) => {
    seen.push({ url, init })
    const [claimed, hex] = Buffer.from(String(init.headers.Signature), 'base64').toString('utf8').split(':')
    const expected = createHmac('sha256', secret).update(String(init.body)).digest('hex')
    return new Response('', { status: claimed === id && hex === expected ? 200 : 401 })
  }

  const seeded = async () => {
    const w = world()
    await w.run(['create'])
    return { w, id: w.fake.state.records.Webhook[0].id as string }
  }

  it('verdict=ok for 200 (good signature) then 401 (tampered body); output never contains the secret', async () => {
    const { w, id } = await seeded()
    const seen: any[] = []
    const { code, stdout, all } = await w.run(['probe'], { fetchImpl: receiver(id, FAKE_SECRET, seen) })
    expect(code).toBe(0)
    expect(stdout).toContain('probe_status=200,401')
    expect(stdout).toContain('verdict=ok')
    expect(all).not.toContain(FAKE_SECRET)
    expect(seen).toHaveLength(2)
    expect(seen[0].url).toBe(DEFAULT_WEBHOOK_URL)
    expect(seen[0].init.headers['Content-Type']).toBe('application/json')
    // an unlinked synthetic contact: a random 17 hex id inside an array payload like EspoCRM's Sender
    const batch = JSON.parse(seen[0].init.body)
    expect(batch).toHaveLength(1)
    expect(batch[0].id).toMatch(/^[0-9a-f]{17}$/)
    expect(seen[1].init.body).not.toBe(seen[0].init.body)
    expect(seen[1].init.headers.Signature).toBe(seen[0].init.headers.Signature)
  })

  it('verdict=fail (exit 1) when the receiver answers 200 for both, i.e. it does not verify the signature', async () => {
    const { w } = await seeded()
    const { code, stdout, all } = await w.run(['probe'], { fetchImpl: async () => new Response('', { status: 200 }) })
    expect(code).toBe(1)
    expect(stdout).toContain('probe_status=200,200')
    expect(stdout).toContain('verdict=fail')
    expect(all).not.toContain(FAKE_SECRET)
  })

  it('verdict=fail when the receiver rejects the good signature (wrong secret deployed)', async () => {
    const { w, id } = await seeded()
    const { code, stdout } = await w.run(['probe'], { fetchImpl: receiver(id, 'some-other-secret') })
    expect(code).toBe(1)
    expect(stdout).toContain('probe_status=401,401')
    expect(stdout).toContain('verdict=fail')
  })

  it('a network failure is a fail with no detail beyond the error name', async () => {
    const { w } = await seeded()
    const { code, stdout, all } = await w.run(['probe'], {
      fetchImpl: async () => {
        throw new TypeError(`connect refused ${FAKE_SECRET}`)
      },
    })
    expect(code).toBe(1)
    expect(stdout).toContain('verdict=fail')
    expect(all).not.toContain(FAKE_SECRET)
  })

  it('exits 2 without any request when no webhook is stored', async () => {
    const w = world()
    let called = 0
    const { code } = await w.run(['probe'], {
      fetchImpl: async () => {
        called++
        return new Response('', { status: 200 })
      },
    })
    expect(code).toBe(2)
    expect(called).toBe(0)
  })
})
