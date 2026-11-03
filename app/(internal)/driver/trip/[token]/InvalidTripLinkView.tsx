// D-09 / D-11: one neutral view for EVERY ended reason (unknown token, malformed token, cancelled,
// no_show, reassigned, declined, driverless, orphaned booking). No branch distinguishes the reason,
// so a link cannot be used to enumerate bookings. Plan 87-10 Task 2 adds the office phone link.
export default function InvalidTripLinkView() {
  return (
    <main
      style={{
        boxSizing: 'border-box',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 480,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--admin-radius-lg)',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <div className="admin-wordmark" style={{ marginBottom: 24 }}>
          PRESTIGO
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
          }}
        >
          This trip link is no longer active.
        </p>
      </div>
    </main>
  )
}
