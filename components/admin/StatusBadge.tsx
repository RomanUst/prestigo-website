'use client'

export type StatusBadgeVariant =
  | 'active' | 'inactive' | 'pending' | 'quote' | 'confirmed' | 'completed' | 'cancelled'
  | 'assigned' | 'en_route' | 'on_location' | 'unpaid' | 'arrived' | 'on_board' | 'no_show'

type Variant = StatusBadgeVariant

interface StatusBadgeProps {
  variant: StatusBadgeVariant
  label: string
}

type StatusFamily = 'ok' | 'danger' | 'warn' | 'amber' | 'info' | 'teal' | 'violet'

// D-17: every variant resolves to a status family; the family's fg/bg/border
// tokens are declared per theme in admin-theme.css. Variants that share a
// family stay distinguishable by their text label.
export const STATUS_FAMILY: Record<Variant, StatusFamily> = {
  active: 'ok',
  completed: 'ok',
  inactive: 'danger',
  cancelled: 'danger',
  no_show: 'danger',
  pending: 'warn',
  unpaid: 'warn',
  on_location: 'amber',
  arrived: 'amber',
  quote: 'info',
  confirmed: 'info',
  assigned: 'teal',
  on_board: 'teal',
  en_route: 'violet',
}

// Visual shell shared by StatusBadge and PaymentStateBadge (Phase 88-07). The neutral family
// has fg/bg/border tokens in both themes (admin-theme.css) but no booking-status variant uses it.
export type BadgeFamily = StatusFamily | 'neutral'

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return <BadgeShell family={STATUS_FAMILY[variant]} label={label} />
}

export function BadgeShell({ family, label }: { family: BadgeFamily; label: string }) {
  const fg = `var(--status-${family}-fg)`
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '4px 8px', backgroundColor: `var(--status-${family}-bg)`, color: fg,
      border: `1px solid var(--status-${family}-border)`, borderRadius: 'var(--admin-radius-sm)',
      fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-label)',
      fontWeight: 'var(--admin-fw-strong)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      whiteSpace: 'nowrap', maxWidth: '100%',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: fg, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}</span>
    </span>
  )
}
