import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendCorporateContactEmails, type CorporateContactPayload } from '@/lib/email-corporate'

const corporateSchema = z.object({
  company: safeString(200),
  name: safeString(200),
  email: safeEmail(200),
  trips: safeString(40).nullable().optional(),    // free-form like '6–15'
  notes: safeString(1500).nullable().optional(),
  website: z.string().optional(), // honeypot
})

export async function POST(req: Request) {
  const tooBig = enforceMaxBody(req, 4_000)
  if (tooBig) return tooBig

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit('/api/corporate-contact', ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = corporateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  if (parsed.data.website) return NextResponse.json({ ok: true }) // honeypot

  const payload: CorporateContactPayload = {
    company: parsed.data.company,
    name: parsed.data.name,
    email: parsed.data.email,
    trips: parsed.data.trips ?? null,
    notes: parsed.data.notes ?? null,
    source: 'corporate',  // server-side tag, never trust client
  }

  try {
    await sendCorporateContactEmails(payload)
  } catch (e) {
    console.error('[corporate-contact] resend failed', (e as Error).message)
    return NextResponse.json({ error: 'Email send failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
