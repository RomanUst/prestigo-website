import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody, safeString, safeEmail } from '@/lib/request-guards'

const driverPatchSchema = z.object({
  name: z.string().min(1).optional(),
  email: safeEmail(200).optional(),
  phone: safeString(200).optional().nullable(),
  vehicle_info: safeString(200).optional().nullable(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooBig = enforceMaxBody(request, 50_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params  // Next.js 15+ params is a Promise (Pitfall 1)
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json()
  const parsed = driverPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  // Build update object — only include provided fields
  const updateData: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone ?? ''  // NOT NULL in schema
  if (parsed.data.vehicle_info !== undefined) updateData.vehicle_info = parsed.data.vehicle_info

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('drivers')
    .update(updateData)
    .eq('id', id)
    .select()

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params  // Next.js 15+ params is a Promise (Pitfall 1)
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  // 409 guard: check for active assignments (per D-10)
  const { data: active } = await supabase
    .from('driver_assignments')
    .select('id')
    .eq('driver_id', id)
    .in('status', ['pending', 'accepted'])
    .limit(1)

  if (active && active.length > 0) {
    return NextResponse.json(
      { error: 'Driver has an active assignment.' },
      { status: 409 }
    )
  }

  const { error: dbError } = await supabase.from('drivers').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'DB delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
