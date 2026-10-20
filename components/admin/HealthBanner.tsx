'use client'

interface HealthBannerProps {
  failed: number
  stuck: number
}

// Colours of the StatusBadge `completed` and `cancelled` variants (UI-SPEC: banner reuses them).
const HEALTHY = { bg: '#1a3a2a', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
const PROBLEM = { bg: '#2a1a1a', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }

/** Copy for the problem banner; a clause whose count is 0 is omitted. */
export function healthProblemText(failed: number, stuck: number): string {
  const tail = 'Check that the CRM server is reachable, then retry.'
  if (failed > 0 && stuck > 0) return `${failed} failed and ${stuck} stuck events. ${tail}`
  if (failed > 0) return `${failed} failed ${failed === 1 ? 'event' : 'events'}. ${tail}`
  return `${stuck} stuck ${stuck === 1 ? 'event' : 'events'}. ${tail}`
}

export function HealthBanner({ failed, stuck }: HealthBannerProps) {
  const healthy = failed === 0 && stuck === 0
  const s = healthy ? HEALTHY : PROBLEM
  return (
    <div
      role="status"
      style={{
        background: s.bg,
        color: s.color,
        border: s.border,
        borderRadius: '4px',
        padding: '16px 24px',
        margin: '0 0 24px',
        fontFamily: 'var(--font-montserrat)',
        fontSize: '13px',
        fontWeight: 400,
        lineHeight: 1.5,
      }}
    >
      {healthy ? 'All sync events are being delivered.' : healthProblemText(failed, stuck)}
    </div>
  )
}
