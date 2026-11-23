import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 93 (plan 93-32; TRIP-06; D-18; UI-SPEC Surface 9): the two custom-tour request emails.

const { sendStub } = vi.hoisted(() => ({ sendStub: vi.fn() }))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendStub } }
  },
}))

import { sendCustomTourOperatorAlert, sendCustomTourClientAck, renderCustomTourClientAck } from '@/lib/email'
import ru from '@/messages/ru.json'
import en from '@/messages/en.json'

const ID = '11111111-1111-4111-8111-111111111111'

const ALERT = {
  inquiryId: ID,
  locale: 'ru',
  tourSlug: 'karlstejn-day-trip',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+420123456789',
  where: 'Karlstejn and a wine cellar',
  date: '2030-06-15',
  people: 4,
  wishes: 'Child seat please',
  receivedAt: new Date('2030-01-10T10:30:00Z'),
}

const ACK = {
  locale: 'ru',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  where: 'Karlstejn and a wine cellar',
  date: '2030-06-15',
  people: 4,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY ||= 'stub-key'
  process.env.MANAGER_EMAIL = 'manager@prestigo.cz'
  delete process.env.NEXT_PUBLIC_SITE_URL
  sendStub.mockResolvedValue({ error: null, data: { id: 'email_stub' } })
})

describe('sendCustomTourOperatorAlert', () => {
  it('sends the English alert with received time, locale, starting tour, admin link and contact details', async () => {
    await sendCustomTourOperatorAlert(ALERT)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const arg = sendStub.mock.calls[0][0]
    expect(arg.subject).toBe('[Custom tour] New request from the site')
    expect(arg.to).toEqual(['manager@prestigo.cz'])
    expect(arg.html).toContain('https://rideprestigo.com/admin/custom-tours/' + ID)
    // 10:30 UTC in January is 11:30 in Prague
    expect(arg.html).toContain('10 January 2030')
    expect(arg.html).toContain('11:30')
    expect(arg.html).toContain('Language:</span> ru')
    expect(arg.html).toContain('karlstejn-day-trip')
    expect(arg.html).toContain('ada@example.com')
    expect(arg.html).toContain('+420123456789')
    expect(arg.html).toContain('Ada Lovelace')
  })

  it("shows 'None' without a starting tour and no admin link without an inquiry id", async () => {
    await sendCustomTourOperatorAlert({ ...ALERT, tourSlug: null, inquiryId: null })
    const html = sendStub.mock.calls[0][0].html as string
    expect(html).toContain('None')
    expect(html).not.toContain('/admin/custom-tours/')
  })

  it('every visitor value is escaped', async () => {
    await sendCustomTourOperatorAlert({
      ...ALERT,
      name: '<img src=x onerror=1>',
      where: '<script>alert(1)</script>',
      wishes: '"><b>bold</b>',
    })
    const html = sendStub.mock.calls[0][0].html as string
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not throw and logs no address when Resend rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sendStub.mockRejectedValueOnce(new Error('boom ada@example.com'))
    await expect(sendCustomTourOperatorAlert(ALERT)).resolves.toBeUndefined()
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ada@example.com')
    warn.mockRestore()
  })

  it('skips quietly when MANAGER_EMAIL is not set', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete process.env.MANAGER_EMAIL
    await sendCustomTourOperatorAlert(ALERT)
    expect(sendStub).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('sendCustomTourClientAck', () => {
  it('sends the Russian acknowledgement from TourEmails.ack: subject, heading with the name, summary rows, per-car sentence', async () => {
    await sendCustomTourClientAck(ACK)
    expect(sendStub).toHaveBeenCalledTimes(1)
    const arg = sendStub.mock.calls[0][0]
    const ack = (ru as unknown as { TourEmails: { ack: Record<string, string> } }).TourEmails.ack
    expect(arg.to).toEqual(['ada@example.com'])
    expect(arg.subject).toBe(ack.subject)
    expect(arg.html).toContain(ack.heading.replace('{name}', 'Ada Lovelace'))
    expect(arg.html).toContain(ack.where)
    expect(arg.html).toContain(ack.date)
    expect(arg.html).toContain(ack.people)
    expect(arg.html).toContain('Karlstejn and a wine cellar')
    // the "per car, not per person" sentence is the tail of the body
    expect(arg.html).toContain('Цена указывается за автомобиль, а не за человека.')
    // no button
    expect(arg.html).not.toMatch(/<a\s/i)
    expect(arg.html).toContain('lang="ru"')
    expect(arg.html).not.toContain('dir="rtl"')
  })

  it('renders right-to-left for ar', async () => {
    const { html, locale } = await renderCustomTourClientAck({ ...ACK, locale: 'ar' })
    expect(locale).toBe('ar')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="ar"')
  })

  it('an unknown locale renders English', async () => {
    const { subject, locale } = await renderCustomTourClientAck({ ...ACK, locale: 'xx' })
    const ack = (en as unknown as { TourEmails: { ack: Record<string, string> } }).TourEmails.ack
    expect(locale).toBe('en')
    expect(subject).toBe(ack.subject)
  })

  it('escaped: a where text and a name with markup never become HTML', async () => {
    const { html } = await renderCustomTourClientAck({
      ...ACK,
      name: '<img src=x onerror=1>',
      where: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=1&gt;')
  })

  it('every locale renders without throwing and without a leftover ICU parameter', async () => {
    for (const locale of ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh', 'zh-hant']) {
      const { html, subject } = await renderCustomTourClientAck({ ...ACK, locale })
      expect(subject.length).toBeGreaterThan(0)
      expect(html).not.toMatch(/\{(name|date)\}/)
    }
  })

  it('does not throw and logs no address when Resend rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sendStub.mockRejectedValueOnce(new Error('boom ada@example.com'))
    await expect(sendCustomTourClientAck(ACK)).resolves.toBeUndefined()
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ada@example.com')
    warn.mockRestore()
  })
})

afterEach(() => {
  delete process.env.MANAGER_EMAIL
})
