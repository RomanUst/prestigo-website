import { NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import Stripe from 'stripe'
import { Resend } from 'resend'

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string }> = {}

  // Supabase probe
  try {
    const supabase = createSupabaseServiceClient()
    const { error } = await supabase.from('bookings').select('id').limit(1)
    results.supabase = error ? { ok: false, error: error.message } : { ok: true }
  } catch (err) {
    results.supabase = { ok: false, error: String(err) }
  }

  // Stripe probe
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    await stripe.balance.retrieve()
    results.stripe = { ok: true }
  } catch (err) {
    results.stripe = { ok: false, error: String(err) }
  }

  // Resend probe
  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    const { error } = await resend.domains.list()
    results.resend = error ? { ok: false, error: error.message } : { ok: true }
  } catch (err) {
    results.resend = { ok: false, error: String(err) }
  }

  const allOk = Object.values(results).every((r) => r.ok)

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', services: results },
    { status: allOk ? 200 : 503 }
  )
}
