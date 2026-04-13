import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendContactInquiry } from '@/lib/email'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'

// All user-facing string fields use safeString / safeEmail which reject
// embedded \r\n to prevent header injection downstream (email subjects,
// reply-to headers, etc.). `.strict()` rejects unknown keys.
const contactSchema = z.object({
  name:    safeString(100).min(1),
  email:   safeEmail(200),
  phone:   safeString(30).optional(),
  service: safeString(100).optional(),
  // message is free-form multi-line, so we keep newlines allowed here
  // but cap length — this field is NEVER used in a header context.
  message: z.string().min(1).max(2000),
}).strict()

export async function POST(req: Request) {
  // 10 KB is more than generous for a contact form — anything larger is abuse.
  const tooBig = enforceMaxBody(req, 10_000)
  if (tooBig) return tooBig

  const { allowed, limit } = await checkRateLimit('/api/contact', getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  try {
    const raw = await req.json()
    const parsed = contactSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    await sendContactInquiry(parsed.data)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contact route error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
