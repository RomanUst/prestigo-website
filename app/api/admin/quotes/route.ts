import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody } from '@/lib/request-guards'
import { NO_STORE, forbidden, readCappedJson, unauthorized } from '@/lib/quotes/admin-http'
import { quoteCreateSchema } from '@/lib/quotes/schemas'
import { createQuoteDraft, listQuotes } from '@/lib/quotes/store'

// The operator's quote list and quote creation (Phase 92, plan 92-08; QUOTE-01, QUOTE-06; D-09).
//
//   GET  ?page&limit&status&search   quotes newest first with their EFFECTIVE status (expired derived, cancelled shown)
//   POST { client, lead_channel, currency }   a new draft: Q- reference, unfrozen version 1, language from the client's
//                                             latest booking with that email, else en
//
// Guard order (project API patterns): enforceMaxBody -> admin session (401 / 403) -> JSON (400, 413) -> strict schema
// (400) -> engine. Logs carry ids and codes only.

const MAX_BODY_BYTES = 20_000
const DEFAULT_LIMIT = 25

function intParam(value: string | null, fallback: number): number {
  return value !== null && /^\d{1,6}$/.test(value) ? Number(value) : fallback
}

export async function GET(request: Request) {
  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const url = new URL(request.url)
  const page = Math.max(1, intParam(url.searchParams.get('page'), 1))
  const limit = Math.min(100, Math.max(1, intParam(url.searchParams.get('limit'), DEFAULT_LIMIT)))
  const status = url.searchParams.get('status')
  // Bounded to 100 characters; the store escapes the wildcards and never builds an or() string from it (T-92-27).
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100)

  try {
    const result = await listQuotes({ page, limit, status: status || null, search: search || null })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch {
    console.error('[admin/quotes] list failed')
    return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500, headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, MAX_BODY_BYTES)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return unauthorized()
  if (error === '403') return forbidden()
  if (!user) return unauthorized()

  const body = await readCappedJson(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response
  const parsed = quoteCreateSchema.safeParse(body.json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const { id } = await createQuoteDraft(parsed.data, { type: 'admin', id: user.id })
    return NextResponse.json({ id }, { status: 201, headers: NO_STORE })
  } catch {
    console.error('[admin/quotes] create failed', { adminId: user.id })
    return NextResponse.json({ error: 'Failed to create quote' }, { status: 500, headers: NO_STORE })
  }
}
