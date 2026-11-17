// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakePaymentsDb, type FakePaymentsDb } from './helpers/fake-payments-db'

/**
 * Phase 89 plan 89-04 (CANC-02, D-01, D-02; T-89-11, T-89-12): the manage token is 256 random bits in
 * booking_manage_tokens, exists only for a booking that stored a policy and is not a partner booking, and
 * resolves to one identical null for every invalid reason.
 */

const { world, createClientSpy } = vi.hoisted(() => ({
  world: { db: null as null | { client: { from: (t: string) => unknown } } },
  createClientSpy: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => {
    createClientSpy()
    return { from: (table: string) => world.db!.client.from(table) }
  },
}))

import {
  MANAGE_TOKEN_RE,
  buildManageUrl,
  ensureManageToken,
  newManageToken,
  resolveManageToken,
  revokeManageToken,
} from '@/lib/manage-link'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-10T12:00:00Z')
const STORED = { cancel_policy_version: '2026-11-1' }

let db: FakePaymentsDb

function seed(over: Record<string, unknown> = {}): string {
  const bookings = db.state.bookings
  bookings.push({
    id: `b-${bookings.length + 1}`,
    ...STORED,
    anonymised_at: null,
    pickup_utc: new Date(NOW + 5 * DAY).toISOString(),
    pickup_date: '2026-11-15',
    pickup_time: '10:00',
    ...over,
  } as never)
  return bookings[bookings.length - 1].id as string
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  db = createFakePaymentsDb({ nowMs: NOW })
  world.db = db
  createClientSpy.mockClear()
  delete process.env.NEXT_PUBLIC_SITE_URL
})
afterEach(() => {
  vi.useRealTimers()
})

describe('newManageToken', () => {
  it('is 43 base64url characters and differs on every call', () => {
    const a = newManageToken()
    const b = newManageToken()
    expect(a).toMatch(MANAGE_TOKEN_RE)
    expect(b).toMatch(MANAGE_TOKEN_RE)
    expect(a).not.toBe(b)
  })
})

describe('ensureManageToken', () => {
  it('inserts once for an eligible booking and returns the same token afterwards', async () => {
    const id = seed()
    const first = await ensureManageToken(id)
    expect(first).toMatch(MANAGE_TOKEN_RE)
    expect(await ensureManageToken(id)).toBe(first)
    expect(db.state.booking_manage_tokens).toHaveLength(1)
    expect(db.state.booking_manage_tokens[0].token).toBe(first)
  })

  it('two concurrent calls return one token', async () => {
    const id = seed()
    const [a, b] = await Promise.all([ensureManageToken(id), ensureManageToken(id)])
    expect(a).toBe(b)
    expect(a).toMatch(MANAGE_TOKEN_RE)
    expect(db.state.booking_manage_tokens).toHaveLength(1)
  })

  it('returns null for a partner booking', async () => {
    const id = seed({ booking_source: 'gnet' })
    expect(await ensureManageToken(id)).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('returns null for a booking with no stored policy (legacy terms, D-18)', async () => {
    const id = seed({ cancel_policy_version: null })
    expect(await ensureManageToken(id)).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('returns null for a trip of a quote and mints no token (92-11, T-92-36)', async () => {
    const id = seed({ quote_id: '99999999-9999-4999-8999-999999999991' })
    expect(await ensureManageToken(id)).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('a booking whose quote_id is null keeps today\'s eligibility', async () => {
    const id = seed({ quote_id: null })
    expect(await ensureManageToken(id)).toMatch(MANAGE_TOKEN_RE)
    expect(db.state.booking_manage_tokens).toHaveLength(1)
  })

  it('returns null for an anonymised booking, an unknown id and an empty id', async () => {
    expect(await ensureManageToken(seed({ anonymised_at: '2026-11-01T00:00:00Z' }))).toBeNull()
    expect(await ensureManageToken('does-not-exist')).toBeNull()
    expect(await ensureManageToken('')).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(0)
  })

  it('does not mint a new token after a deliberate revoke', async () => {
    const id = seed()
    expect(await ensureManageToken(id)).not.toBeNull()
    expect(await revokeManageToken(id)).toBe(true)
    expect(await ensureManageToken(id)).toBeNull()
    expect(db.state.booking_manage_tokens).toHaveLength(1)
  })
})

describe('resolveManageToken', () => {
  it('resolves a live token to its booking id and records last_used_at', async () => {
    const id = seed()
    const token = (await ensureManageToken(id)) as string
    expect(db.state.booking_manage_tokens[0].last_used_at).toBeNull()
    expect(await resolveManageToken(token)).toBe(id)
    expect(db.state.booking_manage_tokens[0].last_used_at).not.toBeNull()
  })

  it('a malformed value returns null with no database call', async () => {
    for (const bad of ['', 'short', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}!`, `${'a'.repeat(42)} `, null, undefined, 42, {}]) {
      createClientSpy.mockClear()
      expect(await resolveManageToken(bad)).toBeNull()
      expect(createClientSpy).not.toHaveBeenCalled()
    }
  })

  it('an unknown token returns null', async () => {
    seed()
    expect(await resolveManageToken(newManageToken())).toBeNull()
  })

  it('revoked, anonymised, partner and long-past pickups all return the same null as an unknown token', async () => {
    const unknown = await resolveManageToken(newManageToken())

    const revoked = seed()
    const tRevoked = (await ensureManageToken(revoked)) as string
    await revokeManageToken(revoked)

    const anonymised = seed()
    const tAnon = (await ensureManageToken(anonymised)) as string
    db.state.bookings.find((b) => b.id === anonymised)!.anonymised_at = '2026-11-02T00:00:00Z'

    const partner = seed()
    const tPartner = (await ensureManageToken(partner)) as string
    db.state.bookings.find((b) => b.id === partner)!.booking_source = 'gnet'

    const old = seed({ pickup_utc: new Date(NOW - 31 * DAY).toISOString(), pickup_date: '2026-10-10' })
    const tOld = (await ensureManageToken(old)) as string

    const results = await Promise.all([tRevoked, tAnon, tPartner, tOld].map((t) => resolveManageToken(t)))
    for (const r of results) expect(r).toBe(unknown)
    expect(unknown).toBeNull()
  })

  it('a pickup 29 days ago is still valid, 31 days ago is not', async () => {
    const recent = seed({ pickup_utc: new Date(NOW - 29 * DAY).toISOString() })
    const tRecent = (await ensureManageToken(recent)) as string
    expect(await resolveManageToken(tRecent)).toBe(recent)
  })

  it('a database problem also gives null, never a throw', async () => {
    const id = seed()
    const token = (await ensureManageToken(id)) as string
    world.db = {
      client: {
        from: () => {
          throw new Error('db down')
        },
      },
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resolveManageToken(token)).toBeNull()
  })

  it('never logs the token', async () => {
    const id = seed()
    const token = (await ensureManageToken(id)) as string
    world.db = {
      client: {
        from: () => {
          throw new Error(`boom ${token}`)
        },
      },
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await resolveManageToken(token)
    expect(JSON.stringify(err.mock.calls)).not.toContain(token)
  })
})

describe('buildManageUrl', () => {
  const token = 'A'.repeat(43)

  it('is unprefixed for en and prefixed for the other locales', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com'
    expect(buildManageUrl(token, 'en')).toBe(`https://rideprestigo.com/manage/${token}`)
    expect(buildManageUrl(token, 'ar')).toBe(`https://rideprestigo.com/ar/manage/${token}`)
    expect(buildManageUrl(token, 'zh')).toBe(`https://rideprestigo.com/zh/manage/${token}`)
  })

  it('falls back to English for a missing or unknown locale and trims the site url', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://rideprestigo.com/\n'
    expect(buildManageUrl(token, null)).toBe(`https://rideprestigo.com/manage/${token}`)
    expect(buildManageUrl(token, 'xx')).toBe(`https://rideprestigo.com/manage/${token}`)
  })

  it('refuses a malformed token', () => {
    expect(() => buildManageUrl('../admin', 'en')).toThrow()
  })
})
