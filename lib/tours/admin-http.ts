// Phase 93 (plan 93-07): the HTTP side of the admin tour API, shared by the routes. The admin guard itself
// (getAdminUser) stays in each route so the guard order is visible where it runs.

import { NextResponse } from 'next/server'
import { locales, type AppLocale } from '@/i18n/locales'
import { TourAdminError } from '@/lib/tours/admin-store'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAppLocale(value: string): value is AppLocale {
  return (locales as readonly string[]).includes(value)
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })

export function invalidPayload(details?: unknown) {
  const body = details === undefined ? { error: 'Invalid payload' } : { error: 'Invalid payload', details }
  return NextResponse.json(body, { status: 400, headers: NO_STORE })
}

/** Maps a store failure to a fixed response; a database message never reaches the client. */
export function tourErrorResponse(e: unknown, scope: string): NextResponse {
  if (e instanceof TourAdminError) {
    switch (e.code) {
      case 'NOT_FOUND':
        return notFound()
      case 'SLUG_TAKEN':
        return NextResponse.json({ error: 'Slug already exists', code: 'SLUG_TAKEN' }, { status: 409, headers: NO_STORE })
      case 'SLUG_LOCKED':
        return NextResponse.json(
          { error: 'The slug cannot change after the first publication', code: 'SLUG_LOCKED' },
          { status: 409, headers: NO_STORE },
        )
      case 'ZH_INCOMPLETE':
        return NextResponse.json(
          { error: 'Simplified Chinese content is not complete yet', code: 'ZH_INCOMPLETE' },
          { status: 409, headers: NO_STORE },
        )
      case 'INVALID_WINDOW':
        return NextResponse.json(
          { error: 'Latest start must be after the earliest start', code: 'INVALID_WINDOW' },
          { status: 422, headers: NO_STORE },
        )
      case 'INVALID_ORDER':
        return invalidPayload()
      default:
        break
    }
  }
  console.error(`[admin/${scope}] failed`)
  return NextResponse.json({ error: 'Request failed' }, { status: 500, headers: NO_STORE })
}
