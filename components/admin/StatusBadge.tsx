'use client'

interface StatusBadgeProps {
  variant: 'active' | 'inactive' | 'pending' | 'quote' | 'confirmed' | 'completed' | 'cancelled'
  label: string
}

const variantStyles: Record<StatusBadgeProps['variant'], { bg: string; color: string; border: string }> = {
  active:   { bg: '#1a3a2a', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' },
  inactive: { bg: '#2a1a1a', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
  pending:  { bg: '#3a2a1a', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)' },
  quote:    { bg: '#1a2a3a', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' },
  confirmed: { bg: '#1a2f3a', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' },
  completed: { bg: '#1a3a2a', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' },
  cancelled: { bg: '#2a1a1a', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' },
}

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  const s = variantStyles[variant]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '4px 8px', backgroundColor: s.bg, color: s.color,
      border: s.border, borderRadius: '2px',
      fontFamily: 'var(--font-montserrat)', fontSize: '11px',
      textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: s.color }} />
      {label}
    </span>
  )
}
