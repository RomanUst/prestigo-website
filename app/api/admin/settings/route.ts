import { getAdminUser } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

const settingsPatchSchema = z.object({
  notification_flags: z.record(z.string(), z.boolean()),
})

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('pricing_globals')
    .select('notification_flags')
    .eq('id', 1)
    .single()

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })

  return NextResponse.json({ notification_flags: data.notification_flags })
}

export async function PATCH(request: Request) {
  const tooBig = enforceMaxBody(request, 2_048)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = settingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase
    .from('pricing_globals')
    .update({ notification_flags: parsed.data.notification_flags })
    .eq('id', 1)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
