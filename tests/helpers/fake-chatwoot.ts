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
 */

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
  /** Number of conversations that move on merge. */
  conversations: number
  online: boolean
}

export interface FakeChatwootOptions {
  accountId?: string
  /** token -> role. */
  tokens?: Record<string, 'agent' | 'administrator'>
  contacts?: Array<Partial<FakeContact>>
  /** Return a Response to handle a request before the built-in routes (rate limits, 5xx, stalls). */
  intercept?: (req: FakeCwReq, state: FakeChatwootState) => Response | undefined | Promise<Response | undefined>
}

export interface FakeChatwootState {
  contacts: FakeContact[]
  nextId: number
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
    additional_attributes: {},
  }
}

function lower(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : ''
}

export function createFakeChatwoot(options: FakeChatwootOptions = {}) {
  const accountId = options.accountId ?? '1'
  const tokens = options.tokens ?? { [FAKE_AGENT_TOKEN]: 'agent', [FAKE_ADMIN_TOKEN]: 'administrator' }
  const state: FakeChatwootState = { contacts: [], nextId: 1 }
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
      conversations: partial.conversations ?? 0,
      online: partial.online ?? false,
    }
    state.contacts.push(contact)
    return contact
  }
  for (const c of options.contacts ?? []) seed(c)

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
      })
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

  return { fetchImpl, state, requests, merges, writes, seed }
}

export type FakeChatwoot = ReturnType<typeof createFakeChatwoot>
