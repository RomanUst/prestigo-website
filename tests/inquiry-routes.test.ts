// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  checkRateLimitMock,
  sendContactInquiryMock,
  sendCorporateMock,
  sendOperatorAlertMock,
  sendClientAckMock,
  storeInquiryMock,
  dispatchAfterResponseMock,
  createClientMock,
} = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  sendContactInquiryMock: vi.fn(),
  sendCorporateMock: vi.fn(),
  sendOperatorAlertMock: vi.fn(),
  sendClientAckMock: vi.fn(),
  storeInquiryMock: vi.fn(),
  dispatchAfterResponseMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  getClientIp: () => '1.2.3.4',
}))
vi.mock('@/lib/email', () => ({
  sendContactInquiry: sendContactInquiryMock,
  sendMultidayOperatorAlert: sendOperatorAlertMock,
  sendMultidayClientAck: sendClientAckMock,
}))
vi.mock('@/lib/email-corporate', () => ({
  sendCorporateContactEmails: sendCorporateMock,
}))
vi.mock('@/lib/inquiries', () => ({ storeInquiry: storeInquiryMock }))
vi.mock('@/lib/outbox', () => ({
  dispatchAfterResponse: dispatchAfterResponseMock,
  inquiryOutboxKey: (id: string) => `lead.inquiry:${id}`,
}))

import { POST as contactPOST } from '@/app/api/contact/route'
import { POST as corporatePOST } from '@/app/api/corporate-contact/route'
import { POST as multidayPOST } from '@/app/api/submit-multiday-quote/route'

function makeRequest(url: string, body: unknown): Request {
  const serialised = JSON.stringify(body)
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    body: serialised,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(serialised, 'utf8')),
    },
  })
}

beforeEach(() => {
  checkRateLimitMock.mockReset()
  sendContactInquiryMock.mockReset()
  sendCorporateMock.mockReset()
  sendOperatorAlertMock.mockReset()
  sendClientAckMock.mockReset()
  storeInquiryMock.mockReset()
  dispatchAfterResponseMock.mockReset()
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 4, limit: 5 })
  sendContactInquiryMock.mockResolvedValue(undefined)
  sendCorporateMock.mockResolvedValue(undefined)
  sendOperatorAlertMock.mockResolvedValue(undefined)
  sendClientAckMock.mockResolvedValue(undefined)
})

// ── contact ───────────────────────────────────────────────────────────────────
const contactPayload = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+420123456789',
  service: 'airport',
  message: 'Need a transfer',
}

describe('contact', () => {
  it('stores one inquiry, sends the email once, schedules the dispatch', async () => {
    storeInquiryMock.mockResolvedValue('11111111-1111-4111-8111-111111111111')
    const res = await contactPOST(makeRequest('/api/contact', contactPayload))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(storeInquiryMock).toHaveBeenCalledTimes(1)
    expect(storeInquiryMock).toHaveBeenCalledWith('contact', {
      email: 'jane@example.com',
      name: 'Jane Doe',
      phone: '+420123456789',
      company: null,
      payload: { service: 'airport', message: 'Need a transfer' },
    })
    expect(sendContactInquiryMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).toHaveBeenCalledWith(
      'lead.inquiry:11111111-1111-4111-8111-111111111111',
    )
  })

  it('stores absent phone/service as null and still succeeds', async () => {
    storeInquiryMock.mockResolvedValue('22222222-2222-4222-8222-222222222222')
    const res = await contactPOST(
      makeRequest('/api/contact', { name: 'A', email: 'a@b.co', message: 'hi' }),
    )
    expect(res.status).toBe(200)
    expect(storeInquiryMock).toHaveBeenCalledWith('contact', {
      email: 'a@b.co',
      name: 'A',
      phone: null,
      company: null,
      payload: { service: null, message: 'hi' },
    })
  })

  it('two identical submissions are two inquiries with two different keys (D-10)', async () => {
    storeInquiryMock
      .mockResolvedValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .mockResolvedValueOnce('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    await contactPOST(makeRequest('/api/contact', contactPayload))
    await contactPOST(makeRequest('/api/contact', contactPayload))
    expect(storeInquiryMock).toHaveBeenCalledTimes(2)
    const keys = dispatchAfterResponseMock.mock.calls.map((c) => c[0])
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(2)
  })

  it('rejects an empty name with 400 and stores nothing', async () => {
    const res = await contactPOST(makeRequest('/api/contact', { ...contactPayload, name: '' }))
    expect(res.status).toBe(400)
    expect(storeInquiryMock).not.toHaveBeenCalled()
  })

  it('rejects an empty message with 400 and stores nothing', async () => {
    const res = await contactPOST(makeRequest('/api/contact', { ...contactPayload, message: '' }))
    expect(res.status).toBe(400)
    expect(storeInquiryMock).not.toHaveBeenCalled()
  })
})

describe('contact failure', () => {
  it('storage returning null: still 200, email once, no dispatch', async () => {
    storeInquiryMock.mockResolvedValue(null)
    const res = await contactPOST(makeRequest('/api/contact', contactPayload))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sendContactInquiryMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).not.toHaveBeenCalled()
  })

  it('email rejecting: 500 exactly as before', async () => {
    storeInquiryMock.mockResolvedValue('33333333-3333-4333-8333-333333333333')
    sendContactInquiryMock.mockRejectedValue(new Error('smtp down'))
    const res = await contactPOST(makeRequest('/api/contact', contactPayload))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to send message' })
  })
})

// ── corporate ─────────────────────────────────────────────────────────────────
const corporatePayload = {
  company: 'ACME Corp',
  name: 'John Smith',
  email: 'john@acme.com',
  trips: '6–15',
  notes: 'Mon morning runs',
}

describe('corporate', () => {
  it('stores one inquiry and schedules the dispatch', async () => {
    storeInquiryMock.mockResolvedValue('44444444-4444-4444-8444-444444444444')
    const res = await corporatePOST(makeRequest('/api/corporate-contact', corporatePayload))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(storeInquiryMock).toHaveBeenCalledTimes(1)
    expect(storeInquiryMock).toHaveBeenCalledWith('corporate', {
      email: 'john@acme.com',
      name: 'John Smith',
      company: 'ACME Corp',
      phone: null,
      payload: { trips: '6–15', notes: 'Mon morning runs' },
    })
    expect(sendCorporateMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).toHaveBeenCalledWith(
      'lead.inquiry:44444444-4444-4444-8444-444444444444',
    )
  })

  it('stores absent trips/notes as null', async () => {
    storeInquiryMock.mockResolvedValue('55555555-5555-4555-8555-555555555555')
    await corporatePOST(
      makeRequest('/api/corporate-contact', {
        company: 'X',
        name: 'Y',
        email: 'y@x.co',
      }),
    )
    expect(storeInquiryMock.mock.calls[0][1].payload).toEqual({ trips: null, notes: null })
  })

  it('honeypot hit: 200 {ok:true}, nothing stored, no email', async () => {
    const res = await corporatePOST(
      makeRequest('/api/corporate-contact', { ...corporatePayload, website: 'http://spam.com' }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(storeInquiryMock).not.toHaveBeenCalled()
    expect(sendCorporateMock).not.toHaveBeenCalled()
  })
})

describe('corporate failure', () => {
  it('email throwing: 502 unchanged', async () => {
    storeInquiryMock.mockResolvedValue('66666666-6666-4666-8666-666666666666')
    sendCorporateMock.mockRejectedValue(new Error('smtp'))
    const res = await corporatePOST(makeRequest('/api/corporate-contact', corporatePayload))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Email send failed' })
  })

  it('storage returning null: still 200 and email sent once', async () => {
    storeInquiryMock.mockResolvedValue(null)
    const res = await corporatePOST(makeRequest('/api/corporate-contact', corporatePayload))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sendCorporateMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).not.toHaveBeenCalled()
  })
})

// ── multiday ──────────────────────────────────────────────────────────────────
const multidayPayload = {
  startDate: '2026-12-01',
  days: [
    { type: 'transfer', date: '2026-12-01', time: '09:00', from: 'Prague', to: 'Vienna', stops: [] },
    { type: 'hourly', date: '2026-12-02', time: '10:00', city: 'Vienna', hours: 6 },
  ],
  passengerDetails: {
    firstName: 'Anna',
    lastName: 'Novak',
    email: 'anna@example.com',
    phone: '+420 777 123 456',
    specialRequests: 'Child seat',
  },
}

describe('multiday', () => {
  it('stores one multiday_quote inquiry with the full payload', async () => {
    storeInquiryMock.mockResolvedValue('77777777-7777-4777-8777-777777777777')
    const res = await multidayPOST(makeRequest('/api/submit-multiday-quote', multidayPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quoteReference).toMatch(/^MQ-\d{8}-[0-9A-F]{6}$/)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(storeInquiryMock).toHaveBeenCalledTimes(1)
    const [kind, input] = storeInquiryMock.mock.calls[0]
    expect(kind).toBe('multiday_quote')
    expect(input).toMatchObject({
      email: 'anna@example.com',
      name: 'Anna Novak',
      phone: '+420777123456',
      company: null,
    })
    expect(input.payload).toEqual({
      quoteReference: json.quoteReference,
      startDate: '2026-12-01',
      days: multidayPayload.days,
      firstName: 'Anna',
      lastName: 'Novak',
      specialRequests: 'Child seat',
    })
    expect(sendOperatorAlertMock).toHaveBeenCalledTimes(1)
    expect(sendClientAckMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).toHaveBeenCalledWith(
      'lead.inquiry:77777777-7777-4777-8777-777777777777',
    )
  })

  it('a quote with one day and no startDate stores fine', async () => {
    storeInquiryMock.mockResolvedValue('88888888-8888-4888-8888-888888888888')
    const body = {
      days: [multidayPayload.days[0]],
      passengerDetails: { ...multidayPayload.passengerDetails, specialRequests: undefined },
    }
    const res = await multidayPOST(makeRequest('/api/submit-multiday-quote', body))
    expect(res.status).toBe(200)
    expect(storeInquiryMock.mock.calls[0][1].payload).toMatchObject({
      startDate: null,
      specialRequests: null,
    })
  })

  it('two identical submissions get two different references and two stores', async () => {
    storeInquiryMock.mockResolvedValue(null)
    const a = await (await multidayPOST(makeRequest('/api/submit-multiday-quote', multidayPayload))).json()
    const b = await (await multidayPOST(makeRequest('/api/submit-multiday-quote', multidayPayload))).json()
    expect(a.quoteReference).not.toBe(b.quoteReference)
    expect(storeInquiryMock).toHaveBeenCalledTimes(2)
  })

  it('invalid phone: 422 and nothing stored', async () => {
    const res = await multidayPOST(
      makeRequest('/api/submit-multiday-quote', {
        ...multidayPayload,
        passengerDetails: { ...multidayPayload.passengerDetails, phone: '12345' },
      }),
    )
    expect(res.status).toBe(422)
    expect(storeInquiryMock).not.toHaveBeenCalled()
  })
})

describe('multiday failure', () => {
  it('storage returning null: response identical, both emails once', async () => {
    storeInquiryMock.mockResolvedValue(null)
    const res = await multidayPOST(makeRequest('/api/submit-multiday-quote', multidayPayload))
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json())).toEqual(['quoteReference'])
    expect(sendOperatorAlertMock).toHaveBeenCalledTimes(1)
    expect(sendClientAckMock).toHaveBeenCalledTimes(1)
    expect(dispatchAfterResponseMock).not.toHaveBeenCalled()
  })
})

// ── storeInquiry (real module, mocked Supabase factory) ──────────────────────
describe('storeInquiry', () => {
  const SECRET_EMAIL = 'secret-person@example.com'
  const input = {
    email: SECRET_EMAIL,
    name: 'Secret Name',
    phone: '+420999888777',
    company: 'Secret Co',
    payload: { message: 'secret message body' },
  }

  async function loadReal() {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ createSupabaseServiceClient: createClientMock }))
    return (await vi.importActual<typeof import('@/lib/inquiries')>('@/lib/inquiries'))
  }

  function clientWith(result: Promise<unknown>) {
    const single = vi.fn(() => result)
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn((rows: Record<string, unknown>[]) => { void rows; return { select } })
    const from = vi.fn(() => ({ insert }))
    createClientMock.mockReturnValue({ from })
    return { insert, from }
  }

  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createClientMock.mockReset()
    process.env.SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    errorSpy.mockRestore()
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('returns the new id and inserts exactly the allowed columns', async () => {
    const { insert } = clientWith(Promise.resolve({ data: { id: 'new-id' }, error: null }))
    const { storeInquiry } = await loadReal()
    expect(await storeInquiry('contact', input)).toBe('new-id')
    const rows = insert.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['company', 'email', 'kind', 'name', 'payload', 'phone'].sort(),
    )
  })

  it('insert error: null, log has a code and no input values', async () => {
    clientWith(Promise.resolve({ data: null, error: { code: '23505', message: SECRET_EMAIL } }))
    const { storeInquiry } = await loadReal()
    expect(await storeInquiry('contact', input)).toBeNull()
    const logged = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')
    expect(logged).toContain('code=23505')
    for (const v of ['secret-person', 'Secret Name', '999888777', 'Secret Co', 'secret message']) {
      expect(logged).not.toContain(v)
    }
  })

  it('client factory throwing: null', async () => {
    createClientMock.mockImplementation(() => {
      throw new Error('supabaseUrl is required')
    })
    const { storeInquiry } = await loadReal()
    expect(await storeInquiry('contact', input)).toBeNull()
    expect(errorSpy.mock.calls.join(' ')).toContain('code=exception')
  })

  it('insert never settling: null after 3 s', async () => {
    vi.useFakeTimers()
    clientWith(new Promise(() => {}))
    const { storeInquiry } = await loadReal()
    const p = storeInquiry('contact', input)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toBeNull()
    expect(errorSpy.mock.calls.join(' ')).toContain('code=timeout')
  })

  it('SUPABASE_URL unset: null without building a client', async () => {
    delete process.env.SUPABASE_URL
    const { storeInquiry } = await loadReal()
    expect(await storeInquiry('contact', input)).toBeNull()
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
