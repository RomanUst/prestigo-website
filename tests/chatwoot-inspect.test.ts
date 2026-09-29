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
import { createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import { formatStatus, gatherStatus, parseArgs, runInspect } from '../infra/chatwoot/inspect.mjs'

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
