import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub } = vi.hoisted(() => {
  const chainable = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }

  // Make each chainable method return the same chainable object by default
  Object.keys(chainable).forEach((key) => {
    ;(chainable as Record<string, ReturnType<typeof vi.fn>>)[key].mockReturnValue(
      Promise.resolve({ data: [], error: null })
    )
  })

  const supabaseAuthStub = {
    auth: {
      getUser: vi.fn(),
    },
  }

  const supabaseServiceStub = {
    from: vi.fn(() => chainable),
  }

  return { supabaseAuthStub, supabaseServiceStub, chainable }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))

import { GET, POST, DELETE, PATCH } from '@/app/api/admin/zones/route'

function makeRequest(method: string, url?: string, body?: unknown): Request {
  return new Request(url ?? 'http://localhost/api/admin/zones', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

const validZone = {
  name: 'Prague Center',
  geojson: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[14.35, 50.05], [14.50, 50.05], [14.50, 50.12], [14.35, 50.12], [14.35, 50.05]]],
    },
    properties: {},
  },
}

const invalidZone = {
  name: 'Test',
  geojson: {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [14, 50] },
  },
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default to admin user
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: { id: '1', app_metadata: { is_admin: true } } },
    error: null,
  })

  // Reset service stub chain
  const chainable = {
    select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    insert: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })) }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })) }),
    eq: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    order: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
  }

  supabaseServiceStub.from.mockReturnValue(chainable)
})

describe('/api/admin/zones', () => {
  describe('GET', () => {
    it('Test 1: returns 401 when no session', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(401)
    })

    it('Test 2: returns 403 for non-admin user', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: '2', app_metadata: { is_admin: false } } },
        error: null,
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(403)
    })

    it('Test 3: returns 200 with zones array for admin', async () => {
      const zones = [{ id: 'abc', name: 'Zone A', active: true }]
      supabaseServiceStub.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(Promise.resolve({ data: zones, error: null })),
        }),
      })

      const res = await GET(makeRequest('GET'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.zones).toEqual(zones)
    })
  })

  describe('POST', () => {
    it('Test 4: returns 400 for invalid GeoJSON (non-Polygon geometry)', async () => {
      const res = await POST(makeRequest('POST', undefined, invalidZone))
      expect(res.status).toBe(400)
    })

    it('Test 5: calls insert() for valid zone body', async () => {
      const insertFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }))
      supabaseServiceStub.from.mockReturnValue({ insert: insertFn })

      const res = await POST(makeRequest('POST', undefined, validZone))
      expect(res.status).toBe(201)
      expect(insertFn).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Prague Center' })
      )
    })
  })

  describe('DELETE', () => {
    it('Test 6: returns 400 when id param is missing', async () => {
      const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/admin/zones'))
      expect(res.status).toBe(400)
    })

    it('Test 7: calls delete().eq() with the given id', async () => {
      const eqFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }))
      const deleteFn = vi.fn().mockReturnValue({ eq: eqFn })
      supabaseServiceStub.from.mockReturnValue({ delete: deleteFn })

      const res = await DELETE(
        makeRequest('DELETE', 'http://localhost/api/admin/zones?id=a1b2c3d4-e5f6-7890-abcd-ef1234567890')
      )
      expect(res.status).toBe(200)
      expect(deleteFn).toHaveBeenCalled()
      expect(eqFn).toHaveBeenCalledWith('id', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    })
  })

  describe('PATCH', () => {
    it('Test 8: calls update({ active: false }).eq() for valid toggle body', async () => {
      const eqFn = vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null }))
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
      supabaseServiceStub.from.mockReturnValue({ update: updateFn })

      const validUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const res = await PATCH(
        makeRequest('PATCH', undefined, { id: validUuid, active: false })
      )
      expect(res.status).toBe(200)
      expect(updateFn).toHaveBeenCalledWith({ active: false })
      expect(eqFn).toHaveBeenCalledWith('id', validUuid)
    })
  })
})
