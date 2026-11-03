import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Phase 87-07 (D-04, DRV-05): pushGnetForTransition is claim-then-push.
 * The mock models gnet_bookings as ONE stateful row so the claim filter
 * (last_push_status IS NULL OR <> X OR last_push_error IS NOT NULL) is
 * actually evaluated, not just recorded.
 */

const { mockPushGnetStatus, mockFrom } = vi.hoisted(() => ({
  mockPushGnetStatus: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/gnet-client', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/gnet-client')>()
  return { ...actual, pushGnetStatus: mockPushGnetStatus }
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({ from: mockFrom }),
}))

import { pushGnetForTransition } from '@/lib/gnet-push'

const BOOKING_ID = 'a1b2c3d4-e5f6-4789-a1b2-c3d4e5f6a7b8'
const ROW_ID = 'b2c3d4e5-f6a7-4890-b1c2-d3e4f5a6b7c8'

type Row = {
  id: string
  booking_id: string
  gnet_res_no: string
  last_push_status: string | null
  last_push_error: string | null
  last_pushed_at: string | null
}

let row: Row | null
const updatePayloads: Array<Record<string, unknown>> = []
const orFilters: string[] = []
const selectCols: string[] = []
const claimEqs: Array<[string, unknown]> = []

function matchesClaim(r: Row, x: string): boolean {
  return r.last_push_status === null || r.last_push_status !== x || r.last_push_error !== null
}

function parseClaimStatus(filter: string): string {
  const m = /last_push_status\.neq\.([A-Z_]+)/.exec(filter)
  if (!m) throw new Error(`unexpected or-filter: ${filter}`)
  return m[1]
}

function installMock(initial: Row | null) {
  row = initial
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'gnet_bookings') throw new Error(`unexpected table ${table}`)
    return {
      // existence check (zero-row claim path)
      select: (cols: string) => {
        selectCols.push(cols)
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: row ? { id: row.id } : null, error: null }),
          }),
        }
      },
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload)
        return {
          eq: (col: string, val: unknown) => {
            if (col === 'id') {
              // failure-record update by row id
              if (row && row.id === val) Object.assign(row, payload)
              return Promise.resolve({ error: null })
            }
            claimEqs.push([col, val])
            return {
              or: (filter: string) => {
                orFilters.push(filter)
                return {
                  select: async (cols: string) => {
                    selectCols.push(cols)
                    const x = parseClaimStatus(filter)
                    if (row && row.booking_id === val && matchesClaim(row, x)) {
                      Object.assign(row, payload)
                      return { data: [{ id: row.id, gnet_res_no: row.gnet_res_no }], error: null }
                    }
                    return { data: [], error: null }
                  },
                }
              },
            }
          },
        }
      },
    }
  })
}

function freshRow(over: Partial<Row> = {}): Row {
  return {
    id: ROW_ID,
    booking_id: BOOKING_ID,
    gnet_res_no: 'RES-1',
    last_push_status: 'ASSIGNED',
    last_push_error: null,
    last_pushed_at: null,
    ...over,
  }
}

function push(status: string, bookingSource: string | null = 'gnet') {
  return pushGnetForTransition({
    bookingId: BOOKING_ID,
    bookingSource,
    status,
    amountEur: 120,
    logTag: '[test-push]',
  })
}

let errSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  updatePayloads.length = 0
  orFilters.length = 0
  selectCols.length = 0
  claimEqs.length = 0
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errSpy.mockRestore()
})

describe('pushGnetForTransition — claim-then-push (D-04, DRV-05)', () => {
  it('claims with the conditional filter and pushes once on a fresh row', async () => {
    installMock(freshRow())
    mockPushGnetStatus.mockResolvedValue(undefined)

    await push('en_route')

    expect(orFilters).toEqual([
      'last_push_status.is.null,last_push_status.neq.EN_ROUTE,last_push_error.not.is.null',
    ])
    expect(claimEqs).toEqual([['booking_id', BOOKING_ID]])
    expect(selectCols).toContain('id, gnet_res_no')
    expect(updatePayloads[0]).toMatchObject({ last_push_status: 'EN_ROUTE', last_push_error: null })
    expect(typeof updatePayloads[0].last_pushed_at).toBe('string')
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    expect(mockPushGnetStatus).toHaveBeenCalledWith('RES-1', 'EN_ROUTE', '120.00')
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('retap: calling twice for the same status after success sends exactly one request', async () => {
    installMock(freshRow())
    mockPushGnetStatus.mockResolvedValue(undefined)

    await push('en_route')
    await push('en_route')

    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('a later, different status is still pushed', async () => {
    installMock(freshRow())
    mockPushGnetStatus.mockResolvedValue(undefined)

    await push('en_route')
    await push('on_location')

    expect(mockPushGnetStatus).toHaveBeenCalledTimes(2)
    expect(mockPushGnetStatus).toHaveBeenLastCalledWith('RES-1', 'ON_LOCATION', '120.00')
  })

  it('failed push: records the error only, keeps last_push_status, retries once, then stays quiet', async () => {
    installMock(freshRow())
    mockPushGnetStatus.mockRejectedValueOnce(new Error('GNet timeout'))
    mockPushGnetStatus.mockResolvedValue(undefined)

    await push('en_route')

    expect(mockPushGnetStatus).toHaveBeenCalledTimes(1)
    // second update: failure record, error only (status column untouched)
    expect(updatePayloads).toHaveLength(2)
    expect(updatePayloads[1]).toEqual({ last_push_error: 'GNet timeout' })
    expect(row!.last_push_status).toBe('EN_ROUTE')
    expect(row!.last_push_error).toBe('GNet timeout')
    expect(errSpy).toHaveBeenCalledWith(
      '[test-push] failed',
      expect.objectContaining({ bookingId: BOOKING_ID, gnetResNo: 'RES-1', error: 'GNet timeout' }),
    )

    // next call retries (error not null) and succeeds
    await push('en_route')
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(2)
    expect(row!.last_push_error).toBeNull()

    // a further call sends nothing
    await push('en_route')
    expect(mockPushGnetStatus).toHaveBeenCalledTimes(2)
  })

  it('missing gnet_bookings row: logs and sends nothing', async () => {
    installMock(null)

    await push('en_route')

    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith('[test-push] no gnet_bookings row for', BOOKING_ID)
  })

  it('already pushed row (zero rows claimed, row exists): silent, no log, no push', async () => {
    installMock(freshRow({ last_push_status: 'EN_ROUTE' }))

    await push('en_route')

    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('non-gnet booking: no query and no push', async () => {
    installMock(freshRow())
    await push('en_route', 'online')
    await push('en_route', null)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })

  it.each(['on_board', 'no_show', 'pending'])('status %s has no GNet mapping: no query and no push', async (status) => {
    installMock(freshRow())
    await push(status)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
  })

  it('never throws into the caller when the claim query itself errors', async () => {
    installMock(freshRow())
    mockFrom.mockImplementation(() => ({
      update: () => ({
        eq: () => ({
          or: () => ({ select: async () => ({ data: null, error: { message: 'db down' } }) }),
        }),
      }),
    }))

    await expect(push('en_route')).resolves.toBeUndefined()
    expect(mockPushGnetStatus).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
  })
})
