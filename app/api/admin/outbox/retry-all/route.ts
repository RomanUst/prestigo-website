import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { publishOutboxDispatch } from '@/lib/outbox'
import { retryFailedOutbox } from '@/lib/outbox-admin-store'

// D-12: put every failed outbox event back on the queue after an outage. Supabase RPC + QStash
// publish only: no CRM or Chatwoot import (VPS isolation guard). Max 500 keys per call, published
// in batches of 10 (QStash free plan, T-82-09).

const RETRY_LIMIT = 500
const PUBLISH_BATCH = 10

const retryAllSchema = z.object({}).strict()

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
  if (!retryAllSchema.safeParse(body).success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  let keys: string[]
  try {
    keys = await retryFailedOutbox(RETRY_LIMIT)
  } catch {
    console.error('[admin/outbox.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const dedupSuffix = `r${Math.floor(Date.now() / 1000)}`
  let published = 0
  for (let i = 0; i < keys.length; i += PUBLISH_BATCH) {
    const batch = keys.slice(i, i + PUBLISH_BATCH)
    const results = await Promise.all(
      batch.map((key) => publishOutboxDispatch(key, { dedupSuffix }).catch(() => false)),
    )
    published += results.filter(Boolean).length
  }

  return NextResponse.json({ ok: true, queued: keys.length, published })
}
