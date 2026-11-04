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
      'notification_flags, dispatch_default_horizon, dispatch_horizon_days, noshow_wait_city_min, noshow_wait_airport_min, payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails'
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

describe('Phase 87 D-15: no-show waiting thresholds in the settings API', () => {
  function patch(body: unknown) {
    return new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const chainStub = supabaseServiceStub._chain
    chainStub.select.mockReturnValue(chainStub)
    chainStub.update.mockReturnValue(chainStub)
    chainStub.eq.mockResolvedValue({ error: null })
    chainStub.single.mockResolvedValue({ data: null, error: null })
    supabaseServiceStub.from.mockReturnValue(chainStub)
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  })

  it('GET returns both thresholds alongside the existing fields', async () => {
    supabaseServiceStub._chain.eq.mockReturnValue(supabaseServiceStub._chain)
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: {
        notification_flags: { confirmed: true },
        dispatch_default_horizon: 'future',
        dispatch_horizon_days: 7,
        noshow_wait_city_min: 30,
        noshow_wait_airport_min: 60,
      },
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.noshow_wait_city_min).toBe(30)
    expect(body.noshow_wait_airport_min).toBe(60)
    expect(body.dispatch_horizon_days).toBe(7)
  })

  it('PATCH { noshow_wait_city_min } updates only that column', async () => {
    const res = await PATCH(patch({ noshow_wait_city_min: 45 }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({ noshow_wait_city_min: 45 })
  })

  it('PATCH { noshow_wait_airport_min } updates only that column', async () => {
    const res = await PATCH(patch({ noshow_wait_airport_min: 90 }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({ noshow_wait_airport_min: 90 })
  })

  it('PATCH with both updates both and nothing else', async () => {
    const res = await PATCH(patch({ noshow_wait_city_min: 20, noshow_wait_airport_min: 120 }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({
      noshow_wait_city_min: 20,
      noshow_wait_airport_min: 120,
    })
  })

  it('accepts the bounds 1 and 240', async () => {
    expect((await PATCH(patch({ noshow_wait_city_min: 1 }))).status).toBe(200)
    expect((await PATCH(patch({ noshow_wait_airport_min: 240 }))).status).toBe(200)
  })

  it.each([
    { noshow_wait_city_min: 0 },
    { noshow_wait_city_min: 241 },
    { noshow_wait_city_min: 30.5 },
    { noshow_wait_city_min: '30' },
    { noshow_wait_city_min: null },
    { noshow_wait_airport_min: 0 },
    { noshow_wait_airport_min: 241 },
    { noshow_wait_airport_min: 59.9 },
    { noshow_wait_airport_min: '60' },
    { noshow_wait_airport_min: null },
  ])('PATCH %j is 400 Invalid payload and updates nothing', async body => {
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid payload')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('a no-show field alone passes the at-least-one-field rule and leaves other settings alone', async () => {
    await PATCH(patch({ noshow_wait_city_min: 35 }))
    const arg = supabaseServiceStub._chain.update.mock.calls[0][0]
    expect(arg).not.toHaveProperty('notification_flags')
    expect(arg).not.toHaveProperty('dispatch_horizon_days')
    expect(arg).not.toHaveProperty('noshow_wait_airport_min')
  })
})

describe('Phase 88 (D-01, PAYF-05): card-flow settings in the settings API', () => {
  function patch(body: unknown) {
    return new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const chainStub = supabaseServiceStub._chain
    chainStub.select.mockReturnValue(chainStub)
    chainStub.update.mockReturnValue(chainStub)
    chainStub.eq.mockResolvedValue({ error: null })
    chainStub.single.mockResolvedValue({ data: null, error: null })
    supabaseServiceStub.from.mockReturnValue(chainStub)
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  })

  it('GET returns the three card-flow fields alongside the existing ones', async () => {
    supabaseServiceStub._chain.eq.mockReturnValue(supabaseServiceStub._chain)
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: {
        notification_flags: { confirmed: true },
        dispatch_default_horizon: 'future',
        dispatch_horizon_days: 7,
        noshow_wait_city_min: 30,
        noshow_wait_airport_min: 60,
        payment_hold_lead_hours: 72,
        card_flow_mode: 'canary',
        card_flow_canary_emails: ['owner@example.com'],
      },
      error: null,
    })
    const body = await (await GET()).json()
    expect(body.payment_hold_lead_hours).toBe(72)
    expect(body.card_flow_mode).toBe('canary')
    expect(body.card_flow_canary_emails).toEqual(['owner@example.com'])
    expect(body.noshow_wait_city_min).toBe(30)
  })

  it("PATCH { card_flow_mode: 'canary' } updates only that column", async () => {
    const res = await PATCH(patch({ card_flow_mode: 'canary' }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({ card_flow_mode: 'canary' })
  })

  it("PATCH { card_flow_mode: 'off' } is accepted", async () => {
    expect((await PATCH(patch({ card_flow_mode: 'off' }))).status).toBe(200)
  })

  it.each([
    { card_flow_mode: 'on' },
    { card_flow_mode: 'ON' },
    { card_flow_mode: '' },
    { card_flow_mode: true },
    { card_flow_mode: null },
  ])('PATCH %j is 400 and updates nothing', async body => {
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('accepts the lead-hour bounds 6 and 96', async () => {
    expect((await PATCH(patch({ payment_hold_lead_hours: 6 }))).status).toBe(200)
    expect((await PATCH(patch({ payment_hold_lead_hours: 96 }))).status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenLastCalledWith({ payment_hold_lead_hours: 96 })
  })

  it.each([
    { payment_hold_lead_hours: 5 },
    { payment_hold_lead_hours: 97 },
    { payment_hold_lead_hours: 72.5 },
    { payment_hold_lead_hours: '72' },
    { payment_hold_lead_hours: null },
  ])('PATCH %j is 400 Invalid payload and updates nothing', async body => {
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid payload')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('PATCH emails are stored normalised (trimmed, lower-cased) and de-duplicated in first-occurrence order', async () => {
    const res = await PATCH(patch({ card_flow_canary_emails: [' A@x.com', 'a@x.com', 'b@y.org'] }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({
      card_flow_canary_emails: ['a@x.com', 'b@y.org'],
    })
  })

  it('PATCH an empty email list is accepted (clears the allowlist)', async () => {
    const res = await PATCH(patch({ card_flow_canary_emails: [] }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({ card_flow_canary_emails: [] })
  })

  it('20 addresses pass, 21 are 400', async () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `user${i}@example.com`)
    expect((await PATCH(patch({ card_flow_canary_emails: make(20) }))).status).toBe(200)
    supabaseServiceStub._chain.update.mockClear()
    const res = await PATCH(patch({ card_flow_canary_emails: make(21) }))
    expect(res.status).toBe(400)
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it.each([[['not-an-email']], [['a@x.com', 'b@']], [['']]])('PATCH invalid addresses %j are 400', async emails => {
    const res = await PATCH(patch({ card_flow_canary_emails: emails }))
    expect(res.status).toBe(400)
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('invalid JSON on PATCH is 400, not 500', async () => {
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid JSON')
  })

  it('a non-admin is refused before any parsing', async () => {
    getAdminUserMock.mockResolvedValue({ user: null, error: '403' })
    const res = await PATCH(patch({ card_flow_mode: 'canary' }))
    expect(res.status).toBe(403)
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('a card-flow field alone passes the at-least-one-field rule and leaves other settings alone', async () => {
    await PATCH(patch({ payment_hold_lead_hours: 48 }))
    const arg = supabaseServiceStub._chain.update.mock.calls[0][0]
    expect(Object.keys(arg)).toEqual(['payment_hold_lead_hours'])
  })
})
