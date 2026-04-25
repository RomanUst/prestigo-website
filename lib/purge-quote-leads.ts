import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * purgeQuoteLeads — delete quote_leads rows older than 30 days.
 *
 * Called daily from /api/cron/reminder-24h to enforce the CZ GDPR
 * transactional retention ceiling (LEAD-04). Vercel Hobby caps cron
 * jobs at 2; piggy-backing on the existing reminder cron avoids the
 * cap.
 *
 * Logging is non-PII (count + cutoff only — never row contents).
 */
export async function purgeQuoteLeads(
  supabase: SupabaseClient
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await supabase
    .from('quote_leads')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) {
    console.error('[purge-quote-leads]', error.message)
    throw error
  }

  const deleted = count ?? 0
  console.log(`[purge-quote-leads] deleted ${deleted} rows older than ${cutoff}`)
  return { deleted }
}
