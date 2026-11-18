'use client'

import { BadgeShell, type BadgeFamily } from '@/components/admin/StatusBadge'

// Phase 92-14 (QUOTE-06 / SC1): the effective state of a quote as a label + status family. Family tokens exist in both
// themes in admin-theme.css; no colour is defined here, and every state carries its own text label, so colour is never
// the only signal. Eight states, eight different families.
//
// "expired" is derived by the server from the operator's expiry date; "voided" is a quote the operator cancelled before it
// was paid; "cancelled" is a paid quote that was cancelled afterwards (refund flow).

export type QuoteBadgeStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'paid' | 'expired' | 'voided' | 'cancelled'

export const QUOTE_STATUS_BADGE: Record<QuoteBadgeStatus, { label: string; family: BadgeFamily }> = {
  draft: { label: 'Draft', family: 'neutral' },
  sent: { label: 'Sent', family: 'info' },
  viewed: { label: 'Viewed', family: 'violet' },
  accepted: { label: 'Accepted', family: 'teal' },
  paid: { label: 'Paid', family: 'ok' },
  expired: { label: 'Expired', family: 'warn' },
  voided: { label: 'Voided', family: 'danger' },
  cancelled: { label: 'Cancelled', family: 'amber' },
}

export function QuoteStatusBadge({ status }: { status: QuoteBadgeStatus }) {
  const known = Object.prototype.hasOwnProperty.call(QUOTE_STATUS_BADGE, status) ? QUOTE_STATUS_BADGE[status] : null
  // Defensive fallback: an unknown state shows its raw value in the neutral family, never throws.
  return <BadgeShell family={known?.family ?? 'neutral'} label={known?.label ?? String(status)} />
}
