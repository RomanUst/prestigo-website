// Shared, client-safe contract for the admin statistics tabs (phase 85).
// Imports only zod: the client tabs import this module, so it must never pull
// in a Supabase module or a node built-in.
import { z } from 'zod'

// ── Period (D-13) ─────────────────────────────────────────────────────────

export const ALL_TIME_FROM = '2000-01-01'
export const MAX_PERIOD_TO = '2099-12-31'

export type Period = { from: string; to: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 is not). */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const dateString = z.string().refine(isRealDate, 'Invalid date')

export const periodSchema = z
  .object({ from: dateString, to: dateString })
  .refine(p => p.from <= p.to, 'from must not be after to')
  .refine(p => p.from >= ALL_TIME_FROM, 'from is before 2000-01-01')
  .refine(p => p.to <= MAX_PERIOD_TO, 'to is after 2099-12-31')

export function parsePeriod(
  params: URLSearchParams,
): { ok: true; period: Period } | { ok: false } {
  const parsed = periodSchema.safeParse({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  })
  if (!parsed.success) return { ok: false }
  return { ok: true, period: { from: parsed.data.from, to: parsed.data.to } }
}

export function periodQuery(p: Period): string {
  return `from=${p.from}&to=${p.to}`
}

// ── Response schemas (jsonb contracts of the stats_* RPCs) ────────────────

const int = z.number().int()
const ymd = z.string().regex(DATE_RE)

export const b2bStatsSchema = z.object({
  from: ymd,
  to: ymd,
  accounts_total: int,
  b2b_bookings: int,
  b2b_revenue_eur: int,
  all_bookings: int,
  all_revenue_eur: int,
  accounts: z.array(
    z.object({
      user_id: z.string().uuid(),
      company_name: z.string().nullable(),
      full_name: z.string().nullable(),
      email: z.string().nullable(),
      bookings: int,
      revenue_eur: int,
      avg_eur: int,
      last_trip: ymd,
      without_amount: int,
    }),
  ),
})

export type B2BStats = z.infer<typeof b2bStatsSchema>
