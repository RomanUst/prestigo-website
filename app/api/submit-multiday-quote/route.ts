import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { normalizePhone } from '@/lib/phone'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'
import { storeInquiry } from '@/lib/inquiries'
import { dispatchAfterResponse, inquiryOutboxKey } from '@/lib/outbox'
import {
  sendMultidayOperatorAlert,
  sendMultidayClientAck,
  type MultidayEmailData,
  type MultidayDaySummary,
} from '@/lib/email'

// ─────────────────────────────────────────────────────────────────────────────
// Zod schema — server-side source of truth for the multi-day quote payload
// ─────────────────────────────────────────────────────────────────────────────

const stopSchema = z.object({
  address: safeString(300).min(1),
  lat: z.number().finite(),
  lng: z.number().finite(),
}).strict()

const transferDaySchema = z.object({
  type: z.literal('transfer'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  from: safeString(300).min(1),
  to: safeString(300).min(1),
  stops: z.array(stopSchema).max(5),   // STOP-01 cap reused
}).strict()

const hourlyDaySchema = z.object({
  type: z.literal('hourly'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  city: safeString(300).min(1),
  hours: z.number().int().min(1).max(24),
}).strict()

const daySchema = z.discriminatedUnion('type', [transferDaySchema, hourlyDaySchema])

const submitMultidaySchema = z.object({
  days: z.array(daySchema).min(1).max(30),   // DoS cap: 30 is plenty
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengerDetails: z.object({
    firstName: safeString(100).min(1),
    lastName:  safeString(100).min(1),
    email:     safeEmail(200),
    phone:     safeString(30).min(5),
    // specialRequests is free-form: newlines allowed, length capped (same as submit-quote)
    specialRequests: z.string().max(1000).optional(),
  }).strict(),
}).strict()

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateMultidayQuoteRef(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = randomBytes(3).toString('hex').toUpperCase()
  return `MQ-${datePart}-${suffix}`
}

function toEmailData(
  body: z.infer<typeof submitMultidaySchema>,
  quoteReference: string,
): MultidayEmailData {
  const days: MultidayDaySummary[] = body.days.map((day, i) => {
    if (day.type === 'transfer') {
      return {
        index: i + 1,
        type: 'transfer' as const,
        date: day.date,
        time: day.time,
        from: day.from,
        to: day.to,
        stops: day.stops.map((s) => s.address),
      }
    }
    return {
      index: i + 1,
      type: 'hourly' as const,
      date: day.date,
      time: day.time,
      city: day.city,
      hours: day.hours,
    }
  })

  return {
    quoteReference,
    days,
    startDate: body.startDate,
    firstName: body.passengerDetails.firstName,
    lastName:  body.passengerDetails.lastName,
    email:     body.passengerDetails.email,
    phone:     body.passengerDetails.phone,
    specialRequests: body.passengerDetails.specialRequests,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler — follows CLAUDE.md guard order:
//   1. enforceMaxBody (50 KB)
//   2. checkRateLimit (5/min per IP)
//   3. Zod parse (400 on failure)
//   4. Business logic (email dispatch + best-effort inquiry store)
//   5. Response
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // (1) Body size — itinerary arrays can be large, 50 KB is generous
  const tooBig = enforceMaxBody(req, 50_000)
  if (tooBig) return tooBig

  // (2) Rate limit per IP
  const { allowed, remaining, limit } = await checkRateLimit(
    '/api/submit-multiday-quote',
    getClientIp(req),
  )
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
      },
    )
  }

  try {
    // (3) Parse + validate
    const raw = await req.json()
    const parsed = submitMultidaySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const body = parsed.data

    // Business rule: the phone must carry a country code (E.164). Valid shape
    // but unusable number -> 422, and the stored value is the normalised one.
    const phoneE164 = normalizePhone(body.passengerDetails.phone)
    if (!phoneE164) {
      return NextResponse.json({ error: 'Phone must include the country code', code: 'INVALID_PHONE' }, { status: 422 })
    }
    body.passengerDetails.phone = phoneE164

    // (4) Business logic — generate reference, dispatch emails, and store the
    // quote best-effort in `inquiries` (Phase 81; storeInquiry never throws).
    const quoteReference = generateMultidayQuoteRef()
    const emailData = toEmailData(body, quoteReference)
    const { firstName, lastName, email, specialRequests } = body.passengerDetails

    const stored = storeInquiry('multiday_quote', {
      email,
      name: `${firstName} ${lastName}`,
      phone: phoneE164,
      company: null,
      payload: {
        quoteReference,
        startDate: body.startDate ?? null,
        days: body.days,
        firstName,
        lastName,
        specialRequests: specialRequests ?? null,
      },
    })

    // Both email calls are non-fatal by design (see lib/email.ts implementation).
    // We still await them so Resend errors are logged before the response returns.
    await Promise.all([
      sendMultidayOperatorAlert(emailData),
      sendMultidayClientAck(emailData),
    ])

    const inquiryId = await stored
    if (inquiryId) dispatchAfterResponse(inquiryOutboxKey(inquiryId))

    // (5) Response
    return NextResponse.json(
      { quoteReference },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      },
    )
  } catch (error) {
    console.error('submit-multiday-quote error:', error)
    return NextResponse.json({ error: 'Failed to submit multi-day quote' }, { status: 500 })
  }
}
