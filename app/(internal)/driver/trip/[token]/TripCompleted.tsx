import { CircleCheck } from 'lucide-react'

export interface TripCompletedProps {
  variant: 'in-session' | 'reopened'
  summary?: { bookingReference: string; pickupDate: string; completedAt: string }
}

// D-17: shown for a completed trip. The re-opened variant (server-rendered) carries no trip data at
// all. Plan 87-10 Task 2 adds the in-session summary card and the office phone link.
export default function TripCompleted(_props: TripCompletedProps) {
  return (
    <main
      style={{
        boxSizing: 'border-box',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '48px 24px',
        textAlign: 'center',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'var(--status-ok-bg)',
          color: 'var(--status-ok-fg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircleCheck size={48} aria-hidden="true" />
      </div>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--admin-font-heading)',
          fontSize: 'var(--driver-fs-display)',
          fontWeight: 500,
          lineHeight: 1.1,
        }}
      >
        Trip completed
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 'var(--driver-fs-body)',
          fontWeight: 400,
          lineHeight: 1.5,
          color: 'var(--admin-text-muted)',
        }}
      >
        Thank you. This trip is closed.
      </p>
    </main>
  )
}
