import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { normalizePhone } from '@/lib/phone'
import { enforceMaxBody, safeEmail, safeString } from '@/lib/request-guards'
import { storeInquiry } from '@/lib/inquiries'
import { dispatchAfterResponse, inquiryOutboxKey } from '@/lib/outbox'
import { enqueueCustomTourAlert } from '@/lib/custom-tour-enqueue'
import { sendCustomTourOperatorAlert, sendCustomTourClientAck } from '@/lib/email'
import { normalizeSiteLocale } from '@/i18n/locales'
import { getPragueTodayISO } from '@/lib/prague-date'
import { TOUR_SLUG_MAX_LENGTH, TOUR_SLUG_PATTERN } from '@/lib/tours/types'

// Phase 93 (plan 93-32; TRIP-06; D-17, D-18): the public custom-tour request endpoint.
// Guard order (CLAUDE.md): body size -> rate limit -> strict zod (400 + field errors) -> honeypot (silent 200)
// -> phone (422) -> best-effort store + outbox -> emails. The answer never depends on the VPS: the CRM lead and the
// Chatwoot note go through the outbox, which the dispatcher delivers after the response.
// Logs carry ids and codes only, never a name, email, phone or free text.

const MAX_BODY_BYTES = 10_000
const MAX_TEXT = 1000
const MAX_PEOPLE = 50

/** A real calendar date in YYYY-MM-DD form. */
function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const customTourSchema = z.strictObject({
  // Free text (a textarea): line breaks allowed, length capped. Single-line fields below reject them.
  where: z.string().trim().min(1).max(MAX_TEXT),
  date: z
    .string()
    .refine(isRealIsoDate, 'Invalid date')
    // Today or later in Prague time; ISO dates compare as strings. The form itself asks for tomorrow or later.
    .refine((v) => v >= getPragueTodayISO(), 'Date is in the past'),
  people: z.number().int().min(1).max(MAX_PEOPLE),
  wishes: z.string().trim().max(MAX_TEXT).optional(),
  name: safeString(100).trim().min(1),
  email: safeEmail(200),
  phone: safeString(30).trim().min(5),
  tourSlug: z.string().max(TOUR_SLUG_MAX_LENGTH).regex(TOUR_SLUG_PATTERN).optional(),
  locale: z.string().max(20).optional(),
  // Honeypot: real visitors never fill it (same pattern as /api/contact).
  website: z.string().max(200).optional(),
})

export async function POST(req: Request) {
  // (1) Body size
  const tooBig = enforceMaxBody(req, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  // (2) Rate limit per IP
  const { allowed, remaining, limit } = await checkRateLimit('/api/custom-tour', getClientIp(req))
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
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request', fieldErrors: {} }, { status: 400 })
    }
    const parsed = customTourSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', fieldErrors: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      )
    }
    const body = parsed.data

    // (4) Honeypot filled: answer like a success, but store, email and dispatch nothing.
    if (body.website) return NextResponse.json({ ok: true })

    // (5) The phone must carry a country code (E.164); the stored value is the normalised one.
    const phoneE164 = normalizePhone(body.phone)
    if (!phoneE164) {
      return NextResponse.json({ error: 'Phone must include the country code', code: 'INVALID_PHONE' }, { status: 422 })
    }

    const locale = normalizeSiteLocale(body.locale)
    const wishes = body.wishes ? body.wishes : null
    const tourSlug = body.tourSlug ?? null

    // (6) Best-effort store (D-18): storeInquiry never throws, and a failure here never blocks the answer.
    let inquiryId: string | null = null
    try {
      inquiryId = await storeInquiry('custom_tour', {
        email: body.email,
        name: body.name,
        phone: phoneE164,
        company: null,
        payload: { where: body.where, date: body.date, people: body.people, wishes, tourSlug, locale },
      })
    } catch {
      console.error('[custom-tour] store failed')
    }

    if (inquiryId) {
      // lead.inquiry (EspoCRM) and alert.custom_tour (Chatwoot note) rows; both are armed after the response.
      dispatchAfterResponse(inquiryOutboxKey(inquiryId))
      await enqueueCustomTourAlert(inquiryId)
    }

    // (7) Emails: operator alert (English, admin link only when an id exists) and the localized client
    // acknowledgement. allSettled so a failing send can never fail a request that is already stored.
    await Promise.allSettled([
      sendCustomTourOperatorAlert({
        inquiryId,
        locale,
        tourSlug,
        name: body.name,
        email: body.email,
        phone: phoneE164,
        where: body.where,
        date: body.date,
        people: body.people,
        wishes,
      }),
      sendCustomTourClientAck({
        locale,
        name: body.name,
        email: body.email,
        where: body.where,
        date: body.date,
        people: body.people,
      }),
    ])

    // (8) Response
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
        },
      },
    )
  } catch {
    console.error('[custom-tour] request failed')
    return NextResponse.json({ error: 'Failed to submit custom tour request' }, { status: 500 })
  }
}
