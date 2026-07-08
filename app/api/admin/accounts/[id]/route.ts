import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: profile, error: pErr } = await supabase
    .from('customer_profiles')
    .select('user_id, account_type, company_name, full_name, phone, ico, vat_id, billing_address, created_at')
    .eq('user_id', id)
    .maybeSingle()

  if (pErr) {
    console.error('[admin/accounts/[id].GET] profile read failed:', pErr.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  let email: string | null = null
  const { data: userRes, error: uErr } = await supabase.auth.admin.getUserById(id)
  if (uErr) {
    console.error('[admin/accounts/[id].GET] getUserById failed:', uErr.message)
  } else {
    email = userRes.user?.email ?? null
  }

  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, booking_reference, booking_source, pickup_date, pickup_time, trip_type, vehicle_class, origin_address, destination_address, amount_czk, status, paid_at, invoice_number, created_at')
    .eq('user_id', id)
    .order('pickup_date', { ascending: false })
    .order('pickup_time', { ascending: false })

  if (bErr) {
    console.error('[admin/accounts/[id].GET] bookings read failed:', bErr.message)
    return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  }

  return NextResponse.json({
    account: {
      user_id: profile.user_id,
      email,
      account_type: profile.account_type,
      company_name: profile.company_name ?? null,
      full_name: profile.full_name ?? null,
      phone: profile.phone ?? null,
      ico: profile.ico ?? null,
      vat_id: profile.vat_id ?? null,
      billing_address: profile.billing_address ?? null,
      created_at: profile.created_at,
    },
    bookings: bookings ?? [],
  })
}
