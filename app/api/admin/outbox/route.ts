import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { outboxHealth, openOutboxEvents, type OutboxOpenStatus } from '@/lib/outbox-admin-store'

// Admin outbox health (Phase 82, SYNC-05). Supabase RPCs only: no CRM or Chatwoot import
// (VPS isolation guard). The response holds ids, references and codes — never a name, email
// or phone.

const STATUSES = new Set(['all', 'pending', 'processing', 'failed'])
const EVENT_LIMIT = 100

export async function GET(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = new URL(request.url).searchParams.get('status') ?? 'all'
  if (!STATUSES.has(raw)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const status = raw === 'all' ? null : (raw as OutboxOpenStatus)

  try {
    const [health, events] = await Promise.all([outboxHealth(), openOutboxEvents(status, EVENT_LIMIT)])
    return NextResponse.json({ health, events, updatedAt: new Date().toISOString() })
  } catch {
    console.error('[admin/outbox.GET] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
