import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getDriverSession } from '@/lib/driver-cabinet/auth'
import { safeDriverNext } from '@/lib/driver-cabinet/safe-next'
import LoginForm from './LoginForm'

// Phase 94 plan 94-02 (D-05, DCAB-01): the public sign-in page of the driver cabinet. Per request (it reads the
// session cookie), never indexed. A valid session skips the form.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in | Prestigo Driver',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ next?: string | string[]; ended?: string | string[] }>
}

export default async function DriverLoginPage({ searchParams }: PageProps) {
  const { next, ended } = await searchParams
  const target = safeDriverNext(Array.isArray(next) ? next[0] : next) ?? '/driver/rides'

  const session = await getDriverSession()
  if (session) redirect(target)

  return (
    <main style={{ display: 'flex', flexDirection: 'column', flex: 1, fontFamily: 'var(--font-montserrat)', color: 'var(--admin-text)' }}>
      <header className="driver-cabinet-header" style={{ background: 'var(--admin-bg)', justifyContent: 'center' }}>
        <span className="admin-wordmark">PRESTIGO</span>
      </header>
      <LoginForm
        next={target}
        offersContext={target.startsWith('/driver/offers')}
        ended={(Array.isArray(ended) ? ended[0] : ended) === '1'}
      />
    </main>
  )
}
