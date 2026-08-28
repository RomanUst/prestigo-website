import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { getAdminUserMock, supabaseServiceStub } = vi.hoisted(() => {
  const getAdminUserMock = vi.fn()

  const chainStub = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  }
  chainStub.select.mockReturnValue(chainStub)
  chainStub.update.mockReturnValue(chainStub)
  chainStub.eq.mockReturnValue(chainStub)
  chainStub.single.mockResolvedValue({ data: null, error: null })

  const supabaseServiceStub = {
    from: vi.fn(() => chainStub),
    _chain: chainStub,
  }

  return { getAdminUserMock, supabaseServiceStub }
})

// Mock @/lib/supabase/server — getAdminUser returns configurable result
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getAdminUser: getAdminUserMock,
}))

// Mock @/lib/supabase — createSupabaseServiceClient returns supabaseServiceStub
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

// Mock enforceMaxBody to always return null (no body size issue in tests)
vi.mock('@/lib/request-guards', () => ({
  enforceMaxBody: vi.fn(() => null),
}))

import { GET, PATCH } from '@/app/api/admin/settings/route'

describe('NOTIF-06: admin settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const chainStub = supabaseServiceStub._chain
    chainStub.select.mockReturnValue(chainStub)
    chainStub.update.mockReturnValue(chainStub)
    chainStub.eq.mockReturnValue(chainStub)
    chainStub.single.mockResolvedValue({ data: null, error: null })
    supabaseServiceStub.from.mockReturnValue(chainStub)
  })

  it('GET returns 401 without session', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('GET returns notification_flags from pricing_globals', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: { notification_flags: { confirmed: true, cancelled: false } },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notification_flags).toEqual({ confirmed: true, cancelled: false })
  })

  it('GET returns notification_flags AND dispatch_default_horizon AND dispatch_horizon_days', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: {
        notification_flags: { confirmed: true },
        dispatch_default_horizon: 'future',
        dispatch_horizon_days: 7,
      },
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notification_flags).toEqual({ confirmed: true })
    expect(body.dispatch_default_horizon).toBe('future')
    expect(body.dispatch_horizon_days).toBe(7)
    expect(supabaseServiceStub._chain.select).toHaveBeenCalledWith(
      'notification_flags, dispatch_default_horizon, dispatch_horizon_days'
    )
  })

  it('PATCH returns 401 without session', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '401' })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ notification_flags: { confirmed: true } }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('PATCH updates notification_flags in pricing_globals', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    supabaseServiceStub._chain.single.mockResolvedValue({ data: null, error: null })
    // update chain resolves without error
    supabaseServiceStub._chain.eq.mockResolvedValue({ error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ notification_flags: { confirmed: true, cancelled: false } }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(supabaseServiceStub.from).toHaveBeenCalledWith('pricing_globals')
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({
      notification_flags: { confirmed: true, cancelled: false },
    })
  })

  it('PATCH returns 400 on invalid payload', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ notification_flags: 'not-an-object' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid payload')
  })

  it('PATCH { dispatch_default_horizon, dispatch_horizon_days } persists both and round-trips via GET', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    supabaseServiceStub._chain.eq.mockResolvedValue({ error: null })

    const patchReq = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_default_horizon: 'last_n_days', dispatch_horizon_days: 14 }),
      headers: { 'Content-Type': 'application/json' },
    })
    const patchRes = await PATCH(patchReq)
    expect(patchRes.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({
      dispatch_default_horizon: 'last_n_days',
      dispatch_horizon_days: 14,
    })

    // Follow-up GET reflects persisted values
    supabaseServiceStub._chain.eq.mockReturnValue(supabaseServiceStub._chain)
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: {
        notification_flags: { confirmed: true },
        dispatch_default_horizon: 'last_n_days',
        dispatch_horizon_days: 14,
      },
      error: null,
    })
    const getRes = await GET()
    const getBody = await getRes.json()
    expect(getBody.dispatch_default_horizon).toBe('last_n_days')
    expect(getBody.dispatch_horizon_days).toBe(14)
  })

  it('PATCH { dispatch_default_horizon } only does NOT overwrite notification_flags', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
    supabaseServiceStub._chain.eq.mockResolvedValue({ error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_default_horizon: 'future' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({
      dispatch_default_horizon: 'future',
    })
    const updateArg = supabaseServiceStub._chain.update.mock.calls[0][0]
    expect(updateArg).not.toHaveProperty('notification_flags')
  })

  it('PATCH { dispatch_default_horizon: "bogus" } → 400', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_default_horizon: 'bogus' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('PATCH { dispatch_horizon_days: 0 } → 400 (below min)', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_horizon_days: 0 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('PATCH { dispatch_horizon_days: 500 } → 400 (above max)', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ dispatch_horizon_days: 500 }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('PATCH {} (no recognized field) → 400', async () => {
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })

    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
