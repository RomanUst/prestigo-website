import { createSupabaseServiceClient } from '@/lib/supabase'

// Best-effort storage of site-form submissions (Phase 81). This must never
// change what the visitor sees: it never throws, builds the Supabase client
// inside its own try, gives up after 3 s, and logs only a code (never a value).
// No IP address and no browser identification are stored (D-17).

export type InquiryKind = 'contact' | 'corporate' | 'multiday_quote'

export interface InquiryInput {
  email: string
  name?: string | null
  phone?: string | null
  company?: string | null
  payload: Record<string, unknown>
}

const STORE_TIMEOUT_MS = 3000

function safeCode(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : ''
  return /^[A-Za-z0-9_]{1,40}$/.test(s) ? s : 'insert_failed'
}

export async function storeInquiry(
  kind: InquiryKind,
  input: InquiryInput,
): Promise<string | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[inquiries] store failed code=no_env')
    return null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const supabase = createSupabaseServiceClient()
    const row = {
      kind,
      email: input.email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      payload: input.payload,
    }

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), STORE_TIMEOUT_MS)
    })

    const res = await Promise.race([
      supabase.from('inquiries').insert([row]).select('id').single(),
      timeout,
    ])

    if (res.error || !res.data?.id) {
      console.error(`[inquiries] store failed code=${safeCode(res.error?.code)}`)
      return null
    }
    return res.data.id as string
  } catch (e) {
    const code = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'exception'
    console.error(`[inquiries] store failed code=${code}`)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
