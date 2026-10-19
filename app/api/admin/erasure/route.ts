import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { erasureLog } from '@/lib/erasure-store'

// GDPR-01 / D-09: the PII-free erasure log behind the admin Erasure page. Rows hold a hash prefix,
// status, per-system counts, verified flag and dates; never an email, name or phone. Admin-only.
// Supabase only: no CRM or Chatwoot import (VPS isolation guard). Logs carry the code only.

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const rows = await erasureLog(100)
    return NextResponse.json({ rows })
  } catch {
    console.error('[admin/erasure.GET] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
