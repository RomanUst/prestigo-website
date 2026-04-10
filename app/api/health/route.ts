import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { Resend } from 'resend'

/**
 * Constant-time bearer comparison to avoid leaking HEALTH_SECRET length/content
 * via response-time side channels.
 */
function verifyBearer(header: string | null, expected: string): boolean {
  if (!header) return false
  const expectedHeader = `Bearer ${expected}`
  if (header.length !== expectedHeader.length) return false
  const a = Buffer.from(header)
  const b = Buffer.from(expectedHeader)
  return timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  const expected = process.env.HEALTH_SECRET
  if (!expected || !verifyBearer(request.headers.get('authorization'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only boolean ok/fail is returned to the caller. Details are logged to
  // server logs so an attacker who captures HEALTH_SECRET cannot map internal
  // DB columns, Resend error strings, or env var presence via the response.
  const results: Record<string, { ok: boolean }> = {}

  // Supabase probe
  try {
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase.from('bookings').select('id').limit(1)
    if (error) {
      console.error('[health] supabase probe failed:', error.message)
      results.supabase = { ok: false }
    } else {
      results.supabase = { ok: true }
    }
  } catch (err) {
    console.error('[health] supabase probe threw:', err instanceof Error ? err.message : String(err))
    results.supabase = { ok: false }
  }

  // Stripe probe — verify key is configured (live API call unavailable from Vercel Hobby)
  try {
    const key = process.env.STRIPE_SECRET_KEY ?? ''
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''
    const keyOk = key.startsWith('sk_live_') || key.startsWith('sk_test_')
    const webhookOk = webhookSecret.startsWith('whsec_')
    if (!keyOk || !webhookOk) {
      console.error('[health] stripe env misconfigured', { keyOk, webhookOk })
    }
    results.stripe = { ok: keyOk && webhookOk }
  } catch (err) {
    console.error('[health] stripe probe threw:', err instanceof Error ? err.message : String(err))
    results.stripe = { ok: false }
  }

  // Resend probe
  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    const { error } = await resend.domains.list()
    if (error) {
      console.error('[health] resend probe failed:', error.message)
      results.resend = { ok: false }
    } else {
      results.resend = { ok: true }
    }
  } catch (err) {
    console.error('[health] resend probe threw:', err instanceof Error ? err.message : String(err))
    results.resend = { ok: false }
  }

  const allOk = Object.values(results).every((r) => r.ok)

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', services: results },
    { status: allOk ? 200 : 503 }
  )
}
