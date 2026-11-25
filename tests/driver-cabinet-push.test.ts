import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDriverCabinetDb, type FakeDriverCabinetDb } from './helpers/fake-driver-cabinet-db'

// Phase 94 plan 94-05 (DCAB-12, D-09): the push transport and the subscribe / unsubscribe route.
// web-push is mocked: delivery to real devices cannot be proven in CI (owner proof in 94-14).

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown },
  cookieJar: new Map<string, string>(),
  rate: { allowed: true, keys: [] as string[] },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: h.setVapidDetails, sendNotification: h.sendNotification },
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => h.db.client,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookieJar.has(name) ? { name, value: h.cookieJar.get(name) } : undefined),
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async (key: string) => {
    h.rate.keys.push(key)
    return { allowed: h.rate.allowed }
  },
  getClientIp: () => '203.0.113.7',
}))

import { DELETE, POST } from '@/app/api/driver/cabinet/push/route'
import { DRIVER_SESSION_COOKIE, createDriverSession } from '@/lib/driver-cabinet/auth'
import { pushConfigured, sendDriverPush, vapidPublicKey } from '@/lib/driver-cabinet/push'

const DRIVER_A = 'a0000002-0000-4000-8000-000000000002'
const DRIVER_B = 'a0000003-0000-4000-8000-000000000003'
const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/endpoint-a-secret'
const ENDPOINT_B = 'https://updates.push.services.mozilla.com/wpush/v2/endpoint-b-secret'
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }

const PAYLOAD = { title: 'New offer', body: 'Tomorrow 09:30, Prague to Vienna, Business', url: '/driver/offers', tag: 'offer-1' }

let db: FakeDriverCabinetDb
let consoleError: ReturnType<typeof vi.spyOn>

function setVapid() {
  process.env.VAPID_PUBLIC_KEY = 'pub-key'
  process.env.VAPID_PRIVATE_KEY = 'priv-key'
  process.env.VAPID_SUBJECT = 'mailto:office@example.com'
}

function clearVapid() {
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  delete process.env.VAPID_SUBJECT
}

beforeEach(() => {
  db = createFakeDriverCabinetDb({
    drivers: [
      { id: DRIVER_A, name: 'Ana', email: 'ana@example.com', cabinet_enabled: true },
      { id: DRIVER_B, name: 'Boris', email: 'boris@example.com', cabinet_enabled: true },
    ],
  })
  h.db = db
  h.cookieJar.clear()
  h.rate.allowed = true
  h.rate.keys = []
  h.setVapidDetails.mockReset()
  h.sendNotification.mockReset()
  h.sendNotification.mockResolvedValue({ statusCode: 201 })
  setVapid()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  clearVapid()
  consoleError.mockRestore()
})

async function signIn(driverId: string) {
  const { token } = await createDriverSession(db.client as never, driverId)
  h.cookieJar.set(DRIVER_SESSION_COOKIE, token)
}

function req(method: 'POST' | 'DELETE', body: unknown, raw = false) {
  return new Request('http://localhost/api/driver/cabinet/push', {
    method,
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

function seedSub(driverId: string, endpoint: string) {
  db.tables.driver_push_subscriptions.push({
    id: `sub-${endpoint.length}-${driverId.slice(-2)}`,
    driver_id: driverId,
    endpoint,
    p256dh: KEYS.p256dh,
    auth: KEYS.auth,
  })
}

describe('pushConfigured / vapidPublicKey', () => {
  it('is true only when all three variables are set', () => {
    expect(pushConfigured()).toBe(true)
    expect(vapidPublicKey()).toBe('pub-key')
    for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
      setVapid()
      process.env[name] = '  '
      expect(pushConfigured()).toBe(false)
      delete process.env[name]
      expect(pushConfigured()).toBe(false)
    }
  })

  it('has no public key when unset', () => {
    clearVapid()
    expect(vapidPublicKey()).toBeNull()
  })
})

describe('sendDriverPush (D-09, DCAB-12)', () => {
  it('is a silent no-op without keys: no query, no web-push call', async () => {
    clearVapid()
    seedSub(DRIVER_A, ENDPOINT_A)
    const result = await sendDriverPush(db.client as never, DRIVER_A, PAYLOAD)
    expect(result).toEqual({ sent: 0, pruned: 0 })
    expect(db.calls).toHaveLength(0)
    expect(h.setVapidDetails).not.toHaveBeenCalled()
    expect(h.sendNotification).not.toHaveBeenCalled()
  })

  it("sends once per subscription of that driver only, with the VAPID details, JSON payload and { TTL, urgency }", async () => {
    seedSub(DRIVER_A, ENDPOINT_A)
    seedSub(DRIVER_B, ENDPOINT_B)
    const result = await sendDriverPush(db.client as never, DRIVER_A, PAYLOAD)
    expect(result).toEqual({ sent: 1, pruned: 0 })
    expect(h.setVapidDetails).toHaveBeenCalledWith('mailto:office@example.com', 'pub-key', 'priv-key')
    expect(h.sendNotification).toHaveBeenCalledTimes(1)
    const [sub, body, options] = h.sendNotification.mock.calls[0]
    expect(sub).toEqual({ endpoint: ENDPOINT_A, keys: { p256dh: KEYS.p256dh, auth: KEYS.auth } })
    expect(JSON.parse(body)).toEqual(PAYLOAD)
    expect(options).toEqual({ TTL: 3600, urgency: 'high' })
  })

  it.each([410, 404])('prunes a subscription answered %i', async (statusCode) => {
    seedSub(DRIVER_A, ENDPOINT_A)
    seedSub(DRIVER_B, ENDPOINT_B)
    h.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode }))
    const result = await sendDriverPush(db.client as never, DRIVER_A, PAYLOAD)
    expect(result).toEqual({ sent: 0, pruned: 1 })
    const left = db.tables.driver_push_subscriptions.map((r) => r.endpoint)
    expect(left).toEqual([ENDPOINT_B])
  })

  it('keeps the row on a 500 and logs the status code only', async () => {
    seedSub(DRIVER_A, ENDPOINT_A)
    h.sendNotification.mockRejectedValue(
      Object.assign(new Error(`failed for ${ENDPOINT_A} key ${KEYS.auth}`), {
        statusCode: 500,
        endpoint: ENDPOINT_A,
        body: JSON.stringify(PAYLOAD),
      }),
    )
    const result = await sendDriverPush(db.client as never, DRIVER_A, PAYLOAD)
    expect(result).toEqual({ sent: 0, pruned: 0 })
    expect(db.tables.driver_push_subscriptions).toHaveLength(1)
    expect(consoleError).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(consoleError.mock.calls[0])
    expect(logged).toContain('[driver-push]')
    expect(logged).toContain('500')
    expect(logged).not.toContain(ENDPOINT_A)
    expect(logged).not.toContain('fcm.googleapis.com')
    expect(logged).not.toContain(KEYS.auth)
    expect(logged).not.toContain(KEYS.p256dh)
    expect(logged).not.toContain('Prague')
  })

  it('never throws, even when the lookup or web-push configuration blows up', async () => {
    h.setVapidDetails.mockImplementation(() => {
      throw new Error('bad vapid')
    })
    seedSub(DRIVER_A, ENDPOINT_A)
    await expect(sendDriverPush(db.client as never, DRIVER_A, PAYLOAD)).resolves.toEqual({ sent: 0, pruned: 0 })

    h.setVapidDetails.mockReset()
    const broken = {
      from: () => {
        throw new Error('db down')
      },
    }
    await expect(sendDriverPush(broken as never, DRIVER_A, PAYLOAD)).resolves.toEqual({ sent: 0, pruned: 0 })
  })

  it.each(['https://evil.example/driver/offers', '//evil.example/driver/', '/admin', '/driver', 'javascript:alert(1)', '/driver/../admin'])(
    'rewrites the url %s to /driver/offers',
    async (url) => {
      seedSub(DRIVER_A, ENDPOINT_A)
      await sendDriverPush(db.client as never, DRIVER_A, { ...PAYLOAD, url })
      expect(JSON.parse(h.sendNotification.mock.calls[0][1]).url).toBe('/driver/offers')
    },
  )

  it('keeps a same-origin /driver/ url', async () => {
    seedSub(DRIVER_A, ENDPOINT_A)
    await sendDriverPush(db.client as never, DRIVER_A, { ...PAYLOAD, url: '/driver/rides/abc' })
    expect(JSON.parse(h.sendNotification.mock.calls[0][1]).url).toBe('/driver/rides/abc')
  })
})

describe('POST /api/driver/cabinet/push', () => {
  const good = { endpoint: ENDPOINT_A, keys: KEYS }

  it('401 without a session and writes nothing', async () => {
    const res = await POST(req('POST', good))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
    expect(db.tables.driver_push_subscriptions).toHaveLength(0)
  })

  it('rate-limits under the push key, before the session check', async () => {
    h.rate.allowed = false
    const res = await POST(req('POST', good))
    expect(res.status).toBe(429)
    expect(h.rate.keys).toEqual(['/api/driver/cabinet/push'])
  })

  it('413 on an oversized body', async () => {
    await signIn(DRIVER_A)
    const big = new Request('http://localhost/api/driver/cabinet/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '5000' },
      body: JSON.stringify(good),
    })
    const res = await POST(big)
    expect(res.status).toBe(413)
  })

  it('400 invalid_json', async () => {
    await signIn(DRIVER_A)
    const res = await POST(req('POST', '{nope', true))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_json' })
  })

  it.each([
    ['http endpoint', { endpoint: 'http://push.example/x', keys: KEYS }],
    ['endpoint too long', { endpoint: `https://push.example/${'a'.repeat(1000)}`, keys: KEYS }],
    ['p256dh with a bad character', { endpoint: ENDPOINT_A, keys: { ...KEYS, p256dh: 'abc def' } }],
    ['p256dh too long', { endpoint: ENDPOINT_A, keys: { ...KEYS, p256dh: 'a'.repeat(201) } }],
    ['auth too long', { endpoint: ENDPOINT_A, keys: { ...KEYS, auth: 'a'.repeat(101) } }],
    ['auth empty', { endpoint: ENDPOINT_A, keys: { ...KEYS, auth: '' } }],
    ['missing keys', { endpoint: ENDPOINT_A }],
  ])('400 invalid_payload: %s', async (_label, body) => {
    await signIn(DRIVER_A)
    const res = await POST(req('POST', body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_payload' })
    expect(db.tables.driver_push_subscriptions).toHaveLength(0)
  })

  it('503 push_not_configured without keys, nothing stored', async () => {
    clearVapid()
    await signIn(DRIVER_A)
    const res = await POST(req('POST', good))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'push_not_configured' })
    expect(db.tables.driver_push_subscriptions).toHaveLength(0)
  })

  it('upserts on endpoint with the session driver, no-store', async () => {
    await signIn(DRIVER_A)
    const res = await POST(req('POST', good))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true })
    expect(db.tables.driver_push_subscriptions).toHaveLength(1)
    expect(db.tables.driver_push_subscriptions[0]).toMatchObject({
      driver_id: DRIVER_A,
      endpoint: ENDPOINT_A,
      p256dh: KEYS.p256dh,
      auth: KEYS.auth,
    })
  })

  it('ignores a driver_id in the body', async () => {
    await signIn(DRIVER_A)
    const res = await POST(req('POST', { ...good, driver_id: DRIVER_B }))
    expect(res.status).toBe(200)
    expect(db.tables.driver_push_subscriptions[0].driver_id).toBe(DRIVER_A)
  })

  it('moves the row to the second driver when the same endpoint is posted again', async () => {
    await signIn(DRIVER_A)
    await POST(req('POST', good))
    await signIn(DRIVER_B)
    const res = await POST(req('POST', good))
    expect(res.status).toBe(200)
    expect(db.tables.driver_push_subscriptions).toHaveLength(1)
    expect(db.tables.driver_push_subscriptions[0].driver_id).toBe(DRIVER_B)
  })
})

describe('DELETE /api/driver/cabinet/push', () => {
  it('401 without a session', async () => {
    seedSub(DRIVER_A, ENDPOINT_A)
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT_A }))
    expect(res.status).toBe(401)
    expect(db.tables.driver_push_subscriptions).toHaveLength(1)
  })

  it('400 on a non-https endpoint', async () => {
    await signIn(DRIVER_A)
    const res = await DELETE(req('DELETE', { endpoint: 'http://x.example/' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_payload' })
  })

  it('removes only the session driver row; another driver endpoint stays', async () => {
    seedSub(DRIVER_A, ENDPOINT_A)
    seedSub(DRIVER_B, ENDPOINT_B)
    await signIn(DRIVER_A)
    const own = await DELETE(req('DELETE', { endpoint: ENDPOINT_A }))
    expect(own.status).toBe(200)
    expect(own.headers.get('Cache-Control')).toBe('no-store')
    const foreign = await DELETE(req('DELETE', { endpoint: ENDPOINT_B }))
    expect(foreign.status).toBe(200)
    expect(db.tables.driver_push_subscriptions.map((r) => r.endpoint)).toEqual([ENDPOINT_B])
  })

  it('answers 200 for a row that does not exist', async () => {
    await signIn(DRIVER_A)
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT_A }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rate-limits under the push key', async () => {
    h.rate.allowed = false
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT_A }))
    expect(res.status).toBe(429)
    expect(h.rate.keys).toEqual(['/api/driver/cabinet/push'])
  })
})

describe('no endpoint or key in route logs', () => {
  it('a database failure on POST logs nothing that names the endpoint or keys', async () => {
    await signIn(DRIVER_A)
    db.failWritesOn.add('driver_push_subscriptions')
    const res = await POST(req('POST', { endpoint: ENDPOINT_A, keys: KEYS }))
    expect(res.status).toBe(500)
    const logged = JSON.stringify(consoleError.mock.calls)
    expect(logged).not.toContain(ENDPOINT_A)
    expect(logged).not.toContain(KEYS.auth)
  })
})
