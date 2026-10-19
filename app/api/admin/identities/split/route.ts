import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminUser } from '@/lib/supabase/server'
import { enforceMaxBody, NO_LINE_BREAKS } from '@/lib/request-guards'
import { publishOutboxDispatch } from '@/lib/outbox'
import { splitIdentity } from '@/lib/identity-admin-store'

// D-06: split a phone-based merge. One transaction in Supabase (identity_split, migration 073) plus
// QStash publishes of the returned sync keys; EspoCRM and Chatwoot follow through the outbox
// handlers (a Chatwoot split cannot move past conversations, RESEARCH Pitfall 12). No CRM or
// Chatwoot import (VPS isolation guard). Guard order: body size -> session (401/403) -> JSON (400)
// -> shape (400) -> semantics (422). Logs carry the error code only, never an address.

// trim -> lower-case -> format checks, so a copy-pasted address with stray spaces is accepted.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
  .regex(NO_LINE_BREAKS, 'Invalid format')
const splitSchema = z.object({ email: emailField }).strict()

export async function POST(request: Request) {
  const tooBig = enforceMaxBody(request, 4_000)
  if (tooBig) return tooBig

  const { user, error } = await getAdminUser()
  if (error === '401') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (error === '403') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = splitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  let result
  try {
    result = await splitIdentity(parsed.data.email, user!.id)
  } catch {
    console.error('[admin/identities.POST] code=db_error')
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (result.outcome !== 'split') {
    return NextResponse.json({ error: result.outcome }, { status: 422 })
  }

  // The rows are already pending; if a publish fails the daily sweep still re-arms them.
  let published = 0
  for (const key of result.keys) {
    const ok = await publishOutboxDispatch(key, { dedupSuffix: 'p' }).catch(() => false)
    if (ok) published += 1
  }

  return NextResponse.json({
    ok: true,
    oldIdentityId: result.oldIdentityId,
    newIdentityId: result.newIdentityId,
    published,
  })
}
