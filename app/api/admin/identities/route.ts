import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { listPhoneMerges, listSharedPhones } from '@/lib/identity-admin-store'

// D-05 / D-06: the two lists behind the admin Identities page (merged-by-phone and shared numbers).
// Admin-only; emails and phones are shown on the page by design and are never logged. No CRM or
// Chatwoot import (VPS isolation guard).

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [merges, shared] = await Promise.all([listPhoneMerges(), listSharedPhones()])
    return NextResponse.json({ merges, shared })
  } catch {
    console.error('[admin/identities.GET] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
