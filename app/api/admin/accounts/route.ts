import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export interface AdminAccount {
  user_id: string
  email: string | null
  account_type: 'personal' | 'corporate'
  company_name: string | null
  full_name: string | null
  phone: string | null
  ico: string | null
  vat_id: string | null
  billing_address: string | null
  created_at: string
  booking_count: number
  total_spent_czk: number
}

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()

  const { data: profiles, error: pErr } = await supabase
    .from('customer_profiles')
    .select('user_id, account_type, company_name, full_name, phone, ico, vat_id, billing_address, created_at')
    .order('created_at', { ascending: false })

  if (pErr) {
    console.error('[admin/accounts.GET] profiles read failed:', pErr.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  // Emails live in auth.users — fetch and map by id. Small install (handful of
  // accounts) so a single large page is sufficient; revisit if this grows.
  const emailById = new Map<string, string | null>()
  const { data: usersPage, error: uErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (uErr) {
    console.error('[admin/accounts.GET] listUsers failed:', uErr.message)
  } else {
    for (const u of usersPage.users) emailById.set(u.id, u.email ?? null)
  }

  // Booking counts + revenue per account, aggregated from linked bookings.
  const countById = new Map<string, number>()
  const spentById = new Map<string, number>()
  const { data: bookingRows, error: bErr } = await supabase
    .from('bookings')
    .select('user_id, amount_czk, status')
    .not('user_id', 'is', null)

  if (bErr) {
    console.error('[admin/accounts.GET] bookings read failed:', bErr.message)
  } else {
    for (const b of bookingRows ?? []) {
      const uid = b.user_id as string
      countById.set(uid, (countById.get(uid) ?? 0) + 1)
      if (b.status !== 'cancelled') {
        spentById.set(uid, (spentById.get(uid) ?? 0) + (b.amount_czk ?? 0))
      }
    }
  }

  const accounts: AdminAccount[] = (profiles ?? []).map((p) => ({
    user_id: p.user_id as string,
    email: emailById.get(p.user_id as string) ?? null,
    account_type: p.account_type as 'personal' | 'corporate',
    company_name: p.company_name ?? null,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,
    ico: p.ico ?? null,
    vat_id: p.vat_id ?? null,
    billing_address: p.billing_address ?? null,
    created_at: p.created_at as string,
    booking_count: countById.get(p.user_id as string) ?? 0,
    total_spent_czk: spentById.get(p.user_id as string) ?? 0,
  }))

  return NextResponse.json({ accounts })
}
