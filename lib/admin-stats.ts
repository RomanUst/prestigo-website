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

// ── Presets (D-13), resolved against the Europe/Prague calendar day ───────

export const PERIOD_PRESETS = ['last_30', 'last_90', 'this_month', 'this_year', 'all_time'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  this_month: 'This month',
  this_year: 'This year',
  all_time: 'All time',
}

/** The Prague calendar day (YYYY-MM-DD) that `now` falls on. */
export function pragueToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Calendar arithmetic on a YYYY-MM-DD string; Date.UTC keeps DST out of it. */
function addDays(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function resolvePreset(preset: PeriodPreset, now: Date): Period {
  const today = pragueToday(now)
  switch (preset) {
    case 'last_30':
      return { from: addDays(today, -29), to: today }
    case 'last_90':
      return { from: addDays(today, -89), to: today }
    case 'this_month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'all_time':
      return { from: ALL_TIME_FROM, to: today }
  }
}

export function defaultPeriod(now: Date): Period {
  return resolvePreset('last_90', now)
}

export function matchPreset(p: Period, now: Date): PeriodPreset | null {
  for (const preset of PERIOD_PRESETS) {
    const r = resolvePreset(preset, now)
    if (r.from === p.from && r.to === p.to) return preset
  }
  return null
}

// ── Source labels (D-05 / D-06), in stats_conversion RPC order ────────────

export const FUNNEL_SOURCES = [
  'chat_web',
  'chat_whatsapp',
  'chat_email',
  'chat_telegram',
  'chat_other',
  'form_contact',
  'form_corporate',
  'form_multiday_quote',
  'abandoned',
] as const
export type FunnelSource = (typeof FUNNEL_SOURCES)[number]

export const FUNNEL_SOURCE_LABELS: Record<FunnelSource, string> = {
  chat_web: 'Chat · Web widget',
  chat_whatsapp: 'Chat · WhatsApp',
  chat_email: 'Chat · Email',
  chat_telegram: 'Chat · Telegram',
  chat_other: 'Chat · Other',
  form_contact: 'Form · contact',
  form_corporate: 'Form · corporate',
  form_multiday_quote: 'Form · multiday quote',
  abandoned: 'Abandoned checkout',
}

export const DIRECT_SOURCES = [
  'manual_whatsapp',
  'manual_phone',
  'manual_email',
  'manual_partner',
  'manual_other',
  'manual_unknown',
  'gnet',
  'online',
] as const
export type DirectSource = (typeof DIRECT_SOURCES)[number]

export const DIRECT_SOURCE_LABELS: Record<DirectSource, string> = {
  manual_whatsapp: 'Manual · WhatsApp',
  manual_phone: 'Manual · phone',
  manual_email: 'Manual · email',
  manual_partner: 'Manual · partner',
  manual_other: 'Manual · other',
  manual_unknown: 'Manual · unknown',
  gnet: 'GNet',
  online: 'Online · direct',
}

// ── Response schemas (jsonb contracts of the stats_* RPCs) ────────────────

const int = z.number().int()
const ymd = z.string().regex(DATE_RE)

export const conversionStatsSchema = z.object({
  from: ymd,
  to: ymd,
  funnel: z.array(
    z.object({
      source: z.enum(FUNNEL_SOURCES),
      inquiries: int,
      converted: int,
      window_open: int,
      revenue_eur: int,
    }),
  ),
  funnel_total: z.object({
    inquiries: int,
    converted: int,
    window_open: int,
    converting_bookings: int,
    revenue_eur: int,
  }),
  direct: z.array(
    z.object({
      source: z.enum(DIRECT_SOURCES),
      bookings: int,
      revenue_eur: int,
    }),
  ),
  direct_total: z.object({ bookings: int, revenue_eur: int }),
  trips_in_period: int,
  attributed_bookings: int,
  // 083 (WR-01): bookings created in the period, split so attributed + direct = period.
  attributed_total: z.object({ bookings: int, revenue_eur: int }),
  period_total: z.object({ bookings: int, revenue_eur: int }),
})

export const customersStatsSchema = z.object({
  from: ymd,
  to: ymd,
  customers: int,
  repeat_customers: int,
  revenue_eur: int,
  repeat_revenue_eur: int,
  repeat_customers_all_time: int,
  top: z
    .array(
      z.object({
        name: z.string().nullable(),
        email: z.string().nullable(),
        trips: int,
        revenue_eur: int,
        first_trip: ymd,
        last_trip: ymd,
      }),
    )
    .max(10),
})

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

export type ConversionStats = z.infer<typeof conversionStatsSchema>
export type CustomersStats = z.infer<typeof customersStatsSchema>
export type B2BStats = z.infer<typeof b2bStatsSchema>

// ── Formatters (D-15: amounts are integer EUR from the RPC, never typed) ──

/** Percentage with one decimal, half-up; 'n/a' when there is nothing to divide by. */
export function formatPct(num: number, den: number): string {
  if (den === 0) return 'n/a'
  return `${(Math.round((num * 1000) / den) / 10).toFixed(1)}%`
}

/** Integer EUR amount, cs-CZ digit grouping, followed by the word EUR. */
export function formatEur(n: number): string {
  return `${new Intl.NumberFormat('cs-CZ').format(n)} EUR`
}
