import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures stubs are available inside vi.mock factories (hoisted before imports)
const { supabaseAuthStub, supabaseServiceStub, revalidatePathMock, getAllRoutesMock } = vi.hoisted(() => {
  const supabaseAuthStub = { auth: { getUser: vi.fn() } }
  const supabaseServiceStub = { from: vi.fn() }
  const revalidatePathMock = vi.fn()
  const getAllRoutesMock = vi.fn()
  return { supabaseAuthStub, supabaseServiceStub, revalidatePathMock, getAllRoutesMock }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(supabaseAuthStub)),
}))
vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: vi.fn(() => supabaseServiceStub),
}))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: () => unknown) => fn),
}))
vi.mock('@/lib/route-prices', () => ({
  getAllRoutes: getAllRoutesMock,
}))

import { GET } from '@/app/api/admin/route-prices/route'
import { PUT } from '@/app/api/admin/route-prices/[slug]/route'

const adminUser = { id: 'u1', app_metadata: { is_admin: true } }
const sampleRoute = {
  slug: 'prague-brno', fromLabel: 'Prague', toLabel: 'Brno',
  distanceKm: 210, eClassEur: 450, sClassEur: 600, vClassEur: 550,
  displayOrder: 1, placeIds: [],
}
const validPutBody = { e_class_eur: 460, s_class_eur: 610, v_class_eur: 560 }

function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

function putParams(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default: unauthenticated
  supabaseAuthStub.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'No session' },
  })

  // Default getAllRoutes returns sampleRoute
  getAllRoutesMock.mockResolvedValue([sampleRoute])

  // Default from() chain for update
  const selectFn = vi.fn().mockResolvedValue({ data: [{ slug: 'prague-brno' }], error: null })
  const eqFn = vi.fn().mockReturnValue({ select: selectFn })
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
  supabaseServiceStub.from.mockReturnValue({ update: updateFn })
})

describe('/api/admin/route-prices', () => {
  describe('GET', () => {
    it('GET returns 401 when unauthenticated', async () => {
      const res = await GET()
      expect(res.status).toBe(401)
    })

    it('GET returns 403 when authenticated non-admin', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u2', app_metadata: {} } },
        error: null,
      })
      const res = await GET()
      expect(res.status).toBe(403)
    })

    it('GET returns 200 with routes sorted by displayOrder for admin', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: adminUser },
        error: null,
      })
      const res = await GET()
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.routes)).toBe(true)
      expect(getAllRoutesMock).toHaveBeenCalledWith('display_order')
    })
  })

  describe('PUT', () => {
    it('PUT returns 401 when unauthenticated', async () => {
      const res = await PUT(
        makeRequest('PUT', 'http://localhost/api/admin/route-prices/prague-brno', validPutBody),
        putParams('prague-brno'),
      )
      expect(res.status).toBe(401)
    })

    it('PUT returns 403 when authenticated non-admin', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u2', app_metadata: {} } },
        error: null,
      })
      const res = await PUT(
        makeRequest('PUT', 'http://localhost/api/admin/route-prices/prague-brno', validPutBody),
        putParams('prague-brno'),
      )
      expect(res.status).toBe(403)
    })

    it('PUT returns 400 for invalid body', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: adminUser },
        error: null,
      })
      const res = await PUT(
        makeRequest('PUT', 'http://localhost/api/admin/route-prices/prague-brno', {
          e_class_eur: 'abc', s_class_eur: 600, v_class_eur: 550,
        }),
        putParams('prague-brno'),
      )
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid payload')
    })

    it('PUT returns 404 when slug does not exist', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: adminUser },
        error: null,
      })
      // Override to return empty array (slug not found)
      const selectFn = vi.fn().mockResolvedValue({ data: [], error: null })
      const eqFn = vi.fn().mockReturnValue({ select: selectFn })
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn })
      supabaseServiceStub.from.mockReturnValue({ update: updateFn })

      const res = await PUT(
        makeRequest('PUT', 'http://localhost/api/admin/route-prices/unknown-slug', validPutBody),
        putParams('unknown-slug'),
      )
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toBe('Not found')
    })

    it('PUT returns 200 and calls revalidatePath twice on success', async () => {
      supabaseAuthStub.auth.getUser.mockResolvedValue({
        data: { user: adminUser },
        error: null,
      })
      const res = await PUT(
        makeRequest('PUT', 'http://localhost/api/admin/route-prices/prague-brno', validPutBody),
        putParams('prague-brno'),
      )
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toEqual({ ok: true, slug: 'prague-brno' })
      expect(revalidatePathMock).toHaveBeenCalledWith('/routes/prague-brno')
      expect(revalidatePathMock).toHaveBeenCalledWith('/routes')
      expect(revalidatePathMock).toHaveBeenCalledTimes(2)
    })
  })
})
