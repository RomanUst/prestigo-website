// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { safeEqual, verifyChatwootSignature, verifyEspoSignature } from '@/lib/webhook-verify'
import { espoSignature } from '../infra/espocrm/webhook.mjs'
import { chatwootSignature } from '../infra/chatwoot/webhook.mjs'

// Obviously fake secrets, carried as object properties.
const SECRETS = { current: 'unit-test-fake-secret-current', previous: 'unit-test-fake-secret-previous' }
const NOW = 1_729_950_000
const BODY = Buffer.from(JSON.stringify({ event: 'message_created', conversation: { id: 42 } }))

function sign(secret: string, ts: string | number, body: Buffer = BODY): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${ts}.`), body])).digest('hex')
}

function verify(overrides: Partial<Parameters<typeof verifyChatwootSignature>[0]> = {}) {
  const timestamp = String(NOW)
  return verifyChatwootSignature({
    rawBody: BODY,
    signature: sign(SECRETS.current, timestamp),
    timestamp,
    secrets: [SECRETS.current],
    nowSec: NOW,
    ...overrides,
  })
}

describe('verifyChatwootSignature', () => {
  it('a valid signature is ok', () => {
    expect(verify()).toBe('ok')
  })

  it('a tampered body is bad_signature', () => {
    expect(verify({ rawBody: Buffer.from(JSON.stringify({ event: 'message_created', conversation: { id: 43 } })) })).toBe(
      'bad_signature',
    )
  })

  it('a different timestamp than the signed one is bad_signature', () => {
    expect(verify({ timestamp: String(NOW + 1) })).toBe('bad_signature')
  })

  it('a wrong secret is bad_signature', () => {
    expect(verify({ signature: sign('unit-test-fake-secret-wrong', NOW) })).toBe('bad_signature')
  })

  it('the second secret in the list is ok (rotation without a gap)', () => {
    const signature = sign(SECRETS.previous, NOW)
    expect(verify({ signature, secrets: [SECRETS.current, SECRETS.previous] })).toBe('ok')
    expect(verify({ signature, secrets: [SECRETS.current] })).toBe('bad_signature')
  })

  it('an empty secret in the list is never used as a key', () => {
    expect(verify({ signature: sign('', NOW), secrets: [SECRETS.current, ''] })).toBe('bad_signature')
  })

  it('an empty secret list fails closed', () => {
    expect(verify({ secrets: [] })).toBe('bad_signature')
  })

  it('a timestamp 300 s old is ok (window edge)', () => {
    const ts = String(NOW - 300)
    expect(verify({ timestamp: ts, signature: sign(SECRETS.current, ts) })).toBe('ok')
  })

  it('a timestamp 301 s old is stale', () => {
    const ts = String(NOW - 301)
    expect(verify({ timestamp: ts, signature: sign(SECRETS.current, ts) })).toBe('stale')
  })

  it('a timestamp 300 s ahead is ok and 301 s ahead is stale (two-sided window)', () => {
    const ok = String(NOW + 300)
    expect(verify({ timestamp: ok, signature: sign(SECRETS.current, ok) })).toBe('ok')
    const ahead = String(NOW + 301)
    expect(verify({ timestamp: ahead, signature: sign(SECRETS.current, ahead) })).toBe('stale')
  })

  it('honours a custom window', () => {
    const ts = String(NOW - 61)
    expect(verify({ timestamp: ts, signature: sign(SECRETS.current, ts), windowSec: 60 })).toBe('stale')
    expect(verify({ timestamp: ts, signature: sign(SECRETS.current, ts), windowSec: 61 })).toBe('ok')
  })

  it('a missing signature is malformed', () => {
    expect(verify({ signature: null })).toBe('malformed')
    expect(verify({ signature: '' })).toBe('malformed')
  })

  it('a missing timestamp is malformed', () => {
    expect(verify({ timestamp: null })).toBe('malformed')
    expect(verify({ timestamp: '' })).toBe('malformed')
  })

  it.each(['abc', '12.5', '-1729950000', '1729950000abc', '123', '1729950000000000', ' 1729950000'])(
    'a non-numeric or out-of-shape timestamp %j is malformed',
    (timestamp) => {
      expect(verify({ timestamp })).toBe('malformed')
    },
  )

  it('a short signature is bad_signature and never throws', () => {
    expect(() => verify({ signature: 'sha256=ab' })).not.toThrow()
    expect(verify({ signature: 'sha256=ab' })).toBe('bad_signature')
  })

  it('a long or non-ASCII signature is bad_signature and never throws', () => {
    expect(verify({ signature: sign(SECRETS.current, NOW) + 'ff' })).toBe('bad_signature')
    expect(verify({ signature: 'sha256=' + 'é'.repeat(64) })).toBe('bad_signature')
  })

  it('a signature without the sha256= prefix is bad_signature', () => {
    expect(verify({ signature: sign(SECRETS.current, NOW).slice('sha256='.length) })).toBe('bad_signature')
  })
})

describe('safeEqual', () => {
  it('compares equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })

  it('unequal content or length is false and never throws', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(() => safeEqual('abc', 'abcd')).not.toThrow()
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', 'a')).toBe(false)
  })
})

// ── EspoCRM (Phase 83-11): Signature = base64("<webhookId>:<hex HMAC-SHA256(body, secret)>") ──

const ESPO_BODY = Buffer.from(JSON.stringify([{ id: '0123456789abcdef0', lastName: 'Novák' }]))
const WEBHOOK_ID = '5f0c1c2e11114222a'

function espoSig(secret: string, id = WEBHOOK_ID, body: Buffer = ESPO_BODY): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex')
  return Buffer.from(`${id}:${hex}`).toString('base64')
}

function verifyEspo(overrides: Partial<Parameters<typeof verifyEspoSignature>[0]> = {}) {
  return verifyEspoSignature({
    rawBody: ESPO_BODY,
    signature: espoSig(SECRETS.current),
    secrets: [SECRETS.current],
    ...overrides,
  })
}

describe('verifyEspoSignature', () => {
  it('a valid signature is ok', () => {
    expect(verifyEspo()).toBe('ok')
  })

  it('a signature made with the previous secret is ok while it is listed', () => {
    expect(verifyEspo({ signature: espoSig(SECRETS.previous), secrets: [SECRETS.current, SECRETS.previous] })).toBe('ok')
    expect(verifyEspo({ signature: espoSig(SECRETS.previous) })).toBe('bad_signature')
  })

  it('the webhook id is pinned only when expected', () => {
    expect(verifyEspo({ expectedWebhookId: WEBHOOK_ID })).toBe('ok')
    expect(verifyEspo({ expectedWebhookId: 'ffffffffffffffff0' })).toBe('wrong_webhook')
    expect(verifyEspo({ signature: espoSig(SECRETS.current, 'other-id') })).toBe('ok')
  })

  it('a tampered body is a bad_signature', () => {
    expect(verifyEspo({ rawBody: Buffer.from('[{"id":"0123456789abcdef0","lastName":"X"}]') })).toBe('bad_signature')
  })

  it('null, non-base64 and no-colon signatures are malformed', () => {
    expect(verifyEspo({ signature: null })).toBe('malformed')
    expect(verifyEspo({ signature: '' })).toBe('malformed')
    expect(verifyEspo({ signature: 'not base64 !!' })).toBe('malformed')
    expect(verifyEspo({ signature: Buffer.from('nocolonhere').toString('base64') })).toBe('malformed')
    expect(verifyEspo({ signature: Buffer.from(`${WEBHOOK_ID}:`).toString('base64') })).toBe('malformed')
  })

  it('hex of another length is a bad_signature and never throws', () => {
    const short = Buffer.from(`${WEBHOOK_ID}:abcd`).toString('base64')
    const long = Buffer.from(`${WEBHOOK_ID}:${'a'.repeat(200)}`).toString('base64')
    expect(() => verifyEspo({ signature: short })).not.toThrow()
    expect(verifyEspo({ signature: short })).toBe('bad_signature')
    expect(verifyEspo({ signature: long })).toBe('bad_signature')
  })

  it('no configured secret never verifies', () => {
    expect(verifyEspo({ secrets: [] })).toBe('bad_signature')
    expect(verifyEspo({ secrets: [''] })).toBe('bad_signature')
  })
})

describe('signer cross-checks (infra scripts vs site verifiers)', () => {
  it('espoSignature from infra/espocrm/webhook.mjs verifies with verifyEspoSignature', () => {
    const signature = espoSignature(WEBHOOK_ID, SECRETS.current, ESPO_BODY.toString('utf8'))
    expect(verifyEspoSignature({ rawBody: ESPO_BODY, signature, secrets: [SECRETS.current], expectedWebhookId: WEBHOOK_ID })).toBe('ok')
  })

  it('chatwootSignature from infra/chatwoot/webhook.mjs verifies with verifyChatwootSignature', () => {
    const signature = chatwootSignature(SECRETS.current, NOW, BODY.toString('utf8'))
    expect(
      verifyChatwootSignature({ rawBody: BODY, signature, timestamp: String(NOW), secrets: [SECRETS.current], nowSec: NOW }),
    ).toBe('ok')
  })
})
