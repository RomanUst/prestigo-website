import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const promoCreateSchema = z.object({
  code: z.string().min(3).max(50).transform(v => v.trim().toUpperCase()),
  discount_value: z.coerce.number().positive().max(100),
  expiry_date: z.string().nullable().optional(),
  max_uses: z.coerce.number().int().positive().nullable().optional(),
})

const promoPatchSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
})

export async function GET() {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: 'DB read failed' }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = promoCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('promo_codes')
    .insert({
      code: parsed.data.code,
      discount_value: parsed.data.discount_value,
      expiry_date: parsed.data.expiry_date || null,
      max_uses: parsed.data.max_uses || null,
      is_active: true,
    })
    .select()

  if (dbError) {
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'Code already exists.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = promoPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const { id, is_active } = parsed.data
  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase
    .from('promo_codes')
    .update({ is_active })
    .eq('id', id)

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { error: dbError } = await supabase
    .from('promo_codes')
    .delete()
    .eq('id', id)

  if (dbError) return NextResponse.json({ error: 'DB delete failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
