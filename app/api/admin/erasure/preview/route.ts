import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody, NO_LINE_BREAKS } from '@/lib/request-guards'
import { normalizeIdentityEmail, normalizeIdentityPhone } from '@/lib/identity'
import { erasureEmailHmac, loadErasureHmacKey } from '@/lib/erasure-hash'
import { createErasurePreview, erasureScope } from '@/lib/erasure-store'

// D-07: step one of an erasure. Looks the person up by email or phone in Supabase only and stores a
// short-lived 'previewed' request (ids, counts, the keyed HMAC of the primary email). Nothing is
// deleted here. No CRM or Chatwoot import (VPS isolation guard). Guard order: session (401/403) ->
// key (503, fail closed) -> JSON (400) -> shape (400) -> semantics (422). Logs carry the code only.

const PREVIEW_TTL_SECONDS = 900

const previewSchema = z.object({ query: z.string().trim().min(1).max(200).regex(NO_LINE_BREAKS, 'Invalid format') }).strict()

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
  const parsed = previewSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const query = parsed.data.query
  const isEmail = query.includes('@')
  const email = isEmail ? normalizeIdentityEmail(query) : null
  const phone = isEmail ? null : normalizeIdentityPhone(query)
  if (!email && !phone) return NextResponse.json({ error: 'invalid_query' }, { status: 422 })

  try {
    const scope = await erasureScope(email, phone)
    if (scope.outcome === 'shared_phone') {
      return NextResponse.json({ error: 'shared_phone', identities: scope.identities }, { status: 422 })
    }
    if (scope.outcome !== 'ok') {
      return NextResponse.json({ error: scope.outcome }, { status: 422 })
    }

    const requestId = await createErasurePreview({
      actor: user!.id,
      emailHmac: erasureEmailHmac(key, scope.primaryEmail),
      scope,
      ttlSeconds: PREVIEW_TTL_SECONDS,
    })
    return NextResponse.json({ requestId, primaryEmail: scope.primaryEmail, counts: scope.counts })
  } catch {
    console.error('[admin/erasure.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
