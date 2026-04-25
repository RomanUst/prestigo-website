import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { sendQuoteEmail, type QuotePayload } from '@/lib/email-quote'

const quoteEmailSchema = z.object({
  email: safeEmail(200),
  quote: z.object({
    from: safeString(300),
    to: safeString(300),
    serviceType: z.enum(['transfer', 'hourly', 'daily']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    vehicleClass: z.enum(['business', 'first_class', 'business_van']),
    passengers: z.number().int().min(1).max(7),
    price: z.number().int().min(0).max(9999),
    routeSlug: safeString(80).nullable().optional(),
    distanceKm: z.number().min(0).max(10000).nullable().optional(),
  }),
  eventId: safeString(128).optional(),
  pageUrl: safeString(1024).optional(),
  website: z.string().optional(), // honeypot
})

export async function POST(req: Request) {
  const tooBig = enforceMaxBody(req, 2_000)
  if (tooBig) return tooBig

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit('/api/quote-email', ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = quoteEmailSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Honeypot — silent 200
  if (parsed.data.website) return NextResponse.json({ ok: true })

  const { email, quote, eventId, pageUrl } = parsed.data
  const quotePayload: QuotePayload = {
    ...quote,
    date: quote.date ?? null,
    time: quote.time ?? null,
    routeSlug: quote.routeSlug ?? null,
    distanceKm: quote.distanceKm ?? null,
  }

  // 1. Persist lead (service role)
  const supabase = createSupabaseServiceClient()
  const { error: insertError } = await supabase.from('quote_leads').insert({
    email,
    quote_payload: quotePayload,
    ip,
    user_agent: req.headers.get('user-agent') ?? null,
  })
  if (insertError) {
    console.error('[quote-email] insert failed', insertError.message)
    // Continue — email send is more important than lead persistence for UX
  }

  // 2. Send email (await — failure must surface to client)
  try {
    await sendQuoteEmail({ email, quote: quotePayload })
  } catch (e) {
    console.error('[quote-email] resend failed', (e as Error).message)
    return NextResponse.json({ error: 'Email send failed' }, { status: 502 })
  }

  // 3. CAPI fan-out — fire-and-forget
  if (eventId) {
    const capiUrl = new URL('/api/meta-capi', req.url).toString()
    fetch(capiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: 'Lead',
        event_id: eventId,
        email,
        url: pageUrl,
        custom_data: { value: quote.price, currency: 'EUR' },
      }),
    }).catch(() => { /* fire-and-forget */ })
  }

  return NextResponse.json({ ok: true })
}
