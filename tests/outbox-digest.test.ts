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

describe('buildOutboxDigest - caps, privacy and escaping', () => {
  it('25 distinct failed event types give exactly 20 rows plus "+5 more"', () => {
    const by_type = Array.from({ length: 25 }, (_, i) => ({
      event_type: `custom.type${String(i).padStart(2, '0')}`,
      status: 'failed',
      count: 25 - i,
    }))
    const d = buildOutboxDigest(health({ failed: 325, by_type }), { siteUrl: SITE, asOf: AS_OF })!
    expect(d.text.split('\n').filter((l) => l.startsWith('- ')).length).toBe(20)
    expect(d.html).toContain('+5 more')
    expect(d.text).toContain('+5 more')
    // biggest first: the 21st type (count 5) is cut, the 1st (count 25) is shown
    expect(d.text).toContain('custom.type00: 25')
    expect(d.text).not.toContain('custom.type24')
    // the link follows the capped list
    expect(d.text.indexOf('+5 more')).toBeLessThan(d.text.indexOf('/admin/outbox'))
    // 20 list rows + the "+5 more" row in the HTML list
    expect((d.html.match(/<li /g) ?? []).length).toBe(21)
  })

  it('exactly 20 types show 20 rows and no "more" line', () => {
    const by_type = Array.from({ length: 20 }, (_, i) => ({ event_type: `custom.t${i}`, status: 'failed', count: 1 }))
    const d = buildOutboxDigest(health({ failed: 20, by_type }), { siteUrl: SITE, asOf: AS_OF })!
    expect(d.text).not.toContain('more')
    expect(d.html).not.toContain('more')
    expect((d.html.match(/<li /g) ?? []).length).toBe(20)
  })

  it('rows are sorted by count (largest first), then by label; lead.* types share one "Lead" row', () => {
    const d = buildOutboxDigest(
      health({
        failed: 9,
        by_type: [
          { event_type: 'sync.signup', status: 'failed', count: 2 },
          { event_type: 'lead.inquiry', status: 'failed', count: 3 },
          { event_type: 'lead.booking', status: 'failed', count: 2 },
          { event_type: 'sync.booking', status: 'failed', count: 2 },
          { event_type: 'sync.booking', status: 'pending', count: 40 },
        ],
      }),
      { siteUrl: SITE, asOf: AS_OF },
    )!
    const rows = d.text.split('\n').filter((l) => l.startsWith('- '))
    expect(rows).toEqual(['- Lead: 5', '- Booking sync: 2', '- Signup sync: 2'])
  })

  it('stuck events show as one total line, not per type', () => {
    const d = buildOutboxDigest(health({ failed: 0, stuck: 7 }), { siteUrl: SITE, asOf: AS_OF })!
    expect(d.text).toContain('Stuck: 7')
    expect(d.text).not.toContain('Failed by type')
  })

  it('has no personal data: no email, phone, uuid or outbox key in subject, html or text', () => {
    const d = buildOutboxDigest(
      health({
        failed: 6,
        stuck: 2,
        pending: 4,
        by_type: [
          { event_type: 'sync.booking', status: 'failed', count: 2 },
          { event_type: 'lead.inquiry', status: 'failed', count: 3 },
          { event_type: 'erase.person', status: 'failed', count: 1 },
        ],
      }),
      { siteUrl: SITE, asOf: AS_OF },
    )!
    for (const part of [d.subject, d.html, d.text]) {
      expect(part).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/)
      expect(part).not.toMatch(/\+\d{8,}/)
      expect(part).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      expect(part).not.toContain('sync.booking:')
      expect(part).not.toMatch(/lead\.(inquiry|booking|purge):/)
    }
  })

  it('HTML-escapes an event label containing markup', () => {
    const d = buildOutboxDigest(
      health({ failed: 1, by_type: [{ event_type: '<img src=x onerror=alert(1)>&', status: 'failed', count: 1 }] }),
      { siteUrl: SITE, asOf: AS_OF },
    )!
    expect(d.html).not.toContain('<img')
    expect(d.html).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;')
  })

  it('HTML-escapes the site URL inside the link', () => {
    const d = buildOutboxDigest(health({ failed: 1 }), { siteUrl: 'https://x.test/"><script>', asOf: AS_OF })!
    expect(d.html).not.toContain('<script>')
  })

  it('uses no non-standard named HTML entities', () => {
    const d = buildOutboxDigest(health({ failed: 1 }), { siteUrl: SITE, asOf: AS_OF })!
    const named = [...d.html.matchAll(/&([a-z]+);/gi)].map((m) => m[1])
    for (const n of named) expect(['amp', 'lt', 'gt', 'quot', 'rarr']).toContain(n)
  })
})

describe('sendOutboxDigest - unconfigured and failures', () => {
  it.each(['MANAGER_EMAIL', 'RESEND_API_KEY', 'NEXT_PUBLIC_SITE_URL'])(
    'unconfigured when %s is missing: nothing is sent and nothing throws',
    async (missing) => {
      const send = vi.fn()
      const env: Record<string, string | undefined> = { ...ENV }
      delete env[missing]
      await expect(sendOutboxDigest(health({ failed: 2 }), { send, env, now: () => AS_OF })).resolves.toBe(
        'unconfigured',
      )
      expect(send).not.toHaveBeenCalled()
    },
  )

  it('unconfigured when a variable is blank', async () => {
    const send = vi.fn()
    const out = await sendOutboxDigest(health({ failed: 2 }), { send, env: { ...ENV, MANAGER_EMAIL: '  ' } })
    expect(out).toBe('unconfigured')
    expect(send).not.toHaveBeenCalled()
  })

  it('a missing configuration with no problems still reports no_problems', async () => {
    const send = vi.fn()
    expect(await sendOutboxDigest(health(), { send, env: {} })).toBe('no_problems')
    expect(send).not.toHaveBeenCalled()
  })

  it('lets a throwing sender propagate so the sweep step can record digest_failed', async () => {
    const send = vi.fn().mockRejectedValue(new Error('resend down'))
    await expect(sendOutboxDigest(health({ failed: 1 }), { send, env: ENV })).rejects.toThrow('resend down')
  })

  it('a site URL with a trailing newline (env paste) still gives a clean link in the sent message', async () => {
    const send = vi.fn().mockResolvedValue({})
    await sendOutboxDigest(health({ failed: 1 }), { send, env: { ...ENV, NEXT_PUBLIC_SITE_URL: `${SITE}\n` } })
    expect(send.mock.calls[0][0].text).toContain(`Open Outbox: ${SITE}/admin/outbox`)
  })
})
