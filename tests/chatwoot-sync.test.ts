// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 77, Plan 07 — Chatwoot config-as-code sync, proven against an in-memory
 * fake Chatwoot API. No test here makes a network call or reads a real token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ChatwootApiError,
  createChatwootClient,
  loadChatwootConfig,
} from '../infra/chatwoot/lib/client.mjs'
import { buildInboxRefs, expandAutomationRules, planCollection, resolveRefs, runSync } from '../infra/chatwoot/sync.mjs'

const FAKE_TOKEN = 'tok_SECRET_0123456789abcdef'
const FAKE_HMAC = 'hmac_SECRET_fedcba9876543210'
const BASE = 'https://chat.example.test'
const OWNER_ID = 7
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const readConfig = (name: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'infra/chatwoot', name), 'utf8'))
const automationConfig = readConfig('automation-rules.json')
const KEYWORD_RULES = (automationConfig.topicRules as any[]).reduce(
  (n, t) => n + Object.values(t.keywords as Record<string, string[]>).reduce((m, k) => m + k.length, 0),
  0,
)

type Req = { method: string; path: string; body: any; headers: Record<string, string> }

interface FakeOptions {
  /** Pre-existing inboxes the owner created (email/telegram). */
  inboxes?: any[]
  /** Reject the optional label-routing rule with a 422. */
  rejectRouting?: boolean
  /** Reject this inbox channel field as unknown (422 naming the field). */
  rejectChannelField?: string
}

/** In-memory Chatwoot: state keyed by resource, every request recorded. */
function createFakeChatwoot(options: FakeOptions = {}) {
  const state = {
    account: { id: 1, support_email: 'Prestigo <notifications@example.test>' } as any,
    labels: [] as any[],
    teams: [] as any[],
    teamMembers: new Map<number, number[]>(),
    attributes: [] as any[],
    canned: [] as any[],
    inboxes: [...(options.inboxes ?? [])] as any[],
    inboxMembers: new Map<number, number[]>(),
    rules: [] as any[],
    avatarUploads: 0,
  }
  const requests: Req[] = []
  let nextId = 100

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchImpl = async (url: string, init: any = {}) => {
    const method = (init.method ?? 'GET') as string
    const headers = (init.headers ?? {}) as Record<string, string>
    const parsed = new URL(url)
    const p = parsed.pathname.replace(/^\/api\/v1(\/accounts\/\d+)?/, '')
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
    requests.push({ method, path: p + parsed.search, body: isForm ? '[multipart]' : body, headers })

    if (headers['api-access-token'] !== FAKE_TOKEN) return json({ error: 'unauthorized' }, 401)

    let m: RegExpMatchArray | null

    if (p === '/profile' && method === 'GET') return json({ id: OWNER_ID, name: 'Owner' })
    if (p === '' && method === 'GET') return json(state.account)
    if (p === '' && method === 'PATCH') return json(Object.assign(state.account, body))

    // labels
    if (p === '/labels' && method === 'GET') return json({ payload: state.labels })
    if (p === '/labels' && method === 'POST') {
      const row = { id: nextId++, ...body }
      state.labels.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/labels\/(\d+)$/)) && method === 'PATCH') {
      return json(Object.assign(state.labels.find((l) => l.id === Number(m![1])), body))
    }

    // teams
    if (p === '/teams' && method === 'GET') return json(state.teams)
    if (p === '/teams' && method === 'POST') {
      // Live finding: Chatwoot lower-cases team names and rejects duplicates.
      const name = String(body.name).toLowerCase()
      if (state.teams.some((t) => t.name === name)) return json({ message: 'Name has already been taken' }, 422)
      const row = { id: nextId++, ...body, name }
      state.teams.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/teams\/(\d+)$/)) && method === 'PATCH') {
      return json(Object.assign(state.teams.find((t) => t.id === Number(m![1])), body))
    }
    if ((m = p.match(/^\/teams\/(\d+)\/team_members$/))) {
      const id = Number(m[1])
      const current = state.teamMembers.get(id) ?? []
      if (method === 'GET') return json(current.map((uid) => ({ id: uid })))
      if (method === 'POST') {
        state.teamMembers.set(id, [...current, ...body.user_ids])
        return json(body.user_ids.map((uid: number) => ({ id: uid })))
      }
    }

    // custom attributes
    if (p.startsWith('/custom_attribute_definitions') && method === 'GET') {
      const model = parsed.searchParams.get('attribute_model')
      return json(state.attributes.filter((a) => a.attribute_model === model))
    }
    if (p === '/custom_attribute_definitions' && method === 'POST') {
      const row = { id: nextId++, ...body }
      state.attributes.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/custom_attribute_definitions\/(\d+)$/)) && method === 'PATCH') {
      return json(Object.assign(state.attributes.find((a) => a.id === Number(m![1])), body))
    }

    // canned responses
    if (p === '/canned_responses' && method === 'GET') return json(state.canned)
    if (p === '/canned_responses' && method === 'POST') {
      const row = { id: nextId++, ...body }
      state.canned.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/canned_responses\/(\d+)$/)) && method === 'PATCH') {
      return json(Object.assign(state.canned.find((c) => c.id === Number(m![1])), body))
    }

    // inboxes
    if (p === '/inboxes' && method === 'GET') return json({ payload: state.inboxes })
    if (p === '/inboxes' && method === 'POST') {
      if (options.rejectChannelField && body.channel?.[options.rejectChannelField] !== undefined) {
        return json({ error: `unknown attribute ${options.rejectChannelField}` }, 422)
      }
      const { channel, ...settings } = body
      const { type, ...channelFields } = channel
      const row = {
        id: nextId++,
        channel_type: 'Channel::WebWidget',
        ...settings,
        ...channelFields,
        website_token: 'pub_website_token_123',
        hmac_token: FAKE_HMAC,
        avatar_url: '',
      }
      void type
      state.inboxes.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/inboxes\/(\d+)$/))) {
      const row = state.inboxes.find((i) => i.id === Number(m![1]))
      if (method === 'GET') return json(row)
      if (method === 'PATCH') {
        if (isForm) {
          state.avatarUploads++
          row.avatar_url = 'https://chat.example.test/avatar.png'
          return json(row)
        }
        const { channel, ...settings } = body
        if (options.rejectChannelField && channel?.[options.rejectChannelField] !== undefined) {
          return json({ error: `unknown attribute ${options.rejectChannelField}` }, 422)
        }
        return json(Object.assign(row, settings, channel ?? {}))
      }
    }
    if ((m = p.match(/^\/inbox_members\/(\d+)$/)) && method === 'GET') {
      return json({ payload: (state.inboxMembers.get(Number(m[1])) ?? []).map((id) => ({ id })) })
    }
    if (p === '/inbox_members' && method === 'POST') {
      state.inboxMembers.set(body.inbox_id, body.user_ids)
      return json({ payload: body.user_ids.map((id: number) => ({ id })) })
    }

    // automation rules (25 per page, like a paginated API)
    if (p === '/automation_rules' && method === 'GET') {
      const page = Number(parsed.searchParams.get('page') ?? '1')
      return json({ payload: state.rules.slice((page - 1) * 25, page * 25) })
    }
    if (p === '/automation_rules' && method === 'POST') {
      if (options.rejectRouting && body.event_name === 'conversation_updated') {
        return json({ error: 'unsupported condition' }, 422)
      }
      const row = { id: nextId++, ...body }
      state.rules.push(row)
      return json(row)
    }
    if ((m = p.match(/^\/automation_rules\/(\d+)$/))) {
      const idx = state.rules.findIndex((r) => r.id === Number(m![1]))
      if (method === 'PATCH') return json(Object.assign(state.rules[idx], body))
      if (method === 'DELETE') {
        state.rules.splice(idx, 1)
        return new Response(null, { status: 200 })
      }
    }
    return json({ error: `unhandled ${method} ${p}` }, 404)
  }

  return { state, requests, fetchImpl }
}

type Fake = ReturnType<typeof createFakeChatwoot>

function makeClient(fake: Fake) {
  return createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })
}

function collectLog() {
  const lines: string[] = []
  return { lines, log: (line: string) => lines.push(line) }
}

async function sync(fake: Fake, opts: { only?: string[]; dryRun?: boolean } = {}) {
  const out = collectLog()
  await runSync({ client: makeClient(fake), only: opts.only, dryRun: opts.dryRun, log: out.log })
  return out.lines
}

const emailInboxes = () => [
  { id: 11, name: 'Email info@', channel_type: 'Channel::Email', enable_auto_assignment: true, business_name: 'Old', sender_name_type: 'friendly' },
  { id: 12, name: 'Email bookings@', channel_type: 'Channel::Email', enable_auto_assignment: false, business_name: 'Prestigo', sender_name_type: 'professional' },
]
const telegramInbox = () => ({ id: 13, name: 'PrestigoChauffeurBot', channel_type: 'Channel::Telegram', enable_auto_assignment: true })

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

describe('resolveRefs / expandAutomationRules', () => {
  const refs = {
    ownerId: OWNER_ID,
    teams: new Map([['Bookings', 21], ['B2B', 22]]),
    inboxes: new Map([['Website', 31]]),
  }

  it('replaces whole-string placeholders with numeric ids and reports unresolved ones', () => {
    const { value, missing } = resolveRefs(
      { a: ['@owner', '@team:B2B', '@inbox:Website', 'plain'], b: '@inbox:Email info@' },
      refs,
    )
    expect(value).toEqual({ a: [OWNER_ID, 22, 31, 'plain'], b: undefined })
    expect(missing).toEqual(['@inbox:Email info@'])
  })

  it('expands 4 channel rules, one rule per keyword and the routing rule; skips rules with a missing inbox', () => {
    const { rules, skipped, allNames } = expandAutomationRules(automationConfig, refs)
    expect(allNames).toHaveLength(4 + KEYWORD_RULES + 1)
    expect(skipped.map((s) => s.name).sort()).toEqual(['channel: email bookings@', 'channel: email info@', 'channel: telegram'])
    expect(rules).toHaveLength(allNames.length - 3)

    const web = rules.find((r) => r.name === 'channel: website')
    expect(web.event_name).toBe('conversation_created')
    expect(web.conditions).toEqual([{ attribute_key: 'inbox_id', filter_operator: 'equal_to', values: [31], query_operator: null }])
    expect(web.actions).toEqual([
      { action_name: 'add_label', action_params: ['ch-web'] },
      { action_name: 'assign_team', action_params: [21] },
      { action_name: 'assign_agent', action_params: [OWNER_ID] },
    ])

    const b2b = rules.find((r) => r.name === 'topic:b2b:en:corporate account')
    expect(b2b.event_name).toBe('message_created')
    expect(b2b.conditions[0]).toMatchObject({ attribute_key: 'message_type', values: ['incoming'], query_operator: 'and' })
    expect(b2b.conditions[1]).toMatchObject({ attribute_key: 'content', filter_operator: 'contains', values: ['corporate account'], query_operator: null })
    expect(b2b.actions).toEqual([
      { action_name: 'add_label', action_params: ['b2b'] },
      { action_name: 'assign_team', action_params: [22] },
    ])
    const payment = rules.find((r) => r.name.startsWith('topic:payment:'))
    expect(payment.actions).toHaveLength(1)
  })
})

describe('buildInboxRefs', () => {
  const config = readConfig('inboxes.json')

  it('falls back to the single same-type inbox only when unambiguous', () => {
    const refs = buildInboxRefs([...emailInboxes(), telegramInbox()], config)
    expect(refs.get('Telegram')).toBe(13)
    expect(refs.get('Email info@')).toBe(11)
  })

  it('never guesses between several inboxes of the same channel type', () => {
    const refs = buildInboxRefs(
      [{ id: 1, name: 'Mail A', channel_type: 'Channel::Email' }, { id: 2, name: 'Mail B', channel_type: 'Channel::Email' }],
      config,
    )
    expect(refs.has('Email info@')).toBe(false)
    expect(refs.has('Email bookings@')).toBe(false)
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

  it('WR-06: never follows redirects (the token header must not leave the instance) and always passes a timeout signal', async () => {
    const seen: any[] = []
    const fetchImpl = async (_url: string, init: any) => {
      seen.push(init)
      return new Response('[]', { status: 200 })
    }
    const client = createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fetchImpl as any })
    await client.request('GET', '/labels')
    expect(seen[0].redirect).toBe('error')
    expect(seen[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('WR-06: a stalled request rejects with a ChatwootApiError instead of hanging', async () => {
    const fetchImpl = (_url: string, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      })
    const client = createChatwootClient({
      baseUrl: BASE,
      token: FAKE_TOKEN,
      accountId: '1',
      fetchImpl: fetchImpl as any,
      timeoutMs: 25,
    })
    const err = await client.request('GET', '/labels').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ChatwootApiError)
    expect((err as Error).message).toMatch(/timed out/)
    expect((err as Error).message).not.toContain(FAKE_TOKEN)
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

  it('redacts an echoed hmac secret from an error body', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ hmac_token: FAKE_HMAC, error: 'boom' }), { status: 500 })
    const client = createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fetchImpl as any })
    const err = await client.request('GET', '/inboxes').catch((e: unknown) => e)
    expect((err as Error).message).not.toContain(FAKE_HMAC)
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
    const first = await sync(fake, { only: ['labels'] })
    expect(first).toContain('labels: create=11 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.labels).toHaveLength(11)

    const second = await sync(fake, { only: ['labels'] })
    expect(second).toContain('labels: create=0 update=0 unchanged=11 skipped=0 deleted=0')
    expect(second).toContain('summary: create=0 update=0 skipped=0')
  })

  it('updates a drifted label and leaves operator-made labels alone', async () => {
    const fake = createFakeChatwoot()
    await sync(fake, { only: ['labels'] })
    fake.state.labels.find((l) => l.title === 'payment').color = '#000000'
    fake.state.labels.push({ id: 900, title: 'operator-made', description: 'x', color: '#111111', show_on_sidebar: true })

    const run = await sync(fake, { only: ['labels'] })
    expect(run).toContain('labels: create=0 update=1 unchanged=10 skipped=0 deleted=0')
    expect(fake.state.labels.find((l) => l.title === 'payment').color).toBe('#BFA06A')
    expect(fake.state.labels.find((l) => l.title === 'operator-made').color).toBe('#111111')
  })

  it('--dry-run issues only GET requests but still prints the plan', async () => {
    const fake = createFakeChatwoot()
    const run = await sync(fake, { only: ['labels'], dryRun: true })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(run).toContain('labels: create=11 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.labels).toHaveLength(0)
  })

  it('rejects an unknown --only resource', async () => {
    const fake = createFakeChatwoot()
    await expect(runSync({ client: makeClient(fake), only: ['nope'], log: () => {} })).rejects.toThrow(/Unknown resource/)
  })
})

describe('runSync account + teams + attributes + canned', () => {
  it('patches support_email once, then is unchanged', async () => {
    const fake = createFakeChatwoot()
    expect(await sync(fake, { only: ['account'] })).toContain('account: create=0 update=1 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.account.support_email).toBe('bookings@rideprestigo.com')
    expect(await sync(fake, { only: ['account'] })).toContain('account: create=0 update=0 unchanged=1 skipped=0 deleted=0')
  })

  it('creates Bookings and B2B without auto-assign, adds the token owner as member, rerun unchanged', async () => {
    const fake = createFakeChatwoot()
    expect(await sync(fake, { only: ['teams'] })).toContain('teams: create=2 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.teams.map((t) => t.name).sort()).toEqual(['b2b', 'bookings'])
    expect(fake.state.teams.every((t) => t.allow_auto_assign === false)).toBe(true)
    for (const team of fake.state.teams) expect(fake.state.teamMembers.get(team.id)).toEqual([OWNER_ID])
    expect(await sync(fake, { only: ['teams'] })).toContain('teams: create=0 update=0 unchanged=2 skipped=0 deleted=0')
  })

  it('creates 15 conversation + 1 contact attribute definitions keyed by key + model, rerun unchanged', async () => {
    const fake = createFakeChatwoot()
    expect(await sync(fake, { only: ['attributes'] })).toContain('attributes: create=16 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.attributes.filter((a) => a.attribute_model === 'conversation_attribute')).toHaveLength(15)
    expect(fake.state.attributes.filter((a) => a.attribute_model === 'contact_attribute')).toHaveLength(1)
    expect(await sync(fake, { only: ['attributes'] })).toContain('attributes: create=0 update=0 unchanged=16 skipped=0 deleted=0')
  })

  it('creates 35 canned responses <topic>-<locale>, updates changed content, leaves operator canned untouched', async () => {
    const fake = createFakeChatwoot()
    fake.state.canned.push({ id: 1, short_code: 'operator-note', content: 'mine' })
    expect(await sync(fake, { only: ['canned'] })).toContain('canned: create=35 update=0 unchanged=0 skipped=0 deleted=0')
    const codes = fake.state.canned.map((c) => c.short_code)
    expect(codes).toContain('time-change-en')
    expect(codes).toContain('login-help-zh')
    expect(codes.filter((c) => c !== 'operator-note')).toHaveLength(35)

    fake.state.canned.find((c) => c.short_code === 'payment-help-fr').content = 'edited in the dashboard'
    expect(await sync(fake, { only: ['canned'] })).toContain('canned: create=0 update=1 unchanged=34 skipped=0 deleted=0')
    expect(await sync(fake, { only: ['canned'] })).toContain('canned: create=0 update=0 unchanged=35 skipped=0 deleted=0')
    expect(fake.state.canned.find((c) => c.short_code === 'operator-note').content).toBe('mine')
  })
})

describe('runSync inboxes', () => {
  it('creates the Website inbox with every configured setting, uploads the avatar once, adds the owner, prints the public token only', async () => {
    const fake = createFakeChatwoot()
    const lines = await sync(fake, { only: ['inboxes'] })
    const site = fake.state.inboxes.find((i) => i.name === 'Website')
    const web = readConfig('inboxes.json').website
    expect(site).toBeTruthy()
    expect(site.widget_color).toBe('#0F1D2C')
    expect(site.reply_time).toBe('in_a_few_minutes')
    expect(site.hmac_mandatory).toBe(true)
    expect(site.continuity_via_email).toBe(true)
    expect(site.working_hours_enabled).toBe(false)
    expect(site.pre_chat_form_options.pre_chat_fields.find((f: any) => f.name === 'emailAddress').required).toBe(true)
    for (const [k, v] of Object.entries(web.settings)) expect(site[k]).toEqual(v)
    expect(fake.state.avatarUploads).toBe(1)
    expect(fake.state.inboxMembers.get(site.id)).toEqual([OWNER_ID])
    expect(lines).toContain('website_token=pub_website_token_123')
    expect(lines.join('\n')).not.toContain(FAKE_HMAC)
    expect(lines.filter((l) => l.startsWith('  missing: '))).toEqual([
      '  missing: Email info@',
      '  missing: Email bookings@',
      '  missing: Telegram',
    ])
    expect(lines).toContain('inboxes: create=1 update=0 unchanged=0 skipped=3 deleted=0')

    const rerun = await sync(fake, { only: ['inboxes'] })
    expect(rerun).toContain('inboxes: create=0 update=0 unchanged=1 skipped=3 deleted=0')
    expect(fake.state.avatarUploads).toBe(1)
  })

  it('patches only the listed non-secret settings of owner-made inboxes, never channel fields', async () => {
    const fake = createFakeChatwoot({ inboxes: [...emailInboxes(), telegramInbox()] })
    const lines = await sync(fake, { only: ['inboxes'] })
    expect(lines.filter((l) => l.startsWith('  missing: '))).toEqual([])
    const patches = fake.requests.filter((r) => r.method === 'PATCH' && /^\/inboxes\/1[123]$/.test(r.path))
    expect(patches.map((p) => p.path).sort()).toEqual(['/inboxes/11', '/inboxes/13'])
    for (const patch of patches) {
      expect(patch.body.channel).toBeUndefined()
      expect(Object.keys(patch.body).every((k) => ['enable_auto_assignment', 'business_name', 'sender_name_type'].includes(k))).toBe(true)
    }
    expect(fake.state.inboxes.find((i) => i.id === 11).business_name).toBe('Prestigo')
    expect(fake.state.inboxes.find((i) => i.id === 13).enable_auto_assignment).toBe(false)
  })

  it('drops only a rejected channel field with a printed warning and does not fail the run', async () => {
    const fake = createFakeChatwoot({ rejectChannelField: 'allowed_domains' })
    const lines = await sync(fake, { only: ['inboxes'] })
    expect(lines).toContain('  warning: unsupported field allowed_domains')
    const site = fake.state.inboxes.find((i) => i.name === 'Website')
    expect(site.allowed_domains).toBeUndefined()
    expect(site.hmac_mandatory).toBe(true)
  })
})

describe('runSync automation', () => {
  it('skips rules whose inbox does not exist, resolves a renamed Telegram inbox, paginates listing', async () => {
    const fake = createFakeChatwoot({ inboxes: [telegramInbox()] })
    await sync(fake, { only: ['labels', 'teams', 'inboxes'] })
    const first = await sync(fake, { only: ['automation'] })
    // website + telegram channel rules and every keyword rule and the routing rule; 2 email rules skipped
    expect(first).toContain(`automation: create=${2 + KEYWORD_RULES + 1} update=0 unchanged=0 skipped=2 deleted=0`)
    expect(first).toContain('  skipped: channel: email info@ (missing @inbox:Email info@)')
    expect(fake.state.rules.some((r) => r.name === 'channel: email info@')).toBe(false)
    expect(fake.state.rules.length).toBeGreaterThan(25)

    const second = await sync(fake, { only: ['automation'] })
    expect(second).toContain(`automation: create=0 update=0 unchanged=${2 + KEYWORD_RULES + 1} skipped=2 deleted=0`)
  })

  it('deletes only stale generated "topic:" rules, never operator-made ones', async () => {
    const fake = createFakeChatwoot({ inboxes: [telegramInbox()] })
    await sync(fake, { only: ['labels', 'teams', 'inboxes', 'automation'] })
    fake.state.rules.push(
      { id: 800, name: 'topic:payment:en:removed keyword', event_name: 'message_created', active: true, conditions: [], actions: [] },
      { id: 801, name: 'my own rule', event_name: 'message_created', active: true, conditions: [], actions: [] },
    )
    const run = await sync(fake, { only: ['automation'] })
    expect(run).toContain('  [delete] rule topic:payment:en:removed keyword')
    expect(run.some((l) => l.startsWith('automation: ') && l.endsWith('deleted=1'))).toBe(true)
    expect(fake.state.rules.some((r) => r.id === 800)).toBe(false)
    expect(fake.state.rules.some((r) => r.id === 801)).toBe(true)
  })

  it('reports the optional routing rule as skipped when the version rejects it', async () => {
    const fake = createFakeChatwoot({ inboxes: [telegramInbox()], rejectRouting: true })
    await sync(fake, { only: ['labels', 'teams', 'inboxes'] })
    const run = await sync(fake, { only: ['automation'] })
    expect(run).toContain('  skipped: route: b2b label to B2B team (unsupported on this version)')
    expect(run).toContain(`automation: create=${2 + KEYWORD_RULES} update=0 unchanged=0 skipped=3 deleted=0`)
  })
})

describe('full run', () => {
  it('second full run is a no-op and the first run never prints a secret', async () => {
    const fake = createFakeChatwoot({ inboxes: [...emailInboxes(), telegramInbox()] })
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))

    const first = await sync(fake)
    const second = await sync(fake)
    expect(first).toContain('canned: create=35 update=0 unchanged=0 skipped=0 deleted=0')
    expect(second).toContain('canned: create=0 update=0 unchanged=35 skipped=0 deleted=0')
    expect(second).toContain('summary: create=0 update=0 skipped=0')
    expect(second).toContain('website_token=pub_website_token_123')

    const seen = [...first, ...second, ...spies.flatMap((s) => s.mock.calls.flat().map(String))].join('\n')
    expect(seen).not.toContain(FAKE_TOKEN)
    expect(seen).not.toContain(FAKE_HMAC)
    expect(seen).not.toContain('hmac_token')
  })

  it('--dry-run of a full sync issues only GET requests and prints the full plan', async () => {
    const fake = createFakeChatwoot({ inboxes: [...emailInboxes(), telegramInbox()] })
    const lines = await sync(fake, { dryRun: true })
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(lines.some((l) => l.startsWith('summary: create='))).toBe(true)
    expect(lines).toContain('canned: create=35 update=0 unchanged=0 skipped=0 deleted=0')
    expect(fake.state.labels).toHaveLength(0)
    expect(fake.state.rules).toHaveLength(0)
  })

  it('never writes the token to console output or the log lines', async () => {
    const fake = createFakeChatwoot()
    const spies = (['log', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
    const lines = await sync(fake)
    await sync(fake, { dryRun: true })
    const seen = [...lines, ...spies.flatMap((s) => s.mock.calls.flat().map(String))].join('\n')
    expect(seen).not.toContain(FAKE_TOKEN)
  })
})
