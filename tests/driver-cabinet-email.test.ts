import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 94 plan 94-01: the cabinet sign-in code email (UI-SPEC "Related emails").

const h = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: h.send }
  },
}))

import { buildDriverLoginCodeHtml, sendDriverLoginCodeEmail } from '@/lib/email'

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test_key'
  h.send.mockReset()
})

describe('buildDriverLoginCodeHtml', () => {
  it('shows the code in one panel with the spec typography and no link or button', () => {
    const html = buildDriverLoginCodeHtml('042517')
    expect(html).toContain('Your sign-in code')
    expect(html).toContain('042517')
    expect(html).toContain('font-size: 32px')
    expect(html).toContain('font-weight: 600')
    expect(html).toContain('#E6D6B0')
    expect(html).toContain('letter-spacing: 8px')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('This code works for 10 minutes. If you did not ask for it, you can ignore this email.')
    expect(html).not.toMatch(/<a\s/i)
    expect(html).not.toMatch(/<button/i)
  })

  it('refuses anything that is not exactly six digits', () => {
    for (const bad of ['12345', '1234567', '12345a', '<b>1234', '']) {
      expect(() => buildDriverLoginCodeHtml(bad)).toThrow()
    }
  })
})

describe('sendDriverLoginCodeEmail', () => {
  it('sends with the spec subject and returns true', async () => {
    h.send.mockResolvedValue({ data: { id: 'x' }, error: null })
    expect(await sendDriverLoginCodeEmail({ to: 'ana@example.com', code: '123456' })).toBe(true)
    const arg = h.send.mock.calls[0][0] as { from: string; to: string[]; subject: string; html: string }
    expect(arg.subject).toBe('Your Prestigo sign-in code')
    expect(arg.from).toBe('PRESTIGO Bookings <bookings@rideprestigo.com>')
    expect(arg.to).toEqual(['ana@example.com'])
    expect(arg.html).toContain('123456')
  })

  it('returns false on a Resend error or a throw, logging neither the code nor the address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.send.mockResolvedValueOnce({ data: null, error: { message: 'bad ana@example.com 123456' } })
    expect(await sendDriverLoginCodeEmail({ to: 'ana@example.com', code: '123456' })).toBe(false)
    h.send.mockRejectedValueOnce(new Error('boom ana@example.com 123456'))
    expect(await sendDriverLoginCodeEmail({ to: 'ana@example.com', code: '123456' })).toBe(false)
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('ana@example.com')
    expect(logged).not.toContain('123456')
    spy.mockRestore()
  })
})
