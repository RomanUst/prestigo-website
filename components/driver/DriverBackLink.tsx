import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Phase 94 plan 94-07 (D-01, UI-SPEC "Header with Back"): the cabinet Back control of the ride screens, styled as the
// Help button of the Phase 87 header (48px minimum height, 1px --admin-border-strong, transparent, --admin-text,
// Body 16/400, --admin-radius-md, padding 0 12px). Shared by the trip screen and the closed-ride view. The target is
// deterministic (the list or the ride's Past month), never history-dependent. Colours only through var(--admin-*).
export default function DriverBackLink({ href, label = 'Rides' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      data-driver-focus=""
      style={{
        boxSizing: 'border-box',
        minWidth: 48,
        minHeight: 48,
        padding: '0 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: '1px solid var(--admin-border-strong)',
        borderRadius: 'var(--admin-radius-md)',
        color: 'var(--admin-text)',
        fontFamily: 'inherit',
        fontSize: 'var(--driver-fs-body)',
        fontWeight: 400,
        lineHeight: 1.5,
        textDecoration: 'none',
      }}
    >
      <ChevronLeft size={20} aria-hidden="true" />
      {label}
    </Link>
  )
}
