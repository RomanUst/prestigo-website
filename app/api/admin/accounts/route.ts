import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeString, safeEmail } from '@/lib/request-guards'

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
  // Also build a reverse email→user_id map so guest bookings (placed without a
  // login, so bookings.user_id is null) can be attributed to the account whose
  // email matches — matching the admin detail view and preventing real trips
  // from showing as 0.
  const emailById = new Map<string, string | null>()
  const userIdByEmail = new Map<string, string>()
  const { data: usersPage, error: uErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (uErr) {
    console.error('[admin/accounts.GET] listUsers failed:', uErr.message)
  } else {
    for (const u of usersPage.users) {
      emailById.set(u.id, u.email ?? null)
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id)
    }
  }

  // Booking counts + revenue per account, aggregated from bookings linked by
  // user_id OR by matching client_email. Cancelled bookings are excluded from
  // both the trip count and revenue.
  const countById = new Map<string, number>()
  const spentById = new Map<string, number>()
  const { data: bookingRows, error: bErr } = await supabase
    .from('bookings')
    .select('user_id, client_email, amount_czk, status')

  if (bErr) {
    console.error('[admin/accounts.GET] bookings read failed:', bErr.message)
  } else {
    for (const b of bookingRows ?? []) {
      if (b.status === 'cancelled') continue
      const uid =
        (b.user_id as string | null) ??
        (b.client_email ? userIdByEmail.get((b.client_email as string).toLowerCase()) : undefined)
      if (!uid) continue
      countById.set(uid, (countById.get(uid) ?? 0) + 1)
      spentById.set(uid, (spentById.get(uid) ?? 0) + (b.amount_czk ?? 0))
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

const optionalText = (max: number) =>
  safeString(max).trim().optional().transform((v) => (v ? v : null))

const accountCreateSchema = z
  .object({
    email: safeEmail(200).trim().toLowerCase(),
    account_type: z.enum(['personal', 'corporate']),
    company_name: optionalText(200),
    full_name: optionalText(200),
    phone: optionalText(50),
    ico: optionalText(50),
    vat_id: optionalText(50),
    // Multi-line postal address is allowed here (matches the profile form).
    billing_address: z.string().max(500).trim().optional().transform((v) => (v ? v : null)),
  })
  .refine((d) => d.account_type !== 'corporate' || !!d.company_name, {
    message: 'Company name is required for corporate accounts',
    path: ['company_name'],
  })

/**
 * Admin-side account creation. Creates the auth user via the Admin API (never
 * raw SQL — raw auth.users inserts leave token columns NULL and break GoTrue
 * login) with the email pre-confirmed, so the customer can later sign in via
 * magic link / password reset. No password is set or returned.
 */
export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 20_000)
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
  const parsed = accountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid payload', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const d = parsed.data

  const supabase = createSupabaseServiceClient()

  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email: d.email,
    email_confirm: true,
    user_metadata: {
      account_type: d.account_type,
      company_name: d.company_name,
      created_by_admin: true,
    },
  })

  if (cErr || !created?.user) {
    const msg = cErr?.message ?? ''
    if (/already|registered|exists/i.test(msg)) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }
    console.error('[admin/accounts.POST] createUser failed:', msg)
    return NextResponse.json({ error: 'Could not create user' }, { status: 500 })
  }

  const userId = created.user.id
  const { error: pErr } = await supabase.from('customer_profiles').upsert(
    {
      user_id: userId,
      account_type: d.account_type,
      company_name: d.company_name,
      full_name: d.full_name,
      phone: d.phone,
      ico: d.ico,
      vat_id: d.vat_id,
      billing_address: d.billing_address,
    },
    { onConflict: 'user_id' },
  )

  if (pErr) {
    console.error('[admin/accounts.POST] profile upsert failed:', pErr.message)
    // Roll back the orphaned auth user so the admin can retry cleanly.
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Could not create profile' }, { status: 500 })
  }

  return NextResponse.json({ user_id: userId }, { status: 201 })
}
