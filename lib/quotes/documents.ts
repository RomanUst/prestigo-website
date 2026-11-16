// The stored PDF of a quote version (Phase 92, plan 92-20; QUOTE-07; D-14; T-92-65, T-92-66).
//
// getOrRenderQuotePdf(versionId) returns the PDF of a FROZEN version: the stored bytes when quote_documents already
// holds them, otherwise the document is rendered once (renderQuoteDocumentHtml -> renderQuotePdf), stored with its
// sha256 and byte size, read back and returned. A version never gets a second, different PDF:
//   - the insert is "on conflict do nothing" (a concurrent caller that stored first wins; the loser returns the bytes
//     that were stored, never its own render);
//   - every stored row is checked against its sha256 and byte size before it is returned; a row that does not match
//     is treated as missing (removed, rendered again) and nothing is returned until a correct row is stored.
// So the attached file, the download (92-27) and what the client accepted are the same document.
//
// Never throws: null means "no PDF" (an unfrozen or unknown version, no engine on this host, a render failure, a
// database error), and the caller falls back to the download sentence of the email. The log carries the version id and
// a short code only. quote_documents is deny-all for anon and authenticated (091); only the service client reads it.
//
// Server only. The service client is created inside each call.

import { createHash } from 'node:crypto'
import { normalizeSiteLocale } from '@/i18n/locales'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { renderQuoteDocumentHtml } from '@/lib/quotes/document'
import { renderQuotePdf } from '@/lib/quotes/pdf'
import type { QuoteLineRow, QuoteRow, QuoteStopRow, QuoteVersionRow } from '@/lib/quotes/types'

type Supabase = ReturnType<typeof createSupabaseServiceClient>
type Row = Record<string, unknown>

/** A failure with a short code; the code is all that is logged. */
class DocumentError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

const HEX_RE = /^[0-9a-f]*$/i

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** bytea goes in as the Postgres hex form '\x…'. */
function toBytea(bytes: Buffer): string {
  return `\\x${bytes.toString('hex')}`
}

/** supabase-js returns bytea as the hex string '\x…'. Anything else is unreadable (null). */
function fromBytea(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !value.startsWith('\\x')) return null
  const hex = value.slice(2)
  if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) return null
  return Buffer.from(hex, 'hex')
}

/** The bytes of a stored row, or null when the row does not match its own sha256 and byte size. */
function verifiedBytes(row: Row): Buffer | null {
  const bytes = fromBytea(row.pdf)
  if (!bytes || bytes.length === 0) return null
  if (Number(row.byte_size) !== bytes.length) return null
  if (typeof row.sha256 !== 'string' || row.sha256 !== sha256Hex(bytes)) return null
  return bytes
}

async function readStored(supabase: Supabase, versionId: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from('quote_documents')
    .select('version_id, locale, pdf, sha256, byte_size')
    .eq('version_id', versionId)
    .maybeSingle()
  if (error) throw new DocumentError(`read_document:${error.code ?? 'unknown'}`)
  return data ? (data as Row) : null
}

/** The frozen version with its quote, lines and stops; null when the version is unknown or not frozen. */
async function readFrozenVersion(
  supabase: Supabase,
  versionId: string,
): Promise<{ quote: QuoteRow; version: QuoteVersionRow; lines: Array<QuoteLineRow & { stops: QuoteStopRow[] }> } | null> {
  const v = await supabase.from('quote_versions').select('*').eq('id', versionId).maybeSingle()
  if (v.error) throw new DocumentError(`read_version:${v.error.code ?? 'unknown'}`)
  const version = v.data as QuoteVersionRow | null
  if (!version || !version.frozen_at) return null

  const q = await supabase.from('quotes').select('*').eq('id', version.quote_id).maybeSingle()
  if (q.error) throw new DocumentError(`read_quote:${q.error.code ?? 'unknown'}`)
  const quote = q.data as QuoteRow | null
  if (!quote) return null

  const l = await supabase.from('quote_version_lines').select('*').eq('version_id', versionId).order('position', { ascending: true })
  if (l.error) throw new DocumentError(`read_lines:${l.error.code ?? 'unknown'}`)
  const lineRows = (l.data ?? []) as QuoteLineRow[]
  if (lineRows.length === 0) return null

  const s = await supabase
    .from('quote_version_line_stops')
    .select('*')
    .in('line_id', lineRows.map((line) => line.id))
    .order('position', { ascending: true })
  if (s.error) throw new DocumentError(`read_stops:${s.error.code ?? 'unknown'}`)
  const stops = (s.data ?? []) as QuoteStopRow[]

  return {
    quote,
    version,
    lines: lineRows.map((line) => ({ ...line, stops: stops.filter((stop) => stop.line_id === line.id) })),
  }
}

/** Removes one stored row that failed its integrity check (only that exact row: same version, same sha256). */
async function dropCorrupt(supabase: Supabase, versionId: string, row: Row): Promise<void> {
  const del = supabase.from('quote_documents').delete().eq('version_id', versionId)
  const { error } = typeof row.sha256 === 'string' ? await del.eq('sha256', row.sha256) : await del
  if (error) throw new DocumentError(`drop_corrupt:${error.code ?? 'unknown'}`)
}

async function getOrRender(versionId: string): Promise<Buffer | null> {
  const supabase = createSupabaseServiceClient()

  const existing = await readStored(supabase, versionId)
  if (existing) {
    const bytes = verifiedBytes(existing)
    if (bytes) return bytes
    console.error('[quotes/documents] stored pdf failed its check', { versionId, code: 'sha256_mismatch' })
    await dropCorrupt(supabase, versionId, existing)
  }

  const source = await readFrozenVersion(supabase, versionId)
  if (!source) return null

  const html = await renderQuoteDocumentHtml(source)
  const pdf = await renderQuotePdf(html)
  if (!pdf || pdf.length === 0) return null

  // Insert on conflict do nothing: a concurrent caller may have stored its render first; its row is the PDF.
  const { error } = await supabase.from('quote_documents').insert({
    version_id: versionId,
    locale: normalizeSiteLocale(source.version.locale),
    pdf: toBytea(pdf),
    sha256: sha256Hex(pdf),
    byte_size: pdf.length,
  })
  if (error && error.code !== '23505') throw new DocumentError(`insert_document:${error.code ?? 'unknown'}`)

  // Return what is stored, never the local render: every caller hands out the same bytes.
  const stored = await readStored(supabase, versionId)
  const bytes = stored ? verifiedBytes(stored) : null
  if (!bytes) throw new DocumentError('stored_unverified')
  return bytes
}

/**
 * The PDF of a frozen quote version, rendered and stored on first use. Null (never a throw) when the version is not
 * frozen or unknown, the host cannot render, or the database fails; a short code is logged with the version id.
 */
export async function getOrRenderQuotePdf(versionId: string): Promise<Buffer | null> {
  try {
    return await getOrRender(versionId)
  } catch (error) {
    const code = error instanceof DocumentError ? error.code : 'render_document_failed'
    console.error('[quotes/documents] no pdf', { versionId, code })
    return null
  }
}
