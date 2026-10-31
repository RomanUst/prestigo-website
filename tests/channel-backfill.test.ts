// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- fake API payloads are intentionally loose */
/**
 * Phase 85, Plan 04 (D-04) - one-time chat_leads.channel backfill script, proven
 * against an in-memory fake Chatwoot API. No test here makes a network call or reads
 * a real token. Synthetic fixtures only.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createChatwootClient } from '../infra/chatwoot/lib/client.mjs'
import {
  BackfillInputError,
  backfillStatement,
  channelOf,
  parseBackfillInput,
  runBackfill,
} from '../infra/chatwoot/channel-backfill.mjs'

const FAKE_TOKEN = 'tok_SECRET_0123456789abcdef'
const BASE = 'https://chat.example.test'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const LEAD_A = '3f0c1a2b-1111-4222-8333-444455556666'
const LEAD_B = '3f0c1a2b-1111-4222-8333-444455556667'
const LEAD_C = '3f0c1a2b-1111-4222-8333-444455556668'
const LEAD_D = '3f0c1a2b-1111-4222-8333-444455556669'

function createFake(conversations: Record<number, any>) {
  const requests: Array<{ method: string; url: string }> = []
  const fetchImpl = async (url: string, init: any = {}) => {
    requests.push({ method: init.method ?? 'GET', url })
    const match = /\/conversations\/(\d+)$/.exec(url)
    const body = match ? conversations[Number(match[1])] : undefined
    if (body === undefined) return new Response(JSON.stringify({ error: 'Resource could not be found' }), { status: 404 })
    return new Response(JSON.stringify(body), { status: 200 })
  }
  return { requests, fetchImpl }
}

function writer() {
  const chunks: string[] = []
  return { write: (text: string) => chunks.push(text), text: () => chunks.join('') }
}

describe('backfillStatement', () => {
  it('emits the exact idempotent UPDATE', () => {
    expect(backfillStatement(LEAD_A, 'Channel::Telegram')).toBe(
      `UPDATE public.chat_leads SET channel = public.chat_channel_bucket('Channel::Telegram') WHERE id = '${LEAD_A}' AND channel IS NULL;`,
    )
  })

  it.each([
    ['not-a-uuid', 'Channel::Telegram'],
    [LEAD_A.toUpperCase(), 'Channel::Telegram'],
    [LEAD_A, "Channel::Web'); DROP TABLE x; --"],
    [LEAD_A, 'Telegram'],
    [LEAD_A, 'Channel::'],
  ])('refuses an unvalidated value (%s, %s)', (leadId, raw) => {
    expect(() => backfillStatement(leadId, raw)).toThrow(BackfillInputError)
  })
})

describe('channelOf', () => {
  it('reads meta.channel, then channel', () => {
    expect(channelOf({ meta: { channel: 'Channel::Whatsapp' } })).toBe('Channel::Whatsapp')
    expect(channelOf({ channel: 'Channel::Email' })).toBe('Channel::Email')
  })

  it('returns null for anything that is not a Channel:: class', () => {
    expect(channelOf({ meta: { channel: "Channel::Web'); DROP TABLE x; --" } })).toBeNull()
    expect(channelOf({ meta: { channel: 'Channel::' } })).toBeNull()
    expect(channelOf({ meta: { channel: 42 } })).toBeNull()
    expect(channelOf({})).toBeNull()
    expect(channelOf(null)).toBeNull()
    expect(channelOf('Channel::Email')).toBeNull()
  })
})

describe('parseBackfillInput', () => {
  it('maps lead_id / conversation_id and accepts a null conversation', () => {
    expect(
      parseBackfillInput(
        JSON.stringify([
          { lead_id: LEAD_A, conversation_id: 101 },
          { lead_id: LEAD_B, conversation_id: null },
        ]),
      ),
    ).toEqual([
      { leadId: LEAD_A, conversationId: 101 },
      { leadId: LEAD_B, conversationId: null },
    ])
  })

  it.each([
    ['invalid JSON', '{nope'],
    ['a non-array', '{"lead_id":"x"}'],
    ['a non-uuid lead id', JSON.stringify([{ lead_id: 'not-a-uuid', conversation_id: 1 }])],
    ['a negative conversation id', JSON.stringify([{ lead_id: LEAD_A, conversation_id: -1 }])],
    ['a fractional conversation id', JSON.stringify([{ lead_id: LEAD_A, conversation_id: 1.5 }])],
    ['a string conversation id', JSON.stringify([{ lead_id: LEAD_A, conversation_id: '7' }])],
    ['a non-object item', JSON.stringify([7])],
  ])('rejects %s', (_label, text) => {
    expect(() => parseBackfillInput(text)).toThrow(BackfillInputError)
  })
})

describe('runBackfill', () => {
  it('prints one UPDATE per resolvable conversation, GETs only, and leaks neither PII nor the token', async () => {
    const fake = createFake({
      101: {
        id: 101,
        meta: {
          channel: 'Channel::Whatsapp',
          sender: { name: 'Jane Secret', email: 'jane@secret.test', phone_number: '+420700000001' },
        },
        messages: [{ content: 'Please call me, my card is 4111' }],
      },
      103: { id: 103, meta: { channel: 'Channel::Api' } },
    })
    const client = createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })
    const out = writer()
    const err = writer()

    const result = await runBackfill({
      client,
      items: [
        { leadId: LEAD_A, conversationId: 101 },
        { leadId: LEAD_B, conversationId: 102 },
        { leadId: LEAD_C, conversationId: 103 },
        { leadId: LEAD_D, conversationId: null },
      ],
      out,
      err,
    })

    expect(result).toEqual({ statements: 2, skipped: 2 })
    expect(out.text()).toBe(
      [
        backfillStatement(LEAD_A, 'Channel::Whatsapp'),
        backfillStatement(LEAD_C, 'Channel::Api'),
        '-- channel-backfill: leads=4 statements=2 skipped=2',
        '',
      ].join('\n'),
    )
    expect(err.text()).toBe('conversation 102: HTTP 404\n')
    expect(fake.requests).toHaveLength(3)
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true)
    const all = out.text() + err.text()
    for (const secret of ['Jane Secret', 'jane@secret.test', '+420700000001', '4111', FAKE_TOKEN, 'Resource could not be found']) {
      expect(all).not.toContain(secret)
    }
  })

  it('skips a conversation whose class is not a clean Channel:: value instead of quoting it into SQL', async () => {
    const fake = createFake({ 201: { id: 201, meta: { channel: "Channel::Web'); DROP TABLE x; --" } } })
    const client = createChatwootClient({ baseUrl: BASE, token: FAKE_TOKEN, accountId: '1', fetchImpl: fake.fetchImpl as any })
    const out = writer()
    const err = writer()

    const result = await runBackfill({ client, items: [{ leadId: LEAD_A, conversationId: 201 }], out, err })

    expect(result).toEqual({ statements: 0, skipped: 1 })
    expect(out.text()).not.toMatch(/UPDATE|DROP/)
    expect(out.text()).toContain('-- channel-backfill: leads=1 statements=0 skipped=1')
  })
})

describe('script source (static guarantees)', () => {
  const source = readFileSync(join(REPO_ROOT, 'infra/chatwoot/channel-backfill.mjs'), 'utf8')

  it('only ever sends GET requests', () => {
    expect(source).not.toMatch(/request\('(POST|PUT|PATCH|DELETE)'/)
    expect(source).toMatch(/request\('GET'/)
  })

  it('reads the token through loadChatwootConfig and takes no CLI arguments', () => {
    expect(source).toContain('loadChatwootConfig')
    expect(source).not.toMatch(/process\.argv\[[2-9]|process\.argv\.slice/)
  })
})
