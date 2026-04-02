export default function AdminDashboardPage() {
  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}
      >
        Admin Dashboard
      </h1>
      <p style={{ color: 'var(--warmgrey)', fontSize: '14px' }}>
        Select a section from the sidebar.
      </p>
    </div>
  )
}
