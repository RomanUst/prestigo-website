import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { publishOutboxDispatch } from '@/lib/outbox'
import { normalizeIdentityEmail } from '@/lib/identity'
import { erasureEmailHmac, hmacEquals, loadErasureHmacKey } from '@/lib/erasure-hash'
import { confirmErasure, loadErasure } from '@/lib/erasure-store'

// D-07: step two of an erasure, the irreversible one. The SERVER re-checks everything the modal
// asks for: the typed email must hash (keyed HMAC, timing-safe compare) to the value stored at
// preview time, the identity checkbox must be literally true, and upcoming trips must be
// acknowledged. erasure_confirm (migration 075) additionally requires the same admin as the
// preview and an unexpired preview. Only then is erase.person:<id> published (the migration does
// not kick QStash; the daily sweep is the fallback). No CRM or Chatwoot import (VPS isolation
// guard). Guard order: session (401/403) -> key (503) -> JSON (400) -> shape (400) -> semantics
// (422). Logs carry the code only, never an address.

const confirmSchema = z
  .object({
    requestId: z.string().uuid(),
    confirmEmail: z.string().max(254),
    identityVerified: z.literal(true),
    upcomingAcknowledged: z.boolean().optional(),
  })
  .strict()

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const key = loadErasureHmacKey()
  if (!key) {
    console.error('[admin/erasure.POST] code=erasure_unconfigured')
    return NextResponse.json({ error: 'erasure_unconfigured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const { requestId, confirmEmail, upcomingAcknowledged } = parsed.data

  try {
    const stored = await loadErasure(requestId)
    if (!stored) return NextResponse.json({ error: 'not_found' }, { status: 422 })

    const typed = normalizeIdentityEmail(confirmEmail)
    if (!typed || !hmacEquals(erasureEmailHmac(key, typed), stored.emailHmac)) {
      return NextResponse.json({ error: 'email_mismatch' }, { status: 422 })
    }

    const upcoming = Number(stored.counts.upcoming)
    if (Number.isFinite(upcoming) && upcoming > 0 && upcomingAcknowledged !== true) {
      return NextResponse.json({ error: 'upcoming_not_acknowledged' }, { status: 422 })
    }

    const outcome = await confirmErasure(requestId, user!.id)
    if (outcome !== 'confirmed') return NextResponse.json({ error: outcome }, { status: 422 })

    const published = await publishOutboxDispatch(`erase.person:${requestId}`, { dedupSuffix: 'c' })
    return NextResponse.json({ ok: true, queued: true, published })
  } catch {
    console.error('[admin/erasure.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
