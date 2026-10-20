import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody, safeString } from '@/lib/request-guards'
import { normalizePhone } from '@/lib/phone'
import { markPhoneShared } from '@/lib/identity-admin-store'

// D-05 (manual half): mark a number as shared, for example an agency or hotel desk. There is no
// unmark operation. No CRM or Chatwoot import (VPS isolation guard). Guard order: body size ->
// session (401/403) -> JSON (400) -> shape (400) -> semantics (422). Logs carry the code only.

const sharedSchema = z
  .object({
    phone: safeString(50),
    note: safeString(80).trim().optional(),
  })
  .strict()

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 4_000)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = sharedSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  // Never guess a country code: a number without one is refused.
  const phone = normalizePhone(parsed.data.phone)
  if (!phone) {
    return NextResponse.json(
      { error: 'invalid_phone', message: 'Enter the number with country code, for example +420 777 123 456.' },
      { status: 422 },
    )
  }

  let result
  try {
    result = await markPhoneShared(phone, parsed.data.note ? parsed.data.note : null, user!.id)
  } catch {
    console.error('[admin/identities.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (result === 'already_shared') {
    return NextResponse.json(
      { error: 'already_shared', message: 'That number is already marked as shared.' },
      { status: 422 },
    )
  }
  if (result === 'invalid') {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 422 })
  }
  return NextResponse.json({ ok: true, phone })
}
