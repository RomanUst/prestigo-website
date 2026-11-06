import { BUSINESS_TEL_URL } from '@/lib/contact-channels'

// D-09 / D-11: one neutral view for EVERY ended reason (unknown token, malformed token, cancelled,
// no_show, reassigned, declined, driverless, orphaned booking). There is no prop and no branch, so
// the markup is byte-identical for all of them and a link cannot be used to enumerate bookings.
export default function InvalidTripLinkView(_props: { cancelledReference?: string } = {}) {
  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <div
        style={{
          boxSizing: 'border-box',
          width: '100%',
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
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
          }}
        >
          If you think this is a mistake, call the office.
        </p>
        <a
          href={BUSINESS_TEL_URL}
          data-driver-focus=""
          style={{
            minHeight: 48,
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 16px',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 500,
            color: 'var(--admin-accent-text)',
          }}
        >
          Call the office
        </a>
      </div>
    </main>
  )
}
