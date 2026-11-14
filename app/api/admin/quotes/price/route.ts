import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { getPricingConfig, type PricingRates } from '@/lib/pricing-config'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { suggestLinePrice } from '@/lib/quotes/pricing'
import { quotePriceSchema } from '@/lib/quotes/schemas'

// The price suggestion of one quote line for the builder (Phase 92, plan 92-08; QUOTE-01; D-04).
//
//   POST { line (no amount_minor), currency } -> 200 { distanceKm, suggestedMinor, waitingUnavailable }
//        | 400 invalid | 413 | 503 { error: 'pricing_unavailable' } (the route or the tariffs could not be read)
//
// It writes nothing. The distance is the server's Google Routes distance through all stops (never a number from the
// browser, T-92-26), the airport flag comes from the coordinates, and the answer is one total per line that already
// includes the waiting. The operator's amount stays the authority; this is only what the live tariffs propose.
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> JSON (400, 413) -> strict schema
// (400) -> engine. Logs carry reasons only.

const MAX_BODY_BYTES = 4_000

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = quotePriceSchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE })
  }

  let rates: PricingRates
  try {
    rates = await getPricingConfig()
  } catch {
    console.error('[admin/quotes/price] pricing config unavailable')
    return NextResponse.json({ error: 'pricing_unavailable' }, { status: 503, headers: NO_STORE })
  }

  try {
    const suggestion = await suggestLinePrice(parsed.data.line, { rates, currency: parsed.data.currency })
    if (!suggestion.ok) {
      return NextResponse.json({ error: 'pricing_unavailable' }, { status: 503, headers: NO_STORE })
    }
    return NextResponse.json(
      {
        distanceKm: suggestion.distanceKm,
        suggestedMinor: suggestion.suggestedMinor,
        waitingUnavailable: suggestion.waitingUnavailable,
      },
      { headers: NO_STORE },
    )
  } catch {
    console.error('[admin/quotes/price] suggestion failed')
    return NextResponse.json({ error: 'Failed to price the line' }, { status: 500, headers: NO_STORE })
  }
}
