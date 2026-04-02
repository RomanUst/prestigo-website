'use client'

interface KPICardProps {
  label: string
  value: string
  subLabel?: string
}

export function KPICard({ label, value, subLabel }: KPICardProps) {
  return (
    <div style={{
      background: 'var(--anthracite-mid)',
      border: '1px solid var(--anthracite-light)',
      borderRadius: '4px',
      padding: '24px',
      minWidth: '200px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      transition: 'border-color 300ms ease',
      cursor: 'default',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--copper)' }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--anthracite-light)' }}
    >
      <span style={{
        fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 400,
        textTransform: 'uppercase', letterSpacing: '0.4em', color: 'var(--copper)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-cormorant)', fontSize: '32px', fontWeight: 300,
        color: 'var(--offwhite)', lineHeight: 1,
      }}>
        {value}
      </span>
      {subLabel && (
        <span style={{
          fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 400,
          color: 'var(--warmgrey)',
        }}>
          {subLabel}
        </span>
      )}
    </div>
  )
}
