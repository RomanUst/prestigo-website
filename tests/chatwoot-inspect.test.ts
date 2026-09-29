// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 77, Plan 09 — Chatwoot inspect tooling, proven against a small in-memory
 * fake Chatwoot API. No test here makes a network call or reads a real token.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ChatwootConfigError, createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import {
  formatActivity,
  formatContact,
  formatReport,
  formatStatus,
  formatWhatsapp,
  gatherStatus,
  gatherWhatsapp,
  parseArgs,
  printSecret,
  runInspect,
} from '../infra/chatwoot/inspect.mjs'

const FAKE_TOKEN = 'tok_SECRET_0123456789abcdef'
const FAKE_HMAC = 'hmac_SECRET_fedcba9876543210'
const BASE = 'https://chat.example.test'
const OWNER_ID = 7
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const inboxesConfig = JSON.parse(readFileSync(join(REPO_ROOT, 'infra/chatwoot/inboxes.json'), 'utf8'))

type Req = { method: string; path: string }

interface FakeState {
  labels: any[]
  teams: any[]
  teamMembers: Map<number, number[]>
  attributes: any[]
  canned: any[]
  rules: any[]
  inboxes: any[]
  conversations: any[]
  messages: Map<number, any[]>
  contacts: any[]
  reports: { summary?: Map<string, any>; legacy?: Map<string, any>; summary404?: boolean }
  /** Account payload returned by GET '' (feature flags). */
  account?: any
  /** /inboxes/:id/health payload per inbox id, and /message_templates rows per inbox id. */
  health: Map<number, any>
  templates: Map<number, any[]>
}

function websiteInbox(): any {
  return {
    id: 3,
    name: 'Website',
    channel_type: 'Channel::WebWidget',
    website_token: 'pub_website_token_123',
    hmac_token: FAKE_HMAC,
    hmac_mandatory: true,
    reply_time: 'in_a_few_minutes',
    widget_color: '#0F1D2C',
    pre_chat_form_options: {
      pre_chat_fields: [
        { name: 'emailAddress', required: true, enabled: true },
        { name: 'fullName', required: false, enabled: true },
      ],
    },
  }
}

function createFake(partial: Partial<FakeState> = {}) {
  const state: FakeState = {
    labels: Array.from({ length: 11 }, (_, i) => ({ id: 20 + i, title: i < 3 ? `ch-${['web', 'email', 'telegram'][i]}` : `topic-${i}` })),
    teams: [
      { id: 1, name: 'bookings' },
      { id: 2, name: 'b2b' },
    ],
    teamMembers: new Map([
      [1, [OWNER_ID]],
      [2, [OWNER_ID]],
    ]),
    attributes: [{ id: 1 }, { id: 2 }, { id: 3 }],
    canned: Array.from({ length: 35 }, (_, i) => ({ id: i, short_code: `c-${i}` })),
    rules: [{ id: 1, name: 'r1' }, { id: 2, name: 'r2' }],
    inboxes: [websiteInbox()],
    conversations: [],
    messages: new Map(),
    contacts: [],
    reports: {},
    health: new Map(),
    templates: new Map(),
    ...partial,
  }
  const requests: Req[] = []
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

  const fetchImpl = async (url: string, init: any = {}) => {
    const method = (init.method ?? 'GET') as string
    const parsed = new URL(url)
    const p = parsed.pathname
    requests.push({ method, path: p + parsed.search })
    if ((init.headers ?? {})['api-access-token'] !== FAKE_TOKEN) return json({ error: 'unauthorized' }, 401)
    let m: RegExpMatchArray | null

    if (p === '/api/v1/profile') return json({ id: OWNER_ID })
    const base = p.replace(/^\/api\/v1\/accounts\/1/, '')
    if (base === '') return json(state.account ?? { id: 1 })
    if ((m = base.match(/^\/inboxes\/(\d+)\/health$/))) return json(state.health.get(Number(m[1])) ?? {})
    if ((m = base.match(/^\/inboxes\/(\d+)\/message_templates$/))) return json({ payload: state.templates.get(Number(m[1])) ?? [] })
    if (base === '/labels') return json({ payload: state.labels })
    if (base === '/teams') return json(state.teams)
    if ((m = base.match(/^\/teams\/(\d+)\/team_members$/))) {
      return json((state.teamMembers.get(Number(m[1])) ?? []).map((id) => ({ id })))
    }
    if (base === '/custom_attribute_definitions') return json(state.attributes.map((a) => ({ ...a })))
    if (base === '/canned_responses') return json(state.canned)
    if (base === '/automation_rules') return json({ payload: parsed.searchParams.get('page') === '1' ? state.rules : state.rules })
    if (base === '/inboxes') return json({ payload: state.inboxes.map(({ hmac_token: _h, ...rest }) => ({ ...rest, hmac_token: _h })) })
    if ((m = base.match(/^\/inboxes\/(\d+)$/))) return json(state.inboxes.find((i) => i.id === Number(m![1])))
    if (base === '/conversations') {
      const inboxId = Number(parsed.searchParams.get('inbox_id'))
      return json({ data: { payload: state.conversations.filter((c) => c.inbox_id === inboxId) } })
    }
    if ((m = base.match(/^\/conversations\/(\d+)\/messages$/))) return json({ payload: state.messages.get(Number(m[1])) ?? [] })
    if (base === '/contacts/search') {
      const q = (parsed.searchParams.get('q') ?? '').toLowerCase()
      return json({ payload: state.contacts.filter((c) => String(c.email).toLowerCase() === q) })
    }
    if ((m = p.match(/^\/api\/v2\/accounts\/1\/summary_reports\/(inbox|label)$/))) {
      if (state.reports.summary404) return json({ error: 'not found' }, 404)
      return json([...(state.reports.summary ?? new Map()).entries()].filter(([k]) => k.startsWith(`${m![1]}:`)).map(([k, v]) => ({ id: Number(k.split(':')[1]), ...v })))
    }
    if (p === '/api/v2/accounts/1/reports/summary') {
      const key = `${parsed.searchParams.get('type')}:${parsed.searchParams.get('id')}`
      return json(state.reports.legacy?.get(key) ?? { conversations_count: 0, avg_first_response_time: null, avg_resolution_time: null })
    }
    return json({ error: `unhandled ${method} ${p}` }, 404)
  }
  return { state, requests, fetchImpl }
}

type Fake = ReturnType<typeof createFake>
const makeClient = (fake: Fake) =>
  createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })

function capture() {
  const out: string[] = []
  const err: string[] = []
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } }
}

describe('inspect --status (tracer)', () => {
  const baseState = () => ({
    labels: new Array(11).fill({}),
    teams: [
      { name: 'bookings', owner_member: true },
      { name: 'b2b', owner_member: true },
    ],
    attributes: new Array(16).fill({}),
    canned: new Array(35).fill({}),
    rules: new Array(108).fill({}),
    inboxes: [websiteInbox(), { id: 9, name: 'PrestigoChauffeurBot', channel_type: 'Channel::Telegram' }],
    website: websiteInbox(),
    config: inboxesConfig,
    configTeams: ['Bookings', 'B2B'],
  })

  it('formatStatus prints exactly the documented line shapes', () => {
    const lines = formatStatus(baseState())
    expect(lines[0]).toBe('labels=11')
    expect(lines[1]).toBe('teams=Bookings(owner),B2B(owner)')
    expect(lines[2]).toBe('custom_attributes=16')
    expect(lines[3]).toBe('canned=35')
    expect(lines[4]).toBe('automation_rules=108')
    expect(lines[5]).toBe(
      'inbox Website web_widget hmac_mandatory=true reply_time=in_a_few_minutes widget_color=#0F1D2C pre_chat_email_required=true',
    )
    // The Telegram inbox is named after the bot; it resolves by unambiguous channel type.
    expect(lines).toContain('inbox Telegram Channel::Telegram present')
  })

  it('reports a managed inbox absent from the state as missing', () => {
    const lines = formatStatus(baseState())
    expect(lines).toContain('inbox Email info@ Channel::Email missing')
    expect(lines).toContain('inbox Email bookings@ Channel::Email missing')
  })

  it('reports a missing Website inbox and never prints a secret', () => {
    const state = { ...baseState(), website: null, inboxes: [] }
    const lines = formatStatus(state)
    expect(lines).toContain('inbox Website web_widget missing')
    expect(lines.join('\n')).not.toContain(FAKE_HMAC)
  })

  it('gatherStatus + runInspect run end to end on the shared client, GET only, no secret printed', async () => {
    const fake = createFake()
    const cap = capture()
    const code = await runInspect(parseArgs(['--status']), { client: makeClient(fake), ...cap.io })
    expect(code).toBe(0)
    const text = cap.out.join('\n')
    expect(text).toContain('labels=11')
    expect(text).toContain('canned=35')
    expect(text).toContain('teams=Bookings(owner),B2B(owner)')
    expect(text).toContain('hmac_mandatory=true')
    expect(text).not.toContain(FAKE_HMAC)
    expect(text).not.toContain(FAKE_TOKEN)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
  })

  it('gatherStatus keeps automation listing finite when the server ignores pagination', async () => {
    const fake = createFake()
    const state = await gatherStatus(makeClient(fake))
    expect(state.rules).toHaveLength(2)
  })

  it('parseArgs rejects unknown and conflicting modes', () => {
    expect(() => parseArgs(['--status', '--report'])).toThrow()
    expect(() => parseArgs(['--bogus'])).toThrow()
    expect(() => parseArgs([])).toThrow()
  })
})

// Distinctive strings that must never appear in any --whatsapp output line (T-78-12).
const WA_SECRETS = [
  'DISTINCT-API-KEY-9f3',
  'DISTINCT-PHONE-ID-77',
  'DISTINCT-WABA-55',
  'DISTINCT-APP-SECRET-31',
  'DISTINCT-PIN-864209',
  'DISTINCT Verified Name Ltd',
  '+420 777 123 456',
  'secret_template_name',
  '+420 999 000 111',
]

function whatsappInbox(overrides: Record<string, any> = {}, providerOverrides: Record<string, any> = {}): any {
  return {
    id: 8,
    name: 'Prestigo WhatsApp',
    channel_type: 'Channel::Whatsapp',
    phone_number: '+420 999 000 111',
    provider_config: {
      api_key: 'DISTINCT-API-KEY-9f3',
      phone_number_id: 'DISTINCT-PHONE-ID-77',
      business_account_id: 'DISTINCT-WABA-55',
      source: 'manual_setup_v2',
      app_secret: 'DISTINCT-APP-SECRET-31',
      ...providerOverrides,
    },
    ...overrides,
  }
}

const healthy = (overrides: Record<string, any> = {}) => ({
  id: '1234',
  display_phone_number: '+420 777 123 456',
  verified_name: 'DISTINCT Verified Name Ltd',
  status: 'CONNECTED',
  code_verification_status: 'VERIFIED',
  platform_type: 'CLOUD_API',
  name_status: 'APPROVED',
  quality_rating: 'GREEN',
  messaging_limit_tier: 'TIER_1K',
  throughput_level: 'STANDARD',
  ...overrides,
})

const WA_TEMPLATES = [
  { name: 'secret_template_name', status: 'APPROVED' },
  { name: 'other_a', status: 'approved' },
  { name: 'other_b', status: 'PENDING' },
  { name: 'other_c', status: 'REJECTED' },
  { name: 'other_d', status: 'PAUSED' },
  { name: 'other_e' },
]

function waFake(partial: Partial<FakeState> = {}, inbox: any = whatsappInbox()) {
  return createFake({
    inboxes: [websiteInbox(), inbox],
    health: new Map([[inbox.id, healthy()]]),
    templates: new Map([[inbox.id, WA_TEMPLATES]]),
    rules: [{ id: 1, name: 'window: whatsapp closing soon', execution_delay: 1200 }],
    account: { id: 1, features: { delayed_automations: true } },
    ...partial,
  })
}

describe('inspect --whatsapp (78-04, T-78-12: enums, counts and booleans only)', () => {
  it('prints exactly the documented lines in order', async () => {
    const cap = capture()
    const code = await runInspect(parseArgs(['--whatsapp']), { client: makeClient(waFake()), ...cap.io })
    expect(code).toBe(0)
    expect(cap.out).toEqual([
      'status=CONNECTED',
      'code_verification_status=VERIFIED',
      'platform_type=CLOUD_API',
      'name_status=APPROVED',
      'quality_rating=GREEN',
      'messaging_limit_tier=TIER_1K',
      'signature_secret_configured=true',
      'verification_pin_stored=false',
      'provider_source=manual_setup_v2',
      'templates total=6 approved=2 pending=1 rejected=1 other=2',
      'window_rule_delay_minutes=1200',
      'delayed_automations=true',
    ])
  })

  it('never prints a provider_config value, phone number, verified name, template name or token', async () => {
    const fake = waFake({}, whatsappInbox({}, { verification_pin: 'DISTINCT-PIN-864209' }))
    const cap = capture()
    await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(fake), ...cap.io })
    const all = [...cap.out, ...cap.err].join('\n')
    for (const secret of [...WA_SECRETS, FAKE_TOKEN, FAKE_HMAC]) expect(all).not.toContain(secret)
    expect(all).not.toMatch(/provider_config|api_key|phone_number_id|business_account_id/)
  })

  it('prints a non-enum health value as "other" instead of echoing it', async () => {
    const fake = waFake({ health: new Map([[8, healthy({ quality_rating: '+420 777 123 456', name_status: 'DISTINCT Verified Name Ltd' })]]) })
    const cap = capture()
    await runInspect(parseArgs(['--whatsapp']), { client: makeClient(fake), ...cap.io })
    expect(cap.out).toContain('quality_rating=other')
    expect(cap.out).toContain('name_status=other')
    expect(cap.out.join('\n')).not.toContain('420')
  })

  it('signature_secret_configured is true for any of app_secret, app_secret_key, client_secret, api_secret and false when empty or absent', async () => {
    for (const key of ['app_secret', 'app_secret_key', 'client_secret', 'api_secret']) {
      const inbox = whatsappInbox({}, { app_secret: undefined, [key]: 'DISTINCT-APP-SECRET-31' })
      const state = await gatherWhatsapp(makeClient(waFake({}, inbox)))
      expect(state.signature_secret_configured, key).toBe(true)
    }
    for (const empty of [{ app_secret: '' }, { app_secret: null }, { app_secret: undefined }]) {
      const inbox = whatsappInbox({}, empty)
      const state = await gatherWhatsapp(makeClient(waFake({}, inbox)))
      expect(state.signature_secret_configured).toBe(false)
    }
  })

  it('verification_pin_stored is true only when a pin value is stored; provider_source is a fixed enum', async () => {
    const pinned = await gatherWhatsapp(makeClient(waFake({}, whatsappInbox({}, { verification_pin: 'DISTINCT-PIN-864209' }))))
    expect(pinned.verification_pin_stored).toBe(true)
    const plain = await gatherWhatsapp(makeClient(waFake()))
    expect(plain.verification_pin_stored).toBe(false)

    const embedded = await gatherWhatsapp(makeClient(waFake({}, whatsappInbox({}, { source: 'embedded_signup' }))))
    expect(embedded.provider_source).toBe('embedded_signup')
    const odd = await gatherWhatsapp(makeClient(waFake({}, whatsappInbox({}, { source: 'DISTINCT-API-KEY-9f3' }))))
    expect(odd.provider_source).toBe('other')
    expect(JSON.stringify(odd)).not.toContain('DISTINCT')
  })

  it('window_rule_delay_minutes is missing without the rule; delayed_automations is false or unknown as reported', async () => {
    const noRule = await gatherWhatsapp(makeClient(waFake({ rules: [{ id: 2, name: 'other rule', execution_delay: 5 }] })))
    expect(noRule.window_rule_delay_minutes).toBe('missing')
    const off = await gatherWhatsapp(makeClient(waFake({ account: { id: 1, features: { delayed_automations: false } } })))
    expect(off.delayed_automations).toBe('false')
    const unknown = await gatherWhatsapp(makeClient(waFake({ account: { id: 1 } })))
    expect(unknown.delayed_automations).toBe('unknown')
    expect(formatWhatsapp(unknown)).toContain('delayed_automations=unknown')
  })

  it('no WhatsApp inbox: prints "whatsapp inbox missing" and exits 1', async () => {
    const cap = capture()
    const code = await runInspect(parseArgs(['--whatsapp']), { client: makeClient(createFake()), ...cap.io })
    expect(code).toBe(1)
    expect(cap.out).toEqual(['whatsapp inbox missing'])
  })

  it('two WhatsApp inboxes is a config error, never a guess', async () => {
    const fake = waFake({ inboxes: [websiteInbox(), whatsappInbox(), whatsappInbox({ id: 9, name: 'Second' })] })
    await expect(runInspect(parseArgs(['--whatsapp']), { client: makeClient(fake), ...capture().io })).rejects.toThrow(ChatwootConfigError)
  })

  it('every request issued by --whatsapp is a GET', async () => {
    const fake = waFake()
    await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(fake), ...capture().io })
    expect(fake.requests.length).toBeGreaterThan(0)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    expect(fake.requests.some((r) => r.path.endsWith('/inboxes/8/health'))).toBe(true)
    expect(fake.requests.some((r) => r.path.endsWith('/inboxes/8/message_templates'))).toBe(true)
  })

  it('--expect-connected exits 0 only for CONNECTED + signature secret + no stored pin', async () => {
    const ok = capture()
    expect(await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(waFake()), ...ok.io })).toBe(0)
    expect(ok.err).toEqual([])

    const disconnected = capture()
    const fakeDown = waFake({ health: new Map([[8, healthy({ status: 'DISCONNECTED' })]]) })
    expect(await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(fakeDown), ...disconnected.io })).toBe(1)
    expect(disconnected.err.join('\n')).toContain('status is not CONNECTED')

    const noSecret = capture()
    const fakeNoSecret = waFake({}, whatsappInbox({}, { app_secret: undefined }))
    expect(await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(fakeNoSecret), ...noSecret.io })).toBe(1)
    expect(noSecret.err.join('\n')).toContain('signature_secret_configured is not true')

    const pinned = capture()
    const fakePinned = waFake({}, whatsappInbox({}, { verification_pin: 'DISTINCT-PIN-864209' }))
    expect(await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(fakePinned), ...pinned.io })).toBe(1)
    expect(pinned.err.join('\n')).toContain('verification_pin_stored is not false')
    expect(pinned.err.join('\n')).not.toContain('DISTINCT-PIN-864209')
  })

  it('--expect-connected exits 1 when the inbox is missing', async () => {
    const cap = capture()
    expect(await runInspect(parseArgs(['--whatsapp', '--expect-connected']), { client: makeClient(createFake()), ...cap.io })).toBe(1)
  })

  it('parseArgs registers --whatsapp, keeps modes exclusive and only allows --expect-connected with it', () => {
    expect(parseArgs(['--whatsapp']).mode).toBe('whatsapp')
    expect(parseArgs(['--whatsapp', '--expect-connected']).expectConnected).toBe(true)
    expect(() => parseArgs(['--status', '--whatsapp'])).toThrow(/--whatsapp/)
    expect(() => parseArgs(['--status', '--expect-connected'])).toThrow(ChatwootConfigError)
    expect(() => parseArgs([])).toThrow(/--whatsapp/)
  })
})

describe('--print (T-77-21: a secret only ever flows into a pipe)', () => {
  const kinds = ['website-token', 'hmac-token'] as const

  for (const kind of kinds) {
    it(`printSecret(${kind}) refuses when isTTY is true: nothing on stdout, exit 1, secret not even fetched`, async () => {
      const written: string[] = []
      const errors: string[] = []
      let fetched = false
      const code = await printSecret(kind, {
        isTTY: true,
        getValue: async () => {
          fetched = true
          return FAKE_HMAC
        },
        out: (t) => written.push(t),
        err: (t) => errors.push(t),
      })
      expect(code).toBe(1)
      expect(written).toEqual([])
      expect(fetched).toBe(false)
      expect(errors).toEqual(['refusing to print a secret to a terminal; pipe it'])
    })

    it(`printSecret(${kind}) writes exactly the value, no newline, when isTTY is false`, async () => {
      const written: string[] = []
      const code = await printSecret(kind, {
        isTTY: false,
        getValue: async () => 'value-123',
        out: (t) => written.push(t),
        err: () => {},
      })
      expect(code).toBe(0)
      expect(written).toEqual(['value-123'])
    })
  }

  it('rejects an unknown kind and never prints', async () => {
    const written: string[] = []
    const code = await printSecret('api-token', { isTTY: false, getValue: async () => 'x', out: (t) => written.push(t), err: () => {} })
    expect(code).toBe(2)
    expect(written).toEqual([])
  })

  it('an empty secret exits 2 without writing', async () => {
    const written: string[] = []
    const code = await printSecret('hmac-token', { isTTY: false, getValue: async () => '', out: (t) => written.push(t), err: () => {} })
    expect(code).toBe(2)
    expect(written).toEqual([])
  })

  it('runInspect --print pulls each value from the Website inbox and never puts it on the error stream', async () => {
    const fake = createFake()
    for (const [kind, expected] of [
      ['website-token', 'pub_website_token_123'],
      ['hmac-token', FAKE_HMAC],
    ] as const) {
      const written: string[] = []
      const errors: string[] = []
      const code = await runInspect(parseArgs(['--print', kind]), {
        client: makeClient(fake),
        isTTY: false,
        write: (t) => written.push(t),
        err: (l) => errors.push(l),
      })
      expect(code).toBe(0)
      expect(written).toEqual([expected])
      expect(errors.join('')).not.toContain(expected)
    }
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
  })

  it('runInspect --print on a terminal exits 1 and makes no secret request', async () => {
    const fake = createFake()
    const written: string[] = []
    const errors: string[] = []
    const code = await runInspect(parseArgs(['--print', 'hmac-token']), {
      client: makeClient(fake),
      isTTY: true,
      write: (t) => written.push(t),
      err: (l) => errors.push(l),
    })
    expect(code).toBe(1)
    expect(written).toEqual([])
    expect(fake.requests).toHaveLength(0)
  })
})

describe('--activity', () => {
  it('formatActivity maps a conversation to the exact documented line', () => {
    const line = formatActivity({
      inboxName: 'Website',
      conversation: { id: 42, status: 'open', labels: ['ch-web', 'payment'], meta: { assignee: { id: OWNER_ID }, team: { name: 'Bookings' } } },
      ownerId: OWNER_ID,
      lastOutgoing: 'sent',
    })
    expect(line).toBe('inbox=Website id=42 status=open labels=ch-web,payment assignee_is_owner=true team=Bookings last_outgoing=sent')
  })

  it('handles no assignee, no team, no labels and no outgoing message', () => {
    const line = formatActivity({
      inboxName: 'Website',
      conversation: { id: 1, status: 'pending', labels: [], meta: {} },
      ownerId: OWNER_ID,
      lastOutgoing: null,
    })
    expect(line).toBe('inbox=Website id=1 status=pending labels=none assignee_is_owner=false team=none last_outgoing=none')
  })

  it('runInspect --activity lists conversations per inbox without names, emails or message bodies', async () => {
    const fake = createFake({
      conversations: [
        { id: 5, inbox_id: 3, status: 'open', labels: ['ch-web'], created_at: 1_800_000_000, team_id: 1, meta: { assignee: { id: OWNER_ID }, sender: { name: 'Jane Customer', email: 'jane@example.test' } } },
        { id: 6, inbox_id: 3, status: 'resolved', labels: [], created_at: 1_000_000_000, meta: { assignee: { id: 99 } } },
      ],
      messages: new Map([
        [5, [
          { id: 1, message_type: 0, status: 'sent', content: 'SECRET CUSTOMER TEXT', created_at: 1 },
          { id: 2, message_type: 1, status: 'delivered', content: 'reply body', created_at: 2 },
          { id: 3, message_type: 1, status: 'read', content: 'later reply', created_at: 3 },
        ]],
      ]),
    })
    const cap = capture()
    const code = await runInspect(parseArgs(['--activity', '--since', '2020-01-01T00:00:00Z']), { client: makeClient(fake), ...cap.io })
    expect(code).toBe(0)
    expect(cap.out).toEqual(['inbox=Website id=5 status=open labels=ch-web assignee_is_owner=true team=bookings last_outgoing=read'])
    const all = cap.out.join('\n')
    expect(all).not.toContain('Jane')
    expect(all).not.toContain('example.test')
    expect(all).not.toContain('SECRET CUSTOMER TEXT')
    expect(all).not.toContain('reply body')
  })

  it('respects --limit per inbox', async () => {
    const conversations = Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, inbox_id: 3, status: 'open', labels: [], created_at: 10, meta: {} }))
    const cap = capture()
    await runInspect(parseArgs(['--activity', '--limit', '2']), { client: makeClient(createFake({ conversations })), ...cap.io })
    expect(cap.out).toHaveLength(2)
  })
})

describe('--report (INBOX-06 / D-22)', () => {
  it('formatReport prints null, not 0, when Chatwoot returns no average', () => {
    expect(formatReport({ kind: 'inbox', name: 'Website', summary: { conversations_count: 0, avg_first_response_time: null, avg_resolution_time: null } })).toBe(
      'report inbox Website conversations=0 avg_first_response_s=null avg_resolution_s=null',
    )
    expect(formatReport({ kind: 'label', name: 'ch-web', summary: undefined })).toBe(
      'report label ch-web conversations=0 avg_first_response_s=null avg_resolution_s=null',
    )
    expect(formatReport({ kind: 'inbox', name: 'Website', summary: { conversations_count: 4, avg_first_response_time: 120.4, avg_resolution_time: null } })).toBe(
      'report inbox Website conversations=4 avg_first_response_s=120 avg_resolution_s=null',
    )
  })

  it('uses summary_reports for every inbox and every ch-* label', async () => {
    const fake = createFake({
      reports: {
        summary: new Map([
          ['inbox:3', { conversations_count: 9, avg_first_response_time: 60, avg_resolution_time: 600 }],
          ['label:20', { conversations_count: 3, avg_first_response_time: 30, avg_resolution_time: null }],
        ]),
      },
    })
    const cap = capture()
    const code = await runInspect(parseArgs(['--report', '--since', '2026-09-01T00:00:00Z']), { client: makeClient(fake), now: () => 1_800_000_000_000, ...cap.io })
    expect(code).toBe(0)
    expect(cap.out).toEqual([
      'report inbox Website conversations=9 avg_first_response_s=60 avg_resolution_s=600',
      'report label ch-web conversations=3 avg_first_response_s=30 avg_resolution_s=null',
      'report label ch-email conversations=0 avg_first_response_s=null avg_resolution_s=null',
      'report label ch-telegram conversations=0 avg_first_response_s=null avg_resolution_s=null',
    ])
    expect(cap.err).toContain('reports_path=/summary_reports')
    const url = fake.requests.find((r) => r.path.includes('summary_reports/inbox'))!.path
    expect(url).toContain(`since=${Math.floor(Date.parse('2026-09-01T00:00:00Z') / 1000)}`)
    expect(url).toContain('until=1800000000')
  })

  it('falls back to reports/summary per entity when summary_reports is 404', async () => {
    const fake = createFake({
      reports: {
        summary404: true,
        legacy: new Map([['inbox:3', { conversations_count: 2, avg_first_response_time: 15, avg_resolution_time: 90 }]]),
      },
    })
    const cap = capture()
    const code = await runInspect(parseArgs(['--report', '--since', '2026-09-01T00:00:00Z', '--until', '2026-09-29T00:00:00Z']), { client: makeClient(fake), ...cap.io })
    expect(code).toBe(0)
    expect(cap.out[0]).toBe('report inbox Website conversations=2 avg_first_response_s=15 avg_resolution_s=90')
    expect(cap.err).toContain('reports_path=/reports/summary')
    expect(fake.requests.some((r) => r.path.startsWith('/api/v2/accounts/1/reports/summary?type=label'))).toBe(true)
  })

  it('requires --since and a valid ISO date', async () => {
    expect(() => parseArgs(['--report'])).toThrow()
    await expect(runInspect(parseArgs(['--report', '--since', 'not-a-date']), { client: makeClient(createFake()), ...capture().io })).rejects.toThrow()
  })
})

describe('--contact (INBOX-03, T-77-23: booleans only)', () => {
  const contact = { id: 1, email: 'Guest@Example.test', identifier: 'uuid-123', name: 'Guest Person', phone_number: '+420000000' }

  it('formatContact prints only the two booleans', () => {
    expect(formatContact({ found: true, matches: false })).toBe('contact_found=true identifier_matches=false')
  })

  it('exit 0 when the contact exists and the identifier matches; nothing else printed', async () => {
    const cap = capture()
    const code = await runInspect(parseArgs(['--contact', 'guest@example.test', '--expect-identifier', 'uuid-123']), { client: makeClient(createFake({ contacts: [contact] })), ...cap.io })
    expect(code).toBe(0)
    expect(cap.out).toEqual(['contact_found=true identifier_matches=true'])
    expect(cap.out.join('')).not.toContain('Guest Person')
    expect(cap.out.join('')).not.toContain('uuid-123')
  })

  it('exit 1 on an identifier mismatch', async () => {
    const cap = capture()
    const code = await runInspect(parseArgs(['--contact', 'guest@example.test', '--expect-identifier', 'other']), { client: makeClient(createFake({ contacts: [contact] })), ...cap.io })
    expect(code).toBe(1)
    expect(cap.out).toEqual(['contact_found=true identifier_matches=false'])
  })

  it('exit 1 when the contact does not exist', async () => {
    const cap = capture()
    const code = await runInspect(parseArgs(['--contact', 'nobody@example.test', '--expect-identifier', 'uuid-123']), { client: makeClient(createFake()), ...cap.io })
    expect(code).toBe(1)
    expect(cap.out).toEqual(['contact_found=false identifier_matches=false'])
  })

  it('requires --expect-identifier', () => {
    expect(() => parseArgs(['--contact', 'a@b.test'])).toThrow()
  })
})
