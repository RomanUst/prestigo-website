import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { parseOutboxKey, publishOutboxDispatch } from '@/lib/outbox'
import { retryOutboxEvent } from '@/lib/outbox-admin-store'

// D-12: retry ONE outbox event. Supabase RPC + QStash publish only: no CRM or Chatwoot import
// (VPS isolation guard). Guard order: body size -> session (401/403) -> JSON (400) -> shape (400)
// -> key semantics (422).

const retrySchema = z.object({ key: z.string().min(1).max(120) }).strict()

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 2_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = retrySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { key } = parsed.data
  if (!parseOutboxKey(key)) return NextResponse.json({ error: 'invalid_key' }, { status: 422 })

  let retried: boolean
  try {
    retried = await retryOutboxEvent(key)
  } catch {
    console.error('[admin/outbox.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  if (!retried) return NextResponse.json({ error: 'not_retryable' }, { status: 422 })

  // The row is pending again; if the publish fails the daily sweep still re-arms it.
  const published = await publishOutboxDispatch(key, {
    dedupSuffix: `r${Math.floor(Date.now() / 1000)}`,
  }).catch(() => false)
  return NextResponse.json({ ok: true, queued: true, published })
}
