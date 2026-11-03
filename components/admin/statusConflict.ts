import type { CSSProperties } from 'react'
import { BOOKING_STATUS_LABELS } from '@/lib/booking-status'

// Exact copy from 87-UI-SPEC "Conflict feedback" ({label} = the status the driver moved it to).
// Shared by the bookings table (generic status change) and the Confirm no-show modal, so both
// surfaces tell the operator the same thing when they lose the compare-and-set race.
export function statusConflictMessage(currentStatus: string | undefined): string {
  const labels: Record<string, string> = BOOKING_STATUS_LABELS
  const label = currentStatus ? (labels[currentStatus] ?? currentStatus) : 'another status'
  return `This booking was just changed to ${label} by the driver. Reload to see the latest state.`
}

// Danger text for the inline conflict message (Phase 86 token, no colour literal).
export const STATUS_CONFLICT_STYLE: CSSProperties = {
  marginTop: 8,
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--status-danger-fg)',
}
