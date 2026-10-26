// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 83, Plan 06 - the Phase 83 extension of tests/helpers/fake-chatwoot.ts: conversations,
 * message paging, inboxes, contact additional_attributes, the onWrite hook and administrator-only
 * webhook CRUD. Pre-existing fake behaviour is covered by tests/chatwoot-contact-sync.test.ts and
 * tests/chatwoot-sync.test.ts, which must keep passing unchanged.
 */
import { describe, it, expect, vi } from 'vitest'
import { createFakeChatwoot, FAKE_ADMIN_TOKEN, FAKE_AGENT_TOKEN } from './helpers/fake-chatwoot'

const BASE = 'https://chat.example.test/api/v1/accounts/1'

async function call(
  fake: ReturnType<typeof createFakeChatwoot>,
  method: string,
  path: string,
  body?: unknown,
  token = FAKE_AGENT_TOKEN,
) {
  const res = await fake.fetchImpl(`${BASE}${path}`, {
    method,
    headers: { 'api-access-token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

function seededMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({ content: `m${i + 1}`, message_type: 0 as const }))
}

describe('fake chatwoot - conversations, messages, inboxes', () => {
  const build = (extra: Partial<Parameters<typeof createFakeChatwoot>[0]> = {}) =>
    createFakeChatwoot({
      contacts: [{ id: 5, name: 'Anna Test', email: 'anna@x.test', phone_number: '+420777000111' }],
      inboxes: [{ id: 3, name: 'Website', channel_type: 'Channel::WebWidget' }],
      conversations: [
        {
          id: 42,
          inbox_id: 3,
          status: 'open',
          labels: ['ch-web'],
          created_at: 1_729_900_000,
          contact_id: 5,
          channel: 'Channel::WebWidget',
          messages: seededMessages(150),
        },
      ],
      ...extra,
    })

  it('GET /conversations/:id returns meta.channel and the contact view as meta.sender', async () => {
    const fake = build()
    const res = await call(fake, 'GET', '/conversations/42')
    expect(res.status).toBe(200)
    expect(res.json.id).toBe(42)
    expect(res.json.inbox_id).toBe(3)
    expect(res.json.status).toBe('open')
    expect(res.json.labels).toEqual(['ch-web'])
    expect(res.json.meta.channel).toBe('Channel::WebWidget')
    expect(res.json.meta.sender).toMatchObject({ id: 5, email: 'anna@x.test', additional_attributes: {} })
  })

  it('answers 404 for an unknown conversation id', async () => {
    const res = await call(build(), 'GET', '/conversations/999')
    expect(res.status).toBe(404)
  })

  it('pages messages ascending, 100 per page, after=<id>', async () => {
    const fake = build()
    const first = await call(fake, 'GET', '/conversations/42/messages?after=0')
    expect(first.json.payload).toHaveLength(100)
    const ids = first.json.payload.map((m: any) => m.id)
    expect([...ids].sort((a: number, b: number) => a - b)).toEqual(ids)
    const second = await call(fake, 'GET', `/conversations/42/messages?after=${ids[99]}`)
    expect(second.json.payload).toHaveLength(50)
    const lastId = second.json.payload[49].id
    const third = await call(fake, 'GET', `/conversations/42/messages?after=${lastId}`)
    expect(third.json.payload).toHaveLength(0)
  })

  it('returns messages with an integer message_type, private flag and content_attributes', async () => {
    const fake = build({
      conversations: [
        {
          id: 7,
          inbox_id: 3,
          status: 'open',
          labels: [],
          created_at: 1,
          contact_id: 5,
          channel: 'Channel::WebWidget',
          messages: [{ content: 'note', message_type: 1, private: true, content_attributes: { a: 1 } }],
        },
      ],
    })
    const res = await call(fake, 'GET', '/conversations/7/messages?after=0')
    expect(res.json.payload[0]).toMatchObject({
      content: 'note',
      message_type: 1,
      private: true,
      content_attributes: { a: 1 },
    })
    expect(typeof res.json.payload[0].id).toBe('number')
  })

  it('GET /inboxes/:id returns the seeded inbox', async () => {
    const res = await call(build(), 'GET', '/inboxes/3')
    expect(res.json).toEqual({ id: 3, name: 'Website', channel_type: 'Channel::WebWidget' })
  })
})

describe('fake chatwoot - contact additional_attributes and onWrite', () => {
  it('PUT merges additional_attributes shallowly and GET returns them', async () => {
    const fake = createFakeChatwoot({ contacts: [{ id: 1, name: 'A', email: 'a@x.test' }] })
    await call(fake, 'PUT', '/contacts/1', { additional_attributes: { company_name: 'Acme' } })
    await call(fake, 'PUT', '/contacts/1', { additional_attributes: { city: 'Prague' } })
    const res = await call(fake, 'GET', '/contacts/1')
    expect(res.json.payload.additional_attributes).toEqual({ company_name: 'Acme', city: 'Prague' })
  })

  it('defaults additional_attributes to {} on a created contact', async () => {
    const fake = createFakeChatwoot()
    const res = await call(fake, 'POST', '/contacts', { name: 'B', email: 'b@x.test' })
    expect(res.json.payload.contact.additional_attributes).toEqual({})
  })

  it('calls onWrite once per contact create and once per contact update', async () => {
    const onWrite = vi.fn()
    const fake = createFakeChatwoot({ onWrite })
    const created = await call(fake, 'POST', '/contacts', { name: 'C', email: 'c@x.test' })
    expect(onWrite).toHaveBeenCalledTimes(1)
    const id = created.json.payload.contact.id
    await call(fake, 'PUT', `/contacts/${id}`, { name: 'C2' })
    expect(onWrite).toHaveBeenCalledTimes(2)
    await call(fake, 'GET', `/contacts/${id}`)
    expect(onWrite).toHaveBeenCalledTimes(2)
    const [req, state] = onWrite.mock.calls[1]
    expect(req.method).toBe('PUT')
    expect(state.contacts[0].name).toBe('C2')
  })

  it('does not call onWrite for a rejected (422) write', async () => {
    const onWrite = vi.fn()
    const fake = createFakeChatwoot({ onWrite, contacts: [{ id: 1, email: 'a@x.test' }] })
    const res = await call(fake, 'POST', '/contacts', { name: 'dup', email: 'a@x.test' })
    expect(res.status).toBe(422)
    expect(onWrite).not.toHaveBeenCalled()
  })
})

describe('fake chatwoot - webhooks (administrator only)', () => {
  it('answers 401 to an agent token on every webhook route', async () => {
    const fake = createFakeChatwoot({ webhooks: [{ name: 'w', url: 'https://r.example.test/h', subscriptions: ['message_created'] }] })
    expect((await call(fake, 'GET', '/webhooks')).status).toBe(401)
    expect((await call(fake, 'POST', '/webhooks', { webhook: { name: 'x', url: 'https://r.example.test/x', subscriptions: [] } })).status).toBe(401)
    expect((await call(fake, 'PATCH', '/webhooks/1', { webhook: { subscriptions: [] } })).status).toBe(401)
    expect((await call(fake, 'DELETE', '/webhooks/1')).status).toBe(401)
  })

  it('creates with a generated secret and returns it in list and create answers', async () => {
    const fake = createFakeChatwoot()
    const created = await call(
      fake,
      'POST',
      '/webhooks',
      { webhook: { name: 'Prestigo site', url: 'https://r.example.test/h', subscriptions: ['message_created'] } },
      FAKE_ADMIN_TOKEN,
    )
    expect(created.status).toBe(200)
    const webhook = created.json.payload.webhook
    expect(webhook.id).toBe(1)
    expect(typeof webhook.secret).toBe('string')
    expect(webhook.secret.length).toBeGreaterThan(10)
    const list = await call(fake, 'GET', '/webhooks', undefined, FAKE_ADMIN_TOKEN)
    expect(list.json.payload.webhooks).toHaveLength(1)
    expect(list.json.payload.webhooks[0].secret).toBe(webhook.secret)
  })

  it('patches subscriptions and deletes by id; an unknown id answers 404', async () => {
    const fake = createFakeChatwoot({
      webhooks: [{ id: 4, name: 'w', url: 'https://r.example.test/h', subscriptions: ['message_created'], secret: 'seeded-fake-secret' }],
    })
    const patched = await call(fake, 'PATCH', '/webhooks/4', { webhook: { subscriptions: ['message_created', 'contact_updated'] } }, FAKE_ADMIN_TOKEN)
    expect(patched.status).toBe(200)
    expect(fake.state.webhooks[0].subscriptions).toEqual(['message_created', 'contact_updated'])
    expect(fake.state.webhooks[0].secret).toBe('seeded-fake-secret')
    expect((await call(fake, 'PATCH', '/webhooks/99', { webhook: {} }, FAKE_ADMIN_TOKEN)).status).toBe(404)
    expect((await call(fake, 'DELETE', '/webhooks/4', undefined, FAKE_ADMIN_TOKEN)).status).toBe(200)
    expect(fake.state.webhooks).toHaveLength(0)
    expect((await call(fake, 'DELETE', '/webhooks/4', undefined, FAKE_ADMIN_TOKEN)).status).toBe(404)
  })

  it('refuses a second webhook with the same url (422), like Chatwoot', async () => {
    const fake = createFakeChatwoot({ webhooks: [{ name: 'w', url: 'https://r.example.test/h', subscriptions: [] }] })
    const dup = await call(fake, 'POST', '/webhooks', { webhook: { name: 'x', url: 'https://r.example.test/h', subscriptions: [] } }, FAKE_ADMIN_TOKEN)
    expect(dup.status).toBe(422)
  })
})
