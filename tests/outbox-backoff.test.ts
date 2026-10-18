// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  OUTBOX_BACKOFF_SECONDS,
  OUTBOX_MAX_ATTEMPTS,
  AUTH_BREAKER_SECONDS,
  nextAttemptDelaySeconds,
  isTerminalAttempt,
} from '@/lib/outbox-backoff'

describe('outbox backoff', () => {
  it('uses the D-18 table', () => {
    expect([...OUTBOX_BACKOFF_SECONDS]).toEqual([60, 300, 900, 3600, 10800, 21600, 43200, 86400])
    expect(OUTBOX_MAX_ATTEMPTS).toBe(30)
    expect(AUTH_BREAKER_SECONDS).toBe(21600)
  })

  it('delays for attempts 1..10 follow the table and then repeat 86400', () => {
    const delays = Array.from({ length: 10 }, (_, i) => nextAttemptDelaySeconds(i + 1))
    expect(delays).toEqual([60, 300, 900, 3600, 10800, 21600, 43200, 86400, 86400, 86400])
  })

  it('clamps nonsense attempt counts', () => {
    expect(nextAttemptDelaySeconds(0)).toBe(60)
    expect(nextAttemptDelaySeconds(-5)).toBe(60)
    expect(nextAttemptDelaySeconds(Number.NaN)).toBe(60)
    expect(nextAttemptDelaySeconds(1000)).toBe(86400)
  })

  it('is terminal from the 30th attempt', () => {
    expect(isTerminalAttempt(29)).toBe(false)
    expect(isTerminalAttempt(30)).toBe(true)
    expect(isTerminalAttempt(31)).toBe(true)
  })
})
