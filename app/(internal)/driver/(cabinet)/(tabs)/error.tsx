'use client'

import { TriangleAlert } from 'lucide-react'

// Phase 94 plan 94-10 (UI-SPEC "Loading and error", T-94-48): a failed tab load shows fixed copy and a retry. The thrown
// error is deliberately not read or rendered: no internals reach the driver's screen.
export default function DriverTabsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <span
        style={{
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--status-danger-bg)',
          color: 'var(--status-danger-fg)',
          marginBottom: '16px',
        }}
      >
        <TriangleAlert size={48} aria-hidden="true" />
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-heading)',
          fontWeight: 500,
        }}
      >
        Could not load this page
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 'var(--driver-fs-body)', fontWeight: 400, color: 'var(--admin-text-muted)' }}>
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        data-driver-focus
        style={{
          boxSizing: 'border-box',
          marginTop: '24px',
          minHeight: '48px',
          padding: '0 24px',
          background: 'var(--admin-accent)',
          color: 'var(--admin-on-accent)',
          border: 'none',
          borderRadius: 'var(--admin-radius-md)',
          fontFamily: 'var(--font-montserrat)',
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </main>
  )
}
