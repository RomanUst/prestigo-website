import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendBespokeEmails, type BespokePayload } from '@/lib/email-bespoke'

const bespokeSchema = z.object({
  occasion: z.enum(['wedding', 'corporate', 'airport_vip', 'other']),
  guests: z.number().int().min(1).max(10),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  specialRequests: safeString(1500).nullable().optional(),
  name: safeString(200),
  email: safeEmail(200),
  website: z.string().optional(), // honeypot
})

export async function POST(req: Request) {
  const tooBig = enforceMaxBody(req, 4_000)
  if (tooBig) return tooBig

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit('/api/bespoke-quote', ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = bespokeSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Honeypot — silent 200, no email send
  if (parsed.data.website) return NextResponse.json({ ok: true })

  const payload: BespokePayload = {
    occasion: parsed.data.occasion,
    guests: parsed.data.guests,
    date: parsed.data.date ?? null,
    time: parsed.data.time ?? null,
    specialRequests: parsed.data.specialRequests ?? null,
    name: parsed.data.name,
    email: parsed.data.email,
  }

  try {
    await sendBespokeEmails(payload)
  } catch (e) {
    console.error('[bespoke-quote] resend failed', (e as Error).message)
    return NextResponse.json({ error: 'Email send failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
