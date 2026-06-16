import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Nav from '@/components/Nav'

export const dynamic = 'force-dynamic'

export default async function AccountTripsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // user is guaranteed non-null — /account/* middleware gate redirects unauthenticated requests
  // Phase 58 D-01: NO bookings query here; real trip history is Phase 60 scope
  void user

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <Nav />
      <div
        style={{ maxWidth: '1280px', margin: '0 auto', padding: '96px 24px 64px' }}
        className="md:px-12"
      >
        {/* Page heading */}
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.12em',
            lineHeight: 1.1,
            marginBottom: '8px',
          }}
        >
          My Trips
        </h1>

        {/* Copper-line decoration */}
        <div className="copper-line" style={{ marginBottom: '24px' }} />

        {/* Empty state panel */}
        <div className="max-w-md mx-auto mt-16 text-center">
          <div
            className="bg-anthracite-mid border border-anthracite-light rounded p-12"
          >
            {/* Muted icon — calendar / open road (color: var(--anthracite-light), NOT copper) */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              style={{ color: 'var(--anthracite-light)', margin: '0 auto 16px' }}
            >
              <rect
                x="6"
                y="10"
                width="36"
                height="30"
                rx="3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M6 18h36"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 6v8M32 6v8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M14 28h6M28 28h6M14 34h6M28 34h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            {/* Empty state heading */}
            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: '18px',
                fontWeight: 400,
                color: 'var(--offwhite)',
                letterSpacing: '0.08em',
                marginBottom: '12px',
              }}
            >
              No trips yet
            </h2>

            {/* Empty state body */}
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '14px',
                fontWeight: 300,
                color: 'var(--warmgrey)',
                lineHeight: 1.75,
                marginBottom: '32px',
              }}
            >
              Your booked transfers will appear here. Ready to travel?
            </p>

            {/* Primary CTA */}
            <Link
              href="/book"
              className="btn-primary"
              style={{ padding: '12px 32px' }}
            >
              Book a transfer
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
