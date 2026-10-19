// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { buildOutboxDigest, sendOutboxDigest } from '@/lib/outbox-digest'
import type { OutboxHealth } from '@/lib/outbox-admin-store'

const SITE = 'https://rideprestigo.com'
const AS_OF = new Date('2026-10-19T04:00:00.000Z')

function health(over: Partial<OutboxHealth> = {}): OutboxHealth {
  return {
    pending: 0,
    processing: 0,
    failed: 0,
    stuck: 0,
    open_total: 0,
    oldest_pending_seconds: null,
    sent_last_24h: 0,
    by_type: [],
    ...over,
  }
}

const ENV = { RESEND_API_KEY: 're_test', MANAGER_EMAIL: 'owner@example.test', NEXT_PUBLIC_SITE_URL: SITE }

describe('buildOutboxDigest', () => {
  it('failed 3 + stuck 1: subject, body sentence and the Outbox link', () => {
    const d = buildOutboxDigest(
      health({ failed: 3, stuck: 1, by_type: [{ event_type: 'sync.booking', status: 'failed', count: 3 }] }),
      { siteUrl: SITE, asOf: AS_OF },
    )
    expect(d).not.toBeNull()
    expect(d!.subject).toBe('Prestigo sync: 4 events need attention')
    expect(d!.text).toContain('3 failed and 1 stuck sync events as of 19 October 2026, 04:00 UTC.')
    expect(d!.text).toContain('Check that the CRM server is reachable, then open the Outbox to retry.')
    expect(d!.text).toContain(`${SITE}/admin/outbox`)
    expect(d!.html).toContain(`href="${SITE}/admin/outbox"`)
    expect(d!.html).toContain('3 failed and 1 stuck sync events as of 19 October 2026, 04:00 UTC.')
  })

  it('returns null when nothing failed and nothing is stuck', () => {
    expect(buildOutboxDigest(health({ pending: 5, open_total: 5 }), { siteUrl: SITE, asOf: AS_OF })).toBeNull()
  })

  it('a single failed event renders one row (and a singular subject)', () => {
    const d = buildOutboxDigest(
      health({ failed: 1, by_type: [{ event_type: 'sync.signup', status: 'failed', count: 1 }] }),
      { siteUrl: SITE, asOf: AS_OF },
    )!
    expect(d.subject).toBe('Prestigo sync: 1 event needs attention')
    expect((d.html.match(/<li/g) ?? []).length).toBe(1)
    expect(d.text).toContain('Signup sync: 1')
  })

  it('ignores a trailing newline or slash on the site URL', () => {
    const d = buildOutboxDigest(health({ failed: 1 }), { siteUrl: `${SITE}/\n`, asOf: AS_OF })!
    expect(d.text).toContain(`${SITE}/admin/outbox`)
    expect(d.text).not.toContain('//admin')
  })
})

describe('sendOutboxDigest', () => {
  it('sends one message to MANAGER_EMAIL when there are problems', async () => {
    const send = vi.fn().mockResolvedValue({})
    const out = await sendOutboxDigest(health({ failed: 2 }), { send, env: ENV, now: () => AS_OF })
    expect(out).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.to).toEqual(['owner@example.test'])
    expect(msg.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
    expect(msg.subject).toBe('Prestigo sync: 2 events need attention')
    expect(typeof msg.html).toBe('string')
    expect(typeof msg.text).toBe('string')
  })

  it('no problems: no email', async () => {
    const send = vi.fn()
    const out = await sendOutboxDigest(health({ pending: 3 }), { send, env: ENV, now: () => AS_OF })
    expect(out).toBe('no_problems')
    expect(send).not.toHaveBeenCalled()
  })
})
