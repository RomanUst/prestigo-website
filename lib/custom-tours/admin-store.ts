// The operator's read path for custom-tour requests (Phase 93, plan 93-31; TRIP-07; D-18, D-19).
//
// A request is an `inquiries` row of kind 'custom_tour' (migration 093). Its status is derived, never stored: 'quoted'
// when a LIVE quote (any status but 'voided', migration 094) has source_inquiry_id = the inquiry id, else 'open'. A
// voided quote is terminal and no longer counts, so the request can be quoted again. Server only: the inquiries and quotes tables are
// deny-all, so every read goes through the service client, created inside each function and never at module load.
//
// The payload is visitor-supplied JSON: every field is narrowed here, nothing is trusted to have the right type.
// Errors and logs carry database error codes only, never a name, an email or a request text.

import { createSupabaseServiceClient } from '@/lib/supabase'

type Row = Record<string, unknown>

export type CustomTourRequestStatus = 'open' | 'quoted'
export type CustomTourStatusFilter = 'all' | CustomTourRequestStatus

export interface CustomTourQuoteLink {
  id: string
  reference: string
}

export interface CustomTourRequestListItem {
  id: string
  receivedAt: string
  name: string
  email: string
  whereFirstLine: string
  date: string | null
  people: number | null
  locale: string
  status: CustomTourRequestStatus
  quote: CustomTourQuoteLink | null
}

export interface CustomTourRequestDetail {
  id: string
  receivedAt: string
  name: string
  email: string
  phone: string | null
  where: string
  date: string | null
  people: number | null
  wishes: string | null
  tourSlug: string | null
  locale: string
  status: CustomTourRequestStatus
  quote: CustomTourQuoteLink | null
}

export const CUSTOM_TOUR_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const WHERE_FIRST_LINE_MAX = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A Postgres timestamptz as PostgREST prints it, e.g. 2026-11-23T10:15:00.123456+00:00. */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/

const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const textOrNull = (v: unknown): string | null => {
  const t = text(v).trim()
  return t === '' ? null : t
}
const payloadOf = (row: Row): Row => (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Row) : {})

function peopleOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

function firstLine(value: string): string {
  const line = value.split(/\r\n|\r|\n/).find((l) => l.trim() !== '') ?? ''
  return line.trim().slice(0, WHERE_FIRST_LINE_MAX)
}

/** The language of a request: a locale string the form stored, else en (the form validates it; a stored value is not trusted). */
const localeOf = (payload: Row): string => {
  const l = text(payload.locale)
  return /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(l) ? l : 'en'
}

// == cursor ========================================================================================================
// Keyset pagination on (created_at desc, id desc). The cursor is opaque to the client: base64url of "<created_at>|<id>".
// Both parts are validated against strict patterns before they reach a filter string.

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) return null
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const sep = decoded.indexOf('|')
  if (sep < 0) return null
  const createdAt = decoded.slice(0, sep)
  const id = decoded.slice(sep + 1)
  return TIMESTAMP_RE.test(createdAt) && UUID_RE.test(id) ? { createdAt, id } : null
}

// == quote link ====================================================================================================

/** The live (not voided) quote that answers one request, if any. */
async function linkedQuote(inquiryId: string): Promise<CustomTourQuoteLink | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from('quotes')
    .select('id, reference')
    .eq('source_inquiry_id', inquiryId)
    .neq('status', 'voided')
    .limit(1)
  if (error) {
    console.error('[custom-tours/admin-store] quote link failed', { code: error.code ?? null })
    throw new Error('custom tour quote link failed')
  }
  const row = ((data ?? []) as Row[])[0]
  return row ? { id: String(row.id), reference: String(row.reference) } : null
}

// == list ==========================================================================================================

/**
 * custom_tour inquiries newest first (created_at, then id), `limit` per page (default 50), with a keyset cursor.
 * `status` 'open' / 'quoted' filters on the derived status. The filter, the join with the live quote and the keyset
 * all run in the database (migration 094, list_custom_tour_requests), so nothing here grows with the number of quotes.
 * A cursor that does not decode is an error the route maps to 400.
 */
export async function listCustomTourRequests(params: {
  status?: CustomTourStatusFilter
  cursor?: string | null
  limit?: number
}): Promise<{ items: CustomTourRequestListItem[]; nextCursor: string | null }> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.limit ?? CUSTOM_TOUR_PAGE_SIZE) || CUSTOM_TOUR_PAGE_SIZE))
  const status: CustomTourStatusFilter = params.status ?? 'all'
  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  if (params.cursor && !cursor) throw new Error('invalid cursor')

  const { data, error } = await createSupabaseServiceClient().rpc('list_custom_tour_requests', {
    p_status: status,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit + 1,
  })
  if (error) {
    console.error('[custom-tours/admin-store] list failed', { code: error.code ?? null })
    throw new Error('custom tour list failed')
  }

  const rows = (Array.isArray(data) ? data : []) as Row[]
  const hasMore = rows.length > limit
  const pageRows = rows.slice(0, limit)

  const items = pageRows.map((row): CustomTourRequestListItem => {
    const payload = payloadOf(row)
    const quote = row.quote_id ? { id: String(row.quote_id), reference: String(row.quote_reference) } : null
    return {
      id: String(row.id),
      receivedAt: String(row.created_at),
      name: text(row.name),
      email: text(row.email),
      whereFirstLine: firstLine(text(payload.where)),
      date: textOrNull(payload.date),
      people: peopleOf(payload.people),
      locale: localeOf(payload),
      status: quote ? 'quoted' : 'open',
      quote,
    }
  })
  const last = pageRows[pageRows.length - 1]
  return { items, nextCursor: hasMore && last ? encodeCursor(String(last.created_at), String(last.id)) : null }
}

// == detail ========================================================================================================

/** One custom-tour request with its full text and the linked quote; null for an unknown id or an inquiry of another kind. */
export async function getCustomTourRequest(id: string): Promise<CustomTourRequestDetail | null> {
  if (!UUID_RE.test(id)) return null
  const { data, error } = await createSupabaseServiceClient()
    .from('inquiries')
    .select('id, name, email, phone, payload, created_at')
    .eq('id', id)
    .eq('kind', 'custom_tour')
    .maybeSingle()
  if (error) {
    console.error('[custom-tours/admin-store] read failed', { code: error.code ?? null })
    throw new Error('custom tour read failed')
  }
  if (!data) return null

  const row = data as Row
  const payload = payloadOf(row)
  const quote = await linkedQuote(id)
  return {
    id: String(row.id),
    receivedAt: String(row.created_at),
    name: text(row.name),
    email: text(row.email),
    phone: textOrNull(row.phone),
    where: text(payload.where),
    date: textOrNull(payload.date),
    people: peopleOf(payload.people),
    wishes: textOrNull(payload.wishes),
    tourSlug: textOrNull(payload.tourSlug),
    locale: localeOf(payload),
    status: quote ? 'quoted' : 'open',
    quote,
  }
}
