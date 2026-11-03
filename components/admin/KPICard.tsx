'use client'

interface KPICardProps {
  label: string
  value: string
  subLabel?: string
}

export function KPICard({ label, value, subLabel }: KPICardProps) {
  return (
    <div style={{
      background: 'var(--admin-surface)',
      border: '1px solid var(--admin-border)',
      borderRadius: 'var(--admin-radius-md)',
      padding: '24px',
      minWidth: '200px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      transition: 'border-color 300ms ease',
      cursor: 'default',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--admin-card-hover-border)' }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--admin-border)' }}
    >
      <span style={{
        fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-label)', fontWeight: 'var(--admin-fw-strong)',
        textTransform: 'uppercase', letterSpacing: '0.4em', color: 'var(--admin-kpi-label)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--admin-font-heading)', fontSize: 'var(--admin-fs-display)', fontWeight: 'var(--admin-fw-heading)',
        color: 'var(--admin-text)', lineHeight: 1,
      }}>
        {value}
      </span>
      {subLabel && (
        <span style={{
          fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-label)', fontWeight: 400,
          color: 'var(--admin-text-muted)',
        }}>
          {subLabel}
        </span>
      )}
    </div>
  )
}
