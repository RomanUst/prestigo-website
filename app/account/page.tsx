import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // user is guaranteed non-null — /account/* middleware gate redirects unauthenticated requests

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--anthracite)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '96px 24px 64px',
        }}
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
          My Account
        </h1>

        {/* Copper-line decoration */}
        <div className="copper-line" style={{ marginBottom: '24px' }} />

        {/* "Signed in as" sub-caption */}
        <p
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--warmgrey)',
            letterSpacing: '0.08em',
          }}
        >
          Signed in as {user?.email}
        </p>

        {/* Navigation cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">

          {/* Card 1 — My Trips */}
          <div
            style={{
              backgroundColor: 'var(--anthracite-mid)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              padding: '24px',
            }}
          >
            <span className="label">My Trips</span>

            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: '18px',
                fontWeight: 400,
                color: 'var(--offwhite)',
                letterSpacing: '0.08em',
                marginTop: '8px',
                marginBottom: '12px',
              }}
            >
              Your journey history
            </h2>

            <p className="body-text">
              View all bookings associated with your account.
            </p>

            <Link
              href="/account/trips"
              className="btn-ghost"
              style={{ display: 'inline-block', padding: '10px 24px', fontSize: '10px', marginTop: '20px' }}
            >
              View trips
            </Link>
          </div>

          {/* Card 2 — Profile */}
          <div
            style={{
              backgroundColor: 'var(--anthracite-mid)',
              border: '1px solid var(--anthracite-light)',
              borderRadius: '4px',
              padding: '24px',
            }}
          >
            <span className="label">Profile</span>

            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: '18px',
                fontWeight: 400,
                color: 'var(--offwhite)',
                letterSpacing: '0.08em',
                marginTop: '8px',
                marginBottom: '12px',
              }}
            >
              Account details
            </h2>

            <p className="body-text">
              Update your contact information and manage saved passengers.
            </p>

            <Link
              href="/account/profile"
              className="btn-ghost"
              style={{ display: 'inline-block', padding: '10px 24px', fontSize: '10px', marginTop: '20px' }}
            >
              Edit profile
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
