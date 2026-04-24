import { createClient } from '@/lib/supabase/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { enforceMaxBody } from '@/lib/request-guards'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { user: null, error: '401' as const }
  if (!user.app_metadata?.is_admin) return { user: null, error: '403' as const }
  return { user, error: null }
}

const routePricePutSchema = z.object({
  e_class_eur: z.coerce.number().positive(),
  s_class_eur: z.coerce.number().positive(),
  v_class_eur: z.coerce.number().positive(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const tooBig = enforceMaxBody(request, 5_000)
  if (tooBig) return tooBig

  const { error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = routePricePutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 })
  }

  const { slug } = await params
  const supabase = createSupabaseServiceClient()
  const { data, error: dbError } = await supabase
    .from('route_prices')
    .update({
      e_class_eur: parsed.data.e_class_eur,
      s_class_eur: parsed.data.s_class_eur,
      v_class_eur: parsed.data.v_class_eur,
    })
    .eq('slug', slug)
    .select('slug')

  if (dbError) return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  revalidatePath('/routes/' + slug)
  revalidatePath('/routes')
  return NextResponse.json({ ok: true, slug })
}
