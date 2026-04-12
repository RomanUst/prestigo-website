import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeString, safeEmail } from '@/lib/request-guards'

const driverCreateSchema = z.object({
  name: z.string().min(1),
  email: safeEmail(200),
  phone: safeString(200).optional(),
  vehicle_info: safeString(200).optional(),
})

export async function GET(_request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('drivers')
    .select('*')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 50_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = driverCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('drivers')
    .insert({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? '',   // NOT NULL in schema — send '' when omitted (Pitfall 5)
      vehicle_info: parsed.data.vehicle_info ?? null,
    })
    .select()

  if (dbError) return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
