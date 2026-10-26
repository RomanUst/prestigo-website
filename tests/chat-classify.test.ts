import { describe, expect, it } from 'vitest'
import {
  NO_LEAD_LABEL,
  channelLabel,
  hasNoLeadLabel,
  leadSourceForChannel,
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
