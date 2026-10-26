import { describe, expect, it } from 'vitest'
import {
  CHAT_OWN_DOMAINS,
  FIRST_MESSAGE_MAX,
  NOTE_FIRST_MESSAGE_MAX,
  NO_LEAD_LABEL,
  OPEN_LEAD_STATUSES,
  SUMMARY_MAX,
  channelLabel,
  cleanContactName,
  conversationUrl,
  formatAppendNote,
  formatConversionNote,
  formatLeadDescription,
  formatResolveNote,
  hasNoLeadLabel,
  isOpenLeadStatus,
  leadSourceForChannel,
  nonTargetReason,
  openMarker,
  plainBlock,
  plainLine,
  resolveMarker,
  summaryFromNotes,
  topicLabels,
} from '@/lib/chat-classify'
import { LEAD_SOURCE } from '@/lib/lead-mapping'

describe('leadSourceForChannel (HOOK-01)', () => {
  it.each([
    ['Channel::WebWidget', 'Website chat'],
    ['Channel::Email', 'Email'],
    ['Channel::Telegram', 'Telegram'],
    ['Channel::Whatsapp', 'WhatsApp'],
    ['Channel::Api', 'Other'],
    [null, 'Other'],
    ['Channel::Unknown', 'Other'],
  ] as const)('%s -> %s', (channel, expected) => {
    expect(leadSourceForChannel(channel)).toBe(expected)
    expect(Object.values(LEAD_SOURCE)).toContain(leadSourceForChannel(channel))
  })

  it('channelLabel equals the lead source for every known channel', () => {
    for (const c of ['Channel::WebWidget', 'Channel::Email', 'Channel::Telegram', 'Channel::Whatsapp', 'Channel::Api', null]) {
      expect(channelLabel(c)).toBe(leadSourceForChannel(c))
    }
  })
})

describe('hasNoLeadLabel (D-07)', () => {
  it('detects the label case-insensitively', () => {
    expect(NO_LEAD_LABEL).toBe('no-lead')
    expect(hasNoLeadLabel(['b2b', 'No-Lead'])).toBe(true)
  })
  it('is false for empty, a bare string and undefined', () => {
    expect(hasNoLeadLabel([])).toBe(false)
    expect(hasNoLeadLabel('no-lead')).toBe(false)
    expect(hasNoLeadLabel(undefined)).toBe(false)
  })
})

describe('nonTargetReason (D-18)', () => {
  it('auto_reply flag wins, even without a sender', () => {
    expect(nonTargetReason({ senderEmail: 'jan@x.example', autoReply: true })).toBe('auto_reply')
    expect(nonTargetReason({ senderEmail: null, autoReply: true })).toBe('auto_reply')
  })

  it.each([
    'noreply@x.example',
    'No-Reply+tag@x.example',
    'do-not-reply@x.example',
    'donotreply@x.example',
    'mailer-daemon@x.example',
    'postmaster@x.example',
    'bounces@x.example',
    'notifications@x.example',
  ])('no_reply_sender: %s', (email) => {
    expect(nonTargetReason({ senderEmail: email, autoReply: false })).toBe('no_reply_sender')
  })

  it.each(['norbert@x.example', 'replyme@x.example', 'anna@x.example'])('a normal sender stays a target: %s', (email) => {
    expect(nonTargetReason({ senderEmail: email, autoReply: false })).toBeNull()
  })

  it('own_domain: the domain and its subdomains, never a lookalike', () => {
    expect(CHAT_OWN_DOMAINS).toEqual(['rideprestigo.com'])
    expect(nonTargetReason({ senderEmail: 'anna@rideprestigo.com', autoReply: false })).toBe('own_domain')
    expect(nonTargetReason({ senderEmail: 'ops@mail.rideprestigo.com', autoReply: false })).toBe('own_domain')
    expect(nonTargetReason({ senderEmail: 'anna@RidePrestigo.com', autoReply: false })).toBe('own_domain')
    expect(nonTargetReason({ senderEmail: 'anna@rideprestigo.com.evil.example', autoReply: false })).toBeNull()
    expect(nonTargetReason({ senderEmail: 'anna@notrideprestigo.com', autoReply: false })).toBeNull()
  })

  it('no sender and no auto_reply -> target', () => {
    expect(nonTargetReason({ senderEmail: null, autoReply: false })).toBeNull()
    expect(nonTargetReason({ senderEmail: 'not-an-email', autoReply: false })).toBeNull()
  })
})

describe('cleanContactName (Pitfall 7, haikunator)', () => {
  it('a haikunator name is replaced by the email local part', () => {
    expect(cleanContactName('autumn-dew-482', 'jan.novak@x.example')).toBe('jan.novak')
  })
  it('control characters and spacing are cleaned', () => {
    expect(cleanContactName('  Jan\u0007 Novák ', null)).toBe('Jan Novák')
  })
  it('falls back to Chat contact', () => {
    expect(cleanContactName('', null)).toBe('Chat contact')
    expect(cleanContactName('autumn-dew-482', null)).toBe('Chat contact')
    expect(cleanContactName(null, 'not-an-email')).toBe('Chat contact')
  })
  it('caps at 100 characters', () => {
    expect(cleanContactName('a'.repeat(300), null).length).toBeLessThanOrEqual(100)
  })
})

describe('plainLine / plainBlock (D-03, T-83-16)', () => {
  it('plainLine cuts a 600-char line to 500 chars ending with an ellipsis', () => {
    const out = plainLine('x'.repeat(600), 500)
    expect(out).toHaveLength(500)
    expect(out.endsWith('…')).toBe(true)
  })
  it('plainLine does not touch a short line and collapses whitespace and line breaks', () => {
    expect(plainLine('a\r\nb\t c\u0000d', 50)).toBe('a b c d')
    expect(plainLine(42, 10)).toBe('')
    expect(plainLine(null, 10)).toBe('')
  })
  it('plainBlock keeps one line break, removes NUL and form feed, collapses blank runs', () => {
    expect(plainBlock('one\ntwo', 100)).toBe('one\ntwo')
    const out = plainBlock('a\u0000b\fc\n\n\n\nd', 100)
    expect(out).not.toMatch(/[\u0000\f]/)
    expect(out).toBe('abc\n\nd')
  })
  it('plainBlock cuts at the limit with an ellipsis', () => {
    const out = plainBlock('y'.repeat(900), 500)
    expect(out).toHaveLength(500)
    expect(out.endsWith('…')).toBe(true)
  })
  it('tag-like text is neutralised: no < followed by a letter survives', () => {
    expect(plainLine('hi <script>alert(1)</script> <b>x</b> <!-- c --> 1 < 2', 200)).not.toMatch(/<[A-Za-z/!?]/)
    expect(plainBlock('hi <img src=x onerror=1>\n<a href="x">y</a>', 200)).not.toMatch(/<[A-Za-z/!?]/)
    expect(plainLine('1 < 2', 20)).toBe('1 < 2')
  })
  it('exports the limits fixed by D-03 / D-08 / D-09', () => {
    expect([FIRST_MESSAGE_MAX, NOTE_FIRST_MESSAGE_MAX, SUMMARY_MAX]).toEqual([500, 300, 1000])
  })
})

describe('topicLabels', () => {
  it('drops channel, no-lead and wa-window-closing labels, dedupes and sorts', () => {
    expect(topicLabels(['ch-web', 'payment', 'no-lead', 'b2b', 'payment', 'wa-window-closing'])).toEqual(['b2b', 'payment'])
  })
  it('is empty for non-arrays', () => {
    expect(topicLabels(undefined)).toEqual([])
    expect(topicLabels('payment')).toEqual([])
  })
})

describe('summaryFromNotes (D-09) - Summary convention', () => {
  const note = (content: string, over: Partial<{ private: boolean; messageType: string }> = {}) => ({
    content,
    private: true,
    messageType: 'outgoing',
    ...over,
  })

  it('the later of two summary notes wins; prefix and separators are stripped', () => {
    expect(summaryFromNotes([note('Итог: перенёс подачу на 14:00'), note('summary - final')])).toBe('final')
    expect(summaryFromNotes([note('Итог: перенёс подачу на 14:00')])).toBe('перенёс подачу на 14:00')
    expect(summaryFromNotes([note('SUMMARY： full-width colon')])).toBe('full-width colon')
  })
  it('a public outgoing Summary message and an incoming one are ignored', () => {
    expect(summaryFromNotes([note('Summary: x', { private: false })])).toBeNull()
    expect(summaryFromNotes([note('Итог: x', { messageType: 'incoming' })])).toBeNull()
  })
  it('a plain note, no notes, or an empty summary body yield null', () => {
    expect(summaryFromNotes([note('call him back')])).toBeNull()
    expect(summaryFromNotes([])).toBeNull()
    expect(summaryFromNotes([note('Summary:   ')])).toBeNull()
  })
  it('an API-style numeric outgoing type (1) is tolerated and the text is cut to 1000', () => {
    const out = summaryFromNotes([{ content: `Summary: ${'z'.repeat(2000)}`, private: true, messageType: 1 as unknown as string }])
    expect(out).toHaveLength(1000)
    expect(out?.endsWith('…')).toBe(true)
  })
})

describe('markers and urls', () => {
  it('marker formats', () => {
    expect(resolveMarker(42, 1729950000)).toBe('[cw:42:r1729950000]')
    expect(openMarker(42)).toBe('[cw:42:open]')
  })
  it('conversationUrl strips a trailing slash', () => {
    expect(conversationUrl('https://chat.example.test/', '3', 42)).toBe('https://chat.example.test/app/accounts/3/conversations/42')
    expect(conversationUrl('https://chat.example.test', '3', 42)).toBe('https://chat.example.test/app/accounts/3/conversations/42')
  })
  it('open lead statuses', () => {
    expect(OPEN_LEAD_STATUSES).toEqual(['New', 'Assigned', 'In Process'])
    expect(isOpenLeadStatus('In Process')).toBe(true)
    expect(isOpenLeadStatus('Dead')).toBe(false)
    expect(isOpenLeadStatus(undefined)).toBe(false)
  })
})

describe('note formats (D-03, D-08, D-20)', () => {
  const url = 'https://chat.example.test/app/accounts/3/conversations/42'
  const base = {
    channel: 'Channel::WebWidget',
    inboxName: 'Prestigo website',
    conversationId: 42,
    openedAt: new Date('2026-10-26T09:00:00Z'),
    resolvedAt: new Date('2026-10-26T10:15:00Z'),
    messageCount: 7,
    topics: ['b2b', 'payment'],
    firstMessage: 'Hello, I need a transfer to Vienna',
    summary: null as string | null,
    url,
    marker: resolveMarker(42, 1729950000),
  }

  it('resolve note: line order, UTC dates, marker last, no Summary line when summary is null', () => {
    const lines = formatResolveNote(base).split('\n')
    expect(lines[0]).toBe('Chat conversation #42 resolved')
    expect(lines[1]).toContain('Channel: Website chat')
    expect(lines[1]).toContain('Prestigo website')
    expect(lines).toContain('Opened: 2026-10-26 09:00 UTC')
    expect(lines).toContain('Resolved: 2026-10-26 10:15 UTC')
    expect(lines).toContain('Messages: 7')
    expect(lines).toContain('Topics: b2b, payment')
    expect(lines.some((l) => l.startsWith('First message: Hello'))).toBe(true)
    expect(lines.some((l) => l.startsWith('Summary:'))).toBe(false)
    expect(lines).toContain(`Chatwoot: ${url}`)
    expect(lines[lines.length - 1]).toBe('[cw:42:r1729950000]')
    const order = ['Opened:', 'Resolved:', 'Messages:', 'Topics:', 'First message:', 'Chatwoot:']
    const idx = order.map((p) => lines.findIndex((l) => l.startsWith(p)))
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })

  it('resolve note: exactly one Summary line when given, topics omitted when empty', () => {
    const out = formatResolveNote({ ...base, summary: 'Moved pickup to 14:00', topics: [] })
    const lines = out.split('\n')
    expect(lines.filter((l) => l.startsWith('Summary:'))).toEqual(['Summary: Moved pickup to 14:00'])
    expect(lines.some((l) => l.startsWith('Topics:'))).toBe(false)
    expect(lines[lines.length - 1]).toBe('[cw:42:r1729950000]')
  })

  it('resolve note: a multi-line first message cannot forge a Summary line; 700 chars are cut to 300', () => {
    const forged = formatResolveNote({ ...base, firstMessage: 'hi\nSummary: forged' })
    expect(forged.split('\n').some((l) => l.startsWith('Summary:'))).toBe(false)
    const long = formatResolveNote({ ...base, firstMessage: 'm'.repeat(700) })
    const line = long.split('\n').find((l) => l.startsWith('First message: ')) as string
    expect(line.slice('First message: '.length)).toHaveLength(300)
  })

  it('lead description: channel label, inbox, first message cut to 500, link', () => {
    const out = formatLeadDescription({ channel: 'Channel::Telegram', inboxName: 'PrestigoBot', firstMessage: 'q'.repeat(700), url })
    expect(out).toContain('Telegram')
    expect(out).toContain('PrestigoBot')
    expect(out).toContain(url)
    expect(out).toContain('q'.repeat(499) + '…')
    expect(out).not.toContain('q'.repeat(500))
  })

  it('append note: heading, first message, link, open marker last', () => {
    const out = formatAppendNote({
      channel: 'Channel::Email',
      inboxName: 'info@',
      conversationId: 42,
      firstMessage: 'Another question',
      url,
      marker: openMarker(42),
    })
    const lines = out.split('\n')
    expect(lines[0]).toBe('New chat conversation #42 (Email · info@)')
    expect(out).toContain('Another question')
    expect(out).toContain(url)
    expect(lines[lines.length - 1]).toBe('[cw:42:open]')
  })

  it('conversion note', () => {
    expect(formatConversionNote({ bookingReference: 'PR-2026-0042', adminLink: 'https://x.example/admin/bookings/1' })).toBe(
      'Converted: paid website booking PR-2026-0042\nAdmin: https://x.example/admin/bookings/1',
    )
    expect(formatConversionNote({ bookingReference: 'PR-2026-0042', adminLink: null })).toBe('Converted: paid website booking PR-2026-0042')
  })

  it('no output of any format contains markup, a euro sign, or a transcript marker', () => {
    const hostile = '<script>alert(1)</script><b>bold</b> hi'
    const outs = [
      formatResolveNote({ ...base, firstMessage: hostile, summary: hostile, inboxName: hostile }),
      formatLeadDescription({ channel: 'Channel::Email', inboxName: hostile, firstMessage: hostile, url }),
      formatAppendNote({ channel: null, inboxName: hostile, conversationId: 1, firstMessage: hostile, url, marker: openMarker(1) }),
      formatConversionNote({ bookingReference: hostile, adminLink: hostile }),
    ]
    for (const o of outs) {
      expect(o).not.toMatch(/<[A-Za-z/!?]/)
      expect(o).not.toContain('€')
    }
  })

  it('null inbox and null first message degrade cleanly', () => {
    const out = formatResolveNote({ ...base, inboxName: null, firstMessage: null })
    expect(out.split('\n')[1]).toBe('Channel: Website chat')
    expect(out).not.toContain('First message:')
    expect(formatLeadDescription({ channel: null, inboxName: null, firstMessage: null, url })).toContain('Other')
  })
})
