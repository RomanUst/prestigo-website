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

// .eq() is awaited by the update and followed by .single() by the stored-row read of the cross-checks
function armEq() {
  supabaseServiceStub._chain.eq.mockImplementation(() =>
    Object.assign(Promise.resolve({ error: null }), { single: supabaseServiceStub._chain.single })
  )
}

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
      'notification_flags, dispatch_default_horizon, dispatch_horizon_days, noshow_wait_city_min, noshow_wait_airport_min, payment_hold_lead_hours, card_flow_mode, card_flow_canary_emails, cancel_free_km_threshold, cancel_free_hours_short, cancel_free_hours_long, cancel_free_hours_hourly, cancel_fee_percent'
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
    armEq()
    chainStub.single.mockResolvedValue({
      data: {
        noshow_wait_city_min: 30,
        noshow_wait_airport_min: 60,
        cancel_free_hours_short: 1,
        cancel_free_hours_long: 12,
      },
      error: null,
    })
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
    armEq()
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

describe('Phase 89 (CANC-01, D-06, WR-06): cancellation policy and wait cross-check in the settings API', () => {
  const STORED = {
    noshow_wait_city_min: 30,
    noshow_wait_airport_min: 60,
    cancel_free_hours_short: 1,
    cancel_free_hours_long: 12,
  }

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
    armEq()
    chainStub.single.mockResolvedValue({ data: STORED, error: null })
    supabaseServiceStub.from.mockReturnValue(chainStub)
    getAdminUserMock.mockResolvedValue({ user: { id: 'admin-1' }, error: null })
  })

  it('GET returns the five policy fields alongside the existing ones', async () => {
    supabaseServiceStub._chain.eq.mockReturnValue(supabaseServiceStub._chain)
    supabaseServiceStub._chain.single.mockResolvedValue({
      data: {
        notification_flags: {},
        cancel_free_km_threshold: 100,
        cancel_free_hours_short: 1,
        cancel_free_hours_long: 12,
        cancel_free_hours_hourly: 12,
        cancel_fee_percent: 100,
      },
      error: null,
    })
    const body = await (await GET()).json()
    expect(body.cancel_free_km_threshold).toBe(100)
    expect(body.cancel_free_hours_short).toBe(1)
    expect(body.cancel_free_hours_long).toBe(12)
    expect(body.cancel_free_hours_hourly).toBe(12)
    expect(body.cancel_fee_percent).toBe(100)
  })

  it.each([
    ['cancel_free_km_threshold', 80],
    ['cancel_free_hours_short', 2],
    ['cancel_free_hours_long', 24],
    ['cancel_free_hours_hourly', 6],
    ['cancel_fee_percent', 50],
  ])('PATCH { %s: %d } saves only that key', async (key, value) => {
    const res = await PATCH(patch({ [key]: value }))
    expect(res.status).toBe(200)
    expect(supabaseServiceStub._chain.update).toHaveBeenCalledWith({ [key]: value })
  })

  it('accepts the bounds', async () => {
    expect((await PATCH(patch({ cancel_free_km_threshold: 1 }))).status).toBe(200)
    expect((await PATCH(patch({ cancel_free_km_threshold: 1000 }))).status).toBe(200)
    expect((await PATCH(patch({ cancel_free_hours_hourly: 0 }))).status).toBe(200)
    expect((await PATCH(patch({ cancel_free_hours_hourly: 72 }))).status).toBe(200)
    expect((await PATCH(patch({ cancel_fee_percent: 1 }))).status).toBe(200)
    expect((await PATCH(patch({ cancel_fee_percent: 100 }))).status).toBe(200)
  })

  it.each([
    { cancel_free_hours_hourly: 73 },
    { cancel_free_hours_short: 73 },
    { cancel_free_hours_long: -1 },
    { cancel_free_km_threshold: 0 },
    { cancel_free_km_threshold: 1001 },
    { cancel_fee_percent: 0 },
    { cancel_fee_percent: 101 },
    { cancel_fee_percent: 50.5 },
    { cancel_free_hours_long: '12' },
    { cancel_fee_percent: null },
  ])('PATCH %j is 400 Invalid payload and updates nothing', async body => {
    const res = await PATCH(patch(body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid payload')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('long below short in one request is 422 long_below_short', async () => {
    const res = await PATCH(patch({ cancel_free_hours_short: 10, cancel_free_hours_long: 5 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('long_below_short')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('long equal to short is accepted', async () => {
    const res = await PATCH(patch({ cancel_free_hours_short: 5, cancel_free_hours_long: 5 }))
    expect(res.status).toBe(200)
  })

  it('a short above the stored long is 422 long_below_short (checked against the stored row)', async () => {
    const res = await PATCH(patch({ cancel_free_hours_short: 20 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('long_below_short')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('a long below the stored short is 422 long_below_short', async () => {
    supabaseServiceStub._chain.single.mockResolvedValue({ data: { ...STORED, cancel_free_hours_short: 6 }, error: null })
    const res = await PATCH(patch({ cancel_free_hours_long: 3 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('long_below_short')
  })

  it('an airport wait below the stored city wait is 422 airport_below_city', async () => {
    const res = await PATCH(patch({ noshow_wait_airport_min: 10 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('airport_below_city')
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('a city wait above the stored airport wait is 422 airport_below_city', async () => {
    const res = await PATCH(patch({ noshow_wait_city_min: 90 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('airport_below_city')
  })

  it('airport below city within one request is 422 airport_below_city', async () => {
    const res = await PATCH(patch({ noshow_wait_city_min: 50, noshow_wait_airport_min: 40 }))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('airport_below_city')
  })

  it('airport equal to city is accepted', async () => {
    expect((await PATCH(patch({ noshow_wait_city_min: 40, noshow_wait_airport_min: 40 }))).status).toBe(200)
  })

  it('a failed stored-row read is 500 and updates nothing', async () => {
    supabaseServiceStub._chain.single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await PATCH(patch({ noshow_wait_airport_min: 90 }))
    expect(res.status).toBe(500)
    expect(supabaseServiceStub._chain.update).not.toHaveBeenCalled()
  })

  it('a field that needs no cross-check does not read the stored row', async () => {
    await PATCH(patch({ cancel_fee_percent: 40 }))
    expect(supabaseServiceStub._chain.single).not.toHaveBeenCalled()
  })

  it('invalid JSON is 400', async () => {
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'PATCH',
      body: '{nope',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid JSON')
  })
})
