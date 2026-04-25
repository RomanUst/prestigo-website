/**
 * Tests for lib/email-quote.ts
 * Covers LEAD-06: buildQuoteHtml renders fare summary, deeplink, XSS escaping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock resend before importing the module
vi.mock('resend', () => {
  class MockResend {
    emails = {
      send: vi.fn().mockResolvedValue({ id: 'test-id' }),
    }
  }
  return { Resend: MockResend }
})

// Set env var before importing module
process.env.RESEND_API_KEY = 'test-key'

const { buildQuoteHtml, sendQuoteEmail } = await import('@/lib/email-quote')

import type { QuotePayload } from '@/lib/email-quote'

const baseQuote: QuotePayload = {
  from: 'Prague Airport',
  to: 'Prague City Centre',
  serviceType: 'transfer',
  date: '2026-05-01',
  time: '10:00',
  vehicleClass: 'business',
  passengers: 2,
  price: 89,
  routeSlug: 'prague-airport-city',
  distanceKm: 25,
}

describe('buildQuoteHtml', () => {
  it('contains the fare price', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('€89')
  })

  it('contains the from location', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('Prague Airport')
  })

  it('contains the to location', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('Prague City Centre')
  })

  it('contains the booking deeplink URL', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('https://rideprestigo.com/book')
  })

  it('contains CONTINUE BOOKING CTA', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('CONTINUE BOOKING')
  })

  it('escapes XSS in from field', () => {
    const maliciousQuote: QuotePayload = {
      ...baseQuote,
      from: '<script>alert("xss")</script>',
    }
    const html = buildQuoteHtml(maliciousQuote)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes XSS in to field', () => {
    const maliciousQuote: QuotePayload = {
      ...baseQuote,
      to: '<img src=x onerror="alert(1)">',
    }
    const html = buildQuoteHtml(maliciousQuote)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('escapes ampersand in from/to fields', () => {
    const quoteWithAmpersand: QuotePayload = {
      ...baseQuote,
      from: 'Prague & Brno',
    }
    const html = buildQuoteHtml(quoteWithAmpersand)
    expect(html).toContain('Prague &amp; Brno')
  })

  it('includes bookings@rideprestigo.com footer', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('bookings@rideprestigo.com')
  })

  it('deeplink URL contains serviceType param', () => {
    const html = buildQuoteHtml(baseQuote)
    expect(html).toContain('type=transfer')
  })
})

describe('sendQuoteEmail', () => {
  it('is an async function that resolves without throwing', async () => {
    await expect(
      sendQuoteEmail({ email: 'test@example.com', quote: baseQuote })
    ).resolves.not.toThrow()
  })
})
