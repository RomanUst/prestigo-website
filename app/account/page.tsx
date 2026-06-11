import { createClient } from '@/lib/supabase/server'
import { customerSignOut } from '@/app/login/actions'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
          padding: '48px 24px',
        }}
        className="md:px-12"
      >
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

        <p
          style={{
            fontSize: '14px',
            fontWeight: 300,
            color: 'var(--warmgrey)',
            letterSpacing: '0.03em',
            lineHeight: 1.75,
          }}
        >
          {user ? 'You are signed in.' : 'Loading...'}
        </p>

        <form
          action={customerSignOut}
          style={{ marginTop: '32px' }}
        >
          <button
            type="submit"
            className="btn-ghost"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
