/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 82 (plan 82-10): in-memory fake of the Chatwoot v4.18 contacts API used by the site-side
 * client. Injected as `fetchImpl` into createSiteChatwootClient; no test using it makes a network
 * call or reads a real credential.
 *
 * Models what the site depends on (RESEARCH, cited from the v4.18.0 source):
 *  - email unique per account, case-insensitive; phone_number unique and `^\+[1-9]\d{1,14}$`;
 *    identifier unique; violations answer 422
 *  - update merges custom_attributes shallowly
 *  - POST /contacts/filter with the exact `equal_to` payload shape (a different shape answers 422)
 *  - POST /actions/contact_merge and DELETE /contacts/:id need an administrator token (401 otherwise);
 *    merge moves conversations and destroys the mergee (base wins on attribute conflicts);
 *    DELETE of an online contact answers 422
 *  - the token must arrive in the hyphenated `api-access-token` header
 *
 * Phase 83 (plan 83-06) extension - THE ONLY plan of Phase 83 that edits this helper (wave rule:
 * later plans use the `intercept` / `onWrite` hooks and seed options instead of editing it):
 *  - conversations: GET /conversations/:id (meta.channel, meta.sender = contact view; 404 unknown)
 *    and GET /conversations/:id/messages?after=<id> (ascending, 100 per page, integer message_type)
 *  - GET /inboxes/:id
 *  - contacts carry additional_attributes (default {}), merged shallowly on PUT, returned by show
 *  - webhooks: GET/POST/PATCH/DELETE /webhooks, administrator token only (401 otherwise); the secret
 *    is generated on create and returned in list and create answers; a duplicate url answers 422
 *  - `onWrite(req, state)` runs after every successful contact create and update
 */

import { randomBytes } from 'node:crypto'

export interface FakeCwReq {
  method: string
  /** Path relative to /api/v1/accounts/<id>, no query string. */
  path: string
  query: string
  body: any
  /** Lower-cased header names. */
  headers: Record<string, string>
}

export interface FakeContact {
  id: number
  name: string
  email: string | null
  phone_number: string | null
  identifier: string | null
  custom_attributes: Record<string, any>
  additional_attributes: Record<string, any>
  /** Number of conversations that move on merge. */
  conversations: number
  online: boolean
}

export interface FakeMessage {
  id: number
  content: string
  /** Chatwoot integer enum: 0 incoming, 1 outgoing, 2 activity, 3 template. */
  message_type: 0 | 1 | 2 | 3
  private: boolean
  content_attributes: Record<string, any>
  sender: any
  created_at: number
}

export interface FakeConversation {
  id: number
  inbox_id: number
  status: string
  labels: string[]
  created_at: number
  contact_id: number | null
  channel: string
  messages: FakeMessage[]
}

export interface FakeInbox {
  id: number
  name: string
  channel_type: string
}

export interface FakeWebhook {
  id: number
  name: string
  url: string
  subscriptions: string[]
  secret: string
}

export interface FakeConversationSeed {
  id: number
  inbox_id: number
  status?: string
  labels?: string[]
  created_at?: number
  contact_id?: number | null
  channel?: string
  messages?: Array<{
    id?: number
    content: string
    message_type: 0 | 1 | 2 | 3
    private?: boolean
    content_attributes?: Record<string, any>
    sender?: any
    created_at?: number
  }>
}

export interface FakeChatwootOptions {
  accountId?: string
  /** token -> role. */
  tokens?: Record<string, 'agent' | 'administrator'>
  contacts?: Array<Partial<FakeContact>>
  inboxes?: FakeInbox[]
  conversations?: FakeConversationSeed[]
  webhooks?: Array<{ id?: number; name: string; url: string; subscriptions: string[]; secret?: string }>
  /** Called after every successful contact create and update (the plan-83 sync-echo hook). */
  onWrite?: (req: FakeCwReq, state: FakeChatwootState) => void
  /** Return a Response to handle a request before the built-in routes (rate limits, 5xx, stalls). */
  intercept?: (req: FakeCwReq, state: FakeChatwootState) => Response | undefined | Promise<Response | undefined>
}

export interface FakeChatwootState {
  contacts: FakeContact[]
  nextId: number
  conversations: FakeConversation[]
  inboxes: FakeInbox[]
  webhooks: FakeWebhook[]
  nextMessageId: number
  nextWebhookId: number
}

export const FAKE_AGENT_TOKEN = 'cw_agent_SECRET_0123456789'
export const FAKE_ADMIN_TOKEN = 'cw_admin_SECRET_9876543210'

const PHONE_RE = /^\+[1-9]\d{1,14}$/

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const unprocessable = (attribute: string) =>
  json({ message: `${attribute} has already been taken`, attributes: [attribute] }, 422)

function view(c: FakeContact) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone_number: c.phone_number,
    identifier: c.identifier,
    custom_attributes: c.custom_attributes,
    additional_attributes: c.additional_attributes,
  }
}

function webhookView(w: FakeWebhook) {
  return { id: w.id, name: w.name, url: w.url, subscriptions: w.subscriptions, secret: w.secret, account_id: 1 }
}

const MESSAGES_PAGE_SIZE = 100

function lower(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : ''
}

export function createFakeChatwoot(options: FakeChatwootOptions = {}) {
  const accountId = options.accountId ?? '1'
  const tokens = options.tokens ?? { [FAKE_AGENT_TOKEN]: 'agent', [FAKE_ADMIN_TOKEN]: 'administrator' }
  const state: FakeChatwootState = {
    contacts: [],
    nextId: 1,
    conversations: [],
    inboxes: [...(options.inboxes ?? [])],
    webhooks: [],
    nextMessageId: 1,
    nextWebhookId: 1,
  }
  const requests: FakeCwReq[] = []
  const merges: Array<{ base: number; mergee: number }> = []

  function seed(partial: Partial<FakeContact>): FakeContact {
    const id = partial.id ?? state.nextId
    state.nextId = Math.max(state.nextId, id + 1)
    const contact: FakeContact = {
      id,
      name: partial.name ?? '',
      email: partial.email ? partial.email.toLowerCase() : null,
      phone_number: partial.phone_number ?? null,
      identifier: partial.identifier ?? null,
      custom_attributes: { ...(partial.custom_attributes ?? {}) },
      additional_attributes: { ...(partial.additional_attributes ?? {}) },
      conversations: partial.conversations ?? 0,
      online: partial.online ?? false,
    }
    state.contacts.push(contact)
    return contact
  }
  for (const c of options.contacts ?? []) seed(c)

  function seedConversation(partial: FakeConversationSeed): FakeConversation {
    const conversation: FakeConversation = {
      id: partial.id,
      inbox_id: partial.inbox_id,
      status: partial.status ?? 'open',
      labels: [...(partial.labels ?? [])],
      created_at: partial.created_at ?? 1_729_900_000,
      contact_id: partial.contact_id ?? null,
      channel: partial.channel ?? 'Channel::WebWidget',
      messages: [],
    }
    for (const m of partial.messages ?? []) {
      const id = m.id ?? state.nextMessageId
      state.nextMessageId = Math.max(state.nextMessageId, id + 1)
      conversation.messages.push({
        id,
        content: m.content,
        message_type: m.message_type,
        private: m.private ?? false,
        content_attributes: { ...(m.content_attributes ?? {}) },
        sender: m.sender ?? null,
        created_at: m.created_at ?? conversation.created_at,
      })
    }
    state.conversations.push(conversation)
    return conversation
  }
  for (const c of options.conversations ?? []) seedConversation(c)

  function seedWebhook(partial: { id?: number; name: string; url: string; subscriptions: string[]; secret?: string }): FakeWebhook {
    const id = partial.id ?? state.nextWebhookId
    state.nextWebhookId = Math.max(state.nextWebhookId, id + 1)
    const webhook: FakeWebhook = {
      id,
      name: partial.name,
      url: partial.url,
      subscriptions: [...partial.subscriptions],
      secret: partial.secret ?? `fake_whsec_${randomBytes(12).toString('hex')}`,
    }
    state.webhooks.push(webhook)
    return webhook
  }
  for (const w of options.webhooks ?? []) seedWebhook(w)

  /** The uniqueness rules; `self` is excluded on update. Returns the violated attribute or null. */
  function conflict(next: { email?: string | null; phone_number?: string | null; identifier?: string | null }, self?: number) {
    for (const c of state.contacts) {
      if (c.id === self) continue
      if (next.email && c.email && c.email.toLowerCase() === next.email.toLowerCase()) return 'email'
      if (next.phone_number && c.phone_number === next.phone_number) return 'phone_number'
      if (next.identifier && c.identifier === next.identifier) return 'identifier'
    }
    return null
  }

  function invalidPhone(phone: unknown): boolean {
    return typeof phone === 'string' && phone !== '' && !PHONE_RE.test(phone)
  }

  function matchesFilter(c: FakeContact, cond: any): boolean {
    const key = cond.attribute_key
    const wanted = String(cond.values?.[0] ?? '')
    if (key === 'phone_number') return (c.phone_number ?? '') === (wanted.startsWith('+') ? wanted : `+${wanted}`)
    if (key === 'email') return lower(c.email) === wanted.toLowerCase()
    if (key === 'identifier') return lower(c.identifier) === wanted.toLowerCase()
    if (key === 'name') return lower(c.name) === wanted.toLowerCase()
    return false
  }

  async function handle(req: FakeCwReq): Promise<Response> {
    const role = tokens[req.headers['api-access-token'] ?? '']
    if (!role) return json({ error: 'Invalid Access Token' }, 401)

    const intercepted = await options.intercept?.(req, state)
    if (intercepted) return intercepted

    const isAdmin = role === 'administrator'
    const { method, path, body } = req

    const conv = /^\/conversations\/(\d+)(\/messages)?$/.exec(path)
    if (method === 'GET' && conv) {
      const conversation = state.conversations.find((c) => c.id === Number(conv[1]))
      if (!conversation) return json({ error: 'Resource could not be found' }, 404)
      if (conv[2]) {
        const after = Number(new URLSearchParams(req.query).get('after') ?? 0)
        const page = conversation.messages
          .filter((m) => m.id > (Number.isFinite(after) ? after : 0))
          .sort((a, b) => a.id - b.id)
          .slice(0, MESSAGES_PAGE_SIZE)
        return json({ payload: page })
      }
      const sender = state.contacts.find((c) => c.id === conversation.contact_id)
      return json({
        id: conversation.id,
        inbox_id: conversation.inbox_id,
        status: conversation.status,
        labels: conversation.labels,
        created_at: conversation.created_at,
        meta: { channel: conversation.channel, sender: sender ? view(sender) : null },
      })
    }

    const inboxMatch = /^\/inboxes\/(\d+)$/.exec(path)
    if (method === 'GET' && inboxMatch) {
      const inbox = state.inboxes.find((i) => i.id === Number(inboxMatch[1]))
      if (!inbox) return json({ error: 'Resource could not be found' }, 404)
      return json({ id: inbox.id, name: inbox.name, channel_type: inbox.channel_type })
    }

    if (path === '/webhooks' || /^\/webhooks\/\d+$/.test(path)) {
      if (!isAdmin) return json({ error: 'You are not authorized to do this action' }, 401)
      if (path === '/webhooks') {
        if (method === 'GET') return json({ payload: { webhooks: state.webhooks.map(webhookView) } })
        if (method === 'POST') {
          const w = body?.webhook
          if (typeof w?.url !== 'string' || w.url === '') return json({ message: 'Url is invalid', attributes: ['url'] }, 422)
          if (state.webhooks.some((x) => x.url === w.url)) return unprocessable('url')
          const created = seedWebhook({
            name: typeof w.name === 'string' ? w.name : '',
            url: w.url,
            subscriptions: Array.isArray(w.subscriptions) ? w.subscriptions : [],
          })
          return json({ payload: { webhook: webhookView(created) } })
        }
      } else {
        const id = Number(path.split('/')[2])
        const webhook = state.webhooks.find((x) => x.id === id)
        if (!webhook) return json({ error: 'Resource could not be found' }, 404)
        if (method === 'PATCH') {
          const w = body?.webhook ?? {}
          if (typeof w.name === 'string') webhook.name = w.name
          if (typeof w.url === 'string' && w.url !== '') webhook.url = w.url
          if (Array.isArray(w.subscriptions)) webhook.subscriptions = [...w.subscriptions]
          return json({ payload: { webhook: webhookView(webhook) } })
        }
        if (method === 'DELETE') {
          state.webhooks = state.webhooks.filter((x) => x.id !== id)
          return new Response('', { status: 200 })
        }
      }
    }

    if (method === 'POST' && path === '/contacts/filter') {
      const conds = body?.payload
      const valid =
        Array.isArray(conds) &&
        conds.length > 0 &&
        conds.every(
          (c: any) =>
            typeof c?.attribute_key === 'string' &&
            c.filter_operator === 'equal_to' &&
            Array.isArray(c.values) &&
            c.values.length > 0 &&
            (c.query_operator === null || c.query_operator === undefined || typeof c.query_operator === 'string'),
        )
      if (!valid) return json({ error: 'Invalid filter payload' }, 422)
      const hits = state.contacts.filter((c) => conds.every((cond: any) => matchesFilter(c, cond)))
      return json({ payload: hits.map(view), meta: { count: hits.length, current_page: 1 } })
    }

    if (method === 'POST' && path === '/contacts') {
      const email = typeof body?.email === 'string' && body.email !== '' ? body.email.toLowerCase() : null
      const phone = typeof body?.phone_number === 'string' && body.phone_number !== '' ? body.phone_number : null
      const identifier = typeof body?.identifier === 'string' && body.identifier !== '' ? body.identifier : null
      if (invalidPhone(phone)) return json({ message: 'Phone number should be in e164 format', attributes: ['phone_number'] }, 422)
      const taken = conflict({ email, phone_number: phone, identifier })
      if (taken) return unprocessable(taken)
      const created = seed({
        name: body?.name ?? '',
        email,
        phone_number: phone,
        identifier,
        custom_attributes: body?.custom_attributes ?? {},
        additional_attributes: body?.additional_attributes ?? {},
      })
      options.onWrite?.(req, state)
      return json({ payload: { contact: view(created), contact_inbox: null } })
    }

    if (method === 'POST' && path === '/actions/contact_merge') {
      if (!isAdmin) return json({ error: 'You are not authorized to do this action' }, 401)
      const base = state.contacts.find((c) => c.id === Number(body?.base_contact_id))
      const mergee = state.contacts.find((c) => c.id === Number(body?.mergee_contact_id))
      if (!base || !mergee || base.id === mergee.id) return json({ error: 'Resource could not be found' }, 404)
      // Base wins on attribute conflicts; empty identity fields are taken from the mergee.
      base.custom_attributes = { ...mergee.custom_attributes, ...base.custom_attributes }
      base.conversations += mergee.conversations
      state.contacts = state.contacts.filter((c) => c.id !== mergee.id)
      if (!base.email && mergee.email) base.email = mergee.email
      if (!base.phone_number && mergee.phone_number) base.phone_number = mergee.phone_number
      if (!base.identifier && mergee.identifier) base.identifier = mergee.identifier
      merges.push({ base: base.id, mergee: mergee.id })
      return json(view(base))
    }

    const m = /^\/contacts\/(\d+)$/.exec(path)
    if (m) {
      const contact = state.contacts.find((c) => c.id === Number(m[1]))
      if (!contact) return json({ error: 'Resource could not be found' }, 404)

      if (method === 'GET') return json({ payload: view(contact) })

      if (method === 'PUT') {
        const email = typeof body?.email === 'string' && body.email !== '' ? body.email.toLowerCase() : undefined
        const phone = typeof body?.phone_number === 'string' && body.phone_number !== '' ? body.phone_number : undefined
        const identifier = typeof body?.identifier === 'string' && body.identifier !== '' ? body.identifier : undefined
        if (invalidPhone(phone)) return json({ message: 'Phone number should be in e164 format', attributes: ['phone_number'] }, 422)
        const taken = conflict({ email, phone_number: phone, identifier }, contact.id)
        if (taken) return unprocessable(taken)
        if (typeof body?.name === 'string') contact.name = body.name
        if (email !== undefined) contact.email = email
        if (phone !== undefined) contact.phone_number = phone
        if (identifier !== undefined) contact.identifier = identifier
        if (body?.custom_attributes && typeof body.custom_attributes === 'object') {
          contact.custom_attributes = { ...contact.custom_attributes, ...body.custom_attributes }
        }
        if (body?.additional_attributes && typeof body.additional_attributes === 'object') {
          contact.additional_attributes = { ...contact.additional_attributes, ...body.additional_attributes }
        }
        options.onWrite?.(req, state)
        return json({ payload: view(contact) })
      }

      if (method === 'DELETE') {
        if (!isAdmin) return json({ error: 'You are not authorized to do this action' }, 401)
        if (contact.online) return json({ message: 'Contact is online' }, 422)
        state.contacts = state.contacts.filter((c) => c.id !== contact.id)
        return new Response('', { status: 200 })
      }
    }

    return json({ error: 'not found' }, 404)
  }

  const prefix = `/api/v1/accounts/${accountId}`
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input))
    if (init.redirect !== 'error') throw new Error('fake chatwoot: client must send redirect "error"')
    if (!url.pathname.startsWith(`${prefix}/`)) return json({ error: 'not found' }, 404)
    const headers: Record<string, string> = {}
    new Headers(init.headers as HeadersInit).forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    const req: FakeCwReq = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname.slice(prefix.length),
      query: url.search.replace(/^\?/, ''),
      body: typeof init.body === 'string' && init.body !== '' ? JSON.parse(init.body) : undefined,
      headers,
    }
    requests.push(req)
    return handle(req)
  }

  /** Requests that changed Chatwoot: everything except GET and the read-only filter lookup. */
  const writes = () => requests.filter((r) => r.method !== 'GET' && r.path !== '/contacts/filter')

  return { fetchImpl, state, requests, merges, writes, seed, seedConversation, seedWebhook }
}

export type FakeChatwoot = ReturnType<typeof createFakeChatwoot>
